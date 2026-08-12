/**
 * Infra-plan verifier — the mechanical half of the `/provision` hard gate.
 *
 * `/plan-infra` writes the IaC design record; `/provision` turns it into a `terraform plan`
 * (or `pulumi preview`), and MUST NOT `apply` a plan that would quietly destroy live data, ship a
 * long-lived credential, or ride over a failed policy scan. The failure mode is an `apply` that
 * replaces a database (`-/+` = data loss), creates a downloadable service-account key, or proceeds
 * despite a high-severity `tfsec`/OPA finding — the infrastructure analogue of shipping a change
 * that passes CI but breaks prod.
 *
 * This module owns the CHECK, not the apply: given a plan observation (the resource changes, the
 * set of protected resources, the operator's explicit destroy-consent flag, and the policy-scan
 * findings), it decides whether `apply` is safe. It never talks to a cloud, holds no state, and
 * reads no keys — the plan is gathered by the `/provision` skill (`terraform show -json` →
 * frontmatter) and verified here.
 *
 * Pure by design (no node imports beyond the shared frontmatter parser, no network, no clock) so
 * the whole gate is provable in `bun test` with a negative case per rule — the protected resource
 * destroyed without consent, the service-account key in the plan, the high-severity policy finding
 * — all offline against a plain-data fixture.
 */
import { parseFrontmatter } from './frontmatter.ts';

/** A Terraform plan action for one resource (`terraform show -json` `resource_changes[].change.actions`). */
export type ChangeAction = 'create' | 'read' | 'update' | 'delete' | 'no-op';

/** Policy-scan severity (`tfsec` / Checkov / OPA-Conftest). */
export type Severity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Resource types whose very creation IS a long-lived, downloadable credential. Their presence in a
 * plan is the classic "secret in state" leak the custody principle forbids — replace with OIDC
 * workload-identity federation. Extend per provider as needed.
 */
export const LONG_LIVED_KEY_TYPES: ReadonlySet<string> = new Set([
  'google_service_account_key',
  'aws_iam_access_key',
  'azuread_service_principal_password',
  'azuread_application_password',
]);

/** One planned resource change (the subset of a plan the gate reasons about). */
export interface ResourceChange {
  /** Full address, e.g. `google_sql_database_instance.main`. */
  address: string;
  /** Resource type, e.g. `google_sql_database_instance`. */
  type: string;
  /** Planned actions. `['delete','create']` (order-independent) is a replace (`-/+`). */
  actions: ChangeAction[];
  /**
   * Attribute paths in this change that would write a RAW secret VALUE into state (a hardcoded
   * password / private key), as opposed to a reference to a secret manager. Empty is the norm.
   */
  secretAttributes?: string[];
}

/** One policy-scan finding (`tfsec` / Checkov / OPA-Conftest). */
export interface PolicyFinding {
  id: string;
  severity: Severity;
  resource: string;
  detail: string;
}

/** A parsed plan observation: the changes, the guard inputs, and the policy result. */
export interface InfraPlan {
  cloud: string;
  iacTool: string;
  /** Resource addresses OR types the operator has marked protected (stateful / irreversible). */
  protectedResources: string[];
  /** Whether the operator explicitly consented to destroy/replace a protected resource. */
  consentToDestroy: boolean;
  /** The planned resource changes. */
  changes: ResourceChange[];
  /** The policy-scan findings gathered before apply. */
  policyFindings: PolicyFinding[];
}

/** Why a plan fails the gate — drives the finding text `/provision` shows. */
export type InfraRisk =
  | 'destroy-protected'
  | 'replace-protected'
  | 'long-lived-key'
  | 'secret-in-state'
  | 'policy-high';

/** One failed gate rule. */
export interface InfraFinding {
  rule: string;
  risk: InfraRisk;
  detail: string;
}

/** Verdict for a plan: whether `apply` is safe. */
export interface InfraVerdict {
  pass: boolean;
  findings: InfraFinding[];
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

const ACTIONS: ReadonlySet<string> = new Set(['create', 'read', 'update', 'delete', 'no-op']);

function coerceActions(v: unknown): ChangeAction[] {
  return Array.isArray(v)
    ? v.filter((x): x is ChangeAction => typeof x === 'string' && ACTIONS.has(x))
    : [];
}

function coerceChange(raw: unknown): ResourceChange {
  const c = (raw ?? {}) as Record<string, unknown>;
  return {
    address: asString(c.address),
    type: asString(c.type),
    actions: coerceActions(c.actions),
    secretAttributes: asStringArray(c.secret_attributes),
  };
}

const SEVERITIES: ReadonlySet<string> = new Set(['low', 'medium', 'high', 'critical']);

function coerceFinding(raw: unknown): PolicyFinding {
  const f = (raw ?? {}) as Record<string, unknown>;
  const severity = asString(f.severity, 'low');
  return {
    id: asString(f.id),
    severity: (SEVERITIES.has(severity) ? severity : 'low') as Severity,
    resource: asString(f.resource),
    detail: asString(f.detail),
  };
}

/**
 * Parse a plan observation into an InfraPlan. The frontmatter is the machine source of truth (the
 * same frontmatter-is-machine-readable pattern as PRD.md / stack.yaml / the prototype manifest);
 * the body is prose the verifier ignores. Throws only when the frontmatter block is missing or
 * malformed.
 */
export function parseInfraPlan(text: string, label = 'infra plan'): InfraPlan {
  const { data } = parseFrontmatter(text, label);
  return {
    cloud: asString(data.cloud),
    iacTool: asString(data.iac_tool),
    protectedResources: asStringArray(data.protected_resources),
    consentToDestroy: asBool(data.consent_to_destroy),
    changes: Array.isArray(data.changes) ? data.changes.map(coerceChange) : [],
    policyFindings: Array.isArray(data.policy_findings) ? data.policy_findings.map(coerceFinding) : [],
  };
}

// ── Verification ─────────────────────────────────────────────────────────────

function isReplace(actions: ChangeAction[]): boolean {
  return actions.includes('delete') && actions.includes('create');
}

function isDestroy(actions: ChangeAction[]): boolean {
  return actions.includes('delete') && !actions.includes('create');
}

/**
 * Verify a plan is safe to `apply`. Rules:
 *   - protected-destroy — a protected resource is destroyed (delete only) without destroy-consent.
 *   - protected-replace — a protected resource is replaced (`-/+`, delete+create) without consent.
 *   - no-long-lived-key — the plan creates a downloadable long-lived credential resource.
 *   - no-secret-in-state — a change would write a raw secret value into state.
 *   - policy-clean      — no high/critical policy-scan finding.
 * A resource is protected if its address OR its type is in `protectedResources`. `consentToDestroy`
 * gates ONLY the destroy/replace rules — it never waives the key/secret/policy rules.
 */
export function verifyInfraPlan(plan: InfraPlan): InfraVerdict {
  const findings: InfraFinding[] = [];
  const protectedSet = new Set(plan.protectedResources);
  const isProtected = (c: ResourceChange) => protectedSet.has(c.address) || protectedSet.has(c.type);

  for (const change of plan.changes) {
    // protected-destroy / protected-replace — blast-radius guard, gated by explicit consent.
    if (isProtected(change) && !plan.consentToDestroy) {
      if (isReplace(change.actions)) {
        findings.push({
          rule: 'protected-replace',
          risk: 'replace-protected',
          detail: `'${change.address}' is protected and the plan REPLACES it (-/+ = data loss) without destroy-consent`,
        });
      } else if (isDestroy(change.actions)) {
        findings.push({
          rule: 'protected-destroy',
          risk: 'destroy-protected',
          detail: `'${change.address}' is protected and the plan DESTROYS it without destroy-consent`,
        });
      }
    }

    // no-long-lived-key — a downloadable credential resource is never allowed (custody principle).
    if (change.actions.includes('create') && LONG_LIVED_KEY_TYPES.has(change.type)) {
      findings.push({
        rule: 'no-long-lived-key',
        risk: 'long-lived-key',
        detail: `'${change.address}' creates a long-lived downloadable credential (${change.type}); use OIDC workload-identity federation instead`,
      });
    }

    // no-secret-in-state — a raw secret value written to state is never allowed.
    for (const attr of change.secretAttributes ?? []) {
      findings.push({
        rule: 'no-secret-in-state',
        risk: 'secret-in-state',
        detail: `'${change.address}' writes a raw secret into state at '${attr}'; reference a secret manager instead`,
      });
    }
  }

  // policy-clean — a high/critical policy finding blocks apply; low/medium are recorded, not blocking.
  for (const finding of plan.policyFindings) {
    if (finding.severity === 'high' || finding.severity === 'critical') {
      findings.push({
        rule: 'policy-clean',
        risk: 'policy-high',
        detail: `${finding.severity} policy finding ${finding.id} on '${finding.resource}': ${finding.detail}`,
      });
    }
  }

  return { pass: findings.length === 0, findings };
}

// ── Plan summary ──────────────────────────────────────────────────────────────

/** A compact plan roll-up the skill can render for the operator before the gate. */
export interface InfraPlanSummary {
  creates: number;
  updates: number;
  destroys: number;
  replaces: number;
  /** Protected resources the plan destroys or replaces. */
  protectedTouched: number;
  /** High/critical policy findings. */
  highPolicyFindings: number;
}

/** Roll up the blast radius of a plan — the operator-facing dashboard before the apply gate. */
export function planSummary(plan: InfraPlan): InfraPlanSummary {
  const protectedSet = new Set(plan.protectedResources);
  const isProtected = (c: ResourceChange) => protectedSet.has(c.address) || protectedSet.has(c.type);
  let creates = 0;
  let updates = 0;
  let destroys = 0;
  let replaces = 0;
  let protectedTouched = 0;
  for (const change of plan.changes) {
    if (isReplace(change.actions)) {
      replaces += 1;
      if (isProtected(change)) protectedTouched += 1;
    } else if (isDestroy(change.actions)) {
      destroys += 1;
      if (isProtected(change)) protectedTouched += 1;
    } else if (change.actions.includes('create')) {
      creates += 1;
    } else if (change.actions.includes('update')) {
      updates += 1;
    }
  }
  const highPolicyFindings = plan.policyFindings.filter(
    (f) => f.severity === 'high' || f.severity === 'critical',
  ).length;
  return { creates, updates, destroys, replaces, protectedTouched, highPolicyFindings };
}
