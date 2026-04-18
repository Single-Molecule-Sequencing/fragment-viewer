"""Tests for the genemapper-parser skill."""
from pathlib import Path
import sys

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
SKILL_SCRIPTS = REPO_ROOT / "skills" / "genemapper-parser" / "scripts"
sys.path.insert(0, str(SKILL_SCRIPTS))

from genemapper_parser import parse_genemapper, parse_genemapper_path  # noqa: E402

TSV = """Sample Name\tDye/Sample Peak\tSize\tHeight\tArea\tWidth in BP
V059_1\tB,1\t100.5\t1500\t750\t0.42
V059_1\tB,2\t200.0\t13876\t4496\t0.31
V059_1\tG,1\t199.7\t32051\t29416\t0.81
V059_2\tY\t201.5\t800\t300\t0.50
V059_2\tR\t203.0\t650\t245\t0.45
"""


def test_basic_parse():
    out = parse_genemapper(TSV)
    assert out["samples"] == ["V059_1", "V059_2"]
    assert out["peaks"]["V059_1"]["B"][0] == [100.5, 1500.0, 750.0, 0.42]
    assert out["peaks"]["V059_1"]["B"][1][0] == 200.0
    assert out["peaks"]["V059_1"]["G"][0][0] == 199.7
    assert out["peaks"]["V059_2"]["Y"][0][0] == 201.5
    assert out["peaks"]["V059_2"]["R"][0][0] == 203.0


def test_dye_first_letter_only():
    """The first comma-separated token of Dye/Sample Peak is the dye letter."""
    tsv = "Sample Name\tDye/Sample Peak\tSize\tHeight\tArea\tWidth in BP\nA\tB,7\t100\t1\t1\t0.5\n"
    out = parse_genemapper(tsv)
    assert "B" in out["peaks"]["A"]


def test_missing_size_dropped():
    tsv = "Sample Name\tDye/Sample Peak\tSize\tHeight\tArea\tWidth in BP\nA\tB\t\t1\t1\t0.5\n"
    out = parse_genemapper(tsv)
    assert out["peaks"] == {}


def test_alternate_header_names():
    tsv = "SampleName\tDye\tSize\tHeight\tArea\tWidth\nA\tB\t100\t1\t1\t0.5\n"
    out = parse_genemapper(tsv)
    assert out["peaks"]["A"]["B"][0] == [100.0, 1.0, 1.0, 0.5]


def test_utf8_bom():
    tsv_with_bom = "\ufeff" + TSV
    out = parse_genemapper(tsv_with_bom)
    assert "V059_1" in out["peaks"]


def test_real_dataset_round_trip():
    """Re-parse the committed blue_export.txt and assert sample count."""
    raw = REPO_ROOT / "data" / "blue_export.txt"
    if not raw.exists():
        pytest.skip("data/blue_export.txt not present")
    out = parse_genemapper_path(raw)
    assert len(out["samples"]) == 10
    n_peaks = sum(len(v) for s in out["peaks"].values() for v in s.values())
    assert n_peaks > 1000
