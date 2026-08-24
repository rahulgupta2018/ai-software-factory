# Code-Review Plan — Skills & Backing Code (releases 0.54.0.0 → 0.61.0.0)

*Created 2026-08-12 · scope: everything the Factory authored across the recent releases (new PLAN
skills, the infra lane, the prototype/delivery lanes, and the design-phase + install/cache changes).*
*Vendored craft skills are byte-identical from `agent-skills` and are reviewed **upstream**, not
here — only their vendoring wiring is in scope.*

---

## 0. What changed (review targets by release)

| Release | Phase | New / changed skills (authored) | Backing code |
|---|---|---|---|
| 0.54.0.0 | tooling | — | `lib/install-plan.ts` (drift check), `scripts/install.ts` (`--check`/`--soft`) |
| 0.55.0.0 | design | `plan-design` (stacked Mermaid nav) | `test/fixtures/plan-design.json` |
| 0.56.0.0 | design + infra | `plan-design` (motion-as-code) | `lib/prompt-cache.ts`, `hosts/{claude,codex}.ts`, `scripts/host-config.ts` |
| 0.57.0.0 | build craft | *(vendored upgrades only)* | `vendor-skills/manifest.json`, reference-product pins |
| 0.58.0.0 | 10 delivery | **`plan-delivery`** (new) | `lib/delivery-plan.ts`, `lib/run.ts` (`gateTier` signoff), `templates/PLAN.template.md`, `examples/reference-product/PLAN.md`, `test/pipeline-acceptance.test.ts` |
| 0.59.0.0 | 9 prototype | **`prototype`** (new) | `lib/prototype-plan.ts`, `agents/designer.md` |
| 0.60.0.0 | 8 infra | **`plan-infra`, `infra-review`, `provision`** (new) | `lib/infra-plan-verify.ts`, `agents/platform.md`, `lib/schema.ts` (`tech_bindings.infra`), reference GCP fixture |
| 0.61.0.0 | 8b infra | **`cost`, `drift`** (new); `plan-infra` extended | `lib/infra-cost-report.ts`, `lib/infra-drift-report.ts`, `lib/schema.ts` (infra binding growth) |

**Net authored surface to review:** 8 new/changed workflow skills, 7 new pure-verifier libs, 2 new
agents, `schema.ts` binding growth, host-config/cache changes, and the delivery/infra templates +
reference fixtures.

---

## 1. Findings to confirm or close first (found during scoping)

1. **[High] Tier-2 rubric coverage gap. ✅ CLOSED (0.62.0.0, 2026-08-12).** The 7 new substantive
   skills shipped **without a per-skill content rubric**, while every comparable PLAN/SHIP skill has
   one (`plan-arch`, `plan-design`, `deploy`, `security`, `ship`, …). Now authored for all seven
   (`test/fixtures/{plan-delivery,prototype,plan-infra,infra-review,provision,cost,drift}.json`),
   each pinning its core discipline with a weight-3 `require_all` dimension — teeth verified (real
   body 1.00; core discipline stripped → 0.43–0.57, below the 0.9 threshold). (The safety/context
   skills `careful`/`freeze`/`guard`/`context-*` also lack rubrics, but that is the established
   pattern for thin mechanical wrappers — out of scope.)
2. **[Cosmetic] `docs/implementation-plan.md:1012`. ✅ CLOSED (0.65.0.0).** The Phase 6 header
   carried a mojibake where a status emoji belongs — replaced with 🚧 (in progress).

Everything else scoped clean: all 7 new skills are ≤500 lines, carry a Do-not-activate block and an
ownership note, chain artifact seqs coherently (`02b/02c/02d/02e/02f/06f/06g`), all 6 new libs have
tests, and `bun run build` + `bun test` (657 tests) are green.

---

## 2. Review order (risk-first)

Review the **highest-blast-radius** artifacts first — the infra apply path can change real cloud
state, so its fail-closed behaviour matters most.

1. **Infra provision path** — `lib/infra-plan-verify.ts` + `skills/provision` + `skills/infra-review`
   → **✅ 2 fail-opens FIXED (0.63.0.0):** case-sensitive severity (`HIGH`→`low`); un-normalised
   action verb (Pulumi `replace`) read as a no-op → protected-DB replace passed.
2. **Infra cost/drift** — `lib/infra-cost-report.ts`, `lib/infra-drift-report.ts` + `skills/{cost,drift}`
   → **✅ 1 FIXED (0.64.0.0):** drift "security-sensitive first" was left to prose; now enforced +
   tested in `verifyDriftReport`. Cost reviewed clean (advisory-only by design).
3. **Delivery gate** — `lib/delivery-plan.ts` + `lib/run.ts` (`gateTier` signoff) + `skills/plan-delivery`
   → **✅ clean.** Traceability/dup/single-active/monotonic-advance all correct; `gateTier` fail-closed.
4. **Prototype coverage** — `lib/prototype-plan.ts` + `skills/prototype`
   → **✅ clean + 1 hardening (0.66.0.0).** Token-fidelity fails *closed*; link-coverage avoids
   double-reporting. Follow-up: blank screen/page ids were handled inconsistently across the rules
   and the roll-up — now rejected fail-closed by a `screen-id` rule, and `coverageSummary` filters
   blank ids to agree with the gate.
5. **Design-phase skill changes** — `skills/plan-design` (motion + nav) against its rubric
   → **✅ clean.** Covered by the teeth-verified rubric dimensions (0.55/0.56).
6. **Cache + install tooling** — `lib/prompt-cache.ts`, `hosts/*`, `lib/install-plan.ts`
   → **✅ clean.** Unit-tested with negatives (stable-first invariant, breakpoint cap, drift/prefix).
7. **Schema + bindings** — `lib/schema.ts` `tech_bindings.infra` growth
   → **✅ clean.** Near-miss guard correctly curates long/distinctive names; schema validates
   (vendor:check + acceptance green).
8. **Docs** — plan/changelog consistency + the mojibake fix → **✅ FIXED (0.65.0.0).**

---

## 3. Per-artifact-type checklists

### 3a. Workflow skills (`skills/<name>/SKILL.md.tmpl`)

- [ ] **Authoring standard:** folder == frontmatter `name`; ≤500 lines; Do-not-activate block;
      frontmatter carries `version`/`last_updated`/`layer`/`priority`; explicit triggers.
- [ ] **Activation precision:** description fires on the right cues and the Do-not-activate block
      delegates to the correct sibling — no overlap (e.g. `cost` vs `benchmark`, `drift` vs `qa`,
      `infra-review` vs `security`, `plan-delivery` vs `spec`/`plan-product`).
- [ ] **Ownership boundary — read vs write:** report-only skills (`cost`, `drift`, `infra-review`)
      must **never mutate** state; `provision` is the **only** infra skill that applies; a skill must
      not write another's artifact or touch `stack.yaml` unless it owns it.
- [ ] **Gate discipline:** hard gate on every irreversible step (`provision` apply; PLAN→BUILD
      sign-off); `infra-review` **blocks** `provision` on high/critical; `cost` **warns, never
      blocks** (measure-and-warn); `drift` reports only. Verify the wording matches the intent.
- [ ] **Artifact contract:** correct seq + `fac run artifact` call; inputs declared with hashes;
      the chain resolves (`02d → 02e → 02f → 06f → 06g`).
- [ ] **Composition, not re-derivation:** wraps the right craft skills (`plan-delivery` →
      `project-planner` + `sprint-planner`; `prototype` → `frontend-design` + `visualization-expert`;
      `plan-infra` → `terraform-expert`/`pulumi-expert` + `gcp-*-expert`) rather than re-deriving them.
- [ ] **Install-prefix safety:** body cross-refs use base names (the `/fac-` rewrite is install-time);
      no `/health`-style false positives; new skill names don't collide with a built-in command.
- [ ] **Completeness discipline** (the recurring failure mode): does the skill force the *systematic*
      output, not just a representative sample? (e.g. `plan-infra` enumerates every environment/pillar
      it claims; `prototype` covers every screen.)

### 3b. Pure verifier libs (`lib/*.ts`)

- [ ] **Purity:** no network / no fs in the verifier core; offline-testable against a fixture (the
      `lib/tls-verify.ts` mould).
- [ ] **Fail-closed:** malformed/missing input must default to the **safe** verdict — block, not
      allow. Critical for `infra-plan-verify` (a plan it can't parse must not pass the gate) and
      `delivery-plan` (an unparseable PLAN must not advance).
- [ ] **Every rule has a negative test** — the project invariant. Confirm each branch has a failing
      twin, and add one where missing.
- [ ] **Domain-specific correctness:**
  - `infra-plan-verify.ts` — no protected destroy/replace without explicit consent; no long-lived
    key; no secret in state; high-severity policy blocks. Try to construct a plan that sneaks a
    destroy past it.
  - `infra-cost-report.ts` — over/near/spike thresholds vs `cost_budget`; correct driver
    attribution; never blocks.
  - `infra-drift-report.ts` — **security-sensitive drift ranked first** (open firewall leads);
    modified/deleted/unmanaged classified correctly.
  - `delivery-plan.ts` — goal traceability (orphan increment fails); unique ids/orders; single
    active increment; forward-only advance (a backward jump needs `reopened`).
  - `prototype-plan.ts` — coverage: every screen → a page; no dangling nav link; no invented token.
  - `prompt-cache.ts` — stable-first invariant; breakpoint cap; below-threshold prefix → no
    breakpoint; unsupported host → no markers.
  - `run.ts` `gateTier` — the `signoff` flag actually blocks the first build and only routine
    afterward.

### 3c. Schema & bindings (`lib/schema.ts`)

- [ ] Every new `tech_bindings.infra` key (`org`, `environments[]`, `runtimes`, `data_stores`,
      `messaging`, `observability`, `cost_budget`, `drift`, `mlops`, `protected_resources`) validates,
      carries an `x-owner` annotation, and is populated in the reference product so `vendor:check` +
      the Tier-0 acceptance test resolve.
- [ ] Near-miss binding detection still guards the fail-open case (a mistyped security binding name).

### 3d. Agents (`agents/*.md`)

- [ ] `agents/platform.md` — loads the infra skills, correct tool allowlist, handoff to Release
      Engineer; owns the lane end-to-end and nothing outside it.
- [ ] `agents/designer.md` — gains `/prototype` alongside `/plan-design`, no new persona, no scope
      creep into the build.

### 3e. Rubric fixtures (`test/fixtures/*.json`) — **close the gap from §1**

- [ ] Author a per-skill content rubric for each of the 7 new skills, pinning its core discipline
      with `require_all`-only anchors so it has **teeth**, and prove each: real body ≥ pass_threshold,
      discipline stripped → dimension fails. Suggested disciplines to pin:
  - `provision` → the offline plan-verify + hard-gate-before-apply
  - `infra-review` → high/critical **blocks** provision
  - `cost` → measure-and-warn, never blocks
  - `drift` → report-only + security-sensitive drift first
  - `plan-infra` → landing-zone + elicited environments (no baked ladder) + pillars
  - `plan-delivery` → traceable increment backlog + PLAN→BUILD sign-off
  - `prototype` → renders-not-redesigns + coverage gate

### 3f. Vendored-skill wiring (0.57) — integrity only

- [ ] `vendor:check` green; `manifest.json` sha256 matches the vendored bytes; no in-place edit of a
      vendored copy; reference-product pins match the manifest versions. (The skill *content* is
      reviewed in `agent-skills`, not here.)

---

## 4. How to execute

- **Gate 0 (already green):** `bun run version:check && bun run build && bun test`. Re-run after any
  change; the `--soft` install-drift line at the end of `build` also flags a stale install.
- **Per-lib deep review:** run `/code-review` (medium/high) targeted at each `lib/*.ts` in the §2
  order — these hold the security-sensitive logic and are the best ROI.
- **Per-skill review:** read each `SKILL.md.tmpl` against the §3a checklist; the skills are prose, so
  a human/LLM read beats a diff tool here.
- **Rubric teeth method:** for each new rubric, render the skill body, score it, then re-score with
  the pinned discipline stripped and assert the dimension drops below `pass_threshold` (the pattern
  used for `plan-design`'s nav/motion anchors).
- **Batching suggestion:** (1) infra libs+skills, (2) delivery+prototype libs+skills, (3) rubrics +
  schema, (4) docs. Each batch ends on a green `bun test`.

---

## 5. Out of scope

- Vendored craft-skill *content* (reviewed upstream in `agent-skills`).
- The pre-existing safety/context skills without rubrics (established pattern).
- Live cloud apply / real `infracost`/`terraform` runs (the Factory is offline-JSON by design; the
  verifiers are what we review, not a live provider).
