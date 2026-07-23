/**
 * gen-skill-docs — turns skills/<name>/SKILL.md.tmpl into generated SKILL.md outputs.
 *
 *   skills/<name>/SKILL.md.tmpl   ─┐
 *   scripts/resolvers/*.ts        ─┼─►  gen-skill-docs.ts  ─►  skills/<name>/SKILL.md (canonical)
 *                                  │                            .codex/skills/<name>/SKILL.md (+ hosts)
 *
 * Rendering is a pure function (`renderSkill`) exported for skill-check.ts, so drift detection
 * is a byte comparison against what the generator would actually write — not a heuristic.
 *
 * Run: `bun run gen:skills`
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { hosts } from '../hosts/index.ts';
import { applyFrontmatterMode, type HostConfig } from './host-config.ts';
import { parseFrontmatter, renderFrontmatter } from '../lib/frontmatter.ts';
import { resolvePlaceholders } from './resolvers/index.ts';

const ROOT = join(import.meta.dir, '..');
export const SKILLS_DIR = join(ROOT, 'skills');

export interface SkillFile {
  /** Absolute path this file is written to. */
  path: string;
  /** Full file contents. */
  content: string;
  /** Host that owns this output. */
  host: HostConfig;
  /** True for the canonical skills/<name>/SKILL.md. */
  canonical: boolean;
}

/** List skill folders that have a template. */
export function skillNames(): string[] {
  if (!existsSync(SKILLS_DIR)) return [];
  return readdirSync(SKILLS_DIR)
    .filter((name) => {
      const p = join(SKILLS_DIR, name);
      return statSync(p).isDirectory() && existsSync(join(p, 'SKILL.md.tmpl'));
    })
    .sort();
}

export function templatePath(name: string): string {
  return join(SKILLS_DIR, name, 'SKILL.md.tmpl');
}

/**
 * PURE — render every host SKILL.md for one skill. Throws on a malformed template or a
 * frontmatter `name` that disagrees with the folder name.
 */
export function renderSkill(name: string, tmpl: string): SkillFile[] {
  const { data, body } = parseFrontmatter(tmpl, `${name}/SKILL.md.tmpl`);

  if (data.name !== name) {
    throw new Error(
      `frontmatter name '${String(data.name ?? '')}' must equal folder name '${name}'`,
    );
  }

  const resolvedBody = resolvePlaceholders(body);

  return hosts.map((host) => {
    const frontmatter = applyFrontmatterMode(data, host.frontmatter);
    const content = renderFrontmatter(frontmatter) + resolvedBody;
    const path = host.canonical
      ? join(SKILLS_DIR, name, 'SKILL.md')
      : join(ROOT, host.hostSubdir, 'skills', name, 'SKILL.md');
    return { path, content, host, canonical: host.canonical };
  });
}

/** PURE — the sidecar metadata a host asks for, if any. */
export function renderMetadata(name: string, tmpl: string, host: HostConfig): SkillFile | null {
  if (!host.generation.generateMetadata || !host.generation.metadataFile) return null;
  const { data } = parseFrontmatter(tmpl, `${name}/SKILL.md.tmpl`);
  const description = typeof data.description === 'string' ? data.description.trim() : '';
  return {
    path: join(ROOT, host.hostSubdir, 'skills', name, host.generation.metadataFile),
    content: `name: ${name}\ndescription: ${JSON.stringify(description)}\n`,
    host,
    canonical: false,
  };
}

/** PURE — every file the generator writes for one skill. */
export function skillOutputs(name: string, tmpl: string): SkillFile[] {
  const metadata = hosts
    .map((host) => renderMetadata(name, tmpl, host))
    .filter((f): f is SkillFile => f !== null);
  return [...renderSkill(name, tmpl), ...metadata];
}

function main() {
  const names = skillNames();
  if (names.length === 0) {
    console.log('gen:skills — no skills found under skills/*/SKILL.md.tmpl');
    return;
  }
  let generated = 0;
  for (const name of names) {
    const tmpl = readFileSync(templatePath(name), 'utf-8');
    let files: SkillFile[];
    try {
      files = skillOutputs(name, tmpl);
    } catch (err) {
      console.error(`  ✗ ${name}: ${(err as Error).message}`);
      process.exitCode = 1;
      continue;
    }
    for (const file of files) {
      mkdirSync(join(file.path, '..'), { recursive: true });
      writeFileSync(file.path, file.content);
    }
    generated++;
    console.log(`  ✓ ${name} → ${hosts.map((h) => h.displayName).join(', ')}`);
  }
  console.log(`\ngen:skills — generated ${generated} skill(s) for ${hosts.length} host(s).`);
}

if (import.meta.main) main();
