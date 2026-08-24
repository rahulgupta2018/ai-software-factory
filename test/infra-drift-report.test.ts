/**
 * Tier-1 — the infra-drift report (lib/infra-drift-report.ts) behind the `/drift` step.
 *
 * `/drift` produces the infrastructure analogue of a `/qa` bug-list, so every drift class has both
 * sides: the in-sync estate that yields nothing, and the specific divergence (a resource modified
 * out of band, one deleted out of band, an unmanaged shadow resource) that yields exactly that
 * finding. Pure functions, no clock, no network — the whole check is provable here, offline, against
 * a plain-data fixture. The committed reference report is parsed and verified too, so the fixture
 * can't drift silent.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

import {
  parseDriftReport,
  verifyDriftReport,
  driftSummary,
  type DriftReport,
  type DriftResource,
} from '../lib/infra-drift-report.ts';

const REFERENCE_REPORT = new URL('./fixtures/infra-drift.md', import.meta.url).pathname;

function resource(overrides: Partial<DriftResource> = {}): DriftResource {
  return {
    address: 'google_compute_firewall.allow_ssh',
    type: 'google_compute_firewall',
    driftType: 'modified',
    changedAttributes: [],
    securitySensitive: false,
    ...overrides,
  };
}

/** An in-sync estate — the baseline every drift case perturbs by one resource. */
function inSyncReport(overrides: Partial<DriftReport> = {}): DriftReport {
  return { cloud: 'gcp', iacTool: 'terraform', environment: 'prod', resources: [], ...overrides };
}

describe('verifyDriftReport — an in-sync estate has no drift', () => {
  test('no resources → not drifted, no findings', () => {
    const v = verifyDriftReport(inSyncReport());
    expect(v.drifted).toBe(false);
    expect(v.findings).toEqual([]);
  });
});

describe('verifyDriftReport — each drift class has a case that fires', () => {
  test('a resource modified out of band raises resource-modified', () => {
    const v = verifyDriftReport(
      inSyncReport({
        resources: [resource({ driftType: 'modified', changedAttributes: ['source_ranges'] })],
      }),
    );
    expect(v.drifted).toBe(true);
    const finding = v.findings[0];
    expect(finding.risk).toBe('resource-modified');
    expect(finding.detail).toContain('source_ranges');
  });

  test('a resource deleted out of band raises resource-deleted', () => {
    const v = verifyDriftReport(
      inSyncReport({ resources: [resource({ driftType: 'deleted' })] }),
    );
    expect(v.findings.map((f) => f.risk)).toContain('resource-deleted');
  });

  test('an unmanaged shadow resource raises unmanaged-resource', () => {
    const v = verifyDriftReport(
      inSyncReport({
        resources: [resource({ address: 'google_storage_bucket.shadow', type: 'google_storage_bucket', driftType: 'unmanaged' })],
      }),
    );
    const finding = v.findings.find((f) => f.risk === 'unmanaged-resource');
    expect(finding).toBeDefined();
    expect(finding?.detail).toContain('prod');
  });

  test('security-sensitive drift is carried through and marked', () => {
    const v = verifyDriftReport(
      inSyncReport({
        resources: [resource({ driftType: 'modified', changedAttributes: ['source_ranges'], securitySensitive: true })],
      }),
    );
    expect(v.findings[0].securitySensitive).toBe(true);
    expect(v.findings[0].detail).toContain('SECURITY-SENSITIVE');
  });

  test('security-sensitive drift is returned FIRST, ahead of non-sensitive drift (enforced here, not in prose)', () => {
    const v = verifyDriftReport(
      inSyncReport({
        resources: [
          resource({ address: 'bucket.assets', driftType: 'modified', securitySensitive: false }),
          resource({ address: 'firewall.ssh', driftType: 'modified', changedAttributes: ['source_ranges'], securitySensitive: true }),
          resource({ address: 'label.env', driftType: 'modified', securitySensitive: false }),
        ],
      }),
    );
    // The security-sensitive firewall drift leads, even though it was listed second in the input.
    expect(v.findings[0].securitySensitive).toBe(true);
    expect(v.findings[0].detail).toContain('firewall.ssh');
    // Non-sensitive findings keep their relative input order after the sensitive ones.
    expect(v.findings.map((f) => f.securitySensitive)).toEqual([true, false, false]);
    expect(v.findings[1].detail).toContain('bucket.assets');
    expect(v.findings[2].detail).toContain('label.env');
  });
});

describe('driftSummary — the operator-facing drift roll-up', () => {
  test('counts modified, deleted, unmanaged, and security-sensitive', () => {
    const s = driftSummary(
      inSyncReport({
        resources: [
          resource({ address: 'a', driftType: 'modified', securitySensitive: true }),
          resource({ address: 'b', driftType: 'deleted' }),
          resource({ address: 'c', driftType: 'unmanaged' }),
          resource({ address: 'd', driftType: 'unmanaged', securitySensitive: true }),
        ],
      }),
    );
    expect(s.modified).toBe(1);
    expect(s.deleted).toBe(1);
    expect(s.unmanaged).toBe(2);
    expect(s.securitySensitive).toBe(2);
  });
});

describe('parseDriftReport — the committed reference report parses and verifies', () => {
  test('the reference fixture is an in-sync estate', () => {
    const report = parseDriftReport(readFileSync(REFERENCE_REPORT, 'utf8'), 'reference drift report');
    expect(report.cloud).toBe('gcp');
    expect(report.environment).toBe('prod');
    const v = verifyDriftReport(report);
    expect(v.drifted).toBe(false);
    expect(v.findings).toEqual([]);
  });
});
