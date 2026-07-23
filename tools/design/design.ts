#!/usr/bin/env bun
/**
 * design — generate UI mockups / images from a prompt, for design exploration in `/plan-design`
 * and `/design-review`.
 *
 *   design check    --prompt "..." [--size S] [--n N] [--format F]   validate the request only
 *   design generate --prompt "..." --out-dir DIR [--basename NAME] [--size S] [--n N] [--format F]
 *
 * The Factory bundles no image API client. Image generation is a pure injectable seam
 * (`globalThis.__FACTORY_IMAGE_GENERATOR__`); with nothing wired, `design generate` fails loudly —
 * there is no offline fallback for image synthesis the way there is a headless browser for
 * diagram/PDF. What IS pure and fully tested offline: request validation and normalisation,
 * base64 decoding, path-traversal-safe basename slugging, and the file-writing manifest. Same seam
 * discipline as the diagram and make-pdf tools.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Image dimensions the tool accepts (aligned with common image-generation APIs). */
export type ImageSize = '1024x1024' | '1024x1536' | '1536x1024' | 'auto';
export type ImageFormat = 'png' | 'jpeg' | 'webp';

const SIZES: readonly ImageSize[] = ['1024x1024', '1024x1536', '1536x1024', 'auto'];
const FORMATS: readonly ImageFormat[] = ['png', 'jpeg', 'webp'];

export interface ImageRequestInput {
  prompt?: string;
  size?: string;
  n?: number;
  format?: string;
}

export interface ImageRequest {
  prompt: string;
  size: ImageSize;
  n: number;
  format: ImageFormat;
}

export interface RequestProblem {
  field: string;
  message: string;
}

/**
 * Validate and normalise an image request. Deterministic and pure — the tested core. Returns the
 * normalised request when valid, or a list of problems (one per offending field) when not.
 */
export function buildImageRequest(input: ImageRequestInput): {
  request: ImageRequest | null;
  problems: RequestProblem[];
} {
  const problems: RequestProblem[] = [];

  const prompt = (input.prompt ?? '').trim();
  if (!prompt) problems.push({ field: 'prompt', message: 'prompt is required' });

  const size = (input.size ?? '1024x1024') as ImageSize;
  if (!SIZES.includes(size)) {
    problems.push({ field: 'size', message: `size must be one of: ${SIZES.join(', ')}` });
  }

  const n = input.n ?? 1;
  if (!Number.isInteger(n) || n < 1 || n > 10) {
    problems.push({ field: 'n', message: 'n must be an integer between 1 and 10' });
  }

  const format = (input.format ?? 'png') as ImageFormat;
  if (!FORMATS.includes(format)) {
    problems.push({ field: 'format', message: `format must be one of: ${FORMATS.join(', ')}` });
  }

  if (problems.length > 0) return { request: null, problems };
  return { request: { prompt, size, n, format }, problems: [] };
}

/** A single generated image, as base64-encoded bytes (the shape image APIs return). */
export interface GeneratedImage {
  b64: string;
}

/** An image generator turns a request into one or more images. Injected — never bundled. */
export type ImageGenerator = (req: ImageRequest) => Promise<GeneratedImage[]> | GeneratedImage[];

declare global {
  // eslint-disable-next-line no-var
  var __FACTORY_IMAGE_GENERATOR__: ImageGenerator | undefined;
}

/**
 * Resolve the image generator. An injected `globalThis.__FACTORY_IMAGE_GENERATOR__` is the only
 * source — the Factory bundles no image API client and there is no offline fallback, so this
 * throws when nothing is wired.
 */
export function getGenerator(): ImageGenerator {
  const injected = globalThis.__FACTORY_IMAGE_GENERATOR__;
  if (typeof injected === 'function') return injected;
  throw new Error(
    'design: no image generator configured — wire globalThis.__FACTORY_IMAGE_GENERATOR__ (the Factory bundles no image API client)',
  );
}

/** Decode base64 image data to raw bytes. Pure. */
export function decodeImage(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

/**
 * Slug a caller-supplied basename to a safe filename stem: lowercase, non-alphanumerics collapse
 * to `-`, path separators and `..` cannot survive. Empty input falls back to `design`. Pure.
 */
export function slugifyBasename(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'design';
}

export interface WrittenImage {
  path: string;
  bytes: number;
}

/**
 * Write generated images to `outDir`, returning a manifest. A single image is `<base>.<ext>`;
 * multiple are `<base>-1.<ext>`, `<base>-2.<ext>`, .... The basename is slugged so it cannot escape
 * `outDir`.
 */
export function writeImages(
  images: GeneratedImage[],
  opts: { outDir: string; basename?: string; format?: ImageFormat },
): WrittenImage[] {
  mkdirSync(opts.outDir, { recursive: true });
  const base = slugifyBasename(opts.basename ?? 'design');
  const ext = opts.format ?? 'png';
  return images.map((img, i) => {
    const name = images.length === 1 ? `${base}.${ext}` : `${base}-${i + 1}.${ext}`;
    const path = join(opts.outDir, name);
    const bytes = decodeImage(img.b64);
    writeFileSync(path, bytes);
    return { path, bytes: bytes.length };
  });
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function flag(argv: string[], name: string): string | undefined {
  const idx = argv.indexOf(`--${name}`);
  return idx >= 0 ? argv[idx + 1] : undefined;
}

function reportProblems(problems: RequestProblem[]): void {
  for (const p of problems) console.error(`  ${p.field}: ${p.message}`);
}

function requestFromFlags(argv: string[]): ImageRequestInput {
  const nRaw = flag(argv, 'n');
  return {
    prompt: flag(argv, 'prompt'),
    size: flag(argv, 'size'),
    n: nRaw !== undefined ? Number(nRaw) : undefined,
    format: flag(argv, 'format'),
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const sub = argv[0];

  if (sub === 'check') {
    const { request, problems } = buildImageRequest(requestFromFlags(argv));
    if (problems.length > 0) {
      console.error('design — invalid request:');
      reportProblems(problems);
      process.exit(2);
    }
    console.error(`design — valid request (${request!.n}x ${request!.size} ${request!.format})`);
    process.exit(0);
  }

  if (sub === 'generate') {
    const { request, problems } = buildImageRequest(requestFromFlags(argv));
    if (problems.length > 0) {
      console.error('design — invalid request:');
      reportProblems(problems);
      process.exit(2);
    }
    const outDir = flag(argv, 'out-dir');
    if (!outDir) {
      console.error('design — generate needs --out-dir <dir>');
      process.exit(2);
    }
    const generator = getGenerator();
    const images = await generator(request!);
    const written = writeImages(images, {
      outDir,
      basename: flag(argv, 'basename'),
      format: request!.format,
    });
    for (const w of written) console.error(`design — wrote ${w.path} (${w.bytes} bytes)`);
    process.stdout.write(`${JSON.stringify(written, null, 2)}\n`);
    process.exit(0);
  }

  console.log(
    'design — generate UI mockups/images from a prompt\n\n' +
      '  check    --prompt "..." [--size S] [--n N] [--format F]\n' +
      '  generate --prompt "..." --out-dir DIR [--basename NAME] [--size S] [--n N] [--format F]\n\n' +
      `  size: ${SIZES.join(' | ')}   format: ${FORMATS.join(' | ')}   n: 1..10\n\n` +
      'Needs an image generator wired via __FACTORY_IMAGE_GENERATOR__.',
  );
  process.exit(sub ? 1 : 0);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(`design — ${(err as Error).message}`);
    process.exit(1);
  });
}
