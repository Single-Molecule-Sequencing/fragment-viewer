// src/lib/constants.js — dye palette + construct + assembly products.
//
// Extracted from FragmentViewer.jsx per issue #13 (Phase B.3). Pure data
// + tiny resolveDyeColor helper. No React. These constants are imported
// by the monolith's React components via re-export from the entry file.
//
// Added `export` to DYE, DYE_ORDER, SAMPLE_DYES, LIZ_LADDER, CHEMISTRY_PRESETS
// so the primitives and tabs can consume them directly. DYE_HEX is now
// just an alias for DYE_PALETTES.default kept for back-compat.

// ======================================================================
// Dye metadata. The rendering `color` values are sourced from DYE_PALETTES
// ("default" palette) below so the electropherogram, DyeChip, tailwind
// theme tokens, and every legacy DYE_HEX reference all agree on a single
// palette. Issue #3 fix — previously three locations disagreed.
export const DYE = {
  B: { name: "6-FAM", label: "Blue",   adapter: 1,    pair: "Y" },
  G: { name: "HEX",   label: "Green",  adapter: 2,    pair: "R" },
  Y: { name: "TAMRA", label: "Yellow", adapter: 1,    pair: "B" },
  R: { name: "ROX",   label: "Red",    adapter: 2,    pair: "G" },
  O: { name: "LIZ",   label: "Orange", adapter: null, pair: null },
};

// Colorblind-safe palette overrides. Applied via resolveDyeColor() so that
// dye semantics stay fixed (B = blue channel, R = red channel, etc.) but
// the rendered colors shift to options that remain distinguishable under
// deutan (red-green) and protan (red-green) color vision. The Wong palette
// (Nature Methods 2011) is the canonical journal-recommended set; Okabe-Ito
// is a close alternative with a slightly warmer green.
export const DYE_PALETTES = {
  // Default palette = Tailwind 600 family — matches the committed
  // tailwind.config.js dye tokens, DyeChip's inline swatches, and the
  // legacy DYE_HEX values. Single source of truth. (Issue #3 fix)
  default: { B: "#1e6fdb", G: "#16a34a", Y: "#ca8a04", R: "#dc2626", O: "#ea580c" },
  // Wong (Nature Methods 2011): distinguishable under deutan/protan/tritan.
  wong:    { B: "#0072B2", G: "#009E73", Y: "#E69F00", R: "#CC79A7", O: "#D55E00" },
  // IBM 5-color CB-safe palette — more saturated, popular for slides.
  ibm:     { B: "#648FFF", G: "#785EF0", Y: "#FFB000", R: "#DC267F", O: "#FE6100" },
  // Grayscale — for publications that require grayscale figures. Dye
  // identity is then carried by stroke-dash patterns (set elsewhere).
  grayscale: { B: "#1f2937", G: "#4b5563", Y: "#9ca3af", R: "#111827", O: "#6b7280" },
};

// Helper used everywhere dye colors are read. Pass the palette name; if
// unknown, falls back to default. Components that haven't been wired for
// the palette prop continue to pass "default" and see no change.
export function resolveDyeColor(dye, palette = "default") {
  const p = DYE_PALETTES[palette] || DYE_PALETTES.default;
  return p[dye] || DYE[dye]?.color || "#94a3b8";
}

// Backfill DYE[d].color from the default palette so every pre-existing
// `DYE[d].color` call site reads the unified color. Any future change to
// the baseline palette updates everything at once. (Issue #3 fix)
for (const d of ["B", "G", "Y", "R", "O"]) DYE[d].color = DYE_PALETTES.default[d];

export const DYE_ORDER = ["B", "G", "Y", "R", "O"];
export const SAMPLE_DYES = ["B", "G", "Y", "R"];
export const LIZ_LADDER = [35, 50, 75, 100, 139, 150, 160, 200, 250, 300, 340, 350, 400, 450, 490, 500];

// Lab-known cut chemistry presets (derived from CLC protocol and Cas9 cut geometry)
export const CHEMISTRY_PRESETS = [
  { id: "blunt_both",  name: "Blunt cuts on both ends",                                  B: 0, Y: 0, G: 0, R: 0 },
  { id: "blunt_ad1",   name: "Blunt at Adapter 1 end, 4-nt overhang at Adapter 2 end (Cas9 + BsaI)", B: 0, Y: 0, G: 0, R: 4 },
  { id: "blunt_ad2",   name: "4-nt overhang at Adapter 1 end, blunt at Adapter 2 end (BsaI + Cas9)", B: 0, Y: 4, G: 0, R: 0 },
  { id: "oh4_both",    name: "4-nt 5' overhang at both ends (BsaI on both sides)",       B: 0, Y: 4, G: 0, R: 4 },
  { id: "oh1_both",    name: "1-nt 5' overhang at both ends (Cas9 staggered)",           B: 0, Y: 1, G: 0, R: 1 },
];

// ----------------------------------------------------------------------
// CONSTRUCT MODEL — from the SnapGene file V059_gRNA3_Ligated_to_Bridge_Oligos_and_Fluorescent_Adapters.dna
// 226 bp total, linear ligated product.
// Fluor Adapter 1 carries 6-FAM (Blue) + TAMRA (Yellow).
// Fluor Adapter 2 carries HEX (Green) + ROX (Red).
// ----------------------------------------------------------------------
export const CONSTRUCT = {
  total: 226,
  // Full 226 bp construct sequence from the SnapGene file (top strand 5' to 3').
  seq: "CGTACGATGCGTACGACCGATGCCAGGAGACGTGCTGAGGTCCATAGCCTGGACGCTCAGTCGGCAGGTGCCAGAACGTTCCCTGGGAAGGCCCCATGGAAGCCCAGGACTGAGCCACCACCCTCAGCCTCGTCACCTCACCACAGGACTGGCTACCTCTCTGGGCCCTCAGGGATCCAATCGAGTCGCAGGTACCCAGCGGCGATCCGATGACCGTACGTCGACC",
  targetRange: { start: 55, end: 172 },   // 1-indexed, inclusive (118 bp target region)
  components: [
    { key: "ad1",    name: "Fluor Adapter 1", size: 25,  color: "#1e6fdb", dyes: ["B", "Y"] },
    { key: "oh1",    name: "Overhang 1",      size: 4,   color: "#94a3b8", dyes: [] },
    { key: "br1",    name: "Bridge Oligo 1",  size: 25,  color: "#64748b", dyes: [] },
    { key: "target", name: "Target",          size: 118, color: "#334155", dyes: [] },
    { key: "br2",    name: "Bridge Oligo 2",  size: 25,  color: "#64748b", dyes: [] },
    { key: "oh2",    name: "Overhang 2",      size: 4,   color: "#94a3b8", dyes: [] },
    { key: "ad2",    name: "Fluor Adapter 2", size: 25,  color: "#d32f2f", dyes: ["G", "R"] },
  ],
};

// ----------------------------------------------------------------------
// FLUOROPHORE STRAND MAP
// Dyes, strands, and construct positions (verified against the SnapGene file oligos).
// TAMRA  = Oligo A (25 nt) - TOP strand 5' end, at construct position 1
// 6-FAM  = Oligo B (29 nt) - BOT strand 3' end, at construct position 1
// HEX    = Oligo C (25 nt) - BOT strand 5' end, at construct position 226
// ROX    = Oligo D (29 nt) - TOP strand 3' end, at construct position 226
// ----------------------------------------------------------------------
export const DYE_STRAND = {
  B: { strand: "bot", fragment: "left",  end: "3'", pos: 1,   oligoLen: 29 },  // 6-FAM
  Y: { strand: "top", fragment: "left",  end: "5'", pos: 1,   oligoLen: 25 },  // TAMRA
  G: { strand: "bot", fragment: "right", end: "5'", pos: 226, oligoLen: 25 },  // HEX
  R: { strand: "top", fragment: "right", end: "3'", pos: 226, oligoLen: 29 },  // ROX
};

// Possible assembly products. Each specifies which components are present and which dyes are predicted to appear.
export const ASSEMBLY_PRODUCTS = [
  { id: "full",           name: "Full ligation (all 5 parts)",            parts: ["ad1","oh1","br1","target","br2","oh2","ad2"], dyes: ["B","Y","G","R"] },
  { id: "no_ad2",         name: "Missing Adapter 2 (everything except Ad2)", parts: ["ad1","oh1","br1","target","br2","oh2"],        dyes: ["B","Y"] },
  { id: "no_ad1",         name: "Missing Adapter 1 (everything except Ad1)", parts: ["oh1","br1","target","br2","oh2","ad2"],        dyes: ["G","R"] },
  { id: "ad1_br1_target", name: "Ad1 + Br1 + Target only",                    parts: ["ad1","oh1","br1","target"],                    dyes: ["B","Y"] },
  { id: "target_ad2",     name: "Target + Br2 + Ad2 only",                    parts: ["target","br2","oh2","ad2"],                    dyes: ["G","R"] },
  { id: "target_bridges", name: "Target + both bridges (no adapters)",        parts: ["br1","target","br2"],                          dyes: [] },
  { id: "target_only",    name: "Target only (unligated, released)",          parts: ["target"],                                      dyes: [] },
  { id: "adapter_dimer",  name: "Ad1 + Ad2 (no insert)",                      parts: ["ad1","oh1","oh2","ad2"],                        dyes: ["B","Y","G","R"] },
];


// DYE_HEX alias — kept for legacy call sites in the monolith; equivalent
// to DYE_PALETTES.default. New code should read from DYE_PALETTES[palette]
// via resolveDyeColor instead.
export const DYE_HEX = DYE_PALETTES.default;
