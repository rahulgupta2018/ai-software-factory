/**
 * Tier-1 — the infra-cost report (lib/infra-cost-report.ts) behind the ADVISORY `/cost` step.
 *
 * `/cost` is measure-and-warn, not a gate, so the contract is about which ADVISORIES surface, never
 * a block: the over-budget projection, the near-budget projection, and the single-resource spike all
 * have both sides — the estimate that stays quiet and the one that raises exactly that advisory.
 * Pure functions, no clock, no network — the whole check is provable here, offline, against a
 * plain-data fixture. The committed reference report is parsed and verified too, so the fixture
 * can't drift silent.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

import {
  parseCostReport,
  verifyCostReport,
  costSummary,
  type CostReport,
} from '../lib/infra-cost-report.ts';

const REFERENCE_REPORT = new URL('./fixtures/infra-cost.md', import.meta.url).pathname;

/** A within-budget, no-spike estimate — the baseline every advisory case perturbs by one field. */
function healthyReport(overrides: Partial<CostReport> = {}): CostReport {
  return {
    cloud: 'gcp',
    iacTool: 'terraform',
    currency: 'GBP',
    monthlyBudget: 2000,
    warnThreshold: 0.8,
    spikeThreshold: 500,
    baselineMonthly: 1200,
    projectedMonthly: 1450,
    lineItems: [
      { address: 'google_sql_database_instance.main', monthlyCost: 320.5, monthlyDelta: 120 },
      { address: 'google_compute_instance.worker', monthlyCost: 210, monthlyDelta: 118.2 },
    ],
    ...overrides,
  };
}

describe('verifyCostReport — a within-budget estimate stays quiet', () => {
  test('under budget, under the warn line, no spike → within budget, no findings', () => {
    const v = verifyCostReport(healthyReport());
    expect(v.withinBudget).toBe(true);
    expect(v.findings).toEqual([]);
  });

  test('no budget set → budget rules inert, within budget', () => {
    const v = verifyCostReport(healthyReport({ monthlyBudget: 0, projectedMonthly: 99999 }));
    expect(v.withinBudget).toBe(true);
    expect(v.findings.map((f) => f.risk)).not.toContain('over-budget');
  });

  test('no spike threshold set → spike rule inert even with a big delta', () => {
    const v = verifyCostReport(
      healthyReport({
        spikeThreshold: 0,
        lineItems: [{ address: 'x', monthlyCost: 9000, monthlyDelta: 9000 }],
      }),
    );
    expect(v.findings.map((f) => f.risk)).not.toContain('cost-spike');
  });
});

describe('verifyCostReport — each advisory has a case that fires', () => {
  test('projection over budget raises over-budget (not near-budget)', () => {
    const v = verifyCostReport(healthyReport({ projectedMonthly: 2100 }));
    expect(v.withinBudget).toBe(false);
    const risks = v.findings.map((f) => f.risk);
    expect(risks).toContain('over-budget');
    expect(risks).not.toContain('near-budget');
  });

  test('projection at/above the warn line but under budget raises near-budget', () => {
    const v = verifyCostReport(healthyReport({ projectedMonthly: 1700 }));
    expect(v.withinBudget).toBe(true);
    expect(v.findings.map((f) => f.risk)).toContain('near-budget');
  });

  test('a single resource at/above the spike threshold raises cost-spike', () => {
    const v = verifyCostReport(
      healthyReport({
        lineItems: [{ address: 'google_compute_instance.gpu', monthlyCost: 800, monthlyDelta: 620 }],
      }),
    );
    expect(v.findings.map((f) => f.risk)).toContain('cost-spike');
  });

  test('projected_monthly defaults to the sum of line items when not given', () => {
    const report = parseCostReport(
      ['---', 'monthly_budget: 100', 'line_items:', '  - address: a', '    monthly_cost: 60', '  - address: b', '    monthly_cost: 70', '---', 'body'].join('\n'),
      'sum test',
    );
    expect(report.projectedMonthly).toBe(130);
    expect(verifyCostReport(report).withinBudget).toBe(false); // 130 > 100
  });
});

describe('costSummary — the operator-facing cost roll-up', () => {
  test('reports projected, baseline, delta, and spike count', () => {
    const s = costSummary(healthyReport({ projectedMonthly: 1450, baselineMonthly: 1200 }));
    expect(s.projectedMonthly).toBe(1450);
    expect(s.baselineMonthly).toBe(1200);
    expect(s.monthlyDelta).toBe(250);
    expect(s.spikes).toBe(0);
  });
});

describe('parseCostReport — the committed reference report parses and verifies', () => {
  test('the reference fixture is within budget with no advisory', () => {
    const report = parseCostReport(readFileSync(REFERENCE_REPORT, 'utf8'), 'reference cost report');
    expect(report.cloud).toBe('gcp');
    expect(report.currency).toBe('GBP');
    expect(report.monthlyBudget).toBe(2000);
    const v = verifyCostReport(report);
    expect(v.withinBudget).toBe(true);
    expect(v.findings).toEqual([]);
  });

  test('the reference report summary reflects its projection and baseline', () => {
    const report = parseCostReport(readFileSync(REFERENCE_REPORT, 'utf8'));
    const s = costSummary(report);
    expect(s.projectedMonthly).toBe(1450);
    expect(s.baselineMonthly).toBe(1200);
    expect(s.monthlyDelta).toBe(250);
  });
});
