---
name: java-quarkus-expert
description: >
  Writes, reviews, and optimises production Java on Quarkus with idiomatic CDI, Panache, and
  RESTEasy Reactive, correct error handling, and native-build awareness. Activates when writing
  or refactoring Java/Quarkus services, reviewing Java for quality/performance/security, wiring
  Maven/Gradle + JUnit 5, or debugging JVM/native-image behaviour. Owns Java/Quarkus code
  quality. Does not own web/React architecture, the test-first workflow, or the language-agnostic
  service contract.
license: MIT
metadata:
  author: AI Software Factory (for this library)
  version: "0.1.0"
  last_updated: 2026-07-22
  category: coding
---

# Java + Quarkus Expert

## Overview

Produces clean, idiomatic Java on **Quarkus** — CDI beans, Panache persistence, RESTEasy Reactive
endpoints — and reviews existing Java against a fixed priority order: **Correctness → Type &
null safety → Performance → Style**. Focuses on the mistakes a model makes without guidance (the
Quarkus/JVM gotchas), not on re-teaching the language.

**Freedom level: MEDIUM** — the priority order and the Quarkus idioms are fixed; approach varies.

**Project binding (optional).** If `.agents/project-context.yaml` defines coding conventions or
`${ctx.tech_bindings}` (e.g. Java/Quarkus version, build tool, native vs JVM target), follow them;
otherwise use modern defaults (Java 21, Quarkus 3.x, Maven, JUnit 5, JVM mode).

## When to Activate

Activate when:
- Writing or refactoring Java on Quarkus (resources, services, entities, CDI beans).
- Reviewing Java for correctness, performance, security, or style.
- Wiring Maven/Gradle, JUnit 5, `@QuarkusTest`, or a native (GraalVM) build.
- Debugging JVM-specific or native-image behaviour (reflection, startup, blocking).

**Do not activate** (adjacent skills own this):
- `fullstack-developer` — owns web/React/Node/API + JS/TS DB architecture.
- `python-expert` — owns Python implementations.
- `tdd-red-green-refactor` — owns the test-first workflow (write the failing test first).
- `typed-service-contracts` — owns the language-agnostic spec/handler + Result pattern (this
  skill supplies its JVM dialect: sealed-interface Results).

## Working Order

1. **Correctness first** — cover edge/boundary cases; specific exceptions (never bare
   `catch (Exception e)` that swallows); transactions around writes; no lazy-load outside a
   transaction.
2. **Type & null safety** — precise types and generics; model absence with `Optional` at return
   boundaries (never as a field/parameter); avoid raw types.
3. **Performance** — no N+1 across Panache associations; keep blocking work off the reactive event
   loop; stream large results; profile before micro-optimising.
4. **Style** — Google Java Style, meaningful names, Javadoc on public API; records for immutable
   data; comments only for non-obvious logic.

Detailed rule catalogue with examples: load **`references/java-quarkus-guidelines.md`** in this skill folder when you need the
full rule list or are doing a thorough review.

## Core Concepts

Only the Quarkus-specific models a capable model may get wrong:

- **CDI scopes are lifetimes, not decoration.** `@ApplicationScoped` beans are singletons — never
  store per-request state in a field. Inject a narrower scope with `Instance<T>`/`Provider<T>`,
  or pass request data as method arguments.
- **RESTEasy Reactive runs on the I/O event loop.** A method returning `Uni`/`Multi` must not
  block. If it does blocking JDBC/IO, annotate `@Blocking` (runs on a worker thread) or switch to
  reactive clients. Blocking the event loop stalls every concurrent request.
- **Panache writes need a transaction.** Mutations require an active `@Transactional` boundary;
  reading a lazy association after the transaction closes throws `LazyInitializationException`.
- **Native image is closed-world.** GraalVM strips code it can't see reached. Anything accessed
  reflectively (JSON DTOs, libraries) needs `@RegisterForReflection` or a reflect-config, or it
  fails at runtime, not at build.

## Output Template (for a resource + service slice)

```java
// RepairResource.java — thin HTTP layer; delegates to the service, maps Result → status.
@Path("/repairs")
@Produces(MediaType.APPLICATION_JSON)
public class RepairResource {

  @Inject RepairService service;

  @POST
  @Transactional
  public Response create(@Valid NewRepair input) {
    return switch (service.log(input)) {
      case RepairResult.Created(var repair) -> Response.status(CREATED).entity(repair).build();
      case RepairResult.Invalid(var message) -> Response.status(BAD_REQUEST).entity(message).build();
    };
  }
}

// NewRepair.java — immutable input DTO with bean-validation constraints (parse, don't trust).
public record NewRepair(
    @NotBlank String propertyId,
    @NotBlank String description,
    @NotNull Priority priority) {}
```

## Review Checklist

- [ ] Correctness / edge cases  - [ ] Transactions around every write; no lazy-load after commit
- [ ] Precise types; `Optional` only at return boundaries  - [ ] No blocking on the reactive event loop
- [ ] No N+1 across Panache associations  - [ ] Specific exceptions with useful messages
- [ ] Input validated at the boundary (Bean Validation)  - [ ] Native-reflection registered where needed
- [ ] No secrets in code/logs; config via `@ConfigProperty`  - [ ] Test coverage of boundaries (`@QuarkusTest`)

## Guidelines

1. Prefer records for immutable data and sealed interfaces for closed result/state unions.
2. Keep resources thin: validate + delegate + map; business logic lives in `@ApplicationScoped`
   services.
3. Raise specific exceptions with actionable messages; map them to HTTP with an
   `ExceptionMapper`, never leak stack traces to clients.
4. Read configuration through `@ConfigProperty` / `application.properties`, never hardcode.
5. Write tests against behaviour with `@QuarkusTest`; use `@TestTransaction` to isolate DB state.

## Gotchas

1. **Field-injected request state in a singleton**: a mutable field on an `@ApplicationScoped`
   bean is shared across threads — a classic data race. Keep beans stateless; pass state in.
2. **Blocking the event loop**: JDBC/`Thread.sleep`/blocking HTTP inside a `Uni`-returning method
   silently kills throughput. Annotate `@Blocking` or go reactive.
3. **`LazyInitializationException`**: touching a lazy Panache association outside `@Transactional`
   (e.g. during JSON serialization) throws. Fetch-join, project to a DTO, or widen the transaction.
4. **JPA `equals`/`hashCode` on a generated id**: an entity whose identity depends on a
   DB-assigned id breaks `Set`/`Map` semantics before it is persisted. Use a business key or
   identity equality.
5. **Native runtime reflection failure**: a DTO that (de)serializes fine on the JVM throws in the
   native image because it wasn't reachable. Add `@RegisterForReflection`.
6. **Swallowed exceptions**: `catch (Exception e) {}` hides real failures — catch specific types,
   log with context, and rethrow or map.
7. **Missing `@Transactional` on a write**: a Panache `persist`/`delete` outside a transaction is
   a no-op or throws depending on config; annotate the write path.

## Integration

- `tdd-red-green-refactor` — write the failing JUnit 5 test first, then implement here (see its
  JUnit dialect).
- `typed-service-contracts` — for strict input parsing + Result-typed errors at boundaries; this
  skill supplies the JVM sealed-interface Result form.
- `fullstack-developer` — when a JS/TS web UI consumes this Quarkus API.

## References

- `references/java-quarkus-guidelines.md` (this folder) — full rule catalogue with examples; load for thorough reviews.
- Best practices: https://agentskills.io/skill-creation/best-practices
