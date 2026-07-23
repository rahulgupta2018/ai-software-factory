---
name: typed-service-contracts
description: >
  Architecture standard for robust, type-safe services using the Spec-and-Handler pattern:
  parse-don't-validate inputs, errors-as-values (Result type), and vertical slices. Worked in
  TypeScript (Zod) with JVM (Java sealed-interface Results) and Dart (Flutter sealed classes)
  dialects. Activates when building CLIs, libraries, or complex business logic that must not throw
  unhandled exceptions and needs exhaustive error handling. Owns core-logic contract design. Does
  not own web/UI wiring, Python code quality, or the test-first loop.
license: MIT
metadata:
  author: community (adapted for this library)
  version: "1.3.0"
  last_updated: 2026-07-23
  category: coding
---

# Typed Service Contracts (Spec & Handler)

## Overview

A Vertical-Slice + Design-by-Contract pattern: each unit of work has a **Spec** (the contract —
parsed input, output, exhaustive error union, Result type) and a **Handler** (the impure
implementation that returns Results and never throws). Inputs are *parsed*, not merely validated;
errors are *values*, not exceptions.

**Freedom level: MEDIUM** — the spec/handler split and Result pattern are fixed; shapes adapt.

## When to Activate

Activate when:
- Building a CLI, library, or complex business-logic unit with strict input/output boundaries.
- Inputs need transformation to be safe (parse, e.g. path/URL validation).
- Unhandled runtime exceptions are unacceptable and errors must be exhaustive.

**Do not activate** (adjacent skills own this):
- `fullstack-developer` — owns HTTP/UI wiring around the service.
- `python-expert` / `java-quarkus-expert` / `flutter-dart-expert` — own language-specific
  implementation quality (this skill is the language-agnostic contract; `java-quarkus-expert`
  supplies its JVM dialect and `flutter-dart-expert` its Dart dialect).
- `tdd-red-green-refactor` — owns the test-first loop used to build the handler.

## Components

**Spec (`spec.ts`)** — the *what*: input Zod schema (parse), output schema, a discriminated
union of specific error codes, the `Result = Success | Failure` type, and the capability interface.

**Handler (`handler.ts`)** — the *how*: implements the interface, performs side effects, and
**never throws** — it catches internally and maps to `Result`.

## Templates

```typescript
// spec.ts
import { z } from "zod";
export const SafePath = z.string().min(1).refine(p => !p.includes(".."), "No traversal");
export const InputSchema = z.object({ path: SafePath, force: z.boolean().default(false) });
export type Input = z.infer<typeof InputSchema>;
export const ErrorCode = z.enum(["FILE_NOT_FOUND", "PERMISSION_DENIED", "UNKNOWN_ERROR"]);
export type Result =
  | { success: true; data: string }
  | { success: false; error: { code: z.infer<typeof ErrorCode>; message: string; recoverable: boolean } };
export interface TaskSpec { execute(input: Input): Promise<Result>; }
```

```typescript
// handler.ts — never throws; maps every failure to Result
import * as fs from "fs";
import { TaskSpec, Input, Result } from "./spec.js";
export class TaskHandler implements TaskSpec {
  async execute(input: Input): Promise<Result> {
    try {
      if (!fs.existsSync(input.path))
        return { success: false, error: { code: "FILE_NOT_FOUND", message: `Missing: ${input.path}`, recoverable: true } };
      return { success: true, data: "Operation complete" };
    } catch (e) {
      return { success: false, error: { code: "UNKNOWN_ERROR", message: e instanceof Error ? e.message : String(e), recoverable: false } };
    }
  }
}
```

## Dialect — JVM (Java)

The contract is identical; only the type machinery differs. Model the Result as a **sealed
interface** whose permitted records are the success and each failure — the compiler then forces an
exhaustive `switch`, the JVM equivalent of discriminant narrowing. Parse input with Bean
Validation (`@Valid` + constraints) at the boundary; the handler catches side-effect exceptions
internally and maps them to a failure record, never throwing across its boundary.

```java
// spec: sealed Result — permitted subtypes are the only outcomes
public sealed interface CreateResult {
  record Ok(RepairId id) implements CreateResult {}
  record NotFound(String message) implements CreateResult {}
  record Conflict(String message) implements CreateResult {}
}

// input DTO: parse-don't-validate via Bean Validation at the boundary
public record NewRepair(@NotBlank String propertyId, @NotNull Priority priority) {}

// handler: never throws across its boundary — maps failures to a Result record
@ApplicationScoped
public class CreateRepairHandler {
  public CreateResult execute(NewRepair input) {
    try {
      if (!propertyExists(input.propertyId()))
        return new CreateResult.NotFound("property " + input.propertyId());
      return new CreateResult.Ok(persist(input));
    } catch (PersistenceException e) {
      return new CreateResult.Conflict(e.getMessage());
    }
  }
}
```

An exhaustive `switch` over the sealed interface is the compile-time proof that every error path
is handled — there is no catch-all default to hide a new case behind.

## Dialect — Dart (Flutter)

The contract is identical; model the Result as a **sealed class** whose subclasses are the success
and each failure, so a `switch` expression is exhaustive (a new subclass makes callers fail to
compile). Parse input at the boundary into a typed value; the handler catches side-effect
exceptions internally and returns a failure subclass, never throwing across its boundary.

```dart
// spec: sealed Result — the permitted subclasses are the only outcomes
sealed class CreateResult { const CreateResult(); }
class CreateOk       extends CreateResult { final RepairId id; const CreateOk(this.id); }
class CreateNotFound extends CreateResult { final String message; const CreateNotFound(this.message); }
class CreateConflict extends CreateResult { final String message; const CreateConflict(this.message); }

// handler: never throws across its boundary — maps failures to a Result subclass
class CreateRepairHandler {
  const CreateRepairHandler(this._repo);
  final RepairRepository _repo;

  Future<CreateResult> execute(NewRepair input) async {
    try {
      if (!await _repo.propertyExists(input.propertyId)) {
        return CreateNotFound('property ${input.propertyId}');
      }
      return CreateOk(await _repo.persist(input));
    } on ConflictException catch (e) {
      return CreateConflict(e.message);
    }
  }
}

// caller: exhaustive switch — adding a fourth subclass breaks this at compile time
String describe(CreateResult r) => switch (r) {
      CreateOk(:final id) => 'created $id',
      CreateNotFound(:final message) => 'not found: $message',
      CreateConflict(:final message) => 'conflict: $message',
    };
```

## Testing Strategy (split, don't monolith)

- **Contract tests** (the bouncer): table-driven tests that invalid input is rejected by the
  schema before reaching the handler.
- **Logic tests** (the chef): mock side effects (fs/network) and assert the returned Result
  object — success payloads and each error code path.

## Guidelines

1. Parse inputs with Zod at the boundary; downstream code trusts the typed DTO.
2. Handlers return `Result`; they never throw across their boundary.
3. Error unions are exhaustive and specific — no generic `Error` leakage.
4. Test the spec and the handler separately.

## Gotchas

1. **Validate vs parse**: `validate` leaves you with raw types; `parse` returns a *typed* value —
   rely on the parsed DTO, not the raw input.
2. **Leaky throws**: a helper that throws inside the handler bypasses the Result contract; wrap
   side effects in try/catch and map to an error code.
3. **Non-exhaustive errors**: a catch-all `UNKNOWN_ERROR` that hides distinct, recoverable
   failures — model the ones callers must handle explicitly.
4. **Discriminant narrowing**: always branch on `result.success` before accessing `data`/`error`,
   or TypeScript can't narrow the union.

## Integration

- `tdd-red-green-refactor` — build the handler test-first against the spec.
- `fullstack-developer` — adapt the Result at the HTTP layer (map error codes → status codes).
- `java-quarkus-expert` — the JVM sealed-interface Result form and its Quarkus wiring.

## References

- Best practices: https://agentskills.io/skill-creation/best-practices
