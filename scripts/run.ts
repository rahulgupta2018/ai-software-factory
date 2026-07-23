/**
 * `fac run` — CLI surface over the run harness (lib/run.ts).
 *
 * Workflow skills drive a run through these subcommands; the operator uses the same ones to
 * inspect or stop it. The heavy lifting lives in lib/run.ts — this file only parses args.
 *
 *   fac run new [--product NAME] [--id ID]         create a run, print its id + dir
 *   fac run status [--id ID]                       run metadata, artifacts, staleness, budget
 *   fac run artifact --seq N --step S [--id ID]    write an artifact (body from --body-file or stdin)
 *              [--inputs a,b] [--file NN-step.md]
 *   fac run resume --plan a,b,c [--id ID]          print the first missing/stale step
 *   fac run stop [--id ID]                         request a stop before the next step
 *   fac run list                                   run ids, newest first
 */
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import {
  budgetStatus,
  createRun,
  findResumePoint,
  isPlaceholderProduct,
  listArtifacts,
  listRuns,
  readRun,
  requestStop,
  runDir,
  setRunProduct,
  writeArtifact,
  type PlanStep,
} from '../lib/run.ts';
import { loadProductContext, mergeContext } from '../lib/context.ts';

const cwd = process.cwd();

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function has(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function fail(message: string): never {
  console.error(`run — ${message}`);
  process.exit(1);
}

/** Newest run id, or fail with guidance. */
function latestRunId(): string {
  const runs = listRuns(cwd);
  if (runs.length === 0) fail('no runs yet — start one with `fac run new`');
  return runs[0];
}

function resolveId(): string {
  return flag('id') ?? latestRunId();
}

function productName(): string {
  try {
    const merged = mergeContext(loadProductContext(cwd));
    const product = merged.product as { name?: string } | undefined;
    return product?.name ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/** Parse `--plan a,b,c` (files derived NN-a.md) or `a=NN-a.md,b=custom.md`. */
function parsePlan(spec: string): PlanStep[] {
  return spec
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry, i) => {
      const [step, file] = entry.split('=');
      return { step, file: file ?? `${String(i + 1).padStart(2, '0')}-${step}.md` };
    });
}

function budgetWarnTokens(): number | undefined {
  try {
    const merged = mergeContext(loadProductContext(cwd));
    const guardrails = merged.guardrails as { budget?: { warn_tokens?: number } } | undefined;
    return guardrails?.budget?.warn_tokens;
  } catch {
    return undefined;
  }
}

function cmdNew(): void {
  const run = createRun(cwd, { product: flag('product') ?? productName(), id: flag('id') });
  console.log(`run — created ${run.id}`);
  console.log(`  dir: ${relative(cwd, runDir(cwd, run.id))}`);
}

function cmdStatus(): void {
  const id = resolveId();
  const run = readRun(cwd, id);
  console.log(`run ${run.id} — ${run.status} (product: ${run.product})`);
  console.log(`  started: ${run.started_at}`);

  const artifacts = listArtifacts(cwd, id);
  if (artifacts.length === 0) {
    console.log('  artifacts: none yet');
  } else {
    console.log('  artifacts:');
    for (const a of artifacts) {
      const mark = a.staleReasons.length > 0 ? `  ⚠ STALE (${a.staleReasons.join('; ')})` : '';
      console.log(`    ${a.file}  [${a.step}]${mark}`);
    }
  }

  const budget = budgetStatus(run, budgetWarnTokens());
  if (budget.total > 0 || budget.threshold !== undefined) {
    const thr = budget.threshold !== undefined ? ` / ${budget.threshold}` : '';
    console.log(`  tokens: ${budget.total}${thr}${budget.warn ? '  ⚠ over budget warn threshold' : ''}`);
  }
}

function cmdArtifact(): void {
  const id = flag('id') ?? latestRunId();
  const seq = Number(flag('seq'));
  const step = flag('step');
  if (!Number.isInteger(seq) || seq < 1) fail('--seq must be a positive integer');
  if (!step) fail('--step is required');

  const bodyFile = flag('body-file');
  const body = bodyFile ? readFileSync(bodyFile, 'utf-8') : readFileSync(0, 'utf-8');
  if (body.trim() === '') fail('artifact body is empty (pass --body-file or pipe on stdin)');

  const inputs = flag('inputs')?.split(',').map((s) => s.trim()).filter(Boolean);
  const file = writeArtifact({ repoRoot: cwd, id, seq, step, inputs, body, file: flag('file') });
  console.log(`run — wrote ${relative(cwd, runDir(cwd, id))}/${file}`);

  // Backfill the run's product name: a run is created before /discover writes the PRD, so it is
  // stamped 'unknown'. By the time an artifact is written the PRD usually resolves a real name.
  const wasPlaceholder = isPlaceholderProduct(readRun(cwd, id).product);
  const resolved = productName();
  setRunProduct(cwd, id, resolved);
  if (wasPlaceholder && !isPlaceholderProduct(resolved)) {
    console.log(`run — product resolved to "${resolved}"`);
  }
}

function cmdResume(): void {
  const id = resolveId();
  const spec = flag('plan');
  if (!spec) fail('--plan is required, e.g. --plan discover,plan-arch,review,qa,ship');
  const point = findResumePoint(cwd, runDir(cwd, id), parsePlan(spec));
  if (point.done) {
    console.log(`run ${id} — complete: every step is present and fresh`);
    return;
  }
  console.log(`run ${id} — resume at step ${point.index + 1}: ${point.step.step} (${point.reason})`);
  console.log(`  produces: ${point.step.file}`);
}

function cmdStop(): void {
  const id = resolveId();
  requestStop(cwd, id);
  console.log(`run ${id} — STOP requested; the run halts before its next step`);
}

function cmdList(): void {
  const runs = listRuns(cwd);
  if (runs.length === 0) {
    console.log('run — no runs yet');
    return;
  }
  for (const id of runs) {
    const run = readRun(cwd, id);
    console.log(`  ${id}  ${run.status}  (${run.product})`);
  }
}

const sub = process.argv[2];
switch (sub) {
  case 'new':
    cmdNew();
    break;
  case 'status':
    cmdStatus();
    break;
  case 'artifact':
    cmdArtifact();
    break;
  case 'resume':
    cmdResume();
    break;
  case 'stop':
    cmdStop();
    break;
  case 'list':
    cmdList();
    break;
  default:
    console.log(
      'fac run — manage a pipeline run\n\n' +
        '  new [--product NAME] [--id ID]              create a run\n' +
        '  status [--id ID]                            metadata, artifacts, staleness, budget\n' +
        '  artifact --seq N --step S [--inputs a,b]    write an artifact (body: --body-file or stdin)\n' +
        '           [--file NN-step.md] [--id ID]\n' +
        '  resume --plan a,b,c [--id ID]               print the first missing/stale step\n' +
        '  stop [--id ID]                              request a stop before the next step\n' +
        '  list                                        run ids, newest first',
    );
    process.exit(sub ? 1 : 0);
}
