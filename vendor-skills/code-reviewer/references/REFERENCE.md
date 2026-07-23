# Code Review Guidelines — Rule Index

Comprehensive rule catalogue for the `code-reviewer` skill, grouped by area and priority. Each entry
links to a rule file in this folder (why / ❌ / ✅ / checklist). **Load a rule file on demand** rather
than all at once.

Review priority order: **Security → Performance → Correctness → Maintainability**, then Testing.

**Dialect notes.** The rules are language-general; apply the target stack's equivalent. For
TypeScript/JavaScript that means: parameterised queries (never string-built SQL), output encoding /
framework auto-escaping for XSS, `strict` + no implicit `any` for the type rule, and the runtime's
built-in resource/transaction primitives. For Python, apply type hints and context managers. If the
project context declares extra gates (compliance rules, guardrails, tenancy), enforce those on top
of this catalogue.

---

## Security — CRITICAL (OWASP Top 10 + web)

| Rule | OWASP | File |
|---|---|---|
| SQL Injection Prevention | A03 | [security-sql-injection.md](security-sql-injection.md) |
| Injection (command/NoSQL/template/LDAP) | A03 | [security-injection-general.md](security-injection-general.md) |
| XSS Prevention | A03 | [security-xss-prevention.md](security-xss-prevention.md) |
| Broken Access Control (IDOR/BOLA) | A01 | [security-access-control.md](security-access-control.md) |
| Cryptographic Failures & Secrets | A02 | [security-crypto-and-secrets.md](security-crypto-and-secrets.md) |
| Insecure Design | A04 | [security-insecure-design.md](security-insecure-design.md) |
| Security Misconfiguration | A05 | [security-misconfiguration.md](security-misconfiguration.md) |
| Vulnerable & Outdated Components | A06 | [security-vulnerable-dependencies.md](security-vulnerable-dependencies.md) |
| Authentication Failures | A07 | [security-auth-failures.md](security-auth-failures.md) |
| Integrity & Insecure Deserialization | A08 | [security-integrity-deserialization.md](security-integrity-deserialization.md) |
| Security Logging & Monitoring | A09 | [security-logging-monitoring.md](security-logging-monitoring.md) |
| SSRF | A10 | [security-ssrf.md](security-ssrf.md) |
| CSRF | — | [security-csrf.md](security-csrf.md) |

## API security — CRITICAL/HIGH (OWASP API Top 10)

| Rule | File |
|---|---|
| API Authorization (BOLA/BFLA) | [api-authorization.md](api-authorization.md) |
| Input Validation & Mass Assignment | [api-input-validation.md](api-input-validation.md) |
| Rate Limiting & Resource Limits | [api-rate-limiting.md](api-rate-limiting.md) |
| Error Handling & Information Exposure | [api-error-exposure.md](api-error-exposure.md) |

## Frontend — HIGH/MEDIUM

| Rule | File |
|---|---|
| CSP & Security Headers | [frontend-csp-and-headers.md](frontend-csp-and-headers.md) |
| Cookies, Storage & Client Secrets | [frontend-cookies-and-secrets.md](frontend-cookies-and-secrets.md) |
| Accessibility (a11y) | [frontend-accessibility.md](frontend-accessibility.md) |
| XSS (see Security) | [security-xss-prevention.md](security-xss-prevention.md) |

## Performance — HIGH

| Rule | File |
|---|---|
| Avoid N+1 Queries | [performance-n-plus-one.md](performance-n-plus-one.md) |

## Correctness — HIGH

| Rule | File |
|---|---|
| Proper Error Handling | [correctness-error-handling.md](correctness-error-handling.md) |
| Concurrency & Race Conditions | [correctness-concurrency-races.md](correctness-concurrency-races.md) |
| Transactions & Atomicity | [correctness-transactions.md](correctness-transactions.md) |
| Resource Management & Cleanup | [reliability-resource-cleanup.md](reliability-resource-cleanup.md) |

## Maintainability — MEDIUM

| Rule | File |
|---|---|
| Meaningful Names | [maintainability-naming.md](maintainability-naming.md) |
| Type Hints / Annotations | [maintainability-type-hints.md](maintainability-type-hints.md) |
| Complexity, DRY & SRP | [maintainability-complexity-dry.md](maintainability-complexity-dry.md) |

## Testing

| Rule | File |
|---|---|
| Test Coverage of Changes | [testing-coverage.md](testing-coverage.md) |

---

## Review checklist (quick)

**Security (CRITICAL — first):** injection (SQL/cmd/NoSQL/template), XSS, access control/IDOR, secrets
& crypto, misconfig (CORS/headers), auth, SSRF, CSRF, deserialization, vulnerable deps.
**API:** object + function authz, input validation, rate limits, safe errors.
**Frontend:** CSP/headers, secure cookies, no client secrets, a11y.
**Performance:** N+1, indexes, needless calls.
**Correctness:** error handling, races, transactions, cleanup.
**Maintainability:** naming, types, complexity/DRY.
**Testing:** new logic, edge/error paths, regression tests.

## Severity levels

| Level | Description | Action |
|---|---|---|
| 🔴 CRITICAL | Security hole, data loss, secret/credential exposure | Block merge; fix now |
| 🟠 HIGH | Correctness bug, perf at scale | Fix before merge |
| 🟡 MEDIUM | Maintainability / quality | Fix or accept with TODO |
| ⚪ LOW | Style / minor | Optional |

## References
- OWASP Top 10 — https://owasp.org/www-project-top-ten/
- OWASP API Security Top 10 — https://owasp.org/www-project-api-security/
- Individual rule files in this folder.
