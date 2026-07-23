# Flutter + Dart Expert Guidelines

**A comprehensive guide for AI agents writing and reviewing Flutter apps in Dart**, organized by
priority and impact. Cross-platform mobile ships an attacker-readable binary onto a device you do
not control, so **mobile security (MASVS) is a first-class section**, not a footnote.

---

## Table of Contents

### Correctness — **CRITICAL**
1. [Guard BuildContext Across await](#guard-buildcontext-across-await)
2. [Dispose Controllers, Streams, and Listeners](#dispose-controllers-streams-and-listeners)
3. [Render Every Async State](#render-every-async-state)

### Null & Type Safety — **HIGH**
4. [Sound Null Safety, No Gratuitous Bang](#sound-null-safety-no-gratuitous-bang)
5. [Sealed Classes for Closed Unions](#sealed-classes-for-closed-unions)

### Mobile Security (MASVS) — **CRITICAL**
6. [Secrets in Secure Storage, Never SharedPreferences](#secrets-in-secure-storage-never-sharedpreferences)
7. [Certificate Pinning with Backup Pins](#certificate-pinning-with-backup-pins)
8. [No Secrets in the Bundle](#no-secrets-in-the-bundle)
9. [HTTPS-Only: ATS and Network Security Config](#https-only-ats-and-network-security-config)
10. [Obfuscate and Strip Release Builds](#obfuscate-and-strip-release-builds)
11. [Auth, Session, and Signing Keys](#auth-session-and-signing-keys)

### Performance — **HIGH**
12. [Keep build() Pure and const](#keep-build-pure-and-const)
13. [Stable Keys in Builders](#stable-keys-in-builders)

### Style — **MEDIUM**
14. [Explicit State Store Over setState for Shared State](#explicit-state-store-over-setstate-for-shared-state)

---

## Correctness

### Guard BuildContext Across await

**Impact: CRITICAL** | **Category: correctness** | **Tags:** async, context, gotcha

After an `await`, the widget may have been removed from the tree. Using `context` (Navigator,
`ScaffoldMessenger`, `Theme.of`) afterwards throws or acts on a dead tree. Capture what you need
before the await, and gate any post-await `context` use with `if (!mounted) return;`.

#### ❌ Incorrect

```dart
Future<void> _submit() async {
  await repository.save(form);
  Navigator.of(context).pop(); // context may be dead after the await
}
```

#### ✅ Correct

```dart
Future<void> _submit() async {
  final navigator = Navigator.of(context); // capture before await
  await repository.save(form);
  if (!mounted) return;                     // bail if the widget is gone
  navigator.pop();
}
```

---

### Dispose Controllers, Streams, and Listeners

**Impact: CRITICAL** | **Category: correctness** | **Tags:** lifecycle, leak, dispose

`TextEditingController`, `AnimationController`, `StreamSubscription`, `FocusNode`, and manual
listeners must be released in `dispose()`. An undisposed subscription keeps firing into a widget
that no longer exists — a memory leak and a `setState after dispose` crash.

#### ❌ Incorrect

```dart
class _FormState extends State<Form> {
  final controller = TextEditingController();
  // no dispose() — leaks on every navigation
}
```

#### ✅ Correct

```dart
class _FormState extends State<Form> {
  final controller = TextEditingController();
  StreamSubscription<Event>? _sub;

  @override
  void initState() {
    super.initState();
    _sub = service.events.listen(_onEvent);
  }

  @override
  void dispose() {
    _sub?.cancel();
    controller.dispose();
    super.dispose();
  }
}
```

---

### Render Every Async State

**Impact: HIGH** | **Category: correctness** | **Tags:** async, ui, state

Every asynchronous source has at least three states: loading, data, error. Rendering only the
happy path leaves a blank screen on slow networks and swallows failures. Model the states and
switch over them exhaustively (see rule 5).

#### ✅ Correct

```dart
Widget build(BuildContext context) => switch (state) {
      RepairLoading() => const Center(child: CircularProgressIndicator()),
      RepairLoaded(:final repairs) => RepairList(repairs: repairs),
      RepairError(:final message) => ErrorView(message: message, onRetry: _reload),
    };
```

---

## Null & Type Safety

### Sound Null Safety, No Gratuitous Bang

**Impact: HIGH** | **Category: type-safety** | **Tags:** null-safety, dart

Sound null safety only helps if you don't defeat it. Each `!` is an assertion that throws at
runtime when wrong. Model absence with nullable types and handle it; reserve `!` for cases the type
system genuinely can't see and you have proven non-null.

#### ❌ Incorrect

```dart
final user = cache.get(id)!;      // throws if absent
return user.name!;                // and again
```

#### ✅ Correct

```dart
final user = cache.get(id);
if (user == null) return const SignedOutView();
return Text(user.name ?? 'Unknown');
```

---

### Sealed Classes for Closed Unions

**Impact: HIGH** | **Category: type-safety** | **Tags:** sealed, pattern-matching, result

Model closed sets of states/results with `sealed` classes so the compiler forces an exhaustive
`switch`. This is the Dart dialect of the `typed-service-contracts` Result pattern — errors as
values, no impossible states, no unhandled branch.

#### ✅ Correct

```dart
sealed class SaveResult { const SaveResult(); }
class SaveOk      extends SaveResult { final Repair repair; const SaveOk(this.repair); }
class SaveInvalid extends SaveResult { final String reason; const SaveInvalid(this.reason); }

// Caller must handle both — adding a third variant makes this switch fail to compile.
String describe(SaveResult r) => switch (r) {
      SaveOk(:final repair) => 'saved ${repair.id}',
      SaveInvalid(:final reason) => 'rejected: $reason',
    };
```

---

## Mobile Security (MASVS)

> These rules align to the OWASP **MASVS**. Assume the app binary is fully decompilable and all
> traffic is inspected. `/security` applies this catalogue when auditing a mobile change.

### Secrets in Secure Storage, Never SharedPreferences

**Impact: CRITICAL** | **Category: security** | **Tags:** masvs-storage, secrets, keychain

`SharedPreferences` / `NSUserDefaults` are plaintext and world-readable on a rooted/jailbroken
device and in backups. Tokens, credentials, and keys go in `flutter_secure_storage`, which maps to
the iOS **Keychain** and Android **Keystore/EncryptedSharedPreferences**. Logout must wipe it.

#### ❌ Incorrect

```dart
final prefs = await SharedPreferences.getInstance();
await prefs.setString('auth_token', token); // plaintext on disk
```

#### ✅ Correct

```dart
const storage = FlutterSecureStorage(
  aOptions: AndroidOptions(encryptedSharedPreferences: true),
);
await storage.write(key: 'auth_token', value: token);
// on logout:
await storage.deleteAll();
```

---

### Certificate Pinning with Backup Pins

**Impact: CRITICAL** | **Category: security** | **Tags:** masvs-network, pinning, tls

Pin the server's public key (SPKI) for API endpoints so a rogue/compromised CA cannot MITM the
app. **Always ship a backup pin and a rotation plan** — a single pin plus a routine cert rotation
bricks every installed app. Pinning complements, never replaces, standard TLS validation.

#### ✅ Correct

```dart
final dio = Dio();
(dio.httpClientAdapter as IOHttpClientAdapter).createHttpClient = () {
  final client = HttpClient();
  client.badCertificateCallback = (cert, host, port) {
    final spki = sha256.convert(cert.der).toString();
    return _pinnedSpki.contains(spki); // primary + backup pins
  };
  return client;
};
```

---

### No Secrets in the Bundle

**Impact: CRITICAL** | **Category: security** | **Tags:** masvs-storage, secrets, supply-chain

A key in Dart source, `--dart-define` baked at build, or an asset file is public the moment you
ship — decompilation and string extraction are trivial. Keep secrets server-side; the client holds
only short-lived, user-scoped tokens obtained at runtime.

#### ❌ Incorrect

```dart
const stripeSecret = 'sk_live_1a2b3c...'; // shipped in the binary → compromised
```

#### ✅ Correct

```dart
// Client calls your backend; the backend holds the secret and talks to Stripe.
final res = await api.post('/payments', body: {'amount': amount}); // no secret on device
```

---

### HTTPS-Only: ATS and Network Security Config

**Impact: HIGH** | **Category: security** | **Tags:** masvs-network, cleartext, tls

Block cleartext at the platform layer so a stray `http://` can't leak data. iOS **App Transport
Security** is on by default — do not add `NSAllowsArbitraryLoads`. Android needs an explicit
**Network Security Config** disabling cleartext.

#### ✅ Correct

```xml
<!-- android/app/src/main/res/xml/network_security_config.xml -->
<network-security-config>
  <base-config cleartextTrafficPermitted="false"/>
</network-security-config>
```

```xml
<!-- AndroidManifest.xml: reference it and disable cleartext app-wide -->
<application android:networkSecurityConfig="@xml/network_security_config"
             android:usesCleartextTraffic="false" ... />
```

---

### Obfuscate and Strip Release Builds

**Impact: HIGH** | **Category: security** | **Tags:** masvs-resilience, obfuscation, release

Release builds must be obfuscated with symbols split out, and must not ship debug logging or
`print()` of sensitive data. Obfuscation raises the reverse-engineering bar; keep the
`--split-debug-info` output to symbolicate crash reports.

#### ✅ Correct

```bash
flutter build apk --release \
  --obfuscate --split-debug-info=build/symbols
flutter build ipa --release \
  --obfuscate --split-debug-info=build/symbols
```

Strip debug logs in release, e.g. gate logging on `kReleaseMode`, and consider `FLAG_SECURE`
(Android) / screenshot protection on sensitive screens where the threat model warrants it.

---

### Auth, Session, and Signing Keys

**Impact: HIGH** | **Category: security** | **Tags:** masvs-auth, session, signing

Use short-lived access tokens with a securely stored refresh token; support biometric/device auth
via `local_auth` where appropriate; logout invalidates server-side and wipes secure storage.
**App-store signing keys** (Android keystore, iOS distribution cert / provisioning) live in a
secret manager or the CI secret store — never in the repo or CI logs.

#### ✅ Correct

```dart
final localAuth = LocalAuthentication();
final ok = await localAuth.authenticate(
  localizedReason: 'Confirm to view payment details',
  options: const AuthenticationOptions(biometricOnly: true, stickyAuth: true),
);
if (!ok) return; // fail closed
```

---

## Performance

### Keep build() Pure and const

**Impact: HIGH** | **Category: performance** | **Tags:** build, const, rebuild

`build()` can run every frame. Creating controllers/clients or doing I/O there allocates on every
rebuild. Mark widgets `const` where their inputs are constant so Flutter can skip rebuilding them.

#### ❌ Incorrect

```dart
Widget build(BuildContext context) {
  final client = http.Client();        // new client every rebuild — leak
  return Padding(padding: EdgeInsets.all(8), child: Text('Repairs'));
}
```

#### ✅ Correct

```dart
Widget build(BuildContext context) => const Padding(
      padding: EdgeInsets.all(8),
      child: Text('Repairs'),
    ); // http.Client created once in initState / injected, not here
```

---

### Stable Keys in Builders

**Impact: MEDIUM** | **Category: performance** | **Tags:** keys, lists, state

In dynamic/reorderable lists, give items a stable `ValueKey` tied to identity so Flutter matches
elements to state across rebuilds instead of by index (which corrupts state on reorder/removal).

#### ✅ Correct

```dart
ListView.builder(
  itemCount: repairs.length,
  itemBuilder: (_, i) => RepairTile(key: ValueKey(repairs[i].id), repair: repairs[i]),
);
```

---

## Style

### Explicit State Store Over setState for Shared State

**Impact: MEDIUM** | **Category: style** | **Tags:** state-management, testability

`setState` rebuilds the whole `State` and hides logic in the widget. For app/shared state use an
explicit store (Riverpod/Bloc): rebuilds are scoped to what changed and the logic is unit-testable
without pumping widgets.

#### ✅ Correct

```dart
final repairsProvider = AsyncNotifierProvider<RepairsNotifier, List<Repair>>(RepairsNotifier.new);

class RepairsNotifier extends AsyncNotifier<List<Repair>> {
  @override
  Future<List<Repair>> build() => ref.read(repairRepositoryProvider).fetchAll();

  Future<void> add(NewRepair input) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() => ref.read(repairRepositoryProvider).create(input));
  }
}
// Logic lives in the notifier and is testable with a fake repository — no widget pump required.
```
