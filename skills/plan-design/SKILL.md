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
  version: 0.5.0
  last_updated: 2026-07-30
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
- **Primitives are defined here, not deferred.** The design-token layer is mandatory and concrete —
  a **spacing scale** (base unit + steps), a **radius scale**, an **elevation/shadow scale**, a
  **complete type scale** (size + weight + line-height + letter-spacing per role, not just
  size/font), a **component-state matrix** (padding/radius/border/elevation across
  default/pressed/disabled/focus/error), and a **motion scale** (named durations + easing curves per
  interaction, mapped to the widgets that use them). Emit them **as code** — CSS custom properties +
  a theme/Tailwind config (web) or a Dart `ThemeData` + token file (mobile). "Define the spacing
  scale before the first widget" is not a hand-off note — it *is* this skill's job. A design the
  build implements *verbatim* cannot leave the grid, radii, elevation, component states, or motion
  durations undefined — a prose motion table the build must "transcribe into tickets" is a deferred
  primitive, not a defined one.
- **The navigation is mapped completely, not sketched.** The spec includes *every* screen (incl.
  onboarding, modals, sheets, empty/error/permission routes), a **navigation graph** of every
  `screen → action → screen` transition (with back/entry behaviour), and a **Mermaid screen-flow
  diagram** — from cold-start/onboarding through every core feature. The primary user flows are a
  *walkthrough* of that map; a handful of happy paths and an IA tree are not the map. When the map
  spans multiple top-level clusters (tabs, sections), emit **one diagram per navigation cluster,
  stacked one after another** — a single diagram packed with disconnected subgraphs is laid out
  side-by-side into narrow, unreadable columns.
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
3. **Define the tokens & primitives — the layer the build implements literally.** Not a partial
   token list; the full system, each item concrete and emitted **as code**:
   - **Spacing scale** — a base unit (e.g. 4dp/px) and its steps (`4, 8, 12, 16, 24, 32, 48`), plus
     which step each layout gap / component padding uses. No "appropriate padding".
   - **Radius scale** and **elevation/shadow scale** — named steps, each mapped to the components
     that use it.
   - **Complete type scale** — per role: font, size, **weight**, **line-height**, letter-spacing
     (not just size + font).
   - **Component-state matrix** — for each interactive component, its padding / radius / border /
     elevation across **default / pressed (hover) / disabled / focus / error**.
   - **Motion scale** — named durations + easing curves per interaction (deal, reveal, sheet slide,
     feedback), each mapped to the widget/animation that uses it, emitted as a token file
     (`AppMotion` / `--duration-*` + `--ease-*`) plus the reduced-motion fallback — not a prose table
     the build must transcribe into tickets.
   - **Colour tokens** — named, with role and verified contrast pairs.
   Emit the whole system as code: **web** (`modern-css-design-systems`) → CSS custom properties + a
   theme/Tailwind config, plus the accessible component inventory (shadcn/Radix) + responsive
   strategy (container queries). **Mobile** (`framework: flutter`) → a Dart `ThemeData` + a token
   file, a Material 3 / Cupertino theme, a widget inventory, platform navigation, and
   offline/empty/error/sync states — implementation routes to `flutter-dart-expert`, not the web
   craft skills.
4. **Map the complete navigation, not just the primary flows (`ux-designer`).** Produce, in full:
   - **Screen inventory** — *every* screen, listed: onboarding, the core-feature screens, modals,
     sheets, settings sub-screens, and the empty / error / permission / offline routes. Not a
     representative subset.
   - **Navigation graph** — *every* edge as `from-screen → trigger/action → to-screen`, including
     back behaviour and modal dismissal. A hierarchical IA tree shows containment; this shows
     **transitions**, and both are required.
   - **Entry points** — how each screen is *reached*: cold start, deep link, notification,
     background-restore.
   - **Visual screen-flow diagram(s)** — the navigation graph as Mermaid (`flowchart` or
     `stateDiagram`), each validated with `fac diagram check` and embedded. When the map has
     multiple disconnected clusters (one per tab/section), emit **one diagram per navigation
     cluster, stacked one after another** so each renders at full width — never a single diagram
     whose disconnected subgraphs get packed into narrow side-by-side columns. Optionally lead with
     one compact overview (cold-start → the tab set):
     ```bash
     fac diagram check --file nav-onboarding.mmd   # then nav-play.mmd, nav-learn.mmd, … one per cluster
     ```
   Then the **accessibility floor** (focus order, contrast, reduced motion, labels). The primary V1
   flows are a *walkthrough* of this map, not a substitute for it.
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
          primitives (as code): spacing scale 4/8/12/16/24/32; radii sm4/md8/lg16; elevation e0/e1/e2;
                     type scale (display 24/700/1.2, body 16/400/1.5, mono 14/500/1.4 with letter-spacing);
                     component-state matrix (button/input/card × default/pressed/disabled/focus/error);
                     motion scale (fast 120ms / base 200ms / slow 320ms, ease-out + reduced-motion)
          tokens:    colour/space/type/radius as CSS custom properties + theme config; dark mode by value-swap
          components: shadcn/Radix inventory (dialog, table, form, toast); container-query cards
          navigation: full screen inventory (onboarding, list, detail, assign-sheet, empty/error)
                     + navigation graph (every screen→action→screen edge, back behaviour) +
                     one Mermaid screen-flow diagram per cluster, stacked (fac diagram check);
                     primary flows walk the map
          a11y:      floor (focus order/contrast/reduced-motion/labels)
          scores:    hierarchy 8, type 8, colour 8, spacing 8, motion 6, a11y pass,
                     content 7, distinctiveness 7  (+ what a 10 looks like per dim)
          ai-slop:   revised the hero away from "big-number + gradient" default → timeline thesis
        Handoff → build loop (implement web component → /review → /qa → /ship).
```

## Guidelines

1. Read the stack; design only components that have a UI. API-only → no-op, hand back.
2. Never write `tech_stack`/`commands`/`skills` — that's `/plan-arch`. Read them, don't touch them.
3. Define the full token & primitive system — spacing scale, radius scale, elevation scale, a
   complete type scale (size/weight/line-height/letter-spacing), a component-state matrix, and a
   motion scale (durations + easing) — and **emit it as code**. Never defer a primitive to "open for
   build loop"; that is this skill's job.
4. Map the navigation completely: every screen (incl. onboarding, modals, empty/error routes), every
   `screen → action → screen` edge with entry/back behaviour, and a Mermaid screen-flow diagram —
   emitted as **one diagram per navigation cluster, stacked** (never one crammed multi-subgraph
   diagram) — not just the primary flows and an IA tree.
4. Every dimension gets a 0–10 score with a concrete gap; accessibility is pass/fail, not scored. A
   *missing* primitive (undefined spacing scale, radii, or states) is not a "gap to 10" — it is
   incomplete output. Define it, then score.
5. Always run the AI-slop check before handoff; record what you revised.
6. Record the UI spec as a run artifact so the build loop resumes from it.

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
6. **Deferring the primitives**: pushing the spacing scale, radii, elevation, component states, or
   motion durations to "open for build loop" means the build *improvises* them — the exact opposite
   of "implements verbatim". Define every primitive here, as code (motion included — a durations/
   easing table the build must "transcribe into tickets" is a deferred primitive). This is the most
   common way a strong direction still ships a thin spec.
7. **Primary flows mistaken for the map**: 5 happy paths + an IA tree is a *sketch*, not the
   navigation map. Enumerate every screen (onboarding, modals, empty/error routes) and every
   `screen → action → screen` edge, and draw the Mermaid screen-flow — or the build invents the
   routes you left out.
8. **One crammed screen-flow diagram**: cramming every tab into a single Mermaid diagram makes its
   disconnected subgraphs render side-by-side as narrow, unreadable columns. Emit **one diagram per
   navigation cluster, stacked vertically**, so each gets the full page width.

## Integration

- `discover` — owns the PRD this skill reads (problem, users, brand cues).
- `plan-arch` — owns the stack this skill reads (which components have a UI); design never writes it.
- `frontend-design` — supplies the visual direction and the AI-slop critique this skill applies.
- `modern-css-design-systems` — supplies the token system and accessible component inventory.
- `ux-designer` — supplies the complete navigation map (screen inventory + graph), user flows, IA,
  and the WCAG/accessibility process.
- `diagram` (`fac diagram`) — validates (`check`) and renders the Mermaid screen-flow diagram.
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
