#!/usr/bin/env bun
/**
 * fac — AI Software Factory CLI dispatcher.
 *
 * Usage:
 *   fac gen:skills       Regenerate all SKILL.md from .tmpl for every host
 *   fac skill:check      Static validation of workflow skills
 *   fac vendor <name>    Vendor a craft skill from the agent-skills library (pinned)
 *   fac vendor:check     Verify vendored skills' ${ctx.*} bindings resolve
 *   fac sync-context     Merge PRD.md + .factory/stack.yaml → .factory/context.gen.yaml
 *   fac memory <sub>     Read/write/list/delete scoped memory notes
 *   fac decision <sub>   Log/list/redact/compact durable decisions
 *   fac context <sub>    Save/restore working context checkpoints
 *   fac redact           Screen outbound text for secrets/PII before egress
 *   fac guard <sub>      Check a command/edit against the safety guardrails
 *   fac run <sub>        Manage a pipeline run (new/status/artifact/resume/stop/list)
 *   fac browse <sub>     Drive a headless browser (run/goto) for /qa and design review
 *   fac diagram <sub>    Validate/wrap/render Mermaid diagrams for /plan-arch
 *   fac make-pdf <sub>   Markdown → publication HTML/PDF for /document
 *   fac design <sub>     Generate UI mockups/images for /plan-design
 *   fac eval:select      Preview which E2E scenarios run for a diff/tier
 *   fac benchmark:models Compare a skill's output across several models
 *   fac install          Link/copy generated skills into detected hosts (verifies)
 *   fac init [dir]       Scaffold a product: PRD.md + .factory/stack.yaml
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = join(import.meta.dir, '..');
const cmd = process.argv[2];
const rest = process.argv.slice(3);

function run(script: string, args: string[] = []): never {
  const r = spawnSync('bun', ['run', join(ROOT, 'scripts', script), ...args], { stdio: 'inherit' });
  process.exit(r.status ?? 0);
  throw new Error('unreachable');
}

const GITIGNORE_STANZA = [
  '',
  '# AI Software Factory — derived context and run artifacts (stack.yaml IS committed)',
  '.factory/context.gen.yaml',
  '.factory/runs/',
  '.agents/project-context.yaml',
  '',
].join('\n');

function init(dir: string): void {
  const prdPath = join(dir, 'PRD.md');
  const factoryDir = join(dir, '.factory');
  const stackPath = join(factoryDir, 'stack.yaml');

  const existing = [prdPath, stackPath].filter(existsSync);
  if (existing.length > 0) {
    console.error(`fac init — refusing to overwrite:\n${existing.map((p) => `  ${p}`).join('\n')}`);
    process.exit(1);
  }

  writeFileSync(prdPath, readFileSync(join(ROOT, 'templates', 'PRD.template.md'), 'utf-8'));
  mkdirSync(join(factoryDir, 'runs'), { recursive: true });
  writeFileSync(stackPath, readFileSync(join(ROOT, 'templates', 'stack.template.yaml'), 'utf-8'));

  const gitignorePath = join(dir, '.gitignore');
  const current = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf-8') : '';
  if (!current.includes('.factory/context.gen.yaml')) {
    appendFileSync(gitignorePath, GITIGNORE_STANZA);
  }

  console.log(
    'fac init — scaffolded:\n' +
      '  PRD.md                 (human-owned — write the requirements)\n' +
      '  .factory/stack.yaml    (machine-owned — /plan-arch fills this)\n' +
      '  .gitignore             (+ derived-context entries)\n\n' +
      'Next: fill in PRD.md, then run `fac sync-context`.',
  );
}

switch (cmd) {
  case 'gen:skills':
    run('gen-skill-docs.ts');
    break;
  case 'skill:check':
    run('skill-check.ts');
    break;
  case 'vendor':
    run('vendor.ts', rest);
    break;
  case 'vendor:check':
    run('vendor-check.ts', rest);
    break;
  case 'sync-context':
    run('sync-context.ts', rest);
    break;
  case 'memory':
    run('memory.ts', rest);
    break;
  case 'decision':
    run('decision.ts', rest);
    break;
  case 'context':
    run('context.ts', rest);
    break;
  case 'redact':
    run('redact.ts', rest);
    break;
  case 'guard':
    run('guard.ts', rest);
    break;
  case 'eval:select':
    run('eval-select.ts', rest);
    break;
  case 'benchmark:models':
    run('benchmark-models.ts', rest);
    break;
  case 'install':
    run('install.ts', rest);
    break;
  case 'run':
    run('run.ts', rest);
    break;
  case 'browse': {
    const r = spawnSync('bun', ['run', join(ROOT, 'tools', 'browse', 'browse.ts'), ...rest], {
      stdio: 'inherit',
    });
    process.exit(r.status ?? 0);
  }
  case 'diagram': {
    const r = spawnSync('bun', ['run', join(ROOT, 'tools', 'diagram', 'diagram.ts'), ...rest], {
      stdio: 'inherit',
    });
    process.exit(r.status ?? 0);
  }
  case 'make-pdf': {
    const r = spawnSync('bun', ['run', join(ROOT, 'tools', 'make-pdf', 'make-pdf.ts'), ...rest], {
      stdio: 'inherit',
    });
    process.exit(r.status ?? 0);
  }
  case 'design': {
    const r = spawnSync('bun', ['run', join(ROOT, 'tools', 'design', 'design.ts'), ...rest], {
      stdio: 'inherit',
    });
    process.exit(r.status ?? 0);
  }
  case 'init':
    init(rest[0] ? join(process.cwd(), rest[0]) : process.cwd());
    break;
  default:
    console.log(
      'fac — AI Software Factory\n\n' +
        'Commands:\n' +
        '  gen:skills       Regenerate SKILL.md from .tmpl (all hosts)\n' +
        '  skill:check      Static validation of workflow skills\n' +
        '  vendor <name>    Vendor a craft skill from the agent-skills library (pinned)\n' +
        '  vendor:check     Verify vendored skills’ ${ctx.*} bindings resolve\n' +
        '  sync-context     PRD.md + .factory/stack.yaml → .factory/context.gen.yaml\n' +
        '  memory <sub>     Read/write/list/delete scoped memory notes\n' +
        '  decision <sub>   Log/list/redact/compact durable decisions\n' +
        '  context <sub>    Save/restore working context checkpoints\n' +
        '  redact           Screen outbound text for secrets/PII before egress\n' +
        '  guard <sub>      Check a command/edit against the safety guardrails\n' +
        '  run <sub>        Manage a pipeline run (new/status/artifact/resume/stop/list)\n' +
        '  browse <sub>     Drive a headless browser (run/goto) for /qa and design review\n' +
        '  diagram <sub>    Validate/wrap/render Mermaid diagrams for /plan-arch\n' +
        '  make-pdf <sub>   Markdown → publication HTML/PDF for /document\n' +
        '  design <sub>     Generate UI mockups/images for /plan-design\n' +
        '  eval:select      Preview which E2E scenarios run for a diff/tier\n' +
        '  benchmark:models Compare a skill’s output across several models\n' +
        '  install          Link/copy generated skills into detected hosts (verifies)\n' +
        '  init [dir]       Scaffold a product (PRD.md + .factory/stack.yaml)',
    );
    process.exit(cmd ? 1 : 0);
}
