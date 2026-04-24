---
title: "Fragment Viewer: Technical Report"
subtitle: "Architecture and Module Catalog"
author: "Athey Lab — Single-Molecule-Sequencing"
date: "2026-04-24"
---

# Overview

Fragment Viewer is an interactive, browser-only React artifact for interpreting capillary-electrophoresis (CE) output from the Athey Lab's Cleavage–Ligation–Cycling (CLC) fluorescent-adapter fragment-analysis assay. It takes raw ABIF `.fsa` files or GeneMapper TSV exports, identifies peaks, maps them to the expected molecular species for a given Cas9 cut geometry, and exports publication-ready figures — entirely client-side, with no backend. It is deployed as a static site on GitHub Pages.

# Architecture

The viewer is a Vite + React (JSX, no TypeScript) single-page app with a Tailwind design layer. Everything runs in the browser; data never leaves the client. Layout is a clean split:

- **`src/` React surface** — a single `FragmentViewer.jsx` root orchestrator plus broken-out `components/`, `tabs/`, and `lib/` subdirectories. The refactor from a monolithic component to this layout is tracked in issue #13 (Phases B + C).
- **`src/lib/` pure-JS core** — ABIF parsing, biology model, preprocessing, peak analysis, chromatogram math, view-state encoding, export, report builder. No React dependencies, fully unit-testable in Node.
- **`src/components/`** — visual primitives, chrome, electropherograms, diagrams, editors, modals, drop-zone, export menu, lab-inventory UI.
- **`src/tabs/`** — one JSX module per top-level tab in the viewer UI.
- **`data/`** — seed fixtures (`V059_gRNA3_construct.dna`, `seed_v059-4-5_grna3-1-1.json`, `constructs.yaml`).
- **`scripts/`** — data-ingest helpers (`fsa_to_json.py`, `build_artifact.py`, `inject_seed_json.py`, `regen_scaffold.py`, `audit_imports.py`).
- **`tests/`** — 15 vitest test files (`.test.mjs`), covering classifier, SVG, CSV, dA-tailing, export, FSA parsing, heatmap, preprocessing, residual/calibration, SNR/purity/palette, post-tailing, and three issue-regression suites.
- **`docs/`** — 8 authoritative markdown documents (BIOLOGY — SSOT for the biochemistry — plus ARCHITECTURE, CHANGELOG, CONTRIBUTING, FSA_DEFERRAL, FSA_SUPPORT, GRNA_CATALOG, TUTORIAL).
- **`.github/workflows/`** — `pages.yml` (static deploy), `validate.yml` (CI).

# Module Catalog

## Pure-JS core (`src/lib/`)

| File | Purpose |
|---|---|
| `abif.js` | ABIF (.fsa / .ab1) parser + LIZ size-standard calibration + peak caller (pure JS) |
| `analysis.js` | Derived analytical helpers — signal-to-noise, purity, residuals |
| `biology.js` | Cas9 biology + automated peak classifier (dye/strand/cut math) |
| `chromatogram.js` | Pure plot helpers shared by monolith and broken-out tabs |
| `constants.js` | Dye palette + construct definition + assembly products |
| `export.js` | Figure-export helpers (SVG serialization, PNG/JPG/WebP rasterization) |
| `grna_catalog.js` | Lab-curated gRNA catalog |
| `preprocess.js` | Signal preprocessing (baseline, smoothing, normalization) |
| `report.js` | Pure report-builder (issue #16 extraction) |
| `species.js` | Pure biology + species helpers (issue #16 extraction) |
| `viewstate.js` | URL view-state encoder/decoder + peak-table CSV + ref merge |

## React components (`src/components/`)

| File | Purpose |
|---|---|
| `primitives.jsx` | Leaf design-system components — stateless, prop-only, no cross-component deps |
| `chrome.jsx` | Top-bar toolbar, brand, construct chip, upload/palette/report/link buttons |
| `chromatograms.jsx` | `StackedChromatogram` — 4-channel per-dye lane plot with optional reference overlay |
| `diagrams.jsx` | `ProductFragmentViz` + construct/cut diagrams (4 ssDNA cut products per dye) |
| `species.jsx` | `SpeciesSchematic` SVG cartoons of each molecular species as stacked bars |
| `editors.jsx` | Sidebar editors + per-sample overlay style controls |
| `modals.jsx` | DNA-diagrams modal + one-click report modal |
| `drop_zone.jsx` | `DropOverlay` + `UploadButton`; drag-drop for GeneMapper TSV and ABIF .fsa |
| `export_menu.jsx` | `ExportMenu` popover listing every writable format |
| `lab_inventory.jsx` | `LabInventoryBadge` + `LabInventoryPanel` — lab-catalog cross-reference UI |
| `keyboard_help_modal.jsx` | `?` cheat-sheet opened via `?` key or toolbar button |
| `print_styles.jsx` | Global print-only stylesheet for publication-ready PDF export |

## Tabs (`src/tabs/`)

| File | Purpose |
|---|---|
| `trace_tab.jsx` | Per-sample trace view with interactive peak inspector |
| `peak_id_tab.jsx` | Peak-identification tab: chemistry preset, auto-pick, manual override |
| `cut_prediction_tab.jsx` | `CutPredictionTab` + `OverhangChart` — gRNA-driven product prediction |
| `auto_classify_tab.jsx` | `AutoClassifyTab` + `DyeClusterCard` + `CrossDyeSummary` — classifier UI |
| `compare_tab.jsx` | Paired cut-vs-uncut comparison |
| `heatmap_tab.jsx` | Cross-sample heatmap over dye channels |

## Data (`data/`)

| File | Purpose |
|---|---|
| `V059_gRNA3_construct.dna` | SnapGene reference for the canonical 226 bp V059_gRNA3 construct |
| `seed_v059-4-5_grna3-1-1.json` | Seed demo dataset loaded on first visit |
| `constructs.yaml` | Construct registry used by the viewer + the `clc-construct-registry` skill |

## Scripts (`scripts/`)

| Script | Purpose |
|---|---|
| `fsa_to_json.py` | ABIF `.fsa` batch → seed JSON (canonical ingest path) |
| `build_artifact.py` | GeneMapper TSV → `__DATA__` literal in scaffold (legacy) |
| `inject_seed_json.py` | Seed JSON → DATA literal substitution |
| `regen_scaffold.py` | Regenerate `FragmentViewer.scaffold.jsx` from `FragmentViewer.jsx` |
| `audit_imports.py` | Detect missing imports / orphaned symbols |

## Tests (`tests/`)

15 vitest `.test.mjs` files covering classifier behavior, combined SVG export, CSV + URL round-trip, dA-tailing geometry, FSA parsing, heatmap + shift correction, preprocessing (+ extras), post-tailing products, residual + calibration, SNR / purity / palette, plus three `issues_*_regression.test.mjs` suites for gh#18/19/20, gh#21/22/23, and a general issues-regression file. Current suite: 160 tests, all passing (per `CHANGELOG.md` v0.29.0 notes).

# Key Interfaces

- **UI**: static site served from GitHub Pages at `https://single-molecule-sequencing.github.io/fragment-viewer/`. No login, no backend — drag-drop files to analyze.
- **Input formats**: ABIF `.fsa`/`.ab1` (binary from the CE instrument), GeneMapper `.txt`/`.tsv`/`.csv` peak-table exports. Both parsed entirely client-side.
- **View-sharing**: fragment-encoded URL view-state (`#view=…`) — interact with the plot, click "Link", share the URL; collaborator opens the identical view. Encoder/decoder in `src/lib/viewstate.js`.
- **Export**: single PDF, per-figure SVG, PNG @ 2×/4×/8×, transparent PNG, JPG, WebP. Plug-in format: one-line addition to the `entries` map in `export_menu.jsx` plus one case in `doExport`.
- **Skills layer**: the repo ships a skill-orchestrator design that mirrors viewer behavior as Python skills installed in ont-ecosystem: `fragment-viewer` (orchestrator), `cas9-cut-predictor` (Python port of cut/PAM/product math — same 8 assertions as the JSX vitest), `genemapper-parser` (locked schema spec), `clc-construct-registry` (backed by `data/constructs.yaml`), `clc-visualizations` (matplotlib equivalents of the viewer figures).

# Design Decisions

From `CLAUDE.md` and `docs/BIOLOGY.md`:

- **Biology is a single source of truth.** `docs/BIOLOGY.md` holds the authoritative dye/strand/cut conventions. Any code change that touches biology (dye pairing, cut model, template/PAM-side labeling, construct sizes) must update `BIOLOGY.md` in the same commit. Asymmetric updates are the #1 historical source of bugs.
- **Dye pairing**: `(B, Y) at Adapter 1, (G, R) at Adapter 2`. Codified in `DYE_STRAND`. Earlier versions had this reversed.
- **Cut site convention**: 3 bp 5' of the PAM, between protospacer positions 17 and 18. No other convention is used anywhere.
- **Lab catalog lives in JSX, not a separate JSON file.** Intentional — the catalog is small, self-documenting, version-controlled alongside the viewer. Revisit past ~100 entries.
- **No server, ever.** All data stays in the browser. The viewer is publishable and shareable because it has no backend.
- **SVG + data-driven viewBox requires explicit `width`/`height`**; `w-full` stretches in-browser while canvas export uses the intrinsic viewBox, producing visually different live vs exported output. Captured as a learned preference from the gh#23 fix.
- **SVG text inside `<rect>` or `<circle>`** needs `dominantBaseline="central"` for visual centering (SVG default is "alphabetic"). Three gh#21 sub-fixes collapsed to this primitive.

# Integration Points

- **ont-ecosystem** — hosts the canonical skill definitions that mirror the viewer's analysis (`fragment-viewer`, `cas9-cut-predictor`, `genemapper-parser`, `clc-construct-registry`, `clc-visualizations`). Symlink chain: `~/.claude/skills/<name>` → `~/repos/ont-ecosystem/skills/<name>/SKILL.md` → `<viewer>/skills/<name>/SKILL.md`.
- **GitHub Pages** — static build deployed by `.github/workflows/pages.yml`. Public URL served at the named org subdomain.
- **lab-wiki / decisions** — assay-biology decisions link back to `docs/BIOLOGY.md`.
- **`data/constructs.yaml`** is the canonical construct registry consumed both by the viewer and by `clc-construct-registry`.

# Current Metrics (as of 2026-04-24)

- Commits: 80 total
- Last commit: `afaede9` — "readme: pin site + issues badges to top for visibility" (2026-04-24)
- Package version: `0.29.0` (see `package.json`)
- Open issues: 1
  - #24 Accept SnapGene files with alternate targets and upload multiple gRNAs (update target/gRNA graphics and logic)
- React components: 12 `.jsx` files under `src/components/`
- Tabs: 6 `.jsx` files under `src/tabs/`
- Pure-JS core modules: 11 `.js` files under `src/lib/`
- Tests: 15 `.test.mjs` files under `tests/` (160 tests, all passing)
- Data files: 3 under `data/`
- Scripts: 5 Python helpers under `scripts/`

# Roadmap / Open Work

- **gh #24** — SnapGene alt-target import + multi-gRNA upload with corresponding target/gRNA graphics updates. Large feature; out of scope for v0.29.0.
- Refactor completion: `src/FragmentViewer.jsx` + `FragmentViewer.scaffold.jsx` still exist as the orchestrator root; the issue-#13 / issue-#16 decomposition is functionally complete but a final "remove the scaffold" step is deferred.

# Links

- Live site: https://single-molecule-sequencing.github.io/fragment-viewer/
- Repository: https://github.com/Single-Molecule-Sequencing/fragment-viewer
- Issues: https://github.com/Single-Molecule-Sequencing/fragment-viewer/issues
- Assay biology (SSOT): `docs/BIOLOGY.md` in-repo
