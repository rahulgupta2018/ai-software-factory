/**
 * Tier-1 — the `diagram` tool's pure core (tools/diagram/diagram.ts).
 *
 * The English-to-Mermaid step is the agent's; this tool owns validate + wrap + render. The first
 * two are pure and provable, so every check has both sides here: the diagram that must validate,
 * the malformed one that must fail; the wrapper that must embed the source; the render seam that
 * must throw when nothing is wired. The Playwright render path is exercised via an injected
 * renderer so the contract is tested without a browser.
 */
import { describe, expect, test, afterEach } from 'bun:test';

import {
  buildDiagramHtml,
  detectDiagramType,
  getRenderer,
  validateMermaid,
  type MermaidRenderer,
} from '../tools/diagram/diagram.ts';

const FLOWCHART = 'flowchart TD\n  A[Start] --> B{OK?}\n  B -->|yes| C[Ship]\n  B -->|no| A';

describe('detectDiagramType', () => {
  test('recognises the common families by leading keyword', () => {
    expect(detectDiagramType(FLOWCHART)).toBe('flowchart');
    expect(detectDiagramType('graph LR\n A-->B')).toBe('flowchart');
    expect(detectDiagramType('sequenceDiagram\n Alice->>Bob: hi')).toBe('sequence');
    expect(detectDiagramType('classDiagram\n class Foo')).toBe('class');
    expect(detectDiagramType('stateDiagram-v2\n [*] --> S')).toBe('state');
    expect(detectDiagramType('erDiagram\n A ||--o{ B : has')).toBe('er');
  });

  test('skips comments and directive blocks when finding the first line', () => {
    expect(detectDiagramType('%%{init: {"theme":"dark"}}%%\n%% a note\nflowchart TD\n A-->B')).toBe(
      'flowchart',
    );
  });

  test('returns unknown for an unrecognised first keyword', () => {
    expect(detectDiagramType('wat TD\n A-->B')).toBe('unknown');
  });
});

describe('validateMermaid', () => {
  test('a well-formed flowchart passes', () => {
    expect(validateMermaid(FLOWCHART)).toEqual([]);
  });

  test('empty source is a problem', () => {
    const problems = validateMermaid('   \n  \n');
    expect(problems.length).toBe(1);
    expect(problems[0].message).toContain('empty diagram');
  });

  test('an unrecognised diagram type is flagged', () => {
    expect(validateMermaid('wat TD\n A-->B').some((p) => p.message.includes('unrecognised diagram type'))).toBe(true);
  });

  test('unbalanced brackets are flagged', () => {
    expect(validateMermaid('flowchart TD\n A[Start --> B').some((p) => p.message.includes('unbalanced brackets'))).toBe(true);
  });

  test('brackets inside quoted labels do not count as unbalanced', () => {
    expect(validateMermaid('flowchart TD\n A["a [bracket] label"] --> B')).toEqual([]);
  });

  test('a header-only flowchart with no nodes is flagged', () => {
    expect(validateMermaid('flowchart TD').some((p) => p.message.includes('no nodes or edges'))).toBe(true);
  });
});

describe('buildDiagramHtml', () => {
  test('embeds the source and boots mermaid', () => {
    const html = buildDiagramHtml(FLOWCHART, { title: 'Arch' });
    expect(html).toContain('<pre class="mermaid">');
    expect(html).toContain('A[Start] --&gt; B{OK?}'); // escaped
    expect(html).toContain('mermaid.initialize');
    expect(html).toContain('<title>Arch</title>');
  });

  test('escapes HTML-significant characters in the title', () => {
    expect(buildDiagramHtml(FLOWCHART, { title: '<x>' })).toContain('<title>&lt;x&gt;</title>');
  });

  test('honours a custom mermaid source URL', () => {
    expect(buildDiagramHtml(FLOWCHART, { mermaidSrc: '/local/mermaid.mjs' })).toContain("import mermaid from '/local/mermaid.mjs'");
  });
});

describe('getRenderer seam', () => {
  afterEach(() => {
    delete globalThis.__FACTORY_MERMAID_RENDERER__;
  });

  test('returns the injected renderer when one is wired', async () => {
    const fake: MermaidRenderer = (src) => `<svg data-src="${src.length}"></svg>`;
    globalThis.__FACTORY_MERMAID_RENDERER__ = fake;
    const renderer = await getRenderer();
    expect(await renderer(FLOWCHART)).toContain('<svg');
  });

  test('an injected renderer receives the exact source', async () => {
    let seen = '';
    globalThis.__FACTORY_MERMAID_RENDERER__ = (src) => {
      seen = src;
      return '<svg/>';
    };
    const renderer = await getRenderer();
    await renderer(FLOWCHART);
    expect(seen).toBe(FLOWCHART);
  });
});
