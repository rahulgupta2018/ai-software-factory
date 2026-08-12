---
name: gcp-landing-zone-expert
description: >
  Designs a Google Cloud landing zone from ground zero to a ready-to-build environment — the
  resource hierarchy (organisation → folders → projects), project + billing bootstrap, org-policy
  guardrails, the environment topology (dev/test/staging/prod, elicited per product), single- vs
  multi-region strategy, shared VPC / hub-and-spoke networking, IAM/RBAC group model, and the
  observability/logging foundation. Activates when standing up a new GCP org/project structure,
  choosing an environment or region topology, wiring billing/quota/budgets, or reviewing a landing
  zone against the security foundations blueprint. Owns the GCP *foundation* (before workloads). Does
  not own per-resource service hardening (gcp-cloud-expert), the IaC idioms (terraform/pulumi-expert),
  MLOps (gcp-mlops-expert), or the Factory's provision/gate workflow.
license: MIT
metadata:
  author: AI Software Factory (for this library)
  version: "0.1.0"
  last_updated: 2026-08-12
  category: coding
---

# GCP Landing-Zone Expert

## Overview

Carries Google Cloud's **security-foundations / landing-zone blueprint** and applies it to the
*foundation* a product's workloads will run on — everything that must exist **before** the first
bucket or service: the resource hierarchy, the projects and their billing linkage, the org-policy
guardrails, the environment ladder, the region strategy, the shared network, the IAM group model,
and the central logging/monitoring sink. It answers "how do we go from an empty organisation (or a
single project id) to a **ready, governed, multi-environment** GCP estate" without hand-wavey gaps.
It focuses on the foundation traps a model gets wrong (flat project layout, human-owned projects,
billing/quota/budget left to chance, a shared prod/dev blast radius, guardrails as per-resource hope
instead of org policy), not on re-teaching individual services.

**Freedom level: MEDIUM** — the hierarchy, guardrail, environment-isolation, and keyless-identity
discipline is fixed; the number of environments, the region strategy, and the network topology are
**elicited per product**, not baked.

**Project binding (optional).** If `.agents/project-context.yaml` defines `${ctx.tech_bindings.infra}`
(`cloud: gcp`, `org`, `environments`, `region_strategy`/`regions`, `identity`, `observability`),
follow it; otherwise elicit the missing foundation decisions and use the secure defaults below. This
skill supplies the *foundation*; `gcp-cloud-expert` hardens the workloads on top, and
`terraform-expert` / `pulumi-expert` express it as code.

## When to Activate

Activate when:
- Standing up a **new GCP organisation, folder hierarchy, or project structure** from scratch.
- Deciding the **environment topology** (how many environments, isolation, promotion) or the
  **region strategy** (single- vs multi-region, data residency).
- Wiring **project + billing bootstrap**, quotas, and **budgets/alerts**.
- Designing the **shared VPC / hub-and-spoke** network or the **IAM/RBAC group** model.
- Reviewing an existing landing zone against the security-foundations blueprint.

**Do not activate** (adjacent skills own this):
- `gcp-cloud-expert` — owns per-resource/service hardening (a specific bucket, SA, Cloud SQL, GKE
  cluster). This skill builds the estate; that one hardens each workload in it.
- `gcp-mlops-expert` — owns the ML/LLM platform (Vertex AI, model registry, eval) that runs *inside*
  a project this skill provisions.
- `terraform-expert` / `pulumi-expert` — own the IaC idioms; this skill says *what the foundation
  is*, they say *how to express it in code*.
- `aws-cloud-expert` / `azure-cloud-expert` — the other clouds' landing zones; routing is by
  `${ctx.tech_bindings.infra.cloud}`.
- The Factory's `/plan-infra`, `/provision`, `/infra-review` — own the lane; this is the craft.

## Core Concepts — foundation before workloads

Only the GCP-foundation models a capable model may get wrong:

- **Hierarchy is the unit of governance — never a flat layout.** Structure is
  **Organisation → Folders → Projects → resources**. Folders group by environment and/or business
  unit (e.g. `bootstrap`, `common`, `env/nonprod`, `env/prod`). IAM and **org policy inherit down**
  the tree, so a guardrail set on the `prod` folder covers every project inside it. A pile of
  sibling projects with no folders means every policy is per-project hope. A **seed/bootstrap**
  project (holding the Terraform/Pulumi state, the CI identity, and the org-policy definitions) is
  created first and is itself a protected resource.
- **Projects are cattle, owned by automation — not by a human.** Every project has a deterministic,
  environment-suffixed id (`acme-repairs-api-prod`), a **billing account linked at creation**, an
  owning **group** (not a person), and the APIs it needs enabled explicitly. Never build in the
  default network. A human `roles/owner` is break-glass only; automation (the CI WIF identity) owns
  day-to-day changes.
- **Billing, quota, and budget are foundation, not afterthoughts.** Link the **billing account** at
  project creation; set a **budget with alert thresholds** (e.g. 50/80/100%) per project or folder;
  request/observe **quotas** for the services in scope before load. An unbudgeted project is a
  surprise invoice; a project at a quota ceiling is a production incident.
- **Environments are isolated blast radii — elicit them, don't assume them.** Ask the product how
  many environments and what they are (the ladder is a *decision*, e.g. INT / SIT / PRE-PROD / PROD,
  not a default). Each environment is its **own project(s)** (never a shared project with a "prod"
  label), its own state prefix, its own service accounts, and ideally its own folder. **Promotion**
  flows one way (lower → higher) via CI; prod credentials never live in a lower environment.
- **Region strategy is a resiliency + residency + cost decision — make it explicitly.** Decide
  **single-region** (simplest, cheapest, one-region failure domain), **multi-region within a
  continent** (regional resiliency, higher cost/complexity), or **multi-region across continents**
  (latency/DR/residency) **per environment** — dev may be single-region while prod is multi. Enforce
  the allowed regions with the `gcp.resourceLocations` **org policy** so nothing lands outside them
  (data residency), and record the DR posture (RPO/RTO) the choice implies.
- **Networking is shared and default-deny — hub-and-spoke, not per-project sprawl.** Prefer a
  **Shared VPC** (a host project owns the network; service projects attach) or a hub-and-spoke with
  a connectivity hub; default-deny firewall; private Google access; **no default network**. Plan the
  IP address space (non-overlapping CIDRs per environment) up front — overlap blocks future peering.
- **IAM is groups + least privilege — never per-user, never primitive.** Grant roles to **Google
  Groups** (`grp-repairs-prod-admins@`), not individuals; bind at the **folder** level for
  inheritance; use **predefined/custom** roles, never `roles/owner`/`roles/editor` on a workload.
  The CI identity is **Workload Identity Federation** (no service-account key). Model break-glass as
  a separate, audited, alerting path.
- **Central logging & monitoring is part of the foundation.** An **aggregated log sink** at the org
  or folder level exports audit logs to a locked/retained log bucket (and optionally BigQuery for
  analysis) in a dedicated **logging project**; a monitoring workspace/scopes span the estate; alert
  on IAM changes, org-policy violations, and budget thresholds. Observability is not per-team
  reinvention.
- **Guardrails are org policy, applied at the top — code, not hope.** The baseline constraints live
  at the org/folder and inherit: `iam.disableServiceAccountKeyCreation`, `sql.restrictPublicIp`,
  `compute.requireOsLogin`, `compute.vmExternalIpAccess` (deny), `storage.uniformBucketLevelAccess`,
  `gcp.resourceLocations` (residency), `iam.allowedPolicyMemberDomains` (domain restriction). They
  hold regardless of a careless `apply` in a leaf project.

## Working Order (design or review a landing zone)

1. **Elicit the shape.** How many environments and their names (the ladder is the product's
   decision); the region strategy per environment (single / multi-region, residency); the org id +
   billing account; the identity domain. Persist to `${ctx.tech_bindings.infra}` — never assume.
2. **Hierarchy.** Organisation → folders (bootstrap, common, per-environment) → projects. A
   seed/bootstrap project first (state + CI identity + org-policy definitions), itself protected.
3. **Projects + billing + quota + budget.** Deterministic env-suffixed project ids, billing linked
   at creation, owning groups, explicit API enablement, per-project/folder budgets with alert
   thresholds, quota checked for the services in scope.
4. **Environment isolation.** Each environment its own project(s), state prefix, and SAs; one-way
   promotion via CI; prod credentials never in a lower environment.
5. **Networking.** Shared VPC / hub-and-spoke, default-deny, private Google access, non-overlapping
   CIDRs per environment, no default network.
6. **IAM/RBAC.** Roles to groups (not users), bound at folder level for inheritance, least-privilege
   predefined/custom roles, WIF for CI, an audited break-glass path.
7. **Observability foundation.** Aggregated log sink → locked log bucket (+ BigQuery) in a logging
   project; monitoring scopes across the estate; alerts on IAM/policy/budget.
8. **Org-policy guardrails.** Apply the baseline constraints at org/folder so they inherit;
   `gcp.resourceLocations` enforces the region strategy.

## Output Template (foundation, expressed for the IaC skill to wire)

```hcl
# Folder hierarchy: environments as folders so IAM + org policy inherit down.
resource "google_folder" "prod" {
  display_name = "env-prod"
  parent       = "organizations/${var.org_id}"
}

# A project is cattle: deterministic id, billing linked AT CREATION, owned by a group, no default net.
resource "google_project" "repairs_api_prod" {
  name            = "repairs-api-prod"
  project_id      = "acme-repairs-api-prod"
  folder_id       = google_folder.prod.id
  billing_account = var.billing_account          # linked at creation — never an unbilled project
  auto_create_network = false                    # no default network; a custom/Shared VPC is attached
}

# Budget with alert thresholds — cost is a foundation control, not an afterthought.
resource "google_billing_budget" "repairs_prod" {
  billing_account = var.billing_account
  display_name    = "repairs-prod"
  budget_filter { projects = ["projects/${google_project.repairs_api_prod.number}"] }
  amount { specified_amount { currency_code = "GBP"; units = 2000 } }
  threshold_rules { threshold_percent = 0.5 }
  threshold_rules { threshold_percent = 0.8 }
  threshold_rules { threshold_percent = 1.0 }
}

# Guardrails as ORG POLICY at the folder — inherit to every project inside, code not hope.
resource "google_folder_organization_policy" "prod_resource_locations" {
  folder     = google_folder.prod.name
  constraint = "gcp.resourceLocations"           # enforce the region strategy / data residency
  list_policy { allow { values = ["in:europe-west2-locations"] } }
}

# RBAC to a GROUP at the folder level (inheritance), least privilege — never a user, never owner/editor.
resource "google_folder_iam_member" "prod_admins" {
  folder = google_folder.prod.name
  role   = "roles/resourcemanager.folderViewer"  # scoped; admin roles go to a break-glass group only
  member = "group:grp-repairs-prod-admins@acme.example"
}
```

## Practical Guidance

- **Elicit environments and region strategy — never bake them.** The four-tier ladder
  (INT/SIT/PRE-PROD/PROD) is one common choice, not the default; ask, then record in the binding.
- **A seed project bootstraps everything.** State bucket + CI WIF identity + org-policy definitions
  live there and are created first; treat it as protected.
- **Groups, not users; folders, not projects, for inheritance.** Bind IAM to groups at the folder so
  a new project inherits the right access automatically.
- **Plan CIDRs before you build.** Overlapping ranges block future VPC peering / Shared VPC; assign
  non-overlapping blocks per environment up front.
- **Budget + quota are day-zero.** Every project links billing at creation and carries a budget with
  alerts; check quota for the services in scope before load, not after an incident.

## Examples

**Example — reviewing a flat project layout.**
```
Input:  12 sibling projects directly under the org, prod and dev mixed, IAM granted per-user,
        billing linked "later", one europe + one us resource with no residency policy.
Review: BLOCK — foundation findings. (1) No folders: introduce env folders so IAM/org-policy inherit.
        (2) prod/dev not isolated: separate projects + a prod folder; prod creds must not sit beside
        dev. (3) Per-user IAM: move to groups bound at folder level. (4) Billing unlinked: link at
        creation + add budgets with 50/80/100% alerts. (5) No resourceLocations policy: set the
        region strategy and enforce gcp.resourceLocations so nothing lands outside the allowed regions.
```

**Example — eliciting the environment ladder.**
```
Input:  "Set up the environments."
Ask:    How many environments and what are they (e.g. INT, SIT, PRE-PROD, PROD)? Which are
        single-region and which multi-region, and what regions (residency)? One billing account or
        per-environment? Persist the answers to tech_bindings.infra.environments — the ladder is your
        decision, not a Factory default.
```

## Guidelines

1. Organisation → folders → projects; a seed/bootstrap project first (state + CI identity + policy),
   itself protected. Never a flat sibling-project layout.
2. Projects are cattle: deterministic env-suffixed ids, billing linked at creation, owned by groups,
   no default network, explicit API enablement.
3. Budgets (with alert thresholds) and quota checks are foundation controls, per project/folder.
4. Environments are isolated blast radii — elicited per product, each its own project(s)/state/SAs;
   promotion is one-way via CI; prod creds never in a lower environment.
5. Region strategy (single vs multi-region) is an explicit per-environment decision, enforced by the
   `gcp.resourceLocations` org policy for residency; record the DR (RPO/RTO) posture.
6. Networking is Shared VPC / hub-and-spoke, default-deny, private Google access, non-overlapping
   CIDRs, no default network.
7. IAM is groups + least privilege bound at folder level; WIF for CI (no key); audited break-glass.
8. A central aggregated log sink + monitoring scopes span the estate; guardrails are org policy at
   org/folder so they inherit.

## Gotchas

1. **A flat project layout has no inheritance** — every policy becomes per-project hope. Folders are
   the governance unit; set guardrails once at the folder and they cover every project inside.
2. **`auto_create_network` builds the permissive default network.** Set it false and attach a
   custom/Shared VPC; the default network's firewall rules are open.
3. **Billing linked "later" leaves an unbilled/uncontrolled project.** Link at creation and attach a
   budget with alerts, or the first sign of cost is the invoice.
4. **Deleting a project is reversible only ~30 days, then permanent.** A project is a protected
   resource; the seed/state project doubly so.
5. **Overlapping CIDRs block peering forever.** You cannot peer or Shared-VPC two overlapping ranges;
   plan non-overlapping address space before the first subnet.
6. **`gcp.resourceLocations` is not on by default.** Without it, a careless `apply` lands a resource
   in any region — set it to enforce the region strategy and residency.

## Integration

- **`gcp-cloud-expert`** — hardens the individual workloads (SA, bucket, DB, GKE, Cloud Run) that
  run *inside* the projects this skill provisions. Foundation vs workload.
- **`gcp-mlops-expert`** — the Vertex AI / model platform that runs inside a landing-zone project.
- **`terraform-expert` / `pulumi-expert`** — express this foundation as code (folders, projects,
  org policy, Shared VPC, log sinks). This skill is the *what*; they are the *how*.
- The Factory's `/plan-infra` composes this skill (foundation) with `gcp-cloud-expert` (workload
  hardening) to produce the IaC design record; `/infra-review` scans it; `/provision` applies it.

## References

- GCP security foundations blueprint — https://cloud.google.com/architecture/security-foundations
- Landing zone design (resource hierarchy, networking, identity) — https://cloud.google.com/architecture/landing-zones
- Organization Policy constraints — https://cloud.google.com/resource-manager/docs/organization-policy/org-policy-constraints
- Best practices for enterprise organizations / folders — https://cloud.google.com/architecture/best-practices-for-enterprise-organizations
