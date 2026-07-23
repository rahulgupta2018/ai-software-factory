---
name: multi-agent-patterns
description: >
  Designs multi-agent systems — deciding whether multiple agents are justified, then choosing
  supervisor, swarm, or hierarchical topology with explicit handoffs, context isolation,
  consensus, and failure handling. Activates when single-agent context limits bite, subtasks
  parallelise, or different subtasks need different tools/prompts. Owns agent topology and
  coordination. Does not own per-agent memory design, tool schemas, or the self-improvement loop.
license: MIT
metadata:
  author: Agent Skills for Context Engineering (adapted for this library)
  version: "2.2.0"
  last_updated: 2026-07-02
  category: agent
---

# Multi-Agent Architecture Patterns

## Overview

Multi-agent systems distribute work across separate context windows. The **primary benefit is
context isolation** — each agent works in a clean context, avoiding the "telephone game" where
information degrades through repeated summarisation. Sub-agents exist to isolate context, not to
role-play an org chart. They cost materially more tokens, so justify them against a single-agent
baseline before building.

**Freedom level: MEDIUM** — pattern choice is contextual; the coordination rules are firm.

## When to Activate

Activate when:
- A single agent's context can't hold all task-relevant information without degrading.
- Subtasks parallelise, or need different tool sets / system prompts / domains.

**Do not activate** (adjacent skills own this):
- `memory-systems` — owns the persistent/shared memory agents read and write.
- `self-improving-agent-skills` — owns evolving the skills, not runtime topology.
- (per-agent tool schema design is a separate concern from topology.)

## Choose a Pattern (by coordination need, not metaphor)

- **Supervisor / orchestrator** — a coordinator decomposes and delegates to specialists, then
  synthesises. Use for clear decomposition + human oversight. Risk: supervisor becomes a
  bottleneck and paraphrases sub-agent output ("telephone game").
- **Peer-to-peer / swarm** — any agent hands off to any other via explicit transfer. Use for
  flexible exploration where rigid planning hurts. Risk: divergence without a state keeper.
- **Hierarchical** — strategy → planning → execution layers, each at its own abstraction. Use
  for large structured projects. Risk: cross-layer overhead and strategy/execution drift.

Fix the supervisor telephone game with a `forward_message` tool so a sub-agent's final,
format-sensitive answer reaches the user without lossy re-synthesis; prefer swarm when direct
sub-agent replies are acceptable.

## Context Isolation Mechanisms (default: instruction passing)

- **Instruction passing** — sub-agent gets only what it needs. Default; preserves isolation.
- **Filesystem/shared memory** — agents coordinate via persistent state. Use when multiple agents
  need faithful shared state; adds latency but scales. (See `memory-systems`.)
- **Full context delegation** — share the planner's whole context. Avoid unless the subtask
  genuinely needs it (it defeats isolation).

## Consensus & Coordination

Avoid naive majority voting (it counts a weak model's hallucination equally). Prefer
confidence/expertise-weighted voting or multi-round adversarial debate, and guard against
sycophantic convergence by assigning explicit dissent roles. Add stall/sycophancy triggers to
break loops.

## Frameworks

Patterns map onto LangGraph (graph state machines), AutoGen (event-driven GroupChat), CrewAI
(role-based crews), and **Google ADK 2.0** (graph Workflow Runtime + Task API for agent-to-agent
delegation). Framework-specific code: load `./references/frameworks.md` when implementing.

## Guidelines

1. Justify multi-agent against a single-agent baseline before building.
2. Choose topology by coordination need, not by imagined roles.
3. Cap workers per supervisor (~3–5); add a tier rather than overloading one.
4. Explicit handoff protocols with state passing; validate outputs before they flow downstream.
5. Set time-to-live limits; test failure scenarios explicitly.

## Gotchas

1. **Supervisor bottleneck**: context pressure grows non-linearly with worker count — beyond ~5,
   the supervisor spends more on summaries than workers do on work. Cap workers; tier supervisors.
2. **Token underestimation**: coordination, retries, and consensus rounds make multi-agent runs
   cost an order of magnitude more than single-agent; budget for it (re-measure, don't assume).
3. **Sycophantic consensus**: debating agents converge on agreeable, not correct, answers. Assign
   adversarial roles; require stated disagreement before convergence.
4. **Agent sprawl**: past ~5 agents, communication channels grow quadratically for diminishing
   return. Start minimal; add only for a real isolation benefit.
5. **Telephone game**: message-passing loses nuance each hop. Use filesystem coordination for
   state that must stay faithful.
6. **Error-propagation cascades**: one agent's hallucination becomes another's "fact." Add
   validation checkpoints; never trust upstream output blindly.
7. **Over-decomposition**: a 10-agent pipeline can spend more on handoffs than on work. Split only
   when subtasks genuinely benefit from separate contexts.

## Integration

- `memory-systems` — shared/persistent state across agents.
- `self-improving-agent-skills` — captures coordination lessons back into skills.
- `fact-checker` — a natural verification agent in a pipeline.

## References

- `./references/frameworks.md` — load when implementing in LangGraph/AutoGen/CrewAI/ADK.
- Best practices: https://agentskills.io/skill-creation/best-practices
