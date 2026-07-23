# Security Misconfiguration

**Impact: HIGH** | **Category: security** | **OWASP: A05** | **Tags:** config, cors, headers, errors

Insecure defaults, over-permissive CORS, missing security headers, verbose error pages, and debug
mode in production are all exploitable without any code bug.

## ❌ Incorrect
```python
CORS(app, origins="*", supports_credentials=True)   # any origin + credentials
app.run(debug=True)                                 # debug in prod: stack traces to users
```

## ✅ Correct
```python
CORS(app, origins=ALLOWED_ORIGINS, supports_credentials=True)   # explicit allow-list
# debug off in prod; generic error pages; security headers set (see frontend-csp-and-headers).
```

## Checklist
- [ ] CORS uses an explicit origin allow-list (never `*` with credentials).
- [ ] Security headers set (CSP, HSTS, X-Content-Type-Options, X-Frame-Options/frame-ancestors).
- [ ] Debug/verbose errors and stack traces disabled in production.
- [ ] No default/sample credentials; unused features/endpoints disabled.
- [ ] Directory listing and admin consoles not publicly exposed.
