---
name: context-save
description: >-
  Snapshot the working context so a task can be put down and picked back up later — even
  across sessions or hosts. Captures git branch and dirty files, the active run and its last
  recorded step, the logged decisions, and an operator note into the session-scope memory
  note. Activates on "save my progress", "checkpoint", end of a working session, or before a
  risky context switch; owns durable working state, not the code changes themselves.
license: MIT
metadata:
  author: AI Software Factory
  version: 0.1.0
  last_updated: 2026-07-22
  layer: Ops
  priority: V1
---

# Context Save

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

`/context-save` writes down where you are so the work survives a break, a crash, or a jump to
another machine. It composes the Factory substrate into one snapshot: the git branch and
uncommitted files, the latest run and the last step it recorded, the active decisions from the
decision log, and an operator note describing what's left. The snapshot lands in the `session`
scope of the memory store as the `working-context` note, ready for `/context-restore` to rehydrate.

The state that matters is written down, not held in a model's head — a context window that closes
should cost you nothing. Because the write goes through the memory store's secret-blocking guard, a
stray credential in the note or a dirty filename is refused rather than persisted.

## When to Activate

Activate when:
- The user says "save my progress", "checkpoint this", "I'm stopping here", or "pick this up later".
- A working session is ending, or you're about to switch to an unrelated task or machine.
- Before a risky operation (a big rebase, a dependency bump) where you want a known-good marker.

**Do not activate** (adjacent skills own this):
- `context-restore` — reads the snapshot back; `/context-save` only writes it.
- `ship` — lands the change and writes the CHANGELOG; `/context-save` records *unfinished* state,
  not a release.
- The run harness (`fac run`) — persists per-step *artifacts* during a run; `/context-save` captures
  the cross-cutting session picture (git + decisions + remaining work), not one step.

## Core Concepts

- **The snapshot is the working memory.** git state + run + active decisions + remaining work, in
  one `session/working-context` note — enough to resume cold.
- **Decisions are read, not re-made.** The snapshot lists the *active* decisions (superseded ones
  dropped) so restore treats them as settled.
- **Secret-blocking write.** The memory store refuses a note carrying a HIGH-tier secret, so a
  checkpoint can't leak one.
- **Session scope is ephemeral by design.** Working context belongs to the task in flight; durable
  conventions go to the `product` scope instead.

## Workflow

Freedom level: **low** — one command, then record it.

1. **Note what's left.** Summarise the remaining work in a sentence or two (the single most useful
   field on restore).
2. **Save the snapshot:**
   ```bash
   fac context save --note "next: wire /retro to the decision log; review flaky qa test"
   ```
   This writes `session/working-context` with git branch + dirty files, the latest run and its last
   step, and the active decisions.
3. **Log any durable decision made this session** (so it survives beyond the note):
   ```bash
   fac decision log --decision "…" --rationale "…" --scope repo --source user --confidence 8
   ```
4. **Record the checkpoint as a run artifact** when a run is active:
   ```bash
   fac run artifact --step context-save --body-file <(fac context restore)
   ```
5. **Confirm** with `fac context restore` (or `fac memory read --scope session --key working-context`).

## Examples

**Example:**
```
Input:  "Save my progress — I'm mid-refactor on the retry logic."
Steps:  fac context save --note "retry backoff refactor half done; RetryConfig.maxDelay still
        unbounded; add regression test before continuing"
        → snapshot: branch feat/retry, 3 dirty files, run r-2026-... last step 03-build-api,
          active decisions [use exponential backoff], remaining work as noted.
Output: session/working-context written; NN-context-save.md artifact recorded.
Handoff → /context-restore (next session) rehydrates it.
```

## Guidelines

1. Always pass `--note` — the remaining-work line is what makes a restore useful.
2. Log durable decisions to the decision log, not just the note; the note is ephemeral.
3. Never paste a secret into the note; the write will block, but don't rely on it — keep secrets out.
4. Save before a risky operation, not only at session end.
5. Keep the note about *what's next*, not a diff of what changed (git already has that).

## Gotchas

1. **Session scope is not forever.** Working context is for the task in flight; don't stash
   long-lived conventions here — use `fac memory write --scope product`.
2. **A blocked save means a secret leaked into the note.** Read the error, remove the credential,
   save again.
3. **No `--note` means a thin snapshot.** git + decisions are captured, but the "what's next" line
   is the highest-value field.
4. **Uncommitted work is listed, not saved.** `/context-save` records that files are dirty; it does
   not commit them. Commit or stash real work separately.

## Integration

- `context-restore` — the consumer; reads `session/working-context` and the active decisions back.
- `fac decision` — durable decisions logged here surface on restore and in `/retro`.
- `fac memory` — the storage layer (`session` scope); `/context-save` is a composed convenience over it.
- Run harness (`fac run`) — records the checkpoint as `NN-context-save.md`.

## References

- Substrate CLIs: `fac context save`, `fac memory`, `fac decision`
- Related skills: `context-restore`, `retro`, `ship`
- Libraries: `lib/memory.ts`, `lib/decision.ts`, `lib/run.ts`