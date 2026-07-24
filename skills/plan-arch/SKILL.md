---
name: plan-arch
description: "Turns an in-design PRD.md into the machine-owned architecture record: picks the languages, components, frameworks, commands, and craft skills, and writes them to .factory/stack.yaml. Activates once the PRD's problem/users/V1 are settled and the product needs a tech stack and a build plan. Ends where /discover (framing) leaves off and the build loop (/review, /qa, /ship) begins."
license: MIT
metadata:
  author: AI Software Factory
  version: 0.1.0
  last_updated: 2026-07-22
  layer: Plan
  priority: V1
---

# Plan-Arch

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

`/plan-arch` is the Factory's architect. It reads a settled `PRD.md` **and the `01-discover.md`
interrogation record** the THINK phase hands it (the options weighed, why this V1, the open
questions), and produces the **machine-owned half** of the product context: `.factory/stack.yaml`. That file names the
languages and components, the framework for each, the per-component commands (test/build/lint/
typecheck), the craft skills the build loop will compose, and the guardrails and escalation
policy the run harness enforces. It is the single writer of `tech_stack`, `commands`, `skills`,
`guardrails`, and `escalation_policy` — the keys `/discover` is forbidden to touch.

The decision is not just "what to write" but "why" — `/plan-arch` records the architecture
choice as a run artifact so the reasoning survives and the build loop resumes from it.

## When to Activate

Activate when:
- `PRD.md` exists with a sharp problem, users, and a prioritised V1 (`status: in-design`).
- The product has no `.factory/stack.yaml`, or only the untouched `templates/stack.template.yaml`.
- The user asks to "pick the stack", "design the architecture", or "plan the build".

**Do not activate** (adjacent skills own this):
- `discover` — owns the human half (`PRD.md`): problem, users, goals, V1. Capture *constraints*
  there, never a stack.
- `plan-product` — owns scope review (Expand/Hold/Reduce) of the PRD.
- `fullstack-developer` / `typed-service-contracts` (craft) — own *implementing* the stack this
  skill selects, not selecting it.
- `spec` — owns turning one V1 feature into an executable spec.

## Core Concepts

- **`.factory/stack.yaml` is the artifact.** Everything decided here lands there. It is
  committed — the design record, not a build output. `fac sync-context` merges it with `PRD.md`
  into the derived context vendored skills read.
- **Ownership is enforced.** `tech_stack`, `commands`, `skills`, `guardrails`,
  `escalation_policy`, and explicit `tech_bindings` belong to this file. Writing `product`,
  `domain`, or `meta` here is an ownership violation and `fac sync-context` will reject it.
- **`tech_bindings` are partly derived.** `sync-context` derives `api`/`web`/`db` bindings from
  `tech_stack.components[]`. Only add `tech_bindings` for what components can't express (hosting,
  cache, queue); explicit values win over derived ones.
- **Skills are the build team.** `skills[]` lists the craft skills the build loop composes. Every
  `${ctx.*}` a vendored skill references must resolve from the merged context, so pick skills the
  stack actually populates.
- **Language routing.** Each component's `language`/`framework` selects the craft skill the build
  loop loads. List the matching skills in `skills[]`:
  - TypeScript/React **web** → `fullstack-developer` + `react-frontend-architect` + `modern-css-design-systems`
  - TypeScript **API** → `fullstack-developer` + `typed-service-contracts`
  - **Java/Quarkus** → `java-quarkus-expert`
  - **Python** → `python-expert`
  - **Dart/Flutter (mobile)** → `flutter-dart-expert` (iOS + Android from one codebase; MASVS)
  - **SQL/Postgres** → `database-expert`
  - Google-ADK agent (`framework: adk`) → the vendored `adk-*` bundle
  `tdd-red-green-refactor` and `typed-service-contracts` apply across languages via their dialects.
- **Guardrails and escalation are load-bearing.** `guardrails.budget.warn_tokens` feeds the run
  harness's measure-and-warn; `escalation_policy.triggers` decide which gates are *hard* (never
  batched). Set them from the PRD's risk surface, not boilerplate.

## Workflow

Freedom level: **medium** — follow the sequence, adapt the stack to the PRD.

1. **Read context.** Load `PRD.md`, the discovery record (`.factory/runs/<id>/01-discover.md`) if
   one exists, and any existing `.factory/stack.yaml` (per the config protocol). If the stack is
   the untouched template, treat this as a fresh design.
2. **Extract drivers from the PRD and the discovery record.** V1 features, personas, constraints
   (budget, timeline, existing systems, compliance), the risk surface (what's irreversible or
   sensitive), and the options/open questions `/discover` already weighed — don't re-litigate them.
3. **Choose the shape.** Decide languages and components (e.g. `api`, `web`, `db`). For each
   component pick a framework and, where relevant, db/css. Default to the vendored TypeScript/
   React path; justify any deviation against the PRD.
4. **Define commands per component.** `test`, `build`, `lint`, `typecheck`, plus a top-level
   `deploy`. These are what the build loop and `/qa`/`/ship` actually run — get them right.
5. **Select craft skills.** List the skills the build loop composes in `skills[]`. For each, make
   sure the `${ctx.*}` keys it binds are populated by the stack you chose — verify against the
   merged `.factory/context.gen.yaml` (after `fac sync-context`). Note `fac vendor:check` does *not*
   validate your product: it checks the Factory's own vendored skills against the Factory reference
   product.
6. **Set guardrails + escalation.** From the PRD's risk surface: `budget.warn_tokens`,
   `pii_handling`, `secrets`, `prohibited_data`, and `escalation_policy.triggers` (the
   operations that must stop and ask — these become hard gates).
7. **Write `.factory/stack.yaml`.** The machine half only. **Never touch `PRD.md`'s frontmatter
   keys** (`product`, `domain`, `meta`) — that is an ownership violation.
8. **Sync + validate.** Run `fac sync-context` (merges → `.factory/context.gen.yaml` +
   `.agents/project-context.yaml`, Ajv-validated), then inspect the merged context to confirm every
   `skills[]` entry's `${ctx.*}` keys are present.
9. **Record the decision as a run artifact.** Under an active run, write the architecture
   rationale so the build loop resumes from it and the "why" survives:
   ```bash
   fac run artifact --seq 2 --step plan-arch --inputs PRD.md,.factory/runs/$RUN/01-discover.md --body-file arch-notes.md
   ```
   Record **what plan-arch reads** — `PRD.md` and the discovery record — as inputs; a change to
   either re-runs `plan-arch` (make-like cascade). Do **not** list `.factory/stack.yaml`: that is
   plan-arch's own *output*, and recording it would make a stack edit re-run the step that wrote it.
   When there is no discovery record (a hand-authored PRD), use just `--inputs PRD.md`.
10. **Hand off.** Point the user to the build loop: implement V1 features, then `/review`,
    `/qa`, `/ship`.

## Practical Guidance

- Pick the smallest stack that ships V1. Every component is surface area to build, test, and run.
- Prefer boring, well-supported frameworks. The build loop is faster on paths the vendored craft
  skills already know.
- Make `commands` real and runnable — they are executed, not documentation. If a command doesn't
  exist yet, that's a V1 task, not a placeholder.
- Set `warn_tokens` from a real baseline once one exists; until then, a conservative default that
  warns (never halts) is correct.
- Keep `escalation_policy.triggers` tight and specific ("schema migration on live data"), not
  vague ("anything risky") — they gate the loop.

## Examples

**Example:**
```
Input:  PRD.md — Repair Tracker (log a repair, assign, status, reminders), status: in-design,
        constraint "small team, ship fast", risk "contractor payments later".
Output: .factory/stack.yaml —
          tech_stack.languages: [typescript, react, sql]
          components: api (hono + postgres), web (react + tailwind-v4)
          commands: bun test/build/lint/typecheck per component; deploy "fly deploy"
          tech_bindings: hosting fly.io, cache none
          skills: discover, fullstack-developer, tdd-red-green-refactor, typed-service-contracts
          guardrails.budget.warn_tokens: 400000
          escalation_policy.triggers: ["schema migration on live data",
                                       "anything touching contractor payments"]
        + run artifact 02-plan-arch.md (rationale, inputs: PRD.md + 01-discover.md). Handoff → build loop.
```

## Guidelines

1. Write only the machine half. Never set `product`, `domain`, or `meta` — `sync-context` rejects it.
2. Every component has a framework and a full command set. No component without runnable commands.
3. Every skill in `skills[]` must have its `${ctx.*}` keys populated by the stack — verify against
   the merged `.factory/context.gen.yaml`, not `fac vendor:check` (a Factory-repo check).
4. Always run `fac sync-context` after writing the stack; leave the context validated and green.
5. Record the architecture decision as a run artifact under an active run.

## Gotchas

1. **Leaking into the PRD**: setting `product`/`domain`/`meta` is an ownership violation that
   `sync-context` blocks. Constraints live in `PRD.md` (owned by `/discover`); stack decisions
   live here.
2. **Skills that don't bind**: a craft skill whose `${ctx.*}` the stack doesn't populate has
   nothing to read at build time. Pick skills the stack supports, or extend the stack; verify
   against the merged `.factory/context.gen.yaml`.
3. **Placeholder commands**: a `commands` entry that isn't runnable breaks `/qa` and `/ship`.
   Make it real or make it a V1 task.
4. **Over-scoped stack**: a component per idea inflates build/test/run cost. Ship the smallest V1.
5. **Vague escalation triggers**: they decide hard gates. Keep them specific and testable.

## Integration

- `discover` — writes the PRD **and the `01-discover.md` interrogation record** this skill reads; owns `product`/`domain`/`meta`.
- `sync-context` (`fac sync-context`) — merges `PRD.md` + `.factory/stack.yaml` into the derived
  context; enforces ownership; Ajv-validates.
- `vendor:check` (`fac vendor:check`) — a *Factory-repo* integrity check (vendored skills intact,
  bindings resolve against the Factory reference product). It does **not** validate your product's
  stack — use the merged `.factory/context.gen.yaml` for that.
- Run harness (`fac run`) — records the architecture decision as `02-plan-arch.md`; resume
  re-runs this step when `PRD.md` or the discovery record changes.
- `fullstack-developer`, `tdd-red-green-refactor`, `typed-service-contracts` (craft) — implement
  the stack this skill selects.

## References

- Machine context: `.factory/stack.yaml` (this product) / `templates/stack.template.yaml`
- Human context: `PRD.md` (owned by `/discover`)
- Worked example: `examples/reference-product/.factory/stack.yaml`
- Contract: `project-context.schema.json` (x-owner per property)
- Related skills: `discover`, `plan-product`, `fullstack-developer`, `typed-service-contracts`
