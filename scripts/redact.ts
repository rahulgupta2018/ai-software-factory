/**
 * `fac redact` — egress guard for outbound text.
 *
 * Reads from `--from-file` or stdin, prints the cleaned text to stdout, prints the findings
 * summary to stderr, and exits 2 when a HIGH-tier secret blocked the send.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { redactForSink } from '../lib/redact.ts';

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function has(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function readInput(): string {
  const file = flag('from-file');
  return file ? readFileSync(file, 'utf-8') : readFileSync(0, 'utf-8');
}

const verdict = redactForSink(readInput());

if (flag('out-file')) writeFileSync(flag('out-file')!, verdict.clean);

if (has('json')) {
  console.log(JSON.stringify(verdict, null, 2));
  process.exit(verdict.blocked ? 2 : 0);
}

const counts = verdict.findings.reduce<Record<string, number>>((acc, finding) => {
  acc[finding.tier] = (acc[finding.tier] ?? 0) + 1;
  return acc;
}, {});
const parts = [
  counts.high ? `${counts.high} HIGH` : null,
  counts.medium ? `${counts.medium} MEDIUM` : null,
  counts.low ? `${counts.low} LOW` : null,
].filter(Boolean);
console.error(
  `redact — ${parts.length > 0 ? parts.join(', ') : 'no findings'}${verdict.blocked ? ' — BLOCKED' : ''}`,
);
for (const finding of verdict.findings) {
  console.error(`  - ${finding.tier}: ${finding.name}`);
}
process.stdout.write(verdict.clean);
process.exit(verdict.blocked ? 2 : 0);