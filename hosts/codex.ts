import type { HostConfig } from '../scripts/host-config.ts';

/**
 * Codex host. Codex prompts prefer a minimal frontmatter (name + description) and a sidecar
 * metadata file. Output is written under .codex/ (git-ignored) and symlinked by `setup`.
 */
export const codex: HostConfig = {
  name: 'codex',
  displayName: 'Codex',
  cliCommand: 'codex',
  globalRoot: '.codex/prompts/factory',
  hostSubdir: '.codex',
  canonical: false,
  frontmatter: {
    mode: 'allowlist',
    keepFields: ['name', 'description'],
  },
  generation: {
    generateMetadata: true,
    metadataFile: 'openai.yaml',
  },
  // Codex exposes no prompt-cache breakpoint primitive to the Factory — declare it unsupported so
  // the planner places no breakpoints rather than emitting markers the host would ignore.
  caching: {
    supported: false,
    maxBreakpoints: 0,
    minPrefixTokens: 0,
    ttl: '5m',
  },
};

export default codex;
