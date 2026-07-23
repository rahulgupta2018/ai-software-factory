---
name: canary
description: >-
  Watch a freshly deployed release for a short window and confirm it's actually healthy in
  production — hit the health endpoint and key user paths, poll on an interval, and hard-stop
  the rollout the moment a signal goes red. Escalates a failing canary rather than swallowing
  it. Activates right after a deploy, on "watch the deploy", "canary this release", or a
  post-release smoke window; owns post-deploy verification. Does not deploy (/deploy), measure
  local perf (/benchmark), or fix the failure (/investigate).
license: MIT
metadata:
  author: AI Software Factory
  version: 0.1.0
  last_updated: 2026-07-22
  layer: Ops
  priority: V1
---

# Canary

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

`/canary` is the watch you keep on a release right after it goes out. Deploy success means the new
code is *running*, not that it *works*; `/canary` closes that gap by hitting the live health
endpoint and a few key user paths on an interval for a short window, and hard-stopping the moment a
signal goes red. It drives real requests through `fac browse` and plain HTTP checks against the
deployed URL — the same paths a user would take.

A red canary is a **hard gate**: it doesn't get logged and shrugged off, it escalates per the
project's escalation policy so a human decides whether to roll back. The whole point is to catch a
bad release in the first minutes, while a rollback is cheap, instead of via an angry user an hour
later.

## When to Activate

Activate when:
- A deploy just completed and you want to confirm real health before declaring success.
- The user says "watch the deploy", "canary this release", or "smoke the production URL".
- `release-engineer` / `/deploy` hands off after pushing a release.

**Do not activate** (adjacent skills own this):
- `deploy` — *performs* the release; `/canary` *verifies* it afterward.
- `benchmark` — measures performance *locally* against a baseline; `/canary` checks a *live deploy's*
  health.
- `investigate` — *fixes* the failure a red canary surfaces; `/canary` detects and escalates it.

## Core Concepts

- **Deploy ≠ healthy.** Running code can still 500; `/canary` proves the live paths work.
- **A short, bounded watch.** Poll key signals on an interval for a defined window, then declare
  clear — not an indefinite monitor.
- **Red is a hard gate.** A failed signal escalates per `${ctx.escalation_policy}`; it is never
  logged-and-ignored.
- **Real paths, real requests.** Health endpoint plus the handful of user journeys that matter,
  driven through `fac browse` / HTTP against the deployed URL.

## Workflow

Freedom level: **low** — poll defined signals, hard-stop on red, escalate.

1. **Establish the target.** Deployed URL, health endpoint, and the 2–4 critical paths to check
   (from the release context / `${ctx}`).
2. **Baseline probe.** One pass immediately after deploy:
   ```bash
   fac browse goto https://<deployed-url>/health
   ```
   plus HTTP checks on the key paths. A red first probe stops here — escalate, don't loop.
3. **Poll the window.** Re-probe on the interval for the defined window (e.g. every 30s for 5 min),
   tracking status codes, error text, and latency drift.
4. **Hard-stop on red.** On any failed signal, stop the watch immediately and escalate per
   `${ctx.escalation_policy}` — surface the disclaimer and recommend rollback. Do not attempt a fix.
5. **Record the verdict:**
   ```bash
   fac run artifact --step canary --body-file canary.md
   ```
   Green across the window → release confirmed healthy. Hand any red to `/investigate`.

## Examples

**Example:**
```
Input:  "Deploy's done — canary it."
Steps:  Target https://app.example.com, /health + [/, /login, /search].
        t+0: /health 200, all paths 200. Poll 30s ×10.
        t+90s: /search returns 500 (downstream index missing).
Output: HARD STOP at t+90s. canary.md — /search regressed to 500; escalation triggered
        per policy with disclaimer; recommend rollback. NN-canary.md recorded.
Handoff → /investigate the /search 500; rollback decision is the human's.
```

## Guidelines

1. Probe once immediately, then poll the defined window — don't declare healthy off a single pass.
2. Check real user paths, not just `/health`; a green health endpoint over a broken checkout is a
   false all-clear.
3. Treat any red as a hard gate: stop, escalate per policy, surface the disclaimer, recommend
   rollback.
4. Bound the watch — a canary has an end; it is not an indefinite monitor.
5. Never attempt a fix inside the canary; detection and repair are separate jobs.

## Gotchas

1. **Green health, broken feature.** `/health` says the process is up, not that checkout works. Probe
   the paths that matter.
2. **Swallowing a red.** Logging a failure and continuing defeats the gate — escalation is mandatory.
3. **Watching forever.** An unbounded loop isn't a canary; define the window and declare.
4. **Fixing mid-watch.** The moment you start editing code you've left `/canary` — hand off and let
   the human decide on rollback.

## Integration

- `deploy` / `release-engineer` — hands off to `/canary` right after a release.
- `${ctx.escalation_policy}` — a red canary escalates through it, with the disclaimer appended.
- `fac browse` — drives the live user-path probes against the deployed URL.
- `investigate` — receives a red canary's failure for root-cause and fix.
- Run harness (`fac run`) — records the verdict as `NN-canary.md`.

## References

- Substrate CLIs: `fac browse goto`, `fac run artifact`
- Config: `${ctx.escalation_policy}`, deployed URL / health endpoint from the release context
- Related skills: `deploy`, `investigate`, `benchmark`
- Libraries: `lib/run.ts`