---
name: code-reviewer
description: >
  Reviews code changes (frontend, backend/API, and agent/workflow code) for security, performance,
  correctness, and maintainability, and returns a prioritised, file/line-referenced report with
  fixes. Activates on a PR/diff, "review this before I merge", a security audit, or when checking
  for injection, auth, OWASP Top 10, N+1, or error-handling issues. Owns code review. Does not own
  writing new code (python-expert / fullstack-developer) or the test-first loop (tdd-red-green-refactor).
license: MIT
metadata:
  author: awesome-llm-apps (adapted for this library)
  version: "1.0.0"
  last_updated: 2026-07-22
  category: coding
---

# Code Reviewer

## Overview

Systematically reviews a change for **Security → Performance → Correctness → Maintainability** (in
that priority order) and produces a report that names each issue's file/line, impact, and concrete
fix. The value is the rule catalogue and the severity discipline, not a re-explanation of the code.

**Freedom level: MEDIUM** — the priority order, severity scale, and output shape are fixed; how
deeply you probe each area is judgement.

**Project overlay.** This is a generic library skill. If the adopting project ships a context file
with extra gates (compliance rules, PII/guardrails, tenant isolation, or a data-store-specific
injection rule such as graph-query parameterisation), enforce those *on top of* this catalogue.
Absent a context file, apply the generic rules only.

## When to Activate

Activate when:
- Reviewing a pull request, diff, or a change before merge/deploy.
- Performing a security audit or checking for OWASP Top 10 / API-security issues.
- Checking a change for performance (N+1), correctness (edge cases, races), or quality.

**Do not activate** (adjacent skills own this):
- `python-expert` / `fullstack-developer` — own *writing/authoring* the code.
- `tdd-red-green-refactor` — owns the failing-test-first workflow.
- `policy-gap-analysis` — owns regulatory *document* review (not source code).

## How to use this skill

Rules live in `references/` (one file per rule, with why / ❌ / ✅ / checklist). The
**`references/REFERENCE.md`** file is the index — start there, then open the specific rule file you
need. Load a rule file on demand rather than all at once.

Review in priority order: **Security → Performance → Correctness → Maintainability**, then Testing.

## Review procedure

1. **Understand the change** — what it does, the entry points, and the trust boundaries it crosses.
2. **Security pass (CRITICAL first)** — walk the OWASP Top 10 + API + frontend security rules; apply
   any project-specific gates the context declares (e.g. PII handling, tenant isolation, secrets).
3. **Performance pass** — N+1, missing indexes, needless calls, hot-path allocation.
4. **Correctness pass** — error handling, edge cases, concurrency/races, transactions.
5. **Maintainability pass** — naming, types, complexity/DRY, docs.
6. **Testing** — coverage of new code, edge and error paths.
7. **Report** — group by area, severity-rank, cite file:line, give a fix per finding, summarise counts.

## Severity scale

| Level | Meaning | Action |
|---|---|---|
| 🔴 CRITICAL | Security hole / data-loss / secret or credential exposure | Block merge; fix now |
| 🟠 HIGH | Correctness bug / perf issue at scale | Fix before merge |
| 🟡 MEDIUM | Maintainability / quality | Fix or accept with TODO |
| ⚪ LOW | Style / minor | Optional |

## Output Template

```markdown
## Security (N)
### 🔴 CRITICAL: <title> — `path/file.ext:line`
Problem: … · Impact: … · Fix: <concrete change + code>

## Performance (N) / ## Correctness (N) / ## Maintainability (N)
…

## Summary
🔴 x · 🟠 x · 🟡 x · ⚪ x — Recommendation: address CRITICAL + HIGH before merge.
```

## Guidelines

1. Every finding cites file:line, states impact, and gives a concrete fix (not "handle better").
2. Security is reviewed first; a CRITICAL blocks merge.
3. Apply any project-declared gates (PII, tenancy, secrets, audit) on top of the generic catalogue.
4. Prefer parameterised queries, output encoding, and validated inputs over ad-hoc sanitisation.

## Gotchas

1. **"Looks fine" for absent checks**: the vulnerability is often what's *missing* (no authz check,
   no validation) — review for omissions, not just bad lines.
2. **Sanitising instead of parameterising**: escaping user input into a query string is fragile;
   use parameterised queries / prepared statements.
3. **Client-side "security"**: validation/authorisation enforced only in the browser is not
   security — it must be enforced server-side too.
4. **Secrets in logs**: a fix that "adds logging" can itself leak credentials or tokens; check what
   gets logged.

## Integration

- `python-expert` / `fullstack-developer` — author the fixes this review recommends.
- `tdd-red-green-refactor` — add regression tests for each fixed bug.

## References

- `references/REFERENCE.md` (this folder) — indexed rule catalogue; load the specific rule file on demand.
- OWASP Top 10: https://owasp.org/www-project-top-ten/ · OWASP API Security Top 10:
  https://owasp.org/www-project-api-security/
- Best practices: https://agentskills.io/skill-creation/best-practices
