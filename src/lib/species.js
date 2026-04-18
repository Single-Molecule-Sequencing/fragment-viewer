// src/lib/species.js
// Issue #16: pure biology + species helpers lifted out of FragmentViewer.jsx.
//
// This module defines:
//   - TARGET_REACTANTS            — the 5 partial ligation substrates Cas9 can cut.
//   - predictCutFromReactant()    — ssDNA products produced when a given gRNA cuts a reactant.
//   - cas9NomenclatureLabel()     — canonical compact+full label for a Cas9 cut product.
//   - expectedSpeciesForDye()     — everything a dye lane CAN show (assembly / monomer / cut).
//   - SPECIES_DASH                — dash pattern per species kind (line-style legend).
//   - COMPONENT_INFO              — { componentKey: CONSTRUCT.components[entry] } lookup.
//   - speciesAtSize()             — match an observed size back to expected species.
//   - speciesId()                 — stable id across renders.
//   - enumerateAllSpeciesWithIds()— short display IDs A1/M1/C1... across all dyes.
//
// All pure. No React. Safely imported by both monolith and split components.

import {
  DYE, CONSTRUCT, ASSEMBLY_PRODUCTS,
} from "./constants.js";
import { productSize } from "./biology.js";
import { inventoryStatus } from "./grna_catalog.js";


// ----------------------------------------------------------------------
// Target-containing reactants (the substrates Cas9 can actually cut).
// Each entry has a (construct_start, construct_end) range in the original
// 226 bp full-construct coordinates plus dye topology at each terminus.
// Cuts at full-construct position X land in this reactant only if
// construct_start <= X <= construct_end.
//
// IMPORTANT: cut products from partial reactants land on the SAME bp as
// full-reactant cuts on the dyes that survive (Missing Ad2 + cut at X ->
// Y/B peak at X, identical to Full + cut at X on Y/B). Including partial
// reactants therefore does not add new peak positions; it surfaces the
// AMBIGUITY in which parent reactant a given peak could come from.
// ----------------------------------------------------------------------
export const TARGET_REACTANTS = [
  { id: "full",            name: "Full ligation",                          parts: ["ad1","oh1","br1","target","br2","oh2","ad2"], size: 226, construct_start: 1,  construct_end: 226, left_dyes: ["B","Y"], right_dyes: ["G","R"] },
  { id: "no_ad2",          name: "Missing Ad2 (Ad1+OH1+Br1+Tgt+Br2+OH2)",  parts: ["ad1","oh1","br1","target","br2","oh2"],        size: 201, construct_start: 1,  construct_end: 201, left_dyes: ["B","Y"], right_dyes: [] },
  { id: "no_ad1",          name: "Missing Ad1 (OH1+Br1+Tgt+Br2+OH2+Ad2)",  parts: ["oh1","br1","target","br2","oh2","ad2"],        size: 201, construct_start: 26, construct_end: 226, left_dyes: [],         right_dyes: ["G","R"] },
  { id: "ad1_br1_target",  name: "Ad1+OH1+Br1+Target only",                parts: ["ad1","oh1","br1","target"],                    size: 172, construct_start: 1,  construct_end: 172, left_dyes: ["B","Y"], right_dyes: [] },
  { id: "target_ad2",      name: "Target+Br2+OH2+Ad2 only",                parts: ["target","br2","oh2","ad2"],                    size: 172, construct_start: 55, construct_end: 226, left_dyes: [],         right_dyes: ["G","R"] },
];

// Predict the labeled ssDNA cut products produced when Cas9 cuts the given
// reactant at grna.cut_construct (full-construct coordinates) with the given
// chemistry. Returns dict of {dye: product} for dyes that are physically
// present on a labeled terminus of this reactant; returns null if the cut
// position is outside the reactant's construct range.
export function predictCutFromReactant(grna, reactant, overhang_nt = 0) {
  const X = grna.cut_construct;
  if (X < reactant.construct_start || X > reactant.construct_end) return null;
  const cutInReactant = X - reactant.construct_start + 1;
  const leftLen = cutInReactant;
  const rightLen = reactant.size - cutInReactant;

  const pamOnTop = grna.strand === "top";
  const leftIsProximal = !pamOnTop;
  const topIsNonTemplate = pamOnTop;

  const products = {};
  // LEFT-side dyes (carried on Ad1 if present at this end of the reactant)
  for (const dye of reactant.left_dyes) {
    const isBottomStrand = (dye === "B" || dye === "G");
    const len = isBottomStrand ? leftLen + overhang_nt : leftLen;
    products[dye] = {
      length: len,
      fragment: "LEFT",
      strand: isBottomStrand ? "bot" : "top",
      template: isBottomStrand
        ? (topIsNonTemplate ? "template" : "non-template")
        : (topIsNonTemplate ? "non-template" : "template"),
      pam_side: leftIsProximal ? "proximal" : "distal",
      source_reactant: reactant.id,
      source_reactant_name: reactant.name,
    };
  }
  // RIGHT-side dyes (carried on Ad2 if present at this end of the reactant)
  for (const dye of reactant.right_dyes) {
    const isBottomStrand = (dye === "B" || dye === "G");
    const len = isBottomStrand ? rightLen - overhang_nt : rightLen;
    products[dye] = {
      length: len,
      fragment: "RIGHT",
      strand: isBottomStrand ? "bot" : "top",
      template: isBottomStrand
        ? (topIsNonTemplate ? "template" : "non-template")
        : (topIsNonTemplate ? "non-template" : "template"),
      pam_side: leftIsProximal ? "distal" : "proximal",
      source_reactant: reactant.id,
      source_reactant_name: reactant.name,
    };
  }
  return products;
}

// Peak-table CSV export. Produces a tidy long-format CSV that pairs well

// Cas9 nomenclature for a single ssDNA cut product.
// Two forms are produced so the renderer can keep inline labels readable
// while the full annotation is available on hover (JSX <title>) or in a
// caption block (matplotlib).
//
// Compact: "{lab}{gname} {FRAG}/{strand}/{dye} {chem}"
// Full:    "{lab}{gname} | {strand}-strand PAM {PAM} cut@{X} | {FRAG} ssDNA
//          {strand}/{dye} ({template}, PAM-{pam_side}) | {chem} | {length} nt"
export function cas9NomenclatureLabel({ grna, dye, dyeProduct, overhang_nt, labMark = "" }) {
  const gname = grna.name || `cand-${grna.id}`;
  const chem = overhang_nt === 0
    ? "blunt"
    : (overhang_nt > 0 ? `+${overhang_nt}nt 5'OH` : `${overhang_nt}nt 3'OH`);
  const fromTag = dyeProduct.source_reactant
    ? ` from: ${dyeProduct.source_reactant_name || dyeProduct.source_reactant}`
    : "";
  const fromShort = dyeProduct.source_reactant
    ? ` (${dyeProduct.source_reactant})`
    : "";
  const compact =
    `${labMark}${gname} ${dyeProduct.fragment}/${dyeProduct.strand}/${dye} ${chem}${fromShort}`;
  const full =
    `${labMark}${gname} | ${grna.strand}-strand PAM ${grna.pam_seq} cut@${grna.cut_construct}` +
    ` | ${dyeProduct.fragment} ssDNA ${dyeProduct.strand}/${dye} (${dyeProduct.template}, PAM-${dyeProduct.pam_side})` +
    `${fromTag} | ${chem} | ${dyeProduct.length} nt`;
  return { compact, full };
}

// ----------------------------------------------------------------------
// Expected species enumerator (used by the electropherogram overlay).
// Returns every species the dye CAN show, sorted by ascending bp:
//   * Assembly / partial-ligation products (full, missing Ad1/Ad2,
//     adapter dimer, etc) filtered by which dyes actually appear on
//     each species per ASSEMBLY_PRODUCTS.
//   * Adapter monomers (pre-ligation single oligos carrying one dye each)
//     per BIOLOGY.md §3.3.
//   * Cas9 cut products for any gRNAs passed in, at the chemistries
//     passed in (blunt by default). Cut labels carry the full Cas9
//     nomenclature via cas9NomenclatureLabel().
// Each entry: { size: number_bp, label: string, kind: "assembly"|"monomer"|"cut" }
// ----------------------------------------------------------------------
export function expectedSpeciesForDye(dye, components, constructSize = 226, gRNAs = [], overhangs = [0]) {
  const out = [];

  // Assembly + partial-ligation products
  for (const p of ASSEMBLY_PRODUCTS) {
    if (!p.dyes.includes(dye)) continue;
    out.push({ size: productSize(p, components), label: p.name, kind: "assembly" });
  }

  // Adapter monomers (single oligos pre-ligation; one dye per oligo)
  const monomers = {
    B: { size: 29, label: "Ad1 bot oligo (6-FAM, unligated)" },
    Y: { size: 25, label: "Ad1 top oligo (TAMRA, unligated)" },
    G: { size: 25, label: "Ad2 bot oligo (HEX, unligated)" },
    R: { size: 29, label: "Ad2 top oligo (ROX, unligated)" },
  };
  if (monomers[dye]) {
    out.push({ size: monomers[dye].size, label: monomers[dye].label, kind: "monomer" });
  }

  // Cas9 cut products: enumerate over EVERY target-containing reactant the
  // assay can produce (full + 4 partial-ligation species). Each reactant
  // contributes labeled cut products only on the dyes that physically sit on
  // its termini, so e.g. "Missing Ad1" never lights up Y or B even if the cut
  // position is inside its target window.
  for (const g of gRNAs) {
    if (!g) continue;
    const inv = inventoryStatus(g);
    const labMark = inv.status === "exact" ? "LAB✓ " : (inv.status === "name" ? "name~ " : "");
    for (const oh of overhangs) {
      for (const reactant of TARGET_REACTANTS) {
        const products = predictCutFromReactant(g, reactant, oh);
        if (!products) continue;
        const p = products[dye];
        if (!p) continue;
        const labels = cas9NomenclatureLabel({ grna: g, dye, dyeProduct: p, overhang_nt: oh, labMark });
        out.push({
          size: p.length,
          label: labels.compact,
          fullLabel: labels.full,
          kind: "cut",
          source_reactant: reactant.id,
          // Carry full cut-product details so downstream renderers (sidebar
          // schematic, popover) know which fragment side keeps the dye.
          fragment: p.fragment,        // "LEFT" | "RIGHT"
          strand: p.strand,            // "top" | "bot"
          template: p.template,
          pam_side: p.pam_side,
          overhang_nt: oh,
          grna_cut_bp: g.cut_construct,
          grna_strand: g.strand,
          grna_pam: g.pam_seq,
          grna_name: g.name,
        });
      }
    }
  }

  // Default fullLabel = label for non-cut entries so consumers can blindly read it.
  return out
    .map(s => (s.fullLabel ? s : { ...s, fullLabel: s.label }))
    .sort((a, b) => a.size - b.size);
}

// Stroke pattern per kind. Color comes from the lane's dye so all marks read
// as belonging to that channel; the dash pattern conveys the kind information.
export const SPECIES_DASH = {
  assembly: "1.5 2.5",   // short dash
  monomer:  "0.6 1.6",   // dotted
  cut:      "5 2",       // long dash
};

// visually.
// ----------------------------------------------------------------------
export const COMPONENT_INFO = (() => {
  const m = {};
  for (const c of CONSTRUCT.components) m[c.key] = c;
  return m;
})();

// ----------------------------------------------------------------------
// Find every species (assembly + monomer + cut for the chosen gRNA) whose
// size is within +/- tol bp of the queried bp on the queried dye. Used by
// the click-pinned popover to answer "what could this peak be?"
// ----------------------------------------------------------------------
export function speciesAtSize({ bp, dye, tol = 2.5, componentSizes, constructSize, gRNAs = [], overhangs = [0] }) {
  const all = expectedSpeciesForDye(dye, componentSizes, constructSize, gRNAs, overhangs);
  return all
    .map(sp => ({ ...sp, dist: Math.abs(sp.size - bp) }))
    .filter(sp => sp.dist <= tol)
    .sort((a, b) => a.dist - b.dist);
}

// Stable id for a species across renders. Used by the SpeciesSidebar
// per-species visibility toggles. Includes dye to distinguish the same
// physical species displayed on different lanes.
export function speciesId(sp, dye) {
  if (sp.kind === "assembly") return `asm:${dye}:${sp.size}:${sp.label}`;
  if (sp.kind === "monomer")  return `mon:${dye}:${sp.size}`;
  if (sp.kind === "cut")      return `cut:${dye}:${sp.size}:${sp.source_reactant || ""}:${sp.fragment || ""}:${sp.overhang_nt ?? ""}`;
  return `${sp.kind}:${dye}:${sp.size}`;
}

// Assign short display IDs (A1/A2/M1/C1...) across every dye for stable
// labelling on the plot. Same physical species appearing on multiple dyes
// shares one ID so the user can match between lanes.
export function enumerateAllSpeciesWithIds({ componentSizes, constructSize, gRNAs, overhangs, dyes }) {
  const all = [];
  for (const d of dyes) {
    for (const sp of expectedSpeciesForDye(d, componentSizes, constructSize, gRNAs, overhangs)) {
      all.push({ ...sp, dye: d, lineColor: DYE[d].color });
    }
  }
  const kindOrder = { assembly: 0, monomer: 1, cut: 2 };
  all.sort((a, b) => {
    if (a.kind !== b.kind) return kindOrder[a.kind] - kindOrder[b.kind];
    return a.size - b.size;
  });
  const counts = { assembly: 0, monomer: 0, cut: 0 };
  const prefix = { assembly: "A", monomer: "M", cut: "C" };
  const seenKey = new Map();
  for (const sp of all) {
    const key = sp.kind === "cut"
      ? `cut:${sp.size}:${sp.source_reactant}:${sp.fragment}:${sp.overhang_nt ?? 0}`
      : `${sp.kind}:${sp.size}:${sp.label}`;
    if (!seenKey.has(key)) {
      counts[sp.kind] = (counts[sp.kind] || 0) + 1;
      seenKey.set(key, `${prefix[sp.kind] || "?"}${counts[sp.kind]}`);
    }
    sp.displayId = seenKey.get(key);
  }
  return all;
}
