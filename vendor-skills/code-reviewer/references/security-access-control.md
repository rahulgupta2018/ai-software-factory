# Broken Access Control (incl. IDOR / BOLA)

**Impact: CRITICAL** | **Category: security** | **OWASP: A01** | **Tags:** authorization, idor, bola, access

Enforce authorization on the **server** for every action and every object. The most common flaw is
letting an authenticated user act on objects they don't own (IDOR / Broken Object Level
Authorization) because the handler trusts an ID from the request.

## Why this matters
A user changes `/api/orders/123` to `/api/orders/124` and reads someone else's data. In a
multi-tenant product this is also a tenant-isolation breach (see `../rules/` project rules).

## ❌ Incorrect
```python
@app.get("/api/orders/{order_id}")
def get_order(order_id: int, user=Depends(current_user)):
    return db.orders.get(order_id)          # no ownership/tenant check
```

## ✅ Correct
```python
@app.get("/api/orders/{order_id}")
def get_order(order_id: int, user=Depends(current_user)):
    order = db.orders.get(order_id)
    if order is None or order.tenant_id != user.tenant_id or order.owner_id != user.id:
        raise HTTPException(404)             # 404 (not 403) to avoid leaking existence
    return order
```

## Checklist
- [ ] Every endpoint checks authentication AND authorization (role + object ownership).
- [ ] Object access is scoped by tenant/owner, not just by ID from the request.
- [ ] Deny by default; missing check = no access.
- [ ] Return 404 (not 403) for objects the user may not even know exist.
- [ ] No authorization decisions made only on the client.
