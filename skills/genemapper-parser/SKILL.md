---
name: genemapper-parser
description: Parse GeneMapper / PeakScanner peak-table TSV exports into a normalized JSON peaks schema. Pure-function port of the parser in scripts/build_artifact.py and the in-browser parser in fragment-viewer's DropZone. Use when ingesting CE peak-table exports for the fragment-viewer or any downstream lab tool. Triggers on: GeneMapper export, PeakScanner export, peak table TSV, parse fragment analysis, CE peak table, fragment-viewer ingest.
metadata:
  triggers:
    - GeneMapper export
    - PeakScanner export
    - peak table TSV
    - parse fragment analysis
    - CE peak table
    - fragment-viewer ingest
---

# GeneMapper Parser

Parses Applied Biosystems GeneMapper / PeakScanner peak-table TSV exports into the JSON shape the fragment-viewer expects. Single source of truth for the parsing rules; the JSX-side parser in `src/FragmentViewer.jsx::parseGenemapperTSV` and the Python parser in `scripts/build_artifact.py` mirror this skill's logic.

## Output schema

```json
{
  "peaks": {
    "<sample-name>": {
      "B": [[size_bp, height, area, width_bp], ...],
      "G": [...],
      "Y": [...],
      "R": [...],
      "O": [...]   // optional; size standard channel
    },
    ...
  },
  "samples": ["<sample-name>", ...]   // sorted
}
```

Per-peak rows are 4-tuples: `size` to 2 decimals, `height` to 1 decimal, `area` to 1 decimal, `width` (in bp) to 3 decimals. The fragment-viewer `DATA.peaks` literal uses exactly this shape.

## Quickstart

```bash
# Parse a TSV and emit JSON to stdout
python scripts/genemapper_parser.py path/to/blue_export.txt

# Write to a file
python scripts/genemapper_parser.py path/to/blue_export.txt --out parsed.json

# Print a one-line summary instead of full JSON
python scripts/genemapper_parser.py path/to/blue_export.txt --summary
```

## Library API

```python
from genemapper_parser import parse_genemapper

with open("blue_export.txt", "r", encoding="utf-8-sig") as fh:
    parsed = parse_genemapper(fh.read())

print(len(parsed["peaks"]), "samples")
```

## Header recognition

The parser accepts these column-name variants (case-insensitive, exact match after lowercasing):

| Field | Accepted headers |
|---|---|
| Sample | `Sample Name`, `SampleName` |
| Dye | `Dye/Sample Peak`, `Dye` (first letter is the channel id; B / G / Y / R / O) |
| Size | `Size` |
| Height | `Height` (defaults to 0 if missing) |
| Area | `Area` (defaults to 0 if missing) |
| Width | `Width in BP`, `Width` (defaults to 1 if missing) |

Rows missing a sample name, a dye, or a numeric size are silently dropped (matches GeneMapper's "no peak called" rows).

## Cross-references

- `fragment-viewer/scripts/build_artifact.py` — embeds parsed JSON into the JSX scaffold; uses this skill's parser logic.
- `fragment-viewer/src/FragmentViewer.jsx::parseGenemapperTSV` — JSX-side mirror for the in-browser DropZone.
- `clc-construct-registry` skill — provides the construct context that gives the parsed peaks meaning.
- `cas9-cut-predictor` skill — predicts what peaks should appear given a construct and gRNA; pair with this skill's output to score a sample.

## Hard rules

1. **The output peaks schema is locked**. fragment-viewer reads `DATA.peaks[<sample>][<dye>] = [size, height, area, width][]`. Adding fields breaks downstream tools.
2. **Width in bp, not data points.** GeneMapper export columns vary; this parser prefers `Width in BP` and falls back to bare `Width` only when bp form is absent. If you ever see widths > 5, the file probably uses data-point widths and needs a separate parser.
3. **The dye letter comes from the FIRST comma-separated token of the `Dye/Sample Peak` column.** GeneMapper sometimes appends a peak number after the dye letter (e.g., "B,5"); the parser splits on comma and uppercases.

## Tests

```bash
python -m pytest tests/
```

Fixtures cover: synthetic GeneMapper TSV → expected JSON; alternate header names; missing optional columns; UTF-8 BOM handling.
