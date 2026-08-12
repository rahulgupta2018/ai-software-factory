/**
 * Tier-1 — the delivery-plan verifier (lib/delivery-plan.ts) behind the `/plan-delivery` gate and
 * the `/ship` increment-advance loop.
 *
 * A gate nobody watched fail is not a gate, so every rule has both sides: the well-formed backlog
 * that MUST pass and the specific defect (orphan increment, unknown goal, bad status, duplicate id
 * or order, two active increments, a backward status jump) that MUST fail. Pure functions, no
 * clock, no network — the whole policy is provable here, offline, against a plain-data fixture.
 * The committed reference PLAN.md is parsed and verified too, so the fixture can't drift silent.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

import {
  parseDeliveryPlan,
  verifyDeliveryPlan,
  verifyAdvance,
  nextIncrement,
  advanceIncrement,
  orderedIncrements,
  INCREMENT_STATUSES,
  type DeliveryPlan,
  type Increment,
} from '../lib/delivery-plan.ts';

const REFERENCE_PLAN = new URL('../examples/reference-product/PLAN.md', import.meta.url).pathname;

function inc(overrides: Partial<Increment> = {}): Increment {
  return { id: 'INC-1', title: 'First slice', order: 1, status: 'todo', goals: ['G1'], ...overrides };
}

/** A well-formed backlog — the baseline every negative case perturbs by one field. */
function healthyPlan(overrides: Partial<DeliveryPlan> = {}): DeliveryPlan {
  return {
    product: 'Test Product',
    goals: [
      { id: 'G1', summary: 'nothing falls through the cracks' },
      { id: 'G2', summary: 'a single answer to what is outstanding' },
    ],
    increments: [
      inc({ id: 'INC-1', order: 1, status: 'shipped', goals: ['G1', 'G2'] }),
      inc({ id: 'INC-2', order: 2, status: 'in-progress', goals: ['G1'] }),
      inc({ id: 'INC-3', order: 3, status: 'todo', goals: ['G2'] }),
    ],
    ...overrides,
  };
}

describe('verifyDeliveryPlan — a well-formed backlog passes', () => {
  test('every increment traces to a goal, statuses valid, one active → pass', () => {
    const v = verifyDeliveryPlan(healthyPlan());
    expect(v.pass).toBe(true);
    expect(v.findings).toEqual([]);
  });

  test('a backlog with no active increment (all todo) is valid', () => {
    const plan = healthyPlan({
      increments: [
        inc({ id: 'INC-1', order: 1, status: 'todo', goals: ['G1'] }),
        inc({ id: 'INC-2', order: 2, status: 'todo', goals: ['G2'] }),
      ],
    });
    expect(verifyDeliveryPlan(plan).pass).toBe(true);
  });
});

describe('verifyDeliveryPlan — each rule has a negative case that fails', () => {
  test('an increment tracing to no goal fails (orphan-increment)', () => {
    const plan = healthyPlan({ increments: [inc({ goals: [] })] });
    const v = verifyDeliveryPlan(plan);
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.risk === 'orphan-increment')).toBe(true);
  });

  test('an increment citing an unknown goal fails (orphan-increment)', () => {
    const plan = healthyPlan({ increments: [inc({ goals: ['G9'] })] });
    const v = verifyDeliveryPlan(plan);
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.risk === 'orphan-increment')).toBe(true);
  });

  test('an unknown status fails (invalid-status)', () => {
    const plan = healthyPlan({
      increments: [inc({ status: 'done' as Increment['status'] })],
    });
    const v = verifyDeliveryPlan(plan);
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.risk === 'invalid-status')).toBe(true);
  });

  test('a repeated increment id fails (duplicate-id)', () => {
    const plan = healthyPlan({
      increments: [inc({ id: 'INC-1', order: 1 }), inc({ id: 'INC-1', order: 2 })],
    });
    const v = verifyDeliveryPlan(plan);
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.risk === 'duplicate-id')).toBe(true);
  });

  test('a repeated order fails (duplicate-order)', () => {
    const plan = healthyPlan({
      increments: [inc({ id: 'INC-1', order: 1 }), inc({ id: 'INC-2', order: 1 })],
    });
    const v = verifyDeliveryPlan(plan);
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.risk === 'duplicate-order')).toBe(true);
  });

  test('two in-progress increments fail (ambiguous-next)', () => {
    const plan = healthyPlan({
      increments: [
        inc({ id: 'INC-1', order: 1, status: 'in-progress' }),
        inc({ id: 'INC-2', order: 2, status: 'in-progress' }),
      ],
    });
    const v = verifyDeliveryPlan(plan);
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.risk === 'ambiguous-next')).toBe(true);
  });
});

describe('nextIncrement — what /ship binds next', () => {
  test('the single active increment when one is in-progress', () => {
    expect(nextIncrement(healthyPlan())?.id).toBe('INC-2');
  });

  test('the lowest-order todo when none is active', () => {
    const plan = healthyPlan({
      increments: [
        inc({ id: 'INC-1', order: 1, status: 'shipped', goals: ['G1'] }),
        inc({ id: 'INC-2', order: 3, status: 'todo', goals: ['G1'] }),
        inc({ id: 'INC-3', order: 2, status: 'todo', goals: ['G2'] }),
      ],
    });
    expect(nextIncrement(plan)?.id).toBe('INC-3');
  });

  test('null when the backlog is fully shipped (drained)', () => {
    const plan = healthyPlan({
      increments: [
        inc({ id: 'INC-1', order: 1, status: 'shipped', goals: ['G1'] }),
        inc({ id: 'INC-2', order: 2, status: 'shipped', goals: ['G2'] }),
      ],
    });
    expect(nextIncrement(plan)).toBeNull();
  });
});

describe('advanceIncrement + verifyAdvance — the /ship advance loop', () => {
  test('advancing flips exactly one increment and records actual tokens', () => {
    const before = healthyPlan();
    const after = advanceIncrement(before, 'INC-2', 'shipped', 1_400_000);
    const changed = after.increments.filter(
      (a) => a.status !== before.increments.find((b) => b.id === a.id)?.status,
    );
    expect(changed.map((c) => c.id)).toEqual(['INC-2']);
    expect(after.increments.find((i) => i.id === 'INC-2')?.actualTokens).toBe(1_400_000);
    // The input plan is untouched.
    expect(before.increments.find((i) => i.id === 'INC-2')?.status).toBe('in-progress');
  });

  test('one increment ships per loop and the next binds', () => {
    let plan = healthyPlan({
      increments: [
        inc({ id: 'INC-1', order: 1, status: 'in-progress', goals: ['G1'] }),
        inc({ id: 'INC-2', order: 2, status: 'todo', goals: ['G2'] }),
        inc({ id: 'INC-3', order: 3, status: 'todo', goals: ['G1'] }),
      ],
    });
    expect(nextIncrement(plan)?.id).toBe('INC-1');

    plan = advanceIncrement(plan, 'INC-1', 'shipped');
    plan = advanceIncrement(plan, 'INC-2', 'in-progress');
    expect(nextIncrement(plan)?.id).toBe('INC-2');

    plan = advanceIncrement(plan, 'INC-2', 'shipped');
    plan = advanceIncrement(plan, 'INC-3', 'in-progress');
    expect(nextIncrement(plan)?.id).toBe('INC-3');
  });

  test('a forward-only transition passes', () => {
    const before = healthyPlan();
    const after = advanceIncrement(before, 'INC-2', 'shipped');
    expect(verifyAdvance(before, after).pass).toBe(true);
  });

  test('a backward status jump without a re-open fails (backward-jump)', () => {
    const before = healthyPlan();
    const after = advanceIncrement(before, 'INC-1', 'todo'); // shipped → todo
    const v = verifyAdvance(before, after);
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.risk === 'backward-jump')).toBe(true);
  });

  test('a deliberate re-open (reopened flag) is allowed to move backward', () => {
    const before = healthyPlan();
    const after: DeliveryPlan = {
      ...before,
      increments: before.increments.map((i) =>
        i.id === 'INC-1' ? { ...i, status: 'in-progress', reopened: true } : i,
      ),
    };
    expect(verifyAdvance(before, after).pass).toBe(true);
  });
});

describe('parseDeliveryPlan — the committed reference PLAN.md is well-formed', () => {
  test('parses and verifies against its own PRD goals', () => {
    const plan = parseDeliveryPlan(readFileSync(REFERENCE_PLAN, 'utf-8'));
    expect(plan.product.length).toBeGreaterThan(0);
    expect(plan.goals.length).toBeGreaterThan(0);
    expect(plan.increments.length).toBeGreaterThan(0);
    const v = verifyDeliveryPlan(plan);
    expect(v.findings).toEqual([]);
    expect(v.pass).toBe(true);
  });

  test('every increment status is a known lifecycle value and orders are contiguous', () => {
    const plan = parseDeliveryPlan(readFileSync(REFERENCE_PLAN, 'utf-8'));
    for (const i of plan.increments) {
      expect(INCREMENT_STATUSES).toContain(i.status);
    }
    const orders = orderedIncrements(plan).map((i) => i.order);
    expect(orders).toEqual(orders.map((_, idx) => idx + 1));
  });
});
