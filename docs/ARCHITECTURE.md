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
│   ├── build_artifact.py              GeneMapper TSV → DATA literal in JSX
│   ├── ingest_to_kb.py                LAB_GRNA_CATALOG + samples → ~/lab_knowledge.db
│   └── init_repo.sh                   One-shot git init + gh repo create + push
├── skills/
│   └── fragment-viewer/SKILL.md       Claude skill that triggers on fragment-analysis terms
├── tests/
│   └── classifier.test.mjs            Vitest unit tests on classifyPeaks et al
├── .project/
│   ├── HANDOFF.md                     Session handoff for the next agent
│   ├── PLAN.md                        Current priorities
│   ├── UNBLOCK_PROMPTS.md             Paste-ready prompts to unblock data items
│   └── workspace.yaml                 Workspace metadata for lab-system
└── .github/workflows/
    └── validate.yml                   CI: jsx parse, biology sync, python syntax, ruff, ingest test
```

## 2. The five tabs (in `src/FragmentViewer.jsx`)

Tabs are conditionally rendered from a single `tab` state variable. Each tab is a sub-section of the main `FragmentViewer` component.

| Tab | Roughly | Primary functions used |
|---|---|---|
| Electropherogram | line ~1100 | `dominantPeak`, `gaussianSum`, smoothing helpers |
| Peak Identification | line ~1180 | `classifyPeak`, `assemblyProducts` derivation |
| Cas9 Cut Prediction | line ~1430 | `findPAMs`, `predictCutProducts`, `matchLabCatalog` |
| Auto Classify | line ~1480 | `classifyPeaks` (the big one), `crossDyeSummary` |
| Cross-Sample Comparison | line ~2200 | `summarizeOverhangs`, `purityGrid` |

Line numbers are approximate; use grep when they drift.

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

1. A GeneMapper TSV export is parsed by `scripts/build_artifact.py` into `data/fa_data.json`.
2. The same script substitutes the JSON into `src/FragmentViewer.scaffold.jsx` at the `__DATA__` placeholder, producing `src/FragmentViewer.jsx`.
3. The viewer is opened either as a Claude.ai artifact or via the Vite scaffold and GitHub Pages deploy (see CONTRIBUTING.md §3).
4. All analysis happens client-side; nothing leaves the browser.
5. `scripts/ingest_to_kb.py` reads the JSX (regex-extracts `LAB_GRNA_CATALOG`) and `data/fa_data.json`, writes to `~/lab_knowledge.db` for downstream skills.

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

## 7. What lives outside the repo

- `~/lab_knowledge.db` (SQLite). Tables `lab_grnas` and `fragment_analysis_experiments` are owned by `scripts/ingest_to_kb.py`. Other tables in this DB are owned by other lab tools.
- `~/.claude/skills/fragment-viewer/` (symlink). Points back into `~/repos/ont-ecosystem/skills/fragment-viewer/SKILL.md`, which mirrors `skills/fragment-viewer/SKILL.md` in this repo.
- `~/repos/lab-papers/papers.yaml::projects[fragment-viewer]`. Project registration so `/menu`, the lab query router, and overnight automations see this repo.
