# Frontend: CSP & Security Headers

**Impact: HIGH** | **Category: frontend-security** | **Tags:** csp, headers, clickjacking, https

Security headers are defence-in-depth against XSS, clickjacking, and downgrade attacks.

## Checklist
- [ ] Content-Security-Policy set (restrict script/style/img sources; avoid `unsafe-inline`).
- [ ] `frame-ancestors`/X-Frame-Options to prevent clickjacking.
- [ ] HSTS (Strict-Transport-Security) on HTTPS.
- [ ] X-Content-Type-Options: nosniff; Referrer-Policy set.
- [ ] No secrets or PII embedded in HTML/JS delivered to the browser.
