---
name: health
description: >-
  Run the project's own quality gates and report a pass/fail dashboard — tests, linter, and
  type checker per component, straight from stack.yaml, with no code changes. Activates on "is
  the build healthy", "run the checks", "health check", or a pre-ship / pre-merge readiness
  sweep; owns the read-only quality snapshot. Does not fix failures (that's the build loop) or
  land anything (that's /ship).
license: MIT
metadata:
  author: AI Software Factory
  version: 0.1.0
  last_updated: 2026-07-22
  layer: Ops
  priority: V1
---

# Health

<!-- FACTORY:ETHOS (generated — do not edit) -->
> **Factory ethos.** Every action inherits these principles:
>
> - Boil the ocean
> - Search before building
> - User sovereignty
> - One owner per file
> - Mechanism vs parameters
> - Ground your claims
> - Defensibility is the product

<!-- FACTORY:WRITING-STYLE (generated — do not edit) -->
### Writing style

- Gloss jargon on first use. Short sentences. Lead with user impact.
- Frame questions in outcome terms ("what breaks for your users if…"), not implementation terms.
- Be direct about quality and trade-offs. Cite sources for factual claims.

<!-- FACTORY:CONFIG-PROTOCOL (generated — do not edit) -->
### Config protocol

A product is defined by two files, split by who writes them:

| File | Owner | Holds |
|---|---|---|
| `PRD.md` | **human** | frontmatter: `product`, `domain`, `meta` · body: the requirements |
| `.factory/stack.yaml` | **`/plan-arch`** | `tech_stack`, `commands`, `skills`, `guardrails`, `escalation_policy`, `tech_bindings` |

Before doing anything else:

1. **Read** both — or the merged `.factory/context.gen.yaml` if it is current. Skills bind via `${ctx.*}`.
2. If a value you need is **missing**, ask the user with AskUserQuestion — never guess.
3. **Persist** the answer to the file that *owns* that key, then re-run `fac sync-context`.
   Never write a machine key into `PRD.md`; `sync-context` rejects it.
4. When a key is absent and the user cannot supply it, fall back to your documented generic default.

Precedence: per-skill `overrides` → merged product context → skill generic default.

## Overview

`/health` runs the checks the project already defines — the `test`, `lint`, and `typecheck`
commands under each component in `stack.yaml` — and reports one dashboard: what passed, what failed,
and where. It reads the commands from the merged context (`${ctx.commands}`), so it never guesses a
framework's invocation; the project owns its gates and `/health` just runs them.

It is **report-only**. A red gate here is a signal, not a task — fixing it belongs to the build loop
or `/investigate`. The value is a fast, honest readiness snapshot before you invest in a review or a
ship: green means the quality floor holds; red tells you exactly which floor gave way.

## When to Activate

Activate when:
- The user asks "is the build healthy", "run the checks", or "health check".
- Before `/review` or `/ship`, to confirm the quality floor before deeper work.
- After a merge or dependency bump, to catch a regression early.

**Do not activate** (adjacent skills own this):
- The build loop / `/investigate` — *fix* failing gates; `/health` only reports them.
- `ship` — runs its own release-gate and lands the change; `/health` is a standalone read-only sweep.
- `benchmark` — measures *performance* against a baseline; `/health` measures *correctness* gates
  (pass/fail), not timing.

## Core Concepts

- **The project owns its gates.** Commands come from `stack.yaml` (`${ctx.commands}`), never hardcoded.
- **Report-only.** `/health` runs and reports; it changes no code and lands nothing.
- **Per-component granularity.** Each component's `test` / `lint` / `typecheck` is run and scored
  independently, so the dashboard points at the exact failure.
- **Honest exit.** A missing command is reported as "not configured", not silently passed.

## Workflow

Freedom level: **low** — run the configured gates, tabulate, report.

1. **Resolve the gates.** Read `${ctx.commands}` per component from the merged context. If a
   component defines no `test`/`lint`/`typecheck`, mark it "not configured" (don't invent one).
2. **Run each gate** in the component's working directory, capturing pass/fail and the tail of any
   failure output. Continue on failure — collect *all* results, don't stop at the first red.
3. **Tabulate** a dashboard: component × gate → ✅ / ❌ / — (not configured), with a one-line failure
   summary per red cell.
4. **Record the dashboard** as a run artifact:
   ```bash
   fac run artifact --step health --body-file health-report.md
   ```
5. **Report and hand off.** Green → clear to `/review` or `/ship`. Red → point at the failing gate
   and hand to `/investigate` or the build loop. Do not fix here.

## Examples

**Example:**
```
Input:  "Health check before I ship."
Steps:  Read stack.yaml → api: {test, typecheck}, web: {test, lint, typecheck}.
        Run all five gates; api typecheck fails (2 errors in handlers.ts), rest green.
Output: dashboard —
          api  test ✅  lint —  typecheck ❌ (2 errors, handlers.ts)
          web  test ✅  lint ✅ typecheck ✅
        NN-health.md recorded. Verdict: not ship-ready.
Handoff → /investigate on api typecheck; re-run /health; then /ship.
```

## Guidelines

1. Run every configured gate; never stop at the first failure — the full picture is the point.
2. Read commands from `stack.yaml`; if one is missing, report "not configured" and, if useful, offer
   to add it (persisted to the file that owns it).
3. Keep it read-only — no fixes, no commits, no re-formatting.
4. Capture enough failure output to route the fix, not the whole log.
5. Give a single clear verdict: ship-ready or not, and why.

## Gotchas

1. **Missing command ≠ pass.** A component with no `typecheck` is "not configured", not green.
   Report it honestly.
2. **Wrong working directory.** Run each gate where the component lives; a monorepo package can pass
   from its own dir and fail from the root.
3. **Fixing in place.** `/health` reports; the moment you start editing to make it green, you've left
   this skill — hand to the build loop.
4. **Slow gates block the sweep.** A full E2E suite may not belong in a fast health check; prefer the
   configured fast gates and note what was skipped.

## Integration

- `stack.yaml` (`${ctx.commands}`) — the source of the gates `/health` runs.
- `investigate` / build loop — the fixers `/health` hands red gates to.
- `review`, `ship` — downstream; `/health` is the readiness check before them.
- Run harness (`fac run`) — records the dashboard as `NN-health.md`.

## References

- Config: `stack.yaml` → `commands.<component>.{test,lint,typecheck}`
- Related skills: `investigate`, `review`, `ship`, `benchmark`
- Libraries: `lib/context.ts`, `lib/run.ts`