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
};

export default claude;
