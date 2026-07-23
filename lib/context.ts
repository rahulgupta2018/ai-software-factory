/**
 * Product context: load, ownership-check, merge, project.
 *
 * A product is defined by TWO files, split by who writes them:
 *
 *   PRD.md              human-owned.   Frontmatter: product identity + meta. Body: requirements.
 *   .factory/stack.yaml machine-owned. Written by /plan-arch: tech_stack, commands, skills,
 *                                      guardrails, escalation_policy, tech_bindings.
 *
 * They were one file. Agents writing tech_stack back into the same frontmatter a human is
 * editing is a clobber hazard, and the two halves change at completely different cadences.
 * Splitting by author keeps one human file and one machine file, with no write contention.
 *
 * `fac sync-context` merges them into the derived `.factory/context.gen.yaml` that vendored
 * craft skills bind to — including the `project` and `tech_bindings` aliases the agent-skills
 * library expects (see COMPAT below).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseFrontmatter } from './frontmatter.ts';
import { parseYamlObject } from './yaml.ts';

/** Keys a human authors in PRD.md frontmatter. */
export const PRD_KEYS = ['product', 'domain', 'meta'] as const;

/** Keys /plan-arch and tooling write to .factory/stack.yaml. */
export const STACK_KEYS = [
  'tech_stack',
  'commands',
  'skills',
  'guardrails',
  'escalation_policy',
  'tech_bindings',
] as const;

/** Keys nobody authors — sync-context derives them for library compatibility. */
export const DERIVED_KEYS = ['project'] as const;

export const STACK_RELATIVE = join('.factory', 'stack.yaml');

export interface ProductContext {
  prdPath: string;
  stackPath: string;
  /** PRD frontmatter (human-owned half). */
  prd: Record<string, unknown>;
  /** stack.yaml contents (machine-owned half); empty when not yet written by /plan-arch. */
  stack: Record<string, unknown>;
  /** PRD markdown body. */
  body: string;
}

export interface OwnershipIssue {
  file: 'PRD.md' | 'stack.yaml';
  key: string;
  message: string;
}

/** Load a product's two halves from a repo root. Throws when PRD.md is absent or malformed. */
export function loadProductContext(dir = process.cwd(), prdArg?: string): ProductContext {
  const prdPath = resolve(dir, prdArg ?? 'PRD.md');
  if (!existsSync(prdPath)) {
    throw new Error(
      `no PRD.md at ${prdPath}\nRun \`fac init\` in a product repo to scaffold one.`,
    );
  }
  const { data, body } = parseFrontmatter(readFileSync(prdPath, 'utf-8'), 'PRD.md');

  const stackPath = resolve(dir, STACK_RELATIVE);
  const stack = existsSync(stackPath)
    ? parseYamlObject(readFileSync(stackPath, 'utf-8'), STACK_RELATIVE)
    : {};

  return { prdPath, stackPath, prd: data, stack, body };
}

/**
 * Enforce the split. A machine key in PRD.md means an agent wrote to the human file (or the
 * product predates the split); a human key in stack.yaml means the reverse.
 */
export function checkOwnership(ctx: ProductContext): OwnershipIssue[] {
  const issues: OwnershipIssue[] = [];
  const stackKeys = new Set<string>(STACK_KEYS);
  const prdKeys = new Set<string>(PRD_KEYS);

  for (const key of Object.keys(ctx.prd)) {
    if (stackKeys.has(key)) {
      issues.push({
        file: 'PRD.md',
        key,
        message: `'${key}' is machine-owned — move it to ${STACK_RELATIVE}`,
      });
    }
  }
  for (const key of Object.keys(ctx.stack)) {
    if (prdKeys.has(key)) {
      issues.push({
        file: 'stack.yaml',
        key,
        message: `'${key}' is human-owned — move it to PRD.md frontmatter`,
      });
    }
  }
  return issues;
}

interface Component {
  name?: string;
  language?: string;
  framework?: string;
  css?: string;
  db?: string;
}

/**
 * COMPAT: derive `tech_bindings` from the design decisions in tech_stack.components[].
 *
 * `fullstack-developer` binds `${ctx.tech_bindings}` ("prefer the stack in ... e.g. DB, cache,
 * hosting"). Nothing in the Factory context produced that key, so the vendored skill silently
 * bound to nothing. Explicit values in stack.yaml win over derived ones.
 */
export function deriveTechBindings(context: Record<string, unknown>): Record<string, unknown> {
  const techStack = context.tech_stack as { components?: Component[] } | undefined;
  const components = techStack?.components ?? [];
  const derived: Record<string, unknown> = {};

  for (const c of components) {
    if (!c?.name) continue;
    const stack = [c.framework ?? c.language, c.css].filter(Boolean).join(' + ');
    if (stack) derived[c.name] = stack;
    if (c.db && !derived.db) derived.db = c.db;
  }

  const explicit = (context.tech_bindings as Record<string, unknown>) ?? {};
  return { ...derived, ...explicit };
}

/**
 * Merge the two halves into the context vendored skills bind to, adding compatibility aliases.
 * Returns a plain object ready for schema validation and YAML serialization.
 */
export function mergeContext(ctx: ProductContext): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...ctx.prd, ...ctx.stack };

  // COMPAT: the library's schema requires `project`; the Factory authors it as `product`.
  const product = merged.product as { name?: string; code?: string; description?: string } | undefined;
  if (product?.name && !merged.project) {
    merged.project = {
      name: product.name,
      ...(product.code ? { code: product.code } : {}),
      ...(product.description ? { description: product.description } : {}),
    };
  }

  const bindings = deriveTechBindings(merged);
  if (Object.keys(bindings).length > 0) merged.tech_bindings = bindings;

  return merged;
}
