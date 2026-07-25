/**
 * install-plan — the host-install layout, as one pure planner.
 *
 * The `setup` script's job is to make the generated skills discoverable by each host CLI.
 *
 * **Claude Code** discovers a skill at `~/.claude/skills/<name>/SKILL.md` — ONE level deep. The old
 * layout linked the whole `skills/` dir to `~/.claude/skills/factory`, nesting each skill a level
 * too deep (`factory/<name>/SKILL.md`), so Claude never found them. We now install each skill
 * directly at `~/.claude/skills/fac-<name>/` — depth 1, and **prefixed `fac-`** so a workflow skill
 * never collides with a built-in Claude command (`/review`, `/guard`, …). Because Claude identifies
 * a skill by its frontmatter `name`, the installed copy has that field rewritten to `fac-<name>`
 * (see `applySkillPrefix`), which is why Claude skills are *copied*, not symlinked.
 *
 * **Codex** reads `~/.codex/prompts/`; its whole-dir layout is unchanged here.
 *
 * Deciding *what* installs where, and *how* (a symlink on Unix, a copy on Windows where symlinks
 * silently freeze without Developer Mode) used to live in bash — untestable and easy to get subtly
 * wrong. This module is the pure, tested core: given the repo root, the home dir, the platform, the
 * skills, and which host CLIs are on PATH, it returns exactly the actions to take.
 * `scripts/install.ts` executes and verifies the plan.
 */
import { join } from 'node:path';

export type LinkMethod = 'symlink' | 'copy';
export type LinkAction = 'link' | 'skip';
/** `skill` = one prefixed, name-rewritten copy per skill (Claude). `dir` = whole-dir link (Codex). */
export type EntryKind = 'skill' | 'dir';

/** The prefix every installed workflow command carries, so it can't shadow a built-in host command. */
export const INSTALL_PREFIX = 'fac-';

export interface InstallEntry {
  host: string;
  /** The CLI whose presence on PATH gates the install. */
  cli: string;
  kind: EntryKind;
  source: string;
  dest: string;
  method: LinkMethod;
  action: LinkAction;
  reason: string;
  /** For `kind: 'skill'`: the installed (prefixed) command name, e.g. `fac-discover`. */
  installedName?: string;
}

export interface InstallPlan {
  platform: string;
  method: LinkMethod;
  entries: InstallEntry[];
  linkCount: number;
  skipCount: number;
  /** Stale paths a prior layout created that this install should remove first. */
  legacyPaths: string[];
}

export interface InstallEnv {
  root: string;
  home: string;
  /** `process.platform` (e.g. 'darwin', 'linux', 'win32'). */
  platform: string;
  /** Host CLIs found on PATH. */
  availableClis: readonly string[];
  /** The workflow skills to install (folder names under `skills/`). */
  skills: readonly string[];
}

/**
 * Platforms where symlinks are unreliable (Windows without Developer Mode turns `ln -s` into a
 * frozen copy that never refreshes on pull). There we copy explicitly and re-copy on every setup.
 */
const COPY_PLATFORMS = new Set(['win32', 'cygwin', 'msys']);

/** How to install a *whole-dir* target on a platform: copy on Windows-family, symlink elsewhere. */
export function linkMethodFor(platform: string): LinkMethod {
  return COPY_PLATFORMS.has(platform) ? 'copy' : 'symlink';
}

/**
 * Rewrite a SKILL.md's frontmatter `name:` to a prefixed one, so the installed skill invokes as
 * `/<prefix><name>`. Claude identifies a skill by this field, so a folder rename alone is not
 * enough. Idempotent — an already-prefixed name is left as is. Pure string op.
 */
export function applySkillPrefix(content: string, prefix: string): string {
  return content.replace(/^(name:[ \t]*)(\S+)/m, (_m, key: string, name: string) =>
    name.startsWith(prefix) ? `${key}${name}` : `${key}${prefix}${name}`,
  );
}

/** Legacy install paths a prior layout left behind, to be removed before a fresh install. */
export function legacyPaths(home: string): string[] {
  return [join(home, '.claude', 'skills', 'factory')];
}

// ── Uninstall ──────────────────────────────────────────────────────────────────
//
// Uninstall reverses what install put under the user's home so the install can be tested from a
// clean state (install → uninstall → reinstall). The dynamic per-skill dirs are discovered at
// runtime by their `fac-` prefix; these pure helpers decide *what counts* and *where the fixed
// paths are*, and strip the PATH block setup may have added — all testable without touching a disk.

/** Is a `~/.claude/skills/<name>` dir one this Factory installed? (Prefix-owned, so safe to remove.) */
export function isFactorySkillDir(name: string): boolean {
  return name.startsWith(INSTALL_PREFIX);
}

/** The fixed host dirs a full uninstall removes (per-skill `fac-*` dirs are found by prefix). */
export function uninstallFixedPaths(home: string): { skillsDir: string; legacyClaude: string; codex: string } {
  return {
    skillsDir: join(home, '.claude', 'skills'),
    legacyClaude: join(home, '.claude', 'skills', 'factory'),
    codex: join(home, '.codex', 'prompts', 'factory'),
  };
}

/** Marker on the PATH block `setup` appends to a shell rc, so uninstall removes only *our* block. */
export const BUN_PATH_MARKER = 'AI Software Factory — Bun global bin';

/**
 * Remove the `~/.bun/bin` PATH block `setup` added to a shell rc, anchored on `BUN_PATH_MARKER` so
 * a hand-written or Bun-installer PATH line is left untouched. Idempotent — no marker, no change.
 * Pure string op.
 */
export function stripBunPathBlock(content: string): string {
  const lines = content.split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(BUN_PATH_MARKER)) {
      if (out.length > 0 && out[out.length - 1].trim() === '') out.pop(); // drop the blank we added
      i++; // skip the marker line, then its export lines
      while (i < lines.length && /^\s*export\s+(BUN_INSTALL|PATH)=/.test(lines[i])) i++;
      i--; // the for-loop's ++ lands on the next kept line
      continue;
    }
    out.push(lines[i]);
  }
  return out.join('\n');
}

/** Resolve the full install plan. Pure — no filesystem access. */
export function planInstall(env: InstallEnv): InstallPlan {
  const available = new Set(env.availableClis);
  const entries: InstallEntry[] = [];

  // Claude Code — one prefixed, name-rewritten copy per skill at ~/.claude/skills/fac-<name>/.
  if (available.has('claude')) {
    for (const name of env.skills) {
      const installedName = `${INSTALL_PREFIX}${name}`;
      entries.push({
        host: 'claude',
        cli: 'claude',
        kind: 'skill',
        source: join(env.root, 'skills', name),
        dest: join(env.home, '.claude', 'skills', installedName),
        method: 'copy', // must copy to rewrite the frontmatter name
        action: 'link',
        reason: `copy skill → ~/.claude/skills/${installedName}`,
        installedName,
      });
    }
  } else {
    entries.push({
      host: 'claude',
      cli: 'claude',
      kind: 'skill',
      source: join(env.root, 'skills'),
      dest: join(env.home, '.claude', 'skills'),
      method: 'copy',
      action: 'skip',
      reason: 'claude not found on PATH — skipped',
    });
  }

  // Codex — whole-dir link, unchanged.
  const codexPresent = available.has('codex');
  const method = linkMethodFor(env.platform);
  entries.push({
    host: 'codex',
    cli: 'codex',
    kind: 'dir',
    source: join(env.root, '.codex', 'skills'),
    dest: join(env.home, '.codex', 'prompts', 'factory'),
    method,
    action: codexPresent ? 'link' : 'skip',
    reason: codexPresent
      ? `${method} .codex/skills → ~/.codex/prompts/factory`
      : 'codex not found on PATH — skipped',
  });

  const linkCount = entries.filter((e) => e.action === 'link').length;
  return {
    platform: env.platform,
    method,
    entries,
    linkCount,
    skipCount: entries.length - linkCount,
    legacyPaths: legacyPaths(env.home),
  };
}
