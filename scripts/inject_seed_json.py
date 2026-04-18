#!/usr/bin/env python3
"""inject_seed_json.py — substitute __DATA__ in FragmentViewer.scaffold.jsx
with a pre-built peaks JSON (from fsa_to_json.py), writing the result to
FragmentViewer.jsx. Complements build_artifact.py which only reads GeneMapper
TSV inputs; this accepts raw JSON from the .fsa pipeline.

Usage:
    python scripts/inject_seed_json.py data/seed.json
    python scripts/inject_seed_json.py data/seed.json --out src/FragmentViewer.jsx
"""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SCAFFOLD = REPO_ROOT / "src" / "FragmentViewer.scaffold.jsx"
DEFAULT_OUT = REPO_ROOT / "src" / "FragmentViewer.jsx"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("json_in", type=Path, help="Path to pre-built peaks JSON")
    ap.add_argument("--scaffold", type=Path, default=DEFAULT_SCAFFOLD)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = ap.parse_args()

    scaffold_text = args.scaffold.read_text()
    if "__DATA__" not in scaffold_text:
        print(f"[inject] scaffold has no __DATA__ placeholder at {args.scaffold}", file=sys.stderr)
        return 1

    payload = json.loads(args.json_in.read_text())
    # The viewer DATA object only needs {peaks: {...}}; drop the sibling `samples`
    # and `_meta` fields so the injected literal is minimal.
    data_obj = {"peaks": payload.get("peaks", {})}
    data_js = json.dumps(data_obj, separators=(",", ":"))
    args.out.write_text(scaffold_text.replace("__DATA__", data_js))
    n_samples = len(data_obj["peaks"])
    n_peaks = sum(len(v) for s in data_obj["peaks"].values() for v in s.values())
    print(f"[inject] wrote {args.out} with {n_samples} samples · {n_peaks} peaks", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
