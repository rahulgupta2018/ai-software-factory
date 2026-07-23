/**
 * Guards the version-drift check itself — every validator in this repo has a negative case, so a
 * green build means the check can actually fail, not just that it ran.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkVersions, semverFromVersionFile } from '../scripts/version-check.ts';

const ROOT = join(import.meta.dir, '..');

describe('version-check', () => {
  test('drops the 4th segment to derive the semver', () => {
    expect(semverFromVersionFile('0.26.0.0\n')).toBe('0.26.0');
    expect(semverFromVersionFile('1.2.3.9')).toBe('1.2.3');
  });

  test('passes when the two agree', () => {
    expect(checkVersions('0.26.0.0\n', '0.26.0')).toBeNull();
  });

  test('fails on the exact drift this check was written for', () => {
    const problem = checkVersions('0.25.0.0\n', '0.2.0');
    expect(problem).not.toBeNull();
    expect(problem).toContain('0.2.0');
    expect(problem).toContain('0.25.0.0');
  });

  test('the committed VERSION and package.json actually agree', () => {
    const versionFile = readFileSync(join(ROOT, 'VERSION'), 'utf-8');
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8')) as { version: string };
    expect(checkVersions(versionFile, pkg.version)).toBeNull();
  });
});
