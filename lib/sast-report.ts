/**
 * Static Application Security Testing (SAST) report verifier — the mechanical half of the
 * static-analysis gate `/security` runs and `/review` surfaces (plan §Phase 7, Track 2).
 *
 * A static analyzer (semgrep rulesets, or CodeQL where available) runs in CI over the source and
 * emits findings — a rule id, a location, a severity, often a CWE. The analyzer is a wrapper; what
 * the Factory owns is the policy: normalise the tool's JSON/SARIF to a flat finding list and decide
 * pass/fail against a severity threshold. It is **advisory-then-gating** — `/review` shows every
 * finding, `/security` treats a finding at or above the threshold (default High) as a gate.
 *
 * Unlike SCA there is no "fix available" axis — the vulnerable code is yours, so a finding at or
 * above the threshold always gates; the fix is to change the code. Pure by design (no node imports,
 * no network, no analyzer binary) so the whole policy is provable in `bun test` with a negative
 * case per rule — the high-severity injection that must block, the low-severity note that must not,
 * the malformed report that must not throw. The scan is produced elsewhere (a CI step); this module
 * never runs an analyzer.
 */

/** Normalised severity tiers, ordered lowest → highest. `unknown` is for findings a tool emits with no severity. */
export type SastSeverity = 'unknown' | 'low' | 'medium' | 'high' | 'critical';

/** The analyzer output shapes this module can normalise. SARIF covers CodeQL and `semgrep --sarif`. */
export type SastFormat = 'semgrep' | 'sarif';

/** Severity threshold a policy can gate on (a real tier, never `unknown`). */
export type SastBlockSeverity = Exclude<SastSeverity, 'unknown'>;

/** Rank of each severity for threshold comparison. `unknown` sorts below `low`, so it never trips a real threshold. */
const SEVERITY_RANK: Readonly<Record<SastSeverity, number>> = {
  unknown: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

/** One normalised static-analysis finding — the common shape every analyzer is mapped onto. */
export interface SastFinding {
  /** Rule identifier, e.g. `python.lang.security.audit.dangerous-exec` or a CodeQL query id. */
  ruleId: string;
  /** Human-readable message describing the issue. */
  message: string;
  /** Normalised severity; `unknown` when the analyzer emits none. */
  severity: SastSeverity;
  /** Source file the finding is in (repo-relative), or `'unknown'`. */
  file: string;
  /** 1-based line number, when the analyzer reports one. */
  line?: number;
  /** CWE identifier when known, e.g. `CWE-89`. */
  cwe?: string;
}

/** The gate policy: block at or above `blockSeverity`. No fix-available axis — the code is yours to fix. */
export interface SastPolicy {
  blockSeverity: SastBlockSeverity;
  /**
   * When true (default), a finding the analyzer emitted but could not grade (`unknown` severity)
   * gates pending triage — a security finding is never silently passed just because its severity
   * label didn't map. Set false to restore "unknown is below any threshold" behaviour.
   */
  gateUnknownSeverity: boolean;
}

/** The default SAST policy: gate on a High or Critical static finding, and on an ungradeable one. */
export const DEFAULT_SAST_POLICY: SastPolicy = {
  blockSeverity: 'high',
  gateUnknownSeverity: true,
};

/** A finding paired with the policy verdict for it. */
export interface SastResult {
  finding: SastFinding;
  /** True if this finding gates under the policy. */
  blocking: boolean;
  /** Human-readable reason the finding gates or not. */
  reason: string;
}

/** The verdict for a whole scan under a policy. */
export interface SastVerdict {
  pass: boolean;
  policy: SastPolicy;
  total: number;
  findings: SastResult[];
  /** The subset of `findings` that gate — what `/security` stops on. */
  blocking: SastResult[];
}

/** Map a raw analyzer severity string onto a normalised tier. Unrecognised / empty → `unknown`. */
export function normalizeSastSeverity(raw: string | null | undefined): SastSeverity {
  const s = (raw ?? '').trim().toLowerCase();
  if (s === 'critical') return 'critical';
  if (s === 'high' || s === 'error') return 'high';
  if (s === 'medium' || s === 'moderate' || s === 'warning') return 'medium';
  if (s === 'low' || s === 'info' || s === 'note' || s === 'none') return 'low';
  return 'unknown';
}

/** Derive a severity tier from a SARIF `security-severity` CVSS-like score (CodeQL rule property). */
export function severityFromSecuritySeverity(score: number | null | undefined): SastSeverity {
  if (typeof score !== 'number' || Number.isNaN(score) || score <= 0) return 'unknown';
  if (score >= 9.0) return 'critical';
  if (score >= 7.0) return 'high';
  if (score >= 4.0) return 'medium';
  return 'low';
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-analyzer normalisers. Each maps a real tool's output onto SastFinding[].
// Written defensively — a missing/oddly-shaped field degrades to a safe default,
// it never throws, so a partial scan still produces a usable finding list.
// ─────────────────────────────────────────────────────────────────────────────

/** semgrep (`semgrep --json`): results[].{check_id, path, start.line, extra.{severity, message, metadata.cwe}}. */
export function parseSemgrep(report: unknown): SastFinding[] {
  const out: SastFinding[] = [];
  for (const result of asArray(get(report, 'results'))) {
    const extra = get(result, 'extra');
    const metadata = get(extra, 'metadata');
    // Prefer an author-set metadata severity (HIGH/MEDIUM/LOW), fall back to the ERROR/WARNING/INFO level.
    const metaSeverity = normalizeSastSeverity(asString(get(metadata, 'severity')));
    const severity = metaSeverity !== 'unknown' ? metaSeverity : normalizeSastSeverity(asString(get(extra, 'severity')));
    const line = asNumber(get(get(result, 'start'), 'line'));
    out.push({
      ruleId: asString(get(result, 'check_id')) || 'unknown',
      message: asString(get(extra, 'message')) || asString(get(metadata, 'message')) || '',
      severity,
      file: asString(get(result, 'path')) || 'unknown',
      ...(line != null ? { line } : {}),
      ...(cwe(get(metadata, 'cwe')) ? { cwe: cwe(get(metadata, 'cwe')) as string } : {}),
    });
  }
  return out;
}

/** SARIF 2.1.0 (CodeQL, `semgrep --sarif`): runs[].results[] with rule severity resolved from runs[].tool.driver.rules[]. */
export function parseSarif(report: unknown): SastFinding[] {
  const out: SastFinding[] = [];
  for (const run of asArray(get(report, 'runs'))) {
    // Index the driver rules so a result's ruleId can resolve its `security-severity` / tags (CWE).
    const rules = new Map<string, unknown>();
    for (const rule of asArray(get(get(get(run, 'tool'), 'driver'), 'rules'))) {
      const id = asString(get(rule, 'id'));
      if (id) rules.set(id, rule);
    }
    for (const result of asArray(get(run, 'results'))) {
      const ruleId = asString(get(result, 'ruleId')) || 'unknown';
      const rule = rules.get(ruleId);
      const props = get(rule, 'properties');
      // Prefer the numeric security-severity (CodeQL), fall back to the SARIF result level.
      const scored = severityFromSecuritySeverity(asNumber(get(props, 'security-severity')));
      const severity = scored !== 'unknown' ? scored : normalizeSastSeverity(asString(get(result, 'level')));
      const loc = get(get(get(asArray(get(result, 'locations'))[0], 'physicalLocation'), 'artifactLocation'), 'uri');
      const region = get(get(asArray(get(result, 'locations'))[0], 'physicalLocation'), 'region');
      const line = asNumber(get(region, 'startLine'));
      out.push({
        ruleId,
        message: asString(get(get(result, 'message'), 'text')) || '',
        severity,
        file: asString(loc) || 'unknown',
        ...(line != null ? { line } : {}),
        ...(cweFromTags(get(props, 'tags')) ? { cwe: cweFromTags(get(props, 'tags')) as string } : {}),
      });
    }
  }
  return out;
}

/** Normalise any supported analyzer report to the common finding list. */
export function parseSastReport(format: SastFormat, report: unknown): SastFinding[] {
  switch (format) {
    case 'semgrep':
      return parseSemgrep(report);
    case 'sarif':
      return parseSarif(report);
  }
}

/**
 * Apply the severity policy to a normalised finding list.
 *
 * A finding gates when its severity is at or above `blockSeverity`. There is no fix-available
 * escape hatch — a High/Critical static finding is code you wrote and can fix, so it always gates;
 * a below-threshold finding is reported but does not block.
 */
export function evaluateSastReport(
  findings: readonly SastFinding[],
  policy: SastPolicy = DEFAULT_SAST_POLICY,
): SastVerdict {
  const threshold = SEVERITY_RANK[policy.blockSeverity];
  const results: SastResult[] = findings.map((finding) => {
    if (finding.severity === 'unknown' && policy.gateUnknownSeverity) {
      return {
        finding,
        blocking: true,
        reason: 'unknown severity — gating pending triage (the analyzer emitted this but could not grade it)',
      };
    }
    const blocking = SEVERITY_RANK[finding.severity] >= threshold;
    return {
      finding,
      blocking,
      reason: blocking
        ? `${finding.severity} at or above the ${policy.blockSeverity} gate`
        : `${finding.severity} is below the ${policy.blockSeverity} gate`,
    };
  });
  const blocking = results.filter((r) => r.blocking);
  return { pass: blocking.length === 0, policy, total: findings.length, findings: results, blocking };
}

// ─────────────────────────────────────────────────────────────────────────────
// Small defensive accessors — keep the normalisers tolerant of partial JSON.
// ─────────────────────────────────────────────────────────────────────────────

function get(obj: unknown, key: string): unknown {
  return obj != null && typeof obj === 'object' ? (obj as Record<string, unknown>)[key] : undefined;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return null;
}

/** Coerce a semgrep `metadata.cwe` (string or array of strings) to a single `CWE-nnn` id, when present. */
function cwe(v: unknown): string | undefined {
  const raw = Array.isArray(v) ? asString(v[0]) : asString(v);
  if (!raw) return undefined;
  const match = /CWE[-\s]?(\d+)/i.exec(raw);
  return match ? `CWE-${match[1]}` : raw;
}

/** Pull a `CWE-nnn` id out of a SARIF rule's `tags` array (CodeQL tags include `external/cwe/cwe-089`). */
function cweFromTags(tags: unknown): string | undefined {
  for (const tag of asArray(tags)) {
    const match = /cwe[-/](\d+)/i.exec(asString(tag));
    if (match) return `CWE-${Number(match[1])}`; // strip CodeQL's zero-padding: cwe-089 → CWE-89
  }
  return undefined;
}
