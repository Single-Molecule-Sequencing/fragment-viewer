#!/usr/bin/env python3
"""
build_artifact.py — Regenerate FragmentViewer.jsx from a new GeneMapper peak-table export.

This parses a tab-delimited GeneMapper/PeakScanner export, reshapes it into the JSON schema
the viewer expects, and writes the result into src/FragmentViewer.jsx by substituting the
__DATA__ placeholder with the JSON string.

Input format: GeneMapper-style tab-separated export with columns including:
    Sample Name, Dye/Sample Peak, Size, Height, Area, Data Point, Width

Usage:
    python scripts/build_artifact.py data/blue_export.txt
    python scripts/build_artifact.py data/new_run.txt --scaffold scaffold.jsx --out src/FragmentViewer.jsx
"""
from __future__ import annotations
import argparse
import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SCAFFOLD = REPO_ROOT / "src" / "FragmentViewer.scaffold.jsx"
DEFAULT_OUT = REPO_ROOT / "src" / "FragmentViewer.jsx"
DEFAULT_JSON = REPO_ROOT / "data" / "fa_data.json"


def parse_genemapper(tsv_path: Path) -> dict:
    """Parse a GeneMapper/PeakScanner peak-table export into the viewer's peak schema.

    Returns a dict like:
        {
          "peaks": {
            "V059_1-2": {"B": [[size, height, area, width], ...], "G": [...], "Y": [...], "R": [...], "O": [...]},
            ...
          },
          "samples": ["V059_1-2", ...],
        }
    """
    import csv

    samples = {}
    with open(tsv_path, "r", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh, delimiter="\t")
        for row in reader:
            sample = (row.get("Sample Name") or row.get("SampleName") or "").strip()
            dye_sample = (row.get("Dye/Sample Peak") or row.get("Dye") or "").strip()
            dye = dye_sample.split(",")[0].strip().upper()
            if not sample or not dye:
                continue
            # Convert numeric fields safely
            def _f(k: str) -> float | None:
                v = row.get(k)
                if v is None or v == "":
                    return None
                try:
                    return float(v)
                except ValueError:
                    return None

            size = _f("Size")
            height = _f("Height") or 0.0
            area = _f("Area") or 0.0
            width = _f("Width in BP") or _f("Width") or 1.0

            if size is None:
                continue
            samples.setdefault(sample, {}).setdefault(dye, []).append(
                [round(size, 2), round(height, 1), round(area, 1), round(width, 3)]
            )

    return {"peaks": samples, "samples": sorted(samples.keys())}


def inline_data(scaffold: Path, data: dict, out: Path) -> int:
    """Substitute __DATA__ in scaffold with the JSON data and write to out."""
    data_js = json.dumps(data, separators=(",", ":"))
    src = scaffold.read_text()
    if "__DATA__" not in src:
        print(f"[build] scaffold has no __DATA__ placeholder; writing JSON only to {DEFAULT_JSON}", file=sys.stderr)
        DEFAULT_JSON.write_text(data_js)
        return 2
    out.write_text(src.replace("__DATA__", data_js))
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("export", type=Path, help="Path to GeneMapper peak-table export (TSV)")
    ap.add_argument("--scaffold", type=Path, default=DEFAULT_SCAFFOLD, help="JSX scaffold with __DATA__ placeholder")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT, help="Output JSX path")
    ap.add_argument("--json-out", type=Path, default=DEFAULT_JSON, help="Where to write the parsed JSON")
    args = ap.parse_args()

    data = parse_genemapper(args.export)
    print(f"[build] Parsed {len(data['samples'])} samples, "
          f"{sum(len(arr) for s in data['peaks'].values() for arr in s.values())} total peaks")

    args.json_out.parent.mkdir(parents=True, exist_ok=True)
    args.json_out.write_text(json.dumps(data, separators=(",", ":")))
    print(f"[build] Wrote JSON to {args.json_out}")

    if args.scaffold.exists():
        rc = inline_data(args.scaffold, data, args.out)
        if rc == 0:
            print(f"[build] Wrote artifact to {args.out} ({args.out.stat().st_size // 1024} KB)")
        return rc
    else:
        print(f"[build] Scaffold {args.scaffold} not found; skipping JSX generation. "
              f"To create a scaffold, copy the current FragmentViewer.jsx and replace the inlined "
              f"data object literal with the string __DATA__.", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
