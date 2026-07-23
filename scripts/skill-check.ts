/**
 * skill-check — Tier-1 static validation (free, fast). For each workflow skill:
 *   - .tmpl parses, with frontmatter carrying name + description
 *   - frontmatter name == folder name
 *   - every generated host output exists, is ≤ 500 lines, and matches the generator BYTE FOR
 *     BYTE (real drift detection — regenerate in memory and compare)
 *   - a "Do not activate" block is present
 *
 * The previous drift check tested whether the first non-empty line of the resolved body
 * appeared anywhere in SKILL.md — a near-tautology that passed with a completely stale
 * preamble. It also printed a ✓ for skills that had just failed.
 *
 * Run: `bun run skill:check`
 */
import { readFileSync, existsSync } from 'node:fs';
import { relative } from 'node:path';
import { skillNames, skillOutputs, templatePath } from './gen-skill-docs.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const MAX_LINES = 500;

const rel = (p: string) => relative(ROOT, p);

/** Validate one skill. Returns a list of problems; empty means pass. Exported for tests. */
export function checkSkill(name: string): string[] {
  const problems: string[] = [];
  const tmpl = readFileSync(templatePath(name), 'utf-8');

  let files;
  try {
    files = skillOutputs(name, tmpl);
  } catch (err) {
    return [(err as Error).message];
  }

  for (const file of files) {
    if (!existsSync(file.path)) {
      problems.push(`${rel(file.path)} not generated — run \`bun run gen:skills\``);
      continue;
    }
    const onDisk = readFileSync(file.path, 'utf-8');
    if (onDisk !== file.content) {
      problems.push(
        `drift: ${rel(file.path)} differs from the generator — run \`bun run gen:skills\``,
      );
      continue;
    }
    if (!file.path.endsWith('SKILL.md')) continue;

    const lineCount = onDisk.split('\n').length;
    if (lineCount > MAX_LINES) {
      problems.push(`${rel(file.path)}: ${lineCount} lines > ${MAX_LINES} max`);
    }
    if (!/do not activate/i.test(onDisk)) {
      problems.push(`${rel(file.path)}: missing 'Do not activate' block`);
    }
  }

  // Frontmatter requirements are checked on the canonical output, which keeps every field.
  const canonical = files.find((f) => f.canonical);
  if (canonical && !/^description:/m.test(canonical.content)) {
    problems.push("frontmatter missing 'description'");
  }

  return problems;
}

function main() {
  const names = skillNames();
  if (names.length === 0) {
    console.log('skill:check — no skills found under skills/*/SKILL.md.tmpl');
    return;
  }

  let failed = 0;
  for (const name of names) {
    const problems = checkSkill(name);
    if (problems.length === 0) {
      console.log(`  ✓ ${name}`);
    } else {
      failed++;
      console.error(`  ✗ ${name}`);
      for (const p of problems) console.error(`      ${p}`);
    }
  }

  if (failed > 0) {
    console.error(`\nskill:check — ${failed} of ${names.length} skill(s) failed.`);
    process.exit(1);
  }
  console.log(`\nskill:check — ${names.length} skill(s) OK.`);
}

if (import.meta.main) main();
