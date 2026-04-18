#!/usr/bin/env python3
"""
fsa_to_json.py — Parse ABIF (.fsa) files into GeneMapper-equivalent JSON peaks.

Reads raw 4-channel + size-standard CE traces from ABIF binary files (Applied
Biosystems instrument output), calibrates data-point indices to bp via the
GS500LIZ size standard, calls peaks per channel, and emits the same JSON
shape that fragment-viewer's DropZone consumes (and that
scripts/build_artifact.py produces from GeneMapper TSV).

Output schema (locked, mirrors genemapper-parser):
    {
      "peaks": {
        "<sample>": {
          "B": [[size_bp, height, area, width_bp], ...],  // channel 1
          "G": [...],                                      // channel 2
          "Y": [...],                                      // channel 3
          "R": [...],                                      // channel 4
          "O": [...]                                       // size standard
        },
        ...
      },
      "samples": ["<sample>", ...]
    }

Caveat: peaks called by this script use scipy.signal.find_peaks with simple
heuristics. They will NOT match GeneMapper / Peak Scanner output exactly.
For canonical analysis use the vendor TSV path; use this importer when raw
.fsa is the only available data or for batch QC.

Channel mapping: ABIF DATA1..DATA4 -> dye letters B/G/Y/R in instrument order.
The actual DYE CHEMISTRY may differ (V059 uses 6-FAM/HEX/TAMRA/ROX; gRNA3_X-Y
samples in the lab use the G5 set 6-FAM/VIC/NED/PET). Dye letter assignments
are by channel index, not by chemistry name. The DyeN1..DyeN5 tags in the
ABIF identify the actual chemistry; this script preserves them in the
emitted JSON's _meta block for downstream tools.
"""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

import numpy as np
from Bio.SeqIO.AbiIO import AbiIterator
from scipy.signal import find_peaks, peak_widths

GS500LIZ_SIZES = [35, 50, 75, 100, 139, 150, 160, 200, 250, 300, 340, 350, 400, 450, 490, 500]
DYE_LETTERS_BY_CHANNEL = ["B", "G", "Y", "R"]


def _decode(v):
    if isinstance(v, bytes):
        return v.decode("ascii", "ignore").strip().rstrip("\x00")
    return v


def load_abif(path: Path):
    with open(path, "rb") as fh:
        record = next(AbiIterator(fh, trim=False))
    abif = record.annotations.get("abif_raw") or {}
    # Prefer the filename stem because TUBE1/SMPL1 are typically well-plate
    # positions (A1, B1, ...) which lose the experiment context. The
    # well-plate id is preserved in meta.tube for downstream use.
    name = path.stem
    traces = {}
    for ch, letter in zip([1, 2, 3, 4], DYE_LETTERS_BY_CHANNEL):
        k = f"DATA{ch}"
        if k in abif:
            traces[letter] = np.asarray(abif[k], dtype=np.float64)
    if "DATA105" in abif:
        traces["O"] = np.asarray(abif["DATA105"], dtype=np.float64)
    chemistry = [
        _decode(abif.get(f"DyeN{i}", b"")) for i in (1, 2, 3, 4, 5)
    ]
    # Sample any one trace just to record the data-point count for meta.
    n_pts = 0
    for k in ("B", "G", "Y", "R", "O"):
        v = traces.get(k)
        if v is not None:
            n_pts = len(v)
            break
    meta = {
        "instrument_model": _decode(abif.get("MODL1", b"")),
        "instrument_serial": _decode(abif.get("MCHN1", b"")),
        "lane": int(abif.get("LANE1") or 0) or None,
        "tube": _decode(abif.get("TUBE1", b"")),
        "container_id": _decode(abif.get("CTNM1", b"")),
        "modf": _decode(abif.get("MODF1", b"")),
        "dye_chemistry": chemistry,
        "n_data_points": n_pts,
    }
    return name, traces, meta


def calibrate_via_liz(liz_trace, n_anchors=16):
    """Find anchor peaks in the LIZ trace and build a piecewise-linear
    interpolator from data-point index to bp using GS500LIZ sizes.

    Returns (interpolator, anchors_used) or (None, []) if calibration fails.
    """
    h_thresh = max(50.0, np.percentile(liz_trace, 90))
    peaks, _ = find_peaks(liz_trace, height=h_thresh, distance=20)
    if len(peaks) < 5:
        return None, []
    heights = liz_trace[peaks]
    # Take top N tallest, sort by index
    top_idx = np.argsort(heights)[::-1][:n_anchors]
    anchors = sorted(peaks[top_idx].tolist())
    n = min(len(anchors), len(GS500LIZ_SIZES))
    anchors = anchors[:n]
    sizes = GS500LIZ_SIZES[:n]
    if n < 4:
        return None, []
    interp = lambda x: np.interp(x, anchors, sizes)  # noqa: E731
    return interp, list(zip(anchors, sizes))


def call_peaks(trace, idx_to_bp, height_thresh=100, min_sep_samples=5):
    if idx_to_bp is None:
        return []
    peaks, _ = find_peaks(trace, height=height_thresh, distance=min_sep_samples)
    if len(peaks) == 0:
        return []
    widths_h, _, lefts, rights = peak_widths(trace, peaks, rel_height=0.5)
    sizes_bp = idx_to_bp(peaks)
    lefts_bp = idx_to_bp(lefts)
    rights_bp = idx_to_bp(rights)
    widths_bp = rights_bp - lefts_bp
    out = []
    for i, p in enumerate(peaks):
        h = float(trace[p])
        w = float(max(widths_bp[i], 0.05))
        # Gaussian area approx: height * width * sqrt(pi/2 ln 2) ~ h * w * 1.064
        area = h * w * 1.064
        out.append([
            round(float(sizes_bp[i]), 2),
            round(h, 1),
            round(area, 1),
            round(w, 3),
        ])
    return out


def parse_one(path: Path):
    name, traces, meta = load_abif(path)
    liz = traces.get("O")
    interp, anchors = (calibrate_via_liz(liz) if liz is not None else (None, []))
    sample_peaks = {}
    for d in ("B", "G", "Y", "R"):
        if d in traces:
            sample_peaks[d] = call_peaks(traces[d], interp)
    if "O" in traces:
        sample_peaks["O"] = call_peaks(traces["O"], interp, height_thresh=200, min_sep_samples=10)
    meta["liz_anchors"] = anchors
    meta["calibration_anchors_count"] = len(anchors)
    return name, sample_peaks, meta


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("inputs", type=Path, nargs="+",
                    help="Path(s) to .fsa file(s) or directory containing .fsa files")
    ap.add_argument("--out", type=Path, help="Write JSON to this path (default: stdout)")
    ap.add_argument("--summary", action="store_true", help="Print per-sample summary instead of JSON")
    ap.add_argument("--include-meta", action="store_true",
                    help="Include _meta per-sample (instrument, dye chemistry, calibration anchors)")
    args = ap.parse_args()

    fsa_files = []
    for p in args.inputs:
        if p.is_dir():
            fsa_files.extend(sorted(p.glob("*.fsa")))
        elif p.suffix.lower() == ".fsa":
            fsa_files.append(p)
        else:
            print(f"[fsa_to_json] skipping non-.fsa input: {p}", file=sys.stderr)
    if not fsa_files:
        print("[fsa_to_json] no .fsa files found", file=sys.stderr)
        return 1

    peaks = {}
    metas = {}
    for f in fsa_files:
        try:
            name, sp, meta = parse_one(f)
            # Disambiguate duplicate sample names by appending file stem
            if name in peaks:
                name = f"{name}_{f.stem}"
            peaks[name] = sp
            metas[name] = meta
            n_peaks = sum(len(v) for v in sp.values())
            print(f"[fsa_to_json] {f.name} -> {name}: {n_peaks} peaks (LIZ anchors: {meta['calibration_anchors_count']})", file=sys.stderr)
        except Exception as e:
            print(f"[fsa_to_json] FAILED {f.name}: {e}", file=sys.stderr)

    payload = {"peaks": peaks, "samples": sorted(peaks.keys())}
    if args.include_meta:
        payload["_meta"] = metas

    if args.summary:
        for s in payload["samples"]:
            n = sum(len(v) for v in peaks[s].values())
            chem = "/".join(metas[s].get("dye_chemistry", []) or [])
            print(f"  {s:<28}  {n:>5} peaks  ({metas[s]['instrument_model']}; {chem})")
        return 0

    out_text = json.dumps(payload, separators=(",", ":"))
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(out_text)
        print(f"[fsa_to_json] wrote {len(payload['samples'])} samples -> {args.out}", file=sys.stderr)
    else:
        print(out_text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
