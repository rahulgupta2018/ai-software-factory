# Cryptographic Failures & Secrets Management

**Impact: CRITICAL** | **Category: security** | **OWASP: A02** | **Tags:** crypto, secrets, tls, hashing

Protect data in transit and at rest, and never hardcode secrets. Use vetted algorithms and a
secrets manager — not source code, env files in the repo, or client bundles.

## Why this matters
Hardcoded credentials leak via git history and logs; weak hashing lets stolen password databases
be cracked; missing TLS exposes data on the wire.

## ❌ Incorrect
```python
NEO4J_PASSWORD = "prod-password-123"          # hardcoded secret
hashed = md5(password)                         # broken hash for passwords
```

## ✅ Correct
```python
NEO4J_PASSWORD = os.environ["NEO4J_PASSWORD"]  # injected from a secrets manager
hashed = bcrypt.hashpw(password, bcrypt.gensalt())   # or argon2id
# TLS enforced for all external calls; data-at-rest encryption on the store.
```

## Checklist
- [ ] No secrets in source, config committed to git, or client bundles (`NEXT_PUBLIC_*` etc.).
- [ ] Secrets come from a manager (e.g. AWS Secrets Manager) and are rotatable.
- [ ] Passwords hashed with bcrypt/scrypt/argon2 (never MD5/SHA-1/plain).
- [ ] TLS for all transport; strong ciphers; no self-rolled crypto.
- [ ] Sensitive data encrypted at rest; keys managed (KMS), not in code.
