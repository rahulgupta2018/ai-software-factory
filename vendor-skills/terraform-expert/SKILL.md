---
name: terraform-expert
description: >
  Writes, reviews, and hardens production Terraform — module structure, provider/version pinning,
  remote state with locking, plan/apply discipline, and a no-secrets-in-state, least-privilege
  posture. Activates when authoring or refactoring Terraform (HCL), designing a module or state
  backend, reviewing a plan diff for destroy/replace blast radius, or wiring OIDC-federated
  (keyless) provider auth. Owns Infrastructure-as-Code idioms in Terraform. Does not own a specific
  cloud's well-architected baseline (the per-cloud expert), the Pulumi dialect, the application
  code, or the Factory's provision/gate workflow.
license: MIT
metadata:
  author: AI Software Factory (for this library)
  version: "0.1.0"
  last_updated: 2026-08-12
  category: coding
---

# Terraform Expert

## Overview

Produces clean, reviewable **Terraform** and reviews existing HCL against a fixed priority order:
**Safety (blast radius) → State & secret custody → Correctness → Reusability → Style.** Terraform's
danger is not syntax — it is that one `apply` can destroy or replace a live resource, and that a
careless backend leaks credentials into state. This skill encodes the discipline that keeps an
`apply` boring: pin everything, plan before apply, keep state remote-and-locked, and never let a
secret reach state or the repo. It focuses on the mistakes a model makes without guidance, not on
re-teaching HCL.

**Freedom level: MEDIUM** — the safety order, state/secret rules, and plan-before-apply discipline
are fixed; module shape and resource choices vary.

**Project binding (optional).** If `.agents/project-context.yaml` defines `${ctx.tech_bindings.infra}`
(cloud, `iac_tool`, `state_backend`, `identity`/OIDC, `regions`, `protected_resources`), follow it;
otherwise use modern defaults (pinned `required_providers`, a remote backend with locking, OIDC
workload-identity auth, no long-lived keys). This skill supplies the Terraform *method*; the
per-cloud expert (`gcp-cloud-expert`, `aws-cloud-expert`, ...) supplies the provider baseline.

## When to Activate

Activate when:
- Writing or refactoring Terraform — modules, resources, variables, outputs, backends.
- Designing a **state backend** (remote, locked, encrypted) or an **OIDC** provider-auth setup.
- Reviewing a `terraform plan` diff for correctness and **destroy/replace blast radius**.
- Structuring a repo into reusable modules + per-environment root configurations.

**Do not activate** (adjacent skills own this):
- `gcp-cloud-expert` / `aws-cloud-expert` / `azure-cloud-expert` — own each provider's
  well-architected + security baseline (IAM, network, encryption, logging). This skill wires the
  resources; the cloud expert says what "good" looks like on that cloud.
- `pulumi-expert` — owns the Pulumi (general-purpose-language) dialect of the same job.
- `python-expert` / `fullstack-developer` / `java-quarkus-expert` — own the application code the
  infrastructure runs.
- The Factory's `/plan-infra`, `/provision`, `/infra-review` workflow skills — own the *lane* (the
  design artifact, the apply hard-gate, the policy scan). This skill is the craft they compose.

## Core Concepts

Only the Terraform-specific models a capable model may get wrong:

- **`apply` is not additive — it reconciles to the plan.** A change to an immutable attribute is a
  **destroy-and-replace**, not an edit. Always read the plan's `+`/`-`/`-/+` symbols: `-/+` on a
  stateful resource (database, disk, bucket) is data loss. Treat a plan as the review artifact, not
  a formality.
- **State is sensitive and shared.** `terraform.tfstate` records every attribute — including
  secrets Terraform had to know — in plaintext. It **must** live in a remote, encrypted,
  access-controlled backend **with locking** (S3+DynamoDB / GCS / Azure Storage), never in the repo
  and never local for a team. Two applies without a lock corrupt state.
- **Secrets never belong in code or state you can avoid.** Don't hardcode a credential in HCL and
  don't `output` a secret in plaintext. Read secrets from a secret manager at apply time; mark
  variables/outputs `sensitive = true`; prefer resources that reference a secret by name over ones
  that embed its value.
- **Pin everything.** Unpinned providers/modules mean a re-`init` silently changes behaviour. Set
  `required_version`, pin every `required_providers` to a `~>` range, and pin module `source`
  versions. Reproducibility is a safety property.
- **Keyless auth over long-lived keys.** Authenticate the provider via **OIDC workload-identity
  federation** (GitHub Actions → cloud), not a static access key committed or stored as a
  long-lived secret. The short-lived token is the custody principle in practice.
- **A module is an API.** Inputs are `variables` (typed, validated, documented), outputs are
  `outputs`, and nothing else should leak. Root configurations compose modules per environment; a
  module never hardcodes an environment or an account id.

## Working Order

1. **Safety first (blast radius).** Read the plan. Any `destroy`/`replace` of a stateful resource
   stops for explicit review; use `prevent_destroy` on protected resources and `create_before_destroy`
   where a replace must not cause an outage. Never `-auto-approve` a plan you have not read.
2. **State & secret custody.** Remote, encrypted, locked backend. No secret in HCL, no plaintext
   secret `output`, `sensitive = true` on anything that must exist. OIDC auth, no static keys.
3. **Correctness.** Right resource + arguments; explicit `depends_on` only where the graph can't
   infer it; `for_each` (stable keys) over `count` (index churn) for sets; validated variable types.
4. **Reusability.** Small, single-purpose modules with a typed input/output surface; per-environment
   roots; no environment/account hardcoded inside a module.
5. **Style.** `terraform fmt`; clear names; `description` on every variable/output; pinned versions;
   `.tflint`/`tfsec`-clean.

## Output Template (a module + a locked, OIDC backend)

```hcl
# versions.tf — pin the language and every provider. A re-init must not change behaviour.
terraform {
  required_version = "~> 1.9"
  required_providers {
    google = { source = "hashicorp/google", version = "~> 6.0" }
  }
  # Remote, encrypted, LOCKED state. Never local for a team; never in the repo.
  backend "gcs" {
    bucket = "acme-tf-state-prod"     # versioning + CMEK enabled on the bucket
    prefix = "repairs/prod"
  }
}

# variables.tf — a module is an API: typed, validated, documented inputs.
variable "name" {
  type        = string
  description = "Resource name prefix, unique per environment."
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,28}$", var.name))
    error_message = "name must be 3-29 chars, lowercase alnum + hyphen, starting with a letter."
  }
}

# main.tf — a stateful resource guarded against accidental destroy.
resource "google_storage_bucket" "assets" {
  name                        = "${var.name}-assets"
  location                    = "EU"
  uniform_bucket_level_access = true          # no per-object ACLs
  versioning { enabled = true }
  lifecycle { prevent_destroy = true }        # blast-radius guard: a replace must be deliberate

  encryption { default_kms_key_name = var.kms_key }  # CMEK, not just Google-managed
}

# outputs.tf — expose the API surface; never output a secret in plaintext.
output "bucket_name" {
  value       = google_storage_bucket.assets.name
  description = "Name of the created assets bucket."
}
```

Provider auth uses OIDC workload-identity federation in CI (no static key committed or stored):

```hcl
# The CI job assumes a short-lived token via workload-identity federation; the provider block
# carries NO credentials. `identity` in tech_bindings.infra records the federated identity, never a key.
provider "google" {
  project = var.project_id
  region  = var.region
}
```

## Practical Guidance

- **Plan to a file, apply that file.** `terraform plan -out=tfplan` then `terraform apply tfplan` —
  so the applied change is exactly the reviewed one, with no drift between plan and apply.
- **Isolate state per environment.** Separate backends/prefixes (or workspaces) for dev/stage/prod;
  a shared state is a shared blast radius.
- **`for_each` over `count`.** Removing the middle of a `count` list re-indexes and churns every
  later resource; `for_each` keys are stable.
- **Guard the irreversible.** `prevent_destroy` on databases, state buckets, DNS zones; a plan that
  wants to destroy one should fail, not proceed.
- **Never commit `.tfstate`, `.tfvars` with secrets, or `.terraform/`.** Gitignore them; read
  secret values from a secret manager, not a committed `tfvars`.

## Examples

**Example — reviewing a plan diff.**
```
Input:  terraform plan shows  google_sql_database_instance.main must be replaced (-/+),
        forces replacement because "settings.tier" changed.
Review: BLOCK. A -/+ on a SQL instance destroys the database. This is not a tier edit — it is data
        loss. Options: (1) change tier in place if the provider supports it, (2) add a read replica
        + migrate, (3) if truly intended, snapshot first and get explicit consent. Never auto-apply.
```

**Example — a secret in an output.**
```
Input:  output "db_password" { value = google_sql_user.app.password }
Fix:    remove it. If a consumer needs the password, have it read the secret from Secret Manager by
        name; if the output must exist, mark sensitive = true — but prefer not exposing it at all.
```

## Guidelines

1. Read every plan; a `destroy`/`replace` of a stateful resource is a hard stop, never auto-approved.
2. State is remote, encrypted, and locked — never local for a team, never in the repo.
3. No secret in HCL or in a plaintext output; `sensitive = true` on what must exist; read from a
   secret manager at apply time.
4. Pin `required_version`, every provider, and every module `source`.
5. Authenticate via OIDC workload-identity federation; no long-lived key committed or stored.
6. `prevent_destroy` on protected resources; `for_each` over `count`; `terraform fmt` + `tfsec`-clean.

## Gotchas

1. **A changed immutable attribute silently becomes destroy-and-replace.** The plan says so with
   `-/+` and "forces replacement" — read it; a stateful `-/+` is data loss.
2. **Local or unlocked state corrupts under concurrency.** Two CI runs applying the same unlocked
   state race; always use a backend with locking.
3. **`sensitive = true` hides a value in CLI output but NOT in state.** State still stores it in
   plaintext — that is why the backend must be encrypted and access-controlled.
4. **`terraform destroy` with no target nukes the whole configuration.** Scope it, and never wire it
   to run unattended on a shared environment.
5. **Provider default credentials can pick up an ambient key.** In CI, prefer OIDC federation and
   fail if no federated identity is present, rather than falling back to a static key.

## Integration

- **`gcp-cloud-expert` / `aws-cloud-expert`** — the per-cloud baseline (IAM, network, encryption,
  logging) this skill's resources must satisfy. Compose them: cloud expert says *what*, this skill
  says *how in Terraform*.
- **`pulumi-expert`** — the sibling for the Pulumi IaC tool; the same safety/custody rules, a
  different dialect.
- **`tdd-red-green-refactor`** — the test-first loop; the Terraform dialect is `terraform validate`
  + a policy/plan test (`tfsec`, Conftest/OPA) rather than a unit test.

## References

- Terraform: state, backends, and `sensitive` — https://developer.hashicorp.com/terraform/language/state
- Workload identity federation (keyless CI auth) — cloud provider OIDC docs.
- `tfsec` / Checkov (IaC misconfiguration) and Conftest/OPA (policy-as-code) for the review gate.
