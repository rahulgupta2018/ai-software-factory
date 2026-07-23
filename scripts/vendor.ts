/**
 * vendor — copy a craft skill from the agent-skills library into vendor-skills/, pinned.
 *
 * Layer 2 skills are vendored byte-identical and never edited in place (mechanism-vs-parameters:
 * improvements flow back to the library and are re-vendored). The manifest records the pinned
 * version plus a content hash, so `vendor:check` can prove no one has edited a vendored copy.
 *
 * Run: `fac vendor <skill-name> [...]`
 * Library location: $AGENT_SKILLS_DIR, else the `source` recorded in vendor-skills/manifest.json.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, cpSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseFrontmatter } from '../lib/frontmatter.ts';

const ROOT = join(import.meta.dir, '..');
export const VENDOR_DIR = join(ROOT, 'vendor-skills');
export const MANIFEST_PATH = join(VENDOR_DIR, 'manifest.json');

export interface VendoredEntry {
  version: string;
  source_last_updated?: string;
  vendored_at: string;
  /** sha256 of SKILL.md at vendor time — detects in-place edits. */
  sha256: string;
}

export interface Manifest {
  source: string;
  vendored: Record<string, VendoredEntry>;
}

export function loadManifest(): Manifest {
  if (!existsSync(MANIFEST_PATH)) return { source: '', vendored: {} };
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8')) as Manifest;
}

export function saveManifest(manifest: Manifest): void {
  const vendored = Object.fromEntries(
    Object.entries(manifest.vendored).sort(([a], [b]) => a.localeCompare(b)),
  );
  writeFileSync(MANIFEST_PATH, `${JSON.stringify({ ...manifest, vendored }, null, 2)}\n`);
}

export function sha256(text: string): string {
  return new Bun.CryptoHasher('sha256').update(text).digest('hex');
}

/** Resolve the agent-skills library dir: env var wins, then the manifest's recorded source. */
export function libraryDir(manifest: Manifest): string | null {
  const candidate = process.env.AGENT_SKILLS_DIR || manifest.source;
  return candidate && existsSync(candidate) ? candidate : null;
}

/** Recursively copy a directory, pruning any stale destination first. */
function copyDir(src: string, dest: string): void {
  rmSync(dest, { recursive: true, force: true });
  cpSync(src, dest, { recursive: true });
}

/** One digest over every file under a dir (sorted by relative path) — for hashing bundles. */
export function hashDir(dir: string): string {
  const hasher = new Bun.CryptoHasher('sha256');
  const walk = (d: string, rel: string): void => {
    for (const entry of readdirSync(d).sort()) {
      const abs = join(d, entry);
      const relPath = rel ? `${rel}/${entry}` : entry;
      if (statSync(abs).isDirectory()) walk(abs, relPath);
      else hasher.update(`${relPath}\0`).update(readFileSync(abs));
    }
  };
  walk(dir, '');
  return hasher.digest('hex');
}

function vendorOne(name: string, srcDir: string, manifest: Manifest): boolean {
  const srcPath = join(srcDir, name);
  if (!existsSync(srcPath)) {
    console.error(`  ✗ ${name}: not found at ${srcPath}`);
    return false;
  }

  const destDir = join(VENDOR_DIR, name);
  const srcSkill = join(srcPath, 'SKILL.md');

  // Bundle: a shared-asset holder with no SKILL.md (e.g. the ADK `adk-agent` bundle). Vendor the
  // whole folder so the flat `adk-*` skills' relative references (contributing/, guides/) resolve.
  if (!existsSync(srcSkill)) {
    copyDir(srcPath, destDir);
    // The ADK bundle's reference guides live at the library root's docs/guides (a sibling of
    // skills/); pull them under the bundle so the vendored copy is self-contained.
    const guidesSrc = join(srcDir, '..', 'docs', 'guides');
    if (name === 'adk-agent' && existsSync(guidesSrc)) {
      copyDir(guidesSrc, join(destDir, 'guides'));
    }
    manifest.vendored[name] = {
      version: 'bundle',
      vendored_at: new Date().toISOString().slice(0, 10),
      sha256: hashDir(destDir),
    };
    console.log(`  ✓ ${name} (bundle)`);
    return true;
  }

  const content = readFileSync(srcSkill, 'utf-8');
  const { data } = parseFrontmatter(content, `${name}/SKILL.md`);
  const metadata = (data.metadata ?? {}) as Record<string, unknown>;
  const version = String(metadata.version ?? '0.0.0');

  // Prune first so a re-vendor drops files the skill no longer ships.
  rmSync(destDir, { recursive: true, force: true });
  mkdirSync(destDir, { recursive: true });
  writeFileSync(join(destDir, 'SKILL.md'), content);

  // Copy any references/ material the skill ships with (recursively — subdirs included).
  const refsDir = join(srcPath, 'references');
  if (existsSync(refsDir)) copyDir(refsDir, join(destDir, 'references'));

  manifest.vendored[name] = {
    version,
    source_last_updated: metadata.last_updated ? String(metadata.last_updated) : undefined,
    vendored_at: new Date().toISOString().slice(0, 10),
    sha256: sha256(content),
  };
  console.log(`  ✓ ${name} @ ${version}`);
  return true;
}

function main() {
  const names = process.argv.slice(2);
  const manifest = loadManifest();

  const srcDir = libraryDir(manifest);
  if (!srcDir) {
    console.error(
      'vendor — agent-skills library not found.\n' +
        'Set AGENT_SKILLS_DIR to the library\'s skills/ dir, or record it as "source" in\n' +
        `${MANIFEST_PATH}`,
    );
    process.exit(1);
  }

  if (names.length === 0) {
    const available = readdirSync(srcDir).filter((n) =>
      existsSync(join(srcDir, n, 'SKILL.md')),
    );
    console.log(`vendor — library: ${srcDir}\n\nAvailable:\n${available.map((n) => `  ${n}`).join('\n')}`);
    return;
  }

  mkdirSync(VENDOR_DIR, { recursive: true });
  manifest.source = srcDir;

  let failed = 0;
  for (const name of names) if (!vendorOne(name, srcDir, manifest)) failed++;

  saveManifest(manifest);
  console.log(`\nvendor — ${names.length - failed} vendored, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

if (import.meta.main) main();
