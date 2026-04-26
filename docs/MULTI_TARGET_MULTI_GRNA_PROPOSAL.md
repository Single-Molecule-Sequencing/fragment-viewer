# Multi-target / multi-gRNA support — design proposal

**Tracks:** [#24](https://github.com/Single-Molecule-Sequencing/fragment-viewer/issues/24)

**Status:** proposal — not started.

## Goal

Let a user upload an arbitrary SnapGene `.dna` file as the analysis target and supply one or more gRNAs against it, with every tab's graphics and tables responding correctly.

Today the viewer is hard-wired to V059 226 bp + a single selected gRNA per tab. The current state is documented faithfully in [`docs/BIOLOGY.md`](BIOLOGY.md) and the code constants — that contract is load-bearing and must be preserved through any refactor.

## What "current" looks like

Concentrated in `src/lib/constants.js`:

- `CONSTRUCT.{seq, targetRange, total, components}` — 226 bp, target 55..172, seven named components, dye assignments per component.
- `DYE_STRAND.{B,G,Y,R}` — `{strand, end, pos}` rows that hardcode `pos: 1` or `pos: 226`.

Spread across the codebase:

- `CutPredictionTab` reads `CONSTRUCT.*` directly — no props for construct.
- `ConstructDiagram` iterates `CONSTRUCT.components` from the module import — no props.
- `CompareTab` and `HeatmapTab` carry `|| 226` fallbacks if `constructSeq` is empty.
- `ProductFragmentViz` is length-parameterized but its dye-on-left rule (`Y || B`) and subtitle text encode the V059 chemistry.
- `OverhangChart` legend hardcodes "Adapter 1" / "Adapter 2" labels.
- `PeakIdTab.OverhangBadge` hardcodes "6-FAM vs TAMRA" and "HEX vs ROX".
- `StatusBar` literally renders `"V059 (… bp)"`.
- `parseSnapgene` is implemented and tested but never reached from UI; `drop_zone.jsx` filters out `.dna`.

Every tab is single-gRNA-per-view. `classifyPeaks` already iterates all candidates internally; `PeakSpeciesPopover` already takes a `gRNAs` array — both are partly multi-gRNA-ready.

## Phased plan

### Phase 1 — Decouple `CONSTRUCT` from module-level imports

No user-visible change. Goal: every tab and component that today imports `CONSTRUCT` reads it from a single source of state.

- Introduce `src/lib/construct_context.js` — a React context carrying the active construct (`{seq, targetRange, total, components, label}`) plus a setter.
- Lift the `constructSeq / targetStart / targetEnd / componentSizes` state in `FragmentViewer.jsx` into the provider; default value remains `CONSTRUCT` from `constants.js` so behavior is identical at startup.
- Refactor every consumer to read from context (or accept props). Specifically:
  - `CutPredictionTab` — biggest change; it currently reads `CONSTRUCT.{seq, targetRange.*, total}` directly.
  - `PeakIdTab` — `CONSTRUCT` import goes; `componentSizes` already comes via props.
  - `AutoClassifyTab` — already takes props; just remove the `CONSTRUCT.seq` reset target and source it from context.
  - `CompareTab`, `HeatmapTab` — drop the `|| 226` fallbacks; if no construct loaded, render a "load a construct" placeholder.
  - `ConstructDiagram` — accept `components` as a prop (or read context).
- Tests: 316 pass before, 316+ pass after. No behavior change.
- Risk: low. Mechanical refactor with the existing test suite as the safety net. CLAUDE.md rule 1 doesn't bite — no biology constants change.

### Phase 2 — SnapGene `.dna` ingestion

Wire the existing `parseSnapgene` into the upload flow.

- `drop_zone.jsx` accepts `.dna`.
- On `.dna` upload: `parseSnapgene(buf)` → derive a `Construct` value:
  - `seq` = parsed sequence.
  - `total` = parsed length.
  - `targetRange` — try (a) feature whose `name === "target"` or matches `/target/i`; (b) feature labeled "Target Site" / "TargetSeq"; (c) prompt the user with a target-range editor pre-filled with the longest unannotated central interval.
  - `components` — derive from features in coordinate order. Map adapter/overhang/bridge/target by name regex; fall back to a generic "region N" label if no match.
  - `label` — file basename without `.dna`.
- `BIOLOGY.md` gains a new §6 "Loading arbitrary constructs" that documents the feature-name → component mapping and the fallback rules. CLAUDE.md hard rule honored: constants change in lockstep with docs.
- A "Reset to V059" button restores the canonical default.
- Tests: a `multi_target_ingest.test.mjs` fixture loads `data/V059_gRNA3_construct.dna` (already in repo), verifies the resulting Construct value matches the V059 hardcoded shape within tolerance.
- Risk: medium. Feature-name heuristics are project-specific; the manual fallback editor is the safety valve.

### Phase 3 — Multi-gRNA model

- Replace single-id selection state (`selectedId`, `cutGrnaIdx`, `speciesGrnaIdx`) with selected-set state plus a "primary" pointer for views that genuinely need a focal gRNA.
- Rendering rules:
  - `CutPredictionTab` — gRNA table already lists all candidates; selection becomes multi-select with checkboxes; the diagram + product viz overlay all selected gRNAs (color by gRNA id; the existing dye colors describe products, not gRNAs, so add a per-gRNA stripe color).
  - `HeatmapTab` — column groups split by gRNA, sub-grouped by dye.
  - `CompareTab` — primary gRNA still drives the predicted-vs-observed lines; secondary gRNAs render as ghost overlays.
  - `AutoClassifyTab` — `classifyPeaks` is already multi-gRNA; the picker becomes a multi-select with the same primary-pointer convention.
  - `PeakSpeciesPopover` already takes a `gRNAs` array; just pass the full set.
- Upload path: `.dna` upload reads gRNA features (any feature whose color or name signals a gRNA / sgRNA / spacer); secondary `Add gRNAs from FASTA` modal accepts a multi-record FASTA where each record is a 20 nt spacer.
- Tests: extend `classifier.test.mjs` to assert multi-gRNA output ordering; add `cut_prediction_overlay.test.mjs` for the new diagram path.
- Risk: medium. The visualization decisions (color-by-gRNA vs color-by-dye) are the hard part and warrant a separate UX review before the PR lands.

### Phase 4 — Adapter / dye label parameterization

Last because cosmetic, but part of the user-facing contract.

- `OverhangBadge`, `OverhangChart` legend, `ProductFragmentViz` subtitle: read adapter labels and dye-fluorophore names from `DYE_STRAND` and a new `ADAPTER_NAMES` table (default 1/2; can be overridden per construct on upload via SnapGene feature names).
- `StatusBar` reads the active construct's `label` instead of hardcoding "V059".
- `BIOLOGY.md` adds a §3.5 "How dye/adapter labels generalize" — the V059 chemistry stays canonical and documented; alternate constructs override the labels via `Construct.adapterLabels` and `Construct.dyeFluorophores`.
- Risk: low. Pure label routing with no algorithm change.

## Deliberate non-goals

- **Not** generalizing the dye → strand mapping. `DYE_STRAND` encodes a chemistry that's specific to the lab's adapter/dye chemistry. Constructs that use a different dye chemistry are out of scope until/unless the lab adopts a new chemistry; in that case BIOLOGY.md gets a §7.
- **Not** supporting variable cut-site model. The "3 bp 5' of PAM, between 17 and 18" rule (CLAUDE.md hard rule 3) is the only model the viewer reasons about. Other nuclease cut conventions are out of scope.

## Suggested PR sequence

1. `phase-1-construct-context` — refactor only, no UX. Low-risk, unblocks 2/3/4.
2. `phase-2-snapgene-ingest` — adds feature; user-testable in isolation.
3. `phase-3-multi-grna` — biggest UX change; wants design review before merge.
4. `phase-4-label-parameterization` — finishing pass; merges fast once the others land.

## Open questions

These are decisions where the lab's preference shapes the design — flagging them here to surface before any code is written.

1. **Component-name heuristics:** what feature-name patterns reliably indicate "target" / "adapter" / "bridge" / "overhang" in the lab's typical SnapGene files? A small inspection of 5–10 real `.dna` files would save a lot of fallback-handling code.
2. **gRNA color semantics in multi-overlay views:** color-by-gRNA conflicts with color-by-dye, which is sacred (BIOLOGY.md §3). Proposal: use line-style or stripe-color for the gRNA axis and keep the dye colors authoritative. Acceptable?
3. **Default behavior on `.dna` with no target annotation:** auto-pick longest unannotated central interval, or hard-stop and require manual range entry?
4. **Should the V059 hardcoded path remain reachable?** Useful as a calibration baseline / smoke test even after the refactor — keeping a "Reset to V059" affordance covers that, but should `CONSTRUCT` stay as the module-level default, or move into a `data/v059.json` file shipped alongside the .dna?
