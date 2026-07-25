/**
 * install-plan — the host-install planner. Pure, so every branch gets a negative twin.
 */
import { describe, expect, test } from 'bun:test';

import {
  applySkillPrefix,
  BUN_PATH_MARKER,
  INSTALL_PREFIX,
  isFactorySkillDir,
  legacyPaths,
  linkMethodFor,
  planInstall,
  stripBunPathBlock,
  uninstallFixedPaths,
  type InstallEnv,
} from '../lib/install-plan.ts';

describe('linkMethodFor', () => {
  test('symlinks on Unix families', () => {
    expect(linkMethodFor('darwin')).toBe('symlink');
    expect(linkMethodFor('linux')).toBe('symlink');
  });

  test('copies on Windows families (negative — no symlink)', () => {
    expect(linkMethodFor('win32')).toBe('copy');
    expect(linkMethodFor('cygwin')).toBe('copy');
    expect(linkMethodFor('msys')).toBe('copy');
  });
});

describe('applySkillPrefix', () => {
  test('prefixes the frontmatter name so the skill invokes as /fac-<name>', () => {
    const out = applySkillPrefix('---\nname: discover\ndescription: x\n---\nbody', 'fac-');
    expect(out).toContain('name: fac-discover');
  });

  test('is idempotent — an already-prefixed name is not doubled (negative)', () => {
    const once = applySkillPrefix('---\nname: discover\n---\n', 'fac-');
    expect(applySkillPrefix(once, 'fac-')).toBe(once);
    expect(once).not.toContain('fac-fac-');
  });

  test('rewrites only the frontmatter name, not a body mention', () => {
    const out = applySkillPrefix('---\nname: qa\n---\nhand off to /qa when done', 'fac-');
    expect(out).toContain('name: fac-qa');
    expect(out).toContain('/qa when done'); // body left alone (avoids clobbering URLs like /health)
  });
});

describe('legacyPaths', () => {
  test('names the stale prior layout to remove', () => {
    expect(legacyPaths('/home/u')).toContain('/home/u/.claude/skills/factory');
  });
});

describe('planInstall', () => {
  const base: Omit<InstallEnv, 'platform' | 'availableClis'> = {
    root: '/repo',
    home: '/home/u',
    skills: ['discover', 'review'],
  };

  test('installs each skill per-skill, prefixed, at depth 1 under ~/.claude/skills', () => {
    const plan = planInstall({ ...base, platform: 'linux', availableClis: ['claude', 'codex'] });
    const claude = plan.entries.filter((e) => e.host === 'claude');
    expect(claude).toHaveLength(2); // one per skill, not one whole-dir link
    expect(claude.map((e) => e.dest)).toEqual([
      '/home/u/.claude/skills/fac-discover',
      '/home/u/.claude/skills/fac-review',
    ]);
    expect(claude.every((e) => e.kind === 'skill' && e.method === 'copy')).toBe(true);
    expect(claude[0].installedName).toBe('fac-discover');
    // Codex stays a whole-dir symlink.
    const codex = plan.entries.find((e) => e.host === 'codex')!;
    expect(codex.kind).toBe('dir');
    expect(codex.method).toBe('symlink');
    expect(codex.dest).toBe('/home/u/.codex/prompts/factory');
    expect(plan.linkCount).toBe(3); // 2 skills + codex
  });

  test('Claude skills copy even on Unix (must rewrite the name), Codex follows the platform', () => {
    const linux = planInstall({ ...base, platform: 'linux', availableClis: ['claude', 'codex'] });
    expect(linux.entries.filter((e) => e.host === 'claude').every((e) => e.method === 'copy')).toBe(true);
    const win = planInstall({ ...base, platform: 'win32', availableClis: ['codex'] });
    expect(win.entries.find((e) => e.host === 'codex')!.method).toBe('copy');
  });

  test('skips a host whose CLI is absent (negative)', () => {
    const plan = planInstall({ ...base, platform: 'linux', availableClis: ['claude'] });
    const codex = plan.entries.find((e) => e.host === 'codex')!;
    expect(codex.action).toBe('skip');
    expect(codex.reason).toContain('not found');
    // Claude still installs its skills.
    expect(plan.entries.filter((e) => e.host === 'claude' && e.action === 'link')).toHaveLength(2);
  });

  test('claude absent → one skip entry, no per-skill entries (negative)', () => {
    const plan = planInstall({ ...base, platform: 'linux', availableClis: ['codex'] });
    const claude = plan.entries.filter((e) => e.host === 'claude');
    expect(claude).toHaveLength(1);
    expect(claude[0].action).toBe('skip');
    expect(claude[0].reason).toContain('not found');
  });

  test('always reports the legacy path to clean', () => {
    const plan = planInstall({ ...base, platform: 'linux', availableClis: [] });
    expect(plan.legacyPaths).toContain('/home/u/.claude/skills/factory');
    expect(plan.linkCount).toBe(0);
  });

  test('INSTALL_PREFIX is the fac- namespace', () => {
    expect(INSTALL_PREFIX).toBe('fac-');
  });
});

describe('uninstall helpers', () => {
  test('isFactorySkillDir matches only prefixed installs (negative twin)', () => {
    expect(isFactorySkillDir('fac-discover')).toBe(true);
    expect(isFactorySkillDir('gepeto')).toBe(false); // a user's own skill is never removed
    expect(isFactorySkillDir('factory')).toBe(false);
  });

  test('uninstallFixedPaths names the skills dir, the legacy layout, and the Codex link', () => {
    const p = uninstallFixedPaths('/home/u');
    expect(p.skillsDir).toBe('/home/u/.claude/skills');
    expect(p.legacyClaude).toBe('/home/u/.claude/skills/factory');
    expect(p.codex).toBe('/home/u/.codex/prompts/factory');
  });

  test('stripBunPathBlock removes only our marker-anchored block, leaving other lines', () => {
    const rc =
      `export PATH="/usr/bin:$PATH"\n` +
      `\n# ${BUN_PATH_MARKER} (the fac CLI lives here)\n` +
      `export BUN_INSTALL="$HOME/.bun"\n` +
      `export PATH="$BUN_INSTALL/bin:$PATH"\n` +
      `alias ll='ls -la'\n`;
    const out = stripBunPathBlock(rc);
    expect(out).not.toContain(BUN_PATH_MARKER);
    expect(out).toContain('export PATH="/usr/bin:$PATH"'); // pre-existing user line untouched
    expect(out).toContain("alias ll='ls -la'"); // trailing line untouched
  });

  test("stripBunPathBlock leaves Bun's own installer block and is idempotent (negative)", () => {
    const bunOwn = `# bun\nexport BUN_INSTALL="$HOME/.bun"\nexport PATH="$BUN_INSTALL/bin:$PATH"\n`;
    expect(stripBunPathBlock(bunOwn)).toBe(bunOwn); // no marker → unchanged
    const withOurs = `${bunOwn}\n# ${BUN_PATH_MARKER}\nexport PATH="$BUN_INSTALL/bin:$PATH"\n`;
    const once = stripBunPathBlock(withOurs);
    expect(once).toBe(bunOwn); // our block (and the blank we added) gone, Bun's kept
    expect(stripBunPathBlock(once)).toBe(once); // idempotent — no marker, no change
  });
});
