/**
 * Tier-3 — E2E runner (engine).
 *
 * The plan (§7) defines Tier 3 as: "Spawn a real agent session (`claude -p` / host equivalent)
 * against a scenario; assert the artifact/handoff is produced. Extract only the needed skill
 * section into fixtures (never copy a whole 500-line SKILL.md — context bloat causes timeouts)."
 *
 * This module is that engine. It follows the same seam the Tier-2 model judge uses: the Factory
 * ships no bundled agent client, so a live run is opt-in and injectable.
 *
 *   - Scenarios are DATA (`test/fixtures/e2e/*.json`), never code, so adding coverage never edits
 *     this file. `assertScenario` validates one; `checkExpectation` scores a transcript against it.
 *     Both are pure and deterministic — they run free in `bun test`, so the harness is provable
 *     (every check has a negative case in `skill-e2e.test.ts`).
 *   - A live run needs a runner. `getRunner()` returns `globalThis.__FACTORY_E2E_RUNNER__` when an
 *     operator wired one; otherwise, with `FACTORY_EVAL_E2E=1`, it returns `spawnHostRunner()`,
 *     which shells out to the host's own CLI (`claude -p …`). Absent both, it throws a clear
 *     "not configured" error rather than pretending to run.
 *   - `skillSection` extracts just the named headings from a skill's generated body, so a scenario
 *     feeds the agent ~60 lines of the relevant discipline, not a 500-line file.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { getHost } from '../../hosts/index.ts';
import { renderSkill, templatePath } from '../../scripts/gen-skill-docs.ts';
import type { EvalTier } from '../../lib/eval-select.ts';

export interface E2EExpectation {
  /** Substrings the transcript MUST contain (case-insensitive). The artifact/handoff signal. */
  output_contains?: string[];
  /** Substrings the transcript must NOT contain — a discipline the skill must not violate. */
  output_excludes?: string[];
  /** At least `min_any` of these must appear (defaults to 1). */
  output_any?: string[];
  min_any?: number;
}

export interface E2EScenario {
  /** Skill under test. Selection ties the scenario to `skills/<skill>/`. */
  skill: string;
  tier: EvalTier;
  /** One-line statement of what a passing session demonstrates. */
  intent: string;
  /** Headings to extract from the skill body and hand to the agent as context (avoids bloat). */
  context_headings: string[];
  /** The task prompt sent to the agent, appended after the extracted skill section. */
  prompt: string;
  expect: E2EExpectation;
}

export interface E2EResult {
  skill: string;
  pass: boolean;
  reasons: string[];
}

/** A runner takes a fully-assembled agent input and returns the session transcript. */
export type E2ERunner = (input: string) => Promise<string> | string;

const ROOT = join(import.meta.dir, '..', '..');

/** Validate a scenario's shape. Throws with a precise message — used by fixture integrity. */
export function assertScenario(s: unknown, source = 'scenario'): asserts s is E2EScenario {
  const o = s as Record<string, unknown>;
  if (!o || typeof o !== 'object') throw new Error(`${source}: not an object`);
  if (typeof o.skill !== 'string' || !o.skill) throw new Error(`${source}: missing 'skill'`);
  if (o.tier !== 'gate' && o.tier !== 'periodic') {
    throw new Error(`${source}: 'tier' must be 'gate' or 'periodic'`);
  }
  if (typeof o.intent !== 'string' || !o.intent) throw new Error(`${source}: missing 'intent'`);
  if (!Array.isArray(o.context_headings) || o.context_headings.length === 0) {
    throw new Error(`${source}: 'context_headings' must be a non-empty array`);
  }
  if (typeof o.prompt !== 'string' || !o.prompt) throw new Error(`${source}: missing 'prompt'`);
  const e = o.expect as E2EExpectation;
  if (!e || typeof e !== 'object') throw new Error(`${source}: missing 'expect'`);
  const hasContains = Array.isArray(e.output_contains) && e.output_contains.length > 0;
  const hasExcludes = Array.isArray(e.output_excludes) && e.output_excludes.length > 0;
  const hasAny = Array.isArray(e.output_any) && e.output_any.length > 0;
  if (!hasContains && !hasExcludes && !hasAny) {
    throw new Error(`${source}: 'expect' must set at least one of output_contains/excludes/any`);
  }
}

/** The canonical (host-agnostic) generated body for a skill. */
function skillBody(name: string): string {
  const tmpl = readFileSync(templatePath(name), 'utf-8');
  const canonical = renderSkill(name, tmpl).find((f) => f.canonical);
  if (!canonical) throw new Error(`no canonical output for skill '${name}'`);
  return canonical.content;
}

/**
 * Extract the given markdown sections (by heading text, any level) from a skill's generated body.
 * A heading matches when its text contains `heading` (case-insensitive); the section runs to the
 * next heading of the same-or-higher level. Missing headings throw — a scenario that names a
 * section the skill no longer has is a caught regression, not a silently-empty prompt.
 */
export function skillSection(name: string, headings: string[]): string {
  const body = skillBody(name);
  const lines = body.split('\n');
  const out: string[] = [];
  for (const wanted of headings) {
    let startIdx = -1;
    let startLevel = 0;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^(#{1,6})\s+(.*)$/);
      if (m && m[2].toLowerCase().includes(wanted.toLowerCase())) {
        startIdx = i;
        startLevel = m[1].length;
        break;
      }
    }
    if (startIdx === -1) throw new Error(`skill '${name}' has no heading matching '${wanted}'`);
    const section = [lines[startIdx]];
    for (let i = startIdx + 1; i < lines.length; i++) {
      const m = lines[i].match(/^(#{1,6})\s+/);
      if (m && m[1].length <= startLevel) break;
      section.push(lines[i]);
    }
    out.push(section.join('\n').trimEnd());
  }
  return out.join('\n\n');
}

/** Assemble the full agent input for a scenario: the extracted skill section + the task prompt. */
export function assembleInput(scenario: E2EScenario): string {
  const section = skillSection(scenario.skill, scenario.context_headings);
  return `${section}\n\n---\n\n${scenario.prompt}\n`;
}

/**
 * Shell out to a host's own CLI in one-shot mode. Never bundles a client — it drives the CLI the
 * operator already installed. Defaults to the canonical host (Claude). Only reached under
 * `FACTORY_EVAL_E2E=1` (or when wired directly), so a plain `bun test` never spawns a process.
 */
export function spawnHostRunner(hostName = 'claude'): E2ERunner {
  const host = getHost(hostName);
  if (!host) throw new Error(`unknown host '${hostName}'`);
  return (input: string): string => {
    const res = spawnSync(host.cliCommand, ['-p', input], {
      cwd: ROOT,
      encoding: 'utf-8',
      timeout: 180_000,
    });
    if (res.error) throw new Error(`${host.cliCommand} failed: ${res.error.message}`);
    if (res.status !== 0) {
      throw new Error(`${host.cliCommand} exited ${res.status}: ${res.stderr ?? ''}`);
    }
    return res.stdout ?? '';
  };
}

/**
 * Resolve the runner to use for a live E2E pass:
 *   - an injected `globalThis.__FACTORY_E2E_RUNNER__` wins (tests, custom hosts);
 *   - else, under `FACTORY_EVAL_E2E=1`, the default host CLI runner;
 *   - else throw — the caller must gate on this, never call it in a free run.
 */
export function getRunner(): E2ERunner {
  const injected = (globalThis as { __FACTORY_E2E_RUNNER__?: E2ERunner }).__FACTORY_E2E_RUNNER__;
  if (injected) return injected;
  if (process.env.FACTORY_EVAL_E2E === '1') return spawnHostRunner();
  throw new Error(
    'E2E runner not configured: set globalThis.__FACTORY_E2E_RUNNER__ or FACTORY_EVAL_E2E=1',
  );
}

const has = (haystack: string, needle: string): boolean =>
  haystack.toLowerCase().includes(needle.toLowerCase());

/** PURE — score a transcript against a scenario's expectation. Deterministic; testable free. */
export function checkExpectation(transcript: string, expect: E2EExpectation): E2EResult {
  const reasons: string[] = [];
  let pass = true;

  for (const needle of expect.output_contains ?? []) {
    if (!has(transcript, needle)) {
      pass = false;
      reasons.push(`missing required: "${needle}"`);
    }
  }
  for (const needle of expect.output_excludes ?? []) {
    if (has(transcript, needle)) {
      pass = false;
      reasons.push(`forbidden present: "${needle}"`);
    }
  }
  if (Array.isArray(expect.output_any) && expect.output_any.length > 0) {
    const need = expect.min_any ?? 1;
    const hits = expect.output_any.filter((p) => has(transcript, p));
    if (hits.length < need) {
      pass = false;
      reasons.push(`needs ${need} of [${expect.output_any.join(', ')}], found ${hits.length}`);
    }
  }

  return { skill: '', pass, reasons };
}

/** Run one scenario end-to-end with a runner, then score the transcript. */
export async function runScenario(scenario: E2EScenario, runner: E2ERunner): Promise<E2EResult> {
  const input = assembleInput(scenario);
  const transcript = await runner(input);
  const result = checkExpectation(transcript, scenario.expect);
  return { ...result, skill: scenario.skill };
}
