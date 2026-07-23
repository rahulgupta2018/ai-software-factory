# Transactions & Atomicity

**Impact: HIGH** | **Category: correctness** | **Tags:** transactions, atomicity, consistency

Multi-step writes that must all succeed or all fail need a transaction; otherwise a mid-way failure
leaves inconsistent data.

## ❌ Incorrect
```python
debit(from_acct, amt)      # if the next line fails, money vanishes
credit(to_acct, amt)
```

## ✅ Correct
```python
with db.transaction():
    debit(from_acct, amt)
    credit(to_acct, amt)   # both commit or both roll back
```

## Checklist
- [ ] Related writes wrapped in a transaction; roll back on error.
- [ ] External side effects (emails, payments) are outside/after commit or use outbox.
- [ ] Partial-failure paths leave data consistent.
- [ ] Long transactions avoided on hot tables.
