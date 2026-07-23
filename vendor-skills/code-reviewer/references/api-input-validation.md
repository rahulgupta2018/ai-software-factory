# API Input Validation & Mass Assignment

**Impact: HIGH** | **Category: api-security** | **OWASP API: A03/A06** | **Tags:** validation, schema, mass-assignment

Parse and validate every request body/param against a schema before use, and never bind raw request
data straight onto a model (mass assignment lets users set fields like `is_admin`).

## ❌ Incorrect
```python
user = User(**request.json)               # mass assignment: client can set role/is_admin
```

## ✅ Correct
```python
data = CreateUser.model_validate(request.json)   # pydantic/zod schema: only allowed fields
user = User(name=data.name, email=data.email)    # explicit, allow-listed fields
```

## Checklist
- [ ] Every input validated against a schema (pydantic/zod) — parse, don't just check.
- [ ] Only allow-listed fields are bound to models (no `**request`).
- [ ] Types/ranges/lengths enforced; request body size limited.
- [ ] Reject unknown fields where appropriate; return structured 400s.
