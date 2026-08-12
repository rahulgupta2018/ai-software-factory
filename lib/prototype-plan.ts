/**
 * Prototype-coverage verifier — the mechanical half of the UI-prototype lane `/prototype` owns.
 *
 * `/plan-design` writes the design record (`02a-plan-design.md`): a complete screen inventory, an
 * every-edge navigation graph, and a design-token system emitted as code. `/prototype` turns that
 * record into a clickable, self-contained HTML prototype (`02b-prototype/`) — one page per screen,
 * wired by the navigation graph, styled from the tokens VERBATIM. The failure mode is a prototype
 * that invents colours/spacing the spec never set, or drops a screen, or links to a route that
 * doesn't exist — the design-fidelity analogue of `/plan-design`'s AI-slop gate.
 *
 * This module owns the CHECK, not the render: given the design record's screens + navigation graph
 * + tokens and the generated prototype's pages, it decides whether the prototype fully COVERS the
 * design — every screen has a page, every `screen → action → screen` edge resolves to a working
 * in-prototype link that lands on an existing page, and no page uses a token absent from the record.
 *
 * Pure by design (no node imports beyond the shared frontmatter parser, no network, no clock) so
 * the whole policy is provable in `bun test` with a negative case per rule — the screen with no
 * page that must fail, the dangling navigation edge that must fail, the invented token that must
 * fail — all offline against a plain-data fixture. The manifest text is parsed here; the HTML is
 * rendered elsewhere (the `/prototype` skill), and the offline no-network render is proven by the
 * `browse` tool at skill runtime, not here.
 */
import { parseFrontmatter } from './frontmatter.ts';

/** A screen the design record's inventory declares. `id` is the coverage anchor; `title` is human. */
export interface Screen {
  id: string;
  title: string;
}

/** One `from-screen → action → to-screen` edge of the design record's navigation graph. */
export interface NavEdge {
  from: string;
  action: string;
  to: string;
}

/** One generated prototype page — a rendered screen, the links it exposes, the tokens it uses. */
export interface PrototypePage {
  /** The screen id this page renders. */
  screen: string;
  /** Screen ids this page links to (the `<a href>` targets wired from the navigation graph). */
  links: string[];
  /** Design-token names this page's styling uses — each must exist in the record (fidelity). */
  tokensUsed: string[];
}

/** A parsed prototype manifest: the design record's inputs plus the generated pages. */
export interface PrototypePlan {
  product: string;
  /** The design record's complete screen inventory (`02a-plan-design.md`). */
  screens: Screen[];
  /** The design record's every-edge navigation graph. */
  nav: NavEdge[];
  /** The design-token names the record emits as code (colour / space / type / radius). */
  tokens: string[];
  /** The generated prototype pages (`02b-prototype/`), one per rendered screen. */
  pages: PrototypePage[];
}

/** Why a prototype fails the coverage gate — drives the finding text `/prototype` shows. */
export type PrototypeRisk =
  | 'missing-page'
  | 'dangling-link'
  | 'invented-token'
  | 'orphan-page'
  | 'duplicate-screen'
  | 'duplicate-page';

/** One failed coverage rule. */
export interface PrototypeFinding {
  rule: string;
  risk: PrototypeRisk;
  detail: string;
}

/** Verdict for a prototype: whether it fully covers the design record. */
export interface PrototypeVerdict {
  pass: boolean;
  findings: PrototypeFinding[];
}

// ── Parsing ──────────────────────────────────────────────────────────────────

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function coerceScreen(raw: unknown): Screen {
  const s = (raw ?? {}) as Record<string, unknown>;
  return { id: asString(s.id), title: asString(s.title) };
}

function coerceEdge(raw: unknown): NavEdge {
  const e = (raw ?? {}) as Record<string, unknown>;
  return { from: asString(e.from), action: asString(e.action), to: asString(e.to) };
}

function coercePage(raw: unknown): PrototypePage {
  const p = (raw ?? {}) as Record<string, unknown>;
  return {
    screen: asString(p.screen),
    links: asStringArray(p.links),
    tokensUsed: asStringArray(p.tokens_used),
  };
}

/**
 * Parse a prototype manifest into a PrototypePlan. The frontmatter is the machine source of truth
 * (the same frontmatter-is-machine-readable pattern as PRD.md / stack.yaml / PLAN.md); the body is
 * prose the verifier ignores. Throws only when the frontmatter block itself is missing or malformed.
 */
export function parsePrototypePlan(text: string, label = 'prototype manifest'): PrototypePlan {
  const { data } = parseFrontmatter(text, label);
  return {
    product: asString(data.product),
    screens: Array.isArray(data.screens) ? data.screens.map(coerceScreen) : [],
    nav: Array.isArray(data.nav) ? data.nav.map(coerceEdge) : [],
    tokens: asStringArray(data.tokens),
    pages: Array.isArray(data.pages) ? data.pages.map(coercePage) : [],
  };
}

// ── Verification ─────────────────────────────────────────────────────────────

function duplicates<T>(values: readonly T[]): T[] {
  const seen = new Set<T>();
  const dupes = new Set<T>();
  for (const v of values) {
    if (seen.has(v)) dupes.add(v);
    seen.add(v);
  }
  return [...dupes];
}

/**
 * Verify a prototype fully covers the design record. Rules:
 *   - screen-coverage — every screen in the inventory has a rendered page.
 *   - link-coverage   — every navigation edge resolves: the `from` screen has a page whose links
 *                       include `to`, and `to` is a real screen with a page (no dangling routes).
 *   - token-fidelity  — every token a page uses exists in the design record (no invented tokens).
 *   - orphan-page     — every page renders a screen the inventory declares.
 *   - unique-screen   — screen ids are unique.
 *   - unique-page     — at most one page per screen.
 */
export function verifyPrototypePlan(plan: PrototypePlan): PrototypeVerdict {
  const findings: PrototypeFinding[] = [];

  const screenIds = new Set(plan.screens.map((s) => s.id).filter((id) => id.length > 0));
  const pageByScreen = new Map(plan.pages.map((p) => [p.screen, p]));
  const tokenSet = new Set(plan.tokens);

  // screen-coverage — a screen with no page fails.
  for (const screen of plan.screens) {
    if (!pageByScreen.has(screen.id)) {
      findings.push({
        rule: 'screen-coverage',
        risk: 'missing-page',
        detail: `screen '${screen.id || screen.title}' has no rendered prototype page`,
      });
    }
  }

  // orphan-page — a page for a screen the inventory never declared fails.
  for (const page of plan.pages) {
    if (!screenIds.has(page.screen)) {
      findings.push({
        rule: 'orphan-page',
        risk: 'orphan-page',
        detail: `prototype page '${page.screen}' renders a screen absent from the inventory`,
      });
    }
  }

  // link-coverage — every navigation edge must resolve to a working in-prototype link.
  for (const edge of plan.nav) {
    const fromPage = pageByScreen.get(edge.from);
    if (!fromPage) {
      // The missing `from` page is already reported by screen-coverage when `from` is a real
      // screen; only flag here when it isn't, so the edge itself is the failure.
      if (!screenIds.has(edge.from)) {
        findings.push({
          rule: 'link-coverage',
          risk: 'dangling-link',
          detail: `navigation edge '${edge.from} → ${edge.to}' starts from an unknown screen`,
        });
      }
      continue;
    }
    if (!screenIds.has(edge.to) || !pageByScreen.has(edge.to)) {
      findings.push({
        rule: 'link-coverage',
        risk: 'dangling-link',
        detail: `navigation edge '${edge.from} —${edge.action}→ ${edge.to}' lands on a screen with no page`,
      });
      continue;
    }
    if (!fromPage.links.includes(edge.to)) {
      findings.push({
        rule: 'link-coverage',
        risk: 'dangling-link',
        detail: `page '${edge.from}' is missing the link '${edge.action} → ${edge.to}' the navigation graph requires`,
      });
    }
  }

  // token-fidelity — a page using a token absent from the design record fails.
  for (const page of plan.pages) {
    for (const token of page.tokensUsed) {
      if (!tokenSet.has(token)) {
        findings.push({
          rule: 'token-fidelity',
          risk: 'invented-token',
          detail: `page '${page.screen}' uses token '${token}', which the design record never defined`,
        });
      }
    }
  }

  // unique-screen / unique-page — a repeated id makes coverage ambiguous.
  for (const id of duplicates(plan.screens.map((s) => s.id))) {
    findings.push({
      rule: 'unique-screen',
      risk: 'duplicate-screen',
      detail: `screen id '${id}' is repeated in the inventory`,
    });
  }
  for (const screen of duplicates(plan.pages.map((p) => p.screen))) {
    findings.push({
      rule: 'unique-page',
      risk: 'duplicate-page',
      detail: `screen '${screen}' has more than one prototype page`,
    });
  }

  return { pass: findings.length === 0, findings };
}

// ── Coverage summary ──────────────────────────────────────────────────────────

/** A compact coverage roll-up the skill can render for the operator. */
export interface PrototypeCoverage {
  screens: number;
  pages: number;
  edges: number;
  /** Screens with a rendered page. */
  coveredScreens: number;
  /** Navigation edges that resolve to a working in-prototype link. */
  resolvedEdges: number;
}

/** Roll up how much of the design record the prototype covers — the operator-facing dashboard. */
export function coverageSummary(plan: PrototypePlan): PrototypeCoverage {
  const pageByScreen = new Map(plan.pages.map((p) => [p.screen, p]));
  const screenIds = new Set(plan.screens.map((s) => s.id));
  const coveredScreens = plan.screens.filter((s) => pageByScreen.has(s.id)).length;
  const resolvedEdges = plan.nav.filter((e) => {
    const fromPage = pageByScreen.get(e.from);
    return Boolean(fromPage) && screenIds.has(e.to) && pageByScreen.has(e.to) && fromPage!.links.includes(e.to);
  }).length;
  return {
    screens: plan.screens.length,
    pages: plan.pages.length,
    edges: plan.nav.length,
    coveredScreens,
    resolvedEdges,
  };
}
