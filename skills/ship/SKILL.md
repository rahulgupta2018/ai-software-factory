---
name: ship
description: "Lands a reviewed, QA'd change: runs the full check suite, enforces the review and QA gates, opens a pull request, and (when configured) deploys and verifies. Activates when a change is ready to land. Push and deploy are hard gates. Does not own writing code, reviewing the diff (/review), or exercising the app (/qa)."
license: MIT
metadata:
  author: AI Software Factory
  version: 0.1.0
  last_updated: 2026-07-22
  layer: Ship
  priority: V1
---

# Ship

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

`/ship` is the Factory's release engineer. It takes a change that has passed `/review` and `/qa`,
runs the full check suite from the stack, opens a pull request, and — when the product is
configured for it — deploys and verifies production health. Irreversible steps (pushing, opening
the PR, deploying) are **hard gates**: `/ship` stops and asks the operator before each, and never
batches them.

## When to Activate

Activate when:
- A change is implemented, reviewed (`/review` clean), and QA'd (`/qa` clean) and ready to land.
- The user asks to "ship it", "open a PR", or "deploy".

**Do not activate** (adjacent skills own this):
- `review` — owns the diff review gate; `/ship` enforces it, doesn't perform it.
- `qa` — owns exercising the app; `/ship` enforces the QA gate.
- `fullstack-developer` / `python-expert` (craft) — own writing the code.
- `canary` / `deploy` — own extended post-deploy monitoring; `/ship`'s verify is the first check.

## Core Concepts

- **Gates before land.** `/ship` will not proceed with unresolved `/review` security findings or
  `/qa` blocking bugs. Those upstream gates are preconditions, not suggestions.
- **Commands come from the stack.** Test/build/lint/typecheck/deploy are read from
  `commands.*` in the merged context — `/ship` runs what the product declares, never hardcodes.
- **Push and deploy are hard gates.** They are irreversible and match `escalation_policy.triggers`
  — the run harness classifies them as `hard`, so they never batch through `--yes`. Stop and ask,
  every time.
- **The PR is the artifact.** `/ship` writes a ship-report artifact (checks run, gates passed, PR
  URL, deploy result) into the run so the release is auditable and re-runnable.
- **Measure cost, don't halt on it.** The harness warns past `guardrails.budget.warn_tokens`;
  `/ship` surfaces the warning but a budget overage never blocks a release.

## Workflow

Freedom level: **low** — this is a release procedure; follow it.

1. **Read context.** Load the merged product context (per the config protocol) for `commands`,
   `guardrails`, and `escalation_policy`. Identify the base branch.
2. **Enforce upstream gates.** Confirm `/review` is clean of security findings and `/qa` is clean
   of blocking bugs (check the latest `NN-review.md` / `NN-qa.md` artifacts). If not, stop and
   route back — do not ship.
3. **Run the full check suite.** For each affected component, run `commands.<component>.test`,
   `lint`, `typecheck`, and `build`. Any failure halts the ship.
4. **Prepare the change.** Ensure commits are logical and the working tree is clean. Write a PR
   title and body describing what the change does for the user.
5. **Hard gate — push.** Pushing is irreversible: stop and ask the operator. On approval, push
   the branch.
6. **Hard gate — open the PR.** Opening the PR is a shared-system action: confirm, then
   `gh pr create` against the base branch.
7. **Deploy (if configured).** If `commands.deploy` exists and the operator approves this **hard
   gate**, run it, then verify production health (the first health check; `/canary` owns extended
   monitoring).
8. **Write the ship-report artifact** under an active run:
   ```bash
   fac run artifact --seq 5 --step ship --inputs <changed-files> --body-file ship.md
   ```
   Record checks run, gates passed, the PR URL, and the deploy result. Then release the run lock.
9. **Hand off.** Point the user to `/canary` (monitor) or `/document` (release notes).

## Practical Guidance

- Never `--no-verify`, never force-push a shared branch, never skip a failing check to land faster.
- Write the PR body for a reviewer: what changed for the user, not how the branch got here.
- Treat each irreversible step as its own gate — don't bundle push + PR + deploy into one prompt.
- If a check fails, stop and route back to the author. `/ship` lands green changes only.

## Examples

**Example:**
```
Input:  feature/assign-contractor — /review clean, /qa clean, base main.
Output: ran bun test/lint/typecheck/build (all green) → hard gate: push? (approved) →
        hard gate: open PR? (approved) gh pr create → PR #42 → hard gate: fly deploy? (approved)
        → deployed, health check 200. 05-ship.md written (checks, gates, PR #42, deploy ok).
```

## Guidelines

1. Enforce the `/review` (no security findings) and `/qa` (no blocking bugs) gates before landing.
2. Run the full check suite from `commands.*`; any failure halts the ship.
3. Push, open-PR, and deploy are hard gates — stop and ask; never batch through `--yes`.
4. Never bypass checks (`--no-verify`) or force-push a shared branch.
5. Write the ship report as a run artifact and release the run lock.
6. Budget overage warns, never blocks.

## Gotchas

1. **Shipping past a security finding**: the gate exists for this. Route back, don't ship.
2. **Bundling irreversible steps**: push + PR + deploy in one prompt hides risk. One gate each.
3. **`--no-verify` to land faster**: bypasses the safety net. Never.
4. **A PR body that narrates the branch**: reviewers want user impact, not commit archaeology.
5. **Halting on a budget warning**: budget is measure-and-warn, never a release blocker.

## Integration

- `review` — the security gate `/ship` enforces before landing.
- `qa` — the blocking-bug gate `/ship` enforces before landing.
- Run harness (`fac run`) — records the ship report; the hard-gate tiers come from
  `escalation_policy.triggers`; releases the run lock on completion.
- `canary` / `deploy` — extended post-deploy monitoring after `/ship`'s first health check.
- `document` — release notes after the change lands.

## References

- Commands + guardrails + escalation: merged product context (`.factory/context.gen.yaml`)
- Run artifacts: `.factory/runs/<id>/NN-ship.md`
- Related skills: `review`, `qa`, `canary`, `deploy`, `document`
