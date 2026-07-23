/**
 * YAML helpers.
 *
 * Reading uses Bun's built-in parser. Writing uses a small block-style serializer, because
 * `Bun.YAML.stringify` emits single-line flow style (`{a: 1,b: 2}`) which is unreadable in a
 * SKILL.md frontmatter block or a hand-edited stack.yaml.
 *
 * The serializer is deterministic: same input object → same bytes. That is what makes the
 * drift check in skill-check.ts a real byte comparison rather than a heuristic.
 */

export function parseYaml(text: string, label = 'yaml'): unknown {
  try {
    return Bun.YAML.parse(text);
  } catch (err) {
    throw new Error(`${label}: invalid YAML — ${(err as Error).message}`);
  }
}

/** Parse and assert the document is a mapping. */
export function parseYamlObject(text: string, label = 'yaml'): Record<string, unknown> {
  const value = parseYaml(text, label);
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label}: expected a YAML mapping at the top level`);
  }
  return value as Record<string, unknown>;
}

const NEEDS_QUOTE =
  /^(?:$|[-?:,[\]{}#&*!|>'"%@`]|.*(?::\s|\s#))|^(?:true|false|yes|no|on|off|null|~)$|^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$|^\s|\s$/i;

function quote(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function scalar(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  const s = String(value);
  if (s.includes('\n')) return quote(s.replace(/\n/g, '\\n'));
  return NEEDS_QUOTE.test(s) ? quote(s) : s;
}

/** Wrap prose into a folded block scalar (`>-`) so long descriptions stay readable. */
function folded(value: string, indent: string, width: number): string {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (line && (line + ' ' + word).length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return `>-\n${lines.map((l) => `${indent}  ${l}`).join('\n')}`;
}

/**
 * A plain scalar is foldable prose when it is long, has no newlines, and cannot be confused
 * with another YAML type on the way back in.
 */
function isFoldable(value: unknown, width: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > width &&
    !value.includes('\n') &&
    !NEEDS_QUOTE.test(value)
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function emit(value: unknown, indent: string, width: number): string[] {
  if (Array.isArray(value)) {
    if (value.length === 0) return [];
    return value.flatMap((item) => {
      if (isPlainObject(item) || Array.isArray(item)) {
        const nested = emit(item, `${indent}  `, width);
        if (nested.length === 0) return [`${indent}- {}`];
        // Hoist the first child onto the dash line: "- name: api".
        return [`${indent}- ${nested[0].slice(indent.length + 2)}`, ...nested.slice(1)];
      }
      return [`${indent}- ${scalar(item)}`];
    });
  }

  const out: string[] = [];
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (val === undefined) continue;
    if (Array.isArray(val)) {
      if (val.length === 0) out.push(`${indent}${key}: []`);
      else out.push(`${indent}${key}:`, ...emit(val, indent, width));
    } else if (isPlainObject(val)) {
      if (Object.keys(val).length === 0) out.push(`${indent}${key}: {}`);
      else out.push(`${indent}${key}:`, ...emit(val, `${indent}  `, width));
    } else if (isFoldable(val, width)) {
      out.push(`${indent}${key}: ${folded(val, indent, width)}`);
    } else {
      out.push(`${indent}${key}: ${scalar(val)}`);
    }
  }
  return out;
}

/** Serialize a mapping to readable block-style YAML. Deterministic; key order preserved. */
export function stringifyYaml(value: Record<string, unknown>, width = 92): string {
  const lines = emit(value, '', width);
  return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
}
