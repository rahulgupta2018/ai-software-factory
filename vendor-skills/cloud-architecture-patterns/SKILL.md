---
name: cloud-architecture-patterns
description: >
  The distributed/cloud application architecture fundamentals: choose an architecture STYLE
  (N-tier, web-queue-worker, microservices, event-driven, big-data, big-compute) from the domain and
  prioritised nonfunctional requirements; apply the cloud design PRINCIPLES (self-healing, redundancy,
  scale-out, partition, minimize coordination, design-for-evolution) and run a failure-mode analysis;
  select the cloud design PATTERNS that fit the workload's failure/scale/consistency/trust risks
  (Retry+Circuit Breaker, Bulkhead, Throttling, Queue-Based Load Leveling, Competing Consumers,
  Pub-Sub, Saga, Idempotent Consumer, Cache-Aside, CQRS, Sharding, Gateway/BFF, Anti-Corruption Layer,
  Strangler Fig, Sidecar); and avoid the known performance ANTIPATTERNS. Activates when designing or
  reviewing the architecture of a distributed/cloud/back-end system, choosing a service topology, or
  hardening a service for load and failure. Owns the style/principle/pattern/antipattern decision
  method; does not own the tech-stack selection, the UI design, or the implementation language idioms.
license: MIT
metadata:
  author: AI Software Factory (fundamentals distilled from the cloud-agnostic architecture canon)
  version: "0.1.0"
  last_updated: 2026-09-13
  category: planning
---

# Cloud & Distributed Application Architecture

## Overview

This skill supplies the architecture *fundamentals* for a distributed or cloud application: the
**style** (the shape), the **principles** (the rules that make it resilient and scalable), the
**patterns** (named solutions to recurring distributed-systems problems), and the **antipatterns** (the
practices that pass testing and fall over under production load). It is cloud-agnostic — the styles,
principles, and patterns apply on any cloud, on-premises, or hybrid. It produces *decisions with
rationale* (which style, which patterns, why), not code.

**Freedom level: MEDIUM** — the selection method and the "name the tradeoff" discipline are firm; the
specific choices are contextual to the workload.

## When to Activate

Activate when:
- Designing the architecture of a back-end / distributed / cloud system, or choosing a service topology.
- Deciding how a service should behave under load, partial failure, or an untrusted dependency.
- Reviewing an existing design for resilience, scalability, or performance-antipattern risk.

**Do not activate** (adjacent skills own this):
- Tech-stack / language / framework selection — the *planning* skill that owns the stack record does that; this skill informs the *shape*, not the toolchain.
- `frontend-design` / `ux-designer` / `modern-css-design-systems` — own the UI/visual design.
- `openapi-design` — owns the concrete API contract; this skill only says *where* a gateway/BFF or versioning belongs.
- Language craft skills (`fullstack-developer`, `java-quarkus-expert`, `python-expert`, `database-expert`) — own the *implementation* idioms of a pattern; this skill selects *which* pattern and *why*.

## Core Concepts

- **A style is a set of constraints, chosen from requirements — not a default.** An architecture style
  restricts the elements and relationships allowed, and the desirable properties (independent
  deployment, fault isolation, elastic scale) *emerge* from honouring those constraints. Choose the
  style from the **domain** and the **prioritised nonfunctional requirements**, then accept its
  tradeoffs deliberately. Complexity must match the domain — an over-complex style becomes a "big ball
  of mud"; microservices on a simple domain is waste.
- **Cloud design assumes failure and distribution.** Cloud/distributed systems are subject to the
  *fallacies of distributed computing* (the network is reliable, latency is zero, bandwidth is
  infinite, the network is secure, topology is static). Design *against* those assumptions: everything
  fails, so isolate and recover; coordinate as little as possible; scale by adding instances.
- **A pattern solves a named problem and introduces a named tradeoff.** Pick a pattern from the
  *problem* you face (a dependency that fails under load, a queue that overwhelms, a store that can't
  keep up with reads), not the technology you want. Every pattern costs something — apply it when its
  problem statement matches and the tradeoff is one you can accept. Patterns compose (see below).
- **An antipattern is a design that works in test and degrades under load.** Most start reasonable and
  creep in as features are added. Knowing the catalog lets you spot one in review before it ships.

## 1. Choose an architecture style

Identify the domain and rank the nonfunctional requirements (time-to-market, scale, reliability,
consistency, cost, team maturity). Then choose:

| Style | Best for | Dependency shape | Key tradeoff to accept |
|---|---|---|---|
| **N-tier** | Traditional business apps, low update frequency, lift-and-shift | Horizontal layers (presentation → business → data) | Horizontal coupling limits agility; whole tiers deploy together |
| **Web-Queue-Worker** | Simple domain with some heavy/long tasks | Web front end + async queue + back-end worker | Front end and worker can each drift toward monolithic |
| **Microservices** | Complex domain, frequent independent releases, mature DevOps | Vertically decomposed services, own data, API/async calls | Big operational complexity: discovery, consistency, distributed debugging |
| **Event-driven** | Real-time/IoT/streaming, high fan-out, loose coupling | Producers → broker → independent consumers | Eventual consistency, ordering, duplicate delivery, guaranteed-delivery effort |
| **Big data** | Batch + streaming analytics over very large datasets | Ingest → lake → batch/stream → serve | Pipeline complexity; batch/stream reconciliation |
| **Big compute (HPC)** | Compute-intensive simulation/modelling across many cores | Scheduler → parallel or tightly-coupled tasks | Coordination/interconnect cost for tightly-coupled work |

Record **which style, and the single most important reason** (the NFR it serves), plus the tradeoff
you are accepting. It is often right to relax a constraint rather than chase architectural purity —
say so explicitly. Different bounded contexts may use different styles.

## 2. Apply the design principles + failure-mode analysis

Walk these as a checklist; for each, state how the design satisfies it (or why it's N/A):

1. **Design for self-healing** — detect failure and recover automatically: **Retry** (transient) paired
   with **Circuit Breaker** (persistent), **timeouts**, **Health Endpoint Monitoring**, **Bulkhead**
   isolation. Failures are inevitable; isolate them.
2. **Make all things redundant** — no single point of failure: multiple instances, load balancing,
   replicas, multi-zone/region to the level the business needs.
3. **Minimize coordination** — decouple services, communicate asynchronously, accept eventual
   consistency where the domain allows; coordination is the enemy of scale.
4. **Design to scale out** (horizontal), not up — stateless instances, **no session stickiness**,
   autoscale on live metrics, decompose by scale requirement.
5. **Partition around limits** — partition data/compute/queues around throughput and size limits;
   design partition keys to avoid hotspots.
6. **Design for operations** — logging, distributed tracing, metrics, automated deploy/rollback.
7. **Use managed services** and **a managed identity provider** — don't run what a platform runs better;
   don't build your own auth (**Federated Identity**).
8. **Design for evolution** — loose coupling, well-defined + **versioned APIs**, async messaging, so
   services change independently. Successful systems always change.
9. **Build for the needs of the business** — tie RTO/RPO, SLA/SLO, and redundancy level to business
   requirements, not to fashion.
10. **Failure-mode analysis (FMA)** — enumerate the failure points (each dependency, store, queue,
    external call), rate each by impact/likelihood, and name the response (retry, fail over, degrade,
    circuit-break, queue). Do this *at design time*, not after the incident.

## 3. Select the cloud design patterns

Start from the workload's risks and pick the matching patterns. Load `references/patterns-catalog.md`
for the full catalog with per-pattern implementation sketches. The high-value groups:

- **Resilience (a service fails or slows under load):** **Retry** + **Circuit Breaker** (always pair
  them — retry transient faults, stop hammering a persistent one; unpaired retry causes a *Retry
  Storm*), **Timeout**, **Bulkhead** (isolate resource pools so one failure doesn't sink the rest),
  **Throttling** / **Rate Limiting** (protect a service from overload), **Health Endpoint Monitoring**.
- **Decoupling & load (bursty load, slow consumers, cross-service work):** **Queue-Based Load Leveling**
  (buffer bursts) + **Competing Consumers** (scale the processing), **Publisher-Subscriber** (fan-out
  without coupling), **Priority Queue**, **Claim Check** (large payloads), **Async Request-Reply**.
- **Data & consistency (reads outpace writes, distributed transactions, scale limits):** **Cache-Aside**
  (read-through cache — its absence is the *No Caching* antipattern), **CQRS** (split read/write
  models), **Materialized View**, **Index Table**, **Sharding** (partition a store), **Event Sourcing**,
  **Saga** + **Compensating Transaction** (consistency across services without a distributed
  transaction), **Idempotent Consumer** (safe duplicate delivery — mandatory with at-least-once
  messaging).
- **Composition & edge (many clients, legacy, cross-cutting concerns):** **Gateway Routing /
  Aggregation / Offloading**, **Backends for Frontends**, **Anti-Corruption Layer** (isolate a legacy
  or third-party model), **Strangler Fig** (incremental migration), **Sidecar** / **Ambassador**
  (out-of-process cross-cutting concerns), **External Configuration Store**.
- **Security (protect and delegate access):** **Federated Identity**, **Gatekeeper** (validate/sanitise
  before the private back end), **Valet Key** (scoped, direct, time-boxed resource access).

**Pattern pairings that matter:** Retry+Circuit Breaker · Queue-Based Load Leveling+Competing
Consumers · Saga on Compensating Transaction · Gateway Routing+Aggregation+Offloading behind one edge.

Record the patterns you are applying and **the risk each addresses** — and note the ones you
considered and rejected, so the design is defensible.

## 4. Avoid the performance antipatterns

Check the design/code against these; each has a standard fix:

| Antipattern | Symptom | Fix |
|---|---|---|
| **No Caching** | Repeated identical reads hit the store | **Cache-Aside** for hot, read-heavy, slow-changing data |
| **Chatty I/O** | Many small round-trips (network/DB/API) | Batch/coarsen calls; fewer, larger requests |
| **Extraneous Fetching** | Retrieving more data than needed (N+1, SELECT *) | Project only needed fields; page; shape the query to the need |
| **Busy Database** | Business logic pushed into the data store | Move computation to a stateless, scalable tier |
| **Monolithic Persistence** | One store for data with very different access patterns | Polyglot persistence — the right store per job |
| **Synchronous I/O** | Blocking the calling thread on I/O | Async/await; background jobs for long work |
| **Busy Front End** | Resource-intensive work on request threads | Offload to a **Queue-Based Load Leveling** worker |
| **Improper Instantiation** | Creating share-designed clients per request (HTTP/DB) | Reuse singletons/pools |
| **Retry Storm** | Aggressive retries amplify an outage | Bound retries, exponential backoff + jitter, **Circuit Breaker** |
| **Noisy Neighbor** | One tenant/component starves shared resources | Isolate (**Bulkhead**), throttle, quota per tenant |

## Guidelines

1. Choose the style from prioritised NFRs and the domain; state the one reason and the accepted tradeoff.
2. Match complexity to the domain — the simplest style that meets the NFRs wins.
3. Walk all ten design principles and FMA; record how each is met or why it's N/A.
4. Select patterns from the *problem*, not the technology; record the risk each addresses and the ones rejected.
5. Always pair Retry with Circuit Breaker + timeout + backoff-with-jitter; never retry unbounded.
6. With at-least-once messaging, make consumers idempotent — non-negotiable.
7. Screen the design against the antipattern table before handoff.

## Gotchas

1. **Style by fashion**: microservices on a simple domain buys distributed-systems pain for no benefit.
   Justify the style against the domain and NFRs, not resume-driven design.
2. **Unpaired retry**: retry without a circuit breaker turns a slow dependency into a self-inflicted
   outage (Retry Storm). Pair them, always, with backoff + jitter.
3. **Eventual consistency ignored**: async decoupling *is* eventual consistency + possible duplicates.
   If the design uses queues/events, it must address ordering, duplicates (idempotency), and reconciliation.
4. **Distributed transaction assumed**: there is no 2-phase commit across services. Use Saga +
   Compensating Transaction and design the undo path.
5. **Pattern soup**: applying patterns you don't need adds latency and moving parts. Each pattern must
   trace to a real risk; the goal is the workload's requirements, not a pattern count.
6. **Antipatterns creep in late**: a clean initial design accretes Chatty I/O, N+1 fetching, and
   No-Caching as features land. Re-screen at review, not just at design.

## Integration

- The stack/architecture *planning* skill composes this skill to choose the style and patterns, then
  records them in its architecture document; this skill supplies the method, not the stack values.
- `openapi-design` — realises the API/gateway/versioning decisions this skill locates.
- `fullstack-developer`, `java-quarkus-expert`, `python-expert`, `database-expert` — implement the
  selected patterns in their language idioms (retry/circuit-breaker libs, cache-aside, sharding).
- `multi-agent-patterns` — the analogue for *agent* topologies; this skill is for service/data topologies.
- The code-review skill screens a change against the antipattern table (§4).

## References

- `./references/patterns-catalog.md` — the full cloud design-patterns catalog (all categories) with
  per-pattern problem / when-to-use / tradeoff / implementation sketch. Load when selecting or
  implementing a specific pattern.
- Architecture styles, design principles, cloud design patterns, and performance antipatterns are the
  cloud-agnostic canon documented across the major cloud architecture centers.
</content>
