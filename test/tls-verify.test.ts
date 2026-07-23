/**
 * Tier-1 — the transport-security verifier (lib/tls-verify.ts) behind the `/deploy` TLS gate.
 *
 * A gate nobody watched fail is not a gate, so every rule has both sides: the healthy endpoint
 * that MUST pass and the specific defect (plaintext, bad chain, expired leaf, TLS 1.0, missing or
 * short HSTS) that MUST fail. Pure functions with an injected clock, no network — the whole policy
 * is provable here, offline, against a plain data fixture.
 */
import { describe, expect, test } from 'bun:test';

import {
  verifyTls,
  verifyEndpoints,
  parseTlsVersion,
  parseHstsMaxAge,
  MIN_HSTS_MAX_AGE,
  type TlsObservation,
} from '../lib/tls-verify.ts';

const NOW = new Date('2026-07-23T00:00:00Z');

/** A fully-healthy public endpoint — the baseline every negative case perturbs by one field. */
function healthy(overrides: Partial<TlsObservation> = {}): TlsObservation {
  return {
    endpoint: 'app.example.com',
    isPublic: true,
    tlsEnabled: true,
    chainValid: true,
    notBefore: '2026-06-01T00:00:00Z',
    notAfter: '2026-09-01T00:00:00Z',
    protocol: 'TLSv1.3',
    hstsHeader: 'max-age=31536000; includeSubDomains',
    ...overrides,
  };
}

describe('verifyTls — a healthy public endpoint passes', () => {
  test('valid chain, in date, TLS 1.3, strong HSTS → pass, gated', () => {
    const v = verifyTls(healthy(), NOW);
    expect(v.pass).toBe(true);
    expect(v.gated).toBe(true);
    expect(v.findings).toEqual([]);
  });

  test('TLS 1.2 is accepted (the floor, not a failure)', () => {
    expect(verifyTls(healthy({ protocol: 'TLSv1.2' }), NOW).pass).toBe(true);
  });
});

describe('verifyTls — each rule has a negative case that fails', () => {
  test('plaintext HTTP fails outright (no-tls) and skips downstream rules', () => {
    const v = verifyTls(healthy({ tlsEnabled: false }), NOW);
    expect(v.pass).toBe(false);
    expect(v.findings).toHaveLength(1);
    expect(v.findings[0].risk).toBe('no-tls');
  });

  test('untrusted chain fails (invalid-chain)', () => {
    const v = verifyTls(healthy({ chainValid: false }), NOW);
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.risk === 'invalid-chain')).toBe(true);
  });

  test('expired leaf fails (expired)', () => {
    const v = verifyTls(healthy({ notAfter: '2026-07-01T00:00:00Z' }), NOW);
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.risk === 'expired')).toBe(true);
  });

  test('unknown expiry fails — the gate proves in-date, it does not assume it', () => {
    const v = verifyTls(healthy({ notAfter: undefined }), NOW);
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.risk === 'expired')).toBe(true);
  });

  test('not-yet-valid leaf fails (not-yet-valid)', () => {
    const v = verifyTls(healthy({ notBefore: '2026-08-01T00:00:00Z' }), NOW);
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.risk === 'not-yet-valid')).toBe(true);
  });

  test('TLS 1.0 fails (weak-protocol)', () => {
    const v = verifyTls(healthy({ protocol: 'TLSv1.0' }), NOW);
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.risk === 'weak-protocol')).toBe(true);
  });

  test('missing HSTS fails (no-hsts)', () => {
    const v = verifyTls(healthy({ hstsHeader: null }), NOW);
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.risk === 'no-hsts')).toBe(true);
  });

  test('short-lived HSTS fails (weak-hsts)', () => {
    const v = verifyTls(healthy({ hstsHeader: 'max-age=3600' }), NOW);
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.risk === 'weak-hsts')).toBe(true);
  });
});

describe('verifyTls — the gate only applies to public endpoints', () => {
  test('an internal endpoint passes ungated even with no TLS at all', () => {
    const v = verifyTls(healthy({ isPublic: false, tlsEnabled: false, hstsHeader: null }), NOW);
    expect(v.gated).toBe(false);
    expect(v.pass).toBe(true);
    expect(v.findings).toEqual([]);
  });
});

describe('parsers', () => {
  test('parseTlsVersion reads TLSvX.Y and bare X.Y', () => {
    expect(parseTlsVersion('TLSv1.3')).toBe(1.3);
    expect(parseTlsVersion('1.2')).toBe(1.2);
    expect(Number.isNaN(parseTlsVersion('SSLv3'))).toBe(true);
  });

  test('parseHstsMaxAge reads max-age, ignores other directives, null when absent', () => {
    expect(parseHstsMaxAge('max-age=31536000; includeSubDomains')).toBe(31_536_000);
    expect(parseHstsMaxAge('includeSubDomains')).toBeNull();
    expect(MIN_HSTS_MAX_AGE).toBe(15_552_000);
  });
});

describe('verifyEndpoints — a batch passes only if every gated endpoint passes', () => {
  test('one bad endpoint fails the batch; internal endpoints do not drag it down', () => {
    const batch = verifyEndpoints(
      [
        healthy({ endpoint: 'good.example.com' }),
        healthy({ endpoint: 'internal.svc', isPublic: false, tlsEnabled: false, hstsHeader: null }),
        healthy({ endpoint: 'bad.example.com', protocol: 'TLSv1.0' }),
      ],
      NOW,
    );
    expect(batch.pass).toBe(false);
    expect(batch.verdicts.find((v) => v.endpoint === 'bad.example.com')?.pass).toBe(false);
    expect(batch.verdicts.find((v) => v.endpoint === 'internal.svc')?.gated).toBe(false);
  });

  test('all-healthy public batch passes', () => {
    const batch = verifyEndpoints([healthy(), healthy({ endpoint: 'b.example.com' })], NOW);
    expect(batch.pass).toBe(true);
  });
});
