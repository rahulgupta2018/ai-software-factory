---
name: flutter-dart-expert
description: >
  Writes, reviews, and hardens production Flutter apps in idiomatic Dart — widget composition,
  explicit state management (Riverpod/Bloc), navigation, platform channels, and null-safe error
  handling — with a first-class MASVS mobile-security discipline (secure storage, certificate
  pinning, no-secrets-in-bundle, obfuscated release builds). Activates when writing or refactoring
  Flutter/Dart for iOS/Android (also web/desktop), reviewing Dart for quality/performance/security,
  wiring `flutter_test`/integration tests, or hardening a mobile build. Owns cross-platform mobile
  code quality. Does not own web/React architecture, the test-first workflow, or the
  language-agnostic service contract.
license: MIT
metadata:
  author: AI Software Factory (for this library)
  version: "0.1.0"
  last_updated: 2026-07-23
  category: coding
---

# Flutter + Dart Expert

## Overview

Produces clean, idiomatic **Flutter** in **Dart** — composable widgets, explicit state management,
typed navigation, safe platform-channel bridges — and reviews existing Dart against a fixed
priority order: **Correctness → Null & type safety → Mobile security → Performance → Style**. One
Dart/Flutter codebase targets iOS, Android, web, and desktop, so the security surface (an
attacker-readable binary on a device you don't control) is a first-class review dimension, not an
afterthought. Focuses on the mistakes a model makes without guidance (the Flutter rebuild/`async`
gotchas and the MASVS mobile-security traps), not on re-teaching the language.

**Freedom level: MEDIUM** — the priority order, the state-management discipline, and the MASVS
security rules are fixed; the specific approach (which state library, which widgets) varies.

**Project binding (optional).** If `.agents/project-context.yaml` defines coding conventions or
`${ctx.tech_bindings}` (Flutter/Dart channel, state library, min iOS/Android SDK, secure-storage
choice), follow them; otherwise use modern defaults (Dart 3.x with sound null safety, Flutter
stable, Riverpod for new apps, `flutter_secure_storage`, Material 3).

## When to Activate

Activate when:
- Writing or refactoring Flutter/Dart — widgets, screens, state, repositories, platform channels.
- Reviewing Dart for correctness, null safety, mobile security, performance, or style.
- Wiring `flutter_test`, widget tests, `integration_test`, or golden tests.
- Hardening a release build (obfuscation, pinning, secure storage, cleartext-traffic lockdown).

**Do not activate** (adjacent skills own this):
- `fullstack-developer` — owns web/React/Node/API + JS/TS DB architecture (including the app's
  server-side API that a Flutter client calls).
- `react-frontend-architect` / `modern-css-design-systems` — own web-UI architecture and CSS.
- `java-quarkus-expert` / `python-expert` — own JVM / Python server implementations.
- `tdd-red-green-refactor` — owns the test-first workflow (write the failing test first); this
  skill supplies the `flutter_test` dialect of that loop.
- `typed-service-contracts` — owns the language-agnostic spec/handler + Result pattern; this skill
  supplies its Dart dialect (sealed classes + pattern matching).

## Working Order

1. **Correctness first** — handle every async state (loading / data / error); dispose controllers,
   streams, and listeners; guard `BuildContext` use across an `await` with `if (!mounted) return`.
2. **Null & type safety** — sound null safety, no gratuitous `!`; model absence explicitly; prefer
   `sealed`/`enum` unions over stringly-typed state.
3. **Mobile security (MASVS)** — secrets in `flutter_secure_storage` (Keychain/Keystore), never
   `SharedPreferences`; certificate pinning with backup pins; no secrets in the bundle; HTTPS-only
   via ATS / Network Security Config; obfuscated release builds. See **`references/flutter-dart-guidelines.md`** for the full
   catalogue.
4. **Performance** — `const` constructors; keep `build()` cheap and pure; stable `ListView.builder`
   keys; hoist expensive work out of build; avoid rebuilding the whole subtree for one value.
5. **Style** — `dart format`, effective-Dart naming, small widgets over deep nesting, doc comments
   on public API.

Detailed rule catalogue with examples (Flutter idioms + the full MASVS mobile-security section):
load **`references/flutter-dart-guidelines.md`** in this skill folder when you need the full rule list or are doing a thorough
review.

## Core Concepts

Only the Flutter/Dart-specific models a capable model may get wrong:

- **`build()` is pure and runs often.** It can be called every frame. Never do I/O, start timers,
  mutate state, or create controllers inside `build()`. Side effects belong in `initState`,
  lifecycle callbacks, or state-notifier methods — creating an `AnimationController`/`http.Client`
  in `build()` leaks one per rebuild.
- **`BuildContext` is not `async`-safe.** After an `await`, the widget may be gone. Touching
  `context` (Navigator, `ScaffoldMessenger`, `Theme.of`) post-await without `if (!mounted) return`
  throws or acts on a dead tree. Capture what you need before the await.
- **Dispose or leak.** `TextEditingController`, `AnimationController`, `StreamSubscription`,
  `FocusNode` must be disposed in `dispose()`; an undisposed stream keeps firing into a dead widget.
- **The binary is fully readable.** Assume an attacker decompiles the app and inspects traffic.
  Anything shipped in the bundle (API keys, secrets, endpoints) is public. Keep secrets server-side;
  store runtime tokens only in the platform secure enclave.
- **`setState` is the smallest hammer.** It rebuilds the whole `State`. For app/shared state use an
  explicit store (Riverpod/Bloc) so rebuilds are scoped and logic is testable off the widget tree.

## Output Template (a screen + typed state + repository slice)

```dart
// repair_state.dart — closed union of UI states (sealed → exhaustive switch, no impossible state).
sealed class RepairState {
  const RepairState();
}
class RepairLoading extends RepairState { const RepairLoading(); }
class RepairLoaded  extends RepairState { final List<Repair> repairs; const RepairLoaded(this.repairs); }
class RepairError   extends RepairState { final String message; const RepairError(this.message); }

// repair_screen.dart — build() is pure; every async state is rendered.
class RepairScreen extends StatelessWidget {
  const RepairScreen({super.key, required this.state});
  final RepairState state;

  @override
  Widget build(BuildContext context) => switch (state) {
        RepairLoading() => const Center(child: CircularProgressIndicator()),
        RepairLoaded(:final repairs) => ListView.builder(
            itemCount: repairs.length,
            itemBuilder: (_, i) => RepairTile(key: ValueKey(repairs[i].id), repair: repairs[i]),
          ),
        RepairError(:final message) => ErrorView(message: message),
      };
}

// token_store.dart — secrets go to the platform secure enclave, never SharedPreferences.
class TokenStore {
  final _storage = const FlutterSecureStorage();
  Future<void> save(String token) => _storage.write(key: 'auth_token', value: token);
  Future<String?> read() => _storage.read(key: 'auth_token');
  Future<void> clear() => _storage.deleteAll(); // logout wipes secure storage
}
```

## Review Checklist

- [ ] Every async path renders loading/data/error  - [ ] Controllers/streams/listeners disposed
- [ ] No `context` use across `await` without `mounted`  - [ ] Sound null safety; no gratuitous `!`
- [ ] No I/O or object creation in `build()`  - [ ] `const` where possible; stable list keys
- [ ] Secrets in secure storage, never `SharedPreferences`/bundle  - [ ] Certificate pinning + backup pins
- [ ] HTTPS-only (ATS / Network Security Config, no cleartext)  - [ ] Release build obfuscated + logs stripped
- [ ] App-store signing keys in a secret manager  - [ ] Widget/integration test coverage of states

## Guidelines

1. Prefer `sealed` classes / `enum`s for closed UI-state and result unions; switch exhaustively.
2. Keep widgets small and composable; extract subtrees rather than nesting deeply in one `build()`.
3. Use an explicit state store (Riverpod/Bloc) for shared/app state; keep business logic off the
   widget tree so it is unit-testable without pumping widgets.
4. Never store secrets or tokens in `SharedPreferences`, plaintext files, or the app bundle; use
   `flutter_secure_storage` and keep API keys server-side.
5. Ship release builds with `--obfuscate --split-debug-info` and no debug logging.

## Gotchas

1. **`context` after `await`**: the commonest Flutter crash — guard with `if (!mounted) return`.
2. **Work in `build()`**: creating controllers/clients or doing I/O there leaks on every rebuild.
3. **Missing `dispose()`**: undisposed controllers/subscriptions leak and fire into dead widgets.
4. **Secrets in the bundle**: an API key in Dart source or assets is public the moment you ship.
5. **Pinning with no backup pin**: a routine cert rotation bricks every installed app — always pin
   a backup and ship a rotation plan.

## Integration

- `tdd-red-green-refactor` — the test-first loop; this skill runs it in the `flutter_test`/
  `integration_test` dialect (`flutter test`).
- `typed-service-contracts` — the language-agnostic Result/spec pattern; this skill supplies the
  Dart dialect (sealed classes + pattern matching).
- `fullstack-developer` — owns the server-side API the Flutter client consumes.
- `code-reviewer` / `/security` — apply the MASVS mobile checklist in this skill's `references/flutter-dart-guidelines.md` when
  auditing a mobile change.

## References

- OWASP **MASVS** (Mobile Application Security Verification Standard) and MASTG.
- Flutter docs: state management, `flutter_test`, obfuscation; `flutter_secure_storage`.
- Rule catalogue with examples: **`references/flutter-dart-guidelines.md`** in this skill folder.
- Related skills: `tdd-red-green-refactor`, `typed-service-contracts`, `fullstack-developer`.
