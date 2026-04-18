# FSA_SUPPORT.md — Native ABIF (.fsa) trace ingestion

Native ABIF binary (`.fsa`) import was added 2026-04-18. The viewer now
accepts both GeneMapper TSV peak-table exports and ABIF traces directly,
with the same drag-drop entry point.

## Two paths

| Path | When to use | Implementation |
|---|---|---|
| **Browser drag-drop** | Quick interactive analysis of one or more `.fsa` files | `parseAbifBuffer` + `parseFsaArrayBuffer` in `src/FragmentViewer.jsx`. Pure JS, no npm dep. |
| **Python CLI** | Batch ingest, manuscript pipelines, when you want to inspect raw traces alongside the called peaks | `scripts/fsa_to_json.py` (uses biopython + scipy). Emits the same JSON shape as `scripts/build_artifact.py`. |

Both paths produce the locked schema `{peaks: {sample: {dye: [[size, height, area, width], ...]}}}` that the viewer consumes.

## Capabilities

- Parses ABIF v1xx files written by Applied Biosystems instruments (3500/3730/3130).
- Extracts the four raw-data channels (`DATA1`–`DATA4`) and the LIZ size-standard channel (`DATA105`).
- Auto-calibrates data-point indices to bp using GS500LIZ ladder peaks (16 anchors at known sizes 35–500 bp), built into a piecewise-linear interpolator.
- Auto-calls peaks per channel via local-max scan with a min-height threshold + min-separation window. Computes height + Gaussian-style area + FWHM-derived bp width.
- Multi-file batch drop in the browser: drop a folder's worth of `.fsa` files, all become samples in one viewer session.
- Sample names default to the file stem (`gRNA3_1-1.fsa` → `gRNA3_1-1`) because ABIF `TUBE1` / `SMPL1` fields typically just hold the well-plate position (e.g., `A1`).

## Critical caveat: peak calls are not vendor-equivalent

The auto-called peaks from this importer use a simple local-max heuristic with FWHM widths. They will NOT match GeneMapper / Peak Scanner output exactly. For canonical analysis, prefer the vendor TSV path (`scripts/build_artifact.py`).

The `.fsa` path is best used for:

- Quick visual inspection of raw traces when only the binary is at hand
- Headless batch QC (e.g., "did all 96 wells produce signal?")
- Cross-referencing the vendor-called peaks against the raw signal

## Dye chemistry detection

ABIF stores per-channel dye names in `DyeN1`–`DyeN5`. The lab's V059 chemistry uses 6-FAM/HEX/TAMRA/ROX/LIZ. Common alternatives include the G5 set 6-FAM/VIC/NED/PET/LIZ (used by the gRNA3_X-Y samples in this lab's 2026-04 batch). The dye letters in the viewer (B/G/Y/R/O) are channel-index based, not chemistry-based; this importer maps `DATA1`→B, `DATA2`→G, `DATA3`→Y, `DATA4`→R, `DATA105`→O regardless of underlying chemistry. The actual chemistry is preserved in the `_meta` block of the JSON output and can be inspected via the Python CLI's `--include-meta` flag.

## Browser usage

1. Open the viewer at https://literate-couscous-j11oyzr.pages.github.io/.
2. Drag one or more `.fsa` files anywhere in the window (or click `Load data` in the toolbar). Multi-select OK.
3. The drop overlay confirms ABIF binary recognition. Files are parsed in browser; sample names + peaks appear immediately.
4. Mixed drops (`.fsa` + `.txt`) are supported; the dataset merges all sources.

## CLI usage

```bash
# Single file
python scripts/fsa_to_json.py path/to/sample.fsa --out parsed.json

# Whole directory of fsa files
python scripts/fsa_to_json.py path/to/run_folder/ --out run_parsed.json

# Mixed inputs + summary instead of full JSON
python scripts/fsa_to_json.py file1.fsa file2.fsa folder/ --summary --include-meta
```

The CLI prints per-file progress to stderr (`[fsa_to_json] gRNA3_1-1.fsa -> gRNA3_1-1: 346 peaks (LIZ anchors: 16)`) and the JSON to stdout (or to `--out` path).

## What the importer does NOT do

- **Vendor-quality peak calling.** Use GeneMapper for that.
- **Tri-color base-calling.** This is a fragment-analysis viewer, not a Sanger sequencer. Base-call data (`PBAS1`, `PLOC1`) is parsed but not surfaced.
- **Saturation correction.** GS500LIZ peaks above 32767 (the i16 ceiling) are clipped; this can affect the small-fragment anchors. The 16-anchor calibration is robust to losing 1–2 anchors but degrades if many are clipped.
- **Mobility correction across instruments.** Cross-instrument bp comparisons should use a per-instrument calibration sample.

## Implementation map

| File | Purpose |
|---|---|
| `src/FragmentViewer.jsx::parseAbifBuffer` | Pure-JS ABIF binary reader (DataView, big-endian) |
| `src/FragmentViewer.jsx::calibrateLizJs` | LIZ peak finder + piecewise-linear interp builder |
| `src/FragmentViewer.jsx::callPeaksFromTrace` | Local-max peak caller with FWHM widths |
| `src/FragmentViewer.jsx::parseFsaArrayBuffer` | Single-shot wrapper: ABIF buffer → sample peaks dict |
| `src/FragmentViewer.jsx::DropOverlay` | Multi-file drag-drop (.fsa + .tsv merged) |
| `src/FragmentViewer.jsx::UploadButton` | Toolbar file picker (multi-select) |
| `scripts/fsa_to_json.py` | Python CLI mirror (biopython + scipy) |
| `tests/fsa_parser.test.mjs` | JS-side parser tests using a real .fsa fixture |

## Tests

```bash
# JS-side
npx vitest run tests/fsa_parser.test.mjs

# Python-side
ruff check scripts/fsa_to_json.py
python scripts/fsa_to_json.py path/to/test.fsa --summary
```

Tests skip gracefully when the lab-only `.fsa` fixtures are not on disk (e.g., on CI runners).
