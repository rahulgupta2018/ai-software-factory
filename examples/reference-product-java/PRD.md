---
product:
  name: "Repair Tracker API"
  code: "repair-tracker-api"
  description: "The Repair Tracker backend as a standalone Quarkus service, proving the pipeline routes a Java component with no workflow-skill changes."
  status: in-design

domain: "Property maintenance coordination between landlords and contractors"

meta:
  version: "0.1.0"
  owner: "factory"
  last_updated: "2026-07-22"
---

# Repair Tracker API — Product Requirements

> **Java/Quarkus reference product.** A second golden fixture, identical in shape to
> `examples/reference-product/` but built on a single Java/Quarkus component. It exists to prove
> the Phase 1b claim: the same `/discover → /plan-arch → build → /review → /qa → /ship` chain runs
> on a Quarkus component with **no workflow-skill changes** — language routing is a parameter, not
> a fork. Keep it small and keep it current.

## 1. Problem & context
The Repair Tracker frontend needs a backend that other clients (a contractor portal, an internal
dashboard) can also call. A standalone HTTP API owns repairs and their lifecycle.

## 2. Users & personas
- **Client application** (primary) — the Repair Tracker web UI and future portals.
- **Operator** (secondary) — runs and monitors the service.

## 3. Goals / Non-goals
- **Goals:** one authoritative repairs API; correct status transitions; fast list queries.
- **Non-goals:** UI, authentication provider, invoicing.

## 4. User journeys / key flows
1. **Create → assign → transition** (client): `POST /repairs` → `PATCH` the assignment →
   `PATCH` the status through `open → assigned → in-progress → closed`; each transition is
   validated and recorded.
2. **List / filter** (client): `GET /repairs` filtered by status, property, and age, paginated.

## 5. Functional requirements
- Create a repair: property, description, priority, reporter.
- Assign a repair to a contractor.
- Move a repair through `open → assigned → in-progress → closed`.
- List and filter repairs by status, property, and age.

## 6. Data & domain model
Conceptual entities (`/plan-arch` designs the physical schema):
- **Repair** — id, description, priority, reporter, status, timestamps; references a **Property**
  and (once assigned) a **Contractor**.
- **StatusTransition** — one per lifecycle move, rejecting an illegal transition; the audit trail.

## 7. Non-functional requirements
- List endpoint under 200ms at 10k repairs.
- No tenant personal data beyond a name and contact field; never logged.
- Startup under 1s in JVM mode; native build must pass.

## 8. Integrations & external dependencies
- **Postgres** — system of record; hard dependency.
- **API gateway** — verifies the caller and passes a trusted identity header; if it is bypassable
  the API's trust model breaks, so network policy must enforce that the API is reachable only
  through it.

## 9. Compliance & data handling
- A tenant's name + contact are personal data — never logged; UK data residency; a defined
  retention period. Status transitions carry an audit trail.

## 10. Features
- **V1** — create, assign, status transitions, filtered list.
- **Fast-follow** — SLA reminder job, contractor-scoped queries.
- **Later** — photo attachments, cost tracking.

## 11. Success metrics
- p95 list latency under 200ms.
- Zero repairs stuck with no status change past their SLA.

## 12. Constraints & assumptions
Single Postgres instance. Assumes clients authenticate at the gateway; the API trusts a verified
caller identity header for V1.

## 13. Risks
- **Reactive vs blocking JDBC** materially affects throughput under load — benchmark before
  committing (see Open questions); low likelihood of being wrong, medium impact.
- **Trusting a gateway identity header** assumes the gateway can't be bypassed — high impact if it
  can; mitigate with a network policy that makes the gateway the only route in.

## 14. Out of scope
UI, payments, tenancy management.

## 15. Open questions
- Reactive (`Uni`/`Multi`) endpoints from day one, or `@Blocking` JDBC until load demands reactive?
