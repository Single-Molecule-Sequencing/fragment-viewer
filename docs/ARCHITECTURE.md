# ARCHITECTURE.md — How the viewer is laid out

This document describes the structure of the fragment-viewer codebase: what file holds what, how the React component is organized, and where each tab's logic lives. Use it to find code; use `docs/BIOLOGY.md` for the biochemistry the code encodes.

## 1. Repository layout

```
fragment-viewer/
├── README.md                          User-facing introduction
├── CLAUDE.md                          Hard rules for AI agents in this repo
├── LICENSE                            MIT
├── src/
│   ├── FragmentViewer.jsx             The single-file React artifact (the viewer)
│   └── FragmentViewer.scaffold.jsx    Same as above with __DATA__ placeholder
├── data/
│   ├── V059_gRNA3_construct.dna       SnapGene reference for the canonical construct
│   ├── blue_export.txt                GeneMapper peak-table export (10 samples)
│   ├── fa_data.json                   Parsed JSON of blue_export.txt
│   └── calibrations/                  Sidecar JSON for dye-mobility offsets (created on first save)
├── docs/
│   ├── BIOLOGY.md                     Canonical biochemistry; SSOT for dye/strand/cut conventions
│   ├── TUTORIAL.md                    Tab-by-tab walkthrough with worked examples
│   ├── ARCHITECTURE.md                This file
│   ├── GRNA_CATALOG.md                Catalog format and how to add entries
│   ├── CHANGELOG.md                   Version history
│   └── CONTRIBUTING.md                Local dev, tests, commit conventions
├── scripts/
│   ├── build_artifact.py              GeneMapper TSV → DATA literal in JSX (legacy)
│   ├── fsa_to_json.py                 ABIF .fsa batch → seed JSON (canonical ingest path)
│   ├── inject_seed_json.py            seed JSON → DATA literal substitution in the scaffold
│   ├── audit_imports.py               cross-file + bundle audit for unresolved imports
│   └── regen_scaffold.py              FragmentViewer.jsx → scaffold with DATA replaced
├── public/
│   └── demo/                          V059_4-5.fsa + gRNA3_1-1.fsa (seeded demo, browser-fetched on mount)
├── tests/                             13 vitest files, 147 tests as of v0.23.0
│   ├── classifier.test.mjs            core classifyPeaks + matchLabCatalog
│   ├── fsa_parser.test.mjs            ABIF parser + LIZ calibration on real fixtures
│   ├── preprocess.test.mjs            Savitzky-Golay, rolling baseline, clip
│   ├── preprocess_extras.test.mjs     moving-average, median, detrend, log, derivative
│   ├── residual_and_calib.test.mjs    computeResidual + autoCalibrateDyeOffsets
│   ├── snr_purity_palette.test.mjs    per-peak SNR, purity score, palette contract
│   ├── csv_and_url.test.mjs           peak-table CSV + URL view-state round-trip
│   ├── heatmap_and_shift.test.mjs     buildHeatmapMatrix + computePeakShiftStats
│   ├── combined_svg.test.mjs          buildCombinedSvg layout math
│   ├── export.test.mjs                SVG / PNG / JPG / WebP guard paths
│   ├── da_tailing.test.mjs            evaluateDATailing LEFT/RIGHT sign conventions
│   ├── post_tailing.test.mjs          predictPostTailing + adapter compatibility
│   └── issues_regression.test.mjs     regression tests for closed issues
├── .project/
│   ├── HANDOFF.md                     Session handoff for the next agent
│   ├── PLAN.md                        Current priorities
│   ├── UNBLOCK_PROMPTS.md             Paste-ready prompts to unblock data items
│   └── workspace.yaml                 Workspace metadata for lab-system
└── .github/workflows/
    └── validate.yml                   CI: jsx parse, biology sync, python syntax, ruff, ingest test
```

## 2. The six tabs (in `src/FragmentViewer.jsx`)

Tabs are conditionally rendered from a single `tab` state variable. Each tab is a sub-section of the main `FragmentViewer` component. To find a tab component in the source, grep the function definition rather than relying on line numbers — the file is ~9500 lines and the positions drift with every release.

| Tab | Component | Navigate with | Primary functions used |
|---|---|---|---|
| Electropherogram | `TraceTab` | `grep "^function TraceTab"` | `buildGaussianPath`, preprocessing pipeline, paired overlay, end-structure editor |
| Peak ID | `PeakIdTab` | `grep "^function PeakIdTab"` | `classifyPeak`, assembly-product derivation |
| Cas9 Cut Prediction | `CutPredictionTab` | `grep "^function CutPredictionTab"` | `findGrnas`, `predictCutProducts`, `matchLabCatalog` |
| Auto Classify | `AutoClassifyTab` | `grep "^function AutoClassifyTab"` | `classifyPeaks`, `autoCalibrateDyeOffsets` |
| Cross-Sample | `CompareTab` | `grep "^function CompareTab"` | overhang summary, purity grid |
| Batch Heatmap | `HeatmapTab` | `grep "^function HeatmapTab"` | `buildHeatmapMatrix`, `heatmapColor` (viridis 5-stop) |

Sidebar registration: search for `const tabs = [` in `Sidebar` — that's the single list the sidebar + FragmentViewer's tab switch both read from.

## 3. Top-of-file constants

Everything biology-related is concentrated in a small block of constants near the top of `FragmentViewer.jsx`. Update these in lockstep with `docs/BIOLOGY.md`.

| Constant | Line ~ | Purpose |
|---|---|---|
| `DATA` | 6 | Inlined peak table (replaced by `__DATA__` in the scaffold). |
| `CHEMISTRY_PRESETS` | 23 | Named presets for blunt + N-nt 5'/3' overhangs. |
| `CONSTRUCT` | 37 | The 226 bp V059 construct: `seq`, `targetRange`, `components`. |
| `DYE_STRAND` | 61 | The (B,Y) + (G,R) pairing convention. |
| `LAB_GRNA_CATALOG` | 432 | Lab-curated gRNA list. Spacers must be 20 nt or `matchLabCatalog` returns null. |

## 4. Data flow

1. **At runtime (primary path).** User opens the public Pages site. `FragmentViewer` mount-effect fetches `public/demo/V059_4-5.fsa` + `public/demo/gRNA3_1-1.fsa` via `fetch()`, parses each through `parseFsaArrayBuffer` (same code path as drag-drop), and populates `DATA.peaks` + `DATA.traces`. User drag-drops their own `.fsa` / `.ab1` / GeneMapper TSV to replace the seed.
2. **At build time (seeded demo).** `scripts/fsa_to_json.py` batch-parses `.fsa` files → `data/seed_*.json`. `scripts/inject_seed_json.py` substitutes the JSON into `src/FragmentViewer.scaffold.jsx` at the `__DATA__` placeholder → `src/FragmentViewer.jsx`.
3. **Client-only.** All analysis happens in the browser. No server. No uploads.

## 5. The `classifyPeaks` function

Located at `src/FragmentViewer.jsx:270`. This is the core automated analysis. Inputs:

- Per-sample peak table (all four dyes plus the orange size standard)
- Construct sequence and target range
- Component sizes (Adapter, OH, Bridge, Target, etc.)
- Assembly products and the lab gRNA catalog
- User-provided thresholds: per-dye dye-mobility offsets, height threshold, match tolerance, cluster tolerance, overhang range

Output: a per-dye list of clusters, each cluster annotated with main peak size, peak count, channel-area share, best-guess identity (computed by area-weighted, inverse-Δ-weighted vote across cluster members), and best matches against both assembly products and predicted Cas9 cut products at every overhang chemistry in the configured range.

If you want to test this function in isolation, see `tests/classifier.test.mjs` and `docs/CONTRIBUTING.md §5`.

## 6. Adding a new tab

If you need to add a sixth tab, also update:

1. The `tab` state's enum (search for `useState("electropherogram")` near the top of the component).
2. The tab strip render (search for the buttons block near the top of the JSX return).
3. `docs/TUTORIAL.md` §2 (one new sub-section).
4. This document's table in §2.

