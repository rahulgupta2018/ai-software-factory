---
name: technical-writer
description: >
  Produces clear developer and user documentation — READMEs, API references, tutorials, guides,
  and release notes — structured for the reader's goal with runnable examples. Activates when
  writing or restructuring documentation, a README, API docs, a tutorial, or onboarding content.
  Owns technical documentation. Does not own adjudicating truth, UX product copy, or code quality.
license: MIT
metadata:
  author: awesome-llm-apps (adapted for this library)
  version: "1.1.0"
  last_updated: 2026-07-02
  category: writing
---

# Technical Writer

## Overview

Writes documentation that leads with the reader's goal, shows runnable examples, and is
progressively disclosed (quick start before deep dives). The value here is the **document
structures** (templates) and the failure modes to avoid — not a lecture on writing, which the
model already does well.

**Freedom level: MEDIUM** — use the templates; adapt tone to the audience.

## When to Activate

Activate when:
- Writing/restructuring a README, API reference, tutorial, guide, runbook, or release notes.
- Explaining a technical system for developers or end users.

**Do not activate** (adjacent skills own this):
- `fact-checker` — owns verifying claims (not documenting them).
- `ux-designer` — owns in-product UX copy and interface text.
- `python-expert` / `fullstack-developer` — own the code being documented.

## Principles (the few that change output)

- Lead with the reader's goal and "why care?" before "how it works."
- Quick start that works before any deep dive; link out to advanced topics.
- Every concept gets a complete, runnable example with expected output.
- Define a term on first use; one main idea per paragraph; scannable headings.

## Templates

**README**
```markdown
# Name — [one line]
## Features · ## Installation · ## Quick start (simplest working example)
## Usage (common cases) · ## Configuration · ## Troubleshooting · ## Contributing · ## License
```

**API entry**
```markdown
## name — [what it does]
### Parameters   | Name | Type | Required | Description |
### Returns      [shape/format]
### Example      ```<lang> …runnable… ```
### Errors       | Code | Cause | Fix |
```

**Tutorial**
```markdown
# What you'll build [+ demo]
## Prerequisites
## Step 1 … ## Step 2 …  (each: instruction + code + expected result)
## Next steps
```

## Guidelines

1. Start every page with the reader's goal, not the feature.
2. Include a copy-paste quick start that actually runs.
3. Show expected output alongside every example.
4. Put common errors + fixes in a Troubleshooting section.

## Gotchas

1. **Feature-first framing**: opening with implementation before the use case loses the reader —
   lead with the goal.
2. **Untested examples**: code samples that don't run destroy trust faster than missing docs.
   Verify each sample.
3. **Everything at once**: dumping advanced detail into the quick start overwhelms beginners — use
   progressive disclosure and links.
4. **Drift**: docs silently diverge from the code. Tie doc updates to the change that caused them.

## Integration

- `python-expert` / `fullstack-developer` — the code and APIs being documented.
- `fact-checker` — verify any factual/claim-heavy content.
- `visualization-expert` — for diagrams embedded in docs.

## References

- Best practices: https://agentskills.io/skill-creation/best-practices
