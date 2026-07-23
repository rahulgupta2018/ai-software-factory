# Frontend: Cookies, Storage & Client Secrets

**Impact: HIGH** | **Category: frontend-security** | **Tags:** cookies, localstorage, secrets, nextjs

Session cookies must be hardened, tokens/secrets must not live in `localStorage` or the client
bundle, and only public config may be exposed to the browser.

## ❌ Incorrect
```javascript
localStorage.setItem("jwt", token);                 // XSS-stealable
const key = process.env.NEXT_PUBLIC_API_SECRET;     // secret shipped to the browser
```

## ✅ Correct
```javascript
// Auth via HttpOnly + Secure + SameSite cookie set by the server (not readable by JS).
// Only truly public values use NEXT_PUBLIC_*; real secrets stay server-side.
```

## Checklist
- [ ] Session cookies: `HttpOnly`, `Secure`, `SameSite`.
- [ ] No tokens/secrets in `localStorage`/`sessionStorage` or the JS bundle.
- [ ] Only `NEXT_PUBLIC_*`-style public values reach the client; secrets stay server-side.
- [ ] No PII persisted client-side beyond what's necessary.
