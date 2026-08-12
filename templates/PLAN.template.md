---
# ─────────────────────────────────────────────────────────────────────────────
# The delivery backlog. /plan-delivery drafts this; humans approve it; /ship advances it.
#
# The frontmatter below is the MACHINE SOURCE OF TRUTH — the verifier (lib/delivery-plan.ts)
# reads it. The prose body is the human narrative. Committed: this is the delivery record and
# the token cost ledger, a sibling of PRD.md.
#
# Rules the verifier enforces:
#   - every increment traces to a PRD goal (goals: cites ids from PRD.md §3)
#   - status ∈ todo | in-progress | shipped; at most one increment is in-progress
#   - ids and order are unique; order defines the delivery sequence
#   - status only moves forward (todo → in-progress → shipped) unless reopened: true
# ─────────────────────────────────────────────────────────────────────────────
product: ""                    # must match PRD.md product.name

# The PRD goals (PRD.md §3) every increment must trace back to.
prd_goals:
  - id: G1
    summary: ""
  # - id: G2
  #   summary: ""

# The ordered, shippable backlog. effort is human-team → AI-assisted; est_tokens is the estimate;
# actual_tokens is filled from run.json once the increment ships (estimated-vs-actual calibrates
# the next estimate).
increments:
  - id: INC-1
    title: ""
    order: 1
    status: todo               # todo | in-progress | shipped
    goals: [G1]                # ids from prd_goals above
    effort: ""                 # e.g. "~1 week → ~30 min"
    est_tokens: 0
    # actual_tokens: 0         # filled by /ship from run.json once shipped
  # - id: INC-2
  #   title: ""
  #   order: 2
  #   status: todo
  #   goals: [G1]
  #   effort: ""
  #   est_tokens: 0

updated: ""
---

# <Product name> — Delivery Plan

> The ordered backlog that turns the [PRD](PRD.md) into shippable increments. `/plan-delivery` owns
> this file; `/ship` flips exactly one increment to `shipped` per loop and records its actual token
> consumption. The frontmatter above is the machine source of truth — never paste increments into
> the prose below expecting the verifier to read them.

## How to read this plan

- **Every increment traces to a PRD goal.** An increment that serves no goal is scope creep.
- **One increment is active at a time** (`in-progress`); the rest are `todo` or `shipped`.
- **PLAN.md doubles as a cost ledger** — `est_tokens` vs `actual_tokens` calibrates future estimates.

## Increments
Narrate each increment: what ships, which PRD goal it serves, and any sequencing dependency.

## Sign-off
The PLAN → BUILD boundary is a hard gate — the first build run stays blocked until this plan is
approved. Re-opening a `shipped` increment requires an explicit `reopened: true` flag.
