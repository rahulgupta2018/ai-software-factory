# Cloud Design Patterns — full catalog

Load this when selecting or implementing a specific pattern. Each entry: **problem → when to use →
tradeoff → implementation sketch**. Patterns are cloud-agnostic; the sketch names common building
blocks, not a specific vendor. Choose from the *problem*, not the technology.

---

## Reliability & resilience

**Retry** — *Problem:* transient faults (a blip, a throttle, a brief timeout). *When:* the fault is
likely self-correcting. *Tradeoff:* a non-transient fault turns retries into load. *Sketch:* bounded
attempts, **exponential backoff + jitter**, only on retryable errors; never retry a 4xx/validation
error. Pair with Circuit Breaker. (Polly, resilience4j, tenacity, `retry` middleware.)

**Circuit Breaker** — *Problem:* a dependency fails for a variable, non-trivial time and retries make
it worse. *When:* remote calls that can stay down. *Tradeoff:* added state; needs tuning. *Sketch:*
closed → (failures exceed threshold) → open (fail fast) → half-open (probe) → closed. Wrap the remote
call; expose the breaker state to Health Endpoint Monitoring.

**Bulkhead** — *Problem:* one overloaded dependency exhausts a shared pool and sinks everything.
*When:* multiple downstreams share threads/connections. *Tradeoff:* lower peak utilisation. *Sketch:*
separate connection/thread pools (or separate instances) per dependency or per tenant, so a failure is
contained to its compartment.

**Timeout** — *Problem:* a call hangs and holds a resource. *When:* every remote/blocking call.
*Sketch:* set an explicit, tuned timeout on every outbound call; a missing timeout is a latent hang.

**Throttling** — *Problem:* load spikes exceed capacity. *When:* protecting a service/tenant/API.
*Tradeoff:* rejected/delayed requests. *Sketch:* cap concurrent or per-window requests; shed load
gracefully (429 + Retry-After); combine with autoscaling.

**Rate Limiting** — *Problem:* a client must stay within a downstream's quota to avoid throttling
errors. *When:* calling a metered API. *Sketch:* token-bucket/leaky-bucket on the client side; queue
and pace requests under the limit.

**Health Endpoint Monitoring** — *Problem:* you can't tell if a service is actually healthy. *When:*
any service behind a load balancer / orchestrator. *Sketch:* expose `/health` (liveness) and a deeper
readiness check (dependencies reachable); external probes hit it on an interval; drive autoscaling/
rollback off it.

**Leader Election** — *Problem:* one instance must coordinate a task without conflicting with peers.
*When:* a singleton job across a scaled-out fleet. *Tradeoff:* coordination overhead. *Sketch:* lease/
lock via a consistent store; the leader renews; peers stand by.

**Scheduler Agent Supervisor** — *Problem:* coordinate a multi-step distributed action with recovery.
*When:* long-running orchestrations that can partially fail. *Sketch:* Scheduler drives steps, Agents
do work, Supervisor detects and remediates failures (retry/compensate).

**Compensating Transaction** — *Problem:* undo a multi-step, eventually-consistent operation that fails
partway. *When:* no distributed transaction is available. *Sketch:* for each forward step, define and
record its semantic undo; on failure, run the undos in reverse.

**Pipes and Filters** — *Problem:* a complex task is a monolith that's hard to scale/reuse. *When:*
processing decomposes into independent stages. *Sketch:* each filter is a stage connected by a pipe
(queue/stream); stages scale independently.

---

## Messaging & decoupling

**Queue-Based Load Leveling** — *Problem:* bursty producers overwhelm a service. *When:* spiky load,
work that can be deferred. *Tradeoff:* added latency, eventual processing. *Sketch:* producers enqueue;
the service consumes at its own rate; the queue absorbs the burst. Pair with Competing Consumers.

**Competing Consumers** — *Problem:* one consumer can't keep up with the queue. *When:* scale the
processing of queued work. *Sketch:* multiple consumers read the same queue; the broker delivers each
message once; scale consumers on queue depth. Requires idempotent handlers.

**Publisher-Subscriber** — *Problem:* one event must reach many independent consumers without coupling.
*When:* fan-out, event-driven integration. *Tradeoff:* delivery guarantees/ordering complexity.
*Sketch:* publisher emits to a topic; subscribers receive independently; add a dead-letter path.

**Priority Queue** — *Problem:* some requests must be handled ahead of others. *Sketch:* separate
queues per priority, or a broker that supports priority; consumers drain high-priority first.

**Claim Check** — *Problem:* a large payload overwhelms the message bus. *Sketch:* store the payload in
a blob/store, send a *claim check* (reference) on the bus; the consumer fetches the payload by
reference.

**Async Request-Reply** — *Problem:* the back end must be async but the caller needs a timely response.
*Sketch:* accept the request → return 202 + a status/polling URL (or callback); the client polls or is
notified when the result is ready.

**Sequential Convoy** — *Problem:* a set of related messages must be processed in order without blocking
unrelated groups. *Sketch:* partition by a group key (session/ordered queue); process each group's
messages in sequence, groups in parallel.

**Choreography** — *Problem:* a central orchestrator becomes a bottleneck. *When:* services can react to
events autonomously. *Tradeoff:* harder to see the end-to-end flow. *Sketch:* each service reacts to
events and emits its own, no central coordinator.

**Messaging Bridge** — *Problem:* two incompatible messaging systems must interoperate. *Sketch:* an
intermediary translates and forwards between them.

**Idempotent Consumer** — *Problem:* at-least-once delivery means duplicates. *When:* any queue/topic
with at-least-once semantics (i.e. almost all). *Sketch:* dedupe on a message id / idempotency key
persisted before side effects; processing twice has the same effect as once. Mandatory with Competing
Consumers.

---

## Data management

**Cache-Aside** — *Problem:* repeated reads hit a slow store. *When:* hot, read-heavy, tolerant of
slight staleness. *Tradeoff:* staleness; invalidation effort. *Sketch:* read cache → miss → load from
store → populate cache with a TTL; on write, update the store and invalidate/refresh the entry. (Its
absence is the *No Caching* antipattern.)

**CQRS** — *Problem:* read and write workloads have very different shapes/scale. *When:* reads vastly
outnumber writes, or read/write models diverge. *Tradeoff:* two models to maintain; eventual
consistency between them. *Sketch:* separate command (write) and query (read) models/paths; often
paired with Materialized View and Event Sourcing. Don't apply by default — it's an escalation.

**Event Sourcing** — *Problem:* you need a full, auditable history of state changes. *When:* audit,
temporal queries, or rebuildable read models. *Tradeoff:* complexity; replay/snapshotting. *Sketch:*
persist an append-only log of events; derive current state by folding events; snapshot for speed.

**Materialized View** — *Problem:* data isn't shaped for a required query. *Sketch:* precompute and
store a read-optimised view; refresh on write or on a schedule.

**Index Table** — *Problem:* queries filter on non-key fields of a store without a suitable index.
*Sketch:* maintain secondary index tables keyed by the queried fields.

**Sharding** — *Problem:* one store can't hold the data or the throughput. *When:* horizontal data
scale. *Tradeoff:* cross-shard queries and rebalancing are hard. *Sketch:* partition by a shard key
chosen to spread load evenly (avoid hotspots); route reads/writes by key.

**Static Content Hosting** — *Problem:* app servers waste cycles serving static assets. *Sketch:* serve
static content from object storage / CDN directly to clients.

**Valet Key** — *Problem:* proxying large uploads/downloads through the app is a bottleneck. *Sketch:*
issue a scoped, time-limited token that lets the client access the storage resource directly.

---

## Design & implementation (composition, edge, migration)

**Gateway Routing** — route requests to multiple back-end services behind one endpoint (path/host
routing). **Gateway Aggregation** — combine several back-end calls into one client request (cut client
round-trips). **Gateway Offloading** — move cross-cutting concerns (TLS termination, auth, rate-limit,
caching) into the gateway. *Layer all three behind one edge.*

**Backends for Frontends (BFF)** — *Problem:* one general API serves divergent clients (web/mobile)
poorly. *Sketch:* a tailored back end per frontend, each shaped to that client's needs.

**Anti-Corruption Layer** — *Problem:* a legacy/third-party model would leak into your clean domain.
*Sketch:* a translation façade that maps between the two models so the corruption stays outside.

**Strangler Fig** — *Problem:* rewrite a legacy system without a risky big-bang cutover. *Sketch:* put a
façade in front; migrate one capability at a time behind it; retire the old system when nothing routes
to it.

**Sidecar** — deploy a helper component in its own process/container beside the app (logging, proxy,
config) for isolation and language-independence. **Ambassador** — a client-side sidecar that handles
outbound network concerns (retry, circuit-break, routing) on behalf of the app.

**External Configuration Store** — move configuration out of the deployment package into a central,
versioned store; change config without redeploying.

**Compute Resource Consolidation** — pack multiple small tasks onto shared compute to cut cost/overhead
(the counterweight to over-decomposition).

**Deployment Stamps** — deploy multiple independent copies (stamps) of the app+data for scale/tenant
isolation. **Geode** — geographically distributed back-end nodes, each serving any request, for global
low latency.

---

## Security

**Federated Identity** — delegate authentication to a trusted identity provider (OIDC/SAML); never
build your own credential store. **Gatekeeper** — a dedicated instance validates and sanitises requests
before they reach the private back end (reduce attack surface). **Valet Key** — see Data management;
also a security control (scoped, expiring, direct access).

---

## Antipatterns (avoid — each maps to a pattern above)

| Antipattern | Fix |
|---|---|
| No Caching | Cache-Aside |
| Chatty I/O | Batch/coarsen calls |
| Extraneous Fetching (N+1, over-fetch) | Project + page the query |
| Busy Database | Move logic to a stateless tier |
| Monolithic Persistence | Polyglot persistence (right store per job) |
| Synchronous I/O | Async I/O; background jobs |
| Busy Front End | Queue-Based Load Leveling + worker |
| Improper Instantiation | Reuse shared clients/pools (singletons) |
| Retry Storm | Bounded retry + backoff/jitter + Circuit Breaker |
| Noisy Neighbor | Bulkhead + throttle + per-tenant quota |
</content>
