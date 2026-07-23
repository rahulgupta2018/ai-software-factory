/**
 * Tier-0 — pipeline acceptance against the golden reference product.
 *
 * Tiers 1–3 evaluate *skills*. This tier evaluates the *pipeline*: it drives the full Phase-1
 * chain — `/discover → /plan-arch → build (per component) → /review → /qa → /ship` — through the
 * run harness against `examples/reference-product/`, and asserts the properties that make the
 * chain re-runnable rather than a one-off demo:
 *
 *   - every step produces its artifact, and the artifact IS the state (§8.1);
 *   - each downstream step records the actual on-disk hash of what the upstream wrote, so a broken
 *     handoff (skill #14 not reading what skill #3 produced) is a caught regression, not a silent
 *     drift (§7 "Tier 0");
 *   - a change high in the chain invalidates everything downstream (make-like staleness), which is
 *     what keeps a wrong `/plan-arch` from being papered over by a passing `/qa`;
 *   - hard gates fire on irreversible steps and on the product's own escalation triggers;
 *   - the run is driven off the REAL merged context (product name, escalation policy, budget),
 *     not hardcoded values — so this fixture stays honest as the reference product evolves.
 *
 * It is deterministic and free: it exercises the orchestration contract, not a live model. The
 * paid end-to-end run (a real agent host opening a real PR) is the operator's acceptance step.
 */
import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { loadProductContext, mergeContext } from '../lib/context.ts';
import {
  budgetStatus,
  createRun,
  findResumePoint,
  gateTier,
  isPlaceholderProduct,
  listArtifacts,
  matchEscalationTriggers,
  parseArtifact,
  readLock,
  readRun,
  recordStep,
  releaseLock,
  runDir,
  setRunProduct,
  sha256,
  writeArtifact,
  type PlanStep,
} from '../lib/run.ts';

const REFERENCE_PRODUCT = join(import.meta.dir, '..', 'examples', 'reference-product');
const REFERENCE_PRODUCT_JAVA = join(import.meta.dir, '..', 'examples', 'reference-product-java');

interface Component {
  name: string;
  language: string;
}

/** A single step the orchestrator drives: what it writes and what it read to write it. */
interface DriveStep {
  seq: number;
  step: string;
  file: string;
  inputs: string[];
  irreversible?: boolean;
}

/**
 * Build the Phase-1 plan from the reference product's own design. `build` splits per
 * `tech_stack.components[]` — existing structure, not a new checkpointing mechanism (§8.1).
 */
function planFor(id: string, components: Component[]): DriveStep[] {
  const runRel = (file: string) => `.factory/runs/${id}/${file}`;
  const buildSteps: DriveStep[] = components.map((c) => ({
    seq: 3,
    step: `build-${c.name}`,
    file: `03-build-${c.name}.md`,
    inputs: [runRel('02-plan-arch.md')],
  }));
  const buildFiles = buildSteps.map((s) => runRel(s.file));
  return [
    // discover has NO staleness inputs: its input is the chat idea, not a file, and PRD.md is its
    // OUTPUT. Anchoring it to PRD.md would make a human PRD edit re-run discover and clobber that
    // edit. A PRD edit re-opens plan-arch (which reads PRD.md), not discover.
    { seq: 1, step: 'discover', file: '01-discover.md', inputs: [] },
    {
      seq: 2,
      step: 'plan-arch',
      file: '02-plan-arch.md',
      inputs: ['PRD.md', '.factory/stack.yaml', runRel('01-discover.md')],
    },
    ...buildSteps,
    { seq: 4, step: 'review', file: '04-review.md', inputs: buildFiles },
    { seq: 5, step: 'qa', file: '05-qa.md', inputs: buildFiles },
    {
      seq: 6,
      step: 'ship',
      file: '06-ship.md',
      inputs: [runRel('04-review.md'), runRel('05-qa.md')],
      irreversible: true, // sync, push, open PR — the one hard gate in the core loop
    },
  ];
}

/** Drive every step in order, writing a small body so the handoff chain is real. */
function driveAll(repo: string, id: string, plan: DriveStep[]): void {
  for (const s of plan) {
    writeArtifact({
      repoRoot: repo,
      id,
      seq: s.seq,
      step: s.step,
      file: s.file,
      inputs: s.inputs,
      body: `# ${s.step}\n\nartifact for ${s.step}, run ${id}.\n`,
    });
  }
}

describe('pipeline acceptance — reference product', () => {
  let repo: string;
  let merged: Record<string, unknown>;
  let components: Component[];

  beforeEach(() => {
    // Hermetic copy: PRD.md + .factory/stack.yaml are all the pipeline needs to bind context.
    repo = mkdtempSync(join(tmpdir(), 'fac-pipeline-'));
    cpSync(join(REFERENCE_PRODUCT, 'PRD.md'), join(repo, 'PRD.md'));
    cpSync(join(REFERENCE_PRODUCT, '.factory', 'stack.yaml'), join(repo, '.factory', 'stack.yaml'), {
      recursive: true,
    });
    merged = mergeContext(loadProductContext(repo)) as Record<string, unknown>;
    const tech = merged.tech_stack as { components?: Component[] } | undefined;
    components = tech?.components ?? [];
  });
  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  test('the reference product exposes the design the chain is driven from', () => {
    // Guards against the fixture silently losing its shape (e.g. someone empties components[]).
    const product = merged.product as { name?: string };
    expect(product.name).toBe('Repair Tracker');
    expect(components.map((c) => c.name).sort()).toEqual(['api', 'mobile', 'reminders', 'web']);
  });

  test('the full chain runs end-to-end: every step writes its artifact and resume reports done', () => {
    const id = createRun(repo, { product: 'Repair Tracker', id: '2026-07-22-p001' }).id;
    const plan = planFor(id, components);

    // Before anything runs, resume points at the first step.
    expect(findResumePoint(repo, runDir(repo, id), plan as PlanStep[])).toMatchObject({
      index: 0,
      reason: 'missing',
    });

    driveAll(repo, id, plan);

    // Every artifact exists, correctly named and sequenced.
    const present = listArtifacts(repo, id).map((a) => a.file);
    expect(present).toEqual([
      '01-discover.md',
      '02-plan-arch.md',
      '03-build-api.md',
      '03-build-mobile.md',
      '03-build-reminders.md',
      '03-build-web.md',
      '04-review.md',
      '05-qa.md',
      '06-ship.md',
    ]);
    // None stale immediately after a clean run.
    expect(listArtifacts(repo, id).every((a) => a.staleReasons.length === 0)).toBe(true);
    // Resume over the completed plan is done.
    expect(findResumePoint(repo, runDir(repo, id), plan as PlanStep[])).toEqual({ done: true });
  });

  test('handoff integrity: /review records the exact bytes the build steps wrote', () => {
    const id = createRun(repo, { product: 'Repair Tracker', id: '2026-07-22-p002' }).id;
    const plan = planFor(id, components);
    driveAll(repo, id, plan);

    const dir = runDir(repo, id);
    const review = parseArtifact(readFileSync(join(dir, '04-review.md'), 'utf-8'), '04-review.md');
    const recorded = Object.fromEntries(review.fm.inputs.map((i) => [i.path, i.sha256]));

    for (const c of components) {
      const buildFile = `.factory/runs/${id}/03-build-${c.name}.md`;
      const onDisk = sha256(readFileSync(join(repo, buildFile), 'utf-8'));
      // The review step read what the build step actually produced — not a stale or fabricated copy.
      expect(recorded[buildFile]).toBe(onDisk);
    }
  });

  test('a change high in the chain invalidates everything downstream (make-like staleness)', () => {
    const id = createRun(repo, { product: 'Repair Tracker', id: '2026-07-22-p003' }).id;
    const plan = planFor(id, components);
    driveAll(repo, id, plan);
    expect(findResumePoint(repo, runDir(repo, id), plan as PlanStep[])).toEqual({ done: true });

    // Re-run /plan-arch with a new result (simulating a corrected architecture). Its hash changes,
    // so the first build step that recorded it as input goes stale — the cascade is automatic.
    writeArtifact({
      repoRoot: repo,
      id,
      seq: 2,
      step: 'plan-arch',
      file: '02-plan-arch.md',
      inputs: ['PRD.md', '.factory/stack.yaml', `.factory/runs/${id}/01-discover.md`],
      body: '# plan-arch\n\nrevised architecture.\n',
    });

    const resume = findResumePoint(repo, runDir(repo, id), plan as PlanStep[]);
    expect(resume).toMatchObject({ done: false, index: 2 }); // 03-build-api, the first build step
    if (!resume.done) {
      expect(resume.step.file).toBe('03-build-api.md');
      expect(resume.reason).toMatch(/02-plan-arch\.md changed/);
    }
  });

  test('editing the PRD by hand re-opens the chain from /plan-arch, not /discover', () => {
    const id = createRun(repo, { product: 'Repair Tracker', id: '2026-07-22-p004' }).id;
    const plan = planFor(id, components);
    driveAll(repo, id, plan);

    // A hand edit to the PRD. discover records no inputs, so it stays done (re-running it would
    // clobber this very edit). plan-arch reads PRD.md, so the chain re-opens there — the design
    // half is reconsidered, the human's requirements edit is preserved.
    writeFileSync(join(repo, 'PRD.md'), `${readFileSync(join(repo, 'PRD.md'), 'utf-8')}\n<!-- edit -->\n`);

    const resume = findResumePoint(repo, runDir(repo, id), plan as PlanStep[]);
    expect(resume).toMatchObject({ done: false, index: 1 });
    if (!resume.done) {
      expect(resume.step.file).toBe('02-plan-arch.md');
      expect(resume.reason).toMatch(/PRD\.md changed/);
    }
  });

  test('hard gates fire on the irreversible ship step and on the product escalation triggers', () => {
    const policy = merged.escalation_policy as { triggers?: string[] } | undefined;
    const triggers = policy?.triggers ?? [];
    expect(triggers.length).toBeGreaterThan(0); // the reference product declares real triggers

    // The ship step is irreversible → hard, unbatchable.
    expect(gateTier({ irreversible: true })).toBe('hard');
    // An ordinary build step → routine.
    expect(gateTier({ irreversible: false, matchedTriggers: [] })).toBe('routine');

    // A step description that matches an escalation trigger → hard, even if not itself irreversible.
    const migration = matchEscalationTriggers('run a schema migration on live data before ship', triggers);
    expect(migration.length).toBeGreaterThan(0);
    expect(gateTier({ matchedTriggers: migration })).toBe('hard');

    // A benign step matches no trigger → routine.
    expect(matchEscalationTriggers('render the filtered repair list', triggers)).toEqual([]);
  });

  test('cost is measured and warns off the product budget, never halts', () => {
    const guardrails = merged.guardrails as { budget?: { warn_tokens?: number } } | undefined;
    const warn = guardrails?.budget?.warn_tokens;
    expect(warn).toBe(400000); // sourced from the reference product, not hardcoded here

    const id = createRun(repo, { product: 'Repair Tracker', id: '2026-07-22-p005' }).id;
    const plan = planFor(id, components);
    driveAll(repo, id, plan);
    plan.forEach((s) =>
      recordStep(repo, id, {
        file: s.file,
        step: s.step,
        status: 'ok',
        tokens_in: 20000,
        tokens_out: 20000,
      }),
    );

    // 9 steps × 40k = 360k — under the 400k threshold, so no warning.
    expect(budgetStatus(readRun(repo, id), warn).warn).toBe(false);
    // Push spend past the threshold: it warns, it does not throw or halt.
    recordStep(repo, id, {
      file: '06-ship.md',
      step: 'ship',
      status: 'ok',
      tokens_in: 300000,
      tokens_out: 0,
    });
    expect(budgetStatus(readRun(repo, id), warn).warn).toBe(true);
  });

  test('a run created before discover is stamped unknown, then backfilled once the PRD name resolves', () => {
    // Simulate the real ordering: orchestrator opens the run before /discover fills the PRD.
    const id = createRun(repo, { product: 'unknown', id: '2026-07-22-p008' }).id;
    expect(isPlaceholderProduct(readRun(repo, id).product)).toBe(true);

    // discover writes the PRD (name is 'Repair Tracker' in the fixture), then backfills.
    setRunProduct(repo, id, 'Repair Tracker');
    expect(readRun(repo, id).product).toBe('Repair Tracker');

    // Backfill is a one-way latch: a later placeholder never overwrites a real name.
    setRunProduct(repo, id, 'unknown');
    expect(readRun(repo, id).product).toBe('Repair Tracker');
  });

  test('the run is re-runnable: a fresh run id completes the same chain against the same repo', () => {
    const first = createRun(repo, { product: 'Repair Tracker', id: '2026-07-22-p006' }).id;
    driveAll(repo, first, planFor(first, components));
    expect(readLock(repo)?.run_id).toBe(first);
    releaseLock(repo, first);
    expect(readLock(repo)).toBeNull();

    const second = createRun(repo, { product: 'Repair Tracker', id: '2026-07-22-p007' }).id;
    const plan2 = planFor(second, components);
    driveAll(repo, second, plan2);
    expect(findResumePoint(repo, runDir(repo, second), plan2 as PlanStep[])).toEqual({ done: true });
    // Two independent completed runs coexist — not a one-off.
    expect(existsSync(join(runDir(repo, first), '06-ship.md'))).toBe(true);
    expect(existsSync(join(runDir(repo, second), '06-ship.md'))).toBe(true);
  });
});

/**
 * Phase 1b — language routing is a parameter, not a fork.
 *
 * The same helpers (`planFor`, `driveAll`) and the same run harness drive a product whose only
 * component is Java/Quarkus. If the chain completes with no change to the plan or the harness,
 * that IS the proof: switching language is a fixture change (`tech_stack.components[].language`),
 * not a second pipeline.
 */
describe('pipeline acceptance — Java/Quarkus reference product (routing is a parameter)', () => {
  let repo: string;
  let merged: Record<string, unknown>;
  let components: Component[];

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'fac-pipeline-java-'));
    cpSync(join(REFERENCE_PRODUCT_JAVA, 'PRD.md'), join(repo, 'PRD.md'));
    cpSync(
      join(REFERENCE_PRODUCT_JAVA, '.factory', 'stack.yaml'),
      join(repo, '.factory', 'stack.yaml'),
      { recursive: true },
    );
    merged = mergeContext(loadProductContext(repo)) as Record<string, unknown>;
    const tech = merged.tech_stack as { components?: Component[] } | undefined;
    components = tech?.components ?? [];
  });
  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  test('the Java fixture routes a single Quarkus component', () => {
    const product = merged.product as { name?: string };
    expect(product.name).toBe('Repair Tracker API');
    const tech = merged.tech_stack as { languages?: string[] };
    expect(tech.languages).toContain('java');
    expect(components).toHaveLength(1);
    expect(components[0]).toMatchObject({ name: 'api', language: 'java' });
  });

  test('the same chain runs end-to-end on the Quarkus component with no workflow-skill change', () => {
    const id = createRun(repo, { product: 'Repair Tracker API', id: '2026-07-22-j001' }).id;
    const plan = planFor(id, components); // identical helper to the TypeScript fixture
    driveAll(repo, id, plan);

    // One build step (03-build-api) because the product declares one component — the plan shape
    // follows the fixture, the pipeline code is untouched.
    expect(listArtifacts(repo, id).map((a) => a.file)).toEqual([
      '01-discover.md',
      '02-plan-arch.md',
      '03-build-api.md',
      '04-review.md',
      '05-qa.md',
      '06-ship.md',
    ]);
    expect(findResumePoint(repo, runDir(repo, id), plan as PlanStep[])).toEqual({ done: true });
  });

  test('handoff integrity holds for the Java build step, and ship stays a hard gate', () => {
    const id = createRun(repo, { product: 'Repair Tracker API', id: '2026-07-22-j002' }).id;
    const plan = planFor(id, components);
    driveAll(repo, id, plan);

    const review = parseArtifact(
      readFileSync(join(runDir(repo, id), '04-review.md'), 'utf-8'),
      '04-review.md',
    );
    const recorded = Object.fromEntries(review.fm.inputs.map((i) => [i.path, i.sha256]));
    const buildFile = `.factory/runs/${id}/03-build-api.md`;
    expect(recorded[buildFile]).toBe(sha256(readFileSync(join(repo, buildFile), 'utf-8')));

    // The gate contract is language-agnostic: ship is irreversible → hard on the Java path too.
    expect(gateTier({ irreversible: true })).toBe('hard');
  });
});
