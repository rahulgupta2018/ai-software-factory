---
name: guard
description: >-
  Full safety mode — turn on `/careful` (confirm before destructive commands) and `/freeze`
  (restrict edits to one directory) at the same time, for maximum protection when touching
  production or debugging a live system. Sets an edit boundary in session memory and screens
  every risky command and every edit through `fac guard`. Activates on "guard mode", "full
  safety", "lock it down", or "maximum safety"; owns the combined posture. Does not replace
  the individual /careful or /freeze skills when you want only one.
license: MIT
metadata:
  author: AI Software Factory
  version: 0.1.0
  last_updated: 2026-07-22
  layer: Safety
  priority: V1
---

# Guard

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

`/guard` is the full safety posture: `/careful` and `/freeze` at once. Destructive shell commands
are classified and surfaced for confirmation before they run, AND file edits are restricted to a
single directory you name up front. Reach for it when the cost of a mistake is high — a production
touch, a live-system debug, a shared environment where an errant `rm -rf` or an out-of-scope edit
would hurt someone else.

Both halves run through the same mechanical classifier (`fac guard`), so the protection is provable
rather than a promise. Like its parts, `/guard` is accident-prevention, not sandboxing: it stops
the careless command and the scope leak, but a subshell or a `sed -i` can still reach past it.

## When to Activate

Activate when:
- The user says "guard mode", "full safety", "lock it down", or "maximum safety".
- You are touching production or debugging a live system and want both protections on.
- A high-stakes task needs both a bounded blast radius and destructive-command confirmation.

**Do not activate** (adjacent skills own this):
- `careful` — use it alone when you only need destructive-command warnings, not an edit boundary.
- `freeze` — use it alone when you only need an edit boundary, not command warnings.
- `redact` — screens *outbound text* for secrets; `/guard` screens *commands and edits*.

## Core Concepts

- **Two checks, one posture.** Every risky command goes through `fac guard cmd`; every Write/Edit
  goes through `fac guard edit`. Neither is optional while guard mode is on.
- **The boundary is set once, up front.** `/guard` asks for the edit directory at activation and
  stores it in session memory, exactly as `/freeze` does.
- **Confirm commands, block edits.** A destructive command is surfaced for a yes; an out-of-boundary
  edit is refused outright (with an option to widen).
- **Session-scoped.** The whole posture ends with the task.

## Workflow

Freedom level: **low** — both checks run on every relevant action; do not skip either.

1. **Ask for the edit boundary** and resolve it to an absolute path.
2. **Persist the boundary** so every step reads the same line:
   ```bash
   fac memory write --scope session --key freeze-boundary --body "/abs/path/to/dir"
   ```
3. **Announce guard mode.** Destructive-command warnings are on; edits are restricted to the dir.
4. **Before any risky command,** classify it and confirm on a block:
   ```bash
   fac guard cmd "git reset --hard origin/main"
   ```
5. **Before any Write/Edit,** check it against the boundary and refuse outside it:
   ```bash
   fac guard edit "src/auth/token.ts" --boundary "$(fac memory read --scope session --key freeze-boundary)"
   ```

## Practical Guidance

- Set the tightest boundary the task allows; guard mode is for high-stakes, tightly-scoped work.
- A confirmed destructive command still runs — guard mode informs the human, it does not veto.
- To change scope, re-run `/guard` (or `/freeze`); to lift it, delete the note or end the session.

## Examples

**Example:**
```
Input:  "Guard mode — hotfix in src/billing on the prod branch."
Steps:  Boundary = /repo/src/billing (session/freeze-boundary). Announce both protections.
        Edit to src/billing/rate.ts → `fac guard edit ... --boundary /repo/src/billing` → exit 0, allowed.
        Command `git push --force` → `fac guard cmd 'git push --force'` → exit 2 → confirm with user.
Output: In-scope edits proceed; the force-push runs only after an explicit yes.
```

## Guidelines

1. Run both checks on every relevant action — commands through `guard cmd`, edits through `guard edit`.
2. Set the boundary as an absolute path at activation; keep it tight.
3. Confirm destructive commands with a specific risk description; refuse out-of-scope edits.
4. Trust the classifier's exit codes; fix `lib/guard.ts` if a rule is wrong, don't override in prose.
5. Re-run to change scope; delete the session note or end the session to stand down.

## Gotchas

1. **Not sandboxing.** A subshell, `sed -i`, or a custom alias can bypass both checks; guard mode
   prevents accidents, not a determined write.
2. **Forgetting one half.** Guard mode is not just careful mode with a nicer name — the edit
   boundary is live too; check every edit, not only commands.
3. **Stale or missing boundary.** If the session note is unset, `fac guard edit` has nothing to
   check against — set the boundary before the first edit.
4. **Session-scoped.** The posture does not carry to the next session; reactivate when needed.

## Integration

- `fac guard cmd` / `fac guard edit` — the two mechanical checks guard mode drives.
- `fac memory` (`session` scope) — where the edit boundary persists.
- `careful` / `freeze` — the individual skills guard mode composes; use them alone for one half.
- `deploy` / `ship` — the high-stakes workflows most likely to run under guard mode.

## References

- Substrate: `lib/guard.ts`, `fac guard cmd`, `fac guard edit`, `fac memory`
- Related skills: `careful`, `freeze`, `redact`
- Plan: implementation-plan §4 (Safety skills)
