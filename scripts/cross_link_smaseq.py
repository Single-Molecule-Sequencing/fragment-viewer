#!/usr/bin/env python3
"""
cross_link_smaseq.py — Cross-link fragment-viewer samples to SMA-seq experiments.

Reads:
  ~/lab_knowledge.db::fragment_analysis_experiments  (one row per CE sample)
  ~/.sma-registry/sma_registry.db::experiments       (one row per SMA-seq run)

For each fragment-viewer sample, looks for an SMA-seq experiment whose `name`
contains the sample name (or vice versa). Reports matches as a tab-separated
table on stdout. Writes nothing.

Use this when you suspect a CLC fragment-analysis sample feeds a downstream
SMA-seq library; the link establishes provenance from CE -> SMA-seq.

Usage:
    python scripts/cross_link_smaseq.py
    python scripts/cross_link_smaseq.py --sample V059_3-2
    python scripts/cross_link_smaseq.py --sma-kb /path/to/sma_registry.db
"""
from __future__ import annotations
import argparse
import sqlite3
import sys
from pathlib import Path

DEFAULT_LAB_KB = Path.home() / "lab_knowledge.db"
DEFAULT_SMA_KB = Path.home() / ".sma-registry" / "sma_registry.db"


def fetch_fragment_samples(conn: sqlite3.Connection, only: str | None = None) -> list[dict]:
    cur = conn.cursor()
    if only:
        cur.execute(
            "SELECT sample_name, construct, grna FROM fragment_analysis_experiments WHERE sample_name = ?",
            (only,),
        )
    else:
        cur.execute("SELECT sample_name, construct, grna FROM fragment_analysis_experiments ORDER BY sample_name")
    return [
        {"sample": s, "construct": c, "grna": g}
        for s, c, g in cur.fetchall()
    ]


def fetch_smaseq_experiments(conn: sqlite3.Connection) -> list[dict]:
    cur = conn.cursor()
    cur.execute("SELECT exp_id, name, status, created_at FROM experiments ORDER BY created_at DESC")
    return [
        {"exp_id": e, "name": n, "status": s, "created_at": c}
        for e, n, s, c in cur.fetchall()
    ]


def find_matches(fragments: list[dict], smaseqs: list[dict]) -> list[dict]:
    """Naive substring match. Either side may contain the other."""
    out = []
    for f in fragments:
        sample = f["sample"]
        for s in smaseqs:
            name = s["name"] or ""
            if sample in name or name in sample:
                out.append({**f, **{f"sma_{k}": v for k, v in s.items()}})
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--lab-kb", type=Path, default=DEFAULT_LAB_KB)
    ap.add_argument("--sma-kb", type=Path, default=DEFAULT_SMA_KB)
    ap.add_argument("--sample", help="Restrict to one fragment-viewer sample")
    args = ap.parse_args()

    if not args.lab_kb.exists():
        print(f"[cross-link] {args.lab_kb} missing; run scripts/ingest_to_kb.py first", file=sys.stderr)
        return 1
    if not args.sma_kb.exists():
        print(f"[cross-link] {args.sma_kb} missing; SMA registry not initialized", file=sys.stderr)
        return 2

    lab = sqlite3.connect(str(args.lab_kb))
    sma = sqlite3.connect(str(args.sma_kb))

    try:
        fragments = fetch_fragment_samples(lab, args.sample)
        smaseqs = fetch_smaseq_experiments(sma)
        print(f"[cross-link] {len(fragments)} fragment samples, {len(smaseqs)} SMA-seq experiments", file=sys.stderr)

        matches = find_matches(fragments, smaseqs)

        cols = ["sample", "construct", "grna", "sma_exp_id", "sma_name", "sma_status", "sma_created_at"]
        print("\t".join(cols))
        for m in matches:
            print("\t".join(str(m.get(c, "")) for c in cols))

        print(f"[cross-link] {len(matches)} matches", file=sys.stderr)
        return 0
    finally:
        lab.close()
        sma.close()


if __name__ == "__main__":
    sys.exit(main())
