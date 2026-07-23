# AGENTS.md — AI Software Factory

Project memory for AI agents working in this repository. **Load `PRD.md` first** (the active
product's source of truth), then the relevant skill(s).

---

## 1. What this repo is

The **AI Software Factory** — a product-agnostic AI engineering workflow. It turns a product
idea into shipped software via a team of specialist agents, each backed by a generated
workflow skill (Layer 1) that composes vendored craft skills (Layer 2) and tooling binaries
(Layer 3). Modeled on gstack's orchestration, assembled from the `agent-skills` craft library.

See `docs/implementation-plan.md` for the full design.

## 2. Start here — load the product context first

**A product is defined by TWO files, split by who writes them.** Load both at the start of
every task.

| File | Owner | Holds |
|---|---|---|
| `PRD.md` | **human** | frontmatter: `product`, `domain`, `meta` · body: the requirements |
| `.factory/stack.yaml` | **`/plan-arch`** | `tech_stack`, `commands`, `skills`, `guardrails`, `escalation_policy`, `tech_bindings` |

They were one file. An agent writing `tech_stack` back into the frontmatter a human is editing
is a clobber hazard, and the two halves change at completely different cadences. Both files are
committed — `stack.yaml` is the design record, not a build artifact.

Skills bind via `${ctx.*}`. When a key is missing, ask, then persist it to **the file that owns
it** and re-run `fac sync-context`. Precedence: per-skill `overrides` → merged product context →
skill generic default.

**Compatibility bridge:** vendored craft skills expect a project-context YAML. Run
`fac sync-context` (`bun run sync-context`) to merge both halves into a git-ignored
`.factory/context.gen.yaml`, Ajv-validated against `project-context.schema.json`. Two keys are
**derived, never authored**: `project` (alias of `product`, which the library's schema requires)
and `tech_bindings` (derived from `tech_stack.components[]`; explicit values in `stack.yaml`
win). `sync-context` fails on an ownership violation rather than silently merging.

## 3. How skills work

Skills are the reusable *method*; `PRD.md` supplies the *values*.

- **Layer 1 — workflow skills** live in `skills/<name>/` and are **generated** from
  `SKILL.md.tmpl` via `bun run gen:skills`. Never hand-edit a generated `SKILL.md` — edit the
  `.tmpl` and regenerate. The generator injects the shared preamble (ethos, writing style,
  config protocol) so every skill stays consistent.
- **Layer 2 — craft skills** are vendored under `vendor-skills/` copied from `agent-skills`,
  pinned by version + sha256 in `vendor-skills/manifest.json`. **Never edit a vendored skill in
  place** — fix upstream and re-vendor. `bun run vendor:check` fails if you did, and also
  verifies every `${ctx.*}` a vendored skill references is declared in the schema and populated
  in the golden reference product (`examples/reference-product/`).

Config protocol every skill honours: read the merged context → if a needed value is missing,
AskUserQuestion → persist the answer to the file that owns that key → re-run `sync-context`.
Never ask twice.

## 4. Repository map

```
ai-software-factory/
├── AGENTS.md                     ← this file
├── VERSION  CHANGELOG.md  ETHOS.md
├── project-context.schema.json   ← contract for the merged context (x-owner per property)
├── docs/implementation-plan.md
├── skills/<name>/{SKILL.md.tmpl,SKILL.md}   ← Layer 1 (generated)
├── vendor-skills/{manifest.json,<name>/}    ← Layer 2 (vendored, pinned + hashed)
├── agents/<name>.md              ← specialist personas (see plan §5)
├── tools/{browse,design,make-pdf,diagram}/  ← Layer 3 binaries
├── lib/{yaml,frontmatter,schema,context}.ts ← shared, tested
├── scripts/{gen-skill-docs,skill-check,vendor,vendor-check,sync-context}.ts + resolvers/
├── test/skill-validation.test.ts ← Tier 1; every check has a negative case
├── examples/reference-product/   ← golden fixture the pipeline runs against
├── hosts/{claude,codex}.ts       ← multi-host adapters
├── templates/{PRD.template.md,stack.template.yaml}   ← `fac init` copies both
└── setup                         ← install + symlink skills into a host
```

## 5. Commands

```bash
bun run gen:skills     # regenerate all SKILL.md from .tmpl (for every host)
bun run skill:check    # static validation (frontmatter, ≤500 lines, byte-exact drift)
bun run vendor:check   # vendored-skill integrity, upstream drift, ${ctx.*} bindings
bun run build          # gen:skills + skill:check + vendor:check
bun run sync-context   # PRD.md + .factory/stack.yaml → .factory/context.gen.yaml
bun test               # eval harness (Tier 1 today)
```

## 6. Conventions

- Workflow skills follow the `agent-skills` AUTHORING-GUIDE: valid frontmatter, ≤500 lines,
  a "Do not activate" block, folder name == `name`.
- After editing any `.tmpl`, run `bun run gen:skills` and commit both files.
- `VERSION` is monotonic (4-part). `CHANGELOG.md` is user-facing (gstack voice discipline).
- Hosts are config, not code: adding a host is a new `hosts/*.ts`, never a skill change.
