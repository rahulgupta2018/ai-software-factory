/**
 * pipeline-lint — a pure, offline hardening lint for a generated CI/CD pipeline (Phase 7, Track 4).
 *
 * The `/pipeline` skill generates a GitHub Actions workflow and the `/security` skill audits an
 * existing one; both hand the ALREADY-PARSED workflow object to `lintPipeline`, which checks it
 * against a hardening policy and returns every failed rule. This module runs no YAML parser, spawns
 * no process, and touches no network — the caller parses the `.yml`, this applies the policy — so
 * the whole gate is provable in `bun test` with a negative case per rule.
 *
 * The baseline mirrors the security custody principle (§6.2): least-privilege `permissions:`,
 * OIDC/keyless cloud auth (no long-lived secret), pinned action SHAs, and the supply-chain steps
 * from Tracks 1–3 wired as required checks.
 */

/** A single way a pipeline fails the hardening baseline. */
export type PipelineRisk =
  | 'permissions-missing' // no explicit `permissions:` — inherits the broad default token
  | 'permissions-excessive' // `write-all` or a write scope above the policy ceiling
  | 'oidc-missing' // requireOidc but no `id-token: write` anywhere — can't do keyless auth
  | 'long-lived-secret' // references a long-lived cloud/registry credential secret
  | 'unpinned-action' // `uses:` a tag/branch instead of a full 40-hex commit SHA
  | 'missing-required-step'; // a required security step (SCA/SBOM/SAST/sign) is absent

/** The hardening baseline the lint enforces. */
export interface PipelinePolicy {
  /** Require keyless/OIDC auth: an `id-token: write` permission must be present. */
  requireOidc: boolean;
  /** Require every third-party `uses:` to be pinned to a full 40-hex commit SHA. */
  requirePinnedActions: boolean;
  /** The highest `contents` (and sibling) permission the top level may grant. */
  maxTopLevelPermission: 'read' | 'write';
  /** Substrings that must each appear in at least one step (`uses`/`run`/`name`), e.g. `semgrep`. */
  requiredSteps: string[];
  /** Secret names that indicate a long-lived credential (bare name, no `secrets.` prefix). */
  forbiddenSecrets: string[];
}

/** The default baseline — least-privilege, keyless, pinned, and no long-lived cloud creds. */
export const DEFAULT_PIPELINE_POLICY: PipelinePolicy = {
  requireOidc: true,
  requirePinnedActions: true,
  maxTopLevelPermission: 'read',
  requiredSteps: [],
  forbiddenSecrets: [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'GCP_SA_KEY',
    'AZURE_CREDENTIALS',
    'DOCKERHUB_TOKEN',
    'DOCKER_PASSWORD',
    'NPM_TOKEN',
  ],
};

export interface PipelineFinding {
  rule: string;
  risk: PipelineRisk;
  detail: string;
}

export interface PipelineVerdict {
  pass: boolean;
  findings: PipelineFinding[];
}

const PERMISSION_RANK: Record<string, number> = { none: 0, read: 1, write: 2 };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Every `permissions:` block in the workflow (top level + each job), normalised to records/strings. */
function collectPermissions(workflow: Record<string, unknown>): unknown[] {
  const blocks: unknown[] = [workflow.permissions];
  for (const job of Object.values(asRecord(workflow.jobs))) {
    blocks.push(asRecord(job).permissions);
  }
  return blocks;
}

/** Every step across every job. */
function collectSteps(workflow: Record<string, unknown>): Record<string, unknown>[] {
  const steps: Record<string, unknown>[] = [];
  for (const job of Object.values(asRecord(workflow.jobs))) {
    for (const step of asArray(asRecord(job).steps)) steps.push(asRecord(step));
  }
  return steps;
}

/** A flat, searchable string of a step's action, command, name, env, and inputs. */
function stepText(step: Record<string, unknown>): string {
  const parts = [asString(step.uses), asString(step.run), asString(step.name)];
  for (const value of Object.values(asRecord(step.with))) parts.push(asString(value));
  for (const value of Object.values(asRecord(step.env))) parts.push(asString(value));
  return parts.join('\n');
}

/** True when an `id-token: write` permission appears in any permissions block. */
function grantsIdToken(blocks: unknown[]): boolean {
  return blocks.some((block) => asString(asRecord(block)['id-token']).toLowerCase() === 'write');
}

/** True when a `uses:` ref is a full 40-hex commit SHA (the only pin GitHub can't move). */
function isPinnedToSha(uses: string): boolean {
  const at = uses.lastIndexOf('@');
  if (at === -1) return false;
  return /^[0-9a-f]{40}$/i.test(uses.slice(at + 1));
}

/** A third-party action ref (`owner/repo@ref`) — not a local (`./`) or docker (`docker://`) step. */
function isThirdPartyAction(uses: string): boolean {
  return uses.length > 0 && !uses.startsWith('./') && !uses.startsWith('docker://');
}

/**
 * Lint a parsed CI/CD workflow against the hardening `policy`, accumulating every failed rule.
 * `pass` is true only when there are no findings.
 */
export function lintPipeline(
  workflow: unknown,
  policy: PipelinePolicy = DEFAULT_PIPELINE_POLICY,
): PipelineVerdict {
  const wf = asRecord(workflow);
  const findings: PipelineFinding[] = [];
  const permissionBlocks = collectPermissions(wf);
  const steps = collectSteps(wf);

  // Least-privilege permissions at the top level.
  const top = wf.permissions;
  if (top === undefined) {
    findings.push({
      rule: 'least-privilege-permissions',
      risk: 'permissions-missing',
      detail: 'No top-level `permissions:` — the job inherits the broad default GITHUB_TOKEN.',
    });
  } else if (asString(top).toLowerCase() === 'write-all') {
    findings.push({
      rule: 'least-privilege-permissions',
      risk: 'permissions-excessive',
      detail: '`permissions: write-all` grants the token every scope; set explicit read scopes.',
    });
  } else {
    const ceiling = PERMISSION_RANK[policy.maxTopLevelPermission] ?? 1;
    for (const [scope, level] of Object.entries(asRecord(top))) {
      if (scope === 'id-token') continue; // OIDC token request, not a repo-write grant
      if ((PERMISSION_RANK[asString(level).toLowerCase()] ?? 0) > ceiling) {
        findings.push({
          rule: 'least-privilege-permissions',
          risk: 'permissions-excessive',
          detail: `Top-level \`${scope}: ${asString(level)}\` exceeds the ${policy.maxTopLevelPermission} ceiling.`,
        });
      }
    }
  }

  // OIDC / keyless auth.
  if (policy.requireOidc && !grantsIdToken(permissionBlocks)) {
    findings.push({
      rule: 'oidc-keyless-auth',
      risk: 'oidc-missing',
      detail: 'No `id-token: write` permission — cloud/registry auth can\u2019t be keyless (OIDC).',
    });
  }

  // No long-lived credential secrets.
  for (const step of steps) {
    const text = stepText(step);
    for (const secret of policy.forbiddenSecrets) {
      if (text.includes(`secrets.${secret}`)) {
        findings.push({
          rule: 'no-long-lived-secrets',
          risk: 'long-lived-secret',
          detail: `References \`secrets.${secret}\` \u2014 a long-lived credential; use OIDC/keyless auth.`,
        });
      }
    }
  }

  // Pinned third-party actions.
  if (policy.requirePinnedActions) {
    for (const step of steps) {
      const uses = asString(step.uses);
      if (isThirdPartyAction(uses) && !isPinnedToSha(uses)) {
        findings.push({
          rule: 'pin-actions-to-sha',
          risk: 'unpinned-action',
          detail: `\`uses: ${uses}\` is not pinned to a full commit SHA (a tag/branch can be moved).`,
        });
      }
    }
  }

  // Required security steps wired as checks.
  const haystack = steps.map(stepText).join('\n').toLowerCase();
  for (const required of policy.requiredSteps) {
    if (!haystack.includes(required.toLowerCase())) {
      findings.push({
        rule: 'required-security-steps',
        risk: 'missing-required-step',
        detail: `No step references \`${required}\` \u2014 the required security check is not wired in.`,
      });
    }
  }

  return { pass: findings.length === 0, findings };
}
