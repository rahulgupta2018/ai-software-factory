# Security Logging & Monitoring Failures

**Impact: MEDIUM** | **Category: security** | **OWASP: A09** | **Tags:** logging, monitoring, audit

Without security logging you can't detect or investigate incidents. But logs must not themselves
leak secrets or personal data.

## Checklist
- [ ] Auth events, access-control failures, and high-value actions are logged.
- [ ] Logs are tamper-resistant, time-stamped, and retained per policy.
- [ ] Alerts exist for suspicious patterns (spikes in 401/403, repeated failures).
- [ ] **No secrets or personal data in logs** (mask tokens, PII) — see project PII rule.
- [ ] Correlation/request IDs enable tracing without exposing user identity in the clear.
