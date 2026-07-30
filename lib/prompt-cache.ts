/**
 * prompt-cache — plan where prompt-cache breakpoints go, so a repeated run re-reads the stable
 * prefix (ethos + preamble + skill body) from cache instead of paying full input price every time.
 *
 * The Factory composes hosts; it ships no model client. Two paths benefit, and this module serves
 * both without pretending to own a request:
 *   1. **Interactive path** — a skill runs inside the host CLI (Claude Code), which caches
 *      automatically. Our only lever there is to keep the prompt **stable-first**; `assertStableFirst`
 *      makes that an enforced invariant on the Factory's own prompt assembly, so a later edit can't
 *      silently reorder a volatile segment ahead of a stable one and bust the cache.
 *   2. **Factory-driven structured calls** — a wired eval model-judge, `/second-opinion`, or a future
 *      direct Messages-API host assembles its own request. `planCache` tells it which segments carry a
 *      `cache_control` marker, honouring the provider's breakpoint budget and minimum-prefix rule.
 *
 * Pure and offline-testable: no network, no client. The provider marker shape (Anthropic
 * `cache_control: {type:'ephemeral'}`) is returned as data, applied by whoever owns the client.
 */
import type { HostConfig } from '../scripts/host-config.ts';

export type SegmentKind = 'stable' | 'volatile';

export interface PromptSegment {
  /**
   * `stable` = identical across runs (ethos, preamble, a skill body). `volatile` = per-run (product
   * context, run artifacts, the task). Only a leading run of stable segments is cacheable.
   */
  kind: SegmentKind;
  /** A label for logs/tests, e.g. `preamble`, `skill:plan-design`, `product-context`, `task`. */
  label: string;
  text: string;
}

export interface CacheOptions {
  /** Max cache breakpoints the provider allows (Anthropic = 4). */
  maxBreakpoints: number;
  /** Don't cache a prefix smaller than this — caching a tiny prefix is net-negative. */
  minPrefixTokens: number;
  /** TTL hint recorded on the marker. */
  ttl: CacheTtl;
}

export type CacheTtl = '5m' | '1h';

export interface PlannedSegment extends PromptSegment {
  /** Estimated tokens for this segment. */
  tokens: number;
  /** True when a `cache_control` breakpoint is placed at the END of this segment. */
  cache: boolean;
}

export interface CachePlan {
  segments: PlannedSegment[];
  /** Segment indices that carry a breakpoint (ascending). Empty when nothing is cacheable. */
  breakpoints: number[];
  /** Estimated tokens cached behind the furthest breakpoint. */
  cachedPrefixTokens: number;
  /** Provider marker to apply at each breakpoint. */
  marker: { type: 'ephemeral'; ttl: CacheTtl };
}

/** Cheap, provider-agnostic token estimate (~4 chars/token). Good enough for threshold decisions. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Enforce stable-first: every stable segment must come before the first volatile one. A stable
 * segment that appears AFTER a volatile one cannot be cached — the volatile change ahead of it busts
 * the prefix — so this throws rather than let the caller silently lose the cache.
 */
export function assertStableFirst(segments: readonly PromptSegment[], source = 'segments'): void {
  let sawVolatile = false;
  for (const s of segments) {
    if (s.kind === 'volatile') {
      sawVolatile = true;
    } else if (sawVolatile) {
      throw new Error(
        `${source}: stable segment '${s.label}' follows a volatile one — it cannot be cached. ` +
          'Order all stable segments (ethos/preamble/skill) before volatile ones (context/task).',
      );
    }
  }
}

/**
 * Plan cache breakpoints over an ordered segment list. The leading run of stable segments is the
 * cacheable prefix; a breakpoint at its end caches ethos + preamble + skill body while the volatile
 * per-run suffix stays uncached. When the provider allows more breakpoints and the prefix has several
 * stable segments, extra breakpoints are added at the boundaries **closest to the suffix** (those
 * cache the most, and the provider matches the longest cached prefix), capped at `maxBreakpoints`.
 * Returns no breakpoint when the prefix is below `minPrefixTokens` (caching it would not pay off).
 */
export function planCache(segments: readonly PromptSegment[], opts: CacheOptions): CachePlan {
  assertStableFirst(segments);
  const planned: PlannedSegment[] = segments.map((s) => ({
    ...s,
    tokens: estimateTokens(s.text),
    cache: false,
  }));
  const marker = { type: 'ephemeral' as const, ttl: opts.ttl };

  // The stable prefix is the leading run of stable segments.
  let prefixEnd = -1;
  let prefixTokens = 0;
  for (let i = 0; i < planned.length && planned[i].kind === 'stable'; i++) {
    prefixEnd = i;
    prefixTokens += planned[i].tokens;
  }

  if (prefixEnd < 0 || prefixTokens < opts.minPrefixTokens || opts.maxBreakpoints < 1) {
    return { segments: planned, breakpoints: [], cachedPrefixTokens: 0, marker };
  }

  // Break at the prefix end, then walk back toward the head, keeping the boundaries nearest the
  // suffix (they cache the most), capped at the provider's budget.
  const breakpoints: number[] = [];
  for (let i = prefixEnd; i >= 0 && breakpoints.length < opts.maxBreakpoints; i--) {
    breakpoints.push(i);
    planned[i].cache = true;
  }
  breakpoints.sort((a, b) => a - b);

  return { segments: planned, breakpoints, cachedPrefixTokens: prefixTokens, marker };
}

/**
 * Resolve a host's cache options, or `null` when the host does not support prompt caching (Codex).
 * Lets a caller write `const opts = cacheOptionsFor(host); if (opts) planCache(segments, opts)`.
 */
export function cacheOptionsFor(host: Pick<HostConfig, 'caching'>): CacheOptions | null {
  const c = host.caching;
  if (!c || !c.supported) return null;
  return { maxBreakpoints: c.maxBreakpoints, minPrefixTokens: c.minPrefixTokens, ttl: c.ttl };
}

/** Flatten segments into the single prompt string the CLI path (`claude -p …`) sends. */
export function flattenSegments(segments: readonly PromptSegment[], separator = '\n\n---\n\n'): string {
  return segments.map((s) => s.text).join(separator);
}
