# Identification & Authentication Failures

**Impact: CRITICAL** | **Category: security** | **OWASP: A07** | **Tags:** auth, session, mfa, brute-force

Weak login, session, or credential handling lets attackers become other users. Use vetted auth,
protect sessions, and resist brute force.

## ❌ Incorrect
```python
if user.password == request.password:          # plaintext compare, no lockout
    session["user"] = user.id                  # predictable/persistent session, no expiry
```

## ✅ Correct
```python
if bcrypt.checkpw(request.password, user.pw_hash) and not rate_limited(user):
    issue_session(user, ttl=SESSION_TTL, rotate=True)   # rotate on login, expire, secure cookie
```

## Checklist
- [ ] Passwords verified against a strong hash; constant-time compare.
- [ ] Rate limiting / lockout / backoff on login and reset.
- [ ] Sessions: random IDs, rotated on login, idle + absolute expiry, secure cookies.
- [ ] MFA available for privileged access; no default credentials.
- [ ] Generic auth error messages (don't reveal which of username/password was wrong).
