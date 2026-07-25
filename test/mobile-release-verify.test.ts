/**
 * Tier-1 — the mobile-release verifier (lib/mobile-release-verify.ts) behind the `/deploy` store
 * gate for the Apple and Google tracks (plan §9, Phase 6).
 *
 * A gate nobody watched fail is not a gate, so every rule has both sides: the healthy release that
 * MUST pass and the specific defect (absent build, unsigned, wrong format for the store, re-used
 * build number, bogus track, an embedded signing secret) that MUST fail. Pure functions, no
 * network and no store API — the whole policy is provable here, offline, against a plain data
 * fixture.
 */
import { describe, expect, test } from 'bun:test';

import {
  verifyMobileRelease,
  verifyMobileReleases,
  artifactExtension,
  FORMAT_FOR_STORE,
  TRACKS_FOR_STORE,
  type MobileReleaseObservation,
} from '../lib/mobile-release-verify.ts';

/** A fully-healthy Apple release — the baseline the Apple negative cases perturb by one field. */
function healthyApple(overrides: Partial<MobileReleaseObservation> = {}): MobileReleaseObservation {
  return {
    store: 'apple',
    artifact: 'build/Repairs.ipa',
    artifactPresent: true,
    signed: true,
    buildNumber: 42,
    lastReleasedBuildNumber: 41,
    track: 'testflight',
    embedsSigningSecret: false,
    ...overrides,
  };
}

/** A fully-healthy Google release — the baseline the Google negative cases perturb by one field. */
function healthyGoogle(overrides: Partial<MobileReleaseObservation> = {}): MobileReleaseObservation {
  return {
    store: 'google',
    artifact: 'build/app-release.aab',
    artifactPresent: true,
    signed: true,
    buildNumber: 42,
    lastReleasedBuildNumber: 41,
    track: 'internal',
    embedsSigningSecret: false,
    ...overrides,
  };
}

describe('verifyMobileRelease — a healthy release passes on each store', () => {
  test('signed .ipa, monotonic build, valid track → pass (apple)', () => {
    const v = verifyMobileRelease(healthyApple());
    expect(v.pass).toBe(true);
    expect(v.findings).toEqual([]);
  });

  test('signed .aab, monotonic build, valid track → pass (google)', () => {
    const v = verifyMobileRelease(healthyGoogle());
    expect(v.pass).toBe(true);
    expect(v.findings).toEqual([]);
  });

  test('the first ever release (no prior build) passes with any positive build number', () => {
    expect(verifyMobileRelease(healthyApple({ lastReleasedBuildNumber: null, buildNumber: 1 })).pass).toBe(true);
  });

  test('the app-store / production tracks are accepted, not just the pre-release tracks', () => {
    expect(verifyMobileRelease(healthyApple({ track: 'app-store' })).pass).toBe(true);
    expect(verifyMobileRelease(healthyGoogle({ track: 'production' })).pass).toBe(true);
  });
});

describe('verifyMobileRelease — each rule has a negative case that fails', () => {
  test('absent build fails outright (build-missing) and skips downstream rules', () => {
    const v = verifyMobileRelease(healthyApple({ artifactPresent: false }));
    expect(v.pass).toBe(false);
    expect(v.findings).toHaveLength(1);
    expect(v.findings[0].risk).toBe('build-missing');
  });

  test('unsigned artifact fails (unsigned)', () => {
    const v = verifyMobileRelease(healthyApple({ signed: false }));
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.risk === 'unsigned')).toBe(true);
  });

  test('an .apk sent to Play fails (wrong-format) — Play requires an App Bundle', () => {
    const v = verifyMobileRelease(healthyGoogle({ artifact: 'build/app-release.apk' }));
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.risk === 'wrong-format')).toBe(true);
  });

  test('an .aab sent to the App Store fails (wrong-format)', () => {
    const v = verifyMobileRelease(healthyApple({ artifact: 'build/Repairs.aab' }));
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.risk === 'wrong-format')).toBe(true);
  });

  test('a re-used build number fails (version-not-monotonic)', () => {
    const v = verifyMobileRelease(healthyApple({ buildNumber: 41, lastReleasedBuildNumber: 41 }));
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.risk === 'version-not-monotonic')).toBe(true);
  });

  test('a lower build number fails (version-not-monotonic)', () => {
    const v = verifyMobileRelease(healthyGoogle({ buildNumber: 40, lastReleasedBuildNumber: 41 }));
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.risk === 'version-not-monotonic')).toBe(true);
  });

  test('a non-positive build number fails (version-not-monotonic)', () => {
    const v = verifyMobileRelease(healthyApple({ buildNumber: 0, lastReleasedBuildNumber: null }));
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.risk === 'version-not-monotonic')).toBe(true);
  });

  test('a bogus track fails (invalid-track)', () => {
    const v = verifyMobileRelease(healthyGoogle({ track: 'beta' }));
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.risk === 'invalid-track')).toBe(true);
  });

  test('an Apple track on a Google release fails (invalid-track)', () => {
    const v = verifyMobileRelease(healthyGoogle({ track: 'testflight' }));
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.risk === 'invalid-track')).toBe(true);
  });

  test('a manifest that embeds a signing secret fails (embedded-secret) — custody violation', () => {
    const v = verifyMobileRelease(healthyApple({ embedsSigningSecret: true }));
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.risk === 'embedded-secret')).toBe(true);
  });
});

describe('verifyMobileReleases — the batch passes only if every release passes', () => {
  test('both stores healthy → batch passes', () => {
    const r = verifyMobileReleases([healthyApple(), healthyGoogle()]);
    expect(r.pass).toBe(true);
    expect(r.verdicts).toHaveLength(2);
  });

  test('one bad release fails the batch', () => {
    const r = verifyMobileReleases([healthyApple(), healthyGoogle({ artifact: 'build/app.apk' })]);
    expect(r.pass).toBe(false);
  });

  test('an empty batch passes when no stores are declared (web-only product)', () => {
    expect(verifyMobileReleases([]).pass).toBe(true);
    expect(verifyMobileReleases([], []).pass).toBe(true);
  });

  test('a declared store with no observation fails closed (the empty-batch fail-open)', () => {
    // The bug: [].every() is true, so an empty batch would pass — a build that produced nothing.
    const r = verifyMobileReleases([], ['apple', 'google']);
    expect(r.pass).toBe(false);
    expect(r.verdicts.map((v) => v.store).sort()).toEqual(['apple', 'google']);
    expect(r.verdicts.every((v) => v.findings[0].risk === 'build-missing')).toBe(true);
  });

  test('a declared store missing from a partial batch fails closed', () => {
    const r = verifyMobileReleases([healthyApple()], ['apple', 'google']);
    expect(r.pass).toBe(false);
    expect(r.verdicts.find((v) => v.store === 'google')?.pass).toBe(false);
    expect(r.verdicts.find((v) => v.store === 'apple')?.pass).toBe(true);
  });
});

describe('helpers + policy constants', () => {
  test('artifactExtension reads the lower-cased extension, or empty', () => {
    expect(artifactExtension('build/App.IPA')).toBe('.ipa');
    expect(artifactExtension('build/app-release.aab')).toBe('.aab');
    expect(artifactExtension('build/app')).toBe('');
  });

  test('the store format map matches the store review requirements', () => {
    expect(FORMAT_FOR_STORE.apple).toBe('.ipa');
    expect(FORMAT_FOR_STORE.google).toBe('.aab');
  });

  test('the store track map lists the accepted tracks', () => {
    expect(TRACKS_FOR_STORE.apple).toEqual(['testflight', 'app-store']);
    expect(TRACKS_FOR_STORE.google).toEqual(['internal', 'closed', 'production']);
  });
});
