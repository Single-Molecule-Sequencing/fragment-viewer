#!/usr/bin/env python3
"""
clc_visualizations.py — Headless matplotlib figures for CLC fragment analysis.

Mirrors the visual conventions of the fragment-viewer React app so output is
legible alongside the in-browser view. Use for manuscript figures, batch QC,
or pipelines that cannot run the React app.
"""
from __future__ import annotations
import argparse
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")  # headless
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[3]
SKILL_SCRIPTS_BASE = REPO_ROOT / "skills"
sys.path.insert(0, str(SKILL_SCRIPTS_BASE / "cas9-cut-predictor" / "scripts"))
sys.path.insert(0, str(SKILL_SCRIPTS_BASE / "genemapper-parser" / "scripts"))
sys.path.insert(0, str(SKILL_SCRIPTS_BASE / "clc-construct-registry" / "scripts"))

from cas9_cut_predictor import (  # noqa: E402
    find_grnas, predict_cut_products, find_by_spacer, load_construct,
)

# Mirror of ASSEMBLY_PRODUCTS in fragment-viewer/src/FragmentViewer.jsx.
# Order matters only for stable label sort in the overlay.
ASSEMBLY_PRODUCTS = [
    {"id": "full",           "name": "Full ligation",                "parts": ["ad1","oh1","br1","target","br2","oh2","ad2"], "dyes": ["B","Y","G","R"]},
    {"id": "no_ad2",         "name": "Missing Ad2",                  "parts": ["ad1","oh1","br1","target","br2","oh2"],        "dyes": ["B","Y"]},
    {"id": "no_ad1",         "name": "Missing Ad1",                  "parts": ["oh1","br1","target","br2","oh2","ad2"],        "dyes": ["G","R"]},
    {"id": "ad1_br1_target", "name": "Ad1+Br1+Target",               "parts": ["ad1","oh1","br1","target"],                    "dyes": ["B","Y"]},
    {"id": "target_ad2",     "name": "Target+Br2+Ad2",               "parts": ["target","br2","oh2","ad2"],                    "dyes": ["G","R"]},
    {"id": "adapter_dimer",  "name": "Adapter dimer",                "parts": ["ad1","oh1","oh2","ad2"],                        "dyes": ["B","Y","G","R"]},
]


def expected_species_for_dye(dye, components, construct_size=226, gRNAs=None, overhangs=None):
    """Mirror of expectedSpeciesForDye in fragment-viewer/src/FragmentViewer.jsx.

    Returns list of dicts {size, label, kind} sorted by ascending bp.
    components: dict mapping component key -> size in bp.
    """
    out = []
    for p in ASSEMBLY_PRODUCTS:
        if dye not in p["dyes"]:
            continue
        size = sum(components.get(k, 0) for k in p["parts"])
        out.append({"size": size, "label": p["name"], "kind": "assembly"})
    monomers = {
        "B": (29, "Ad1 bot oligo (6-FAM)"),
        "Y": (25, "Ad1 top oligo (TAMRA)"),
        "G": (25, "Ad2 bot oligo (HEX)"),
        "R": (29, "Ad2 top oligo (ROX)"),
    }
    if dye in monomers:
        size, label = monomers[dye]
        out.append({"size": size, "label": label, "kind": "monomer"})
    for g in (gRNAs or []):
        for oh in (overhangs or [0]):
            products = predict_cut_products(g, construct_size, oh)
            p = products.get(dye)
            if not p:
                continue
            ohlbl = "blunt" if oh == 0 else (f"+{oh} nt 5'" if oh > 0 else f"{oh} nt 3'")
            gname = g.get("name") or f"cand-{g.get('id', '?')}"
            out.append({
                "size": p["length"],
                "label": f"{gname} {p['fragment']} ({ohlbl})",
                "kind": "cut",
            })
    return sorted(out, key=lambda s: s["size"])
from genemapper_parser import parse_genemapper_path  # noqa: E402

# Mirror of tailwind.config.js theme.extend.colors.dye and DyeChip in JSX.
DYE_COLORS = {
    "B": "#1e6fdb",  # 6-FAM
    "G": "#16a34a",  # HEX
    "Y": "#ca8a04",  # TAMRA
    "R": "#dc2626",  # ROX
    "O": "#ea580c",  # GS500LIZ
}
DYE_LABELS = {"B": "6-FAM", "G": "HEX", "Y": "TAMRA", "R": "ROX", "O": "GS500LIZ"}
SAMPLE_DYES = ("B", "G", "Y", "R")

plt.rcParams.update({
    "font.family": "sans-serif",
    "font.sans-serif": ["Inter", "DejaVu Sans", "Liberation Sans", "Arial"],
    "axes.spines.top": False,
    "axes.spines.right": False,
    "axes.grid": False,
    "axes.titlesize": 11,
    "axes.titleweight": "semibold",
    "axes.labelsize": 9,
    "xtick.labelsize": 8,
    "ytick.labelsize": 8,
    "legend.fontsize": 8,
    "figure.dpi": 110,
})


# ----------------------------------------------------------------------
# Trace reconstruction (Gaussian-sum equivalent of the JSX viewer)
# ----------------------------------------------------------------------
def gaussian_sum(peaks, x, smoothing=1.0):
    """Return an array y = sum_i height_i * gaussian(x; mu_i, sigma_i).

    peaks: iterable of (size, height, area, width) tuples (the viewer schema).
    sigma_i = max(width_i / 2.355 * smoothing, 0.12).
    """
    y = np.zeros_like(x, dtype=float)
    for size, height, _area, width in peaks:
        sigma = max((width or 0.5) / 2.355 * smoothing, 0.12)
        y += height * np.exp(-0.5 * ((x - size) / sigma) ** 2)
    return y


def plot_electropherogram(peaks, sample, *, dyes=SAMPLE_DYES, x_range=(0, 260),
                           smoothing=1.0, log_y=False, expected=None,
                           species_overlay=None):
    """4-panel reconstructed electropherogram for one sample.

    species_overlay (optional) annotates each lane with the expected
    locations of every reactant / partial-ligation / full-ligation /
    cut species the dye CAN show. Two accepted forms:
      * dict[str, list[dict]]  e.g. {"B": [{size, label, kind}, ...], ...}
      * dict with keys components / construct_size / gRNAs / overhangs
        which are passed straight to expected_species_for_dye().
    """
    if sample not in peaks:
        raise KeyError(f"sample {sample!r} not in peaks")
    sample_data = peaks[sample]
    fig, axes = plt.subplots(len(dyes), 1, figsize=(9, 1.55 * len(dyes)),
                              sharex=True, constrained_layout=True)
    if len(dyes) == 1:
        axes = [axes]

    species_palette = {"assembly": "#52525b", "monomer": "#d97706", "cut": "#0284c7"}

    x = np.linspace(x_range[0], x_range[1], 1200)
    for ax, dye in zip(axes, dyes):
        rows = sample_data.get(dye) or []
        color = DYE_COLORS[dye]
        if rows:
            y = gaussian_sum(rows, x, smoothing=smoothing)
            if log_y:
                y = np.log10(np.maximum(1, y + 1))
            ax.fill_between(x, 0, y, color=color, alpha=0.18, linewidth=0)
            ax.plot(x, y, color=color, linewidth=1.0)
        ax.text(0.01, 0.92, f"{dye} · {DYE_LABELS[dye]}",
                transform=ax.transAxes, fontsize=8, color=color, fontweight="600")
        ax.set_ylabel("rfu" + (" (log)" if log_y else ""), fontsize=7, color="#71717a")
        ax.tick_params(axis="y", labelsize=7, colors="#71717a")
        ax.set_xlim(*x_range)
        if expected and dye in expected:
            ax.axvline(expected[dye], color="#a1a1aa", linestyle="--", linewidth=0.7)

        # Species overlay
        if species_overlay is not None:
            if isinstance(species_overlay, dict) and dye in species_overlay and isinstance(species_overlay[dye], list):
                species = species_overlay[dye]
            elif isinstance(species_overlay, dict) and "components" in species_overlay:
                species = expected_species_for_dye(
                    dye,
                    species_overlay["components"],
                    species_overlay.get("construct_size", 226),
                    species_overlay.get("gRNAs", []),
                    species_overlay.get("overhangs", [0]),
                )
            else:
                species = []
            visible = [sp for sp in species if x_range[0] <= sp["size"] <= x_range[1]]
            # Stack labels across N rows so they don't collide
            n_rows = 4
            label_dx = (x_range[1] - x_range[0]) / 14   # ~14 label slots per row
            row_x = [None] * n_rows
            ymin, ymax = ax.get_ylim()
            for sp in visible:
                row = next((r for r in range(n_rows) if row_x[r] is None or sp["size"] - row_x[r] >= label_dx), n_rows - 1)
                row_x[row] = sp["size"]
                stroke = species_palette.get(sp["kind"], "#71717a")
                ax.axvline(sp["size"], color=stroke, linewidth=0.6, linestyle=(0, (1.5, 2.5)), alpha=0.6)
                ax.annotate(
                    f"{sp['label']} · {sp['size']}",
                    xy=(sp["size"], ymax * (0.78 - 0.10 * row)),
                    fontsize=6.5, color=stroke, fontweight="600",
                    rotation=90, va="top", ha="left",
                    annotation_clip=True,
                )

    axes[-1].set_xlabel("size (bp)", fontsize=9)
    title = f"{sample} · 4-channel CE trace"
    if species_overlay is not None:
        title += "  ·  expected-species overlay on"
    fig.suptitle(title, fontsize=11, fontweight="600", y=1.02)
    return fig


# ----------------------------------------------------------------------
# Construct architecture bar
# ----------------------------------------------------------------------
def plot_construct(construct):
    """Horizontal stacked bar of construct components with dye chips at termini."""
    components = construct["components"]
    total = construct["total_bp"]
    palette = {
        "ad1":    "#1e6fdb",
        "oh1":    "#94a3b8",
        "br1":    "#64748b",
        "target": "#334155",
        "br2":    "#64748b",
        "oh2":    "#94a3b8",
        "ad2":    "#dc2626",
    }
    fig, ax = plt.subplots(figsize=(9, 1.6), constrained_layout=True)
    x = 1
    for c in components:
        ax.barh(0, c["size"], left=x, height=0.6,
                color=palette.get(c["key"], "#a3a3a3"), edgecolor="white", linewidth=1)
        if c["size"] >= 18:
            ax.text(x + c["size"] / 2, 0, f"{c['name']}\n{c['size']} bp",
                    ha="center", va="center", color="white", fontsize=7, fontweight="500")
        x += c["size"]

    # Target window highlight
    ts = construct.get("target_start")
    te = construct.get("target_end")
    if ts and te:
        ax.add_patch(plt.Rectangle((ts, -0.55), te - ts + 1, 1.1,
                                    fill=False, edgecolor="#0ea5e9", linewidth=1.2, linestyle="--"))
        ax.text((ts + te) / 2, 0.65, f"target window  {ts}-{te}",
                ha="center", color="#0369a1", fontsize=8, fontweight="600")

    # Dye chips at the four label positions (Adapter 1: B+Y at 1; Adapter 2: G+R at 226)
    for dye in ("B", "Y"):
        ax.scatter([1], [-0.4 if dye == "B" else 0.4], s=40,
                   color=DYE_COLORS[dye], zorder=3, edgecolor="white", linewidth=1)
    for dye in ("G", "R"):
        ax.scatter([total], [-0.4 if dye == "G" else 0.4], s=40,
                   color=DYE_COLORS[dye], zorder=3, edgecolor="white", linewidth=1)

    ax.set_xlim(0, total + 2)
    ax.set_ylim(-1, 1)
    ax.set_yticks([])
    ax.set_xlabel("position (bp)", fontsize=8)
    ax.set_title(f"{construct['id']} · {total} bp ligated construct", fontsize=10, fontweight="600", loc="left")
    ax.spines["left"].set_visible(False)
    return fig


# ----------------------------------------------------------------------
# Cas9 cut diagram (single gRNA + chemistry)
# ----------------------------------------------------------------------
def plot_cut_diagram(construct, grna, overhang_nt=0):
    """Construct bar with scissors marker at cut + amber overhang band."""
    fig = plot_construct(construct)
    ax = fig.axes[0]
    cut = grna["cut_construct"]
    if overhang_nt > 0:
        ax.add_patch(plt.Rectangle((cut, -0.55), overhang_nt, 1.1,
                                    facecolor="#fbbf24", edgecolor="#d97706", linewidth=0.8, alpha=0.7))
        ax.text(cut + overhang_nt / 2, 0.85, f"+{overhang_nt} nt 5' overhang",
                ha="center", color="#92400e", fontsize=7, fontweight="600")
    ax.axvline(cut, color="#0f172a", linewidth=1.6, ymin=0.05, ymax=0.95)
    ax.text(cut, -0.78, "✂", ha="center", fontsize=14)
    ax.text(cut, 0.95, f"cut@{cut}", ha="center", color="#0f172a", fontsize=8, fontweight="600")
    ax.set_title(f"{construct['id']} · cut by {grna['strand']}-strand PAM {grna['pam_seq']} · overhang {overhang_nt} nt",
                 fontsize=10, fontweight="600", loc="left")
    return fig


# ----------------------------------------------------------------------
# 4-ssDNA product visualization
# ----------------------------------------------------------------------
def plot_ssdna_products(grna, products):
    """Stacked horizontal bars: 4 ssDNA strands with dye circles + labels."""
    fig, ax = plt.subplots(figsize=(9, 2.6), constrained_layout=True)
    rows = [
        ("Y", "TAMRA",  products["Y"]["length"], products["Y"]["fragment"], products["Y"]["template"], products["Y"]["pam_side"]),
        ("B", "6-FAM",  products["B"]["length"], products["B"]["fragment"], products["B"]["template"], products["B"]["pam_side"]),
        ("R", "ROX",    products["R"]["length"], products["R"]["fragment"], products["R"]["template"], products["R"]["pam_side"]),
        ("G", "HEX",    products["G"]["length"], products["G"]["fragment"], products["G"]["template"], products["G"]["pam_side"]),
    ]
    max_len = max(r[2] for r in rows)
    for i, (dye, label, length, frag, tpl, pam) in enumerate(rows):
        y = len(rows) - i - 1
        # Strand bar
        ax.barh(y, length, height=0.55, color=DYE_COLORS[dye], alpha=0.18, linewidth=0)
        ax.barh(y, length, height=0.55, edgecolor=DYE_COLORS[dye], facecolor="none", linewidth=1.2)
        # Dye circle at terminal end
        x_dye = length if frag == "RIGHT" else 0
        ax.scatter([x_dye], [y], s=120, color=DYE_COLORS[dye], zorder=3, edgecolor="white", linewidth=1.5)
        # Length label
        ax.text(length + 4, y, f"{length} nt", va="center", fontsize=8, fontweight="500", color=DYE_COLORS[dye])
        # Annotation
        ax.text(-22, y, f"{dye}  {label}", va="center", fontsize=8, fontweight="600", color=DYE_COLORS[dye])
        ax.text(length / 2, y - 0.42, f"{frag} · {tpl} · PAM-{pam}",
                ha="center", fontsize=7, color="#52525b")

    ax.set_xlim(-30, max_len + 50)
    ax.set_ylim(-0.7, len(rows) - 0.3)
    ax.set_yticks([])
    ax.set_xlabel("ssDNA size (nt)", fontsize=8)
    ax.set_title(f"4 ssDNA products · {grna['strand']}-strand PAM {grna['pam_seq']} · cut@{grna['cut_construct']}",
                 fontsize=10, fontweight="600", loc="left")
    return fig


# ----------------------------------------------------------------------
# CLI
# ----------------------------------------------------------------------
def cmd_electropherogram(args):
    parsed = parse_genemapper_path(args.tsv)
    species_overlay = None
    if args.species:
        construct = load_construct(args.registry, args.construct)
        components = {c["key"]: c["size"] for c in construct["components"]}
        gRNAs = []
        if args.spacer:
            grnas = find_grnas(construct["sequence"], construct["target_start"], construct["target_end"])
            hit = find_by_spacer(grnas, args.spacer)
            if hit:
                gRNAs = [{**hit, "name": "selected"}]
        species_overlay = {
            "components": components,
            "construct_size": construct["total_bp"],
            "gRNAs": gRNAs,
            "overhangs": args.overhangs,
        }
    fig = plot_electropherogram(parsed["peaks"], args.sample, smoothing=args.smoothing,
                                 log_y=args.log_y, x_range=(args.lo, args.hi),
                                 species_overlay=species_overlay)
    fig.savefig(args.out, bbox_inches="tight", dpi=args.dpi)
    print(f"[clc-vis] wrote {args.out}", file=sys.stderr)


def cmd_cut_diagram(args):
    construct = load_construct(args.registry, args.construct)
    grnas = find_grnas(construct["sequence"], construct["target_start"], construct["target_end"])
    if args.spacer:
        grna = find_by_spacer(grnas, args.spacer)
        if not grna:
            print(f"[clc-vis] spacer not found in {args.construct}", file=sys.stderr)
            return 1
    else:
        grna = grnas[args.idx]
    products = predict_cut_products(grna, construct["total_bp"], args.overhang)
    fig = plot_cut_diagram(construct, grna, args.overhang)
    fig.savefig(args.out, bbox_inches="tight", dpi=args.dpi)
    if args.products_out:
        fig2 = plot_ssdna_products(grna, products)
        fig2.savefig(args.products_out, bbox_inches="tight", dpi=args.dpi)
        print(f"[clc-vis] wrote {args.out} and {args.products_out}", file=sys.stderr)
    else:
        print(f"[clc-vis] wrote {args.out}", file=sys.stderr)
    return 0


def cmd_construct(args):
    construct = load_construct(args.registry, args.construct)
    fig = plot_construct(construct)
    fig.savefig(args.out, bbox_inches="tight", dpi=args.dpi)
    print(f"[clc-vis] wrote {args.out}", file=sys.stderr)


def cmd_batch(args):
    parsed = parse_genemapper_path(args.tsv)
    args.outdir.mkdir(parents=True, exist_ok=True)
    for sample in parsed["samples"]:
        fig = plot_electropherogram(parsed["peaks"], sample, smoothing=args.smoothing,
                                     x_range=(args.lo, args.hi))
        out = args.outdir / f"{sample}.png"
        fig.savefig(out, bbox_inches="tight", dpi=args.dpi)
        plt.close(fig)
    print(f"[clc-vis] wrote {len(parsed['samples'])} PNGs to {args.outdir}", file=sys.stderr)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--registry", type=Path, default=REPO_ROOT / "data" / "constructs.yaml")
    ap.add_argument("--dpi", type=int, default=140)
    sub = ap.add_subparsers(dest="cmd", required=True)

    p_e = sub.add_parser("electropherogram")
    p_e.add_argument("--tsv", type=Path, required=True)
    p_e.add_argument("--sample", required=True)
    p_e.add_argument("--out", type=Path, required=True)
    p_e.add_argument("--smoothing", type=float, default=1.0)
    p_e.add_argument("--log-y", action="store_true")
    p_e.add_argument("--lo", type=float, default=0)
    p_e.add_argument("--hi", type=float, default=260)
    # Species-overlay options (mirror of fragment-viewer's TraceTab toggle)
    p_e.add_argument("--species", action="store_true",
                     help="Annotate every reactant / partial / full / cut species the dye CAN show")
    p_e.add_argument("--construct", default="V059_gRNA3",
                     help="Construct id from the registry (used when --species is set)")
    p_e.add_argument("--spacer", help="20-nt gRNA spacer to overlay cut products for; omit for assembly + monomer only")
    p_e.add_argument("--overhangs", type=int, nargs="+", default=[0, 4],
                     help="Overhang chemistries to overlay when --spacer is given (default: 0 4)")
    p_e.set_defaults(func=cmd_electropherogram)

    p_c = sub.add_parser("cut-diagram")
    p_c.add_argument("--construct", default="V059_gRNA3")
    p_c.add_argument("--spacer", help="20-nt gRNA spacer; if omitted, uses the candidate at --idx")
    p_c.add_argument("--idx", type=int, default=0)
    p_c.add_argument("--overhang", type=int, default=0)
    p_c.add_argument("--out", type=Path, required=True)
    p_c.add_argument("--products-out", type=Path, help="Also render the 4-ssDNA product figure")
    p_c.set_defaults(func=cmd_cut_diagram)

    p_co = sub.add_parser("construct")
    p_co.add_argument("--construct", default="V059_gRNA3")
    p_co.add_argument("--out", type=Path, required=True)
    p_co.set_defaults(func=cmd_construct)

    p_b = sub.add_parser("batch")
    p_b.add_argument("--tsv", type=Path, required=True)
    p_b.add_argument("--outdir", type=Path, required=True)
    p_b.add_argument("--smoothing", type=float, default=1.0)
    p_b.add_argument("--lo", type=float, default=0)
    p_b.add_argument("--hi", type=float, default=260)
    p_b.set_defaults(func=cmd_batch)

    args = ap.parse_args()
    return args.func(args) or 0


if __name__ == "__main__":
    sys.exit(main())
