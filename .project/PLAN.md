# PLAN.md — Current priorities

Last updated: 2026-04-18 (v0.5.0 + post-publish sweep).

## Status snapshot

The repo is published at `Single-Molecule-Sequencing/fragment-viewer` on GitHub. The viewer renders correctly under Claude.ai artifact mode and via the Vite local-dev path. The backend ingest tooling round-trips through `scripts/build_artifact.py` and `scripts/ingest_to_kb.py` against a fresh sqlite KB.

The biggest open gap is upstream wet-lab data (catalog spacers, gRNA3 construct identity, dye mobility offsets). All three are tracked in `.project/UNBLOCK_PROMPTS.md`.

## Active priorities (in order)

1. **Backfill `LAB_GRNA_CATALOG` spacers** once Isaac and the pilot BED file are pulled in. Recipe in `docs/GRNA_CATALOG.md §4`.
2. **Decide whether `gRNA3_X-Y` samples used a smaller construct.** If yes, add a second `CONSTRUCT` variant in the JSX and update the data-loader to switch on sample-name prefix.
3. **Run a blunt positive-control ligation** so dye-mobility-offset defaults can be calibrated to the lab's CE instrument. Today the auto-calibrate button is the only path; defaults are zero.
4. **Adopt the viewer in the next live experiment.** Drag and drop the new GeneMapper export into the viewer; auto-classify; export PDF; archive in `data/<experiment-id>/`.

## Recently shipped

- v0.5.0 published to GitHub.
- Five-tab analysis flow stable.
- Skill `/fragment-viewer` installed globally and discoverable from any Claude Code session.
- Project registered in `lab-papers/papers.yaml::projects`.
- ONT registry CE-platform extension proposal drafted in `lab-wiki/decisions/`.

## Deliberately deferred

- Native `.fsa` (ABIF binary) ingestion. Verified the parser path under the artifact runtime; deferring until there is a sample of users who want to skip the GeneMapper step.
- SMA-seq cross-link. The schema link between fragment-analysis sample names and SMA-seq library IDs is not yet stable; revisit once the next end-to-end SMA-seq run includes a CLC-product diagnostic.

## Known sharp edges for the next agent

- CI's `esbuild --loader=jsx` form was wrong for the current esbuild release; fixed to `--loader:.jsx=jsx`. Watch for esbuild major bumps that change loader syntax again.
- The scaffold and the viewer must be kept in sync by hand. There is no regen-scaffold script today.
- `scripts/ingest_to_kb.py` parses the catalog with a regex, not a JS runtime. Adding fields outside the standard `name|spacer|source|target|notes` set will silently drop them.
