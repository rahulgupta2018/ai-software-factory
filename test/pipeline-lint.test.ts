import { describe, expect, test } from 'bun:test';

import {
  DEFAULT_PIPELINE_POLICY,
  lintPipeline,
  requiredStepsForBindings,
  type PipelinePolicy,
} from '../lib/pipeline-lint';

/**
 * A hardened GitHub Actions workflow that passes the default baseline: least-privilege top-level
 * permissions, an `id-token: write` grant for keyless auth, a SHA-pinned third-party action, and no
 * long-lived credential secret. Each test mutates one property to prove the matching rule fires.
 */
function hardened(): Record<string, unknown> {
  return {
    name: 'release',
    permissions: { contents: 'read' },
    jobs: {
      build: {
        permissions: { 'id-token': 'write', contents: 'read' },
        steps: [
          { uses: 'actions/checkout@' + 'a'.repeat(40) },
          { name: 'scan', run: 'osv-scanner --format json .' },
          { name: 'sast', run: 'semgrep --sarif' },
          { name: 'sign', run: 'cosign sign --yes $IMAGE' },
        ],
      },
    },
  };
}

describe('lintPipeline — the hardening baseline', () => {
  test('a fully hardened workflow passes with no findings', () => {
    const verdict = lintPipeline(hardened());
    expect(verdict.pass).toBe(true);
    expect(verdict.findings).toHaveLength(0);
  });

  test('missing top-level permissions flags permissions-missing', () => {
    const wf = hardened();
    delete wf.permissions;
    const verdict = lintPipeline(wf);
    expect(verdict.pass).toBe(false);
    expect(verdict.findings.map((f) => f.risk)).toContain('permissions-missing');
  });

  test('write-all flags permissions-excessive', () => {
    const wf = hardened();
    wf.permissions = 'write-all';
    const verdict = lintPipeline(wf);
    expect(verdict.pass).toBe(false);
    expect(verdict.findings.map((f) => f.risk)).toContain('permissions-excessive');
  });

  test('a top-level write scope above the read ceiling flags permissions-excessive', () => {
    const wf = hardened();
    wf.permissions = { contents: 'write' };
    const verdict = lintPipeline(wf);
    expect(verdict.findings.map((f) => f.risk)).toContain('permissions-excessive');
  });

  test('a top-level id-token grant is not treated as an excessive repo-write scope', () => {
    const wf = hardened();
    wf.permissions = { contents: 'read', 'id-token': 'write' };
    const verdict = lintPipeline(wf);
    expect(verdict.pass).toBe(true);
  });

  test('no id-token permission flags oidc-missing', () => {
    const wf = hardened();
    (wf.jobs as Record<string, Record<string, unknown>>).build.permissions = { contents: 'read' };
    const verdict = lintPipeline(wf);
    expect(verdict.pass).toBe(false);
    expect(verdict.findings.map((f) => f.risk)).toContain('oidc-missing');
  });

  test('a long-lived cloud secret flags long-lived-secret', () => {
    const wf = hardened();
    (wf.jobs as Record<string, { steps: Record<string, unknown>[] }>).build.steps.push({
      name: 'push',
      env: { KEY: '${{ secrets.AWS_SECRET_ACCESS_KEY }}' },
      run: 'aws s3 cp . s3://bucket',
    });
    const verdict = lintPipeline(wf);
    expect(verdict.pass).toBe(false);
    expect(verdict.findings.map((f) => f.risk)).toContain('long-lived-secret');
  });

  test('an unpinned third-party action flags unpinned-action', () => {
    const wf = hardened();
    (wf.jobs as Record<string, { steps: Record<string, unknown>[] }>).build.steps[0] = {
      uses: 'actions/checkout@v4',
    };
    const verdict = lintPipeline(wf);
    expect(verdict.pass).toBe(false);
    expect(verdict.findings.map((f) => f.risk)).toContain('unpinned-action');
  });

  test('a local (./) or docker:// step is not required to be SHA-pinned', () => {
    const wf = hardened();
    (wf.jobs as Record<string, { steps: Record<string, unknown>[] }>).build.steps[0] = {
      uses: './.github/actions/local',
    };
    const verdict = lintPipeline(wf);
    expect(verdict.findings.map((f) => f.risk)).not.toContain('unpinned-action');
  });

  test('a required security step that is absent flags missing-required-step', () => {
    const policy: PipelinePolicy = { ...DEFAULT_PIPELINE_POLICY, requiredSteps: ['osv-scanner', 'trivy'] };
    const verdict = lintPipeline(hardened(), policy);
    expect(verdict.pass).toBe(false);
    const missing = verdict.findings.filter((f) => f.risk === 'missing-required-step');
    expect(missing).toHaveLength(1);
    expect(missing[0].detail).toContain('trivy');
  });

  test('all required steps present passes', () => {
    const policy: PipelinePolicy = {
      ...DEFAULT_PIPELINE_POLICY,
      requiredSteps: ['osv-scanner', 'semgrep', 'cosign'],
    };
    expect(lintPipeline(hardened(), policy).pass).toBe(true);
  });

  test('relaxing requirePinnedActions lets a tag-pinned action pass', () => {
    const wf = hardened();
    (wf.jobs as Record<string, { steps: Record<string, unknown>[] }>).build.steps[0] = {
      uses: 'actions/checkout@v4',
    };
    const policy: PipelinePolicy = { ...DEFAULT_PIPELINE_POLICY, requirePinnedActions: false };
    expect(lintPipeline(wf, policy).findings.map((f) => f.risk)).not.toContain('unpinned-action');
  });

  test('malformed / empty input does not throw and reports the missing baseline', () => {
    expect(() => lintPipeline(undefined)).not.toThrow();
    expect(() => lintPipeline('not a workflow')).not.toThrow();
    const verdict = lintPipeline({});
    expect(verdict.pass).toBe(false);
    expect(verdict.findings.map((f) => f.risk)).toEqual(
      expect.arrayContaining(['permissions-missing', 'oidc-missing']),
    );
  });

  test('DEFAULT_PIPELINE_POLICY is least-privilege, keyless, and pinned', () => {
    expect(DEFAULT_PIPELINE_POLICY.requireOidc).toBe(true);
    expect(DEFAULT_PIPELINE_POLICY.requirePinnedActions).toBe(true);
    expect(DEFAULT_PIPELINE_POLICY.maxTopLevelPermission).toBe('read');
  });
});

describe('requiredStepsForBindings — a declared gate auto-requires its CI step', () => {
  test('maps each declared gate to its tool token, including the optional container/DAST gates', () => {
    const steps = requiredStepsForBindings({
      supply_chain: { sca_tool: 'osv-scanner' },
      sast: { tool: 'semgrep' },
      provenance: { signer: 'cosign' },
      container_scan: { scanner: 'trivy' },
      dast: { scanner: 'zap' },
    });
    expect(steps).toEqual(['osv-scanner', 'semgrep', 'cosign', 'trivy', 'zap']);
  });

  test('an undeclared gate contributes no required step (only what the product opted into)', () => {
    expect(requiredStepsForBindings({ sast: { tool: 'codeql' } })).toEqual(['codeql']);
    expect(requiredStepsForBindings({})).toEqual([]);
    expect(requiredStepsForBindings(null)).toEqual([]);
  });

  test('falls back to the canonical tool when a declared gate names none', () => {
    // A gate declared as an empty/partial map still requires its default scanner step.
    expect(requiredStepsForBindings({ container_scan: { block_severity: 'high' }, dast: { block_risk: 'high' } })).toEqual(
      ['trivy', 'zap'],
    );
  });

  test('these feed lintPipeline: a declared gate whose step is absent from CI is a finding', () => {
    const required = requiredStepsForBindings({ container_scan: { scanner: 'trivy' } });
    const workflow = {
      permissions: { contents: 'read', 'id-token': 'write' },
      jobs: { build: { steps: [{ run: 'osv-scanner --format json' }] } },
    };
    const verdict = lintPipeline(workflow, { ...DEFAULT_PIPELINE_POLICY, requiredSteps: required });
    expect(verdict.findings.some((f) => f.risk === 'missing-required-step')).toBe(true);
  });
});
