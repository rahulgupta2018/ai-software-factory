# Cross-Site Request Forgery (CSRF)

**Impact: HIGH** | **Category: security** | **Tags:** csrf, cookies, samesite, web

State-changing requests authenticated by cookies can be forged by other sites unless protected with
anti-CSRF tokens and/or SameSite cookies.

## ✅ Correct
- Use `SameSite=Lax` (or `Strict`) cookies; require a CSRF token for state-changing requests.
- Prefer token-based auth (Authorization header) for APIs, which is not auto-sent cross-site.

## Checklist
- [ ] State-changing endpoints require a CSRF token or a non-cookie auth header.
- [ ] Session cookies set `SameSite`, `Secure`, and `HttpOnly`.
- [ ] Safe methods (GET/HEAD) cause no state change.
- [ ] CORS does not reflect arbitrary origins with credentials.
