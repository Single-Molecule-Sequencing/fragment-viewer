# CHANGELOG.md

All notable changes to this repository.

The format is loosely [Keep a Changelog](https://keepachangelog.com/). This project does not yet follow strict semver; minor version bumps are made when a new analysis tab is added or an existing classifier behaviour changes.

## Unreleased

(Empty.)

## v0.7.0 — 2026-04-18

### Added
- **Tailwind v3 + PostCSS + Autoprefixer** wired into the Vite pipeline. Without this the deployed Pages site rendered raw unstyled HTML; the Claude.ai artifact runtime had been hiding the gap. Build now emits a real CSS bundle (~22 KB / 4.8 KB gzipped).
- **Inter and JetBrains Mono** loaded via Google Fonts in `index.html`.
- **`tailwind.config.js`** extends the theme with dye-channel colors (`bg-dye-B` etc.) tied to BIOLOGY.md and a `shadow-soft` utility.
- **Design system primitives** in `src/FragmentViewer.jsx`: `Panel`, `Stat`, `Pill`, `DyeChip`, `Field`, `ToolButton`. All exported and reusable.
- **Chrome rewrite**: dark 48 px toolbar with brand mark, construct chip, sample count, dark-variant ToolButtons. 208 px sidebar split into Workflow tabs + Lab tools external links. Light status bar with tone-coded calibrated/uncalibrated icon and clickable version link.
- **`skills/cas9-cut-predictor`**: Python port of `findGrnas` + `predictCutProducts`. CLI + library + 8 pytest assertions mirroring the JSX vitest cases.
- **`skills/genemapper-parser`**: Python port of `parseGenemapperTSV`. Locked output schema spec for both `build_artifact.py` and the in-browser DropZone. 6 pytest assertions.
- **`skills/clc-construct-registry`**: YAML registry of CLC constructs at `data/constructs.yaml`. CLI list/get/validate/json. V059_gRNA3 today; new constructs append here first.
- **`skills/clc-visualizations`**: matplotlib mirror of every fragment-viewer figure (electropherogram, construct, Cas9 cut diagram, 4-ssDNA products). Headless, publication-quality, color tokens mirror the Tailwind theme. 4 example PNGs committed.
- **`docs/LAB_INTEGRATIONS.md`**: ASCII graph + tables for every upstream / downstream / lateral connection.
- **`lab-wiki/entities/concepts/clc-fragment-analysis.md`**: cross-cutting concept page linking the CLC assay across projects, decisions, and skills.
- **`lab-papers/papers.yaml::projects[fragment-viewer].related_skills`**: 10 entries (the 4 extracted skills + 6 sibling lab skills).
- **CI**: pytest jobs for all 3 testable skills, `clc-construct-registry validate`, ruff on `skills/`, scaffold-in-sync, fa-data-schema, ingest-roundtrip, biology-sync. Plus `cache: npm` removed from setup-node since `package-lock.json` is gitignored.
- **GitHub Pages enabled**, deployed at the randomized private-repo subdomain. `vite.config.js::base` set to `/` for private-repo serving.

### Changed
- **Global slate-* → zinc-* palette migration** in the JSX (249 replacements). Unifies the tab-body color story with the new chrome.
- **AutoClassifyTab dye-mobility offset panel** rebuilt with `<Panel>`, `<ToolButton>`, and `<DyeChip>` primitives. Replaces ~70 lines of bespoke styling.
- **`src/FragmentViewer.jsx`** exports 12 helpers and constants (was 1) so the Vitest harness can import directly without rendering UI.
- **`scripts/regen_scaffold.py`** finds the `DATA` line dynamically by scanning, so future inserts above DATA do not break the scaffold round-trip.

### Fixed
- **`classifyPeaks` vote-tally bug** at line 381: the `(voteMap.get(key) || { w: 0, ... }).pred` sentinel always evaluated truthy because the fallback object had its own `.pred`. Reduced to `const existing = voteMap.get(key); existing ? ... : ...`. Caught by the new Vitest harness.
- **CI `esbuild --loader=jsx`** flag form rejected by current esbuild releases. Switched to `--loader:.jsx=jsx`.

## v0.6.0 — 2026-04-18

### Added
- `src/FragmentViewer.scaffold.jsx`: scaffold form of the viewer with the `DATA` literal replaced by `__DATA__`. `scripts/build_artifact.py` now round-trips end to end.
- `scripts/regen_scaffold.py`: scans for the `DATA` line dynamically and rewrites the scaffold so future inserts above `DATA` do not break the build.
- `docs/ARCHITECTURE.md`, `docs/GRNA_CATALOG.md`, `docs/CONTRIBUTING.md`, `docs/FSA_DEFERRAL.md`: backfill of docs the SKILL and HANDOFF cross-referenced.
- `.project/PLAN.md`, `.project/workspace.yaml`, `.project/UNBLOCK_PROMPTS.md`: project metadata for lab-system and the unblock-prompts kit.
- CI: empty-spacer count, JSON schema check on `data/fa_data.json`, ruff on `scripts/`, `ingest_to_kb.py --all` against `/tmp/test.db`, `scaffold-in-sync` job, `unit-tests` job (vitest).
- Vitest harness with 19 unit tests on `classifyPeaks`, `matchLabCatalog`, `predictCutProducts`, `findGrnas`, `normalizeSpacer`, `componentSizesFrom`, BIOLOGY constants (`tests/classifier.test.mjs`).
- Vite scaffold (`package.json`, `vite.config.js`, `index.html`, `src/main.jsx`) + GitHub Pages deploy workflow (`.github/workflows/pages.yml`).
- Drag-and-drop GeneMapper TSV ingestion in the viewer header (`<DropZone>`, `parseGenemapperTSV`); on drop the parsed peaks replace `DATA.peaks` and a `dataKey`-keyed remount re-initializes every tab.
- PDF report export on the Auto Classify tab via `window.print()` and a `<PrintStyles>` `@media print` block.
- Dye mobility offsets persist to `localStorage`; Download JSON / Upload JSON buttons in the offsets panel for sharing calibration sidecars.
- `scripts/cross_link_smaseq.py`: substring-matches `fragment_analysis_experiments` rows against the SMA-seq registry to surface CE-to-SMAseq provenance.
- Skill installation: symlink chain `~/.claude/skills/fragment-viewer` → `~/repos/ont-ecosystem/skills/fragment-viewer/SKILL.md` → repo `skills/fragment-viewer/SKILL.md`. Adds canonical-repo-location header to the SKILL.
- Project registration in `lab-papers/papers.yaml::projects`. `/menu`'s `gather_context.py` now lists `fragment-viewer` as an active project.
- 5 fragment-viewer paths added to `lab-query-router/lab_query/settings.py::sources`; reindex grew the corpus by 73 chunks.
- Post-edit hook `~/.claude/hooks/post-edit-fragment-viewer.sh` registered in `~/.claude/settings.json::PostToolUse`; resyncs the KB when the JSX catalog block or `data/fa_data.json` change.
- systemd user timer `fragment-viewer-ingest.timer` (03:30 nightly) wired to `~/.local/bin/fragment-viewer-ingest` wrapper. Wrapper sidesteps systemd argv whitespace parsing.
- Decision record `lab-wiki/decisions/2026-04-18-ont-registry-ce-fragment-platform.md` (status proposed) for the `platform: CE-fragment` ONT-registry extension; lab-wiki autonomous tooling auto-anchored it to SMS Textbook Part 12 §12.F.

### Changed
- 12 helpers and constants in `src/FragmentViewer.jsx` are now `export`ed so the test harness can import them. Module remains a valid React default-export artifact.

### Fixed
- `classifyPeaks` vote-tally bug: `(voteMap.get(key) || { w: 0, ... }).pred` always evaluated truthy because the fallback object had its own `.pred`, so the increment branch ran on first insert and threw. Reduced to a `const existing = voteMap.get(key); existing ? ... : ...` shape.
- CI `esbuild --loader=jsx` flag form rejected by current esbuild releases. Switched to `--loader:.jsx=jsx`.
- CI `actions/setup-node` cache directive failed with "Dependencies lock file is not found" because `package-lock.json` is gitignored. Dropped `cache: npm` from both workflows.

## v0.5.0 — 2026-04-18

### Added
- `data/blue_export.txt` and `data/V059_gRNA3_construct.dna` checked in.
- `scripts/init_repo.sh` defaults to HTTPS remote.
- Initial GitHub publication at `Single-Molecule-Sequencing/fragment-viewer`.
- `src/FragmentViewer.jsx` v0.5.0 with five tabs (Electropherogram, Peak Identification, Cas9 Cut Prediction, Auto Classify, Cross-Sample Comparison).
- Dye mobility offset auto-calibration from tallest peak.
- Per-dye cluster cards with relative-size and relative-abundance reporting.
- Cross-Dye Summary with chemistry interpretation (blunt vs N-nt 5' overhang).
- Editable construct sequence textarea so the viewer generalizes beyond V059.
- `LAB_GRNA_CATALOG` seeded with 11 entries (all spacers empty pending upstream data).
- `scripts/build_artifact.py`, `scripts/ingest_to_kb.py`.
- `docs/BIOLOGY.md`, `docs/TUTORIAL.md`, `skills/fragment-viewer/SKILL.md`.
- CI workflow `.github/workflows/validate.yml` (jsx parse, biology sync grep, python compile).

### Changed
- v0.3 fix retained: dye pairing is `(B, Y)` at Adapter 1 and `(G, R)` at Adapter 2. Earlier versions had `(B, R) + (G, Y)` which is incorrect.

### Known issues
- 11 catalog entries have `spacer: ""`. The `matchLabCatalog` green badge feature is dark until populated.
- The `gRNA3_X-Y` samples show ~88 bp G-only peaks inconsistent with the 226 bp V059 construct; likely a different (smaller) plasmid that needs its own `CONSTRUCT` variant.
- Dye mobility offsets default to zero; no instrument-specific calibration data yet.


---

## v0.8.0 — v0.22.2 (Apr 2026)

Rather than one bullet per minor version across 15 releases, this block summarizes the feature arc that took the viewer from "Claude.ai artifact with a peak-table" to "public-hosted lab tool with interactive biology simulation." Individual commits on `main` retain per-feature detail.

### Ingest and data model

- **In-browser ABIF parsing.** `parseFsaArrayBuffer` + `calibrateLizJs` + `callPeaksFromTrace` turn raw `.fsa` / `.ab1` files into the same peak-table shape the old GeneMapper path produced. Raw DATA1..4 traces are preserved so "show unsmoothed raw" works.
- **Seeded demo.** `V059_4-5.fsa` (uncut) + `gRNA3_1-1.fsa` (cut) ship in `public/demo/` and are fetched on mount. Same code path as drag-drop.
- **Peak-table CSV export** (Toolbar → CSV). Tidy long format.

### Analytical

- **Preprocessing pipeline.** clip → log10 → rolling-min baseline → detrend → Savitzky-Golay / moving-average / median smoother → first derivative. Per-sample independent settings in paired view.
- **Residual view.** `computeResidual` + toggle → raw minus modeled gaussian.
- **Per-peak SNR + noise floor.** `computePeakSNR` robust MAD; lane-wide dashed 3σ reference line.
- **Cut-product purity score.** `computePurityScore` height-weighted, color-coded pill on every sample button.
- **Multi-sample auto-calibrated dye offsets.** `autoCalibrateDyeOffsets` median-based, robust to outliers, ≥3 matches per dye gate.
- **Peak-shift analysis panel.** Quantitative per-dye bp shift between paired samples.

### Visualization

- **Paired overlay.** Dotted uncut + solid cut on the same 4-color stacked lane, per-sample normalized (`pairScale: "independent"` default).
- **End-structure editor.** Nudge each of 4 strand termini ±1 bp; dA-tailability pill flips.
- **Post-dA-tailing reaction diagram.** 4-step: Original → Taq 5′→3′ exo → Taq 5′→3′ pol + dATP → T/A adapter ligated.
- **PAM visualization** on ConstructDiagram (purple band + orientation arrow + actual motif text).
- **Batch heatmap tab.** Sample × expected-species viridis matrix (96-well-plate view).
- **Colorblind-safe palette** toggle (Default / Wong / IBM / Grayscale).

### Export

- **Multi-format export menu** per figure: SVG, PNG @ 2×/4×/6×/8×, PNG transparent, WebP, JPG.
- **DNA diagrams modal** (Toolbar → "DNA diagrams") with combined SVG / PNG bundle export.
- **Report modal** (Toolbar → "Report") — 5 sections (A–E) with figures + captions + per-sample chromatograms + expected-species table + full PDF print (portaled to `document.body` for clean multi-page output) + "Export all" one-click bundle download.

### Infrastructure

- **Public hosting.** Repo flipped public, Pages serves at `https://single-molecule-sequencing.github.io/fragment-viewer/`. Vite `GH_PAGES_BASE=/fragment-viewer/`.
- **Shareable URL state.** All major view state (sample, zoom, channels, pair mode, palette, preprocessing, end offsets) encodes to `#view=…` URL fragment; Toolbar → "Link" copies the current full URL.
- **Keyboard shortcuts.** ←/→ samples, [/] smoothing, f zoom, 1-4 channels, n noise floor, r raw, ? help.
- **CI.** `validate.yml` runs vitest (147 tests), seed-data-schema, ingest-roundtrip, scaffold-in-sync. `pages.yml` deploys on push to main.

### Pre-release checklist (for next release)

Follow this order for every version bump to keep `package.json`, `README`, and `CHANGELOG` in lockstep:

1. Bump `package.json::version`.
2. Add a `## vX.Y.Z — YYYY-MM-DD` section to this file with one bullet per meaningful change.
3. Update the `Current version: **vX.Y.Z**` line in `README.md`.
4. Run `npm test && npm run build && python3 scripts/regen_scaffold.py`.
5. Commit with a message that lists the changes (same content as the CHANGELOG entry).
6. `git push origin main`.

---

## v0.23.0 (2026-04-18)

Closed 6 open issues in one batch: `Fixes #2` (classifyPeaks unused grnaCatalog), `Fixes #3` (5 drifted dye palettes collapsed to one), `Fixes #4` (stale results memo on drag-drop), `Fixes #5` (test hardcoded WSL path), `Fixes #6` (lab-internal paths stripped from public docs), `Fixes #7` (data/fa_data.json deleted). +8 regression tests (139 → 147).

## v0.24.0 (2026-04-18)

Closed 5 issues: `Fixes #8` (deleted scripts/init_repo.sh), `Fixes #10` (CHANGELOG catch-up — this entry), `Fixes #11` (ARCHITECTURE.md updated for 6 tabs + 13 test files + new data flow), `Fixes #12` (shrunk examples/ from 638K → 71K via PNG8 + resize), plus `Fixes #9` (classifyPeaks converted to options-object signature).

