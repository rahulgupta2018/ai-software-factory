/**
 * Tier-1 — the build-provenance verifier (lib/provenance-verify.ts) behind the `/deploy` signing gate.
 *
 * A gate nobody watched fail is not a gate, so every rule has both sides: the fully-attested
 * artifact that MUST pass and the specific defect (no attestation, unverified signature, key-based
 * signing, wrong digest / identity / issuer / builder / source, missing transparency-log entry)
 * that MUST fail. Pure functions, no network, no keys — the whole policy is provable here, offline,
 * against a plain data fixture.
 */
import { describe, expect, test } from 'bun:test';

import {
  verifyProvenance,
  normalizeDigest,
  normalizeSourceUri,
  identityMatches,
  DEFAULT_PROVENANCE_POLICY,
  type ProvenanceObservation,
  type ProvenancePolicy,
} from '../lib/provenance-verify.ts';

const IDENTITY = 'https://github.com/example/reference-product/.github/workflows/release.yml@refs/heads/main';
const ISSUER = 'https://token.actions.githubusercontent.com';
const BUILDER = 'https://github.com/actions/runner';
const SOURCE = 'git+https://github.com/example/reference-product';
const DIGEST = 'sha256:1111111111111111111111111111111111111111111111111111111111111111';

/** A fully-attested artifact — the baseline every negative case perturbs by one field. */
function attested(overrides: Partial<ProvenanceObservation> = {}): ProvenanceObservation {
  return {
    artifact: 'reference-product:1.0.0',
    attestationPresent: true,
    signatureVerified: true,
    keyless: true,
    subjectDigest: DIGEST,
    certificateIdentity: IDENTITY,
    certificateIssuer: ISSUER,
    builderId: BUILDER,
    sourceUri: SOURCE,
    transparencyLogged: true,
    ...overrides,
  };
}

/** The reference product's policy — expected identity/issuer/builder/source plus custody invariants. */
const POLICY: ProvenancePolicy = {
  expectedDigest: DIGEST,
  expectedIdentity: IDENTITY,
  expectedIssuer: ISSUER,
  expectedBuilderId: BUILDER,
  expectedSourceUri: SOURCE,
  requireTransparencyLog: true,
  requireKeyless: true,
};

describe('verifyProvenance — a fully-attested artifact passes', () => {
  test('signature verified, keyless, matching digest/identity/issuer/builder/source, logged → pass', () => {
    const v = verifyProvenance(attested(), POLICY);
    expect(v.pass).toBe(true);
    expect(v.findings).toEqual([]);
    expect(v.artifact).toBe('reference-product:1.0.0');
  });

  test('default policy (custody invariants only) passes a keyless, logged artifact with no expected values', () => {
    const v = verifyProvenance(attested());
    expect(v.pass).toBe(true);
  });

  test('a regex identity matches the workflow ref', () => {
    const policy: ProvenancePolicy = {
      expectedIdentity: '^https://github\\.com/example/reference-product/\\.github/workflows/.+@refs/heads/main$',
      identityIsRegex: true,
    };
    expect(verifyProvenance(attested(), policy).pass).toBe(true);
  });
});

describe('verifyProvenance — each rule has a negative case that fails', () => {
  test('a missing attestation fails outright and skips downstream rules', () => {
    const v = verifyProvenance(attested({ attestationPresent: false }), POLICY);
    expect(v.pass).toBe(false);
    expect(v.findings).toHaveLength(1);
    expect(v.findings[0].risk).toBe('attestation-missing');
  });

  test('an unverified signature fails', () => {
    const v = verifyProvenance(attested({ signatureVerified: false }), POLICY);
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.risk === 'signature-invalid')).toBe(true);
  });

  test('a key-based signature fails the keyless custody rule', () => {
    const v = verifyProvenance(attested({ keyless: false }), POLICY);
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.risk === 'key-based-signing')).toBe(true);
  });

  test('a digest that does not match the deployed artifact fails', () => {
    const v = verifyProvenance(attested({ subjectDigest: 'sha256:deadbeef' }), POLICY);
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.risk === 'digest-mismatch')).toBe(true);
  });

  test('a missing digest fails when a digest is expected', () => {
    const v = verifyProvenance(attested({ subjectDigest: undefined }), POLICY);
    expect(v.findings.some((f) => f.risk === 'digest-mismatch')).toBe(true);
  });

  test('a wrong OIDC identity fails', () => {
    const v = verifyProvenance(attested({ certificateIdentity: 'https://github.com/attacker/evil/.github/workflows/release.yml@refs/heads/main' }), POLICY);
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.risk === 'identity-mismatch')).toBe(true);
  });

  test('a wrong OIDC issuer fails', () => {
    const v = verifyProvenance(attested({ certificateIssuer: 'https://gitlab.example.com' }), POLICY);
    expect(v.findings.some((f) => f.risk === 'issuer-mismatch')).toBe(true);
  });

  test('a wrong builder fails', () => {
    const v = verifyProvenance(attested({ builderId: 'https://evil.example/runner' }), POLICY);
    expect(v.findings.some((f) => f.risk === 'builder-mismatch')).toBe(true);
  });

  test('a wrong source repo fails', () => {
    const v = verifyProvenance(attested({ sourceUri: 'git+https://github.com/attacker/evil' }), POLICY);
    expect(v.findings.some((f) => f.risk === 'source-mismatch')).toBe(true);
  });

  test('a signature not in the transparency log fails', () => {
    const v = verifyProvenance(attested({ transparencyLogged: false }), POLICY);
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.risk === 'no-transparency-log')).toBe(true);
  });

  test('multiple defects accumulate — all reasons are reported, not just the first', () => {
    const v = verifyProvenance(attested({ keyless: false, transparencyLogged: false, builderId: 'x' }), POLICY);
    expect(v.pass).toBe(false);
    const risks = v.findings.map((f) => f.risk);
    expect(risks).toContain('key-based-signing');
    expect(risks).toContain('no-transparency-log');
    expect(risks).toContain('builder-mismatch');
  });
});

describe('verifyProvenance — custody invariants can be relaxed but default on', () => {
  test('requireKeyless=false allows a key-based signature', () => {
    const policy: ProvenancePolicy = { requireKeyless: false, requireTransparencyLog: false };
    expect(verifyProvenance(attested({ keyless: false }), policy).pass).toBe(true);
  });

  test('requireTransparencyLog=false allows an unlogged signature', () => {
    const policy: ProvenancePolicy = { requireTransparencyLog: false };
    expect(verifyProvenance(attested({ transparencyLogged: false }), policy).pass).toBe(true);
  });

  test('DEFAULT_PROVENANCE_POLICY enforces both custody invariants', () => {
    expect(DEFAULT_PROVENANCE_POLICY.requireKeyless).toBe(true);
    expect(DEFAULT_PROVENANCE_POLICY.requireTransparencyLog).toBe(true);
  });
});

describe('normalisation helpers', () => {
  test('normalizeDigest strips the algorithm prefix and lowercases', () => {
    expect(normalizeDigest('SHA256:ABCD')).toBe('abcd');
    expect(normalizeDigest('abcd')).toBe('abcd');
    expect(normalizeDigest(undefined)).toBe('');
  });

  test('normalizeSourceUri drops git+ scheme, .git suffix, trailing slash, and case', () => {
    expect(normalizeSourceUri('git+https://github.com/Org/Repo.git')).toBe('https://github.com/org/repo');
    expect(normalizeSourceUri('https://github.com/org/repo/')).toBe('https://github.com/org/repo');
    expect(normalizeSourceUri(null)).toBe('');
  });

  test('identityMatches: exact vs regex, and a malformed regex fails closed', () => {
    expect(identityMatches('a', 'a', false)).toBe(true);
    expect(identityMatches('abc', '^a.c$', true)).toBe(true);
    expect(identityMatches('abc', '(', true)).toBe(false); // unparseable regex must not wave anything through
  });
});
