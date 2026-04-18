"""Tests for the cas9-cut-predictor skill.

Mirrors the JSX-side vitest assertions in fragment-viewer/tests/classifier.test.mjs
so the Python and JS implementations stay in lockstep.
"""
from pathlib import Path
import sys

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
SKILL_SCRIPTS = REPO_ROOT / "skills" / "cas9-cut-predictor" / "scripts"
sys.path.insert(0, str(SKILL_SCRIPTS))

from cas9_cut_predictor import (  # noqa: E402
    find_grnas, predict_cut_products, reverse_complement, normalize_spacer,
    find_by_spacer, load_construct,
)

REGISTRY = REPO_ROOT / "data" / "constructs.yaml"


@pytest.fixture(scope="module")
def v059():
    return load_construct(REGISTRY, "V059_gRNA3")


def test_reverse_complement():
    assert reverse_complement("ACGT") == "ACGT"
    assert reverse_complement("AAAA") == "TTTT"
    assert reverse_complement("acgN") == "NCGT"


def test_normalize_spacer():
    assert normalize_spacer("acguacguacguacguacgu") == "ACGTACGTACGTACGTACGT"
    assert normalize_spacer("ACGT-ACGT ACGT") == "ACGTACGTACGT"
    assert normalize_spacer(None) == ""


def test_find_grnas_v059(v059):
    grnas = find_grnas(v059["sequence"], v059["target_start"], v059["target_end"])
    assert len(grnas) > 0
    for g in grnas:
        assert len(g["protospacer"]) == 20
        assert v059["target_start"] <= g["cut_construct"] <= v059["target_end"]
        assert g["strand"] in ("top", "bot")


def test_predict_blunt_sums_to_construct(v059):
    grnas = find_grnas(v059["sequence"], v059["target_start"], v059["target_end"])
    g = grnas[0]
    out = predict_cut_products(g, v059["total_bp"], 0)
    assert out["Y"]["length"] + out["R"]["length"] == v059["total_bp"]
    assert out["B"]["length"] + out["G"]["length"] == v059["total_bp"]


def test_overhang_shifts_bot_strand(v059):
    grnas = find_grnas(v059["sequence"], v059["target_start"], v059["target_end"])
    g = grnas[0]
    blunt = predict_cut_products(g, v059["total_bp"], 0)
    oh4 = predict_cut_products(g, v059["total_bp"], 4)
    assert oh4["B"]["length"] - blunt["B"]["length"] == 4
    assert blunt["G"]["length"] - oh4["G"]["length"] == 4
    assert oh4["Y"]["length"] == blunt["Y"]["length"]
    assert oh4["R"]["length"] == blunt["R"]["length"]


def test_top_strand_pam_template_labels(v059):
    grnas = find_grnas(v059["sequence"], v059["target_start"], v059["target_end"])
    top = next(g for g in grnas if g["strand"] == "top")
    out = predict_cut_products(top, v059["total_bp"], 0)
    assert out["Y"]["template"] == "non-template"
    assert out["B"]["template"] == "template"
    assert out["Y"]["pam_side"] == "distal"
    assert out["R"]["pam_side"] == "proximal"


def test_bot_strand_pam_template_labels(v059):
    grnas = find_grnas(v059["sequence"], v059["target_start"], v059["target_end"])
    bot = next((g for g in grnas if g["strand"] == "bot"), None)
    if bot is None:
        pytest.skip("No bot-strand PAM in V059 target window")
    out = predict_cut_products(bot, v059["total_bp"], 0)
    # bot PAM: bot is non-template -> top is template
    assert out["Y"]["template"] == "template"
    assert out["B"]["template"] == "non-template"
    # bot PAM: LEFT contains PAM -> LEFT proximal
    assert out["Y"]["pam_side"] == "proximal"
    assert out["R"]["pam_side"] == "distal"


def test_find_by_spacer_handles_rc(v059):
    grnas = find_grnas(v059["sequence"], v059["target_start"], v059["target_end"])
    g = grnas[0]
    hit_fwd = find_by_spacer(grnas, g["protospacer"])
    hit_rc = find_by_spacer(grnas, reverse_complement(g["protospacer"]))
    assert hit_fwd == g
    assert hit_rc == g
