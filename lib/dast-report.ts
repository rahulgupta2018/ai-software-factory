/**
 * dast-report — a pure, offline policy engine for Dynamic Application Security Testing (Phase 7,
 * Track 5).
 *
 * A DAST scanner (OWASP ZAP baseline) exercises a *running* preview of the app and reports alerts by
 * risk (informational / low / medium / high). The scan runs in CI against a deployed preview
 * (custody principle); `/security` normalises ZAP's JSON via this module and gates on a confirmed
 * alert at/above the risk threshold. No scanner runs here and nothing hits the network — the caller
 * supplies the parsed report, this module owns the policy — so the gate is provable in `bun test`
 * with a negative case per rule.
 */

export type DastRisk = 'informational' | 'low' | 'medium' | 'high';
export type DastBlockRisk = Exclude<DastRisk, 'informational'>;

const RISK_RANK: Record<DastRisk, number> = {
  informational: 0,
  low: 1,
  medium: 2,
  high: 3,
};

/** ZAP reports a per-alert confidence; a false-positive is the lowest. */
export type DastConfidence = 'false-positive' | 'low' | 'medium' | 'high' | 'confirmed';

const CONFIDENCE_RANK: Record<DastConfidence, number> = {
  'false-positive': 0,
  low: 1,
  medium: 2,
  high: 3,
  confirmed: 4,
};

/** A single normalised DAST alert. */
export interface DastAlert {
  name: string;
  risk: DastRisk;
  confidence: DastConfidence;
  url: string;
  cwe?: string;
}

export interface DastPolicy {
  blockRisk: DastBlockRisk;
  /** Alerts below this confidence are treated as noise and never gate. Default: 'low'. */
  minConfidence: DastConfidence;
}

export const DEFAULT_DAST_POLICY: DastPolicy = {
  blockRisk: 'high',
  minConfidence: 'low',
};

export interface DastResult {
  alert: DastAlert;
  blocking: boolean;
  reason: string;
}

export interface DastVerdict {
  pass: boolean;
  policy: DastPolicy;
  total: number;
  alerts: DastAlert[];
  blocking: DastResult[];
}

function get(record: unknown, key: string): unknown {
  return record && typeof record === 'object' ? (record as Record<string, unknown>)[key] : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
}

/** Normalise a ZAP `riskcode` (0..3) or risk label to the common scale. */
export function normalizeDastRisk(raw: unknown): DastRisk {
  const s = asString(raw).toLowerCase().trim();
  if (s === '3' || s === 'high') return 'high';
  if (s === '2' || s === 'medium') return 'medium';
  if (s === '1' || s === 'low') return 'low';
  return 'informational';
}

/** Normalise a ZAP `confidence` (0..4) or label to the common scale. */
export function normalizeDastConfidence(raw: unknown): DastConfidence {
  const s = asString(raw).toLowerCase().trim();
  if (s === '0' || s === 'false positive' || s === 'false-positive') return 'false-positive';
  if (s === '1' || s === 'low') return 'low';
  if (s === '2' || s === 'medium') return 'medium';
  if (s === '3' || s === 'high') return 'high';
  if (s === '4' || s === 'confirmed' || s === 'user confirmed') return 'confirmed';
  return 'medium';
}

/** Parse an OWASP ZAP JSON report (`site[].alerts[]`) to a flat alert list. */
export function parseZapReport(report: unknown): DastAlert[] {
  const alerts: DastAlert[] = [];
  for (const site of asArray(get(report, 'site'))) {
    for (const alert of asArray(get(site, 'alerts'))) {
      const instances = asArray(get(alert, 'instances'));
      const url = asString(get(instances[0], 'uri')) || asString(get(site, '@name'));
      const cweId = asString(get(alert, 'cweid'));
      alerts.push({
        name: asString(get(alert, 'alert')) || asString(get(alert, 'name')),
        risk: normalizeDastRisk(get(alert, 'riskcode') ?? get(alert, 'risk')),
        confidence: normalizeDastConfidence(get(alert, 'confidence')),
        url,
        cwe: cweId && cweId !== '-1' ? `CWE-${Number(cweId)}` : undefined,
      });
    }
  }
  return alerts;
}

/**
 * Apply the DAST policy: an alert at/above `blockRisk` whose confidence is at/above `minConfidence`
 * gates. A false-positive (or sub-threshold confidence) never gates — a DAST gate that cries wolf
 * gets muted, defeating the point.
 */
export function evaluateDastReport(
  alerts: DastAlert[],
  policy: DastPolicy = DEFAULT_DAST_POLICY,
): DastVerdict {
  const riskThreshold = RISK_RANK[policy.blockRisk];
  const confidenceThreshold = CONFIDENCE_RANK[policy.minConfidence];
  const blocking: DastResult[] = [];
  for (const alert of alerts) {
    if (RISK_RANK[alert.risk] < riskThreshold) continue;
    if (CONFIDENCE_RANK[alert.confidence] < confidenceThreshold) continue;
    blocking.push({
      alert,
      blocking: true,
      reason: `${alert.risk} \u2265 ${policy.blockRisk} at ${alert.confidence} confidence`,
    });
  }
  return { pass: blocking.length === 0, policy, total: alerts.length, alerts, blocking };
}
