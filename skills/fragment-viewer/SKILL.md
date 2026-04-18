---
name: fragment-viewer
description: Interactive capillary-electrophoresis viewer and Cas9 cut-product predictor for the Athey lab fluorescent-adapter fragment analysis assay. Use when the user mentions fragment analysis, capillary electrophoresis, GeneMapper, PeakScanner, CLC (Cleavage-Ligation-Cycling), fluorescent adapters, TAMRA/HEX/ROX/6-FAM dyes, V059 construct, gRNA3 cutting efficiency, or needs to predict Cas9 cut products for a specific gRNA on the V059 construct. Also triggers on requests to build/edit/extend the FragmentViewer.jsx artifact or the lab gRNA catalog.
metadata:
  triggers:
  - fragment analysis
  - capillary electrophoresis
  - GeneMapper
  - PeakScanner
  - fluorescent adapter
  - TAMRA
  - 6-FAM
  - HEX
  - ROX
  - CLC
  - Cleavage-Ligation-Cycling
  - V059
  - V059_gRNA3
  - gRNA3
  - cutting efficiency assay
  - fragment-viewer
---

# Fragment Viewer Skill

This skill is the entry point for the `fragment-viewer` project: an interactive Claude.ai artifact that ingests GeneMapper peak-table exports from Cas9 cutting-efficiency experiments, reconstructs electropherograms, identifies peaks, and predicts Cas9 cut products.

## Canonical repo location

Public: `https://github.com/Single-Molecule-Sequencing/fragment-viewer`
Live tool: `https://single-molecule-sequencing.github.io/fragment-viewer/`

Lab maintainers may also have a local clone; path varies per machine.
Set `FRAGMENT_VIEWER_REPO` in your shell profile if you need to refer
to a local path in scripts; default is `$HOME/repos/fragment-viewer`.

When this skill is invoked, read the in-repo `docs/BIOLOGY.md` and
`docs/TUTORIAL.md` before answering biology questions. Never infer from memory.

## When to use this skill

Whenever the user mentions any of the following, treat this skill as the primary workflow:

- Fragment analysis or capillary electrophoresis on any Athey lab sample
- GeneMapper or PeakScanner peak-table exports
- The V059 construct, gRNA3, or any "fluorescent adapter" experiment
- Isaac Farnum's / Nina Gill's / Rachel Case's CLC protocol
- Predicting cut products, template/non-template strands, PAM-proximal/distal labels

## Rules

1. **Never infer biology from memory.** Every claim about dye assignments, cut products, template/non-template labeling, or PAM-proximal/distal classification must be read from `docs/BIOLOGY.md` in the repo or from the viewer's `CONSTRUCT`/`DYE_STRAND` constants. If in doubt, re-read BIOLOGY.md before answering.

2. **Pairing convention is (B,Y) + (G,R), not (B,R) + (G,Y).** This is the most common source of error. TAMRA (Y) and 6-FAM (B) are on Adapter 1; HEX (G) and ROX (R) are on Adapter 2. The (Y−B) offset reports the Adapter 1 cut-end overhang; the (R−G) offset reports the Adapter 2 cut-end overhang.

3. **Cut site is 3 bp 5' of the PAM, between protospacer positions 17 and 18.** This is standard SpCas9. Do not interpret "cut site" as the PAM position itself.

4. **The 226 bp construct is the canonical reference.** It has a 118 bp target window at construct positions 55–172. Deviations from this (different plasmid, different target size) must be stated explicitly.

5. **When the user asks to add a gRNA, edit `LAB_GRNA_CATALOG`.** Do not add it anywhere else. Write the spacer 5' to 3' on the strand carrying the PAM (i.e., the non-template strand). Then run `scripts/ingest_to_kb.py --grnas` to sync to the lab knowledge base.

6. **When rebuilding the artifact from new data, use `scripts/build_artifact.py`.** Do not manually edit the `__DATA__` placeholder in the scaffold; the script handles parsing the GeneMapper export, reshaping to the JSON schema, and inlining.

7. **Copyright is not a concern for lab-internal sequences.** The construct sequence, gRNA spacers, and adapter oligos are the lab's own design. Reproduce them freely within this project.

## Typical workflows

### Workflow 1: User has new GeneMapper export and wants the viewer

1. Parse the export with `scripts/build_artifact.py <export.txt>`.
2. Open `src/FragmentViewer.jsx` as an artifact.
3. Walk through the tabs with the user: Electropherogram → Peak Identification → Cas9 Cut Prediction → Auto Classify.

### Workflow 2: User wants to predict cut products for a new gRNA

1. In the Cas9 Cut Prediction tab, paste the 20-nt spacer into the Custom gRNA input and click Find.
2. Review the construct-diagram cut marker and the 4-ssDNA-product visualization.
3. Check whether the gRNA matches any lab catalog entry (green badge). If not and the user plans to order it, prompt them to add it to `LAB_GRNA_CATALOG` and commit.

### Workflow 3: User has observed CE peaks and wants automated analysis

1. Switch to Auto Classify tab.
2. Set sample dropdown to sample of interest.
3. Read the per-dye cluster cards and Cross-Dye Summary.
4. If interpretation is ambiguous, adjust height threshold, match tolerance, cluster tolerance, overhang range.
5. Run Auto-calibrate from tallest peak if the sample is known to be a blunt control.

### Workflow 4: User asks "why is V059_3-2 showing 200 bp peaks?"

Answer: those are partial ligation products. "Missing Ad2" = 201 bp, "Missing Ad1" = 201 bp (with Ad2 = 25), both coexisting. See BIOLOGY.md §7. The small G→R offset reflects residual 4-nt BsaI-style overhang at the Ad2 end.

## Cross-references

### In-repo docs

- Canonical biology: `docs/BIOLOGY.md`
- Code structure: `docs/ARCHITECTURE.md`
- gRNA catalog format: `docs/GRNA_CATALOG.md`
- Tutorial: `docs/TUTORIAL.md`
- Lab integrations map: `docs/LAB_INTEGRATIONS.md`
- Knowledge-base ingestion: `scripts/ingest_to_kb.py`

### Sibling skills extracted from this project

- `cas9-cut-predictor` — Python port of the cut/PAM/product math used in the Cas9 Cut Prediction tab. Use from any lab tool that needs predictions without spinning up the React viewer.
- `genemapper-parser` — Python port of the in-browser GeneMapper TSV parser. The single source of truth for the JSON peaks shape that fragment-viewer consumes.
- `clc-construct-registry` — YAML registry of CLC constructs (`data/constructs.yaml`). The authoritative store of construct sequences, target windows, and dye-strand conventions.
- `clc-visualizations` — matplotlib equivalents of the JSX visualizations (electropherogram, construct, Cas9 cut diagram, 4-ssDNA products). Use for manuscript figures and headless batch QC.

### Upstream and downstream lab skills

- `cas9-guide-mapper` — map a gRNA spacer to GRCh38 (off-target and on-target genomic coordinates).
- `grna-variant-checker` — check whether known patient variants disrupt a gRNA's target site.
- `golden-gate-assembly` — design the Level-0 plasmids that become the CLC constructs this assay reads.
- `cas9-panel-eval` — when fragment-viewer reveals which gRNAs cut efficiently, those results feed panel-level evaluation downstream.
- `cas9-enrichment` — Cas9-targeted PacBio / ONT enrichment, the production application of the gRNAs this assay validates.
- `sma-pipeline` — SMA-seq library prep often consumes CLC fragment products from this assay; cross-link via `scripts/cross_link_smaseq.py`.
- `lab-research-oracle` — searches `~/lab_knowledge.db` and Fireflies / Tactiq transcripts for past discussions of CLC chemistry, V059, gRNA3, etc.

## Do NOT

- Do not guess the V059_gRNA3 spacer. It has not been documented in any source I could find. Ask the user.
- Do not modify the `DYE` or `DYE_STRAND` maps without also updating `docs/BIOLOGY.md` §3. These are paired sources of truth.
- Do not rename the tabs or add a sixth tab without updating `docs/ARCHITECTURE.md` §1 and `docs/TUTORIAL.md` §2.
