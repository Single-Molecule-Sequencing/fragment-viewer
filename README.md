# Fragment Viewer

[![Website](https://img.shields.io/badge/Website-GitHub_Pages-blue)](https://single-molecule-sequencing.github.io/fragment-viewer/)
[![Repo](https://img.shields.io/badge/GitHub-Repository-black?logo=github)](https://github.com/Single-Molecule-Sequencing/fragment-viewer)
[![Issues](https://img.shields.io/github/issues/Single-Molecule-Sequencing/fragment-viewer)](https://github.com/Single-Molecule-Sequencing/fragment-viewer/issues)

## Quick Links

- [Live site](https://single-molecule-sequencing.github.io/fragment-viewer/) — interactive Cas9 fragment visualizer with dye-color electropherograms
- [GitHub repository](https://github.com/Single-Molecule-Sequencing/fragment-viewer) — source, issues
- [Open issues](https://github.com/Single-Molecule-Sequencing/fragment-viewer/issues) — active work, feature requests

**Part of the [Athey Lab](https://single-molecule-sequencing.github.io/) ecosystem.**

> **Open the tool:** **[single-molecule-sequencing.github.io/fragment-viewer](https://single-molecule-sequencing.github.io/fragment-viewer/)**
>
> No install. No login. Drag-drop your `.fsa` or GeneMapper `.txt` files, or start with the seeded `V059_4-5` / `gRNA3_1-1` demo pair.

Interactive capillary-electrophoresis viewer and Cas9 cut-product predictor for the Single-Molecule Sequencing / Athey lab fluorescent-adapter fragment-analysis (CLC) assay.

The tool turns raw capillary-electrophoresis output into interpretable biology — peak identification, cut-site prediction, post-dA-tailing product modeling, adapter-ligation compatibility, and publication-ready figures — entirely in the browser.

---

## Why this exists

In our Cleavage–Ligation–Cycling (CLC) assay, a target is released from a Level-0 plasmid by BsaI, ligated between two fluorescent adapters via bridge oligos, cut by Cas9 with a guide RNA of interest, denatured, and run on capillary electrophoresis. Each fluorophore (6-FAM, HEX, TAMRA, ROX) labels a specific strand at a specific end of the construct, so the four peak positions together report both **cut location** and **cut chemistry** (blunt vs N-nt overhang).

The fragment-analysis peak table is readable — but not at scale. The viewer automates peak-to-species mapping, adds quantitative shift analysis vs a no-Cas9 control, models the downstream end-prep + adapter-ligation chemistry, and exports the whole analysis as a single PDF or as separate SVG/PNG figures for manuscript panels.

---

## How to use it (no install)

1. Go to **[single-molecule-sequencing.github.io/fragment-viewer](https://single-molecule-sequencing.github.io/fragment-viewer/)**.
2. The demo loads with `V059_4-5` (uncut control) paired over `gRNA3_1-1` (Cas9-cut) on a 4-channel stacked electropherogram.
3. **To use your own data:** drag-drop one or more `.fsa` files (ABIF binary from the instrument) or GeneMapper `.txt`/`.tsv`/`.csv` exports anywhere in the window. The demo is replaced; your files stay 100% client-side (nothing uploaded).
4. **To share a view:** interact with the plot (zoom, toggle channels, pair a reference sample, pick a gRNA, etc.), then click the **Link** button in the top toolbar. A URL with the full view state encoded in `#view=…` is copied to your clipboard. Send that URL to a collaborator and they open the same view on their machine.

### Input formats

| Format | Extension | Notes |
|---|---|---|
| ABIF (instrument native) | `.fsa`, `.ab1` | Parsed in-browser; peaks auto-called via LIZ calibration; raw traces preserved |
| GeneMapper peak table | `.txt`, `.tsv`, `.csv` | Tab- or comma-delimited; columns `Sample Name, Dye/Sample Peak, Size, Height, Area, Width` |

---

## Generating figures and chromatograms

### Electropherogram (single or paired)

- Front page auto-renders a **4-channel stacked electropherogram** for the active sample.
- `Uncut vs cut → Overlay` shows a reference sample as a **dotted** trace behind the **solid** current sample, per-channel **per-sample normalized** (each sample scales to its own peak max, so intensity differences between runs don't hide the shape/position story).
- `Export` button on the plot offers **SVG, PNG @ 2×/4×/6×/8×, transparent PNG, WebP, JPG** at print or screen resolution. SVG is editable in Illustrator / Inkscape; PNG @ 4× is 300 DPI for full-column publication; PNG transparent is for compositing.

### DNA diagrams (construct + ssDNA cut products)

- Top-bar button **DNA diagrams** opens a modal with:
  - Construct architecture with **PAM** (purple band + orientation arrow) and **cut site** (red dashed + CUT pill + overhang band)
  - Four fluorophore-labeled ssDNA cut products scaled to the construct
  - Cut-product chemistry picker (blunt, ±1, ±4 nt)
- **Bundle export** button downloads both diagrams as a single combined SVG/PNG/WebP, or as two separate files.

### End-structure editor + dA-tailing products

- Below the electropherogram: an interactive zoomed-in cut-site view.
- `+1 / −1` buttons for each of the four strand termini (LEFT.top, LEFT.bot, RIGHT.top, RIGHT.bot) — the geometry updates live and the dA-tailability pill flips emerald ✓ / amber (marginal) / rose ✗ based on overhang type.
- **Post-dA-tailing panel** shows a 4-step reaction diagram per end:
  1. Original Cas9 cut geometry
  2. Taq 5′→3′ exo chewback
  3. Taq 5′→3′ pol + dATP (adds 3′-dA)
  4. T/A adapter ligation (adapter rendered when the end is dA-tail-compatible)

### Full report

- Top-bar **Report** button opens a comprehensive view with five sections:
  - **A.** Dataset summary (stats + dye offsets)
  - **B.** Construct + cut site + expected species table
  - **C.** Paired + annotated stacked electropherograms per sample
  - **D.** Molecular products after Taq end-prep + adapter ligation
  - **E.** Data tables
- **Print / Save as PDF** produces a clean multi-page PDF with page breaks between sections.
- **Export all** downloads every deliverable as separate files sharing a date-stamped prefix: diagrams (SVG + PNG), per-sample chromatograms (PNG @ 4×), peak table (CSV), expected-species table (CSV), and markdown narrative.

### Peak table CSV

- Top-bar **CSV** button downloads a tidy long-format peak table (`sample,dye,size_bp,height,area,width_fwhm_bp`) ready for pandas / R / Excel.

---

## Analytical features

- **Per-peak SNR + noise floor line** — robust MAD-based local noise estimate, dashed 3σ reference line drawn per lane when a raw `.fsa` trace is loaded.
- **Cut-product purity score** — height-weighted fraction of signal matching expected species sizes, color-coded pill on every sample button (green ≥70%, amber 40-70%, rose <40%).
- **Auto-calibrated dye mobility offsets** — one-click calibration from the loaded run using the picked gRNA's predicted cut sizes; robust (median-based, outlier-resistant, ≥3 matches per dye gate).
- **Residual view** — toggle the raw trace into `raw − modeled_gaussian` to see shoulders and peak splits the peak table missed.
- **Peak-shift analysis** — quantitative per-dye bp shift between cut and uncut samples with median, mean, and n matched.
- **Batch heatmap** — 96-sample workhorse view (sidebar tab `Batch Heatmap`) showing sample × expected-species as viridis-colored cells.

---

## Signal preprocessing (per-sample, independent)

When a raw `.fsa` trace is loaded, the Advanced panel exposes a full preprocessing pipeline applied in order `clip → log → baseline → detrend → smooth → derivative`:

- **Smoothing**: Savitzky–Golay (window 5-21, order 2 or 4), moving average, or median filter
- **Baseline subtraction**: rolling-minimum window
- **Detrend**: subtract best-fit linear trend
- **Saturation clip**: cap raw signal at user-chosen ceiling
- **Log10 transform**: dynamic-range compression
- **1st derivative**: emphasizes peak edges / shoulders

In paired view each sample gets its own independent preprocessing pipeline.

---

## Keyboard shortcuts

- `←` / `→` step through samples
- `[` / `]` adjust smoothing ±0.1
- `f` reset zoom
- `1`–`4` toggle B/G/Y/R channels
- `n` toggle noise-floor line
- `r` toggle raw trace overlay
- `?` show keyboard-shortcut cheat sheet
- `Esc` close any modal

---

## Accessibility

- Colorblind-safe palette toggle in the top toolbar (Default · Wong · IBM · Grayscale). Choice persists across sessions.

---

## For developers

```bash
git clone https://github.com/Single-Molecule-Sequencing/fragment-viewer.git
cd fragment-viewer
npm install
npm run dev          # Vite dev server at http://localhost:5173
npm test             # vitest, 139 tests
npm run build        # production build to dist/
```

Architecture notes:

- **Single React component** (`src/FragmentViewer.jsx`, ~8000 lines) — tab-based workflow (TraceTab, PeakId, CutPrediction, AutoClassify, Compare, Heatmap) plus shared components (ConstructDiagram, ProductFragmentViz, EndStructureEditor, PostTailingPanel, StackedChromatogram).
- **Pure helpers are exported + tested**: peak-calling (`callPeaksFromTrace`), preprocessing (`preprocessTrace`, `savitzkyGolay`, `movingAverage`, `medianFilter`, `detrendLinear`), calibration (`autoCalibrateDyeOffsets`), analysis (`computePeakSNR`, `computePurityScore`, `computePeakShiftStats`, `buildHeatmapMatrix`), dA-tailing (`evaluateDATailing`, `predictPostTailing`), export (`exportSvgNative`, `exportSvgAsPng`, `exportSvgAsJpg`, `exportSvgAsWebp`, `buildCombinedSvg`).
- **Shareable URL state**: all significant view state (sample, zoom, channels, pair mode, palette, preprocessing, end offsets) serializes to a URL-safe base64 `#view=…` fragment, decoded on mount.
- **CI**: GitHub Actions runs vitest validation + scaffold-in-sync check + Pages deploy on every push to main.

### Rebuilding the seeded demo from new `.fsa` files

```bash
python3 scripts/fsa_to_json.py path/to/a.fsa path/to/b.fsa --out data/seed.json
python3 scripts/inject_seed_json.py data/seed.json
```

### Adding a gRNA to the lab catalog

Edit `src/FragmentViewer.jsx`, find `LAB_GRNA_CATALOG`, append your entry. See `docs/GRNA_CATALOG.md` for conventions.

---

## Assay details

- **Canonical construct**: 226 bp linear ligated product. `CONSTRUCT.seq` and `CONSTRUCT.components` in `src/lib/constants.js`.
- **Canonical gRNA**: `V059_gRNA3` — bot-strand spacer `AGTCCTGTGGTGAGGTGACG`, AGG PAM, cuts at construct position 132.

---

## Status

Public, client-only, hosted free on GitHub Pages. Current version: **v0.22.0** (April 2026). 139 tests passing. All figures publication-ready at 4×–8× raster resolution, native SVG export for Illustrator editing.

---

## License

MIT. See `LICENSE`.

## Maintainer

Greg Farnum — gregfar@umich.edu — Athey Lab, Department of Computational Medicine and Bioinformatics, University of Michigan.

Repository: https://github.com/Single-Molecule-Sequencing/fragment-viewer
Live tool: **https://single-molecule-sequencing.github.io/fragment-viewer/**
