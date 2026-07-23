/**
 * `fac decision` — CLI surface over the durable decision log (lib/decision.ts).
 *
 *   fac decision log --decision TEXT --rationale TEXT --scope repo|branch|run
 *                    --source user|skill|agent --confidence N [--supersedes ID]
 *   fac decision list [--scope repo|branch|run] [--query TEXT] [--recent N] [--all] [--json]
 *   fac decision redact --id ID
 *   fac decision compact
 */
import {
  compactDecisions,
  logDecision,
  redactDecision,
  searchDecisions,
  type DecisionScope,
  type DecisionSource,
} from '../lib/decision.ts';

const cwd = process.cwd();

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function has(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function fail(message: string): never {
  console.error(`decision — ${message}`);
  process.exit(1);
  throw new Error('unreachable');
}

function scopeArg(required = false): DecisionScope | undefined {
  const scope = flag('scope');
  if (scope === undefined) {
    if (required) fail('--scope is required');
    return undefined;
  }
  if (scope !== 'repo' && scope !== 'branch' && scope !== 'run') fail('--scope must be repo, branch, or run');
  return scope;
}

function sourceArg(): DecisionSource {
  const source = flag('source');
  if (source !== 'user' && source !== 'skill' && source !== 'agent') {
    fail('--source must be user, skill, or agent');
  }
  return source;
}

function cmdLog(): void {
  const decision = flag('decision');
  const rationale = flag('rationale');
  const confidence = Number(flag('confidence'));
  if (!decision) fail('--decision is required');
  if (!rationale) fail('--rationale is required');
  const record = logDecision(cwd, {
    decision,
    rationale,
    scope: scopeArg(true)!,
    source: sourceArg(),
    confidence,
    supersedes: flag('supersedes'),
  });
  console.log(`decision — logged ${record.id}`);
}

function cmdList(): void {
  const recentFlag = flag('recent');
  const parsedRecent = recentFlag !== undefined ? Number(recentFlag) : null;
  if (parsedRecent !== null && (!Number.isInteger(parsedRecent) || parsedRecent < 0)) {
    fail('--recent must be a non-negative integer');
  }
  const records = searchDecisions(cwd, {
    scope: scopeArg(false),
    query: flag('query'),
    recent: parsedRecent ?? undefined,
    includeInactive: has('all'),
  });
  if (has('json')) {
    console.log(JSON.stringify(records, null, 2));
    return;
  }
  for (const record of records) {
    console.log(
      `[${record.id}] ${record.decision}\n` +
        `  rationale: ${record.rationale}\n` +
        `  scope: ${record.scope}  source: ${record.source}  confidence: ${record.confidence}${record.redacted ? '  redacted: true' : ''}`,
    );
  }
}

function cmdRedact(): void {
  const id = flag('id');
  if (!id) fail('--id is required');
  if (!redactDecision(cwd, id)) fail(`decision ${id} not found`);
  console.log(`decision — redacted ${id}`);
}

function cmdCompact(): void {
  const kept = compactDecisions(cwd);
  console.log(`decision — compacted to ${kept.length} active record(s)`);
}

const sub = process.argv[2];
switch (sub) {
  case 'log':
    cmdLog();
    break;
  case 'list':
    cmdList();
    break;
  case 'redact':
    cmdRedact();
    break;
  case 'compact':
    cmdCompact();
    break;
  default:
    console.log(
      'fac decision — durable decision log\n\n' +
        '  log --decision TEXT --rationale TEXT --scope repo|branch|run\n' +
        '      --source user|skill|agent --confidence N [--supersedes ID]\n' +
        '  list [--scope repo|branch|run] [--query TEXT] [--recent N] [--all] [--json]\n' +
        '  redact --id ID\n' +
        '  compact',
    );
    process.exit(sub ? 1 : 0);
}