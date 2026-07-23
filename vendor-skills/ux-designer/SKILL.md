---
name: ux-designer
description: >
  Applies user-centred design — research, personas, user flows, wireframes, IA, UX microcopy, and
  usability/accessibility review. Activates when planning user research, creating wireframes or
  prototypes, designing flows, writing interface copy, or reviewing a design for usability/WCAG.
  Owns user experience design. Does not own developer documentation or data-chart selection.
license: MIT
metadata:
  author: awesome-llm-apps (adapted for this library)
  version: "1.2.0"
  last_updated: 2026-07-02
  category: design
---

# UX Designer

## Overview

Helps teams create intuitive, accessible experiences across the design process — discover →
define → ideate → prototype/test → handoff — with a fixed priority order: **User needs →
Accessibility → Usability → Visual hierarchy → Consistency**. The detailed rules live in
`references/`; this file is the operating loop, templates, and gotchas.

**Freedom level: MEDIUM** — process and priority are fixed; craft varies by product.

## When to Activate

Activate when:
- Planning/conducting user research; building personas or journey maps.
- Creating wireframes/prototypes, designing flows, or writing UX microcopy.
- Reviewing a design for usability or accessibility.

**Do not activate** (adjacent skills own this):
- `technical-writer` — owns developer/user *documentation*, not in-product UX.
- `visualization-expert` — owns chart/dashboard design for data.

## Process & Rules

Discover (research) → Define (personas, journeys, "How Might We") → Ideate (sketch → lo/hi-fi) →
Prototype & test (task success, time on task, error rate) → Handoff (specs, all states).

Deep rules, load on demand:
- `references/research.md` (interviews, personas), `references/accessibility.md` (WCAG) — CRITICAL
- `references/information-architecture.md`, `references/interaction-design.md` — HIGH
- `references/visual-design.md` — MEDIUM · Full compiled list: `references/ux-design-guidelines.md`.

## Templates

**Persona**: name · demographics · goals · pain points · behaviours · representative quote.
**User flow**: goal · entry point · success criteria · steps (screen → action → next) · error
states · decision points.
**Design review**: Usability issues (severity + why + fix) · Accessibility (WCAG criterion + fix)
· Improvement opportunities · Strengths to preserve.

## Guidelines

1. Validate assumptions with real users before designing; ground personas in data.
2. Meet WCAG AA: visible labels (not placeholder-only), ≥44×44px targets, descriptive errors,
   colour never the sole signal.
3. One primary action per screen; make optional steps skippable.
4. Specify every state (empty/loading/error/success) at handoff.

## Gotchas

1. **Placeholder as label**: placeholder text disappears on input and fails screen readers — always
   use a visible label.
2. **Colour-only meaning**: status/step shown only by colour excludes colour-blind users; add
   text/icon.
3. **Hard gates in onboarding**: blocking the flow on e.g. email verification kills activation —
   let users proceed and verify in the background.
4. **No progress indicator**: multi-step flows without "step N of M" raise abandonment.
5. **Research theatre**: leading questions confirm your design instead of testing it; ask about
   past behaviour, not hypotheticals.

## Integration

- `technical-writer` — user-facing docs that accompany the product.
- `visualization-expert` — data displays within a UI.
- `fullstack-developer` — implementation and design handoff.

## References

- `references/` (this folder) — full rule set incl. the compiled `references/ux-design-guidelines.md`; load the relevant file on demand.
- Best practices: https://agentskills.io/skill-creation/best-practices
