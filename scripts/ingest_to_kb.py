#!/usr/bin/env python3
"""
ingest_to_kb.py — Sync fragment-viewer metadata into the lab knowledge base.

Writes:
  - LAB_GRNA_CATALOG entries → table `lab_grnas`
  - Experiment metadata (parsed from data/fa_data.json sample keys) → table `fragment_analysis_experiments`

Usage:
    python scripts/ingest_to_kb.py --grnas             # sync the gRNA catalog
    python scripts/ingest_to_kb.py --experiments       # sync experiment metadata
    python scripts/ingest_to_kb.py --all               # both of the above
    python scripts/ingest_to_kb.py --init              # initialize tables (idempotent)
"""
from __future__ import annotations
import argparse
import json
import os
import re
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_KB_PATH = Path.home() / "lab_knowledge.db"
REPO_ROOT = Path(__file__).resolve().parent.parent
VIEWER_PATH = REPO_ROOT / "src" / "FragmentViewer.jsx"
DATA_JSON_PATH = REPO_ROOT / "data" / "fa_data.json"

LAB_GRNAS_SCHEMA = """
CREATE TABLE IF NOT EXISTS lab_grnas (
    name         TEXT PRIMARY KEY,
    spacer       TEXT,
    source       TEXT,
    target       TEXT,
    notes        TEXT,
    first_seen   TEXT,
    last_updated TEXT
);
CREATE INDEX IF NOT EXISTS idx_lab_grnas_target ON lab_grnas(target);
CREATE INDEX IF NOT EXISTS idx_lab_grnas_spacer ON lab_grnas(spacer);
"""

EXPERIMENTS_SCHEMA = """
CREATE TABLE IF NOT EXISTS fragment_analysis_experiments (
    sample_name   TEXT PRIMARY KEY,
    construct     TEXT,
    grna          TEXT,
    n_peaks       INTEGER,
    dyes          TEXT,
    ingested_at   TEXT,
    source_file   TEXT
);
"""


def extract_catalog_from_viewer(viewer_path: Path) -> list[dict]:
    """Pull LAB_GRNA_CATALOG entries out of the JSX source via regex.

    This avoids needing a JS runtime. The expected shape is
        { name: "...", spacer: "...", source: "...", target: "...", notes: "..." },
    with fields in any order.
    """
    if not viewer_path.exists():
        raise FileNotFoundError(f"Viewer not found at {viewer_path}")
    src = viewer_path.read_text()
    # Find the catalog block
    m = re.search(r"const LAB_GRNA_CATALOG\s*=\s*\[(.*?)\n\];", src, flags=re.DOTALL)
    if not m:
        raise ValueError("LAB_GRNA_CATALOG block not found in viewer source")
    block = m.group(1)
    entries = []
    # Strip out comment lines first so we do not parse example entries
    block_no_comments = "\n".join(
        line for line in block.splitlines() if not line.strip().startswith("//")
    )
    # Match one object per entry
    for obj in re.finditer(r"\{([^}]*)\}", block_no_comments):
        body = obj.group(1)
        if not body.strip():
            continue
        fields = {}
        for field_match in re.finditer(r'(\w+)\s*:\s*"((?:[^"\\]|\\.)*)"', body):
            fields[field_match.group(1)] = field_match.group(2)
        if "name" in fields:
            entries.append(
                {
                    "name": fields.get("name", ""),
                    "spacer": fields.get("spacer", ""),
                    "source": fields.get("source", ""),
                    "target": fields.get("target", ""),
                    "notes": fields.get("notes", ""),
                }
            )
    return entries


def extract_experiments_from_data(data_json_path: Path, source_file: str) -> list[dict]:
    """Pull sample metadata from the inlined peak-data JSON."""
    if not data_json_path.exists():
        return []
    data = json.loads(data_json_path.read_text())
    out = []
    peaks = data.get("peaks") or data.get("samples") or {}
    for sample, per_dye in peaks.items():
        n_peaks = 0
        dyes_present = set()
        if isinstance(per_dye, dict):
            for dye, arr in per_dye.items():
                if isinstance(arr, list):
                    n_peaks += len(arr)
                    dyes_present.add(dye)
        m = re.match(r"^(V\d+)_(\d+)-(\d+)$", sample)
        construct = grna = None
        if m:
            construct = m.group(1)
            grna = f"gRNA{m.group(2)}"
        else:
            m2 = re.match(r"^(gRNA\d+)_(\d+)-(\d+)$", sample)
            if m2:
                construct = "V059"
                grna = m2.group(1)
        out.append(
            {
                "sample_name": sample,
                "construct": construct or "unknown",
                "grna": grna or "unknown",
                "n_peaks": n_peaks,
                "dyes": ",".join(sorted(dyes_present)),
                "source_file": source_file,
            }
        )
    return out


def upsert_grnas(conn: sqlite3.Connection, entries: list[dict]) -> tuple[int, int]:
    cur = conn.cursor()
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    n_ins = n_upd = 0
    for e in entries:
        cur.execute("SELECT name FROM lab_grnas WHERE name = ?", (e["name"],))
        hit = cur.fetchone()
        if hit:
            cur.execute(
                """UPDATE lab_grnas
                   SET spacer = ?, source = ?, target = ?, notes = ?, last_updated = ?
                   WHERE name = ?""",
                (e["spacer"], e["source"], e["target"], e["notes"], now, e["name"]),
            )
            n_upd += 1
        else:
            cur.execute(
                """INSERT INTO lab_grnas (name, spacer, source, target, notes, first_seen, last_updated)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (e["name"], e["spacer"], e["source"], e["target"], e["notes"], now, now),
            )
            n_ins += 1
    conn.commit()
    return n_ins, n_upd


def upsert_experiments(conn: sqlite3.Connection, entries: list[dict]) -> tuple[int, int]:
    cur = conn.cursor()
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    n_ins = n_upd = 0
    for e in entries:
        cur.execute(
            "SELECT sample_name FROM fragment_analysis_experiments WHERE sample_name = ?",
            (e["sample_name"],),
        )
        hit = cur.fetchone()
        if hit:
            cur.execute(
                """UPDATE fragment_analysis_experiments
                   SET construct = ?, grna = ?, n_peaks = ?, dyes = ?, ingested_at = ?, source_file = ?
                   WHERE sample_name = ?""",
                (e["construct"], e["grna"], e["n_peaks"], e["dyes"], now, e["source_file"], e["sample_name"]),
            )
            n_upd += 1
        else:
            cur.execute(
                """INSERT INTO fragment_analysis_experiments
                   (sample_name, construct, grna, n_peaks, dyes, ingested_at, source_file)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (e["sample_name"], e["construct"], e["grna"], e["n_peaks"], e["dyes"], now, e["source_file"]),
            )
            n_ins += 1
    conn.commit()
    return n_ins, n_upd


def init_tables(conn: sqlite3.Connection) -> None:
    conn.executescript(LAB_GRNAS_SCHEMA)
    conn.executescript(EXPERIMENTS_SCHEMA)
    conn.commit()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--kb", type=Path, default=DEFAULT_KB_PATH, help="Path to lab_knowledge.db")
    ap.add_argument("--grnas", action="store_true", help="Sync LAB_GRNA_CATALOG -> lab_grnas table")
    ap.add_argument("--experiments", action="store_true", help="Sync data/fa_data.json sample metadata -> fragment_analysis_experiments table")
    ap.add_argument("--all", action="store_true", help="Run all sync steps")
    ap.add_argument("--init", action="store_true", help="Initialize tables (idempotent)")
    args = ap.parse_args()

    if not (args.grnas or args.experiments or args.all or args.init):
        ap.print_help()
        return 1

    kb_path = args.kb
    kb_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(kb_path))

    try:
        init_tables(conn)
        print(f"[ingest] Using KB at {kb_path}")

        if args.grnas or args.all:
            entries = extract_catalog_from_viewer(VIEWER_PATH)
            n_ins, n_upd = upsert_grnas(conn, entries)
            print(f"[ingest] lab_grnas: {len(entries)} parsed, {n_ins} inserted, {n_upd} updated")

        if args.experiments or args.all:
            experiments = extract_experiments_from_data(DATA_JSON_PATH, str(DATA_JSON_PATH.name))
            n_ins, n_upd = upsert_experiments(conn, experiments)
            print(f"[ingest] fragment_analysis_experiments: {len(experiments)} parsed, {n_ins} inserted, {n_upd} updated")

        print("[ingest] OK")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
