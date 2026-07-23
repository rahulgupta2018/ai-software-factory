/**
 * Tier-1 — the Phase-3 substrate: redaction guard, decision log, memory store.
 *
 * These three libs are what the ops and self-improvement skills sit on: `/context-save|restore`
 * and `/learn` write memory notes, `/retro` and the Coach read the decision log, and every
 * external sink funnels through the redaction guard. A validator nobody watched fail is not a
 * validator, so every function here has a negative case: the block that should refuse, the search
 * that should exclude, the redaction that should expunge.
 */
import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  applyRedactions,
  containsHighSecret,
  highestTier,
  redactForSink,
  scan,
} from '../lib/redact.ts';
import {
  activeDecisions,
  compactDecisions,
  decisionsPath,
  logDecision,
  readDecisions,
  redactDecision,
  searchDecisions,
  supersedeDecision,
} from '../lib/decision.ts';
import { deleteNote, listNotes, readNote, slugKey, writeNote } from '../lib/memory.ts';

const GITHUB_TOKEN = `ghp_${'a'.repeat(36)}`;

describe('redaction guard', () => {
  test('flags a HIGH-tier credential and blocks the sink', () => {
    const verdict = redactForSink(`deploy key ${GITHUB_TOKEN} committed`);
    expect(verdict.tier).toBe('high');
    expect(verdict.blocked).toBe(true);
    expect(verdict.clean).not.toContain(GITHUB_TOKEN);
    expect(verdict.clean).toContain('[redacted:github-token]');
  });

  test('flags PII as MEDIUM and does not block', () => {
    const verdict = redactForSink('contact jane.doe@example.com for access');
    expect(verdict.tier).toBe('medium');
    expect(verdict.blocked).toBe(false);
    expect(verdict.findings.some((f) => f.name === 'email')).toBe(true);
  });

  test('flags a private IP as LOW', () => {
    const findings = scan('service is on 192.168.1.20 internally');
    expect(findings.some((f) => f.name === 'private-ip' && f.tier === 'low')).toBe(true);
  });

  test('highestTier ranks high above medium above nothing', () => {
    expect(highestTier(scan(`${GITHUB_TOKEN} and a@b.co`))).toBe('high');
    expect(highestTier(scan('a@b.co'))).toBe('medium');
    expect(highestTier(scan('nothing to see here'))).toBeNull();
  });

  test('applyRedactions removes every occurrence of a secret', () => {
    const clean = applyRedactions(`${GITHUB_TOKEN} ... ${GITHUB_TOKEN}`);
    expect(clean).not.toContain(GITHUB_TOKEN);
  });

  // Negative: benign prose must not trip the gate (a gate that cries wolf gets ignored).
  test('benign text produces no findings and is not blocked', () => {
    const verdict = redactForSink('The implementer routes each component to its craft skill.');
    expect(verdict.findings).toHaveLength(0);
    expect(verdict.tier).toBeNull();
    expect(verdict.blocked).toBe(false);
    expect(verdict.clean).toBe('The implementer routes each component to its craft skill.');
  });

  test('containsHighSecret is true for a secret and false for PII alone', () => {
    expect(containsHighSecret(GITHUB_TOKEN)).toBe(true);
    expect(containsHighSecret('a@b.co')).toBe(false);
  });
});

describe('decision log', () => {
  let repo: string;
  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'fac-decisions-'));
  });
  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  test('logs and reads back a decision', () => {
    const rec = logDecision(repo, {
      decision: 'Use Neo4j for the graph',
      rationale: 'Native vector index avoids a second store',
      scope: 'repo',
      source: 'user',
      confidence: 8,
    });
    expect(existsSync(decisionsPath(repo))).toBe(true);
    const all = readDecisions(repo);
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(rec.id);
    expect(all[0].decision).toBe('Use Neo4j for the graph');
  });

  test('rejects malformed input', () => {
    const base = { decision: 'x', rationale: 'y', scope: 'repo', source: 'user' } as const;
    expect(() => logDecision(repo, { ...base, decision: '', confidence: 5 })).toThrow(/decision is empty/);
    expect(() => logDecision(repo, { ...base, confidence: 0 })).toThrow(/1\.\.10/);
    expect(() => logDecision(repo, { ...base, confidence: 3.5 })).toThrow(/1\.\.10/);
    // @ts-expect-error — invalid scope is a runtime guard
    expect(() => logDecision(repo, { ...base, scope: 'galaxy', confidence: 5 })).toThrow(/invalid scope/);
  });

  test('refuses to persist a HIGH-tier secret', () => {
    expect(() =>
      logDecision(repo, {
        decision: `store token ${GITHUB_TOKEN}`,
        rationale: 'need it for CI',
        scope: 'repo',
        source: 'agent',
        confidence: 6,
      }),
    ).toThrow(/high-confidence secret/);
    expect(readDecisions(repo)).toHaveLength(0);
  });

  test('sanitises newlines so each record stays one JSONL line', () => {
    logDecision(repo, {
      decision: 'line one\nline two',
      rationale: 'because\nreasons',
      scope: 'branch',
      source: 'skill',
      confidence: 7,
    });
    const raw = readFileSync(decisionsPath(repo), 'utf-8').trimEnd();
    expect(raw.split('\n')).toHaveLength(1);
    expect(readDecisions(repo)[0].decision).toBe('line one line two');
  });

  test('supersede drops the prior decision from the active set', () => {
    const first = logDecision(repo, {
      decision: 'Deploy on Render',
      rationale: 'simplest',
      scope: 'repo',
      source: 'user',
      confidence: 6,
    });
    supersedeDecision(repo, first.id, {
      decision: 'Deploy on Fly.io',
      rationale: 'better regions',
      scope: 'repo',
      source: 'user',
      confidence: 8,
    });
    expect(readDecisions(repo)).toHaveLength(2);
    const active = activeDecisions(repo);
    expect(active).toHaveLength(1);
    expect(active[0].decision).toBe('Deploy on Fly.io');
  });

  test('supersede rejects an unknown prior id', () => {
    expect(() =>
      supersedeDecision(repo, 'nope', {
        decision: 'x',
        rationale: 'y',
        scope: 'repo',
        source: 'user',
        confidence: 5,
      }),
    ).toThrow(/unknown decision/);
  });

  test('search filters by scope, query, and recency', () => {
    logDecision(repo, { decision: 'graph db choice', rationale: 'neo4j', scope: 'repo', source: 'user', confidence: 8 });
    logDecision(repo, { decision: 'branch naming', rationale: 'kebab', scope: 'branch', source: 'skill', confidence: 5 });
    logDecision(repo, { decision: 'cache layer', rationale: 'redis', scope: 'repo', source: 'user', confidence: 7 });

    expect(searchDecisions(repo, { scope: 'repo' })).toHaveLength(2);
    expect(searchDecisions(repo, { query: 'redis' })).toHaveLength(1);
    expect(searchDecisions(repo, { recent: 1 })[0].decision).toBe('cache layer');
    // Negative: a query that matches nothing returns empty.
    expect(searchDecisions(repo, { query: 'kubernetes' })).toHaveLength(0);
  });

  test('redact expunges an entry but keeps the event history', () => {
    const rec = logDecision(repo, {
      decision: 'noted a value we should not have',
      rationale: 'oops',
      scope: 'repo',
      source: 'agent',
      confidence: 4,
    });
    expect(redactDecision(repo, rec.id)).toBe(true);
    const all = readDecisions(repo);
    expect(all).toHaveLength(1); // history preserved
    expect(all[0].decision).toBe('[redacted]');
    expect(activeDecisions(repo)).toHaveLength(0); // dropped from active
    // Negative: redacting an unknown id changes nothing.
    expect(redactDecision(repo, 'unknown')).toBe(false);
  });

  test('compact rewrites the log to just the active set', () => {
    const first = logDecision(repo, { decision: 'A', rationale: 'a', scope: 'repo', source: 'user', confidence: 5 });
    supersedeDecision(repo, first.id, { decision: 'B', rationale: 'b', scope: 'repo', source: 'user', confidence: 6 });
    expect(readDecisions(repo)).toHaveLength(2);
    const active = compactDecisions(repo);
    expect(active).toHaveLength(1);
    expect(readDecisions(repo)).toHaveLength(1);
    expect(readDecisions(repo)[0].decision).toBe('B');
  });
});

describe('memory store', () => {
  let repo: string;
  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'fac-memory-'));
  });
  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  test('writes and reads a note round-trip', () => {
    const note = writeNote(repo, 'session', 'working-context', '# Context\nremaining: ship it');
    expect(note.key).toBe('working-context');
    expect(note.updated_at).toBeTruthy();
    const read = readNote(repo, 'session', 'working-context');
    expect(read?.body).toBe('# Context\nremaining: ship it');
  });

  test('slugifies keys so the same key round-trips', () => {
    writeNote(repo, 'product', 'My Build Notes!', 'body');
    expect(slugKey('My Build Notes!')).toBe('my-build-notes');
    expect(readNote(repo, 'product', 'My Build Notes!')?.body).toBe('body');
  });

  test('lists and deletes notes', () => {
    writeNote(repo, 'product', 'alpha', 'a');
    writeNote(repo, 'product', 'beta', 'b');
    expect(listNotes(repo, 'product')).toEqual(['alpha', 'beta']);
    expect(deleteNote(repo, 'product', 'alpha')).toBe(true);
    expect(listNotes(repo, 'product')).toEqual(['beta']);
  });

  // Negative cases.
  test('reading a missing note returns null; deleting one returns false', () => {
    expect(readNote(repo, 'session', 'nope')).toBeNull();
    expect(deleteNote(repo, 'session', 'nope')).toBe(false);
    expect(listNotes(repo, 'session')).toEqual([]);
  });

  test('refuses to store a note containing a HIGH-tier secret', () => {
    expect(() => writeNote(repo, 'session', 'creds', `token ${GITHUB_TOKEN}`)).toThrow(
      /high-confidence secret/,
    );
    expect(readNote(repo, 'session', 'creds')).toBeNull();
  });

  test('rejects an empty-slug key and an invalid scope', () => {
    expect(() => writeNote(repo, 'product', '!!!', 'x')).toThrow(/slugifies to empty/);
    // @ts-expect-error — invalid scope is a runtime guard
    expect(() => writeNote(repo, 'galaxy', 'k', 'x')).toThrow(/invalid scope/);
  });
});
