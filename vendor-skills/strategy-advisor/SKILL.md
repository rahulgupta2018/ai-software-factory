---
name: strategy-advisor
description: >
  Structures high-stakes strategic and business decisions — framing the question, generating
  genuine options, weighing trade-offs against explicit criteria, and recommending a path with
  metrics and contingencies. Activates when evaluating strategic options, setting direction, doing
  competitive/market analysis, or making a high-impact call. Owns decision framing and option
  analysis. Does not own delivery planning, sprint mechanics, or factual verification.
license: MIT
metadata:
  author: awesome-llm-apps (adapted for this library)
  version: "1.1.0"
  last_updated: 2026-07-02
  category: planning
---

# Strategy Advisor

## Overview

Turns an ambiguous strategic question into a structured decision: situation → real options →
criteria-based trade-offs → a reasoned recommendation with success metrics and contingencies. The
value is disciplined option generation and honest trade-off analysis, not a confident verdict.

**Freedom level: HIGH** — judgement-driven; the output structure is the main constraint.

## When to Activate

Activate when:
- Evaluating strategic options or setting organisational/product direction.
- Doing competitive/market analysis or making a high-impact, hard-to-reverse call.

**Do not activate** (adjacent skills own this):
- `project-planner` — owns turning a chosen direction into a delivery plan.
- `sprint-planner` — owns near-term iteration/backlog mechanics.
- `fact-checker` — owns verifying the facts the strategy rests on.

## Method

1. **Frame** — state the actual decision, the objective, and the constraints.
2. **Situation** — current state, stakeholders, market/competitive dynamics, resources.
3. **Generate options** — at least 2–3 genuinely distinct paths (include an unconventional one and
   the "do nothing" baseline). Avoid strawman alternatives.
4. **Weigh** — against explicit criteria: strategic fit, financial impact, resource cost, risk,
   time horizon. Make assumptions visible.
5. **Recommend** — a preferred path with rationale, implementation outline, success metrics, and
   contingencies. Present the strongest case *against* your recommendation too.

## Output Template

```markdown
## Decision
[what must be decided]

## Situation
- Current state / Objective / Constraints

## Options
### Option A — [name]
Pros / Cons / Risk (H·M·L) / Key assumption

## Recommendation
[preferred path + why] — and the strongest counter-argument

## Metrics & contingencies
[how we'll know it worked; what we do if it doesn't]
```

## Guidelines

1. Always surface the assumptions a recommendation depends on.
2. Give at least one real alternative and the do-nothing baseline.
3. Separate facts (verify via `fact-checker`) from judgement.
4. State confidence honestly; avoid false precision in numbers.

## Gotchas

1. **Confident single answer**: presenting one option as obvious hides the trade-off. Always show
   the alternatives and what would change the recommendation.
2. **Unstated assumptions**: a recommendation that quietly assumes growth/budget/timeline breaks
   when those shift. Name them.
3. **Sunk-cost framing**: past spend is not a reason to continue; evaluate forward value.
4. **Base-rate neglect**: "this time is different" usually isn't — anchor on how similar bets fare.

## Integration

- `fact-checker` — verify the evidence the strategy relies on.
- `project-planner` — convert the chosen direction into a delivery plan.
- `strategy-advisor` hands off to `sprint-planner` once work is scoped.

## References

- Best practices: https://agentskills.io/skill-creation/best-practices
