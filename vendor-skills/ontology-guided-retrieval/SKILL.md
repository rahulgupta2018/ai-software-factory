---
name: ontology-guided-retrieval
description: >
  Retrieves the most relevant, provenance-rich context for a domain question by grounding the query
  to ontology concepts, expanding via the ontology (synonyms, hierarchy, relationships), selecting
  sources, running hybrid graph + vector retrieval, and ranking by authority, recency, and
  jurisdiction. Activates whenever an answer needs supporting evidence assembled. Owns retrieval and
  context assembly. Does not own answer wording (grounded-answer-with-citations) or ontology design
  (ontology-builder-assistant).
license: MIT
metadata:
  author: Social Housing AI (generalised for this library)
  version: "1.1.0"
  last_updated: 2026-07-02
  category: knowledge
---

# Ontology-Guided Retrieval

## Overview

Builds the provenance-rich **context object** that grounded answers are made from: map intent to
ontology concepts, expand via the ontology, retrieve from the curated graph + vector index (and, at
lower authority, memory and live search), then validate, dedupe, and rank by authority precedence.
Retrieval quality determines answer quality.

**Freedom level: MEDIUM** — the pipeline order is fixed; scoring/thresholds may be tuned.

**Project binding.** Load `.agents/project-context.yaml`. Rank by `${ctx.authority_hierarchy}`,
filter to `${ctx.jurisdictions}`, prefer `${ctx.sources}`, and target `${ctx.tech_bindings}`
(graph + vector store). Absent a context file, use generic defaults.

## When to Activate

Activate when:
- A question needs supporting evidence before an answer can be synthesised.
- The agent must decide *what* to retrieve and *from where*.
- A gap-analysis or briefing task needs the current authoritative position on a topic.

**Do not activate** (adjacent skills own this):
- `grounded-answer-with-citations` — owns turning retrieved context into the final answer.
- `ontology-builder-assistant` — owns creating/evolving the ontology schema.
- `memory-systems` — owns the design of the memory stores this skill reads from.

## Core Concepts

- **Intent grounding**: resolve the query to ontology concepts, not just keywords.
- **Ontology expansion**: broaden via synonyms (`skos:altLabel`), class hierarchy, and relationships
  (enables/amends/supersedes/interprets) to catch related items; apply domain/range filters to stay
  on-topic.
- **Source tiers by authority**: curated graph (highest) → document graph → memory/cache → live
  search (lowest, freshness only). Live search never outranks curated content.
- **Hybrid retrieval**: combine graph traversal with vector similarity; graph for
  precise/relationship queries, vectors for semantic recall.

## Workflow

1. **Ground intent** — map query to ontology concepts; capture jurisdiction and any "as at" date.
2. **Expand** — synonyms, hierarchy, relationships; keep expansion bounded with domain/range filters.
3. **Select scope & sources** — which tiers to hit for this query.
4. **Retrieve (hybrid)** — graph + vector; pull provenance, authority, jurisdiction, validity dates.
5. **Validate & filter** — drop out-of-jurisdiction, repealed/superseded, or constraint-invalid items;
   keep point-in-time-correct versions.
6. **Rank** — authority precedence, then in-force recency, then semantic relevance.
7. **Assemble context object** — deduplicated, ranked, provenance-tagged; hand to
   `grounded-answer-with-citations`.
8. **Signal gaps** — if curated coverage is thin, mark it so confidence drops or ingestion is triggered.

## Practical Guidance

- Retrieve *parents with children* (small-to-big): the specific clause plus its section context.
- Follow cross-references as edges, not text proximity.
- Treat live search as discovery/freshness only; tag it low authority.
- Prefer precision over recall for compliance topics.

## Examples

```
Q: "Must we act within 24 hours for an emergency hazard?"  (context: UK social housing, England HA)
Steps: ground → EmergencyHazard; expand (HHSRS cat 1); retrieve curated SI clause + determination;
       filter England + in force; rank SI above guidance.
Out:   context = [SI clause (High, England, in force 2025-10-27) + summary]; gaps: none.
```

## Guidelines

1. Every retrieved item carries source, authority, jurisdiction, and validity dates.
2. Repealed/superseded/out-of-jurisdiction items are filtered before ranking.
3. Authority precedence dominates ranking; relevance breaks ties within a tier.
4. Live-search results are tagged low authority and never outrank curated content.
5. Thin coverage is reported, not hidden.

## Gotchas

1. **Keyword-only matching**: skipping intent grounding misses synonymous items; expand via the ontology.
2. **Vector-only retrieval**: embeddings lose relationships; use graph traversal for
   amends/supersedes/cross-reference queries.
3. **Ignoring temporal validity**: returning the latest text when a past-date version was needed.
4. **Over-expansion**: unbounded hierarchy/synonym expansion pulls noise; apply domain/range filters.

## Integration

- `grounded-answer-with-citations` — consumes the context object this skill produces.
- `ontology-builder-assistant` — defines the concepts, relationships, and constraints used.
- `memory-systems` — provides lower-authority stores queried as tiers.
- `policy-gap-analysis` — calls this skill to fetch the current position per topic.

## References

- Reads `.agents/project-context.yaml` (authority hierarchy, jurisdictions, sources, tech bindings).
- Best practices: https://agentskills.io/skill-creation/best-practices
