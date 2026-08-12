---
name: sprint-planner
description: >
  Plans an agile sprint — sets a sprint goal, estimates stories in points, computes capacity from
  velocity and focus factor, and commits a realistic backlog with a Definition of Done. Activates
  when planning a sprint/iteration, estimating stories, or setting sprint capacity in Scrum/agile.
  Owns within-iteration planning. Does not own full project roadmaps or the strategic decision.
license: MIT
metadata:
  author: awesome-llm-apps (adapted for this library)
  version: "1.1.0"
  last_updated: 2026-07-02
  category: planning
---

# Sprint Planner

## Overview

Turns a prioritised backlog into a committed sprint: a single clear goal, point-estimated
stories, and a commitment sized to *demonstrated velocity* (not hope). The value is realistic
commitment and a crisp Definition of Done.

**Freedom level: MEDIUM** — the capacity math and template are fixed; content varies.

## When to Activate

Activate when:
- Planning a sprint/iteration, estimating stories, or setting sprint capacity.
- Defining a sprint goal or grooming the sprint backlog.

**Do not activate** (adjacent skills own this):
- `project-planner` — owns multi-sprint roadmaps, milestones, and critical path.
- `strategy-advisor` — owns what to build and why, before iteration planning.

## Capacity Math

- **Story points**: modified Fibonacci 1, 2, 3, 5, 8, 13, 20.
- **Capacity** ≈ team × working days × hours × focus factor (0.6–0.8, never 1.0).
- **Velocity**: average points *completed* over the last 3–5 sprints — commit to that, not capacity.

## Output Template

```markdown
## Sprint N: [name]
Sprint goal · Duration · Capacity (pts) · Committed (pts)

## Sprint backlog
| Story | Points | Owner | Dependencies |

## Risks & mitigation
[issues + handling]

## Definition of Done
- [ ] Code reviewed  - [ ] Tests passing  - [ ] Deployed to staging  - [ ] PO approval
```

## Guidelines

1. One coherent sprint goal; drop stories that don't serve it.
2. Commit to velocity, not raw capacity; leave slack for the unplanned.
3. Estimate relatively (points), not in hours; re-estimate split stories.
4. Every committed story has a clear owner and meets the Definition of Done.

## Gotchas

1. **Committing to capacity, not velocity**: ignores meetings, support, and reality — teams
   over-commit and carry over every sprint. Anchor on completed velocity.
2. **Focus factor of 1.0**: assuming 100% productive time guarantees a miss; use 0.6–0.8.
3. **Estimating in hours**: hours invite false precision and anchoring; use relative points.
4. **Goal-less sprint**: a backlog with no unifying goal fragments effort and can't be judged
   succeeded/failed.
5. **Silent carry-over**: rolling unfinished work forward without re-estimating hides scope drift.

## Integration

- `project-planner` — the roadmap this sprint executes a slice of.
- `strategy-advisor` — the direction the sprint goal should serve.

## References

- Best practices: https://agentskills.io/skill-creation/best-practices
