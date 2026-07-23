/**
 * Tier-1 — Track 2 CLI surfaces (`fac memory`, `fac decision`, `fac context`, `fac redact`).
 *
 * The ops skills already reference these commands. These tests prove the operator-facing surface
 * exists and behaves in a fresh temp repo, not just that the underlying libs work in isolation.
 */
import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = join(import.meta.dir, '..');
const FAC = join(ROOT, 'bin', 'fac.ts');
const GITHUB_TOKEN = `ghp_${'a'.repeat(36)}`;

function runFac(cwd: string, args: string[], input?: string) {
  return spawnSync('bun', ['run', FAC, ...args], {
    cwd,
    input,
    encoding: 'utf-8',
    stdio: 'pipe',
  });
}

describe('ops cli', () => {
  let repo: string;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'fac-ops-cli-'));
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  test('fac memory writes, reads, lists, and deletes notes', () => {
    let result = runFac(repo, ['memory', 'write', '--scope', 'session', '--key', 'working context', '--body', 'next step']);
    expect(result.status).toBe(0);

    result = runFac(repo, ['memory', 'read', '--scope', 'session', '--key', 'working context']);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('next step');

    result = runFac(repo, ['memory', 'list', '--scope', 'session']);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('working-context');

    result = runFac(repo, ['memory', 'delete', '--scope', 'session', '--key', 'working context']);
    expect(result.status).toBe(0);

    result = runFac(repo, ['memory', 'read', '--scope', 'session', '--key', 'working context']);
    expect(result.status).toBe(1);
  });

  test('fac decision logs, lists active records, and redacts one by id', () => {
    let result = runFac(repo, [
      'decision',
      'log',
      '--decision',
      'Use Redis for cache',
      '--rationale',
      'latency',
      '--scope',
      'repo',
      '--source',
      'user',
      '--confidence',
      '8',
    ]);
    expect(result.status).toBe(0);
    const id = result.stdout.trim().split(' ').pop()!;

    result = runFac(repo, [
      'decision',
      'log',
      '--decision',
      'Use Dragonfly for cache',
      '--rationale',
      'cheaper',
      '--scope',
      'repo',
      '--source',
      'user',
      '--confidence',
      '7',
      '--supersedes',
      id,
    ]);
    expect(result.status).toBe(0);

    result = runFac(repo, ['decision', 'list']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Use Dragonfly for cache');
    expect(result.stdout).not.toContain('Use Redis for cache');

    result = runFac(repo, ['decision', 'redact', '--id', id]);
    expect(result.status).toBe(0);
  });

  test('fac redact blocks HIGH-tier secrets and emits cleaned text', () => {
    const file = join(repo, 'prompt.md');
    writeFileSync(file, `token: ${GITHUB_TOKEN}`);
    const result = runFac(repo, ['redact', '--from-file', file]);
    expect(result.status).toBe(2);
    expect(result.stdout).not.toContain(GITHUB_TOKEN);
    expect(result.stdout).toContain('[redacted:github-token]');
    expect(result.stderr).toContain('BLOCKED');
  });

  test('fac context save and restore round-trip working state', () => {
    let result = runFac(repo, ['run', 'new', '--product', 'Demo']);
    expect(result.status).toBe(0);
    writeFileSync(join(repo, 'artifact.md'), '# draft\n');
    result = runFac(repo, ['run', 'artifact', '--seq', '1', '--step', 'discover', '--body-file', join(repo, 'artifact.md')]);
    expect(result.status).toBe(0);

    result = runFac(repo, [
      'decision',
      'log',
      '--decision',
      'Use Bun for runtime',
      '--rationale',
      'fast inner loop',
      '--scope',
      'repo',
      '--source',
      'user',
      '--confidence',
      '8',
    ]);
    expect(result.status).toBe(0);

    result = runFac(repo, ['context', 'save', '--note', 'next: wire health dashboard']);
    expect(result.status).toBe(0);
    expect(existsSync(join(repo, '.factory', 'memory', 'session', 'working-context.md'))).toBe(true);

    result = runFac(repo, ['context', 'restore']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('next: wire health dashboard');
    expect(result.stdout).toContain('Use Bun for runtime');
    expect(result.stdout).toContain('not a git repository');
    expect(result.stdout).toContain('discover');
  });

  test('fac context restore is graceful when nothing was saved', () => {
    const result = runFac(repo, ['context', 'restore']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('No saved working context.');
  });

  test('fac memory write surfaces the secret-blocking guard', () => {
    const result = runFac(repo, ['memory', 'write', '--scope', 'session', '--key', 'creds', '--body', GITHUB_TOKEN]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('high-confidence secret');
  });

  test('fac decision list --json is machine-readable', () => {
    let result = runFac(repo, [
      'decision',
      'log',
      '--decision',
      'Ship from main only',
      '--rationale',
      'reduce branching mistakes',
      '--scope',
      'repo',
      '--source',
      'skill',
      '--confidence',
      '6',
    ]);
    expect(result.status).toBe(0);

    result = runFac(repo, ['decision', 'list', '--json']);
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout) as Array<{ decision: string }>;
    expect(parsed).toHaveLength(1);
    expect(parsed[0].decision).toBe('Ship from main only');
  });
});