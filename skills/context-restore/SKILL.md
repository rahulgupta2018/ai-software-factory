---
name: context-restore
description: >-
  Rehydrate the working context saved by /context-save so a task resumes cold — even in a new
  session or on another machine. Reads the session-scope working-context note and the active
  decisions, reconstructs where the work was and what's next, and treats logged decisions as
  settled rather than re-litigating them. Activates on "where were we", "resume", "pick up
  where I left off", or the start of a session on in-progress work; owns rehydration, not new
  planning.
license: MIT
metadata:
  author: AI Software Factory
  version: 0.1.0
  last_updated: 2026-07-22
  layer: Ops
  priority: V1
---

# Context Restore

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

`/context-restore` reads the snapshot `/context-save` wrote and reconstructs the picture: the git
branch and dirty files at save time, the run and its last recorded step, the active decisions, and
the operator's note about what's left. It's how a closed context window costs nothing — the next
session, or the next machine, resumes from written state instead of re-deriving it.

Crucially, it treats the logged decisions as **settled**. A decision in the active set comes with
its rationale; restore surfaces it so the work continues on the same footing rather than
re-litigating a call that was already made and reasoned through.

## When to Activate

Activate when:
- The user says "where were we", "resume", "pick up where I left off", or "restore context".
- A session starts on work that was previously checkpointed with `/context-save`.
- You're joining a task another session (or agent) left mid-flight.

**Do not activate** (adjacent skills own this):
- `context-save` — writes the snapshot; `/context-restore` only reads it.
- `plan-arch` / `plan-product` — make *new* decisions; `/context-restore` replays *settled* ones.
- `retro` — reflects across *many* runs for lessons; `/context-restore` rehydrates *one* saved
  working state to continue it.

## Core Concepts

- **Read, don't re-derive.** The saved note plus the active decisions are the source of truth for
  "where we were"; don't reconstruct it from scratch.
- **Settled decisions stay settled.** Active decisions carry their rationale; honour them unless the
  user explicitly reopens one (which is a `supersede`, not a silent reversal).
- **Graceful when empty.** No saved context is a normal state, not an error — say so and offer to
  start fresh.
- **Restore then verify.** After rehydrating, confirm the git branch and run still match before
  acting on the snapshot.

## Workflow

Freedom level: **low** — read, summarise, verify, continue.

1. **Rehydrate:**
   ```bash
   fac context restore
   ```
   Prints the saved working-context note plus the active decisions. Use `--json` for a structured
   read when scripting.
2. **Reconcile with reality.** Confirm the current git branch and latest run match the snapshot
   (`fac run status`); flag any drift (branch changed, run advanced) before trusting the note.
3. **Replay decisions as settled.** Restate the active decisions and their rationale; do not
   re-open them unless the user asks — a reversal is `fac decision log … --supersedes <id>`.
4. **State the next action** from the note's "remaining work", and record the resumption as a run
   artifact:
   ```bash
   fac run artifact --step context-restore --body-file <(fac context restore)
   ```
5. **Continue** the work, or hand to the owning skill (e.g. the build loop, `/review`).

## Examples

**Example:**
```
Input:  "Pick up where I left off."
Steps:  fac context restore → note: "retry backoff refactor half done; RetryConfig.maxDelay
        unbounded; add regression test first"; active decisions: [exponential backoff].
        Reconcile: git still on feat/retry, run last step 03-build-api → matches.
Output: "Resuming feat/retry: exponential-backoff decision stands. Next: add the failing
        regression test for maxDelay, then bound it." NN-context-restore.md recorded.
Handoff → tdd-red-green-refactor writes the test the note calls for.
```

## Guidelines

1. Read the snapshot before doing anything else; don't reconstruct state you already saved.
2. Reconcile the snapshot with the live git branch and run before acting on it.
3. Treat active decisions as settled; reverse one only via an explicit `supersede`.
4. If there's no saved context, say so plainly and offer to start fresh — don't invent state.
5. Lead with the single next action from the "remaining work" note.

## Gotchas

1. **Stale snapshot.** The branch may have moved since save; reconcile before trusting the note.
2. **Re-litigating settled calls.** An active decision is settled — reversing it silently loses the
   rationale trail. Supersede it explicitly instead.
3. **Treating empty as broken.** No saved context is normal; offer a fresh start rather than erroring.
4. **Restoring another repo's context.** The note is `session`-scoped to *this* repo's `.factory/`;
   a snapshot from elsewhere won't be here.

## Integration

- `context-save` — the producer; `/context-restore` consumes its `session/working-context` note.
- `fac decision` — surfaces the active decisions restore replays as settled.
- `retro` — for cross-run reflection; `/context-restore` is single-session resume.
- Run harness (`fac run`) — records the resumption as `NN-context-restore.md`.

## References

- Substrate CLIs: `fac context restore`, `fac memory read`, `fac decision list`
- Related skills: `context-save`, `retro`, `plan-arch`
- Libraries: `lib/memory.ts`, `lib/decision.ts`, `lib/run.ts`