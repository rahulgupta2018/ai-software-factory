#!/usr/bin/env bun
/**
 * install — install the generated skills into every detected host, then verify each landed.
 *
 * The layout, method, and prefix come from the pure planner (`lib/install-plan.ts`); this script
 * does the filesystem work and the honest post-check. It is idempotent (removes an existing target
 * before recreating it) and safe to re-run.
 *
 * Claude Code skills are installed **per-skill** at `~/.claude/skills/fac-<name>/SKILL.md`, a copy
 * whose frontmatter `name` is prefixed `fac-` (so it invokes as `/fac-<name>` and never collides
 * with a built-in command). Codex keeps its whole-dir link. A stale prior layout (the old
 * `~/.claude/skills/factory` nesting Claude couldn't discover) is removed first.
 *
 * `--check` / `--soft` install nothing: they compare each installed skill's version against the repo
 * and report any that lag (a stale install silently reproduces pre-fix behaviour on the next run).
 * `--check` exits non-zero on drift (a gate); `--soft` only advises and stays silent when nothing is
 * installed, so it is safe to chain after `build`.
 *
 * Run:  fac install [--dry-run] [--json] [--check | --soft]
 */
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

import {
  INSTALL_PREFIX,
  classifySkillSync,
  isDrift,
  parseSkillVersion,
  planInstall,
  transformForInstall,
  type InstallEntry,
  type InstallPlan,
  type SkillSyncRow,
} from '../lib/install-plan.ts';
import { skillNames } from './gen-skill-docs.ts';

const ROOT = join(import.meta.dir, '..');

function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(name);
}

function detectClis(candidates: readonly string[]): string[] {
  return candidates.filter((cli) => Boolean(Bun.which(cli)));
}

/** Does a path exist as a file/dir/symlink (including a broken symlink)? */
function pathPresent(p: string): boolean {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

/** Apply one install entry. Idempotent: an existing target is removed first. */
function applyEntry(entry: InstallEntry, skills: readonly string[]): void {
  rmSync(entry.dest, { recursive: true, force: true });
  if (entry.kind === 'skill') {
    // Copy just the generated SKILL.md, transformed so it invokes AND cross-references as /fac-<name>.
    mkdirSync(entry.dest, { recursive: true });
    const content = readFileSync(join(entry.source, 'SKILL.md'), 'utf-8');
    writeFileSync(join(entry.dest, 'SKILL.md'), transformForInstall(content, skills, INSTALL_PREFIX));
    return;
  }
  mkdirSync(dirname(entry.dest), { recursive: true });
  if (entry.method === 'symlink') symlinkSync(entry.source, entry.dest);
  else cpSync(entry.source, entry.dest, { recursive: true });
}

/** Confirm the target landed: a prefixed skill file (skill) or a resolving link/copy (dir). */
function verifyEntry(entry: InstallEntry): boolean {
  if (entry.kind === 'skill') {
    const skillFile = join(entry.dest, 'SKILL.md');
    if (!existsSync(skillFile)) return false;
    // The installed name must be prefixed — that is what makes it /fac-<name>, not a shadowed built-in.
    return new RegExp(`^name:[ \\t]*${INSTALL_PREFIX}`, 'm').test(readFileSync(skillFile, 'utf-8'));
  }
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

interface HostResult {
  host: string;
  installed: number;
  failed: number;
  skipped: boolean;
  reason: string;
}

/** Read a file, or '' if it is not there — so a missing SKILL.md parses to a null version. */
function readIfPresent(p: string): string {
  try {
    return readFileSync(p, 'utf-8');
  } catch {
    return '';
  }
}

/**
 * Compare each Claude skill's installed version against the repo's, without installing anything.
 * `--check` exits non-zero on any drift (stale/missing); `--soft` only advises (always exit 0) and
 * stays silent when nothing is installed on this host — safe to chain after `build` in CI.
 */
function runCheck(plan: InstallPlan, asJson: boolean, soft: boolean): number {
  const rows: SkillSyncRow[] = [];
  for (const entry of plan.entries) {
    if (entry.host !== 'claude' || entry.kind !== 'skill' || entry.action !== 'link') continue;
    const source = parseSkillVersion(readIfPresent(join(entry.source, 'SKILL.md')));
    const installed = parseSkillVersion(readIfPresent(join(entry.dest, 'SKILL.md')));
    rows.push({ name: entry.installedName ?? '', source, installed, status: classifySkillSync(source, installed) });
  }

  const drift = rows.filter((r) => isDrift(r.status));
  const installedCount = rows.filter((r) => r.installed !== null).length;
  // Soft mode is for the build chain: nothing installed here (e.g. CI) → nothing to warn about.
  const silent = soft && installedCount === 0;

  if (asJson) {
    console.log(JSON.stringify({ mode: soft ? 'soft' : 'check', rows, drift: drift.length }, null, 2));
  } else if (!silent) {
    printCheck(rows, drift, soft);
  }
  // --check fails on drift so a script/CI gate catches it; --soft never fails the caller.
  return !soft && drift.length > 0 ? 1 : 0;
}

function printCheck(rows: SkillSyncRow[], drift: SkillSyncRow[], soft: boolean): void {
  const label = soft ? 'install:check (advisory)' : 'install --check';
  if (rows.length === 0) {
    console.log(`${label} — no Claude skills installed (nothing to compare).`);
    return;
  }
  if (drift.length === 0) {
    const ahead = rows.filter((r) => r.status === 'ahead');
    console.log(`${label} — all ${rows.length} installed skill(s) match the repo.`);
    for (const r of ahead) console.log(`  ! ${r.name.padEnd(22)} installed ${r.installed} > repo ${r.source} (repo not regenerated?)`);
    return;
  }
  console.log(`${label} — ${drift.length} of ${rows.length} skill(s) lag the repo:`);
  for (const r of drift) {
    const detail =
      r.status === 'missing' ? 'not installed' : `installed ${r.installed} < repo ${r.source}`;
    console.log(`  ✗ ${r.name.padEnd(22)} ${detail}`);
  }
  console.log('  → run `./setup` (or `bun scripts/install.ts`) to refresh — Claude Code loads skills at session start.');
}

function main(): void {
  const dryRun = hasFlag('--dry-run');
  const asJson = hasFlag('--json');
  const check = hasFlag('--check');
  const soft = hasFlag('--soft');
  const skills = skillNames();
  const plan = planInstall({
    root: ROOT,
    home: homedir(),
    platform: process.platform,
    availableClis: detectClis(['claude', 'codex']),
    skills,
  });

  // Read-only drift check — report which installed skills lag the repo, install nothing.
  if (check || soft) {
    process.exit(runCheck(plan, asJson, soft && !check));
  }

  // Remove any stale prior-layout install first (the old ~/.claude/skills/factory nesting).
  const cleaned: string[] = [];
  if (!dryRun) {
    for (const p of plan.legacyPaths) {
      if (pathPresent(p)) {
        rmSync(p, { recursive: true, force: true });
        cleaned.push(p);
      }
    }
  }

  const byHost = new Map<string, HostResult>();
  const record = (host: string): HostResult => {
    let r = byHost.get(host);
    if (!r) {
      r = { host, installed: 0, failed: 0, skipped: false, reason: '' };
      byHost.set(host, r);
    }
    return r;
  };

  for (const entry of plan.entries) {
    const r = record(entry.host);
    if (entry.action === 'skip') {
      r.skipped = true;
      r.reason = entry.reason;
      continue;
    }
    if (dryRun) {
      r.installed++;
      r.reason = `would ${entry.method}`;
      continue;
    }
    applyEntry(entry, skills);
    if (verifyEntry(entry)) r.installed++;
    else r.failed++;
  }

  const results = [...byHost.values()];
  const failed = results.reduce((n, r) => n + r.failed, 0);

  if (asJson) {
    console.log(JSON.stringify({ platform: plan.platform, dryRun, cleaned, results }, null, 2));
  } else {
    printHuman(dryRun, cleaned, results);
  }

  process.exit(failed > 0 ? 1 : 0);
}

function printHuman(dryRun: boolean, cleaned: string[], results: HostResult[]): void {
  console.log(`install —${dryRun ? ' dry run' : ''}`);
  for (const p of cleaned) console.log(`  removed stale ${p}`);
  for (const r of results) {
    if (r.skipped) {
      console.log(`    ${r.host.padEnd(8)} ${r.reason}`);
      continue;
    }
    const mark = r.failed > 0 ? '✗' : '✔';
    const verb = dryRun ? 'would install' : 'installed';
    const suffix = r.host === 'claude' ? ` as /${INSTALL_PREFIX}<name>` : '';
    const fail = r.failed > 0 ? `, ${r.failed} failed` : '';
    console.log(`  ${mark} ${r.host.padEnd(8)} ${verb} ${r.installed} skill(s)${suffix}${fail}`);
  }
  if (!dryRun) console.log('  → start a NEW Claude Code session to pick them up (skills load at session start).');
}

if (import.meta.main) {
  try {
    main();
  } catch (err) {
    console.error(`install — ${(err as Error).message}`);
    process.exit(1);
  }
}
