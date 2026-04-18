---
name: clc-visualizations
description: Generate publication-quality matplotlib figures of CLC fragment-analysis data — electropherograms, construct diagrams, Cas9 cut markers, ssDNA product cards, and cross-dye summaries — without rendering the React fragment-viewer. Use when building manuscript figures, headless analysis reports, or batch QC plots for the CLC assay. Triggers on: fragment analysis figure, electropherogram plot, Cas9 cut diagram, CLC visualization, fragment-viewer matplotlib, ssDNA product render, dye cluster figure.
metadata:
  triggers:
    - fragment analysis figure
    - electropherogram plot
    - Cas9 cut diagram
    - CLC visualization
    - fragment-viewer matplotlib
    - ssDNA product render
    - dye cluster figure
---

# CLC Visualizations

Headless matplotlib equivalents of the visualizations in the fragment-viewer React app. Use this when:

- You need a publication-quality figure for a manuscript and the React viewer's screenshot is not enough.
- You are running batch QC on dozens of CE plates and want one PNG per sample without opening the browser.
- You are wiring CLC fragment analysis into another lab tool (e.g. Snakemake pipeline) that cannot run a React app.

The output figures intentionally mirror the React viewer's visual conventions (4-dye color palette tied to BIOLOGY.md, construct layout, scissors at cut site, etc.) so that the matplotlib output and the in-browser view stay legible side by side.

## What it produces

| Function | Mirror of (in JSX) | Output |
|---|---|---|
| `plot_electropherogram(peaks, sample, ...)` | TraceTab Gaussian-sum SVG | One panel per dye; smoothed traces with optional LIZ overlay |
| `plot_construct(construct)` | Cas9 Cut Prediction tab construct architecture bar | Horizontal stacked bar of components with dye chips at termini |
| `plot_cut_diagram(construct, grna, overhang)` | Selected-gRNA panel | Construct with scissors at cut, amber overhang band, LEFT/RIGHT labels |
| `plot_ssdna_products(grna, products)` | Product fragment visualization | 4 ssDNA strands with dye circles, direction arrows, template/PAM labels |
| `plot_cluster_summary(classification, sample)` | Per-dye cluster cards | Grid of dye cluster cards with main peak + relative sizes |
| `plot_cross_dye_summary(classification)` | Cross-Dye Summary | Δ chart for (B,Y) and (G,R) pairs with chemistry interpretation |

All functions return a matplotlib Figure. Save to PNG/SVG/PDF via `fig.savefig(...)`.

## Quickstart

```bash
# Render the bundled blue_export.txt as a 4-panel electropherogram for one sample
python scripts/clc_visualizations.py electropherogram \
  --tsv ../../data/blue_export.txt \
  --sample V059_3-2 \
  --out /tmp/V059_3-2_trace.png

# Render the Cas9 cut diagram for V059_gRNA3 with a 4 nt 5' overhang chemistry
python scripts/clc_visualizations.py cut-diagram \
  --construct V059_gRNA3 \
  --spacer ACGTACGTACGTACGTACGT \
  --overhang 4 \
  --out /tmp/cut.png

# Batch render electropherograms for every sample in a TSV
python scripts/clc_visualizations.py batch \
  --tsv ../../data/blue_export.txt \
  --outdir /tmp/figures/
```

## Library API

```python
from clc_visualizations import (
    plot_electropherogram,
    plot_construct,
    plot_cut_diagram,
    plot_ssdna_products,
    DYE_COLORS,
)

# DYE_COLORS = {"B": "#1e6fdb", "G": "#16a34a", "Y": "#ca8a04", "R": "#dc2626", "O": "#ea580c"}

import json
peaks = json.load(open("data/fa_data.json"))["peaks"]
fig = plot_electropherogram(peaks, sample="V059_3-2", smoothing=1.0)
fig.savefig("V059_3-2.pdf", bbox_inches="tight")
```

## Hard rules

1. **Dye colors come from `DYE_COLORS` in this skill.** Mirrors `tailwind.config.js::theme.extend.colors.dye` in fragment-viewer. Update both together. Tied to BIOLOGY.md §3.
2. **Cut convention is 3 bp 5' of PAM, between protospacer positions 17 and 18.** Inherits from `cas9-cut-predictor`.
3. **Plots are intentionally minimal.** No grid, no top/right spines, sans-serif title only. Designed to drop into a manuscript figure with minimal post-processing.

## Cross-references

- `fragment-viewer` skill — interactive React equivalent.
- `cas9-cut-predictor` skill — provides the cut and product math; `plot_cut_diagram` and `plot_ssdna_products` import from it.
- `genemapper-parser` skill — `plot_electropherogram` consumes its output schema directly.
- `clc-construct-registry` skill — provides the construct lookup for cut diagrams.

## Tests

```bash
python -m pytest tests/
```

Smoke tests render each function on the bundled V059 dataset and assert the figure is non-empty (>1 KB PNG).
