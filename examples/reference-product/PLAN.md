---
# MACHINE-OWNED FRONTMATTER — the delivery backlog `/plan-delivery` writes and `/ship` advances.
# Committed: this is the delivery record and the token cost ledger, a sibling of PRD.md.
# `bun test` (test/delivery-plan.test.ts) parses and verifies this file, so it can't drift silent.
product: "Repair Tracker"

# The PRD goals (PRD.md §3) every increment must trace back to. `id` is the traceability anchor.
prd_goals:
  - id: G1
    summary: "Nothing falls through the cracks."
  - id: G2
    summary: "A single answer to 'what is outstanding?'"

# The ordered, shippable backlog. status ∈ todo | in-progress | shipped. At most one in-progress.
# effort is human-team → AI-assisted; est_tokens is the estimate, actual_tokens is filled from
# run.json once the increment ships (estimated-vs-actual is how the estimates calibrate over time).
increments:
  - id: INC-1
    title: "Core repair tracking — log, assign, status transitions, filtered list"
    order: 1
    status: shipped
    goals: [G1, G2]
    effort: "~1 week → ~30 min"
    est_tokens: 4000000
    actual_tokens: 3620000

  - id: INC-2
    title: "SLA email reminders — flag repairs past their priority SLA"
    order: 2
    status: in-progress
    goals: [G1]
    effort: "~2 days → ~2 hrs"
    est_tokens: 2500000

  - id: INC-3
    title: "Contractor mobile app — view assigned jobs, update status offline"
    order: 3
    status: todo
    goals: [G1]
    effort: "~1 week → ~4 hrs"
    est_tokens: 6000000

updated: "2026-08-12"
---

# Repair Tracker — Delivery Plan

The ordered backlog that turns the [PRD](PRD.md) into shippable increments. The frontmatter above
is the machine source of truth; this prose is the human-readable narrative. `/plan-delivery` owns
this file; `/ship` flips exactly one increment to `shipped` per loop and records its actual token
consumption from `run.json`.

## How to read this plan

- **Every increment traces to a PRD goal** (`goals:` cites goal ids from §3). An increment that
  serves no goal is scope creep — the verifier fails it.
- **One increment is active at a time** (`in-progress`). The rest are `todo` (not started) or
  `shipped` (delivered). `/ship` binds the single active increment, or the lowest-order `todo`.
- **PLAN.md doubles as a cost ledger.** `est_tokens` is the estimate at planning time;
  `actual_tokens` is the measured spend once shipped. The gap is the signal that recalibrates the
  next increment's estimate.

## Increments

1. **INC-1 — Core repair tracking** *(shipped)* — log a repair, assign it to a contractor, move it
   through its status lifecycle, and see a filtered list of what's outstanding. This is the V1 that
   answers both PRD goals directly.
2. **INC-2 — SLA email reminders** *(in-progress)* — a scheduled worker that flags repairs past
   their priority SLA, so nothing quietly ages out of sight (G1).
3. **INC-3 — Contractor mobile app** *(todo)* — an offline-capable app for contractors to view
   assigned jobs and update status from the field, keeping the outstanding list current (G1).

## Sign-off

The PLAN → BUILD boundary is a hard gate: the first build run stays blocked until the delivery plan
is approved. Re-opening a `shipped` increment for more work is allowed only with an explicit
`reopened: true` flag, which records the deliberate backward move.
