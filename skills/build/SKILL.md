---
name: build
description: "The build loop: implements the PRD's V1 features test-first, one component at a time, routing each component to the craft skill for its language and recording a per-component build artifact the review/QA loop reads. Activates once /plan-arch has written the stack (and /plan-design any UI spec) and there are V1 features to implement. Ends where /review begins."
license: MIT
metadata:
  author: AI Software Factory
  version: 0.1.0
  last_updated: 2026-07-24
  layer: Build
  priority: V1
---

# Build

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

`/build` is the Factory's build loop — the workflow shell around the craft skills. It reads the
architecture (`.factory/stack.yaml`), the UI spec (`02a-plan-design.md`) for any UI component, and
any slice spec (`02b-spec.md`), then implements the PRD's V1 features **test-first**, one component
at a time. For each component it loads the craft skill that matches the component's language, drives
the red-green-refactor loop in that component's own test tooling, runs the component's `commands.*`,
and records a **per-component build artifact** (`03-build-<name>.md`) so `/review` and `/qa` resume
from exactly what was built.

It is the BUILD analogue of `/plan-arch`: a thin, generated workflow skill that composes vendored
craft skills — it does not re-derive their language idioms, and it is the piece that wires BUILD
into the run harness so a run can actually leave the build phase.

## When to Activate

Activate when:
- `.factory/stack.yaml` exists with `tech_stack.components[]` (i.e. `/plan-arch` has run) and the
  PRD names V1 features to implement.
- Any UI component also has a `02a-plan-design.md` UI spec to implement against.
- The user asks to "build it", "implement the V1", or "start the build".

**Do not activate** (adjacent skills own this):
- `plan-arch` — chooses the stack this loop implements; `/build` never edits `stack.yaml`.
- `plan-design` — writes the UI spec; `/build` reads it, it doesn't design.
- `spec` — writes the slice contract; `/build` implements it.
- The craft skills (`fullstack-developer`, `python-expert`, `flutter-dart-expert`, …) — supply the
  language idioms; `/build` composes and sequences them, it doesn't replace them.
- `review` / `qa` / `ship` — run after the build artifact exists.

## Core Concepts

- **One build artifact per component.** For each entry in `tech_stack.components[]`, the loop
  produces `03-build-<name>.md` (e.g. `03-build-api.md`, `03-build-web.md`). This is what makes
  BUILD a first-class run step instead of a gap: without it, `fac run resume` reports "build
  missing" forever and `/review`/`/qa` have nothing to read.
- **Each build records what it read.** A component build records its inputs so a change upstream
  re-opens exactly that build (make-like cascade):
  - **always** `02-plan-arch.md` (the architecture);
  - **UI components** (`framework: react`/`flutter`) also `02a-plan-design.md` (the UI spec) — a
    design change re-opens the web/mobile build;
  - a **spec'd slice** also its `02b-spec.md`.
- **Language routing.** Each component's `language`/`framework` selects the craft skill:
  - TypeScript/React **web** → `fullstack-developer` + `react-frontend-architect` + `modern-css-design-systems`
  - TypeScript **API** → `fullstack-developer` + `typed-service-contracts`
  - **Java/Quarkus** → `java-quarkus-expert`
  - **Python** → `python-expert`
  - **Dart/Flutter (mobile)** → `flutter-dart-expert` (+ MASVS mobile-security checklist)
  - a component with a **`db`** → also `database-expert` (schema/index/migration/query, `${ctx.tenancy}`)
  - Google-ADK agent (`framework: adk`) → the `adk-*` bundle
  `tdd-red-green-refactor` and `typed-service-contracts` apply across languages via their dialects.
- **TDD is language-routed.** Apply the loop (one failing test → minimal pass → refactor) in the
  component's own tooling — **run `commands.<name>.test`, never a hardcoded runner** (TS → `bun
  test`/Vitest, Python → `pytest`, Java → JUnit, Flutter → `flutter test`).
- **Commands are guarded.** Run the component's `commands.*` as you go. `test`/`lint`/`typecheck`/
  `build` are safe; anything else (a `deploy`, a migration, anything destructive) must be classified
  with `fac guard` first and, if flagged, treated as a **hard gate** — stop and ask.

## Workflow

Freedom level: **medium** — the per-component loop and the artifact contract are fixed; the code is
yours.

1. **Read context.** Load the merged context (`tech_stack.components[]`, `commands`, PRD V1 lane),
   `02-plan-arch.md` (the architecture rationale), `02a-plan-design.md` if any component has a UI,
   and any `02b-spec.md` slice.
2. **For each component** in `tech_stack.components[]`:
   a. **Route.** Load the craft skill(s) for its `language`/`framework` (see Language routing).
   b. **Build test-first.** For each V1 feature in this component, write a failing test in the
      component's tooling (red), the minimal code to pass (green), then refactor under green
      (`tdd-red-green-refactor`). Follow `typed-service-contracts` at boundaries (parse-don't-
      validate, errors-as-values, no unhandled throws).
   c. **Run the component's checks.** `commands.<name>.test`, then `lint`/`typecheck`/`build`.
      Guard anything beyond those with `fac guard`. Leave this component's tree green.
   d. **Record the build artifact.** Under the active run, write `03-build-<name>.md` — what was
      built, the tests added, and any decisions:
      ```bash
      fac run artifact --seq 3 --step build-<name> \
        --inputs .factory/runs/$RUN/02-plan-arch.md[,.factory/runs/$RUN/02a-plan-design.md] \
        --body-file build-<name>.md
      ```
      Add `02a-plan-design.md` to `--inputs` for a UI component, and `02b-spec.md` for a spec'd
      slice. `--seq 3` for every component; the `--step build-<name>` makes the filenames distinct.
3. **Leave the whole tree green.** Every component's checks pass before handoff.
4. **Hand off.** The diff plus the `03-build-*.md` artifacts go to `/review`, which records them as
   inputs.

## Practical Guidance

- Build one vertical slice at a time; run that component's checks after each slice, not at the end.
- Implement the UI spec **verbatim** — the tokens and component inventory in `02a-plan-design.md`
  are the contract, not a suggestion.
- A mobile component is not a web component: build to the platform (Material 3 / Cupertino, offline
  states, secure storage per MASVS), test with `flutter test`.
- If a `commands.*` entry doesn't exist yet, that is a V1 task — write it, don't skip the check.
- Keep the component's language pinned to what `/plan-arch` chose; a stack change is a note back to
  the architect, not an edit here.

## Examples

**Example:**
```
Input:  stack.yaml — api (typescript/hono + postgres), web (react + tailwind-v4),
        reminders (python), mobile (dart/flutter); 02-plan-arch.md; 02a-plan-design.md (web+mobile).
Loop:   api      → fullstack-developer + typed-service-contracts + database-expert; bun test
        web      → fullstack-developer + react-frontend-architect + modern-css (impl 02a spec); bun test
        reminders→ python-expert; pytest
        mobile   → flutter-dart-expert (impl 02a mobile spec, MASVS); flutter test
Output: 03-build-api.md (inputs: 02-plan-arch), 03-build-web.md + 03-build-mobile.md
        (inputs: 02-plan-arch, 02a-plan-design), 03-build-reminders.md (inputs: 02-plan-arch).
        Tree green. Handoff → /review.
```

## Guidelines

1. One `03-build-<name>.md` artifact per component — the session isn't done until each exists.
2. Every build records `02-plan-arch.md`; UI builds also `02a-plan-design.md`; a slice also `02b-spec.md`.
3. Test-first, always: `commands.<name>.test` is the runner, never a hardcoded one.
4. Never edit `stack.yaml`, the PRD, or the UI spec — read them; changes are notes to their owners.
5. Guard any command beyond test/lint/typecheck/build with `fac guard`; a flagged command is a hard gate.
6. Leave the whole tree green before handing off to `/review`.

## Gotchas

1. **No build artifact**: skipping `03-build-<name>.md` strands the run at BUILD — `fac run resume`
   never advances and `/review`/`/qa` have nothing to read. Always record it.
2. **Ignoring the UI spec**: a web/mobile build that doesn't implement `02a-plan-design.md` throws
   away the whole design phase. Record it as an input and build it verbatim.
3. **Hardcoded test runner**: `npm test` on a Python or Flutter component is wrong — run
   `commands.<name>.test`.
4. **Unguarded destructive command**: a migration or deploy run mid-build without `fac guard` can
   damage real state. Classify first; hard-gate if flagged.
5. **Editing the stack**: a build-time stack preference is a note to `/plan-arch`, not an edit — the
   ownership split still holds in the build loop.

## Integration

- `plan-arch` — writes `stack.yaml` + `02-plan-arch.md`, the architecture this loop implements.
- `plan-design` — writes `02a-plan-design.md`, the UI spec UI components implement verbatim.
- `spec` — writes `02b-spec.md`, the slice contract a build implements.
- Craft skills — `fullstack-developer`, `react-frontend-architect`, `modern-css-design-systems`,
  `python-expert`, `java-quarkus-expert`, `flutter-dart-expert`, `database-expert`,
  `typed-service-contracts`, `tdd-red-green-refactor` — supply the per-language idioms.
- `guard` (`fac guard`) — classifies a command as destructive before the loop runs it.
- Run harness (`fac run`) — records `03-build-<name>.md` per component; a change to plan-arch, the
  UI spec, or a slice re-opens that component's build.
- `review` — reads the `03-build-*.md` artifacts as its inputs.

## References

- Machine context: `.factory/stack.yaml` (owned by `/plan-arch`)
- UI spec: `02a-plan-design.md` (owned by `/plan-design`)
- Agent: `agents/implementer.md`
- Worked example: `examples/reference-product/` (api, web, reminders, mobile)
- Related skills: `plan-arch`, `plan-design`, `spec`, `review`
