/**
 * `fac guard` — the mechanical safety check behind `/careful`, `/freeze`, and `/guard`.
 *
 * Two subcommands, both pure classifiers over the taxonomy in lib/guard.ts:
 *   fac guard cmd  "<shell command>"            classify a command as destructive
 *   fac guard edit "<path>" --boundary "<dir>"  check an edit target against a freeze boundary
 *
 * Exit codes: 0 = allowed (safe, or a whitelisted throwaway delete), 2 = blocked (destructive
 * command, or an edit outside the boundary). Skills run this before a risky action and surface the
 * verdict to the user; the human always gets the final call.
 */
import { classifyCommand, withinBoundary, type CommandVerdict } from '../lib/guard.ts';

const args = process.argv.slice(2);
const sub = args[0];

function flag(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

function has(name: string): boolean {
  return args.includes(`--${name}`);
}

/** Positional args (everything after the subcommand that is not a flag or a flag value). */
function positionals(): string[] {
  const out: string[] = [];
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      i++; // skip the flag's value
      continue;
    }
    out.push(arg);
  }
  return out;
}

function fail(message: string): never {
  console.error(`fac guard — ${message}`);
  process.exit(1);
}

if (sub === 'cmd') {
  const command = positionals().join(' ').trim();
  if (!command) fail('usage: fac guard cmd "<shell command>"');

  const verdict: CommandVerdict = classifyCommand(command);

  if (has('json')) {
    console.log(JSON.stringify(verdict, null, 2));
    process.exit(verdict.destructive ? 2 : 0);
  }

  if (verdict.destructive) {
    console.error(`guard — BLOCKED: ${verdict.matches.map((m) => `${m.name} (${m.risk})`).join(', ')}`);
    console.error('  This command is destructive. Confirm with the user before running it.');
    process.exit(2);
  }
  console.error(
    verdict.safeException
      ? 'guard — allowed (recursive delete of throwaway build/cache targets only)'
      : 'guard — allowed (no destructive pattern matched)',
  );
  process.exit(0);
} else if (sub === 'edit') {
  const path = positionals()[0];
  const boundary = flag('boundary');
  if (!path || !boundary) fail('usage: fac guard edit "<path>" --boundary "<dir>"');

  const inside = withinBoundary(path, boundary);

  if (has('json')) {
    console.log(JSON.stringify({ path, boundary, inside }, null, 2));
    process.exit(inside ? 0 : 2);
  }

  if (inside) {
    console.error(`guard — allowed (${path} is inside ${boundary})`);
    process.exit(0);
  }
  console.error(`guard — BLOCKED: ${path} is outside the freeze boundary ${boundary}`);
  process.exit(2);
} else {
  console.log(
    'fac guard — mechanical safety checks\n\n' +
      '  cmd  "<shell command>"            classify a command (exit 2 if destructive)\n' +
      '  edit "<path>" --boundary "<dir>"  check an edit target against a freeze boundary\n\n' +
      'Flags: --json',
  );
  process.exit(sub ? 1 : 0);
}
