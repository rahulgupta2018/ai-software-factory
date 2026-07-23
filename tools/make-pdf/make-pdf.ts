#!/usr/bin/env bun
/**
 * make-pdf — turn Markdown into a publication-ready HTML document, and (when a renderer is
 * available) a PDF. For specs, reports, and release notes from `/document` and the docs skills.
 *
 *   make-pdf html [--file x.md | --code "..." | -] --out x.html [--title T]
 *   make-pdf pdf  [...] --out x.pdf
 *
 * The Markdown-to-HTML step and the print-ready HTML wrapper are pure and deterministic, so they
 * run and are proven on every `bun test`. Turning HTML into PDF bytes needs a print engine, and the
 * Factory bundles none — so `make-pdf pdf` uses a renderer you inject
 * (`globalThis.__FACTORY_PDF_RENDERER__`) or falls back to Playwright's headless print when it is
 * installed. Same seam discipline as the diagram tool and the eval harness: heavy,
 * environment-specific machinery stays optional; the core stays testable offline.
 *
 * The built-in Markdown renderer covers the constructs docs actually use (headings, emphasis, code
 * spans and fences, links, ordered/unordered lists, blockquotes, rules, paragraphs). An operator
 * who wants a fuller CommonMark engine wires `globalThis.__FACTORY_MARKDOWN_RENDERER__`.
 */
import { readFileSync, writeFileSync } from 'node:fs';

/** Escape the five HTML-significant characters for safe embedding in text/attribute context. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Render inline spans (code, links, bold, italic) over already-block-split text. */
function renderInline(text: string): string {
  // Code spans first, on the raw text, so their contents are escaped but not further formatted.
  const codes: string[] = [];
  let out = text.replace(/`([^`]+)`/g, (_m, code: string) => {
    codes.push(`<code>${escapeHtml(code)}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });

  out = escapeHtml(out);

  // Links: [text](url). URL is escaped; text may carry other inline formatting applied below.
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) => {
    return `<a href="${escapeHtml(url)}">${label}</a>`;
  });

  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  out = out.replace(/(^|[^_])_([^_]+)_/g, '$1<em>$2</em>');

  // Restore code spans.
  out = out.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => codes[Number(i)]);
  return out;
}

/**
 * Render a Markdown subset to HTML. Deterministic and pure — the tested core. Handles ATX
 * headings, fenced code blocks, unordered/ordered lists, blockquotes, horizontal rules, and
 * paragraphs, with inline code/links/bold/italic.
 */
export function renderMarkdown(markdown: string): string {
  const injected = globalThis.__FACTORY_MARKDOWN_RENDERER__;
  if (typeof injected === 'function') return injected(markdown);

  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: string[] = [];
  let i = 0;

  const isBlank = (s: string) => s.trim().length === 0;

  while (i < lines.length) {
    const line = lines[i];

    if (isBlank(line)) {
      i++;
      continue;
    }

    // Fenced code block.
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      const lang = fence[1];
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++; // consume closing fence
      const cls = lang ? ` class="language-${lang}"` : '';
      blocks.push(`<pre><code${cls}>${escapeHtml(body.join('\n'))}</code></pre>`);
      continue;
    }

    // Heading.
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(`<h${level}>${renderInline(heading[2].trim())}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal rule.
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push('<hr>');
      i++;
      continue;
    }

    // Unordered list.
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(`<li>${renderInline(lines[i].replace(/^\s*[-*]\s+/, '').trim())}</li>`);
        i++;
      }
      blocks.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    // Ordered list.
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${renderInline(lines[i].replace(/^\s*\d+\.\s+/, '').trim())}</li>`);
        i++;
      }
      blocks.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    // Blockquote.
    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      blocks.push(`<blockquote><p>${renderInline(quote.join(' ').trim())}</p></blockquote>`);
      continue;
    }

    // Paragraph — gather until a blank line or a block-starting line.
    const para: string[] = [];
    while (
      i < lines.length &&
      !isBlank(lines[i]) &&
      !/^```|^#{1,6}\s|^(-{3,}|\*{3,}|_{3,})\s*$|^\s*[-*]\s+|^\s*\d+\.\s+|^\s*>\s?/.test(lines[i])
    ) {
      para.push(lines[i].trim());
      i++;
    }
    blocks.push(`<p>${renderInline(para.join(' '))}</p>`);
  }

  return blocks.join('\n');
}

export interface DocumentOptions {
  title?: string;
  /** Extra CSS appended after the default print stylesheet. */
  css?: string;
}

const PRINT_CSS = [
  '@page { size: A4; margin: 2cm; }',
  'body { font-family: Georgia, "Times New Roman", serif; line-height: 1.6; color: #1a1a1a; max-width: 46rem; margin: 0 auto; padding: 2rem; }',
  'h1,h2,h3,h4,h5,h6 { font-family: system-ui, sans-serif; line-height: 1.25; margin-top: 1.6em; }',
  'code { font-family: ui-monospace, "SF Mono", Menlo, monospace; background: #f4f4f5; padding: 0.15em 0.35em; border-radius: 3px; font-size: 0.9em; }',
  'pre { background: #f4f4f5; padding: 1rem; border-radius: 6px; overflow-x: auto; }',
  'pre code { background: none; padding: 0; }',
  'blockquote { border-left: 3px solid #d4d4d8; margin-left: 0; padding-left: 1rem; color: #52525b; }',
  'hr { border: none; border-top: 1px solid #e4e4e7; margin: 2rem 0; }',
  'a { color: #2563eb; }',
].join('\n');

/**
 * Wrap rendered HTML body into a self-contained, print-ready document. Deterministic — no I/O — so
 * it is unit-tested directly.
 */
export function buildDocumentHtml(bodyHtml: string, opts: DocumentOptions = {}): string {
  const title = escapeHtml(opts.title ?? 'Document');
  const css = opts.css ? `${PRINT_CSS}\n${opts.css}` : PRINT_CSS;
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${title}</title>`,
    `<style>\n${css}\n</style>`,
    '</head>',
    '<body>',
    bodyHtml,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

/** Convenience: Markdown source straight to a print-ready HTML document. */
export function markdownToHtml(markdown: string, opts: DocumentOptions = {}): string {
  return buildDocumentHtml(renderMarkdown(markdown), opts);
}

/** A PDF renderer turns a full HTML document into PDF bytes. Injected or provided by Playwright. */
export type PdfRenderer = (html: string) => Promise<Uint8Array> | Uint8Array;

declare global {
  // eslint-disable-next-line no-var
  var __FACTORY_MARKDOWN_RENDERER__: ((markdown: string) => string) | undefined;
  // eslint-disable-next-line no-var
  var __FACTORY_PDF_RENDERER__: PdfRenderer | undefined;
}

/**
 * Resolve a PDF renderer. An injected `globalThis.__FACTORY_PDF_RENDERER__` wins; otherwise
 * Playwright prints the HTML document headlessly. With neither available, throw — the Factory
 * bundles no print engine.
 */
export async function getPdfRenderer(): Promise<PdfRenderer> {
  if (typeof globalThis.__FACTORY_PDF_RENDERER__ === 'function') {
    return globalThis.__FACTORY_PDF_RENDERER__;
  }
  let chromium: typeof import('playwright').chromium | undefined;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    chromium = undefined;
  }
  if (!chromium) {
    throw new Error(
      'make-pdf: no PDF renderer configured — wire globalThis.__FACTORY_PDF_RENDERER__ or install playwright',
    );
  }
  return async (html: string) => {
    const browser = await chromium!.launch();
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle' });
      return await page.pdf({ format: 'A4', printBackground: true });
    } finally {
      await browser.close();
    }
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function flag(argv: string[], name: string): string | undefined {
  const idx = argv.indexOf(`--${name}`);
  return idx >= 0 ? argv[idx + 1] : undefined;
}

/** Read the Markdown source from --file, --code, or stdin (`-` or no source flag). */
function readSource(argv: string[]): string {
  const file = flag(argv, 'file');
  if (file) return readFileSync(file, 'utf-8');
  const code = flag(argv, 'code');
  if (code !== undefined) return code;
  return readFileSync(0, 'utf-8');
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const sub = argv[0];

  if (sub === 'html') {
    const html = markdownToHtml(readSource(argv), { title: flag(argv, 'title') });
    const out = flag(argv, 'out');
    if (out) {
      writeFileSync(out, html);
      console.error(`make-pdf — wrote ${out}`);
    } else {
      process.stdout.write(html);
    }
    process.exit(0);
  }

  if (sub === 'pdf') {
    const html = markdownToHtml(readSource(argv), { title: flag(argv, 'title') });
    const renderer = await getPdfRenderer();
    const bytes = await renderer(html);
    const out = flag(argv, 'out');
    if (!out) {
      console.error('make-pdf — pdf needs --out <file.pdf>');
      process.exit(2);
    }
    writeFileSync(out, bytes);
    console.error(`make-pdf — wrote ${out}`);
    process.exit(0);
  }

  console.log(
    'make-pdf — Markdown to publication HTML/PDF\n\n' +
      '  html [--file x.md | --code "..." | -] --out x.html [--title T]\n' +
      '  pdf  [...] --out x.pdf                 (needs a PDF renderer)\n\n' +
      'Source: --file, --code, or stdin.',
  );
  process.exit(sub ? 1 : 0);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(`make-pdf — ${(err as Error).message}`);
    process.exit(1);
  });
}
