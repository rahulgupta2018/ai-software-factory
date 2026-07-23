/**
 * Tier-1 — the `design` tool's pure core (tools/design/design.ts).
 *
 * The image API is an injected seam; everything else is pure and provable: request validation (a
 * negative case per field), base64 decode, path-traversal-safe basename slugging, and the
 * file-writing manifest exercised in a temp dir. The generator seam is tested via an injected
 * function, and — unlike diagram/make-pdf — the unconfigured case genuinely throws, so that is
 * tested too (there is no offline fallback for image synthesis).
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildImageRequest,
  decodeImage,
  getGenerator,
  slugifyBasename,
  writeImages,
  type ImageGenerator,
} from '../tools/design/design.ts';

describe('buildImageRequest', () => {
  test('applies defaults for a bare prompt', () => {
    const { request, problems } = buildImageRequest({ prompt: 'a login screen' });
    expect(problems).toEqual([]);
    expect(request).toEqual({ prompt: 'a login screen', size: '1024x1024', n: 1, format: 'png' });
  });

  test('accepts explicit valid options', () => {
    const { request } = buildImageRequest({ prompt: 'x', size: '1536x1024', n: 3, format: 'webp' });
    expect(request).toEqual({ prompt: 'x', size: '1536x1024', n: 3, format: 'webp' });
  });

  test('empty prompt is a problem', () => {
    const { request, problems } = buildImageRequest({ prompt: '   ' });
    expect(request).toBeNull();
    expect(problems.some((p) => p.field === 'prompt')).toBe(true);
  });

  test('bad size, out-of-range n, and bad format each report a problem', () => {
    const size = buildImageRequest({ prompt: 'x', size: '999x999' });
    expect(size.problems.some((p) => p.field === 'size')).toBe(true);

    const nHigh = buildImageRequest({ prompt: 'x', n: 11 });
    expect(nHigh.problems.some((p) => p.field === 'n')).toBe(true);

    const nFrac = buildImageRequest({ prompt: 'x', n: 1.5 });
    expect(nFrac.problems.some((p) => p.field === 'n')).toBe(true);

    const fmt = buildImageRequest({ prompt: 'x', format: 'gif' });
    expect(fmt.problems.some((p) => p.field === 'format')).toBe(true);
  });

  test('multiple bad fields accumulate multiple problems', () => {
    const { problems } = buildImageRequest({ prompt: '', size: 'nope', format: 'bmp' });
    expect(problems.length).toBe(3);
  });
});

describe('slugifyBasename', () => {
  test('slugs a readable name', () => {
    expect(slugifyBasename('Login Screen v2')).toBe('login-screen-v2');
  });

  test('path traversal cannot survive (negative)', () => {
    expect(slugifyBasename('../../etc/passwd')).toBe('etc-passwd');
    expect(slugifyBasename('a/b\\c')).toBe('a-b-c');
  });

  test('empty or symbol-only falls back to design', () => {
    expect(slugifyBasename('')).toBe('design');
    expect(slugifyBasename('///')).toBe('design');
  });
});

describe('decodeImage', () => {
  test('round-trips base64 back to the original bytes', () => {
    const original = new Uint8Array([137, 80, 78, 71, 0, 255]);
    const b64 = Buffer.from(original).toString('base64');
    expect(Array.from(decodeImage(b64))).toEqual(Array.from(original));
  });
});

describe('getGenerator seam', () => {
  afterEach(() => {
    delete globalThis.__FACTORY_IMAGE_GENERATOR__;
  });

  test('returns the injected generator and passes the request through', async () => {
    let seenPrompt = '';
    const fake: ImageGenerator = (req) => {
      seenPrompt = req.prompt;
      return [{ b64: Buffer.from('img').toString('base64') }];
    };
    globalThis.__FACTORY_IMAGE_GENERATOR__ = fake;
    const generator = getGenerator();
    const out = await generator({ prompt: 'hero', size: '1024x1024', n: 1, format: 'png' });
    expect(seenPrompt).toBe('hero');
    expect(out.length).toBe(1);
  });

  test('throws loudly when nothing is wired (negative)', () => {
    expect(() => getGenerator()).toThrow('no image generator configured');
  });
});

describe('writeImages', () => {
  let dir: string;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  test('a single image writes <base>.<ext> and decodes correctly', () => {
    dir = mkdtempSync(join(tmpdir(), 'design-'));
    const b64 = Buffer.from('PNGDATA').toString('base64');
    const written = writeImages([{ b64 }], { outDir: dir, basename: 'Hero', format: 'png' });
    expect(written.length).toBe(1);
    expect(written[0].path).toBe(join(dir, 'hero.png'));
    expect(readFileSync(written[0].path, 'utf-8')).toBe('PNGDATA');
  });

  test('multiple images are numbered', () => {
    dir = mkdtempSync(join(tmpdir(), 'design-'));
    const imgs = [
      { b64: Buffer.from('a').toString('base64') },
      { b64: Buffer.from('b').toString('base64') },
    ];
    const written = writeImages(imgs, { outDir: dir, basename: 'shot', format: 'webp' });
    expect(written.map((w) => w.path)).toEqual([
      join(dir, 'shot-1.webp'),
      join(dir, 'shot-2.webp'),
    ]);
  });
});
