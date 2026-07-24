/**
 * Mobile release verifier — the mechanical half of the store-submission gate `/deploy` enforces
 * for the Apple and Google mobile tracks (plan §9, Phase 6).
 *
 * The Factory holds no signing or store credentials and never mints a signing key: the Android
 * keystore, the iOS distribution cert + provisioning profile, the App Store Connect API key, and
 * the Google Play service-account JSON all live in CI, never in the repo, context, or logs (the
 * custody principle, §6.2). What the Factory DOES own is the check: before an irreversible store
 * submission, `/deploy` gathers what the build actually produced (which store, which artifact and
 * whether it exists + is signed, the build number vs the last release, the target track, and
 * whether the manifest embeds a secret it must not) and passes that observation here.
 * `verifyMobileRelease` decides pass/fail against a fixed policy: a present, signed artifact whose
 * format matches the store, a strictly monotonic build number, a valid track, and no embedded
 * signing secret.
 *
 * Pure by design (no node imports, no network, no store API, no keys) so the whole policy is
 * provable in `bun test` with a negative case per rule — the absent build that must fail, the
 * `.apk` sent to Play that must fail, the re-used build number that must fail, the bogus track
 * that must fail, the manifest with an embedded credential that must fail — all offline against a
 * plain data fixture. The observation is gathered elsewhere (a `fastlane` / `flutter build` step
 * in the deploy skill); this module never touches a store or a signing key.
 */

/** The two mobile app stores. Each is its own `/deploy` branch — different artifact, tooling, and review model. */
export type Store = 'apple' | 'google';

/** Why a release fails the store gate — drives the finding text `/deploy` shows. */
export type MobileReleaseRisk =
  | 'build-missing'
  | 'unsigned'
  | 'wrong-format'
  | 'version-not-monotonic'
  | 'invalid-track'
  | 'embedded-secret';

/**
 * What was observed for one store release. Gathered by the deploy skill (not this module) and
 * passed in as plain data, so the check is deterministic against a fixture.
 */
export interface MobileReleaseObservation {
  /** Which store this release targets. */
  store: Store;
  /** Path/name of the built artifact, e.g. `build/app.ipa` or `build/app.aab`. Its extension is checked against the store. */
  artifact: string;
  /** Whether the build actually produced the artifact on disk. False = nothing to submit. */
  artifactPresent: boolean;
  /** Whether the artifact was signed with the CI-held signing material. */
  signed: boolean;
  /** This build's monotonic release number (iOS build number / Android versionCode). */
  buildNumber: number;
  /** The last released build number for this app+store, or null on the first ever release. */
  lastReleasedBuildNumber: number | null;
  /** Target release track, e.g. `testflight`/`app-store` (Apple) or `internal`/`closed`/`production` (Google). */
  track: string;
  /**
   * True if the release manifest embeds a signing-secret VALUE (a keystore password, the ASC API
   * key, the Play service-account JSON, ...). MUST be false — the custody principle keeps secrets
   * in CI only; the manifest references CI, it never holds the secret. Absent is treated as false.
   */
  embedsSigningSecret?: boolean;
}

/** One failed policy rule. */
export interface MobileReleaseFinding {
  rule: string;
  risk: MobileReleaseRisk;
  detail: string;
}

/** Verdict for one store release: whether it passed the gate. */
export interface MobileReleaseVerdict {
  store: Store;
  artifact: string;
  pass: boolean;
  findings: MobileReleaseFinding[];
}

/** The artifact format each store requires. Play rejects `.apk` for a store release — it needs an App Bundle. */
export const FORMAT_FOR_STORE: Readonly<Record<Store, string>> = {
  apple: '.ipa',
  google: '.aab',
};

/** The release tracks each store accepts. Anything else is a typo or an invalid target. */
export const TRACKS_FOR_STORE: Readonly<Record<Store, readonly string[]>> = {
  apple: ['testflight', 'app-store'],
  google: ['internal', 'closed', 'production'],
};

/** Lower-cased file extension of an artifact path (including the dot), or '' if none. */
export function artifactExtension(artifact: string): string {
  const match = /(\.[a-z0-9]+)$/i.exec(artifact.trim());
  return match ? match[1].toLowerCase() : '';
}

/**
 * Verify one store release against the submission policy.
 *
 * A missing build short-circuits to a single failing finding — none of the format/version/track
 * rules can apply when there is nothing to submit (mirrors the plaintext short-circuit in
 * `verifyTls`).
 */
export function verifyMobileRelease(obs: MobileReleaseObservation): MobileReleaseVerdict {
  const findings: MobileReleaseFinding[] = [];

  // No artifact = nothing to submit. Fail outright; downstream rules can't apply.
  if (!obs.artifactPresent) {
    findings.push({
      rule: 'build-present',
      risk: 'build-missing',
      detail: `no ${obs.store} artifact produced at ${obs.artifact}; the build must succeed before a submission`,
    });
    return { store: obs.store, artifact: obs.artifact, pass: false, findings };
  }

  if (!obs.signed) {
    findings.push({
      rule: 'signed',
      risk: 'unsigned',
      detail: 'artifact is not signed with the CI-held signing material; an unsigned build cannot be submitted',
    });
  }

  const expectedFormat = FORMAT_FOR_STORE[obs.store];
  const actualFormat = artifactExtension(obs.artifact);
  if (actualFormat !== expectedFormat) {
    findings.push({
      rule: 'artifact-format',
      risk: 'wrong-format',
      detail: `${obs.store} requires a ${expectedFormat} artifact; got ${actualFormat || 'no extension'} (${obs.artifact})`,
    });
  }

  // Monotonicity: a first release just needs a positive number; a subsequent one must strictly
  // exceed the last released build (a store rejects a re-used or lower build number).
  if (!Number.isInteger(obs.buildNumber) || obs.buildNumber < 1) {
    findings.push({
      rule: 'version-monotonic',
      risk: 'version-not-monotonic',
      detail: `build number ${obs.buildNumber} is not a positive integer`,
    });
  } else if (obs.lastReleasedBuildNumber !== null && obs.buildNumber <= obs.lastReleasedBuildNumber) {
    findings.push({
      rule: 'version-monotonic',
      risk: 'version-not-monotonic',
      detail: `build number ${obs.buildNumber} is not greater than the last released ${obs.lastReleasedBuildNumber}`,
    });
  }

  if (!TRACKS_FOR_STORE[obs.store].includes(obs.track)) {
    findings.push({
      rule: 'valid-track',
      risk: 'invalid-track',
      detail: `'${obs.track}' is not a valid ${obs.store} track (expected one of: ${TRACKS_FOR_STORE[obs.store].join(', ')})`,
    });
  }

  // Custody: the manifest must reference CI-held secrets, never embed a secret value.
  if (obs.embedsSigningSecret === true) {
    findings.push({
      rule: 'no-embedded-secret',
      risk: 'embedded-secret',
      detail: 'release manifest embeds a signing-secret value; signing material must live in CI only (custody principle)',
    });
  }

  return { store: obs.store, artifact: obs.artifact, pass: findings.length === 0, findings };
}

/** Verify a set of store releases. The batch passes only if every release passes. */
export function verifyMobileReleases(
  observations: readonly MobileReleaseObservation[],
): { pass: boolean; verdicts: MobileReleaseVerdict[] } {
  const verdicts = observations.map((o) => verifyMobileRelease(o));
  return { pass: verdicts.every((v) => v.pass), verdicts };
}
