/**
 * container-scan — a pure, offline policy engine for container-image scanning + base-image
 * hardening (Phase 7, Track 5).
 *
 * A product that ships a Docker image adds two attack surfaces the app-code gates don't cover: OS /
 * base-layer package vulnerabilities, and an unhardened image (running as root, an unpinned base
 * image). The scan (Trivy / Grype) runs in CI (custody principle); `/security` normalises its JSON
 * via this module and applies the severity policy, and lints the image config for hardening. No
 * scanner runs here and nothing hits the network — the caller supplies the parsed report, this
 * module owns the policy — so the whole gate is provable in `bun test` with a negative case per rule.
 */

export type ImageSeverity = 'unknown' | 'low' | 'medium' | 'high' | 'critical';
export type ImageBlockSeverity = Exclude<ImageSeverity, 'unknown'>;

/** Which scanner produced the image report. */
export type ImageScanFormat = 'trivy' | 'grype';

const SEVERITY_RANK: Record<ImageSeverity, number> = {
  unknown: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

/** A single OS/base-layer package vulnerability. */
export interface ImageVuln {
  id: string;
  pkg: string;
  severity: ImageSeverity;
  fixAvailable: boolean;
}

export interface ImageScanPolicy {
  blockSeverity: ImageBlockSeverity;
  /** When true (default), only a fix-available vuln at/above the threshold gates. */
  requireFixAvailable: boolean;
  /**
   * When true (default), a vuln the scanner reported but couldn't grade (`unknown` severity) is a
   * gate candidate rather than silently below-threshold — it still respects `requireFixAvailable`.
   */
  gateUnknownSeverity: boolean;
}

export const DEFAULT_IMAGE_SCAN_POLICY: ImageScanPolicy = {
  blockSeverity: 'high',
  requireFixAvailable: true,
  gateUnknownSeverity: true,
};

export interface ImageScanResult {
  vuln: ImageVuln;
  blocking: boolean;
  reason: string;
}

export interface ImageScanVerdict {
  pass: boolean;
  policy: ImageScanPolicy;
  total: number;
  vulns: ImageVuln[];
  blocking: ImageScanResult[];
}

/** The image-config facts a hardening lint checks (from `docker inspect` / the Dockerfile). */
export interface ImageConfigObservation {
  /** The image's runtime user resolves to root (uid 0 / no non-root USER). */
  runsAsRoot: boolean;
  /** The base image is pinned by digest (`FROM img@sha256:...`), not a moveable tag. */
  baseImagePinnedByDigest: boolean;
}

export interface ImageHardeningPolicy {
  forbidRoot: boolean;
  requirePinnedBase: boolean;
}

export const DEFAULT_IMAGE_HARDENING_POLICY: ImageHardeningPolicy = {
  forbidRoot: true,
  requirePinnedBase: true,
};

export type ImageHardeningRisk = 'runs-as-root' | 'unpinned-base-image';

export interface ImageHardeningFinding {
  rule: string;
  risk: ImageHardeningRisk;
  detail: string;
}

export interface ImageHardeningVerdict {
  pass: boolean;
  findings: ImageHardeningFinding[];
}

function get(record: unknown, key: string): unknown {
  return record && typeof record === 'object' ? (record as Record<string, unknown>)[key] : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Normalise a scanner severity label to the common scale. */
export function normalizeImageSeverity(raw: unknown): ImageSeverity {
  const s = asString(raw).toLowerCase();
  if (s === 'critical') return 'critical';
  if (s === 'high') return 'high';
  if (s === 'medium' || s === 'moderate') return 'medium';
  if (s === 'low' || s === 'negligible') return 'low';
  return 'unknown';
}

/** Parse a `trivy image --format json` report to a flat vuln list. */
export function parseTrivyImage(report: unknown): ImageVuln[] {
  const vulns: ImageVuln[] = [];
  for (const result of asArray(get(report, 'Results'))) {
    for (const v of asArray(get(result, 'Vulnerabilities'))) {
      vulns.push({
        id: asString(get(v, 'VulnerabilityID')),
        pkg: asString(get(v, 'PkgName')),
        severity: normalizeImageSeverity(get(v, 'Severity')),
        fixAvailable: asString(get(v, 'FixedVersion')).length > 0,
      });
    }
  }
  return vulns;
}

/** Parse a `grype -o json` report to a flat vuln list. */
export function parseGrype(report: unknown): ImageVuln[] {
  const vulns: ImageVuln[] = [];
  for (const match of asArray(get(report, 'matches'))) {
    const vulnerability = get(match, 'vulnerability');
    const fix = get(vulnerability, 'fix');
    const state = asString(get(fix, 'state')).toLowerCase();
    const versions = asArray(get(fix, 'versions'));
    vulns.push({
      id: asString(get(vulnerability, 'id')),
      pkg: asString(get(get(match, 'artifact'), 'name')),
      severity: normalizeImageSeverity(get(vulnerability, 'severity')),
      fixAvailable: state === 'fixed' || versions.length > 0,
    });
  }
  return vulns;
}

/** Dispatch to the right image-scan parser. */
export function parseImageScan(format: ImageScanFormat, report: unknown): ImageVuln[] {
  return format === 'grype' ? parseGrype(report) : parseTrivyImage(report);
}

/**
 * Apply the severity policy to image vulns. A vuln at/above `blockSeverity` gates; when
 * `requireFixAvailable` (default) a vuln only gates if a fix exists — an unfixable one warns.
 */
export function evaluateImageScan(
  vulns: ImageVuln[],
  policy: ImageScanPolicy = DEFAULT_IMAGE_SCAN_POLICY,
): ImageScanVerdict {
  const threshold = SEVERITY_RANK[policy.blockSeverity];
  const blocking: ImageScanResult[] = [];
  for (const vuln of vulns) {
    const ungradeable = vuln.severity === 'unknown' && policy.gateUnknownSeverity;
    if (SEVERITY_RANK[vuln.severity] < threshold && !ungradeable) continue;
    if (policy.requireFixAvailable && !vuln.fixAvailable) continue;
    blocking.push({
      vuln,
      blocking: true,
      reason: ungradeable
        ? `unknown severity \u2014 gating pending triage${policy.requireFixAvailable ? ' with a fix available' : ''}`
        : `${vuln.severity} \u2265 ${policy.blockSeverity}${policy.requireFixAvailable ? ' with a fix available' : ''}`,
    });
  }
  return { pass: blocking.length === 0, policy, total: vulns.length, vulns, blocking };
}

/** Lint the image config for base-image hardening, accumulating every failed rule. */
export function lintImageConfig(
  obs: ImageConfigObservation,
  policy: ImageHardeningPolicy = DEFAULT_IMAGE_HARDENING_POLICY,
): ImageHardeningVerdict {
  const findings: ImageHardeningFinding[] = [];
  if (policy.forbidRoot && obs.runsAsRoot) {
    findings.push({
      rule: 'non-root-user',
      risk: 'runs-as-root',
      detail: 'The image runs as root (uid 0); add a non-root USER \u2014 a container escape inherits root.',
    });
  }
  if (policy.requirePinnedBase && !obs.baseImagePinnedByDigest) {
    findings.push({
      rule: 'pin-base-image',
      risk: 'unpinned-base-image',
      detail: 'The base image is not pinned by digest (FROM img@sha256:...); a tag can be moved.',
    });
  }
  return { pass: findings.length === 0, findings };
}
