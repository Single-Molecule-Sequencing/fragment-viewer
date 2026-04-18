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
