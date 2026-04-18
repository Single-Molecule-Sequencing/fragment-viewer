#!/usr/bin/env python3
"""
genemapper_parser.py — Parse GeneMapper / PeakScanner peak-table TSV.

Library + CLI. Used by:
    fragment-viewer/scripts/build_artifact.py (which embeds the parsed JSON
    into the JSX scaffold) and the in-browser parseGenemapperTSV in
    fragment-viewer/src/FragmentViewer.jsx (kept in lockstep).

Output schema (locked):
    {
      "peaks": {
        "<sample>": {
          "B": [[size, height, area, width], ...],
          "G": [...], "Y": [...], "R": [...], "O": [...]
        },
        ...
      },
      "samples": ["<sample>", ...]
    }
"""
from __future__ import annotations
import argparse
import csv
import io
import json
import sys
from pathlib import Path


def _coerce_float(v):
    try:
        return float(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


def parse_genemapper(text: str) -> dict:
    """Parse the full text of a GeneMapper TSV export into the peaks schema."""
    samples: dict = {}
    # Strip a leading UTF-8 BOM so the first header field (e.g. "Sample Name")
    # is recognized when callers pass raw .read() text (not utf-8-sig opened).
    if text.startswith("\ufeff"):
        text = text.lstrip("\ufeff")
    reader = csv.DictReader(io.StringIO(text), delimiter="\t")
    for row in reader:
        sample = (row.get("Sample Name") or row.get("SampleName") or "").strip()
        dye_full = (row.get("Dye/Sample Peak") or row.get("Dye") or "").strip()
        dye = dye_full.split(",")[0].strip().upper()
        if not sample or not dye:
            continue
        size = _coerce_float(row.get("Size"))
        if size is None:
            continue
        height = _coerce_float(row.get("Height")) or 0.0
        area = _coerce_float(row.get("Area")) or 0.0
        width = _coerce_float(row.get("Width in BP")) or _coerce_float(row.get("Width")) or 1.0
        samples.setdefault(sample, {}).setdefault(dye, []).append([
            round(size, 2),
            round(height, 1),
            round(area, 1),
            round(width, 3),
        ])
    return {"peaks": samples, "samples": sorted(samples.keys())}


def parse_genemapper_path(path: Path) -> dict:
    return parse_genemapper(path.read_text(encoding="utf-8-sig"))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input", type=Path, help="Path to GeneMapper TSV export")
    ap.add_argument("--out", type=Path, help="Write JSON to this path instead of stdout")
    ap.add_argument("--summary", action="store_true", help="Print one-line summary instead of JSON")
    args = ap.parse_args()

    if not args.input.exists():
        print(f"[genemapper-parser] {args.input} not found", file=sys.stderr)
        return 2

    data = parse_genemapper_path(args.input)
    samples = data["samples"]
    n_peaks = sum(len(v) for s in data["peaks"].values() for v in s.values())

    if args.summary:
        print(f"[genemapper-parser] {len(samples)} samples, {n_peaks} peaks across {sum(len(s) for s in data['peaks'].values())} (sample, dye) groups")
        return 0

    payload = json.dumps(data, separators=(",", ":"))
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(payload)
        print(f"[genemapper-parser] {len(samples)} samples, {n_peaks} peaks -> {args.out}", file=sys.stderr)
    else:
        print(payload)
    return 0


if __name__ == "__main__":
    sys.exit(main())
