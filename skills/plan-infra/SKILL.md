---
name: plan-infra
description: "Turns a settled stack (.factory/stack.yaml) into the Infrastructure-as-Code design record — from the landing-zone foundation (org/folder/project + billing bootstrap, org-policy guardrails) through the environment ladder (elicited per product, never baked), the region strategy (single vs multi-region per environment), the well-architected pillars (scalability, resiliency, observability, IAM/RBAC, SSL, secrets, runtimes, data stores, messaging), any MLOps/LLMOps platform, the remote+locked state backend, the OIDC (keyless) identity, and the protected (stateful) resources — before a single resource is provisioned. Composes terraform-expert / pulumi-expert and the per-cloud experts (gcp-cloud-expert, gcp-landing-zone-expert, gcp-mlops-expert). Provisions nothing: it is the design half of the infra lane, the analogue of /plan-arch for infrastructure. Activates when a product needs cloud infrastructure and has no infra design yet; owns the IaC design record, not the apply (/provision) or the policy scan (/infra-review)."
license: MIT
metadata:
  author: AI Software Factory
  version: 0.1.0
  last_updated: 2026-08-12
  layer: Plan
  priority: V1
---

# Plan-Infra

<!-- FACTORY:ETHOS (generated — do not edit) -->
> **Factory ethos.** Every action inherits these principles:
>
> - Boil the ocean
> - Search before building
> - User sovereignty
> - One owner per file
> - Mechanism vs parameters
> - Ground your claims
> - Defensibility is the product

<!-- FACTORY:WRITING-STYLE (generated — do not edit) -->
### Writing style

- Gloss jargon on first use. Short sentences. Lead with user impact.
- Frame questions in outcome terms ("what breaks for your users if…"), not implementation terms.
- Be direct about quality and trade-offs. Cite sources for factual claims.

<!-- FACTORY:CONFIG-PROTOCOL (generated — do not edit) -->
### Config protocol

A product is defined by two files, split by who writes them:

| File | Owner | Holds |
|---|---|---|
| `PRD.md` | **human** | frontmatter: `product`, `domain`, `meta` · body: the requirements |
| `.factory/stack.yaml` | **`/plan-arch`** | `tech_stack`, `commands`, `skills`, `guardrails`, `escalation_policy`, `tech_bindings` |

Before doing anything else:

1. **Read** both — or the merged `.factory/context.gen.yaml` if it is current. Skills bind via `${ctx.*}`.
2. If a value you need is **missing**, ask the user with AskUserQuestion — never guess.
3. **Persist** the answer to the file that *owns* that key, then re-run `fac sync-context`.
   Never write a machine key into `PRD.md`; `sync-context` rejects it.
4. When a key is absent and the user cannot supply it, fall back to your documented generic default.

Precedence: per-skill `overrides` → merged product context → skill generic default.

## Overview

`/plan-infra` is the Factory's infrastructure architect. Once `/plan-arch` has settled the stack,
some products need cloud infrastructure — and that infrastructure spans everything from the
**foundation** (organisation, folders, projects, billing, org-policy guardrails) up through the
**environment ladder**, the **region strategy**, the **well-architected pillars** (scalability,
resiliency, observability, IAM/RBAC, SSL, secrets, runtimes, data stores, event-driven messaging),
and — where the product has models — an **MLOps/LLMOps platform**. All of it must be **designed
before it is provisioned**, on the same run/artifact harness as every other lane. `/plan-infra`
produces the **IaC design record** (`02d-plan-infra.md`): the landing-zone foundation, which
Infrastructure-as-Code tool, how modules are structured, where state lives (remote, encrypted,
locked), how CI authenticates (OIDC workload-identity federation, never a long-lived key), what the
**environments** are (elicited per product — never a baked default), the **region strategy** per
environment, and which resources are **protected** (stateful / irreversible, guarded against
accidental destroy).

It is a *wrapper*: it composes `terraform-expert` / `pulumi-expert` (the IaC craft — modules, state,
plan/apply discipline; routed by `iac_tool`) and the per-cloud experts —
`gcp-landing-zone-expert` (the org/project/billing/network foundation), `gcp-cloud-expert` (the
per-resource well-architected security baseline), and `gcp-mlops-expert` (the Vertex AI ML/LLM
platform, when the product has models). On top of them it adds the Factory's discipline: the design
record names the **protected resources** and the **keyless identity** that `/provision`'s hard gate
and `/infra-review`'s policy scan later enforce, plus the **budget** `/cost` prices against and the
**drift** posture `/drift` monitors. It provisions nothing.

## When to Activate

Activate when:
- A product needs cloud infrastructure (`${ctx.tech_bindings.infra}` is set, or the operator asks
  to "design the infrastructure", "plan the Terraform", "set up the cloud resources").
- `.factory/stack.yaml` is settled and there is no IaC design record yet.

**Do not activate** (adjacent skills own this):
- `provision` — owns the *apply* (plan → hard gate → apply). `/plan-infra` designs; `/provision`
  builds. If the design is wrong, fix it here and re-run.
- `infra-review` — owns the *policy scan* (`tfsec`/Checkov + OPA/Conftest) of the written IaC; this
  skill produces the design it later reviews.
- `cost` / `drift` — own the *budget advisory* and the *post-provision drift check*; `/plan-infra`
  sets the budget and protected-resource posture they later use, it doesn't price or monitor.
- `terraform-expert` / `pulumi-expert` / `gcp-cloud-expert` / `gcp-landing-zone-expert` /
  `gcp-mlops-expert` — the craft skills this wrapper composes; it orchestrates them, it doesn't
  replace them.
- `plan-arch` — owns the application stack (`tech_stack`, `commands`, `skills`); `/plan-infra` is
  the infrastructure sibling that reads that stack and designs the cloud beneath it.

## Core Concepts

- **The design record is the artifact — it provisions nothing.** `02d-plan-infra.md` is a
  reviewable plan: the landing-zone foundation, modules, state backend, identity, environments,
  region strategy, the well-architected pillars, any ML platform, and protected resources. No cloud
  is touched until `/provision`.
- **Foundation before workloads.** The record starts at the **landing zone** (organisation → folders
  → projects, billing + budget bootstrap, org-policy guardrails, shared networking, IAM group model)
  — the ground-zero estate the workloads run on — via `gcp-landing-zone-expert`. A product with one
  bucket still needs a governed project; a product with fifty needs the hierarchy.
- **Environments are ELICITED, never baked.** The environment ladder (e.g. INT / SIT / PRE-PROD /
  PROD, or dev / staging / prod, or just prod) is the **product's decision** — always ask, never
  assume a default. Each environment is its own isolated blast radius (own project(s), state prefix,
  service accounts) with one-way promotion; prod credentials never live in a lower environment.
- **Region strategy is an explicit per-environment decision.** Single-region (simplest, cheapest),
  multi-region within a continent (resiliency), or multi-region across continents (latency / DR /
  residency) — decided **per environment** (dev may be single-region while prod is multi), enforced
  by the `gcp.resourceLocations` org policy, with the DR posture (RPO/RTO) recorded.
- **The well-architected pillars are part of the design.** The record addresses **scalability**
  (autoscaling, quotas), **resiliency** (multi-zone/region, backups, DR), **observability** (central
  logging sink, monitoring, alerting), **IAM/RBAC** (groups + least privilege), **SSL/TLS**
  (managed certs, HTTPS-only), **secrets** (a secret manager, never in state or the repo),
  **runtimes** (serverless / containers / VMs), **data stores**, and **event-driven messaging** —
  each folded in from the per-cloud expert, not left to `/provision`.
- **State custody is a design decision, not an afterthought.** The record fixes a **remote,
  encrypted, locked** backend (GCS / S3+DynamoDB / Azure Storage) — never local, never in the repo —
  because state holds secrets in plaintext.
- **Keyless identity is non-negotiable.** CI authenticates via **OIDC workload-identity federation**
  (short-lived token), never a downloadable long-lived key. The record names the federated identity
  (`${ctx.tech_bindings.infra.identity}`), never a key value.
- **Protected resources, budget, and drift posture are declared up front.** Stateful/irreversible
  resources are listed as `protected` (→ `prevent_destroy` and `/provision`'s gate); the monthly
  **budget** (`cost_budget`) is set for `/cost`; and drift monitoring is enabled for `/drift`.
- **MLOps/LLMOps is planned when the product has models.** When the product serves ML or LLM
  features, the record designs the Vertex AI platform via `gcp-mlops-expert` — pipelines, model
  registry, feature store, serving, eval + guardrails, and drift monitoring — as first-class infra,
  not an afterthought bolted onto the app.
- **Cloud-agnostic by binding.** The tool and cloud come from `${ctx.tech_bindings.infra}`
  (`iac_tool`, `cloud`). The per-cloud experts are chosen by `cloud`; the design is portable at the
  binding level so a second cloud is a binding change, not a rewrite.

## Workflow

Freedom level: **medium** — the state/identity/protected-resource/guardrail discipline is fixed; the
foundation shape, environment ladder, region strategy, and module design are yours (elicited, not
baked).

1. **Read the stack and the infra binding.** Load `.factory/stack.yaml` and
   `${ctx.tech_bindings.infra}` (cloud, `iac_tool`, `state_backend`, `identity`, `org`,
   `environments`, `regions`, `runtimes`, `data_stores`, `messaging`, `observability`,
   `cost_budget`, `mlops`, `protected_resources`). If a needed value is absent, propose it
   (AskUserQuestion) and persist it to `stack.yaml` — never guess the cloud, the environments, or
   invent a key.
2. **Elicit the environments and region strategy.** Always ask how many environments and their
   names, and single- vs multi-region per environment (residency) — these are product decisions, not
   Factory defaults. Persist to `${ctx.tech_bindings.infra.environments}`.
3. **Choose the craft.** Load `terraform-expert` or `pulumi-expert` for the IaC method (by
   `iac_tool`), `gcp-landing-zone-expert` for the foundation, `gcp-cloud-expert` for the per-resource
   baseline, and `gcp-mlops-expert` when the product has models. Route strictly by binding.
4. **Design the landing-zone foundation.** Org → folders (bootstrap / common / per-environment) →
   projects; a seed/bootstrap project first (state + CI identity + org-policy definitions); billing
   linked at creation with budgets + alert thresholds; shared VPC / hub-and-spoke networking;
   org-policy guardrails at the folder so they inherit.
5. **Design the module layout.** Small, single-purpose modules with a typed input/output surface;
   per-environment root configurations; nothing environment- or account-hardcoded inside a module.
6. **Fix state and identity.** A remote, encrypted, **locked** backend; OIDC workload-identity
   federation for CI (no long-lived key). Record both explicitly.
7. **Address the well-architected pillars.** Scalability, resiliency/DR (RPO/RTO), observability
   (central log sink + monitoring + alerts), IAM/RBAC (groups + least privilege), SSL/TLS (managed
   certs, HTTPS-only), secrets (a secret manager), runtimes, data stores, and event-driven messaging
   — each folded in from the per-cloud expert.
8. **Plan the ML platform (if any).** When the product serves models, design the Vertex AI
   pipelines, registry, feature store, serving, eval + guardrails, and monitoring via
   `gcp-mlops-expert`.
9. **Declare protected resources, budget, and drift.** List every stateful/irreversible resource as
   `protected` (→ `prevent_destroy`); set the monthly `cost_budget` for `/cost`; enable drift
   monitoring for `/drift`.
10. **Apply the security baseline + guardrails.** Fold in the per-cloud expert's baseline
    (least-privilege IAM, default-deny network, CMEK on stateful data, audit logging) and note the
    org-policy guardrails to enforce (disable SA keys, restrict public IP, resource locations, etc.).
11. **Record the run artifact.** `/plan-infra` follows the stack in the design band, so it is a
    **sub-sequenced artifact** reading `stack.yaml` as its input:
    ```bash
    fac run artifact --seq 2d --step plan-infra --inputs .factory/stack.yaml --body-file infra-design.md
    ```
12. **Hand off.** The design proceeds to `/infra-review` (policy scan) and `/cost` (budget) in
    parallel, then `/provision` (the gated apply), with `/drift` monitoring after. A design change
    re-opens the downstream infra lane (make-like cascade).

## Practical Guidance

- Start at the foundation — a governed project + billing + org-policy guardrails come before any
  workload resource; `gcp-landing-zone-expert` owns that layer.
- Always **elicit** the environments and the per-environment region strategy; never assume
  INT/SIT/PRE-PROD/PROD or single-region — they are product decisions.
- Read the cloud + tool from `${ctx.tech_bindings.infra}`; never hardcode a provider — the Factory
  is multi-cloud at the binding level.
- Treat the state bucket itself as a protected resource — it holds secrets and its loss is
  catastrophic; harden it (versioning, CMEK, uniform access, lock) like any stateful resource.
- Name the federated identity, never a key — if the design needs a key, the design is wrong.
- List protected resources exhaustively; a stateful resource you forget to protect is one
  `/provision` can replace without stopping.
- Keep environments isolated (separate projects, state backends/prefixes, service accounts) — a
  shared state or project is a shared blast radius.
- Design the ML platform as first-class infra when the product has models — pipelines, registry,
  serving, eval + guardrails — via `gcp-mlops-expert`, not bolted onto the app later.

## Examples

**Example:**
```
Input:  .factory/stack.yaml (Repair Tracker) + tech_bindings.infra { cloud: gcp, iac_tool: terraform,
        state_backend: gcs, identity: github-oidc,
        org: { org_id, billing_account, folders: [common, envs] },
        environments: [ {name: dev, region_strategy: single, regions: [europe-west2]},
                        {name: prod, region_strategy: multi, regions: [europe-west2, europe-west1],
                         promotion_from: dev} ],
        cost_budget: { monthly: 2000, currency: GBP }, mlops: { platform: vertex },
        protected_resources: [google_sql_database_instance.main, google_storage_bucket.tf_state] }.
Output: 02d-plan-infra.md — a landing zone (org → common/env folders → per-env projects, billing +
        budget at creation, org-policy guardrails), a Terraform module layout (network, data, iam,
        mlops modules; per-env roots), a GCS remote backend (versioned + CMEK + locked), GitHub OIDC
        workload-identity federation (no key), dev single-region / prod multi-region, the
        well-architected pillars (autoscaling, multi-zone DB + backups, central log sink, HTTPS-only
        managed certs, Secret Manager), a Vertex MLOps platform (pipeline + registry + endpoint
        canary + eval gate), a GBP 2,000 budget for /cost, protected: the SQL instance + the state
        bucket (prevent_destroy).
Handoff → /infra-review (policy scan) ∥ /cost (budget) → /provision (gated apply) → /drift (monitor).
```

## Guidelines

1. Design, never provision — the record is a plan; `/provision` applies it.
2. Foundation first — a governed project + billing + org-policy guardrails precede any workload.
3. Elicit the environments and per-environment region strategy; never bake a default ladder.
4. State is remote, encrypted, and locked; the state bucket is itself a protected resource.
5. Identity is OIDC workload-identity federation — name the federated identity, never a key.
6. Address the well-architected pillars (scalability, resiliency/DR, observability, IAM/RBAC, SSL,
   secrets, runtimes, data, messaging) and plan the ML platform when the product has models.
7. Declare every stateful/irreversible resource as `protected` (→ `prevent_destroy`); set the budget
   for `/cost` and enable drift for `/drift`.
8. Route the cloud/tool from `${ctx.tech_bindings.infra}`; fold in the per-cloud baselines. Record
   the design as `02d-plan-infra.md` with `.factory/stack.yaml` as its input.

## Gotchas

1. **Skipping the landing zone**: dropping a workload into an ungoverned project (no billing budget,
   no org policy, default network) is how estates rot — design the foundation first.
2. **Baking an environment ladder**: INT/SIT/PRE-PROD/PROD is one product's answer, not a default —
   always elicit the environments and the per-environment region strategy.
3. **Local or in-repo state**: never — state holds secrets in plaintext and corrupts under
   concurrency; the backend must be remote, encrypted, and locked.
4. **A long-lived key in the design**: any downloadable credential is a custody failure; use OIDC
   federation. `/provision` and `/infra-review` block it, but the design should never propose it.
5. **A forgotten protected resource**: a stateful resource not marked `protected` is one the apply
   gate won't stop — enumerate them all.
6. **Bolting on MLOps later**: for a model-serving product the ML platform is first-class infra —
   design pipelines/registry/serving/eval up front via `gcp-mlops-expert`, not as an afterthought.
7. **Designing the app instead of the infra**: `/plan-infra` designs the cloud beneath the app, not
   the app — that's `/plan-arch` and the build loop.

## Integration

- `plan-arch` — writes the stack `/plan-infra` reads; the infra design sits beneath the app stack.
- `terraform-expert` / `pulumi-expert` (craft) — supply the IaC method (modules, state, plan/apply
  discipline); routed by `${ctx.tech_bindings.infra.iac_tool}`.
- `gcp-landing-zone-expert` (craft) — supplies the org/folder/project/billing/network foundation.
- `gcp-cloud-expert` (craft) — supplies the GCP per-resource well-architected security baseline;
  routing is by `${ctx.tech_bindings.infra.cloud}`.
- `gcp-mlops-expert` (craft) — supplies the Vertex AI ML/LLM platform design when the product has
  models.
- `infra-review` / `cost` — scan the written IaC for policy violations (a hard gate) and price the
  plan against the budget (advisory); both read this design.
- `provision` / `drift` — apply the design behind a hard gate (keyed on the `protected` resources
  this record declares) and monitor the live estate against it afterward.
- Run harness (`fac run`) — records the design as a sub-sequenced `02d-plan-infra.md` reading
  `stack.yaml`; a design change re-opens the downstream infra lane.

## References

- Craft: vendored `terraform-expert` / `pulumi-expert` (IaC method), `gcp-landing-zone-expert`
  (foundation), `gcp-cloud-expert` (per-resource baseline), `gcp-mlops-expert` (ML platform)
- Binding: `${ctx.tech_bindings.infra}` in `.factory/stack.yaml`
- Related skills: `plan-arch`, `infra-review`, `cost`, `provision`, `drift`
- Agent: `agents/platform.md`
