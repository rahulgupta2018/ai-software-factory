---
name: self-improving-agent-skills
description: >
  Automatically optimises an existing Agent Skill through an execute-diagnose-mutate loop: run
  the skill against generated test scenarios, score outputs against criteria, diagnose failures,
  apply one targeted edit, and keep it only if the score improves. Activates when a skill
  underperforms, needs measurable tuning, or the user asks to evaluate/optimise/improve a skill.
  Owns automated skill optimisation. Does not own authoring a skill from scratch or one-off
  factual verification.
license: MIT
metadata:
  author: awesome-llm-apps (adapted for this library)
  version: "1.1.0"
  last_updated: 2026-07-02
  category: agent
---

# Self-Improving Agent Skills

## Overview

An automated optimisation loop for `SKILL.md` files, built on Google ADK 2.0. Three agents
collaborate: an **Executor** runs the skill against test scenarios and scores outputs against
binary criteria, an **Analyst** diagnoses failure patterns and picks a mutation strategy, and a
**Mutator** makes exactly one surgical edit to the skill. Changes are kept only if the score
improves — a hill-climb toward a target pass rate. The bundled `backend/` + `frontend/` are the
runnable implementation.

**Freedom level: MEDIUM** — the loop is fixed; scenarios, criteria, and target pass-rate vary.

## When to Activate

Activate when:
- An existing skill underperforms and needs measurable, iterative tuning.
- You want test scenarios + evaluation criteria generated and run against a skill.
- The user asks to "optimise / evaluate / improve" a skill against a pass rate.

**Do not activate** (adjacent skills own this):
- `skill-creator` / authoring from scratch — this skill *improves an existing* skill.
- `fact-checker` — owns one-off claim verification, not skill tuning.
- `multi-agent-patterns` — owns designing new topologies (this uses a fixed one).

## Optimisation Loop

1. **Provide the skill** — a folder following the [agentskills.io](https://agentskills.io) spec.
2. **Generate scenarios + criteria** — Executor drafts test cases and binary yes/no criteria;
   edit or regenerate as needed.
3. **Execute & score** — Executor runs the skill on every scenario, scores each output.
4. **Diagnose** — Analyst finds root causes and selects a strategy: `add_example`,
   `add_constraint`, `restructure`, or `add_edge_case`.
5. **Mutate (one change)** — Mutator applies a single targeted edit to the skill prompt.
6. **Re-score & decide** — keep the change if the score improves, revert if not.
7. **Repeat** until target pass rate or max rounds.

## Running the bundled app

- Backend (FastAPI + ADK optimiser): `backend/app.py`, engine in `backend/adk_optimizer.py`
  (`pip install -r backend/requirements.txt`; requires ADK + a configured model).
- Frontend (Next.js UI): `frontend/`.
Read `README.md` in this folder for full setup, endpoints, and the SSE streaming contract.

## Guidelines

1. Change **one** thing per round; attribute score movement to that change.
2. Use binary (yes/no) evaluation criteria — they make scoring unambiguous.
3. Keep a changelog of accepted mutations and reverted attempts.
4. Feed *all* results back, not only failures (false positives matter too — best practice).
5. Stop at the target pass rate; over-fitting to scenarios degrades generalisation.

## Gotchas

1. **Scenario over-fit**: optimising to a small scenario set can worsen real-world behaviour.
   Hold out scenarios or refresh them between runs.
2. **Multi-change rounds**: applying several edits at once destroys the signal about what helped.
   Enforce one mutation per round.
3. **Vague criteria**: non-binary criteria make scores noisy and the loop unstable. Force yes/no.
4. **Model drift**: scores shift if the underlying model/version changes mid-run — pin it.

## Integration

- `multi-agent-patterns` — the executor/analyst/mutator team is a supervised topology.
- `memory-systems` — persist the changelog and accepted mutations across runs.
- `fact-checker` — can serve as an evaluation check inside a scenario.

## References

- `README.md` (this folder) — full architecture, setup, and API.
- Evaluating skills: https://agentskills.io/skill-creation/evaluating-skills
- Best practices: https://agentskills.io/skill-creation/best-practices
