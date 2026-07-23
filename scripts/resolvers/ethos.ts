import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..', '..');

/**
 * Renders a compact ethos block injected into every generated skill. Sourced from ETHOS.md
 * headings so the summary never drifts from the full document.
 */
export function resolveEthos(): string {
  let principles: string[];
  try {
    const ethos = readFileSync(join(ROOT, 'ETHOS.md'), 'utf-8');
    principles = ethos
      .split('\n')
      .filter((l) => /^##\s+\d+\./.test(l))
      .map((l) => l.replace(/^##\s+\d+\.\s*/, '').trim());
  } catch {
    principles = [];
  }
  if (principles.length === 0) {
    principles = [
      'Boil the ocean — do the complete job.',
      'Search before building — check for a built-in first.',
      'User sovereignty — ask before anything hard to reverse.',
      'One source of truth per product: PRD.md.',
      'Mechanism vs parameters — never hardcode product specifics.',
      'Ground your claims — no claim without a source.',
    ];
  }
  const items = principles.map((p) => `- ${p}`).join('\n');
  return [
    '<!-- FACTORY:ETHOS (generated — do not edit) -->',
    '> **Factory ethos.** Every action inherits these principles:',
    '>',
    ...items.split('\n').map((l) => `> ${l}`),
  ].join('\n');
}
