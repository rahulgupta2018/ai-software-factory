/**
 * Declarative host config system.
 *
 * Each supported host (Claude Code, Codex, ...) is a typed HostConfig in hosts/*.ts.
 * The generator (scripts/gen-skill-docs.ts) consumes these to transform frontmatter and
 * write host-specific SKILL.md outputs. Adding a host is a config file, never a skill change.
 */
import { omitKeys, pickKeys } from '../lib/frontmatter.ts';

export interface HostConfig {
  /** Unique host id; must match filename in hosts/. */
  name: string;
  /** Human-readable name for logs. */
  displayName: string;
  /** Binary name for `command -v` detection. */
  cliCommand: string;
  /** Global install path relative to $HOME (e.g. '.claude/skills/factory'). */
  globalRoot: string;
  /** Repo-local generated-output dir (git-ignored), e.g. '.claude'. */
  hostSubdir: string;
  /** Whether the canonical skills/<name>/SKILL.md IS this host's output (Claude). */
  canonical: boolean;

  frontmatter: {
    /** 'allowlist': only keepFields survive. 'denylist': strip stripFields. */
    mode: 'allowlist' | 'denylist';
    keepFields?: string[];
    stripFields?: string[];
    /** Extra frontmatter fields injected for every skill on this host. */
    extraFields?: Record<string, string>;
  };

  generation: {
    /** Emit a sidecar metadata file next to SKILL.md. */
    generateMetadata: boolean;
    /** Sidecar filename, e.g. 'openai.yaml'. */
    metadataFile?: string;
  };
}

/** Filter a parsed frontmatter mapping per this host's rules, preserving key order. */
export function applyFrontmatterMode(
  data: Record<string, unknown>,
  fm: HostConfig['frontmatter'],
): Record<string, unknown> {
  const filtered =
    fm.mode === 'allowlist'
      ? pickKeys(data, fm.keepFields ?? [])
      : omitKeys(data, fm.stripFields ?? []);
  return fm.extraFields ? { ...filtered, ...fm.extraFields } : filtered;
}
