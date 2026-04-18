// src/lib/grna_catalog.js — lab-curated gRNA catalog.
//
// Extracted from FragmentViewer.jsx per issue #13 (Phase B.1). Pure data
// plus the closely-related pure helpers (normalizeSpacer, matchLabCatalog).
// matchLabCatalog accepts an optional custom catalog so callers can
// override the module default — see issue #2 fix in v0.23.0.

export const LAB_GRNA_CATALOG = [
  // --- Active fragment analysis construct (V059_gRNA3) ---
  { name: "V059_gRNA3",             spacer: "AGTCCTGTGGTGAGGTGACG", source: "= grna_cyp2d6_rachel03 in cas9-targeted grna_master.tsv (Rachel gRNA 3.0, V0-59 plasmid). Bot-strand match in V059 target window (RC = CGTCACCTCACCACAGGACT on top). User-supplied spacer 2026-04-18.", target: "V059 synthetic target (118 bp)", notes: "Active gRNA used in the capillary electrophoresis dataset. Bot-strand PAM (CCT on top, AGG on bot)." },

  // --- CYP2D6 pilot panel (chr22, GRCh38) ---
  // Sequences from pilot_grna_positions.bed; 20-bp protospacer, NGG PAM on + strand.
  // Backfilled 2026-04-18 from /mnt/d/Reference_Files/GCA_000001405.15_GRCh38_no_alt_analysis_set.fasta.
  { name: "CYP2D6_upstream_1",      spacer: "GGTTTGGTGGCAGCAAGTTG", source: "pilot_grna_positions.bed; GRCh38 chr22:42120246-42120266 (+), PAM=AGG",  target: "chr22:42120246-42120266 (+)", notes: "CYP2D6 upstream pilot panel, member 1" },
  { name: "CYP2D6_upstream_2",      spacer: "TGCTGAAAGTGAGGAAGACG", source: "pilot_grna_positions.bed; GRCh38 chr22:42120299-42120319 (+), PAM=GGG",  target: "chr22:42120299-42120319 (+)", notes: "CYP2D6 upstream pilot panel, member 2; GGG PAM → expect elevated ±1 wobble per 15485-JL panel-eval v1.6" },
  { name: "CYP2D6_upstream_3",      spacer: "CCCAGCTACTCAGGAAGCTG", source: "pilot_grna_positions.bed; GRCh38 chr22:42120483-42120503 (+), PAM=AGG",  target: "chr22:42120483-42120503 (+)", notes: "CYP2D6 upstream pilot panel, member 3" },
  { name: "CYP2D6_downstream_1",    spacer: "TGTGTTGACTGTGCTGCCAG", source: "pilot_grna_positions.bed; GRCh38 chr22:42130953-42130973 (+), PAM=TGG",  target: "chr22:42130953-42130973 (+)", notes: "CYP2D6 downstream pilot panel, member 1" },
  { name: "CYP2D6_downstream_2",    spacer: "CTGTCACTGGCACTTACCTG", source: "pilot_grna_positions.bed; GRCh38 chr22:42131279-42131299 (+), PAM=GGG",  target: "chr22:42131279-42131299 (+)", notes: "CYP2D6 downstream pilot panel, member 2; GGG PAM → expect elevated ±1 wobble per 15485-JL panel-eval v1.6" },
  { name: "CYP2D6_downstream_3",    spacer: "TTAGAGCTCCTGATGATGAG", source: "pilot_grna_positions.bed; GRCh38 chr22:42131304-42131324 (+), PAM=TGG",  target: "chr22:42131304-42131324 (+)", notes: "CYP2D6 downstream pilot panel, member 3" },

  // --- PureTarget-style subtelomeric pilot guides (multi-chromosome) ---
  // From pilot_grna_positions.bed; backfilled 2026-04-18 from GRCh38 no-alt.
  { name: "chr1p_1",                spacer: "GACAACGTGGATGAACCTAG", source: "pilot_grna_positions.bed; GRCh38 chr1:45335-45355 (+), PAM=AGG",          target: "chr1:45335-45355 (+)",      notes: "Subtelomeric pilot, 1p arm" },
  { name: "chr1p_2",                spacer: "ATATCATGGATGAGCCTGTG", source: "pilot_grna_positions.bed; GRCh38 chr1:46020-46040 (+), PAM=AGG",          target: "chr1:46020-46040 (+)",      notes: "Subtelomeric pilot, 1p arm" },
  { name: "chr1p_3",                spacer: "AGAACAAAGCTTCCACAGTG", source: "pilot_grna_positions.bed; GRCh38 chr1:46448-46468 (+), PAM=TGG",          target: "chr1:46448-46468 (+)",      notes: "Subtelomeric pilot, 1p arm" },
  { name: "chr17p_1",               spacer: "GGCATAAGCTGGATGTAGAG", source: "pilot_grna_positions.bed; GRCh38 chr17:65117-65137 (+), PAM=AGG",         target: "chr17:65117-65137 (+)",     notes: "Subtelomeric pilot, 17p arm" },
  { name: "chr17p_2",               spacer: "AAGGTTGGGAGCTTGGCTTG", source: "pilot_grna_positions.bed; GRCh38 chr17:65311-65331 (+), PAM=GGG",         target: "chr17:65311-65331 (+)",     notes: "Subtelomeric pilot, 17p arm; GGG PAM → elevated ±1 wobble per 15485-JL panel-eval v1.6; adjacent-frame to chr17p_3 (Δ=1bp on +)" },
  { name: "chr17p_3",               spacer: "AGGTTGGGAGCTTGGCTTGG", source: "pilot_grna_positions.bed; GRCh38 chr17:65312-65332 (+), PAM=GGG",         target: "chr17:65312-65332 (+)",     notes: "Subtelomeric pilot, 17p arm; GGG PAM → elevated ±1 wobble per 15485-JL panel-eval v1.6; adjacent-frame to chr17p_2 (Δ=1bp on +)" },

  // --- Subtelomeric / telomeric q-arm pilots (multi-chromosome) ---
  // From pilot_grna_positions.bed; backfilled 2026-04-18 from GRCh38 no-alt.
  { name: "chr1q_1",                spacer: "CCATTTGCTTCCTCTGCCTG", source: "pilot_grna_positions.bed; GRCh38 chr1:248886652-248886672 (+), PAM=GGG",  target: "chr1:248886652-248886672 (+)",  notes: "Subtelomeric pilot, 1q arm; GGG PAM → elevated ±1 wobble per 15485-JL panel-eval v1.6" },
  { name: "chr1q_2",                spacer: "GAATGCATGCTCCAGCTGTG", source: "pilot_grna_positions.bed; GRCh38 chr1:248886689-248886709 (+), PAM=TGG",  target: "chr1:248886689-248886709 (+)",  notes: "Subtelomeric pilot, 1q arm" },
  { name: "chr1q_3",                spacer: "AGGAATGTTGGCAGGAGTTG", source: "pilot_grna_positions.bed; GRCh38 chr1:248886736-248886756 (+), PAM=AGG",  target: "chr1:248886736-248886756 (+)",  notes: "Subtelomeric pilot, 1q arm" },
  { name: "chr22q_1",               spacer: "TGCCTCTGCCTTCACTGCTG", source: "pilot_grna_positions.bed; GRCh38 chr22:50728497-50728517 (+), PAM=TGG",  target: "chr22:50728497-50728517 (+)",   notes: "Subtelomeric pilot, 22q arm" },
  { name: "chr22q_2",               spacer: "CCACTGAAAGCTAAGCCTTG", source: "pilot_grna_positions.bed; GRCh38 chr22:50728584-50728604 (+), PAM=GGG",  target: "chr22:50728584-50728604 (+)",   notes: "Subtelomeric pilot, 22q arm; GGG PAM → elevated ±1 wobble per 15485-JL panel-eval v1.6" },
  { name: "chr22q_3",               spacer: "ACTTTGGCCCACTGTGCAGG", source: "pilot_grna_positions.bed; GRCh38 chr22:50728885-50728905 (+), PAM=TGG",  target: "chr22:50728885-50728905 (+)",   notes: "Subtelomeric pilot, 22q arm" },
  { name: "chr7q_1",                spacer: "TCAAAGAACAAGGCCTAGTG", source: "pilot_grna_positions.bed; GRCh38 chr7:159236054-159236074 (+), PAM=AGG", target: "chr7:159236054-159236074 (+)",  notes: "Subtelomeric pilot, 7q arm" },
  { name: "chr7q_2",                spacer: "AGCAGTGAAAGGACATGCAG", source: "pilot_grna_positions.bed; GRCh38 chr7:159236118-159236138 (+), PAM=AGG", target: "chr7:159236118-159236138 (+)",  notes: "Subtelomeric pilot, 7q arm" },
  { name: "chr7q_3",                spacer: "AAGTATCAAGATGACTGGAG", source: "pilot_grna_positions.bed; GRCh38 chr7:159236143-159236163 (+), PAM=AGG", target: "chr7:159236143-159236163 (+)",  notes: "Subtelomeric pilot, 7q arm" },
  { name: "chrXq_1",                spacer: "TCCTGGATGGCTTCAGGATG", source: "pilot_grna_positions.bed; GRCh38 chrX:155963057-155963077 (+), PAM=GGG", target: "chrX:155963057-155963077 (+)",  notes: "Subtelomeric pilot, Xq arm; GGG PAM → elevated ±1 wobble per 15485-JL panel-eval v1.6" },
  { name: "chrXq_2",                spacer: "GCTTCATATCCTATCCTCTG", source: "pilot_grna_positions.bed; GRCh38 chrX:155963128-155963148 (+), PAM=AGG", target: "chrX:155963128-155963148 (+)",  notes: "Subtelomeric pilot, Xq arm; adjacent-frame to chrXq_3 (Δ=2bp on +)" },
  { name: "chrXq_3",                spacer: "TTCATATCCTATCCTCTGAG", source: "pilot_grna_positions.bed; GRCh38 chrX:155963130-155963150 (+), PAM=GGG", target: "chrX:155963130-155963150 (+)",  notes: "Subtelomeric pilot, Xq arm; GGG PAM → elevated ±1 wobble per 15485-JL panel-eval v1.6; adjacent-frame to chrXq_2 (Δ=2bp on +)" },

  // ---- ADD NEW LAB gRNAs BELOW ----
  // { name: "Your_gRNA_Name", spacer: "NNNNNNNNNNNNNNNNNNNN", source: "...", target: "...", notes: "..." },
];

// Normalize spacer for comparison (uppercase, DNA only, strip U's)
export function normalizeSpacer(s) {
  return (s || "").toUpperCase().replace(/U/g, "T").replace(/[^ACGT]/g, "");
}

// Match a candidate gRNA against the lab catalog; returns catalog entry or null.
export function matchLabCatalog(grna, catalog = LAB_GRNA_CATALOG) {
  const cand = normalizeSpacer(grna.protospacer);
  if (cand.length !== 20) return null;
  const candRC = cand.split("").reverse().map(c => ({A:"T",T:"A",G:"C",C:"G"})[c] || c).join("");
  for (const entry of catalog) {
    const ref = normalizeSpacer(entry.spacer);
    if (ref.length !== 20) continue;
    if (ref === cand || ref === candRC) return entry;
  }
  return null;
}

// Richer variant of matchLabCatalog: returns a classification object with
// three possible outcomes ordered by signal strength:
//   1. "exact" — spacer equality (forward or reverse-complement) against a
//      catalog entry that has a populated 20-nt spacer. Strongest signal.
//   2. "name"  — name-prefix / substring match against any catalog entry
//      (fallback when the candidate lacks a full spacer).
//   3. "none"  — not in inventory.
// Returns { status, entry?, signal }.
export function inventoryStatus(candidate, catalog = LAB_GRNA_CATALOG) {
  const protoNorm = candidate?.protospacer ? normalizeSpacer(candidate.protospacer) : "";
  const protoRC = protoNorm.length === 20
    ? protoNorm.split("").reverse().map(c => ({ A: "T", T: "A", G: "C", C: "G" })[c] || c).join("")
    : "";
  const cname = (candidate?.name || "").toLowerCase();
  for (const entry of catalog) {
    const ref = normalizeSpacer(entry.spacer);
    if (ref.length === 20 && (ref === protoNorm || ref === protoRC)) {
      return { status: "exact", entry, signal: "spacer" };
    }
  }
  if (cname) {
    for (const entry of catalog) {
      const ename = (entry.name || "").toLowerCase();
      if (ename && (cname.includes(ename) || ename.includes(cname))) {
        return { status: "name", entry, signal: "name" };
      }
    }
  }
  return { status: "none" };
}
