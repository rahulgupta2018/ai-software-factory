---
# Acceptance contract — the answer key, compiled from the contract sources BEFORE the code exists.
# One criterion per contracted behaviour: not just the routes, but the cross-cutting obligations
# (side effects, headers, error shapes, security, data) that a "wrap the library" build silently
# drops. Modelled on a real identity service so the fixture doubles as a worked example.
acceptance:
  component: identity
  sources:
    - docs/openapi/identity.yaml
    - docs/be-architecture.md
  criteria:
    - id: AC-IDENTITY-001
      behavior: "POST /api/auth/sign-in/email with valid credentials returns 200 with a session cookie."
      kind: route
      source: "identity.yaml POST /api/auth/sign-in/email"
    - id: AC-IDENTITY-002
      behavior: "Sign-in emits auth.signin, and a failed sign-in emits auth.failed, to the audit outbox before acknowledgement."
      kind: side-effect
      source: "identity.yaml lines 22-26; per-endpoint Audit events"
    - id: AC-IDENTITY-003
      behavior: "Session and sign-in responses include the operator's RBAC role in the user object."
      kind: contract
      source: "identity.yaml SessionResponse.user.role; be-architecture.md RBAC roles"
    - id: AC-IDENTITY-004
      behavior: "Every response carries an x-correlation-id, echoing the request's when present."
      kind: header
      source: "identity.yaml CorrelationId header; be-architecture.md correlation-id propagation"
    - id: AC-IDENTITY-005
      behavior: "The production Postgres schema is created by a migration the service ships and runs."
      kind: data
      source: "be-architecture.md identity owns the BetterAuth schema"
    - id: AC-IDENTITY-006
      behavior: "A dependency outage on a credentialed route returns the 503 platform Error envelope, not a raw 500."
      kind: error-shape
      source: "identity.yaml 503 ServiceUnavailable; platform Error envelope"
---

# Acceptance contract: identity (S6)

This is the machine-checkable answer key `verifyAcceptance` reads from frontmatter. The build must
close every criterion (`met` + a cited test) or record a consented deferral; `/review` re-derives
the same criteria from the sources independently and audits the matrix against this file.
