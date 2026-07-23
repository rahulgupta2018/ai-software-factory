# Complexity, DRY & Single Responsibility

**Impact: MEDIUM** | **Category: maintainability** | **Tags:** complexity, dry, srp, readability

Overlong functions, deep nesting, and duplicated logic are defect magnets. Prefer small,
single-purpose units and extract shared logic once.

## Checklist
- [ ] Functions do one thing; excessive length/nesting is refactored (guard clauses).
- [ ] Duplicated logic is extracted (but avoid premature abstraction).
- [ ] Cyclomatic complexity is reasonable; early returns over deep `if` pyramids.
- [ ] Public functions are documented; non-obvious logic has a why-comment.
- [ ] Dead code and commented-out blocks removed.
