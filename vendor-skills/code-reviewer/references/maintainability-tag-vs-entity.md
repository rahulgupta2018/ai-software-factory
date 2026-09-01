---
title: Tag vs Governed Entity
impact: MEDIUM
category: maintainability
tags: data-modeling, domain-model, schema, api-design, architecture
---

# Tag vs Governed Entity

Flag when an **attribution / label field** (a cost tag, analytics dimension, or free-text
metadata string) is relied on as if it were a **governed entity** — something that needs its own
lifecycle, permissions, budget, policy, or isolation boundary. Either promote the tag to a
first-class entity, or confirm it genuinely never needs governance.

## Why This Matters

A string tag has no identity, no lifecycle, and no place to hang rules. The moment a feature needs
to *govern* the thing the tag names — enforce a budget on it, scope permissions to it, isolate
data by it, archive or provision it — a bare tag silently fails:

- **No enforcement point** — you can't attach a budget, allowlist, or guardrail policy to a
  free-text value; typos create phantom "entities" and split reporting.
- **No lifecycle** — nothing to create, rename, archive, or deprovision; orphaned references linger.
- **No access control** — you can't grant a role "manage X" when X isn't a resource.
- **Weak isolation** — a tag is not a boundary; treating it as one is a data-leak and audit risk.

The tell: **the same name appears both as an attribution/analytics dimension AND as the thing a
user, app, key, or resource must "belong to" or be provisioned under.** That double-duty is the smell.

## ❌ Incorrect

```sql
-- ❌ "project" is only a free-text column on the usage/cost table.
-- But the product now needs per-project budgets, key scoping, and an allowlist.
CREATE TABLE usage_event (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   UUID NOT NULL,
  project     TEXT,            -- attribution tag, not a governed thing
  cost_cents  INT NOT NULL
);
-- Nowhere to store a project's budget, model allowlist, or lifecycle state.
-- "Acme-App", "acme app", "acme_app" all become different "projects".
```

```jsonc
// ❌ API model treats project as a label, yet the roadmap wants to govern it
{ "key": "sk-...", "tenant_id": "t_1", "project": "billing-service" }
// How do you archive a project? Scope a role to it? Cap its spend? You can't.
```

## ✅ Correct

```sql
-- ✅ Promote "project" to a first-class, governed entity...
CREATE TABLE project (
  id             UUID PRIMARY KEY,
  tenant_id      UUID NOT NULL REFERENCES tenant(id),
  name           TEXT NOT NULL,
  budget_cents   INT,
  model_allowlist JSONB,
  guardrail_profile TEXT,
  status         TEXT NOT NULL DEFAULT 'active',   -- lifecycle: active | archived
  UNIQUE (tenant_id, name)
);

-- ...and keep the tag as a FK for attribution (reporting still rolls up per project).
CREATE TABLE usage_event (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   UUID NOT NULL,
  project_id  UUID REFERENCES project(id),
  cost_cents  INT NOT NULL
);
```

> **In architecture / design docs (not just code):** the same rule applies. If a doc uses a
> dimension like `team/project` only as a FinOps tag but onboarding, RBAC, or isolation depend on
> it, call out the missing first-class construct and propose promoting it (its own screen,
> capability-matrix row, backend lifecycle, and cost attribution all lining up).

## When a Tag Is Fine

Not every label needs to be an entity. A tag is correct when it is **purely descriptive** and
nothing governs it — e.g. an `environment` string used only to slice reports, with no per-value
budget, permission, or lifecycle. Promote only when governance actually attaches.

## Review Checklist

- [ ] Does any budget, quota, allowlist, guardrail, or policy need to attach to this value? → entity
- [ ] Does a role/permission need to be scoped to it ("manage X")? → entity
- [ ] Is it used as an isolation or tenancy boundary? → entity (a tag is not a boundary)
- [ ] Does it have a lifecycle (create / rename / archive / deprovision)? → entity
- [ ] Is the same name doing double-duty as an analytics dimension AND a membership target? → smell
- [ ] If it stays a tag: is it constrained (enum/FK) to prevent typo-forked values?
