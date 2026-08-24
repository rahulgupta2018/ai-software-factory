/**
 * Tier-1 — the prototype-coverage verifier (lib/prototype-plan.ts) behind the `/prototype` gate.
 *
 * A gate nobody watched fail is not a gate, so every rule has both sides: the fully-covering
 * prototype that MUST pass and the specific defect (a screen with no page, a dangling navigation
 * edge, an invented token, an orphan page, a duplicate screen or page) that MUST fail. Pure
 * functions, no clock, no network — the whole coverage policy is provable here, offline, against a
 * plain-data fixture. The committed reference manifest is parsed and verified too, so the fixture
 * can't drift silent.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

import {
  parsePrototypePlan,
  verifyPrototypePlan,
  coverageSummary,
  type PrototypePlan,
  type PrototypePage,
} from '../lib/prototype-plan.ts';

const REFERENCE_MANIFEST = new URL('./fixtures/prototype-manifest.md', import.meta.url).pathname;

function page(overrides: Partial<PrototypePage> = {}): PrototypePage {
  return { screen: 'home', links: [], tokensUsed: ['color-bg'], ...overrides };
}

/** A fully-covering prototype — the baseline every negative case perturbs by one field. */
function healthyPlan(overrides: Partial<PrototypePlan> = {}): PrototypePlan {
  return {
    product: 'Test Product',
    screens: [
      { id: 'home', title: 'Home' },
      { id: 'detail', title: 'Detail' },
    ],
    tokens: ['color-bg', 'color-accent', 'type-body'],
    nav: [{ from: 'home', action: 'Open', to: 'detail' }],
    pages: [
      page({ screen: 'home', links: ['detail'], tokensUsed: ['color-bg', 'type-body'] }),
      page({ screen: 'detail', links: [], tokensUsed: ['color-accent'] }),
    ],
    ...overrides,
  };
}

describe('verifyPrototypePlan — a fully-covering prototype passes', () => {
  test('every screen has a page, every edge resolves, no invented token → pass', () => {
    const v = verifyPrototypePlan(healthyPlan());
    expect(v.pass).toBe(true);
    expect(v.findings).toEqual([]);
  });

  test('a prototype with no navigation edges still passes when every screen is rendered', () => {
    const plan = healthyPlan({
      nav: [],
      pages: [
        page({ screen: 'home', links: [], tokensUsed: ['color-bg'] }),
        page({ screen: 'detail', links: [], tokensUsed: ['color-accent'] }),
      ],
    });
    expect(verifyPrototypePlan(plan).pass).toBe(true);
  });
});

describe('verifyPrototypePlan — each rule has a negative case that fails', () => {
  test('a screen with no rendered page fails (missing-page)', () => {
    const plan = healthyPlan({
      pages: [page({ screen: 'home', links: ['detail'], tokensUsed: ['color-bg'] })], // 'detail' has no page
    });
    const v = verifyPrototypePlan(plan);
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.risk === 'missing-page')).toBe(true);
  });

  test('a navigation edge landing on a screen with no page fails (dangling-link)', () => {
    const plan = healthyPlan({
      screens: [
        { id: 'home', title: 'Home' },
        { id: 'detail', title: 'Detail' },
        { id: 'ghost', title: 'Ghost' },
      ],
      nav: [
        { from: 'home', action: 'Open', to: 'detail' },
        { from: 'home', action: 'Vanish', to: 'ghost' }, // ghost has no page
      ],
      pages: [
        page({ screen: 'home', links: ['detail', 'ghost'], tokensUsed: ['color-bg'] }),
        page({ screen: 'detail', links: [], tokensUsed: ['color-accent'] }),
        // 'ghost' deliberately absent
      ],
    });
    const v = verifyPrototypePlan(plan);
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.risk === 'dangling-link')).toBe(true);
  });

  test('a navigation edge whose link the page never wires fails (dangling-link)', () => {
    const plan = healthyPlan({
      pages: [
        page({ screen: 'home', links: [], tokensUsed: ['color-bg'] }), // missing the link to 'detail'
        page({ screen: 'detail', links: [], tokensUsed: ['color-accent'] }),
      ],
    });
    const v = verifyPrototypePlan(plan);
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.risk === 'dangling-link')).toBe(true);
  });

  test('a page using a token absent from the design record fails (invented-token)', () => {
    const plan = healthyPlan({
      pages: [
        page({ screen: 'home', links: ['detail'], tokensUsed: ['color-bg', 'color-neon'] }), // invented
        page({ screen: 'detail', links: [], tokensUsed: ['color-accent'] }),
      ],
    });
    const v = verifyPrototypePlan(plan);
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.risk === 'invented-token')).toBe(true);
  });

  test('a page rendering a screen absent from the inventory fails (orphan-page)', () => {
    const plan = healthyPlan({
      pages: [
        page({ screen: 'home', links: ['detail'], tokensUsed: ['color-bg'] }),
        page({ screen: 'detail', links: [], tokensUsed: ['color-accent'] }),
        page({ screen: 'stowaway', links: [], tokensUsed: ['color-bg'] }), // not in the inventory
      ],
    });
    const v = verifyPrototypePlan(plan);
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.risk === 'orphan-page')).toBe(true);
  });

  test('a screen with a blank id fails (blank-id) and is not also double-reported as missing-page', () => {
    const plan = healthyPlan({
      screens: [
        { id: '', title: 'Nameless' },
        { id: 'detail', title: 'Detail' },
      ],
      nav: [],
      pages: [page({ screen: 'detail', links: [], tokensUsed: ['color-accent'] })],
    });
    const v = verifyPrototypePlan(plan);
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.risk === 'blank-id')).toBe(true);
    expect(v.findings.some((f) => f.risk === 'missing-page')).toBe(false); // the blank screen is not also a missing-page
  });

  test('a page rendering a blank screen fails (blank-id) and is not also double-reported as orphan-page', () => {
    const plan = healthyPlan({
      pages: [
        page({ screen: 'home', links: ['detail'], tokensUsed: ['color-bg'] }),
        page({ screen: 'detail', links: [], tokensUsed: ['color-accent'] }),
        page({ screen: '', links: [], tokensUsed: ['color-bg'] }), // blank screen id
      ],
    });
    const v = verifyPrototypePlan(plan);
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.risk === 'blank-id')).toBe(true);
    expect(v.findings.some((f) => f.risk === 'orphan-page')).toBe(false);
  });

  test('coverageSummary agrees with the gate on blank ids — an edge to "" is not counted resolved', () => {
    const plan = healthyPlan({
      screens: [
        { id: 'home', title: 'Home' },
        { id: '', title: 'Blank' },
      ],
      nav: [{ from: 'home', action: 'Go', to: '' }],
      pages: [
        page({ screen: 'home', links: [''], tokensUsed: ['color-bg'] }),
        page({ screen: '', links: [], tokensUsed: ['color-bg'] }),
      ],
    });
    // The gate fails on the blank id …
    expect(verifyPrototypePlan(plan).findings.some((f) => f.risk === 'blank-id')).toBe(true);
    // … and the roll-up doesn't count the blank screen as covered or the edge to "" as resolved.
    const c = coverageSummary(plan);
    expect(c.coveredScreens).toBe(1); // only 'home'
    expect(c.resolvedEdges).toBe(0);
  });

  test('a repeated screen id fails (duplicate-screen)', () => {
    const plan = healthyPlan({
      screens: [
        { id: 'home', title: 'Home' },
        { id: 'home', title: 'Home again' },
        { id: 'detail', title: 'Detail' },
      ],
    });
    const v = verifyPrototypePlan(plan);
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.risk === 'duplicate-screen')).toBe(true);
  });

  test('a screen with two pages fails (duplicate-page)', () => {
    const plan = healthyPlan({
      pages: [
        page({ screen: 'home', links: ['detail'], tokensUsed: ['color-bg'] }),
        page({ screen: 'home', links: ['detail'], tokensUsed: ['color-bg'] }),
        page({ screen: 'detail', links: [], tokensUsed: ['color-accent'] }),
      ],
    });
    const v = verifyPrototypePlan(plan);
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.risk === 'duplicate-page')).toBe(true);
  });
});

describe('coverageSummary — the operator-facing roll-up', () => {
  test('counts screens, pages, edges, and how many resolve', () => {
    const c = coverageSummary(healthyPlan());
    expect(c).toEqual({ screens: 2, pages: 2, edges: 1, coveredScreens: 2, resolvedEdges: 1 });
  });

  test('an unresolved edge is not counted as resolved', () => {
    const plan = healthyPlan({
      pages: [
        page({ screen: 'home', links: [], tokensUsed: ['color-bg'] }), // link to 'detail' not wired
        page({ screen: 'detail', links: [], tokensUsed: ['color-accent'] }),
      ],
    });
    expect(coverageSummary(plan).resolvedEdges).toBe(0);
  });
});

describe('parsePrototypePlan — the committed reference manifest fully covers its design', () => {
  test('parses screens, tokens, nav, and pages', () => {
    const plan = parsePrototypePlan(readFileSync(REFERENCE_MANIFEST, 'utf-8'));
    expect(plan.product.length).toBeGreaterThan(0);
    expect(plan.screens.length).toBeGreaterThan(0);
    expect(plan.tokens.length).toBeGreaterThan(0);
    expect(plan.nav.length).toBeGreaterThan(0);
    expect(plan.pages.length).toBeGreaterThan(0);
  });

  test('the reference prototype passes every coverage rule', () => {
    const plan = parsePrototypePlan(readFileSync(REFERENCE_MANIFEST, 'utf-8'));
    const v = verifyPrototypePlan(plan);
    expect(v.findings).toEqual([]);
    expect(v.pass).toBe(true);
  });

  test('every screen in the reference inventory is covered by a page', () => {
    const plan = parsePrototypePlan(readFileSync(REFERENCE_MANIFEST, 'utf-8'));
    const c = coverageSummary(plan);
    expect(c.coveredScreens).toBe(c.screens);
    expect(c.resolvedEdges).toBe(c.edges);
  });
});
