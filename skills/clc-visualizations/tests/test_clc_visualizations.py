"""Smoke tests for the clc-visualizations skill.

Each test renders one figure on the bundled V059 dataset and asserts the
output file is non-empty (>1 KB PNG). We do not pixel-compare; the goal is
to catch regressions where a function silently raises or produces an empty
canvas.
"""
from pathlib import Path
import sys

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
SKILL_SCRIPTS = REPO_ROOT / "skills" / "clc-visualizations" / "scripts"
sys.path.insert(0, str(SKILL_SCRIPTS))

from clc_visualizations import (  # noqa: E402
    plot_electropherogram, plot_construct, plot_cut_diagram, plot_ssdna_products,
)
sys.path.insert(0, str(REPO_ROOT / "skills" / "cas9-cut-predictor" / "scripts"))
sys.path.insert(0, str(REPO_ROOT / "skills" / "genemapper-parser" / "scripts"))
from cas9_cut_predictor import find_grnas, predict_cut_products, load_construct  # noqa: E402
from genemapper_parser import parse_genemapper_path  # noqa: E402


REGISTRY = REPO_ROOT / "data" / "constructs.yaml"
TSV = REPO_ROOT / "data" / "blue_export.txt"


@pytest.fixture(scope="module")
def construct():
    return load_construct(REGISTRY, "V059_gRNA3")


@pytest.fixture(scope="module")
def peaks():
    if not TSV.exists():
        pytest.skip("data/blue_export.txt not present")
    return parse_genemapper_path(TSV)["peaks"]


def _assert_nonempty_png(path):
    assert path.exists()
    assert path.stat().st_size > 1024


def test_plot_electropherogram(tmp_path, peaks):
    fig = plot_electropherogram(peaks, "V059_3-2")
    out = tmp_path / "trace.png"
    fig.savefig(out, bbox_inches="tight")
    _assert_nonempty_png(out)


def test_plot_construct(tmp_path, construct):
    fig = plot_construct(construct)
    out = tmp_path / "construct.png"
    fig.savefig(out, bbox_inches="tight")
    _assert_nonempty_png(out)


def test_plot_cut_diagram(tmp_path, construct):
    grnas = find_grnas(construct["sequence"], construct["target_start"], construct["target_end"])
    fig = plot_cut_diagram(construct, grnas[0], overhang_nt=4)
    out = tmp_path / "cut.png"
    fig.savefig(out, bbox_inches="tight")
    _assert_nonempty_png(out)


def test_plot_ssdna_products(tmp_path, construct):
    grnas = find_grnas(construct["sequence"], construct["target_start"], construct["target_end"])
    products = predict_cut_products(grnas[0], construct["total_bp"], 0)
    fig = plot_ssdna_products(grnas[0], products)
    out = tmp_path / "ssdna.png"
    fig.savefig(out, bbox_inches="tight")
    _assert_nonempty_png(out)
