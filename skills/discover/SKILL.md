---
name: discover
description: >-
  Interrogates a raw product idea and turns it into the first draft of a PRD.md — problem,
  users, goals/non-goals, and a prioritised V1 feature set. Activates at the very start of a
  product ("I want to build…", "here's my idea", empty or stub PRD.md). Ends where
  /plan-product (scope review) and /plan-arch (architecture) begin.
license: MIT
metadata:
  author: AI Software Factory
  version: 0.1.0
  last_updated: 2026-07-22
  layer: Think
  priority: V1
---

# Discover

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

`/discover` is the Factory's front door. It takes a rough product idea and, through focused
questioning, produces the first draft of the product's `PRD.md`: the problem, who it's for, what
success looks like, and a prioritised V1. It reframes the idea toward the strongest version of
the product before any architecture or code exists. Think YC office hours, not a form to fill in.

## When to Activate

Activate when:
- The user describes a new product idea ("I want to build…", "here's my idea").
- A product repo has no `PRD.md`, or only the untouched `templates/PRD.template.md`.
- The user asks to "start", "scope", or "frame" a new product.

**Do not activate** (adjacent skills own this):
- `plan-product` — owns scope review (Expand/Hold/Reduce) of an *existing* draft PRD.
- `plan-arch` — owns architecture, tech-stack selection, and test planning.
- `spec` — owns turning a single feature into an executable spec + issue.

## Core Concepts

- **The 10-star product.** Push past the literal request to the most valuable version, then
  scope back to a shippable V1. Ask "what would make this a must-have, not a nice-to-have?"
- **Problem before solution.** Nail the problem and the user before enumerating features. A
  feature list without a sharp problem is a wish list.
- **Two artifacts.** The durable one is `PRD.md` — frontmatter for product identity, body for
  requirements; you draft it, later `/plan-*` skills refine it. The run-scoped one is
  `01-discover.md`, the interrogation record `/plan-arch` reads. The machine half
  (`.factory/stack.yaml`) belongs to `/plan-arch` and stays empty until then.

## Workflow

Freedom level: **medium** — follow the sequence, adapt the questions to the idea.

1. **Read context.** Load `PRD.md` if it exists (per the config protocol). If it's the untouched
   template, treat this as a fresh start.
2. **Interrogate the idea.** Ask, one theme at a time (use AskUserQuestion):
   - Problem: what hurts today, for whom, and why now?
   - Users & personas: primary vs secondary; their goal and context of use.
   - The strongest version: what would make this a 10-star product?
   - Goals & non-goals: what must be true; what's explicitly out.
   - Constraints: budget, timeline, existing systems, compliance.
   - Domain grounding **(regulated / knowledge domains only)**: which jurisdictions apply, the
     authority hierarchy (e.g. statute → regulation → regulator guidance → best practice), and the
     primary sources that govern the domain. Skip entirely for ordinary consumer products.
3. **Reframe.** Reflect back the sharpest version of the product. Name the one job it must nail.
4. **Prioritise features into lanes:** V1 (must ship), Fast-follow, Later.
5. **Define success metrics.** Concrete and measurable.
6. **Draft the PRD.** Write/update the product's `PRD.md` — the human-owned half only:
   - Body: fill sections 1–10.
   - Frontmatter: set `product.name/code/description`, `status: in-design`, and `domain` if the
     product has one.
   - **Regulated / knowledge domains only:** also set `jurisdictions`, `authority_hierarchy`, and
     `sources` in the frontmatter — all human-owned (PRD.md), and what the vendored knowledge craft
     skills bind to. Omit them for ordinary products; don't invent a legal frame that isn't there.
   - **Never touch `.factory/stack.yaml`.** Tech stack and commands are `/plan-arch`'s to write;
     writing them here is an ownership violation and `fac sync-context` will reject it. (Note
     `compliance_rules` is stack-owned — it is `/plan-arch`'s to record, not yours.)
7. **Record the discovery as a run artifact.** Under an active run, write `01-discover.md` — the
   interrogation record `/plan-arch` reads: the sharpened problem, the personas, the options you
   weighed, why this V1, and the open questions.

   `fac run artifact --seq 1 --step discover --body-file discover-notes.md`

   **Pass no `--inputs`.** Discover's input is the idea in the conversation, not a file, so it has
   nothing upstream to go stale against. `PRD.md` is discover's *output* — recording it as an input
   would make a later human PRD edit re-run discover and clobber that edit. A PRD edit re-opens
   `/plan-arch`, not `/discover`.
8. **Persist & hand off.** Save `PRD.md`, run `fac sync-context`, then point the user to
   `/plan-product` (scope review) or `/plan-arch` (architecture).

## Practical Guidance

- Ask few questions at a time; synthesize before asking more. Don't interrogate in bulk.
- Prefer outcome-framed questions ("what breaks for your users if this doesn't exist?") over
  implementation-framed ones.
- If the idea is vague, offer 2–3 concrete directions and let the user choose.
- Do not pick languages or frameworks here — that's `/plan-arch`. Capture *constraints* only.

## Examples

**Example:**
```
Input:  "I want to build a tool that helps landlords track repairs."
Output: PRD.md draft — problem (repairs slip through email/phone), personas (landlord,
        contractor), goals (nothing falls through the cracks), V1 (log a repair, assign,
        status, reminders), non-goals (tenant chat), success metric (median time-to-close),
        status: in-design. Handoff → /plan-arch.
```

## Guidelines

1. Never write code or pick a tech stack in `/discover`.
2. Always produce or update a `PRD.md`, and record `01-discover.md` under an active run — the
   session isn't done until both artifacts exist.
3. Every feature is tagged V1 / Fast-follow / Later. No unprioritised feature lists.
4. Set `product.status: in-design` when you hand off.

## Gotchas

1. **Feature-listing before the problem is sharp**: forces a wish list. Lock the problem first.
2. **Scoping V1 too big**: if everything is V1, nothing is. Push items to Fast-follow.
3. **Leaking into architecture**: capture constraints, not stack decisions. Hand off to `/plan-arch`.

## Integration

- `plan-product` — refines the draft PRD's scope (Expand/Hold/Reduce).
- `plan-arch` — reads the PRD and writes `.factory/stack.yaml` (`tech_stack.components[]`,
  `commands`).
- `strategy-advisor` (craft) — option generation and trade-off framing during interrogation.
- Run harness (`fac run`) — records the interrogation as `01-discover.md` with no staleness
  inputs; a later PRD edit re-opens `/plan-arch`, not this step.

## References

- Product PRD: `PRD.md` (this product) / `templates/PRD.template.md`
- Worked example: `examples/reference-product/PRD.md`
- Related skills: `plan-product`, `plan-arch`, `spec`
