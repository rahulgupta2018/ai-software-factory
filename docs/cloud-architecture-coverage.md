# Coverage Review — Factory skills vs. cloud application architecture fundamentals

*These fundamentals — architecture styles, design principles, cloud design patterns, and performance
antipatterns — are **cloud-agnostic**: they hold on any cloud, on-premises, or hybrid. This review used
the **Azure Architecture Center** (<https://learn.microsoft.com/en-us/azure/architecture/guide/>) only
as a well-structured public **enumeration** of that canon to check against — not as an Azure
requirement; the Azure guide itself states styles/patterns/principles are "conceptually cloud
agnostic." The fixes that followed (the `cloud-architecture-patterns` craft skill, the `/plan-arch`
and `/review` changes) contain **no vendor-specific content** — generic building blocks only. Reviewed
2026-09-13; our own infra lane happens to be GCP-first, which is orthogonal to this app-architecture
layer.*

## Verdict

The Factory covers the **delivery lifecycle, operations, security, supply-chain, and (via
`/plan-infra`) the infrastructure-side Well-Architected pillars + landing zones** thoroughly. It has a
**systematic gap on the application-architecture *design* fundamentals**: it never makes an
**architecture-style** choice explicit, does not apply the **design principles** as a gate, does not
select from the **cloud design-patterns** catalog (resilience / messaging / data patterns), and has
no **named performance-antipattern** review. This is the same failure mode addressed throughout this
engagement — the *representative* deliverable (a stack + module map + diagrams) ships, the *systematic*
layer is left implicit.

> **Resolution (0.67.0.0, 2026-09-13).** The application-architecture gaps below are now closed: a new
> vendored craft skill **`cloud-architecture-patterns`** carries the styles + principles + pattern
> catalog + antipatterns; **`/plan-arch`** composes it (style choice → design principles + FMA →
> pattern selection → data-store decision, recorded in `02-plan-arch.md`); **`/review`** screens the
> named performance antipatterns. Teeth-verified rubric dimensions gate both. §1–§4 and §7 below
> describe the pre-0.67 state that motivated the fix.

Legend: ✅ covered · 🟡 partial · ❌ gap.

---

## 1. Architecture styles — ❌ gap

The guide's *first* architecture decision: pick a style from its domain/NFR tradeoffs. `/plan-arch`
jumps straight to languages/components/frameworks + a module map; it never frames "**which style, and
why, for this domain and prioritized nonfunctional requirements?**"

| Style | Covered? | Evidence |
|---|---|---|
| N-tier | ❌ | `/plan-arch` records a module map + layering rule (N-tier-*like*) but never names/chooses the style |
| Web-Queue-Worker | ❌ | no queue/worker decomposition guidance |
| Microservices | ❌ | 0 hits across all skills; no bounded-context / service-per-capability guidance |
| Event-driven | 🟡 | infra lane mentions "event-driven messaging" as a pillar; no app-level EDA design |
| Big data | ❌ | — |
| Big compute | ❌ | — |

**Impact:** the highest-leverage architecture decision (style → constraints → emergent properties) is
skipped, so `02-plan-arch.md` documents a stack without documenting the shape.

---

## 2. Design principles (the 11) — 🟡 partial, infra-skewed

| Principle | Covered? | Where |
|---|---|---|
| Design for self-healing (retry, health checks, circuit breaker, bulkhead) | 🟡 | `/health` + health checks (✅ Health Endpoint Monitoring); craft skills mention `retry` (27×); **circuit breaker / bulkhead = 0** |
| Make all things redundant | 🟡 | `/plan-infra` resiliency pillar (multi-zone/region, backups, DR) — infra only, not app |
| Minimize coordination | ❌ | no eventual-consistency / decoupling guidance |
| Design to scale out | 🟡 | `/plan-infra` scalability pillar (autoscaling/quotas); no app-level "scale out, no session stickiness" |
| Partition around limits | ❌ | no data/compute partitioning or partition-key guidance |
| Design for operations | ✅ | `/health`, `/canary`, `/deploy`, observability pillar, logging/tracing |
| Use managed services | ✅ | `/plan-infra` (PaaS/managed, keyless OIDC), `/plan-arch` framework choice |
| Use an identity service | ✅ | `/security` (Federated Identity / provider-issued tokens), `tech_bindings.auth` |
| Design for evolution (versioned APIs, loose coupling) | 🟡 | `typed-service-contracts` (contracts/parse-don't-validate); **API versioning not explicit** |
| Build for the needs of business | ✅ | `/discover`, `/plan-product`, PRD goal traceability, `/plan-delivery` |
| Failure Mode Analysis (FMA) | ❌ | no systematic failure-point analysis step at design time |

**Impact:** the operational and "use managed services / identity / business-driven" principles are
strong; the **resilience & scale design principles are infra-only or absent** at the app layer.

---

## 3. Cloud design patterns (~42) — ❌ the biggest gap

Almost entirely absent in the planning layer; thin and incidental in the craft layer. No skill
*selects* patterns from the workload's constraints/risks and records which apply and why.

| Category | Covered? | Notes |
|---|---|---|
| **Reliability** (Retry, Circuit Breaker, Bulkhead, Throttling, Queue-Based Load Leveling, Compensating Transaction, Health Endpoint Monitoring, Leader Election, Scheduler-Agent-Supervisor) | 🟡 | only **Health Endpoint Monitoring** (✅ `/health`) and **Retry** (🟡 craft mentions); **Circuit Breaker, Bulkhead, Throttling, Queue-Based Load Leveling = 0** |
| **Messaging** (Competing Consumers, Pub-Sub, Claim Check, Priority Queue, Saga, Sequential Convoy, Async Request-Reply, Idempotent Consumer, Choreography) | ❌ | 0 across the board except `idempoten` (3× craft). No messaging-pattern selection anywhere |
| **Data management** (Cache-Aside, CQRS, Event Sourcing, Materialized View, Index Table, Sharding, Static Content Hosting, Valet Key) | 🟡 | `cqrs` (2×) + `event sourcing` (1×) in craft only; **Cache-Aside, Materialized View, Sharding, Valet Key = 0** |
| **Design & implementation** (Ambassador, Anti-Corruption Layer, BFF, Gateway Aggregation/Routing/Offloading, Sidecar, Strangler Fig, External Config Store, Compute Resource Consolidation, Deployment Stamps, Geode) | ❌ | 0. No gateway/BFF/strangler/anti-corruption/sidecar guidance |
| **Security** (Federated Identity, Gatekeeper, Valet Key, Rate Limiting) | 🟡 | `/security` covers Federated Identity + a gatekeeper-like validation posture; **Valet Key, Rate Limiting = 0** |

**Impact:** a Factory-built service under load has no designed resilience (no Retry+Circuit-Breaker
pairing, no bulkhead, no queue-based load leveling), and distributed-data consistency (Saga, Idempotent
Consumer, CQRS) is never planned. This is where a "passes tests, falls over in prod" outcome hides.

---

## 4. Performance antipatterns (the 10) — 🟡 partial (informal)

`/review`'s Performance lens catches a few by description, but there is no named-antipattern checklist.

| Antipattern | Caught? | Where |
|---|---|---|
| Chatty I/O | 🟡 | `/review` "N+1 queries" (adjacent) |
| Extraneous Fetching | 🟡 | `/review` "N+1 queries" |
| Synchronous I/O | 🟡 | `/review` "blocking I/O" |
| Improper Instantiation | 🟡 | `/review` "needless allocation" |
| No Caching | ❌ | caching absent from review + planning |
| Busy Database | ❌ | — |
| Monolithic Persistence | ❌ | — |
| Retry Storm | ❌ | (and no Retry+Circuit-Breaker pairing to prevent it) |
| Busy Front End | ❌ | — |
| Noisy Neighbor | ❌ | (partially an infra/tenancy concern) |

**Impact:** `/review` + `/benchmark` catch regressions and a few code smells, but the systematic
scalability-antipattern sweep the guide prescribes isn't run.

---

## 5. Best practices for cloud apps — 🟡 partial

| Best practice | Covered? | Where |
|---|---|---|
| Monitoring & diagnostics | ✅ | `/health`, `/canary`, observability pillar |
| API design & implementation | 🟡 | `typed-service-contracts` (contracts, parse-don't-validate); no REST-maturity/versioning/pagination guidance |
| Transient fault handling | 🟡 | craft `retry` mentions; no unified transient-fault + backoff + circuit-breaker guidance |
| Autoscaling | 🟡 | `/plan-infra` scalability pillar (infra); not an app concern |
| Caching / CDN | ❌ | no caching or CDN guidance in planning or review |
| Background jobs | ❌ | — |
| Data partitioning (+ strategies) | ❌ | — |
| Message encoding | ❌ | — |

---

## 6. Well-Architected Framework pillars — ✅ / 🟡 (this is the Factory's strength)

| Pillar | Covered? | Where |
|---|---|---|
| Reliability | 🟡 | `/plan-infra` resiliency (infra); `/health`, `/canary`, `/deploy` gates; **app-level reliability patterns thin** (see §3) |
| Security | ✅ | `/security` (OWASP + STRIDE + ASVS/MASVS + authn/authz/crypto/session/API/caching), supply-chain lane, `tech_bindings.{auth,tls,crypto,session}` |
| Cost Optimization | ✅ | `/cost` (infra budget), `/benchmark` (token budget), `guardrails.budget` |
| Operational Excellence | ✅ | `/deploy`, `/canary`, `/health`, `/retro`, `/document`, `/drift`, CI/CD `/pipeline` |
| Performance Efficiency | 🟡 | `/benchmark` baselines/regressions; **no antipattern sweep or scale-out design** (see §3, §4) |

Plus **Cloud Adoption Framework / landing zones** — ✅ covered by `/plan-infra`
(`gcp-landing-zone-expert`: org → folders → projects, org policy, IAM groups).

---

## 7. Technology choices — 🟡 partial

`/plan-arch` picks a **compute/framework** per component but **defaults to the TS/React path** and has
no explicit **data-store decision** ("best data store for the job" / polyglot persistence) or
**messaging decision** (when to introduce a queue/broker and which). Data-store selection and
partitioning strategy are the thinnest.

---

## What to add (prioritized)

The gaps cluster in **PLAN** (architecture design) and **REVIEW** (antipatterns). All of items 1–5
below shipped in **0.67.0.0** (✅), via the vendored `cloud-architecture-patterns` craft skill that
`/plan-arch` and `/review` compose; item 6's implementation depth is carried by that skill's
`references/patterns-catalog.md` (deeper per-language integration remains a follow-up). Each is the
familiar "make the systematic layer explicit, with teeth" move:

1. ✅ **`/plan-arch`: choose an architecture style, explicitly.** A workflow step + Core Concept:
   given the domain and the PRD's prioritized NFRs, select a style (N-tier / Web-Queue-Worker /
   Microservices / Event-driven / Big data / Big compute), state its constraints and the tradeoff
   accepted, and record it in `02-plan-arch.md`. Rubric anchor with teeth.
2. **`/plan-arch`: cloud design-patterns selection.** Given the workload's failure/scale/trust risks,
   select the applicable patterns and record which + why — Reliability (Retry **+** Circuit Breaker,
   Bulkhead, Throttling/Rate Limiting), Messaging (Queue-Based Load Leveling + Competing Consumers,
   Pub-Sub, Saga, Idempotent Consumer), Data (Cache-Aside, CQRS, Sharding). The craft skills carry the
   *how*; `/plan-arch` owns the *which/why*.
3. **`/plan-arch`: design-principles + FMA gate.** Apply the 11 principles as a short checklist —
   scale-out (no session stickiness), partition around limits, minimize coordination, design for
   self-healing, design for evolution (**API versioning**) — and run a lightweight **failure-mode
   analysis** (rate each failure point by impact, name the recovery). Record in the architecture doc.
4. **`/review` (and/or `/qa`): named performance-antipattern sweep.** Extend the Performance lens into
   the explicit 10-antipattern checklist (No Caching, Busy Database, Monolithic Persistence, Chatty
   I/O, Extraneous Fetching, Synchronous I/O, Retry Storm, Improper Instantiation, Busy Front End,
   Noisy Neighbor) with a finding per hit.
5. **`/plan-arch`: data-store & messaging decision.** A "best store for the job" step (relational vs
   document vs cache vs search vs blob; polyglot persistence) and a partitioning-strategy note, so the
   default TS/Postgres path is a *decision*, not an assumption.
6. **Craft-skill resilience depth (upstream `agent-skills`).** Ensure `fullstack-developer` /
   `java-quarkus-expert` / `python-expert` implement Retry+backoff **paired with Circuit Breaker**,
   timeouts, idempotent handlers, and Cache-Aside — the *implementation* of the patterns §2 selects.

## What is already fine (credit)

- **Health Endpoint Monitoring** pattern = `/health` + health checks (8 skills).
- **WAF pillars at the infra layer** + **landing zones** = `/plan-infra` (scalability, resiliency,
  observability, IAM/RBAC, SSL, secrets) — genuinely thorough.
- **Security pillar & identity** = `/security` + `tech_bindings` + supply-chain lane.
- **Operational Excellence & Cost** = the SHIP/REFLECT lane + `/cost` + `/benchmark`.
- **Use managed services / build for business** principles = infra lane + `/discover`/`/plan-delivery`.
</content>
