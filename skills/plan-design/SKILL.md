---
name: plan-design
description: >-
  Turns a settled PRD.md with a web or mobile UI surface into a defensible UI spec — visual
  direction, a design-token system, component inventory, user flows, accessibility floor, and
  any data-viz — scored 0–10 per design dimension with an AI-slop check before the build loop.
  Activates once the PRD's problem/users/V1 are settled and a component has a UI to design.
  Sits between /plan-arch (the stack) and the build loop; owns the design record, not the
  implementation.
license: MIT
metadata:
  author: AI Software Factory
  version: 0.1.0
  last_updated: 2026-07-22
  layer: Plan
  priority: V1
---

# Plan-Design

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

`/plan-design` is the Factory's designer. It reads a settled `PRD.md` and the machine-owned
`.factory/stack.yaml`, and for any component with a UI it produces a **UI spec**: the visual
direction, a design-token system, a component inventory, the primary user flows and information
architecture, an accessibility floor, and any data-visualisation needs. It does not write app
code — it produces the design record the build loop realises.

It is a *wrapper*: it composes the design craft skills rather than re-deriving them —
`frontend-design` for intentional visual direction, `modern-css-design-systems` for the token
system and accessible components, `ux-designer` for flows/IA/WCAG process, and
`visualization-expert` for any charts. On top of them it adds two things the Factory needs: a
**0–10 score per design dimension** (so quality is explicit, not vibes) and an **AI-slop check**
(so the result is a choice for this brief, not one of the templated defaults).

## When to Activate

Activate when:
- `PRD.md` is settled (`status: in-design`/`in-build`) and `.factory/stack.yaml` has a component
  with a UI (e.g. `framework: react`, a `css` binding).
- The user asks to "design the UI", "create mockups", "build the design system", or "review the
  design".

**Do not activate** (adjacent skills own this):
- `discover` — owns the human half of `PRD.md` (problem, users, goals, V1).
- `plan-arch` — owns the tech stack (`tech_stack`, `commands`, `skills`). `/plan-design` reads it,
  never writes it.
- `frontend-design` / `modern-css-design-systems` / `ux-designer` / `visualization-expert` — the
  craft skills this wrapper composes; it orchestrates and scores them, it doesn't replace them.
- The build loop (Implementer + `/review`) — owns *implementing* the spec this skill writes.

## Core Concepts

- **The UI spec is the artifact.** The design decision — direction, tokens, components, flows,
  a11y, scores — is recorded as a run artifact (`02a-plan-design.md`) so the reasoning survives and
  the build loop resumes from it. It records the input hash of `PRD.md` (and the stack), so a PRD
  change re-runs design (make-like cascade).
- **Design only where there's a UI.** If no component has a UI surface, `/plan-design` is a no-op
  — say so and hand back. Don't invent a design for an API-only product.
- **Web and mobile are different surfaces.** The web branch composes `frontend-design` +
  `modern-css-design-systems` (Tailwind v4, shadcn/Radix, container queries). A **mobile** component
  (`framework: flutter`) is *not* web: design to the platform — Material 3 / Cupertino conventions,
  platform navigation (tabs/bottom-nav, back behaviour), touch-target ergonomics, offline/empty/
  error/sync states, and the security-visible UX from MASVS (no sensitive data in screenshots,
  secure text entry). The token/direction thinking (`frontend-design`) still applies; the component
  vocabulary is Flutter widgets, and implementation routes to `flutter-dart-expert`, not the web
  craft skills. A11y is platform a11y (TalkBack/VoiceOver, dynamic type, contrast).
- **Wrap, don't re-derive.** Direction comes from `frontend-design`, the token system and
  accessible components from `modern-css-design-systems`, flows/IA/WCAG from `ux-designer`, charts
  from `visualization-expert`. This skill sequences them and holds the quality bar.
- **Score every dimension 0–10.** Rate the design across a fixed set of dimensions (visual
  hierarchy, typography, colour/contrast, spacing/layout, motion, accessibility, content/microcopy,
  distinctiveness). For each, say what a 10 looks like and where this design sits — a low score is
  a build task, not a nag.
- **AI-slop check is a gate, not a garnish.** Before handing off, critique the direction against
  the templated defaults (`frontend-design`'s three clusters). If any axis reads like the generic
  answer for any product rather than a choice for *this* brief, revise it and say what changed.

## Workflow

Freedom level: **medium** — follow the sequence, adapt the design to the brief.

1. **Read context.** Load `PRD.md` (problem, users, brand cues, V1) and `.factory/stack.yaml`.
   Identify each UI surface and its platform: a **web** component (`framework: react`, a `css`
   binding) or a **mobile** component (`framework: flutter`). Confirm there is a UI; if not, stop
   and hand back. Design each surface to its platform.
2. **Set the direction (`frontend-design`).** Ground it in the subject; produce a compact plan —
   palette (4–6 named values), a deliberate type pairing, a layout concept, and the one signature
   element. Do the brainstorm-then-critique pass in thinking. (Applies to web and mobile alike.)
3. **Systematise it.** **Web** (`modern-css-design-systems`): a token system (colour/space/type/
   radius as custom properties, themed by value), a component inventory on accessible primitives
   (shadcn/Radix), theming/dark mode, and the responsive strategy (container queries). **Mobile**
   (`framework: flutter`): a Material 3 / Cupertino theme, a Flutter widget inventory, platform
   navigation, and offline/empty/error/sync states — implementation routes to `flutter-dart-expert`,
   not the web craft skills.
4. **Map flows + IA + a11y (`ux-designer`).** The primary user flows for the V1 features, the
   information architecture, and the accessibility floor (focus, contrast, reduced motion, labels).
5. **Data-viz if needed (`visualization-expert`).** For any component that presents data, choose
   the honest chart type and its states.
6. **Score 0–10 per dimension.** For each design dimension, state what a 10 looks like and where
   this design lands, with the concrete gap to close.
7. **Run the AI-slop check.** Compare against the templated defaults; revise any axis that reads
   generic and record what changed and why.
8. **Write the UI spec as a run artifact.** The UI spec sits between `/plan-arch` (02) and the build
   (03), so it is a **branch artifact** with a sub-sequence seq (`2a`, the next free letter under
   step 2 — never `3`, which is the build):
   ```bash
   fac run artifact --seq 2a --step plan-design --inputs PRD.md,.factory/stack.yaml --body-file ui-spec.md
   ```
   The spec's tokens and component inventory are exactly what the web build (`fullstack-developer`
   + `react-frontend-architect` + `modern-css-design-systems`) implements. **The web build records
   this artifact (`02a-plan-design.md`) as one of its inputs**, so a design change re-opens the
   build (make-like cascade).
9. **Hand off.** Point the build loop at the spec: implement the web component (`fullstack-developer`
   + `react-frontend-architect` + `modern-css-design-systems`) or the mobile component
   (`flutter-dart-expert`), then `/review`, `/qa`, `/ship`.

## Practical Guidance

- Spend boldness in one place (the signature element); keep the rest quiet. Score distinctiveness
  honestly — a safe, templated design should not score above ~5.
- Make tokens real and named; the build loop implements the spec verbatim, so a vague spec yields a
  vague UI.
- Keep the accessibility floor non-negotiable: visible focus, AA contrast, respected reduced
  motion, real labels. Treat these as pass/fail, not scored.
- Design for the V1 flows the PRD names — not a component library for a product that doesn't exist
  yet.
- Do the iteration in thinking; show the user a tight plan, not every discarded idea.

## Examples

**Example:**
```
Input:  PRD.md — Repair Tracker (log/assign/track repairs, reminders), status: in-design.
        stack.yaml — web component: react + tailwind-v4.
Output: run artifact 02a-plan-design.md (ui-spec) —
          direction: palette (5 named values), display/body/utility type pairing, layout concept,
                     signature = a "repair timeline" strip
          tokens:    color/space/type/radius as custom properties; dark mode by value-swap
          components: shadcn/Radix inventory (dialog, table, form, toast); container-query cards
          flows:     log → assign → track; IA; a11y floor (focus/contrast/reduced-motion/labels)
          scores:    hierarchy 8, type 7, colour 8, spacing 8, motion 6, a11y pass,
                     content 7, distinctiveness 7  (+ what a 10 looks like per dim)
          ai-slop:   revised the hero away from "big-number + gradient" default → timeline thesis
        Handoff → build loop (implement web component → /review → /qa → /ship).
```

## Guidelines

1. Read the stack; design only components that have a UI. API-only → no-op, hand back.
2. Never write `tech_stack`/`commands`/`skills` — that's `/plan-arch`. Read them, don't touch them.
3. Every dimension gets a 0–10 score with a concrete gap; accessibility is pass/fail, not scored.
4. Always run the AI-slop check before handoff; record what you revised.
5. Record the UI spec as a run artifact so the build loop resumes from it.

## Gotchas

1. **Designing an API-only product**: no UI surface means no design. Don't manufacture one — stop
   and hand back.
2. **Leaking into the stack**: writing `css`/`framework`/`commands` is `/plan-arch`'s job; a design
   preference that needs a stack change is a note back to the architect, not an edit here.
3. **Vibes instead of scores**: "looks good" isn't a spec. Score each dimension and name the 10.
4. **Skipping the slop check**: shipping one of the three templated looks unexamined is the failure
   mode this skill exists to prevent.
5. **Spec too vague to build**: unnamed tokens and hand-wavy components force the build loop to
   guess. Make the spec implementable verbatim.

## Integration

- `discover` — owns the PRD this skill reads (problem, users, brand cues).
- `plan-arch` — owns the stack this skill reads (which components have a UI); design never writes it.
- `frontend-design` — supplies the visual direction and the AI-slop critique this skill applies.
- `modern-css-design-systems` — supplies the token system and accessible component inventory.
- `ux-designer` — supplies user flows, IA, and the WCAG/accessibility process.
- `visualization-expert` — supplies chart selection for data-presenting components.
- `flutter-dart-expert` — implements the **mobile** UI spec (Flutter widgets, platform patterns,
  MASVS); the design here routes mobile implementation to it, not the web craft skills.
- Run harness (`fac run`) — records the UI spec as `02a-plan-design.md`; resume re-runs design when
  `PRD.md` changes.
- The build loop — implements the spec verbatim: web via `fullstack-developer` +
  `react-frontend-architect` + `modern-css-design-systems`, mobile via `flutter-dart-expert`.

## References

- Human context: `PRD.md` (owned by `/discover`)
- Machine context: `.factory/stack.yaml` (owned by `/plan-arch`)
- Design craft: `frontend-design`, `modern-css-design-systems`, `ux-designer`, `visualization-expert`
- Worked example: `examples/reference-product/` (web component: react + tailwind-v4)
- Related skills: `discover`, `plan-arch`, and the build loop (`/review`, `/qa`, `/ship`)
