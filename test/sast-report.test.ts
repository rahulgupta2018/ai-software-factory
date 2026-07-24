/**
 * Tier-1 — the SAST report verifier (lib/sast-report.ts) behind the `/security` static-analysis gate.
 *
 * A gate nobody watched fail is not a gate, so every rule has both sides: the high-severity finding
 * that MUST gate and the low-severity note that MUST NOT, across both analyzer formats (semgrep
 * JSON and SARIF/CodeQL), plus malformed input that MUST NOT throw. Pure functions, no network, no
 * analyzer binary — the whole policy is provable here, offline, against plain data fixtures.
 */
import { describe, expect, test } from 'bun:test';

import {
  normalizeSastSeverity,
  severityFromSecuritySeverity,
  parseSemgrep,
  parseSarif,
  parseSastReport,
  evaluateSastReport,
  DEFAULT_SAST_POLICY,
  type SastFinding,
} from '../lib/sast-report.ts';

/** A baseline normalised finding; negative cases perturb one field. */
function finding(overrides: Partial<SastFinding> = {}): SastFinding {
  return {
    ruleId: 'rule.x',
    message: 'issue',
    severity: 'high',
    file: 'src/a.ts',
    line: 10,
    ...overrides,
  };
}

describe('normalizeSastSeverity — tool severities fold onto the shared tiers', () => {
  test('named tiers and analyzer levels map correctly', () => {
    expect(normalizeSastSeverity('CRITICAL')).toBe('critical');
    expect(normalizeSastSeverity('ERROR')).toBe('high'); // semgrep ERROR / SARIF error
    expect(normalizeSastSeverity('High')).toBe('high');
    expect(normalizeSastSeverity('WARNING')).toBe('medium');
    expect(normalizeSastSeverity('INFO')).toBe('low');
    expect(normalizeSastSeverity('note')).toBe('low');
  });

  test('unrecognised / empty → unknown', () => {
    expect(normalizeSastSeverity('weird')).toBe('unknown');
    expect(normalizeSastSeverity('')).toBe('unknown');
    expect(normalizeSastSeverity(undefined)).toBe('unknown');
  });
});

describe('severityFromSecuritySeverity — CodeQL CVSS-like score → tier', () => {
  test('boundaries', () => {
    expect(severityFromSecuritySeverity(9.0)).toBe('critical');
    expect(severityFromSecuritySeverity(7.0)).toBe('high');
    expect(severityFromSecuritySeverity(4.0)).toBe('medium');
    expect(severityFromSecuritySeverity(1.0)).toBe('low');
    expect(severityFromSecuritySeverity(0)).toBe('unknown');
    expect(severityFromSecuritySeverity(null)).toBe('unknown');
  });
});

describe('parseSemgrep — maps native JSON, prefers metadata severity, never throws', () => {
  test('extracts rule, path, line, severity, and CWE', () => {
    const report = {
      results: [
        {
          check_id: 'python.lang.security.audit.dangerous-exec',
          path: 'app/main.py',
          start: { line: 42 },
          extra: {
            severity: 'ERROR',
            message: 'Detected use of exec',
            metadata: { severity: 'HIGH', cwe: ['CWE-95: Eval Injection'] },
          },
        },
      ],
    };
    const [f] = parseSemgrep(report);
    expect(f.ruleId).toBe('python.lang.security.audit.dangerous-exec');
    expect(f.file).toBe('app/main.py');
    expect(f.line).toBe(42);
    expect(f.severity).toBe('high');
    expect(f.cwe).toBe('CWE-95');
  });

  test('falls back to the ERROR/WARNING level when no metadata severity', () => {
    const [f] = parseSemgrep({ results: [{ check_id: 'r', path: 'p', extra: { severity: 'WARNING' } }] });
    expect(f.severity).toBe('medium');
  });

  test('malformed / empty input returns [] without throwing', () => {
    expect(parseSemgrep(null)).toEqual([]);
    expect(parseSemgrep({})).toEqual([]);
    expect(parseSemgrep({ results: 'nope' })).toEqual([]);
    expect(parseSemgrep({ results: [{}] })).toHaveLength(1); // degrades to safe defaults
  });
});

describe('parseSarif — maps SARIF, resolves severity from the driver rule, never throws', () => {
  const sarif = {
    runs: [
      {
        tool: { driver: { rules: [{ id: 'js/sql-injection', properties: { 'security-severity': '8.8', tags: ['security', 'external/cwe/cwe-089'] } }] } },
        results: [
          {
            ruleId: 'js/sql-injection',
            level: 'warning',
            message: { text: 'SQL injection' },
            locations: [{ physicalLocation: { artifactLocation: { uri: 'src/db.js' }, region: { startLine: 7 } } }],
          },
        ],
      },
    ],
  };

  test('resolves security-severity (8.8 → high) over the SARIF level, with CWE from tags', () => {
    const [f] = parseSarif(sarif);
    expect(f.ruleId).toBe('js/sql-injection');
    expect(f.file).toBe('src/db.js');
    expect(f.line).toBe(7);
    expect(f.severity).toBe('high'); // 8.8 wins over level=warning(=medium)
    expect(f.cwe).toBe('CWE-89');
  });

  test('falls back to the result level when the rule has no security-severity', () => {
    const noScore = {
      runs: [{ tool: { driver: { rules: [{ id: 'r' }] } }, results: [{ ruleId: 'r', level: 'error', message: { text: 'm' }, locations: [] }] }],
    };
    expect(parseSarif(noScore)[0].severity).toBe('high'); // error → high
  });

  test('malformed / empty input returns [] without throwing', () => {
    expect(parseSarif(null)).toEqual([]);
    expect(parseSarif({ runs: [{}] })).toEqual([]);
  });
});

describe('parseSastReport — dispatches by format', () => {
  test('routes to the right parser', () => {
    expect(parseSastReport('semgrep', { results: [{ check_id: 'a', path: 'p', extra: { severity: 'ERROR' } }] })).toHaveLength(1);
    expect(parseSastReport('sarif', { runs: [{ results: [{ ruleId: 'r', level: 'error', message: { text: 'm' }, locations: [] }] }] })).toHaveLength(1);
  });
});

describe('evaluateSastReport — the severity gate', () => {
  test('a High finding gates under the default policy', () => {
    const v = evaluateSastReport([finding({ severity: 'high' })]);
    expect(v.pass).toBe(false);
    expect(v.blocking).toHaveLength(1);
  });

  test('a Critical finding gates', () => {
    expect(evaluateSastReport([finding({ severity: 'critical' })]).pass).toBe(false);
  });

  test('a Medium finding does not gate under the default (High) policy', () => {
    const v = evaluateSastReport([finding({ severity: 'medium' })]);
    expect(v.pass).toBe(true);
    expect(v.findings[0].blocking).toBe(false);
  });

  test('an unknown-severity finding never trips the gate', () => {
    expect(evaluateSastReport([finding({ severity: 'unknown' })]).pass).toBe(true);
  });

  test('a stricter Medium policy gates a Medium finding', () => {
    const v = evaluateSastReport([finding({ severity: 'medium' })], { blockSeverity: 'medium' });
    expect(v.pass).toBe(false);
  });

  test('an empty scan passes', () => {
    const v = evaluateSastReport([]);
    expect(v.pass).toBe(true);
    expect(v.total).toBe(0);
  });

  test('DEFAULT_SAST_POLICY gates at High', () => {
    expect(DEFAULT_SAST_POLICY.blockSeverity).toBe('high');
  });
});
