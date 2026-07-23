---
name: qa
description: >-
  Exercises the running app in a real browser to find bugs before they ship, then writes a
  bug-list artifact and regression tests. Activates when a build is runnable and needs
  behavioural verification. Uses the browse tool localhost-only by default. Does not own
  reviewing the diff (/review) or landing the change (/ship).
license: MIT
metadata:
  author: AI Software Factory
  version: 0.1.0
  last_updated: 2026-07-22
  layer: Build
  priority: V1
---

# QA

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

`/qa` is the Factory's QA lead. It drives the *running* application in a real browser (via the
`browse` tool), reproduces the V1 user flows, finds bugs the diff review can't see, writes a
bug-list artifact into the run, and captures regression tests so the same bug can't return. Where
`/review` reads the code, `/qa` exercises the product.

## When to Activate

Activate when:
- A build is runnable (dev server or preview URL) and needs behavioural verification.
- The user asks to "QA this", "test the app", or "find bugs before shipping".
- `/ship` requests a QA gate on a user-facing change.

**Do not activate** (adjacent skills own this):
- `review` — owns reviewing the diff; `/qa` exercises the running app.
- `investigate` — owns deep root-causing of one bug; `/qa` finds and reproduces across flows.
- `benchmark` — owns performance-regression measurement; `/qa` is functional correctness.
- `ship` — owns landing; `/qa` is a gate before it.

## Core Concepts

- **The running app is the input.** `/qa` needs a live URL. Default to **localhost only** — the
  `browse` tool refuses external origins unless the operator passes an explicit allow flag.
- **Flows from the PRD.** Test the V1 user journeys the PRD names, plus the change's new
  behaviour. A bug is a deviation from the PRD's stated outcome.
- **Reproduce, don't just observe.** Every bug gets exact steps to reproduce so it's fixable and
  testable. An unreproducible "seems off" is a note, not a bug.
- **The bug list is the artifact.** Findings land in `.factory/runs/<id>/NN-qa.md` with steps,
  expected vs actual, and severity. Regression tests land in the repo's test suite.
- **Security of the surface.** The browser ingests untrusted page content — a prompt-injection
  vector. The `browse` tool runs the layered content-security stack; never disable it to "make a
  page load".

## Workflow

Freedom level: **medium** — cover the flows, adapt to what the app exposes.

1. **Read context.** Load the merged product context (per the config protocol) for `commands`
   (how to run the app), the PRD's V1 flows, and `guardrails`.
2. **Start the app.** Use the stack's run/dev command. Confirm the localhost URL is live.
3. **Drive the flows** with the `browse` tool (`goto`, `click`, `type`, `snapshot`, `screenshot`)
   — localhost only unless the operator explicitly allows an external origin. Invoke it via
   `fac browse`, either one-shot or with a command script:
   ```bash
   # one-shot: launch → navigate → snapshot → close
   fac browse goto http://localhost:3000

   # a flow as a script (one command per line; # comments; snapshot prints wrapped page text)
   fac browse run --file - <<'EOF'
   goto http://localhost:3000/repairs
   click #new-repair
   type #title Broken boiler
   click button[type=submit]
   wait #repair-list
   snapshot #repair-list
   screenshot .factory/runs/<id>/qa-after-submit.png
   EOF
   ```
   Cover:
   - Each V1 user journey from the PRD.
   - The new behaviour introduced by the change.
   - Edge cases: empty states, invalid input, error paths, back/refresh.
4. **Record bugs.** For each, capture steps to reproduce, expected vs actual, and severity. Attach
   a screenshot where it clarifies.
5. **Write regression tests.** For each reproducible bug, add a test that fails on the bug and
   passes once fixed. Follow `tdd-red-green-refactor` (red first).
6. **Write the bug-list artifact** under an active run:
   ```bash
   fac run artifact --seq 4 --step qa --inputs PRD.md --body-file qa.md
   ```
7. **Gate.** A functional bug in a V1 flow is a blocking finding — surface it before `/ship`.
   Cosmetic issues are advisory.
8. **Hand off.** Point the user to fix + `/review` the fixes, or to `/ship` if clean.

## Practical Guidance

- Test the flow, not the widget. A button that clicks but doesn't persist is still a bug.
- Reproduce every bug with exact steps before logging it — unreproducible reports waste the fix.
- Keep `browse` on localhost. Only allow external origins with an explicit operator gate.
- Prefer a failing regression test over prose — the test is the durable proof the bug existed.

## Examples

**Example:**
```
Input:  Repair Tracker running at http://localhost:3000; change adds "assign contractor".
Output: 04-qa.md — BUG (high): assigning a contractor to a closed repair silently no-ops
        (steps: open a closed repair → assign → status unchanged; expected: rejected with a
        message). Regression test added (red → green after fix). Blocking finding raised.
```

## Guidelines

1. `/qa` needs a running app URL; drive it in a real browser via `browse`.
2. `browse` is localhost-only by default; external origins require an explicit operator flag.
3. Every bug has exact reproduction steps and expected vs actual.
4. Every reproducible bug gets a regression test (red first).
5. A V1-flow functional bug is a blocking finding before `/ship`.
6. Write the bug list as a run artifact.

## Gotchas

1. **Testing widgets, not flows**: misses the real defect. Follow the user journey end to end.
2. **Logging unreproducible "seems off"**: not actionable. Reproduce first or drop it.
3. **Disabling browser security to load a page**: opens the injection vector. Never.
4. **Skipping the regression test**: the bug returns. The test is the durable fix.

## Integration

- `browse` (Layer-3 tool) — drives the running app; localhost-only default + content-security stack.
- `tdd-red-green-refactor` (craft) — the red-first discipline for regression tests.
- Run harness (`fac run`) — stores the bug list; resume re-runs QA when the app or PRD changes.
- `review` — inspects the diff; `/qa` inspects the running product.
- `ship` — the landing step gated by this QA pass.

## References

- Browser tool: `tools/browse/` — invoke via `fac browse run|goto` (localhost-only default;
  `--allow-external` gate; verbs: goto, click, type/fill, press, wait, snapshot, screenshot,
  eval, title, url)
- V1 flows + outcomes: `PRD.md`
- Run artifacts: `.factory/runs/<id>/NN-qa.md`
- Related skills: `review`, `ship`, `investigate`, `benchmark`
