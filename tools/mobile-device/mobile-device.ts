#!/usr/bin/env bun
/**
 * mobile-device — the executable half of `/qa`'s on-device QE (plan §9, Phase 6, Track 4).
 *
 * `/qa` drives a web browser with `browse` (Playwright), which structurally cannot exercise a
 * native mobile app. This tool fills that gap: it fulfils the `__FACTORY_DEVICE_RUNNER__` contract
 * the QA skill routes to — launch/attach to an Android emulator or iOS simulator (headless in CI),
 * run `flutter test integration_test` (and optionally drive Maestro / Patrol flows), interpret the
 * results, and hand `/qa` a structured pass/fail + per-test failures so a mobile bug is a blocking
 * finding just like a web one.
 *
 *   mobile-device plan  --platform android --test-dir integration_test [...]   print the run plan (no device)
 *   mobile-device check --platform ios      --test-dir integration_test [...]   validate a request (exit 2)
 *   mobile-device run   --platform android --test-dir integration_test [...]   run on a device, print result
 *
 * Split like `diagram`/`browse`: the plan-the-run, parse-`flutter --machine`, and interpret-result
 * core is pure (no device, no `flutter`, no network) and fully unit-tested offline; the real device
 * driver sits behind an injectable seam (`globalThis.__FACTORY_DEVICE_RUNNER__`). When no seam is
 * wired the tool shells out to a locally-installed `flutter`; with neither it fails loudly. The
 * Factory bundles no emulator and no signing material touches this tool.
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

/** The two native-mobile platforms an on-device QE run targets. */
export type DevicePlatform = 'android' | 'ios';

/** A cross-platform E2E flow driver `/qa` can layer on top of the Flutter integration tests. */
export type FlowTool = 'maestro' | 'patrol';

/** What `/qa` asks for: which platform, where the integration tests live, and any E2E flows. */
export interface DeviceRunRequest {
  platform: DevicePlatform;
  /** The Flutter integration-test directory (or file), e.g. `integration_test`. */
  testDir: string;
  /** Optional device/emulator/simulator name; a per-platform default is used when absent. */
  device?: string;
  /** Whether to run the device headless (CI default: true). */
  headless: boolean;
  /** Optional Maestro/Patrol flow files to run after the integration tests. */
  flows?: FlowFlow[];
}

/** One E2E flow: which driver runs it and the flow file to run. */
export interface FlowFlow {
  tool: FlowTool;
  file: string;
}

/** A named shell command in a plan (argv form — never a shell string, so nothing is interpolated). */
export interface PlannedCommand {
  name: string;
  command: string[];
}

/** The deterministic plan for a device run: the resolved device + the exact commands to execute. */
export interface DeviceRunPlan {
  platform: DevicePlatform;
  device: string;
  headless: boolean;
  /** `flutter test <dir> --machine -d <device>` — emits newline-delimited JSON we parse. */
  testCommand: string[];
  /** One planned command per E2E flow (Maestro/Patrol), run after the integration tests. */
  flowCommands: PlannedCommand[];
}

/** A validation finding for a request. Empty list = the request is runnable. */
export interface RequestProblem {
  field: string;
  message: string;
}

/** The raw output the device runner produces — the flutter `--machine` stream plus per-flow exits. */
export interface RunnerOutput {
  /** The `flutter test --machine` result: its exit code and the raw newline-delimited JSON stdout. */
  test: { exitCode: number; machineJsonl: string };
  /** One result per E2E flow, in plan order: pass is exit 0. */
  flows: Array<{ name: string; exitCode: number; output?: string }>;
}

/** One test/flow outcome, normalised across Flutter and the flow drivers. */
export interface TestOutcome {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  message?: string;
}

/** The interpreted verdict `/qa` records: did the on-device run pass, and every outcome. */
export interface DeviceRunResult {
  platform: DevicePlatform;
  device: string;
  pass: boolean;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  outcomes: TestOutcome[];
  /** Set when the run failed for an infrastructure reason (non-zero exit with no test failures). */
  infraError?: string;
}

/** Per-platform default device when the request names none. */
const DEFAULT_DEVICE: Readonly<Record<DevicePlatform, string>> = {
  android: 'emulator-5554',
  ios: 'iPhone 15',
};

/** Validate a run request. Pure — no device, no filesystem beyond what the caller already read. */
export function validateRequest(req: DeviceRunRequest): RequestProblem[] {
  const problems: RequestProblem[] = [];
  if (req.platform !== 'android' && req.platform !== 'ios') {
    problems.push({ field: 'platform', message: `platform must be 'android' or 'ios' (got '${req.platform}')` });
  }
  if (!req.testDir || !req.testDir.trim()) {
    problems.push({ field: 'testDir', message: 'a Flutter integration-test directory is required' });
  }
  for (const flow of req.flows ?? []) {
    if (flow.tool !== 'maestro' && flow.tool !== 'patrol') {
      problems.push({ field: 'flows', message: `flow tool must be 'maestro' or 'patrol' (got '${flow.tool}')` });
    }
    if (!flow.file || !flow.file.trim()) {
      problems.push({ field: 'flows', message: `${flow.tool} flow is missing a file` });
    }
  }
  return problems;
}

/**
 * Turn a request into a deterministic plan: resolve the device and the exact argv-form commands.
 * Pure — this decides WHAT would run without touching a device, so `/qa` can preview it and the
 * tests can assert on it.
 */
export function planDeviceRun(req: DeviceRunRequest): DeviceRunPlan {
  const device = req.device?.trim() || DEFAULT_DEVICE[req.platform];
  const testCommand = ['flutter', 'test', req.testDir, '--machine', '-d', device];
  const flowCommands: PlannedCommand[] = (req.flows ?? []).map((flow) =>
    flow.tool === 'maestro'
      ? { name: `maestro:${flow.file}`, command: ['maestro', 'test', flow.file] }
      : { name: `patrol:${flow.file}`, command: ['patrol', 'test', '--target', flow.file] },
  );
  return { platform: req.platform, device, headless: req.headless, testCommand, flowCommands };
}

/**
 * Parse `flutter test --machine` output — one JSON event per line. We track test ids to names
 * (`testStart`), their results (`testDone`), and failure/error messages (`error`). Flutter emits a
 * synthetic `loading <path>` test per file; those are dropped. Malformed lines are ignored so a
 * stray non-JSON log line can't crash the parse. Pure and fully offline-testable.
 */
export function parseFlutterMachine(jsonl: string): {
  outcomes: TestOutcome[];
  passed: number;
  failed: number;
  skipped: number;
} {
  const names = new Map<number, string>();
  const messages = new Map<number, string>();
  const results = new Map<number, TestOutcome['status']>();

  for (const line of jsonl.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (event.type === 'testStart' && event.test && typeof event.test === 'object') {
      const t = event.test as { id?: number; name?: string };
      if (typeof t.id === 'number' && typeof t.name === 'string') names.set(t.id, t.name);
    } else if (event.type === 'error' && typeof event.testID === 'number') {
      const msg = typeof event.error === 'string' ? event.error : '';
      if (msg) messages.set(event.testID, msg);
    } else if (event.type === 'testDone' && typeof event.testID === 'number') {
      const skipped = event.skipped === true;
      const result = typeof event.result === 'string' ? event.result : 'error';
      results.set(event.testID, skipped ? 'skip' : result === 'success' ? 'pass' : 'fail');
    }
  }

  const outcomes: TestOutcome[] = [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  for (const [id, status] of results) {
    const name = names.get(id) ?? `test#${id}`;
    if (name.startsWith('loading ')) continue; // synthetic per-file load event
    const outcome: TestOutcome = { name, status };
    const message = messages.get(id);
    if (message && status === 'fail') outcome.message = message;
    outcomes.push(outcome);
    if (status === 'pass') passed += 1;
    else if (status === 'fail') failed += 1;
    else skipped += 1;
  }
  return { outcomes, passed, failed, skipped };
}

/**
 * Combine a plan with the runner's raw output into the verdict `/qa` records. A failing test is a
 * `fail` outcome; a non-zero flow exit becomes a `fail` outcome named after the flow; and a
 * non-zero `flutter test` exit that produced no parsed failures is surfaced as an infra error (the
 * device never booted, the build broke, ...) so a broken run is never mistaken for a clean pass.
 * Pure.
 */
export function interpretRun(plan: DeviceRunPlan, output: RunnerOutput): DeviceRunResult {
  const flutter = parseFlutterMachine(output.test.machineJsonl);
  const outcomes: TestOutcome[] = [...flutter.outcomes];
  let { passed, failed, skipped } = flutter;

  for (const flow of output.flows) {
    if (flow.exitCode === 0) {
      outcomes.push({ name: flow.name, status: 'pass' });
      passed += 1;
    } else {
      outcomes.push({ name: flow.name, status: 'fail', message: flow.output?.trim() || `exit ${flow.exitCode}` });
      failed += 1;
    }
  }

  let infraError: string | undefined;
  if (output.test.exitCode !== 0 && flutter.failed === 0 && flutter.outcomes.length === 0) {
    infraError = `flutter test exited ${output.test.exitCode} with no test results — the device or build likely failed`;
  }

  const pass = failed === 0 && !infraError;
  const result: DeviceRunResult = {
    platform: plan.platform,
    device: plan.device,
    pass,
    total: outcomes.length,
    passed,
    failed,
    skipped,
    outcomes,
  };
  if (infraError) result.infraError = infraError;
  return result;
}

/** The device driver: given a plan, launch the device, run the commands, return raw output. */
export type DeviceRunner = (plan: DeviceRunPlan) => Promise<RunnerOutput> | RunnerOutput;

declare global {
  // eslint-disable-next-line no-var
  var __FACTORY_DEVICE_RUNNER__: DeviceRunner | undefined;
}

/**
 * Resolve a device runner. An injected `globalThis.__FACTORY_DEVICE_RUNNER__` wins (operators and
 * tests wire one, so the orchestration is provable without an emulator); otherwise a locally
 * installed `flutter` drives the plan. With neither, throw — the Factory bundles no emulator.
 */
export function getDeviceRunner(): DeviceRunner {
  if (typeof globalThis.__FACTORY_DEVICE_RUNNER__ === 'function') {
    return globalThis.__FACTORY_DEVICE_RUNNER__;
  }
  const probe = spawnSync('flutter', ['--version'], { encoding: 'utf-8' });
  if (probe.error || probe.status !== 0) {
    throw new Error(
      'mobile-device: no device runner configured — wire globalThis.__FACTORY_DEVICE_RUNNER__ or install the Flutter SDK',
    );
  }
  return (plan: DeviceRunPlan): RunnerOutput => {
    const test = spawnSync(plan.testCommand[0], plan.testCommand.slice(1), { encoding: 'utf-8' });
    const flows = plan.flowCommands.map((fc) => {
      const r = spawnSync(fc.command[0], fc.command.slice(1), { encoding: 'utf-8' });
      return { name: fc.name, exitCode: r.status ?? 1, output: `${r.stdout ?? ''}${r.stderr ?? ''}` };
    });
    return { test: { exitCode: test.status ?? 1, machineJsonl: test.stdout ?? '' }, flows };
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

/** Collect repeated `--flow maestro:path` / `--flow patrol:path` into flow specs. */
function readFlows(argv: string[]): FlowFlow[] {
  const flows: FlowFlow[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== '--flow') continue;
    const spec = argv[i + 1] ?? '';
    const sep = spec.indexOf(':');
    const tool = (sep >= 0 ? spec.slice(0, sep) : 'maestro') as FlowTool;
    const file = sep >= 0 ? spec.slice(sep + 1) : spec;
    flows.push({ tool, file });
  }
  return flows;
}

/** Build a request from CLI flags. `--no-headless` opts out of the CI-default headless run. */
function readRequest(argv: string[]): DeviceRunRequest {
  return {
    platform: (flag(argv, 'platform') ?? '') as DevicePlatform,
    testDir: flag(argv, 'test-dir') ?? 'integration_test',
    device: flag(argv, 'device'),
    headless: !argv.includes('--no-headless'),
    flows: readFlows(argv),
  };
}

function reportProblems(problems: RequestProblem[]): void {
  for (const p of problems) console.error(`  ${p.field}: ${p.message}`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const sub = argv[0];

  if (sub === 'check' || sub === 'plan' || sub === 'run') {
    const req = readRequest(argv);
    const problems = validateRequest(req);
    if (problems.length > 0) {
      console.error('mobile-device — invalid request:');
      reportProblems(problems);
      process.exit(2);
    }

    if (sub === 'check') {
      console.error(`mobile-device — valid ${req.platform} request (${req.testDir})`);
      process.exit(0);
    }

    const plan = planDeviceRun(req);
    if (sub === 'plan') {
      process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
      process.exit(0);
    }

    // run
    const runner = getDeviceRunner();
    const output = await runner(plan);
    const result = interpretRun(plan, output);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.infraError) process.exit(1); // infrastructure failure
    process.exit(result.pass ? 0 : 2); // 2 = a real test/flow failure (a blocking QA finding)
  }

  console.log(
    'mobile-device — on-device Flutter QE runner\n\n' +
      '  check --platform <android|ios> --test-dir <dir> [--flow ...]   validate a request (exit 2)\n' +
      '  plan  --platform <android|ios> --test-dir <dir> [...]          print the run plan (no device)\n' +
      '  run   --platform <android|ios> --test-dir <dir> [...]          run on a device, print result\n\n' +
      'Options: --device <name>  --no-headless  --flow <maestro|patrol>:<file> (repeatable)\n' +
      'Exit: 0 pass · 2 test/flow failure · 1 infra error.',
  );
  process.exit(sub ? 1 : 0);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(`mobile-device — ${(err as Error).message}`);
    process.exit(1);
  });
}
