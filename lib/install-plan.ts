/**
 * install-plan — the host-install layout, as one pure planner.
 *
 * The `setup` script's job is to make the generated skills discoverable by each host CLI: Claude
 * Code reads `~/.claude/skills/`, Codex reads `~/.codex/prompts/`. Deciding *what* links where, and
 * *how* (a symlink on Unix, a copy on Windows where symlinks silently freeze without Developer
 * Mode), used to live in bash — untestable and easy to get subtly wrong. This module is the pure,
 * tested core: given the repo root, the home dir, the platform, and which host CLIs are on PATH, it
 * returns exactly the install actions to take. `scripts/install.ts` executes and verifies the plan.
 */
import { join } from 'node:path';

export type LinkMethod = 'symlink' | 'copy';
export type LinkAction = 'link' | 'skip';

/** A host's canonical source dir and where its CLI expects to find installed skills. */
export interface HostTarget {
  host: string;
  /** The CLI whose presence on PATH gates the install. */
  cli: string;
  source: string;
  dest: string;
}

export interface InstallEntry extends HostTarget {
  method: LinkMethod;
  action: LinkAction;
  reason: string;
}

export interface InstallPlan {
  platform: string;
  method: LinkMethod;
  entries: InstallEntry[];
  linkCount: number;
  skipCount: number;
}

export interface InstallEnv {
  root: string;
  home: string;
  /** `process.platform` (e.g. 'darwin', 'linux', 'win32'). */
  platform: string;
  /** Host CLIs found on PATH. */
  availableClis: readonly string[];
}

/**
 * Platforms where symlinks are unreliable (Windows without Developer Mode turns `ln -s` into a
 * frozen copy that never refreshes on pull). There we copy explicitly and re-copy on every setup.
 */
const COPY_PLATFORMS = new Set(['win32', 'cygwin', 'msys']);

/** How to install on a given platform: copy on Windows-family, symlink everywhere else. */
export function linkMethodFor(platform: string): LinkMethod {
  return COPY_PLATFORMS.has(platform) ? 'copy' : 'symlink';
}

/** The two first-class hosts (Claude Code + Codex) and their source → dest mapping. */
export function hostTargets(root: string, home: string): HostTarget[] {
  return [
    {
      host: 'claude',
      cli: 'claude',
      source: join(root, 'skills'),
      dest: join(home, '.claude', 'skills', 'factory'),
    },
    {
      host: 'codex',
      cli: 'codex',
      source: join(root, '.codex', 'skills'),
      dest: join(home, '.codex', 'prompts', 'factory'),
    },
  ];
}

/** Resolve the full install plan. Pure — no filesystem access. */
export function planInstall(env: InstallEnv): InstallPlan {
  const method = linkMethodFor(env.platform);
  const available = new Set(env.availableClis);
  const entries = hostTargets(env.root, env.home).map((t): InstallEntry => {
    const present = available.has(t.cli);
    return {
      ...t,
      method,
      action: present ? 'link' : 'skip',
      reason: present
        ? `${method} ${t.source} → ${t.dest}`
        : `${t.cli} not found on PATH — skipped`,
    };
  });
  const linkCount = entries.filter((e) => e.action === 'link').length;
  return {
    platform: env.platform,
    method,
    entries,
    linkCount,
    skipCount: entries.length - linkCount,
  };
}
