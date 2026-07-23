---
name: document
description: >-
  Turns a shipped change into the docs it needs — user-facing release notes plus
  Diataxis-shaped reference/how-to/tutorial/explanation content — grounded in what actually
  shipped, not what was planned. Composes technical-writer for the craft. Activates after
  /ship or /deploy, on "update the docs", "write release notes", or "document this". Owns
  documentation of shipped work, not the spec (/spec) or the code (build loop).
license: MIT
metadata:
  author: AI Software Factory
  version: 0.1.0
  last_updated: 2026-07-22
  layer: Ship
  priority: V1
---

# Document

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

`/document` is the Factory's doc writer. After a change ships, it produces the documentation that
change requires: **user-facing release notes** (what you can now do that you couldn't before) and,
where the change adds surface, **Diataxis-shaped** content — reference, how-to, tutorial, or
explanation. It grounds every claim in what actually shipped (the diff, the run artifacts), not in
what was planned, and records the doc update as a run artifact.

It is a *wrapper*: it composes `technical-writer` for the craft (audience, structure, runnable
examples) and adds the Factory discipline — release notes written from the real diff, Diataxis
categorisation, and a handoff that keeps docs in lockstep with shipped behaviour.

## When to Activate

Activate when:
- A change has shipped (`/ship` opened the PR, `/deploy` landed it) and the user says "update the
  docs", "write release notes", "document this", or "what changed for users".
- New public surface (a command, an API, a config, a flow) needs reference or how-to coverage.

**Do not activate** (adjacent skills own this):
- `spec` — writes the *pre-build* contract (what to build); `/document` writes the *post-ship*
  docs (what got built).
- `discover` / `plan-product` — own the PRD/vision, not user documentation.
- `technical-writer` (craft) — the writing engine this wrapper composes; `/document` frames it as
  release-notes + Diataxis grounded in the shipped diff.
- The build loop — owns code comments and inline docstrings for code it changed; `/document` owns
  the standalone docs.

## Core Concepts

- **The doc update is the artifact.** Release notes and any new/updated doc pages are recorded as a
  run artifact (`NN-document.md`) so the change ↔ docs link is explicit.
- **Ground in what shipped.** Write from the diff and the run artifacts, never from the plan. If a
  planned feature was cut, it isn't in the notes.
- **Release notes lead with the user.** "You can now export repairs to CSV" — the capability and
  its benefit — not "refactored the export module". Implementation detail stays out.
- **Diataxis picks the shape.** New surface maps to one of four modes: *tutorial* (learning-
  oriented), *how-to* (task-oriented), *reference* (information-oriented), *explanation*
  (understanding-oriented). Don't blur them.
- **Examples must run.** Any code/command in the docs is copy-pasteable and correct against the
  shipped version.

## Workflow

Freedom level: **medium** — ground in the diff; the doc types are fixed shapes.

1. **Read what shipped.** The merged diff and the run artifacts (`spec`, `build`, `review`,
   `deploy`). Identify the user-visible change and any new public surface.
2. **Write the release notes (`technical-writer`).** Lead with what the user can now do; plain
   language, benefit-first, implementation detail omitted. Only what actually shipped.
3. **Classify new surface via Diataxis.** For each new capability, decide which doc type it needs
   (tutorial / how-to / reference / explanation) — or none if it's self-evident.
4. **Write or update those pages** with runnable, verified examples against the shipped build.
5. **Check coverage.** Does every new command/endpoint/config have at least reference coverage? Flag
   gaps.
6. **Write the doc update as a run artifact.** Under an active run:
   ```bash
   fac run artifact --step document --inputs <merged-diff-or-deploy-artifact> --body-file docs-update.md
   ```
7. **Hand off.** Release notes go to the changelog/release; new pages go to the docs tree. Point the
   user at what changed.

## Practical Guidance

- Diff first, prose second — if it's not in the diff, it's not in the notes.
- One capability per release-note bullet; make someone want to try it.
- Match the reader's goal: someone learning needs a tutorial, someone stuck needs a how-to, someone
  looking up a flag needs reference. Don't hand a tutorial to someone who wants a flag.
- Verify every example against the shipped build before publishing.
- Keep internal/contributor detail out of user-facing notes; a separate "for contributors" section
  if needed.

## Examples

**Example:**
```
Input:  shipped PR #42 — repairs CSV export (endpoint + button). /deploy artifact present.
Notes:  "You can now export a filtered repair list to CSV — click Export on the repairs page
        to download exactly the rows you're viewing." (benefit-first, no impl detail.)
Diataxis: how-to "Export repairs to CSV" (task), reference row for the export endpoint +
        columns. No tutorial (self-evident from the button).
Output: run artifact NN-document.md — release-note entry + how-to page + reference update,
        examples verified against the deployed build. Handoff → changelog + docs tree.
```

## Guidelines

1. Ground every claim in the shipped diff/artifacts, never the plan.
2. Release notes lead with user capability and benefit; omit implementation detail.
3. Classify new surface with Diataxis; don't blur tutorial/how-to/reference/explanation.
4. Every example is runnable and verified against the shipped build.
5. Ensure new public surface has at least reference coverage; flag gaps.
6. Record the doc update as a run artifact.

## Gotchas

1. **Documenting the plan**: a cut feature in the notes is a lie; write from the diff.
2. **Implementation-first notes**: "refactored X" means nothing to a user; lead with the capability.
3. **Blurred Diataxis**: a reference page with tutorial asides serves neither reader.
4. **Stale examples**: a snippet that doesn't run against the shipped build erodes trust.
5. **Leaking internals**: contributor detail in user notes is noise; separate it.

## Integration

- `technical-writer` (craft) — supplies audience/structure/examples craft.
- `ship` / `deploy` — precede `/document`; their artifacts are its source of truth.
- `spec` — the pre-build counterpart; `/document` is the post-ship one.
- Run harness (`fac run`) — records the doc update as `NN-document.md`.

## References

- Writing craft: vendored `technical-writer`
- Diataxis framework (tutorial / how-to / reference / explanation)
- Related skills: `ship`, `deploy`, `spec`
- Agent: `agents/doc-writer.md`
