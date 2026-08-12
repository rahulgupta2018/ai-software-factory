---
name: gcp-cloud-expert
description: >
  Reviews and hardens Google Cloud infrastructure against a well-architected security baseline —
  IAM least-privilege and service-account hygiene, Workload Identity Federation (keyless auth), VPC
  and firewall design, CMEK encryption, Cloud Audit Logs, and organisation-policy guardrails.
  Activates when designing or reviewing GCP infrastructure (in Terraform or Pulumi), choosing GCP
  services, wiring OIDC federation to GCP, or auditing a GCP project for the security baseline. Owns
  the GCP provider baseline. Does not own the Terraform/Pulumi IaC idioms, the application code, or
  the Factory's provision/gate workflow.
license: MIT
metadata:
  author: AI Software Factory (for this library)
  version: "0.1.0"
  last_updated: 2026-08-12
  category: coding
---

# GCP Cloud Expert

## Overview

Carries Google Cloud's **well-architected security baseline** and applies it to infrastructure the
IaC skill (`terraform-expert` / `pulumi-expert`) writes. It answers "what does *good* look like on
GCP" across five pillars — **identity, network, encryption, logging/audit, and organisation
policy** — and reviews a GCP design against them. It focuses on the GCP-specific traps a model gets
wrong (primitive roles, default service accounts, service-account *keys*, open firewalls, plaintext
default encryption where CMEK is required), not on re-teaching cloud basics.

**Freedom level: MEDIUM** — the security baseline (least privilege, keyless auth, encryption,
audit logging) is fixed; service and topology choices vary.

**Project binding (optional).** If `.agents/project-context.yaml` defines `${ctx.tech_bindings.infra}`
(`cloud: gcp`, `regions`, `identity`, `protected_resources`), follow it; otherwise use secure GCP
defaults (predefined/custom roles not primitive, Workload Identity Federation, CMEK on stateful
data, uniform bucket-level access, audit logs enabled, a deny-by-default VPC). This skill supplies
the *baseline*; the IaC skill supplies the *implementation*.

## When to Activate

Activate when:
- Designing or reviewing **GCP** infrastructure — projects, IAM, VPC, GCS, Cloud SQL, GKE, Cloud Run.
- Choosing GCP services or a project/folder/organisation topology.
- Wiring **Workload Identity Federation** (GitHub Actions → GCP, keyless) or service-account access.
- Auditing a GCP project against the security baseline (IAM, network, encryption, logging).

**Do not activate** (adjacent skills own this):
- `terraform-expert` / `pulumi-expert` — own the IaC idioms (module structure, state, plan/apply).
  This skill says *what to build on GCP*; they say *how to express it in code*.
- `aws-cloud-expert` / `azure-cloud-expert` — own the other clouds' baselines. Routing is by
  `${ctx.tech_bindings.infra.cloud}`.
- The application craft skills (`python-expert`, `fullstack-developer`, ...) — own the code that
  runs on the infrastructure.
- The Factory's `/plan-infra`, `/provision`, `/infra-review` — own the lane; this is the craft.

## Core Concepts — the five pillars

Only the GCP-specific models a capable model may get wrong:

- **Identity — least privilege, no keys.** Never grant **primitive roles** (`roles/owner`,
  `roles/editor`) to anything but a break-glass human; use **predefined** or **custom** roles scoped
  to the resource. Never create **service-account keys** — they are long-lived secrets that leak;
  authenticate CI via **Workload Identity Federation** (short-lived OIDC token). Don't use the
  **default** compute/App-Engine service account (it is over-privileged); create a purpose-scoped SA
  per workload. Prefer **IAM Conditions** and per-resource bindings over project-wide grants.
- **Network — deny by default.** A custom VPC, not the auto-created `default` (which has permissive
  firewall rules). Firewall rules are allow-lists on a default-deny posture; no `0.0.0.0/0` to SSH
  (22) / RDP (3389) — use **IAP** or a bastion. Private Google Access + private service connect keep
  traffic off the public internet; a database gets a **private IP**, never a public one.
- **Encryption — CMEK on stateful data.** Everything is encrypted at rest by Google-managed keys by
  default; where the baseline (or `protected_resources`) requires customer control, use **CMEK**
  (Cloud KMS) so key rotation and revocation are yours. Enforce **uniform bucket-level access** (no
  per-object ACLs) and TLS in transit.
- **Logging & audit — on and immutable.** **Cloud Audit Logs** (Admin Activity is always on; enable
  **Data Access** logs for sensitive services) sink to a retention/immutable bucket or log bucket
  with a lock. Don't disable audit logging to cut noise. Alert on IAM changes and policy violations.
- **Organisation policy — guardrails as code.** **Org policy constraints** enforce the baseline
  across projects regardless of a careless `apply`: `iam.disableServiceAccountKeyCreation`,
  `compute.requireOsLogin`, `storage.uniformBucketLevelAccess`, `sql.restrictPublicIp`,
  `gcp.resourceLocations` (data residency). Guardrails belong at the org, not per-resource hope.

## Working Order (design or review)

1. **Identity.** No primitive roles; purpose-scoped SA per workload; no SA keys (WIF instead);
   default SAs unused; bindings least-privilege and per-resource.
2. **Network.** Custom VPC, default-deny firewall, no world-open admin ports (IAP/bastion),
   databases on private IP, Private Google Access.
3. **Encryption.** CMEK on stateful/`protected` data, uniform bucket-level access, TLS in transit.
4. **Logging & audit.** Audit logs enabled (Data Access where sensitive), sinks retained/locked,
   alerts on IAM/policy changes.
5. **Org policy.** Baseline constraints applied at org/folder (disable SA keys, restrict public IP,
   require OS Login, uniform bucket access, resource locations).

## Output Template (baseline, expressed for the IaC skill to wire)

```hcl
# Purpose-scoped service account — NOT the default SA, NO key. CI assumes it via WIF.
resource "google_service_account" "repairs_api" {
  account_id   = "repairs-api"
  display_name = "Repairs API runtime (least privilege)"
}

# Least-privilege binding: a predefined role scoped to ONE resource, not a project-wide grant.
resource "google_storage_bucket_iam_member" "api_reads_assets" {
  bucket = google_storage_bucket.assets.name
  role   = "roles/storage.objectViewer"        # not roles/editor, not roles/owner
  member = "serviceAccount:${google_service_account.repairs_api.email}"
}

# Workload Identity Federation: CI (GitHub Actions) → GCP with a SHORT-LIVED token, no SA key.
resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github-actions"
}

# Org policy guardrail: forbid service-account KEY creation project-wide — keyless only.
resource "google_project_organization_policy" "no_sa_keys" {
  project    = var.project_id
  constraint = "iam.disableServiceAccountKeyCreation"
  boolean_policy { enforced = true }
}

# Cloud SQL with NO public IP (org policy sql.restrictPublicIp also enforces this).
resource "google_sql_database_instance" "main" {
  name             = "${var.name}-db"
  database_version = "POSTGRES_16"
  settings {
    ip_configuration { ipv4_enabled = false }  # private IP only
  }
  encryption_key_name = var.kms_key            # CMEK
  deletion_protection = true                    # blast-radius guard
}
```

## Practical Guidance

- **Route by binding.** This skill applies only when `${ctx.tech_bindings.infra.cloud} == gcp`; for
  another cloud, defer to that cloud's expert. The IaC tool is `${ctx.tech_bindings.infra.iac_tool}`.
- **Keyless is the custody principle.** A service-account key file is exactly the long-lived secret
  the Factory refuses to hold. WIF + short-lived tokens are non-negotiable for CI.
- **State backend is a GCS bucket** with versioning + CMEK + uniform access + a lock — the same
  bucket-hardening baseline applies to the Terraform state bucket itself.
- **Regions/residency come from `regions`.** Enforce `gcp.resourceLocations` so a stray resource
  can't land outside the allowed regions.

## Examples

**Example — reviewing an IAM grant.**
```
Input:  roles/editor granted to serviceAccount:...-compute@developer.gserviceaccount.com at project level.
Review: BLOCK — two findings. (1) roles/editor is a primitive role: far too broad; scope a predefined
        or custom role to the resource the workload needs. (2) that is the DEFAULT compute SA: create
        a purpose-scoped SA and stop using the default. Recommend org policy to prevent recurrence.
```

**Example — a service-account key in the plan.**
```
Input:  resource "google_service_account_key" "ci" { ... } exported to a CI secret.
Review: BLOCK. A downloadable SA key is a long-lived credential. Replace with Workload Identity
        Federation (short-lived OIDC token from CI). Enforce iam.disableServiceAccountKeyCreation so
        no future apply can reintroduce one.
```

## Guidelines

1. No primitive roles (`owner`/`editor`) on workloads; predefined/custom roles scoped per resource.
2. No service-account keys — Workload Identity Federation (short-lived tokens) for CI auth.
3. Purpose-scoped SA per workload; the default compute/App-Engine SA is unused.
4. Custom VPC, default-deny firewall, no world-open admin ports, databases on private IP.
5. CMEK on stateful/`protected` data; uniform bucket-level access; TLS in transit.
6. Cloud Audit Logs enabled (Data Access where sensitive), sinks retained/locked, alerts on IAM changes.
7. Baseline enforced as **org policy** (disable SA keys, restrict public IP, require OS Login,
   uniform bucket access, resource locations) — guardrails as code, not per-resource hope.

## Gotchas

1. **The `default` VPC has permissive firewall rules** (allows internal + ICMP + common ports).
   Don't build on it; create a custom VPC with default-deny.
2. **The default compute service account has `roles/editor`.** Any VM using it is over-privileged;
   create a scoped SA and disable default-SA grants.
3. **A service-account key never expires.** It is the classic GCP leak; WIF eliminates it. Org
   policy `iam.disableServiceAccountKeyCreation` makes the rule enforceable.
4. **CMEK is not the default** — "encrypted at rest" is Google-managed keys. If the baseline needs
   customer-controlled rotation/revocation, you must set the KMS key explicitly.
5. **Data Access audit logs are OFF by default** for most services. Admin Activity is always on, but
   reads of sensitive data aren't logged until you enable Data Access logs.
6. **Deleting a project is reversible only for ~30 days, then permanent.** Treat a project as a
   protected resource; guard it like a stateful one.

## Integration

- **`terraform-expert` / `pulumi-expert`** — express this baseline as code (modules, state,
  plan/apply). This skill is the *what*; they are the *how*.
- **`aws-cloud-expert` / `azure-cloud-expert`** — the sibling baselines; routing is by
  `${ctx.tech_bindings.infra.cloud}`.
- The Factory's `/infra-review` composes this skill's baseline with `tfsec`/Checkov + OPA/Conftest
  policy as the pre-`/provision` security gate.

## References

- GCP security foundations / well-architected security pillar — https://cloud.google.com/architecture/security-foundations
- Workload Identity Federation (keyless) — https://cloud.google.com/iam/docs/workload-identity-federation
- Organization Policy Service constraints — https://cloud.google.com/resource-manager/docs/organization-policy/org-policy-constraints
