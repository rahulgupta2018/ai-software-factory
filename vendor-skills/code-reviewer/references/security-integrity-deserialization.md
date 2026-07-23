# Software & Data Integrity Failures (incl. Insecure Deserialization)

**Impact: HIGH** | **Category: security** | **OWASP: A08** | **Tags:** deserialization, integrity, supply-chain

Deserializing untrusted data or trusting unverified code/updates can lead to RCE or tampering.

## ❌ Incorrect
```python
obj = pickle.loads(request.body)          # arbitrary code execution on untrusted input
yaml.load(user_input)                      # unsafe loader
```

## ✅ Correct
```python
obj = json.loads(request.body)             # data-only format for untrusted input
yaml.safe_load(user_input)                 # safe loader
# Verify integrity (signatures/checksums) of downloaded artifacts and updates.
```

## Checklist
- [ ] No `pickle`/unsafe deserializers on untrusted input; use JSON or schema-validated formats.
- [ ] `yaml.safe_load`, not `yaml.load`.
- [ ] CI/CD artifacts and third-party updates verified (signatures/checksums).
- [ ] Serialized objects from clients are validated against a schema.
