/**
 * Renders the config protocol every skill honours: read the merged context, ask if missing,
 * persist to the owning file. Kept identical across skills so behaviour never drifts.
 */
export function resolveConfigProtocol(): string {
  return [
    '<!-- FACTORY:CONFIG-PROTOCOL (generated — do not edit) -->',
    '### Config protocol',
    '',
    'A product is defined by two files, split by who writes them:',
    '',
    '| File | Owner | Holds |',
    '|---|---|---|',
    '| `PRD.md` | **human** | frontmatter: `product`, `domain`, `meta` · body: the requirements |',
    '| `.factory/stack.yaml` | **`/plan-arch`** | `tech_stack`, `commands`, `skills`, `guardrails`, `escalation_policy`, `tech_bindings` |',
    '',
    'Before doing anything else:',
    '',
    '1. **Read** both — or the merged `.factory/context.gen.yaml` if it is current. Skills bind via `${ctx.*}`.',
    '2. If a value you need is **missing**, ask the user with AskUserQuestion — never guess.',
    '3. **Persist** the answer to the file that *owns* that key, then re-run `fac sync-context`.',
    '   Never write a machine key into `PRD.md`; `sync-context` rejects it.',
    '4. When a key is absent and the user cannot supply it, fall back to your documented generic default.',
    '',
    'Precedence: per-skill `overrides` → merged product context → skill generic default.',
  ].join('\n');
}
