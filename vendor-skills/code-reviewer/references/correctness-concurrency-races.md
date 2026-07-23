# Concurrency & Race Conditions

**Impact: HIGH** | **Category: correctness** | **Tags:** concurrency, races, locking, atomic

Check-then-act on shared state without atomicity causes lost updates, double-spends, and duplicate
side effects under concurrency.

## ❌ Incorrect
```python
seats = get_available(event)
if seats > 0:
    book_seat(event)               # two requests both pass the check → oversell
```

## ✅ Correct
```python
# Atomic conditional update (DB-enforced), or a lock/transaction:
rows = db.execute(
  "UPDATE events SET seats = seats - 1 WHERE id = ? AND seats > 0", (event,))
if rows.rowcount == 0: raise SoldOut()
```

## Checklist
- [ ] No unguarded check-then-act on shared/persistent state.
- [ ] Atomic DB operations, optimistic locking, or transactions for invariants.
- [ ] Idempotency keys for operations that may be retried.
- [ ] Shared mutable state protected; async code avoids blocking calls.
