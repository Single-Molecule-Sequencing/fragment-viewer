# BIOLOGY.md — The biochemistry the viewer encodes

This document records the assay biology, dye-to-strand assignments, cut-product predictions, and all related conventions that the viewer implements. Every function in the code that touches biology must match this document. If the biology changes (new construct, new dye set, new protocol variant), update this file **first**, then update the code.

---

## 1. The assay

The lab runs a Cas9 fragment-analysis assay developed by Isaac Farnum, Nina Gill, and Rachel Case (Athey lab, SMS group, 2025-2026). The protocol:

1. A synthetic 118 bp **target** sequence is cloned into a Level-0 plasmid flanked by BsaI sites with 4-nt 5' overhangs (`GGAG` upstream, `AGCG` downstream as used in V059_gRNA3).
2. BsaI digestion releases the target with those two 4-nt overhangs (the CLC one-pot step uses cycling BsaI + T4 DNA ligase at 37/16 °C).
3. Two **bridge oligos** match the target's overhangs on one end and carry constant 4-nt overhangs (`CTCC`-like) on the other end, ligating in the same reaction.
4. Two **fluorescent duplex adapters** with matching constant overhangs ligate to the bridges. Each adapter is a duplex of two ssDNA oligos, one with a 5' fluorophore and one with a 3' fluorophore.
5. The result is the 226 bp ligated construct shown in `V059_gRNA3_Ligated_to_Bridge_Oligos_and_Fluorescent_Adapters.dna`.
6. Cas9 + a guide RNA of interest cuts the construct somewhere in the 118 bp target window.
7. Denaturation releases four distinct ssDNA products, each carrying one fluorophore.
8. Capillary electrophoresis with a GS500LIZ denaturing size standard separates the four products by length.

The four peak sizes report the cut location and cut chemistry simultaneously.

---

## 2. The 226 bp construct

From the SnapGene file (case transitions = region boundaries):

| Region | Construct positions | Length |
|---|---|---|
| Fluor Adapter 1 duplex | 1–25 | 25 |
| Overhang 1 | 26–29 | 4 (`GGAG`) |
| Bridge Oligo 1 | 30–54 | 25 |
| Target | 55–172 | 118 |
| Bridge Oligo 2 | 173–197 | 25 |
| Overhang 2 | 198–201 | 4 (`AGCG`) |
| Fluor Adapter 2 duplex | 202–226 | 25 |

Component sizes are stored in `CONSTRUCT.components` in the viewer. The full construct sequence is stored as `CONSTRUCT.seq`.

---

## 3. Adapter architecture and fluorophore placement

### 3.1 Adapter 1 (LEFT of the construct, positions 1–29 of the top strand)

- **Oligo A** (top strand of the adapter duplex): 25 nt, 5'-TAMRA labeled.
- **Oligo B** (bot strand of the adapter duplex): 29 nt, 3'-6-FAM labeled. The first 4 nt form a 5' overhang on the bot strand; the remaining 25 nt are the reverse complement of Oligo A.

After ligation, in the 226 bp ligated construct:
- TAMRA sits at construct position 1 on the TOP strand (5' end).
- 6-FAM sits at construct position 1 on the BOT strand (3' end of the bot strand).

### 3.2 Adapter 2 (RIGHT of the construct, positions 198–226)

- **Oligo C** (bot strand of the adapter duplex): 25 nt, 5'-HEX labeled.
- **Oligo D** (top strand of the adapter duplex): 29 nt, 3'-ROX labeled. The first 4 nt form a 5' overhang on the top strand.

In the 226 bp ligated construct:
- HEX sits at construct position 226 on the BOT strand (5' end of bot).
- ROX sits at construct position 226 on the TOP strand (3' end of top).

### 3.3 Dye-to-strand map (canonical)

| Channel | Dye | Strand | End | Construct position | Oligo length |
|---|---|---|---|---|---|
| B (Blue) | 6-FAM | bot | 3' | 1 | 29 |
| Y (Yellow) | TAMRA | top | 5' | 1 | 25 |
| G (Green) | HEX | bot | 5' | 226 | 25 |
| R (Red) | ROX | top | 3' | 226 | 29 |

This is encoded in `DYE_STRAND` in the viewer. **Any rewrite of the dye assignments must update this table and `DYE_STRAND` together.**

### 3.4 Pairing convention

Adapter 1 is labeled by the (B, Y) pair. Adapter 2 is labeled by the (G, R) pair. The offset between channels in each pair reports the overhang at that cut end:

- (Y − B) ≈ 0 → blunt cut at Adapter 1 end.
- (Y − B) ≈ +4 → 4-nt 5' overhang at Adapter 1 end with top strand longer.
- (Y − B) ≈ −4 → 4-nt 5' overhang at Adapter 1 end with bot strand longer.
- Same rules apply to (R − G) at Adapter 2 end.

Earlier versions of the viewer used (B,R) + (G,Y). This was **wrong**; corrected in v0.3 after clarification that TAMRA+6-FAM are on the same adapter and HEX+ROX are on the other.

---

## 4. Cas9 cut model

### 4.1 Cut position

Cas9 cuts 3 bp 5' of the PAM, between positions 17 and 18 of the 20 bp protospacer (protospacer positions are 1-indexed from the 5' end of the spacer on the strand the gRNA hybridizes to via R-loop).

Converting from target-position (1-indexed inside the 118 bp target region) to construct-position (1-indexed inside the full 226 bp construct):

- Target start offset = `CONSTRUCT.targetRange.start - 1 = 54`.
- For a **top-strand** PAM at target position `p` (position of the N in NGG, 1-indexed), the protospacer occupies target positions `p-20` through `p-1`. The cut is between target positions `p-4` and `p-3`, so the last base of the LEFT fragment on the top strand = construct position `(p-4) + 54 = p+50`.
- For a **bot-strand** PAM (CCN on top at target position `p`, with the protospacer on bot extending to target positions `p+3` through `p+22`), the cut on bot is 3 bp 5' of the PAM on bot, which is 3 bp 3' of the CCN on top. The last base of the LEFT fragment on the top strand = construct position `(p+5) + 54 = p+59`.

The viewer stores `cut_construct` on each gRNA candidate as this 1-indexed "last base of LEFT fragment on top strand" value.

### 4.2 Cut chemistry (blunt vs overhang)

Wild-type SpCas9 is classically blunt. The assay exists to detect departures: staggered cuts of 1–4 nt have been reported for specific gRNA/target contexts. The viewer models a `5' overhang` with parameter `overhang_nt` meaning:
- Top-strand nick: at `cut_construct`.
- Bot-strand nick: at `cut_construct + overhang_nt`.

Blunt = `overhang_nt = 0`.

### 4.3 Template vs non-template

The **non-template strand** carries 5'-NGG-3' and is displaced by the guide RNA during R-loop formation.
The **template strand** is its complement; it is the strand the gRNA hybridizes to.

- Top-strand PAM (NGG on top) → top is non-template, bot is template.
- Bot-strand PAM (NGG on bot, i.e. CCN on top) → bot is non-template, top is template.

### 4.4 PAM-proximal vs PAM-distal

The **PAM-proximal** fragment contains the PAM sequence after the cut.
The **PAM-distal** fragment does not.

- PAM on top → PAM is 3' of the cut on top → RIGHT fragment = PAM-proximal, LEFT fragment = PAM-distal.
- PAM on bot → PAM (as CCN on top) is 5' of the cut on top → LEFT fragment = PAM-proximal, RIGHT fragment = PAM-distal.

---

## 5. ssDNA product sizes

After denaturation, each fragment gives two single strands.

For **blunt** cut at construct position X:

| Fragment | Top strand size | Bot strand size |
|---|---|---|
| LEFT | X (carries TAMRA/Y at 5') | X (carries 6-FAM/B at 3') |
| RIGHT | 226 − X (carries ROX/R at 3') | 226 − X (carries HEX/G at 5') |

For **4-nt 5' overhang** cut at top-position X (bot-position X + 4):

| Fragment | Top strand size | Bot strand size |
|---|---|---|
| LEFT | X (TAMRA/Y) | X + 4 (6-FAM/B) |
| RIGHT | 226 − X (ROX/R) | 226 − X − 4 (HEX/G) |

This is encoded in `predictCutProducts(grna, constructSize, overhang_nt)` in the viewer.

---

## 6. GS500LIZ migration and the denaturing caveat

CE is run denaturing (with formamide; POP-7 polymer; typical for ABI 3500/3730). GS500LIZ is a ssDNA size ladder and therefore calibrates ssDNA migration directly.

Known complications:
- **Dye mobility offset.** 6-FAM, HEX, TAMRA, ROX have different molecular masses and migrate at slightly different rates even for the same nucleotide length. Typical offsets are 0.3–0.8 bp for 100–400 nt ssDNA. This shows up as a systematic Δ even for truly blunt cuts. A dedicated blunt positive-control ligation should be run to quantify this for your lab's CE system; subtract the calibrated dye-mobility offset from observed Δ values. The viewer's Auto Classify tab has per-dye offset inputs for this.
- **Secondary structure.** Long ssDNA can form hairpins that migrate faster than predicted. The 226 bp range is short enough that this is usually minor.
- **Terminal dye mass.** A 500 Da fluorophore adds roughly 1–2 nt of apparent length to short ssDNA (< 100 nt) and less to longer products.

---

## 7. Ligation products observed in the V059 dataset

The dominant V059_3-2 peaks sit near 200 bp in all four channels, but the math for a single Cas9 cut on a 226 bp construct cannot put ~200 bp in all four channels simultaneously. Interpretation: the ~200 bp peak is a **partial ligation** artifact, not a cut product.

- **Missing Ad2** (Adapter 1 + OH1 + Bridge 1 + Target + Bridge 2 + OH2, no Ad2) = 25 + 4 + 25 + 118 + 25 + 4 = 201 bp. Labeled only by TAMRA and 6-FAM (both on Ad1). Explains the B and Y peaks at ~200.
- **Missing Ad1** (OH1 + Bridge 1 + Target + Bridge 2 + OH2 + Adapter 2) = 4 + 25 + 118 + 25 + 4 + 25 = 201 bp. Labeled only by HEX and ROX. Explains the G and R peaks at ~200.

Both species co-exist in each tube in roughly equal amounts, explaining the four-channel co-localization at ~200 bp. The small (~3.5 bp) G→R offset reflects residual 4-nt overhang at the Ad2 end that is consistent with BsaI chemistry.

The gRNA3_1-1 sample at ~88 bp *does* look like a Cas9 cut product: G channel only, roughly blunt. But the absence of any R partner is inconsistent with a 226 bp construct. gRNA3 samples may use a different, smaller construct.

---

## 8. References

- Isaac Farnum, `Fragment_Analysis_Capillary_Electrophoresis.pdf` (Athey lab internal, 2026-02-03).
- Cas9 Subgroup Weekly Meeting 2026-01-30, 2026-02-13, 2026-03-13, 2026-03-20 (Fireflies transcripts).
- Gilpatrick T et al. (2020). Targeted nanopore sequencing with Cas9-guided adapter ligation. *Nat. Biotechnol.* 38:540–550.
- CLC framework: `SC-CLC Framework Review.pdf` (Athey lab internal, 2026-04-16).
