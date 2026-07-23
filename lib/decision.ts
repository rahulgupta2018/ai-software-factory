/**
 * Decision log — an append-only, event-sourced record of durable decisions and their rationale.
 *
 * Neither the operator nor an agent should re-litigate a settled call or lose the "why" across
 * sessions. Decisions live in `.factory/decisions.jsonl`, one JSON object per line, in the order
 * they were made. The log is event-sourced: a decision is never edited in place — a later entry
 * `supersedes` an earlier one, and `activeDecisions` resolves the chain to the current set. This
 * is the design record (like `.factory/stack.yaml`), so it is committed, not a build artifact.
 *
 * Durable means: an architecture choice, a scope cut, a tool/vendor choice, or the reversal of a
 * prior call. NOT a turn-level edit or anything trivially re-derivable — curate at the source or
 * the log becomes noise. Writes are secret-blocking: a decision carrying a HIGH-tier credential is
 * refused (see `lib/redact.ts`), never silently persisted.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { FACTORY_DIR } from './run.ts';
import { containsHighSecret } from './redact.ts';

export const DECISIONS_FILE = 'decisions.jsonl';

export type DecisionScope = 'repo' | 'branch' | 'run';
export type DecisionSource = 'user' | 'skill' | 'agent';

const SCOPES: DecisionScope[] = ['repo', 'branch', 'run'];
const SOURCES: DecisionSource[] = ['user', 'skill', 'agent'];

/** What a caller supplies to log a decision. */
export interface DecisionInput {
  decision: string;
  rationale: string;
  scope: DecisionScope;
  source: DecisionSource;
  /** 1 (weak hunch) .. 10 (certain). */
  confidence: number;
  /** Id of a prior decision this one replaces. */
  supersedes?: string;
}

/** A stored decision: the input plus a stable id and timestamp. */
export interface DecisionRecord extends DecisionInput {
  id: string;
  logged_at: string;
  /** Set when the entry's content was expunged for an accidental secret. */
  redacted?: boolean;
}

export interface SearchOptions {
  scope?: DecisionScope;
  /** Case-insensitive substring matched against decision + rationale. */
  query?: string;
  /** Keep only the most recent N (after other filters). */
  recent?: number;
  /** Include superseded/redacted entries too. Default false (active set only). */
  includeInactive?: boolean;
}

export function decisionsPath(repoRoot: string): string {
  return join(repoRoot, FACTORY_DIR, DECISIONS_FILE);
}

function newDecisionId(now: Date): string {
  return `${now.toISOString().slice(0, 10)}-${randomBytes(4).toString('hex')}`;
}

/** Collapse newlines so each record stays a single JSONL line, and trim. */
function oneLine(text: string): string {
  return text.replace(/\s*\n\s*/g, ' ').trim();
}

function writeAll(repoRoot: string, records: DecisionRecord[]): void {
  const path = decisionsPath(repoRoot);
  mkdirSync(join(repoRoot, FACTORY_DIR), { recursive: true });
  const body = records.map((r) => JSON.stringify(r)).join('\n');
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, records.length ? `${body}\n` : '');
  renameSync(tmp, path);
}

/**
 * Append a durable decision. Validates the fields, sanitises the text to one line, and refuses to
 * persist a HIGH-tier secret. Returns the stored record (with its new id).
 */
export function logDecision(
  repoRoot: string,
  input: DecisionInput,
  now: Date = new Date(),
): DecisionRecord {
  const decision = oneLine(input.decision);
  const rationale = oneLine(input.rationale);
  if (!decision) throw new Error('logDecision: decision is empty');
  if (!rationale) throw new Error('logDecision: rationale is empty');
  if (!SCOPES.includes(input.scope)) throw new Error(`logDecision: invalid scope ${input.scope}`);
  if (!SOURCES.includes(input.source)) {
    throw new Error(`logDecision: invalid source ${input.source}`);
  }
  if (!Number.isInteger(input.confidence) || input.confidence < 1 || input.confidence > 10) {
    throw new Error(`logDecision: confidence must be an integer 1..10, got ${input.confidence}`);
  }
  if (containsHighSecret(`${decision} ${rationale}`)) {
    throw new Error('logDecision: refusing to log a decision containing a high-confidence secret');
  }
  if (input.supersedes && !readDecisions(repoRoot).some((r) => r.id === input.supersedes)) {
    throw new Error(`logDecision: supersedes unknown decision ${input.supersedes}`);
  }

  const record: DecisionRecord = {
    id: newDecisionId(now),
    decision,
    rationale,
    scope: input.scope,
    source: input.source,
    confidence: input.confidence,
    logged_at: now.toISOString(),
    ...(input.supersedes ? { supersedes: input.supersedes } : {}),
  };

  const path = decisionsPath(repoRoot);
  mkdirSync(join(repoRoot, FACTORY_DIR), { recursive: true });
  const existing = existsSync(path) ? readFileSync(path, 'utf-8') : '';
  writeFileSync(path, `${existing}${JSON.stringify(record)}\n`);
  return record;
}

/** Every entry in the log, raw, in the order written. */
export function readDecisions(repoRoot: string): DecisionRecord[] {
  const path = decisionsPath(repoRoot);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf-8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as DecisionRecord);
}

/** The current set: superseded entries and redacted entries removed, order preserved. */
export function activeDecisions(repoRoot: string): DecisionRecord[] {
  const all = readDecisions(repoRoot);
  const superseded = new Set(all.map((r) => r.supersedes).filter((id): id is string => Boolean(id)));
  return all.filter((r) => !superseded.has(r.id) && !r.redacted);
}

/** Resurface decisions before re-deciding. Filters by scope/query, then keeps the most recent N. */
export function searchDecisions(repoRoot: string, opts: SearchOptions = {}): DecisionRecord[] {
  let records = opts.includeInactive ? readDecisions(repoRoot) : activeDecisions(repoRoot);
  if (opts.scope) records = records.filter((r) => r.scope === opts.scope);
  if (opts.query) {
    const q = opts.query.toLowerCase();
    records = records.filter((r) => `${r.decision} ${r.rationale}`.toLowerCase().includes(q));
  }
  if (opts.recent !== undefined && opts.recent >= 0) records = records.slice(-opts.recent);
  return records;
}

/** Reverse a prior call: log a new decision that supersedes `priorId`. */
export function supersedeDecision(
  repoRoot: string,
  priorId: string,
  input: Omit<DecisionInput, 'supersedes'>,
  now: Date = new Date(),
): DecisionRecord {
  return logDecision(repoRoot, { ...input, supersedes: priorId }, now);
}

/**
 * Expunge an accidental secret: rewrite the log with the matching entry's content replaced by
 * `[redacted]` and flagged `redacted`, so it drops out of the active set but the event history
 * (ids, supersede links) stays intact. Returns true if an entry was changed.
 */
export function redactDecision(repoRoot: string, id: string): boolean {
  const all = readDecisions(repoRoot);
  let changed = false;
  const next = all.map((r) => {
    if (r.id !== id) return r;
    changed = true;
    return { ...r, decision: '[redacted]', rationale: '[redacted]', redacted: true };
  });
  if (changed) writeAll(repoRoot, next);
  return changed;
}

/** Rewrite the log down to just the active set, dropping superseded and redacted entries. */
export function compactDecisions(repoRoot: string): DecisionRecord[] {
  const active = activeDecisions(repoRoot);
  writeAll(repoRoot, active);
  return active;
}
