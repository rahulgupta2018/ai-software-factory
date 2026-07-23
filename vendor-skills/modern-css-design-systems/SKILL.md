---
name: modern-css-design-systems
description: >
  Builds and reviews the styling layer of web UIs — Tailwind v4 with design tokens, shadcn/ui on
  Radix primitives, theming and dark mode, responsive and container queries, cascade layers,
  motion, and accessibility inside components. Activates when styling a React/web UI, setting up a
  token system or theme, choosing a CSS approach, or reviewing components for a11y and responsive
  behaviour. Owns the styling/design-system layer. Does not own component/data architecture
  (react-frontend-architect), visual art direction (frontend-design), or UX process/WCAG audits
  (ux-designer).
license: MIT
metadata:
  author: AI Software Factory (for this library)
  version: "0.1.0"
  last_updated: 2026-07-22
  category: coding
---

# Modern CSS & Design Systems

## Overview

Turns a visual direction into a coherent, accessible, themeable styling layer. Defaults to the
stack that AI-generated code handles best — **Tailwind v4 + design tokens + shadcn/ui (Radix
primitives)** — and supplies the tokens, theming, responsive strategy, and a11y that keep a UI
consistent as it grows. Assumes the model knows CSS syntax; this skill supplies the system-level
choices and the mistakes made without guidance.

**Freedom level: MEDIUM** — the token discipline and a11y floor are fixed; the palette/scale vary.

**Project binding (optional).** If `.agents/project-context.yaml` records a CSS choice in
`${ctx.tech_bindings}` (e.g. Tailwind vs vanilla-extract), follow it; otherwise use the default
below.

## When to Activate

Activate when:
- Styling a React/web UI, or setting up a token system, theme, or dark mode.
- Choosing a CSS approach (Tailwind vs CSS Modules vs type-safe tokens).
- Making a UI responsive (breakpoints, container queries) or adding motion.
- Reviewing components for accessibility and responsive behaviour.

**Do not activate** (adjacent skills own this):
- `react-frontend-architect` — owns component composition, state, and module boundaries.
- `frontend-design` — owns the visual/aesthetic direction (palette intent, typography personality).
- `ux-designer` — owns UX process, user flows, and formal WCAG audits.
- `fullstack-developer` — owns API/data wiring.

## Default Stack (override per project)

- **Tailwind v4** — CSS-first config (`@theme`), utility classes co-located with markup.
- **Design tokens** — colour/space/type/radius as CSS custom properties, referenced by Tailwind's
  theme; one source of truth for light and dark.
- **shadcn/ui on Radix** — copy-in accessible primitives (dialog, menu, popover) you own and
  restyle, rather than a black-box component library.
- **Escape hatches**: **vanilla-extract / Panda CSS** when the system needs *type-enforced* tokens;
  **plain modern CSS** (cascade layers + container queries + nesting via CSS Modules) when
  zero framework lock-in is a hard requirement.

## Core Concepts

- **Tokens are the contract.** Every colour, space, radius, and font-size is a named token, not a
  magic value. Components reference tokens; themes swap token values. A hardcoded `#3b82f6` or
  `margin: 13px` is a bug in a design system — it can't be themed and it drifts.
- **Theme by swapping token values, not rewriting components.** Light/dark and brand themes set the
  same custom properties to different values on a `:root` / `[data-theme]` scope; components never
  branch on the theme.
- **Cascade layers order the cascade on purpose.** `@layer base, components, utilities;` makes
  specificity predictable so a utility always wins over a base style without `!important` wars.
- **Container queries > viewport queries for components.** A card should respond to *its container*,
  not the whole viewport, so it works in a sidebar and a full-width grid alike (`@container`).
- **Accessibility is structural, not a coat of paint.** Radix/shadcn gives correct roles, focus
  management, and keyboard handling; keep them. Visible focus, adequate contrast, respected
  `prefers-reduced-motion`, and real labels are the floor, not extras.

## Output Template (tokens + a themed component)

```css
/* app.css — tokens as custom properties, themed by value swap; ordered layers. */
@layer base, components, utilities;

@theme {
  --color-bg: oklch(0.99 0 0);
  --color-fg: oklch(0.2 0 0);
  --color-accent: oklch(0.62 0.19 255);
  --radius-card: 0.75rem;
  --space-card: 1rem;
}

[data-theme="dark"] {
  --color-bg: oklch(0.2 0 0);
  --color-fg: oklch(0.96 0 0);
}
```

```tsx
// Card.tsx — references tokens via Tailwind theme; container-aware; no hardcoded values.
export function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="@container rounded-[--radius-card] bg-bg text-fg p-[--space-card]
                    shadow-sm @md:p-6 motion-safe:transition-colors">
      {children}
    </div>
  );
}
```

## Review Checklist

- [ ] Colours/space/type/radius come from tokens; no hardcoded hex or magic numbers in components
- [ ] Light and dark themes swap token values only; components don't branch on theme
- [ ] Cascade layers declared; no `!important` used to win specificity fights
- [ ] Components respond via container queries where they're placed in variable-width slots
- [ ] Interactive elements come from accessible primitives (Radix/shadcn), roles/keyboard intact
- [ ] Visible keyboard focus on every interactive element; contrast meets AA
- [ ] Motion is `motion-safe:` / respects `prefers-reduced-motion`
- [ ] Real labels/`aria-*` where content isn't self-describing; icons-only buttons have names

## Guidelines

1. Name a token before you use a value twice; never inline a raw colour or spacing in a component.
2. Build interactive widgets on Radix/shadcn primitives — don't hand-roll a dialog/menu/combobox.
3. Prefer container queries for component responsiveness; reserve viewport queries for page layout.
4. Gate every animation behind `motion-safe:`; keep durations short and purposeful.
5. Reach for vanilla-extract/Panda only when you need compile-time-checked tokens; reach for plain
   CSS Modules only when framework lock-in is disallowed.

## Gotchas

1. **Hardcoded values defeat theming**: a literal `#fff`/`14px` in a component can't be re-themed
   and silently diverges from the system. Route it through a token.
2. **`!important` specificity wars**: reaching for `!important` usually means the cascade isn't
   layered. Declare `@layer` order instead.
3. **Icon-only buttons with no name**: a button containing only an SVG is invisible to screen
   readers. Add `aria-label` (and a tooltip for sighted users).
4. **Removing Radix focus styles**: overriding the primitive's outline for looks breaks keyboard
   users. Restyle the focus ring, never remove it.
5. **Viewport queries for components**: a card sized by `md:` breakpoints breaks when reused in a
   narrow sidebar. Use `@container`.
6. **Unconditional motion**: transitions/animations that ignore `prefers-reduced-motion` cause
   real harm (vestibular). Wrap in `motion-safe:`.
7. **Dark mode as a second stylesheet**: maintaining parallel dark styles rots. Swap token values
   on a `[data-theme]` scope so one component definition serves both.

## Integration

- `frontend-design` — supplies the palette/typography *intent*; this skill encodes it as a token
  system and accessible components.
- `react-frontend-architect` — structures the components this skill styles.
- `ux-designer` — owns formal accessibility/WCAG audits and user-flow validation.
- `fullstack-developer` — wires the data these components render.

## References

- Best practices: https://agentskills.io/skill-creation/best-practices
