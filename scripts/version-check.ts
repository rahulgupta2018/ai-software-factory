/**
 * version-check — assert the two release-version sources agree, so they can't silently drift.
 *
 * `VERSION` is the 4-part monotonic release id (gstack-style); `package.json` carries the first
 * three segments as semver. They drifted once — VERSION `0.25.0.0` against package.json `0.2.0`,
 * which quietly undermines the release discipline in the plan §8. This makes that drift a build
 * failure instead of something you notice five releases later.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');

/** The semver package.json should carry: the first three segments of the 4-part VERSION. */
export function semverFromVersionFile(fourPart: string): string {
  return fourPart.trim().split('.').slice(0, 3).join('.');
}

/** Returns a problem message when the two disagree, or null when they match. Pure — for tests. */
export function checkVersions(versionFile: string, pkgVersion: string): string | null {
  const expected = semverFromVersionFile(versionFile);
  return pkgVersion === expected
    ? null
    : `package.json version ${pkgVersion} != VERSION ${versionFile.trim()} (expected ${expected})`;
}

function main(): void {
  const versionFile = readFileSync(join(ROOT, 'VERSION'), 'utf-8');
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8')) as { version: string };
  const problem = checkVersions(versionFile, pkg.version);
  if (problem) {
    console.error(`version:check — ${problem}\nBump both, or run \`bun run version:check\` after editing VERSION.`);
    process.exit(1);
  }
  console.log(`version:check — VERSION and package.json agree (${pkg.version}).`);
}

if (import.meta.main) main();
