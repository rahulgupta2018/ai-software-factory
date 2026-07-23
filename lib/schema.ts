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
