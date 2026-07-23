/**
 * Tier-3 — E2E scenarios + diff-based selection.
 *
 * Tiers 0–2 prove the pipeline, structure, and per-skill quality WITHOUT a live model. Tier 3 is
 * the paid end-to-end check: spawn a real agent session against a scenario and assert the artifact
 * / discipline shows up in the transcript. The paid part is gated (`FACTORY_EVAL_E2E=1` or an
 * injected runner); everything else here runs free on every `bun test`:
 *
 *   - fixture integrity — every scenario is well-formed, names a real skill, and its context
 *     headings resolve against that skill's generated body (a scenario referencing a section the
 *     skill dropped is a caught regression);
 *   - selection — the diff-based selector and gate/periodic tiers behave (with negative cases);
 *   - scoring — `checkExpectation` passes and fails for the right reasons.
 *
 * A validator nobody watched fail is not a validator, so every check below has its negative twin.
 */
import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { skillNames } from '../scripts/gen-skill-docs.ts';
import {
  analyzeChanges,
  isGlobalTouch,
  selectScenarios,
  skillForPath,
  type SelectableScenario,
} from '../lib/eval-select.ts';
import { resolveEvalPlan } from '../lib/eval-plan.ts';
import {
  assertScenario,
  checkExpectation,
  getRunner,
  runScenario,
  skillSection,
  type E2EScenario,
} from './helpers/e2e-runner.ts';

const ROOT = join(import.meta.dir, '..');
const E2E_DIR = join(ROOT, 'test', 'fixtures', 'e2e');

function scenarioFiles(): string[] {
  return readdirSync(E2E_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();
}

function loadScenario(file: string): E2EScenario {
  const raw = JSON.parse(readFileSync(join(E2E_DIR, file), 'utf-8'));
  assertScenario(raw, file);
  return raw;
}

const scenarios = scenarioFiles().map(loadScenario);

describe('tier-3 fixture integrity', () => {
  test('there is at least one gate and one periodic scenario', () => {
    expect(scenarios.some((s) => s.tier === 'gate')).toBe(true);
    expect(scenarios.some((s) => s.tier === 'periodic')).toBe(true);
  });

  for (const file of scenarioFiles()) {
    test(`${file} is well-formed and names a real skill`, () => {
      const s = loadScenario(file);
      expect(skillNames()).toContain(s.skill);
    });

    test(`${file} context headings resolve against the skill body`, () => {
      const s = loadScenario(file);
      // Throws if any named heading is missing from the generated skill — the extract is non-empty.
      const section = skillSection(s.skill, s.context_headings);
      expect(section.length).toBeGreaterThan(0);
    });
  }

  test('assertScenario rejects a malformed scenario (negative case)', () => {
    expect(() => assertScenario({})).toThrow();
    expect(() => assertScenario({ skill: 'x', tier: 'nope' })).toThrow();
    expect(() =>
      assertScenario({ skill: 'x', tier: 'gate', intent: 'i', context_headings: [], prompt: 'p', expect: {} }),
    ).toThrow();
    expect(() =>
      assertScenario({
        skill: 'x',
        tier: 'gate',
        intent: 'i',
        context_headings: ['Workflow'],
        prompt: 'p',
        expect: {},
      }),
    ).toThrow();
  });

  test('skillSection throws on a missing heading (negative case)', () => {
    const s = scenarios[0];
    expect(() => skillSection(s.skill, ['NoSuchHeadingHere'])).toThrow();
  });
});

describe('diff-based selection', () => {
  const fixtures: SelectableScenario[] = [
    { skill: 'review', tier: 'gate' },
    { skill: 'investigate', tier: 'gate' },
    { skill: 'ship', tier: 'periodic' },
    { skill: 'plan-product', tier: 'periodic' },
  ];

  test('skillForPath maps a skill file to its skill, else null', () => {
    expect(skillForPath('skills/review/SKILL.md.tmpl')).toBe('review');
    expect(skillForPath('./skills/deploy/SKILL.md')).toBe('deploy');
    expect(skillForPath('lib/run.ts')).toBeNull();
    expect(skillForPath('README.md')).toBeNull();
  });

  test('isGlobalTouch matches the generator, resolvers, hosts — not a skill file', () => {
    expect(isGlobalTouch('scripts/gen-skill-docs.ts')).toBe(true);
    expect(isGlobalTouch('scripts/resolvers/preamble.ts')).toBe(true);
    expect(isGlobalTouch('hosts/claude.ts')).toBe(true);
    expect(isGlobalTouch('skills/review/SKILL.md.tmpl')).toBe(false);
  });

  test('analyzeChanges collects touched skills and the global flag', () => {
    const a = analyzeChanges(['skills/review/SKILL.md.tmpl', 'skills/ship/SKILL.md.tmpl', 'README.md']);
    expect([...a.skills].sort()).toEqual(['review', 'ship']);
    expect(a.global).toBe(false);

    const b = analyzeChanges(['scripts/gen-skill-docs.ts', 'skills/review/SKILL.md.tmpl']);
    expect(b.global).toBe(true);
  });

  test('a skill-only change selects that skill and no other', () => {
    const selected = selectScenarios(fixtures, { changedPaths: ['skills/review/SKILL.md.tmpl'] });
    expect(selected.map((s) => s.skill)).toEqual(['review']);
  });

  test('a global touchfile selects everything', () => {
    const selected = selectScenarios(fixtures, { changedPaths: ['scripts/gen-skill-docs.ts'] });
    expect(selected).toHaveLength(fixtures.length);
  });

  test('an empty diff selects nothing (negative case)', () => {
    const selected = selectScenarios(fixtures, { changedPaths: [] });
    expect(selected).toHaveLength(0);
  });

  test('the tier filter narrows to gate or periodic', () => {
    const gate = selectScenarios(fixtures, { tier: 'gate' });
    expect(gate.map((s) => s.skill)).toEqual(['review', 'investigate']);
    const periodic = selectScenarios(fixtures, { tier: 'periodic' });
    expect(periodic.map((s) => s.skill)).toEqual(['ship', 'plan-product']);
  });

  test('tier and diff compose: gate scenarios among the changed skills only', () => {
    const selected = selectScenarios(fixtures, {
      tier: 'gate',
      changedPaths: ['skills/investigate/SKILL.md.tmpl', 'skills/ship/SKILL.md.tmpl'],
    });
    expect(selected.map((s) => s.skill)).toEqual(['investigate']);
  });

  test('all=true ignores the diff', () => {
    const selected = selectScenarios(fixtures, { changedPaths: [], all: true });
    expect(selected).toHaveLength(fixtures.length);
  });

  test('no options selects every scenario', () => {
    expect(selectScenarios(fixtures)).toHaveLength(fixtures.length);
  });
});

describe('checkExpectation scoring', () => {
  test('passes when contains + any are satisfied and excludes are absent', () => {
    const r = checkExpectation('Security: SQL injection at query.ts:42. Raise a hard gate.', {
      output_contains: ['hard gate'],
      output_any: ['sql injection', 'sqli'],
      min_any: 1,
      output_excludes: ['lgtm'],
    });
    expect(r.pass).toBe(true);
    expect(r.reasons).toHaveLength(0);
  });

  test('fails on a missing required substring (negative case)', () => {
    const r = checkExpectation('Looks fine to me.', { output_contains: ['hard gate'] });
    expect(r.pass).toBe(false);
    expect(r.reasons.join(' ')).toContain('hard gate');
  });

  test('fails on a forbidden substring (negative case)', () => {
    const r = checkExpectation('LGTM, shipping it.', { output_excludes: ['lgtm'] });
    expect(r.pass).toBe(false);
  });

  test('fails when fewer than min_any anchors appear (negative case)', () => {
    const r = checkExpectation('It reproduces.', { output_any: ['clarify', 'scope'], min_any: 2 });
    expect(r.pass).toBe(false);
  });

  test('getRunner throws when nothing is configured (negative case)', () => {
    const hadEnv = process.env.FACTORY_EVAL_E2E;
    delete process.env.FACTORY_EVAL_E2E;
    delete (globalThis as { __FACTORY_E2E_RUNNER__?: unknown }).__FACTORY_E2E_RUNNER__;
    try {
      expect(() => getRunner()).toThrow('not configured');
    } finally {
      if (hadEnv !== undefined) process.env.FACTORY_EVAL_E2E = hadEnv;
    }
  });
});

/**
 * The paid pass. Off by default. Wire a runner (a real host CLI via FACTORY_EVAL_E2E=1, or inject
 * `globalThis.__FACTORY_E2E_RUNNER__`) and it runs the selected scenarios end-to-end. Tier and
 * live-ness are resolved by the shared cadence policy (`lib/eval-plan.ts`), so the harness and CI
 * agree by construction: default tier is `gate`; `FACTORY_EVAL_TIER=periodic` switches.
 */
const evalPlan = resolveEvalPlan({
  FACTORY_EVAL_E2E: process.env.FACTORY_EVAL_E2E,
  FACTORY_EVAL_TIER: process.env.FACTORY_EVAL_TIER,
  injectedRunner: Boolean((globalThis as { __FACTORY_E2E_RUNNER__?: unknown }).__FACTORY_E2E_RUNNER__),
});

describe.if(evalPlan.live)('tier-3 live E2E', () => {
  const selected = selectScenarios(scenarios, { tier: evalPlan.tier });

  for (const scenario of selected) {
    test(`${scenario.skill} — ${scenario.intent}`, async () => {
      const result = await runScenario(scenario, getRunner());
      expect(result.pass, result.reasons.join('; ')).toBe(true);
    });
  }
});
