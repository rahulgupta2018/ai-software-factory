---
name: pipeline
description: >-
  Generates and hardens the CI/CD pipeline the rest of the Factory assumes — a GitHub Actions
  workflow with least-privilege permissions, OIDC/keyless cloud auth (no long-lived secret),
  pinned action SHAs, and the SCA/SBOM/SAST/sign gates wired as required checks. Activates on
  "generate a pipeline", "set up CI/CD", "harden my GitHub Actions", "add a release workflow".
  Owns pipeline generation + hardening; /security audits an existing pipeline against the same
  baseline, /deploy runs the release the pipeline produces.
license: MIT
metadata:
  author: AI Software Factory
  version: 0.1.0
  last_updated: 2026-07-24
  layer: Ship
  priority: V1
---

# Pipeline

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

`/pipeline` generates the **CI/CD pipeline** the earlier security tracks assume exists, and hardens
it to a fixed baseline. Phases 5–7 wired supply-chain gates (SCA/SBOM, SAST, signing/provenance,
transport) into `/security`, `/ship`, and `/deploy` — but those gates only fire if the pipeline
actually **runs** the scan, **requests** the OIDC token, and **exposes** the steps as required
checks. This skill produces that pipeline (GitHub Actions first) so the gates are real, not
aspirational.

Its defining trait is the **custody principle** (§6.2): the Factory holds **no long-lived registry
or cloud credential**. The generated pipeline authenticates **keyless via OIDC** (`id-token: write`
federated to the cloud/registry), pins every third-party action to a commit SHA, and grants the
`GITHUB_TOKEN` the **least privilege** it needs. A pipeline that reaches for a long-lived secret
fails its own lint.

## When to Activate

Activate when:
- A product needs its CI/CD pipeline generated or hardened — "generate a pipeline", "set up CI/CD",
  "harden my GitHub Actions", "add a release workflow", "wire the security gates into CI".
- An earlier track (SCA, SAST, signing) added a gate that now needs a live pipeline step to feed it.

**Do not activate** (adjacent skills own this):
- `security` — *audits* an existing pipeline against the baseline (same `lib/pipeline-lint.ts`); it
  reports, `/pipeline` generates and fixes.
- `deploy` — *runs* the release the pipeline produces (merge → deploy → verify); it consumes the
  pipeline, it doesn't author it.
- `ship` — owns the pre-merge PR path; `/pipeline` changes the workflow files, `/ship` lands them.

## Core Concepts

- **The workflow file is the artifact.** The generated/hardened `.github/workflows/*.yml` and the
  lint verdict are recorded as a run artifact (`NN-pipeline.md`) — an auditable record of what the
  pipeline grants and which gates it runs.
- **Custody: keyless, no long-lived secret.** Cloud/registry auth is **OIDC-federated** — the
  pipeline requests `id-token: write` and exchanges it for a short-lived token. The Factory never
  emits or stores a long-lived `AWS_SECRET_ACCESS_KEY`, `GCP_SA_KEY`, `DOCKER_PASSWORD`, or the
  like; a step that references one **fails the lint** (`lib/pipeline-lint.ts`).
- **Least privilege by default.** The top-level `permissions:` is `contents: read`; a job widens a
  single scope only when it must (and `id-token: write` for OIDC is not a repo-write grant). No
  `write-all`.
- **Pinned actions.** Every third-party `uses:` is pinned to a **full 40-hex commit SHA**, never a
  moveable tag/branch — a supply-chain hardening the lint enforces.
- **The gates must be wired as steps.** The SCA/SBOM scan (Track 1), the SAST scan (Track 2), and
  the signing/attestation (Track 3) are **required steps** in the pipeline; `required_steps` in
  `tech_bindings.ci` names the commands that must appear. A gate with no pipeline step is a lie.
- **Mechanism vs parameters.** GitHub Actions is the first *mechanism*; the provider, OIDC identity,
  and required steps are *parameters* (`tech_bindings.ci`). A second provider is a new binding, not
  a rewrite of this skill.
- **The lint is the proof.** Generation isn't done until `lib/pipeline-lint.ts` returns a clean
  verdict against the policy — the same check `/security` runs on an existing pipeline.

## Workflow

Freedom level: **low** — the hardening baseline is fixed; generate to it, don't negotiate it.

1. **Read context.** Load the merged product context (per the config protocol) for
   `tech_bindings.ci` (`provider`, `oidc_identity`, `require_oidc`, `require_pinned_actions`,
   `required_steps`), the supply-chain bindings (`supply_chain`, `sast`, `provenance`) whose steps
   the pipeline must run, and `commands` (build/test/deploy). If `tech_bindings.ci` is missing, ask
   for the provider + OIDC identity, then persist it to `.factory/stack.yaml` and re-run
   `fac sync-context` (never ask twice).
2. **Generate (or read) the workflow.** For a new pipeline, emit a GitHub Actions workflow with:
   least-privilege top-level `permissions: { contents: read }`; a build/test job running
   `commands.*`; the **SCA + SBOM** step (Track 1), the **SAST** step (Track 2), and the
   **sign + attest** step (Track 3, keyless cosign + SLSA); and `id-token: write` on the job that
   authenticates to the cloud/registry. Pin every third-party action to a commit SHA. For a
   hardening pass, read the existing `.github/workflows/*.yml` instead.
3. **Lint — HARD GATE.** Parse the workflow and run it through `lib/pipeline-lint.ts` against the
   policy derived from `tech_bindings.ci`. Every finding is a fix, not a warning: a missing/broad
   `permissions:`, no `id-token: write` (OIDC), a long-lived secret, an unpinned action, or a
   missing required step all **block** until fixed.
4. **Fix and re-lint.** Apply the fix for each finding (tighten permissions, add the OIDC token,
   replace a long-lived secret with OIDC auth, pin the action, wire the missing step) and re-run
   the lint until the verdict is clean.
5. **Branch-protection guidance.** Note which pipeline jobs should be **required status checks** on
   the protected branch (the SCA/SAST/build gates), so a red gate blocks merge — the Factory
   generates the workflow; enabling branch protection is a one-time repo setting the human confirms.
6. **Write the pipeline log as a run artifact.** Under an active run:
   ```bash
   fac run artifact --step pipeline --inputs .factory/stack.yaml --body-file pipeline.md
   ```
   Record the workflow path, the lint verdict (clean), and the required-check guidance.

## Practical Guidance

- Read the provider and OIDC identity from `tech_bindings.ci` — don't hardcode a cloud or a repo.
- Prefer OIDC to any secret: if a step needs cloud/registry auth, request `id-token: write` and use
  the provider's OIDC action, not a stored key. The `GITHUB_TOKEN` covers most in-repo needs.
- Pin actions to the SHA behind the tag you want (`actions/checkout@<sha>  # v4`), keeping the tag
  in a trailing comment for readability.
- Grant a job-level `permissions:` widening only the one scope it needs; leave the top level at
  `contents: read`.
- The required steps come from `tech_bindings.ci.required_steps` — keep them in lockstep with the
  SCA/SAST/sign tools the product actually uses.

## Examples

**Example:**
```
Input:  "Set up CI/CD for the repairs service." tech_bindings.ci: provider github-actions,
        require_oidc true, require_pinned_actions true, required_steps [osv-scanner, semgrep, cosign].
Steps:  read context → generate release.yml (permissions: contents: read; build job with
        id-token: write; osv-scanner + SBOM step; semgrep --sarif step; cosign sign --yes step;
        actions/checkout pinned to a SHA) → lint via lib/pipeline-lint.ts → clean → note the three
        gate jobs as required status checks.
Output: run artifact NN-pipeline.md — workflow path, clean lint verdict, required-check guidance.
Fail path: a first draft used secrets.AWS_SECRET_ACCESS_KEY → lint flagged long-lived-secret →
        replaced with aws-actions/configure-aws-credentials via OIDC → re-lint clean.
```

## Guidelines

1. The hardening baseline is a hard gate: generation isn't done until `lib/pipeline-lint.ts` is
   clean against the policy.
2. Keyless/OIDC only — a long-lived cloud/registry secret in a step is a finding, never a shortcut.
3. Top-level `permissions:` is least-privilege (`contents: read`); widen a single job scope only
   when required; `id-token: write` for OIDC is expected, not excessive.
4. Pin every third-party action to a full commit SHA.
5. The SCA/SBOM, SAST, and sign/attest gates must appear as pipeline steps (`required_steps`).
6. Read provider + OIDC identity from `tech_bindings.ci`; stay provider-agnostic.
7. Record the pipeline + lint verdict as a run artifact; name the required status checks for branch
   protection.

## Gotchas

1. **A gate with no step**: wiring a gate into `/security` but never running the scan in CI means
   the gate never fires — the pipeline must run the step.
2. **Reaching for a secret**: a stored cloud key is the easy path and the wrong one; OIDC is the
   custody-safe default and the lint enforces it.
3. **Tag-pinned actions**: `@v4` can be moved under you; pin the SHA.
4. **Broad token**: `permissions: write-all` (or an implicit default) hands every scope to every
   step — start at `contents: read`.
5. **Generated but unprotected**: a hardened workflow that isn't a required status check doesn't
   block a bad merge — surface the branch-protection step to the human.

## Integration

- `security` — audits an existing pipeline against the same `lib/pipeline-lint.ts` baseline; this
  skill generates and fixes.
- `deploy` — runs the release the pipeline produces; the provenance/transport gates it enforces are
  fed by this pipeline's sign/attest steps.
- `ship` — lands the workflow-file change as a normal PR.
- Run harness (`fac run`) — records the pipeline + lint verdict as `NN-pipeline.md`.

## References

- Pipeline lint: `lib/pipeline-lint.ts` (least-privilege permissions, OIDC/keyless, pinned SHAs,
  required steps); binding `tech_bindings.ci`; tests `test/pipeline-lint.test.ts`
- Supply-chain gates the pipeline runs: `lib/sca-report.ts` (Track 1), `lib/sast-report.ts`
  (Track 2), `lib/provenance-verify.ts` (Track 3)
- Build/test/deploy commands: `commands` in `.factory/stack.yaml`
- Related skills: `security`, `deploy`, `ship`
- Agent: `agents/release-engineer.md`
