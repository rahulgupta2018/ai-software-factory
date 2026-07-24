/**
 * Tier-1 — scan liveness. A security gate must fail closed when its scan didn't run.
 * The whole point of this module is the negative case: an absent report blocks.
 */
import { describe, expect, test } from 'bun:test';
import { verifyScanRan } from '../lib/scan-liveness.ts';

describe('scan-liveness', () => {
  test('a present report passes', () => {
    const v = verifyScanRan('SAST', true);
    expect(v.pass).toBe(true);
  });

  test('an absent report fails closed (the fail-open this module exists to close)', () => {
    const v = verifyScanRan('SAST', false);
    expect(v.pass).toBe(false);
    expect(v.reason).toContain('did not run');
    expect(v.reason).toContain('fails closed');
  });

  test('the scan label is carried into the reason for every gate', () => {
    for (const scan of ['SAST', 'DAST', 'container-image']) {
      expect(verifyScanRan(scan, false).reason.startsWith(scan)).toBe(true);
    }
  });
});
