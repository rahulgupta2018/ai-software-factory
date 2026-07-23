# Server-Side Request Forgery (SSRF)

**Impact: HIGH** | **Category: security** | **OWASP: A10** | **Tags:** ssrf, url, fetch, metadata

If the server fetches a user-supplied URL, an attacker can make it reach internal services or cloud
metadata endpoints (e.g. `169.254.169.254`) and exfiltrate credentials.

## ❌ Incorrect
```python
requests.get(request.args["url"])          # fetches any URL, incl. internal/metadata
```

## ✅ Correct
```python
url = request.args["url"]
if not is_allowed(url):                     # allow-list of hosts/schemes; block private ranges
    raise HTTPException(400)
requests.get(url, timeout=5, allow_redirects=False)   # no redirects to bypass the check
```

## Checklist
- [ ] User-supplied URLs validated against an allow-list (scheme + host).
- [ ] Private/loopback/link-local ranges and cloud metadata IPs blocked.
- [ ] Redirects disabled or re-validated; timeouts set.
- [ ] Fetch service runs with least privilege / no ambient cloud credentials where possible.
