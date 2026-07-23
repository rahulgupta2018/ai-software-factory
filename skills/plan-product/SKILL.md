---
name: plan-product
description: >-
  A scoped product-plan review that pressure-tests a PRD before the build — is this the right
  thing to build, at the right scope, for the right user? Runs in Expand / Hold / Reduce modes
  and scores the plan on strategic dimensions with concrete next steps. Composes
  strategy-advisor for option generation and trade-off analysis. Activates once a PRD draft
  exists and needs a decision-quality review; owns product judgement, not the tech stack
  (/plan-arch) or the UI (/plan-design).
license: MIT
metadata:
  author: AI Software Factory
  version: 0.1.0
  last_updated: 2026-07-22
  layer: Plan
  priority: V1
---

# Plan-Product

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

`/plan-product` is the Factory's product review — the CEO-in-the-room pass over a `PRD.md` draft.
It asks the questions that decide whether the plan is worth building: is this the right problem,
for the right user, at the right scope, with a real edge? It runs in one of three modes and returns
a scored review with concrete next steps, recorded as a run artifact.

It is a *wrapper*: it composes `strategy-advisor` for genuine option generation and trade-off
analysis, and adds the Factory's plan-review discipline — an explicit mode (Expand / Hold /
Reduce), dimension scoring, and a handoff that sharpens the PRD before `/plan-arch` spends effort
on a stack.

## When to Activate

Activate when:
- A `PRD.md` draft exists (`status: draft`/`in-review`) and needs a decision-quality review before
  architecture.
- The user asks "is this the right thing to build", "review the plan/PRD", "should we cut scope",
  or "what's the 10-star version".

**Do not activate** (adjacent skills own this):
- `discover` — *creates* the PRD by interrogating a raw idea; `/plan-product` *reviews* an existing
  draft.
- `plan-arch` — owns the tech stack and architecture; `/plan-product` decides *what/why*, not *how
  it's built*.
- `plan-design` — owns the UI spec; `/plan-product` is upstream of design.
- `strategy-advisor` (craft) — the option/trade-off engine this wrapper composes; `/plan-product`
  frames it as a scoped, scored PRD review.

## Core Concepts

- **The review is the artifact.** Mode, scores, the sharpened problem/scope, and next steps are
  recorded as a run artifact (`NN-plan-product.md`) and fold back into `PRD.md`.
- **Three modes, pick one.** **Expand** — find the bigger, better product hiding in a timid ask.
  **Hold** — the scope is right; pressure-test assumptions and de-risk. **Reduce** — cut to the
  irreducible V1 that still delivers the core value.
- **Score the strategic dimensions.** Rate problem clarity, user/ICP sharpness, differentiation,
  scope realism, and success metrics — say what a 10 looks like and where this plan sits.
- **Generate real options (`strategy-advisor`).** Don't rubber-stamp the first framing; produce
  genuine alternatives and weigh them against explicit criteria.
- **Sharpen, don't rewrite.** The output improves the human's PRD — tighter problem, clearer user,
  honest scope — it doesn't seize authorship of the vision.

## Workflow

Freedom level: **medium** — the mode and scoring are fixed; the judgement is yours.

1. **Read the PRD draft.** Problem, users, goals, V1, constraints. Note what's assumed vs
   evidenced.
2. **Pick the mode.** Expand / Hold / Reduce — from the user's ask and the plan's actual weakness.
   State which and why.
3. **Generate options (`strategy-advisor`).** For the mode's central question, produce real
   alternatives and their trade-offs against explicit criteria.
4. **Score the strategic dimensions** 0–10 (problem clarity, ICP, differentiation, scope realism,
   metrics), each with the concrete gap to a 10.
5. **Decide and sharpen.** Recommend the path; rewrite the problem statement, user, and V1 scope in
   the PRD's own terms.
6. **Write the review as a run artifact.** Under an active run:
   ```bash
   fac run artifact --step plan-product --inputs PRD.md --body-file plan-review.md
   ```
7. **Hand off.** A sharpened, settled PRD goes to `/plan-arch` (stack) and, if it has a UI,
   `/plan-design`.

## Practical Guidance

- Ask what breaks for the user if you cut each feature; the ones that don't break are scope.
- Name the ICP concretely; "everyone" is not a user.
- Force a differentiation answer: why this, why now, why not the incumbent.
- Prefer a smaller V1 that ships and teaches over a big one that stalls.
- Keep the human as author; you sharpen and challenge, you don't overwrite their vision.

## Examples

**Example:**
```
Input:  PRD.md draft — "a tool to manage social-housing repairs" (broad), status: draft.
Mode:   Reduce (scope too wide for a V1).
Options (strategy-advisor): (a) full asset-management suite, (b) repairs-only tracker,
        (c) reminders-only. Criteria: time-to-value, defensibility, build cost.
Scores: problem 7, ICP 5 (which housing role?), differentiation 6, scope realism 4, metrics 3.
Output: run artifact NN-plan-product.md — recommend (b) repairs-only V1 for housing officers;
        sharpened problem + ICP + V1 scope + a success metric (median time-to-assign).
Handoff → /plan-arch (stack), then /plan-design (it has a UI).
```

## Guidelines

1. Review, don't author — sharpen the human's PRD, keep them as owner of the vision.
2. State the mode (Expand/Hold/Reduce) and why before reviewing.
3. Generate real options via `strategy-advisor`; don't rubber-stamp the first framing.
4. Score each strategic dimension 0–10 with the concrete gap to a 10.
5. Fold the sharpened problem/ICP/scope back into `PRD.md`; record the review as an artifact.
6. Hand a settled PRD to `/plan-arch` (and `/plan-design` if it has a UI).

## Gotchas

1. **Rubber-stamping**: approving the first framing is not a review; generate alternatives.
2. **Vague ICP**: "everyone" hides the real user and dooms differentiation.
3. **Scores as vibes**: name what a 10 looks like per dimension or the score means nothing.
4. **Speccing the stack**: which framework/db is `/plan-arch`; stay on what/why.
5. **Seizing authorship**: rewriting the vision wholesale loses the human's intent — sharpen it.

## Integration

- `discover` — creates the PRD this skill reviews.
- `strategy-advisor` (craft) — supplies option generation and trade-off analysis.
- `plan-arch` — receives the sharpened, settled PRD to design a stack.
- `plan-design` — receives it downstream when there's a UI.
- Run harness (`fac run`) — records the review as `NN-plan-product.md`.

## References

- Strategy craft: vendored `strategy-advisor`
- Human context: `PRD.md` (owned by `/discover`)
- Related skills: `discover`, `plan-arch`, `plan-design`
- Agent: `agents/product-strategist.md`
