/**
 * benchmark-models — run one scenario across several models and compare their scores.
 *
 * This is the CLI that wires the pure comparison core (`lib/benchmark-models.ts`) to a real model
 * host. For each `--models` entry it asks the injected model runner
 * (`globalThis.__FACTORY_MODEL_RUNNER__`) for that model's output on the prompt, scores it with the
 * deterministic heuristic judge against the skill's rubric fixture, then ranks the results.
 *
 * The Factory ships no model client, so with nothing wired this fails loudly — there is no honest
 * offline way to "run" a model. The comparison, ranking, and agreement logic it feeds are pure and
 * tested offline in `test/benchmark-models.test.ts`.
 *
 * Run:  fac benchmark:models --skill <skill> --models a,b,c (--prompt "…" | --prompt-file P) [--json]
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  compareModels,
  formatComparison,
  getModelRunner,
  type ModelScore,
} from '../lib/benchmark-models.ts';
import { assertRubric, heuristicJudge, type Rubric } from '../test/helpers/llm-judge.ts';

const ROOT = join(import.meta.dir, '..');
const FIXTURES = join(ROOT, 'test', 'fixtures');

function flag(name: string): string | undefined {
  const argv = process.argv.slice(2);
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(name);
}

function fail(msg: string): never {
  console.error(`benchmark-models — ${msg}`);
  process.exit(2);
}

function loadRubric(skill: string): Rubric {
  let raw: string;
  try {
    raw = readFileSync(join(FIXTURES, `${skill}.json`), 'utf-8');
  } catch {
    return fail(`no rubric fixture for skill '${skill}' (expected test/fixtures/${skill}.json)`);
  }
  const rubric = JSON.parse(raw);
  assertRubric(rubric, `${skill}.json`);
  return rubric;
}

async function main(): Promise<void> {
  const skill = flag('--skill');
  const modelsArg = flag('--models');
  const promptInline = flag('--prompt');
  const promptFile = flag('--prompt-file');
  const asJson = hasFlag('--json');

  if (!skill) fail('missing --skill <name>');
  if (!modelsArg) fail('missing --models a,b,c');
  const models = modelsArg.split(',').map((m) => m.trim()).filter(Boolean);
  if (models.length === 0) fail('--models resolved to no model names');

  let prompt: string;
  if (promptFile) prompt = readFileSync(promptFile, 'utf-8');
  else if (promptInline !== undefined) prompt = promptInline;
  else return fail('provide --prompt "…" or --prompt-file P');

  const rubric = loadRubric(skill as string);
  const runner = getModelRunner(); // throws loudly when unwired

  const scores: ModelScore[] = [];
  for (const model of models) {
    const output = await runner(model, prompt);
    const judged = heuristicJudge(output, rubric);
    scores.push({ model, score: judged.weighted_score, pass: judged.pass });
  }

  const comparison = compareModels(scores);
  if (asJson) {
    console.log(JSON.stringify({ skill, comparison }, null, 2));
  } else {
    console.log(formatComparison(comparison));
  }
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(`benchmark-models — ${(err as Error).message}`);
    process.exit(1);
  });
}
