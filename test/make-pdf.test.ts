/**
 * Tier-1 — the `make-pdf` tool's pure core (tools/make-pdf/make-pdf.ts).
 *
 * Markdown-to-HTML and the print-ready wrapper are pure, so each construct gets both sides: the
 * input that must render a certain way, and the escaping/edge case that must not slip through. The
 * Playwright print path is exercised via an injected renderer so the seam contract is proven
 * without a browser.
 */
import { describe, expect, test, afterEach } from 'bun:test';

import {
  buildDocumentHtml,
  getPdfRenderer,
  markdownToHtml,
  renderMarkdown,
  type PdfRenderer,
} from '../tools/make-pdf/make-pdf.ts';

describe('renderMarkdown', () => {
  test('headings map to h1..h6', () => {
    expect(renderMarkdown('# Title')).toBe('<h1>Title</h1>');
    expect(renderMarkdown('### Sub')).toBe('<h3>Sub</h3>');
  });

  test('emphasis and inline code', () => {
    expect(renderMarkdown('a **bold** and *italic* and `code`')).toBe(
      '<p>a <strong>bold</strong> and <em>italic</em> and <code>code</code></p>',
    );
  });

  test('links render as anchors with escaped URLs', () => {
    expect(renderMarkdown('[docs](https://x.test/a)')).toBe(
      '<p><a href="https://x.test/a">docs</a></p>',
    );
  });

  test('unordered and ordered lists', () => {
    expect(renderMarkdown('- one\n- two')).toBe('<ul><li>one</li><li>two</li></ul>');
    expect(renderMarkdown('1. a\n2. b')).toBe('<ol><li>a</li><li>b</li></ol>');
  });

  test('fenced code blocks preserve content and language class', () => {
    const html = renderMarkdown('```ts\nconst x = 1 < 2;\n```');
    expect(html).toBe('<pre><code class="language-ts">const x = 1 &lt; 2;</code></pre>');
  });

  test('blockquote and horizontal rule', () => {
    expect(renderMarkdown('> quoted')).toBe('<blockquote><p>quoted</p></blockquote>');
    expect(renderMarkdown('---')).toBe('<hr>');
  });

  test('HTML in prose is escaped (negative: no raw tag survives)', () => {
    expect(renderMarkdown('a <script>alert(1)</script> b')).toBe(
      '<p>a &lt;script&gt;alert(1)&lt;/script&gt; b</p>',
    );
  });

  test('code spans are not further formatted (negative: ** inside code stays literal)', () => {
    expect(renderMarkdown('`a **b** c`')).toBe('<p><code>a **b** c</code></p>');
  });

  test('an injected markdown renderer overrides the built-in', () => {
    globalThis.__FACTORY_MARKDOWN_RENDERER__ = (md) => `<custom>${md}</custom>`;
    expect(renderMarkdown('# hi')).toBe('<custom># hi</custom>');
    delete globalThis.__FACTORY_MARKDOWN_RENDERER__;
  });
});

describe('buildDocumentHtml', () => {
  test('wraps the body and carries the print stylesheet and title', () => {
    const html = buildDocumentHtml('<h1>X</h1>', { title: 'Report' });
    expect(html).toContain('<h1>X</h1>');
    expect(html).toContain('<title>Report</title>');
    expect(html).toContain('@page { size: A4;');
  });

  test('escapes the title (negative: no raw markup in <title>)', () => {
    expect(buildDocumentHtml('', { title: '<x>' })).toContain('<title>&lt;x&gt;</title>');
  });

  test('appends caller CSS after the defaults', () => {
    expect(buildDocumentHtml('', { css: '.x{color:red}' })).toContain('.x{color:red}');
  });
});

describe('markdownToHtml', () => {
  test('composes render + wrap into one document', () => {
    const html = markdownToHtml('# Hello\n\nworld', { title: 'T' });
    expect(html).toContain('<h1>Hello</h1>');
    expect(html).toContain('<p>world</p>');
    expect(html).toContain('<title>T</title>');
  });
});

describe('getPdfRenderer seam', () => {
  afterEach(() => {
    delete globalThis.__FACTORY_PDF_RENDERER__;
  });

  test('returns the injected renderer when one is wired', async () => {
    const fake: PdfRenderer = () => new Uint8Array([37, 80, 68, 70]); // %PDF
    globalThis.__FACTORY_PDF_RENDERER__ = fake;
    const renderer = await getPdfRenderer();
    expect(Array.from(await renderer('<html></html>'))).toEqual([37, 80, 68, 70]);
  });

  test('an injected renderer receives the full HTML document', async () => {
    let seen = '';
    globalThis.__FACTORY_PDF_RENDERER__ = (html) => {
      seen = html;
      return new Uint8Array();
    };
    const renderer = await getPdfRenderer();
    await renderer('<html>doc</html>');
    expect(seen).toBe('<html>doc</html>');
  });
});
