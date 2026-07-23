#!/usr/bin/env bun
/**
 * diagram — turn Mermaid source into a checked, self-contained diagram for `/plan-arch` and docs.
 *
 * The English-to-Mermaid step is the agent's job (it writes the Mermaid); this tool owns the
 * mechanical half: validate the source, wrap it into a standalone HTML file that renders in any
 * browser, and — when a renderer is available — produce an SVG.
 *
 *   diagram check [--file f.mmd | --code "..." | -]     validate; exit 2 on problems
 *   diagram html  [...] --out file.html                 write a self-contained HTML wrapper
 *   diagram svg   [...] --out file.svg                   render to SVG (needs a renderer)
 *
 * The Factory ships no bundled Mermaid engine. `diagram svg` uses an injectable renderer
 * (`globalThis.__FACTORY_MERMAID_RENDERER__`) when wired, else Playwright + a Mermaid script when
 * available; with neither it fails loudly. The validate + HTML-assembly core is pure and fully
 * testable offline — the same seam discipline as the eval harness and the browser security layers.
 */
import { readFileSync, writeFileSync } from 'node:fs';

/** The Mermaid diagram families the validator recognises by leading keyword. */
export type DiagramType =
  | 'flowchart'
  | 'sequence'
  | 'class'
  | 'state'
  | 'er'
  | 'gantt'
  | 'pie'
  | 'gitgraph'
  | 'journey'
  | 'mindmap'
  | 'timeline'
  | 'quadrant'
  | 'unknown';

/** A validation finding: the 1-based line it was seen on (0 = whole document) and the message. */
export interface DiagramProblem {
  line: number;
  message: string;
}

/** Leading keyword → diagram type. Order matters only in that each key is matched as a prefix. */
const TYPE_KEYWORDS: ReadonlyArray<readonly [RegExp, DiagramType]> = [
  [/^(flowchart|graph)\b/i, 'flowchart'],
  [/^sequenceDiagram\b/i, 'sequence'],
  [/^classDiagram(-v2)?\b/i, 'class'],
  [/^stateDiagram(-v2)?\b/i, 'state'],
  [/^erDiagram\b/i, 'er'],
  [/^gantt\b/i, 'gantt'],
  [/^pie\b/i, 'pie'],
  [/^gitGraph\b/i, 'gitgraph'],
  [/^journey\b/i, 'journey'],
  [/^mindmap\b/i, 'mindmap'],
  [/^timeline\b/i, 'timeline'],
  [/^quadrantChart\b/i, 'quadrant'],
];

/** Strip comments (`%%`), directive blocks (`%%{...}%%`), and blank lines; keep 1-based line nums. */
function meaningfulLines(source: string): Array<{ n: number; text: string }> {
  return source
    .split('\n')
    .map((text, i) => ({ n: i + 1, text: text.trim() }))
    .filter((l) => l.text.length > 0 && !l.text.startsWith('%%'));
}

/** Detect the diagram family from the first meaningful line's leading keyword. */
export function detectDiagramType(source: string): DiagramType {
  const first = meaningfulLines(source)[0];
  if (!first) return 'unknown';
  for (const [regex, type] of TYPE_KEYWORDS) {
    if (regex.test(first.text)) return type;
  }
  return 'unknown';
}

/** Remove double- and single-quoted substrings so bracket counting ignores label text. */
function stripQuoted(text: string): string {
  return text.replace(/"[^"]*"/g, '').replace(/'[^']*'/g, '');
}

/**
 * Validate Mermaid source. This is a structural sanity check, not a full parser: it catches the
 * mistakes that make a diagram fail to render at all — an empty document, an unrecognised diagram
 * type, unbalanced brackets, and a flowchart with no nodes or edges. Returns a list of problems;
 * empty means it passed.
 */
export function validateMermaid(source: string): DiagramProblem[] {
  const problems: DiagramProblem[] = [];
  const lines = meaningfulLines(source);

  if (lines.length === 0) {
    problems.push({ line: 0, message: 'empty diagram — no Mermaid source' });
    return problems;
  }

  const type = detectDiagramType(source);
  if (type === 'unknown') {
    problems.push({
      line: lines[0].n,
      message: `unrecognised diagram type — first line "${lines[0].text}" starts no known Mermaid keyword`,
    });
  }

  // Bracket balance across the whole document, ignoring quoted label text.
  const pairs: ReadonlyArray<readonly [string, string]> = [
    ['[', ']'],
    ['(', ')'],
    ['{', '}'],
  ];
  const stripped = stripQuoted(source);
  for (const [open, close] of pairs) {
    const opens = stripped.split(open).length - 1;
    const closes = stripped.split(close).length - 1;
    if (opens !== closes) {
      problems.push({
        line: 0,
        message: `unbalanced brackets: ${opens} "${open}" vs ${closes} "${close}"`,
      });
    }
  }

  // A flowchart with only its header and no nodes/edges renders as nothing.
  if (type === 'flowchart' && lines.length === 1) {
    problems.push({ line: lines[0].n, message: 'flowchart has no nodes or edges' });
  }

  return problems;
}

/** Escape a string for safe embedding in HTML text/attribute context. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface HtmlOptions {
  title?: string;
  /** URL or path to the Mermaid ESM build. Defaults to the pinned jsDelivr CDN. */
  mermaidSrc?: string;
}

const DEFAULT_MERMAID_SRC = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

/**
 * Wrap Mermaid source into a self-contained HTML document that renders in any browser. The source
 * goes in a `<pre class="mermaid">` (Mermaid's auto-render target); the script boots Mermaid on
 * load. Deterministic — no I/O — so it is unit-tested directly.
 */
export function buildDiagramHtml(source: string, opts: HtmlOptions = {}): string {
  const title = escapeHtml(opts.title ?? 'Diagram');
  const mermaidSrc = opts.mermaidSrc ?? DEFAULT_MERMAID_SRC;
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${title}</title>`,
    '<style>body{margin:0;padding:2rem;font-family:system-ui,sans-serif}.mermaid{max-width:100%}</style>',
    '</head>',
    '<body>',
    `<pre class="mermaid">\n${escapeHtml(source.trim())}\n</pre>`,
    `<script type="module">`,
    `import mermaid from '${mermaidSrc}';`,
    `mermaid.initialize({ startOnLoad: true, theme: 'default' });`,
    `</script>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

/** A renderer turns Mermaid source into an SVG string. Injected or provided by Playwright. */
export type MermaidRenderer = (source: string) => Promise<string> | string;

declare global {
  // eslint-disable-next-line no-var
  var __FACTORY_MERMAID_RENDERER__: MermaidRenderer | undefined;
}

/**
 * Resolve an SVG renderer. An injected `globalThis.__FACTORY_MERMAID_RENDERER__` wins (operators
 * and tests wire one); otherwise Playwright drives a headless browser over the HTML wrapper. With
 * neither available, throw — the Factory bundles no Mermaid engine.
 */
export async function getRenderer(): Promise<MermaidRenderer> {
  if (typeof globalThis.__FACTORY_MERMAID_RENDERER__ === 'function') {
    return globalThis.__FACTORY_MERMAID_RENDERER__;
  }
  let chromium: typeof import('playwright').chromium | undefined;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    chromium = undefined;
  }
  if (!chromium) {
    throw new Error(
      'diagram: no SVG renderer configured — wire globalThis.__FACTORY_MERMAID_RENDERER__ or install playwright',
    );
  }
  return async (source: string) => {
    const browser = await chromium!.launch();
    try {
      const page = await browser.newPage();
      await page.setContent(buildDiagramHtml(source), { waitUntil: 'networkidle' });
      await page.waitForSelector('.mermaid svg', { timeout: 15_000 });
      const svg = await page.$eval('.mermaid svg', (el) => el.outerHTML);
      return svg;
    } finally {
      await browser.close();
    }
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

/** Read the Mermaid source from --file, --code, or stdin (`-` or no source flag). */
function readSource(argv: string[]): string {
  const file = flag(argv, 'file');
  if (file) return readFileSync(file, 'utf-8');
  const code = flag(argv, 'code');
  if (code !== undefined) return code;
  return readFileSync(0, 'utf-8');
}

function reportProblems(problems: DiagramProblem[]): void {
  for (const p of problems) {
    console.error(`  ${p.line > 0 ? `line ${p.line}: ` : ''}${p.message}`);
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const sub = argv[0];

  if (sub === 'check') {
    const source = readSource(argv);
    const problems = validateMermaid(source);
    if (problems.length > 0) {
      console.error(`diagram — INVALID (${detectDiagramType(source)}):`);
      reportProblems(problems);
      process.exit(2);
    }
    console.error(`diagram — valid (${detectDiagramType(source)})`);
    process.exit(0);
  }

  if (sub === 'html') {
    const source = readSource(argv);
    const problems = validateMermaid(source);
    if (problems.length > 0) {
      console.error('diagram — refusing to wrap invalid source:');
      reportProblems(problems);
      process.exit(2);
    }
    const html = buildDiagramHtml(source, { title: flag(argv, 'title') });
    const out = flag(argv, 'out');
    if (out) {
      writeFileSync(out, html);
      console.error(`diagram — wrote ${out}`);
    } else {
      process.stdout.write(html);
    }
    process.exit(0);
  }

  if (sub === 'svg') {
    const source = readSource(argv);
    const problems = validateMermaid(source);
    if (problems.length > 0) {
      console.error('diagram — refusing to render invalid source:');
      reportProblems(problems);
      process.exit(2);
    }
    const renderer = await getRenderer();
    const svg = await renderer(source);
    const out = flag(argv, 'out');
    if (out) {
      writeFileSync(out, svg);
      console.error(`diagram — wrote ${out}`);
    } else {
      process.stdout.write(svg);
    }
    process.exit(0);
  }

  console.log(
    'diagram — Mermaid validate + render\n\n' +
      '  check [--file f.mmd | --code "..." | -]     validate (exit 2 on problems)\n' +
      '  html  [...] --out file.html [--title T]     self-contained HTML wrapper\n' +
      '  svg   [...] --out file.svg                  render to SVG (needs a renderer)\n\n' +
      'Source: --file, --code, or stdin.',
  );
  process.exit(sub ? 1 : 0);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(`diagram — ${(err as Error).message}`);
    process.exit(1);
  });
}
