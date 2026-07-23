/**
 * Memory store — namespaced, scoped notes the Factory carries across a task and a product.
 *
 * A note is a small markdown blob addressed by `(scope, key)`. Two scopes:
 *   - `product` — persists with the repo (committed design memory: conventions, learnings).
 *   - `session` — working state for the task in flight (`/context-save` writes here).
 *
 * Notes live under `.factory/memory/<scope>/<slug>.md`. The body is stored verbatim (no
 * frontmatter); the note's `updated_at` is the file's mtime, so the file on disk is exactly what
 * was written. Keys are slugified to a safe filename, so `readNote` must be given the same key
 * `writeNote` used. Writes are secret-blocking, like the decision log.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FACTORY_DIR } from './run.ts';
import { containsHighSecret } from './redact.ts';

export const MEMORY_DIR = 'memory';

export type MemoryScope = 'product' | 'session';

const SCOPES: MemoryScope[] = ['product', 'session'];

export interface MemoryNote {
  scope: MemoryScope;
  key: string;
  body: string;
  updated_at: string;
}

function assertScope(scope: MemoryScope): void {
  if (!SCOPES.includes(scope)) throw new Error(`memory: invalid scope ${scope}`);
}

/** Slugify a key to a safe, stable filename stem. */
export function slugKey(key: string): string {
  const slug = key
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) throw new Error(`memory: key slugifies to empty (${JSON.stringify(key)})`);
  return slug;
}

export function memoryDir(repoRoot: string, scope: MemoryScope): string {
  assertScope(scope);
  return join(repoRoot, FACTORY_DIR, MEMORY_DIR, scope);
}

function notePath(repoRoot: string, scope: MemoryScope, key: string): string {
  return join(memoryDir(repoRoot, scope), `${slugKey(key)}.md`);
}

/** Write (or overwrite) a note atomically. Refuses a body carrying a HIGH-tier secret. */
export function writeNote(repoRoot: string, scope: MemoryScope, key: string, body: string): MemoryNote {
  if (containsHighSecret(body)) {
    throw new Error('writeNote: refusing to store a note containing a high-confidence secret');
  }
  const path = notePath(repoRoot, scope, key);
  mkdirSync(memoryDir(repoRoot, scope), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, body);
  renameSync(tmp, path);
  return { scope, key: slugKey(key), body, updated_at: statSync(path).mtime.toISOString() };
}

/** Read a note, or null if it does not exist. */
export function readNote(repoRoot: string, scope: MemoryScope, key: string): MemoryNote | null {
  const path = notePath(repoRoot, scope, key);
  if (!existsSync(path)) return null;
  return {
    scope,
    key: slugKey(key),
    body: readFileSync(path, 'utf-8'),
    updated_at: statSync(path).mtime.toISOString(),
  };
}

/** The slug keys present in a scope, sorted. */
export function listNotes(repoRoot: string, scope: MemoryScope): string[] {
  const dir = memoryDir(repoRoot, scope);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.slice(0, -'.md'.length))
    .sort();
}

/** Delete a note. Returns true if one was removed. */
export function deleteNote(repoRoot: string, scope: MemoryScope, key: string): boolean {
  const path = notePath(repoRoot, scope, key);
  if (!existsSync(path)) return false;
  rmSync(path, { force: true });
  return true;
}
