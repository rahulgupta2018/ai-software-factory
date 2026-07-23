---
name: react-frontend-architect
description: >
  Designs and reviews the architecture of React applications — feature-based module boundaries,
  component composition, server-vs-client state strategy, routing, code-splitting, and render
  performance. Activates when structuring a React/Next.js app, deciding where state lives, drawing
  module boundaries, or reviewing a component tree for coupling or re-render cost. Owns React app
  architecture. Does not own end-to-end web wiring (fullstack-developer), styling/design tokens
  (modern-css-design-systems), visual direction (frontend-design), or the test-first loop.
license: MIT
metadata:
  author: AI Software Factory (for this library)
  version: "0.1.0"
  last_updated: 2026-07-22
  category: coding
---

# React Frontend Architect

## Overview

Shapes React applications so they stay changeable as they grow: clear feature boundaries, composed
components, state that lives at the right layer, and render paths that don't degrade. Reviews an
existing tree against a fixed priority order: **Boundaries → Composition → State → Performance**.
Assumes the model already knows JSX/hooks — this skill supplies the architecture decisions and the
mistakes a model makes without guidance, not a React tutorial.

**Freedom level: MEDIUM** — the priority order and module shape are fixed; the stack varies.

**Project binding (optional).** If `.agents/project-context.yaml` defines `${ctx.tech_bindings}`
(e.g. Next.js App Router vs Vite + React Router, monorepo tool), follow it; otherwise default to
React 19 + a file-router framework (Next App Router) with server components where available.

## When to Activate

Activate when:
- Structuring a new React/Next.js app or a large new feature (folders, module boundaries).
- Deciding where state lives (server cache vs client, global vs local) or splitting a god-component.
- Setting routing, code-splitting/lazy boundaries, or a monorepo layout.
- Reviewing a component tree for coupling, prop-drilling, or re-render cost.

**Do not activate** (adjacent skills own this):
- `fullstack-developer` — owns end-to-end web wiring (API routes, Zod, Prisma, auth).
- `modern-css-design-systems` — owns Tailwind/tokens/shadcn styling and a11y-in-components.
- `frontend-design` — owns visual direction and aesthetics.
- `tdd-red-green-refactor` — owns the failing-test-first loop.
- `typed-service-contracts` — owns the language-agnostic spec/handler + Result pattern.

## Working Order

1. **Boundaries first** — organise by feature, not by file type; a feature owns its components,
   hooks, and local state and exposes a small public surface (an `index.ts` barrel).
2. **Composition** — compose small components; lift shared shape into composition
   (children/slots), not into ever-wider prop lists or context.
3. **State** — server data is a cache (React Query/RSC), not client state; keep client state as
   local as possible; reach for global state only for genuinely cross-cutting UI concerns.
4. **Performance** — measure before memoising; split at route/feature boundaries; keep the
   client bundle honest (push interactivity down, fetch on the server where the framework allows).

Detailed rule catalogue with examples: load **`references/react-guidelines.md`** in this skill folder when you need the
full rule list or are doing a thorough review.

## Core Concepts

Only the architecture decisions a capable model gets wrong without guidance:

- **Feature modules, not layer folders.** `features/repairs/{components,hooks,api,index.ts}` beats
  a global `components/` + `hooks/` split once past a toy app — a feature stays deletable and its
  boundary is enforceable. Cross-feature imports go through the barrel, never deep paths.
- **Server state ≠ client state.** Data from the network is a *cache with an owner elsewhere*.
  Model it with React Query (or RSC fetching), keyed and invalidated — never copy it into
  `useState`, which forks a second source of truth that drifts.
- **Server vs client components (RSC).** In App Router, components are server by default; `"use
  client"` is a boundary, not a default. Fetch and compose on the server, push only interactive
  leaves to the client — the boundary is where bundle and hydration cost begins.
- **Composition over configuration.** A component that grows a `variant`/`mode`/`isX` prop for
  every case becomes unmaintainable; expose slots (`children`, render props, compound components)
  so callers compose behaviour instead of toggling flags.
- **Re-renders are caused, not random.** A parent re-render cascades to children unless the subtree
  is memoised AND its props are stable. `useMemo`/`useCallback`/`memo` only help when the identity
  they preserve actually feeds a memoised boundary — otherwise they add cost for nothing.

## Output Template (a feature module)

```
src/features/repairs/
  components/
    RepairList.tsx        # presentational; takes data + callbacks, no fetching
    RepairListItem.tsx
  hooks/
    useRepairs.ts         # server cache (React Query): keys, fetch, invalidation
  api/
    repairs.ts            # typed client calls (shared request/response types)
  index.ts                # public surface: export { RepairList, useRepairs }
```

```tsx
// hooks/useRepairs.ts — server data is a cache, not client state.
export function useRepairs(propertyId: string) {
  return useQuery({
    queryKey: ["repairs", propertyId],
    queryFn: () => api.listRepairs(propertyId),
    staleTime: 30_000,
  });
}

// components/RepairList.tsx — presentational: data in, events out. No fetching, no global reads.
export function RepairList({ repairs, onSelect }: {
  repairs: Repair[];
  onSelect: (id: string) => void;
}) {
  if (repairs.length === 0) return <EmptyState action="Log the first repair" />;
  return (
    <ul>
      {repairs.map((r) => (
        <RepairListItem key={r.id} repair={r} onSelect={onSelect} />
      ))}
    </ul>
  );
}
```

## Review Checklist

- [ ] Organised by feature; cross-feature imports go through a barrel, not deep paths
- [ ] Server data via a cache (React Query/RSC), never copied into `useState`
- [ ] Client state kept local; global state only for cross-cutting UI concerns
- [ ] `"use client"` pushed to interactive leaves; data fetched server-side where possible
- [ ] Components compose (slots/children) instead of accreting boolean/variant props
- [ ] Every list has key stability, loading, empty, and error states
- [ ] Memoisation is justified by a measured boundary, not sprinkled by default
- [ ] Route/feature-level code-splitting; no single mega-bundle
- [ ] No prop-drilling more than ~2 levels; use composition or a scoped provider

## Guidelines

1. A feature folder is deletable: removing it should not break unrelated features.
2. Presentational components take data + callbacks; container/hook layers do fetching and wiring.
3. Prefer URL/route state and server cache over client state; local `useState` over global store.
4. Introduce a global store (Zustand/Context) only for cross-cutting concerns (theme, auth,
   command palette) — not for server data.
5. Split code at route and heavy-feature boundaries with `lazy` + `Suspense`; give each a fallback.

## Gotchas

1. **Server data in `useState`**: copying fetched data into local state forks the truth — it goes
   stale on refetch and desyncs across components. Keep it in the query cache; derive from it.
2. **`useEffect` as a data-fetching framework**: ad-hoc `fetch` in `useEffect` re-implements
   caching, cancellation, and races badly. Use React Query / RSC; reserve effects for true
   side-effects (subscriptions, imperative DOM).
3. **Context as a state manager**: a single wide context re-renders every consumer on any change.
   Split contexts by concern, or use a store with selectors; context is for stable, rarely-changing
   values.
4. **Unstable keys**: index-as-key on a reorderable list corrupts state and animations. Key by a
   stable id.
5. **`"use client"` too high**: marking a whole page client-side drags its data-fetching and its
   entire subtree into the bundle. Keep the boundary at the interactive leaf.
6. **Memo theatre**: `useMemo`/`useCallback` on values that don't feed a memoised child just cost
   allocations and hide intent. Memoise a real boundary, or not at all.
7. **Barrel cycles / deep imports**: importing another feature's internals (not its `index.ts`)
   welds two features together and invites circular imports. Import the public surface only.

## Integration

- `fullstack-developer` — owns the API/DB/wiring this architecture consumes; share types.
- `modern-css-design-systems` — styles the components this skill structures.
- `frontend-design` — sets the visual direction these components realise.
- `tdd-red-green-refactor` — drive feature behaviour test-first.
- `typed-service-contracts` — put fragile client logic behind parsed inputs + Result types.

## References

- `references/react-guidelines.md` (this folder) — full rule catalogue with examples; load for thorough reviews.
- Best practices: https://agentskills.io/skill-creation/best-practices
