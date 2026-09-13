/**
 * Acceptance verifier — the mechanical half of the BUILD/REVIEW acceptance gate.
 *
 * The failure this exists to stop: `/build` writes the implementation AND the tests that certify it,
 * so "done" collapses to "my own tests are green" — a closed loop that certifies whatever was built,
 * not what the contract requires. A service can pass every test, lint, and typecheck while silently
 * omitting contracted behaviour (an audit event never emitted, a `role` never populated, a header
 * never stamped) because nothing ever held the CONTRACT up as an independent answer key.
 *
 * This module is that answer key made mechanical. Given an ACCEPTANCE CONTRACT (every contracted
 * behaviour enumerated as a criterion, compiled from the spec — the OpenAPI operations, the
 * architecture obligations, the PRD) and a CONFORMANCE MATRIX (the build's report: for each
 * criterion, is it implemented, and which test proves it), it decides whether the build actually
 * satisfies the contract. It blocks fail-closed: an unmet criterion, a criterion claimed "met" with
 * no test behind it, a contract criterion missing from the matrix, a matrix entry that maps to no
 * contract criterion (drift), an unrecognised status or kind, or a deferral that the operator never
 * consented to (and never, for a security / side-effect / data criterion) — every one of these
 * blocks. Silence is never a pass.
 *
 * It owns the CHECK, not the build: it writes no code, runs no tests, and cannot tell a strong test
 * from a weak one — proving that a cited test genuinely asserts its behaviour is the `/review`
 * Conformance lens's job (a second actor, re-deriving the criteria). What this guarantees is
 * narrower and load-bearing: no contract criterion is silently absent, untested, or dropped.
 *
 * Pure by design (no network, no clock, no state beyond the shared frontmatter parser) so the whole
 * gate is provable in `bun test` with a negative case per rule — the unmet criterion, the untested
 * "met", the missing criterion, the drifted entry, the unconsented deferral — all offline against a
 * plain-data fixture pair.
 */
import { splitFrontmatter } from './frontmatter.ts';
import { parseYamlObject } from './yaml.ts';

/**
 * What kind of contracted behaviour a criterion covers. Kind drives deferral policy: a `route`
 * criterion might be deferred to a later slice with consent, but a `security`, `side-effect`
 * (an audit emission, an outbox write), or `data` (a migration, a schema) criterion never is —
 * dropping one silently is exactly the failure mode this gate exists to catch.
 *
 * `unknown` is the fail-closed bucket for a kind string the verifier does not recognise: it is
 * treated as NEVER safe to defer, so a mis-labelled criterion can't buy itself a free deferral.
 */
export type CriterionKind =
  | 'route' // an endpoint/operation responds per its spec
  | 'header' // a response/request header is honoured (correlation id, cache-control)
  | 'side-effect' // a durable side effect happens (audit event, outbox write, projection)
  | 'error-shape' // an error path returns the contracted envelope/status
  | 'security' // an authz/authn/secret/CSRF/rate-limit obligation
  | 'data' // a schema/migration/persistence obligation
  | 'contract' // any other explicit contract obligation
  | 'unknown';

/** Kinds whose deferral, WITH explicit operator consent, is acceptable. Everything else blocks. */
const SAFE_TO_DEFER: ReadonlySet<CriterionKind> = new Set<CriterionKind>([
  'route',
  'header',
  'error-shape',
  'contract',
]);

const KNOWN_KINDS: ReadonlySet<string> = new Set<string>([
  'route',
  'header',
  'side-effect',
  'error-shape',
  'security',
  'data',
  'contract',
]);

/**
 * The build's reported status for one criterion. `unknown` is the fail-closed bucket for a status
 * string the verifier does not recognise — it BLOCKS rather than being read as a pass.
 */
export type MatrixStatus = 'met' | 'unmet' | 'partial' | 'deferred' | 'unknown';

const KNOWN_STATUSES: ReadonlySet<string> = new Set<string>(['met', 'unmet', 'partial', 'deferred']);

/** One enumerated contract obligation — a row of the answer key. */
export interface AcceptanceCriterion {
  /** Stable id, e.g. `AC-IDENTITY-001`. The join key between contract and matrix. */
  id: string;
  /** The observable behaviour, ideally given/when/then. */
  behavior: string;
  /** What kind of obligation this is (drives deferral policy). */
  kind: CriterionKind;
  /** Where in the spec this criterion comes from (e.g. `identity.yaml POST /api/auth/sign-in`). */
  source: string;
}

/** The answer key for one component — compiled from the contract, BEFORE the code exists. */
export interface AcceptanceContract {
  component: string;
  /** The contract source files this was compiled from (OpenAPI/arch/spec). */
  sources: string[];
  criteria: AcceptanceCriterion[];
}

/** The build's report for one criterion — a row of the conformance matrix. */
export interface ConformanceEntry {
  /** Matches an `AcceptanceCriterion.id`. */
  id: string;
  status: MatrixStatus;
  /** Where the behaviour is implemented, e.g. `services/identity/src/audit-outbox.ts:34`. */
  impl?: string;
  /** The test that proves it, e.g. `server.test.ts › emits auth.signin on sign-in`. */
  test?: string;
  /** Required to defer: why, and (implicitly) that the operator agreed. */
  deferralReason?: string;
}

/** The build's conformance matrix for one component. */
export interface ConformanceMatrix {
  component: string;
  entries: ConformanceEntry[];
  /**
   * Criterion ids the operator has EXPLICITLY consented to defer to a later slice. A `deferred`
   * entry whose id is not here is an unconsented deferral and blocks — the analogue of
   * `/provision`'s destroy-consent flag. Consent still cannot cover a security/side-effect/data
   * (or unknown-kind) criterion.
   */
  consentToDefer?: string[];
}

export type AcceptanceRisk =
  | 'unmet' // status unmet/partial — a contracted behaviour is not there
  | 'untested' // status met but no test cited — self-certification with no proof
  | 'missing' // a contract criterion has no matrix entry at all — silent omission
  | 'unknown-criterion' // a matrix entry maps to no contract criterion — drift
  | 'unconsented-deferral' // deferred without consent, or a kind that may never be deferred
  | 'status-unknown' // unrecognised status string — fail-closed
  | 'kind-unknown'; // unrecognised kind string — fail-closed (never safe to defer)

export interface AcceptanceFinding {
  /** The criterion id (or the offending matrix entry id) the finding is about. */
  id: string;
  risk: AcceptanceRisk;
  kind: CriterionKind;
  detail: string;
  /** Every finding this verifier emits is a hard gate — kept explicit for the report. */
  blocking: true;
}

export interface AcceptanceVerdict {
  /** True only when there are zero findings: every criterion met+tested, or consented-deferred. */
  pass: boolean;
  findings: AcceptanceFinding[];
}

function coerceKind(raw: unknown): CriterionKind {
  if (typeof raw === 'string' && KNOWN_KINDS.has(raw.trim().toLowerCase())) {
    return raw.trim().toLowerCase() as CriterionKind;
  }
  return 'unknown';
}

function coerceStatus(raw: unknown): MatrixStatus {
  if (typeof raw === 'string' && KNOWN_STATUSES.has(raw.trim().toLowerCase())) {
    return raw.trim().toLowerCase() as MatrixStatus;
  }
  return 'unknown';
}

function asStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string').map((s) => s.trim());
}

/**
 * Verify a conformance matrix against its acceptance contract. The contract is the source of truth
 * for WHAT must be true; the matrix is the build's claim about what IS true. Every gap between them
 * is a blocking finding.
 */
export function verifyAcceptance(
  contract: AcceptanceContract,
  matrix: ConformanceMatrix,
): AcceptanceVerdict {
  const findings: AcceptanceFinding[] = [];
  const consent = new Set(matrix.consentToDefer ?? []);

  const criteriaById = new Map<string, AcceptanceCriterion>();
  for (const c of contract.criteria) criteriaById.set(c.id, c);

  const entriesById = new Map<string, ConformanceEntry>();
  for (const e of matrix.entries) entriesById.set(e.id, e);

  // 1. Every contract criterion must have a matrix entry, and that entry must clear its rule.
  for (const criterion of contract.criteria) {
    // Normalise kind at the gate itself, not just at parse time — an in-memory contract built past
    // the parser must still fail closed on a kind the verifier doesn't recognise.
    const kind: CriterionKind = KNOWN_KINDS.has(criterion.kind) ? criterion.kind : 'unknown';
    const entry = entriesById.get(criterion.id);

    if (!entry) {
      findings.push({
        id: criterion.id,
        risk: 'missing',
        kind,
        detail: `Contract criterion "${criterion.id}" (${criterion.behavior}) has no entry in the conformance matrix — a silent omission.`,
        blocking: true,
      });
      continue;
    }

    // Fail-closed on an unrecognised kind: it can never be deferred, and we flag it so the
    // criterion gets re-labelled rather than sliding through.
    if (kind === 'unknown') {
      findings.push({
        id: criterion.id,
        risk: 'kind-unknown',
        kind: 'unknown',
        detail: `Contract criterion "${criterion.id}" has an unrecognised kind — treated as never-safe-to-defer; re-label it.`,
        blocking: true,
      });
    }

    switch (entry.status) {
      case 'met':
        if (!entry.test || entry.test.trim() === '') {
          findings.push({
            id: criterion.id,
            risk: 'untested',
            kind,
            detail: `Criterion "${criterion.id}" is claimed met but cites no test — a "met" with no proof is self-certification.`,
            blocking: true,
          });
        }
        break;

      case 'unmet':
      case 'partial':
        findings.push({
          id: criterion.id,
          risk: 'unmet',
          kind,
          detail: `Criterion "${criterion.id}" (${criterion.behavior}) is ${entry.status} — a contracted behaviour is not implemented.`,
          blocking: true,
        });
        break;

      case 'deferred': {
        const kindMayDefer = SAFE_TO_DEFER.has(kind);
        const hasReason = Boolean(entry.deferralReason && entry.deferralReason.trim() !== '');
        const hasConsent = consent.has(criterion.id);
        if (!kindMayDefer || !hasReason || !hasConsent) {
          const why = !kindMayDefer
            ? `a ${kind} criterion may never be deferred`
            : !hasConsent
              ? 'the operator has not consented to defer it'
              : 'no deferral reason was recorded';
          findings.push({
            id: criterion.id,
            risk: 'unconsented-deferral',
            kind,
            detail: `Criterion "${criterion.id}" is deferred but ${why}.`,
            blocking: true,
          });
        }
        break;
      }

      default: // 'unknown'
        findings.push({
          id: criterion.id,
          risk: 'status-unknown',
          kind,
          detail: `Criterion "${criterion.id}" has an unrecognised status — fail-closed; use met/unmet/partial/deferred.`,
          blocking: true,
        });
    }
  }

  // 2. Every matrix entry must map to a real contract criterion (no drift / invented ids).
  for (const entry of matrix.entries) {
    if (!criteriaById.has(entry.id)) {
      findings.push({
        id: entry.id,
        risk: 'unknown-criterion',
        kind: 'unknown',
        detail: `Matrix entry "${entry.id}" maps to no contract criterion — the matrix has drifted from the answer key.`,
        blocking: true,
      });
    }
  }

  return { pass: findings.length === 0, findings };
}

export interface AcceptanceSummary {
  component: string;
  total: number;
  met: number;
  tested: number;
  unmet: number;
  deferred: number;
  /** Fraction of criteria met AND backed by a cited test, 0..1. The honest coverage number. */
  coverage: number;
}

/** Operator-facing roll-up of how much of the contract the build actually closed. */
export function acceptanceSummary(
  contract: AcceptanceContract,
  matrix: ConformanceMatrix,
): AcceptanceSummary {
  const entriesById = new Map<string, ConformanceEntry>();
  for (const e of matrix.entries) entriesById.set(e.id, e);

  let met = 0;
  let tested = 0;
  let unmet = 0;
  let deferred = 0;

  for (const criterion of contract.criteria) {
    const entry = entriesById.get(criterion.id);
    const status = entry ? coerceStatus(entry.status) : 'unmet';
    if (status === 'met') {
      met += 1;
      if (entry?.test && entry.test.trim() !== '') tested += 1;
    } else if (status === 'deferred') {
      deferred += 1;
    } else {
      unmet += 1;
    }
  }

  const total = contract.criteria.length;
  return {
    component: contract.component,
    total,
    met,
    tested,
    unmet,
    deferred,
    coverage: total === 0 ? 0 : tested / total,
  };
}

// ── parsing ────────────────────────────────────────────────────────────────────────────────────
// The acceptance contract and the conformance matrix live in run artifacts whose FRONTMATTER is
// owned by the run harness (step/run/produced_at/inputs), so the criteria ride in the artifact BODY
// as a fenced ```yaml block with a top-level `acceptance:` (02c-acceptance-<name>.md) or
// `conformance:` (03-build-<name>.md) key. A standalone document may instead carry the block in its
// own frontmatter. `extractMapping` accepts either. Parsing is defensive — a malformed criterion or
// entry throws with the offending id, so a broken artifact fails loudly rather than verifying
// vacuously.

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label}: expected a non-empty string`);
  }
  return value.trim();
}

/** All fenced code-block bodies in a document (```lang … ```), lang tag ignored. */
function fencedBlocks(text: string): string[] {
  const blocks: string[] = [];
  const re = /```[^\n]*\r?\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) blocks.push(m[1]);
  return blocks;
}

/**
 * Find the mapping under top-level `key`, from either the document's own frontmatter or a fenced
 * yaml block in its body. The body-block path is the run-artifact case (harness owns frontmatter);
 * the frontmatter path is the standalone-document case. Throws if the key is nowhere.
 */
function extractMapping(text: string, key: string, label: string): Record<string, unknown> {
  // Frontmatter first (standalone document).
  try {
    const { raw } = splitFrontmatter(text, label);
    const fm = parseYamlObject(raw, `${label} frontmatter`);
    if (fm[key] && typeof fm[key] === 'object') return fm[key] as Record<string, unknown>;
  } catch {
    // no frontmatter block — fall through to fenced-block scan
  }
  // Then any fenced yaml block in the body whose top-level key matches (run artifact).
  for (const block of fencedBlocks(text)) {
    let parsed: Record<string, unknown>;
    try {
      parsed = parseYamlObject(block, `${label} fenced block`);
    } catch {
      continue; // not yaml, or not a mapping — skip
    }
    if (parsed[key] && typeof parsed[key] === 'object') return parsed[key] as Record<string, unknown>;
  }
  throw new Error(`${label}: no '${key}:' mapping found in frontmatter or a fenced yaml block`);
}

/** Parse the acceptance contract from a document's `acceptance:` block (frontmatter or fenced yaml). */
export function parseAcceptanceContract(text: string, label = 'acceptance contract'): AcceptanceContract {
  const block = extractMapping(text, 'acceptance', label);
  const component = requireString(block.component, `${label}.component`);
  const sources = asStringArray(block.sources);
  const rawCriteria = Array.isArray(block.criteria) ? block.criteria : [];
  const criteria: AcceptanceCriterion[] = rawCriteria.map((c, i) => {
    const row = (c ?? {}) as Record<string, unknown>;
    const id = requireString(row.id, `${label}.criteria[${i}].id`);
    return {
      id,
      behavior: requireString(row.behavior, `${label}.criteria[${i}].behavior (${id})`),
      kind: coerceKind(row.kind),
      source: typeof row.source === 'string' ? row.source.trim() : '',
    };
  });
  return { component, sources, criteria };
}

/** Parse the conformance matrix from a document's `conformance:` block (frontmatter or fenced yaml). */
export function parseConformanceMatrix(text: string, label = 'conformance matrix'): ConformanceMatrix {
  const block = extractMapping(text, 'conformance', label);
  const component = requireString(block.component, `${label}.component`);
  const rawEntries = Array.isArray(block.entries) ? block.entries : [];
  const entries: ConformanceEntry[] = rawEntries.map((e, i) => {
    const row = (e ?? {}) as Record<string, unknown>;
    const id = requireString(row.id, `${label}.entries[${i}].id`);
    return {
      id,
      status: coerceStatus(row.status),
      impl: typeof row.impl === 'string' ? row.impl.trim() : undefined,
      test: typeof row.test === 'string' ? row.test.trim() : undefined,
      deferralReason:
        typeof row.deferralReason === 'string' ? row.deferralReason.trim() : undefined,
    };
  });
  return { component, entries, consentToDefer: asStringArray(block.consentToDefer) };
}
