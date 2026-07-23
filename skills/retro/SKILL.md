---
name: retro
description: >-
  Reflect across recent runs and the decision log to surface what worked, what stalled, and
  what to change next — a lightweight retrospective, not a status report. Reads the run
  history and the active decisions, groups by theme, and proposes concrete adjustments (and
  durable decisions to log). Activates on "retro", "what did we learn", a weekly review, or
  after a rough stretch of work; owns cross-run reflection. Does not resume a single task
  (/context-restore) or run quality gates (/health).
license: MIT
metadata:
  author: AI Software Factory
  version: 0.1.0
  last_updated: 2026-07-22
  layer: Ops
  priority: FF
---

# Retro

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

`/retro` looks back across the recent runs and the decision log and asks the retrospective
questions: what went well, what stalled, what surprised us, and what should change. It reads the run
history (each run's steps and artifacts) and the active decisions, groups them by theme, and turns
the pattern into a short list of concrete adjustments — some of which become durable decisions
logged for next time.

This is reflection, not reporting. A status update lists what happened; a retro extracts the lesson
and commits to a change. The output is deliberately small: a few honest observations and a few
actions worth taking, so the next stretch of work is measurably better than the last.

## When to Activate

Activate when:
- The user says "retro", "what did we learn", "look back on this week", or "post-mortem this".
- At a natural boundary — end of a milestone, a rough patch, or a regular cadence review.
- After a string of runs where a pattern (repeated failures, rework) is worth naming.

**Do not activate** (adjacent skills own this):
- `context-restore` — rehydrates *one* saved task to continue it; `/retro` reflects across *many*
  finished runs for lessons.
- `health` — reports current pass/fail gates; `/retro` reflects on the *history*, not the present.
- `investigate` — roots out *one* bug's cause; `/retro` finds *cross-run* patterns and process
  changes.

## Core Concepts

- **Reflection over reporting.** Name the lesson and commit to a change; don't just recount events.
- **Evidence from the substrate.** Observations come from the run history and the decision log, not
  from memory or vibes.
- **Small, honest output.** A few real observations and a few concrete actions beat an exhaustive
  timeline nobody reads.
- **Lessons become decisions.** A durable "we should always X" is logged with `fac decision`, so it
  survives to shape the next run.

## Workflow

Freedom level: **medium** — gather evidence, find patterns, propose changes.

1. **Gather the history.** List recent runs and skim their steps/artifacts; read the active
   decisions (`fac decision list`). Look for repeats: same step failing, rework, decisions reversed.
2. **Group by theme.** Cluster the signals — e.g. "review kept catching the same class of bug",
   "arch decisions churned twice", "tests flaked on the API component".
3. **Ask the three questions** per theme: what worked, what stalled, what to change.
4. **Propose concrete actions.** Each observation gets an action a human or agent can actually take
   (change a gate, add a check, adjust a convention) — not a platitude.
5. **Log durable lessons** as decisions and record the retro:
   ```bash
   fac decision log --decision "Add a contract test whenever an API shape changes" \
     --rationale "retro: 3 of last 5 review catches were API-shape drift" --scope repo \
     --source agent --confidence 7
   fac run artifact --step retro --body-file retro.md
   ```

## Examples

**Example:**
```
Input:  "Run a retro on this week's work."
Steps:  8 runs skimmed; decision log read. Pattern: 3 runs stalled at 04-review on the same
        API-shape drift; one arch decision reversed mid-week.
Themes: (1) API drift caught late  (2) arch decision churned.
Output: retro.md —
          Worked: review is catching drift reliably.
          Stalled: it catches it LATE, after build.
          Change: add a contract test at build time → logged as a decision.
        NN-retro.md recorded; 1 durable decision logged.
Handoff → /learn (Track 3) can promote the logged lesson into a standing rule.
```

## Guidelines

1. Pull observations from the run history and decision log — cite the runs, don't generalise from
   nothing.
2. Keep it short: a handful of themes, each with one concrete action.
3. Turn durable lessons into logged decisions so they outlive the retro.
4. Be honest about what stalled; a retro that only celebrates is a status report.
5. Every observation ends in an action someone can take, not a platitude.

## Gotchas

1. **Reporting instead of reflecting.** A timeline of events isn't a retro; the lesson and the change
   are the point.
2. **Unsupported claims.** "We moved fast" needs a run to back it; pull from the substrate, not vibes.
3. **Actions with no owner or edit.** "Do better at reviews" is noise; "add a contract test at build"
   is a change.
4. **Lessons that evaporate.** If it's durable, log it as a decision — otherwise next week repeats
   this week.

## Integration

- `fac decision` — both a source (past decisions) and a sink (new logged lessons).
- Run harness (`fac run`) — the run history is the evidence base; the retro is recorded as
  `NN-retro.md`.
- `learn` (Track 3) — promotes logged retro lessons into standing rules.
- `context-save` — retro often follows a save at a milestone boundary.

## References

- Substrate CLIs: `fac decision list`, `fac run status`, `fac run artifact`
- Related skills: `learn`, `health`, `context-save`
- Libraries: `lib/decision.ts`, `lib/run.ts`