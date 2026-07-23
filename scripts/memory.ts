/**
 * `fac memory` — CLI surface over the scoped note store (lib/memory.ts).
 *
 *   fac memory write --scope product|session --key NAME [--body TEXT | --body-file FILE]
 *   fac memory read --scope product|session --key NAME [--json]
 *   fac memory list --scope product|session
 *   fac memory delete --scope product|session --key NAME
 */
import { readFileSync } from 'node:fs';
import { deleteNote, listNotes, readNote, slugKey, writeNote, type MemoryScope } from '../lib/memory.ts';

const cwd = process.cwd();

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function has(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function fail(message: string): never {
  console.error(`memory — ${message}`);
  process.exit(1);
  throw new Error('unreachable');
}

function scopeArg(): MemoryScope {
  const scope = flag('scope');
  if (scope !== 'product' && scope !== 'session') fail('--scope must be product or session');
  return scope;
}

function keyArg(): string {
  const key = flag('key');
  if (!key) fail('--key is required');
  return key;
}

function bodyArg(): string {
  const inline = flag('body');
  if (inline !== undefined) return inline;
  const file = flag('body-file');
  return file ? readFileSync(file, 'utf-8') : readFileSync(0, 'utf-8');
}

function cmdWrite(): void {
  const note = writeNote(cwd, scopeArg(), keyArg(), bodyArg());
  console.log(`memory — wrote ${note.scope}/${note.key} (${note.updated_at})`);
}

function cmdRead(): void {
  const note = readNote(cwd, scopeArg(), keyArg());
  if (!note) fail('note not found');
  if (has('json')) {
    console.log(JSON.stringify(note, null, 2));
    return;
  }
  process.stdout.write(note.body);
}

function cmdList(): void {
  for (const key of listNotes(cwd, scopeArg())) console.log(key);
}

function cmdDelete(): void {
  const scope = scopeArg();
  const key = keyArg();
  const deleted = deleteNote(cwd, scope, key);
  if (!deleted) fail('note not found');
  console.log(`memory — deleted ${scope}/${slugKey(key)}`);
}

const sub = process.argv[2];
switch (sub) {
  case 'write':
    cmdWrite();
    break;
  case 'read':
    cmdRead();
    break;
  case 'list':
    cmdList();
    break;
  case 'delete':
    cmdDelete();
    break;
  default:
    console.log(
      'fac memory — scoped notes\n\n' +
        '  write --scope product|session --key NAME [--body TEXT | --body-file FILE]\n' +
        '  read --scope product|session --key NAME [--json]\n' +
        '  list --scope product|session\n' +
        '  delete --scope product|session --key NAME',
    );
    process.exit(sub ? 1 : 0);
}