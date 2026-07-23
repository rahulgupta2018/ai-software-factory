/**
 * Eval selection — which E2E scenarios run, given a set of changed files and a tier.
 *
 * Two ideas, both borrowed from gstack and both pure so they are provable in `bun test`:
 *
 *   1. Diff-based selection. A scenario is only worth its paid run when something that could change
 *      its behaviour changed. A scenario is tied to one skill; editing `skills/review/SKILL.md.tmpl`
 *      selects the `review` scenarios and nothing else. Editing a GLOBAL touchfile (the generator,
 *      a shared resolver, the host configs, this file, the runner) changes every skill's rendered
 *      output, so it selects everything.
 *   2. Gate vs periodic tiers. `gate` scenarios are deterministic safety/functional checks that
 *      block a merge; `periodic` scenarios are quality/non-deterministic checks run on a cadence.
 *      CI runs `gate`; the weekly job runs `periodic`.
 *
 * This module decides *what* runs. It never spawns anything — that is the runner's job.
 */

export type EvalTier = 'gate' | 'periodic';

/** The selection-relevant shape of a scenario. Full scenarios carry more (see e2e-runner.ts). */
export interface SelectableScenario {
  skill: string;
  tier: EvalTier;
}

/**
 * Paths whose change invalidates EVERY scenario. A prefix match counts (a directory touchfile
 * covers all files under it). Keep this list tight — an over-broad entry makes diff-selection
 * degenerate into "always run everything".
 */
export const GLOBAL_TOUCHFILES: readonly string[] = [
  'scripts/gen-skill-docs.ts',
  'scripts/resolvers/',
  'hosts/',
  'lib/eval-select.ts',
  'test/helpers/e2e-runner.ts',
];

/** The skill a changed path belongs to, or null when the path is not skill-specific. */
export function skillForPath(path: string): string | null {
  const normalized = path.replace(/^\.\//, '');
  const m = normalized.match(/^skills\/([^/]+)\//);
  return m ? m[1] : null;
}

/** True when a changed path is a global touchfile (exact file or under a directory prefix). */
export function isGlobalTouch(path: string): boolean {
  const normalized = path.replace(/^\.\//, '');
  return GLOBAL_TOUCHFILES.some((t) =>
    t.endsWith('/') ? normalized.startsWith(t) : normalized === t,
  );
}

export interface ChangeSet {
  /** Skills touched by skill-specific file changes. */
  skills: Set<string>;
  /** True when any changed path is a global touchfile — everything is in blast radius. */
  global: boolean;
}

/** Reduce a list of repo-root-relative changed paths to the change set selection cares about. */
export function analyzeChanges(paths: string[]): ChangeSet {
  const skills = new Set<string>();
  let global = false;
  for (const path of paths) {
    if (isGlobalTouch(path)) {
      global = true;
      continue;
    }
    const skill = skillForPath(path);
    if (skill) skills.add(skill);
  }
  return { skills, global };
}

export interface SelectOptions {
  /**
   * Repo-root-relative changed paths. `undefined` means "no diff filter" — every scenario is in
   * scope (subject to the tier filter). An empty array means "nothing changed" — no scenario is
   * selected unless a global touchfile is among them (it isn't).
   */
  changedPaths?: string[];
  /** Restrict to one tier. `undefined` keeps both. */
  tier?: EvalTier;
  /** Force every scenario regardless of the diff (the `:all` escape hatch). */
  all?: boolean;
}

/**
 * Select the scenarios to run. Order preserved from the input. A scenario survives when:
 *   - its tier matches (or no tier filter is set), AND
 *   - `all` is set, OR no `changedPaths` filter is given, OR a global touchfile changed, OR its
 *     skill is in the changed-skill set.
 */
export function selectScenarios<T extends SelectableScenario>(
  scenarios: readonly T[],
  opts: SelectOptions = {},
): T[] {
  const tierFiltered = opts.tier ? scenarios.filter((s) => s.tier === opts.tier) : [...scenarios];

  if (opts.all || opts.changedPaths === undefined) return tierFiltered;

  const { skills, global } = analyzeChanges(opts.changedPaths);
  if (global) return tierFiltered;

  return tierFiltered.filter((s) => skills.has(s.skill));
}
