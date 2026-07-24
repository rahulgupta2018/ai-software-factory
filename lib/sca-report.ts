/**
 * Software Composition Analysis (SCA) report + SBOM verifier — the mechanical half of the
 * supply-chain gate `/security` runs and `/ship` / `/deploy` enforce (plan §Phase 7, Track 1).
 *
 * A dependency scanner (osv-scanner / npm audit / pip-audit / Trivy, chosen per language) and an
 * SBOM generator run in CI at build time; the Factory holds no registry or cloud credential and
 * never fetches an advisory feed itself (custody principle, §6.2/§7). What the Factory DOES own is
 * the policy: given the scanner's already-produced JSON, normalise it to a flat finding list and
 * decide pass/fail against a fixed severity policy — a known, fix-available vulnerability at or
 * above the configured severity **blocks** (with an explicit-consent override recorded elsewhere).
 *
 * Pure by design (no node imports, no network, no scanner binary) so the whole policy is provable
 * in `bun test` with a negative case per rule — the seeded fix-available critical that must block,
 * the below-threshold low that must not, the no-fix-yet finding that warns but doesn't block under
 * a fix-available policy, the absent/empty/mis-formatted SBOM that must fail. The scan and the
 * SBOM are gathered elsewhere (a CI step in the pipeline); this module never runs a scanner.
 */

/** Normalised severity tiers, ordered lowest → highest. `unknown` is for scanners that emit no severity (e.g. pip-audit). */
export type Severity = 'unknown' | 'low' | 'medium' | 'high' | 'critical';

/** The scanner output shapes this module can normalise. Chosen per language/ecosystem. */
export type ScannerFormat = 'osv-scanner' | 'npm-audit' | 'pip-audit' | 'trivy';

/** Severity threshold a policy can gate on (a real tier, never `unknown`). */
export type BlockSeverity = Exclude<Severity, 'unknown'>;

/** Rank of each severity for threshold comparison. `unknown` sorts below `low`, so it never trips a real threshold. */
const SEVERITY_RANK: Readonly<Record<Severity, number>> = {
  unknown: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

/** One normalised vulnerability — the common shape every scanner is mapped onto. */
export interface ScaVulnerability {
  /** Advisory id, e.g. `CVE-2024-1234`, `GHSA-xxxx`, `PYSEC-2024-1`. */
  id: string;
  /** The vulnerable package name. */
  package: string;
  /** The installed version, or `'unknown'` when the scanner does not report it (e.g. npm audit). */
  installedVersion: string;
  /** Normalised severity; `unknown` when the scanner emits none. */
  severity: Severity;
  /** Whether a fixed version / patch exists for this advisory. Drives the fix-available half of the policy. */
  fixAvailable: boolean;
  /** The first fixed version, when the scanner reports one. */
  fixedVersion?: string;
  /** Ecosystem/language, when known (`npm`, `PyPI`, `Pub`, ...). */
  ecosystem?: string;
}

/** The gate policy: block at or above `blockSeverity`, optionally only when a fix is available. */
export interface ScaPolicy {
  /** Findings at or above this tier are candidates to block. */
  blockSeverity: BlockSeverity;
  /** When true (default), a finding only blocks if a fix exists — you can't be forced to hold a release on an unfixable CVE. */
  requireFixAvailable: boolean;
}

/** The default supply-chain policy: block on a fix-available High or Critical. */
export const DEFAULT_SCA_POLICY: ScaPolicy = {
  blockSeverity: 'high',
  requireFixAvailable: true,
};

/** A vulnerability paired with the policy verdict for it. */
export interface ScaFinding {
  vuln: ScaVulnerability;
  /** True if this finding blocks the release under the policy. */
  blocking: boolean;
  /** Human-readable reason the finding is blocking or not. */
  reason: string;
}

/** The verdict for a whole scan under a policy. */
export interface ScaVerdict {
  pass: boolean;
  policy: ScaPolicy;
  total: number;
  findings: ScaFinding[];
  /** The subset of `findings` that block — what `/ship` / `/deploy` stops on. */
  blocking: ScaFinding[];
}

/** Map a raw scanner severity string onto a normalised tier. Unrecognised / empty → `unknown`. */
export function normalizeSeverity(raw: string | null | undefined): Severity {
  const s = (raw ?? '').trim().toLowerCase();
  if (s === 'critical') return 'critical';
  if (s === 'high' || s === 'important') return 'high';
  if (s === 'medium' || s === 'moderate') return 'medium';
  if (s === 'low' || s === 'negligible') return 'low';
  return 'unknown';
}

/** Derive a severity tier from a CVSS v3 base score (osv-scanner fallback when no label is present). */
export function severityFromCvss(score: number | null | undefined): Severity {
  if (typeof score !== 'number' || Number.isNaN(score) || score <= 0) return 'unknown';
  if (score >= 9.0) return 'critical';
  if (score >= 7.0) return 'high';
  if (score >= 4.0) return 'medium';
  return 'low';
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-scanner normalisers. Each maps a real scanner's JSON onto ScaVulnerability[].
// Written defensively — a missing/oddly-shaped field degrades to a safe default,
// it never throws, so a partial scan still produces a usable finding list.
// ─────────────────────────────────────────────────────────────────────────────

/** osv-scanner (`osv-scanner --format json`): results[].packages[].{package, vulnerabilities}. Multi-ecosystem (npm, PyPI, Pub, ...). */
export function parseOsvScanner(report: unknown): ScaVulnerability[] {
  const out: ScaVulnerability[] = [];
  const results = asArray(get(report, 'results'));
  for (const result of results) {
    for (const pkg of asArray(get(result, 'packages'))) {
      const pkgInfo = get(pkg, 'package');
      const name = asString(get(pkgInfo, 'name')) || 'unknown';
      const version = asString(get(pkgInfo, 'version')) || 'unknown';
      const ecosystem = asString(get(pkgInfo, 'ecosystem')) || undefined;
      for (const vuln of asArray(get(pkg, 'vulnerabilities'))) {
        const id = asString(get(vuln, 'id')) || 'unknown';
        // Prefer a GHSA/database label, fall back to the CVSS score.
        const labelled = normalizeSeverity(asString(get(get(vuln, 'database_specific'), 'severity')));
        const severity = labelled !== 'unknown' ? labelled : severityFromCvss(cvssScore(get(vuln, 'severity')));
        const fixedVersion = osvFixedVersion(vuln, name);
        out.push({
          id,
          package: name,
          installedVersion: version,
          severity,
          fixAvailable: fixedVersion != null,
          ...(fixedVersion != null ? { fixedVersion } : {}),
          ...(ecosystem ? { ecosystem } : {}),
        });
      }
    }
  }
  return out;
}

/** npm audit (`npm audit --json`, npm v7+): a `vulnerabilities` map keyed by package. No installed version in the report. */
export function parseNpmAudit(report: unknown): ScaVulnerability[] {
  const out: ScaVulnerability[] = [];
  const vulns = get(report, 'vulnerabilities');
  if (vulns == null || typeof vulns !== 'object') return out;
  for (const [name, entry] of Object.entries(vulns as Record<string, unknown>)) {
    const severity = normalizeSeverity(asString(get(entry, 'severity')));
    const fix = get(entry, 'fixAvailable');
    // fixAvailable is `false`, `true`, or `{name, version, isSemVerMajor}`.
    const fixVersion = asString(get(fix, 'version'));
    const fixAvailable = fix === true || (fix != null && typeof fix === 'object');
    // `via` carries the advisory id(s); a string entry is a transitive package name, not an id.
    const via = asArray(get(entry, 'via'));
    const id = via.map((v) => asString(get(v, 'url')) || asString(get(v, 'source')) || asString(get(v, 'name'))).find(Boolean)
      || asString(get(entry, 'name')) || name;
    out.push({
      id,
      package: asString(get(entry, 'name')) || name,
      installedVersion: 'unknown',
      severity,
      fixAvailable,
      ...(fixVersion ? { fixedVersion: fixVersion } : {}),
      ecosystem: 'npm',
    });
  }
  return out;
}

/** pip-audit (`pip-audit --format json`): dependencies[].vulns[]. Emits no severity, so findings normalise to `unknown`. */
export function parsePipAudit(report: unknown): ScaVulnerability[] {
  const out: ScaVulnerability[] = [];
  // pip-audit emits either a bare array or {dependencies: [...]}.
  const deps = Array.isArray(report) ? report : asArray(get(report, 'dependencies'));
  for (const dep of deps) {
    const name = asString(get(dep, 'name')) || 'unknown';
    const version = asString(get(dep, 'version')) || 'unknown';
    for (const vuln of asArray(get(dep, 'vulns'))) {
      const fixVersions = asArray(get(vuln, 'fix_versions')).map(asString).filter(Boolean);
      out.push({
        id: asString(get(vuln, 'id')) || 'unknown',
        package: name,
        installedVersion: version,
        severity: 'unknown', // pip-audit reports no severity; use osv-scanner/trivy for a severity gate on Python.
        fixAvailable: fixVersions.length > 0,
        ...(fixVersions.length > 0 ? { fixedVersion: fixVersions[0] } : {}),
        ecosystem: 'PyPI',
      });
    }
  }
  return out;
}

/** Trivy (`trivy fs --format json`): Results[].Vulnerabilities[]. Clean severity + fixed version. */
export function parseTrivy(report: unknown): ScaVulnerability[] {
  const out: ScaVulnerability[] = [];
  for (const result of asArray(get(report, 'Results'))) {
    const ecosystem = asString(get(result, 'Type')) || undefined;
    for (const vuln of asArray(get(result, 'Vulnerabilities'))) {
      const fixedVersion = asString(get(vuln, 'FixedVersion'));
      out.push({
        id: asString(get(vuln, 'VulnerabilityID')) || 'unknown',
        package: asString(get(vuln, 'PkgName')) || 'unknown',
        installedVersion: asString(get(vuln, 'InstalledVersion')) || 'unknown',
        severity: normalizeSeverity(asString(get(vuln, 'Severity'))),
        fixAvailable: Boolean(fixedVersion),
        ...(fixedVersion ? { fixedVersion } : {}),
        ...(ecosystem ? { ecosystem } : {}),
      });
    }
  }
  return out;
}

/** Normalise any supported scanner report to the common finding list. */
export function parseScaReport(format: ScannerFormat, report: unknown): ScaVulnerability[] {
  switch (format) {
    case 'osv-scanner':
      return parseOsvScanner(report);
    case 'npm-audit':
      return parseNpmAudit(report);
    case 'pip-audit':
      return parsePipAudit(report);
    case 'trivy':
      return parseTrivy(report);
  }
}

/**
 * Apply the severity policy to a normalised finding list.
 *
 * A finding blocks when its severity is at or above `blockSeverity` and — under the default
 * fix-available policy — a fix exists. A below-threshold finding, or an above-threshold one with no
 * fix yet under a fix-available policy, is reported but does not block (you can't be forced to hold
 * a release on a vulnerability you cannot fix).
 */
export function evaluateScaReport(
  vulns: readonly ScaVulnerability[],
  policy: ScaPolicy = DEFAULT_SCA_POLICY,
): ScaVerdict {
  const threshold = SEVERITY_RANK[policy.blockSeverity];
  const findings: ScaFinding[] = vulns.map((vuln) => {
    const meetsSeverity = SEVERITY_RANK[vuln.severity] >= threshold;
    if (!meetsSeverity) {
      return { vuln, blocking: false, reason: `${vuln.severity} is below the ${policy.blockSeverity} gate` };
    }
    if (policy.requireFixAvailable && !vuln.fixAvailable) {
      return { vuln, blocking: false, reason: `${vuln.severity} but no fix available yet (warn, not block)` };
    }
    const fix = vuln.fixedVersion ? ` (fix: ${vuln.fixedVersion})` : ' (fix available)';
    return { vuln, blocking: true, reason: `${vuln.severity} at or above the ${policy.blockSeverity} gate${policy.requireFixAvailable ? fix : ''}` };
  });
  const blocking = findings.filter((f) => f.blocking);
  return { pass: blocking.length === 0, policy, total: vulns.length, findings, blocking };
}

// ─────────────────────────────────────────────────────────────────────────────
// SBOM presence check. The build must emit a Software Bill of Materials
// (CycloneDX or SPDX); this verifies one was produced and is non-empty.
// ─────────────────────────────────────────────────────────────────────────────

/** The SBOM formats the supply-chain gate accepts. */
export type SbomFormat = 'cyclonedx' | 'spdx';

/** What was observed about a produced SBOM. Gathered by the CI/build step, checked here. */
export interface SbomObservation {
  /** Whether an SBOM file was produced at build time. */
  present: boolean;
  /** The SBOM format, e.g. `cyclonedx` / `spdx`. */
  format: string;
  /** How many components/packages the SBOM enumerates. An empty SBOM is not a real inventory. */
  componentCount: number;
}

/** Why an SBOM fails the gate. */
export type SbomRisk = 'sbom-missing' | 'unknown-format' | 'empty';

/** One failed SBOM rule. */
export interface SbomFinding {
  rule: string;
  risk: SbomRisk;
  detail: string;
}

/** Verdict for the SBOM half of the supply-chain gate. */
export interface SbomVerdict {
  pass: boolean;
  findings: SbomFinding[];
}

/** The accepted SBOM formats. */
export const SBOM_FORMATS: readonly SbomFormat[] = ['cyclonedx', 'spdx'];

/**
 * Verify a build produced a usable SBOM: present, a known format, and non-empty. A missing SBOM
 * short-circuits — the format/emptiness rules can't apply when nothing was produced.
 */
export function verifySbom(obs: SbomObservation): SbomVerdict {
  const findings: SbomFinding[] = [];
  if (!obs.present) {
    findings.push({
      rule: 'sbom-present',
      risk: 'sbom-missing',
      detail: 'no SBOM was produced at build time; the build must emit a CycloneDX or SPDX bill of materials',
    });
    return { pass: false, findings };
  }
  if (!SBOM_FORMATS.includes(obs.format.trim().toLowerCase() as SbomFormat)) {
    findings.push({
      rule: 'sbom-format',
      risk: 'unknown-format',
      detail: `'${obs.format}' is not a recognised SBOM format (expected one of: ${SBOM_FORMATS.join(', ')})`,
    });
  }
  if (!Number.isInteger(obs.componentCount) || obs.componentCount < 1) {
    findings.push({
      rule: 'sbom-non-empty',
      risk: 'empty',
      detail: `SBOM enumerates ${obs.componentCount} components; an empty SBOM is not a real inventory`,
    });
  }
  return { pass: findings.length === 0, findings };
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

/** Pull a CVSS v3 base score out of an osv-scanner `severity` array (`[{type, score}]`, score = CVSS vector). */
function cvssScore(severity: unknown): number | null {
  for (const entry of asArray(severity)) {
    const score = get(entry, 'score');
    if (typeof score === 'number') return score;
    // A CVSS vector string ends with the numeric base score isn't embedded; osv usually gives the vector,
    // not the number — return null so the label path is preferred.
    if (typeof score === 'string') {
      const n = Number(score);
      if (!Number.isNaN(n)) return n;
    }
  }
  return null;
}

/** First fixed version for a package across an osv vuln's `affected[].ranges[].events[].fixed`. */
function osvFixedVersion(vuln: unknown, packageName: string): string | undefined {
  for (const affected of asArray(get(vuln, 'affected'))) {
    const affectedName = asString(get(get(affected, 'package'), 'name'));
    if (affectedName && affectedName !== packageName) continue;
    for (const range of asArray(get(affected, 'ranges'))) {
      for (const event of asArray(get(range, 'events'))) {
        const fixed = asString(get(event, 'fixed'));
        if (fixed) return fixed;
      }
    }
  }
  return undefined;
}
