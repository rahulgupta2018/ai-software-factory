# API Error Handling & Information Exposure

**Impact: MEDIUM** | **Category: api-security** | **Tags:** errors, leakage, responses

Error responses must not leak stack traces, SQL, internal paths, or PII, and should be consistent
so clients can handle them.

## ❌ Incorrect
```python
except Exception as e:
    return {"error": str(e), "trace": traceback.format_exc()}, 500   # leaks internals
```

## ✅ Correct
```python
except KnownError as e:
    return {"error": e.code, "message": e.public_message}, e.status
except Exception:
    log.exception("unhandled")            # detail to logs (no PII)
    return {"error": "internal_error"}, 500   # generic to client
```

## Checklist
- [ ] No stack traces, SQL/Cypher, or internal paths in responses.
- [ ] Consistent error shape + correct status codes.
- [ ] Detailed diagnostics go to logs (PII-safe), not the client.
- [ ] 404 vs 403 chosen to avoid leaking existence of protected objects.
