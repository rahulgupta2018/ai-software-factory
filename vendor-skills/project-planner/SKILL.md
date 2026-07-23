---
name: project-planner
description: >
  Breaks a project into a work breakdown with milestones, dependencies, estimates, risks, and
  resource allocation. Activates when planning a project, building a roadmap or WBS, estimating
  timelines/effort, or mapping dependencies and the critical path. Owns end-to-end delivery
  planning. Does not own within-sprint iteration mechanics or the strategic go/no-go decision.
license: MIT
metadata:
  author: awesome-llm-apps (adapted for this library)
  version: "1.1.0"
  last_updated: 2026-07-02
  category: planning
---

# Project Planner

## Overview

Converts a goal + constraints into an executable plan: define done → deliverables → sized tasks →
dependency/critical-path map → estimates with buffer → risks and resourcing. The value is the
plan structure and estimation discipline, not restating PM theory.

**Freedom level: MEDIUM** — use the template and sizing rules; adapt to the project.

## When to Activate

Activate when:
- Planning a project/roadmap, building a work breakdown, or estimating timelines and effort.
- Mapping dependencies, milestones, or the critical path.

**Do not activate** (adjacent skills own this):
- `sprint-planner` — owns within-iteration story estimation and sprint mechanics.
- `strategy-advisor` — owns whether/what to do (the strategic decision), before planning how.

## Process (condensed)

1. **Define done** — goal, success criteria, constraints (time/budget/resources).
2. **Deliverables & milestones** — major outputs and the checkpoints that mark progress.
3. **Break down** — tasks of ~2–8h (single owner, testable "done"); split anything > ~2 days.
4. **Dependencies** — what's sequential vs parallel; identify the critical path and bottlenecks.
5. **Estimate + buffer** — three-point per task; add 20–30% for unknowns; include review/test time.
6. **Assign & track** — owners, required skills, check-in cadence.

## Task Sizing

Well-sized = 2–8h (clear deliverable, visible daily progress). Too large (>2 days) → split.
Too small (<1h) → combine. T-shirt: XS <2h · S 2–4h · M 4–8h · L 2–3d · XL 1wk (split beyond XL).
Three-point estimate: `Expected = (O + 4M + P) / 6`.

## Output Template

```markdown
## Project: [name]
Goal · Timeline · Team · Constraints

## Milestones
| # | Milestone | Target | Owner | Success criteria |

## Phase N: [name] (dates)
| Task | Effort | Owner | Depends on | Done criteria |

## Dependencies / critical path
[Task A → B → D ;  A → C → D]

## Risks & mitigation
| Risk | Impact | Probability | Mitigation |

## Resource allocation
| Role | Hours/wk | Responsibilities |
```

## Guidelines

1. Every task has a single owner and a testable "done".
2. Mark the critical path explicitly; watch its bottlenecks.
3. Add buffer; never present the optimistic estimate as the plan.
4. Lock scope after discovery; route new asks to a later phase.

## Gotchas

1. **Planning fallacy**: aggregated best-case estimates always run over. Use three-point + buffer,
   and sanity-check against similar past projects.
2. **Buffer-free plans**: zero-slack schedules fail on the first surprise. Reserve 20–30%.
3. **Critical-path blindness**: optimising non-critical tasks doesn't move the finish date — focus
   on the critical chain.
4. **Over-decomposition**: micro-tasks add tracking overhead without insight; combine sub-hour items.
5. **Scope creep**: unmanaged additions blow the timeline; log new requests to a later phase.

## Integration

- `strategy-advisor` — decide direction before planning delivery.
- `sprint-planner` — execute the plan iteration by iteration.
- `risk-assessment`-style thinking — expand the risks table for high-stakes projects.

## References

- Best practices: https://agentskills.io/skill-creation/best-practices
