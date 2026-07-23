# react-frontend-architect — rule catalogue

Full rule list for thorough reviews of React application architecture. Load this when the
`SKILL.md` body says to, or when doing a deep review. Priority order: **Boundaries → Composition
→ State → Performance**. Each rule pairs the mistake (❌) with the shape to prefer (✅).

---

## Boundaries

### B1. Organise by feature, not by file type
A global `components/` + `hooks/` + `utils/` split stops scaling once features multiply — related
code scatters and nothing is deletable.

❌
```
src/components/RepairList.tsx
src/components/InvoiceTable.tsx
src/hooks/useRepairs.ts
src/hooks/useInvoices.ts
```

✅
```
src/features/repairs/{components,hooks,api,index.ts}
src/features/invoices/{components,hooks,api,index.ts}
src/shared/            # only genuinely cross-feature primitives
```

### B2. Import the public surface, never internals
Deep imports into another feature weld the two together and invite circular deps.

❌ `import { parseRepair } from "@/features/repairs/hooks/useRepairs";`
✅ `import { useRepairs } from "@/features/repairs";  // barrel-exported surface`

---

## Composition

### C1. Compose with slots, don't accrete flags
A component that grows a boolean/variant prop per case becomes a config swamp.

❌
```tsx
<Card hasHeader hasFooter isCompact showAction actionVariant="danger" />
```

✅
```tsx
<Card>
  <Card.Header>Repairs</Card.Header>
  <Card.Body>{children}</Card.Body>
  <Card.Footer><Button variant="danger">Close</Button></Card.Footer>
</Card>
```

### C2. Presentational vs container
Presentational components take data + callbacks and never fetch or read globals; wiring lives in a
hook/container layer. This keeps components testable and reusable.

❌
```tsx
function RepairList() {
  const { data } = useQuery(/* ... */);   // fetching inside the view
  const user = useAuthStore();             // global read inside the view
  return /* ... */;
}
```

✅
```tsx
function RepairList({ repairs, onSelect }: { repairs: Repair[]; onSelect: (id: string) => void }) {
  return /* pure render of props */;
}
// container/hook does the fetching and passes data down
```

---

## State

### S1. Server data is a cache, not client state
Copying fetched data into `useState` forks the source of truth; it drifts on refetch.

❌
```tsx
const [repairs, setRepairs] = useState<Repair[]>([]);
useEffect(() => { fetch("/api/repairs").then(r => r.json()).then(setRepairs); }, []);
```

✅
```tsx
const { data: repairs = [] } = useQuery({ queryKey: ["repairs"], queryFn: api.listRepairs });
```

### S2. Keep client state local; escalate deliberately
Local `useState` → lifted state → scoped provider → global store, in that order. Reach for a global
store only for cross-cutting concerns (theme, auth, command palette).

❌ A global Zustand store holding a modal's open/closed flag used by one component.
✅ `const [open, setOpen] = useState(false);` co-located with the modal.

### S3. Context is for stable values, not a state engine
A wide context re-renders every consumer on any change.

❌ One `AppContext` holding user + theme + cart + filters; any update re-renders the whole tree.
✅ Split by concern (`ThemeContext`, `AuthContext`), or a store with selectors so only readers of a
slice re-render.

---

## Quarkus/Runtime — N/A (see modern-css-design-systems for a11y-in-components)

---

## Performance

### P1. Memoise a measured boundary, not by reflex
`useMemo`/`useCallback`/`memo` only help when the preserved identity feeds a memoised child.

❌
```tsx
const label = useMemo(() => `${count} repairs`, [count]); // trivial string; no memoised consumer
const onClick = useCallback(() => setOpen(true), []);     // passed to a non-memoised leaf
```

✅
```tsx
const rows = useMemo(() => expensiveTransform(data), [data]); // real cost
const Row = memo(RepairRow);                                   // memoised consumer of stable props
```

### P2. Split at route/feature boundaries
Ship the route the user is on, lazy-load the rest.

❌ One entry bundle importing every route eagerly.
✅
```tsx
const Reports = lazy(() => import("@/features/reports"));
<Suspense fallback={<Spinner />}><Reports /></Suspense>
```

### P3. Keep the client boundary low (RSC)
Marking a page `"use client"` drags its whole subtree and data into the bundle.

❌ `"use client"` at the top of a page that mostly renders static content.
✅ Server component fetches + composes; only the interactive leaf (a filter input, a menu) is
`"use client"`.

### P4. Stable keys and complete list states
Every list needs a stable key and loading / empty / error branches.

❌ `items.map((it, i) => <Row key={i} …/>)` on a reorderable list, with no empty/error handling.
✅ `items.map((it) => <Row key={it.id} …/>)` plus explicit `isLoading`, empty, and error UI.

---

## How to review with this catalogue

1. Walk the priority order top-down: a boundary problem outranks a performance nit.
2. For each finding cite the rule id (e.g. **S1**), show the offending shape, give the fix.
3. Prefer structural fixes (move state, split a feature) over local patches.
4. Don't invent memoisation without a measured cost — flag reflex-memo as its own smell (P1).
