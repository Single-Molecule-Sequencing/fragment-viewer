#!/usr/bin/env python3
"""
cas9_cut_predictor.py — Predict ssDNA Cas9 cut products on CLC constructs.

Pure-function port of fragment-viewer/src/FragmentViewer.jsx (findGrnas,
predictCutProducts). Mirrors fragment-viewer/docs/BIOLOGY.md §4 to §5.

Subcommands implied by flags:
    --enumerate                List every NGG-PAM candidate in the target window.
    --spacer <20-nt>           Predict for a specific spacer (matched against candidates).
    --json                     Emit JSON instead of a table.
"""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path
from typing import Optional

import yaml

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_REGISTRY = REPO_ROOT / "data" / "constructs.yaml"

COMPLEMENT = {"A": "T", "T": "A", "C": "G", "G": "C", "N": "N"}


def reverse_complement(s: str) -> str:
    return "".join(COMPLEMENT.get(c, c) for c in s.upper()[::-1])


def normalize_spacer(s: str) -> str:
    s = (s or "").upper().replace("U", "T")
    return "".join(c for c in s if c in "ACGT")


def find_grnas(full_construct: str, target_start: int, target_end: int) -> list[dict]:
    """Enumerate all NGG-PAM 20-nt protospacers within the target window.

    Mirrors fragment-viewer findGrnas. Returns dicts keyed by protospacer with
    cut_construct = 1-indexed last base of the LEFT fragment on the top strand.
    """
    seq = full_construct.upper()
    target = seq[target_start - 1:target_end]
    out = []
    n = 0
    # Top-strand PAMs (NGG on top)
    for i in range(0, len(target) - 22):
        pam = target[i + 20:i + 23]
        if len(pam) == 3 and pam[1] == "G" and pam[2] == "G":
            proto = target[i:i + 20]
            cut_target = i + 17 + 1                    # 1-indexed in target
            cut_construct = cut_target + target_start - 1
            out.append({
                "id": n, "strand": "top", "pam_seq": pam,
                "protospacer": proto, "target_pos": i + 1,
                "cut_construct": cut_construct,
            })
            n += 1
    # Bot-strand PAMs (CCN on top = NGG on bot)
    for i in range(0, len(target) - 22):
        pam_top = target[i:i + 3]
        if pam_top[0] == "C" and pam_top[1] == "C":
            proto_top = target[i + 3:i + 23]
            if len(proto_top) < 20:
                continue
            proto = reverse_complement(proto_top)
            # cut on bot is 3 bp 5' of PAM on bot; on top this is 3 bp 3' of CCN
            cut_target = i + 5 + 1                     # last base of LEFT in top coords
            cut_construct = cut_target + target_start - 1
            out.append({
                "id": n, "strand": "bot", "pam_seq": reverse_complement(pam_top),
                "protospacer": proto, "target_pos": i + 1,
                "cut_construct": cut_construct,
            })
            n += 1
    return out


def predict_cut_products(grna: dict, construct_size: int, overhang_nt: int = 0) -> dict:
    """Predict ssDNA fragment sizes per dye for one gRNA + cut chemistry.

    Returns {"Y": {...}, "B": {...}, "G": {...}, "R": {...}} per BIOLOGY.md.
    """
    X = grna["cut_construct"]
    top_left, top_right = X, construct_size - X
    bot_left, bot_right = X + overhang_nt, construct_size - X - overhang_nt

    pam_on_top = grna["strand"] == "top"
    left_is_proximal = not pam_on_top
    top_is_non_template = pam_on_top

    return {
        "Y": {
            "length": top_left, "fragment": "LEFT", "strand": "top",
            "template": "non-template" if top_is_non_template else "template",
            "pam_side": "proximal" if left_is_proximal else "distal",
        },
        "B": {
            "length": bot_left, "fragment": "LEFT", "strand": "bot",
            "template": "template" if top_is_non_template else "non-template",
            "pam_side": "proximal" if left_is_proximal else "distal",
        },
        "R": {
            "length": top_right, "fragment": "RIGHT", "strand": "top",
            "template": "non-template" if top_is_non_template else "template",
            "pam_side": "distal" if left_is_proximal else "proximal",
        },
        "G": {
            "length": bot_right, "fragment": "RIGHT", "strand": "bot",
            "template": "template" if top_is_non_template else "non-template",
            "pam_side": "distal" if left_is_proximal else "proximal",
        },
    }


def load_construct(registry_path: Path, construct_id: str) -> dict:
    reg = yaml.safe_load(registry_path.read_text())
    constructs = reg.get("constructs") or {}
    if construct_id not in constructs:
        raise KeyError(f"No construct named {construct_id!r} in {registry_path}")
    return constructs[construct_id]


def find_by_spacer(grnas: list[dict], spacer: str) -> Optional[dict]:
    """Locate a candidate by 20-nt spacer (matches forward or RC)."""
    norm = normalize_spacer(spacer)
    if len(norm) != 20:
        return None
    rc = reverse_complement(norm)
    for g in grnas:
        if g["protospacer"] in (norm, rc):
            return g
    return None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY)
    ap.add_argument("--construct", default="V059_gRNA3", help="Construct id from registry")
    ap.add_argument("--spacer", help="20-nt spacer; predict for this gRNA only")
    ap.add_argument("--enumerate", action="store_true", help="List every candidate gRNA in the target window")
    ap.add_argument("--overhang", type=int, default=0, help="5' overhang in nt (negative for 3' overhang)")
    ap.add_argument("--json", action="store_true", help="Emit JSON")
    args = ap.parse_args()

    try:
        construct = load_construct(args.registry, args.construct)
    except (FileNotFoundError, KeyError) as e:
        print(f"[cas9-cut-predictor] {e}", file=sys.stderr)
        return 2

    seq = construct["sequence"]
    grnas = find_grnas(seq, construct["target_start"], construct["target_end"])

    if args.spacer:
        hit = find_by_spacer(grnas, args.spacer)
        if not hit:
            print(f"[cas9-cut-predictor] spacer not found in {args.construct} target window", file=sys.stderr)
            return 1
        prod = predict_cut_products(hit, len(seq), args.overhang)
        out = {"construct": args.construct, "overhang_nt": args.overhang, "grna": hit, "products": prod}
        if args.json:
            print(json.dumps(out, indent=2))
        else:
            print(f"construct: {args.construct}  overhang: {args.overhang} nt")
            print(f"gRNA: strand={hit['strand']}  PAM={hit['pam_seq']}  cut@{hit['cut_construct']}")
            print(f"  spacer: {hit['protospacer']}")
            print("  predicted ssDNA sizes (bp):")
            for d in ("Y", "B", "G", "R"):
                p = prod[d]
                print(f"    {d}: {p['length']:>4}  {p['fragment']:>5}  {p['strand']:>3}  {p['template']:>13}  {p['pam_side']:>8}")
        return 0

    if args.enumerate:
        rows = []
        for g in grnas:
            prod = predict_cut_products(g, len(seq), args.overhang)
            rows.append({"grna": g, "products": prod})
        if args.json:
            print(json.dumps({"construct": args.construct, "overhang_nt": args.overhang, "candidates": rows}, indent=2))
        else:
            print(f"construct: {args.construct}  overhang: {args.overhang} nt  candidates: {len(rows)}")
            print(f"  {'#':>3}  {'strand':>6}  {'PAM':>4}  {'cut':>4}   Y     B     G     R")
            for r in rows:
                g, p = r["grna"], r["products"]
                print(f"  {g['id']:>3}  {g['strand']:>6}  {g['pam_seq']:>4}  {g['cut_construct']:>4}  {p['Y']['length']:>4}  {p['B']['length']:>4}  {p['G']['length']:>4}  {p['R']['length']:>4}")
        return 0

    print("Specify --enumerate or --spacer. Use --help for details.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
