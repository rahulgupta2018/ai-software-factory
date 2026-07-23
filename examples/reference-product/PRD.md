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

## 4. Functional requirements
- Log a repair: property, description, priority, reporter.
- Assign a repair to a contractor.
- Move a repair through `open → assigned → in-progress → closed`.
- List and filter repairs by status, property, and age.
- Email reminders on repairs older than their priority SLA.
- Contractor mobile app (iOS + Android): view assigned jobs and update status, working offline.

## 5. Non-functional requirements
- List view under 500ms at 10k repairs.
- WCAG 2.2 AA for all landlord-facing screens.
- No tenant personal data beyond a name and contact field; never logged.
- Mobile app follows OWASP MASVS: session tokens in the platform secure store (never
  SharedPreferences), HTTPS-only with certificate pinning, no secrets in the bundle.

## 6. Features
- **V1** — log, assign, status transitions, filtered list.
- **Fast-follow** — SLA reminders, contractor mobile app (view assigned jobs, update status).
- **Later** — photo attachments, cost tracking, reporting dashboard.

## 7. Success metrics
- Median time-to-close under 5 working days.
- Zero repairs with no status change in 14 days.

## 8. Constraints & assumptions
Single operator, no dedicated ops team. Contractors work in the field, often with poor signal, so
the mobile app must tolerate brief offline periods and sync when a connection returns.

## 9. Out of scope
Payments, tenancy management.

## 10. Open questions
- Does the contractor mobile app need full account auth for V1, or a device-bound signed token?
