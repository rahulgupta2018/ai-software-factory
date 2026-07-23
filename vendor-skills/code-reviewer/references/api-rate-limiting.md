# API Rate Limiting & Resource Limits

**Impact: HIGH** | **Category: api-security** | **OWASP API: A04** | **Tags:** rate-limit, dos, quota

Unlimited request rates and unbounded responses enable DoS and scraping. Apply per-user/IP limits
and cap expensive operations.

## Checklist
- [ ] Rate limiting on auth, search, and expensive/LLM/graph endpoints.
- [ ] Pagination enforced with a max page size (no "return everything").
- [ ] Request body size and upload size limits set.
- [ ] Timeouts on outbound calls; circuit breakers on flaky dependencies.
- [ ] Costly operations (retrieval, generation) are quota'd per tenant.
