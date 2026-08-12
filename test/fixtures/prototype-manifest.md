---
# Reference prototype manifest — parsed and verified by test/prototype-plan.test.ts so this
# fixture can't drift silent. It is the machine record `/prototype` emits alongside the
# 02b-prototype/ HTML: the design record's screens + navigation graph + tokens (the inputs it
# renders from) and the generated pages (what it produced), so lib/prototype-plan.ts can prove
# FULL coverage offline — every screen has a page, every navigation edge resolves to a working
# in-prototype link, and no page uses a token the design record never defined.
product: "Repair Tracker"

# The design record's complete screen inventory (02a-plan-design.md).
screens:
  - id: onboarding
    title: "First-run welcome"
  - id: repair-list
    title: "Outstanding repairs"
  - id: repair-detail
    title: "Repair detail"
  - id: assign-sheet
    title: "Assign contractor (sheet)"
  - id: empty-state
    title: "No repairs yet"

# The design tokens the record emits as code (colour / space / type / radius). A prototype page
# may only use tokens named here — anything else is invented fidelity (the failure mode).
tokens:
  - color-bg
  - color-surface
  - color-fg
  - color-accent
  - space-4
  - space-8
  - space-12
  - space-16
  - radius-sm
  - radius-md
  - type-display
  - type-body
  - type-mono

# The design record's every-edge navigation graph: from-screen → action → to-screen.
nav:
  - from: onboarding
    action: "Get started"
    to: repair-list
  - from: repair-list
    action: "Tap a repair"
    to: repair-detail
  - from: repair-list
    action: "Empty backlog"
    to: empty-state
  - from: repair-detail
    action: "Assign"
    to: assign-sheet
  - from: assign-sheet
    action: "Dismiss sheet"
    to: repair-detail
  - from: empty-state
    action: "Log first repair"
    to: repair-detail

# The generated prototype pages — one self-contained HTML page per screen, the links each wires
# from the navigation graph, and the tokens its styling uses.
pages:
  - screen: onboarding
    links: [repair-list]
    tokens_used: [color-bg, color-accent, type-display, space-16]
  - screen: repair-list
    links: [repair-detail, empty-state]
    tokens_used: [color-bg, color-surface, color-fg, type-body, space-8, radius-md]
  - screen: repair-detail
    links: [assign-sheet]
    tokens_used: [color-surface, color-fg, type-body, type-mono, space-12, radius-sm]
  - screen: assign-sheet
    links: [repair-detail]
    tokens_used: [color-surface, color-accent, type-body, space-8, radius-md]
  - screen: empty-state
    links: [repair-detail]
    tokens_used: [color-bg, color-fg, type-display, space-16]

updated: "2026-08-12"
---

# Repair Tracker — Prototype Manifest (reference)

The machine record `/prototype` emits beside the `02b-prototype/` HTML. The frontmatter above is
the source of truth `lib/prototype-plan.ts` verifies; this prose is the human-readable narrative.

- **Every screen has a page.** The five screens in the inventory each render one self-contained
  HTML page — a screen with no page fails the coverage gate.
- **Every navigation edge resolves.** Each `from → action → to` edge is wired as a working
  in-prototype `<a href>` that lands on an existing page — a dangling route fails.
- **Fidelity is verbatim.** Every token a page uses is one the design record defined; the prototype
  invents no colours or spacing of its own.
