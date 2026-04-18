# UNBLOCK_PROMPTS.md — Paste-ready asks for the data items that block code

The implementation buckets A and B in `.project/PLAN.md` are complete. The remaining
items in bucket C cannot be coded without upstream wet-lab or organizational data.
The prompts below are ready to copy into Slack DMs or email so a non-coding human
collaborator can hand back exactly what the viewer needs.

Update the **expected reply format** in each prompt if the recipient prefers a
different structure. The `LAB_GRNA_CATALOG` parser only accepts 20-nt DNA spacers
(`ACGT` only); the calibration import only accepts numeric per-dye offsets.

---

## C1. V059_gRNA3 spacer (Isaac Farnum)

**Recipient:** Isaac Farnum
**Channel:** Slack DM, or attach to the next CLC subgroup meeting agenda
**Why blocked:** Catalog entry `V059_gRNA3` has `spacer: ""`; the green badge in the
Cas9 Cut Prediction tab will never light up for this gRNA until populated.

```
Hi Isaac, can you send the actual 20-nt spacer for V059_gRNA3 (the gRNA we
ordered for the V059 construct that we have been running CE on)? The SnapGene
file in the repo has the construct but does not annotate the spacer of the
gRNA. The IDT order record or the Benchling entry should have it.

What I need: 20 nt of DNA (A, C, G, T only), 5' to 3' on the strand carrying
the PAM (the non-template strand). If your source uses RNA letters, that is
fine; we will convert U to T.

Reply format: just the 20-nt sequence, e.g. ACGTACGTACGTACGTACGT.
```

---

## C2. gRNA3_X-Y construct identity (Isaac Farnum)

**Recipient:** Isaac Farnum
**Channel:** Slack DM
**Why blocked:** The `gRNA3_X-Y` samples (e.g. `gRNA3_1-1`) show ~88 bp G-only peaks
that are inconsistent with the V059 226 bp construct. The viewer assumes V059
biology for every sample today, so these samples are interpreted incorrectly.

```
Hi Isaac, the gRNA3_X-Y samples in the latest GeneMapper export show a single
~88 bp peak on the G channel and almost nothing on the others. That cannot
come from a single Cas9 cut on the V059 226 bp construct.

Three questions:

1. Were the gRNA3_X-Y samples run against a different (smaller) construct
   than V059? If yes, can you share the SnapGene file for that construct?
2. If yes, what is the construct size and target window (start/end positions
   on the construct)?
3. Should the viewer treat any sample whose name starts with gRNA3_ as that
   smaller construct, or is the prefix incidental?

Reply format: a paragraph with the construct name, size, target start/end,
and (if you have it) a SnapGene attachment.
```

---

## C3. Dye mobility offset calibration (Isaac Farnum + Nina Gill)

**Recipient:** Isaac Farnum and Nina Gill
**Channel:** Email (so the wet-lab protocol can be referenced)
**Why blocked:** Per-dye offsets default to zero in the viewer. The auto-calibrate
button only works when the user already knows a sample is blunt; without a
dedicated control we cannot ship instrument-specific defaults.

```
Hi Isaac, Nina,

For the fragment-viewer to ship sensible default dye-mobility offsets we need
one CE run of a known-blunt-ligation positive control on the lab's ABI 3500
with POP-7 polymer. The control is a Cas9 cut where we are confident the
chemistry is blunt (a blunt-cutting variant or a mock-blunt control made by
ligating two fully complementary blunt fragments).

What we need from one such run:
* GeneMapper TSV peak-table export (same format as blue_export.txt in the
  fragment-viewer repo).
* The expected size in bp for the dominant peak (so the viewer knows what
  "blunt" means in absolute coordinates).
* The instrument run date and serial.

Once we have the run, we can compute the per-dye offsets and commit them to
data/calibrations/ as the new default.

Reply format: attach the TSV, plus a short note with expected peak size and
run metadata.
```

---

## C4. Spacers for the 10 non-V059 catalog entries (self-serve, but flag for Greg)

**Recipient:** Greg Farnum (self-serve), with FYI to Isaac
**Channel:** Internal task; no message needed
**Why blocked:** The 10 catalog entries (CYP2D6 pilot panel + chr1p/chr17p
subtelomeric guides) have BED-file coordinates but no spacer sequences.

Self-serve recipe for each entry, where `target` field is `chrN:start-end (strand)`:

```bash
# Forward strand
samtools faidx /mnt/d/Reference_Files/grch38_primary.fa "chrN:start-end" \
  | grep -v "^>" | tr -d '\n'

# Negative strand: pipe the result through reverse-complement
python3 -c "
import sys
s = sys.stdin.read().upper()
print(s.translate(str.maketrans('ACGT','TGCA'))[::-1])
"
```

Verify with PharmVar for any CYP gene entries (PharmVar may have alleles where
the lab's pilot panel coordinates fall on a non-reference allele). If the
pilot BED file targets a region with documented variation, prefer the
PharmVar reference allele over the GRCh38 reference allele.

Once each entry has a spacer, run `python scripts/ingest_to_kb.py --grnas` and
commit with a message like `Populate CYP2D6 pilot panel spacers from GRCh38`.

---

## C5. Adapter pairing re-validation (Isaac Farnum)

**Recipient:** Isaac Farnum
**Channel:** Slack DM (low priority; paranoia check)
**Why blocked:** Not blocked, but the SKILL flags `(B,Y) + (G,R)` pairing as
the most common source of error. A fresh sample with known geometry would
close the residual risk that the v0.3 fix (which corrected an earlier swap)
matched the data we had at the time but does not generalize.

```
Hi Isaac, low-priority paranoia check for the fragment-viewer: when you next
run a new CLC sample, can you confirm the adapter pairing reads correctly in
the viewer (TAMRA/Y and 6-FAM/B should peak together at the Adapter 1 end;
HEX/G and ROX/R together at the Adapter 2 end)? The viewer's Cross-Dye
Summary should show Δ(Y−B) ≈ 0 and Δ(R−G) ≈ 0 for a blunt cut. If you see
the pairing flipped (Y with R, G with B), flag it and we will revisit
DYE_STRAND in the JSX.

Reply format: a yes or no with a screenshot of the Cross-Dye Summary panel.
```

---

## Tracking

Track replies in `.project/PLAN.md` "Active priorities" list. When a reply
lands:

1. Apply the data (catalog entry, calibration JSON, construct variant).
2. Move the item from active priorities to "Recently shipped".
3. Note the date and source in `docs/CHANGELOG.md`.
