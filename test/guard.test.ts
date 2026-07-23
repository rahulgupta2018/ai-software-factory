/**
 * Tier-1 — the safety guardrail classifiers (lib/guard.ts) behind `/careful`, `/freeze`, `/guard`.
 *
 * A guardrail nobody watched fail is not a guardrail, so every rule has both sides: the command
 * that MUST block, the throwaway delete that MUST pass, the sibling directory that MUST NOT count
 * as inside a freeze boundary. Pure functions, no filesystem — the whole taxonomy is provable here.
 */
import { describe, expect, test } from 'bun:test';

import {
  classifyCommand,
  normalizePath,
  withinBoundary,
  DESTRUCTIVE_PATTERNS,
  SAFE_DELETE_TARGETS,
} from '../lib/guard.ts';

describe('classifyCommand — destructive shapes block', () => {
  test('recursive rm outside the safe list is destructive', () => {
    const v = classifyCommand('rm -rf /var/data');
    expect(v.destructive).toBe(true);
    expect(v.safeException).toBe(false);
    expect(v.matches.some((m) => m.name === 'rm-recursive' && m.risk === 'recursive-delete')).toBe(true);
  });

  test('DROP TABLE is data-loss', () => {
    expect(classifyCommand('DROP TABLE users;').matches.some((m) => m.name === 'sql-drop')).toBe(true);
  });

  test('TRUNCATE is data-loss', () => {
    expect(classifyCommand('TRUNCATE orders;').destructive).toBe(true);
  });

  test('unbounded DELETE FROM is data-loss', () => {
    expect(classifyCommand('DELETE FROM sessions;').matches.some((m) => m.name === 'sql-delete-unbounded')).toBe(true);
  });

  test('git push --force is a history rewrite', () => {
    expect(classifyCommand('git push --force origin main').matches.some((m) => m.name === 'git-force-push')).toBe(true);
  });

  test('git push -f short flag is caught', () => {
    expect(classifyCommand('git push -f origin main').destructive).toBe(true);
  });

  test('git reset --hard is work-loss', () => {
    expect(classifyCommand('git reset --hard HEAD~3').matches.some((m) => m.name === 'git-reset-hard')).toBe(true);
  });

  test('git clean -fd is work-loss', () => {
    expect(classifyCommand('git clean -fd').destructive).toBe(true);
  });

  test('git checkout . is work-loss', () => {
    expect(classifyCommand('git checkout .').matches.some((m) => m.name === 'git-checkout-all')).toBe(true);
  });

  test('kubectl delete is prod-impact', () => {
    expect(classifyCommand('kubectl delete pod api-0').matches.some((m) => m.name === 'kubectl-delete')).toBe(true);
  });

  test('docker rm -f is container-loss', () => {
    expect(classifyCommand('docker rm -f api').destructive).toBe(true);
  });

  test('docker system prune is container-loss', () => {
    expect(classifyCommand('docker system prune -a').matches.some((m) => m.name === 'docker-prune')).toBe(true);
  });

  test('a destructive tail in a chain still flags the whole string', () => {
    expect(classifyCommand('bun test && rm -rf /etc').destructive).toBe(true);
  });
});

describe('classifyCommand — safe commands pass', () => {
  test('an ordinary command is not destructive', () => {
    const v = classifyCommand('bun test');
    expect(v.destructive).toBe(false);
    expect(v.matches).toEqual([]);
  });

  test('recursive rm of throwaway build/cache dirs is a safe exception', () => {
    const v = classifyCommand('rm -rf node_modules dist .next');
    expect(v.destructive).toBe(false);
    expect(v.safeException).toBe(true);
  });

  test('a mix of safe and unsafe delete targets is NOT a safe exception', () => {
    const v = classifyCommand('rm -rf node_modules /var/data');
    expect(v.destructive).toBe(true);
    expect(v.safeException).toBe(false);
  });

  test('non-recursive rm is not treated as a recursive delete', () => {
    const v = classifyCommand('rm file.txt');
    expect(v.matches.some((m) => m.name === 'rm-recursive')).toBe(false);
  });

  test('a bounded DELETE with a WHERE clause does not match the unbounded rule', () => {
    expect(classifyCommand('DELETE FROM sessions WHERE id = 1;').matches.some((m) => m.name === 'sql-delete-unbounded')).toBe(false);
  });

  test('a plain git push is not a force push', () => {
    expect(classifyCommand('git push origin main').destructive).toBe(false);
  });
});

describe('normalizePath', () => {
  test('collapses . and .. segments', () => {
    expect(normalizePath('/repo/src/../src/auth/./token.ts')).toBe('/repo/src/auth/token.ts');
  });

  test('strips a trailing slash', () => {
    expect(normalizePath('/repo/src/')).toBe('/repo/src');
  });

  test('does not let .. escape an absolute root', () => {
    expect(normalizePath('/a/../..')).toBe('/');
  });
});

describe('withinBoundary', () => {
  test('a file inside the boundary is allowed', () => {
    expect(withinBoundary('/repo/src/auth/token.ts', '/repo/src/auth')).toBe(true);
  });

  test('the boundary directory itself counts as inside', () => {
    expect(withinBoundary('/repo/src/auth', '/repo/src/auth')).toBe(true);
  });

  test('a file outside the boundary is blocked', () => {
    expect(withinBoundary('/repo/src/api/routes.ts', '/repo/src/auth')).toBe(false);
  });

  test('a sibling with a shared prefix does NOT count as inside (/src vs /src-old)', () => {
    expect(withinBoundary('/repo/src-old/x.ts', '/repo/src')).toBe(false);
  });

  test('trailing slashes on the boundary do not change the verdict', () => {
    expect(withinBoundary('/repo/src/auth/token.ts', '/repo/src/auth/')).toBe(true);
  });

  test('a .. in the target that escapes the boundary is blocked', () => {
    expect(withinBoundary('/repo/src/auth/../api/x.ts', '/repo/src/auth')).toBe(false);
  });
});

describe('taxonomy integrity', () => {
  test('every destructive pattern names a risk and an example', () => {
    for (const p of DESTRUCTIVE_PATTERNS) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.risk.length).toBeGreaterThan(0);
      expect(p.example.length).toBeGreaterThan(0);
    }
  });

  test('the safe-delete whitelist is non-empty and includes node_modules', () => {
    expect(SAFE_DELETE_TARGETS.length).toBeGreaterThan(0);
    expect(SAFE_DELETE_TARGETS).toContain('node_modules');
  });
});
