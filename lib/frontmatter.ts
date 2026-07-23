/**
 * Frontmatter split/parse/render — the single implementation.
 *
 * Previously gen-skill-docs.ts, skill-check.ts and sync-context.ts each carried their own
 * regex, and the generator classified any line matching /^[A-Za-z0-9_-]+:/ as a top-level key
 * — which silently splits a block scalar whose content happens to contain "foo:" at column 0.
 * Everything now goes through a real YAML parser here.
 */
import { parseYamlObject, stringifyYaml } from './yaml.ts';

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n([\s\S]*))?$/;

export interface FrontmatterDoc {
  /** Parsed frontmatter mapping. */
  data: Record<string, unknown>;
  /** Raw frontmatter text, without the --- fences. */
  raw: string;
  /** Everything after the closing fence. */
  body: string;
}

/** Split a document into its raw frontmatter block and body. Throws when the block is absent. */
export function splitFrontmatter(text: string, label = 'document'): { raw: string; body: string } {
  const m = text.match(FRONTMATTER);
  if (!m) throw new Error(`${label}: missing YAML frontmatter block (expected a leading '---')`);
  return { raw: m[1], body: m[2] ?? '' };
}

/** Split and parse. Throws on a missing block or invalid YAML. */
export function parseFrontmatter(text: string, label = 'document'): FrontmatterDoc {
  const { raw, body } = splitFrontmatter(text, label);
  return { data: parseYamlObject(raw, `${label} frontmatter`), raw, body };
}

/** Render a mapping as a fenced frontmatter block, block-style and deterministic. */
export function renderFrontmatter(data: Record<string, unknown>): string {
  return `---\n${stringifyYaml(data)}---\n`;
}

/** Keep only `keys`, preserving their order in the source object. */
export function pickKeys(
  data: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> {
  const keep = new Set(keys);
  return Object.fromEntries(Object.entries(data).filter(([k]) => keep.has(k)));
}

/** Drop `keys`, preserving the order of what remains. */
export function omitKeys(
  data: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> {
  const drop = new Set(keys);
  return Object.fromEntries(Object.entries(data).filter(([k]) => !drop.has(k)));
}
