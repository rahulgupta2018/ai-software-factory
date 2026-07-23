---
name: second-opinion
description: "Get a cross-model review of a plan, a diff, or a hard decision from a different AI (host-configured, e.g. Codex) — and route every outbound byte through the redaction guard first so no secret leaves the machine. Three modes: review (find what's wrong), challenge (argue the other side), consult (open-ended advice). Activates on \"second opinion\", \"what would another model say\", \"sanity-check this\", or a high-stakes call worth a dissenting read; owns cross-model consultation. Does not replace /review (in-model diff review) or make the final call for you."
license: MIT
metadata:
  author: AI Software Factory
  version: 0.1.0
  last_updated: 2026-07-22
  layer: Ops
  priority: FF
---

# Second Opinion

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

`/second-opinion` sends a plan, a diff, or a decision to a *different* model — a host-configured
external reviewer such as Codex — and brings back its read. A second model catches what the first
one is blind to: shared assumptions, a design smell the author rationalised, an edge case the
in-model review kept missing. It's most valuable exactly when the stakes are high and the first
answer felt a little too comfortable.

The non-negotiable is egress safety. Everything sent out first passes through the **redaction
guard** (`lib/redact.ts`): a HIGH-tier secret hard-blocks the send, and lower-tier findings are
redacted or confirmed before a single byte leaves. A cross-model consult must never become a
credential leak — the guard is the gate the outbound prompt funnels through.

## When to Activate

Activate when:
- The user asks "second opinion", "what would another model say", or "sanity-check this".
- A high-stakes plan or decision is worth a deliberate dissent before committing.
- An in-model review keeps passing something that still feels wrong.

**Do not activate** (adjacent skills own this):
- `review` — does the primary in-model diff review; `/second-opinion` is the *external, cross-model*
  read, not a replacement for it.
- `plan-arch` / `plan-product` — *make* the decision; `/second-opinion` stress-tests one that exists.
- `investigate` — roots out a *bug*; `/second-opinion` critiques a *plan or diff*, and never edits
  code itself.

## Core Concepts

- **A different model, different blind spots.** The value is disagreement — a fresh set of
  assumptions, not a rubber stamp.
- **Redaction guard on every send.** Outbound content passes `redactForSink`; HIGH secrets block,
  others redact/confirm — no secret leaves the machine.
- **Three modes.** *review* (find what's wrong), *challenge* (argue the opposing case), *consult*
  (open-ended advice) — pick per the question.
- **Advisory, not authoritative.** The other model informs your call; it doesn't make it or edit the
  code.

## Workflow

Freedom level: **medium** — frame, screen, send, synthesise.

1. **Pick the mode and frame the ask.** review / challenge / consult, plus the specific question and
   the artifact (plan, diff, decision) to send.
2. **Screen the outbound content — mandatory.** Run every byte through the redaction guard before it
   leaves:
   ```bash
   fac redact --from-file outbound-prompt.md
   ```
   A HIGH finding **blocks** — remove the secret and rescreen; MEDIUM findings are redacted or
   confirmed. Never send unscreened content.
3. **Send to the configured model** (host-configured external reviewer) with the screened prompt.
4. **Synthesise, don't parrot.** Weigh the response against the in-model view; call out where they
   agree (higher confidence), where they diverge (dig in), and what you'd actually change.
5. **Record the consult and any resulting decision:**
   ```bash
   fac run artifact --step second-opinion --body-file second-opinion.md
   fac decision log --decision "…" --rationale "second-opinion: …" --scope repo --source agent --confidence 7
   ```

## Examples

**Example:**
```
Input:  "Get a second opinion on this auth-refactor plan — challenge mode."
Steps:  Frame: "argue why this token-rotation design is wrong." Screen the plan through
        fac redact → 1 MEDIUM (an example bearer token) redacted; clean to send. Send to Codex.
        Response: flags a race between rotation and in-flight requests the in-model plan missed.
Output: second-opinion.md — both models like the rotation cadence; the external one surfaces a
        rotation/in-flight race → add a grace window. Logged as a decision. NN-second-opinion.md
        recorded.
Handoff → /plan-arch folds the grace window into the design.
```

## Guidelines

1. Screen every outbound byte through the redaction guard before sending — no exceptions.
2. Pick the mode deliberately: challenge for stress-testing, review for finding faults, consult for
   open questions.
3. Synthesise both views; agreement raises confidence, divergence is where the value is.
4. Keep it advisory — the other model informs the call, it doesn't make it and it doesn't edit code.
5. Log a durable outcome as a decision so the consult isn't lost.

## Gotchas

1. **Unscreened send.** The single worst failure — a secret in the prompt leaves the machine. Always
   `fac redact` first; a HIGH finding is a hard stop.
2. **Rubber-stamp bias.** If you frame it to agree, it will; frame for genuine critique (challenge
   mode) when you want signal.
3. **Parroting the response.** The other model's answer isn't the verdict; weigh it against your own
   view and decide.
4. **Letting it edit.** `/second-opinion` critiques; it does not apply changes. Route accepted
   changes back through the owning skill.

## Integration

- `lib/redact.ts` (`fac redact`) — the mandatory egress gate every outbound prompt passes through.
- `review` — the in-model counterpart; `/second-opinion` adds the external, cross-model read.
- `fac decision` — records a durable outcome from the consult.
- Host config — supplies the external model (e.g. Codex); the skill stays model-agnostic.
- Run harness (`fac run`) — records the consult as `NN-second-opinion.md`.

## References

- Substrate CLIs: `fac redact`, `fac decision`, `fac run artifact`
- Related skills: `review`, `plan-arch`, `investigate`
- Libraries: `lib/redact.ts`, `lib/decision.ts`, `lib/run.ts`