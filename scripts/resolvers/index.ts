import { resolveEthos } from './ethos.ts';
import { resolveConfigProtocol } from './config.ts';

/**
 * Renders the shared preamble injected into every generated skill: ethos, writing style, and
 * the config protocol. This is the "fusion point" — the gstack-style consistent shell that
 * wraps every Factory workflow skill.
 */
export function resolvePreamble(): string {
  const writingStyle = [
    '<!-- FACTORY:WRITING-STYLE (generated — do not edit) -->',
    '### Writing style',
    '',
    '- Gloss jargon on first use. Short sentences. Lead with user impact.',
    '- Frame questions in outcome terms ("what breaks for your users if…"), not implementation terms.',
    '- Be direct about quality and trade-offs. Cite sources for factual claims.',
  ].join('\n');

  return [resolveEthos(), '', writingStyle, '', resolveConfigProtocol()].join('\n');
}

/**
 * Placeholder → resolver map. gen-skill-docs replaces each `{{TOKEN}}` in a .tmpl body.
 */
export const RESOLVERS: Record<string, () => string> = {
  PREAMBLE: resolvePreamble,
  ETHOS: resolveEthos,
  CONFIG_PROTOCOL: resolveConfigProtocol,
};

/** Replace all known `{{TOKEN}}` placeholders in a template body. */
export function resolvePlaceholders(body: string): string {
  return body.replace(/\{\{([A-Z_]+)\}\}/g, (match, token: string) => {
    const resolver = RESOLVERS[token];
    return resolver ? resolver() : match;
  });
}
