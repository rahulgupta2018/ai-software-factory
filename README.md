# AI Software Factory

A **product-agnostic AI engineering workflow**. You describe a product; a team of specialist
agents takes it from idea to shipped software along one pipeline:

```
THINK → PLAN → BUILD → REVIEW → TEST → SHIP → REFLECT
```

Each stage is a **skill** you invoke by name inside your AI host (Claude Code or Codex). The
skills are the reusable *method*; your `PRD.md` supplies the *values*. AI code orchestration, with bespoked `agent-skills` craft library.

**Three layers under the hood:**

| Layer | Lives in | What it is |
|---|---|---|
| 1 — workflow skills | `skills/` | The 27 `/commands` below, generated from `.tmpl` templates |
| 2 — craft skills | `vendor-skills/` | Language/domain expertise vendored from `agent-skills`, pinned by hash |
| 3 — tooling | `tools/` | Real binaries the skills drive: browser, design, pdf, diagram, mobile-device |

---

## 1. Install (one time)

**Prerequisite:** [Bun](https://bun.sh) ≥ 1.3. Check with `bun --version`.

```bash
# 1. Clone and enter the Factory
git clone <this-repo> ai-software-factory
cd ai-software-factory

# 2. Build the skills and install them into your AI host(s)
./setup

# 3. Expose the `fac` CLI globally (Bun reads the "bin" map)
bun link
```

> **`fac` is a _global_ command — it is never a file inside your product folder.** `./setup` only
> generates and installs the *skills* into your AI host; it does **not** create `fac`. The `bun link`
> step is what registers `fac` (into Bun's global bin dir, `~/.bun/bin`). Skipping it — or not having
> `~/.bun/bin` on your `PATH` — gives `command not found: fac`.

### Put Bun's global bin dir on your `PATH`

`bun link` installs `fac` into `~/.bun/bin`. The official Bun installer adds that to your `PATH`
automatically, but if you installed Bun via **Homebrew** (or a package manager) it usually is **not**
there. Add it once:

```bash
# Append to ~/.zshrc (use ~/.bashrc on bash), then reload
cat >> ~/.zshrc <<'EOF'

# Bun
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
EOF

source ~/.zshrc     # or just open a new terminal
```

Confirm it worked:

```bash
which fac           # → /Users/<you>/.bun/bin/fac
fac                 # prints the command list
```

If `which fac` finds nothing: re-run `bun link` in the `ai-software-factory` repo, then re-check
your `PATH` contains `~/.bun/bin`.

**What `./setup` does** — output looks like this:

```
==> AI Software Factory setup
==> Generating skills for all hosts
gen:skills — generated 27 skill(s) for 2 host(s).
skill:check — 27 skill(s) OK.
vendor:check — 31 vendored skill(s), 0 failed, 0 warning(s).
==> Installing skills into hosts
  linked  claude → ~/.claude/skills/factory
  linked  codex  → ~/.codex/prompts/
==> Done. Run 'fac init' inside a product repo to scaffold PRD.md + .factory/stack.yaml.
```

It detects which host CLIs (`claude`, `codex`) are on your PATH and links the skills where each
one looks for them:

| Host | Skills installed to |
|---|---|
| Claude Code | `~/.claude/skills/factory/` |
| Codex | `~/.codex/prompts/` |

> On Windows the installer **copies** instead of symlinking (symlinks freeze without Developer
> Mode) — re-run `./setup` after every `git pull`.

---

## 2. Set up a product repo

The Factory is a tool you point at **your product's own repository**. Go to that repo and scaffold
the two files that define the product:

```bash
cd ~/code/my-product      # your product repo
fac init                  # scaffold PRD.md + .factory/stack.yaml
```

Output:

```
fac init — scaffolded:
  PRD.md                 (human-owned — write the requirements)
  .factory/stack.yaml    (machine-owned — /plan-arch fills this)
  .gitignore             (+ derived-context entries)

Next: fill in PRD.md, then run `fac sync-context`.
```

### The folder structure `fac init` creates

`fac init` scaffolds **only these four things** — nothing else exists yet:

```
my-product/                     ← your product repo
├── PRD.md                      ← YOU write this (product identity + requirements)
├── .gitignore                  ← derived-context + run-artifact entries appended
└── .factory/
    ├── stack.yaml              ← /plan-arch writes this (tech stack, commands, guardrails)
    └── runs/                   ← empty for now; one dir per pipeline run lands here
```

The rest of the layout **appears later**, created by the tools as you use them — do not expect it
right after `init`:

```
my-product/
├── PRD.md
├── .gitignore
├── .factory/
│   ├── stack.yaml
│   ├── context.gen.yaml        ← created by `fac sync-context`   (gitignored)
│   └── runs/
│       └── 2026-07-24-abc/     ← created when a run executes     (gitignored)
│           ├── 00-discover.md
│           ├── 01-plan.md
│           ├── 03-build-<component>.md
│           ├── 04-review.md   04a-security.md
│           ├── 05-qa.md
│           └── 06-deploy.md
├── .agents/
│   └── project-context.yaml    ← created by `fac sync-context`   (gitignored)
└── …your actual source code…
```

> **Why the difference?** `init` only lays down the two files you commit (`PRD.md`, `stack.yaml`)
> plus an empty `runs/` and the `.gitignore`. `context.gen.yaml` and `.agents/project-context.yaml`
> are *derived* — they're written the first time you run `fac sync-context`. Run subfolders are
> written when a pipeline run actually executes.

### The two files that define a product

A product is defined by **two files, split by who writes them.** This split is deliberate: an
agent writing tech decisions back into a file you are editing is a clobber hazard.

| File | Owner | Holds | Committed? |
|---|---|---|---|
| `PRD.md` | **You (human)** | Frontmatter: `product`, `domain`, `meta` · Body: the requirements | ✅ Yes |
| `.factory/stack.yaml` | **`/plan-arch` (agent)** | `tech_stack`, `commands`, `skills`, `guardrails`, `tech_bindings` | ✅ Yes |

**Where do you write the PRD?** In `PRD.md` at the **root of your product repo**. Fill in the
frontmatter (name, code, description) and the body sections (problem, users, goals, features,
success metrics). You can write it by hand, or let `/discover` draft it for you (see below).

> **Never** paste `tech_stack` or `commands` into the PRD frontmatter — those belong in
> `stack.yaml`, which `/plan-arch` owns.

### Merge the two halves into context

Whenever `PRD.md` or `stack.yaml` changes, regenerate the context the skills bind to:

```bash
fac sync-context
```

Output:

```
sync-context — wrote .factory/context.gen.yaml + .agents/project-context.yaml
```

This merges both files, Ajv-validates them against the schema, and writes the derived
`context.gen.yaml`. Skills read values from it via `${ctx.*}` references. If a required value is
missing, the skill asks you, then persists your answer to the file that owns it.

---

## 3. Run the pipeline

You **run the Factory by invoking skills inside your AI host** (Claude Code or Codex) — not by
running a monolithic command. Open your product repo in the host and drive it stage by stage. A
typical first pass:

```
/discover        →  drafts PRD.md from your idea
/plan-product    →  pressure-tests scope (Expand / Hold / Reduce)
/plan-arch       →  picks the stack, writes .factory/stack.yaml
/plan-design     →  UI spec + design tokens (if there's a UI)
/build           →  implements V1 features test-first, one component at a time
/review          →  code review of the diff
/security        →  OWASP + STRIDE audit, supply-chain & pipeline gates
/qa              →  drives the running app in a real browser, files bugs + regression tests
/ship            →  runs checks, opens a PR, (optionally) deploys
/retro           →  reflects across the run: what worked, what to change
```

Each stage writes a **run artifact** into `.factory/runs/<run>/` so the next stage has a durable,
hashed input. Manage runs with the CLI:

```bash
fac run new           # start a run
fac run status        # where am I in the pipeline
fac run list          # all runs
fac run resume        # pick a stopped run back up
```

### A worked example

**You (in Claude Code, inside your product repo):**

> /discover — a tool that lets housing officers ask plain-English questions about tenancy law
> and get cited answers.

**The `/discover` skill responds:**

```
Drafted PRD.md — 8 sections, 6 V1 features.
  Problem:  officers hunt across scattered PDFs for tenancy rules; slow, error-prone.
  Users:    housing officers (primary), team leads (secondary).
  V1:       plain-English Q&A · citation to source · confidence score · …
  Open Q:   which jurisdictions at launch? (England only vs UK-wide)

Next: /plan-product to pressure-test scope, or edit PRD.md directly.
```

**You:**

> /plan-arch

**The `/plan-arch` skill responds:**

```
Wrote .factory/stack.yaml:
  languages:   TypeScript (web), Python (retrieval service)
  components:  web-ui · api · retrieval-worker
  commands:    test=`bun test` · lint=`biome check` · typecheck=`tsc --noEmit`
  skills:      react-frontend-architect · python-expert · grounded-answer-with-citations
Run `fac sync-context` to validate + merge.
```

You run `fac sync-context`, then continue with `/build`, `/review`, `/qa`, `/ship`.

---

## 4. The `/commands` — what each one does

All 27 skills, grouped by pipeline stage. Invoke by name (e.g. `/discover`) in your AI host.
**V1** = ships first; **FF** = fast-follow.

### THINK — turn an idea into a PRD

| Command | Pri | What it does |
|---|---|---|
| `/discover` | V1 | Interrogates a raw product idea → first draft of `PRD.md` (problem, users, goals, prioritised V1 features). |

### PLAN — lock scope, architecture, and design

| Command | Pri | What it does |
|---|---|---|
| `/plan-product` | V1 | Pressure-tests the PRD before building — right thing, right scope, right user? Runs in Expand / Hold / Reduce mode. |
| `/plan-arch` | V1 | Picks languages, components, frameworks, commands, and craft skills → writes `.factory/stack.yaml`. |
| `/plan-design` | V1 | Turns a UI-bearing PRD into a defensible UI spec — visual direction, design tokens, component inventory, flows, accessibility floor. |
| `/spec` | V1 | Turns vague intent into a precise, executable spec — scope, acceptance criteria, edge cases, task breakdown. |

### BUILD — implement the features

| Command | Pri | What it does |
|---|---|---|
| `/build` | V1 | The build loop: implements the PRD's V1 features **test-first**, one component at a time, routing each to the right craft skill and recording a per-component build artifact. |

### REVIEW — find the defects before they ship

| Command | Pri | What it does |
|---|---|---|
| `/review` | V1 | Pre-landing code review of the diff, in priority order: Security → Performance → Correctness → Maintainability → Testing. |
| `/security` | V1 | Security audit: OWASP Top 10, OWASP API Top 10, STRIDE + app-sec checklist (crypto, RBAC, sessions). Runs the supply-chain, SAST, CI/CD-pipeline, container & DAST gates. |
| `/investigate` | V1 | Systematic root-cause debugging. **Iron Law: no fix without an investigation first.** Reproduces, hypothesises, tests, then fixes. |
| `/second-opinion` | FF | An independent second review of a change or decision. |

### TEST — exercise the running app

| Command | Pri | What it does |
|---|---|---|
| `/qa` | V1 | Drives the running app in a real browser (or on-device for mobile) to find bugs, then writes a bug-list artifact **and regression tests**. |
| `/qa-report` | V1 | Report-only QA — finds bugs and writes a prioritised report with repro steps + evidence, **makes no code changes**. |
| `/benchmark` | FF | Measures performance against a stored baseline and flags regressions (build time, bundle size, latency). |

### SHIP — land, release, deploy, document

| Command | Pri | What it does |
|---|---|---|
| `/ship` | V1 | Lands a reviewed, QA'd change: runs the full check suite, enforces the review + QA gates, opens a PR, and (when configured) deploys and verifies. |
| `/deploy` | V1 | Merge → wait for CI → deploy → verify healthy in production. Includes provenance/signing gate and mobile store branches (Apple/Google). |
| `/pipeline` | V1 | Generates & hardens the CI/CD workflow the Factory assumes — least-privilege permissions, OIDC/keyless auth, pinned actions, required security steps. |
| `/document` | V1 | Turns a shipped change into the docs it needs — release notes + Diataxis reference/how-to/tutorial/explanation, grounded in what actually shipped. |

### REFLECT & OPS — learn, monitor, resume

| Command | Pri | What it does |
|---|---|---|
| `/retro` | FF | Reflects across recent runs + the decision log: what worked, what stalled, what to change next. |
| `/learn` | FF | Promotes a logged decision or retro finding into a durable standing rule (project memory or an optimised skill). |
| `/health` | V1 | Runs the project's own quality gates (tests, linter, type checker per component from `stack.yaml`) → pass/fail dashboard. No code changes. |
| `/canary` | V1 | Watches a freshly deployed release for a short window and confirms it's healthy in production; hard-stops on failure. |
| `/context-save` | V1 | Snapshots the working context (git branch, dirty files, active run) so a task can be put down. |
| `/context-restore` | V1 | Rehydrates a saved context so a task resumes cold — even in a new session or on another machine. |
| `/skill-smith` | FF | The meta-skill: authors a new Factory skill or optimises an underperforming one. |

### SAFETY — guardrails for destructive work

| Command | Pri | What it does |
|---|---|---|
| `/careful` | V1 | Turns on destructive-command warnings — confirm before any recursive delete, `DROP`/`TRUNCATE`, force-push, or hard reset. |
| `/freeze` | V1 | Restricts file edits to one directory for the session; refuses any write outside it. |
| `/guard` | V1 | Full safety mode — `/careful` + `/freeze` at once. |

---

## 5. The `fac` CLI — the tooling backbone

The skills call these under the hood, but you can run them directly. `fac` with no argument prints
the list.

| Command | What it does |
|---|---|
| `fac init [dir]` | Scaffold a product: `PRD.md` + `.factory/stack.yaml` + `.gitignore`. |
| `fac sync-context` | Merge `PRD.md` + `stack.yaml` → `.factory/context.gen.yaml` (validated). |
| `fac run <sub>` | Manage a pipeline run: `new` / `status` / `artifact` / `resume` / `stop` / `list`. |
| `fac vendor <name>` | Vendor a craft skill from the `agent-skills` library (pinned by hash). |
| `fac vendor:check` | Verify every vendored skill's `${ctx.*}` bindings resolve. |
| `fac gen:skills` | Regenerate all `SKILL.md` from `.tmpl` for every host. |
| `fac skill:check` | Static validation of workflow skills (frontmatter, ≤500 lines). |
| `fac memory <sub>` | Read/write/list/delete scoped memory notes. |
| `fac decision <sub>` | Log/list/redact/compact durable decisions. |
| `fac context <sub>` | Save/restore working-context checkpoints. |
| `fac redact` | Screen outbound text for secrets/PII before egress. |
| `fac guard <sub>` | Check a command/edit against the safety guardrails. |
| `fac browse <sub>` | Drive a headless browser for `/qa` and design review. |
| `fac design <sub>` | Generate UI mockups/images for `/plan-design`. |
| `fac diagram <sub>` | Validate/wrap/render Mermaid diagrams for `/plan-arch`. |
| `fac make-pdf <sub>` | Markdown → publication HTML/PDF for `/document`. |
| `fac mobile-device <sub>` | On-device Flutter QE (`plan`/`check`/`run`) for `/qa`. |
| `fac install` | Link/copy generated skills into detected hosts (verifies each). |

---

## 6. Do's and Don'ts

### ✅ Do

- **Do write `PRD.md` first.** Everything downstream binds to it. A vague PRD produces a vague product.
- **Do run `fac sync-context` after editing `PRD.md` or `stack.yaml`.** The skills read the *merged*
  context, not the raw files.
- **Do commit both `PRD.md` and `.factory/stack.yaml`.** They are the product's design record.
- **Do let `/plan-arch` own `stack.yaml`.** It's the agent's file — you own the PRD.
- **Do go in pipeline order** (THINK → PLAN → BUILD → REVIEW → TEST → SHIP → REFLECT). Each stage's
  artifact is the next stage's input.
- **Do turn on `/guard`** before destructive or wide-blast-radius work.
- **Do fix what the gates flag.** `/security`, `/review`, and `/qa` are gates, not suggestions — a
  Critical/High finding on a production-bound change is a hard stop.

### ❌ Don't

- **Don't paste `tech_stack` or `commands` into the PRD frontmatter.** That's a clobber hazard —
  those live in `stack.yaml`.
- **Don't hand-edit a generated `SKILL.md`.** Edit the `.tmpl` and run `fac gen:skills`. The
  generated file will be overwritten.
- **Don't edit a vendored skill in place** (`vendor-skills/`). Fix it upstream and re-vendor;
  `fac vendor:check` fails if you edited one.
- **Don't commit `.factory/context.gen.yaml`, `.factory/runs/`, or `.agents/project-context.yaml`.**
  They're derived and gitignored (`fac init` sets this up).
- **Don't skip `/review` or `/security` to ship faster.** The gates exist to catch what CI can't.
- **Don't run the Factory outside a product repo.** `fac init` and the skills expect a `PRD.md` at
  the repo root.

---

## 7. Adding a new skill

**First decide which _kind_ of skill you're adding — this determines the whole workflow.** They are
two different things, and you do **not** do both for one skill:

| | **Layer 1 — workflow skill** | **Layer 2 — craft skill** |
|---|---|---|
| It is… | A new `/command` (a pipeline step) | Reusable language/domain expertise a workflow skill leans on |
| Examples | `/qa`, `/deploy`, `/security` | `python-expert`, `react-frontend-architect`, `ontology-guided-retrieval` |
| Authored in… | **the Factory repo** → `skills/<name>/SKILL.md.tmpl` | **the `agent-skills` repo** → `skills/<name>/` |
| Brought in with… | `fac gen:skills` (compiles `.tmpl` → `SKILL.md`) | `fac vendor <name>` (copies + hash-pins into `vendor-skills/`) |
| Installed into hosts? | ✅ Yes — so needs a **reinstall** | ❌ No — consumed at runtime, **no reinstall** |

> Your proposed flow mixed the two paths. `fac gen:skills` and `fac vendor <name>` are **not** two
> steps for one skill — each belongs to a different layer. Pick the path that matches the kind of
> skill you're adding.

### Path A — a new workflow skill (a new `/command`)

Authored **in the Factory repo**, not in `agent-skills`.

```bash
cd ai-software-factory
mkdir -p skills/my-skill
$EDITOR skills/my-skill/SKILL.md.tmpl   # valid frontmatter, ≤500 lines, a "Do not activate" block

fac gen:skills        # compile .tmpl → SKILL.md for every host (auto-discovers new folders)
fac skill:check       # validate frontmatter, size, folder name == name
./setup               # reinstall so Claude Code / Codex see the new /command
```

`fac gen:skills` compiles templates that already live in the Factory — it does **not** reach into
`agent-skills`. Commit **both** the `.tmpl` and the generated `SKILL.md`.

### Path B — a new craft skill (vendored expertise)

Authored **in the `agent-skills` library**, then pulled into the Factory.

```bash
# 1. Author it in the library
cd ~/…/agent-skills
$EDITOR skills/my-craft-skill/SKILL.md   # follow that repo's AUTHORING-GUIDE

# 2. Vendor it into the Factory (copies the bytes + pins version + sha256 in the manifest)
cd ai-software-factory
fac vendor my-craft-skill
fac vendor:check      # confirms the copy is intact and its ${ctx.*} bindings resolve
```

**No reinstall needed** — vendored craft skills are not host slash-commands. They're referenced by
workflow skills and resolved through the merged product context at runtime. A vendored skill is a
**point-in-time, hash-pinned snapshot**: it does not auto-update when the library changes. To take a
newer version later, re-run `fac vendor <name>`; `fac vendor:check` flags upstream drift and any
forbidden in-place edit.

### So in simple terms:

1. New **craft** skill → author in `agent-skills`, then `fac vendor <name>` + `fac vendor:check` in
   the Factory. **Done — no `gen:skills`, no reinstall.**
2. New **workflow** skill (`/command`) → author `skills/<name>/SKILL.md.tmpl` **in the Factory**,
   then `fac gen:skills` + `fac skill:check` + `./setup` (reinstall). **No `fac vendor`.**
3. `bun run build` (§9) is the umbrella validation (`gen:skills` + `skill:check` + `vendor:check`) —
   run it either way before committing, but it isn't the step that *pulls* a craft skill from the
   library; only `fac vendor` does that.

---

## 8. Long builds, memory & token discipline

A real product build spans days and many sessions. The Factory is designed so it can be **put down
and resumed at the exact point it left off**, so the agent **carries state on disk instead of
re-deriving it every turn**, and so **token cost is bounded and measured**.

### Resume a multi-day build — artifacts *are* the state

Every stage writes a hashed artifact into `.factory/runs/<run>/`. A step is "done" **iff its
artifact file exists** — there is no second source of truth to fall out of sync.

```bash
fac run status              # where am I? artifacts present, staleness, token budget
fac run resume --plan discover,plan-arch,build,review,qa,ship
                            # → prints the first MISSING or STALE step and stops
fac run stop                # drop a STOP marker; the run halts before its next step
```

- **Atomic writes** (`<name>.tmp` → rename) mean a crash mid-step never leaves a half-written
  artifact that looks complete.
- **Resume is make-like:** `resume` re-runs the first step that is *missing* or *stale* — "stale"
  means a recorded input's `sha256` no longer matches disk. Hand-edit an upstream artifact and
  everything downstream re-runs automatically; nothing else does.
- **One run per repo** via `.factory/lock` (a dead-pid lock is cleared with a warning).

So you can walk away for a week, come back, `fac run status`, `fac run resume` — it picks up
precisely where it stopped.

### Memory — the agent doesn't reload the whole world each turn

State lives in files, not in the conversation. That's what lets a new session (or a new machine)
resume cold.

| Command | Stores | Use it for |
|---|---|---|
| `fac memory` | `.factory/memory/{product,session}/` | `product` = committed design memory (conventions, learnings); `session` = task working-state |
| `fac decision` | `.factory/decisions.jsonl` (append-only) | Durable, settled calls + rationale — so nothing is re-litigated across sessions |
| `fac context save` / `restore` | A session checkpoint | Git branch, dirty files, latest run + last step/artifact, active decisions — resume a task cold |

The biggest saver is structural: because **each stage reads only the specific upstream artifact(s)
it declares as inputs** (not the transcript), `/qa` reads the build artifact — not everything
`/discover` and `/plan-arch` ever said. `AGENTS.md` (the standing brief) and
`.factory/context.gen.yaml` (compact merged `${ctx.*}` values, not the raw PRD + stack + schema)
are the only always-loaded context, and both are small by design.

### Token discipline — what's bounded, and what isn't

**Implemented:**

- **Per-skill ceiling ≤ 500 lines** (enforced by `fac skill:check`) — every prompt stays bounded.
- **Artifacts as narrow inputs** — a stage consumes its declared artifact(s), not the history.
- **`${ctx.*}` binding** to the compact merged context instead of re-parsing source files.
- **Cost is measured** — `fac run status` shows per-run tokens; a `guardrails.budget.warn_tokens`
  threshold **warns** past budget.

**Deliberate gaps (see the implementation plan for the tracked follow-ups):**

- **Cost warns, it never caps.** There is no hard token ceiling that halts a run — by design today.
- **Provider prompt caching is host-level.** The Factory's layout (stable preamble first, per-run
  artifacts) is cache-*friendly*, but it does not itself configure Anthropic/Bedrock prompt-cache
  breakpoints — that's the host's responsibility.

---

## 9. Contributing to the Factory itself

Working on the Factory (not using it on a product)? Build + validate with:

```bash
bun run build          # gen:skills + skill:check + vendor:check
bun test               # Tier-1 harness (fast, deterministic)
bun scripts/version-check.ts   # VERSION and package.json agree
```

- Workflow skills are **generated** from `skills/<name>/SKILL.md.tmpl` — edit the template, run
  `fac gen:skills`, commit both files.
- Every skill: valid frontmatter, ≤ 500 lines, a "Do not activate" block, folder name == `name`.
- `VERSION` is monotonic (4-part); `CHANGELOG.md` is user-facing.
- See [`AGENTS.md`](AGENTS.md) and [`docs/implementation-plan.md`](docs/implementation-plan.md) for
  the full architecture.
