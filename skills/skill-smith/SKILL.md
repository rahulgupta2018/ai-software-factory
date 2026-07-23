---
name: skill-smith
description: >-
  Author a new Factory skill or optimise an existing one — the meta-skill that closes a
  capability gap by creating a generator-owned SKILL.md.tmpl, or tunes an underperforming
  skill through the execute-diagnose-mutate loop until its pass rate improves. Composes the
  self-improving-agent-skills loop and a quality-governance review before anything lands.
  Activates on "we need a skill for X", "this skill keeps failing", "optimise/tune this
  skill", or a /learn finding that a rule needs enforcing; owns skill authoring and
  optimisation. Does not promote project rules (/learn) or reflect across runs (/retro).
license: MIT
metadata:
  author: AI Software Factory
  version: 0.1.0
  last_updated: 2026-07-22
  layer: Ops
  priority: FF
---

# Skill Smith

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

`/skill-smith` is the Factory building its own tools. When a capability is missing, it authors a
new workflow skill the right way — a `skills/<name>/SKILL.md.tmpl` source that flows through
`gen:skills` and passes `skill:check`, never an orphan hand-written file. When an existing skill
underperforms, it runs the `self-improving-agent-skills` loop: generate scenarios and binary
criteria, execute and score, diagnose, make one surgical edit, keep it only if the score improves.

Two things keep this honest. First, everything is **generator-owned** — a new skill is a template,
so it regenerates and drift-checks like every other Factory skill. Second, nothing lands without a
**quality-governance** review: clear ownership boundary, a "Do not activate" block, single
responsibility, versioned, ≤500 lines. The Factory improves itself, but through the same gates it
holds every other change to.

## When to Activate

Activate when:
- The user says "we need a skill for X" or "there's no skill that does Y".
- A skill keeps failing and the user asks to "optimise", "tune", or "fix" it.
- A `/learn` finding concludes a rule should be enforced by a skill, not just remembered.

**Do not activate** (adjacent skills own this):
- `learn` — promotes durable *project rules* into memory; `/skill-smith` authors/optimises *skills*.
- `retro` — reflects across runs for patterns; `/skill-smith` acts on a specific skill gap.
- `plan-arch` / the build loop — build the *product*; `/skill-smith` builds the *Factory's own* skills.

## Core Concepts

- **Generator-owned, always.** A new skill is a `SKILL.md.tmpl`; run `gen:skills` and it becomes a
  first-class skill. Never a stray committed `SKILL.md`.
- **Optimise by hill-climb.** The `self-improving-agent-skills` loop makes one change at a time and
  keeps it only if the measured pass rate improves.
- **Authoring standard is the gate.** Every skill: kebab folder == `name`, ≤500 lines, explicit
  triggers + a "Do not activate" block, single responsibility.
- **Governance before landing.** `quality-governance` reviews the result for readiness; unresolved
  mandatory fixes block the land.

## Workflow

Freedom level: **medium** — author or optimise, then gate.

**Authoring a new skill**
1. **Confirm the gap.** Check no existing skill (workflow or vendored craft) already owns this;
   name the ownership boundary and the adjacent skills it must *not* overlap.
2. **Write the template.** Create `skills/<name>/SKILL.md.tmpl` with valid frontmatter (`<!-- FACTORY:ETHOS (generated — do not edit) -->
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

Precedence: per-skill `overrides` → merged product context → skill generic default.`
   placeholder, explicit triggers, a "Do not activate" block), following the authoring standard.
3. **Generate + validate:**
   ```bash
   bun scripts/gen-skill-docs.ts && bun scripts/skill-check.ts
   ```
4. **Governance review** with `quality-governance`; resolve every mandatory fix before landing.

**Optimising an existing skill**
1. **Frame the target.** State the pass-rate goal and gather failing cases.
2. **Run the loop** (`self-improving-agent-skills`): generate scenarios + binary criteria, execute
   and score, diagnose (`add_example` / `add_constraint` / `restructure` / `add_edge_case`), apply
   **one** edit, re-score, keep only on improvement. Repeat to target or max rounds.
3. **Regenerate + validate** as above; confirm the drift check passes.
4. **Governance review**, then record:
   ```bash
   fac run artifact --step skill-smith --body-file skill-smith.md
   ```

## Examples

**Example:**
```
Input:  "Our /learn rule says enforce contract tests, but nothing does — make a skill."
Steps:  Confirm no skill owns contract-test enforcement. Author skills/contract-guard/SKILL.md.tmpl
        (triggers, Do-not-activate vs /review and /qa). gen:skills + skill:check → green.
        quality-governance: single responsibility ✓, ≤500 lines ✓, versioned ✓ → pass.
Output: new generator-owned skill; NN-skill-smith.md recorded.
Handoff → the new skill is now part of the Factory; /review can lean on it.
```

## Guidelines

1. Always author as a `SKILL.md.tmpl`; never commit a hand-written `SKILL.md` the generator doesn't own.
2. Search first — a gap that a vendored craft skill already fills doesn't need a new skill.
3. Optimise one change at a time and keep it only if the score improves; no batch rewrites.
4. Run `gen:skills` + `skill:check` before any governance review; a skill that won't generate isn't done.
5. Pass `quality-governance` before landing; resolve mandatory fixes, don't defer them.

## Gotchas

1. **Orphan SKILL.md.** Hand-writing the generated file means it drifts and `skill:check` fails —
   author the template.
2. **Overlapping ownership.** A new skill with no "Do not activate" block collides with existing
   ones; define the boundary first.
3. **Optimising blind.** Editing a skill without scenarios + criteria is guessing; the loop needs a
   measurable pass rate.
4. **Skipping governance.** A self-authored skill still goes through the readiness gate — the Factory
   holds itself to its own standard.

## Integration

- `self-improving-agent-skills` (craft) — the execute-diagnose-mutate loop `/skill-smith` runs.
- `quality-governance` (craft) — the pre-land readiness review every new/optimised skill passes.
- `gen:skills` / `skill:check` — the generator + drift check that make a skill first-class.
- `learn` — upstream: a rule that needs enforcing becomes a `/skill-smith` job.
- Run harness (`fac run`) — records the authoring/optimisation as `NN-skill-smith.md`.

## References

- Substrate CLIs: `bun scripts/gen-skill-docs.ts`, `bun scripts/skill-check.ts`, `fac run artifact`
- Craft skills: `self-improving-agent-skills`, `quality-governance`
- Related skills: `learn`, `retro`
- Authoring standard: `skills/*/SKILL.md.tmpl` (this repo), the agent-skills AUTHORING-GUIDE
