/**
 * `fac context` — save and restore the working checkpoint that spans git, runs, decisions, and
 * a human note about what's next.
 *
 *   fac context save --note TEXT [--key working-context]
 *   fac context restore [--key working-context] [--json]
 */
import { spawnSync } from 'node:child_process';
import { activeDecisions, type DecisionRecord } from '../lib/decision.ts';
import { readNote, writeNote } from '../lib/memory.ts';
import { listArtifacts, listRuns, readRun } from '../lib/run.ts';

const cwd = process.cwd();
const DEFAULT_KEY = 'working-context';

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function has(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function fail(message: string): never {
  console.error(`context — ${message}`);
  process.exit(1);
  throw new Error('unreachable');
}

function keyArg(): string {
  return flag('key') ?? DEFAULT_KEY;
}

function gitText(args: string[]): string | null {
  const r = spawnSync('git', args, { cwd, encoding: 'utf-8' });
  return r.status === 0 ? r.stdout.trimEnd() : null;
}

function gitSnapshot(): { available: boolean; branch: string | null; dirtyFiles: string[] } {
  const branch = gitText(['branch', '--show-current']);
  const dirty = gitText(['status', '--short']);
  return {
    available: branch !== null || dirty !== null,
    branch: branch && branch.length > 0 ? branch : null,
    dirtyFiles: dirty ? dirty.split('\n').map((line) => line.trim()).filter(Boolean) : [],
  };
}

function latestRunSnapshot(): {
  id: string;
  status: string;
  lastStep: string | null;
  lastArtifact: string | null;
} | null {
  const ids = listRuns(cwd);
  if (ids.length === 0) return null;
  const run = readRun(cwd, ids[0]);
  const artifacts = listArtifacts(cwd, run.id);
  const lastRecorded = run.steps[run.steps.length - 1];
  const lastArtifact = artifacts[artifacts.length - 1];
  return {
    id: run.id,
    status: run.status,
    lastStep: lastRecorded?.step ?? lastArtifact?.step ?? null,
    lastArtifact: lastRecorded?.file ?? lastArtifact?.file ?? null,
  };
}

function renderDecisions(decisions: DecisionRecord[]): string[] {
  if (decisions.length === 0) return ['- none'];
  return decisions.flatMap((record) => [
    `- [${record.id}] ${record.decision}`,
    `  rationale: ${record.rationale}`,
    `  scope: ${record.scope}  source: ${record.source}  confidence: ${record.confidence}`,
  ]);
}

function renderWorkingContext(note: string): string {
  const now = new Date().toISOString();
  const git = gitSnapshot();
  const run = latestRunSnapshot();
  const decisions = activeDecisions(cwd);
  return [
    '# Working Context',
    '',
    `Saved at: ${now}`,
    '',
    '## Remaining Work',
    note,
    '',
    '## Git Snapshot',
    git.available ? `- branch: ${git.branch ?? '(detached or unknown)'}` : '- not a git repository',
    git.available
      ? git.dirtyFiles.length > 0
        ? `- dirty files:\n${git.dirtyFiles.map((line) => `  - ${line}`).join('\n')}`
        : '- dirty files: none'
      : '- dirty files: unavailable',
    '',
    '## Latest Run',
    run
      ? `- id: ${run.id}\n- status: ${run.status}\n- last step: ${run.lastStep ?? 'none'}\n- last artifact: ${run.lastArtifact ?? 'none'}`
      : '- none',
    '',
    '## Active Decisions (at save)',
    ...renderDecisions(decisions),
    '',
  ].join('\n');
}

function cmdSave(): void {
  const note = flag('note');
  if (!note) fail('--note is required');
  const saved = writeNote(cwd, 'session', keyArg(), renderWorkingContext(note));
  console.log(`context — saved session/${saved.key} (${saved.updated_at})`);
}

function cmdRestore(): void {
  const note = readNote(cwd, 'session', keyArg());
  const decisions = activeDecisions(cwd);
  const live = { git: gitSnapshot(), run: latestRunSnapshot() };
  if (has('json')) {
    console.log(JSON.stringify({ note, decisions, live }, null, 2));
    return;
  }
  if (!note) {
    console.log('No saved working context.');
    return;
  }
  const currentDecisions = [
    '',
    '## Active Decisions (current)',
    ...renderDecisions(decisions),
    '',
    '## Live Check',
    live.git.available ? `- branch now: ${live.git.branch ?? '(detached or unknown)'}` : '- not a git repository',
    live.run ? `- latest run now: ${live.run.id} (${live.run.status})` : '- latest run now: none',
    '',
  ].join('\n');
  process.stdout.write(`${note.body}${currentDecisions}`);
}

const sub = process.argv[2];
switch (sub) {
  case 'save':
    cmdSave();
    break;
  case 'restore':
    cmdRestore();
    break;
  default:
    console.log(
      'fac context — working-context checkpoint\n\n' +
        '  save --note TEXT [--key working-context]\n' +
        '  restore [--key working-context] [--json]',
    );
    process.exit(sub ? 1 : 0);
}