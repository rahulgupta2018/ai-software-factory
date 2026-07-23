/**
 * Tier-2 — LLM-as-judge harness (engine).
 *
 * The plan (§7) defines Tier 2 as: "Score each skill's output against a rubric fixture
 * (test/fixtures/*.json). Catches quality regressions." This module is the scoring engine.
 *
 * Two judges share one interface (`JudgeFn`) so the SAME rubric runs free-and-offline in CI and
 * paid-against-a-model when an operator wants a semantic second opinion:
 *
 *   - `heuristicJudge` (default) — deterministic. Scores each rubric dimension by the presence /
 *     absence of anchor phrases in the candidate text. No network, no key, no flake. This is what
 *     `bun test` runs, so the harness itself is provable (see the negative cases in
 *     `skill-llm-eval.test.ts`).
 *   - `modelJudge` (gated behind `FACTORY_EVAL_LLM=1`) — hands the rubric + candidate to a model
 *     host. The Factory ships no bundled model client, so this stays a thin, injectable seam: an
 *     operator wires their host by setting `globalThis.__FACTORY_MODEL_JUDGE__`. Absent that, it
 *     throws a clear "not configured" error rather than pretending to score.
 *
 * A rubric is data (`test/fixtures/*.json`), never code, so adding coverage never touches this file.
 */

export interface AnchorSet {
  /** Every phrase here must appear (case-insensitive) for full credit on this dimension. */
  require_all?: string[];
  /** At least `min_any` of these phrases must appear. Defaults to 1 when `any` is set. */
  any?: string[];
  min_any?: number;
  /** None of these may appear; each hit is a hard miss for the dimension. */
  forbid?: string[];
}

export interface RubricDimension {
  /** Stable id, e.g. "root-cause-discipline". */
  name: string;
  /** Human sentence describing what a passing output shows on this axis. */
  criterion: string;
  /** Relative weight in the overall score. Must be > 0. */
  weight: number;
  /** Phrase anchors the heuristic judge scores against, and the model judge is told to look for. */
  anchors: AnchorSet;
}

export interface Rubric {
  /** Skill this rubric scores, or "_baseline" for the shared cross-skill rubric. */
  skill: string;
  /** One-line statement of what "good" means for this skill's output. */
  intent: string;
  dimensions: RubricDimension[];
  /** Weighted score in [0,1] the candidate must reach to pass. */
  pass_threshold: number;
}

export interface DimensionResult {
  name: string;
  score: number; // 0..1
  weight: number;
  reasons: string[];
}

export interface JudgeResult {
  skill: string;
  weighted_score: number; // 0..1
  pass: boolean;
  dimensions: DimensionResult[];
}

export type JudgeFn = (candidate: string, rubric: Rubric) => Promise<JudgeResult> | JudgeResult;

const has = (haystack: string, needle: string): boolean =>
  haystack.toLowerCase().includes(needle.toLowerCase());

/** Validate a rubric's shape. Throws with a precise message — used by the fixture-integrity test. */
export function assertRubric(r: unknown, source = 'rubric'): asserts r is Rubric {
  const o = r as Record<string, unknown>;
  if (!o || typeof o !== 'object') throw new Error(`${source}: not an object`);
  if (typeof o.skill !== 'string' || !o.skill) throw new Error(`${source}: missing 'skill'`);
  if (typeof o.intent !== 'string' || !o.intent) throw new Error(`${source}: missing 'intent'`);
  if (typeof o.pass_threshold !== 'number' || o.pass_threshold <= 0 || o.pass_threshold > 1) {
    throw new Error(`${source}: 'pass_threshold' must be in (0, 1]`);
  }
  if (!Array.isArray(o.dimensions) || o.dimensions.length === 0) {
    throw new Error(`${source}: 'dimensions' must be a non-empty array`);
  }
  for (const [i, d] of (o.dimensions as RubricDimension[]).entries()) {
    const where = `${source}.dimensions[${i}]`;
    if (!d || typeof d.name !== 'string' || !d.name) throw new Error(`${where}: missing 'name'`);
    if (typeof d.criterion !== 'string' || !d.criterion) throw new Error(`${where}: missing 'criterion'`);
    if (typeof d.weight !== 'number' || d.weight <= 0) throw new Error(`${where}: 'weight' must be > 0`);
    const a = d.anchors as AnchorSet;
    if (!a || typeof a !== 'object') throw new Error(`${where}: missing 'anchors'`);
    const hasAny = Array.isArray(a.any) && a.any.length > 0;
    const hasAll = Array.isArray(a.require_all) && a.require_all.length > 0;
    const hasForbid = Array.isArray(a.forbid) && a.forbid.length > 0;
    if (!hasAny && !hasAll && !hasForbid) {
      throw new Error(`${where}: 'anchors' must set at least one of require_all / any / forbid`);
    }
  }
}

/** Score one dimension in [0,1]. Deterministic. */
function scoreDimension(candidate: string, d: RubricDimension): DimensionResult {
  const reasons: string[] = [];
  const parts: number[] = [];

  const a = d.anchors;

  if (Array.isArray(a.require_all) && a.require_all.length > 0) {
    const present = a.require_all.filter((p) => has(candidate, p));
    const missing = a.require_all.filter((p) => !has(candidate, p));
    parts.push(present.length / a.require_all.length);
    if (missing.length > 0) reasons.push(`missing required: ${missing.join(', ')}`);
  }

  if (Array.isArray(a.any) && a.any.length > 0) {
    const need = a.min_any ?? 1;
    const hits = a.any.filter((p) => has(candidate, p));
    parts.push(Math.min(1, hits.length / need));
    if (hits.length < need) {
      reasons.push(`needs ${need} of [${a.any.join(', ')}], found ${hits.length}`);
    }
  }

  // Forbidden phrases zero the dimension out — a hard quality violation.
  let forbidden = false;
  if (Array.isArray(a.forbid) && a.forbid.length > 0) {
    const hits = a.forbid.filter((p) => has(candidate, p));
    if (hits.length > 0) {
      forbidden = true;
      reasons.push(`forbidden phrase present: ${hits.join(', ')}`);
    }
  }

  const base = parts.length > 0 ? parts.reduce((s, x) => s + x, 0) / parts.length : 1;
  const score = forbidden ? 0 : base;
  return { name: d.name, score, weight: d.weight, reasons };
}

/** Deterministic anchor-based judge. The default engine. */
export function heuristicJudge(candidate: string, rubric: Rubric): JudgeResult {
  const dimensions = rubric.dimensions.map((d) => scoreDimension(candidate, d));
  const totalWeight = dimensions.reduce((s, d) => s + d.weight, 0);
  const weighted =
    totalWeight > 0 ? dimensions.reduce((s, d) => s + d.score * d.weight, 0) / totalWeight : 0;
  return {
    skill: rubric.skill,
    weighted_score: weighted,
    pass: weighted >= rubric.pass_threshold,
    dimensions,
  };
}

/**
 * Model-backed judge. Injectable so the Factory ships no bundled model client. An operator wires
 * their host by assigning a function to `globalThis.__FACTORY_MODEL_JUDGE__`.
 */
export type ModelJudgeHook = (candidate: string, rubric: Rubric) => Promise<JudgeResult>;

export async function modelJudge(candidate: string, rubric: Rubric): Promise<JudgeResult> {
  const hook = (globalThis as Record<string, unknown>).__FACTORY_MODEL_JUDGE__ as
    | ModelJudgeHook
    | undefined;
  if (typeof hook !== 'function') {
    throw new Error(
      'modelJudge: no model judge configured. Set globalThis.__FACTORY_MODEL_JUDGE__ ' +
        'to a (candidate, rubric) => Promise<JudgeResult> hook, or run the free heuristic judge.',
    );
  }
  return hook(candidate, rubric);
}

/** Return the active judge. Heuristic unless `FACTORY_EVAL_LLM=1` opts into the model path. */
export function getJudge(): JudgeFn {
  return process.env.FACTORY_EVAL_LLM === '1' ? modelJudge : heuristicJudge;
}

/** A compact one-line diagnostic for a failing result, for test output. */
export function explain(result: JudgeResult): string {
  const failing = result.dimensions
    .filter((d) => d.score < 1)
    .map((d) => `${d.name}=${d.score.toFixed(2)}${d.reasons.length ? ` (${d.reasons.join('; ')})` : ''}`);
  return `${result.skill}: ${result.weighted_score.toFixed(2)} ` +
    `${result.pass ? 'PASS' : 'FAIL'}${failing.length ? ` — ${failing.join(' | ')}` : ''}`;
}
