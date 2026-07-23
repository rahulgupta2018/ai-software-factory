---
name: visualization-expert
description: >
  Chooses the right chart for the message and designs honest, clear data visualisations and
  dashboards. Activates when selecting a chart type, designing or improving a chart/dashboard, or
  presenting data visually. Owns chart selection and visual data communication. Does not own the
  underlying statistical analysis, UX interface design, or prose documentation.
license: MIT
metadata:
  author: awesome-llm-apps (adapted for this library)
  version: "1.1.0"
  last_updated: 2026-07-02
  category: data
---

# Visualization Expert

## Overview

Matches chart type to the analytical message, then designs it for clarity, honesty, and
accessibility. The value is the selection rule and the anti-patterns that mislead — not a tour of
chart types the model already knows.

**Freedom level: MEDIUM** — selection guidance is firm; styling adapts to the medium.

## When to Activate

Activate when:
- Choosing a chart type or designing/improving a chart or dashboard.
- Presenting data insights visually.

**Do not activate** (adjacent skills own this):
- `ux-designer` — owns interface/interaction design (beyond the chart itself).
- `technical-writer` — owns the surrounding prose/report.
- (statistical analysis of the data is a separate concern from visualising it.)

## Chart Selection (by message)

- **Comparison** → bar/column · **Trend over time** → line/area · **Distribution** → histogram/box
- **Relationship** → scatter/bubble · **Part-to-whole** → stacked bar (pie only for ≤3 slices)
- **Geospatial** → choropleth/symbol map · **Ranking** → sorted bar.

Pick by the sentence you want the reader to say, then default to the simplest chart that says it.

## Design Defaults

Default to matplotlib/seaborn for static, Plotly for interactive. Start axes at zero for bar
charts; label axes and units; sort categories meaningfully; use a colour-blind-safe palette; and
remove chart junk (gridline clutter, 3D, heavy borders).

## Guidelines

1. One message per chart; if it needs a paragraph to explain, split it.
2. Label axes/units and state the source; annotate the key point directly.
3. Use sequential/diverging palettes that are colour-blind safe; never rely on colour alone.
4. Provide a runnable code snippet with the recommendation.

## Gotchas

1. **Truncated y-axis on bars**: starting above zero exaggerates differences and misleads — bars
   start at zero (line charts may crop with a clear note).
2. **Dual y-axes**: two scales on one chart imply correlations that may not exist; prefer two
   aligned charts.
3. **Pie overload**: pies with many slices are unreadable; use a sorted bar beyond ~3 categories.
4. **Rainbow/jet colormaps**: perceptually non-uniform and colour-blind hostile; use viridis or a
   purpose-built palette.
5. **3D and dual encoding**: 3D distorts values; encoding one variable twice (colour + size)
   confuses more than it clarifies.

## Integration

- `technical-writer` — charts embedded in reports/docs.
- `ux-designer` — charts inside a product UI.
- `python-expert` — implementing the plotting code.

## References

- Best practices: https://agentskills.io/skill-creation/best-practices
