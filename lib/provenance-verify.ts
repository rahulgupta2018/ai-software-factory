/**
 * Build-provenance verifier — the mechanical half of the artifact-signing gate `/deploy` enforces
 * before a release (plan §Phase 7, Track 3).
 *
 * A release artifact is signed and gets a build-provenance attestation (Sigstore/cosign keyless
 * signature + SLSA provenance) so a consumer can prove *what built this artifact and from which
 * source*. The signing identity is **keyless (OIDC)** — the Factory holds no signing key and never
 * mints one (custody principle, §6.2/§7). Signing + attestation happen in CI; verification
 * (`cosign verify-attestation` / `slsa-verifier`) also runs in CI and reports a set of facts.
 * What the Factory DOES own is the policy: given those already-produced facts, decide whether the
 * artifact about to ship is the one that was built, by the expected workflow, from the expected
 * source — and block the release if not.
 *
 * Pure by design (no node imports, no network, no keys) so the whole policy is provable in
 * `bun test` with a negative case per rule — the absent attestation that must fail, the unverified
 * signature, the digest that doesn't match the artifact being deployed, the wrong OIDC identity /
 * issuer, the wrong builder / source, the missing transparency-log entry, the long-lived-key
 * signature that violates the keyless custody rule. The attestation is verified elsewhere (a
 * cosign/slsa-verifier step in the deploy pipeline); this module never touches a socket or a key.
 */

/** Why an artifact fails the provenance gate — drives the finding text `/deploy` shows. */
export type ProvenanceRisk =
  | 'attestation-missing'
  | 'signature-invalid'
  | 'key-based-signing'
  | 'digest-mismatch'
  | 'identity-mismatch'
  | 'issuer-mismatch'
  | 'builder-mismatch'
  | 'source-mismatch'
  | 'no-transparency-log';

/**
 * What a cosign/slsa-verifier run reported about one artifact's attestation. Gathered by the deploy
 * pipeline (not this module) and passed in as plain data, so the check is deterministic against a
 * fixture. Optional fields are "not reported"; the policy decides whether their absence fails.
 */
export interface ProvenanceObservation {
  /** Artifact identifier (name / image tag) echoed into the verdict. */
  artifact: string;
  /** Whether an attestation was found for the artifact. */
  attestationPresent: boolean;
  /** Whether cosign verified the signature (bundle valid, chained to the Fulcio root). */
  signatureVerified: boolean;
  /** Whether signing was keyless (OIDC/Fulcio short-lived cert) rather than a long-lived key. */
  keyless: boolean;
  /** The digest the attestation covers, e.g. `sha256:abcd…`. Must match the artifact being deployed. */
  subjectDigest?: string;
  /** The OIDC certificate identity (SAN) — e.g. the GitHub Actions workflow URI. */
  certificateIdentity?: string;
  /** The OIDC issuer, e.g. `https://token.actions.githubusercontent.com`. */
  certificateIssuer?: string;
  /** SLSA provenance builder id, e.g. `https://github.com/actions/runner`. */
  builderId?: string;
  /** SLSA provenance source repo URI, e.g. `git+https://github.com/org/repo`. */
  sourceUri?: string;
  /** Whether the signature was recorded in a transparency log (Rekor). */
  transparencyLogged?: boolean;
}

/**
 * The gate policy: the expected identity/source/builder to check against, plus the two custody
 * invariants (keyless signing, transparency-log inclusion). Expected fields are only checked when
 * set; the custody invariants default on.
 */
export interface ProvenancePolicy {
  /** The digest of the artifact actually being deployed — the attestation subject must match it. */
  expectedDigest?: string;
  /** Expected OIDC certificate identity. Exact match unless `identityIsRegex`. */
  expectedIdentity?: string;
  /** When true, `expectedIdentity` is treated as a regular-expression source string. */
  identityIsRegex?: boolean;
  /** Expected OIDC issuer (exact). */
  expectedIssuer?: string;
  /** Expected SLSA builder id (exact). */
  expectedBuilderId?: string;
  /** Expected source repo URI (matched after normalising `git+` / `.git` / trailing slash / case). */
  expectedSourceUri?: string;
  /** Require the signature to be in a transparency log (Rekor). Default true. */
  requireTransparencyLog?: boolean;
  /** Require keyless (OIDC) signing — reject a long-lived-key signature. Default true. */
  requireKeyless?: boolean;
}

/** The default provenance policy: enforce the two custody invariants; expected values are per-product. */
export const DEFAULT_PROVENANCE_POLICY: ProvenancePolicy = {
  requireTransparencyLog: true,
  requireKeyless: true,
};

/** One failed policy rule. */
export interface ProvenanceFinding {
  rule: string;
  risk: ProvenanceRisk;
  detail: string;
}

/** Verdict for one artifact: whether its provenance satisfies the policy. */
export interface ProvenanceVerdict {
  artifact: string;
  pass: boolean;
  findings: ProvenanceFinding[];
}

/** Strip a `sha256:` (or other) algorithm prefix and normalise for comparison. */
export function normalizeDigest(digest: string | null | undefined): string {
  const d = (digest ?? '').trim().toLowerCase();
  const colon = d.indexOf(':');
  return colon >= 0 ? d.slice(colon + 1) : d;
}

/** Normalise a source repo URI for comparison: drop a `git+` scheme prefix, a trailing `.git`, a trailing slash, and case. */
export function normalizeSourceUri(uri: string | null | undefined): string {
  let u = (uri ?? '').trim().toLowerCase();
  if (u.startsWith('git+')) u = u.slice(4);
  if (u.endsWith('.git')) u = u.slice(0, -4);
  if (u.endsWith('/')) u = u.slice(0, -1);
  return u;
}

/** Does an observed identity satisfy the expected one (exact, or regex when `isRegex`)? A malformed regex fails closed. */
export function identityMatches(observed: string, expected: string, isRegex: boolean): boolean {
  if (!isRegex) return observed === expected;
  try {
    return new RegExp(expected).test(observed);
  } catch {
    return false; // an unparseable policy regex can't be satisfied — fail closed, don't wave it through.
  }
}

/**
 * Verify one artifact's build provenance against the policy.
 *
 * A missing attestation short-circuits — no other rule can apply when there is nothing to verify.
 * Otherwise every rule is checked and its failures accumulated, so `/deploy` shows the full reason
 * a release was blocked, not just the first problem.
 */
export function verifyProvenance(
  obs: ProvenanceObservation,
  policy: ProvenancePolicy = DEFAULT_PROVENANCE_POLICY,
): ProvenanceVerdict {
  const findings: ProvenanceFinding[] = [];

  if (!obs.attestationPresent) {
    findings.push({
      rule: 'attestation-present',
      risk: 'attestation-missing',
      detail: 'no build-provenance attestation found for the artifact; a signed SLSA attestation is required before release',
    });
    return { artifact: obs.artifact, pass: false, findings };
  }

  if (!obs.signatureVerified) {
    findings.push({
      rule: 'signature-verified',
      risk: 'signature-invalid',
      detail: 'attestation signature did not verify (bundle invalid or not chained to a trusted root)',
    });
  }

  const requireKeyless = policy.requireKeyless ?? true;
  if (requireKeyless && !obs.keyless) {
    findings.push({
      rule: 'keyless-signing',
      risk: 'key-based-signing',
      detail: 'artifact was signed with a long-lived key; keyless (OIDC/Fulcio) signing is required — the Factory holds no signing key',
    });
  }

  if (policy.expectedDigest !== undefined) {
    const want = normalizeDigest(policy.expectedDigest);
    const got = normalizeDigest(obs.subjectDigest);
    if (got === '' || got !== want) {
      findings.push({
        rule: 'digest-match',
        risk: 'digest-mismatch',
        detail: `attestation subject digest '${obs.subjectDigest ?? '(none)'}' does not match the artifact being deployed '${policy.expectedDigest}'`,
      });
    }
  }

  if (policy.expectedIdentity !== undefined) {
    const observed = obs.certificateIdentity ?? '';
    if (!identityMatches(observed, policy.expectedIdentity, policy.identityIsRegex ?? false)) {
      findings.push({
        rule: 'identity-match',
        risk: 'identity-mismatch',
        detail: `signing identity '${observed || '(none)'}' does not match the expected identity '${policy.expectedIdentity}'`,
      });
    }
  }

  if (policy.expectedIssuer !== undefined && (obs.certificateIssuer ?? '') !== policy.expectedIssuer) {
    findings.push({
      rule: 'issuer-match',
      risk: 'issuer-mismatch',
      detail: `OIDC issuer '${obs.certificateIssuer ?? '(none)'}' does not match the expected issuer '${policy.expectedIssuer}'`,
    });
  }

  if (policy.expectedBuilderId !== undefined && (obs.builderId ?? '') !== policy.expectedBuilderId) {
    findings.push({
      rule: 'builder-match',
      risk: 'builder-mismatch',
      detail: `provenance builder '${obs.builderId ?? '(none)'}' does not match the expected builder '${policy.expectedBuilderId}'`,
    });
  }

  if (policy.expectedSourceUri !== undefined && normalizeSourceUri(obs.sourceUri) !== normalizeSourceUri(policy.expectedSourceUri)) {
    findings.push({
      rule: 'source-match',
      risk: 'source-mismatch',
      detail: `provenance source '${obs.sourceUri ?? '(none)'}' does not match the expected source '${policy.expectedSourceUri}'`,
    });
  }

  const requireTransparencyLog = policy.requireTransparencyLog ?? true;
  if (requireTransparencyLog && obs.transparencyLogged !== true) {
    findings.push({
      rule: 'transparency-log',
      risk: 'no-transparency-log',
      detail: 'signature was not recorded in a transparency log (Rekor); public log inclusion is required for verifiable provenance',
    });
  }

  return { artifact: obs.artifact, pass: findings.length === 0, findings };
}
