---
name: pulumi-expert
description: >
  Writes, reviews, and hardens production Pulumi — stack/project structure, provider/version
  pinning, remote state backend with locking, preview/up discipline, config-and-secrets custody,
  and a no-secrets-in-state, least-privilege posture. Activates when authoring or refactoring Pulumi
  (TypeScript/Python/Go), designing a component or stack backend, reviewing a `pulumi preview` diff
  for destroy/replace blast radius, or wiring OIDC-federated (keyless) provider auth. Owns
  Infrastructure-as-Code idioms in Pulumi. Does not own a specific cloud's well-architected baseline
  (the per-cloud expert), the Terraform dialect, the application code, or the Factory's
  provision/gate workflow.
license: MIT
metadata:
  author: AI Software Factory (for this library)
  version: "0.1.0"
  last_updated: 2026-08-12
  category: coding
---

# Pulumi Expert

## Overview

Produces clean, reviewable **Pulumi** and reviews existing programs against a fixed priority order:
**Safety (blast radius) → State & secret custody → Correctness → Reusability → Style.** Pulumi
expresses infrastructure in a general-purpose language (TypeScript / Python / Go), which adds
expressive power *and* a new failure surface: a loop, a conditional, or a stray `await` can silently
change what `pulumi up` does to a live resource. Its danger, like Terraform's, is not syntax — one
`up` can destroy or replace a live resource, and a careless backend leaks credentials into state.
This skill encodes the discipline that keeps an `up` boring: pin everything, **preview before up**,
keep state remote-and-locked, and never let a secret reach state or the repo in plaintext. It
focuses on the mistakes a model makes without guidance, not on re-teaching the language.

**Freedom level: MEDIUM** — the safety order, state/secret rules, and preview-before-up discipline
are fixed; component shape, language, and resource choices vary.

**Project binding (optional).** If `.agents/project-context.yaml` defines `${ctx.tech_bindings.infra}`
(cloud, `iac_tool`, `state_backend`, `identity`/OIDC, `regions`, `protected_resources`), follow it;
otherwise use modern defaults (pinned provider plugins, a remote backend with locking, OIDC
workload-identity auth, secrets encrypted with a KMS-backed provider, no long-lived keys). This
skill supplies the Pulumi *method*; the per-cloud expert (`gcp-cloud-expert`, `aws-cloud-expert`,
...) supplies the provider baseline. Route only when `iac_tool: pulumi`.

## When to Activate

Activate when:
- Writing or refactoring Pulumi — projects, stacks, components, resources, config, outputs.
- Designing a **state backend** (remote, locked, encrypted) or an **OIDC** provider-auth setup.
- Reviewing a `pulumi preview` diff for correctness and **destroy/replace blast radius**.
- Structuring a repo into reusable **ComponentResources** + per-stack configuration.

**Do not activate** (adjacent skills own this):
- `gcp-cloud-expert` / `aws-cloud-expert` / `azure-cloud-expert` — own each provider's
  well-architected + security baseline (IAM, network, encryption, logging). This skill wires the
  resources; the cloud expert says what "good" looks like on that cloud.
- `terraform-expert` — owns the Terraform (HCL) dialect of the same job. Routing is by
  `${ctx.tech_bindings.infra.iac_tool}`.
- `python-expert` / `fullstack-developer` / `java-quarkus-expert` — own the application code the
  infrastructure runs. A Pulumi program is infra-as-code, not an app: it declares resources, it does
  not do request-handling business logic.
- The Factory's `/plan-infra`, `/provision`, `/infra-review`, `/cost`, `/drift` workflow skills —
  own the *lane* (design artifact, apply hard-gate, policy scan, cost estimate, drift report). This
  skill is the craft they compose.

## Core Concepts

Only the Pulumi-specific models a capable model may get wrong:

- **`up` reconciles to the program — it is not a script that runs top-to-bottom.** Pulumi builds a
  resource graph from your program and diffs it against state. A change to an immutable input is a
  **replace** (`+-`), not an edit; on a stateful resource that is data loss. Always read the
  `preview` diff's `create` / `update` / `replace` / `delete` counts — a `replace` on a database is
  the loud one. Treat `preview` as the review artifact, not a formality.
- **The program is code, so it has code failure modes.** An imperative loop over a mutable list, a
  resource created inside a conditional, or a non-deterministic name churns or orphans resources
  between runs. Keep resource declarations **deterministic**: stable logical names, no side effects,
  no I/O deciding what to create. Do not `console.log` a secret `Output`.
- **State is sensitive and shared.** Pulumi state records every resource — including secrets — and
  **must** live in a remote, locked backend (Pulumi Cloud, or a self-managed S3/GCS/Azure Blob
  backend), never local for a team and never in the repo. Encrypt secrets with a **KMS-backed secrets
  provider** (`--secrets-provider`), not the passphrase provider, for a team.
- **Config and secrets are first-class — use them.** Non-secret config via `pulumi config set`;
  secret config via `pulumi config set --secret` (encrypted in the stack file). Read them with
  `Config.requireSecret(...)` so the value stays an encrypted `Output`, never a plaintext string in
  the program or the repo.
- **Pin everything.** Pin the provider plugin versions (in `package.json` / `requirements.txt` /
  `go.mod` *and* the Pulumi provider version), and pin the Pulumi CLI in CI. An unpinned provider
  upgrade silently changes behaviour on the next `up`.
- **Keyless auth over long-lived keys.** Authenticate the provider via **OIDC workload-identity
  federation** (GitHub Actions → cloud), not a static access key stored as a long-lived secret. The
  short-lived token is the custody principle in practice.
- **A ComponentResource is an API.** Inputs are a typed args interface, outputs are registered
  outputs, and nothing else should leak. Per-stack configuration composes components per environment;
  a component never hardcodes an environment or an account id.

## Working Order

1. **Safety first (blast radius).** Read the `preview`. Any `replace`/`delete` of a stateful resource
   stops for explicit review; set `protect: true` on protected resources and
   `retainOnDelete` / `deleteBeforeReplace: false` (create-before-delete) where a replace must not
   cause an outage. Never `pulumi up --yes` a preview you have not read.
2. **State & secret custody.** Remote, locked backend; KMS-backed secrets provider. No secret in the
   program or a plaintext output; `requireSecret` / `additionalSecretOutputs` on anything sensitive.
   OIDC auth, no static keys.
3. **Correctness.** Right resource + inputs; explicit `dependsOn` only where the graph can't infer
   it; deterministic resource names; no I/O or randomness deciding what to create.
4. **Reusability.** Small, single-purpose **ComponentResources** with a typed args/outputs surface;
   per-stack config; no environment/account hardcoded inside a component.
5. **Style.** Language formatter (Prettier / Black / gofmt); clear logical names; a doc comment on
   every component's args; pinned versions; a policy pass (CrossGuard / Conftest) clean.

## Output Template (a component + a locked, OIDC backend)

```typescript
// index.ts — a ComponentResource is an API: typed args, registered outputs, protected state.
import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";

interface AssetsArgs {
  /** Resource name prefix, unique per environment. */
  namePrefix: pulumi.Input<string>;
  /** CMEK key — customer-managed, not Google-default. */
  kmsKey: pulumi.Input<string>;
}

class Assets extends pulumi.ComponentResource {
  public readonly bucketName: pulumi.Output<string>;

  constructor(name: string, args: AssetsArgs, opts?: pulumi.ComponentResourceOptions) {
    super("acme:infra:Assets", name, {}, opts);

    const bucket = new gcp.storage.Bucket(`${name}-assets`, {
      location: "EU",
      uniformBucketLevelAccess: true,          // no per-object ACLs
      versioning: { enabled: true },
      encryption: { defaultKmsKeyName: args.kmsKey },  // CMEK, not just Google-managed
    }, {
      parent: this,
      protect: true,                            // blast-radius guard: a replace must be deliberate
    });

    this.bucketName = bucket.name;
    this.registerOutputs({ bucketName: this.bucketName });  // the API surface — never a secret
  }
}
```

State backend and provider auth carry no static credentials — CI assumes a short-lived token via OIDC:

```bash
# Self-managed, LOCKED remote backend + a KMS-backed secrets provider (never the passphrase provider
# for a team, never local state). `identity` in tech_bindings.infra records the federated identity.
pulumi login gs://acme-pulumi-state-prod
pulumi stack init prod --secrets-provider "gcpkms://projects/acme/locations/eu/keyRings/pulumi/cryptoKeys/state"
# The CI job authenticates to GCP via Workload Identity Federation — no service-account key.
```

## Practical Guidance

- **Preview to a plan, apply that plan.** `pulumi preview --save-plan=plan.json` then
  `pulumi up --plan=plan.json` — so the applied change is exactly the reviewed one.
- **Isolate state per environment.** A stack per environment (dev/stage/prod) with its own config; a
  shared stack is a shared blast radius.
- **Deterministic names, not indexes.** Derive logical names from a stable key, not a loop index;
  reordering a list must not churn every later resource.
- **Guard the irreversible.** `protect: true` on databases, state buckets, DNS zones; a preview that
  wants to delete one should require unprotecting it first, deliberately.
- **Never commit stack state, a plaintext secret, or a downloaded key.** Encrypt stack secrets with a
  KMS provider; read secret values from config or a secret manager, not a committed file.

## Examples

**Example — reviewing a preview diff.**
```
Input:  pulumi preview shows  gcp:sql:DatabaseInstance main  will be replaced (+-),
        because "settings.tier" changed and forces replacement.
Review: BLOCK. A replace on a SQL instance destroys the database. This is not a tier edit — it is
        data loss. Options: (1) change tier in place if the provider supports it, (2) add a read
        replica + migrate, (3) if truly intended, snapshot first and get explicit consent. Never
        `up --yes`.
```

**Example — a secret logged from the program.**
```
Input:  export const dbPassword = instance.rootPassword;  // registered as a plaintext output
Fix:    do not export it. If a consumer needs it, mark it secret (additionalSecretOutputs or
        pulumi.secret(...)) so it is encrypted in state and masked — or better, have the consumer read
        it from Secret Manager by name and export nothing.
```

## Guidelines

1. Read every `preview`; a `replace`/`delete` of a stateful resource is a hard stop, never
   `up --yes`.
2. State is remote, locked, and encrypted with a KMS-backed secrets provider — never local for a
   team, never in the repo, never the passphrase provider for shared state.
3. No secret in the program or a plaintext output; `requireSecret` / `pulumi.secret` /
   `additionalSecretOutputs` on what must exist; read from config or a secret manager.
4. Pin provider plugins, the language SDK versions, and the Pulumi CLI in CI.
5. Authenticate via OIDC workload-identity federation; no long-lived key stored.
6. `protect: true` on protected resources; deterministic names over loop indexes; formatter + a
   CrossGuard/Conftest policy pass clean.

## Gotchas

1. **A changed immutable input silently becomes a replace.** The preview says so with `+-` and
   "replacement"; a stateful replace is data loss — read it.
2. **The passphrase secrets provider does not scale to a team.** Use a KMS-backed
   `--secrets-provider`; the passphrase lives on one laptop and blocks everyone else from decrypting
   state.
3. **`pulumi.secret` masks output but the value is still in state.** State stores it (encrypted) —
   that is why the backend must be encrypted and access-controlled, and why the secrets provider must
   be KMS-backed.
4. **Imperative code churns resources.** A resource created inside a loop/conditional over a mutable
   list, or with a non-deterministic name, orphans or recreates resources between runs — keep
   declarations deterministic and side-effect-free.
5. **Provider default credentials can pick up an ambient key.** In CI, prefer OIDC federation and
   fail if no federated identity is present, rather than falling back to a static key.

## Integration

- **`gcp-cloud-expert` / `aws-cloud-expert`** — the per-cloud baseline (IAM, network, encryption,
  logging) this skill's resources must satisfy. Compose them: cloud expert says *what*, this skill
  says *how in Pulumi*.
- **`terraform-expert`** — the sibling for the Terraform IaC tool; the same safety/custody rules, a
  different dialect. Routing is by `${ctx.tech_bindings.infra.iac_tool}`.
- **`tdd-red-green-refactor`** — the test-first loop; the Pulumi dialect is unit tests with mocks
  (`pulumi.runtime.setMocks`) + a policy pass (CrossGuard / Conftest) rather than a plain unit test.

## References

- Pulumi state & backends — https://www.pulumi.com/docs/concepts/state/
- Pulumi secrets & secrets providers — https://www.pulumi.com/docs/concepts/secrets/
- Workload identity federation (keyless CI auth) — cloud provider OIDC docs.
- Pulumi CrossGuard (policy-as-code) / Conftest-OPA for the review gate.
