---
name: python-expert
description: >
  Writes, reviews, and optimises production Python with correct typing, error handling, and
  idiomatic structure. Activates when writing or refactoring Python, reviewing Python for
  quality/performance/security, adding type hints, or debugging Python-specific behaviour.
  Owns Python code quality. Does not own web/full-stack architecture, test-first workflow, or
  language-agnostic service contracts.
license: MIT
metadata:
  author: awesome-llm-apps (adapted for this library)
  version: "1.1.0"
  last_updated: 2026-07-02
  category: coding
---

# Python Expert

## Overview

Produces clean, correctly-typed, idiomatic Python and reviews existing Python against a fixed
priority order: **Correctness → Type safety → Performance → Style**. Focuses on the mistakes a
model makes without guidance (the gotchas), not on re-explaining the language.

**Freedom level: MEDIUM** — the priority order and output shape are fixed; approach varies.

**Project binding (optional).** If `.agents/project-context.yaml` defines coding conventions or
`${ctx.tech_bindings}` (e.g. Python version, framework), follow them; otherwise use modern
defaults (Python 3.11+, PEP 8, `typing`).

## When to Activate

Activate when:
- Writing or refactoring Python (scripts, functions, classes, modules).
- Reviewing Python for correctness, performance, security, or style.
- Adding type hints or debugging Python-specific behaviour.

**Do not activate** (adjacent skills own this):
- `fullstack-developer` — owns web/React/Node/API + DB architecture.
- `tdd-red-green-refactor` — owns the test-first workflow (write failing test first).
- `typed-service-contracts` — owns the language-agnostic spec/handler + Result pattern.

## Working Order

1. **Correctness first** — cover edge/boundary cases; specific exceptions (never bare
   `except:`); no reliance on undefined behaviour.
2. **Type safety** — full signatures + return types; `typing`/generics where they add safety.
3. **Performance** — comprehensions/generators for streams; standard-library builtins; profile
   before micro-optimising.
4. **Style** — PEP 8, meaningful names, Google/NumPy docstrings; comments only for non-obvious logic.

Detailed rule catalogue with examples: load **`references/python-guidelines.md`** in this skill folder when you need
the full rule list or are doing a thorough review.

## Output Template (for new functions)

```python
from collections import Counter
from typing import TypeVar

T = TypeVar("T")

def find_duplicates(items: list[T]) -> list[T]:
    """Return items appearing more than once, in first-seen order.

    Args:
        items: items to scan.
    Returns:
        Duplicated items.
    Example:
        >>> find_duplicates([1, 2, 2, 3, 3, 3])
        [2, 3]
    """
    counts = Counter(items)
    return [item for item, n in counts.items() if n > 1]
```

## Review Checklist

- [ ] Correctness / edge cases  - [ ] Complete, accurate type hints  - [ ] Specific exceptions, useful messages
- [ ] No obvious perf traps (N², needless copies)  - [ ] PEP 8 + docstrings  - [ ] Input validation / injection safety  - [ ] Test coverage of boundaries

## Guidelines

1. Prefer standard library and builtins before third-party or hand-rolled code.
2. Type every public signature; return types included.
3. Raise specific exceptions with actionable messages; never swallow errors silently.
4. Provide a runnable example or doctest for non-trivial functions.

## Gotchas

1. **Mutable default arguments**: `def f(x, acc=[])` shares one list across calls. Use
   `acc=None` then `acc = acc or []`.
2. **Late-binding closures in loops**: `[lambda: i for i in range(3)]` all return 2. Bind with
   a default arg: `lambda i=i: i`.
3. **`is` vs `==`**: `is` compares identity, not value. Use `==` for equality; `is` only for
   `None`/singletons.
4. **Bare `except`**: hides `KeyboardInterrupt`/`SystemExit` and real bugs. Catch specific types.
5. **Mutable class attributes**: a list/dict at class scope is shared by all instances; set
   instance state in `__init__`.

## Integration

- `tdd-red-green-refactor` — write the failing test first, then implement here.
- `typed-service-contracts` — for strict input parsing + Result-typed errors at boundaries.
- `fullstack-developer` — when the Python is a backend service in a web stack.

## References

- `references/python-guidelines.md` (this folder) — full rule catalogue with examples; load for thorough reviews.
- Best practices: https://agentskills.io/skill-creation/best-practices
