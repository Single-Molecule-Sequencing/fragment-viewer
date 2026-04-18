---
name: cas9-cut-predictor
description: Predict the four ssDNA Cas9 cut products from a CLC fragment-analysis construct given a gRNA spacer and cut chemistry. Pure-function port of the fragment-viewer JSX logic. Use when designing or interpreting Cas9 cutting-efficiency assays, evaluating new gRNAs against a CLC construct, or wiring cas9 cut prediction into another lab tool. Triggers on: predict cut products, ssDNA fragments, blunt vs overhang, gRNA prediction, Cas9 cleavage prediction, where does this gRNA cut, V059 cut, fragment-analysis prediction.
metadata:
  triggers:
    - predict cut products
    - ssDNA fragments
    - blunt vs overhang
    - gRNA prediction
    - Cas9 cleavage prediction
    - where does this gRNA cut
    - V059 cut
    - fragment-analysis prediction
---

# Cas9 Cut Predictor

Pure-function predictor for the Cleavage-Ligation-Cycling (CLC) fragment analysis assay. Given a CLC construct (default V059) and a 20-nt gRNA spacer, returns the four ssDNA product sizes per dye for any cut chemistry (blunt or 1 to 4 nt 5' overhang).

This is a Python port of the same logic that powers the Cas9 Cut Prediction tab in the fragment-viewer JSX. Use it from the CLI, from a Python notebook, or import it as a library.

## When to use this skill

- Designing a new gRNA: predict its cut product sizes and compare against an observed peak table.
- Building a CI gate: assert that a new construct's predictions are consistent with a known good chemistry.
- Wiring fragment-viewer logic into another tool that does not run JavaScript.

## Quickstart

```bash
# Predict for V059 + an arbitrary spacer at blunt chemistry
python scripts/cas9_cut_predictor.py \
  --construct V059_gRNA3 \
  --spacer ACGTACGTACGTACGTACGT

# All candidate gRNAs in V059's target window, blunt
python scripts/cas9_cut_predictor.py --construct V059_gRNA3 --enumerate

# Same gRNA, 4-nt 5' overhang chemistry, JSON output
python scripts/cas9_cut_predictor.py \
  --construct V059_gRNA3 \
  --spacer ACGTACGTACGTACGTACGT \
  --overhang 4 --json
```

## Library API

```python
from cas9_cut_predictor import (
    find_grnas,           # enumerate every NGG-PAM 20-nt protospacer in a target window
    predict_cut_products, # given one gRNA + chemistry, return ssDNA sizes per dye
    reverse_complement,   # 4-letter DNA reverse complement
)

construct_seq = "..."  # full ligated 5' to 3' top strand
target_start = 55
target_end = 172

grnas = find_grnas(construct_seq, target_start, target_end)
for g in grnas:
    products = predict_cut_products(g, construct_size=len(construct_seq), overhang_nt=0)
    print(g["protospacer"], "->", products)
```

`predict_cut_products` returns `{"Y": {"length": ..., "fragment": "LEFT", "strand": "top", "template": "...", "pam_side": "..."}, "B": {...}, "G": {...}, "R": {...}}`. Conventions follow `fragment-viewer/docs/BIOLOGY.md` §4 to §5.

## Hard rules (inherited from fragment-viewer)

1. **The cut site is 3 bp 5' of the PAM, between protospacer positions 17 and 18.** Standard SpCas9. Do not use any other convention.
2. **Pairing is (B, Y) at Adapter 1, (G, R) at Adapter 2** for the V059 family. If you add a construct with a different pairing, encode it in the `dye_strand` of `data/constructs.yaml` and document the deviation.
3. **The construct sequence and target window must be 1-indexed inclusive.** Off-by-one errors here propagate everywhere.

## Cross-references

- `clc-construct-registry` skill — provides the construct sequence, target window, and dye/strand mapping consumed here.
- `fragment-viewer` — the React/JSX viewer that surfaces these predictions interactively.
- `cas9-guide-mapper` skill — maps a gRNA spacer to a reference genome (off-target search).
- `grna-variant-checker` skill — checks whether known patient variants disrupt a gRNA's target site.
- `golden-gate-assembly` skill — designs the Level-0 plasmid that becomes the CLC construct.
- `fragment-viewer/docs/BIOLOGY.md` — canonical biochemistry encoded by this skill.

## Tests

```bash
python -m pytest tests/
```

Fixtures cover: blunt chemistry sums to construct length, 4-nt overhang shifts BOT by +4, top-strand vs bot-strand PAM cases produce mirrored fragment/template labels, the V059 target window enumerates exactly the expected number of candidates.
