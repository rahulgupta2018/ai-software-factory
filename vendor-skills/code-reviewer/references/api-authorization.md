# API Authorization (BOLA / BFLA)

**Impact: CRITICAL** | **Category: api-security** | **OWASP API: A01/A05** | **Tags:** api, authz, bola, bfla

APIs must check both *object-level* (can this user touch this object?) and *function-level* (can
this user call this operation?) authorization on the server, per request.

## ❌ Incorrect
```python
@router.delete("/api/tenants/{tid}/users/{uid}")
def delete_user(tid, uid, user=Depends(current_user)):
    db.delete_user(uid)                    # no check that user may act in tid or is an admin
```

## ✅ Correct
```python
def delete_user(tid, uid, user=Depends(current_user)):
    require_role(user, "admin", tenant=tid)          # function-level
    target = db.get_user(uid)
    if target.tenant_id != tid: raise HTTPException(404)   # object-level + tenant scope
    db.delete_user(uid)
```

## Checklist
- [ ] Object-level checks: the object belongs to the caller's tenant/scope.
- [ ] Function-level checks: the caller's role permits the operation.
- [ ] Admin/privileged routes are not reachable by regular roles.
- [ ] Checks run server-side on every request (no reliance on hidden UI).
