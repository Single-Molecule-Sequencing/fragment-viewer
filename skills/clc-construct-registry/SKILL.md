---
name: clc-construct-registry
description: Canonical registry of Cleavage-Ligation-Cycling (CLC) fragment-analysis constructs. Use when any lab tool needs the construct sequence, target window, component sizes, or dye-to-strand convention for a CLC assay (V059 today, V073 etc as the lab adds them). Triggers on: CLC construct, V059, V059_gRNA3, fragment construct, ligated construct, target window, dye strand convention, CLC reference, fragment analysis assay, CONSTRUCT.
metadata:
  triggers:
    - CLC construct
    - V059
    - V059_gRNA3
    - fragment construct
    - ligated construct
    - target window
    - dye strand convention
    - CLC reference
    - fragment analysis assay
---

# CLC Construct Registry

Single source of truth for every CLC fragment-analysis construct the Athey lab uses. Canonical YAML lives in the public repo at:

```
data/constructs.yaml
```

(In a local checkout of `Single-Molecule-Sequencing/fragment-viewer`.)

The registry is consumed by:

- `fragment-viewer` (the React/JSX viewer; same construct definitions inlined as `CONSTRUCT` in `src/FragmentViewer.jsx`)
- `cas9-cut-predictor` (looks up the construct by id when the user gives `--construct V059`)
- `genemapper-parser` (no direct read, but the parser's output is meaningless without a construct context)
- Any future lab tool that needs the canonical dye-to-strand mapping or component sizes

## When to use this skill

Whenever someone asks "what is the V059 construct?", "where does TAMRA sit on Adapter 1?", "what is the target window for V073?", "list every CLC construct we have," or any equivalent.

## Schema

Each construct entry has:

| Field | Meaning |
|---|---|
| `id` | Unique short id used as foreign key |
| `name` | Human-readable label |
| `total_bp` | Length of the ligated construct |
| `target_start`, `target_end` | 1-indexed inclusive target window |
| `sequence` | Top-strand sequence, 5' to 3' |
| `snapgene_file` | Optional path to the .dna reference file |
| `components` | Ordered segments; sizes sum to `total_bp` |
| `dye_strand` | Per-dye `{dye_name, strand, fragment, end, pos, oligo_len}` |
| `notes` | Free text |

## CLI

```bash
# List all constructs
python scripts/clc_construct_registry.py list

# Get one construct as JSON
python scripts/clc_construct_registry.py get V059_gRNA3

# Validate the YAML against the schema rules
python scripts/clc_construct_registry.py validate
```

## Hard rules

1. **Never alter `dye_strand` for a construct without updating `docs/BIOLOGY.md` in the fragment-viewer repo in the same commit.** The dye/strand convention is paired with biology in two places; both must move together.
2. **Component sizes must sum to `total_bp`.** The `validate` subcommand enforces this.
3. **Pairing convention is (B, Y) at Adapter 1 and (G, R) at Adapter 2** for V059 family constructs. New constructs may use a different convention, but it must be documented in the construct's `notes` and confirmed by Isaac before landing.

## Cross-references

- `cas9-cut-predictor` SKILL.md — uses construct lookup by id.
- `fragment-viewer/docs/BIOLOGY.md` — the biology this registry encodes.
- `fragment-viewer/docs/ARCHITECTURE.md` §3 — same data inlined as `CONSTRUCT` in the JSX viewer.
- `golden-gate-assembly` skill — designs the Level-0 plasmids these constructs are built from.

## Adding a new construct

1. Append an entry to `data/constructs.yaml` following the template at the bottom of the file.
2. Run `python scripts/clc_construct_registry.py validate`.
3. If the new construct will replace V059 as the default in the viewer, also update `CONSTRUCT` in `src/FragmentViewer.jsx` and `docs/BIOLOGY.md` in the same commit.
4. Commit with a message like `Add V073_pgxA to CLC construct registry`.
