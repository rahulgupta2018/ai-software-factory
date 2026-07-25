# Changelog

All notable changes to the AI Software Factory are documented here. This file is **for users** —
it describes what you can do, not how the sausage was made.

## [0.47.0.0] — 2026-07-25

**`fac init` now scaffolds a product that reflects everything the Factory can do: the stack template carries the whole security/supply-chain binding surface, and the PRD template prompts for the sections professional software needs.**

The templates had fallen two capability-generations behind the Factory itself — the stack template
showed 3 of ~19 supported `tech_bindings` and none of the Phase 6/7 security gates, so a product
scaffolded from it started blind to its own guardrails. Both are now brought to parity, and a new
test guards them so they can't silently rot again.

### Changed
- **`stack.template.yaml` reaches parity with the schema.** It now catalogues every binding the
  Factory gates on — app security (`auth`/`crypto`/`session`/`tls`), the supply-chain & CI/CD stack
  (`supply_chain`, `sast`, `provenance`, `ci`, `container_scan`, `dast`), mobile store release, plus
  `tenancy`, `guardrails.prohibited_data`, and `compliance_rules` — as commented, optional stanzas,
  each noting what gates on it and pointing to the reference product for a worked example. An
  untouched scaffold stays a valid minimal file.
- **`PRD.template.md` prompts for the professional-software sections.** Added **User journeys / key
  flows**, **Data & domain model**, **Integrations & external dependencies**, **Compliance & data
  handling**, and **Risks** (15 sections total). `/discover` now fills the full set.

### Added
- **A guard test for the product templates** (`test/templates.test.ts`): both parse, the stack
  catalogue stays commented (nothing leaks into the object), the binding surface is documented, and
  a scaffolded-then-filled product merges and passes the schema — while an untouched scaffold fails.
  `fac init` reads the templates live, so the fix reaches every new product with no build step.

## [0.46.0.0] — 2026-07-25

**The REFLECT phase re-review closes the loop: retro, health, learn, and skill-smith now record where cross-run reflection belongs — a dedicated "reflection band" outside the product pipeline — instead of giving a command the CLI rejects. Every phase of the pipeline has now been reviewed.**

The four reflection skills are the best-scoped in the Factory, but they all shared the same gaps:
a run-artifact command with no `--seq` (so the CLI rejected it), a mis-filed `Ops` layer, and no
evals. Fixing them surfaced a real design point: a weekly retro, a health sweep, a cross-task
lesson, and Factory-repo skill authoring aren't steps in a product's 1–6 pipeline — so anchoring
their artifacts to it was a category error. They now use a **reflection band** (`--seq 9`, outside
the pipeline), and skill-smith — which works on the Factory's own skills, where there may be no
product run at all — treats the run artifact as optional, its real record being the committed
template and a green `skill:check`.

### Fixed
- **All four REFLECT skills gave a run-artifact command the CLI rejects** (no `--seq`). They now
  record in the **reflection band**: `09-retro.md`, `09-health.md`, `09-learn.md`, and (optionally)
  `09-skill-smith.md` — a seq outside the 1–6 pipeline that marks a cross-run reflection, not a
  linear step, and targets a specific run with `--id`.
- **`/skill-smith` presumed a product run it may not have.** Working on the Factory's own skills, its
  durable record is now the committed `SKILL.md.tmpl` + a passing `skill:check` + the CHANGELOG; the
  run artifact is written only when it's operating inside a product run.
- **`/retro`, `/health`, `/learn`, `/skill-smith` were mis-filed as `Ops`** — corrected to `Reflect`
  (the lifecycle phase they belong to).
- **`/skill-smith` documented a non-canonical invocation** (`bun scripts/gen-skill-docs.ts`) —
  corrected to `bun run gen:skills` / `bun run skill:check`, matching every other skill.

### Added
- **Eval coverage for the whole REFLECT phase** — Tier-2 discipline rubrics for `/retro`, `/health`,
  `/learn`, and `/skill-smith`, plus Tier-3 gate/periodic scenarios for `/skill-smith` and `/health`.
  Each proves it fails when the discipline is dropped (e.g. strip skill-smith's generator-owned +
  governance discipline and its rubric fails).

## [0.45.0.0] — 2026-07-25

**The SHIP phase re-review: the release gate now proves it's shipping the artifact you built (not just that *an* attestation exists), the ship report stops colliding with QA, and every deploy-tail step records where it belongs.**

Re-reviewing SHIP after Phase 6/7 turned up one real security gap and the same artifact-slot hygiene
issues the other phases had. The provenance gate now fails closed unless `/deploy` pins the exact
digest of what it's deploying — the check that actually stops "someone swapped the binary". And the
whole deploy tail (deploy, its mobile tracks, canary, docs) now sorts correctly after ship instead
of writing over it.

### Fixed
- **The provenance gate could pass without proving the artifact.** `verifyProvenance` verified the
  digest/identity/source only when the policy happened to set them — and the digest is a runtime
  value, not a binding. It now **requires a pinned digest by default** (`requireDigestMatch`) and
  fails closed (`digest-unpinned`) when `/deploy` doesn't supply it: a provenance check that isn't
  tied to *this* artifact's digest only proves an attestation exists, not that it covers what ships.
- **`/ship` wrote `05-ship.md`, colliding with `05-qa.md`.** Ship is the sixth step — it now records
  `06-ship.md` (`--seq 6`) and reads the review + QA artifacts it gates on.
- **`/deploy`, `/canary`, and `/document` gave run-artifact commands the CLI rejects** (no `--seq`,
  plus `<pr-ref>` / `<merged-diff>` placeholders). They now record as branch artifacts under ship
  (`06a-deploy`, with mobile tracks `06b`/`06c`; `06d-canary`; `06e-document`).
- **A declared mobile store that produced no build could pass silently.** `verifyMobileReleases` now
  takes the declared store set and fails closed on a declared-but-missing store, instead of an empty
  batch passing.
- **`/canary` was mis-filed as `Ops` and owned by no agent.** It's now `Ship`, and the Release
  Engineer runs it after a deploy.

### Added
- **Eval coverage for the SHIP skills** — Tier-2 rubrics for `/ship` and `/canary`, Tier-3 gate
  scenarios for `/canary` and `/document`. Each proves it fails when the discipline is dropped.

## [0.44.0.0] — 2026-07-24

**The Phase-7 security gates now fail *closed*: a scan that didn't run, a finding the scanner couldn't grade, and a gate declared but never wired into CI all block the release instead of silently passing.**

The DevSecOps gates were well-built but leaned fail-open in a few places — the worst property a
security gate can have. A code review of the REVIEW-phase security machinery closed them. A gate a
misconfigured CI could bypass by simply not producing a report now blocks; an ungradeable finding
now blocks pending triage; and declaring a gate now forces its scan step into the pipeline.

### Fixed
- **A skipped scan no longer passes as "clean".** SAST, DAST, and container-image gates returned a
  clean verdict when their report was *absent* — indistinguishable from "the scan ran and found
  nothing". They now require proof the scan ran (`lib/scan-liveness.ts`); a missing report on a
  declared gate is a hard gate. (SCA already had this via its mandatory non-empty SBOM.)
- **An ungradeable finding no longer slips through.** A finding the scanner emitted but couldn't
  grade (`unknown` severity — e.g. pip-audit, which reports none) now gates by default, pending
  triage, rather than sitting silently below every threshold. It still respects fix-availability, so
  a severity-less scanner fails closed on a *fixable* CVE instead of passing everything. Opt out with
  `gateUnknownSeverity: false`. This also settles the pip-audit gap — its findings now block.
- **A malformed DAST risk fails closed.** An unrecognised OWASP ZAP risk value now normalises to
  `high` (it gates) instead of `informational` (it didn't) — matching the confidence side.
- **Declaring a gate now requires its CI step.** `requiredStepsForBindings` derives the pipeline's
  required steps from the security gates a product declares, so a declared SAST/SCA/container/DAST/
  provenance gate whose scan is never wired into CI is a finding — the backstop that keeps a
  declared gate from being silently skipped. The reference product now requires all five.
- **A typo'd security-binding key can't silently disable a gate.** The `tech_bindings` security
  sub-schemas (`supply_chain`, `sast`, `dast`, `container_scan`, `provenance`, `ci`,
  `mobile_release`) reject unknown policy keys, so a mistyped `block_severty` fails validation; and a
  mistyped binding *name* (e.g. `supply_chian`) is surfaced as a near-miss warning by `sync-context`.
- **`/pipeline` recorded its artifact with a broken command and had no owner or eval.** It now
  records `02c-pipeline.md` (`--seq 2c`), is owned by the Release Engineer (no longer orphaned), and
  has Tier-2 + Tier-3 evals that fail when its hardening discipline is stripped.

### For contributors
- New `lib/scan-liveness.ts` (fail-closed on an absent scan) and `lib/schema.ts` gains
  `nearMissBindingKeys` + a bounded `editDistance`. `sast`/`sca`/`container` policies gain
  `gateUnknownSeverity`; `pipeline-lint` gains `requiredStepsForBindings`. Every change carries a
  Tier-1 negative case; the security sub-schemas are tightened to `additionalProperties: false`.

## [0.43.0.0] — 2026-07-24

**`/security` now closes the runtime half of DevSecOps: a container-image scan (Trivy/Grype) plus base-image hardening, and a DAST scan (OWASP ZAP) against a running preview — both gating. Phase 7 is complete.**

The earlier tracks secured your source and your build. This one covers what ships and what runs.
For a product that ships a Docker image, `/security` reads CI's Trivy or Grype scan and **blocks** on
a fix-available OS/base-layer CVE at or above your threshold, and lints the image for hardening — an
image that runs as root or pins its base by a moveable tag is a finding. For a product with a
deployed preview, it reads an OWASP ZAP baseline report and **blocks** on a confirmed high-risk
alert, while a false-positive never gates. Both are optional — skip them for a product with no image
and no live surface — and both run the scan in CI while the Factory owns the policy. With this, all
three Phase 7 exit criteria are met.

### Added
- **Container-image gate in `/security`.** A fix-available image CVE at or above
  `container_scan.block_severity` blocks; the image-hardening lint flags a root user or an unpinned
  base image.
- **DAST gate in `/security`.** A confirmed OWASP ZAP alert at or above `dast.block_risk` blocks; a
  false-positive or sub-threshold-confidence alert never does.
- **`tech_bindings.container_scan` and `tech_bindings.dast`** — declare the image scanner + hardening
  rules and the DAST scanner + risk policy once; both are optional and only apply when the product
  has an image or a preview.

### For contributors
- New pure helpers `lib/container-scan.ts` (Trivy/Grype normalisers + severity gate + base-image
  hardening lint) and `lib/dast-report.ts` (OWASP ZAP normaliser + risk/confidence gate). No
  scanner, no process, no network. Covered by `test/container-scan.test.ts` and
  `test/dast-report.test.ts` (Tier-1, a negative case per rule, malformed input that doesn't throw).
  This is Phase 7 Track 5 — the phase's final, optional track — completing the supply-chain & CI/CD
  security phase.

## [0.42.0.0] — 2026-07-24

**A new `/pipeline` skill generates the CI/CD workflow the security gates assumed — hardened by default: least-privilege permissions, keyless OIDC auth, pinned actions, and every gate wired as a step.**

The supply-chain, static-analysis, and signing gates from the last three releases only fire if CI
actually *runs* the scan and *requests* the OIDC token. This release ships the pipeline that does.
Ask `/pipeline` to set up CI/CD and it emits a GitHub Actions workflow with a least-privilege
`GITHUB_TOKEN` (`contents: read`), keyless cloud/registry auth via `id-token: write` (no long-lived
`AWS_SECRET_ACCESS_KEY` or `DOCKER_PASSWORD` anywhere), every third-party action pinned to a commit
SHA, and the SCA/SBOM, SAST, and sign/attest steps wired in as required checks. It won't call the
workflow done until the hardening lint is clean — the same lint `/security` now runs to audit a
pipeline you already have. The Factory generates and verifies the pipeline; it never takes custody
of a push secret.

### Added
- **`/pipeline` skill.** Generates and hardens a GitHub Actions workflow to a fixed baseline, then
  gates on its own lint. `/security` audits an existing workflow against the same baseline;
  `/deploy` runs the release the pipeline produces.
- **CI/CD pipeline audit in `/security`.** An over-broad token, a long-lived cloud secret, an
  unpinned action, or a security gate that isn't wired as a step is now a reported finding.
- **`tech_bindings.ci`** — declare the CI provider, the OIDC identity, and the required security
  steps once; `/pipeline` generates to it and `/security` audits against it.

### For contributors
- New pure helper `lib/pipeline-lint.ts` — lints an already-parsed workflow object for
  least-privilege permissions, OIDC/keyless auth, SHA-pinned actions, no long-lived secret, and
  required steps, accumulating every failed rule. No YAML parser, no process, no network. Covered by
  `test/pipeline-lint.test.ts` (Tier-1, a negative case per rule, malformed input that doesn't
  throw). This is Phase 7 Track 4 and clears the phase's third exit criterion; Track 5 (DAST +
  container scan) remains optional.

## [0.41.0.0] — 2026-07-24

**`/security` now reads your static-analyzer output and turns a High/Critical code finding into a release gate — and `/review` surfaces the same findings early as advisory.**

A scanner that finds a SQL injection in your own code is worthless if nothing acts on the result.
This release wires static analysis (SAST) into the gates. Run semgrep or CodeQL in CI, point the
Factory at the output (semgrep JSON or SARIF), and `/security` normalises the findings and
**blocks** on anything at or above your severity threshold (default High). Unlike a dependency CVE
there is no "no fix available" escape — the vulnerable code is yours, so a High/Critical static
finding holds the release until the code is fixed. `/review` shows the same findings earlier in the
flow as advisory, so you see them before they gate. The analyzer runs in CI; the Factory owns the
policy, not the scan.

### Added
- **SAST gate in `/security`.** CI's static-analysis output (semgrep or CodeQL/SARIF) is normalised
  to a common finding list — rule id, file, line, severity, CWE — and a finding at or above
  `block_severity` gates the release. CodeQL's numeric `security-severity` is honoured over the
  coarse SARIF level.
- **Advisory SAST in `/review`.** The same findings surface during code review as advisory, so
  they're visible before the `/security` gate.
- **`tech_bindings.sast`** — declare your analyzer (semgrep/codeql), its output format, and the
  severity threshold once; `/security` and `/review` both read it.

### For contributors
- New pure helper `lib/sast-report.ts` — normalises semgrep JSON and SARIF (CodeQL) to
  `SastFinding[]` and applies the severity gate (`evaluateSastReport`); no fix-available axis. No
  network, no analyzer binary. Covered by `test/sast-report.test.ts` (Tier-1, both formats, a
  negative case per rule, malformed input that doesn't throw). This is Phase 7 Track 2; Tracks 4
  (CI/CD pipeline generation) and 5 (DAST) remain.

## [0.40.0.0] — 2026-07-24

**`/deploy` now refuses to ship an artifact it can't prove the origin of — the release must carry a signed, keyless build attestation that matches the code you think you're shipping.**

Signing an artifact is only half the story; the other half is checking the signature says what you
expect. This release adds that check. When your CI signs a release keyless (Sigstore cosign) and
emits SLSA build provenance, the Factory verifies it before deploy: the signature is valid and
keyless, the attested digest matches the artifact actually being deployed, and the OIDC identity,
issuer, builder, and source repo all match what you declared — with a public transparency-log
entry. A missing, unverified, key-based, or mismatched attestation **blocks the release**. This
closes the "someone slipped a different binary in" and "it was built somewhere we don't control"
gaps. The Factory still holds no signing key — signing is keyless in CI; it only verifies.

### Added
- **Provenance gate in `/deploy`.** A new hard gate between CI-green and deploy verifies the
  release artifact's build attestation. It confirms the signature is valid and keyless, the subject
  digest matches the artifact being deployed, and the signing identity / issuer / builder / source
  match your expected values, plus a Rekor transparency-log entry. Anything short of that blocks.
- **`tech_bindings.provenance`** — declare your signer (cosign/Sigstore), attestation format
  (SLSA), and the expected identity, issuer, builder, and source once; `/deploy` verifies against
  it. Two custody invariants (keyless signing, transparency-log inclusion) default on.

### For contributors
- New pure helper `lib/provenance-verify.ts` — takes the facts a `cosign verify-attestation` /
  `slsa-verifier` run reports and applies the policy (`verifyProvenance`), accumulating every
  failed rule so the full reason a release was blocked is visible. No network, no keys. Covered by
  `test/provenance-verify.test.ts` (Tier-1, a negative case per rule — the wrong digest, identity,
  issuer, builder, source, the key-based signature, the missing log entry). This is Phase 7
  Track 3; Tracks 2 (SAST), 4 (CI/CD pipeline generation), and 5 (DAST) remain.

## [0.39.0.0] — 2026-07-24

**A known-vulnerable dependency can no longer sneak into a release — `/security`, `/ship`, and `/deploy` now gate on your dependency scan and demand a bill of materials.**

Your own code can be perfect and you can still ship a library with a public CVE in it. This release
closes that gap. Point your CI's dependency scan (osv-scanner, npm audit, pip-audit, or Trivy) and
an SBOM at the Factory, and it reads the results, applies a severity policy, and **blocks the
release** on a fixable High or Critical — while letting an unfixable one through as a warning, so
you're never stuck holding a release for a vulnerability nobody can patch yet. The scanners run in
your CI; the Factory never takes custody of a registry token or fetches an advisory feed itself.

### Added
- **Supply-chain gate across `/security`, `/ship`, and `/deploy`.** A dependency finding that is at
  or above your configured severity (default High) **and has a fix available** now blocks the
  release until you fix it or explicitly override. An unfixable finding warns instead of blocking.
  The build must also produce a non-empty SBOM (CycloneDX or SPDX).
- **One policy, four scanners.** The gate reads osv-scanner (multi-ecosystem — npm, PyPI, Pub, ...),
  npm audit, pip-audit, or Trivy output and normalises them to one finding list, so the same policy
  works whatever your stack runs.
- **`tech_bindings.supply_chain`** — declare your scanner, severity threshold, fix-available policy,
  and SBOM format once; `/security`, `/ship`, and `/deploy` all read it.

### For contributors
- New pure helper `lib/sca-report.ts` — normalises each scanner's JSON to a common
  `ScaVulnerability[]`, applies the severity + fix-available policy (`evaluateScaReport`), and
  checks the SBOM (`verifySbom`). No network, no scanner binary in the unit path. Covered by
  `test/sca-report.test.ts` (Tier-1, a negative case per rule). This is Phase 7 Track 1; Tracks 2–5
  (SAST, signing/provenance, CI/CD pipeline generation, DAST) remain.

## [0.38.0.0] — 2026-07-24

**On-device mobile QA now actually runs — `/qa` launches your Flutter app on an emulator, runs its tests, and reports pass/fail, all behind one command.**

Phase 6 shipped the mobile QA *routing* last release, but the runner behind it was a seam waiting to
be filled. Now it's real. When `/qa` hits a native-mobile component it calls `fac mobile-device`,
which launches an Android emulator or iOS simulator, runs `flutter test integration_test` (plus any
Maestro or Patrol flows you point it at), and reports a structured pass/fail with the exact tests
that failed. A run that couldn't even boot the device is reported as an infrastructure error, not a
false green — a broken emulator never sneaks a passing QA past you.

### Added
- **`fac mobile-device` — the on-device Flutter test runner.** Three subcommands: `plan` previews
  the exact commands it would run (no device touched), `check` validates your request, and `run`
  launches the emulator/simulator, runs `flutter test integration_test` (+ optional
  `--flow maestro:<file>` / `--flow patrol:<file>` E2E flows), and prints a pass/fail verdict with
  per-test failures. Exit `0` = all green, `2` = a real test/flow failure, `1` = an infra error
  (e.g. the device never booted).
- **`/qa` now drives it.** A native-mobile `/qa` run invokes `fac mobile-device run` behind the
  device seam, so the same reproduce-first, red-first regression discipline that guards your web
  flows now runs on a real device — recorded in the same QA report.

### For contributors
- New L3 tool `tools/mobile-device/mobile-device.ts` — a pure core (validate → plan commands →
  parse `flutter test --machine` → interpret pass/fail vs infra error) behind the injectable
  `__FACTORY_DEVICE_RUNNER__` seam, so the orchestration is unit-tested offline against a stubbed
  runner (the `browse`/`design` mould). Covered by `test/mobile-device.test.ts` (Tier-1, a negative
  case per rule). This completes Phase 6's device-runner track; only the credential-gated live
  store-upload execution (product-CI) now remains.

## [0.37.0.0] — 2026-07-24

**The Factory can now ship a native mobile app to the Apple App Store and Google Play — QA'd on a real device, submitted through a hard gate, and never once holding your signing keys.**

Web was the only finish line before this. Phase 6 adds the mobile one: `/qa` drives your
Flutter app on an emulator, and `/deploy` grows two separate store tracks that build a signed
artifact, verify it, and stop for your explicit go-ahead before the irreversible public submission.
The signing keys stay in CI the whole time — the Factory checks the release, it never takes custody
of a secret.

### Added
- **On-device QA for native mobile.** `/qa` now routes a Flutter/Dart component to an
  emulator/simulator run (`flutter test integration_test`, with optional Maestro/Patrol flows)
  through an injectable device seam, so the same reproduce-first, red-first regression discipline
  that guards your web flows now guards your mobile ones — recorded in the same QA report.
- **Two mobile store deploy tracks.** `/deploy` can publish to the **Apple App Store / TestFlight**
  (a signed `.ipa`) and to **Google Play** (a signed `.aab`). Each is its own hard gate: it shows
  you the version, build number, and track, and waits for your consent before submitting.
- **A release check that fails closed.** Before any submission, the Factory verifies the build is
  present and signed, the artifact format matches the store (Play needs an App Bundle, not an APK),
  the build number is higher than the last release, the track is valid, and no signing secret leaked
  into the release manifest. A missing or unsigned build blocks the submission.
- **`tech_bindings.mobile_release`** — declare your bundle/application id, target track, and release
  tool per store once; both the QA and deploy tracks read it.

### For contributors
- New `lib/mobile-release-verify.ts` — a pure, offline verifier (no network, no store API, no keys)
  backing both store gates, with a Tier-1 negative-case test per rule in
  `test/mobile-release-verify.test.ts`. Store build/deploy are top-level `deploy_apple` /
  `deploy_google` commands; the reference product declares both stores under `mobile_release`.

## [0.36.0.0] — 2026-07-24

**The TEST phase records its artifacts correctly — `/qa` stops colliding with review, the report and benchmark commands actually run, and the browser-driven QA skill is finally tested.**

TEST was REVIEW's mirror image: `/qa` wrote into the slot just above it (`04`, which is now the
review artifact), and the two on-demand skills gave commands the CLI rejected. All three now record
where they belong, `/qa` — the critical-path skill that gates ship on functional bugs — has an eval,
and `/benchmark`'s home is settled.

### Added
- **Eval coverage for the TEST holes** — a Tier-2 rubric for `/qa` (browser-driven, localhost-only
  and never disabling the content-security stack, reproduce-first, red-first regression tests) and
  for `/benchmark` (baseline-in-memory, threshold-not-noise, deliberate rebaseline), plus Tier-3
  gate scenarios for `/qa` and `/qa-report`. Each fails when its discipline is stripped.
- **The QA Engineer now owns `/benchmark`** — it runs the pre-ship performance gate, so the skill
  is no longer orphaned with no agent to invoke it.

### Fixed
- **`/qa` wrote `04-qa.md`, colliding with the review artifact.** It now records `05-qa.md`
  (`--seq 5`), its correct slot after review, and is filed under the `Test` layer instead of `Build`.
- **`/qa-report` and `/benchmark` gave run-artifact commands the CLI rejected** (missing `--seq`;
  `/qa-report` also passed a literal `<app-url-or-build-ref>` placeholder). They now record as branch
  artifacts — `05a-qa-report.md`, `05b-benchmark.md` — with real inputs.
- **`/qa` recorded the wrong staleness input.** It now records the `03-build-*.md` artifacts it QA'd
  (the phase handoff), so a re-build re-opens QA, instead of pointing at `PRD.md`.
- **`/benchmark`'s layer question is settled** — filed under `Test` (its lifecycle placement), not
  the ambiguous `Ops`.

## [0.35.0.0] — 2026-07-24

**The REVIEW phase records its artifacts correctly — `/review` stops colliding with the build, the audit/debug/second-opinion commands actually run, and the egress-screening skill is finally tested.**

REVIEW had the same broken run-artifact commands that PLAN and BUILD did, plus one worse: `/review`
wrote into the build's slot. All four review skills now record where they belong, and the phase's
most safety-critical skill — the one that sends data to an external model — now has an eval that
checks it screens first.

### Added
- **Eval coverage for the REVIEW holes** — a Tier-2 rubric for `/review` (fixed priority order,
  security hard-gate, safe-auto-fix-only) and for `/second-opinion` (mandatory egress redaction,
  three modes, advisory-only), plus Tier-3 gate scenarios for `/security` and `/second-opinion`.
  Every one is proven to fail when its discipline is stripped.

### Fixed
- **`/review` wrote `03-review.md`, colliding with the build artifacts.** It now records
  `04-review.md` (`--seq 4`), its correct slot after the builds, and is filed under the `Review`
  layer instead of `Build`.
- **`/security`, `/investigate`, and `/second-opinion` gave run-artifact commands the CLI rejected**
  (missing `--seq`; `/security` and `/investigate` also passed literal `<scope>`/`<repro-or-log>`
  placeholders). They now record as branch artifacts — `04a-security.md`, `05a-investigate.md`,
  `02a-second-opinion.md` — with real inputs.
- **`/review` recorded the wrong staleness input.** It now records the `03-build-*.md` artifacts it
  reviewed (the phase handoff), so a re-build re-opens the review — instead of a placeholder pointing
  at the working tree.
- **`/second-opinion` was filed under the wrong layer** (`Ops`) — corrected to `Review`.
- **`/review` could skip QA on handoff.** The default path is now `/review → /qa → /ship`; a change
  with no runnable surface still clears straight to `/ship`.

## [0.34.0.0] — 2026-07-24

**BUILD is now a real phase: the code-producing step records its work, reads the design it's handed, is evaluated like every other phase, and a product finally gets the skill versions it pins.**

BUILD was the one phase with no workflow skill — which is exactly why it couldn't finish a run
(nothing wrote the build artifact the review/QA loop reads) and why nothing measured it. It now has
a `/build` skill that wires it into the run, one build artifact per component, and quality evals —
full parity with THINK, PLAN, and the rest.

### Added
- **`/build` workflow skill** — the build loop: implements the V1 test-first one component at a
  time, routes each component to its language craft skill (TS/React, Python, Java, Dart/Flutter,
  database, ADK), runs the component's own test command, and records a per-component
  `03-build-<name>.md` artifact. It reads the architecture, the UI spec, and any slice spec, and
  records each as an input so an upstream change re-opens exactly that build.
- **Eval coverage for BUILD** — a Tier-2 discipline rubric (`test/fixtures/build.json`) and a
  Tier-3 gate scenario (`test/fixtures/e2e/build.json`), both proven to fail when the discipline is
  dropped. The highest-risk phase is no longer unmeasured.
- **Pin-drift check** — `fac vendor:check` now flags a product whose `skills[]` version pin differs
  from the vendored version, so a fixture pin can't silently rot again.

### Fixed
- **A run could not leave BUILD.** The Implementer never wrote `03-build-<name>.md`, so
  `fac run resume` reported "build missing" forever and `/review`/`/qa` had nothing to read. `/build`
  now records one per component.
- **The build ignored the design.** The Implementer's contract didn't consume the UI spec, so a
  web/mobile build could throw away the whole design phase. It now records `02a-plan-design.md` (and
  a slice's `02b-spec.md`) as inputs, and the acceptance test drives the design→build handoff.
- **A product didn't get the skill versions it pinned.** The reference products pinned
  `tdd-red-green-refactor` and `typed-service-contracts` at `1.1.0`/`1.2.0` while the vendored
  versions — the ones carrying the pytest/JUnit/Flutter test dialects — were `1.3.0`. Pins updated
  and now checked.
- **Build commands ran unguarded.** `/build` and the Implementer now classify any command beyond
  test/lint/typecheck/build with `fac guard`; a flagged command (a deploy, a migration) is a hard
  gate.

## [0.33.0.0] — 2026-07-23

**The PLAN phase is runnable end-to-end: its review commands work, the architect reads what discovery produced, mobile is a first-class surface, and the two design skills that had no eval now do.**

Before the Factory takes its first job, PLAN got the same hardening THINK did. The optional PLAN
steps — a plan-product review, a plan-design UI spec, a spec slice — used a run-artifact command
that the CLI rejected; they now have a real place in a run. `/plan-arch` reads the discovery
record it is handed instead of ignoring it, and no longer treats the stack it writes as its own
input. Mobile (Flutter/Dart) is routed and designed, not silently dropped. And `/plan-arch` and
`/plan-design` — the two most consequential PLAN skills — finally have quality evals.

### Added
- **Sub-sequence run artifacts.** Optional/branch steps that don't occupy a linear slot record as
  `01a-plan-product.md`, `02a-plan-design.md`, `02b-spec.md` — sorted into place next to the step
  they follow. `fac run artifact --seq` now accepts a step integer (`2`) or a branch sub-sequence
  (`2a`).
- **Mobile is a first-class surface.** `/plan-arch` routes a Flutter/Dart component to
  `flutter-dart-expert` (and documents routing for every language); `/plan-design` designs a mobile
  surface to its platform (Material 3 / Cupertino, platform navigation, offline states, MASVS)
  rather than applying web craft to it.
- **Eval coverage for `/plan-arch` and `/plan-design`** — a Tier-2 discipline rubric each, plus a
  Tier-3 gate scenario for `/plan-arch`. Both prove they fail when the discipline is dropped.

### Fixed
- **`/plan-product` and `/spec` gave a run-artifact command the CLI rejected** (no `--seq`; `/spec`
  also passed a literal `<request-or-PRD.md>` placeholder). Both now record correctly as branch
  artifacts.
- **`/plan-arch` never read the discovery record.** It now consumes `PRD.md` + `01-discover.md` (the
  THINK handoff), so the architecture decision builds on what discovery weighed instead of ignoring
  it.
- **`/plan-arch` recorded its own output as an input.** It no longer lists the `stack.yaml` it
  writes among its inputs — that trap would have made a stack edit re-run the step that wrote it.
- **`/plan-design` collided with the build at `seq 3`.** The UI spec now records at `2a`, between
  the architecture and the build, and the build records it as an input so a design change re-opens
  the build.
- **`/plan-product` activated on a status that doesn't exist** (`in-review`) — corrected to the
  real `draft` / `in-design`.
- **`/plan-arch` told you to run `fac vendor:check` to validate your stack**, which it can't — that
  command checks the Factory's own reference product. The guidance now points at the merged
  `.factory/context.gen.yaml` for product-scoped binding checks.

## [0.32.0.0] — 2026-07-23

**`/discover` can now scope a regulated product, runs are named as soon as their product is, and the Product Strategist no longer carries a browser it never used.**

Rounding out the THINK phase before the Factory takes its first job. Discover can now capture the
legal frame of a regulated product, a run stops showing up as "unknown", and an unused tool grant
is gone.

### Added
- **Domain grounding in `/discover`.** For regulated or knowledge-domain products, discover now
  interrogates the jurisdictions, authority hierarchy, and primary sources that govern the domain,
  and writes them into `PRD.md` — where the vendored knowledge craft skills read them. Ordinary
  consumer products skip it entirely; discover is told not to invent a legal frame that isn't there.
  The PRD template now shows these optional keys.

### Changed
- **The two-file ownership model is complete.** Every knowledge-domain key the schema marks
  human-owned (`jurisdictions`, `authority_hierarchy`, `sources`, `glossary`, `confidence_tiers`)
  is now recognised as belonging in `PRD.md`, and the stack-owned `compliance_rules` and `tenancy`
  as belonging in `.factory/stack.yaml`. `fac sync-context` flags either one written to the wrong
  file, instead of silently ignoring it.
- **The Product Strategist agent no longer requests browser access** — neither `/discover` nor
  `/plan-product` used it, so the grant is dropped.

### Fixed
- **A run is no longer stuck showing `product: unknown`.** Because a run is opened before
  `/discover` writes the product name, it started life unnamed; it now backfills the real name the
  moment discover records its first artifact, and never lets a placeholder overwrite a real name.

## [0.31.0.0] — 2026-07-23

**The pipeline's front door is wired in and watched. `/discover` now records its own run artifact, a hand-edited PRD no longer risks being overwritten, and the front door finally has an eval.**

`/discover` — the first step of every product — was the one core skill that never wrote itself
into the run harness. It drafted `PRD.md` and stopped, so `fac run resume` would report "resume at
discover (missing)" forever and the run could not advance past THINK. It now writes a
`01-discover.md` interrogation record like every other step, so a run actually progresses.

That artifact carries **no staleness inputs**, on purpose. Discover's input is your idea in the
conversation, not a file, and `PRD.md` is its *output* — so a later hand edit to the PRD re-opens
`/plan-arch` (which reads the PRD), not `/discover`. Re-running discover would have rewritten the
very edit you just made; now it can't.

And the front door — the highest-variance step, turning a vague idea into a structured PRD — now
has the eval coverage every other core skill already had.

### Added
- **`/discover` records `01-discover.md`** — the interrogation record (problem, personas, options
  weighed, why this V1, open questions) that `/plan-arch` reads, written via `fac run artifact`.
- **Eval coverage for `/discover`** — a Tier-2 discipline rubric (`test/fixtures/discover.json`:
  produces an in-design PRD, problem-before-features, prioritised V1/Fast-follow/Later, no
  tech-stack leak, records its run artifact) and a Tier-3 gate scenario
  (`test/fixtures/e2e/discover.json`: a one-line idea is interrogated, not answered with a stack).

### Fixed
- **A run could not leave THINK.** `/discover` never produced the `01-discover.md` the resume model
  keys off, so the first step looked perpetually unstarted. It now writes it.
- **A hand-edited PRD could be clobbered.** Discover's run artifact recorded no inputs, so editing
  `PRD.md` re-opens `/plan-arch` rather than re-running discover over your edit. The pipeline
  acceptance test now asserts this cascade.

## [0.30.0.0] — 2026-07-23

**Build knowledge products in the pipeline — ontology design and grounded, cited retrieval are now vendored.**

The Factory can now build products with a knowledge layer, not just CRUD apps. Two knowledge
craft skills are vendored and pinned: `ontology-builder-assistant` designs the domain model
(RDF/OWL/SHACL, stable IRIs, provenance, temporal validity), and `ontology-guided-retrieval`
assembles grounded context via hybrid graph + vector retrieval ranked by authority, recency, and
jurisdiction. When a product has an ontology, a regulatory/citation corpus, or a graph+vector
retrieval layer, the Implementer routes to them — with `database-expert` owning the graph/vector
engine underneath and these owning the semantic model and retrieval strategy on top.

### Added
- **`ontology-builder-assistant` and `ontology-guided-retrieval`**, vendored and pinned. The
  Implementer loads them for a knowledge/ontology/RAG layer; both bind `${ctx.authority_hierarchy}`,
  `${ctx.jurisdictions}`, and `${ctx.sources}` from the product context.

### Changed
- The golden reference product now carries a small **knowledge-domain context** (UK social-housing
  repairs jurisdictions, an authority hierarchy, and a source registry), so the new skills'
  `${ctx.*}` bindings resolve against a real merged context — the fixture now exercises the
  knowledge path as well as the software-build path.

## [0.29.0.0] — 2026-07-23

**Design and tune real databases in the pipeline — SQL, NoSQL, vector, and graph — with a dedicated skill.**

Until now the Factory only reached databases through the TypeScript/Prisma lens inside
`fullstack-developer`. The new `database-expert` craft skill makes data stores a first-class
concern: it covers relational/SQL (PostgreSQL, MySQL), document/NoSQL (MongoDB, DynamoDB,
Cassandra), vector (pgvector, Pinecone, Weaviate, Milvus, Qdrant), and graph (Neo4j/Cypher) —
schema and access-pattern design, indexing, query tuning against real `EXPLAIN`/`PROFILE` plans,
migrations, transactions, and partitioning/sharding. When a component declares a `db` or a slice
touches a schema, migration, or query, the Implementer now loads it automatically, and it binds
`${ctx.tenancy}` so every query in a multi-tenant store is isolated by design.

### Added
- **`database-expert` craft skill**, vendored and pinned. A store-family decision table (bias to
  PostgreSQL), per-family workflows for SQL / NoSQL / vector / graph, a migrations-and-operations
  section (forward-only reversible migrations, expand→migrate→contract, concurrent index builds,
  multi-tenant isolation), and seven high-signal gotchas (N+1, unbounded result sets, unusable
  indexes, hot partitions, vector metric/model mismatch, serverless connection exhaustion,
  migration lock stalls).
- The Implementer routes data-store work to `database-expert`; the golden reference product lists
  it for its Postgres-backed `api` component.

### Changed
- The reference product now declares a `tenancy` model (multi-tenant, row-level security) so the
  new skill's `${ctx.tenancy}` binding resolves — an example of wiring an isolation policy into a
  product's context.

## [0.28.0.0] — 2026-07-23

**Build agents on Google ADK in the same pipeline, with the whole ADK skill set vendored and pinned.**

Point a component's framework at `adk` and the Factory now routes it through the Google Agent
Development Kit skill set — ten `adk-*` skills covering setup, architecture, agent-building, style,
debugging, and review — the same way it already routes TypeScript to `fullstack-developer` or Dart
to `flutter-dart-expert`. The Implementer follows the bundle's build order (start at the agent
builder, design against the architecture guide, apply the style rules, then debug and review), and
the deep workflow/agent/event reference guides travel with it. All of it is vendored byte-identical
and pinned, so the ADK skills are reproducible and tamper-evident like every other craft skill.

### Added
- **ADK agent development, end to end.** Ten `adk-*` craft skills (`adk-setup`, `adk-architecture`,
  `adk-agent-builder`, `adk-style`, `adk-debug`, `adk-review`, `adk-git`, `adk-sample-creator`,
  `adk-unit-design`, `adk-unit-guide`) plus a shared `adk-agent` bundle (its build-order `AGENTS.md`,
  the contributing scaffold, and the full workflow/agent/event reference guides) are vendored into
  the Factory. A component whose `framework` is `adk` now routes to them automatically.

### Changed
- **Vendoring carries a skill's full `references/` tree, not just its top-level files.** Deep
  reference material in nested folders (like the ADK architecture guides) now travels with the skill
  instead of being silently dropped, and re-vendoring prunes files a skill no longer ships.

### For contributors
- `fac vendor` gained **bundle support**: a shared-asset folder with no `SKILL.md` (the ADK
  `adk-agent` bundle) is vendored whole, with its reference guides pulled in so the copy is
  self-contained.
- `fac vendor:check` now hash-verifies vendored bundles too, so an in-place edit to shared bundle
  assets fails the gate exactly like an edited skill.
- The Implementer and Eng-Architect personas route `framework: adk` components to the `adk-*`
  bundle and wire its build order into the product's `AGENTS.md`.

## [0.27.0.0] — 2026-07-23

**Build a cross-platform mobile app in the same pipeline, and no public site ships without HTTPS.**

The Factory now covers Flutter/Dart the way it already covered TypeScript, Python, and Java: a
mobile component goes from idea to shipped through the exact same `discover → plan-arch → build →
review → qa → ship` chain, with no new workflow to learn. Point a component at `dart`/`flutter` and
the Implementer routes it to a new mobile craft skill, TDD runs in `flutter_test`, and the review
runs `flutter analyze`. Alongside it, application-security is now first-class: the security audit
walks crypto, access management/RBAC, tokens/JWT, API headers and params, sessions, and caching,
and every public endpoint is checked for real HTTPS before it goes live — a plaintext, expired, or
weakly-configured endpoint blocks the release instead of becoming a follow-up ticket.

### Added
- **Flutter/Dart mobile support.** A new `flutter-dart-expert` craft skill (with an OWASP MASVS
  mobile-security rule catalogue) drives cross-platform mobile components. The reference product
  now includes a Flutter contractor app, so the pipeline is proven end-to-end on mobile, not just
  described.
- **Dialects for the shared skills.** Test-first (`tdd-red-green-refactor`) now has a
  `flutter_test` dialect and typed service contracts (`typed-service-contracts`) a Dart
  sealed-class Result dialect, so the same disciplines apply in Dart as in every other language.
- **A transport-security gate on deploy.** `/deploy` now verifies every public endpoint presents a
  trusted, in-date certificate, at least TLS 1.2, and a long-lived HSTS header before declaring a
  release healthy. The Factory provisions no certificate itself — that stays your host's job — it
  proves the endpoint is actually secure.
- **A deeper security audit.** `/security` now walks the OWASP API Security Top 10, an
  application-security checklist (cryptography, access management, tokens, API headers/params,
  sessions, caching), and — for mobile components — OWASP MASVS and the transport posture.

### Changed
- `/review` routes Dart/Flutter components to `flutter analyze` / `dart format` / `flutter test`,
  matching how it already routes TypeScript, Python, and Java.

### For contributors
- New `lib/tls-verify.ts` — a pure, offline transport-policy verifier (valid chain, ≥ TLS 1.2,
  HSTS) with a negative test per rule; the `/deploy` gate calls it against an endpoint probe.
- `tech_bindings` in the context schema gained `auth`, `crypto`, `session`, and `tls` (and a
  documented `cache`), so a product records which providers back each application-security concern.
- The reference product gained a `dart`/`flutter` `mobile` component; the pipeline-acceptance
  suite asserts it drives through the full chain.

## [0.26.0.0] — 2026-07-23

**The two version numbers agree again, and a build gate keeps them that way.**

`VERSION` had reached `0.25.0.0` while `package.json` still read `0.2.0` — they had drifted five
releases apart because nothing checked them against each other. Both now read the same release
(`0.26.0.0` / `0.26.0`), and a new `version:check` runs first in `bun run build`, so a future edit
to one without the other fails the build instead of surfacing releases later.

### Added
- `bun run version:check` — asserts `package.json`'s semver equals the first three segments of the
  4-part `VERSION`. Runs first in `build`; has a negative test covering the exact drift it was
  written for.

### Fixed
- **Version drift.** `package.json` was `0.2.0` against a `VERSION` of `0.25.0.0`. Both are now
  aligned, and the discipline is enforced rather than assumed.

## [0.25.0.0] — 2026-07-23

**The codebase now type-checks. `strict` was on but nothing ran the compiler — turning it on caught a real null-safety bug on the first pass.**

The project shipped with `tsconfig.json` set to `strict: true`, but the TypeScript compiler and Bun
type definitions were never installed, so no static type-checking ever ran — the editor showed a
wall of false "cannot find `process`/`Bun`" errors, and any genuine type mistake sailed straight
through to the test suite. Now `bun run typecheck` (`tsc --noEmit`) runs clean, is part of `bun run
build`, and gates every push and PR in CI before anything else. The `tools/` tree (browse, diagram,
make-pdf, design) is now inside the type-check scope too, so all four Layer-3 tools are covered.

The very first real run found one latent bug: a `--recent` guard in the decision log compared a
possibly-`null` value with `< 0`. Harmless at runtime by luck of control flow, exactly the kind of
thing strict null-checking exists to catch. Fixed.

### Added
- `bun run typecheck` (`tsc --noEmit`) — static type-check over `scripts`, `hosts`, `bin`, `lib`,
  `test`, and `tools`. Wired into `bun run build` and into CI as a fail-fast gate.
- `bun-types` and `typescript` dev dependencies, so the strict config that was already present
  actually runs.

### Changed
- `tsconfig.json` `include` now covers `tools/`, bringing the four Layer-3 tools under type-checking.

### Fixed
- `fac decision list --recent` no longer compares a possibly-null parsed value against zero — a
  latent null-safety bug surfaced by enabling the type-check gate.

## [0.24.0.0] — 2026-07-23


**Installing the Factory into your host is now hardened: it copies instead of symlinking on Windows, and it checks that every skill actually landed.**

`./setup` (and the new `fac install`) links the generated skills into each host CLI it finds —
Claude Code and Codex today. Three things changed. On Windows, where a plain symlink silently
becomes a frozen copy that never refreshes, it now copies explicitly and reminds you to re-run
setup after a pull. It verifies each install: a symlink has to resolve back to the source, a copy
has to exist, or the command exits non-zero instead of claiming success. And it's idempotent — safe
to run as many times as you like, and a `--dry-run` shows exactly what it would do first.

The decision of what links where, and how, now lives in one pure, tested function rather than in
bash you couldn't test. Every branch — Unix vs Windows, host present vs absent — has a negative test.

### Added
- `fac install [--dry-run] [--json]` — links (or copies) the generated skills into every detected
  host and verifies each target, idempotently.
- `lib/install-plan.ts` — the pure install planner (host source→dest map, per-platform link method,
  CLI-presence skip logic), with a per-branch negative test.

### Changed
- `setup` delegates host installation to the tested installer instead of inline `ln -snf`, so the
  Windows copy fallback and post-install verification apply everywhere.

## [0.23.0.0] — 2026-07-23

**Evals now run on a cadence: a fast gate on every PR, and a heavier periodic tier on a weekly schedule.**

The gate tier — drift, static validation, vendored-skill integrity, and the free test suite — keeps
blocking every push and PR, now with a preview of exactly which gate scenarios are in scope. A new
weekly workflow runs the periodic tier (the heavier, non-deterministic scenarios) on a Monday
schedule and on manual dispatch, previewing the periodic selection and running the full free suite.
When you wire a model runner and flip one flag, the periodic live scenarios spawn for real; until
then it runs honestly dry rather than pretending.

The rule that decides all of this — which tier runs, and whether the paid scenarios spawn — now
lives in one pure function (`lib/eval-plan.ts`) that both the test harness and the CI workflows
read, so they can't drift apart. `FACTORY_EVAL_TIER=periodic` selects the tier; `FACTORY_EVAL_E2E=1`
or an injected runner goes live; scheduled and manual triggers map to periodic. Every branch of
that policy has a negative test.

### Added
- **Weekly periodic-evals workflow** (`.github/workflows/periodic-evals.yml`) — Monday schedule +
  `workflow_dispatch`, previews the periodic selection and runs the free suite.
- `lib/eval-plan.ts` — `resolveEvalPlan` (tier + live + reason) and `tierForEvent` (CI cadence), the
  single source of truth for eval scheduling, with a per-branch negative test.

### Changed
- The E2E harness now resolves its tier and live-ness through `resolveEvalPlan`, so it agrees with
  CI by construction.
- CI is explicitly the gate tier and now previews the gate selection before running tests.

## [0.22.0.0] — 2026-07-23

**Benchmark a skill across several models at once and see, side by side, which one is strongest — and whether they even agree.**

`fac benchmark:models --skill <skill> --models a,b,c --prompt "..."` runs the same prompt against
each model, scores every output with the skill's rubric, and prints a ranked table: winner marked,
per-model pass/fail, plus the spread, mean, and an agreement verdict (unanimous-pass,
unanimous-fail, or split). A wide spread tells you the choice of model actually matters for that
skill; a split tells you the skill is on the edge of its rubric. `--json` emits the full
comparison for a dashboard or a regression check.

Scoring reuses the same deterministic rubric judge the eval harness already uses, so the numbers
line up with the rest of the Factory. Running the models is the one part that needs a real client,
so it stays a pure injectable seam (`__FACTORY_MODEL_RUNNER__`): wire your host and it runs, wire
nothing and it fails loudly rather than faking a result. The comparison, ranking, and
agreement logic underneath are pure and tested offline.

### Added
- **`fac benchmark:models`** — cross-model comparison for a skill: ranked scores, spread, mean, and
  agreement, as a table or `--json`.
- `lib/benchmark-models.ts` — the pure core (`compareModels`, `formatComparison`,
  `assertModelScores`) plus the `__FACTORY_MODEL_RUNNER__` seam, with a negative test per rule.

### Changed
- `bin/fac.ts` gains the `benchmark:models` command; help and header updated.

## [0.21.0.0] — 2026-07-23

**The browser's attack log can no longer fill your disk: it rotates at 10 MB across 5 generations.**

`browse` keeps a content-free record of every flagged navigation attempt — a salted hash of the
origin plus the score and decision, never the raw URL. Until now that log grew without bound, so a
noisy or hostile page hit in a loop could quietly eat disk. It now rotates: when `attempts.jsonl`
reaches 10 MB it becomes `attempts.jsonl.1`, the older generations shift up, and the fifth is
dropped. You keep recent history, bounded.

Rotation is a pure, deterministic function (`rotateAttemptLog`) driven off file size, and
`logAttempt` runs it before every append. The whole thing is tested offline with a tiny byte
threshold — no-file, under-threshold-untouched, rotate-to-`.1`, generation-cascade-with-oldest-
dropped, and the standing security property that a raw origin never lands on disk.

### Added
- Attack-log rotation for `browse`: `rotateAttemptLog(dir, maxBytes, generations)` plus the
  `ATTEMPT_LOG_MAX_BYTES` (10 MB) and `ATTEMPT_LOG_GENERATIONS` (5) defaults.
- First test coverage for the browse security module (`test/browse-security.test.ts`), pinning
  both rotation and the salted-hash record hygiene.

### Changed
- `logAttempt` now rotates the log before appending and accepts an optional
  `{ maxBytes, generations }` override; behaviour is unchanged at the defaults.

## [0.20.0.0] — 2026-07-22

**The last tool lands: generate UI mockups from a prompt — and the Layer-3 tooling layer (browser, diagram, make-pdf, design) is now complete.**

`/plan-design` and `/design-review` get a `design` tool. Give it a prompt and it produces UI
mockup images, writing them to a directory with a clean manifest. `design check` validates a
request without spending anything — prompt required, size from a known set, count 1–10, format one
of png/jpeg/webp — so a malformed request fails before it reaches an API.

Image synthesis is the one job with no honest offline fallback, so unlike the diagram and PDF tools
there is no Playwright path: the generator is a pure injectable seam
(`__FACTORY_IMAGE_GENERATOR__`), and `design generate` fails loudly when nothing is wired rather
than pretending. Everything around it is pure and tested offline — request validation with a
negative case per field, base64 decoding, and path-traversal-safe basename slugging so a
`--basename ../../etc/passwd` can never escape the output directory. A single image writes
`<name>.<ext>`; several are numbered.

With this, all four Layer-3 binaries are built: `browse` (headless browser), `diagram` (Mermaid),
`make-pdf` (Markdown to PDF), and `design` (image generation).

### Added
- **`fac design check`** — validate an image request (prompt, size, count, format). Exit `2` on
  problems, with a per-field report.
- **`fac design generate --prompt "..." --out-dir DIR`** — generate images via a wired generator
  and write them with a JSON manifest (`--basename`, `--size`, `--n`, `--format`).
- **`bun run design`** — run the tool directly.

### Changed
- New `tools/design/design.ts` carries the pure request/validation/decode/write core and the
  image-generator seam. The implementation plan marks the tooling layer complete.

## [0.19.0.0] — 2026-07-22

**Specs, reports, and release notes go from Markdown to a clean, print-ready document — and to PDF when a print engine is available.**

`/document` and the docs skills now have a `make-pdf` tool. Give it Markdown and it produces a
self-contained HTML document with a proper print stylesheet — A4 page margins, readable serif body,
monospaced code, styled blockquotes and rules — that opens in any browser and prints cleanly. Ask
for `pdf` and, when a print engine is available, it hands back a finished PDF.

The Markdown-to-HTML step and the document wrapper are pure and deterministic, so they run and are
proven on every `bun test`: every construct docs actually use — headings, bold and italic, inline
code and fenced blocks, links, ordered and unordered lists, blockquotes, rules — has a test for how
it renders and a test that raw HTML in prose is escaped, never injected. Turning HTML into PDF bytes
needs a print engine, and the Factory bundles none — so `make-pdf pdf` uses a renderer you inject
(`__FACTORY_PDF_RENDERER__`) or falls back to Playwright when it's installed. An operator who wants
a fuller CommonMark engine wires `__FACTORY_MARKDOWN_RENDERER__`. Same seam discipline as the
diagram tool and the eval harness: heavy machinery stays optional, the core stays testable offline.

### Added
- **`fac make-pdf html --out file.html`** — render Markdown to a self-contained, print-ready HTML
  document (custom `--title`, source from `--file`, `--code`, or stdin).
- **`fac make-pdf pdf --out file.pdf`** — render to PDF via an injected renderer or Playwright.
- **`bun run make-pdf`** — run the tool directly.

### Changed
- New `tools/make-pdf/make-pdf.ts` carries the pure Markdown renderer + document wrapper and the
  print seam. The implementation plan marks the `make-pdf` tool built (only `design` remains).

## [0.18.0.0] — 2026-07-22

**Architecture diagrams that are checked before they ship — a broken Mermaid diagram fails loudly instead of rendering as a blank box in your design doc.**

`/plan-arch` and the docs skills now have a `diagram` tool. You (or the agent) write Mermaid; the
tool validates it, wraps it into a self-contained HTML file that renders in any browser, and — when
a renderer is available — produces an SVG. The point is the check: `fac diagram check` catches the
mistakes that make a diagram silently fail to render — an empty document, a diagram type Mermaid
doesn't recognise, unbalanced brackets, a flowchart with no nodes — and exits non-zero so a bad
diagram never lands in a document unnoticed.

The validate and HTML-wrap steps are pure, so they run and are proven on every `bun test` with a
real negative case for each rule. Rendering to SVG needs a Mermaid engine, and the Factory bundles
none — so `fac diagram svg` uses a renderer you inject (`__FACTORY_MERMAID_RENDERER__`) or falls
back to Playwright when it's installed. Same seam discipline as the eval harness and the browser
security layers: heavy, environment-specific machinery stays optional and the core stays testable
offline.

### Added
- **`fac diagram check`** — validate Mermaid source (type detection, bracket balance, empty and
  nodeless checks). Exit `2` on problems, with a line-referenced report.
- **`fac diagram html --out file.html`** — wrap valid Mermaid into a standalone, browser-ready
  HTML document (custom `--title`, custom Mermaid source URL).
- **`fac diagram svg --out file.svg`** — render to SVG via an injected renderer or Playwright.
- **`bun run diagram`** — run the tool directly.

### Changed
- New `tools/diagram/diagram.ts` carries the pure validate + HTML-assembly core and the render
  seam. The implementation plan marks the `diagram` tool built (design/make-pdf still pending).

## [0.17.0.0] — 2026-07-22

**The Factory can now catch itself before an irreversible mistake — a destructive command or an out-of-scope edit — with a check you can prove, not a promise.**

Three safety skills land: `/careful`, `/freeze`, and `/guard`. `/careful` screens every shell
command that could cause loss you can't undo — a recursive delete outside the throwaway build and
cache dirs, a `DROP` or `TRUNCATE`, a force-push, a `git reset --hard`, a `kubectl delete`, a
`docker system prune` — and surfaces it for an explicit yes before it runs. `/freeze` draws a line
around one directory and refuses to edit outside it, so a focused fix can't quietly rewrite three
unrelated modules. `/guard` turns on both at once for high-stakes work like a production touch.

The difference from a prose warning is that the decision is mechanical. `lib/guard.ts` classifies a
command as destructive (with a safe exception for `rm -rf node_modules` and friends) and decides
whether an edit path sits inside a boundary, and `fac guard cmd`/`fac guard edit` expose both with a
clean exit code — `2` blocks, `0` allows. It is a pure classifier, so the whole taxonomy is unit
tested with a genuine negative case for every rule: the command that must block, the throwaway
delete that must pass, the sibling directory (`/src` vs `/src-old`) that must not count as inside.

This is a guardrail, not a cage: the human always gets the final call, and a subshell or a `sed -i`
can still reach past it. It catches the accident and the careless paste — the 99% case.

### Added
- **`/careful`, `/freeze`, `/guard` safety skills** — destructive-command confirmation, edit-scope
  restriction, and the two combined. The freeze boundary persists in `session` memory so the check
  survives across steps.
- **`fac guard cmd "<command>"`** — classify a shell command; exit `2` when destructive, `0` when
  safe or a whitelisted throwaway delete. `--json` for structured output.
- **`fac guard edit "<path>" --boundary "<dir>"`** — check an edit target against a freeze
  boundary; exit `0` inside, `2` outside.

### Changed
- New `lib/guard.ts` carries the destructive-command taxonomy and boundary-containment check
  (pure, no filesystem — provable in `bun test` with a negative case per rule).
- The implementation plan marks the Phase 4 safety skills built (25 skills total).

## [0.16.0.0] — 2026-07-22

**The Factory now proves its skills work against a real agent — and only spends that paid run on the skills your change could have broken.**

This release adds the top tier of the eval harness: end-to-end scenarios that put a skill in front
of a live agent and check the discipline actually shows up — a review that raises a hard gate on a
planted SQL-injection, an investigation that reproduces before it patches, a deploy that keeps
rollback first-class. Scenarios are data (`test/fixtures/e2e/*.json`): each names the skill, the
tier, the handful of skill headings to hand the agent (so it reads ~60 lines, never a 500-line
file), the prompt, and what the transcript must and must not say.

The paid part is opt-in and never bundled — it drives the host CLI you already have
(`claude -p`) or a runner you inject, gated behind `FACTORY_EVAL_E2E=1`. Everything that keeps the
harness honest runs free on every `bun test`: a scenario that names a section its skill no longer
has fails immediately, the selector is unit-tested both ways, and the scorer has a negative case
for every rule.

Diff-based selection means a live run only touches what changed. A scenario is tied to one skill,
so editing `skills/review/…` selects the review scenario and nothing else; editing something global
(the generator, a shared resolver, the host configs) selects everything. Gate scenarios block a
merge; periodic ones run on a cadence. `fac eval:select` shows you exactly what a run would execute
before you spend a token on it.

### Added
- **Tier-3 E2E harness** — `test/skill-e2e.test.ts` + `test/helpers/e2e-runner.ts` + five scenario
  fixtures under `test/fixtures/e2e/` (gate: review, investigate, deploy; periodic: ship,
  plan-product). Runs free by default; the live agent pass is gated by `FACTORY_EVAL_E2E=1`.
- **`fac eval:select`** — preview which scenarios a run would execute for a given diff and tier
  (`--base`, `--changed`, `--tier`, `--all`, `--json`).
- **`bun run test:e2e`** — run the E2E tier against your host CLI.

### Changed
- New `lib/eval-select.ts` carries the diff-based selection and gate/periodic tiering (pure, so it
  is provable in `bun test`).
- The implementation plan marks Tier-3 built and **Phase 3 complete**.

## [0.15.0.0] — 2026-07-22

**The Factory can now improve itself: it turns lessons from real work into standing rules, and it builds or tunes its own skills behind the same gates it holds every other change to.**

This release closes the self-improvement loop. `/learn` takes a lesson — a decision that keeps
getting re-made, a pattern a retro surfaced — and promotes the *durable* ones into project memory
and the decision log, so the next run starts from what the last one learned instead of relearning
it. `/skill-smith` is the Factory building its own tools: when a capability is missing it authors a
new generator-owned skill (a real `SKILL.md.tmpl` that regenerates and drift-checks like every
other), and when a skill underperforms it tunes it through an execute-diagnose-mutate loop that
keeps a change only if the measured pass rate improves. Nothing lands without a governance review.

Two agents make this a workflow, not just two commands. **Coach** reflects after a ship — retro,
health, then `/learn` — and hands a rule that needs enforcing to **Skill Smith**, which authors or
optimises the skill and passes it through the readiness gate. The self-improvement craft skills
(`self-improving-agent-skills`, `quality-governance`) are now vendored into the Factory (17 total),
so the loop runs on pinned, drift-checked material.

### Added
- **`/learn`** — promote a durable lesson into `product/learnings` and, when it governs a standing
  choice, the decision log. Separates durable rules from task-local notes so project memory stays
  signal, not noise.
- **`/skill-smith`** — author a new generator-owned skill or optimise an existing one via the
  self-improving loop, with a `quality-governance` readiness review before it lands.
- **Coach and Skill Smith agents** — the reflect-and-improve pair (13 agents total): Coach runs the
  post-ship reflection, Skill Smith builds/tunes the skill a lesson calls for.

### Changed
- Two craft skills (`self-improving-agent-skills`, `quality-governance`) are now vendored (17 total).
- The skill generator/validator now covers 22 workflow skills.
- The implementation plan marks the Track 3 self-improvement slice as built.

## [0.14.0.0] — 2026-07-22

**The Factory can now hold its place in the work, check the quality floor, watch a release, measure drift against remembered baselines, and ask another model for a dissenting read without leaking secrets.**

This release turns the ops layer on. The big quality-of-life shift is that the Factory can now
checkpoint and resume work explicitly: save the working state, come back later, and restore the
next action plus the decisions that were already settled. Around that, the rest of the ops surface
becomes first-class instead of aspirational markdown. The repo now owns generator-backed skills for
`/context-save`, `/context-restore`, `/health`, `/retro`, `/benchmark`, `/canary`, and
`/second-opinion`, and the runtime now exposes the substrate those skills actually call: `fac
context`, `fac memory`, `fac decision`, and `fac redact`. That means the Factory can persist small
notes and benchmark baselines, log and replay durable decisions, and screen any outbound prompt or
artifact through the redaction guard before it leaves the machine.

The result is less re-derivation and less drift. A work session can stop cleanly and start cold.
Performance gates can compare against something real instead of vibes. A second-model consult has a
hard egress gate. And the ops skills now regenerate and drift-check like the rest of the Factory,
so this layer is part of the product, not an orphan sidecar.

### Added
- **Runtime ops CLIs** — `fac context`, `fac memory`, `fac decision`, and `fac redact` now exist as
  real operator surfaces over the Track 1 substrate.
- **Checkpoint/resume flow** — save a working-context note, restore it later, and carry forward the
  active decision set that was already settled.
- **Generator-owned Track 2 skills** — the seven ops skills now have `SKILL.md.tmpl` sources and
  participate in `gen:skills` and `skill:check`.

### Changed
- The implementation plan now marks the full Track 2 ops slice as built.
- The skill generator/validator now covers 20 workflow skills instead of 13.

## [0.13.0.0] — 2026-07-22

**The Factory now has a memory: it remembers the decisions you made and why, carries notes across sessions, and screens every outward-bound word for secrets before it leaves.**

This release lays down the substrate the ops and self-improvement skills sit on. Three things
turn on. A **decision log** records the durable calls — the architecture choice, the scope cut,
the vendor pick — with their rationale and your confidence, so neither you nor an agent
re-litigates a settled question three sessions later; reverse a call and the log supersedes the
old one instead of erasing it. A **memory store** keeps small notes scoped to either the product
(committed, long-lived) or the current session (your working context), so a task can be put down
and picked back up. And a **redaction guard** screens text before any external sink — a PR body, an
issue, a push — with a tiered taxonomy: genuine credentials block outright, PII and high-false-
positive shapes are flagged, and both the decision log and the memory store refuse to persist
anything carrying a real secret. Every one of these is covered by tests with a negative case,
because a guard nobody watched refuse is not a guard.

### Added
- **Decision log** (`.factory/decisions.jsonl`) — append-only and event-sourced. Log a durable
  decision with its rationale, scope (repo/branch/run), source, and confidence; supersede a prior
  call, search by scope/query/recency, expunge an accidental secret, or compact down to the active
  set. Superseded and redacted entries drop out of the active view but stay in the history.
- **Memory store** (`.factory/memory/<scope>/`) — namespaced markdown notes in a `product` scope
  (persists with the repo) or a `session` scope (working state for the task in flight). Write,
  read, list, and delete notes; keys are slugified to safe filenames.
- **Redaction guard** (`lib/redact.ts`) — a tiered scanner (HIGH blocks, MEDIUM/LOW inform) that
  every external sink can funnel through: find secrets/PII, replace them inline, or get a
  block/allow verdict. It's the same gate the decision log and memory store call on every write.

### Changed
- The implementation plan marks the Phase 3 Track 1 substrate (memory/decision store + redaction
  guard) as built.

## [0.12.0.0] — 2026-07-22

**Python is now a first-class build language — point a component at Python and the Factory routes it to a real Python craft skill, test-first, with no new authoring.**

The Factory already spoke TypeScript, React, and Java/Quarkus. This release turns on Python, the
cheapest path of all because the craft skill already existed — it just wasn't wired in. Now a
product can declare a Python component in its stack and the whole chain handles it: the builder
writes it test-first with `pytest`, loads `python-expert` for idioms, typing, and error handling,
and the reviewer runs `pytest`/`ruff`/`mypy` and defers idiom-level findings to the same expert.
The golden reference product grew a Python `reminders` worker (the SLA email chaser its PRD always
called for), and the end-to-end pipeline test now drives that Python component through discover →
plan → build → review → qa → ship with zero workflow-skill changes — proof that adding a language
is a parameter, not a fork.

### Added
- **`python-expert` is vendored and live** (15 vendored craft skills total). Any component with
  `language: python` routes to it automatically.
- **A Python `reminders` component** in the reference product, with its own `pytest`/`ruff`/`mypy`
  commands, exercised end-to-end by the pipeline-acceptance suite.
- **Language-routed TDD.** The builder now applies the red-green loop in each component's own test
  runner — `pytest` for Python, `bun test` for TypeScript, JUnit for Java — instead of assuming one
  framework.

### Changed
- **`/review` is Python-aware:** a Python component's checks run `pytest`/`ruff`/`mypy`, with
  idiom-level findings deferred to `python-expert`.
- **The implementation plan marks the Python path activated** — what was a near-free to-do is now
  done, with no craft-skill build phase required.

## [0.11.0.0] — 2026-07-22

**The browser can now safely read pages the operator didn't write — a full six-layer prompt-injection defense screens external content before it reaches the model.**

`browse` shipped with the cheap string layers (datamarking, hidden-element stripping, a heuristic
injection scan, a canary token). That was enough while it only ever read a localhost app you wrote.
This release builds the layers that defend against genuinely untrusted page content: an **ML
injection classifier** over the page (L4), a **transcript classifier** that watches whether the
agent got subverted (L4b), and the **ensemble verdict** that only BLOCKs when two independent
signals agree — so a page that merely quotes an attack doesn't trip the wire, but a real injection
does. A leaked canary always BLOCKs. The whole stack runs in the agent process, never inside the
compiled binary (a hard architectural line, pinned by a test, because ML runtimes can't load from
there). The Factory ships no bundled model, so L4 and L4b are injectable seams that fall back to
the deterministic heuristic when no model is wired — secure and fully testable with zero setup.

### Added
- **`tools/browse/agent-security.ts`** — the agent-process ML security module: `classifyContent`
  (L4), `classifyTranscript` (L4b), and `evaluateExchange` (the full L6 ensemble that gathers all
  signals and returns one verdict). BLOCK requires cross-confirmation at the WARN threshold, a lone
  high-confidence content score, or a canary leak.
- **Injectable classifier hooks** — wire a real model via `globalThis.__FACTORY_CONTENT_CLASSIFIER__`
  and `__FACTORY_TRANSCRIPT_CLASSIFIER__`; absent a hook, each layer degrades to the deterministic
  L3 heuristic, and a wired model can never score below that floor.
- **A cost gate** — the expensive transcript pass is skipped for plainly-benign pages (below the
  LOG_ONLY floor), and every non-ALLOW verdict is written to a salted-hash attack log that never
  stores a raw origin.
- **Thirteen new security tests** including negative cases for every layer and a static tripwire
  that fails the build if the compiled binary ever imports the ML module.

### Changed
- **The origin gate message and module docs** now reflect that external content, when allowed with
  `--allow-external`, is screened by the agent-side ML layers rather than simply refused.
- **The implementation plan marks the browser-security stack complete.** With this, Phase 2's
  workflow, evals, and security work are all built; Tier-3 E2E and the ops skills move to Phase 3.

## [0.10.0.0] — 2026-07-22

**Skills now get graded on quality, not just structure — a rubric-scored eval tier catches a rewrite that quietly guts a skill's discipline before it ships.**

Tier 1 already proved every skill was structurally sound: frontmatter parses, the folder name
matches, it's under 500 lines. But nothing checked that a skill still *means* what it should. You
could rewrite `/investigate` and drop the Iron Law, or `/security` and lose the STRIDE lens, and
the build would stay green. This release adds **Tier 2 — LLM-as-judge**, which scores each skill's
generated body against a rubric. A shared baseline rubric holds every skill to a quality floor
(precise activation, an actionable workflow, worked examples, honest gotchas, declared handoffs),
and per-skill rubrics pin the discipline that makes each skill worth having — the Iron Law, the
OWASP + STRIDE dual lens, the deploy hard gate, report-only QA, benefit-first docs. It runs free
and deterministic in `bun test`, and the same rubrics can run against a live model with
`bun run test:evals`. Test count went from 63 to 100.

### Added
- **Tier-2 LLM-judge eval harness** — `test/helpers/llm-judge.ts` (a pluggable judge engine with a
  free deterministic anchor judge and an injectable model judge), `test/skill-llm-eval.test.ts`,
  and rubric fixtures under `test/fixtures/`. Every rubric has a negative case, so the grader is
  itself proven to fail when it should.
- **A quality floor on every skill** — the `_baseline` rubric scores all thirteen skills on
  activation precision, workflow actionability, examples, gotchas, and integration.
- **Per-skill discipline rubrics** for `/investigate`, `/security`, `/spec`, `/qa-report`,
  `/deploy`, `/plan-product`, and `/document` — each pins the core behaviour that skill exists to
  guarantee.
- **`bun run test:evals`** — opt-in paid path that runs the same rubrics against a live model host.

### Changed
- **The implementation plan marks Tier 2 built.** The eval harness row and the Phase 2 checklist
  now record the LLM-judge tier as shipped; what remains in Phase 2 is the gated browser-security
  work and the Tier-3 E2E tier (Phase 3).

## [0.9.0.0] — 2026-07-22

**The Factory now has a full engineering team and the rigor layer to match — a debugger, a security officer, a doc writer, and the plan/spec/deploy skills that make a change defensible from idea to production.**

The pipeline was a straight line: draft, architect, design, build, review, QA, ship. This release
adds the rigor that a real team brings. **`/investigate`** root-causes a bug before anyone patches
it (Iron Law: no fix without an investigation). **`/security`** audits a change against the OWASP
Top 10 and STRIDE with a low false-positive gate, so findings are real exploits, not noise.
**`/spec`** turns a vague "build X" into testable acceptance criteria before code. **`/qa-report`**
drives the running app and files a defect list without touching code. **`/deploy`** takes a landed
change from merge to verified-in-production, with a hard gate on every irreversible step. Two new
wrappers round it out: **`/plan-product`** pressure-tests a PRD (Expand / Hold / Reduce) and
**`/document`** turns a shipped change into release notes plus Diataxis docs. Five new specialist
agents — Product Strategist, Eng Architect, Debugger, Security Officer, Doc Writer — own these
skills, and the Orchestrator now routes to the complete virtual team.

### Added
- **Five P2 workflow skills** — `/investigate` (root-cause debugging), `/security` (OWASP + STRIDE
  audit), `/spec` (intent → executable acceptance criteria), `/qa-report` (report-only QA), and
  `/deploy` (merge → CI → deploy → verify, hard-gated). Each records its work as a run artifact.
- **Two wrapper skills** — `/plan-product` (wraps `strategy-advisor` with Expand/Hold/Reduce modes
  + dimension scoring) and `/document` (wraps `technical-writer` into release notes + Diataxis).
- **Five specialist agents** — `product-strategist`, `eng-architect`, `debugger`,
  `security-officer`, and `doc-writer`, completing the virtual team (11 agents total).

### Changed
- **The Orchestrator routes the whole team.** New branches send bugs to the Debugger, audits to the
  Security Officer, under-specified slices to `/spec`, PRD reviews to `/plan-product`, and shipped
  changes to the Doc Writer. The QA Engineer gains `/qa-report`; the Release Engineer gains
  `/deploy` and hands off to the Doc Writer.
- **Four more craft skills vendored** — `strategy-advisor`, `technical-writer`, `project-planner`,
  and `multi-agent-patterns` join the vendored set (now 14 skills, `vendor:check` green); the
  reference product lists the full pipeline toolkit.
- **Implementation plan — Phase 2 complete for the workflow layer.** All P2 skills, both wrappers,
  and agents 1/2/3/6/8/10 are built; what remains in Phase 2 is the gated browser-security work and
  Tier-2 LLM-judge evals.

## [0.8.0.0] — 2026-07-22

**The Factory now has a designer on the team — a real design phase that turns a PRD into a scored, slop-checked UI spec the builder implements verbatim.**

Products with a UI now get a dedicated design step between architecture and build. The new
**`/plan-design`** skill reads the settled PRD and the chosen stack and produces a UI spec:
visual direction, a design-token system, a component inventory on accessible primitives, the V1
user flows, an accessibility floor, and any charts. It doesn't guess at "looks good" — it scores
every design dimension 0–10 (and names what a 10 looks like) and runs an AI-slop check that steers
the result away from the three templated looks every AI reaches for. A new **Designer** agent owns
this phase, composing the four design craft skills, and the Orchestrator routes any product with a
UI component to it before the build loop. The spec's tokens and components are exactly what the
web build implements, so design intent survives all the way to shipped pixels.

### Added
- **`/plan-design` workflow skill** — the Factory's design phase. Composes `frontend-design`
  (direction), `modern-css-design-systems` (tokens + accessible components), `ux-designer`
  (flows/IA/WCAG), and `visualization-expert` (charts) into a single UI spec, recorded as a run
  artifact so the build loop resumes from it. Adds 0–10 dimension scoring and an AI-slop gate on
  top of the craft skills.
- **Designer agent** (`agents/designer.md`) — the senior-designer persona that runs `/plan-design`
  for any component with a UI (and no-ops cleanly for API-only products), then hands the spec to
  the Implementer.

### Changed
- **The Orchestrator routes to design.** A settled PRD with a UI component and no UI spec now
  routes to the Designer before the build loop. `frontend-design` finally has its consumer.
- **Two more design craft skills vendored** — `ux-designer` and `visualization-expert` join the
  vendored set (now 10 skills, `vendor:check` green); the reference product's `web` component
  lists the full design + build team.
- **Implementation plan — Phase 2 design-workflow track complete.** `/plan-design` and the Designer
  agent are built; the remaining Phase 2 track is the P2 workflow skills (`/investigate`,
  `/security`, `/spec`, `/qa-report`, `/deploy`) and their agents.

## [0.7.0.0] — 2026-07-22

**The Factory now has real frontend craft — React architecture, a modern CSS design system, and a designer's eye — not just "wire up a component."**

Three new craft skills give the builder genuine frontend judgement. **`react-frontend-architect`**
knows how to structure a React app that stays changeable as it grows: feature-based modules,
composition over prop-soup, server data as a cache (not copied into `useState`), and memoisation
only where it's measured to matter — with a full rule catalogue for deep reviews.
**`modern-css-design-systems`** turns a look into a coherent, accessible system: Tailwind v4 with
design tokens, shadcn/ui on Radix primitives, dark mode by token-swap, container queries, and an
accessibility floor baked in. **`frontend-design`** brings art direction — deliberate palette,
typography with personality, and a signature element — so generated UIs stop reading like the same
three AI-templated looks. Point a product's `web` component at React and the builder now loads all
the right craft automatically.

### Added
- **`react-frontend-architect` craft skill** (authored in `agent-skills`, vendored) — React app
  architecture: feature module boundaries, component composition, server-vs-client state, routing,
  code-splitting, and render performance. Ships with an `AGENTS.md` rule catalogue (Boundaries →
  Composition → State → Performance).
- **`modern-css-design-systems` craft skill** — the styling layer: Tailwind v4 + design tokens,
  shadcn/ui (Radix), theming/dark mode, responsive + container queries, cascade layers, motion,
  and accessibility inside components, with vanilla-extract/Panda and plain-CSS escape hatches.
- **`frontend-design` craft skill** (ported from Anthropic's skill) — distinctive visual
  direction: palette, typography personality, layout concept, and a signature element, with a
  brainstorm-then-critique process that steers away from templated defaults.

### Changed
- **The builder routes web components to the new craft.** A React/web-UI component now loads
  `react-frontend-architect` + `modern-css-design-systems` alongside `fullstack-developer`; the
  reference product's `web` component is wired to prove it. Eight craft skills are now vendored
  (`vendor:check` green).
- **Implementation plan → Phase 2 in progress.** The frontend-craft-skills track is complete;
  the design-phase consumer (`/plan-design` + the Designer agent) is the next Phase 2 track.

## [0.6.0.0] — 2026-07-22

**The Factory now builds in Java, not just TypeScript — and the same pipeline proves it, unchanged.**

Phase 1b is implementation-complete: a second language path. You can now point a product at
**Java on Quarkus** and the whole `/discover → /plan-arch → build → /review → /qa → /ship` chain
runs against it with **zero changes to any workflow skill**. Switching language is a one-line
fixture choice (`tech_stack.components[].language: java`), not a second pipeline. A new
`java-quarkus-expert` craft skill teaches the builder idiomatic Quarkus — CDI scopes, Panache
transactions, keeping blocking work off the reactive event loop, native-image reflection — and the
test-first and service-contract skills gained Java dialects (JUnit 5, sealed-interface Results) so
the discipline carries across languages. The chain running end-to-end on a Quarkus component is
now asserted on every `bun test`, so "language routing is a parameter, not a fork" is a measured
fact, not a claim.

### Added
- **`java-quarkus-expert` craft skill** (authored in `agent-skills`, vendored into the Factory) —
  idiomatic Java/Quarkus: thin resources over `@ApplicationScoped` services, records + sealed
  interfaces, transactions around every write, no N+1 across Panache associations, `@Blocking`
  off the event loop, and native-image reflection registration. Ships with a full rule catalogue
  (`AGENTS.md`) for thorough reviews.
- **Java reference product** (`examples/reference-product-java/`) — a single Quarkus `api`
  component that the pipeline drives, so the Java path stays honest as the Factory evolves.
- **Java pipeline coverage** in `test/pipeline-acceptance.test.ts` — the same harness and plan
  helpers drive the Quarkus fixture end-to-end (build → review handoff integrity → hard ship
  gate). Sixty-three tests now pass.

### Changed
- **`tdd-red-green-refactor` → 1.2.0** and **`typed-service-contracts` → 1.2.0** — each gained a
  Java dialect (JUnit 5 red-as-compile-error; a JVM sealed-interface `Result` with Bean Validation
  at the boundary) so the same skill works across TypeScript and Java unchanged.
- **`/review` is language-aware** — it runs a Java component's Maven/Gradle checks (`mvn verify`,
  `./gradlew check`) alongside the TypeScript path, and the Implementer routes Java components to
  `java-quarkus-expert`.
- **Implementation plan → v0.6.** Phase 1b is marked implementation-complete; its exit (the chain
  runs on a Quarkus component with no workflow-skill change) is met on the reference half, sharing
  the one remaining live real-repo PR run with Phase 1.

## [0.5.0.0] — 2026-07-22

**The core loop is proven, not promised — the whole pipeline now runs against a real product on every test.**

Phase 1 is implementation-complete. The five workflow skills, five agents, the run harness, and
the `browse` tool were all in place; what was missing was proof they compose. Now the entire
`/discover → /plan-arch → build → /review → /qa → /ship` chain is driven end-to-end against the
golden reference product on every `bun test` — no live model, no cost, no hand-running. If a change
breaks the handoff between two steps, a test goes red immediately instead of surfacing as a
mysterious failure three steps later. The plan also now states plainly that **Python is a
near-free third language path** (its craft skill already exists — it just needs wiring), distinct
from Java, which still needs a skill authored.

### Added
- **Pipeline acceptance test** (`test/pipeline-acceptance.test.ts`) — the Factory's own Tier-0
  regression signal. It drives the full six-step chain (build splits per component) through the run
  harness against `examples/reference-product/`, asserting the properties that make a run
  trustworthy: every step writes its artifact, each step records the exact bytes the previous step
  produced (handoff integrity), a change high in the chain invalidates everything downstream
  (make-like staleness), hard gates fire on the irreversible ship step and on the product's own
  escalation triggers, cost warns without halting, and two independent runs coexist (re-runnable,
  not a one-off). Sixty tests now pass.

### Changed
- **Implementation plan → v0.5.** Phase 1 is marked implementation-complete, with the reference
  product now a *standing* acceptance test rather than a run-it-once-by-hand step; the only
  remaining Phase-1 item is the operator driving a live agent host against one real repo to open an
  actual PR. A new note makes the **Python path** explicit: `python-expert` already exists, so
  activating Python is vendor + routing-row + a dialect note — it does not need its own build phase
  like Java/Quarkus.

## [0.4.0.0] — 2026-07-22

**`/qa` can now open a real browser — and it's locked to localhost with a prompt-injection guard built in.**

The Factory gains its browser: a headless `browse` tool that drives your running app the way a
user would, so `/qa` reproduces bugs against the live product instead of guessing from the diff.
Because a browser ingests untrusted page content, `browse` runs a layered content-security stack
by default and refuses any non-localhost origin unless you explicitly allow it. Code review also
grows up: the rule catalogue that used to live inside one project is now a proper, reusable craft
skill, vendored into the Factory with 29 rules spanning the OWASP Top 10, API security, frontend,
correctness, and maintainability.

### Added
- **`browse` tool** (`fac browse`) — a headless browser CLI for `/qa` and design review. Run a
  one-shot `browse goto <url>` or a multi-step `browse run` script (verbs: `goto`, `click`,
  `type`/`fill`, `press`, `wait`, `snapshot`, `screenshot`, `eval`, `title`, `url`). Every page
  snapshot passes through a content-security stack — hidden-element stripping, an injection
  heuristic, an untrusted-content envelope with a canary token, and a verdict combiner — so a
  malicious page can't turn a QA run into a prompt-injection. Playwright is an optional dependency,
  loaded only when you actually drive a browser.
- **Localhost-only by default** — `browse` refuses external origins unless you pass
  `--allow-external`, and logs any flagged navigation as a salted hash (never the raw URL) under
  `~/.factory/security/`. A `FACTORY_SECURITY_OFF=1` kill switch exists for local debugging.
- **`code-reviewer` craft skill** — the indexed rule catalogue `/review` applies is now a
  vendored, versioned skill with 29 on-demand rule files and a `REFERENCE.md` index. `/qa` gained
  concrete `fac browse` invocation examples so the QA loop is executable, not just described.

### For contributors
- `tools/browse/{security.ts,browse.ts}` — the security module is pure string operations (safe to
  compile), covered by 14 new Tier-1 tests (injection scan, origin gate, verdict thresholds,
  canary, salted attack log, script parser, secure-snapshot BLOCK/ALLOW paths). ML classifier
  layers stay deferred until `browse` is first pointed at a non-operator page.
- `code-reviewer` was genericised out of the social-housing project (project-specific PII, tenancy,
  and Cypher rules dropped) into the `agent-skills` library, then vendored via `fac vendor` with
  its `references/` catalogue and pinned in the manifest.

## [0.3.0.0] — 2026-07-22

**The core loop is here: frame an idea, pick a stack, build, review, QA, and ship — resumably.**

The Factory now has a minimum viable team and the machinery to run it. A new run harness turns a
body of work into durable, resumable state on disk, so a stopped or re-entered run picks up at the
first step whose inputs changed instead of starting over. Five workflow skills cover the loop from
idea to pull request, and five specialist agents give each stage an owner with its own tools and
handoffs. Every stage writes an artifact, so the reasoning survives and the run is auditable.

### Added
- **Run harness** (`fac run`) — one command family drives a run: `new`, `status`, `artifact`,
  `resume`, `stop`, `list`. Each run lives under `.factory/runs/<id>/` as numbered markdown
  artifacts that *are* the state. Artifacts record the content hash of their inputs, so `resume`
  reruns the first missing or stale step and everything downstream (make-like). A per-repo lock
  keeps one run at a time and clears itself if the owning process died. Cost is measured and
  warned past your `budget.warn_tokens`, never halted.
- **`/plan-arch`** — reads a settled `PRD.md` and writes the machine-owned architecture record
  (`.factory/stack.yaml`): languages, components, frameworks, per-component commands, craft
  skills, guardrails, and escalation triggers. Records the decision as a run artifact.
- **`/review`** — reviews the diff against its base in priority order (Security → Performance →
  Correctness → Maintainability → Testing), applies safe auto-fixes, and writes a report. An
  unresolved security finding is a hard gate that blocks `/ship`.
- **`/qa`** — drives the running app in a real browser, reproduces bugs with exact steps, and
  captures a regression test for each. Localhost-only by default.
- **`/ship`** — enforces the review and QA gates, runs the full check suite from your stack,
  opens a pull request, and (when configured) deploys and verifies. Push, PR, and deploy are
  hard gates that stop and ask, one at a time.
- **The minimum viable team** (`agents/`) — Orchestrator (routes requests and owns the run),
  Implementer (builds test-first, language-routed per component), Code Reviewer, QA Engineer,
  and Release Engineer, each with declared skills, tools, and handoffs.

### For contributors
- `lib/run.ts` is the run contract every P1 skill is written against (atomic artifact writes,
  input-hash resume, lock lifecycle, gate tiers, budget status), covered by 12 new Tier-1 tests.

## [0.2.1.0] — 2026-07-22

**The checks now run on every push, and vendored skills resolve the path they ask for.**

The validation suite you run locally — generate, no-drift, `skill:check`, `vendor:check`, tests —
now runs in CI on every push and pull request, so a stale generated skill or a broken binding
fails the build instead of reaching main. And a vendored craft skill that reads
`.agents/project-context.yaml` by that literal path now finds it, no edit required.

### Added
- **CI gate** (`.github/workflows/ci.yml`) — installs with a frozen lockfile, regenerates skills
  and fails on drift (`git diff --exit-code`), then runs `skill:check`, `vendor:check`, and the
  Tier-1 tests. Superseded runs on the same ref cancel themselves.

### Changed
- **`sync-context` also writes `.agents/project-context.yaml`.** It is a byte-identical,
  DO-NOT-EDIT alias of `.factory/context.gen.yaml` so vendored craft skills that reference that
  path literally resolve without a fork. `fac init` and the repo `.gitignore` ignore the alias
  the same way they ignore the derived context.

## [0.2.0.0] — 2026-07-22

**A product is now two files, and the checks that guard it actually fail when they should.**

Product context splits into a human half and a machine half, so `/plan-arch` can record a design
without editing the requirements document you have open. The validation layer became real:
`skill:check` compares generated skills byte for byte, `sync-context` validates with a schema
instead of claiming to, and a new `vendor:check` proves vendored craft skills actually bind to
your product context.

### Added
- **`fac vendor` / `fac vendor:check`** — vendor a craft skill from `agent-skills` pinned by
  version and content hash, then verify integrity, upstream drift, and that every `${ctx.*}` a
  vendored skill references is declared in the schema *and* populated in a real context.
- **Golden reference product** (`examples/reference-product/`) — a small TypeScript/React product
  the pipeline runs against, so a broken handoff shows up as a failing check rather than a
  surprise during a demo.
- **Tier-1 test harness** — 26 tests, every validator with a negative case.
- **`fac init` scaffolds the whole product** — `PRD.md`, `.factory/stack.yaml`, `.factory/runs/`,
  and the right `.gitignore` entries.
- Three vendored craft skills: `fullstack-developer`, `tdd-red-green-refactor`,
  `typed-service-contracts`.

### Changed
- **Product context is split by author.** `PRD.md` frontmatter keeps `product`, `domain`, `meta`;
  `tech_stack`, `commands`, `skills`, `guardrails`, `escalation_policy` and `tech_bindings` move
  to `.factory/stack.yaml`. `sync-context` rejects a write across that line instead of merging it.
- **`project-context.schema.json` is a real superset of the agent-skills schema.** Every key that
  library defines is now declared, so domain-knowledge craft skills bind without a fork. Each
  property records which file owns it.
- An untouched PRD template no longer validates — an empty product name is not a product.

### Fixed
- **`sync-context` validates.** It previously wrote "Validated against project-context.schema.json"
  into a file it had only regex-checked for two key names.
- **`skill:check` detects drift.** The old check asked whether the first line of the template body
  appeared anywhere in the generated file — which passed with a completely stale preamble. It also
  printed a ✓ for skills that had just failed.
- **Vendored skills bind.** `fullstack-developer` reads `${ctx.tech_bindings}`, a key nothing
  produced; `sync-context` now derives it from the components `/plan-arch` chose.
- A skill folder named `discover` no longer accepts frontmatter `name: discovery` (substring match).
- Frontmatter is parsed with a YAML parser in one place, rather than three divergent regexes.

## [0.1.0.0] — 2026-07-22

**The Factory boots. Skill generation pipeline and multi-host install land.**

First scaffold of the AI Software Factory. You can now author a Layer-1 workflow skill as a
`.tmpl`, run one command, and have it generated with the shared ethos/preamble baked in and
installed into both Claude Code and Codex. Every product is defined by a single `PRD.md`, and a
sync step projects its frontmatter into the machine context that vendored craft skills bind to.

### Added
- **Skill generation pipeline** — `bun run gen:skills` turns `skills/<name>/SKILL.md.tmpl` into a
  generated `SKILL.md`, injecting the ethos, writing style, and config protocol via resolvers.
- **Multi-host install** — `hosts/claude.ts` and `hosts/codex.ts` adapters; generated skills
  install into both from day one.
- **`PRD.md` product-context** — `templates/PRD.template.md` placeholder plus an extended
  `project-context.schema.json` (adds `product`, `tech_stack.components[]`, per-component
  `commands`). `bun run sync-context` derives `.factory/context.gen.yaml` from PRD frontmatter.
- **Static validation** — `bun run skill:check` checks frontmatter, folder==name, ≤500 lines,
  Do-not-activate present, and generated-vs-template drift.
- **Seed skill** — `/discover` (product interrogation) ships as the first generated workflow skill.
- **Harness** — `AGENTS.md`, `ETHOS.md`, `VERSION`.
