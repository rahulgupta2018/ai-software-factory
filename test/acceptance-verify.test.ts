/**
 * Tier-1 — the acceptance verifier (lib/acceptance-verify.ts) behind the BUILD/REVIEW gate.
 *
 * The whole point is that a build can't self-certify: it isn't enough that the build's own tests are
 * green, every contracted criterion must be met AND backed by a cited test, or consented-deferred.
 * So every block rule has both sides — the honest matrix that MUST pass, and the specific gap (an
 * unmet criterion, a "met" with no test, a criterion missing from the matrix, a drifted entry, a
 * deferral without consent, a side-effect/security criterion deferred at all, an unrecognised
 * status/kind) that MUST block. Pure functions, no clock, no network. The committed reference
 * contract + matrix are parsed and verified too, so the fixtures can't drift silently.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

import {
  verifyAcceptance,
  acceptanceSummary,
  parseAcceptanceContract,
  parseConformanceMatrix,
  type AcceptanceContract,
  type ConformanceMatrix,
  type ConformanceEntry,
} from '../lib/acceptance-verify.ts';

const CONTRACT_FIXTURE = new URL('./fixtures/acceptance-contract.md', import.meta.url).pathname;
const MATRIX_FIXTURE = new URL('./fixtures/acceptance-matrix.md', import.meta.url).pathname;

/** A small honest contract — the baseline every negative case perturbs by one field. */
function contract(): AcceptanceContract {
  return {
    component: 'identity',
    sources: ['identity.yaml'],
    criteria: [
      { id: 'AC-1', behavior: 'sign-in returns 200', kind: 'route', source: 'identity.yaml' },
      { id: 'AC-2', behavior: 'emits auth.signin to outbox', kind: 'side-effect', source: 'identity.yaml' },
      { id: 'AC-3', behavior: 'response carries x-correlation-id', kind: 'header', source: 'identity.yaml' },
    ],
  };
}

/** A matrix that fully satisfies `contract()` — the baseline pass. */
function matrix(overrides: Partial<ConformanceMatrix> = {}): ConformanceMatrix {
  return {
    component: 'identity',
    entries: [
      { id: 'AC-1', status: 'met', impl: 'server.ts:10', test: 'sign-in returns 200' },
      { id: 'AC-2', status: 'met', impl: 'outbox.ts:4', test: 'emits auth.signin' },
      { id: 'AC-3', status: 'met', impl: 'correlation.ts:2', test: 'carries x-correlation-id' },
    ],
    ...overrides,
  };
}

/** Replace one entry by id, keeping the rest of the matrix intact. */
function withEntry(m: ConformanceMatrix, id: string, patch: Partial<ConformanceEntry>): ConformanceMatrix {
  return { ...m, entries: m.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) };
}

describe('verifyAcceptance — an honest matrix passes', () => {
  test('every criterion met with a cited test → pass, no findings', () => {
    const v = verifyAcceptance(contract(), matrix());
    expect(v.pass).toBe(true);
    expect(v.findings).toEqual([]);
  });
});

describe('verifyAcceptance — each block rule has a negative case', () => {
  test('an unmet criterion blocks', () => {
    const v = verifyAcceptance(contract(), withEntry(matrix(), 'AC-2', { status: 'unmet', test: undefined }));
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.id === 'AC-2' && f.risk === 'unmet')).toBe(true);
  });

  test('a partial criterion blocks (same as unmet)', () => {
    const v = verifyAcceptance(contract(), withEntry(matrix(), 'AC-1', { status: 'partial' }));
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.id === 'AC-1' && f.risk === 'unmet')).toBe(true);
  });

  test('a "met" with no test cited blocks — self-certification with no proof', () => {
    const v = verifyAcceptance(contract(), withEntry(matrix(), 'AC-2', { test: undefined }));
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.id === 'AC-2' && f.risk === 'untested')).toBe(true);
  });

  test('an empty-string test counts as no test', () => {
    const v = verifyAcceptance(contract(), withEntry(matrix(), 'AC-3', { test: '   ' }));
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.id === 'AC-3' && f.risk === 'untested')).toBe(true);
  });

  test('a contract criterion missing from the matrix blocks — a silent omission', () => {
    const m = matrix();
    const v = verifyAcceptance(contract(), { ...m, entries: m.entries.filter((e) => e.id !== 'AC-2') });
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.id === 'AC-2' && f.risk === 'missing')).toBe(true);
  });

  test('a matrix entry mapping to no contract criterion blocks — drift', () => {
    const m = matrix();
    const v = verifyAcceptance(contract(), {
      ...m,
      entries: [...m.entries, { id: 'AC-99', status: 'met', test: 'invented' }],
    });
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.id === 'AC-99' && f.risk === 'unknown-criterion')).toBe(true);
  });

  test('a deferred criterion without consent blocks', () => {
    const v = verifyAcceptance(
      contract(),
      withEntry(matrix(), 'AC-1', { status: 'deferred', deferralReason: 'later', test: undefined }),
    );
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.id === 'AC-1' && f.risk === 'unconsented-deferral')).toBe(true);
  });

  test('a deferred criterion with consent but no reason blocks', () => {
    const m = withEntry(matrix(), 'AC-1', { status: 'deferred', test: undefined });
    const v = verifyAcceptance(contract(), { ...m, consentToDefer: ['AC-1'] });
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.id === 'AC-1' && f.risk === 'unconsented-deferral')).toBe(true);
  });

  test('a route criterion deferred WITH consent and a reason passes', () => {
    const m = withEntry(matrix(), 'AC-1', { status: 'deferred', deferralReason: 'next slice', test: undefined });
    const v = verifyAcceptance(contract(), { ...m, consentToDefer: ['AC-1'] });
    expect(v.pass).toBe(true);
  });

  test('a side-effect criterion may NEVER be deferred, even with consent + reason', () => {
    const m = withEntry(matrix(), 'AC-2', { status: 'deferred', deferralReason: 'later', test: undefined });
    const v = verifyAcceptance(contract(), { ...m, consentToDefer: ['AC-2'] });
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.id === 'AC-2' && f.risk === 'unconsented-deferral')).toBe(true);
  });

  test('a security criterion may never be deferred', () => {
    const c: AcceptanceContract = {
      ...contract(),
      criteria: [{ id: 'AC-S', behavior: 'CSRF enforced', kind: 'security', source: 'x' }],
    };
    const m: ConformanceMatrix = {
      component: 'identity',
      consentToDefer: ['AC-S'],
      entries: [{ id: 'AC-S', status: 'deferred', deferralReason: 'later' }],
    };
    const v = verifyAcceptance(c, m);
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.id === 'AC-S' && f.risk === 'unconsented-deferral')).toBe(true);
  });

  test('an unrecognised status is fail-closed (blocks), not read as a pass', () => {
    const v = verifyAcceptance(
      contract(),
      withEntry(matrix(), 'AC-1', { status: 'done' as unknown as ConformanceEntry['status'] }),
    );
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.id === 'AC-1' && f.risk === 'status-unknown')).toBe(true);
  });

  test('an unrecognised kind is fail-closed (blocks) and can never be deferred', () => {
    const c: AcceptanceContract = {
      ...contract(),
      criteria: [{ id: 'AC-K', behavior: 'x', kind: 'nonsense' as never, source: 'x' }],
    };
    const v = verifyAcceptance(c, {
      component: 'identity',
      entries: [{ id: 'AC-K', status: 'met', test: 't' }],
    });
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.id === 'AC-K' && f.risk === 'kind-unknown')).toBe(true);
  });
});

describe('acceptanceSummary — the honest coverage roll-up', () => {
  test('counts met/tested/unmet/deferred and computes tested-coverage', () => {
    const s = acceptanceSummary(contract(), matrix());
    expect(s.total).toBe(3);
    expect(s.met).toBe(3);
    expect(s.tested).toBe(3);
    expect(s.coverage).toBe(1);
  });

  test('a met-but-untested criterion counts as met but not tested — coverage drops', () => {
    const s = acceptanceSummary(contract(), withEntry(matrix(), 'AC-2', { test: undefined }));
    expect(s.met).toBe(3);
    expect(s.tested).toBe(2);
    expect(s.coverage).toBeCloseTo(2 / 3);
  });

  test('a criterion missing from the matrix counts as unmet in the roll-up', () => {
    const m = matrix();
    const s = acceptanceSummary(contract(), { ...m, entries: m.entries.filter((e) => e.id !== 'AC-1') });
    expect(s.unmet).toBe(1);
  });
});

describe('parse — the committed reference fixtures parse and verify', () => {
  test('the reference contract + matrix parse and pass the gate', () => {
    const c = parseAcceptanceContract(readFileSync(CONTRACT_FIXTURE, 'utf8'), 'acceptance-contract.md');
    const m = parseConformanceMatrix(readFileSync(MATRIX_FIXTURE, 'utf8'), 'acceptance-matrix.md');
    expect(c.component).toBe('identity');
    expect(c.criteria.length).toBe(6);
    const v = verifyAcceptance(c, m);
    expect(v.pass).toBe(true);
    const s = acceptanceSummary(c, m);
    expect(s.met).toBe(5);
    expect(s.deferred).toBe(1);
  });

  test('a criterion with no behavior throws on parse (loud, not vacuous)', () => {
    const broken = '---\nacceptance:\n  component: x\n  criteria:\n    - id: AC-1\n---\n';
    expect(() => parseAcceptanceContract(broken, 'broken')).toThrow(/behavior/);
  });

  test('a matrix with no conformance block throws on parse', () => {
    const broken = '---\nnotconformance: {}\n---\n';
    expect(() => parseConformanceMatrix(broken, 'broken')).toThrow(/conformance/);
  });
});
