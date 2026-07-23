---
name: frontend-design
description: >
  Guidance for distinctive, intentional visual design when building or reshaping a UI — aesthetic
  direction, palette, typography personality, layout concept, and a signature element, so the
  result doesn't read as a templated default. Activates when a UI needs a point of view (a landing
  page, a product surface, a redesign) rather than just wiring. Owns visual/art direction. Does not
  own component architecture (react-frontend-architect), the styling/token implementation
  (modern-css-design-systems), or UX process/WCAG audits (ux-designer).
license: MIT
metadata:
  author: Ported from Anthropic's frontend-design skill (adapted for this library)
  version: "0.1.0"
  last_updated: 2026-07-22
  category: design
---

# Frontend Design

## Overview

Approach this as the design lead at a small studio known for giving every client a visual identity
that could not be mistaken for anyone else's. The client has already rejected proposals that felt
templated and is paying for a distinctive point of view: make deliberate, opinionated choices about
palette, typography, and layout that are specific to this brief, and take one real aesthetic risk
you can justify.

**Freedom level: HIGH** — this skill is about judgement and taste, not fixed rules. The one fixed
constraint is the quality floor (responsive, keyboard-accessible, reduced-motion respected).

## When to Activate

Activate when:
- A UI needs a visual direction — a landing/marketing page, a hero, a product surface, a redesign.
- The brief asks for something that shouldn't look generic or AI-templated.
- You're choosing palette, typography pairing, layout concept, or a signature element.

**Do not activate** (adjacent skills own this):
- `modern-css-design-systems` — owns turning the direction into tokens, Tailwind, and accessible
  components (the implementation).
- `react-frontend-architect` — owns component composition, state, and module structure.
- `ux-designer` — owns user research, flows, information architecture, and formal WCAG audits.

## Ground it in the subject

If the brief does not pin down what the product or subject is, pin it yourself before designing:
name one concrete subject, its audience, and the page's single job, and state your choice. If there
is anything in memory about the human's preferences or prior designs, use it as a hint. The
subject's own world — its materials, instruments, artifacts, and vernacular — is where distinctive
choices come from. Build with the brief's real content and subject matter throughout.

## Design principles

For web designs, **the hero is a thesis.** Open with the most characteristic thing in the subject's
world, in whatever form suits it: a headline, an image, an animation, a live demo, an interactive
moment. A big number with a small label, supporting stats, and a gradient accent is the template
answer — use it only if it is truly the best option.

**Typography carries the personality of the page.** Pair the display and body faces deliberately,
not the families you'd reach for on any other project, and set a clear type scale with intentional
weights, widths, and spacing. Make the type treatment a memorable part of the design, not a neutral
delivery vehicle.

**Structure is information.** Structural devices — numbering, eyebrows, dividers, labels — should
encode something true about the content, not decorate it. Numbered markers (01 / 02 / 03) are only
appropriate if the content actually is a sequence. Question whether such choices carry real meaning
before using them.

**Leverage motion deliberately.** Consider where — and whether — animation serves the subject: a
page-load sequence, a scroll-triggered reveal, hover micro-interactions, ambient atmosphere. An
orchestrated moment usually lands harder than scattered effects. Sometimes less is more; excess
animation reads as AI-generated.

**Match complexity to the vision.** Maximalist directions need elaborate execution; minimal
directions need precision in spacing, type, and detail. Elegance is executing the chosen vision
well.

**Consider written content carefully.** A brief often lacks real copy, and generic copy makes a
design feel as templated as the layout. See "More on writing" below.

## Process: brainstorm, explore, plan, critique, build, critique again

For calibration, AI-generated design currently clusters around three looks: (1) a warm cream
background (near `#F4F1EA`) with a high-contrast serif display and a terracotta accent; (2) a
near-black background with a single bright acid-green or vermilion accent; (3) a broadsheet layout
with hairline rules, zero border-radius, and dense newspaper columns. All three are legitimate for
some briefs but are *defaults rather than choices*, and they appear regardless of subject. Where the
brief pins a direction, follow it exactly — the brief's own words always win, including when it asks
for one of these looks. Where it leaves an axis free, don't spend that freedom on a default.

Work in two passes:

1. **Brainstorm a compact design plan** — a token system with four parts. **Color:** 4–6 named hex
   values. **Type:** typefaces for 2+ roles (a characterful display face used with restraint, a
   complementary body face, and a utility face for captions/data if needed). **Layout:** a layout
   concept described in one-sentence prose plus ASCII wireframes to ideate and compare.
   **Signature:** the single unique element the page will be remembered by, embodying the brief.
2. **Critique the plan against the brief before building.** If any part reads like the generic
   default you'd produce for any similar page (work through a similar prompt and see if you land in
   the same place), revise it and say what you changed and why. Only once the plan is genuinely
   specific do you write code — following the revised plan exactly, deriving every colour and type
   decision from it.

When writing the CSS, watch selector specificity — type-based (`.section`) and element-based
(`.cta`) selectors easily cancel each other out, especially on section paddings/margins.

Do most of this planning and iteration in your thinking; show ideas to the user only when you have
higher confidence they'll delight.

## Restraint and self-critique

Spend your boldness in one place. Let the signature element be the one memorable thing; keep
everything around it quiet and disciplined, and cut any decoration that doesn't serve the brief.
Not taking a risk can itself be a risk. Build to a quality floor without announcing it: responsive
down to mobile, visible keyboard focus, reduced motion respected. Critique your own work as you
build — take screenshots if the environment supports it (a picture is worth 1000 tokens). Consider
Chanel's advice: before leaving the house, look in the mirror and remove one accessory. Keep notes
on what you've tried so future passes can build on them.

## More on writing in design

Words appear in a design for one reason: to make it easier to understand, and therefore easier to
use. They are design material, not decoration — bring the same intentionality to copy as to spacing
and colour. Before writing anything, ask what the design needs to say and how to say it so the
person can navigate the experience.

- **Write from the end user's side of the screen.** Name things by what people control and
  recognise, never by how the system is built. A person manages notifications, not webhook config.
- **Active voice as default.** A control says exactly what happens: "Save changes," not "Submit."
  An action keeps its name through the whole flow — a "Publish" button produces a "Published" toast.
- **Treat failure and emptiness as direction, not mood.** Explain what went wrong and how to fix it,
  in the interface's voice. Errors don't apologise and are never vague. An empty screen invites an
  action.
- **Keep the register conversational and tuned:** plain verbs, sentence case, no filler, tone
  matched to brand and audience. Let each element do exactly one job.

## Integration

- `modern-css-design-systems` — implements the direction as a token system + accessible components.
- `react-frontend-architect` — structures the components that realise the design.
- `ux-designer` — owns flows, IA, and formal accessibility audits that sit around the visual work.

## References

- Ported and adapted from Anthropic's `frontend-design` skill.
- Best practices: https://agentskills.io/skill-creation/best-practices
