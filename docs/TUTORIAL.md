# TUTORIAL — fragment-viewer walkthrough

This tutorial walks through a complete analysis session using the included V059 dataset. Every feature is cross-linked to the source file line where it lives so you can find the code, fix a bug, or extend behavior without hunting.

All line references below point to `src/FragmentViewer.jsx`.

---

## 0. One-paragraph orientation

`fragment-viewer` has five tabs. You use them in this order:

1. **Electropherogram** — visual trace reconstruction. Sanity-check the raw data.
2. **Peak Identification** — configure expected peak positions per sample.
3. **Cas9 Cut Prediction** — predict ssDNA products for any gRNA on the construct.
4. **Auto Classify** — automated clustering, dye calibration, and best-guess assignment. **This is the main analysis tab.**
5. **Cross-Sample Comparison** — overhang offsets and purity heatmap across samples.

The dataset bundled in the repo (`data/blue_export.txt`, 10 samples) is set up to render immediately. Paste your own GeneMapper export through `scripts/build_artifact.py` to swap in a different experiment.

---

## 1. Quickstart

### 1.1 Open the viewer

Attach `src/FragmentViewer.jsx` to a Claude.ai conversation and ask Claude to render it as an artifact. The file is a single self-contained React component with the dataset inlined. Alternatively drop it into any Vite + React + Tailwind v3 scaffold.

### 1.2 First pass on V059_3-2

1. Open the artifact. Default sample is V059_1-2.
2. Click the **Auto Classify** tab.
3. Switch the sample dropdown to `V059_3-2`.
4. Read the four dye-cluster cards.

You will see exactly this pattern:

- **B channel:** 1 large cluster near 200 bp, 1 near 232 bp.
- **Y channel:** 1 cluster near 200 bp with 3 peaks spanning 200.4–203.0, another near 232 bp with 2 peaks.
- **G channel:** 1 cluster near 200 bp (main at 199.6, shoulder at 203.2), another near 232.
- **R channel:** 1 cluster near 200 bp with 3 peaks, another near 232.

This is the fingerprint of partial-ligation products (the "Missing Adapter" species), not a Cas9 cut. The Cross-Dye Summary panel confirms it — the 232 bp peak pairs between channels look blunt-like (small Δ), but the 200 bp species shows up only on two channels per cluster (because each missing-adapter product only carries two of the four dyes).

### 1.3 First pass on gRNA3_1-1

Switch the sample dropdown to `gRNA3_1-1`. The pattern is totally different:

- **G channel:** one cluster at 88.7 bp.
- **R channel:** almost empty.
- **B and Y channels:** very low signal.

The 88.7 bp species on G *without* a matching R partner is the signature of a cut that separates the two adapters. This looks like a real Cas9 cut product on a shorter construct than V059's 226 bp — probably a different plasmid the gRNA3 samples were run against (documented open question in `.project/HANDOFF.md`).

---

## 2. Tab-by-tab reference

### 2.1 Electropherogram tab

Purpose: visualize the peak table as a smoothed electropherogram.

Controls:
- **Sample selector** — switches which sample is rendered.
- **Smoothing** — Gaussian kernel width in bp (default 1).
- **Log Y** — toggles log scale on the Y axis. Useful when a dominant peak crushes smaller features.
- **Stems vs trace** — show peaks as vertical stems or as a continuous reconstructed trace.
- **LIZ ladder overlay** — shows the GS500LIZ size standard peaks underneath the sample trace.
- **Drag-to-zoom** — click and drag horizontally on the trace to zoom to that range.
- **Expected-peak markers** — vertical lines at the expected positions configured in the Peak Identification tab.

Tooltips on hover show size, height, area, dye, and Δ from nearest expected peak.

### 2.2 Peak Identification tab

Purpose: configure what each sample is expected to contain so the viewer can label matches.

The **Assembly Products panel** has one-click presets for full ligation, missing Ad1, missing Ad2, target-only, adapter dimer. Clicking a preset populates the expected B/G/Y/R sizes for the currently selected sample.

Per-sample rows include target (the biological peak of interest), tolerance (how many bp of slack to allow when matching), expected (one integer per dye), and chemistry (one of the presets).

The **Construct Architecture** panel at top has click-to-edit component sizes. Changing sizes re-computes all assembly-product expectations.

### 2.3 Cas9 Cut Prediction tab

Purpose: enumerate candidate gRNAs in the target region and predict their ssDNA cut products.

Three sub-panels:

1. **Target sequence view**: the 118 bp target window with every top-strand NGG and bot-strand NGG highlighted. Hovering a PAM shows the 20 nt protospacer.

2. **gRNA candidates table**: 24 rows (top + bot strand PAMs). Columns for PAM, protospacer, target position, cut position on construct, and predicted ssDNA sizes for Y, B, G, R at the currently selected overhang. The **lab catalog** column shows a green badge if the candidate matches any entry in `LAB_GRNA_CATALOG`.
   - `Show only lab catalog` toggle filters to catalog-matching candidates only.
   - Auto-pick button iterates over all candidates x 5 overhang models and selects the best fit for the current sample's observed peaks. Biased toward catalog entries.
   - Custom gRNA input: paste any 20 nt sequence; the viewer locates it in the target and predicts cut products.

3. **Selected-gRNA panel**: construct diagram with scissors at the cut position, amber overhang band, LEFT/RIGHT fragment annotations, and a product fragment visualization showing all 4 ssDNA products with dye circles, direction arrows, template color-coding, and PAM-proximal/distal labels. Δ column reports observed − predicted.

### 2.4 Auto Classify tab

**This is the core automated analysis.** Everything below describes what it does automatically.

Top controls:
- **Sample selector** — pick any sample.
- **Height threshold** — peaks below this raw height are ignored as noise (default 100).
- **Match tolerance (bp)** — how close an observed peak has to be to a predicted species to be assigned to it (default 8).
- **Cluster tolerance (bp)** — observed peaks within this many bp of each other are grouped into one cluster. A cluster represents "the same underlying species showing up with different chemistries" (default 5).
- **Overhang range ±** — the classifier enumerates all overhang chemistries from −N to +N (default 4). At default, this tests blunt, 1/2/3/4 nt 5' overhang, and 1/2/3/4 nt 3' overhang models against every candidate gRNA.

#### Dye mobility offset panel

Each fluorophore migrates slightly differently on CE. The classifier subtracts a per-dye offset from observed sizes before matching.

- **Auto-calibrate from tallest peak.** Takes the tallest peak in each channel, finds the closest blunt prediction, and sets the offset so that peak aligns exactly with its blunt expectation. Use this when you know the current sample is dominated by a blunt product.
- **Reset to zero.** Clear all offsets.
- **Manual entry.** Type any value (±0.05 bp increments).

#### Per-dye cluster cards

For each of B, G, Y, R:
- Cluster count, peak count, current offset are shown in the header.
- Each cluster shows:
  - **Main peak size** (the tallest peak in the cluster)
  - **Raw size, height, area** for the main
  - **% of channel** — this cluster's share of total area in this dye channel
  - **Best guess identity** — determined by weighted vote of all member peaks' best matches, weighted by area × (1 / (1 + |Δ|)). The label is either `<gRNA name> <LEFT|RIGHT> (<template|non-template> / <PAM-proximal|PAM-distal>)` for cut products or the assembly-product name.
  - **Member peaks** — every peak in the cluster with:
    - Size
    - **Relative size** ("main", "+3.20 bp larger", "-1.50 bp smaller")
    - **Relative abundance** (% of cluster's total area)
    - Best-match interpretation (e.g., `V059_gRNA3 +3 nt OH (Δ=0.15 bp)`)

Read a cluster row like this: **"The main species is at 88.7 bp (65% of the G channel), best guess is gRNA3 cut LEFT fragment. There are two other species in the cluster at +3.2 bp larger (20%) and −1.5 bp smaller (15%), consistent with a mix of 3 nt 5' overhang and 1–2 nt 3' overhang chemistries."**

#### Cross-Dye Summary

Pairs clusters across (B, Y) and (G, R) channels — the two adapters. For each pair:
- Main sizes on both dyes
- Δ between them
- Relative abundance on each channel
- **Chemistry interpretation** based on the Δ:
  - |Δ| < 1 → blunt
  - |Δ − 4| < 1 → 4 nt 5' overhang with the named channel longer
  - Similar rules for 1/2/3 nt overhangs
  - If a cluster appears on only one channel → "likely missing-adapter product"

This table is the single most compact summary of what's in a sample. Read top to bottom.

#### Editable construct sequence

Bottom panel. Paste any ligated construct sequence in 5' to 3' top strand orientation, set target start and end, click **Apply sequence**. All predictions regenerate. Use this to analyze any construct, not just V059.

- Validation: only ACGTN characters, length ≥ 50, target range must fit.
- **Reset to V059** button restores the default.

### 2.5 Cross-Sample Comparison tab

Purpose: compare overhang chemistry across multiple samples.

- **Overhang chart**: for each sample, shows Δ(Y−B) (Ad1 end) and Δ(R−G) (Ad2 end) as colored dots. Read horizontally to see whether cut chemistry changed across replicates.
- **Match-purity grid**: for each (sample, dye), shows the fraction of area accounted for by the matched expected peak. Low purity = lots of peaks you didn't expect.
- **Overlay plot**: superimposes all samples' traces with optional normalization. Good for spotting outlier replicates.

---

## 3. Worked example: V059_3-2 full analysis

1. **Open Electropherogram tab, sample V059_3-2.** The dominant peaks sit near 200 and 232 on all four dyes.
2. **Switch to Peak Identification tab.** Click the "Missing Ad2" preset. This sets B and Y expected to 201, G and R expected to nothing (since Missing Ad2 carries only B and Y). Observe that only B and Y channels actually have strong signal at 201 in this sample. Some G/R signal is there too, which hints at coexistence of Missing Ad1.
3. **Switch to Auto Classify tab.** Sample V059_3-2. Read the four cluster cards:
   - B card: ~200 cluster (93% of channel), ~232 cluster (tiny)
   - Y card: ~200 cluster with 3 peaks (~200.4, 201.3, 203.0 — main at 200.4), ~232 cluster
   - G card: ~200 cluster (main at 199.6 with shoulder at 203.2), ~232 cluster
   - R card: ~200 cluster (main at 203.4 — note dominant), ~232 cluster
4. **Read the Cross-Dye Summary.** The (B, Y) row at ~200 shows a Δ near 0.4 bp → approximately blunt. The (G, R) row at ~200 shows Δ near 3.7 bp → 4 nt 5' overhang with R longer. This is perfectly consistent with BsaI chemistry at the Adapter 2 end (AGCG overhang) and blunt assembly at the Adapter 1 end.
5. **Interpretation:** V059_3-2 is *not* a cut sample. The ~200 bp peaks are Missing Ad2 (201 bp, B+Y) and Missing Ad1 (201 bp with Ad2 = 25, G+R) both co-existing. The ~232 bp peaks are full ligation products with somewhat low abundance. There's no Cas9 cut signature here at all.

---

## 4. Worked example: gRNA3_1-1 full analysis

1. **Auto Classify tab, sample gRNA3_1-1, cluster tolerance 3, match tolerance 5.**
2. G card: one cluster at 88.7 bp (dominant in G channel, > 65%).
3. All other channels mostly empty above the noise floor.
4. Cross-Dye Summary: the G cluster has no matching R cluster → "likely missing-adapter product" according to the heuristic.

But wait — that label is from the Adapter 2 pair (G, R). The absence of an R counterpart doesn't actually mean "missing adapter". Because the construct is only ~120-ish bp (shorter than V059's 226), the R species would be expected around 30 bp — below the size threshold of the GS500LIZ ladder's usable range (and possibly below the height threshold).

**Action:** drop the height threshold from 100 to 50 and re-read the R channel. If an R cluster appears at ~30 bp, this is a real Cas9 cut on a ~118 bp construct. If not, gRNA3 probably uses a different construct that needs its own entry.

5. To explore the hypothesis that gRNA3's construct is different: in the **editable construct sequence** box at the bottom, paste a hypothetical 118 bp sequence, set target start to 1 and target end to 118, click **Apply sequence**. The gRNA candidate table in the Cas9 Cut Prediction tab will now enumerate candidates for the new construct. If any of them predict G = 88.7 bp with blunt chemistry, that's your likely gRNA.

---

## 5. Generalization to a new experiment

Say you run a new construct called V073 with a 104 bp target window.

**Step 1.** Export GeneMapper results. Make sure columns include Sample Name, Dye/Sample Peak, Size, Height, Area.

**Step 2.** Regenerate the artifact:
```bash
python scripts/build_artifact.py /path/to/V073_export.txt --out src/FragmentViewer.jsx
```
This writes the new data into the `DATA` object at the top of the JSX.

**Step 3.** Update the construct. Either:
- Edit `CONSTRUCT.seq`, `CONSTRUCT.targetRange`, `CONSTRUCT.components` at the top of the JSX directly, OR
- Paste the new sequence into the **Auto Classify** tab's construct editor for one-off analysis without touching code.

**Step 4.** Add the V073 gRNA to the lab catalog. Open `src/FragmentViewer.jsx`, find `LAB_GRNA_CATALOG`, add:
```js
{ name: "V073_gRNA1", spacer: "ACGTACGTACGTACGTACGT", source: "IDT order 2026-05-02", target: "V073 synthetic target (104 bp)", notes: "Aim 2 pilot" },
```

**Step 5.** Commit:
```bash
git add -A && git commit -m "Add V073 experiment and gRNA to catalog" && git push
```

---

## 6. CI

`.github/workflows/validate.yml` runs on every push:
- `esbuild` JSX parse — catches syntax errors before they reach main.
- BIOLOGY.md + DYE_STRAND consistency grep — catches accidental desyncs.
- Python script syntax — catches broken scripts.

---

## 7. Repo location

The repo is already public at `github.com/Single-Molecule-Sequencing/fragment-viewer` and hosted at `single-molecule-sequencing.github.io/fragment-viewer/`. To contribute, clone + branch + PR:

```bash
git clone https://github.com/Single-Molecule-Sequencing/fragment-viewer.git
cd fragment-viewer
npm install
git checkout -b my-feature
# ... edits ...
npm test && npm run build
git push origin my-feature
```

Useful links:
- Repo: https://github.com/Single-Molecule-Sequencing/fragment-viewer
- Live tool: https://single-molecule-sequencing.github.io/fragment-viewer/
- Tutorial: https://github.com/Single-Molecule-Sequencing/fragment-viewer/blob/main/docs/TUTORIAL.md
- Biology: https://github.com/Single-Molecule-Sequencing/fragment-viewer/blob/main/docs/BIOLOGY.md
- Actions: https://github.com/Single-Molecule-Sequencing/fragment-viewer/actions
