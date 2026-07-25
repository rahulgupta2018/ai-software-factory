---
product:
  name: "Repair Tracker"
  code: "repair-tracker"
  description: "Logs property repairs and drives them to closure so nothing slips through email."
  status: in-design

domain: "Property maintenance coordination between landlords and contractors"

# Knowledge-domain context (UK social-housing repairs). Also resolves the ${ctx.*} bindings of
# vendored knowledge skills (ontology-builder-assistant, ontology-guided-retrieval).
jurisdictions: ["England", "United Kingdom"]
authority_hierarchy:
  - "Primary legislation"
  - "Statutory instruments / regulations"
  - "Regulator standards & statutory guidance"
  - "Best-practice guidance"
sources:
  primary:
    - name: "Landlord and Tenant Act 1985"
      url: "https://www.legislation.gov.uk/ukpga/1985/70"
      authority: "Primary legislation"
      access: public
    - name: "Homes (Fitness for Human Habitation) Act 2018"
      url: "https://www.legislation.gov.uk/ukpga/2018/34"
      authority: "Primary legislation"
      access: public
  standards:
    - name: "Regulator of Social Housing — consumer standards"
      authority: "Regulator standards & statutory guidance"
      access: public

meta:
  version: "0.1.0"
  owner: "factory"
  last_updated: "2026-07-22"
---

# Repair Tracker — Product Requirements

> **Golden reference product.** This is the fixture the whole pipeline runs against. It is not
> a real product — it exists so `/discover → /plan-arch → build → /review → /qa → /ship` has a
> stable, committed target, and so `fac vendor:check` can resolve every `${ctx.*}` binding
> against a real merged context. Keep it small and keep it current.

## 1. Problem & context
Repair requests arrive by email, phone, and text. There is no single list, so requests are
double-handled or forgotten, and nobody can answer "what is outstanding?" without a search.

## 2. Users & personas
- **Landlord / property manager** (primary) — logs repairs, assigns contractors, chases status.
- **Contractor** (secondary) — sees assigned jobs and updates status from a mobile app in the field.

## 3. Goals / Non-goals
- **Goals:** nothing falls through the cracks; a single answer to "what is outstanding?"
- **Non-goals:** tenant-facing chat, invoicing, scheduling optimisation.

## 4. User journeys / key flows
1. **Log & assign** (landlord): open the repairs list → new repair (property, description,
   priority, reporter) → assign a contractor → the repair appears in that contractor's queue.
2. **Field update** (contractor): open the mobile app (possibly offline) → see assigned jobs →
   move a job `in-progress` / `closed` → changes sync when a connection returns.
3. **Outstanding review** (landlord): filter the list by status/property/age → see what's
   outstanding → chase anything stale.

## 5. Functional requirements
- Log a repair: property, description, priority, reporter.
- Assign a repair to a contractor.
- Move a repair through `open → assigned → in-progress → closed`.
- List and filter repairs by status, property, and age.
- Email reminders on repairs older than their priority SLA.
- Contractor mobile app (iOS + Android): view assigned jobs and update status, working offline.

## 6. Data & domain model
Conceptual entities (`/plan-arch` designs the physical schema):
- **Repair** — id, description, priority, reporter, status, opened/closed timestamps. Belongs to a
  **Property**, assigned to a **Contractor**.
- **Property** — the location a repair is against.
- **Contractor** — the party a repair is assigned to.
- **StatusEvent** — one per transition (`open → assigned → in-progress → closed`), for the audit
  trail. Every entity is scoped by **tenant** (multi-tenant isolation).

## 7. Non-functional requirements
- List view under 500ms at 10k repairs.
- WCAG 2.2 AA for all landlord-facing screens.
- No tenant personal data beyond a name and contact field; never logged.
- Mobile app follows OWASP MASVS: session tokens in the platform secure store (never
  SharedPreferences), HTTPS-only with certificate pinning, no secrets in the bundle.

## 8. Integrations & external dependencies
- **Postgres** — system of record; hard dependency (no repairs without it).
- **Email/SMS provider** — SLA reminders + contractor notifications; if unavailable, reminders
  queue and retry rather than drop.
- **Identity provider** — landlord login and the contractor device token; if down, no new sessions
  (existing ones continue).

## 9. Compliance & data handling
- **UK GDPR:** a tenant's name + contact are personal data — lawful basis, a defined retention
  period, and subject-access support. Data residency UK/EU.
- Never store or log tenant PII beyond name + contact; status changes carry an audit trail.
- **Regulator of Social Housing** consumer standards apply to repairs timeliness (frames the SLA).

## 10. Features
- **V1** — log, assign, status transitions, filtered list.
- **Fast-follow** — SLA reminders, contractor mobile app (view assigned jobs, update status).
- **Later** — photo attachments, cost tracking, reporting dashboard.

## 11. Success metrics
- Median time-to-close under 5 working days.
- Zero repairs with no status change in 14 days.

## 12. Constraints & assumptions
Single operator, no dedicated ops team. Contractors work in the field, often with poor signal, so
the mobile app must tolerate brief offline periods and sync when a connection returns.

## 13. Risks
- **Offline sync conflicts** (two updates to one repair) — medium likelihood, medium impact;
  mitigate with last-writer-wins plus surfacing the conflict, not a silent overwrite.
- **Contractor adoption** of the mobile app hinges on the auth choice (full account vs device-bound
  signed link) — high impact on the Fast-follow; de-risk with a pilot.
- **Reminder spam** if SLA thresholds are mis-set — mitigate with configurable thresholds and a
  dry-run first.

## 14. Out of scope
Payments, tenancy management.

## 15. Open questions
- Does the contractor mobile app need full account auth for V1, or a device-bound signed token?
