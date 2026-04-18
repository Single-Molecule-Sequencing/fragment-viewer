#!/usr/bin/env python3
"""
clc_construct_registry.py — Query the canonical CLC fragment-analysis construct registry.

Reads:
    fragment-viewer/data/constructs.yaml   (canonical)

Subcommands:
    list                  Print one line per construct (id, total_bp, target window).
    get <id>              Print the entry as JSON.
    validate              Verify schema rules: components sum to total_bp; dye_strand
                          covers B/G/Y/R; sequence length matches total_bp.
    json                  Dump the full registry as JSON.

The registry is the single source of truth for construct definitions. The
fragment-viewer JSX inlines the same data as `CONSTRUCT`; both must agree.
"""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_REGISTRY = REPO_ROOT / "data" / "constructs.yaml"
REQUIRED_DYES = ("B", "G", "Y", "R")


def load_registry(path: Path) -> dict:
    if not path.exists():
        raise FileNotFoundError(f"Registry not found at {path}")
    return yaml.safe_load(path.read_text())


def validate_construct(cid: str, c: dict) -> list[str]:
    errors = []
    total = c.get("total_bp")
    components = c.get("components") or []
    csum = sum(seg.get("size", 0) for seg in components)
    if total is None:
        errors.append(f"{cid}: missing total_bp")
    elif total != csum:
        errors.append(f"{cid}: total_bp {total} != sum(components.size) {csum}")
    seq = c.get("sequence") or ""
    if total and len(seq) != total:
        errors.append(f"{cid}: sequence length {len(seq)} != total_bp {total}")
    ds = c.get("dye_strand") or {}
    for dye in REQUIRED_DYES:
        if dye not in ds:
            errors.append(f"{cid}: dye_strand missing channel {dye}")
    ts = c.get("target_start")
    te = c.get("target_end")
    if ts is None or te is None:
        errors.append(f"{cid}: missing target_start/target_end")
    elif not (1 <= ts <= te <= (total or te)):
        errors.append(f"{cid}: target_range out of bounds: {ts}..{te}")
    return errors


def cmd_list(reg: dict) -> int:
    constructs = reg.get("constructs") or {}
    for cid in sorted(constructs):
        c = constructs[cid]
        ts = c.get("target_start", "?")
        te = c.get("target_end", "?")
        print(f"{cid:<24} {c.get('total_bp', '?'):>5} bp  target {ts}..{te}  {c.get('name', '')}")
    return 0


def cmd_get(reg: dict, cid: str) -> int:
    constructs = reg.get("constructs") or {}
    if cid not in constructs:
        print(f"[get] No construct named {cid!r}", file=sys.stderr)
        return 1
    print(json.dumps(constructs[cid], indent=2))
    return 0


def cmd_validate(reg: dict) -> int:
    constructs = reg.get("constructs") or {}
    all_errors = []
    for cid, c in constructs.items():
        errs = validate_construct(cid, c)
        for e in errs:
            print(f"::error::{e}", file=sys.stderr)
        all_errors.extend(errs)
    if all_errors:
        print(f"[validate] {len(all_errors)} error(s) across {len(constructs)} construct(s)", file=sys.stderr)
        return 1
    print(f"[validate] OK ({len(constructs)} constructs)")
    return 0


def cmd_json(reg: dict) -> int:
    print(json.dumps(reg, indent=2))
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list")
    p_get = sub.add_parser("get")
    p_get.add_argument("cid")
    sub.add_parser("validate")
    sub.add_parser("json")
    args = ap.parse_args()

    try:
        reg = load_registry(args.registry)
    except FileNotFoundError as e:
        print(f"[clc-construct] {e}", file=sys.stderr)
        return 2

    if args.cmd == "list":
        return cmd_list(reg)
    if args.cmd == "get":
        return cmd_get(reg, args.cid)
    if args.cmd == "validate":
        return cmd_validate(reg)
    if args.cmd == "json":
        return cmd_json(reg)
    return 0


if __name__ == "__main__":
    sys.exit(main())
