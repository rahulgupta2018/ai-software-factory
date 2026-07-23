import type { HostConfig } from '../scripts/host-config.ts';

/**
 * Claude Code host. The canonical generated skills/<name>/SKILL.md IS Claude's output,
 * so Claude keeps full frontmatter and needs no separate host subdir output.
 */
export const claude: HostConfig = {
  name: 'claude',
  displayName: 'Claude Code',
  cliCommand: 'claude',
  globalRoot: '.claude/skills/factory',
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
};

export default claude;
