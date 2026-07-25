---
# ─────────────────────────────────────────────────────────────────────────────
# HUMAN-OWNED. You write this; agents read it.
#
# Only product identity lives here. The machine context (tech_stack, commands,
# guardrails, skills manifest) is written by /plan-arch into .factory/stack.yaml
# so an agent never edits the file you are editing.
#
# Run `fac sync-context` to merge both halves into .factory/context.gen.yaml.
# ─────────────────────────────────────────────────────────────────────────────
product:
  name: ""                     # e.g. "Acme Billing"
  code: ""                     # e.g. "acme-billing"
  description: ""
  status: draft                # draft | in-design | in-build | shipped

# Optional — one-line domain statement; frames domain-knowledge craft skills.
# domain: ""

# Optional — regulated / knowledge domains only. Human-owned; `/discover` fills these when the
# product has a legal or regulatory frame, and the vendored knowledge craft skills bind to them.
# Delete for ordinary products.
# jurisdictions: ["England", "United Kingdom"]
# authority_hierarchy:
#   - "Primary legislation"
#   - "Regulator standards & statutory guidance"
#   - "Best-practice guidance"
# sources:
#   primary:
#     - name: "<statute or authoritative source>"
#       url: "https://..."
#       authority: "Primary legislation"
#       access: public

meta:
  version: "0.1.0"
  owner: ""
  last_updated: ""
---

# <Product name> — Product Requirements

> The human source of truth for this product. `/discover` drafts this body; `/plan-product`
> refines its scope. The machine half lives in `.factory/stack.yaml` — never paste tech_stack
> or commands into the frontmatter above.

## 1. Problem & context
What problem are we solving, for whom, and why now? What exists today and why it falls short.

## 2. Users & personas
Who uses this. Primary and secondary personas, their goals, and their context of use.

## 3. Goals / Non-goals
- **Goals:** the outcomes this product must achieve.
- **Non-goals:** explicitly out of scope for this effort (prevents scope creep).

## 4. User journeys / key flows
The primary end-to-end journeys each persona takes through V1 — the happy paths `/plan-design` and
`/qa` verify. One numbered flow per journey (trigger → steps → outcome), not a feature list.

## 5. Functional requirements
What the system must do. User-visible capabilities and behaviours.

## 6. Data & domain model
The core entities, their key attributes, and the relationships between them (conceptual, not a
schema — `/plan-arch` designs the physical model). Name the lifecycle/state transitions that matter.

## 7. Non-functional requirements
Performance, security, accessibility (WCAG), availability, and operability targets — each with a
concrete number where possible (e.g. "list view < 500ms at 10k rows", "WCAG 2.2 AA").

## 8. Integrations & external dependencies
Systems this product talks to — auth/identity, payments, email/SMS, third-party APIs, data feeds —
and what breaks if each is unavailable. Ownership, SLAs, and rate limits where known.

## 9. Compliance & data handling
Regulatory frame and the requirements it imposes: applicable regimes (GDPR/HIPAA/PCI…), data
residency, retention, audit, and consent. What personal/sensitive data is processed, and what must
never be stored or logged. (Enforceable rules land in `.factory/stack.yaml` `compliance_rules`.)

## 10. Features
Prioritised. Tag each with a lane:
- **V1** — must ship first.
- **Fast-follow** — right after V1.
- **Later** — deferred.

## 11. Success metrics
How we know it worked. Concrete, measurable (activation, retention, latency, error rate…).

## 12. Constraints & assumptions
Budget, timeline, existing systems, team, regulatory, technical constraints. Key assumptions.

## 13. Risks
The top delivery and product risks (distinct from open questions): what could derail this, its
likelihood/impact, and the mitigation. Name the assumption whose failure hurts most.

## 14. Out of scope
What we are deliberately NOT building now.

## 15. Open questions
Unresolved decisions that block or shape the build. Owner + needed-by where known.
