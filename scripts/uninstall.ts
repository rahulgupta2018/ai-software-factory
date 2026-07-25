#!/usr/bin/env bun
/**
 * uninstall — reverse what `install` / `./setup` put under your home, so the install can be tested
 * from a clean state (install → uninstall → reinstall).
 *
 * Default: remove the installed Claude skills (`~/.claude/skills/fac-*`), the legacy layout
 * (`~/.claude/skills/factory`), and the Codex link (`~/.codex/prompts/factory`). This is all you
 * need to re-test the skill install.
 *
 * `--all` additionally tears down the CLI: `bun unlink` (drops the global `fac`) and removes the
 * `~/.bun/bin` PATH block `setup` appended to your shell rc (only our marker-anchored block).
 *
 * Run:  fac uninstall [--all] [--dry-run] [--json]
 */
import { existsSync, lstatSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';

import { isFactorySkillDir, stripBunPathBlock, uninstallFixedPaths } from '../lib/install-plan.ts';

const ROOT = join(import.meta.dir, '..');

function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(name);
}

function pathPresent(p: string): boolean {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

/** The `~/.claude/skills/fac-*` dirs currently installed (found by prefix). */
function installedSkillDirs(skillsDir: string): string[] {
  if (!existsSync(skillsDir)) return [];
  return readdirSync(skillsDir)
    .filter(isFactorySkillDir)
    .map((name) => join(skillsDir, name))
    .sort();
}

/** The shell rc `setup` would have written the PATH block to (matches setup's own logic). */
function shellRc(home: string): string {
  const shell = basename(process.env.SHELL ?? 'bash');
  if (shell === 'zsh') return join(home, '.zshrc');
  if (shell === 'bash') return join(home, '.bashrc');
  return join(home, '.profile');
}

function main(): void {
  const dryRun = hasFlag('--dry-run');
  const asJson = hasFlag('--json');
  const all = hasFlag('--all');
  const home = homedir();
  const fixed = uninstallFixedPaths(home);

  const removed: string[] = [];
  const notes: string[] = [];

  // Targets: every installed fac-* skill dir, the legacy layout, the Codex link.
  const targets = [...installedSkillDirs(fixed.skillsDir), fixed.legacyClaude, fixed.codex].filter(pathPresent);
  for (const p of targets) {
    if (!dryRun) rmSync(p, { recursive: true, force: true });
    removed.push(p);
  }

  if (all) {
    // Drop the global `fac` CLI link.
    if (!dryRun) {
      const r = spawnSync('bun', ['unlink'], { cwd: ROOT, stdio: 'ignore' });
      notes.push(r.status === 0 ? 'bun unlink — removed the global fac CLI' : 'bun unlink — nothing to unlink');
    } else {
      notes.push('would bun unlink (remove the global fac CLI)');
    }
    // Remove only our marker-anchored PATH block from the shell rc.
    const rc = shellRc(home);
    if (existsSync(rc)) {
      const before = readFileSync(rc, 'utf-8');
      const after = stripBunPathBlock(before);
      if (after !== before) {
        if (!dryRun) writeFileSync(rc, after);
        notes.push(`${dryRun ? 'would remove' : 'removed'} the Bun PATH block from ${rc}`);
      }
    }
  } else {
    notes.push('kept the fac CLI + PATH (use --all to remove those too)');
  }

  if (asJson) {
    console.log(JSON.stringify({ dryRun, all, removed, notes }, null, 2));
  } else {
    console.log(`uninstall —${dryRun ? ' dry run' : ''}`);
    if (removed.length === 0) console.log('  nothing installed to remove');
    for (const p of removed) console.log(`  ${dryRun ? 'would remove' : 'removed'} ${p}`);
    for (const n of notes) console.log(`  ${n}`);
    if (!dryRun && removed.some((p) => p.includes('.claude'))) {
      console.log('  → the commands stay in any OPEN Claude session until it restarts.');
    }
  }
}

if (import.meta.main) {
  try {
    main();
  } catch (err) {
    console.error(`uninstall — ${(err as Error).message}`);
    process.exit(1);
  }
}
