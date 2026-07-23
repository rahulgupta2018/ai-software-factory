---
name: database-expert
description: >
  Designs, queries, and operates data stores across four families — relational/SQL
  (PostgreSQL, MySQL), document/NoSQL (MongoDB, DynamoDB, Cassandra), vector
  (pgvector, Pinecone, Weaviate, Milvus, Qdrant), and graph (Neo4j/Cypher) — covering
  schema and access-pattern design, indexing, query tuning, migrations, transactions,
  and partitioning/sharding. Activates when choosing a data store, modelling a schema,
  writing or optimising a query, designing a migration, tuning an index, or diagnosing
  slow/locking/N+1 database behaviour. Owns engine-level data design and performance.
  Does not own web/API wiring (fullstack-developer), Python/TS code quality
  (python-expert), knowledge-graph ontology design (ontology-builder-assistant), or
  retrieval/ranking strategy over a populated store (ontology-guided-retrieval).
license: MIT
metadata:
  author: AI Software Factory
  version: "0.1.0"
  last_updated: 2026-07-23
  category: data
---

# Database Expert

## Overview

Delivers engine-correct data design and performance work across the four store families a
modern product actually uses: relational/SQL, document/NoSQL, vector, and graph. Assumes the
model knows basic SQL/query syntax — this skill supplies the modelling decisions, indexing and
tuning rules, migration discipline, and per-engine gotchas that separate a schema that scales
from one that seizes under load.

**Freedom level: MEDIUM** — the decision tables and rules below are the recommended path; adapt
to the engine and workload actually in use.

**Project binding.** Prefer the store(s) named in `${ctx.tech_bindings}` when
`.agents/project-context.yaml` (or the Factory's merged context) defines them; otherwise pick
per the "Choosing a store" table below and state the assumption.

## When to Activate

Activate when:
- Choosing a database or store type for a workload, or justifying one already chosen.
- Designing a schema, collection layout, access pattern, or key design.
- Writing, reviewing, or optimising a query (SQL, aggregation pipeline, Cypher, vector search).
- Designing a migration, index, transaction boundary, or partitioning/sharding scheme.
- Diagnosing slow queries, lock contention, N+1 access, or bloated/missing indexes.

**Do not activate** (adjacent skills own this):
- `fullstack-developer` — owns wiring a DB/ORM into a web app (Prisma client, API routes).
- `python-expert` — owns Python/driver code quality and idioms.
- `ontology-builder-assistant` — owns RDF/OWL/SHACL knowledge-graph *ontology* design.
- `ontology-guided-retrieval` — owns retrieval/ranking strategy over a populated graph+vector store.
- `code-reviewer` — owns reviewing a diff (it flags injection/N+1; this skill designs the fix).

## Core Concepts

- **Model to the access pattern, not the entities.** SQL tolerates normalising first and joining
  later; NoSQL, vector, and graph reward designing the store around the exact reads you will run.
  Enumerate the top queries before choosing keys, indexes, or partition boundaries.
- **An index is a read-speed / write-cost trade, not free.** Every index you add slows writes and
  consumes storage. Index the columns in `WHERE`/`JOIN`/`ORDER BY` on hot paths; do not index
  everything.
- **Consistency is a choice.** Relational engines default to strong consistency + ACID
  transactions; most NoSQL stores default to tunable/eventual consistency. Pick deliberately per
  workload — never assume a distributed store gives you a relational transaction.

## Choosing a store (decision table)

| Workload signal | Store family | Typical engines |
|---|---|---|
| Relational integrity, ad-hoc joins, transactions, reporting | **Relational/SQL** | PostgreSQL (default), MySQL |
| Flexible/evolving documents, high write throughput, denormalised reads | **Document/NoSQL** | MongoDB, DynamoDB, Cassandra |
| Similarity / semantic search over embeddings | **Vector** | pgvector (if already on Postgres), Pinecone, Weaviate, Milvus, Qdrant |
| Deeply connected data, traversal / path / relationship queries | **Graph** | Neo4j (Cypher) |

Bias to **PostgreSQL** as the default unless a signal above clearly points elsewhere — with
`pgvector` and `JSONB` it covers relational + vector + document for most products at one engine's
operational cost. Reach for a specialised store when scale or query shape demands it.

## Per-family workflow

### Relational / SQL
1. Normalise to 3NF first; denormalise only against a measured read pattern.
2. Every table has a primary key; add foreign keys with explicit `ON DELETE` behaviour.
3. Index selective columns used in `WHERE`/`JOIN`/`ORDER BY`; use composite indexes in the query's
   column order; add partial indexes for filtered hot paths.
4. Read `EXPLAIN (ANALYZE, BUFFERS)` before and after any tuning change — never guess.
5. Wrap multi-row invariants in a transaction; choose the isolation level explicitly
   (`READ COMMITTED` default; `SERIALIZABLE` for money/counters).
6. Partition large tables by range/hash when a single table's index no longer fits working set.

### Document / NoSQL
1. Design around the primary access pattern; embed data read together, reference data read apart.
2. In DynamoDB/Cassandra, the partition key is the design — model it for even distribution and to
   avoid hot partitions; use single-table design where it fits the query set.
3. Bound document/array growth; unbounded arrays and ever-growing documents are an anti-pattern.
4. Create secondary indexes only for queries you actually run; know each store's consistency mode.

### Vector
1. Match the distance metric to the embedding model (cosine for most text embeddings; dot/L2 when
   the model specifies). A metric mismatch silently ruins recall.
2. Choose the index for the scale: exact/brute-force at small N; HNSW or IVFFlat for large N; tune
   `ef_search`/`nprobe` to trade recall for latency and measure recall@k.
3. Store metadata alongside vectors and pre-filter by it before the ANN search where the engine
   supports it, to cut the candidate set.
4. Re-index/re-embed when the embedding model changes — vectors from different models are not
   comparable.

### Graph
1. Model nodes for entities and relationships for verbs; put traversal-driving properties on the
   relationship, not a join table.
2. Create indexes/constraints on the node properties you look up by (the traversal start points).
3. Keep variable-length path queries bounded (`*1..3`); an unbounded traversal can walk the whole
   graph.
4. `PROFILE` a Cypher query to see db hits; a query that starts from an unindexed label scans
   every node.

## Migrations & operations

- **Migrations are forward-only and reversible-by-design.** Every schema change ships as a
  versioned migration with an `up` and a `down`; never edit a shipped migration — add a new one.
- **Expand → migrate → contract** for zero-downtime changes: add the new column/index concurrently,
  backfill, switch reads/writes, then drop the old shape in a later release.
- Build indexes without long write locks where the engine allows (`CREATE INDEX CONCURRENTLY` in
  Postgres); a naive `CREATE INDEX` on a hot table blocks writes.
- Apply `${ctx.tenancy}` isolation on every query in a multi-tenant store (row-level security,
  tenant-scoped keys, or per-tenant DB) — never rely on the application to remember the filter.

## Guidelines

1. State the top access patterns before choosing keys, indexes, or a store family.
2. Parameterise every query — never build SQL/Cypher by string concatenation (injection).
3. Justify each index by a query it serves; remove indexes no query uses.
4. Read the query plan (`EXPLAIN`/`PROFILE`) to justify a tuning claim — do not assert "faster".
5. Ship schema changes as versioned, reversible migrations; use expand/contract for live systems.
6. Choose the isolation/consistency level explicitly; document it.

## Gotchas

1. **N+1 access:** looping a query per parent row. Fix with a join/`IN`/batch load, not more
   round-trips. (`code-reviewer` flags it; this skill designs the batched read.)
2. **Unbounded result sets:** `SELECT *` with no `LIMIT`, or fetching a whole collection to count.
   Paginate with keyset pagination on hot lists; `OFFSET` degrades at depth.
3. **Index that can't be used:** a function or leading wildcard on the indexed column
   (`WHERE lower(email) = …`, `LIKE '%x'`) forces a scan — index the expression or restructure.
4. **DynamoDB/Cassandra hot partition:** a low-cardinality or time-clustered partition key funnels
   traffic to one node. Add a sharding suffix or pick a higher-cardinality key.
5. **Vector metric/model mismatch:** querying cosine index with L2-trained embeddings, or mixing
   vectors from two embedding models — recall collapses with no error.
6. **Serverless connection exhaustion:** opening a DB connection per request/invocation drains the
   pool. Use a pooler (PgBouncer/RDS Proxy) or a shared client.
7. **Migration lock stalls:** `ALTER TABLE`/`CREATE INDEX` taking a long lock on a hot table.
   Use concurrent/online variants and the expand-contract pattern.

## Integration

- `fullstack-developer` — hands off the schema/ORM once the data model is designed here.
- `python-expert` — owns the driver/query code quality around these designs.
- `ontology-builder-assistant` — when the graph is a *semantic* knowledge graph (RDF/OWL/SHACL).
- `ontology-guided-retrieval` — owns retrieval/ranking over a populated vector+graph store.
- `code-reviewer` — reviews the resulting migration/query diff for security and correctness.

## References

- PostgreSQL indexing & `EXPLAIN`: https://www.postgresql.org/docs/current/using-explain.html
- pgvector: https://github.com/pgvector/pgvector
- DynamoDB single-table design: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-modeling-nosql.html
- Neo4j Cypher tuning: https://neo4j.com/docs/cypher-manual/current/query-tuning/
- Best practices: https://agentskills.io/skill-creation/best-practices
