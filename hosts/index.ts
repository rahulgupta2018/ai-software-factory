import type { HostConfig } from '../scripts/host-config.ts';
import { claude } from './claude.ts';
import { codex } from './codex.ts';

/** Registry of all supported hosts. Add a host by adding it here. */
export const hosts: HostConfig[] = [claude, codex];

export type HostName = (typeof hosts)[number]['name'];

export function getHost(name: string): HostConfig | undefined {
  return hosts.find((h) => h.name === name);
}
