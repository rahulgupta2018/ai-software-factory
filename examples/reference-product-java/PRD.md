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

## 4. Functional requirements
- Create a repair: property, description, priority, reporter.
- Assign a repair to a contractor.
- Move a repair through `open → assigned → in-progress → closed`.
- List and filter repairs by status, property, and age.

## 5. Non-functional requirements
- List endpoint under 200ms at 10k repairs.
- No tenant personal data beyond a name and contact field; never logged.
- Startup under 1s in JVM mode; native build must pass.

## 6. Features
- **V1** — create, assign, status transitions, filtered list.
- **Fast-follow** — SLA reminder job, contractor-scoped queries.
- **Later** — photo attachments, cost tracking.

## 7. Success metrics
- p95 list latency under 200ms.
- Zero repairs stuck with no status change past their SLA.

## 8. Constraints & assumptions
Single Postgres instance. Assumes clients authenticate at the gateway; the API trusts a verified
caller identity header for V1.

## 9. Out of scope
UI, payments, tenancy management.

## 10. Open questions
- Reactive (`Uni`/`Multi`) endpoints from day one, or `@Blocking` JDBC until load demands reactive?
