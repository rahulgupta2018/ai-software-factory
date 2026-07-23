/**
 * eval-plan — the two-tier eval cadence policy, as one pure function.
 *
 * The Factory runs evals in two tiers (mirroring gstack): the **gate** tier blocks merges and runs
 * on every PR / push; the **periodic** tier is the heavier, non-deterministic set that runs on a
 * schedule (and on manual dispatch). Which tier runs, and whether the paid live scenarios actually
 * spawn, was decided inline in `skill-e2e.test.ts` and again in the CI YAML. Centralising it here
 * means the harness and CI agree by construction, and the policy gets a negative test per branch.
 *
 * Two knobs, resolved the same way everywhere:
 *   - tier   — `FACTORY_EVAL_TIER=periodic` selects periodic; anything else is gate.
 *   - live   — the paid scenarios run only when `FACTORY_EVAL_E2E=1` or a runner is injected.
 * `tierForEvent` maps a CI trigger to a tier so the workflows stay declarative.
 */
import type { EvalTier } from './eval-select.ts';

export interface EvalPlanInput {
  /** `FACTORY_EVAL_E2E` — '1' enables the paid live scenarios. */
  FACTORY_EVAL_E2E?: string;
  /** `FACTORY_EVAL_TIER` — 'periodic' selects the periodic tier; else gate. */
  FACTORY_EVAL_TIER?: string;
  /** True when `globalThis.__FACTORY_E2E_RUNNER__` is wired (also enables live). */
  injectedRunner?: boolean;
}

export interface EvalPlan {
  tier: EvalTier;
  /** Whether live scenarios should spawn. When false, only the free tiers run. */
  live: boolean;
  /** One-line, human-readable explanation of the resolved plan. */
  reason: string;
}

/** Resolve the eval plan from env + whether a runner was injected. Pure. */
export function resolveEvalPlan(input: EvalPlanInput = {}): EvalPlan {
  const tier: EvalTier = input.FACTORY_EVAL_TIER === 'periodic' ? 'periodic' : 'gate';
  const injected = Boolean(input.injectedRunner);
  const live = input.FACTORY_EVAL_E2E === '1' || injected;
  const reason = live
    ? `live ${tier} run (${injected ? 'injected runner' : 'FACTORY_EVAL_E2E=1'})`
    : `dry ${tier} run — no runner wired, live scenarios skipped`;
  return { tier, live, reason };
}

/**
 * CI cadence: scheduled and manual runs exercise the periodic tier; every other trigger
 * (pull_request, push, …) runs the gate tier. Keeps the workflows declarative and testable.
 */
export function tierForEvent(eventName: string): EvalTier {
  return eventName === 'schedule' || eventName === 'workflow_dispatch' ? 'periodic' : 'gate';
}
