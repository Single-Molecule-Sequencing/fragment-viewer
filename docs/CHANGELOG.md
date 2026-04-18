# CHANGELOG.md

All notable changes to this repository.

The format is loosely [Keep a Changelog](https://keepachangelog.com/). This project does not yet follow strict semver; minor version bumps are made when a new analysis tab is added or an existing classifier behaviour changes.

## Unreleased

### Added
- `src/FragmentViewer.scaffold.jsx`: scaffold form of the viewer with the `DATA` literal replaced by `__DATA__`. `scripts/build_artifact.py` now round-trips end to end.
- `docs/ARCHITECTURE.md`, `docs/GRNA_CATALOG.md`, `docs/CHANGELOG.md`, `docs/CONTRIBUTING.md`: backfill of docs the SKILL and HANDOFF cross-referenced.
- `.project/PLAN.md`, `.project/workspace.yaml`, `.project/UNBLOCK_PROMPTS.md`: project metadata for lab-system and project-builder.
- CI: empty-spacer count, JSON schema check on `data/fa_data.json`, ruff on `scripts/`, `ingest_to_kb.py --all` against `/tmp/test.db`.
- Vitest harness with unit tests on `classifyPeaks`, `matchLabCatalog`, `predictCutProducts` (`tests/classifier.test.mjs`).
- Vite scaffold + GitHub Pages deploy workflow.
- Drag-and-drop GeneMapper TSV ingestion in the viewer (FileReader, parses client-side).
- PDF report export on the Auto Classify tab via `window.print()` and a print-only stylesheet.
- Dye mobility offset sidecar JSON in `data/calibrations/`; the viewer auto-loads on first render.
- Skill installation in `~/.claude/skills/fragment-viewer/` and registration in the ont-ecosystem skill registry.
- Project registration in `lab-papers/papers.yaml::projects` and `lab-system/lab-locations.yaml`.
- Post-edit hook `~/.claude/hooks/post-edit-fragment-viewer.sh` syncs the KB on catalog edits.
- Decision record proposing a `CE-fragment` platform extension for the ONT registry.

### Fixed
- CI `esbuild --loader=jsx` flag form rejected by current esbuild releases. Switched to `--loader:.jsx=jsx`.

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
