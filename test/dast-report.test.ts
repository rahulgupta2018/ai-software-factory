import { describe, expect, test } from 'bun:test';

import {
  DEFAULT_DAST_POLICY,
  evaluateDastReport,
  normalizeDastConfidence,
  normalizeDastRisk,
  parseZapReport,
  type DastAlert,
  type DastPolicy,
} from '../lib/dast-report';

function alert(overrides: Partial<DastAlert> = {}): DastAlert {
  return {
    name: 'SQL Injection',
    risk: 'high',
    confidence: 'high',
    url: 'https://preview.example/repairs?q=1',
    ...overrides,
  };
}

describe('normalizeDastRisk — ZAP riskcode / label to the common scale', () => {
  test('maps 3/2/1 and labels, else informational', () => {
    expect(normalizeDastRisk('3')).toBe('high');
    expect(normalizeDastRisk('High')).toBe('high');
    expect(normalizeDastRisk('2')).toBe('medium');
    expect(normalizeDastRisk('1')).toBe('low');
    expect(normalizeDastRisk('0')).toBe('informational');
    expect(normalizeDastRisk(undefined)).toBe('informational');
  });
});

describe('normalizeDastConfidence — ZAP confidence to the common scale', () => {
  test('maps false-positive/low/medium/high/confirmed', () => {
    expect(normalizeDastConfidence('0')).toBe('false-positive');
    expect(normalizeDastConfidence('False Positive')).toBe('false-positive');
    expect(normalizeDastConfidence('1')).toBe('low');
    expect(normalizeDastConfidence('4')).toBe('confirmed');
    expect(normalizeDastConfidence('user confirmed')).toBe('confirmed');
  });
});

describe('parseZapReport — normalises a ZAP report, never throws', () => {
  test('extracts name, risk, confidence, url, and CWE', () => {
    const report = {
      site: [
        {
          '@name': 'https://preview.example',
          alerts: [
            {
              alert: 'SQL Injection',
              riskcode: '3',
              confidence: '3',
              cweid: '89',
              instances: [{ uri: 'https://preview.example/repairs?q=1' }],
            },
          ],
        },
      ],
    };
    const alerts = parseZapReport(report);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toEqual({
      name: 'SQL Injection',
      risk: 'high',
      confidence: 'high',
      url: 'https://preview.example/repairs?q=1',
      cwe: 'CWE-89',
    });
  });

  test('a -1 cweid yields no CWE and a missing instance falls back to the site name', () => {
    const report = {
      site: [{ '@name': 'https://preview.example', alerts: [{ alert: 'X', riskcode: '1', confidence: '2', cweid: '-1' }] }],
    };
    const [a] = parseZapReport(report);
    expect(a.cwe).toBeUndefined();
    expect(a.url).toBe('https://preview.example');
  });

  test('malformed / empty input returns [] without throwing', () => {
    expect(parseZapReport(undefined)).toEqual([]);
    expect(parseZapReport({ site: 'nope' })).toEqual([]);
  });
});

describe('evaluateDastReport — the risk gate', () => {
  test('a High-risk confirmed alert gates under the default policy', () => {
    const verdict = evaluateDastReport([alert({ risk: 'high', confidence: 'high' })]);
    expect(verdict.pass).toBe(false);
    expect(verdict.blocking).toHaveLength(1);
  });

  test('a High-risk false-positive never gates', () => {
    const verdict = evaluateDastReport([alert({ risk: 'high', confidence: 'false-positive' })]);
    expect(verdict.pass).toBe(true);
  });

  test('a Medium-risk alert does not gate under the default (High) policy', () => {
    expect(evaluateDastReport([alert({ risk: 'medium' })]).pass).toBe(true);
  });

  test('an informational alert never trips the gate', () => {
    expect(evaluateDastReport([alert({ risk: 'informational' })]).pass).toBe(true);
  });

  test('a stricter Medium policy gates a Medium-risk alert', () => {
    const policy: DastPolicy = { ...DEFAULT_DAST_POLICY, blockRisk: 'medium' };
    expect(evaluateDastReport([alert({ risk: 'medium', confidence: 'medium' })], policy).pass).toBe(false);
  });

  test('raising minConfidence to confirmed mutes a merely-high-confidence alert', () => {
    const policy: DastPolicy = { ...DEFAULT_DAST_POLICY, minConfidence: 'confirmed' };
    expect(evaluateDastReport([alert({ risk: 'high', confidence: 'high' })], policy).pass).toBe(true);
    expect(evaluateDastReport([alert({ risk: 'high', confidence: 'confirmed' })], policy).pass).toBe(false);
  });

  test('an empty scan passes', () => {
    expect(evaluateDastReport([]).pass).toBe(true);
  });

  test('DEFAULT_DAST_POLICY gates High at low+ confidence', () => {
    expect(DEFAULT_DAST_POLICY.blockRisk).toBe('high');
    expect(DEFAULT_DAST_POLICY.minConfidence).toBe('low');
  });
});
