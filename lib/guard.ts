/**
 * Guard — the mechanical half of the safety skills (`/careful`, `/freeze`, `/guard`).
 *
 * The Factory does not rely on host-specific hooks to enforce safety; it ships a small, pure
 * classifier that any skill (or CI step) can call and prove. `classifyCommand` decides whether a
 * shell command is destructive — a recursive delete, a data-dropping SQL statement, a history
 * rewrite — and `withinBoundary` decides whether an edit target sits inside an allowed directory.
 *
 * This is a guardrail, not airtight enforcement: it catches the accident and the careless paste
 * (the 99% case), not a determined operator (`sed`, a subshell, or an unrecognised alias can still
 * do damage). Calibration matters more than coverage — a gate that fires on `rm -rf node_modules`
 * gets muted, so the well-known throwaway targets are treated as safe exceptions.
 *
 * Pure by design (no node imports) so the whole taxonomy is provable in `bun test` with a negative
 * case per rule: the command that must block, the safe delete that must pass, the sibling dir that
 * must NOT count as inside the boundary.
 */

/** Why a command is dangerous — drives the warning text a skill shows. */
export type GuardRisk =
  | 'recursive-delete'
  | 'data-loss'
  | 'history-rewrite'
  | 'work-loss'
  | 'prod-impact'
  | 'container-loss';

/** One rule in the destructive-command taxonomy. */
export interface DestructivePattern {
  name: string;
  regex: RegExp;
  risk: GuardRisk;
  example: string;
}

/** A hit: which rule matched and the risk it carries. */
export interface CommandMatch {
  name: string;
  risk: GuardRisk;
}

/** Verdict for a command: whether it is destructive, whether it is a whitelisted throwaway. */
export interface CommandVerdict {
  destructive: boolean;
  safeException: boolean;
  matches: CommandMatch[];
}

/**
 * Recursive-delete targets that are safe to remove without a warning — build output and caches
 * that regenerate. A recursive `rm` whose targets are ALL in this set is a safe exception.
 */
export const SAFE_DELETE_TARGETS: readonly string[] = [
  'node_modules',
  'dist',
  'build',
  '.next',
  '.turbo',
  '.cache',
  'coverage',
  '__pycache__',
  '.pytest_cache',
];

/**
 * The taxonomy of destructive shapes, minus recursive `rm` (handled separately so its safe
 * exceptions can be reasoned about per-target). Every regex is case-insensitive.
 */
export const DESTRUCTIVE_PATTERNS: readonly DestructivePattern[] = [
  {
    name: 'sql-drop',
    regex: /\bDROP\s+(TABLE|DATABASE|SCHEMA|VIEW)\b/i,
    risk: 'data-loss',
    example: 'DROP TABLE users;',
  },
  {
    name: 'sql-truncate',
    regex: /\bTRUNCATE\s+(TABLE\s+)?\w/i,
    risk: 'data-loss',
    example: 'TRUNCATE orders;',
  },
  {
    name: 'sql-delete-unbounded',
    regex: /\bDELETE\s+FROM\s+\w+\s*(;|$)/i,
    risk: 'data-loss',
    example: 'DELETE FROM sessions;',
  },
  {
    name: 'git-force-push',
    regex: /\bgit\s+push\b[^\n]*\s(--force\b|--force-with-lease\b|-f\b)/i,
    risk: 'history-rewrite',
    example: 'git push -f origin main',
  },
  {
    name: 'git-reset-hard',
    regex: /\bgit\s+reset\b[^\n]*\s--hard\b/i,
    risk: 'work-loss',
    example: 'git reset --hard HEAD~3',
  },
  {
    name: 'git-clean-force',
    regex: /\bgit\s+clean\b[^\n]*\s-[a-z]*f/i,
    risk: 'work-loss',
    example: 'git clean -fd',
  },
  {
    name: 'git-checkout-all',
    regex: /\bgit\s+(checkout|restore)\s+\.\s*(;|&&|\||$)/i,
    risk: 'work-loss',
    example: 'git checkout .',
  },
  {
    name: 'kubectl-delete',
    regex: /\bkubectl\s+delete\b/i,
    risk: 'prod-impact',
    example: 'kubectl delete pod api-0',
  },
  {
    name: 'docker-force-rm',
    regex: /\bdocker\s+rm\b[^\n]*\s-[a-z]*f/i,
    risk: 'container-loss',
    example: 'docker rm -f api',
  },
  {
    name: 'docker-prune',
    regex: /\bdocker\s+system\s+prune\b/i,
    risk: 'container-loss',
    example: 'docker system prune -a',
  },
];

/** True when `token` is a whitelisted throwaway delete target (bare name or trailing-slash form). */
function isSafeTarget(token: string): boolean {
  const clean = token.replace(/^\.\//, '').replace(/\/+$/, '');
  return SAFE_DELETE_TARGETS.includes(clean);
}

/**
 * Pull the targets off a recursive `rm` invocation. Returns `null` when the command has no
 * recursive `rm` at all. Handles combined short flags (`-rf`, `-fr`) and long flags
 * (`--recursive --force`). Flags are dropped; everything else is treated as a target.
 */
function recursiveRmTargets(command: string): string[] | null {
  // Match an `rm` with a recursive flag, then capture the rest of that command segment.
  const rmMatch = command.match(
    /\brm\s+((?:-[a-z]*r[a-z]*|--recursive|--force|-[a-z]*f[a-z]*|-[a-z]+|--\w[\w-]*|\S)\s*)*/i,
  );
  if (!rmMatch) return null;

  const segment = rmMatch[0];
  const hasRecursive = /(^|\s)(-[a-z]*r[a-z]*|--recursive)/i.test(segment);
  if (!hasRecursive) return null;

  return segment
    .replace(/\brm\b/i, '')
    .split(/\s+/)
    .filter((t) => t.length > 0 && !t.startsWith('-'));
}

/**
 * Classify a shell command. Non-`rm` destructive shapes always mark the command destructive. A
 * recursive `rm` marks it destructive UNLESS every target is a whitelisted throwaway, in which
 * case `safeException` is true and `destructive` is false.
 */
export function classifyCommand(command: string): CommandVerdict {
  const matches: CommandMatch[] = [];

  for (const pattern of DESTRUCTIVE_PATTERNS) {
    if (pattern.regex.test(command)) matches.push({ name: pattern.name, risk: pattern.risk });
  }

  const rmTargets = recursiveRmTargets(command);
  let safeException = false;
  if (rmTargets !== null) {
    const allSafe = rmTargets.length > 0 && rmTargets.every(isSafeTarget);
    if (allSafe) {
      safeException = true;
    } else {
      matches.push({ name: 'rm-recursive', risk: 'recursive-delete' });
    }
  }

  return {
    destructive: matches.length > 0,
    safeException,
    matches,
  };
}

/** Collapse `.`/`..` segments and strip a trailing slash. Pure — no filesystem access. */
export function normalizePath(path: string): string {
  const absolute = path.startsWith('/');
  const out: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (out.length > 0 && out[out.length - 1] !== '..') out.pop();
      else if (!absolute) out.push('..');
      continue;
    }
    out.push(part);
  }
  const joined = out.join('/');
  return absolute ? `/${joined}` : joined;
}

/**
 * True when `filePath` sits inside (or is) `boundaryDir`. The trailing-slash discipline stops
 * `/src` from swallowing `/src-old`: an exact match counts, and a child must be preceded by `/`.
 */
export function withinBoundary(filePath: string, boundaryDir: string): boolean {
  const file = normalizePath(filePath);
  const boundary = normalizePath(boundaryDir);
  if (boundary === '') return true;
  return file === boundary || file.startsWith(`${boundary}/`);
}
