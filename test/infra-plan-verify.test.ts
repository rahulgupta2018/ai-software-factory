/**
 * Tier-1 — the infra-plan verifier (lib/infra-plan-verify.ts) behind the `/provision` hard gate.
 *
 * A gate nobody watched fail is not a gate, so every rule has both sides: the safe plan that MUST
 * apply and the specific hazard (a protected resource destroyed or replaced without consent, a
 * long-lived downloadable credential, a raw secret in state, a high-severity policy finding) that
 * MUST block. Pure functions, no clock, no network — the whole apply gate is provable here,
 * offline, against a plain-data fixture. The committed reference plan is parsed and verified too,
 * so the fixture can't drift silent.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

import {
  parseInfraPlan,
  verifyInfraPlan,
  planSummary,
  type InfraPlan,
  type ResourceChange,
} from '../lib/infra-plan-verify.ts';

const REFERENCE_PLAN = new URL('./fixtures/infra-plan.md', import.meta.url).pathname;

function change(overrides: Partial<ResourceChange> = {}): ResourceChange {
  return { address: 'google_storage_bucket.assets', type: 'google_storage_bucket', actions: ['create'], ...overrides };
}

/** A safe-to-apply plan — the baseline every negative case perturbs by one field. */
function healthyPlan(overrides: Partial<InfraPlan> = {}): InfraPlan {
  return {
    cloud: 'gcp',
    iacTool: 'terraform',
    protectedResources: ['google_sql_database_instance.main'],
    consentToDestroy: false,
    changes: [
      change({ address: 'google_storage_bucket.assets', type: 'google_storage_bucket', actions: ['create'] }),
      change({ address: 'google_sql_database_instance.main', type: 'google_sql_database_instance', actions: ['update'] }),
    ],
    policyFindings: [
      { id: 'tfsec-low', severity: 'low', resource: 'google_storage_bucket.assets', detail: 'advisory' },
    ],
    ...overrides,
  };
}

describe('verifyInfraPlan — a safe plan applies', () => {
  test('no protected destroy/replace, no key, no secret, no high finding → pass', () => {
    const v = verifyInfraPlan(healthyPlan());
    expect(v.pass).toBe(true);
    expect(v.findings).toEqual([]);
  });

  test('destroying a protected resource WITH explicit consent passes', () => {
    const plan = healthyPlan({
      consentToDestroy: true,
      changes: [
        change({ address: 'google_sql_database_instance.main', type: 'google_sql_database_instance', actions: ['delete'] }),
      ],
    });
    expect(verifyInfraPlan(plan).pass).toBe(true);
  });

  test('destroying an UNprotected resource without consent passes', () => {
    const plan = healthyPlan({
      changes: [change({ address: 'google_storage_bucket.scratch', type: 'google_storage_bucket', actions: ['delete'] })],
    });
    expect(verifyInfraPlan(plan).pass).toBe(true);
  });
});

describe('verifyInfraPlan — each rule has a negative case that blocks', () => {
  test('destroying a protected resource without consent blocks (destroy-protected)', () => {
    const plan = healthyPlan({
      changes: [
        change({ address: 'google_sql_database_instance.main', type: 'google_sql_database_instance', actions: ['delete'] }),
      ],
    });
    const v = verifyInfraPlan(plan);
    expect(v.pass).toBe(false);
    expect(v.findings.map((f) => f.risk)).toContain('destroy-protected');
  });

  test('replacing a protected resource without consent blocks (replace-protected)', () => {
    const plan = healthyPlan({
      changes: [
        change({ address: 'google_sql_database_instance.main', type: 'google_sql_database_instance', actions: ['delete', 'create'] }),
      ],
    });
    const v = verifyInfraPlan(plan);
    expect(v.pass).toBe(false);
    expect(v.findings.map((f) => f.risk)).toContain('replace-protected');
  });

  test('a resource protected BY TYPE is guarded too', () => {
    const plan = healthyPlan({
      protectedResources: ['google_storage_bucket'],
      changes: [change({ address: 'google_storage_bucket.tf_state', type: 'google_storage_bucket', actions: ['delete'] })],
    });
    expect(verifyInfraPlan(plan).findings.map((f) => f.risk)).toContain('destroy-protected');
  });

  test('creating a long-lived downloadable credential blocks (long-lived-key)', () => {
    const plan = healthyPlan({
      changes: [change({ address: 'google_service_account_key.ci', type: 'google_service_account_key', actions: ['create'] })],
    });
    const v = verifyInfraPlan(plan);
    expect(v.pass).toBe(false);
    expect(v.findings.map((f) => f.risk)).toContain('long-lived-key');
  });

  test('writing a raw secret into state blocks (secret-in-state)', () => {
    const plan = healthyPlan({
      changes: [change({ address: 'google_sql_user.app', type: 'google_sql_user', actions: ['create'], secretAttributes: ['password'] })],
    });
    const v = verifyInfraPlan(plan);
    expect(v.pass).toBe(false);
    expect(v.findings.map((f) => f.risk)).toContain('secret-in-state');
  });

  test('a high-severity policy finding blocks (policy-high)', () => {
    const plan = healthyPlan({
      policyFindings: [
        { id: 'tfsec-public-bucket', severity: 'high', resource: 'google_storage_bucket.assets', detail: 'public ACL' },
      ],
    });
    const v = verifyInfraPlan(plan);
    expect(v.pass).toBe(false);
    expect(v.findings.map((f) => f.risk)).toContain('policy-high');
  });

  test('a critical policy finding blocks too', () => {
    const plan = healthyPlan({
      policyFindings: [
        { id: 'tfsec-open-ssh', severity: 'critical', resource: 'google_compute_firewall.ssh', detail: '0.0.0.0/0 to 22' },
      ],
    });
    expect(verifyInfraPlan(plan).findings.map((f) => f.risk)).toContain('policy-high');
  });

  test('a low/medium policy finding does NOT block', () => {
    const plan = healthyPlan({
      policyFindings: [
        { id: 'tfsec-logging', severity: 'medium', resource: 'google_storage_bucket.assets', detail: 'no access log' },
      ],
    });
    expect(verifyInfraPlan(plan).pass).toBe(true);
  });

  test('consent waives destroy/replace but NEVER the key/secret/policy rules', () => {
    const plan = healthyPlan({
      consentToDestroy: true,
      changes: [change({ address: 'google_service_account_key.ci', type: 'google_service_account_key', actions: ['create'] })],
      policyFindings: [{ id: 'tfsec-open-ssh', severity: 'critical', resource: 'x', detail: 'open' }],
    });
    const v = verifyInfraPlan(plan);
    expect(v.pass).toBe(false);
    const risks = v.findings.map((f) => f.risk);
    expect(risks).toContain('long-lived-key');
    expect(risks).toContain('policy-high');
  });
});

describe('planSummary — the operator-facing blast-radius roll-up', () => {
  test('counts creates, updates, destroys, replaces, protected touched, high findings', () => {
    const plan = healthyPlan({
      consentToDestroy: true,
      changes: [
        change({ address: 'a', type: 'google_storage_bucket', actions: ['create'] }),
        change({ address: 'b', type: 'google_storage_bucket', actions: ['update'] }),
        change({ address: 'google_sql_database_instance.main', type: 'google_sql_database_instance', actions: ['delete'] }),
        change({ address: 'c', type: 'google_storage_bucket', actions: ['delete', 'create'] }),
      ],
      policyFindings: [{ id: 'h', severity: 'high', resource: 'c', detail: 'x' }],
    });
    const s = planSummary(plan);
    expect(s.creates).toBe(1);
    expect(s.updates).toBe(1);
    expect(s.destroys).toBe(1);
    expect(s.replaces).toBe(1);
    expect(s.protectedTouched).toBe(1); // only the SQL instance is protected
    expect(s.highPolicyFindings).toBe(1);
  });
});

describe('parseInfraPlan — the committed reference plan parses and verifies', () => {
  test('the reference fixture is a safe plan', () => {
    const plan = parseInfraPlan(readFileSync(REFERENCE_PLAN, 'utf8'), 'reference infra plan');
    expect(plan.cloud).toBe('gcp');
    expect(plan.iacTool).toBe('terraform');
    expect(plan.protectedResources.length).toBeGreaterThan(0);
    const v = verifyInfraPlan(plan);
    expect(v.pass).toBe(true);
    expect(v.findings).toEqual([]);
  });

  test('the reference plan summary reflects its four changes', () => {
    const plan = parseInfraPlan(readFileSync(REFERENCE_PLAN, 'utf8'));
    const s = planSummary(plan);
    expect(s.creates).toBe(3);
    expect(s.updates).toBe(1);
    expect(s.destroys).toBe(0);
    expect(s.replaces).toBe(0);
  });
});
