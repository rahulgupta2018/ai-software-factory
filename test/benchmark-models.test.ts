/**
 * benchmark-models — the pure cross-model comparison core.
 *
 * These tests pin the deterministic part: validation (with a negative twin per rule), ranking with
 * a stable tiebreak, spread/mean, agreement classification, the text formatter, and the
 * model-runner seam (injected wins; throws loudly when unwired — there is no offline fallback).
 */
import { describe, expect, test } from 'bun:test';

import {
  assertModelScores,
  compareModels,
  formatComparison,
  getModelRunner,
  type ModelRunner,
  type ModelScore,
} from '../lib/benchmark-models.ts';

const S = (model: string, score: number, pass: boolean): ModelScore => ({ model, score, pass });

describe('assertModelScores', () => {
  test('accepts a well-formed set', () => {
    expect(() => assertModelScores([S('a', 0.9, true), S('b', 0.5, false)])).not.toThrow();
  });

  test('rejects an empty array', () => {
    expect(() => assertModelScores([])).toThrow(/non-empty/);
  });

  test('rejects a duplicate model name', () => {
    expect(() => assertModelScores([S('a', 0.9, true), S('a', 0.4, false)])).toThrow(/duplicate/);
  });

  test('rejects a score outside [0, 1]', () => {
    expect(() => assertModelScores([S('a', 1.2, true)])).toThrow(/\[0, 1\]/);
  });

  test('rejects a non-boolean pass', () => {
    expect(() =>
      assertModelScores([{ model: 'a', score: 0.5, pass: 'yes' } as unknown as ModelScore]),
    ).toThrow(/'pass'/);
  });
});

describe('compareModels', () => {
  test('ranks best-first with a stable name tiebreak', () => {
    const cmp = compareModels([S('zeta', 0.8, true), S('alpha', 0.8, true), S('beta', 0.95, true)]);
    expect(cmp.ranked.map((r) => r.model)).toEqual(['beta', 'alpha', 'zeta']);
    expect(cmp.best).toBe('beta');
    expect(cmp.worst).toBe('zeta');
  });

  test('computes spread and mean, rounded', () => {
    const cmp = compareModels([S('a', 0.9, true), S('b', 0.3, false)]);
    expect(cmp.spread).toBe(0.6);
    expect(cmp.meanScore).toBe(0.6);
  });

  test('classifies unanimous pass / fail / split', () => {
    expect(compareModels([S('a', 0.9, true), S('b', 0.8, true)]).agreement).toBe('unanimous-pass');
    expect(compareModels([S('a', 0.2, false), S('b', 0.1, false)]).agreement).toBe('unanimous-fail');
    expect(compareModels([S('a', 0.9, true), S('b', 0.2, false)]).agreement).toBe('split');
  });

  test('counts passes and total', () => {
    const cmp = compareModels([S('a', 0.9, true), S('b', 0.2, false), S('c', 0.85, true)]);
    expect(cmp.passCount).toBe(2);
    expect(cmp.total).toBe(3);
  });
});

describe('formatComparison', () => {
  test('marks the winner and reports the footer stats', () => {
    const out = formatComparison(compareModels([S('claude', 0.9, true), S('gpt', 0.4, false)]));
    expect(out).toContain('★');
    expect(out).toContain('best=claude');
    expect(out).toContain('worst=gpt');
    expect(out).toContain('agreement=split');
    expect(out).toContain('PASS');
    expect(out).toContain('FAIL');
  });
});

describe('getModelRunner seam', () => {
  const KEY = '__FACTORY_MODEL_RUNNER__' as const;
  const g = globalThis as { __FACTORY_MODEL_RUNNER__?: ModelRunner };

  test('throws loudly when no runner is wired', () => {
    const prev = g[KEY];
    delete g[KEY];
    try {
      expect(() => getModelRunner()).toThrow(/no model runner configured/);
    } finally {
      if (prev) g[KEY] = prev;
    }
  });

  test('returns the injected runner and passes model + prompt through', async () => {
    const prev = g[KEY];
    const seen: Array<[string, string]> = [];
    g[KEY] = (model, prompt) => {
      seen.push([model, prompt]);
      return `out:${model}`;
    };
    try {
      const runner = getModelRunner();
      const result = await runner('claude', 'hello');
      expect(result).toBe('out:claude');
      expect(seen).toEqual([['claude', 'hello']]);
    } finally {
      if (prev) g[KEY] = prev;
      else delete g[KEY];
    }
  });
});
