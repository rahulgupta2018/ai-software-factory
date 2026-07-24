/**
 * JSON-Schema validation for the product context.
 *
 * `sync-context` used to print "Validated against project-context.schema.json" in the header of
 * a file it never validated — it regex-checked for two key names and copied the frontmatter
 * through verbatim. Every skill binds to this contract, so validation is real now.
 */
// The 2020-12 build — project-context.schema.json declares that dialect, and Ajv's default
// export only knows draft-07.
import Ajv from 'ajv/dist/2020.js';
import type { ErrorObject } from 'ajv';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
export const SCHEMA_PATH = join(ROOT, 'project-context.schema.json');

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

let cachedValidator: ReturnType<Ajv['compile']> | null = null;

function validator() {
  if (!cachedValidator) {
    const ajv = new Ajv({ allErrors: true, strict: false });
    cachedValidator = ajv.compile(JSON.parse(readFileSync(SCHEMA_PATH, 'utf-8')));
  }
  return cachedValidator;
}

function format(err: ErrorObject): string {
  const path = err.instancePath || '(root)';
  const allowed =
    err.keyword === 'enum' && Array.isArray((err.params as { allowedValues?: unknown[] }).allowedValues)
      ? ` (allowed: ${(err.params as { allowedValues: unknown[] }).allowedValues.join(', ')})`
      : '';
  const extra =
    err.keyword === 'additionalProperties'
      ? ` '${(err.params as { additionalProperty: string }).additionalProperty}'`
      : '';
  return `${path} ${err.message}${extra}${allowed}`;
}

/** Validate a merged product context against project-context.schema.json. */
export function validateContext(context: unknown): ValidationResult {
  const validate = validator();
  const ok = validate(context) as boolean;
  return { ok, errors: ok ? [] : (validate.errors ?? []).map(format) };
}

/**
 * The distinctive, security-critical `tech_bindings` names. A mistyped binding *name* is silently
 * ignored (tech_bindings stays open for custom infra), which for a security gate means the gate is
 * never applied — a fail-open. These names are long and unambiguous enough that a near-miss is
 * almost certainly a typo; the short generic ones (sast/dast/ci) are excluded to avoid flagging
 * legitimate short custom keys.
 */
export const SECURITY_BINDING_NAMES: readonly string[] = [
  'supply_chain',
  'container_scan',
  'provenance',
  'mobile_release',
];

/** Levenshtein distance, capped at `max` for an early exit (returns `max + 1` past the cap). */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      rowMin = Math.min(rowMin, curr[j]);
    }
    if (rowMin > max) return max + 1;
    prev = curr;
  }
  return prev[b.length];
}

export interface BindingNearMiss {
  key: string;
  suggestion: string;
}

/**
 * Flag `tech_bindings` keys that look like a typo of a distinctive security binding — e.g.
 * `supply_chian` for `supply_chain`. Such a key is silently accepted (custom bindings are allowed),
 * so the security gate it was meant to declare never runs. This surfaces the likely typo as a
 * warning. An exact security-binding name is never flagged; a genuinely-unrelated custom key
 * (edit distance > 2 from every security name) is left alone.
 */
export function nearMissBindingKeys(techBindings: unknown): BindingNearMiss[] {
  if (techBindings == null || typeof techBindings !== 'object') return [];
  const out: BindingNearMiss[] = [];
  for (const key of Object.keys(techBindings as Record<string, unknown>)) {
    if (SECURITY_BINDING_NAMES.includes(key)) continue; // exact — fine
    let best: { name: string; d: number } | null = null;
    for (const name of SECURITY_BINDING_NAMES) {
      const d = editDistance(key, name, 2);
      if (d <= 2 && (best === null || d < best.d)) best = { name, d };
    }
    if (best) out.push({ key, suggestion: best.name });
  }
  return out;
}
