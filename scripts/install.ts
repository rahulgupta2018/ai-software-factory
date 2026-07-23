#!/usr/bin/env bun
/**
 * install — link (or copy) the generated skills into every detected host, then verify each landed.
 *
 * The layout and per-platform method come from the pure planner (`lib/install-plan.ts`); this
 * script does the filesystem work and the honest post-check. It is idempotent (removes an existing
 * target before recreating it), safe to re-run, and on Windows copies instead of symlinking so the
 * install doesn't silently freeze. `setup` calls this; you can also run `fac install` directly.
 *
 * Run:  fac install [--dry-run] [--json]
 */
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

import { planInstall, type InstallEntry, type LinkMethod } from '../lib/install-plan.ts';

const ROOT = join(import.meta.dir, '..');

function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(name);
}

function detectClis(candidates: readonly string[]): string[] {
  return candidates.filter((cli) => Boolean(Bun.which(cli)));
}

/** Create the link/copy at `dest`. Idempotent: an existing target is removed first. */
function applyEntry(entry: InstallEntry): void {
  mkdirSync(dirname(entry.dest), { recursive: true });
  rmSync(entry.dest, { recursive: true, force: true });
  if (entry.method === 'symlink') {
    symlinkSync(entry.source, entry.dest);
  } else {
    cpSync(entry.source, entry.dest, { recursive: true });
  }
}

/** Confirm the target actually resolves back to the source (symlink) or exists (copy). */
function verifyEntry(entry: InstallEntry): boolean {
  if (!existsSync(entry.dest)) return false;
  if (entry.method === 'symlink') {
    if (!lstatSync(entry.dest).isSymbolicLink()) return false;
    try {
      return realpathSync(entry.dest) === realpathSync(entry.source);
    } catch {
      return false;
    }
  }
  return true;
}

function main(): void {
  const dryRun = hasFlag('--dry-run');
  const asJson = hasFlag('--json');
  const plan = planInstall({
    root: ROOT,
    home: homedir(),
    platform: process.platform,
    availableClis: detectClis(['claude', 'codex']),
  });

  const results: Array<{ host: string; action: string; verified: boolean | null; reason: string }> = [];
  let failed = 0;

  for (const entry of plan.entries) {
    if (entry.action === 'skip') {
      results.push({ host: entry.host, action: 'skip', verified: null, reason: entry.reason });
      continue;
    }
    if (dryRun) {
      results.push({ host: entry.host, action: `would ${entry.method}`, verified: null, reason: entry.reason });
      continue;
    }
    applyEntry(entry);
    const verified = verifyEntry(entry);
    if (!verified) failed++;
    results.push({ host: entry.host, action: entry.method, verified, reason: entry.reason });
  }

  if (asJson) {
    console.log(JSON.stringify({ platform: plan.platform, method: plan.method, dryRun, results }, null, 2));
  } else {
    printHuman(plan.method, dryRun, results);
  }

  process.exit(failed > 0 ? 1 : 0);
}

function printHuman(
  method: LinkMethod,
  dryRun: boolean,
  results: Array<{ host: string; action: string; verified: boolean | null; reason: string }>,
): void {
  console.log(`install — ${dryRun ? 'dry run, ' : ''}method=${method}`);
  for (const r of results) {
    const mark = r.verified === null ? ' ' : r.verified ? '✔' : '✗';
    console.log(`  ${mark} ${r.host.padEnd(8)} ${r.reason}`);
  }
  if (method === 'copy' && !dryRun) {
    console.log('  note: Windows copies skills instead of symlinking — re-run ./setup after each git pull.');
  }
}

if (import.meta.main) {
  try {
    main();
  } catch (err) {
    console.error(`install — ${(err as Error).message}`);
    process.exit(1);
  }
}
