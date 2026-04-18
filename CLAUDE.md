# CLAUDE.md — Context for Claude sessions in this repo

This file is read by Claude (via the Athey lab's workspace-porter skill and Claude Code CLAUDE.md convention) whenever a session operates in or near this repo. It is short by design — the full docs live in `docs/`.

## What this repo is

`fragment-viewer` is an interactive React/JSX artifact plus its supporting infrastructure for analyzing capillary electrophoresis output from the Athey lab's Cas9 fluorescent-adapter fragment analysis assay (Isaac Farnum / Nina Gill / Rachel Case CLC protocol). It predicts cut products from gRNAs, cross-references against a curated lab catalog, and renders interpretive visualizations.

Canonical construct: 226 bp V059_gRNA3 ligated product with a 118 bp target window at positions 55–172. Documented in `docs/BIOLOGY.md`.

## Hard rules for Claude in this repo

1. **Never edit biology without updating `docs/BIOLOGY.md` in the same commit.** The dye assignments, cut model, template/PAM-side labeling, and construct sizes live in both the code (`DYE`, `DYE_STRAND`, `CONSTRUCT`) and BIOLOGY.md. Asymmetric updates have been the #1 source of bugs in this project. If asked to change dye pairing, cut conventions, or strand assignments, update BIOLOGY.md first, then the code constants, then run the CI check.

2. **Never infer biology from memory.** Always read `docs/BIOLOGY.md` or the viewer constants. Specifically: the pairing is **(B, Y) at Adapter 1, (G, R) at Adapter 2** — not the other way around. This has been wrong in earlier versions.

3. **The cut site is 3 bp 5' of the PAM, between protospacer positions 17 and 18.** Do not use any other convention.

4. **Do not reinvent the JSON data schema.** Use `scripts/build_artifact.py` to regenerate from new GeneMapper exports. The `__DATA__` placeholder in the scaffold is the single sanctioned injection point.

5. **Lab catalog lives in `src/FragmentViewer.jsx`, not in a separate JSON file.** This is intentional: the catalog is small, self-documenting, and version-controlled with the viewer. If the catalog grows past ~100 entries this decision should be revisited.

6. **Copyright is not a concern for lab-internal sequences.** Construct sequences, gRNA spacers, adapter oligos, and assay protocols are the lab's own IP. Reproduce freely within this project.

## Typical Claude tasks in this repo

- **Add a gRNA to the catalog.** Edit `LAB_GRNA_CATALOG` in `src/FragmentViewer.jsx`. Spacer is 20 nt DNA, 5' to 3' on the strand carrying the PAM. Run `python scripts/ingest_to_kb.py --grnas`. Add a CHANGELOG line.
- **Add a new chemistry preset.** Edit `CHEMISTRY_PRESETS` in `src/FragmentViewer.jsx`. The preset auto-appears in the Peak ID tab.
- **Swap in a new dataset.** Run `python scripts/build_artifact.py new_export.txt`.
- **Change the construct.** Update `CONSTRUCT.seq`, `CONSTRUCT.targetRange`, `CONSTRUCT.components` in parallel with `docs/BIOLOGY.md` §2 and §3.
- **Regression-test after any biology change.** Run the local JSX parse check (`node -e "require('esbuild').transform(...)"` — see CONTRIBUTING.md).

## Do NOT

- Do not add a fifth tab to the viewer without updating `docs/ARCHITECTURE.md` §1.
- Do not hard-code experimental data into `src/` constants. Data goes in `data/`.
- Do not try to infer the V059_gRNA3 spacer from the observed CE peaks. Auto-pick gives an approximation; the real spacer comes from the user.
