# GRNA_CATALOG.md — How the lab gRNA catalog works

The lab gRNA catalog is now a JSON file at `public/grna_catalog.json`, fetched at runtime by the deployed viewer. The embedded JS array in `src/lib/grna_catalog.js` is a baseline that ships with the bundle so the viewer remains usable offline / when the JSON fetch fails.

To add a gRNA, edit **`public/grna_catalog.json`** and submit a PR. No JS rebuild required — once the PR merges, the next visitor to the deployed viewer sees the new entry on first page load.

Every entry has the shape:

```js
{ name: "V059_gRNA3", spacer: "NNNNNNNNNNNNNNNNNNNN", source: "...", target: "...", notes: "..." }
```

Fields:

| Field | Meaning |
|---|---|
| `name` | Unique label. Convention: `<construct>_<id>` for assay gRNAs, `<gene>_<region>_<n>` for genomic guides. |
| `spacer` | 20 nt DNA, 5' to 3' on the strand carrying the PAM (the non-template strand). Must be exactly 20 nt or matching is skipped. |
| `source` | Where the spacer came from. SnapGene file, IDT order number, BED file with coordinates, etc. |
| `target` | Human-readable description: synthetic construct name, or genomic region in `chr:start-end (strand)` form. |
| `notes` | Free text. Describe panel membership, intended use, status. |

## 1. Where this catalog is read

| Reader | Purpose |
|---|---|
| `matchLabCatalog(grna)` in `src/lib/grna_catalog.js` | Returns the catalog entry whose spacer matches the candidate gRNA's protospacer (or its reverse complement). Drives the green badge in the Cas9 Cut Prediction tab. |

If the spacer is empty or not exactly 20 nt, `matchLabCatalog` returns null. So a green badge will never light up for an entry that has not been populated.

## 2. Adding a new entry

1. Open `public/grna_catalog.json`.
2. Append your entry to the JSON array (mind the trailing comma — JSON does not allow it on the last element).
3. (Optional) If the entry should also be available offline / for tests, mirror it into the embedded baseline in `src/lib/grna_catalog.js`. Otherwise the JSON is enough.
4. Add a one-line entry to `docs/CHANGELOG.md` under the next version stub.
5. Commit with a message like `Add CYP3A5_intron3_1 to gRNA catalog`.

The runtime fetch validates the JSON shape; a malformed file falls back silently to the embedded baseline rather than corrupting the live catalog. Check the browser console for `[fragment-viewer] gRNA catalog fetch fell back to embedded baseline: <reason>` if your edits aren't showing up.

## 3. Spacer convention

The spacer is the 20 nt of the protospacer that the guide RNA hybridizes to. It is written in DNA alphabet (A, C, G, T) and oriented 5' to 3' on the **strand that carries the PAM** (the non-template strand). When you obtain a spacer from a tool that writes it in RNA (`AUGC`), substitute U for T before pasting.

If your source gives you the protospacer plus its PAM as `NNNNNNNNNNNNNNNNNNNNAGG`, the catalog entry stores only the first 20 nt. The PAM is implicit (Cas9 with NGG SpCas9; for any other PAM, document it in the `notes` field).

## 4. Recipes for filling spacers from upstream sources

### 4.1 From a SnapGene file (`.dna`)

If the gRNA is shown as a feature in SnapGene:

1. Open the `.dna` file.
2. Click the gRNA feature.
3. The Sequence pane shows the spacer with the PAM grouped immediately downstream.
4. Copy the 20 nt and paste into `spacer:`.

For the V059_gRNA3 case specifically, the SnapGene file contains the construct but does not annotate the spacer of the gRNA used in the assay. The actual spacer must come from Isaac Farnum's order record or Benchling.

### 4.2 From a BED file with genomic coordinates

For an entry like `CYP2D6_upstream_1` with `target: "chr22:42120246-42120266 (+)"`:

```bash
# Set GRCH38_FASTA in your shell to your local GRCh38 primary-only FASTA
# (e.g. export GRCH38_FASTA=/path/to/GCA_000001405.15_GRCh38_no_alt_analysis_set.fasta).
samtools faidx "$GRCH38_FASTA" "chr22:42120246-42120266" \
  | grep -v "^>" | tr -d '\n'
```

If the BED entry is on the negative strand, take the reverse complement of the result. Either way the spacer in the catalog is the 20 nt as it appears 5' to 3' on the strand carrying the PAM.

### 4.3 From PharmVar

PharmVar publishes per-allele FASTAs. For a CYP gene gRNA, fetch the reference allele FASTA, then `samtools faidx` against the relevant region.

### 4.4 From an IDT order

IDT order records list the spacer plus PAM as a single ssDNA oligo. Trim the PAM (last 3 nt for NGG SpCas9) and paste the remaining 20 nt.

## 5. Where we stand today

As of v0.5.0 there are 11 entries in the catalog, all with `spacer: ""`. Spacers are pending upstream data for every entry. See `.project/UNBLOCK_PROMPTS.md` for the prompts to send upstream.

| Entry | Source | Status |
|---|---|---|
| V059_gRNA3 | SnapGene V059_gRNA3 file | Spacer not in SnapGene; ask Isaac/IDT |
| CYP2D6_upstream_1..3 | pilot_grna_positions.bed | Coords known; spacer needs `samtools faidx` |
| CYP2D6_downstream_1..3 | pilot_grna_positions.bed | Coords known; spacer needs `samtools faidx` |
| chr1p_1..3 | pilot_grna_positions.bed | Coords known; spacer needs `samtools faidx` |
| chr17p_1 | pilot_grna_positions.bed | Coords known; spacer needs `samtools faidx` |

## 6. When the catalog grows past 100 entries

Per CLAUDE.md rule 5, the catalog is intentionally inlined in the JSX while small. When entry count exceeds ~100, split it into `data/grna_catalog.json` and load it at module init. That migration is non-trivial because the JSX is meant to also work as a standalone Claude.ai artifact (no network fetches), so the catalog would need to be fetched at build time and re-inlined by `scripts/build_artifact.py`. Open a discussion before doing this.
