# Java + Quarkus Expert Guidelines

**A comprehensive guide for AI agents writing and reviewing Java on Quarkus**, organized by
priority and impact.

---

## Table of Contents

### Correctness — **CRITICAL**
1. [Transactions Around Writes](#transactions-around-writes)
2. [Specific Exceptions, Never Swallowed](#specific-exceptions-never-swallowed)

### Type & Null Safety — **HIGH**
3. [Model Absence with Optional at Boundaries](#model-absence-with-optional-at-boundaries)
4. [Records and Sealed Interfaces](#records-and-sealed-interfaces)

### Quarkus Runtime — **HIGH**
5. [Keep Blocking Work Off the Event Loop](#keep-blocking-work-off-the-event-loop)
6. [CDI Scopes and Statelessness](#cdi-scopes-and-statelessness)
7. [Native-Image Reflection](#native-image-reflection)

### Performance — **HIGH**
8. [Avoid N+1 Across Panache Associations](#avoid-n1-across-panache-associations)

### Style — **MEDIUM**
9. [Configuration via @ConfigProperty](#configuration-via-configproperty)
10. [Thin Resources, Testable Services](#thin-resources-testable-services)

---

## Correctness

### Transactions Around Writes

**Impact: CRITICAL** | **Category: correctness** | **Tags:** jpa, panache, transaction, gotcha

Panache mutations require an active transaction. A `persist`/`delete` outside `@Transactional`
either no-ops or throws depending on configuration, and a lazy association read after the
transaction commits throws `LazyInitializationException`.

#### ❌ Incorrect

```java
public void closeRepair(Long id) {
    Repair r = Repair.findById(id); // no transaction
    r.status = Status.CLOSED;       // never flushed
}
```

#### ✅ Correct

```java
@Transactional
public void closeRepair(Long id) {
    Repair r = Repair.findById(id);
    if (r == null) throw new NotFoundException("repair " + id);
    r.status = Status.CLOSED;       // flushed at commit
}
```

---

### Specific Exceptions, Never Swallowed

**Impact: CRITICAL** | **Category: correctness** | **Tags:** errors, exceptions, reliability

Catch the exception types you expect, log with context, and rethrow or map. A bare
`catch (Exception e) {}` hides real failures and turns a bug into silent data loss.

#### ❌ Incorrect

```java
try {
    return client.fetch(id);
} catch (Exception e) {
    return null; // silent failure
}
```

#### ✅ Correct

```java
try {
    return client.fetch(id);
} catch (WebApplicationException e) {
    Log.warnf("upstream fetch failed for %s: %s", id, e.getMessage());
    throw new UpstreamUnavailableException(id, e);
}
```

Map exceptions to HTTP with an `ExceptionMapper` so clients never see stack traces.

---

## Type & Null Safety

### Model Absence with Optional at Boundaries

**Impact: HIGH** | **Category: type-safety** | **Tags:** optional, null, api-design

Use `Optional<T>` as a **return type** to make "not found" explicit. Never use `Optional` for
fields or method parameters — it costs an allocation and muddies the model.

#### ❌ Incorrect

```java
public Repair findRepair(Long id) {
    return Repair.findById(id); // returns null; caller forgets to check
}
```

#### ✅ Correct

```java
public Optional<Repair> findRepair(Long id) {
    return Repair.findByIdOptional(id);
}
```

---

### Records and Sealed Interfaces

**Impact: HIGH** | **Category: type-safety** | **Tags:** records, sealed, immutability, dto

Use `record` for immutable data (DTOs, value objects) and a `sealed interface` for closed
result/state unions so `switch` is exhaustive at compile time.

#### ✅ Correct

```java
public sealed interface RepairResult {
    record Created(Repair repair) implements RepairResult {}
    record Invalid(String message) implements RepairResult {}
}

// exhaustive switch — compiler enforces every case is handled
String describe(RepairResult r) {
    return switch (r) {
        case RepairResult.Created(var repair) -> "created " + repair.id;
        case RepairResult.Invalid(var message) -> "rejected: " + message;
    };
}
```

---

## Quarkus Runtime

### Keep Blocking Work Off the Event Loop

**Impact: HIGH** | **Category: performance** | **Tags:** reactive, blocking, resteasy-reactive

A method returning `Uni`/`Multi` runs on the I/O event loop. Blocking it (JDBC, `Thread.sleep`,
blocking HTTP) stalls every concurrent request. Annotate `@Blocking` to move to a worker thread,
or use reactive clients.

#### ❌ Incorrect

```java
@GET
public Uni<List<Repair>> list() {
    return Uni.createFrom().item(Repair.listAll()); // blocking JDBC on the event loop
}
```

#### ✅ Correct

```java
@GET
@Blocking                       // run on a worker thread
public List<Repair> list() {
    return Repair.listAll();
}
```

---

### CDI Scopes and Statelessness

**Impact: HIGH** | **Category: correctness** | **Tags:** cdi, scopes, concurrency, gotcha

`@ApplicationScoped` beans are singletons shared across threads. A mutable field holding
per-request state is a data race. Keep beans stateless; inject a narrower scope with
`Instance<T>` when you truly need request state.

#### ❌ Incorrect

```java
@ApplicationScoped
public class RepairService {
    private String currentUser; // shared across all requests — race
}
```

#### ✅ Correct

```java
@ApplicationScoped
public class RepairService {
    public Repair log(NewRepair input, String user) { // state passed in
        ...
    }
}
```

---

### Native-Image Reflection

**Impact: HIGH** | **Category: correctness** | **Tags:** native, graalvm, reflection

GraalVM native image is closed-world: code reached only via reflection is stripped unless
registered. A DTO that (de)serializes on the JVM can fail at runtime in native mode.

#### ✅ Correct

```java
@RegisterForReflection
public record NewRepair(String propertyId, String description, Priority priority) {}
```

Prefer Quarkus extensions (they register their own reflection) over raw reflective libraries.

---

## Performance

### Avoid N+1 Across Panache Associations

**Impact: HIGH** | **Category: performance** | **Tags:** panache, jpa, n+1, query

Iterating entities and touching a lazy association issues one query per row. Fetch-join or
project to a DTO.

#### ❌ Incorrect

```java
for (Repair r : Repair.listAll()) {
    total += r.contractor.rate; // one SELECT per repair
}
```

#### ✅ Correct

```java
List<Repair> repairs = Repair.list(
    "SELECT r FROM Repair r JOIN FETCH r.contractor");
```

---

## Style

### Configuration via @ConfigProperty

**Impact: MEDIUM** | **Category: style** | **Tags:** config, secrets, 12-factor

Read configuration and secrets through `@ConfigProperty` / `application.properties` /
environment, never hardcoded. Secrets never appear in source or logs.

#### ✅ Correct

```java
@ConfigProperty(name = "repair.sla.days", defaultValue = "5")
int slaDays;
```

---

### Thin Resources, Testable Services

**Impact: MEDIUM** | **Category: maintainability** | **Tags:** structure, testing, quarkustest

Resources validate input, delegate to a service, and map the result to a status. Business logic
lives in an `@ApplicationScoped` service, tested with `@QuarkusTest` + `@TestTransaction`.

#### ✅ Correct

```java
@QuarkusTest
class RepairServiceTest {
    @Inject RepairService service;

    @Test
    @TestTransaction
    void logsAValidRepair() {
        var result = service.log(new NewRepair("p1", "leak", Priority.HIGH));
        assertInstanceOf(RepairResult.Created.class, result);
    }
}
```
