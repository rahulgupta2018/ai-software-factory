/**
 * prompt-cache — the cache-breakpoint planner. Pure, so every branch gets a negative twin.
 */
import { describe, expect, test } from 'bun:test';

import {
  assertStableFirst,
  cacheOptionsFor,
  estimateTokens,
  flattenSegments,
  planCache,
  type CacheOptions,
  type PromptSegment,
} from '../lib/prompt-cache.ts';
import { claude } from '../hosts/claude.ts';
import { codex } from '../hosts/codex.ts';

const OPTS: CacheOptions = { maxBreakpoints: 4, minPrefixTokens: 10, ttl: '1h' };

// A big stable body so the prefix clears minPrefixTokens; a small volatile tail.
const big = (label: string): PromptSegment => ({ kind: 'stable', label, text: 'x'.repeat(400) });
const tail = (label: string): PromptSegment => ({ kind: 'volatile', label, text: 'task' });

describe('estimateTokens', () => {
  test('~4 chars per token, rounded up', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2); // 5/4 → ceil 2
  });
});

describe('assertStableFirst', () => {
  test('accepts stable segments before volatile ones', () => {
    expect(() => assertStableFirst([big('preamble'), tail('task')])).not.toThrow();
  });

  test('rejects a stable segment after a volatile one (negative — cache-busting order)', () => {
    expect(() => assertStableFirst([tail('task'), big('skill')])).toThrow(/cannot be cached/);
  });
});

describe('planCache', () => {
  test('breaks at every stable boundary (budget permitting), leaving the volatile tail uncached', () => {
    const plan = planCache([big('preamble'), big('skill'), tail('task')], OPTS);
    // With budget to spare, both stable boundaries break — a breakpoint after the shared preamble
    // lets a different skill reuse the cached preamble even when its skill body differs.
    expect(plan.breakpoints).toEqual([0, 1]);
    expect(plan.segments[0].cache).toBe(true);
    expect(plan.segments[1].cache).toBe(true);
    expect(plan.segments[2].cache).toBe(false); // the task is never cached
    expect(plan.marker).toEqual({ type: 'ephemeral', ttl: '1h' });
    expect(plan.cachedPrefixTokens).toBeGreaterThan(0);
  });

  test('adds extra breakpoints nearest the suffix, capped at maxBreakpoints', () => {
    const segs = [big('a'), big('b'), big('c'), tail('task')];
    const plan = planCache(segs, { ...OPTS, maxBreakpoints: 2 });
    expect(plan.breakpoints).toEqual([1, 2]); // the two boundaries closest to the tail, not index 0
  });

  test('no breakpoint when the prefix is below minPrefixTokens (negative)', () => {
    const plan = planCache([{ kind: 'stable', label: 'tiny', text: 'hi' }, tail('task')], OPTS);
    expect(plan.breakpoints).toEqual([]);
    expect(plan.cachedPrefixTokens).toBe(0);
  });

  test('no breakpoint when the provider budget is zero (negative)', () => {
    const plan = planCache([big('skill'), tail('task')], { ...OPTS, maxBreakpoints: 0 });
    expect(plan.breakpoints).toEqual([]);
  });

  test('no breakpoint when there is no leading stable prefix (negative)', () => {
    const plan = planCache([tail('task'), tail('more')], OPTS);
    expect(plan.breakpoints).toEqual([]);
  });
});

describe('cacheOptionsFor — host declaration', () => {
  test('Claude supports caching → concrete options', () => {
    expect(cacheOptionsFor(claude)).toEqual({ maxBreakpoints: 4, minPrefixTokens: 1024, ttl: '1h' });
  });

  test('Codex does not support caching → null (negative)', () => {
    expect(cacheOptionsFor(codex)).toBeNull();
  });
});

describe('flattenSegments', () => {
  test('joins segment text with the separator', () => {
    expect(flattenSegments([big('a'), tail('b')], '\n--\n')).toBe(`${'x'.repeat(400)}\n--\ntask`);
  });
});
