---
name: tdd-red-green-refactor
description: >
  Enforces a disciplined test-first Red-Green-Refactor loop (language-agnostic; worked examples
  in TypeScript/Vitest, Java/JUnit 5, and Dart/flutter_test) — one failing test, minimal pass,
  then refactor under a green safety net. Activates when building a feature, fixing a bug, or
  migrating logic test-first, or when the user asks for TDD. Owns the test-first workflow. Does
  not own language-specific code quality, service-contract design, or overall test
  strategy/coverage planning.
license: MIT
metadata:
  author: community (adapted for this library)
  version: "1.3.0"
  last_updated: 2026-07-23
  category: coding
---

# Red-Green-Refactor (TDD)

## Overview

A structural loop that keeps every line of code verifiable: prove the behaviour is missing
(Red), write the least code to pass (Green), then improve while staying green (Refactor). The
value is the *discipline* — small increments and strong typing as backpressure against guessing.

**Freedom level: LOW** — the loop and its rules are the point; follow them exactly.

## When to Activate

Activate when:
- Implementing a new feature or fixing a bug and driving it with tests.
- The user asks for TDD / test-first / "write the test first".

**Do not activate** (adjacent skills own this):
- `python-expert` / `fullstack-developer` / `java-quarkus-expert` / `flutter-dart-expert` — own the
  implementation code's quality.
- `typed-service-contracts` — owns how the unit under test is structured (spec/handler).
- (test *strategy*/coverage planning is a separate concern from this per-unit loop.)

## The Loop

1. **Red — establish failure.** Write **one** test for the next small behaviour. Run it; it must
   fail. Verify the failure is the missing logic (e.g. `ReferenceError`), not a config error.
2. **Green — minimal pass.** Write the simplest code that passes — even a hardcoded return.
   Run the suite; all green. The Red→Green transition is the proof of work.
3. **Refactor — clean up.** Improve names, remove duplication, generalise. Re-run tests after
   every change; if it goes red, revert immediately.

## Rules

1. **No horizontal splurging** — never write many tests at once. Strictly: 1 test → fail → 1 fix
   → pass → repeat.
2. **Backpressure** — use assertions + TypeScript types to stop the implementation from guessing.
3. **Test integrity** — never edit an existing test to make failing code pass. A test changes
   only when the *requirement* changes.

## Example (Vitest)

```typescript
// Red — math.test.ts
import { describe, it, expect } from "vitest";
import { add } from "./math";
it("sums two numbers", () => expect(add(2, 2)).toBe(4)); // ReferenceError: add is not defined

// Green — math.ts (simplest thing that passes)
export const add = (a: any, b: any) => 4;

// Refactor — math.ts (real implementation, still green)
export const add = (a: number, b: number): number => a + b;
```

## Dialect — Java / JUnit 5

The loop is identical; only the harness and the way "Red" manifests change. In Java, the Red step
usually fails to **compile** (the method/type doesn't exist) — a compile error is a valid Red, so
long as it points at the absent behaviour, not a config/import mistake. On Quarkus, use
`@QuarkusTest` for behaviour that needs the container and `@TestTransaction` to isolate DB state.

```java
// Red — MathTest.java (does not compile: add() is undefined — a valid failing state)
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;

class MathTest {
  @Test void sumsTwoNumbers() { assertEquals(4, Math.add(2, 2)); }
}

// Green — Math.java (simplest thing that passes)
public final class Math {
  public static int add(int a, int b) { return 4; }
}

// Refactor — Math.java (real implementation, still green)
public final class Math {
  public static int add(int a, int b) { return a + b; }
}
```

## Dialect — Dart / flutter_test

The loop is identical; the harness is `flutter test` (or `dart test` for pure-Dart packages). Test
pure logic with plain `test()`; test widgets with `testWidgets` + `WidgetTester` (`pumpWidget`,
`pump`, finders). Red usually fails to **compile** (the symbol doesn't exist) — a valid failing
state as long as it points at the absent behaviour, not a missing import.

```dart
// Red — math_test.dart (does not compile: add() is undefined — a valid failing state)
import 'package:flutter_test/flutter_test.dart';
import 'package:app/math.dart';

void main() {
  test('sums two numbers', () => expect(add(2, 2), 4));
}

// Green — math.dart (simplest thing that passes)
int add(int a, int b) => 4;

// Refactor — math.dart (real implementation, still green)
int add(int a, int b) => a + b;
```

For a widget, the Red asserts on a finder that isn't rendered yet:

```dart
// Red — pump the widget, assert the label it does not yet show
testWidgets('shows the repair count', (tester) async {
  await tester.pumpWidget(const MaterialApp(home: RepairBadge(count: 3)));
  expect(find.text('3 repairs'), findsOneWidget); // fails until RepairBadge renders it
});
```

## Guidelines

1. Exactly one new failing test per cycle.
2. Confirm the red failure is behavioural, not environmental, before writing code.
3. Re-run the full suite at green and after every refactor step.
4. Revert, don't debug forward, when a refactor turns the suite red.

## Gotchas

1. **Skipping the red run**: if you never see it fail, you don't know the test tests anything —
   a passing "test" may assert nothing.
2. **Over-building in Green**: writing future-proof code in Green defeats the loop; add
   generality only in Refactor, driven by the next test.
3. **Config-masked failures**: a missing import/path error can masquerade as a "real" failure;
   confirm the message points at the absent behaviour.
4. **Mutating the test to pass**: the most common integrity break — change code, not the test.

## Integration

- `typed-service-contracts` — structure the unit (spec/handler) then TDD its behaviour.
- `python-expert` / `fullstack-developer` / `java-quarkus-expert` / `flutter-dart-expert` — the
  implementation quality inside the Green step.

## References

- Best practices: https://agentskills.io/skill-creation/best-practices
