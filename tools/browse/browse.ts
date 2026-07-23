#!/usr/bin/env bun
/**
 * browse — a fast headless browser CLI for /qa, /canary, and design review.
 *
 * Two ways in:
 *   browse run [--file script.txt]      execute a newline-delimited command script against ONE
 *                                       live page (state persists across steps), or read stdin
 *   browse goto <url>                   one-shot: launch, navigate, snapshot, close
 *
 * Commands (one per line in a script):
 *   goto <url>              navigate (localhost-only unless --allow-external)
 *   click <selector>        click an element
 *   type <selector> <text>  type into an element (alias: fill)
 *   press <key>             press a key (e.g. Enter)
 *   wait <ms|selector>      wait for a duration or a selector
 *   snapshot [selector]     extract visible text (hidden stripped, wrapped as untrusted + scanned)
 *   screenshot <path>       save a PNG
 *   eval <js>               evaluate JS in the page, print the result
 *   title | url             print the page title / current URL
 *
 * Security: every navigation passes the origin gate (localhost-only by default); every snapshot
 * runs the pure content-security layers (hidden-strip, injection scan, canary envelope). See
 * tools/browse/security.ts. Kill switch: FACTORY_SECURITY_OFF=1.
 */
import { readFileSync } from 'node:fs';
import {
  STRIP_HIDDEN_JS,
  assertAllowedOrigin,
  combineVerdict,
  logAttempt,
  newCanary,
  scanForInjection,
  securityOff,
  wrapUntrusted,
} from './security.ts';

interface Options {
  allowExternal: boolean;
  headed: boolean;
}

interface Command {
  verb: string;
  arg1?: string;
  rest?: string;
}

/** Parse one script line into a command. Blank lines and `#` comments are skipped (return null). */
export function parseLine(line: string): Command | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const m = /^(\S+)(?:\s+(\S+))?(?:\s+([\s\S]*))?$/.exec(trimmed);
  if (!m) return null;
  return { verb: m[1].toLowerCase(), arg1: m[2], rest: m[3] };
}

/** Parse a whole script into commands. Exported for tests. */
export function parseScript(text: string): Command[] {
  return text
    .split('\n')
    .map(parseLine)
    .filter((c): c is Command => c !== null);
}

function fail(msg: string): never {
  console.error(`browse — ${msg}`);
  process.exit(1);
}

/** Render a snapshot through the security layers. Returns the text to print, or null if BLOCKed. */
export function secureSnapshot(rawText: string, origin: string): string | null {
  const canary = newCanary();
  if (securityOff()) return wrapUntrusted(rawText, canary);

  const scan = scanForInjection(rawText);
  const verdict = combineVerdict({ contentScore: scan.score });
  if (verdict.decision !== 'ALLOW') {
    logAttempt({ origin, score: scan.score, labels: scan.labels, decision: verdict.decision });
  }
  if (verdict.decision === 'BLOCK') {
    console.error(`browse — snapshot BLOCKED: ${verdict.reasons.join('; ')}`);
    return null;
  }
  const prefix =
    verdict.decision === 'WARN' ? `[security WARN: ${verdict.reasons.join('; ')}]\n` : '';
  return prefix + wrapUntrusted(rawText, canary);
}

async function loadChromium() {
  try {
    const pw = (await import('playwright')) as typeof import('playwright');
    return pw.chromium;
  } catch {
    fail(
      'playwright is not installed. Run:\n' +
        '  bun add playwright && bunx playwright install chromium',
    );
  }
}

async function execute(commands: Command[], opts: Options): Promise<number> {
  const chromium = await loadChromium();
  const browser = await chromium.launch({ headless: !opts.headed });
  const page = await browser.newPage();
  let exitCode = 0;

  try {
    for (const cmd of commands) {
      switch (cmd.verb) {
        case 'goto': {
          const url = cmd.arg1 ?? fail('goto needs a url');
          const gate = assertAllowedOrigin(url, opts.allowExternal);
          if (!gate.ok) fail(gate.reason ?? 'origin refused');
          await page.goto(url, { waitUntil: 'domcontentloaded' });
          console.log(`ok goto ${url}`);
          break;
        }
        case 'click':
          await page.click(cmd.arg1 ?? fail('click needs a selector'));
          console.log(`ok click ${cmd.arg1}`);
          break;
        case 'type':
        case 'fill':
          await page.fill(cmd.arg1 ?? fail('type needs a selector'), cmd.rest ?? '');
          console.log(`ok ${cmd.verb} ${cmd.arg1}`);
          break;
        case 'press':
          await page.keyboard.press(cmd.arg1 ?? fail('press needs a key'));
          console.log(`ok press ${cmd.arg1}`);
          break;
        case 'wait': {
          const a = cmd.arg1 ?? fail('wait needs ms or a selector');
          if (/^\d+$/.test(a)) await page.waitForTimeout(Number(a));
          else await page.waitForSelector(a);
          console.log(`ok wait ${a}`);
          break;
        }
        case 'snapshot': {
          const raw = cmd.arg1
            ? ((await page.locator(cmd.arg1).innerText()) ?? '')
            : ((await page.evaluate(STRIP_HIDDEN_JS)) as string);
          const out = secureSnapshot(String(raw), page.url());
          if (out === null) exitCode = 2;
          else console.log(out);
          break;
        }
        case 'screenshot':
          await page.screenshot({ path: cmd.arg1 ?? fail('screenshot needs a path'), fullPage: true });
          console.log(`ok screenshot ${cmd.arg1}`);
          break;
        case 'eval': {
          const js = cmd.rest ? `${cmd.arg1 ?? ''} ${cmd.rest}` : (cmd.arg1 ?? '');
          const result = await page.evaluate(js);
          console.log(JSON.stringify(result));
          break;
        }
        case 'title':
          console.log(await page.title());
          break;
        case 'url':
          console.log(page.url());
          break;
        default:
          fail(`unknown command: ${cmd.verb}`);
      }
    }
  } catch (err) {
    console.error(`browse — ${(err as Error).message}`);
    exitCode = 1;
  } finally {
    await browser.close();
  }
  return exitCode;
}

const HELP = `browse — headless browser CLI

  browse run [--file <script>]     run a command script (or read stdin)
  browse goto <url>                one-shot: launch → navigate → snapshot → close

Flags: --allow-external (permit non-localhost origins), --headed (show the browser).
Commands: goto, click, type/fill, press, wait, snapshot, screenshot, eval, title, url.`;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const opts: Options = {
    allowExternal: argv.includes('--allow-external'),
    headed: argv.includes('--headed'),
  };
  const positional = argv.filter((a) => !a.startsWith('--'));
  const sub = positional[0];

  if (!sub || sub === 'help' || argv.includes('--help')) {
    console.log(HELP);
    return;
  }

  let commands: Command[];
  if (sub === 'run') {
    const fileIdx = argv.indexOf('--file');
    const text =
      fileIdx >= 0 && argv[fileIdx + 1]
        ? readFileSync(argv[fileIdx + 1], 'utf-8')
        : readFileSync(0, 'utf-8');
    commands = parseScript(text);
  } else if (sub === 'goto') {
    const url = positional[1] ?? fail('goto needs a url');
    commands = [
      { verb: 'goto', arg1: url },
      { verb: 'snapshot' },
    ];
  } else {
    // Treat any other invocation as a single inline command: `browse click <sel>` etc.
    commands = parseScript(positional.join(' '));
  }

  const code = await execute(commands, opts);
  process.exit(code);
}

if (import.meta.main) await main();
