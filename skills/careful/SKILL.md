---
name: careful
description: >-
  Turn on destructive-command warnings for the session — before any command that could cause
  irreversible loss (recursive delete, DROP/TRUNCATE, force-push, hard reset, kubectl/docker
  delete) runs, check it and confirm with the user first. Uses `fac guard cmd` as the
  mechanical classifier so the decision is provable, not a vibe. Activates on "be careful",
  "safety mode", "prod mode", or when touching production or a shared system; owns
  destructive-command confirmation. Does not restrict edit scope (/freeze) or do both at once
  (/guard).
license: MIT
metadata:
  author: AI Software Factory
  version: 0.1.0
  last_updated: 2026-07-22
  layer: Safety
  priority: V1
---

# Careful

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

`/careful` makes the Factory pause before it can hurt you. Once active, every shell command that
looks destructive — a recursive delete outside the throwaway build/cache dirs, a `DROP`/`TRUNCATE`,
a force-push, a `git reset --hard`, a `kubectl delete`, a `docker system prune` — is classified by
`fac guard cmd` and, if it blocks, surfaced to the user for an explicit yes before it runs.

This is a guardrail, not a cage. It catches the accident and the careless paste (the 99% case); it
does not stop a determined operator, because `sed`, a subshell, or an unrecognised alias can still
do damage. The mechanical classifier lives in `lib/guard.ts` so the verdict is the same every time
and provable in a test, not a judgement call that drifts with the model's mood.

## When to Activate

Activate when:
- The user says "be careful", "safety mode", "prod mode", or "careful mode".
- You are touching production, debugging a live system, or working in a shared environment.
- A task will involve deletes, migrations, or history rewrites and you want a standing check.

**Do not activate** (adjacent skills own this):
- `freeze` — restricts *where files may be edited*; `/careful` gates *what commands may run*.
- `guard` — turns on both `/careful` and `/freeze` together; use it when you want the full stack.
- `redact` — screens *outbound text* for secrets; `/careful` screens *commands* for destruction.

## Core Concepts

- **Confirm, don't block outright.** A destructive command isn't forbidden — it's surfaced. The
  human always gets the final call; the skill just refuses to run it silently.
- **The classifier is the source of truth.** `fac guard cmd "<command>"` exits `2` when the command
  is destructive, `0` when it is safe or a whitelisted throwaway delete. Prose never overrides it.
- **Safe exceptions keep it usable.** A gate that fires on `rm -rf node_modules` gets muted, so a
  recursive `rm` whose targets are ALL known throwaways (`node_modules`, `dist`, `.next`, caches)
  is allowed without a prompt.
- **Session-scoped.** Careful mode is a posture for the current task; it ends with the session.

## Workflow

Freedom level: **low** — the check runs before every risky command; do not skip it to save a step.

1. **Announce the posture.** Tell the user careful mode is on and what it covers.
2. **Screen before running.** Before executing any command that deletes, drops, rewrites history,
   or touches infra, classify it:
   ```bash
   fac guard cmd "git push --force origin main"
   ```
3. **On a block (exit 2), stop and confirm.** Show the user the matched risk and ask for an
   explicit go/no-go. Only run the command after a yes.
4. **On allow (exit 0), proceed.** A safe command or a throwaway-only delete runs without a prompt.

## Practical Guidance

- Pass the command exactly as you would run it, quoted as one argument, so the classifier sees the
  real flags (`fac guard cmd "rm -rf $BUILD_DIR"`).
- When a command is genuinely needed and the user confirms, run it — careful mode informs the
  decision, it does not veto it.
- For a batch of risky steps, screen each one; a `&&` chain can hide a destructive tail.

## Examples

**Example:**
```
Input:  "Be careful — I'm cleaning up the staging DB."
Steps:  Announce careful mode. Before `psql -c "TRUNCATE events;"`, run
        `fac guard cmd 'TRUNCATE events;'` → exit 2, risk data-loss.
        Surface it: "This truncates events (data loss). Confirm?" → user says yes.
Output: Command runs after explicit confirmation; the near-miss is on the record.
```

## Guidelines

1. Screen every delete, drop, force-push, hard reset, and infra-delete before it runs.
2. Never suppress a block to "keep moving" — surface it and get a yes.
3. Trust the classifier's exit code; if you think it's wrong, fix `lib/guard.ts`, don't hand-wave.
4. Keep the confirmation specific — name the risk and what is lost, not just "this is dangerous".
5. A throwaway-only recursive delete is allowed; don't nag the user about `rm -rf dist`.

## Gotchas

1. **Chained commands.** `safe-thing && rm -rf /data` is destructive — the classifier flags the
   whole string, so pass the whole string.
2. **Interpolated variables.** `rm -rf "$DIR"` can't be judged if `$DIR` is unknown; resolve it
   first or treat it as destructive.
3. **Not a security boundary.** `sed -i`, a subshell, or a custom alias can still delete data;
   careful mode is accident-prevention, not sandboxing.
4. **Session-scoped.** The posture does not persist to the next session — reactivate when needed.

## Integration

- `fac guard cmd` — the mechanical classifier that returns the verdict.
- `freeze` — the companion that restricts edit scope; combine via `/guard`.
- `guard` — turns on `/careful` + `/freeze` in one step.
- `deploy` / `ship` — the workflows most likely to want careful mode active.

## References

- Substrate: `lib/guard.ts` (`classifyCommand`, `SAFE_DELETE_TARGETS`), `fac guard cmd`
- Related skills: `freeze`, `guard`, `redact`
- Plan: implementation-plan §4 (Safety skills), §6 (guardrails)
