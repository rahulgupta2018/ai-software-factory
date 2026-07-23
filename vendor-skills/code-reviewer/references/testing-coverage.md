# Test Coverage of Changes

**Impact: MEDIUM** | **Category: testing** | **Tags:** tests, edge-cases, regression

New/changed behaviour needs tests — especially edge and error paths, and a regression test for each
fixed bug.

## Checklist
- [ ] New logic has unit tests; changed logic has updated tests.
- [ ] Edge cases and error paths are tested, not just the happy path.
- [ ] Each fixed bug gets a regression test that fails before the fix.
- [ ] Security-relevant behaviour (authz, validation) has explicit tests.
- [ ] Tests are deterministic (no reliance on time/order/network without control).
