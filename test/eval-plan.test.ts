/**
 * eval-plan — the two-tier cadence policy. Pure, so every branch gets a negative twin.
 */
import { describe, expect, test } from 'bun:test';

import { resolveEvalPlan, tierForEvent } from '../lib/eval-plan.ts';

describe('resolveEvalPlan — tier', () => {
  test('defaults to the gate tier', () => {
    expect(resolveEvalPlan().tier).toBe('gate');
    expect(resolveEvalPlan({ FACTORY_EVAL_TIER: 'gate' }).tier).toBe('gate');
  });

  test('selects periodic only for the exact value', () => {
    expect(resolveEvalPlan({ FACTORY_EVAL_TIER: 'periodic' }).tier).toBe('periodic');
    // Anything else is gate — no fuzzy matching.
    expect(resolveEvalPlan({ FACTORY_EVAL_TIER: 'PERIODIC' }).tier).toBe('gate');
    expect(resolveEvalPlan({ FACTORY_EVAL_TIER: 'weekly' }).tier).toBe('gate');
  });
});

describe('resolveEvalPlan — live', () => {
  test('dry by default (no runner, no flag)', () => {
    const plan = resolveEvalPlan();
    expect(plan.live).toBe(false);
    expect(plan.reason).toContain('dry');
    expect(plan.reason).toContain('skipped');
  });

  test('FACTORY_EVAL_E2E=1 goes live', () => {
    const plan = resolveEvalPlan({ FACTORY_EVAL_E2E: '1' });
    expect(plan.live).toBe(true);
    expect(plan.reason).toContain('FACTORY_EVAL_E2E=1');
  });

  test('any value other than "1" stays dry', () => {
    expect(resolveEvalPlan({ FACTORY_EVAL_E2E: '0' }).live).toBe(false);
    expect(resolveEvalPlan({ FACTORY_EVAL_E2E: 'true' }).live).toBe(false);
  });

  test('an injected runner goes live and is named in the reason', () => {
    const plan = resolveEvalPlan({ injectedRunner: true });
    expect(plan.live).toBe(true);
    expect(plan.reason).toContain('injected runner');
  });

  test('tier and live compose (periodic + live)', () => {
    const plan = resolveEvalPlan({ FACTORY_EVAL_TIER: 'periodic', FACTORY_EVAL_E2E: '1' });
    expect(plan.tier).toBe('periodic');
    expect(plan.live).toBe(true);
    expect(plan.reason).toContain('periodic');
  });
});

describe('tierForEvent', () => {
  test('scheduled and manual runs are periodic', () => {
    expect(tierForEvent('schedule')).toBe('periodic');
    expect(tierForEvent('workflow_dispatch')).toBe('periodic');
  });

  test('PRs and pushes are gate (negative case)', () => {
    expect(tierForEvent('pull_request')).toBe('gate');
    expect(tierForEvent('push')).toBe('gate');
    expect(tierForEvent('')).toBe('gate');
  });
});
