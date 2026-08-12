/**
 * Infra-cost report — the mechanical half of the ADVISORY `/cost` step.
 *
 * `/plan-infra` designs the infrastructure and `/provision` applies it; between them the operator
 * runs a cost estimator (`infracost breakdown`/`diff` → JSON) against the plan. `/cost` reads that
 * estimate and answers one question: does the projected monthly spend sit inside the product's
 * budget, and did any single resource spike? This is a MEASURE-AND-WARN control (the cost analogue
 * of the token-budget benchmark), NOT a hard gate — a plan can be over budget and still, with the
 * operator's eyes open, be the right call. So this module reports; it never blocks.
 *
 * It owns the CHECK, not the estimate: given a cost observation (the projected monthly total, the
 * baseline it changes from, the per-resource line items, and the budget + thresholds from
 * `tech_bindings.infra.cost_budget`), it decides which advisories to surface. It never talks to a
 * cloud, holds no state, reads no keys, and calls no clock — the estimate is gathered by the `/cost`
 * skill (`infracost` → frontmatter) and verified here.
 *
 * Pure by design (no node imports beyond the shared frontmatter parser, no network, no clock) so the
 * whole check is provable in `bun test` with a negative case per rule — the over-budget projection,
 * the near-budget projection, the single-resource spike — all offline against a plain-data fixture.
 */
import { parseFrontmatter } from './frontmatter.ts';

/** One estimated resource line item (an `infracost` breakdown row, the subset the check reasons about). */
export interface CostLineItem {
  /** Full address, e.g. `google_sql_database_instance.main`. */
  address: string;
  /** Projected monthly cost of this resource, in `currency`. */
  monthlyCost: number;
  /** Change in this resource's monthly cost versus the baseline (a new resource: == monthlyCost). */
  monthlyDelta: number;
}

/** A parsed cost observation: the projection, the budget, and the line items. */
export interface CostReport {
  cloud: string;
  iacTool: string;
  currency: string;
  /** Monthly budget ceiling from `tech_bindings.infra.cost_budget.monthly`. 0 = no budget set. */
  monthlyBudget: number;
  /** Fraction of the budget (0..1) at which to warn before it is exceeded. */
  warnThreshold: number;
  /** Per-resource monthly delta (in `currency`) at or above which to flag a spike. 0 = rule inert. */
  spikeThreshold: number;
  /** Prior projected monthly total this plan changes from. */
  baselineMonthly: number;
  /** New projected monthly total. If 0 and line items exist, it is summed from them. */
  projectedMonthly: number;
  /** The estimated resource line items. */
  lineItems: CostLineItem[];
}

/** Why the cost check raises an advisory — drives the finding text `/cost` shows. */
export type CostRisk = 'over-budget' | 'near-budget' | 'cost-spike';

/** One advisory finding (never blocking — `/cost` is measure-and-warn). */
export interface CostFinding {
  rule: string;
  risk: CostRisk;
  detail: string;
}

/** Verdict for a cost estimate: whether it sits within budget, plus every advisory. */
export interface CostVerdict {
  /** True when the projected monthly total is at or below the budget (or no budget is set). */
  withinBudget: boolean;
  /** The projected monthly total the verdict is about. */
  projectedMonthly: number;
  findings: CostFinding[];
}

// ── Parsing ──────────────────────────────────────────────────────────────────

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function asNumber(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function coerceLineItem(raw: unknown): CostLineItem {
  const c = (raw ?? {}) as Record<string, unknown>;
  const monthlyCost = asNumber(c.monthly_cost);
  return {
    address: asString(c.address),
    monthlyCost,
    // A new resource has no prior cost, so its delta defaults to its full monthly cost.
    monthlyDelta: 'monthly_delta' in c ? asNumber(c.monthly_delta) : monthlyCost,
  };
}

/**
 * Parse a cost observation into a CostReport. The frontmatter is the machine source of truth (the
 * same frontmatter-is-machine-readable pattern as the plan verifier); the body is prose the check
 * ignores. Throws only when the frontmatter block is missing or malformed. A missing
 * `warn_threshold` defaults to 0.8; a missing `spike_threshold` leaves the spike rule inert (0).
 */
export function parseCostReport(text: string, label = 'cost report'): CostReport {
  const { data } = parseFrontmatter(text, label);
  const lineItems = Array.isArray(data.line_items) ? data.line_items.map(coerceLineItem) : [];
  const summed = lineItems.reduce((total, item) => total + item.monthlyCost, 0);
  const projected = asNumber(data.projected_monthly);
  return {
    cloud: asString(data.cloud),
    iacTool: asString(data.iac_tool),
    currency: asString(data.currency, 'USD'),
    monthlyBudget: asNumber(data.monthly_budget),
    warnThreshold: 'warn_threshold' in data ? asNumber(data.warn_threshold, 0.8) : 0.8,
    spikeThreshold: asNumber(data.spike_threshold),
    baselineMonthly: asNumber(data.baseline_monthly),
    projectedMonthly: projected > 0 ? projected : summed,
    lineItems,
  };
}

// ── Verification (advisory) ──────────────────────────────────────────────────

/**
 * Check a cost estimate against the budget. Advisories (never blocking):
 *   - over-budget — the projected monthly total exceeds the budget.
 *   - near-budget — the projected total is at/above `warnThreshold` of the budget (but not over).
 *   - cost-spike  — a single resource's monthly delta is at/above `spikeThreshold`.
 * With no budget set (`monthlyBudget <= 0`) the budget rules are inert and `withinBudget` is true.
 * With no `spikeThreshold` set (`<= 0`) the spike rule is inert.
 */
export function verifyCostReport(report: CostReport): CostVerdict {
  const findings: CostFinding[] = [];
  const { monthlyBudget, warnThreshold, projectedMonthly, currency } = report;
  const hasBudget = monthlyBudget > 0;
  const withinBudget = !hasBudget || projectedMonthly <= monthlyBudget;

  if (hasBudget) {
    if (projectedMonthly > monthlyBudget) {
      findings.push({
        rule: 'over-budget',
        risk: 'over-budget',
        detail: `projected ${currency} ${projectedMonthly.toFixed(2)}/mo exceeds the ${currency} ${monthlyBudget.toFixed(2)}/mo budget`,
      });
    } else if (projectedMonthly >= warnThreshold * monthlyBudget) {
      const pct = Math.round((projectedMonthly / monthlyBudget) * 100);
      findings.push({
        rule: 'near-budget',
        risk: 'near-budget',
        detail: `projected ${currency} ${projectedMonthly.toFixed(2)}/mo is ${pct}% of the ${currency} ${monthlyBudget.toFixed(2)}/mo budget (warn at ${Math.round(warnThreshold * 100)}%)`,
      });
    }
  }

  if (report.spikeThreshold > 0) {
    for (const item of report.lineItems) {
      if (item.monthlyDelta >= report.spikeThreshold) {
        findings.push({
          rule: 'cost-spike',
          risk: 'cost-spike',
          detail: `'${item.address}' adds ${currency} ${item.monthlyDelta.toFixed(2)}/mo (spike threshold ${currency} ${report.spikeThreshold.toFixed(2)}/mo)`,
        });
      }
    }
  }

  return { withinBudget, projectedMonthly, findings };
}

// ── Cost summary ──────────────────────────────────────────────────────────────

/** A compact roll-up the `/cost` skill can render for the operator. */
export interface CostSummary {
  projectedMonthly: number;
  baselineMonthly: number;
  /** Projected minus baseline — the monthly change this plan introduces. */
  monthlyDelta: number;
  /** Number of line items whose delta meets the spike threshold (0 when the rule is inert). */
  spikes: number;
}

/** Roll up the cost delta — the operator-facing dashboard before the advisory. */
export function costSummary(report: CostReport): CostSummary {
  const spikes =
    report.spikeThreshold > 0
      ? report.lineItems.filter((i) => i.monthlyDelta >= report.spikeThreshold).length
      : 0;
  return {
    projectedMonthly: report.projectedMonthly,
    baselineMonthly: report.baselineMonthly,
    monthlyDelta: report.projectedMonthly - report.baselineMonthly,
    spikes,
  };
}
