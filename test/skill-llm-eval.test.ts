/**
 * Tier-2 — LLM-as-judge quality evals.
 *
 * Tier 1 (`skill-validation.test.ts`) proves each skill is STRUCTURALLY sound (frontmatter, folder
 * name, length, drift). Tier 2 proves each skill is QUALITATIVELY sound: it scores the generated
 * skill body against a rubric fixture (`test/fixtures/*.json`), so a rewrite that quietly drops a
 * skill's core discipline — the Iron Law, the OWASP+STRIDE lenses, the deploy hard gate — fails
 * the build instead of shipping.
 *
 * It runs free and deterministic by default (the heuristic anchor judge). Set `FACTORY_EVAL_LLM=1`
 * with a model-judge hook to run the same rubrics against a live model. Every judge here has a
 * NEGATIVE case: a rubric a validator never watched fail is not a validator (§7).
 */
import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderSkill, templatePath } from '../scripts/gen-skill-docs.ts';
import {
  assertRubric,
  explain,
  getJudge,
  heuristicJudge,
  modelJudge,
  type Rubric,
} from './helpers/llm-judge.ts';

const ROOT = join(import.meta.dir, '..');
const FIXTURES_DIR = join(ROOT, 'test', 'fixtures');

function loadRubric(file: string): Rubric {
  const raw = JSON.parse(readFileSync(join(FIXTURES_DIR, file), 'utf-8'));
  assertRubric(raw, file);
  return raw;
}

function fixtureFiles(): string[] {
  return readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();
}

/** The canonical (host-agnostic) generated body for a skill. */
function skillBody(name: string): string {
  const tmpl = readFileSync(templatePath(name), 'utf-8');
  const canonical = renderSkill(name, tmpl).find((f) => f.canonical);
  if (!canonical) throw new Error(`no canonical output for skill '${name}'`);
  return canonical.content;
}

describe('tier-2 fixture integrity', () => {
  const files = fixtureFiles();

  test('there is at least one baseline and one content rubric', () => {
    expect(files).toContain('_baseline.json');
    expect(files.length).toBeGreaterThan(1);
  });

  for (const file of files) {
    test(`${file} is a well-formed rubric`, () => {
      // assertRubric throws with a precise message on any malformed field.
      expect(() => loadRubric(file)).not.toThrow();
    });
  }

  test('assertRubric rejects a malformed rubric (negative case)', () => {
    expect(() => assertRubric({ skill: 'x', intent: 'y', pass_threshold: 0, dimensions: [] })).toThrow();
    expect(() => assertRubric({ skill: 'x', intent: 'y', pass_threshold: 0.9, dimensions: [] })).toThrow();
    expect(() =>
      assertRubric({
        skill: 'x',
        intent: 'y',
        pass_threshold: 0.9,
        dimensions: [{ name: 'd', criterion: 'c', weight: 1, anchors: {} }],
      }),
    ).toThrow();
  });
});

describe('tier-2 heuristic judge (engine self-test)', () => {
  const rubric: Rubric = {
    skill: '_selftest',
    intent: 'engine self-test',
    pass_threshold: 0.8,
    dimensions: [
      { name: 'must-have', criterion: 'contains the marker', weight: 2, anchors: { require_all: ['ALPHA', 'BETA'] } },
      { name: 'one-of', criterion: 'names an option', weight: 1, anchors: { any: ['GAMMA', 'DELTA'], min_any: 1 } },
      { name: 'clean', criterion: 'no banned phrase', weight: 1, anchors: { forbid: ['FORBIDDEN'] } },
    ],
  };

  test('a good candidate passes with full marks', () => {
    const result = heuristicJudge('ALPHA and BETA with GAMMA present', rubric);
    expect(result.pass).toBe(true);
    expect(result.weighted_score).toBe(1);
  });

  test('a candidate missing a required anchor fails (negative case)', () => {
    const result = heuristicJudge('ALPHA only, plus GAMMA', rubric);
    expect(result.pass).toBe(false);
    const missing = result.dimensions.find((d) => d.name === 'must-have');
    expect(missing?.score).toBe(0.5);
    expect(missing?.reasons.join(' ')).toContain('BETA');
  });

  test('a forbidden phrase zeroes its dimension (negative case)', () => {
    const result = heuristicJudge('ALPHA BETA GAMMA but also FORBIDDEN', rubric);
    const clean = result.dimensions.find((d) => d.name === 'clean');
    expect(clean?.score).toBe(0);
    expect(result.pass).toBe(false);
  });

  test('explain() summarises a failing result', () => {
    const line = explain(heuristicJudge('ALPHA only', rubric));
    expect(line).toContain('_selftest');
    expect(line).toContain('FAIL');
  });
});

describe('tier-2 baseline quality (every skill)', () => {
  const baseline = loadRubric('_baseline.json');
  const judge = getJudge();

  // The baseline rubric applies to EVERY generated skill, discovered from templates on disk.
  for (const name of readdirSync(join(ROOT, 'skills')).sort()) {
    const tmplExists = (() => {
      try {
        readFileSync(templatePath(name), 'utf-8');
        return true;
      } catch {
        return false;
      }
    })();
    if (!tmplExists) continue;

    test(`${name} meets the cross-skill quality floor`, async () => {
      const result = await judge(skillBody(name), { ...baseline, skill: name });
      expect(result.pass, explain(result)).toBe(true);
    });
  }
});

describe('tier-2 per-skill discipline', () => {
  const judge = getJudge();
  const contentFixtures = fixtureFiles().filter((f) => f !== '_baseline.json');

  for (const file of contentFixtures) {
    const rubric = loadRubric(file);
    test(`${rubric.skill} keeps its core discipline`, async () => {
      const result = await judge(skillBody(rubric.skill), rubric);
      expect(result.pass, explain(result)).toBe(true);
    });
  }

  test('a rubric fails against an empty candidate (regression guard)', () => {
    const rubric = loadRubric(contentFixtures[0]);
    const result = heuristicJudge('', rubric);
    expect(result.pass).toBe(false);
  });
});

describe('tier-2 model judge (gated)', () => {
  test.skipIf(process.env.FACTORY_EVAL_LLM !== '1')('model judge runs when a hook is wired', async () => {
    const rubric = loadRubric('investigate.json');
    const result = await modelJudge(skillBody('investigate'), rubric);
    expect(typeof result.weighted_score).toBe('number');
  });

  test('model judge throws a clear error when no hook is configured', async () => {
    const prev = (globalThis as Record<string, unknown>).__FACTORY_MODEL_JUDGE__;
    delete (globalThis as Record<string, unknown>).__FACTORY_MODEL_JUDGE__;
    try {
      await expect(modelJudge('x', loadRubric('investigate.json'))).rejects.toThrow('no model judge configured');
    } finally {
      if (prev !== undefined) (globalThis as Record<string, unknown>).__FACTORY_MODEL_JUDGE__ = prev;
    }
  });
});
