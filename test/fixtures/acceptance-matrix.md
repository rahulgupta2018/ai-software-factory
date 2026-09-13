---
# Conformance matrix — the build's report, one entry per acceptance criterion. A PASSING matrix:
# every criterion met with a cited test, except AC-IDENTITY-006, deferred to a later slice WITH an
# explicit reason AND operator consent (and its kind, error-shape, is deferrable). This is the
# reference the verifier test perturbs one field at a time to prove each block rule.
conformance:
  component: identity
  consentToDefer:
    - AC-IDENTITY-006
  entries:
    - id: AC-IDENTITY-001
      status: met
      impl: services/identity/src/server.ts:29
      test: "server.test.ts › sign-in with valid credentials returns 200 + cookie"
    - id: AC-IDENTITY-002
      status: met
      impl: services/identity/src/audit-outbox.ts:34
      test: "server.test.ts › emits auth.signin to the outbox on sign-in; auth.failed on bad password"
    - id: AC-IDENTITY-003
      status: met
      impl: services/identity/src/auth.ts:11
      test: "server.test.ts › get-session payload includes user.role"
    - id: AC-IDENTITY-004
      status: met
      impl: services/identity/src/correlation.ts:12
      test: "server.test.ts › every response carries x-correlation-id"
    - id: AC-IDENTITY-005
      status: met
      impl: services/identity/migrations/0001_betterauth.sql:1
      test: "migrate.test.ts › schema applies and readiness verifies tables exist"
    - id: AC-IDENTITY-006
      status: deferred
      deferralReason: "503 envelope shaping deferred to the resilience slice; raw 500 acceptable for V1 internal-only."
---

# Conformance matrix: identity (S6)

The build records this in `03-build-identity.md` frontmatter. `verifyAcceptance` joins it to the
acceptance contract by criterion id and blocks on any gap.
