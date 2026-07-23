# Resource Management & Cleanup

**Impact: MEDIUM** | **Category: reliability** | **Tags:** resources, leaks, context-manager

Files, sockets, DB connections, and locks must be released on every path, including errors.

## ❌ Incorrect
```python
f = open(path); data = f.read()      # leaks the handle if read() raises
```

## ✅ Correct
```python
with open(path) as f:                # released even on exception
    data = f.read()
# Use connection pools; close/await-close clients; release locks in finally.
```

## Checklist
- [ ] Context managers (`with`) / try-finally for files, connections, locks.
- [ ] Connection pooling; no per-request client creation that exhausts pools.
- [ ] Timeouts on network/DB calls; bounded retries.
- [ ] No unbounded in-memory growth (caches have limits/TTLs).
