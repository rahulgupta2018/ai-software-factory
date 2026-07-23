---
name: spec
description: >-
  Turns vague intent into a precise, executable spec — problem, scope, acceptance criteria,
  edge cases, and a task breakdown — so the build loop has an unambiguous target. Activates
  when a request is real but under-specified ("build X", "add Y") and needs sharpening before
  code. Composes project-planner for the breakdown; owns turning intent into a buildable
  contract, not the product vision (that's /discover) or the tech stack (that's /plan-arch).
license: MIT
metadata:
  author: AI Software Factory
  version: 0.1.0
  last_updated: 2026-07-22
  layer: Plan
  priority: V1
---

# Spec

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

`/spec` turns a vague-but-real request into an **executable spec**: a crisp problem statement,
explicit scope (in and out), acceptance criteria phrased as testable behaviours, the edge cases
that matter, and a task breakdown the build loop can pick up. It records the spec as a run
artifact so "what we agreed to build" is unambiguous and durable.

It is a thin wrapper that composes `project-planner` for the work breakdown and adds the Factory
discipline: acceptance criteria that map 1:1 to tests, an explicit non-goals list, and a handoff
that the Implementer and `tdd-red-green-refactor` can consume directly.

## When to Activate

Activate when:
- A request is genuine but under-specified — "build the repairs export", "add reminders" — and
  jumping to code would mean guessing.
- The user asks to "spec this out", "write acceptance criteria", or "break this into tasks".

**Do not activate** (adjacent skills own this):
- `discover` — owns the product vision and the human half of `PRD.md` (problem, users, V1).
  `/spec` sharpens *one buildable slice*, it doesn't set direction.
- `plan-arch` — owns the tech stack and architecture. `/spec` says *what* to build and how to
  verify it, not *which stack*.
- `project-planner` (craft) — supplies the breakdown mechanics; `/spec` frames the contract and
  the acceptance criteria around it.
- The build loop — *implements* the spec; `/spec` writes it.

## Core Concepts

- **The spec is the artifact.** Problem, scope, acceptance criteria, edge cases, and tasks are
  recorded as a run artifact (`NN-spec.md`), input-hashed so a changed request re-runs the spec.
- **Acceptance criteria are testable behaviours.** Each criterion reads as a concrete
  observable ("given X, when Y, then Z"), so it maps 1:1 to a test the build loop writes.
- **Scope is a boundary, both sides.** An explicit non-goals / out-of-scope list is as important
  as the in-scope list — it's what stops scope creep mid-build.
- **Edge cases up front.** Empty states, limits, permissions, failures, and concurrency named now
  are tests later; discovered in prod they're incidents.
- **Right-sized.** A spec is one buildable slice, not a roadmap. If it needs sub-projects, that's
  `project-planner` territory; keep the slice shippable.

## Workflow

Freedom level: **medium** — sharpen the intent; the shape (criteria + scope + tasks) is fixed.

1. **Restate the intent.** Write the problem in one or two sentences — what the user actually needs
   and why. Confirm it against `PRD.md` if one exists.
2. **Fix the scope.** List what's in and, explicitly, what's out. Ambiguities become an
   AskUserQuestion, not an assumption.
3. **Write acceptance criteria** as testable behaviours (given/when/then). Every criterion is
   something the build loop can assert.
4. **Enumerate edge cases** — empty/limit/permission/failure/concurrency — and decide each: handle,
   defer (with a note), or out-of-scope.
5. **Break down the work** (`project-planner`) into ordered, independently landable tasks with
   dependencies flagged.
6. **Write the spec as a run artifact.** Under an active run:
   ```bash
   fac run artifact --step spec --inputs <request-or-PRD.md> --body-file spec.md
   ```
7. **Hand off.** The Implementer builds the tasks; `tdd-red-green-refactor` turns each acceptance
   criterion into a failing test first.

## Practical Guidance

- If you can't write a test for a criterion, it isn't a criterion yet — sharpen it.
- Prefer fewer, sharper criteria over a long fuzzy list.
- Name the non-goals explicitly; "we are NOT doing X in this slice" prevents the mid-build detour.
- Flag task dependencies so the build order is obvious.
- Keep the slice shippable on its own; if it can't ship without three other things, re-scope.

## Examples

**Example:**
```
Input:  "Add a way to export repairs." (under-specified)
Spec:   problem: managers need repair records for reporting.
        in-scope: CSV export of filtered repair list. out-of-scope: PDF, scheduling, email.
        acceptance: given a filtered list, when I export, then I get a CSV of exactly those
        rows with columns [id,status,assignee,opened,closed]; empty list → header-only file;
        >10k rows → streamed, not buffered.
        edge cases: no permission → 403; export while a filter changes → snapshot at click.
        tasks: 1) export endpoint (streamed) 2) button + filter wiring 3) tests.
Output: run artifact NN-spec.md. Handoff → Implementer + tdd (each criterion → a test).
```

## Guidelines

1. Every acceptance criterion is a testable behaviour that maps 1:1 to a test.
2. Scope has two sides — always write the explicit non-goals list.
3. Enumerate edge cases now; decide handle/defer/out-of-scope for each.
4. Resolve ambiguity with AskUserQuestion, never with a silent assumption.
5. Keep the slice shippable; break down with `project-planner`, don't balloon into a roadmap.
6. Record the spec as a run artifact so the agreed contract is durable.

## Gotchas

1. **Criteria you can't test**: "works well" isn't acceptance; rewrite as given/when/then.
2. **No non-goals**: without an out-of-scope list the build quietly expands.
3. **Skipping edge cases**: empty/limit/permission/failure found in prod are incidents.
4. **Speccing the stack**: which framework/db is `/plan-arch`'s call, not the spec's.
5. **Roadmap-sized spec**: if it can't ship as one slice, re-scope before handoff.

## Integration

- `discover` — owns the PRD/vision; `/spec` sharpens one buildable slice of it.
- `plan-arch` — owns the stack; `/spec` defines behaviour and verification, not the stack.
- `project-planner` (craft) — supplies the task breakdown mechanics.
- `tdd-red-green-refactor` — turns each acceptance criterion into a failing test.
- Run harness (`fac run`) — records the spec as `NN-spec.md`; a changed request re-runs it.

## References

- Breakdown craft: vendored `project-planner`
- Run harness: `fac run`
- Related skills: `discover`, `plan-arch`, `tdd-red-green-refactor`, `review`
