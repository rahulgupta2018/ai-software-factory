/**
 * eval:select — preview which E2E scenarios the harness would run, given a diff and a tier.
 *
 * This is the read-only companion to `test/skill-e2e.test.ts`: it uses the SAME
 * `selectScenarios` logic (`lib/eval-select.ts`) and the SAME scenario fixtures, so what it prints
 * is exactly what a live run would execute. It never spawns an agent.
 *
 * Changed files come from `--changed <path> ...`, or from git (`git diff --name-only <base>...HEAD`)
 * when `--base <ref>` is given, or — with neither — every scenario is in scope (the "no filter"
 * case). `--tier gate|periodic` narrows the tier (default: both). `--all` ignores the diff.
 * `--json` prints machine-readable output.
 *
 * Run:  fac eval:select [--base main] [--changed a b …] [--tier gate] [--all] [--json]
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { selectScenarios, type EvalTier, type SelectableScenario } from '../lib/eval-select.ts';

const ROOT = join(import.meta.dir, '..');
const E2E_DIR = join(ROOT, 'test', 'fixtures', 'e2e');

interface Scenario extends SelectableScenario {
  file: string;
  intent: string;
}

function loadScenarios(): Scenario[] {
  return readdirSync(E2E_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((file) => {
      const raw = JSON.parse(readFileSync(join(E2E_DIR, file), 'utf-8'));
      return { file, skill: raw.skill, tier: raw.tier, intent: raw.intent };
    });
}

function flagValues(name: string): string[] {
  const out: string[] = [];
  const argv = process.argv.slice(2);
  const idx = argv.indexOf(name);
  if (idx === -1) return out;
  for (let i = idx + 1; i < argv.length && !argv[i].startsWith('--'); i++) out.push(argv[i]);
  return out;
}

function flag(name: string): string | undefined {
  return flagValues(name)[0];
}

function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(name);
}

function gitChanged(base: string): string[] {
  const r = spawnSync('git', ['diff', '--name-only', `${base}...HEAD`], {
    cwd: ROOT,
    encoding: 'utf-8',
  });
  if (r.status !== 0) {
    console.error(`eval:select — git diff against '${base}' failed: ${r.stderr ?? ''}`);
    process.exit(1);
  }
  return (r.stdout ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
}

function main(): void {
  const scenarios = loadScenarios();

  const base = flag('--base');
  const explicit = flagValues('--changed');
  const tierArg = flag('--tier');
  const all = hasFlag('--all');
  const asJson = hasFlag('--json');

  if (tierArg && tierArg !== 'gate' && tierArg !== 'periodic') {
    console.error("eval:select — --tier must be 'gate' or 'periodic'");
    process.exit(1);
  }
  const tier = tierArg as EvalTier | undefined;

  // Precedence: --changed wins; else --base derives from git; else no diff filter.
  const changedPaths = explicit.length > 0 ? explicit : base ? gitChanged(base) : undefined;

  const selected = selectScenarios(scenarios, { changedPaths, tier, all });

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          tier: tier ?? 'all',
          changed: changedPaths ?? null,
          all,
          selected: selected.map((s) => ({ skill: s.skill, tier: s.tier, file: s.file })),
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(
    `eval:select — tier=${tier ?? 'all'}  diff=${
      changedPaths ? `${changedPaths.length} file(s)` : 'none (all in scope)'
    }${all ? '  [--all]' : ''}`,
  );
  if (selected.length === 0) {
    console.log('  (no scenarios selected)');
    return;
  }
  for (const s of selected) {
    console.log(`  ✔ ${s.skill.padEnd(16)} [${s.tier}]  ${s.intent}`);
  }
  console.log(`\n  ${selected.length} of ${scenarios.length} scenario(s) selected.`);
}

main();
