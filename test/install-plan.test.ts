/**
 * install-plan — the host-install planner. Pure, so every branch gets a negative twin.
 */
import { describe, expect, test } from 'bun:test';

import { hostTargets, linkMethodFor, planInstall } from '../lib/install-plan.ts';

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

describe('hostTargets', () => {
  test('maps each host source to its CLI install dir', () => {
    const [claude, codex] = hostTargets('/repo', '/home/u');
    expect(claude.host).toBe('claude');
    expect(claude.cli).toBe('claude');
    expect(claude.source).toBe('/repo/skills');
    expect(claude.dest).toBe('/home/u/.claude/skills/factory');
    expect(codex.host).toBe('codex');
    expect(codex.source).toBe('/repo/.codex/skills');
    expect(codex.dest).toBe('/home/u/.codex/prompts/factory');
  });
});

describe('planInstall', () => {
  const base = { root: '/repo', home: '/home/u' };

  test('links every host present on PATH', () => {
    const plan = planInstall({ ...base, platform: 'linux', availableClis: ['claude', 'codex'] });
    expect(plan.method).toBe('symlink');
    expect(plan.linkCount).toBe(2);
    expect(plan.skipCount).toBe(0);
    expect(plan.entries.every((e) => e.action === 'link')).toBe(true);
    expect(plan.entries[0].reason).toContain('symlink');
  });

  test('uses copy method on Windows', () => {
    const plan = planInstall({ ...base, platform: 'win32', availableClis: ['claude', 'codex'] });
    expect(plan.method).toBe('copy');
    expect(plan.entries.every((e) => e.method === 'copy')).toBe(true);
    expect(plan.entries[0].reason).toContain('copy');
  });

  test('skips a host whose CLI is absent (negative)', () => {
    const plan = planInstall({ ...base, platform: 'linux', availableClis: ['claude'] });
    expect(plan.linkCount).toBe(1);
    expect(plan.skipCount).toBe(1);
    const codex = plan.entries.find((e) => e.host === 'codex')!;
    expect(codex.action).toBe('skip');
    expect(codex.reason).toContain('not found');
  });

  test('skips everything when no host CLI is installed (negative)', () => {
    const plan = planInstall({ ...base, platform: 'linux', availableClis: [] });
    expect(plan.linkCount).toBe(0);
    expect(plan.skipCount).toBe(2);
    expect(plan.entries.every((e) => e.action === 'skip')).toBe(true);
  });
});
