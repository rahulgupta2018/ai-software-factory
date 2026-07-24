---
name: security
description: >-
  Security audit of a codebase or change against the OWASP Top 10, OWASP API Security Top 10,
  and STRIDE — plus an application-security checklist (crypto, access management/RBAC,
  tokens/JWT, API headers & params, sessions, caching) and, for mobile components, OWASP MASVS
  and the transport (TLS) posture. Low false-positive gate — every finding is a concrete,
  exploitable path with a severity, evidence, and a fix, not a theoretical worry. Activates on
  "security review", "is this safe", pre-launch hardening, or an audit request. Owns proactive
  vulnerability hunting; escalates confirmed incidents to /investigate.
license: MIT
metadata:
  author: AI Software Factory
  version: 0.6.0
  last_updated: 2026-07-24
  layer: Review
  priority: V1
---

# Security

<!-- FACTORY:ETHOS (generated — do not edit) -->
> **Factory ethos.** Every action inherits these principles:
>
> - Boil the ocean
> - Search before building
> - User sovereignty
> - One owner per file
> - Mechanism vs parameters
> - Ground your claims
> - Defensibility is the product

<!-- FACTORY:WRITING-STYLE (generated — do not edit) -->
### Writing style

- Gloss jargon on first use. Short sentences. Lead with user impact.
- Frame questions in outcome terms ("what breaks for your users if…"), not implementation terms.
- Be direct about quality and trade-offs. Cite sources for factual claims.

<!-- FACTORY:CONFIG-PROTOCOL (generated — do not edit) -->
### Config protocol

A product is defined by two files, split by who writes them:

| File | Owner | Holds |
|---|---|---|
| `PRD.md` | **human** | frontmatter: `product`, `domain`, `meta` · body: the requirements |
| `.factory/stack.yaml` | **`/plan-arch`** | `tech_stack`, `commands`, `skills`, `guardrails`, `escalation_policy`, `tech_bindings` |

Before doing anything else:

1. **Read** both — or the merged `.factory/context.gen.yaml` if it is current. Skills bind via `${ctx.*}`.
2. If a value you need is **missing**, ask the user with AskUserQuestion — never guess.
3. **Persist** the answer to the file that *owns* that key, then re-run `fac sync-context`.
   Never write a machine key into `PRD.md`; `sync-context` rejects it.
4. When a key is absent and the user cannot supply it, fall back to your documented generic default.

Precedence: per-skill `overrides` → merged product context → skill generic default.

## Overview

`/security` is the Factory's security officer. It audits a codebase or a change against the
**OWASP Top 10** and **STRIDE** threat model and reports findings ranked by severity — each one a
concrete, exploitable path with evidence and a fix. It records the audit as a run artifact.

Its defining discipline is a **low false-positive gate**: a report full of "consider maybe"
noise gets ignored, so every finding must name the attack, the vulnerable code, the impact, and
the remediation. A theoretical worry with no exploit path is a note, not a finding.

## When to Activate

Activate when:
- The user asks for a "security review/audit", "is this safe to ship", "check for vulnerabilities",
  or pre-launch hardening.
- A change touches auth, input handling, data access, secrets, file/network I/O, or dependencies.

**Do not activate** (adjacent skills own this):
- `review` — general correctness/quality review of a diff; `/security` is the deep,
  threat-model-driven pass (it may be invoked *by* review for security-sensitive changes).
- `investigate` — root-causes a *confirmed* incident; `/security` hunts *potential* vulnerabilities
  before they're exploited.
- `code-reviewer` (craft) — supplies the security rule catalogue (injection, authz, crypto,
  secrets); `/security` runs the STRIDE/OWASP audit and applies those rules with an exploit gate.

## Core Concepts

- **The audit is the artifact.** Scope, threat model, findings (with severity/evidence/fix), and
  residual risk are recorded as a sub-sequenced run artifact (`04a-security.md`).
- **Two lenses, one pass.** Walk the **OWASP Top 10** (injection, broken auth, broken access
  control, cryptographic failures, SSRF, misconfig, vulnerable dependencies, integrity/SSRF, logging
  gaps) and **STRIDE** (Spoofing, Tampering, Repudiation, Information disclosure, Denial of service,
  Elevation of privilege) over the trust boundaries. For an API surface, add the **OWASP API
  Security Top 10** (BOLA, broken function-level authz, unrestricted resource consumption).
- **Application security is bound, not built (plan §6.3).** The Factory rolls no authn/authz,
  crypto, session, or cache layer of its own — it binds a vetted provider/library recorded in
  `tech_bindings` (`auth`, `crypto`, `session`, `cache`, `tls`) and *audits the binding*. Walk the
  checklist: **cryptography** (A02 — no rolled-your-own, keys in a KMS/vault), **access
  management/RBAC** (A01, API BOLA/BFLA — every object and function authorised server-side),
  **tokens/JWT** (A07 — verified signature, `exp`/`aud`/`iss`, no `alg:none`), **API headers &
  query params** (A03/A05 — input validated, security headers set, no secrets in the URL),
  **sessions** (A07 — rotation on privilege change, sane lifetime, secure/HttpOnly/SameSite), and
  **caching** (A01/A05 — no per-user data in a shared cache, cache key includes the tenant).
- **Mobile components get MASVS + transport.** For a mobile component (e.g. Flutter/Dart), walk
  the **OWASP MASVS** essentials — secrets in the platform secure store (never plaintext prefs), no
  secrets in the bundle, HTTPS-only with certificate pinning, obfuscated/stripped release builds —
  and the transport posture (`lib/tls-verify.ts` policy: valid chain, >= TLS 1.2, HSTS). Defer
  idiom-level MASVS findings to `flutter-dart-expert`; `/security` confirms the control exists.
- **Supply chain is scanned, not trusted (plan §Phase 7).** Your code can be perfect and still ship
  a known-vulnerable dependency (OWASP A06). A dependency scanner (`osv-scanner` / `npm audit` /
  `pip-audit` / Trivy, bound in `tech_bindings.supply_chain.sca_tool`) and an **SBOM** (CycloneDX or
  SPDX) run in CI at build time; `/security` normalises the scanner JSON and applies the severity
  policy via `lib/sca-report.ts`. A **fix-available** finding at or above `block_severity` (default
  High) is a **hard gate** on `/ship` / `/deploy` — an unfixable CVE warns but never holds the
  release. The build must also emit a non-empty SBOM. The Factory runs no scanner and fetches no
  advisory feed itself (custody principle) — it verifies CI's output.
- **Static analysis is advisory-then-gating (plan §Phase 7).** A static analyzer (**semgrep**
  rulesets, or **CodeQL** where available, bound in `tech_bindings.sast.tool`) runs in CI over the
  source and emits findings (rule id, location, severity, often a CWE). `/security` normalises the
  tool's SARIF / semgrep JSON via `lib/sast-report.ts` and applies the severity policy: a finding at
  or above `sast.block_severity` (default High) is a **gate**; below-threshold is a note. Unlike SCA
  there is **no fix-available escape** — the vulnerable code is yours, so a High/Critical static
  finding always gates until the code is fixed. `/review` surfaces the same findings as *advisory*;
  `/security` is where they gate. The analyzer is a wrapper; the Factory owns the policy.
- **The pipeline itself is audited (plan §Phase 7).** A CI/CD pipeline is attack surface: an
  over-privileged `GITHUB_TOKEN`, a long-lived cloud secret, an unpinned action, or a security gate
  that isn't wired as a step (OWASP CI/CD security). `/security` audits an existing workflow against
  the hardening baseline via `lib/pipeline-lint.ts` (bound in `tech_bindings.ci`): least-privilege
  `permissions:`, OIDC/keyless auth (`id-token: write`, no long-lived secret), SHA-pinned actions,
  and the SCA/SBOM/SAST/sign steps present. A finding is a fix; `/pipeline` **generates** a compliant
  workflow, `/security` **reports** an existing one against the same lint.
- **Runtime & image surface, when it applies (plan §Phase 7, Track 5 — optional).** A product that
  ships a **Docker image** or exposes a **running preview** adds two surfaces the app-code gates miss.
  A **container-image scan** (Trivy/Grype, `tech_bindings.container_scan`) finds OS/base-layer CVEs;
  `/security` gates on a fix-available image vuln at/above the threshold via `lib/container-scan.ts`
  and lints the image config (non-root user, base image pinned by digest). A **DAST** scan (OWASP ZAP
  baseline, `tech_bindings.dast`) exercises the live preview; `/security` gates on a confirmed alert
  at/above the risk threshold via `lib/dast-report.ts` (a false-positive never gates). Both scans run
  in CI (custody principle); skip the pair for a product with no image and no deployed surface.
- **Trust boundaries first.** Map where untrusted input crosses into trusted code (network edges,
  user input, third-party callbacks, deserialization). Findings cluster there.
- **Low false-positive gate.** A finding requires: the attack, the exact vulnerable code, the
  impact if exploited, and the fix. No exploit path → downgrade to an informational note.
- **Severity by impact × exploitability.** Rank Critical/High/Medium/Low; lead with what a real
  attacker reaches first.

## Workflow

Freedom level: **low** — the coverage is a checklist; skipping a category is a gap.

1. **Scope.** Identify what's under audit (whole codebase or a diff) and the assets worth
   protecting (credentials, PII boundary per `guardrails`, tenant isolation, money paths).
2. **Map trust boundaries.** List every point where untrusted input enters and every privilege
   transition. This is the attack surface.
3. **Walk OWASP Top 10** across the surface — injection, authn, access control, crypto/secrets,
   SSRF, misconfiguration, vulnerable dependencies, integrity, logging/monitoring gaps. Apply the
   `code-reviewer` security rules.
4. **Walk STRIDE** per boundary — for each, ask which of Spoofing/Tampering/Repudiation/Info-
   disclosure/DoS/Elevation applies and whether a control exists.
5. **Walk the application-security checklist (§6.3)** against the bound providers in
   `tech_bindings` — crypto, access management/RBAC (+ OWASP API BOLA/BFLA on any API surface),
   tokens/JWT, API headers & query params, sessions, caching. A missing or misconfigured binding is
   a finding; a bound-but-correct control is a note. For a **mobile** component, add the MASVS
   essentials and the transport (TLS) posture.
6. **Run the supply-chain gate (§Phase 7).** Take CI's dependency-scan JSON and SBOM and evaluate
   them via `lib/sca-report.ts` against `tech_bindings.supply_chain` (`sca_tool`, `block_severity`,
   `require_fix_available`, `sbom_format`): normalise the scan, and treat a **fix-available** finding
   at or above the threshold as a hard gate; confirm a non-empty SBOM was produced (`verifySbom` —
   this is SCA's scan-liveness proof). Record the blocking findings in the audit. A severity-less
   scanner (pip-audit) emits `unknown` severity: those findings now **fail closed** — a fixable one
   gates pending triage (an unfixable one still only warns). That's safe but noisy; **prefer
   osv-scanner/Trivy** for a *graded* Python severity policy rather than all-or-nothing triage.
7. **Run the static-analysis (SAST) gate (§Phase 7).** **First confirm the scan ran** — a SAST
   report must have been produced (`verifyScanRan('SAST', present)` in `lib/scan-liveness.ts`); an
   absent report is a **hard gate**, never a silent pass (a skipped scan is not a clean scan). Then
   take CI's analyzer output (semgrep JSON or SARIF/CodeQL) and evaluate it via `lib/sast-report.ts`
   against `tech_bindings.sast` (`tool`, `format`, `block_severity`): normalise the findings and
   treat a finding at or above the threshold (default High) as a gate — there is no fix-available
   escape, the code is yours to fix. A finding the analyzer emitted but couldn't grade (`unknown`
   severity) gates pending triage by default. Record the blocking findings in the audit. `/review`
   surfaces these as advisory; here they gate.
8. **Audit the CI/CD pipeline (§Phase 7).** If the product has a pipeline, parse its
   `.github/workflows/*.yml` and evaluate it via `lib/pipeline-lint.ts` against `tech_bindings.ci`:
   flag an over-broad `permissions:`, a missing `id-token: write` (no OIDC), a long-lived cloud/
   registry secret, an unpinned action, or a missing required security step. **Derive the required
   steps from the gates the product declares** — `requiredStepsForBindings(tech_bindings)` — and
   union them into the policy's `required_steps`, so *every declared gate's scan must be wired into
   CI* (a declared SAST/SCA/container/DAST/provenance gate whose step is missing is a finding). This
   is what backstops the scan-liveness check (step 7/9): a gate you declare can't be silently
   skipped. Report each; `/pipeline` owns generating/fixing the workflow, `/security` audits it.
9. **Run the runtime & image gates when they apply (§Phase 7, Track 5).** For each gate the product
   *declares*, **first confirm the scan ran** (`verifyScanRan` in `lib/scan-liveness.ts`) — an
   absent report on a declared gate is a hard gate, not a pass. If the product ships a **container
   image**, evaluate CI's Trivy/Grype scan via `lib/container-scan.ts` against
   `tech_bindings.container_scan` (a fix-available image vuln at/above the threshold gates) and lint
   the image config (non-root user, pinned base image). If it exposes a **running preview**, evaluate
   CI's OWASP ZAP report via `lib/dast-report.ts` against `tech_bindings.dast` (a confirmed alert
   at/above the risk threshold gates; a false-positive never does). Skip a gate only when the product
   genuinely has no image / no preview — a *declared* gate whose scan is missing blocks.
10. **Confirm exploitability.** For each candidate, establish the concrete path and impact. Drop
   anything you can't exploit to an informational note (the FP gate).
11. **Rank and fix.** Severity = impact × exploitability. For each finding, give evidence (file +
   line) and a specific remediation.
12. **Write the audit as a run artifact.** A security audit is a **branch artifact** with a
   sub-sequence seq — the next free letter under the step it follows (`4a` after `/review`, step 4):
   ```bash
   fac run artifact --seq 4a --step security --inputs .factory/runs/$RUN/03-build-<component>.md --body-file security-audit.md
   ```
   Record the built artifacts under audit as inputs so a re-build re-opens the audit; **omit
   `--inputs`** for a standalone whole-codebase audit (nothing upstream to hash).
13. **Hand off / gate.** Critical/High findings on a change bound for production are a **hard gate**
    (`escalation_policy`): stop, report, and require a fix before `/deploy`. A public endpoint that
    fails the transport (TLS) policy, a fix-available supply-chain finding, or a High/Critical SAST
    finding at/above the threshold, is likewise a hard gate `/deploy` re-checks mechanically.

## Practical Guidance

- Start where untrusted input meets a dangerous sink (query, shell, filesystem, template, deserializer).
- Secrets: grep for hardcoded keys/tokens and client-exposed credentials; verify they load from a
  vault/env, never source or logs.
- Dependencies: flag known-vulnerable versions; prefer the maintained, patched line.
- Prefer parameterisation, allow-lists, least privilege, and fail-closed defaults in every fix.
- Don't drown the signal: three real Highs beat thirty "consider" notes.

## Examples

**Example:**
```
Input:  diff adds a repairs search endpoint building a Cypher query by string concatenation.
Audit:  trust boundary = HTTP query param → Neo4j. OWASP A03 Injection + STRIDE Tampering.
        Exploit confirmed: `" OR 1=1 //` returns all tenants' repairs (also breaks tenant
        isolation per guardrails).
Output: run artifact 04a-security.md — finding CRITICAL: Cypher injection + cross-tenant leak,
        evidence (file:line), fix (parameterised query + tenant scope in WHERE). One Medium:
        error response leaks stack trace. FP gate dropped a "verbose logging" note to
        informational (no exploit path).
Gate:   Critical on a production-bound change → hard stop before /deploy.
```

## Guidelines

1. Every finding names the attack, the vulnerable code (file:line), the impact, and the fix.
2. No exploit path → it's an informational note, not a finding (the FP gate).
3. Cover OWASP Top 10 and STRIDE (+ OWASP API Top 10 on an API surface); a skipped category is a
   coverage gap, say so.
4. Audit the bound providers (`tech_bindings.auth/.crypto/.session/.cache/.tls`) against the §6.3
   checklist; for a mobile component add MASVS + the transport policy.
5. Run the supply-chain gate: a fix-available finding at/above `supply_chain.block_severity` is a
   hard gate (`lib/sca-report.ts`); an unfixable one warns. Confirm a non-empty SBOM was produced.
6. Run the SAST gate: a static finding at/above `sast.block_severity` (`lib/sast-report.ts`) gates —
   no fix-available escape, the code is yours to fix. Advisory in `/review`, gating here.
7. Audit the CI/CD pipeline (`lib/pipeline-lint.ts`, `tech_bindings.ci`): least-privilege
   permissions, OIDC/keyless (no long-lived secret), pinned actions, required gate steps present.
   `/pipeline` generates/fixes; `/security` reports.
8. When they apply, run the runtime & image gates: a fix-available container CVE at/above
   `container_scan.block_severity` (`lib/container-scan.ts`) + the image-hardening lint, and a
   confirmed DAST alert at/above `dast.block_risk` (`lib/dast-report.ts`). Skip the pair for a
   product with no image and no deployed preview.
9. Rank by impact × exploitability; lead with what an attacker reaches first.
10. Critical/High on a production-bound change is a hard gate — stop and require the fix.
11. Record the audit as a run artifact.

## Gotchas

1. **False-positive flood**: an audit that cries wolf gets ignored; gate every finding on a real
   exploit path.
2. **Symptom fixes**: escaping one query while the pattern repeats elsewhere fixes nothing — fix
   the class.
3. **Ignoring dependencies**: your code can be perfect and still ship a known-vulnerable library.
4. **Secrets in code/logs**: hardcoded or logged credentials are Critical, not Medium.
5. **Skipping trust-boundary mapping**: findings cluster at boundaries; skip the map and you miss them.

## Integration

- `code-reviewer` (craft) — supplies the security rule catalogue this audit applies.
- `review` — may invoke `/security` for security-sensitive diffs; `/security` returns findings.
- `investigate` — a confirmed, exploited vulnerability routes there for incident root-cause.
- `deploy` — Critical/High findings are a hard gate before it runs.
- Run harness (`fac run`) — records the audit as a sub-sequenced `04a-security.md`.

## References

- OWASP Top 10, OWASP API Security Top 10, OWASP ASVS, OWASP MASVS, STRIDE threat model
- Transport policy: `lib/tls-verify.ts` (valid chain, >= TLS 1.2, HSTS) — re-checked by `/deploy`
- Supply-chain gate: `lib/sca-report.ts` (SCA severity policy + SBOM check) bound via
  `tech_bindings.supply_chain`; a fix-available finding at/above the threshold hard-gates `/ship`/`/deploy`
- Static-analysis gate: `lib/sast-report.ts` (semgrep/SARIF severity policy) bound via
  `tech_bindings.sast`; a finding at/above the threshold gates — advisory in `/review`, gating here
- CI/CD pipeline audit: `lib/pipeline-lint.ts` (least-privilege permissions, OIDC/keyless, pinned
  SHAs, required steps) bound via `tech_bindings.ci`; `/pipeline` generates/fixes, `/security` reports
- Container-image gate (optional): `lib/container-scan.ts` (Trivy/Grype severity policy + non-root /
  pinned-base hardening) bound via `tech_bindings.container_scan`
- DAST gate (optional): `lib/dast-report.ts` (OWASP ZAP baseline risk policy) bound via
  `tech_bindings.dast`; a confirmed alert at/above the risk threshold gates
- Application-security checklist: plan §6.3 (authn/authz, crypto, sessions, API, caching)
- Security rules: vendored `code-reviewer` (`references/`)
- Related skills: `review`, `investigate`, `deploy`
- Agent: `agents/security-officer.md`
