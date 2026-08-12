/**
 * Tier-1 — the product templates `fac init` scaffolds (PRD.md + .factory/stack.yaml).
 *
 * These are read LIVE by `fac init` (bin/fac.ts), so an update to them is picked up with no build
 * step — but nothing else guarded them, so a broken template would ship silently and every scaffold
 * would produce an invalid product. This proves: both templates parse, the stack template's optional
 * stanzas stay commented (don't leak into the parsed object), and a scaffolded-then-filled product
 * merges and passes the schema — while an untouched template (empty name) fails, end to end.
 */
import { describe, expect, test, afterEach } from 'bun:test';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { parseYamlObject } from '../lib/yaml.ts';
import { parseFrontmatter } from '../lib/frontmatter.ts';
import { loadProductContext, mergeContext } from '../lib/context.ts';
import { validateContext } from '../lib/schema.ts';
import { parseDeliveryPlan, verifyDeliveryPlan } from '../lib/delivery-plan.ts';

const ROOT = join(import.meta.dir, '..');
const PRD_TEMPLATE = join(ROOT, 'templates', 'PRD.template.md');
const STACK_TEMPLATE = join(ROOT, 'templates', 'stack.template.yaml');

let scratch = '';
afterEach(() => {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
  scratch = '';
});

/** Mirror `fac init`: copy both templates into a fresh product dir. */
function scaffold(): string {
  const dir = mkdtempSync(join(tmpdir(), 'fac-tmpl-'));
  scratch = dir;
  cpSync(PRD_TEMPLATE, join(dir, 'PRD.md'));
  mkdirSync(join(dir, '.factory'), { recursive: true });
  cpSync(STACK_TEMPLATE, join(dir, '.factory', 'stack.yaml'));
  return dir;
}

describe('stack.template.yaml', () => {
  test('parses, and its optional stanzas stay commented (nothing leaks into the object)', () => {
    const o = parseYamlObject(readFileSync(STACK_TEMPLATE, 'utf-8'), 'stack.template.yaml');
    // Required core is present; the scaffolded minimum is valid-shaped.
    expect(Object.keys(o)).toContain('tech_stack');
    expect(Object.keys(o)).toContain('commands');
    expect(o.tech_bindings).toEqual({}); // catalogue is commented — must not leak
    // The security/architecture stanzas are commented examples, absent until an author uncomments.
    for (const k of ['tenancy', 'compliance_rules', 'provenance', 'supply_chain', 'sast']) {
      expect(k in o).toBe(false);
    }
  });

  test('the catalogue documents the full binding surface the Factory gates on', () => {
    // A reader should be able to discover every Phase 6/7 gate from the template alone.
    const text = readFileSync(STACK_TEMPLATE, 'utf-8');
    for (const binding of [
      'auth', 'crypto', 'session', 'tls',
      'supply_chain', 'sast', 'provenance', 'ci', 'container_scan', 'dast',
      'mobile_release', 'tenancy', 'prohibited_data', 'compliance_rules',
    ]) {
      expect(text).toContain(binding);
    }
  });
});

describe('PRD.template.md', () => {
  test('frontmatter parses and carries the human-owned identity keys', () => {
    const { data } = parseFrontmatter(readFileSync(PRD_TEMPLATE, 'utf-8'), 'PRD.template.md');
    expect(data.product).toBeDefined();
    expect(data.meta).toBeDefined();
  });

  test('the body prompts for the professional-software sections', () => {
    const text = readFileSync(PRD_TEMPLATE, 'utf-8');
    for (const heading of [
      'User journeys', 'Data & domain model', 'Integrations & external dependencies',
      'Compliance & data handling', 'Risks',
    ]) {
      expect(text).toContain(heading);
    }
  });
});

describe('PLAN.template.md', () => {
  const PLAN_TEMPLATE = join(ROOT, 'templates', 'PLAN.template.md');

  test('the skeleton parses and is a well-formed (verifier-clean) delivery plan', () => {
    const text = readFileSync(PLAN_TEMPLATE, 'utf-8');
    const plan = parseDeliveryPlan(text, 'PLAN.template.md');
    // One live goal + one live increment tracing to it; extra rows stay commented (don't leak).
    expect(plan.goals.map((g) => g.id)).toEqual(['G1']);
    expect(plan.increments.map((i) => i.id)).toEqual(['INC-1']);
    expect(verifyDeliveryPlan(plan).findings).toEqual([]);
  });
});

describe('a scaffolded product', () => {
  test('an untouched scaffold fails the schema (empty product name is not a product)', () => {
    const dir = scaffold();
    const merged = mergeContext(loadProductContext(dir));
    expect(validateContext(merged).ok).toBe(false);
  });

  test('a scaffold with the name filled merges and passes the schema', () => {
    const dir = scaffold();
    const prd = readFileSync(join(dir, 'PRD.md'), 'utf-8').replace('name: ""', 'name: "Demo"');
    writeFileSync(join(dir, 'PRD.md'), prd);
    const result = validateContext(mergeContext(loadProductContext(dir)));
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });
});
