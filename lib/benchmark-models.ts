/**
 * benchmark-models — the pure cross-model comparison core.
 *
 * `/benchmark-models` (gstack) runs the SAME scenario against several models and puts the scores
 * side by side, so you can see which model is strongest on a skill and whether they even agree.
 * This module is the deterministic part: given a set of per-model scores it ranks them, measures
 * the spread, and classifies agreement. It never talks to a model.
 *
 * Actually running the models is an injectable seam (`__FACTORY_MODEL_RUNNER__`) — the Factory
 * bundles no model client, so with nothing wired `getModelRunner` throws loudly rather than
 * pretending. The CLI (`scripts/benchmark-models.ts`) wires the runner to the heuristic judge and
 * feeds the resulting scores into `compareModels`; the comparison itself is fully tested offline.
 */

export interface ModelScore {
  /** Model identifier, e.g. "claude-opus", "gpt-5". Must be unique within a run. */
  model: string;
  /** Weighted rubric score in [0, 1]. */
  score: number;
  /** Whether the model's output cleared the rubric threshold. */
  pass: boolean;
}

export type Agreement = 'unanimous-pass' | 'unanimous-fail' | 'split';

export interface BenchmarkComparison {
  /** Scores sorted best-first (desc by score, ties broken by model name asc for determinism). */
  ranked: ModelScore[];
  best: string;
  worst: string;
  /** max(score) − min(score), rounded to 4 dp. A large spread means the choice of model matters. */
  spread: number;
  /** Mean score across models, rounded to 4 dp. */
  meanScore: number;
  passCount: number;
  total: number;
  /** unanimous-pass / unanimous-fail when every model agrees; split otherwise. */
  agreement: Agreement;
}

const round4 = (n: number): number => Math.round(n * 10000) / 10000;

/** Validate a set of per-model scores. Throws with a precise message. */
export function assertModelScores(results: unknown, source = 'results'): asserts results is ModelScore[] {
  if (!Array.isArray(results) || results.length === 0) {
    throw new Error(`${source}: expected a non-empty array of model scores`);
  }
  const seen = new Set<string>();
  for (const [i, r] of (results as ModelScore[]).entries()) {
    const where = `${source}[${i}]`;
    if (!r || typeof r !== 'object') throw new Error(`${where}: not an object`);
    if (typeof r.model !== 'string' || !r.model.trim()) throw new Error(`${where}: missing 'model'`);
    if (seen.has(r.model)) throw new Error(`${where}: duplicate model '${r.model}'`);
    seen.add(r.model);
    if (typeof r.score !== 'number' || Number.isNaN(r.score) || r.score < 0 || r.score > 1) {
      throw new Error(`${where}: 'score' must be a number in [0, 1]`);
    }
    if (typeof r.pass !== 'boolean') throw new Error(`${where}: 'pass' must be a boolean`);
  }
}

/** Rank models, measure spread, and classify agreement. Pure and deterministic. */
export function compareModels(results: ModelScore[]): BenchmarkComparison {
  assertModelScores(results);
  const ranked = [...results].sort((a, b) => b.score - a.score || a.model.localeCompare(b.model));
  const scores = ranked.map((r) => r.score);
  const max = Math.max(...scores);
  const min = Math.min(...scores);
  const passCount = ranked.filter((r) => r.pass).length;
  const total = ranked.length;
  const agreement: Agreement =
    passCount === total ? 'unanimous-pass' : passCount === 0 ? 'unanimous-fail' : 'split';
  return {
    ranked,
    best: ranked[0].model,
    worst: ranked[ranked.length - 1].model,
    spread: round4(max - min),
    meanScore: round4(scores.reduce((a, b) => a + b, 0) / total),
    passCount,
    total,
    agreement,
  };
}

/** Render a comparison as a compact, aligned text table for the CLI. */
export function formatComparison(cmp: BenchmarkComparison): string {
  const width = Math.max(5, ...cmp.ranked.map((r) => r.model.length));
  const rows = cmp.ranked.map((r, i) => {
    const rank = `${i + 1}`.padStart(2);
    const model = r.model.padEnd(width);
    const score = r.score.toFixed(4);
    const mark = r.pass ? 'PASS' : 'FAIL';
    const lead = i === 0 ? '★' : ' ';
    return `  ${lead} ${rank}. ${model}  ${score}  ${mark}`;
  });
  return [
    `benchmark-models — ${cmp.total} model(s), agreement=${cmp.agreement}`,
    ...rows,
    `  best=${cmp.best}  worst=${cmp.worst}  spread=${cmp.spread.toFixed(4)}  mean=${cmp.meanScore.toFixed(4)}`,
  ].join('\n');
}

// ── model-runner seam (no offline fallback — running a model needs a real client) ──────────────

/** Run one model against a prompt and return its raw text output. */
export type ModelRunner = (model: string, prompt: string) => Promise<string> | string;

declare global {
  // eslint-disable-next-line no-var
  var __FACTORY_MODEL_RUNNER__: ModelRunner | undefined;
}

/**
 * Resolve the model runner. An operator wires their host by setting
 * `globalThis.__FACTORY_MODEL_RUNNER__`. Absent that, this throws — the Factory ships no model
 * client and will not fake a run.
 */
export function getModelRunner(): ModelRunner {
  const injected = (globalThis as { __FACTORY_MODEL_RUNNER__?: ModelRunner }).__FACTORY_MODEL_RUNNER__;
  if (typeof injected === 'function') return injected;
  throw new Error(
    'benchmark-models: no model runner configured — wire globalThis.__FACTORY_MODEL_RUNNER__ ' +
      '(the Factory bundles no model client)',
  );
}
