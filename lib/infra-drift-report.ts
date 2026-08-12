/**
 * Infra-drift report — the mechanical half of the `/drift` step.
 *
 * Once `/provision` has applied a plan, the live cloud can diverge from the Infrastructure-as-Code
 * that owns it: someone edits a firewall rule in the console, a resource is deleted out of band, or
 * a shadow resource is created that no IaC manages. `/drift` reads a state-vs-reality diff (a
 * `terraform plan` with an empty change set, or `pulumi refresh` output) and produces the
 * infrastructure analogue of a `/qa` bug-list: which managed resources have drifted, and which
 * resources exist unmanaged. It reports drift so the operator can reconcile (re-apply, import, or
 * codify); it is the finding half, not the fix.
 *
 * It owns the CHECK, not the refresh: given a drift observation (the resources that differ, how they
 * differ, and whether the change touched something security-sensitive), it classifies the drift. It
 * never talks to a cloud, holds no state, reads no keys, and calls no clock — the diff is gathered
 * by the `/drift` skill (`terraform plan -refresh-only` / `pulumi refresh` → frontmatter) and
 * verified here.
 *
 * Pure by design (no node imports beyond the shared frontmatter parser, no network, no clock) so the
 * whole check is provable in `bun test` with a negative case per rule — the out-of-band modification,
 * the out-of-band deletion, the unmanaged shadow resource — all offline against a plain-data fixture.
 */
import { parseFrontmatter } from './frontmatter.ts';

/** How a resource has drifted from the IaC that should own it. */
export type DriftType = 'modified' | 'deleted' | 'unmanaged';

/** One drifted resource (the subset of a refresh diff the check reasons about). */
export interface DriftResource {
  /** Full address, e.g. `google_compute_firewall.allow_ssh` (or the live id for an unmanaged one). */
  address: string;
  /** Resource type, e.g. `google_compute_firewall`. */
  type: string;
  /** modified = changed out of band; deleted = vanished out of band; unmanaged = exists, no IaC. */
  driftType: DriftType;
  /** For a modification, the attribute paths that changed in the live resource. */
  changedAttributes: string[];
  /** Whether the drift touches a security-sensitive surface (firewall, IAM, public access, keys). */
  securitySensitive: boolean;
}

/** A parsed drift observation: the environment and the resources that differ. */
export interface DriftReport {
  cloud: string;
  iacTool: string;
  /** The environment the refresh ran against, e.g. `prod`. */
  environment: string;
  /** The drifted / unmanaged resources. Empty is the healthy, in-sync case. */
  resources: DriftResource[];
}

/** Why the drift check raises a finding — drives the finding text `/drift` shows. */
export type DriftRisk = 'resource-modified' | 'resource-deleted' | 'unmanaged-resource';

/** One drift finding (a bug-list entry, ordered security-sensitive first by the skill). */
export interface DriftFinding {
  rule: string;
  risk: DriftRisk;
  detail: string;
  /** True when the drift touches a security-sensitive surface — the skill lists these first. */
  securitySensitive: boolean;
}

/** Verdict for a drift observation: whether the live estate has diverged from its IaC. */
export interface DriftVerdict {
  /** True when any resource has drifted or is unmanaged. */
  drifted: boolean;
  findings: DriftFinding[];
}

// ── Parsing ──────────────────────────────────────────────────────────────────

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function asBool(v: unknown): boolean {
  return v === true;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

const DRIFT_TYPES: ReadonlySet<string> = new Set(['modified', 'deleted', 'unmanaged']);

function coerceResource(raw: unknown): DriftResource {
  const c = (raw ?? {}) as Record<string, unknown>;
  const driftType = asString(c.drift_type, 'modified');
  return {
    address: asString(c.address),
    type: asString(c.type),
    driftType: (DRIFT_TYPES.has(driftType) ? driftType : 'modified') as DriftType,
    changedAttributes: asStringArray(c.changed_attributes),
    securitySensitive: asBool(c.security_sensitive),
  };
}

/**
 * Parse a drift observation into a DriftReport. The frontmatter is the machine source of truth (the
 * same frontmatter-is-machine-readable pattern as the plan and cost verifiers); the body is prose
 * the check ignores. Throws only when the frontmatter block is missing or malformed.
 */
export function parseDriftReport(text: string, label = 'drift report'): DriftReport {
  const { data } = parseFrontmatter(text, label);
  return {
    cloud: asString(data.cloud),
    iacTool: asString(data.iac_tool),
    environment: asString(data.environment),
    resources: Array.isArray(data.resources) ? data.resources.map(coerceResource) : [],
  };
}

// ── Verification ─────────────────────────────────────────────────────────────

/**
 * Classify a drift observation into a bug-list. Rules:
 *   - resource-modified  — a managed resource changed out of band (config drift).
 *   - resource-deleted   — a managed resource was deleted out of band (it has vanished).
 *   - unmanaged-resource — a resource exists in the environment with no IaC managing it (shadow).
 * Every drifted or unmanaged resource yields one finding; `securitySensitive` is carried through so
 * the skill can surface security-relevant drift first. An empty resource list is in-sync (no drift).
 */
export function verifyDriftReport(report: DriftReport): DriftVerdict {
  const findings: DriftFinding[] = [];
  for (const resource of report.resources) {
    const sensitive = resource.securitySensitive ? ' [SECURITY-SENSITIVE]' : '';
    if (resource.driftType === 'modified') {
      const attrs = resource.changedAttributes.length
        ? ` (changed: ${resource.changedAttributes.join(', ')})`
        : '';
      findings.push({
        rule: 'resource-modified',
        risk: 'resource-modified',
        detail: `'${resource.address}' was modified out of band${attrs}${sensitive}; reconcile by re-applying the IaC or codifying the change`,
        securitySensitive: resource.securitySensitive,
      });
    } else if (resource.driftType === 'deleted') {
      findings.push({
        rule: 'resource-deleted',
        risk: 'resource-deleted',
        detail: `'${resource.address}' was deleted out of band${sensitive}; re-apply the IaC to restore it or remove it from state deliberately`,
        securitySensitive: resource.securitySensitive,
      });
    } else {
      findings.push({
        rule: 'unmanaged-resource',
        risk: 'unmanaged-resource',
        detail: `'${resource.address}' exists in ${report.environment || 'the environment'} but no IaC manages it${sensitive}; import it or remove it`,
        securitySensitive: resource.securitySensitive,
      });
    }
  }
  return { drifted: findings.length > 0, findings };
}

// ── Drift summary ──────────────────────────────────────────────────────────────

/** A compact roll-up the `/drift` skill can render for the operator. */
export interface DriftSummary {
  modified: number;
  deleted: number;
  unmanaged: number;
  /** Number of drifted/unmanaged resources touching a security-sensitive surface. */
  securitySensitive: number;
}

/** Roll up the drift — the operator-facing dashboard before the bug-list. */
export function driftSummary(report: DriftReport): DriftSummary {
  let modified = 0;
  let deleted = 0;
  let unmanaged = 0;
  let securitySensitive = 0;
  for (const resource of report.resources) {
    if (resource.driftType === 'modified') modified += 1;
    else if (resource.driftType === 'deleted') deleted += 1;
    else unmanaged += 1;
    if (resource.securitySensitive) securitySensitive += 1;
  }
  return { modified, deleted, unmanaged, securitySensitive };
}
