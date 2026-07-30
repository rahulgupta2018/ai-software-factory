import type { HostConfig } from '../scripts/host-config.ts';

/**
 * Claude Code host. The canonical generated skills/<name>/SKILL.md IS Claude's output,
 * so Claude keeps full frontmatter and needs no separate host subdir output.
 */
export const claude: HostConfig = {
  name: 'claude',
  displayName: 'Claude Code',
  cliCommand: 'claude',
  // Each skill installs at ~/.claude/skills/fac-<name>/ (depth 1, so Claude discovers it; prefixed
  // so it can't shadow a built-in command). The install layout lives in lib/install-plan.ts.
  globalRoot: '.claude/skills',
  hostSubdir: '.claude',
  canonical: true,
  frontmatter: {
    mode: 'denylist',
    // Claude reads name + description for activation; keep everything else too.
    stripFields: [],
  },
  generation: {
    generateMetadata: false,
  },
  // Claude supports prompt caching (ephemeral, up to 4 breakpoints). The interactive CLI caches
  // automatically; these options drive Factory-owned structured calls (eval model-judge,
  // /second-opinion) via lib/prompt-cache.ts. 1h TTL suits repeated runs within a working session.
  caching: {
    supported: true,
    maxBreakpoints: 4,
    minPrefixTokens: 1024,
    ttl: '1h',
  },
};

export default claude;
