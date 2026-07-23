---
name: freeze
description: >-
  Restrict file edits to one directory for the session — set a boundary, then before every
  Write or Edit check the target against it with `fac guard edit` and refuse anything outside.
  Keeps a focused task from "helpfully" rewriting unrelated modules. The boundary persists in
  session memory so the check survives across steps. Activates on "freeze", "restrict edits",
  "only edit this folder", or "lock down edits"; owns edit-scope restriction. Does not gate
  shell commands (/careful) or do both at once (/guard).
license: MIT
metadata:
  author: AI Software Factory
  version: 0.1.0
  last_updated: 2026-07-22
  layer: Safety
  priority: V1
---

# Freeze

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

`/freeze` draws a line around one directory and refuses to edit outside it. You set a boundary
once; from then on, before any Write or Edit, the target path is checked with `fac guard edit` and
anything outside the boundary is blocked. It is the antidote to scope creep — the focused bug fix
that quietly "improves" three unrelated files, the refactor that leaks into a module you never
meant to touch.

The boundary is stored in session memory (`fac memory`, `session` scope) so it survives across
steps within the task and every edit consults the same line. This restricts the Factory's *own*
edit tools; it is not a filesystem lock — a shell command like `sed -i` can still write outside the
boundary, so it prevents accidents, not a determined write.

## When to Activate

Activate when:
- The user says "freeze", "restrict edits", "only edit this folder", or "lock down edits".
- You are debugging and want to guarantee the fix stays inside one module.
- A task's blast radius must be provably bounded to a directory.

**Do not activate** (adjacent skills own this):
- `careful` — gates *destructive shell commands*; `/freeze` gates *where files may be edited*.
- `guard` — turns on both `/careful` and `/freeze`; use it for the full safety stack.
- `context-save` — persists *working state*; `/freeze` persists a *scope boundary* for the session.

## Core Concepts

- **One boundary, checked every edit.** The line is set once and consulted before every Write/Edit;
  it is not a one-time announcement.
- **The check is mechanical.** `fac guard edit "<path>" --boundary "<dir>"` exits `0` inside the
  boundary, `2` outside. The trailing-slash discipline means `/src` never swallows `/src-old`.
- **Absolute paths win.** Resolve the boundary and the edit target to absolute paths before
  checking, so a relative `../` can't sneak across the line.
- **Session-scoped.** The boundary lives in `session` memory and ends with the task.

## Workflow

Freedom level: **low** — set the boundary, then check every edit against it without exception.

1. **Ask for the boundary** if the user didn't name one, and resolve it to an absolute path.
2. **Persist it** to session memory so every later step reads the same line:
   ```bash
   fac memory write --scope session --key freeze-boundary --body "/abs/path/to/dir"
   ```
3. **Announce it.** Tell the user edits are now restricted to that directory.
4. **Check before every Write/Edit.** Read the boundary back and test the target:
   ```bash
   fac guard edit "src/api/handler.ts" --boundary "$(fac memory read --scope session --key freeze-boundary)"
   ```
5. **On a block (exit 2), stop.** Do not edit the outside file; tell the user it's out of scope and
   ask whether to widen the boundary or skip the change.

## Practical Guidance

- Set the boundary as tight as the task allows — the whole point is a small, provable blast radius.
- To widen or move the boundary, run `/freeze` again with the new directory; it overwrites the note.
- To lift the restriction, delete the note (`fac memory delete --scope session --key freeze-boundary`)
  or end the session.

## Examples

**Example:**
```
Input:  "Freeze edits to src/auth — just fix the token bug there."
Steps:  Resolve to /repo/src/auth. Write it to session/freeze-boundary. Announce.
        Later, an edit to src/api/routes.ts →
        `fac guard edit src/api/routes.ts --boundary /repo/src/auth` → exit 2.
Output: The out-of-scope edit is refused; user is asked to widen the boundary or skip it.
```

## Guidelines

1. Check every Write/Edit target against the boundary — no "just this once".
2. Store the boundary as an absolute path; relative paths make the check ambiguous.
3. Keep the boundary tight; a boundary that covers the whole repo isn't a boundary.
4. On a block, surface it and ask — don't silently widen the line yourself.
5. Re-run `/freeze` to change the boundary; delete the note or end the session to lift it.

## Gotchas

1. **Not a filesystem lock.** `sed -i`, a subshell, or a Bash redirect can still write outside the
   boundary; `/freeze` restricts the Factory's edit tools, not the shell.
2. **Sibling-directory bleak.** Without the trailing-slash check, `/src` would match `/src-old`;
   the classifier handles this, so always go through `fac guard edit`, not a manual `startsWith`.
3. **Stale boundary.** If you forget to update the note after moving scope, edits get blocked
   unexpectedly — re-run `/freeze` to reset it.
4. **Relative-path drift.** A `../` in the target can cross the line; normalise to absolute first.

## Integration

- `fac guard edit` — the mechanical inside/outside check.
- `fac memory` (`session` scope) — where the boundary persists across steps.
- `careful` — the companion that gates destructive commands; combine via `/guard`.
- `guard` — turns on `/careful` + `/freeze` in one step.

## References

- Substrate: `lib/guard.ts` (`withinBoundary`, `normalizePath`), `fac guard edit`, `fac memory`
- Related skills: `careful`, `guard`, `context-save`
- Plan: implementation-plan §4 (Safety skills)
