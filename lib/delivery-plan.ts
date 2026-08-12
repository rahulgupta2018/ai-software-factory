/**
 * Delivery-plan verifier — the mechanical half of the incremental-tracking gate `/plan-delivery`
 * owns and `/ship` advances.
 *
 * The Factory decomposes a PRD into an ordered backlog of shippable INCREMENTS, recorded in a
 * committed, human-owned `PLAN.md` (a sibling of PRD.md). Each increment traces back to a PRD goal,
 * carries an effort + estimated-token field, and moves through a fixed lifecycle
 * (todo → in-progress → shipped). `/ship` flips exactly one increment to `shipped` per loop and
 * binds the next; PLAN.md doubles as a cost ledger (estimated vs actual tokens per increment).
 *
 * This module owns the CHECK, not the workflow: given the parsed plan it decides whether the
 * backlog is well-formed (every increment traces to a real goal, statuses are valid, ids and order
 * are unique, at most one increment is active) and, across two versions, whether the plan only
 * advanced forward (no silent backward status jump without a recorded re-open).
 *
 * Pure by design (no node imports beyond the shared frontmatter parser, no network, no clock) so
 * the whole policy is provable in `bun test` with a negative case per rule — the orphan increment
 * that must fail, the two-active backlog that must fail, the shipped→todo regression that must
 * fail — all offline against a plain-data fixture. The PLAN.md text is parsed here; the file is
 * written elsewhere (the `/plan-delivery` skill).
 */
import { parseFrontmatter } from './frontmatter.ts';

/** The fixed increment lifecycle, in forward order. */
export const INCREMENT_STATUSES = ['todo', 'in-progress', 'shipped'] as const;
export type IncrementStatus = (typeof INCREMENT_STATUSES)[number];

/** Forward rank of each status — used to detect a backward jump across plan versions. */
export const STATUS_RANK: Record<IncrementStatus, number> = {
  todo: 0,
  'in-progress': 1,
  shipped: 2,
};

/** A PRD goal an increment can trace to. `id` is the traceability anchor; `summary` is for humans. */
export interface PrdGoal {
  id: string;
  summary: string;
}

/** One shippable slice of the backlog. */
export interface Increment {
  id: string;
  title: string;
  /** Position in the backlog — must be unique and drive the "what's next" ordering. */
  order: number;
  /** Lifecycle state. An unrecognised value is caught as a finding, not thrown. */
  status: IncrementStatus;
  /** PRD goal ids this increment serves. Empty = orphan (a finding). */
  goals: string[];
  /** Human-team → AI-assisted effort estimate, free text (e.g. "~1 day → ~2 hrs"). */
  effort?: string;
  /** Estimated token consumption for this increment (the cost-ledger estimate). */
  estTokens?: number;
  /** Actual token consumption, filled in from run.json once the increment ships. */
  actualTokens?: number;
  /** Set true when an already-shipped increment is deliberately re-opened for more work. */
  reopened?: boolean;
}

/** A parsed PLAN.md: the product, its PRD goals, and the ordered increment backlog. */
export interface DeliveryPlan {
  product: string;
  goals: PrdGoal[];
  increments: Increment[];
}

/** Why a plan fails the delivery gate — drives the finding text `/plan-delivery` shows. */
export type DeliveryRisk =
  | 'orphan-increment'
  | 'invalid-status'
  | 'duplicate-id'
  | 'duplicate-order'
  | 'ambiguous-next'
  | 'backward-jump';

/** One failed policy rule. */
export interface DeliveryFinding {
  rule: string;
  risk: DeliveryRisk;
  detail: string;
}

/** Verdict for a plan (or a plan transition): whether it satisfies every rule. */
export interface DeliveryVerdict {
  pass: boolean;
  findings: DeliveryFinding[];
}

// ── Parsing ──────────────────────────────────────────────────────────────────

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function asNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function coerceGoal(raw: unknown): PrdGoal {
  const g = (raw ?? {}) as Record<string, unknown>;
  return { id: asString(g.id), summary: asString(g.summary) };
}

function coerceIncrement(raw: unknown, index: number): Increment {
  const i = (raw ?? {}) as Record<string, unknown>;
  return {
    id: asString(i.id),
    title: asString(i.title),
    order: asNumber(i.order) ?? index + 1,
    // Cast is deliberate: an unrecognised status is validated as a finding, never thrown here.
    status: asString(i.status, 'todo') as IncrementStatus,
    goals: asStringArray(i.goals),
    effort: typeof i.effort === 'string' ? i.effort : undefined,
    estTokens: asNumber(i.est_tokens),
    actualTokens: asNumber(i.actual_tokens),
    reopened: i.reopened === true,
  };
}

/**
 * Parse PLAN.md into a DeliveryPlan. The frontmatter is the machine source of truth (the same
 * frontmatter-is-machine-readable pattern as PRD.md / stack.yaml); the body is prose the verifier
 * ignores. Throws only when the frontmatter block itself is missing or malformed.
 */
export function parseDeliveryPlan(text: string, label = 'PLAN.md'): DeliveryPlan {
  const { data } = parseFrontmatter(text, label);
  return {
    product: asString(data.product),
    goals: Array.isArray(data.prd_goals) ? data.prd_goals.map(coerceGoal) : [],
    increments: Array.isArray(data.increments)
      ? data.increments.map((inc, idx) => coerceIncrement(inc, idx))
      : [],
  };
}

// ── Verification ─────────────────────────────────────────────────────────────

function duplicates<T>(values: readonly T[]): T[] {
  const seen = new Set<T>();
  const dupes = new Set<T>();
  for (const v of values) {
    if (seen.has(v)) dupes.add(v);
    seen.add(v);
  }
  return [...dupes];
}

/**
 * Verify a plan is well-formed. Rules:
 *   - goal-trace   — every increment cites at least one PRD goal, and every cited goal exists.
 *   - valid-status — every status is one of the fixed lifecycle values.
 *   - unique-id    — increment ids are unique.
 *   - unique-order — increment orders are unique (an ambiguous backlog has no defined "next").
 *   - single-active — at most one increment is `in-progress`.
 */
export function verifyDeliveryPlan(plan: DeliveryPlan): DeliveryVerdict {
  const findings: DeliveryFinding[] = [];
  const goalIds = new Set(plan.goals.map((g) => g.id).filter((id) => id.length > 0));

  for (const inc of plan.increments) {
    if (inc.goals.length === 0) {
      findings.push({
        rule: 'goal-trace',
        risk: 'orphan-increment',
        detail: `increment '${inc.id || inc.title}' traces to no PRD goal`,
      });
    }
    for (const g of inc.goals) {
      if (!goalIds.has(g)) {
        findings.push({
          rule: 'goal-trace',
          risk: 'orphan-increment',
          detail: `increment '${inc.id || inc.title}' cites unknown PRD goal '${g}'`,
        });
      }
    }
  }

  for (const inc of plan.increments) {
    if (!INCREMENT_STATUSES.includes(inc.status)) {
      findings.push({
        rule: 'valid-status',
        risk: 'invalid-status',
        detail: `increment '${inc.id}' has unknown status '${inc.status}'`,
      });
    }
  }

  for (const id of duplicates(plan.increments.map((i) => i.id))) {
    findings.push({ rule: 'unique-id', risk: 'duplicate-id', detail: `increment id '${id}' is repeated` });
  }

  for (const order of duplicates(plan.increments.map((i) => i.order))) {
    findings.push({
      rule: 'unique-order',
      risk: 'duplicate-order',
      detail: `increment order ${order} is repeated; the backlog order is ambiguous`,
    });
  }

  const active = plan.increments.filter((i) => i.status === 'in-progress');
  if (active.length > 1) {
    findings.push({
      rule: 'single-active',
      risk: 'ambiguous-next',
      detail: `${active.length} increments are in-progress (${active
        .map((i) => i.id)
        .join(', ')}); at most one may be active`,
    });
  }

  return { pass: findings.length === 0, findings };
}

// ── Navigation & transitions ──────────────────────────────────────────────────

/** The backlog sorted by `order` — the canonical delivery sequence. */
export function orderedIncrements(plan: DeliveryPlan): Increment[] {
  return [...plan.increments].sort((a, b) => a.order - b.order);
}

/**
 * The increment `/ship` should bind next: the single active (`in-progress`) increment if there is
 * one, otherwise the lowest-order `todo`. Null when the backlog is fully shipped (drained).
 */
export function nextIncrement(plan: DeliveryPlan): Increment | null {
  const ordered = orderedIncrements(plan);
  const active = ordered.find((i) => i.status === 'in-progress');
  if (active) return active;
  return ordered.find((i) => i.status === 'todo') ?? null;
}

/**
 * Pure transition the `/ship` loop uses: set one increment's status (and, once shipped, its actual
 * token count from run.json). Returns a new plan; the input is untouched. Unknown id → no change.
 */
export function advanceIncrement(
  plan: DeliveryPlan,
  id: string,
  to: IncrementStatus,
  actualTokens?: number,
): DeliveryPlan {
  return {
    ...plan,
    increments: plan.increments.map((inc) =>
      inc.id === id
        ? { ...inc, status: to, ...(actualTokens !== undefined ? { actualTokens } : {}) }
        : inc,
    ),
  };
}

/**
 * Verify a plan only advanced forward between two committed versions. An increment whose status
 * moved backward (e.g. shipped → todo) fails unless it carries a `reopened: true` flag recording a
 * deliberate re-open. Increments absent from `prev` (newly added) are ignored.
 */
export function verifyAdvance(prev: DeliveryPlan, next: DeliveryPlan): DeliveryVerdict {
  const findings: DeliveryFinding[] = [];
  const before = new Map(prev.increments.map((i) => [i.id, i]));

  for (const inc of next.increments) {
    const was = before.get(inc.id);
    if (!was) continue;
    const fromRank = STATUS_RANK[was.status];
    const toRank = STATUS_RANK[inc.status];
    if (fromRank === undefined || toRank === undefined) continue; // invalid-status caught elsewhere
    if (toRank < fromRank && !inc.reopened) {
      findings.push({
        rule: 'monotonic-advance',
        risk: 'backward-jump',
        detail: `increment '${inc.id}' moved ${was.status} → ${inc.status} without a recorded re-open`,
      });
    }
  }

  return { pass: findings.length === 0, findings };
}
