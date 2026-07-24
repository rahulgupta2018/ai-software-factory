/**
 * Tier-1 — the SCA report + SBOM verifier (lib/sca-report.ts) behind the supply-chain gate
 * `/security` runs and `/ship` / `/deploy` enforce (plan §Phase 7, Track 1).
 *
 * A gate nobody watched fail is not a gate, so every rule has both sides: the seeded fix-available
 * critical that MUST block, the below-threshold finding that MUST NOT, the no-fix-yet finding that
 * warns but doesn't block under a fix-available policy, and the absent / empty / mis-formatted SBOM
 * that MUST fail. Pure functions, no network and no scanner binary — the whole policy is provable
 * here, offline, against plain scanner-JSON fixtures.
 */
import { describe, expect, test } from 'bun:test';

import {
  parseOsvScanner,
  parseNpmAudit,
  parsePipAudit,
  parseTrivy,
  parseScaReport,
  normalizeSeverity,
  severityFromCvss,
  evaluateScaReport,
  verifySbom,
  DEFAULT_SCA_POLICY,
  SBOM_FORMATS,
  type ScaVulnerability,
  type SbomObservation,
} from '../lib/sca-report.ts';

/** A normalised vulnerability the policy cases perturb by one field. */
function vuln(overrides: Partial<ScaVulnerability> = {}): ScaVulnerability {
  return {
    id: 'CVE-2024-0001',
    package: 'left-pad',
    installedVersion: '1.0.0',
    severity: 'high',
    fixAvailable: true,
    fixedVersion: '1.1.0',
    ecosystem: 'npm',
    ...overrides,
  };
}

describe('normalizeSeverity — scanner spellings map onto the four tiers', () => {
  test('critical/high/medium/low pass through', () => {
    expect(normalizeSeverity('CRITICAL')).toBe('critical');
    expect(normalizeSeverity('High')).toBe('high');
    expect(normalizeSeverity('medium')).toBe('medium');
    expect(normalizeSeverity('LOW')).toBe('low');
  });

  test('scanner synonyms are folded (moderate→medium, important→high, negligible→low)', () => {
    expect(normalizeSeverity('moderate')).toBe('medium');
    expect(normalizeSeverity('important')).toBe('high');
    expect(normalizeSeverity('negligible')).toBe('low');
  });

  test('empty / unrecognised → unknown (a severity-less scanner never trips a real threshold)', () => {
    expect(normalizeSeverity('')).toBe('unknown');
    expect(normalizeSeverity(null)).toBe('unknown');
    expect(normalizeSeverity('spicy')).toBe('unknown');
  });
});

describe('severityFromCvss — CVSS v3 base score → tier', () => {
  test('score bands map to critical/high/medium/low', () => {
    expect(severityFromCvss(9.8)).toBe('critical');
    expect(severityFromCvss(7.5)).toBe('high');
    expect(severityFromCvss(5.0)).toBe('medium');
    expect(severityFromCvss(2.1)).toBe('low');
  });

  test('zero / missing → unknown', () => {
    expect(severityFromCvss(0)).toBe('unknown');
    expect(severityFromCvss(null)).toBe('unknown');
  });
});

describe('parseOsvScanner — the multi-ecosystem scanner shape', () => {
  const report = {
    results: [
      {
        packages: [
          {
            package: { name: 'lodash', version: '4.17.20', ecosystem: 'npm' },
            vulnerabilities: [
              {
                id: 'GHSA-jf85-cpcp-j695',
                database_specific: { severity: 'CRITICAL' },
                affected: [
                  { package: { name: 'lodash' }, ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '4.17.21' }] }] },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  test('extracts id, package, version, labelled severity and the fixed version', () => {
    const [v] = parseOsvScanner(report);
    expect(v.id).toBe('GHSA-jf85-cpcp-j695');
    expect(v.package).toBe('lodash');
    expect(v.installedVersion).toBe('4.17.20');
    expect(v.severity).toBe('critical');
    expect(v.fixAvailable).toBe(true);
    expect(v.fixedVersion).toBe('4.17.21');
    expect(v.ecosystem).toBe('npm');
  });

  test('a no-fix advisory normalises to fixAvailable=false', () => {
    const noFix = {
      results: [{ packages: [{ package: { name: 'x', version: '1.0.0' }, vulnerabilities: [{ id: 'CVE-x', database_specific: { severity: 'HIGH' } }] }] }],
    };
    const [v] = parseOsvScanner(noFix);
    expect(v.fixAvailable).toBe(false);
    expect(v.fixedVersion).toBeUndefined();
  });

  test('a malformed / empty report yields no findings (never throws)', () => {
    expect(parseOsvScanner({})).toEqual([]);
    expect(parseOsvScanner(null)).toEqual([]);
    expect(parseOsvScanner({ results: [{ packages: [{}] }] })).toEqual([]);
  });
});

describe('parseNpmAudit — the npm v7+ vulnerabilities map', () => {
  const report = {
    vulnerabilities: {
      minimist: {
        name: 'minimist',
        severity: 'high',
        range: '<1.2.6',
        via: [{ source: 1179, name: 'minimist', url: 'https://github.com/advisories/GHSA-xvch', title: 'Prototype Pollution' }],
        fixAvailable: { name: 'minimist', version: '1.2.6', isSemVerMajor: false },
      },
    },
  };

  test('maps severity, the advisory id (from via), and the fix version', () => {
    const [v] = parseNpmAudit(report);
    expect(v.package).toBe('minimist');
    expect(v.severity).toBe('high');
    expect(v.fixAvailable).toBe(true);
    expect(v.fixedVersion).toBe('1.2.6');
    expect(v.ecosystem).toBe('npm');
  });

  test('fixAvailable:false → no fix', () => {
    const [v] = parseNpmAudit({ vulnerabilities: { x: { name: 'x', severity: 'critical', fixAvailable: false } } });
    expect(v.fixAvailable).toBe(false);
    expect(v.fixedVersion).toBeUndefined();
  });
});

describe('parsePipAudit — no severity, fix from fix_versions', () => {
  const report = {
    dependencies: [
      { name: 'jinja2', version: '2.11.2', vulns: [{ id: 'PYSEC-2021-66', fix_versions: ['2.11.3'] }] },
      { name: 'safe-pkg', version: '1.0.0', vulns: [] },
    ],
  };

  test('normalises severity to unknown and reads the first fix version', () => {
    const vulns = parsePipAudit(report);
    expect(vulns).toHaveLength(1);
    expect(vulns[0].id).toBe('PYSEC-2021-66');
    expect(vulns[0].severity).toBe('unknown');
    expect(vulns[0].fixAvailable).toBe(true);
    expect(vulns[0].fixedVersion).toBe('2.11.3');
  });

  test('accepts a bare array form too', () => {
    const vulns = parsePipAudit([{ name: 'p', version: '1.0.0', vulns: [{ id: 'PYSEC-x', fix_versions: [] }] }]);
    expect(vulns[0].fixAvailable).toBe(false);
  });
});

describe('parseTrivy — clean severity + fixed version', () => {
  const report = {
    Results: [
      {
        Type: 'gobinary',
        Vulnerabilities: [
          { VulnerabilityID: 'CVE-2023-1', PkgName: 'golang.org/x/net', InstalledVersion: '0.4.0', FixedVersion: '0.7.0', Severity: 'HIGH' },
          { VulnerabilityID: 'CVE-2023-2', PkgName: 'pkg', InstalledVersion: '1.0.0', Severity: 'LOW' },
        ],
      },
    ],
  };

  test('maps every field and marks fixAvailable from FixedVersion', () => {
    const vulns = parseTrivy(report);
    expect(vulns).toHaveLength(2);
    expect(vulns[0].severity).toBe('high');
    expect(vulns[0].fixAvailable).toBe(true);
    expect(vulns[0].fixedVersion).toBe('0.7.0');
    expect(vulns[1].fixAvailable).toBe(false);
  });
});

describe('parseScaReport — dispatches by format', () => {
  test('routes to the right normaliser', () => {
    expect(parseScaReport('npm-audit', { vulnerabilities: { x: { name: 'x', severity: 'low' } } })).toHaveLength(1);
    expect(parseScaReport('trivy', { Results: [] })).toEqual([]);
  });
});

describe('evaluateScaReport — the severity policy gates the release', () => {
  test('a fix-available critical BLOCKS under the default policy', () => {
    const v = evaluateScaReport([vuln({ severity: 'critical', fixAvailable: true, fixedVersion: '2.0.0' })]);
    expect(v.pass).toBe(false);
    expect(v.blocking).toHaveLength(1);
    expect(v.blocking[0].vuln.severity).toBe('critical');
  });

  test('a fix-available high BLOCKS under the default (>= high) policy', () => {
    const v = evaluateScaReport([vuln({ severity: 'high' })]);
    expect(v.pass).toBe(false);
  });

  test('a below-threshold medium does NOT block', () => {
    const v = evaluateScaReport([vuln({ severity: 'medium' })]);
    expect(v.pass).toBe(true);
    expect(v.findings[0].blocking).toBe(false);
  });

  test('a high with NO fix does NOT block under the fix-available policy (warn, not block)', () => {
    const v = evaluateScaReport([vuln({ severity: 'high', fixAvailable: false, fixedVersion: undefined })]);
    expect(v.pass).toBe(true);
    expect(v.findings[0].blocking).toBe(false);
    expect(v.findings[0].reason).toContain('no fix available');
  });

  test('with requireFixAvailable=false, a no-fix critical still BLOCKS', () => {
    const v = evaluateScaReport(
      [vuln({ severity: 'critical', fixAvailable: false, fixedVersion: undefined })],
      { blockSeverity: 'critical', requireFixAvailable: false, gateUnknownSeverity: true },
    );
    expect(v.pass).toBe(false);
  });

  test('an unknown-severity finding gates by default when fixable (a severity-less scanner fails closed)', () => {
    // Default policy: ungradeable + fix-available → blocks (pip-audit no longer silently passes).
    expect(evaluateScaReport([vuln({ severity: 'unknown', fixAvailable: true })]).pass).toBe(false);
    // Ungradeable but no fix → warn, not block (can't hold a release on an unfixable CVE).
    expect(evaluateScaReport([vuln({ severity: 'unknown', fixAvailable: false })]).pass).toBe(true);
    // Opt out → unknown never trips a real threshold (old behaviour).
    expect(
      evaluateScaReport([vuln({ severity: 'unknown', fixAvailable: true })], {
        blockSeverity: 'low',
        requireFixAvailable: true,
        gateUnknownSeverity: false,
      }).pass,
    ).toBe(true);
  });

  test('an empty scan passes', () => {
    const v = evaluateScaReport([]);
    expect(v.pass).toBe(true);
    expect(v.total).toBe(0);
  });

  test('the default policy is fix-available High', () => {
    expect(DEFAULT_SCA_POLICY).toEqual({ blockSeverity: 'high', requireFixAvailable: true, gateUnknownSeverity: true });
  });
});

describe('verifySbom — the build must emit a non-empty, known-format SBOM', () => {
  function sbom(overrides: Partial<SbomObservation> = {}): SbomObservation {
    return { present: true, format: 'cyclonedx', componentCount: 42, ...overrides };
  }

  test('a present, CycloneDX, non-empty SBOM passes', () => {
    expect(verifySbom(sbom()).pass).toBe(true);
  });

  test('spdx is also accepted', () => {
    expect(verifySbom(sbom({ format: 'SPDX' })).pass).toBe(true);
    expect([...SBOM_FORMATS]).toEqual(['cyclonedx', 'spdx']);
  });

  test('an absent SBOM fails outright and skips downstream rules', () => {
    const v = verifySbom(sbom({ present: false }));
    expect(v.pass).toBe(false);
    expect(v.findings).toHaveLength(1);
    expect(v.findings[0].risk).toBe('sbom-missing');
  });

  test('an unknown format fails (unknown-format)', () => {
    const v = verifySbom(sbom({ format: 'my-json' }));
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.risk === 'unknown-format')).toBe(true);
  });

  test('an empty SBOM fails (empty)', () => {
    const v = verifySbom(sbom({ componentCount: 0 }));
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.risk === 'empty')).toBe(true);
  });
});
