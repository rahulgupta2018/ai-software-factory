/**
 * Redaction guard — the egress gate every external sink funnels through.
 *
 * Before decision-log text, a saved memory note, a `/second-opinion` dispatch, or any other string
 * that leaves the Factory is written or sent, it is scanned for credentials and PII. This is a
 * guardrail, not airtight enforcement: it catches accidents and carelessness (the 99% case), not a
 * determined leaker. Calibration matters more than coverage — a gate that cries wolf gets ignored,
 * so genuinely-secret credential shapes block (HIGH), high-false-positive shapes and PII confirm
 * (MEDIUM), and informational shapes are FYI (LOW).
 *
 * The taxonomy is the single source of truth (`PATTERNS`); every consumer reads tiers from it.
 */

export type RedactTier = 'high' | 'medium' | 'low';

/** One rule in the taxonomy. `regex` must carry the global flag so every occurrence is found. */
export interface RedactPattern {
  name: string;
  tier: RedactTier;
  regex: RegExp;
  note: string;
}

/** A single hit: which pattern matched, the matched text, and where it started. */
export interface Finding {
  name: string;
  tier: RedactTier;
  match: string;
  index: number;
}

/** Verdict for a sink: the redacted text, the findings, the highest tier, and whether to block. */
export interface SinkVerdict {
  clean: string;
  findings: Finding[];
  tier: RedactTier | null;
  blocked: boolean;
}

/**
 * The taxonomy. HIGH = genuinely-secret credentials (block on write). MEDIUM = PII plus
 * high-false-positive credential shapes that a human should confirm. LOW = informational.
 */
export const PATTERNS: RedactPattern[] = [
  // ── HIGH — genuinely-secret credentials ──────────────────────────────────
  {
    name: 'pem-private-key',
    tier: 'high',
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g,
    note: 'A PEM private key block.',
  },
  {
    name: 'aws-access-key-id',
    tier: 'high',
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
    note: 'An AWS access key id.',
  },
  {
    name: 'github-token',
    tier: 'high',
    regex: /\bgh[posru]_[A-Za-z0-9]{36}\b/g,
    note: 'A GitHub personal-access / OAuth / server token.',
  },
  {
    name: 'slack-token',
    tier: 'high',
    regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
    note: 'A Slack API token.',
  },
  // ── MEDIUM — PII + high-false-positive credential shapes (confirm) ────────
  {
    name: 'env-secret-assignment',
    tier: 'medium',
    regex: /\b[A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|PWD)\b\s*[:=]\s*['"]?[^\s'"]{6,}/g,
    note: 'An environment-style secret assignment (KEY=..., TOKEN: ...).',
  },
  {
    name: 'stripe-live-key',
    tier: 'medium',
    regex: /\b[ps]k_live_[A-Za-z0-9]{16,}\b/g,
    note: 'A Stripe live key (context-dependent — often quoted in docs).',
  },
  {
    name: 'google-api-key',
    tier: 'medium',
    regex: /\bAIza[0-9A-Za-z_-]{35}\b/g,
    note: 'A Google API key shape.',
  },
  {
    name: 'jwt',
    tier: 'medium',
    regex: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    note: 'A JSON Web Token (three base64url segments).',
  },
  {
    name: 'bearer-token',
    tier: 'medium',
    regex: /\bBearer\s+[A-Za-z0-9._-]{16,}/g,
    note: 'An Authorization: Bearer credential.',
  },
  {
    name: 'email',
    tier: 'medium',
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    note: 'An email address (PII).',
  },
  // ── LOW — informational ──────────────────────────────────────────────────
  {
    name: 'private-ip',
    tier: 'low',
    regex: /\b(?:10|127|192\.168|172\.(?:1[6-9]|2\d|3[01]))(?:\.\d{1,3}){1,3}\b/g,
    note: 'A private / loopback IPv4 address.',
  },
];

const TIER_RANK: Record<RedactTier, number> = { low: 1, medium: 2, high: 3 };

/** Scan text against the full taxonomy. Returns every finding, in discovery order. */
export function scan(text: string): Finding[] {
  const findings: Finding[] = [];
  for (const pattern of PATTERNS) {
    // Clone so a shared lastIndex from a prior scan can never skip a match.
    const re = new RegExp(pattern.regex.source, pattern.regex.flags);
    for (const m of text.matchAll(re)) {
      findings.push({ name: pattern.name, tier: pattern.tier, match: m[0], index: m.index ?? 0 });
    }
  }
  return findings;
}

/** The most severe tier among findings, or null when there are none. */
export function highestTier(findings: Finding[]): RedactTier | null {
  let best: RedactTier | null = null;
  for (const f of findings) {
    if (best === null || TIER_RANK[f.tier] > TIER_RANK[best]) best = f.tier;
  }
  return best;
}

/**
 * Replace every finding's matched text with a `[redacted:<name>]` token. Longer matches are
 * replaced first so a shorter secret nested inside a longer one can't corrupt the span.
 */
export function applyRedactions(text: string, findings: Finding[] = scan(text)): string {
  const byLength = [...findings].sort((a, b) => b.match.length - a.match.length);
  let clean = text;
  for (const f of byLength) {
    if (!f.match) continue;
    clean = clean.split(f.match).join(`[redacted:${f.name}]`);
  }
  return clean;
}

/** True when text carries at least one HIGH-tier secret. Used to block secret writes at source. */
export function containsHighSecret(text: string): boolean {
  return scan(text).some((f) => f.tier === 'high');
}

/**
 * Full sink verdict: scan, redact, and decide. `blocked` is true iff a HIGH secret is present —
 * the caller must refuse to send/write. MEDIUM and LOW are reported for the caller to confirm.
 */
export function redactForSink(text: string): SinkVerdict {
  const findings = scan(text);
  const tier = highestTier(findings);
  return { clean: applyRedactions(text, findings), findings, tier, blocked: tier === 'high' };
}
