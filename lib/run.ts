/**
 * Run harness — the contract every Phase-1 workflow skill is written against.
 *
 * A run is a directory of artifacts under `.factory/runs/<id>/`. The artifacts ARE the state:
 * `02-plan-arch.md` existing means that step completed — there is no second source of truth.
 * `run.json` holds metadata ABOUT the run (timings, cost, gate decisions) and is never consulted
 * to decide what already ran.
 *
 * Four load-bearing behaviours (plan §8.1), all landing on the artifact surface:
 *
 *   1. Artifacts-as-state, atomic writes. Every artifact is written to `<name>.tmp` and renamed,
 *      so a half-written file can never look complete.
 *   2. Resume by input-hash staleness. Each artifact records the artifacts it consumed and their
 *      hashes; resume runs the first step that is missing or whose recorded input hash no longer
 *      matches disk. Make-like: editing an upstream artifact by hand goes stale downstream for
 *      free.
 *   3. Gates in two tiers. Routine gates (every ordinary boundary) are batchable; hard gates
 *      (irreversible actions + anything matching the product's escalation triggers) are always
 *      asked individually and ignore batch approval.
 *   4. Cost measured, not capped. Per-step tokens/wall-time are recorded; past a warn threshold
 *      the run warns, it never halts.
 *
 * Concurrency is one run per repo via `.factory/lock`; a lock whose pid is dead is stale and
 * cleared with a warning. A run is stopped mid-flight by creating `STOP` in its directory.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { parseFrontmatter, renderFrontmatter } from './frontmatter.ts';

export const FACTORY_DIR = '.factory';
export const RUNS_RELATIVE = join(FACTORY_DIR, 'runs');
export const LOCK_RELATIVE = join(FACTORY_DIR, 'lock');
export const STOP_FILE = 'STOP';
export const RUN_META_FILE = 'run.json';

// ── Types ───────────────────────────────────────────────────────────────────

/** A step in a run's plan: a logical name plus the artifact file it produces. */
export interface PlanStep {
  step: string;
  file: string;
}

/** One recorded input to an artifact: a repo-root-relative path and its content hash. */
export interface ArtifactInput {
  path: string;
  sha256: string;
}

/** Frontmatter written at the top of every artifact. */
export interface ArtifactFrontmatter {
  step: string;
  run: string;
  produced_at: string;
  inputs: ArtifactInput[];
}

export interface StepRecord {
  /** Logical step name. */
  step: string;
  /** Artifact filename within the run dir. */
  file: string;
  status: 'ok' | 'failed';
  started_at?: string;
  ended_at?: string;
  wall_ms?: number;
  model?: string;
  tokens_in?: number;
  tokens_out?: number;
  /** True where the host could not report real token counts and the number is a guess. */
  estimated?: boolean;
  gate?: GateTier | 'none';
  decision?: 'approved' | 'batch-approved' | 'auto' | 'rejected';
}

export interface RunMeta {
  id: string;
  product: string;
  status: 'running' | 'stopped' | 'complete' | 'failed';
  started_at: string;
  updated_at: string;
  steps: StepRecord[];
}

export interface LockRecord {
  pid: number;
  run_id: string;
  started_at: string;
}

export type GateTier = 'routine' | 'hard';

// ── Paths ───────────────────────────────────────────────────────────────────

export function runsDir(repoRoot: string): string {
  return resolve(repoRoot, RUNS_RELATIVE);
}

export function runDir(repoRoot: string, id: string): string {
  return join(runsDir(repoRoot), id);
}

export function lockPath(repoRoot: string): string {
  return resolve(repoRoot, LOCK_RELATIVE);
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

/** Hash a string the way artifact inputs are hashed. */
export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** A run id is date-prefixed for sortability plus a short random suffix for uniqueness. */
export function newRunId(now: Date = new Date(), suffix?: string): string {
  const day = now.toISOString().slice(0, 10);
  const rand = suffix ?? Math.random().toString(16).slice(2, 6).padStart(4, '0');
  return `${day}-${rand}`;
}

/** Canonical artifact filename for a step at a 1-based sequence position: `02-plan-arch.md`. */
export function artifactFilename(seq: number, step: string): string {
  return `${String(seq).padStart(2, '0')}-${step}.md`;
}

/** Render an artifact's full file contents: frontmatter block + body (newline-terminated). */
export function renderArtifact(fm: ArtifactFrontmatter, body: string): string {
  const front = renderFrontmatter({
    step: fm.step,
    run: fm.run,
    produced_at: fm.produced_at,
    inputs: fm.inputs.map((i) => ({ path: i.path, sha256: i.sha256 })),
  });
  const trimmed = body.replace(/^\n+/, '');
  return `${front}\n${trimmed.endsWith('\n') ? trimmed : `${trimmed}\n`}`;
}

/** Parse an artifact file into its frontmatter and body. */
export function parseArtifact(text: string, label = 'artifact'): {
  fm: ArtifactFrontmatter;
  body: string;
} {
  const { data, body } = parseFrontmatter(text, label);
  const rawInputs = Array.isArray(data.inputs) ? (data.inputs as Record<string, unknown>[]) : [];
  return {
    fm: {
      step: String(data.step ?? ''),
      run: String(data.run ?? ''),
      produced_at: String(data.produced_at ?? ''),
      inputs: rawInputs.map((i) => ({ path: String(i.path), sha256: String(i.sha256) })),
    },
    // Drop the single readability blank line renderArtifact inserts after the frontmatter.
    body: body.replace(/^\n/, ''),
  };
}

export type ResumePoint =
  | { done: true }
  | { done: false; index: number; step: PlanStep; reason: string };

/**
 * Resolve where a resume should start: the first plan step that is missing, or whose recorded
 * input hash no longer matches the file on disk. Missing beats stale — you can't be stale if you
 * never ran. Re-running an upstream step rewrites its artifact, so downstream steps that recorded
 * it as input go stale on the next call: the cascade is automatic, not coded here.
 */
export function findResumePoint(
  repoRoot: string,
  dir: string,
  plan: PlanStep[],
): ResumePoint {
  for (let index = 0; index < plan.length; index++) {
    const step = plan[index];
    const artifactPath = join(dir, step.file);
    if (!existsSync(artifactPath)) {
      return { done: false, index, step, reason: 'missing' };
    }
    const { fm } = parseArtifact(readFileSync(artifactPath, 'utf-8'), step.file);
    for (const input of fm.inputs) {
      const inputPath = resolve(repoRoot, input.path);
      const current = existsSync(inputPath) ? sha256(readFileSync(inputPath, 'utf-8')) : null;
      if (current !== input.sha256) {
        return {
          done: false,
          index,
          step,
          reason: current === null ? `input ${input.path} is gone` : `input ${input.path} changed`,
        };
      }
    }
  }
  return { done: true };
}

/** Classify a step boundary. Irreversible actions and matched escalation triggers are hard. */
export function gateTier(opts: {
  irreversible?: boolean;
  matchedTriggers?: string[];
}): GateTier {
  if (opts.irreversible) return 'hard';
  if (opts.matchedTriggers && opts.matchedTriggers.length > 0) return 'hard';
  return 'routine';
}

/**
 * Match a step's description against the product's escalation triggers. A trigger matches when
 * every significant word in it appears in the description — deliberately loose, because a missed
 * hard gate is worse than an over-eager one the operator waves through.
 */
export function matchEscalationTriggers(description: string, triggers: string[]): string[] {
  const haystack = description.toLowerCase();
  return triggers.filter((trigger) => {
    const words = trigger
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3);
    return words.length > 0 && words.every((w) => haystack.includes(w));
  });
}

export function totalTokens(run: RunMeta): number {
  return run.steps.reduce((sum, s) => sum + (s.tokens_in ?? 0) + (s.tokens_out ?? 0), 0);
}

export interface BudgetStatus {
  total: number;
  threshold?: number;
  warn: boolean;
}

/** Measure-and-warn: over the threshold flags a warning, never a halt. */
export function budgetStatus(run: RunMeta, warnTokens?: number): BudgetStatus {
  const total = totalTokens(run);
  return { total, threshold: warnTokens, warn: warnTokens !== undefined && total >= warnTokens };
}

// ── Lock ────────────────────────────────────────────────────────────────────

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // ESRCH: no such process. EPERM: alive but not ours to signal — still alive.
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export function readLock(repoRoot: string): LockRecord | null {
  const p = lockPath(repoRoot);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as LockRecord;
  } catch {
    return null;
  }
}

/**
 * Take the per-repo run lock. Refuses when a different run holds it with a live pid; clears a
 * stale lock (dead pid) with a warning. Re-acquiring for the same run id is idempotent.
 */
export function acquireLock(repoRoot: string, runId: string): LockRecord {
  const existing = readLock(repoRoot);
  if (existing && existing.run_id !== runId && isProcessAlive(existing.pid)) {
    throw new Error(
      `a run is already in progress: ${existing.run_id} (pid ${existing.pid}). ` +
        `Wait for it, or create ${join(RUNS_RELATIVE, existing.run_id, STOP_FILE)} to stop it.`,
    );
  }
  if (existing && existing.run_id !== runId) {
    console.warn(`run — clearing stale lock from dead pid ${existing.pid} (run ${existing.run_id})`);
  }
  const record: LockRecord = { pid: process.pid, run_id: runId, started_at: new Date().toISOString() };
  mkdirSync(resolve(repoRoot, FACTORY_DIR), { recursive: true });
  writeFileSync(lockPath(repoRoot), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

/** Release the lock if it belongs to this run. */
export function releaseLock(repoRoot: string, runId: string): void {
  const existing = readLock(repoRoot);
  if (existing && existing.run_id === runId) rmSync(lockPath(repoRoot), { force: true });
}

// ── Run metadata ─────────────────────────────────────────────────────────────

function metaPath(dir: string): string {
  return join(dir, RUN_META_FILE);
}

export function readRun(repoRoot: string, id: string): RunMeta {
  const p = metaPath(runDir(repoRoot, id));
  if (!existsSync(p)) throw new Error(`no run ${id} at ${p}`);
  return JSON.parse(readFileSync(p, 'utf-8')) as RunMeta;
}

export function writeRun(repoRoot: string, run: RunMeta): void {
  run.updated_at = new Date().toISOString();
  const dir = runDir(repoRoot, run.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(metaPath(dir), `${JSON.stringify(run, null, 2)}\n`);
}

/** Create a run: take the lock, make its directory, write initial metadata. */
export function createRun(repoRoot: string, opts: { product: string; id?: string }): RunMeta {
  const id = opts.id ?? newRunId();
  acquireLock(repoRoot, id);
  const now = new Date().toISOString();
  const run: RunMeta = {
    id,
    product: opts.product,
    status: 'running',
    started_at: now,
    updated_at: now,
    steps: [],
  };
  writeRun(repoRoot, run);
  return run;
}

/** Upsert a step record by its artifact file, keyed so a re-run overwrites in place. */
export function recordStep(repoRoot: string, id: string, record: StepRecord): RunMeta {
  const run = readRun(repoRoot, id);
  const idx = run.steps.findIndex((s) => s.file === record.file);
  if (idx >= 0) run.steps[idx] = record;
  else run.steps.push(record);
  writeRun(repoRoot, run);
  return run;
}

export function setRunStatus(repoRoot: string, id: string, status: RunMeta['status']): RunMeta {
  const run = readRun(repoRoot, id);
  run.status = status;
  writeRun(repoRoot, run);
  return run;
}

// ── Artifacts ────────────────────────────────────────────────────────────────

export interface WriteArtifactOpts {
  repoRoot: string;
  id: string;
  /** 1-based position in the plan; sets the filename prefix. */
  seq: number;
  step: string;
  /** Repo-root-relative paths this step consumed. Their current contents are hashed and recorded. */
  inputs?: string[];
  body: string;
  /** Override the derived filename (used for per-component build splits like `03-build-web.md`). */
  file?: string;
}

/**
 * Write an artifact atomically. Hashes each input's current contents, renders frontmatter + body
 * to `<file>.tmp`, then renames — so an interrupted write never leaves a file that looks complete.
 * Returns the artifact filename.
 */
export function writeArtifact(opts: WriteArtifactOpts): string {
  const dir = runDir(opts.repoRoot, opts.id);
  mkdirSync(dir, { recursive: true });
  const file = opts.file ?? artifactFilename(opts.seq, opts.step);
  const inputs: ArtifactInput[] = (opts.inputs ?? []).map((path) => {
    const abs = resolve(opts.repoRoot, path);
    if (!existsSync(abs)) throw new Error(`input not found: ${path}`);
    return { path, sha256: sha256(readFileSync(abs, 'utf-8')) };
  });
  const fm: ArtifactFrontmatter = {
    step: opts.step,
    run: opts.id,
    produced_at: new Date().toISOString(),
    inputs,
  };
  const finalPath = join(dir, file);
  const tmpPath = `${finalPath}.tmp`;
  writeFileSync(tmpPath, renderArtifact(fm, opts.body));
  renameSync(tmpPath, finalPath);
  return file;
}

export interface ArtifactStatus {
  file: string;
  step: string;
  produced_at: string;
  /** Non-empty when a recorded input no longer matches disk. */
  staleReasons: string[];
}

/** List the artifacts present in a run and whether each is stale relative to its own inputs. */
export function listArtifacts(repoRoot: string, id: string): ArtifactStatus[] {
  const dir = runDir(repoRoot, id);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^\d\d-.+\.md$/.test(f))
    .sort()
    .map((file) => {
      const { fm } = parseArtifact(readFileSync(join(dir, file), 'utf-8'), file);
      const staleReasons: string[] = [];
      for (const input of fm.inputs) {
        const abs = resolve(repoRoot, input.path);
        const current = existsSync(abs) ? sha256(readFileSync(abs, 'utf-8')) : null;
        if (current !== input.sha256) {
          staleReasons.push(current === null ? `${input.path} is gone` : `${input.path} changed`);
        }
      }
      return { file, step: fm.step, produced_at: fm.produced_at, staleReasons };
    });
}

// ── Stop ────────────────────────────────────────────────────────────────────

export function stopPath(repoRoot: string, id: string): string {
  return join(runDir(repoRoot, id), STOP_FILE);
}

export function requestStop(repoRoot: string, id: string): void {
  mkdirSync(runDir(repoRoot, id), { recursive: true });
  writeFileSync(stopPath(repoRoot, id), `stop requested ${new Date().toISOString()}\n`);
}

export function isStopRequested(repoRoot: string, id: string): boolean {
  return existsSync(stopPath(repoRoot, id));
}

export function clearStop(repoRoot: string, id: string): void {
  rmSync(stopPath(repoRoot, id), { force: true });
}

// ── Listing ─────────────────────────────────────────────────────────────────

/** All run ids in a repo, newest first (ids are date-prefixed and lexically sortable). */
export function listRuns(repoRoot: string): string[] {
  const base = runsDir(repoRoot);
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .filter((name) => existsSync(metaPath(join(base, name))))
    .sort()
    .reverse();
}
