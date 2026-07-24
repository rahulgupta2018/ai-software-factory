/**
 * Tier-1 — the `mobile-device` tool's pure core (tools/mobile-device/mobile-device.ts), the
 * executable half of `/qa`'s on-device QE (plan §9, Phase 6, Track 4).
 *
 * The real emulator/simulator driver sits behind the `__FACTORY_DEVICE_RUNNER__` seam; everything
 * else — validating the request, planning the exact commands, parsing `flutter test --machine`, and
 * turning raw output into a pass/fail verdict — is pure and proven here offline, with both sides of
 * every rule: the run that passes, the failing test that blocks, the broken device that surfaces as
 * an infra error rather than a false green. The device path is exercised through an injected runner
 * so the orchestration is tested without a real emulator.
 */
import { describe, expect, test, afterEach } from 'bun:test';

import {
  validateRequest,
  planDeviceRun,
  parseFlutterMachine,
  interpretRun,
  getDeviceRunner,
  type DeviceRunRequest,
  type DeviceRunner,
  type RunnerOutput,
} from '../tools/mobile-device/mobile-device.ts';

function request(overrides: Partial<DeviceRunRequest> = {}): DeviceRunRequest {
  return { platform: 'android', testDir: 'integration_test', headless: true, ...overrides };
}

/** Build a `flutter test --machine` JSONL stream from a list of (name, result) pairs. */
function machine(tests: Array<{ id: number; name: string; result: 'success' | 'failure'; error?: string; skipped?: boolean }>): string {
  const lines: string[] = [];
  for (const t of tests) {
    lines.push(JSON.stringify({ type: 'testStart', test: { id: t.id, name: t.name } }));
    if (t.error) lines.push(JSON.stringify({ type: 'error', testID: t.id, error: t.error }));
    lines.push(JSON.stringify({ type: 'testDone', testID: t.id, result: t.result, skipped: t.skipped ?? false }));
  }
  lines.push(JSON.stringify({ type: 'done', success: tests.every((t) => t.result === 'success') }));
  return lines.join('\n');
}

describe('validateRequest — a good request passes; each rule has a failing case', () => {
  test('a well-formed android request is valid', () => {
    expect(validateRequest(request())).toEqual([]);
  });

  test('a bad platform is flagged', () => {
    expect(validateRequest(request({ platform: 'windows' as never })).some((p) => p.field === 'platform')).toBe(true);
  });

  test('a missing test directory is flagged', () => {
    expect(validateRequest(request({ testDir: '  ' })).some((p) => p.field === 'testDir')).toBe(true);
  });

  test('a flow with a bad tool or no file is flagged', () => {
    expect(validateRequest(request({ flows: [{ tool: 'selenium' as never, file: 'f.yaml' }] })).some((p) => p.field === 'flows')).toBe(true);
    expect(validateRequest(request({ flows: [{ tool: 'maestro', file: '' }] })).some((p) => p.field === 'flows')).toBe(true);
  });
});

describe('planDeviceRun — deterministic commands, no device touched', () => {
  test('defaults the device per platform and builds the machine test command', () => {
    const android = planDeviceRun(request());
    expect(android.device).toBe('emulator-5554');
    expect(android.testCommand).toEqual(['flutter', 'test', 'integration_test', '--machine', '-d', 'emulator-5554']);

    const ios = planDeviceRun(request({ platform: 'ios' }));
    expect(ios.device).toBe('iPhone 15');
  });

  test('an explicit device overrides the default', () => {
    expect(planDeviceRun(request({ device: 'Pixel_7_API_34' })).device).toBe('Pixel_7_API_34');
  });

  test('maestro and patrol flows plan their own driver commands', () => {
    const plan = planDeviceRun(request({ flows: [{ tool: 'maestro', file: 'flows/login.yaml' }, { tool: 'patrol', file: 'integration_test/app_test.dart' }] }));
    expect(plan.flowCommands[0].command).toEqual(['maestro', 'test', 'flows/login.yaml']);
    expect(plan.flowCommands[1].command).toEqual(['patrol', 'test', '--target', 'integration_test/app_test.dart']);
  });
});

describe('parseFlutterMachine — reads the machine stream, drops synthetic loads', () => {
  test('counts pass/fail/skip and attaches failure messages', () => {
    const jsonl = machine([
      { id: 1, name: 'loading /app/integration_test/app_test.dart', result: 'success' },
      { id: 2, name: 'submits a repair request', result: 'success' },
      { id: 3, name: 'shows an error on empty form', result: 'failure', error: 'expected 1 snackbar, found 0' },
      { id: 4, name: 'offline banner', result: 'success', skipped: true },
    ]);
    const parsed = parseFlutterMachine(jsonl);
    expect(parsed.passed).toBe(1);
    expect(parsed.failed).toBe(1);
    expect(parsed.skipped).toBe(1);
    expect(parsed.outcomes.find((o) => o.status === 'fail')?.message).toContain('found 0');
    // the synthetic "loading ..." test is dropped
    expect(parsed.outcomes.some((o) => o.name.startsWith('loading '))).toBe(false);
  });

  test('ignores non-JSON log lines without crashing', () => {
    const jsonl = 'flutter: some stray log\n' + machine([{ id: 1, name: 'a test', result: 'success' }]);
    expect(parseFlutterMachine(jsonl).passed).toBe(1);
  });
});

describe('interpretRun — the verdict /qa records', () => {
  test('all tests pass → pass', () => {
    const plan = planDeviceRun(request());
    const output: RunnerOutput = { test: { exitCode: 0, machineJsonl: machine([{ id: 1, name: 'a', result: 'success' }, { id: 2, name: 'b', result: 'success' }]) }, flows: [] };
    const result = interpretRun(plan, output);
    expect(result.pass).toBe(true);
    expect(result.passed).toBe(2);
  });

  test('a failing test → not pass (a blocking finding)', () => {
    const plan = planDeviceRun(request());
    const output: RunnerOutput = { test: { exitCode: 1, machineJsonl: machine([{ id: 1, name: 'a', result: 'failure', error: 'boom' }]) }, flows: [] };
    const result = interpretRun(plan, output);
    expect(result.pass).toBe(false);
    expect(result.failed).toBe(1);
  });

  test('a failing E2E flow → a fail outcome named after the flow', () => {
    const plan = planDeviceRun(request({ flows: [{ tool: 'maestro', file: 'flows/login.yaml' }] }));
    const output: RunnerOutput = {
      test: { exitCode: 0, machineJsonl: machine([{ id: 1, name: 'a', result: 'success' }]) },
      flows: [{ name: 'maestro:flows/login.yaml', exitCode: 1, output: 'element not found' }],
    };
    const result = interpretRun(plan, output);
    expect(result.pass).toBe(false);
    expect(result.outcomes.find((o) => o.name === 'maestro:flows/login.yaml')?.status).toBe('fail');
  });

  test('a non-zero exit with no results is an infra error, not a false green', () => {
    const plan = planDeviceRun(request());
    const output: RunnerOutput = { test: { exitCode: 1, machineJsonl: '' }, flows: [] };
    const result = interpretRun(plan, output);
    expect(result.pass).toBe(false);
    expect(result.infraError).toBeDefined();
  });
});

describe('getDeviceRunner — the injectable device seam', () => {
  afterEach(() => {
    delete (globalThis as { __FACTORY_DEVICE_RUNNER__?: DeviceRunner }).__FACTORY_DEVICE_RUNNER__;
  });

  test('returns the injected runner when one is wired', async () => {
    const canned: RunnerOutput = { test: { exitCode: 0, machineJsonl: machine([{ id: 1, name: 'a', result: 'success' }]) }, flows: [] };
    globalThis.__FACTORY_DEVICE_RUNNER__ = () => canned;
    const runner = getDeviceRunner();
    const plan = planDeviceRun(request());
    const result = interpretRun(plan, await runner(plan));
    expect(result.pass).toBe(true);
  });

  test('the injected runner receives the exact plan it will drive', async () => {
    let seen: string[] | undefined;
    globalThis.__FACTORY_DEVICE_RUNNER__ = (plan) => {
      seen = plan.testCommand;
      return { test: { exitCode: 0, machineJsonl: '' }, flows: [] };
    };
    const plan = planDeviceRun(request({ device: 'Pixel_7_API_34' }));
    await getDeviceRunner()(plan);
    expect(seen).toEqual(['flutter', 'test', 'integration_test', '--machine', '-d', 'Pixel_7_API_34']);
  });
});
