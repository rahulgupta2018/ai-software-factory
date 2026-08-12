---
name: gcp-mlops-expert
description: >
  Designs and hardens MLOps and LLMOps on Google Cloud — Vertex AI Pipelines for training, the Model
  Registry and Feature Store, batch/online serving with endpoints, model + data + prompt versioning,
  evaluation and safety guardrails for both classic ML and LLM/GenAI apps, and production monitoring
  for drift, skew, and quality regression. Activates when standing up an ML/LLM training-to-serving
  pipeline, wiring a model registry or feature store, designing an LLM eval + guardrail harness,
  versioning prompts/models, or setting up model-monitoring on Vertex AI. Owns the ML/LLM platform on
  GCP. Does not own the landing-zone foundation (gcp-landing-zone-expert), per-resource hardening
  (gcp-cloud-expert), the IaC idioms (terraform/pulumi-expert), or the Factory's workflow skills.
license: MIT
metadata:
  author: AI Software Factory (for this library)
  version: "0.1.0"
  last_updated: 2026-08-12
  category: coding
---

# GCP MLOps / LLMOps Expert

## Overview

Carries the **MLOps and LLMOps** discipline for Google Cloud's **Vertex AI** platform: how a model
gets from data to a monitored production endpoint reproducibly, and how a GenAI/LLM app gets from a
prompt to a governed, evaluated, guardrailed service. It answers "what does the ML/LLM platform look
like — pipelines, registry, feature store, serving, eval, guardrails, monitoring — on top of a
landing-zone project" without the two classic failure modes: a notebook-to-prod pipeline nobody can
reproduce, and an LLM app shipped with no evaluation, no guardrail, and no drift monitoring. It
focuses on the MLOps/LLMOps traps a model gets wrong (training/serving skew, an unversioned model or
prompt, no eval gate, an ungoverned GenAI endpoint), not on re-teaching a single algorithm.

**Freedom level: MEDIUM** — the reproducibility, versioning, eval-gate, and monitoring discipline is
fixed; the model, framework, pipeline shape, and eval metrics vary by use case.

**Project binding (optional).** If `.agents/project-context.yaml` defines
`${ctx.tech_bindings.infra}` (`cloud: gcp`, `mlops` with `platform`/`model_registry`/`feature_store`/
`eval`/`guardrails`, `regions`, `identity`), follow it; otherwise use the Vertex AI defaults below.
This skill runs *inside* a landing-zone project (`gcp-landing-zone-expert`), on hardened resources
(`gcp-cloud-expert`), expressed as code by `terraform-expert` / `pulumi-expert`.

## When to Activate

Activate when:
- Standing up a **training-to-serving** pipeline (Vertex AI Pipelines / KFP), a **Model Registry**,
  or a **Feature Store**.
- Designing **serving** (batch prediction, online endpoints, or a GenAI/LLM endpoint) with rollout
  and rollback.
- Building an **LLM/GenAI eval + guardrail** harness (quality metrics, safety filters,
  groundedness/citation checks, prompt-injection defence) or **prompt/model versioning**.
- Setting up **model monitoring** — training/serving skew, feature/prediction drift, quality
  regression, and the alerting on them.

**Do not activate** (adjacent skills own this):
- `gcp-landing-zone-expert` — owns the org/project/billing/network foundation this platform runs on.
- `gcp-cloud-expert` — owns per-resource hardening (the bucket, SA, network) each Vertex resource
  uses; this skill wires the ML platform, that one hardens each piece.
- `terraform-expert` / `pulumi-expert` — express the platform as IaC; this skill says *what the ML
  platform is*.
- `memory-systems` / `multi-agent-patterns` — own agent memory and topology; this skill owns the
  model/serving/eval platform, not the agent runtime design.
- The Factory's `/plan-infra`, `/provision`, `/cost`, `/drift` — own the lane; this is the craft.

## Core Concepts — reproducible ML, governed LLM

Only the MLOps/LLMOps models a capable model may get wrong:

- **A pipeline is the unit of reproducibility — not a notebook.** Training runs as a **Vertex AI
  Pipeline** (KFP/TFX): versioned components, declared inputs/outputs, tracked artifacts and
  **lineage** (which data + code + params produced which model). A notebook that trains "the model"
  by hand is unreproducible and unauditable. Every trained model is registered with the pipeline run
  that made it.
- **The Model Registry is the source of truth for a model's identity and stage.** A model version
  lives in the **Vertex AI Model Registry** with its metrics, its lineage, and a **stage**
  (candidate → staging → production). Serving points at a *registered version*, never at a loose
  artifact in a bucket. Promotion between stages is a gated, recorded decision.
- **The Feature Store prevents training/serving skew.** Features are computed once and served to both
  training and online inference from the **Feature Store**, so the value a model trains on equals the
  value it serves on. Two separate feature code paths (batch SQL for training, hand-written lookups
  for serving) are the classic skew bug.
- **Serving is a versioned endpoint with rollout + rollback.** Online prediction via a Vertex
  **Endpoint** with **traffic-split** deploys (canary a new model version at N%, watch, then shift),
  and a one-step rollback to the previous version. Batch prediction for offline scoring. Autoscaling
  and a resource ceiling are set explicitly.
- **Nothing ships without evaluation — an eval gate, not a vibe.** A model (or an LLM prompt/chain)
  is evaluated against a **held-out set with fixed metrics** before promotion; the result is recorded
  and gates the stage change. For **LLM/GenAI**: quality (task metrics, LLM-as-judge with a rubric),
  **groundedness/citation** for RAG, and safety — measured, versioned, and compared to the incumbent,
  not asserted.
- **LLM apps carry guardrails as a layer, not a hope.** Input/output **safety filters**
  (toxicity/PII/policy), **prompt-injection** defence for tool-using/RAG apps, groundedness checks
  that flag ungrounded claims, and a fallback/refusal path. Guardrails are configured, tested, and
  monitored — the same rigour as an eval.
- **Prompts and models are versioned artifacts.** A **prompt** (template + params + model + settings)
  is versioned like code, tied to the eval that qualified it and the app release that uses it. "We
  changed the prompt" without a version and a re-eval is an unmanaged production change.
- **Monitoring closes the loop — drift, skew, and quality.** Vertex **Model Monitoring** watches
  **feature drift** and **training/serving skew** for classic ML, and (for LLM apps) tracks quality,
  cost/latency, and refusal/guardrail-trigger rates over time, alerting when a metric regresses.
  Retraining/re-eval is triggered by a signal, not a calendar guess.
- **The platform inherits the estate's security.** Vertex resources use CMEK, private endpoints
  (VPC-SC / Private Service Connect where required), least-privilege service accounts (WIF, no key),
  and audit logging — the `gcp-cloud-expert` baseline applies to every ML resource.

## Working Order (design or review an ML/LLM platform)

1. **Classify the workload.** Classic ML (train → register → serve → monitor) vs LLM/GenAI (prompt →
   eval → guardrail → serve → monitor), or both. Read `${ctx.tech_bindings.infra.mlops}`.
2. **Pipelines + lineage.** Training as a versioned Vertex Pipeline with tracked artifacts; every
   model registered with its producing run.
3. **Registry + Feature Store.** Model versions with stages in the registry; features served to
   train and serve from one Feature Store to kill skew.
4. **Serving.** Versioned endpoint with traffic-split canary + rollback (or batch); explicit
   autoscaling/ceiling; CMEK + private endpoint + least-privilege SA.
5. **Evaluation gate.** Held-out eval with fixed metrics gating promotion; for LLM add
   groundedness/citation + LLM-as-judge rubric + safety; compare to incumbent, record it.
6. **Guardrails (LLM).** Input/output safety filters, prompt-injection defence, groundedness flags,
   refusal/fallback — configured, tested, monitored.
7. **Versioning.** Prompts and models as versioned artifacts tied to their eval and the app release.
8. **Monitoring.** Drift/skew (ML) and quality/cost/guardrail-rate (LLM) monitoring with alerts and
   a signal-triggered retrain/re-eval.

## Output Template (a pipeline-registered model on a canary endpoint)

```python
# Training is a VERSIONED PIPELINE with tracked lineage — not a notebook. The model that comes out is
# registered with the run that produced it, so "which data+code+params made this?" always has an answer.
from google.cloud import aiplatform
from kfp import dsl

@dsl.pipeline(name="repairs-triage-train")
def train_pipeline(dataset_uri: str, eval_threshold: float):
    train = train_op(dataset=dataset_uri)             # versioned component, declared I/O
    eval_ = evaluate_op(model=train.outputs["model"]) # eval gate: promotion is blocked below threshold
    with dsl.If(eval_.outputs["primary_metric"] >= eval_threshold):
        register_op(model=train.outputs["model"])     # → Model Registry as a CANDIDATE version

# Serving is a versioned endpoint with a traffic-split canary + one-step rollback — never a bare artifact.
endpoint = aiplatform.Endpoint("projects/acme-ml-prod/locations/europe-west2/endpoints/triage")
endpoint.deploy(
    model=candidate_model,        # a REGISTERED version, promoted through a stage gate
    traffic_split={"0": 90, candidate_model.name: 10},  # canary at 10%, watch, then shift
    machine_type="n1-standard-4",
    min_replica_count=1, max_replica_count=4,           # explicit autoscaling ceiling
    encryption_spec_key_name=CMEK,                      # inherits the estate's encryption baseline
)
```

For an **LLM app**, the shape is the same discipline expressed as an eval + guardrail harness:

```python
# An LLM release is a VERSIONED prompt + model + settings, qualified by an eval, wrapped in guardrails.
release = PromptVersion(id="triage-v7", model="gemini-1.5-pro", template=TEMPLATE, params=PARAMS)
report  = evaluate(release, dataset=HELD_OUT,           # fixed metrics, compared to the incumbent
                   metrics=["task_accuracy", "groundedness", "citation_coverage", "safety"])
assert report.passes_gate(baseline="triage-v6")         # eval GATES promotion — not a vibe
serve(release, guardrails=[pii_filter, injection_defense, groundedness_flag, refusal_fallback],
      monitor=["quality", "cost", "latency", "guardrail_trigger_rate"])  # close the loop
```

## Practical Guidance

- **Register every model; serve only registered versions.** A model in a bucket with no registry
  entry has no lineage, no stage, and no promotion record — it is untraceable in an incident.
- **One feature path for train and serve.** Compute features once into the Feature Store; two code
  paths is how skew ships silently.
- **Gate promotion on a recorded eval, comparing to the incumbent.** "It looks better" is not a gate;
  a metric on a held-out set versus the current production version is.
- **Version prompts like code.** A prompt change is a new version with its own eval and its own app
  release — never an untracked edit to a live string.
- **Monitor for a signal, retrain on the signal.** Drift/skew/quality alerts trigger re-eval or
  retraining; a fixed retrain calendar wastes cost and misses real regressions.
- **Inherit the security baseline.** CMEK, private endpoints, WIF (no SA key), audit logging on every
  Vertex resource — the ML platform is not exempt from `gcp-cloud-expert`.

## Examples

**Example — an LLM app with no eval or guardrail.**
```
Input:  A RAG support assistant ships by editing the prompt string and deploying; no held-out eval,
        no groundedness check, no injection defence, no drift monitoring.
Review: BLOCK — LLMOps gaps. (1) Version the prompt (template+model+params) as an artifact. (2) Add a
        held-out eval with groundedness + citation-coverage + safety metrics, gating promotion vs the
        incumbent. (3) Add guardrails: PII/toxicity filter, prompt-injection defence (RAG is tool-using),
        groundedness flag + refusal fallback. (4) Add monitoring on quality/cost/guardrail-trigger rate
        with alerts. Then it can ship.
```

**Example — training/serving skew.**
```
Input:  Training features come from a batch SQL job; the online service recomputes them by hand in
        the request path with slightly different logic.
Fix:    Move both to one Feature Store: compute the feature once, serve it to training and to online
        inference from the same store. The two-path logic IS the skew bug — one path removes it.
```

## Guidelines

1. Training is a versioned Vertex Pipeline with tracked lineage; every model is registered with its
   producing run — never a notebook-to-prod artifact.
2. Serve only registered model versions with a stage; promotion between stages is gated and recorded.
3. Serve features to training and inference from one Feature Store to eliminate training/serving skew.
4. Serving is a versioned endpoint with traffic-split canary + one-step rollback and an explicit
   autoscaling ceiling (or batch prediction).
5. An eval gate (held-out, fixed metrics, compared to incumbent) blocks promotion; for LLM add
   groundedness/citation + a judge rubric + safety.
6. LLM apps carry tested, monitored guardrails (safety filter, injection defence, groundedness flag,
   refusal fallback) — a layer, not a hope.
7. Prompts and models are versioned artifacts tied to their eval and app release.
8. Model monitoring watches drift/skew (ML) and quality/cost/guardrail-rate (LLM); a signal, not a
   calendar, triggers retrain/re-eval. Every Vertex resource inherits the CMEK/private/WIF/audit
   baseline.

## Gotchas

1. **A model in a bucket with no registry entry has no lineage or stage** — untraceable in an
   incident. Register it and serve the registered version.
2. **Two feature code paths cause training/serving skew** that passes offline tests and fails in
   prod. One Feature Store, one path.
3. **An LLM prompt edited live is an unmanaged production change** — version it and re-eval, or you
   cannot say what changed or roll back.
4. **No eval gate means quality regressions ship silently.** Gate promotion on a recorded held-out
   metric versus the incumbent, not on a demo.
5. **A GenAI endpoint without guardrails is an open safety/injection surface** — filters, injection
   defence, groundedness flags, and a refusal path are part of shipping, not a later hardening pass.
6. **A fixed retrain calendar wastes cost and misses drift.** Monitor for the signal and retrain on
   it.

## Integration

- **`gcp-landing-zone-expert`** — provides the org/project/billing/network foundation the ML
  platform runs inside.
- **`gcp-cloud-expert`** — hardens each Vertex resource (CMEK, private endpoint, least-privilege SA,
  audit logging).
- **`terraform-expert` / `pulumi-expert`** — express the pipelines, registry, feature store,
  endpoints, and monitoring as IaC. This skill is the *what*; they are the *how*.
- **`fact-checker` / `grounded-answer-with-citations`** — the LLM-app eval discipline (groundedness,
  citation) this skill's eval gate measures aligns with those craft skills where a product uses them.

## References

- Vertex AI MLOps overview — https://cloud.google.com/vertex-ai/docs/start/introduction-mlops
- Vertex AI Pipelines — https://cloud.google.com/vertex-ai/docs/pipelines/introduction
- Vertex AI Model Registry & Feature Store — https://cloud.google.com/vertex-ai/docs/model-registry/introduction
- Vertex AI Model Monitoring (drift & skew) — https://cloud.google.com/vertex-ai/docs/model-monitoring/overview
- Gen AI evaluation & safety on Vertex AI — https://cloud.google.com/vertex-ai/generative-ai/docs/models/evaluation-overview
