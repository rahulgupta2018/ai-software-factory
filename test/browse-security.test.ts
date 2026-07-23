/**
 * browse security — attack-log rotation + record hygiene.
 *
 * The attack log is append-only and fed by untrusted-content navigation attempts, so a noisy
 * attacker could otherwise grow it without bound. Rotation caps it at a fixed size across a fixed
 * number of generations. These tests drive rotation with a tiny byte threshold so they stay fast
 * and offline; the record-hygiene test pins the security property that raw origins never land on
 * disk.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ATTEMPT_LOG_GENERATIONS,
  ATTEMPT_LOG_MAX_BYTES,
  logAttempt,
  rotateAttemptLog,
  type AttemptRecord,
} from '../tools/browse/security.ts';

const dirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'fac-sec-'));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const REC: AttemptRecord = { origin: 'https://evil.example', score: 0.92, labels: ['ignore-previous'], decision: 'BLOCK' };
const logPath = (dir: string) => join(dir, 'attempts.jsonl');

describe('rotateAttemptLog', () => {
  test('no log file → no rotation', () => {
    expect(rotateAttemptLog(tmp())).toBe(false);
  });

  test('log under threshold is left untouched', () => {
    const dir = tmp();
    logAttempt(REC, dir, { maxBytes: 10 * 1024 });
    const before = readFileSync(logPath(dir), 'utf-8');
    expect(rotateAttemptLog(dir, 10 * 1024)).toBe(false);
    expect(readFileSync(logPath(dir), 'utf-8')).toBe(before);
    expect(existsSync(`${logPath(dir)}.1`)).toBe(false);
  });

  test('log at/over threshold rotates to .1 and clears the live file', () => {
    const dir = tmp();
    // Write enough records to cross a deliberately tiny threshold.
    for (let i = 0; i < 5; i++) logAttempt(REC, dir, { maxBytes: 1_000_000 });
    const beforeSize = statSync(logPath(dir)).size;
    expect(rotateAttemptLog(dir, 1)).toBe(true);
    expect(existsSync(`${logPath(dir)}.1`)).toBe(true);
    expect(statSync(`${logPath(dir)}.1`).size).toBe(beforeSize);
    // Live file gone until the next append recreates it.
    expect(existsSync(logPath(dir))).toBe(false);
  });

  test('generations are shifted up and the oldest is dropped', () => {
    const dir = tmp();
    const generations = 3;
    // Each logAttempt with maxBytes:1 rotates the prior line into .1, cascading older ones up.
    for (let i = 0; i < 6; i++) {
      logAttempt({ ...REC, score: i / 10 }, dir, { maxBytes: 1, generations });
    }
    // At most `generations` rotated files plus the live file exist.
    for (let g = 1; g <= generations; g++) expect(existsSync(`${logPath(dir)}.${g}`)).toBe(true);
    expect(existsSync(`${logPath(dir)}.${generations + 1}`)).toBe(false);
  });
});

describe('logAttempt record hygiene', () => {
  test('stores a salted hash, never the raw origin', () => {
    const dir = tmp();
    logAttempt(REC, dir, { maxBytes: ATTEMPT_LOG_MAX_BYTES });
    const contents = readFileSync(logPath(dir), 'utf-8');
    expect(contents).not.toContain('evil.example');
    const row = JSON.parse(contents.trim());
    expect(row.origin_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(row.decision).toBe('BLOCK');
    expect(row.labels).toEqual(['ignore-previous']);
    expect(row).not.toHaveProperty('origin');
  });

  test('rotates automatically when the live log crosses the cap', () => {
    const dir = tmp();
    logAttempt(REC, dir, { maxBytes: 10 * 1024 }); // seed a line, well under 10K
    // Next call sees a live file over a 1-byte cap → rotates the seed into .1, writes fresh.
    logAttempt(REC, dir, { maxBytes: 1 });
    expect(existsSync(`${logPath(dir)}.1`)).toBe(true);
    expect(readFileSync(logPath(dir), 'utf-8').trim().split('\n')).toHaveLength(1);
  });
});

describe('rotation constants', () => {
  test('defaults match the documented 10 MB × 5 generations reference', () => {
    expect(ATTEMPT_LOG_MAX_BYTES).toBe(10 * 1024 * 1024);
    expect(ATTEMPT_LOG_GENERATIONS).toBe(5);
  });
});
