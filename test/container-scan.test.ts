import { describe, expect, test } from 'bun:test';

import {
  DEFAULT_IMAGE_HARDENING_POLICY,
  DEFAULT_IMAGE_SCAN_POLICY,
  evaluateImageScan,
  lintImageConfig,
  normalizeImageSeverity,
  parseGrype,
  parseImageScan,
  parseTrivyImage,
  type ImageScanPolicy,
  type ImageVuln,
} from '../lib/container-scan';

function vuln(overrides: Partial<ImageVuln> = {}): ImageVuln {
  return { id: 'CVE-0000-0001', pkg: 'openssl', severity: 'high', fixAvailable: true, ...overrides };
}

describe('normalizeImageSeverity — scanner labels to the common scale', () => {
  test('maps critical/high/medium(moderate)/low(negligible), else unknown', () => {
    expect(normalizeImageSeverity('CRITICAL')).toBe('critical');
    expect(normalizeImageSeverity('High')).toBe('high');
    expect(normalizeImageSeverity('moderate')).toBe('medium');
    expect(normalizeImageSeverity('Negligible')).toBe('low');
    expect(normalizeImageSeverity('bogus')).toBe('unknown');
    expect(normalizeImageSeverity(undefined)).toBe('unknown');
  });
});

describe('parseTrivyImage — normalises a trivy image report, never throws', () => {
  test('extracts id, pkg, severity, and fix-availability from FixedVersion', () => {
    const report = {
      Results: [
        {
          Vulnerabilities: [
            { VulnerabilityID: 'CVE-1', PkgName: 'openssl', Severity: 'CRITICAL', FixedVersion: '3.0.1' },
            { VulnerabilityID: 'CVE-2', PkgName: 'zlib', Severity: 'LOW' },
          ],
        },
      ],
    };
    const vulns = parseTrivyImage(report);
    expect(vulns).toHaveLength(2);
    expect(vulns[0]).toEqual({ id: 'CVE-1', pkg: 'openssl', severity: 'critical', fixAvailable: true });
    expect(vulns[1].fixAvailable).toBe(false);
  });

  test('malformed / empty input returns [] without throwing', () => {
    expect(parseTrivyImage(undefined)).toEqual([]);
    expect(parseTrivyImage({ Results: 'nope' })).toEqual([]);
  });
});

describe('parseGrype — normalises a grype report, never throws', () => {
  test('extracts fix-availability from fix.state / fix.versions', () => {
    const report = {
      matches: [
        {
          artifact: { name: 'openssl' },
          vulnerability: { id: 'CVE-1', severity: 'High', fix: { state: 'fixed', versions: ['3.0.1'] } },
        },
        {
          artifact: { name: 'zlib' },
          vulnerability: { id: 'CVE-2', severity: 'Low', fix: { state: 'not-fixed', versions: [] } },
        },
      ],
    };
    const vulns = parseGrype(report);
    expect(vulns[0]).toEqual({ id: 'CVE-1', pkg: 'openssl', severity: 'high', fixAvailable: true });
    expect(vulns[1].fixAvailable).toBe(false);
  });

  test('malformed / empty input returns [] without throwing', () => {
    expect(parseGrype(undefined)).toEqual([]);
  });
});

describe('parseImageScan — dispatches by format', () => {
  test('routes to the right parser', () => {
    expect(parseImageScan('trivy', { Results: [{ Vulnerabilities: [{ VulnerabilityID: 'X', Severity: 'HIGH' }] }] })).toHaveLength(1);
    expect(parseImageScan('grype', { matches: [{ vulnerability: { id: 'X', severity: 'High' } }] })).toHaveLength(1);
  });
});

describe('evaluateImageScan — the severity gate', () => {
  test('a fix-available High vuln gates under the default policy', () => {
    const verdict = evaluateImageScan([vuln({ severity: 'high', fixAvailable: true })]);
    expect(verdict.pass).toBe(false);
    expect(verdict.blocking).toHaveLength(1);
  });

  test('an unfixable High vuln warns but does not gate (requireFixAvailable default)', () => {
    const verdict = evaluateImageScan([vuln({ severity: 'high', fixAvailable: false })]);
    expect(verdict.pass).toBe(true);
    expect(verdict.blocking).toHaveLength(0);
  });

  test('a fix-available Medium vuln does not gate under the default (High) policy', () => {
    const verdict = evaluateImageScan([vuln({ severity: 'medium', fixAvailable: true })]);
    expect(verdict.pass).toBe(true);
  });

  test('with requireFixAvailable false, an unfixable High gates', () => {
    const policy: ImageScanPolicy = { ...DEFAULT_IMAGE_SCAN_POLICY, requireFixAvailable: false };
    const verdict = evaluateImageScan([vuln({ severity: 'high', fixAvailable: false })], policy);
    expect(verdict.pass).toBe(false);
  });

  test('an unknown-severity vuln gates by default when fixable (pending triage)', () => {
    // Fail closed: an ungradeable vuln with a fix available blocks.
    expect(evaluateImageScan([vuln({ severity: 'unknown', fixAvailable: true })]).pass).toBe(false);
    // No fix → warn, not block (can't hold a release on an unfixable vuln).
    expect(evaluateImageScan([vuln({ severity: 'unknown', fixAvailable: false })]).pass).toBe(true);
    // Opt out → unknown never trips a threshold again.
    expect(
      evaluateImageScan([vuln({ severity: 'unknown', fixAvailable: true })], {
        blockSeverity: 'high',
        requireFixAvailable: true,
        gateUnknownSeverity: false,
      }).pass,
    ).toBe(true);
  });

  test('an empty scan passes', () => {
    expect(evaluateImageScan([]).pass).toBe(true);
  });

  test('DEFAULT_IMAGE_SCAN_POLICY gates at High with a fix required', () => {
    expect(DEFAULT_IMAGE_SCAN_POLICY.blockSeverity).toBe('high');
    expect(DEFAULT_IMAGE_SCAN_POLICY.requireFixAvailable).toBe(true);
  });
});

describe('lintImageConfig — base-image hardening', () => {
  test('a hardened image (non-root + pinned base) passes', () => {
    expect(lintImageConfig({ runsAsRoot: false, baseImagePinnedByDigest: true }).pass).toBe(true);
  });

  test('running as root flags runs-as-root', () => {
    const verdict = lintImageConfig({ runsAsRoot: true, baseImagePinnedByDigest: true });
    expect(verdict.pass).toBe(false);
    expect(verdict.findings.map((f) => f.risk)).toContain('runs-as-root');
  });

  test('an unpinned base image flags unpinned-base-image', () => {
    const verdict = lintImageConfig({ runsAsRoot: false, baseImagePinnedByDigest: false });
    expect(verdict.pass).toBe(false);
    expect(verdict.findings.map((f) => f.risk)).toContain('unpinned-base-image');
  });

  test('both problems accumulate', () => {
    expect(lintImageConfig({ runsAsRoot: true, baseImagePinnedByDigest: false }).findings).toHaveLength(2);
  });

  test('DEFAULT_IMAGE_HARDENING_POLICY forbids root and requires a pinned base', () => {
    expect(DEFAULT_IMAGE_HARDENING_POLICY.forbidRoot).toBe(true);
    expect(DEFAULT_IMAGE_HARDENING_POLICY.requirePinnedBase).toBe(true);
  });
});
