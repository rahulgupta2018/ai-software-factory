# vendor-skills/

Layer-2 **craft skills**, copied verbatim from the `agent-skills` library and pinned in
`manifest.json` (version + sha256 of `SKILL.md` at vendor time).

## Rules

- **Never edit a vendored skill in place.** Fix it upstream in `agent-skills`, then re-vendor.
  `fac vendor:check` compares each file against its pinned hash and fails if you did.
- Record the pinned version in the product's `.factory/stack.yaml` `skills[]` manifest.
- Vendored skills bind to the product's machine context via `${ctx.*}`, resolved from the merged
  `PRD.md` + `.factory/stack.yaml` context that `fac sync-context` writes.

## Commands

```bash
fac vendor                       # list what the library offers
fac vendor fullstack-developer   # copy + pin (repeatable; re-run to update a pin)
fac vendor:check                 # integrity, upstream drift, and ${ctx.*} binding resolution
```

The library is found via `$AGENT_SKILLS_DIR`, falling back to the `source` path recorded in
`manifest.json` (a local convenience — the env var always wins).

## What `vendor:check` proves

The plan's premise is that the craft layer is already owned. `vendor:check` verifies that per
skill rather than assuming it:

1. **Integrity** — the vendored copy still matches its pinned hash.
2. **Upstream** — the library version has not moved past the pin.
3. **Bindings** — every `${ctx.*}` the skill references is declared in
   `project-context.schema.json` *and* populated in the reference product's merged context.

Check 3 already caught a real break: `fullstack-developer` binds `${ctx.tech_bindings}`, a key
the Factory context never produced, so the vendored skill was binding to nothing. `sync-context`
now derives `tech_bindings` from `tech_stack.components[]`.

## Vendored today (Phase 1 — TypeScript/React path)

`fullstack-developer`, `tdd-red-green-refactor`, `typed-service-contracts`.

## Vendor when the workflow skill that consumes them lands

`project-planner`, `sprint-planner`, `technical-writer`, `visualization-expert`, `ux-designer`,
`quality-governance`, `agent-discovery`, `self-improving-agent-skills`, `memory-systems`,
`multi-agent-patterns`, `python-expert`.

## Gap skills to author upstream first, then vendor

Phase 1b (Java path): `java-quarkus-expert`.
Phase 2 (design/UI): `react-frontend-architect`, `modern-css-design-systems`, `frontend-design`.
