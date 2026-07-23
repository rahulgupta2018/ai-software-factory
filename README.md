# AI Software Factory

A **product-agnostic** AI engineering workflow: a team of specialist agents that turn a product
idea into shipped software. Modeled on [gstack](https://github.com/garrytan/gstack)'s
orchestration, assembled from the `agent-skills` craft library.

- **Layer 1 — workflow skills** (`skills/`): generated from `.tmpl` with a shared ethos/preamble.
- **Layer 2 — craft skills** (`vendor-skills/`): vendored from `agent-skills`, pinned.
- **Layer 3 — tooling** (`tools/`): browser, design, pdf, diagram binaries (Bun + TS).

Every product is defined by **two files, split by who writes them**: `PRD.md` is human-owned
(identity + requirements) and `.factory/stack.yaml` is machine-owned (the design `/plan-arch`
records). `fac sync-context` merges and validates them into the context skills bind to. See
[docs/implementation-plan.md](docs/implementation-plan.md).

## Quick start

```bash
./setup                 # build skills + install into detected hosts (Claude Code, Codex)
bun run build           # gen:skills + skill:check + vendor:check
bun test                # Tier-1 harness

# In a product repo:
fac init                # scaffold PRD.md + .factory/stack.yaml
fac sync-context        # merge + validate → .factory/context.gen.yaml
```

## Status

**Phase 0 complete; Phase 1 in progress.** Generation pipeline, two host adapters, the product
context split + schema, vendoring with binding verification, a golden reference product, and the
seed `/discover` skill are in place. Phase 1 builds the core loop on the TypeScript/React path.
See [CHANGELOG.md](CHANGELOG.md).
