/**
 * vendor-check — proves the "we already own 40% of the value" premise instead of assuming it.
 *
 * For every vendored craft skill:
 *   1. INTEGRITY  — SKILL.md still hashes to what was vendored (nobody edited it in place).
 *   2. UPSTREAM   — compare against the library, if reachable: is the pin stale?
 *   3. BINDINGS   — every `${ctx.*}` the skill references must be (a) defined in
 *                   project-context.schema.json and (b) actually present in the reference
 *                   product's merged context.
 *
 * Check 3 is the one that matters: `fullstack-developer` binds `${ctx.tech_bindings}`, a key the
 * Factory context never produced, so the vendored skill was silently binding to nothing.
 *
 * Run: `fac vendor:check`
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { loadManifest, libraryDir, sha256, hashDir, VENDOR_DIR } from './vendor.ts';
import { loadProductContext, mergeContext } from '../lib/context.ts';
import { SCHEMA_PATH } from '../lib/schema.ts';
import { parseFrontmatter } from '../lib/frontmatter.ts';

const ROOT = join(import.meta.dir, '..');
const REFERENCE_PRODUCT = join(ROOT, 'examples', 'reference-product');

type Json = Record<string, unknown>;

/** Every `${ctx.a.b}` reference in a skill, deduped, as dotted paths without the `ctx.` prefix. */
export function extractCtxRefs(text: string): string[] {
  const refs = new Set<string>();
  for (const m of text.matchAll(/\$\{ctx\.([A-Za-z0-9_.]+)\}/g)) {
    refs.add(m[1].replace(/\.$/, ''));
  }
  return [...refs].sort();
}

/**
 * Is a dotted path reachable through the JSON schema (respecting additionalProperties)?
 *
 * The ROOT is treated strictly: the first segment must be a declared property even though the
 * schema sets `additionalProperties: true` at the top level (products may carry their own
 * context keys). Without that exception every `${ctx.anything}` would resolve and the binding
 * check would be worthless. Nested levels honour additionalProperties normally, so open maps
 * like tech_bindings still accept product-specific keys.
 */
export function pathInSchema(schema: Json, path: string[]): boolean {
  const [first] = path;
  const rootProps = schema.properties as Json | undefined;
  if (!first || !rootProps?.[first]) return false;

  let node: Json | undefined = schema;
  for (const segment of path) {
    if (!node) return false;
    const properties = node.properties as Json | undefined;
    const next = properties?.[segment] as Json | undefined;
    if (next) {
      node = next;
      continue;
    }
    const additional = node.additionalProperties;
    if (additional === true) return true;
    if (additional && typeof additional === 'object') {
      node = additional as Json;
      continue;
    }
    return false;
  }
  return true;
}

/** Is a dotted path actually populated in a merged context? */
export function pathInContext(context: Json, path: string[]): boolean {
  let node: unknown = context;
  for (const segment of path) {
    if (node === null || typeof node !== 'object' || Array.isArray(node)) return false;
    if (!(segment in (node as Json))) return false;
    node = (node as Json)[segment];
  }
  if (node === null || node === undefined || node === '') return false;
  if (Array.isArray(node) && node.length === 0) return false;
  if (typeof node === 'object' && Object.keys(node as Json).length === 0) return false;
  return true;
}

function vendoredNames(): string[] {
  if (!existsSync(VENDOR_DIR)) return [];
  return readdirSync(VENDOR_DIR)
    .filter((n) => statSync(join(VENDOR_DIR, n)).isDirectory() && existsSync(join(VENDOR_DIR, n, 'SKILL.md')))
    .sort();
}

function main() {
  const names = vendoredNames();
  if (names.length === 0) {
    console.log('vendor:check — no vendored skills yet (run `fac vendor <name>`).');
    return;
  }

  const manifest = loadManifest();
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf-8')) as Json;
  const srcDir = libraryDir(manifest);

  let context: Json | null = null;
  try {
    context = mergeContext(loadProductContext(REFERENCE_PRODUCT));
  } catch (err) {
    console.error(
      `vendor:check — cannot load the reference product at ${relative(ROOT, REFERENCE_PRODUCT)}: ` +
        `${(err as Error).message}\nBinding checks will be schema-only.\n`,
    );
  }

  let failed = 0;
  let warned = 0;

  for (const name of names) {
    const problems: string[] = [];
    const warnings: string[] = [];
    const path = join(VENDOR_DIR, name, 'SKILL.md');
    const content = readFileSync(path, 'utf-8');
    const pin = manifest.vendored[name];

    // 1. INTEGRITY
    if (!pin) {
      warnings.push('not in manifest.json — re-run `fac vendor` to pin it');
    } else if (pin.sha256 !== sha256(content)) {
      problems.push(
        'edited in place — vendored skills are byte-identical to the library. ' +
          'Fix upstream in agent-skills and re-vendor.',
      );
    }

    // 2. UPSTREAM
    if (srcDir && pin) {
      const upstream = join(srcDir, name, 'SKILL.md');
      if (!existsSync(upstream)) {
        warnings.push('no longer present in the library');
      } else {
        const upstreamText = readFileSync(upstream, 'utf-8');
        if (sha256(upstreamText) !== pin.sha256) {
          const { data } = parseFrontmatter(upstreamText, name);
          const version = String(((data.metadata ?? {}) as Json).version ?? '?');
          warnings.push(`upstream has changed (library ${version} vs pinned ${pin.version})`);
        }
      }
    }

    // 3. BINDINGS
    const refs = extractCtxRefs(content);
    for (const ref of refs) {
      const segments = ref.split('.');
      if (!pathInSchema(schema, segments)) {
        problems.push(`\${ctx.${ref}} is not defined in project-context.schema.json`);
      } else if (context && !pathInContext(context, segments)) {
        problems.push(`\${ctx.${ref}} is unresolved in the reference product's context`);
      }
    }

    const refNote = refs.length > 0 ? ` [${refs.length} ctx ref(s)]` : '';
    if (problems.length === 0 && warnings.length === 0) {
      console.log(`  ✓ ${name} @ ${pin?.version ?? '?'}${refNote}`);
    } else if (problems.length === 0) {
      warned++;
      console.log(`  ⚠ ${name} @ ${pin?.version ?? '?'}${refNote}`);
      for (const w of warnings) console.log(`      ${w}`);
    } else {
      failed++;
      console.error(`  ✗ ${name} @ ${pin?.version ?? '?'}${refNote}`);
      for (const p of problems) console.error(`      ${p}`);
      for (const w of warnings) console.error(`      ${w}`);
    }
  }

  // Bundle integrity: shared-asset holders (no SKILL.md, e.g. the ADK `adk-agent` bundle) are not
  // in `names`, but must still be byte-stable — nobody edits a vendored bundle in place.
  for (const [name, pin] of Object.entries(manifest.vendored)) {
    const dir = join(VENDOR_DIR, name);
    if (existsSync(join(dir, 'SKILL.md')) || !existsSync(dir)) continue;
    if (hashDir(dir) === pin.sha256) {
      console.log(`  ✓ ${name} (bundle)`);
    } else {
      failed++;
      console.error(
        `  ✗ ${name} (bundle) — edited in place; fix upstream in agent-skills and re-vendor.`,
      );
    }
  }

  const summary = `\nvendor:check — ${names.length} vendored skill(s), ${failed} failed, ${warned} warning(s).`;
  if (failed > 0) {
    console.error(summary);
    process.exit(1);
  }
  console.log(summary);
}

if (import.meta.main) main();
