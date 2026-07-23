# Insecure Design

**Impact: HIGH** | **Category: security** | **OWASP: A04** | **Tags:** threat-model, secure-by-design

Some flaws are design-level, not code-level: missing rate limits on sensitive flows, no threat
model, trusting the client for security-relevant decisions, or workflows with no abuse controls.
Review the *design* of a change, not only its lines.

## Why this matters
A password-reset with no rate limit enables enumeration/brute force even if every line is "correct".

## Review prompts
- What can an abuser do with this feature? (enumeration, replay, flooding, privilege gain)
- Which decisions must be enforced server-side? Are any left to the client?
- Are there limits (rate, size, quota) on sensitive or expensive operations?
- Is there a safe default / fail-closed behaviour?

## Checklist
- [ ] Sensitive flows (login, reset, payment, export) have abuse controls and rate limits.
- [ ] Security decisions are enforced server-side and fail closed.
- [ ] Expensive operations have quotas/limits.
- [ ] A brief threat model exists for new high-risk features.
