# fragment-viewer

Interactive capillary-electrophoresis viewer and Cas9 cut-product predictor for the Single-Molecule Sequencing / Athey Lab fluorescent-adapter fragment analysis assay.

This tool ingests GeneMapper peak-table exports from Cas9 cutting-efficiency experiments, reconstructs electropherograms, identifies biologically meaningful peaks, predicts cut products for every candidate gRNA in a target region, and cross-references candidates against the lab's curated gRNA catalog. It exists to turn raw fragment-analysis output into interpretable biology without leaving the browser.

---

## What this tool does

The fragment-analysis assay in this lab is the Isaac-Farnum / Nina-Gill / Rachel-Case CLC (Cleavage–Ligation–Cycling) workflow. A synthetic target is released from a Level-0 plasmid by BsaI, ligated between two fluorescent adapters via bridge oligos, exposed to Cas9 with a guide RNA of interest, denatured, and run on capillary electrophoresis. Each of the four fluorophores (6-FAM, HEX, TAMRA, ROX) labels a specific strand at a specific end of the construct, so the four peak positions together report both cut location and cut chemistry (blunt vs. 5' overhang, with N-nucleotide resolution).

The viewer gives five linked views of that data:

1. **Electropherogram.** Per-sample traces reconstructed from GeneMapper peak tables via Gaussian summation, with smoothing, log-Y, LIZ ladder overlay, drag-to-zoom, expected-peak markers, and tooltips reporting Δ from expected.
2. **Peak Identification.** A construct-architecture panel seeded from the SnapGene reference file, assembly-product presets (full ligation, missing Ad1/Ad2, target+bridges, target-only, adapter dimer) that auto-populate expected peak positions, and per-sample match engines with purity and chemistry interpretation.
3. **Cas9 Cut Prediction.** The target sequence with all NGG PAMs highlighted on both strands, a table of 24 candidate gRNAs with per-dye product-size predictions, a construct diagram with the cut site marked as scissors and an overhang band, a visual rendering of the four ssDNA products with dye circles and template/non-template and PAM-proximal/distal annotations, a lab-catalog column and filter, a custom gRNA search, and an auto-pick that finds the best-matching gRNA for any sample's observed peaks.
4. **Auto Classify.** Automated peak clustering across all dyes, per-dye mobility offset correction with auto-calibration, best-guess identity assignment for every cluster, relative-size and relative-abundance reports for every peak, and cross-dye chemistry interpretation. Editable construct sequence for generalization to arbitrary experiments.
5. **Cross-Sample Comparison.** Overhang-offset chart across all samples (Adapter-1-end and Adapter-2-end), match-purity heatmap, and a multi-sample overlay plot.

See `docs/TUTORIAL.md` for a complete walkthrough with worked examples.

---

## Repository layout

```
fragment-viewer/
├── README.md                          This file
├── LICENSE                            MIT
├── CLAUDE.md                          Repo-level rules for Claude sessions
├── src/
│   └── FragmentViewer.jsx             The Claude.ai artifact (React/JSX single-file, ~215 KB)
├── data/
│   ├── V059_gRNA3_construct.dna       SnapGene reference construct
│   ├── blue_export.txt                GeneMapper peak-table export (sample dataset)
│   └── fa_data.json                   Parsed peak data inlined into the artifact
├── docs/
│   ├── TUTORIAL.md                    Step-by-step walkthrough with worked examples
│   ├── ARCHITECTURE.md                Code structure, data flow, component contracts
│   ├── BIOLOGY.md                     The biochemistry and conventions the viewer encodes
│   ├── GRNA_CATALOG.md                Lab gRNA catalog documentation and how to add entries
│   ├── CHANGELOG.md                   Version history (v0.1.0 through v0.5.0)
│   └── CONTRIBUTING.md                Development and review guidelines
├── skills/
│   └── fragment-viewer/
│       └── SKILL.md                   Companion Claude skill (13 triggers)
├── scripts/
│   ├── build_artifact.py              Rebuilds FragmentViewer.jsx from the JSON + scaffold
│   ├── ingest_to_kb.py                Ingests catalog entries and experiment metadata into lab_knowledge.db
│   └── init_repo.sh                   One-shot git init + first commit + remote add
├── .project/
│   ├── PLAN.md                        Roadmap and milestones
│   ├── HANDOFF.md                     Current state for the next developer/session
│   └── workspace.yaml                 Lab workspace metadata sidecar
└── .github/
    └── workflows/
        └── validate.yml               CI: JSX parse check on every push
```

---

## Quickstart

### To publish this repo to GitHub (one-time)

From Git Bash or WSL (you need `gh` CLI authenticated, or you can do it manually):

```bash
cd "C:/Users/gregfar/University of Michigan Dropbox/Gregory Farnum/Claude/Projects/fragment-viewer"
bash scripts/init_repo.sh            # private repo by default
```

If `gh` is not installed, the script will add the remote and attempt `git push`, expecting the repo to already exist. Create it at https://github.com/organizations/Single-Molecule-Sequencing/repositories/new first in that case.

### To view the artifact

Option A (Claude.ai): attach `src/FragmentViewer.jsx` to a conversation and ask Claude to render it.

Option B (local dev): drop the JSX into any Vite + React + Tailwind v3 scaffold.

Option C (regenerate from new data): run `python scripts/build_artifact.py path/to/new_export.txt`.

### To add a new gRNA to the catalog

Edit `src/FragmentViewer.jsx`, find `LAB_GRNA_CATALOG`, append your entry, then:

```bash
python scripts/ingest_to_kb.py --grnas
```

See `docs/GRNA_CATALOG.md` for full conventions.

---

## Integration with lab infrastructure

- **Skill** `skills/fragment-viewer/SKILL.md` triggers on fragment analysis, capillary electrophoresis, GeneMapper, TAMRA/HEX/ROX/6-FAM, CLC, V059, gRNA3, and related terms.
- **KB ingest** `scripts/ingest_to_kb.py` writes to `~/lab_knowledge.db` tables `lab_grnas` and `fragment_analysis_experiments`.
- **CI** `.github/workflows/validate.yml` runs esbuild JSX parse + doc consistency grep on every push.

See `docs/ARCHITECTURE.md` §7 and `docs/TUTORIAL.md` §6 for the full picture.

---

## Provenance

- **Canonical construct:** `V059_gRNA3_Ligated_to_Bridge_Oligos_and_Fluorescent_Adapters.dna` (SnapGene, Athey lab, 2026-02-17). 226 bp linear ligated product.
- **Canonical dataset:** `blue_export.txt` — GeneMapper peak-table export, 3,292 rows, 3,150 sized peaks across 10 samples, GS500LIZ size standard.
- **Assay design:** Isaac Farnum's slide deck `Fragment_Analysis_Capillary_Electrophoresis.pdf`.

---

## License

MIT. See `LICENSE`.

## Authors and contact

Maintainer: Greg Farnum (gregfar@umich.edu), Athey Lab, Department of Computational Medicine and Bioinformatics, University of Michigan.

Once the repo is published: https://github.com/Single-Molecule-Sequencing/fragment-viewer
