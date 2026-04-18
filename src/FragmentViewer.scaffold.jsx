import { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Activity, Crosshair, Scissors, Layers, GitCompare,
  Upload, Database, Microscope, FileDown, RotateCcw,
  CheckCircle2, AlertTriangle, ChevronRight, ExternalLink,
} from "lucide-react";

// Issue #13: modular split. Pure helpers live in src/lib/*.js and are
// re-exported here so existing test imports (`from "../src/FragmentViewer.jsx"`)
// keep working without any test-file churn.
import {
  rollingBaseline, subtractBaseline, savitzkyGolay, clipSaturated,
  movingAverage, medianFilter, detrendLinear, logTransform,
  firstDerivative, preprocessTrace,
} from "./lib/preprocess.js";
export {
  rollingBaseline, subtractBaseline, savitzkyGolay, clipSaturated,
  movingAverage, medianFilter, detrendLinear, logTransform,
  firstDerivative, preprocessTrace,
};
import {
  computePeakSNR, computePurityScore,
  buildHeatmapMatrix, heatmapColor,
  computePeakShiftStats,
  evaluateDATailing, predictPostTailing,
  evaluateGaussianSum, computeResidual,
  autoCalibrateDyeOffsets,
} from "./lib/analysis.js";
export {
  computePeakSNR, computePurityScore,
  buildHeatmapMatrix, heatmapColor,
  computePeakShiftStats,
  evaluateDATailing, predictPostTailing,
  evaluateGaussianSum, computeResidual,
  autoCalibrateDyeOffsets,
};
import {
  downloadBlob, serializeSvg, exportSvgNative,
  rasterizeSvgToCanvas, exportSvgAsPng, exportSvgAsJpg, exportSvgAsWebp,
  mergeRefs, buildCombinedSvg,
} from "./lib/export.js";
export {
  exportSvgNative, exportSvgAsPng, exportSvgAsJpg, exportSvgAsWebp,
  buildCombinedSvg,
};
import {
  buildPeakTableCSV, encodeViewState, decodeViewState,
} from "./lib/viewstate.js";
export {
  buildPeakTableCSV, encodeViewState, decodeViewState,
};
import {
  parseGenemapperTSV, parseAbifBuffer, calibrateLizJs,
  callPeaksFromTrace, parseFsaArrayBuffer,
} from "./lib/abif.js";
export {
  parseGenemapperTSV, parseAbifBuffer, calibrateLizJs,
  callPeaksFromTrace, parseFsaArrayBuffer,
};
import {
  LAB_GRNA_CATALOG, normalizeSpacer, matchLabCatalog, inventoryStatus,
} from "./lib/grna_catalog.js";
export {
  LAB_GRNA_CATALOG, normalizeSpacer, matchLabCatalog, inventoryStatus,
};
import {
  reverseComplement, findGrnas, predictCutProducts, classifyPeaks,
  productSize,
} from "./lib/biology.js";
export {
  reverseComplement, findGrnas, predictCutProducts, classifyPeaks,
  productSize,
};
import {
  DYE, DYE_PALETTES, DYE_HEX, DYE_ORDER, SAMPLE_DYES,
  LIZ_LADDER, CHEMISTRY_PRESETS, CONSTRUCT, ASSEMBLY_PRODUCTS,
  DYE_STRAND, resolveDyeColor,
} from "./lib/constants.js";
export {
  DYE_PALETTES, CONSTRUCT, ASSEMBLY_PRODUCTS, DYE_STRAND, resolveDyeColor,
};

// ----------------------------------------------------------------------
// UI components lifted out of this monolith under issue #13 (Phase C).
// All live in src/components/. Re-exported from here so existing
// consumers and test imports keep working without churn.
// ----------------------------------------------------------------------
import {
  Panel, Stat, Pill, DyeChip, Field, ToolButton,
} from "./components/primitives.jsx";
export { Panel, Stat, Pill, DyeChip, Field, ToolButton };
import { ExportMenu } from "./components/export_menu.jsx";
export { ExportMenu };
import { LabInventoryBadge, LabInventoryPanel } from "./components/lab_inventory.jsx";
export { LabInventoryBadge, LabInventoryPanel };
import PrintStyles from "./components/print_styles.jsx";
import KeyboardHelpModal from "./components/keyboard_help_modal.jsx";

import { DropOverlay, UploadButton } from "./components/drop_zone.jsx";
export { DropOverlay, UploadButton };
import { Toolbar, Sidebar, SidebarLink, StatusBar } from "./components/chrome.jsx";
export { Toolbar, Sidebar, SidebarLink, StatusBar };
import {
  ProductFragmentViz, ConstructDiagram, AssemblyProductsCard, TargetSequenceView,
} from "./components/diagrams.jsx";
export { ProductFragmentViz, ConstructDiagram, AssemblyProductsCard, TargetSequenceView };
import {
  SampleStyleRow, EndStructureEditor, PostTailingPanel, NudgeRow, PeakShiftPanel, PrepControls,
} from "./components/editors.jsx";
export { SampleStyleRow, EndStructureEditor, PostTailingPanel, NudgeRow, PeakShiftPanel, PrepControls };
import { StackedChromatogram, MiniChromatogram } from "./components/chromatograms.jsx";
export { StackedChromatogram, MiniChromatogram };
import { DNADiagramsModal, ReportModal } from "./components/modals.jsx";
export { DNADiagramsModal, ReportModal };

// Tabs lifted out under issue #13 Phase C. Each tab imports its lib/ deps
// directly and reads the live `DATA` binding from this module (see export below).
import { HeatmapTab } from "./tabs/heatmap_tab.jsx";
import { CompareTab } from "./tabs/compare_tab.jsx";
import { CutPredictionTab, OverhangChart } from "./tabs/cut_prediction_tab.jsx";
import { AutoClassifyTab } from "./tabs/auto_classify_tab.jsx";
import { PeakIdTab, PeakSpeciesPopover, SampleSummaryCard } from "./tabs/peak_id_tab.jsx";
import { TraceTab } from "./tabs/trace_tab.jsx";
export {
  HeatmapTab, CompareTab, CutPredictionTab, OverhangChart, AutoClassifyTab,
  PeakIdTab, PeakSpeciesPopover, SampleSummaryCard, TraceTab,
};


// ======================================================================
// DATA — peak table, shipped as a JS literal by the build step
// ======================================================================
export const DATA = __DATA__;

// Raw trace store (populated on .fsa ingest; empty for the seeded peak-table
// dataset). Keyed by sample → {B,G,Y,R,O: Int16Array, bpAxis: Float32Array}.
// Kept on DATA so that the remount-by-key pattern in FragmentViewer picks it
// up alongside DATA.peaks without any new prop-drilling.
DATA.traces = DATA.traces || {};

// ======================================================================
// CONSTANTS — dyes, size standard, lab defaults



// productSize now lives in src/lib/biology.js (see imports above).

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

// ----------------------------------------------------------------------
// SpeciesSchematic — small SVG cartoon of a molecular species.
//
// Renders the named construct components as a horizontal stacked bar,
// component-colored, with dye dots at the labeled termini (LEFT side
// stacks B over Y if Ad1 present; RIGHT side stacks G over R if Ad2
// present). Component widths are proportional to bp; the bar always
// fills the same overall width so different-sized species line up
// visually.
// ----------------------------------------------------------------------
export const COMPONENT_INFO = (() => {
  const m = {};
  for (const c of CONSTRUCT.components) m[c.key] = c;
  return m;
})();

// DYE_HEX kept as a thin alias for the default palette so legacy call
// sites in the DyePaletteSwatch etc. don't break. For new code, call
// resolveDyeColor(d, palette) directly. (Issue #3 fix)

export function SpeciesSchematic({
  parts, leftDyes = [], rightDyes = [], width = 220, height = 28,
  scaleToFull = true, showCut = null,
  cutFragment = null,    // null | "LEFT" | "RIGHT" — when set, dim the discarded side and hide its dye dots
}) {
  // Total bp of THIS species; reference total = full construct (226 bp by default).
  const speciesBp = parts.reduce((t, k) => t + (COMPONENT_INFO[k]?.size || 0), 0);
  const fullBp = CONSTRUCT.total;
  const denom = scaleToFull ? fullBp : speciesBp;
  const innerW = width - 28;
  const startX = 14;
  const usedW = (speciesBp / denom) * innerW;
  const barX0 = startX + (innerW - usedW) / (scaleToFull ? 2 : 1);
  let x = barX0;
  const segs = parts.map((k, i) => {
    const info = COMPONENT_INFO[k] || { color: "#a1a1aa", size: 0, name: k };
    const w = (info.size / denom) * innerW;
    const rect = (
      <rect key={`${k}-${i}`} x={x} y={9} width={w} height={10} fill={info.color}>
        <title>{info.name} · {info.size} bp</title>
      </rect>
    );
    const segX = x;
    x += w;
    return { rect, x0: segX, x1: x, key: k };
  });
  // Cut position in SVG coords (if showCut)
  let cutX = null;
  let cutMarker = null;
  if (showCut && typeof showCut.bp === "number" && parts.length) {
    const constructStartBp = parts.includes("ad1") ? 1 : (parts.includes("oh1") ? 26 : (parts[0] === "target" ? 55 : 1));
    const inSpeciesBp = showCut.bp - constructStartBp + 1;
    if (inSpeciesBp >= 0 && inSpeciesBp <= speciesBp) {
      cutX = barX0 + (inSpeciesBp / denom) * innerW;
      cutMarker = (
        <g pointerEvents="none">
          <line x1={cutX} x2={cutX} y1={5} y2={23} stroke="#0f172a" strokeWidth="1.4" />
          <text x={cutX} y={4} fontSize="9" textAnchor="middle" fill="#0f172a">✂</text>
        </g>
      );
    }
  }
  // Determine which dye dots to render (when cutFragment is set, only show the
  // dot on the kept terminus).
  const showLeftDyes  = !cutFragment || cutFragment === "LEFT";
  const showRightDyes = !cutFragment || cutFragment === "RIGHT";
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-label="species schematic">
      <line x1={startX} x2={startX + innerW} y1={14} y2={14} stroke="#e4e4e7" strokeWidth="0.5" />
      {segs.map(s => s.rect)}
      {/* Dim the discarded side when this is a fragment view */}
      {cutFragment === "LEFT" && cutX !== null && (
        <rect x={cutX} y={8} width={(barX0 + usedW) - cutX} height={12} fill="white" opacity="0.72" pointerEvents="none" />
      )}
      {cutFragment === "RIGHT" && cutX !== null && (
        <rect x={barX0} y={8} width={cutX - barX0} height={12} fill="white" opacity="0.72" pointerEvents="none" />
      )}
      {cutMarker}
      {showLeftDyes && leftDyes.map((d, i) => (
        <circle key={`L-${d}`} cx={6} cy={5 + i * 10} r={4} fill={DYE_HEX[d]} stroke="white" strokeWidth="1.2">
          <title>{d} dye on LEFT terminus</title>
        </circle>
      ))}
      {showRightDyes && rightDyes.map((d, i) => (
        <circle key={`R-${d}`} cx={width - 6} cy={5 + i * 10} r={4} fill={DYE_HEX[d]} stroke="white" strokeWidth="1.2">
          <title>{d} dye on RIGHT terminus</title>
        </circle>
      ))}
    </svg>
  );
}

// Convenience: derive (parts, leftDyes, rightDyes) from an ASSEMBLY_PRODUCTS or
// TARGET_REACTANTS entry. Both shapes carry .parts (or .components) and .dyes.
export function speciesSchematicProps(entry) {
  const parts = entry.parts || entry.components || [];
  const allDyes = entry.dyes || [...(entry.left_dyes || []), ...(entry.right_dyes || [])];
  const leftDyes = entry.left_dyes !== undefined
    ? entry.left_dyes
    : (parts.includes("ad1") ? allDyes.filter(d => d === "B" || d === "Y") : []);
  const rightDyes = entry.right_dyes !== undefined
    ? entry.right_dyes
    : (parts.includes("ad2") ? allDyes.filter(d => d === "G" || d === "R") : []);
  return { parts, leftDyes, rightDyes };
}

// ----------------------------------------------------------------------
// SpeciesLegend — a panel listing every static species the assay can
// produce (assembly products + adapter monomers) with a thumbnail
// schematic, name, bp, dye topology. Dynamic Cas9 cut products are NOT
// listed (they depend on the selected gRNA + chemistry); they are
// surfaced via the species overlay and the hover popover instead.
// ----------------------------------------------------------------------
export function SpeciesLegend({ componentSizes, defaultOpen = false, gRNAs = [], overhangs = [0, 4], constructSize = 226 }) {
  const [open, setOpen] = useState(defaultOpen);
  // Adapter monomers as pseudo-species
  const monomers = [
    { id: "ad1_top_25",  name: "Ad1 top oligo (TAMRA, unligated)", parts: ["ad1"],            left_dyes: ["Y"], right_dyes: [], size: 25 },
    { id: "ad1_bot_29",  name: "Ad1 bot oligo (6-FAM, unligated)", parts: ["ad1", "oh1"],     left_dyes: ["B"], right_dyes: [], size: 29 },
    { id: "ad2_bot_25",  name: "Ad2 bot oligo (HEX, unligated)",   parts: ["ad2"],            left_dyes: [],     right_dyes: ["G"], size: 25 },
    { id: "ad2_top_29",  name: "Ad2 top oligo (ROX, unligated)",   parts: ["oh2", "ad2"],     left_dyes: [],     right_dyes: ["R"], size: 29 },
  ];
  const sizes = componentSizes || (() => {
    const m = {}; for (const c of CONSTRUCT.components) m[c.key] = c.size; return m;
  })();
  const productSizeOf = entry => entry.size || (entry.parts || []).reduce((t, k) => t + (sizes[k] || 0), 0);
  // Build cut entries when a gRNA is supplied. Dedup so each unique
  // (reactant, fragment, overhang) appears once with all dyes that carry it.
  const cutRows = useMemo(() => {
    if (!gRNAs.length) return [];
    const out = [];
    const seen = new Map();
    let counter = 0;
    for (const g of gRNAs) {
      for (const oh of overhangs) {
        for (const reactant of TARGET_REACTANTS) {
          const products = predictCutFromReactant(g, reactant, oh);
          if (!products) continue;
          for (const dye of Object.keys(products)) {
            const p = products[dye];
            const key = `${reactant.id}:${p.fragment}:${oh}`;
            if (seen.has(key)) {
              seen.get(key).dyes.push(dye);
              seen.get(key).products.push({ dye, ...p });
              continue;
            }
            counter++;
            const row = {
              displayId: `C${counter}`,
              reactant, fragment: p.fragment, overhang_nt: oh,
              dyes: [dye], products: [{ dye, ...p }],
              cut_bp: g.cut_construct,
              gname: g.name || `cand-${g.id}`,
              key,
            };
            seen.set(key, row);
            out.push(row);
          }
        }
      }
    }
    return out;
  }, [gRNAs, overhangs]);
  return (
    <Panel
      title="Molecular species legend"
      subtitle="Every species the assay can produce, color-keyed to the construct components. Hover any thumbnail for component sizes; dye dots are color-keyed (B blue, Y gold, G green, R red)."
      className="mb-3"
      actions={
        <ToolButton variant="ghost" onClick={() => setOpen(o => !o)} icon={open ? Layers : Layers}>
          {open ? "Hide" : "Show"}
        </ToolButton>
      }
    >
      {open && (
        <div className="space-y-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">Component color key</div>
            <div className="flex flex-wrap gap-2 text-xs">
              {CONSTRUCT.components.map(c => (
                <span key={c.key} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-zinc-200 bg-white">
                  <span className="inline-block w-3 h-3 rounded" style={{ background: c.color }} />
                  <span className="text-zinc-700">{c.name}</span>
                  <span className="font-mono text-zinc-500">· {c.size} bp</span>
                </span>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">Assembly + partial-ligation species</div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-1.5">
              {ASSEMBLY_PRODUCTS.map(p => {
                const props = speciesSchematicProps(p);
                return (
                  <div key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded border border-zinc-100 bg-zinc-50/60">
                    <SpeciesSchematic {...props} width={180} height={26} />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-zinc-800 truncate">{p.name}</div>
                      <div className="text-[10px] text-zinc-500 font-mono">{productSizeOf(p)} bp · dyes: {(p.dyes || []).join(" ") || "—"}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">Adapter monomers (pre-ligation)</div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-1.5">
              {monomers.map(p => {
                const props = speciesSchematicProps(p);
                return (
                  <div key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded border border-zinc-100 bg-zinc-50/60">
                    <SpeciesSchematic {...props} width={180} height={26} />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-zinc-800 truncate">{p.name}</div>
                      <div className="text-[10px] text-zinc-500 font-mono">{p.size} nt</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {cutRows.length > 0 ? (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
                Cas9 cut products ({cutRows.length})
                <span className="ml-2 normal-case font-normal text-zinc-400">— dynamic, depend on selected gRNA + chemistry</span>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-1.5">
                {cutRows.map(row => {
                  const sprops = speciesSchematicProps(row.reactant);
                  // Filter the dye dots to only the ones this fragment side carries
                  const onLeft = row.fragment === "LEFT";
                  const filteredLeft  = onLeft  ? sprops.leftDyes.filter(d => row.dyes.includes(d))  : [];
                  const filteredRight = !onLeft ? sprops.rightDyes.filter(d => row.dyes.includes(d)) : [];
                  return (
                    <div key={row.key} className="flex items-center gap-2 px-2 py-1.5 rounded border border-sky-100 bg-sky-50/40">
                      <span className="inline-flex items-center justify-center min-w-[26px] px-1 py-0.5 rounded bg-sky-600 text-white font-mono font-bold text-[10px]">
                        {row.displayId}
                      </span>
                      <SpeciesSchematic
                        parts={sprops.parts}
                        leftDyes={filteredLeft}
                        rightDyes={filteredRight}
                        showCut={{ bp: row.cut_bp }}
                        cutFragment={row.fragment}
                        width={180} height={26}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-zinc-800 truncate">
                          {row.gname} {row.fragment} cut from {row.reactant.name.split(" (")[0]}
                        </div>
                        <div className="text-[10px] text-zinc-500 font-mono">
                          {row.products[0].length}
                          {row.products.length > 1 && row.products.some(p => p.length !== row.products[0].length)
                            ? ` / ${row.products.filter(p => p.length !== row.products[0].length).map(p => `${p.length}(${p.dye})`).join(",")}`
                            : ""} nt · dyes {row.dyes.join(" ")} · {row.overhang_nt === 0 ? "blunt" : (row.overhang_nt > 0 ? `+${row.overhang_nt}nt 5'OH` : `${row.overhang_nt}nt 3'OH`)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-zinc-500 leading-snug border-t border-zinc-100 pt-2">
              Cas9 <strong>cut products</strong> are dynamic (they depend on the chosen gRNA and chemistry). Toggle <strong>Expected species</strong> in the plot controls and pick a gRNA to see them here.
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

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

// ----------------------------------------------------------------------
// SpeciesSidebar — right-rail legend listing every species the active
// plot could show (assembly + monomer + cut), with per-species visibility
// toggles. Each row shows: checkbox, schematic thumbnail, size, name,
// dye chips, and a line sample matching the on-plot annotation (lane
// dye color + kind dash pattern). Dye is color-keyed; kind is pattern-
// keyed via SPECIES_DASH. The hostingPlot can be:
//   "trace"    -> shows species on every dye lane in TraceTab
//   "compare"  -> shows species on the single selected dye in CompareTab
// ----------------------------------------------------------------------
export function SpeciesSidebar({
  componentSizes, constructSize, gRNAs, overhangs,
  dyes,                      // dye letters this plot covers (e.g. ["B","G","Y","R"] or ["R"])
  hiddenIds, onToggleId,     // Set of species ids to HIDE; toggling adds/removes
  onShowAll, onHideAll,
  title = "Species legend",
  subtitle = "Tick to overlay; untick to hide. Color = lane dye; pattern = kind (assembly = short dash, monomer = dotted, cut = long dash).",
}) {
  const groups = useMemo(() => {
    const all = enumerateAllSpeciesWithIds({ componentSizes, constructSize, gRNAs, overhangs, dyes });
    const seen = new Set();
    const assembly = [], monomer = [], cuts = [];
    for (const sp of all) {
      const id = speciesId(sp, sp.dye);
      if (seen.has(id)) continue;
      seen.add(id);
      const row = { ...sp, id };  // sp already has dye, lineColor, displayId
      row.dyeColor = sp.lineColor;
      if (sp.kind === "assembly") assembly.push(row);
      else if (sp.kind === "monomer") monomer.push(row);
      else if (sp.kind === "cut") cuts.push(row);
    }
    return { assembly, monomer, cuts };
  }, [dyes, componentSizes, constructSize, gRNAs, overhangs]);

  const total = groups.assembly.length + groups.monomer.length + groups.cuts.length;
  const hiddenCount = (() => {
    let n = 0;
    [...groups.assembly, ...groups.monomer, ...groups.cuts].forEach(r => { if (hiddenIds.has(r.id)) n++; });
    return n;
  })();

  const renderRow = (row) => {
    const visible = !hiddenIds.has(row.id);
    // Build schematic from the species kind + (for cuts) source reactant
    let sprops = { parts: [], leftDyes: [], rightDyes: [] };
    let cutMark = null;
    let cutFrag = null;
    if (row.kind === "cut" && row.source_reactant) {
      const reactant = TARGET_REACTANTS.find(r => r.id === row.source_reactant);
      if (reactant) {
        // For a cut species the schematic shows the parent reactant with the
        // discarded fragment side dimmed and only the kept terminus's dye dot
        // visible. fragment ("LEFT"/"RIGHT") + grna_cut_bp tell us which side.
        sprops = speciesSchematicProps(reactant);
        // Filter dyes to only the one this species carries (the other terminal
        // dye on the same fragment side may belong to a different species row).
        if (row.fragment === "LEFT") {
          sprops = { ...sprops, leftDyes: sprops.leftDyes.filter(d => d === row.dye), rightDyes: [] };
        } else if (row.fragment === "RIGHT") {
          sprops = { ...sprops, leftDyes: [], rightDyes: sprops.rightDyes.filter(d => d === row.dye) };
        }
        cutMark = row.grna_cut_bp ? { bp: row.grna_cut_bp } : null;
        cutFrag = row.fragment || null;
      }
    } else if (row.kind === "assembly") {
      const a = ASSEMBLY_PRODUCTS.find(ap => ap.dyes.includes(row.dye) && Math.abs(productSize(ap, componentSizes) - row.size) < 1);
      if (a) {
        sprops = speciesSchematicProps(a);
        // Restrict to the lane's dye on the relevant terminus
        if (sprops.leftDyes.includes(row.dye)) sprops = { ...sprops, leftDyes: [row.dye], rightDyes: sprops.rightDyes.filter(d => false) };
        else if (sprops.rightDyes.includes(row.dye)) sprops = { ...sprops, leftDyes: [], rightDyes: [row.dye] };
      }
    } else if (row.kind === "monomer") {
      if (row.dye === "Y" && row.size === 25) sprops = { parts: ["ad1"], leftDyes: ["Y"], rightDyes: [] };
      else if (row.dye === "B" && row.size === 29) sprops = { parts: ["ad1","oh1"], leftDyes: ["B"], rightDyes: [] };
      else if (row.dye === "G" && row.size === 25) sprops = { parts: ["ad2"], leftDyes: [], rightDyes: ["G"] };
      else if (row.dye === "R" && row.size === 29) sprops = { parts: ["oh2","ad2"], leftDyes: [], rightDyes: ["R"] };
    }
    return (
      <li key={row.id} className={`flex items-start gap-2 px-2 py-1.5 rounded transition ${visible ? "bg-white" : "bg-zinc-50 opacity-60"} hover:bg-zinc-100`}>
        <input
          type="checkbox" checked={visible}
          onChange={() => onToggleId(row.id)}
          className="mt-1 w-3.5 h-3.5 accent-zinc-700 cursor-pointer"
          aria-label={`Toggle ${row.label}`}
        />
        <div className="shrink-0 mt-0.5">
          <SpeciesSchematic
            parts={sprops.parts} leftDyes={sprops.leftDyes} rightDyes={sprops.rightDyes}
            width={120} height={22}
            showCut={cutMark} cutFragment={cutFrag}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[11px]">
            {row.displayId && (
              <span className="inline-flex items-center justify-center min-w-[22px] px-1 py-0.5 rounded font-mono font-bold text-[10px] text-white"
                    style={{ background: row.dyeColor }}>
                {row.displayId}
              </span>
            )}
            <span className="font-mono text-zinc-800">{row.size} bp</span>
            <DyeChip dye={row.dye} />
          </div>
          <div className="text-[10px] text-zinc-600 leading-tight" title={row.fullLabel || row.label}>
            {row.label}
          </div>
        </div>
        <svg width="22" height="14" aria-hidden className="shrink-0 mt-1">
          <line x1="0" y1="7" x2="22" y2="7" stroke={row.dyeColor} strokeWidth="1.6" strokeDasharray={SPECIES_DASH[row.kind] || "1 2"} />
        </svg>
      </li>
    );
  };

  return (
    <Panel
      title={title}
      subtitle={subtitle}
      className="lg:sticky lg:top-2 self-start"
      actions={
        <>
          <ToolButton variant="ghost" onClick={onShowAll} title="Show every species">
            Show all
          </ToolButton>
          <ToolButton variant="ghost" onClick={onHideAll} title="Hide every species">
            Hide all
          </ToolButton>
        </>
      }
    >
      <div className="text-[10px] text-zinc-500 mb-2 font-mono">
        {total - hiddenCount}/{total} visible
      </div>
      {groups.assembly.length > 0 && (
        <details open className="mb-2">
          <summary className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1 cursor-pointer">
            Assembly + partial ligation ({groups.assembly.length})
          </summary>
          <ul className="flex flex-col gap-0.5">{groups.assembly.map(renderRow)}</ul>
        </details>
      )}
      {groups.monomer.length > 0 && (
        <details open className="mb-2">
          <summary className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1 cursor-pointer">
            Adapter monomers ({groups.monomer.length})
          </summary>
          <ul className="flex flex-col gap-0.5">{groups.monomer.map(renderRow)}</ul>
        </details>
      )}
      {groups.cuts.length > 0 && (
        <details open className="mb-1">
          <summary className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1 cursor-pointer">
            Cas9 cut products ({groups.cuts.length})
          </summary>
          <ul className="flex flex-col gap-0.5">{groups.cuts.map(renderRow)}</ul>
        </details>
      )}
      {total === 0 && (
        <div className="text-xs text-zinc-500">No expected species for the current dye(s) and gRNA selection.</div>
      )}
    </Panel>
  );
}

export function componentSizesFrom(construct) {
  const map = {};
  for (const c of construct.components) map[c.key] = c.size;
  return map;
}

// ======================================================================
// HELPERS
// ======================================================================

export const fmtBp  = v => (v === null || v === undefined || isNaN(v)) ? "—" : v.toFixed(2);
export const fmtInt = v => (v === null || v === undefined || isNaN(v)) ? "—" : Math.round(v).toLocaleString();

// Find the tallest peak for a sample/dye within a size window.
export function dominantPeak(peaks, sample, dye, lo = 50, hi = 500) {
  const arr = peaks[sample]?.[dye] || [];
  let best = null;
  for (const p of arr) {
    const [size, height] = p;
    if (size >= lo && size <= hi && (!best || height > best[1])) best = p;
  }
  return best ? { size: best[0], height: best[1], area: best[2], width: best[3] } : null;
}

// Classify a peak relative to target and expected positions.
export function classifyPeak(size, target, expectedMap, tol) {
  for (const dye of SAMPLE_DYES) {
    if (Math.abs(size - expectedMap[dye]) <= tol) return { kind: "target", dye };
  }
  if (size < 50) return { kind: "small", dye: null };                 // primer/adapter dimer region
  if (target && size > target + 50) return { kind: "daisy", dye: null }; // daisy-chain or concatemer
  return { kind: "other", dye: null };
}

// Compute per-sample auto defaults: target = median of dominant B/G/Y/R peaks;
// expected_dye = dominant peak position within window of target.
export function computeAutoDefaults(peaks) {
  const cfg = {};
  for (const sample of Object.keys(peaks)) {
    const doms = {};
    for (const d of SAMPLE_DYES) doms[d] = dominantPeak(peaks, sample, d);

    // Target: use the minimum size among dominants (shorter strand = reference)
    const sizes = SAMPLE_DYES.map(d => doms[d]?.size).filter(v => v !== undefined);
    let target = sizes.length ? [...sizes].sort((a,b) => a-b)[0] : 200;

    const expected = {};
    for (const d of SAMPLE_DYES) {
      if (doms[d] && Math.abs(doms[d].size - target) < 15) {
        expected[d] = +doms[d].size.toFixed(2);
      } else {
        expected[d] = +target.toFixed(2);
      }
    }
    cfg[sample] = {
      target: +target.toFixed(2),
      expected,
      tolerance: 2.0,
      chemistry: "custom",
    };
  }
  return cfg;
}

// Peak ID: for each sample/dye, find nearest observed peak to expected within tol.
export function identifyPeaks(peaks, cfg) {
  const results = {};
  for (const sample of Object.keys(cfg)) {
    const sres = {};
    const s = cfg[sample];
    for (const d of SAMPLE_DYES) {
      const target = s.expected[d];
      const arr = peaks[sample]?.[d] || [];
      let best = null;
      for (const [size, height, area, width] of arr) {
        const delta = size - target;
        if (Math.abs(delta) <= s.tolerance) {
          if (!best || Math.abs(delta) < Math.abs(best.delta)) {
            best = { size, height, area, width, delta };
          }
        }
      }
      // Total channel area (for purity metric)
      let totalArea = 0;
      for (const [, , area] of arr) totalArea += area;
      sres[d] = {
        expected: target,
        match: best,
        purity: best && totalArea > 0 ? best.area / totalArea : null,
        totalArea,
      };
    }
    results[sample] = sres;
  }
  return results;
}

// buildGaussianPath + formatTick + computeLinearTicks live in lib/chromatogram.js.
// Re-exported from this module so existing consumers work unchanged.
import { buildGaussianPath, formatTick, computeLinearTicks } from "./lib/chromatogram.js";
export { buildGaussianPath, formatTick, computeLinearTicks };

// ======================================================================
// MAIN COMPONENT
// ======================================================================
// localStorage key for the calibration sidecar. Persists per-dye offsets across
// page reloads. The viewer also exposes Download/Upload JSON in AutoClassifyTab
// so calibration data can be shared across machines or committed to the repo.
const DYE_OFFSETS_LS_KEY = "fragment-viewer:dye-offsets";

function loadDyeOffsetsFromStorage() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const raw = window.localStorage.getItem(DYE_OFFSETS_LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const ok = ["B", "G", "Y", "R"].every(k => typeof parsed[k] === "number");
    return ok ? parsed : null;
  } catch { return null; }
}

export default function FragmentViewer() {
  // Bumped on drag-drop ingest; used as a key on the outer div to remount the tree
  // and force every useState/useMemo in the subtree to re-initialize from the new
  // (mutated) DATA.peaks. Avoids prop-drilling peaks into all 5 tab components.
  const [dataKey, setDataKey] = useState(0);
  const handleNewPeaks = (newPeaks, newTraces) => {
    DATA.peaks = newPeaks;
    if (newTraces && typeof newTraces === "object") DATA.traces = newTraces;
    setDataKey(k => k + 1);
  };

  // On first mount, fetch the seeded demo .fsa files from /demo and parse
  // them with the SAME browser-side parseFsaArrayBuffer that drag-drop uses.
  // This guarantees the seeded view matches what users see when they upload
  // their own .fsa — no Python heuristics divergence, no "preprocessed
  // strangely" surprises. Raw traces are preserved so the raw-signal toggle
  // works out of the box on the seeded samples.
  const [demoLoaded, setDemoLoaded] = useState(false);
  useEffect(() => {
    if (demoLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        // Vite's BASE_URL resolves to the Pages subpath (/fragment-viewer/)
        // in production, "/" in dev. Either way it points at /demo/*.fsa.
        const base = (import.meta?.env?.BASE_URL) || "/";
        const files = [
          { name: "V059_4-5.fsa", url: `${base}demo/V059_4-5.fsa` },
          { name: "gRNA3_1-1.fsa", url: `${base}demo/gRNA3_1-1.fsa` },
        ];
        const merged = {};
        const mergedTraces = {};
        for (const f of files) {
          const res = await fetch(f.url);
          if (!res.ok) continue;
          const buf = await res.arrayBuffer();
          const { sampleName, peaks, calibrated, traces, bpAxis } = parseFsaArrayBuffer(buf, f.name);
          if (!calibrated) continue;
          merged[sampleName] = peaks;
          mergedTraces[sampleName] = { ...traces, bpAxis };
        }
        if (!cancelled && Object.keys(merged).length > 0) {
          handleNewPeaks(merged, mergedTraces);
        }
      } catch { /* silently keep the fallback seeded literal */ }
      if (!cancelled) setDemoLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const samples = useMemo(() => Object.keys(DATA.peaks).sort(), [dataKey]);
  const [tab, setTab] = useState("trace");   // "trace" | "peakid" | "cutpred" | "autoclass" | "compare" | "heatmap"

  // Persistent per-sample config
  const [cfg, setCfg] = useState(() => computeAutoDefaults(DATA.peaks));

  // Editable construct component sizes (from the SnapGene file; user can adjust)
  const [componentSizes, setComponentSizes] = useState(() => componentSizesFrom(CONSTRUCT));
  const setCSize = (k, v) => setComponentSizes(s => ({ ...s, [k]: Math.max(0, v) }));

  // Per-dye mobility offset (bp). Subtracted from observed sizes during classification.
  // Calibrated from a blunt-control ligation; for ABI 3500/3730 with POP-7,
  // typical 6-FAM < HEX < TAMRA < ROX ordering. Defaults to 0 until user calibrates.
  // Persists to localStorage so calibration survives page reload.
  const [dyeOffsets, setDyeOffsets] = useState(
    () => loadDyeOffsetsFromStorage() || { B: 0, G: 0, Y: 0, R: 0 }
  );
  useEffect(() => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(DYE_OFFSETS_LS_KEY, JSON.stringify(dyeOffsets));
      }
    } catch { /* localStorage unavailable; non-fatal */ }
  }, [dyeOffsets]);
  const setDyeOffset = (dye, v) => setDyeOffsets(s => ({ ...s, [dye]: Number(v) || 0 }));

  // User-editable construct sequence (defaults to V059 from SnapGene).
  // Target range is also editable for generalization to other constructs.
  const [constructSeq, setConstructSeq] = useState(CONSTRUCT.seq);
  const [targetStart, setTargetStart] = useState(CONSTRUCT.targetRange.start);
  const [targetEnd, setTargetEnd] = useState(CONSTRUCT.targetRange.end);
  const constructSize = constructSeq.length;

  // Issue #4 fix: dataKey must be in deps so drag-drop ingest triggers a
  // re-computation. Previously missing, which let stale results persist
  // after `handleNewPeaks` mutated DATA.peaks.
  const results = useMemo(() => identifyPeaks(DATA.peaks, cfg), [cfg, dataKey]);

  // Total observed peaks across the loaded dataset; surfaced in the status bar.
  const totalPeaks = useMemo(() => {
    let n = 0;
    for (const s of Object.keys(DATA.peaks)) {
      const dyes = DATA.peaks[s] || {};
      for (const d of Object.keys(dyes)) n += (dyes[d] || []).length;
    }
    return n;
  }, [dataKey]);

  // Whether any per-dye offset has been calibrated away from zero.
  const calibrated = ["B", "G", "Y", "R"].some(k => Math.abs(dyeOffsets[k] || 0) > 1e-6);

  const [reportOpen, setReportOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [dnaOpen, setDnaOpen] = useState(false);
  // Brief toast surfaced by Toolbar actions (link copied, CSV downloaded).
  const [toast, setToast] = useState(null);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(id);
  }, [toast]);

  const handleDownloadCsv = () => {
    const csv = buildPeakTableCSV(DATA.peaks);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    downloadBlob(blob, `peak_table_${new Date().toISOString().slice(0, 10)}.csv`);
    setToast({ kind: "ok", text: `Downloaded peak_table_${new Date().toISOString().slice(0, 10)}.csv` });
  };
  const handleCopyLink = async () => {
    try {
      // Read the current hash that TraceTab maintains and build a full URL.
      const hash = window.location.hash || "";
      const url = window.location.origin + window.location.pathname + hash;
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        // Fallback for older browsers / non-secure contexts.
        const ta = document.createElement("textarea");
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setToast({ kind: "ok", text: hash ? "View URL copied to clipboard" : "URL copied (no view state yet — interact with the trace first)" });
    } catch (err) {
      setToast({ kind: "err", text: `Copy failed: ${err.message}` });
    }
  };

  // Active color palette; persisted across sessions so users with color
  // vision differences don't have to re-select every time they open the tab.
  const [palette, setPalette] = useState(() => {
    try {
      if (typeof window === "undefined" || !window.localStorage) return "default";
      return window.localStorage.getItem("fragment-viewer:palette") || "default";
    } catch { return "default"; }
  });
  useEffect(() => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem("fragment-viewer:palette", palette);
      }
    } catch { /* non-fatal */ }
  }, [palette]);

  // Global keyboard navigation. ←/→ step through samples, [/] adjust
  // smoothing, 1-4 toggle dye channels, Esc closes modals. Tabs listen via
  // a window-level custom event so state lives where it belongs (per-tab)
  // without us having to lift it all the way to FragmentViewer.
  useEffect(() => {
    const onKey = (e) => {
      // Ignore when typing in text input / select / textarea.
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key === "Escape") {
        if (reportOpen) { setReportOpen(false); e.preventDefault(); return; }
        if (helpOpen)   { setHelpOpen(false);   e.preventDefault(); return; }
      }
      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        setHelpOpen(v => !v);
        e.preventDefault();
        return;
      }
      // Defer to per-tab listeners by dispatching a custom event.
      window.dispatchEvent(new CustomEvent("fv:key", { detail: { key: e.key, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey } }));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reportOpen, helpOpen]);

  return (
    <div key={dataKey} className="h-screen flex flex-col bg-zinc-50 text-zinc-900 font-sans antialiased">
      <PrintStyles />
      <DropOverlay onData={handleNewPeaks} />
      <Toolbar
        sampleCount={samples.length}
        onUpload={handleNewPeaks}
        onResetCalibration={() => setDyeOffsets({ B: 0, G: 0, Y: 0, R: 0 })}
        onOpenReport={() => setReportOpen(true)}
        onOpenDnaDiagrams={() => setDnaOpen(true)}
        palette={palette}
        setPalette={setPalette}
        onDownloadCsv={handleDownloadCsv}
        onCopyLink={handleCopyLink}
        onOpenHelp={() => setHelpOpen(true)}
      />
      <DNADiagramsModal
        open={dnaOpen}
        onClose={() => setDnaOpen(false)}
        componentSizes={componentSizes}
        constructSeq={constructSeq}
        targetStart={targetStart}
        targetEnd={targetEnd}
      />
      {toast && (
        <div className={`fixed bottom-10 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-lg text-xs shadow-xl no-print ${toast.kind === "ok" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"}`}>
          {toast.kind === "ok" ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
          <span>{toast.text}</span>
        </div>
      )}
      <KeyboardHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <ReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        samples={samples}
        peaksBySample={DATA.peaks}
        dyeOffsets={dyeOffsets}
        componentSizes={componentSizes}
        constructSize={constructSize}
        targetStart={targetStart}
        targetEnd={targetEnd}
        constructSeq={constructSeq}
        palette={palette}
      />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar tab={tab} setTab={setTab} />
        <main className="flex-1 overflow-auto bg-zinc-50">
          <div className="px-6 py-5 max-w-[1400px] mx-auto">
            {tab === "trace"   && <TraceTab   samples={samples} cfg={cfg} setCfg={setCfg} results={results} componentSizes={componentSizes} setCSize={setCSize} constructSeq={constructSeq} targetStart={targetStart} targetEnd={targetEnd} palette={palette} />}
            {tab === "peakid"  && <PeakIdTab  samples={samples} cfg={cfg} setCfg={setCfg} results={results} componentSizes={componentSizes} setCSize={setCSize} />}
            {tab === "cutpred" && <CutPredictionTab samples={samples} cfg={cfg} setCfg={setCfg} results={results} />}
            {tab === "autoclass" && <AutoClassifyTab samples={samples} componentSizes={componentSizes} dyeOffsets={dyeOffsets} setDyeOffsets={setDyeOffsets} setDyeOffset={setDyeOffset} constructSeq={constructSeq} setConstructSeq={setConstructSeq} targetStart={targetStart} setTargetStart={setTargetStart} targetEnd={targetEnd} setTargetEnd={setTargetEnd} />}
            {tab === "compare" && <CompareTab samples={samples} cfg={cfg} results={results} componentSizes={componentSizes} constructSeq={constructSeq} targetStart={targetStart} targetEnd={targetEnd} />}
            {tab === "heatmap" && <HeatmapTab samples={samples} componentSizes={componentSizes} constructSeq={constructSeq} targetStart={targetStart} targetEnd={targetEnd} palette={palette} />}
          </div>
        </main>
      </div>
      <StatusBar
        sampleCount={samples.length}
        peakCount={totalPeaks}
        calibrated={calibrated}
        construct={`V059 (${constructSize} bp)`}
      />
    </div>
  );
}

// ----------------------------------------------------------------------
// Report builder — one-click summary of the current dataset.
// Renders a printable panel with sample metadata, per-sample peak summary,
// dye-offset snapshot, and preprocessing configuration. Two deliverables:
// (a) "Print / Save as PDF" triggers the browser's Save-as-PDF dialog with
//     body-class-scoped CSS that hides everything except the report; and
// (b) "Download Markdown" writes a report.md compatible with the lab's
//     pandoc+xelatex+DejaVu Sans PDF recipe.
// ----------------------------------------------------------------------
function topNpeaksPerDye(peaks, n = 3) {
  const out = {};
  for (const d of ["B", "G", "Y", "R"]) {
    const arr = (peaks?.[d] || []).slice().sort((a, b) => b[1] - a[1]).slice(0, n);
    out[d] = arr.map(p => ({ size: p[0], height: p[1] }));
  }
  return out;
}

function sumHeight(peaks) {
  let t = 0;
  for (const d of ["B", "G", "Y", "R"]) {
    for (const p of (peaks?.[d] || [])) t += p[1];
  }
  return t;
}

export function buildReportMarkdown({
  samples, peaksBySample, dyeOffsets, componentSizes,
  constructSize, targetStart, targetEnd, generatedAt,
  expectedSpecies = null, pickedGrna = null,
}) {
  const lines = [];
  const dateStr = (generatedAt || new Date()).toISOString().slice(0, 10);
  lines.push(`# Fragment Viewer report`);
  lines.push("");
  lines.push(`- **Date:** ${dateStr}`);
  lines.push(`- **Samples:** ${samples.length}`);
  lines.push(`- **Construct size:** ${constructSize} bp (target window ${targetStart}–${targetEnd})`);
  lines.push(`- **Dye offsets (bp):** B=${dyeOffsets.B.toFixed(3)} · G=${dyeOffsets.G.toFixed(3)} · Y=${dyeOffsets.Y.toFixed(3)} · R=${dyeOffsets.R.toFixed(3)}`);
  if (pickedGrna) {
    lines.push(`- **Cutting Cas9 (picked):** ${pickedGrna.name} — ${pickedGrna.strand} strand · PAM at position ${pickedGrna.pam_start}–${pickedGrna.pam_start + 2} · cut @ construct ${pickedGrna.cut_construct}`);
  }
  lines.push("");
  if (expectedSpecies && expectedSpecies.length > 0) {
    lines.push(`## Expected species`);
    lines.push("");
    lines.push("| ID | Kind | Name | Size (bp) | Dyes |");
    lines.push("|---|---|---|---:|---|");
    for (const sp of expectedSpecies) {
      lines.push(`| ${sp.id} | ${sp.kind} | ${sp.name} | ${Number(sp.size).toFixed(1)} | ${(sp.dyes || []).join("·") || "—"} |`);
    }
    lines.push("");
  }
  lines.push(`## Sample summary`);
  lines.push("");
  lines.push(`| Sample | Total peaks | ΣHeight | Top B | Top G | Top Y | Top R |`);
  lines.push(`|---|---:|---:|---|---|---|---|`);
  for (const s of samples) {
    const p = peaksBySample[s] || {};
    const nPeaks = ["B", "G", "Y", "R", "O"].reduce((t, d) => t + (p[d]?.length || 0), 0);
    const total = sumHeight(p);
    const top = topNpeaksPerDye(p, 1);
    const fmt = (arr) => (arr.length ? `${arr[0].size.toFixed(2)} (h=${arr[0].height.toFixed(0)})` : "—");
    lines.push(`| ${s} | ${nPeaks} | ${total.toFixed(0)} | ${fmt(top.B)} | ${fmt(top.G)} | ${fmt(top.Y)} | ${fmt(top.R)} |`);
  }
  lines.push("");
  lines.push(`## Construct components (bp)`);
  lines.push("");
  lines.push("| Component | Size |");
  lines.push("|---|---:|");
  for (const k of Object.keys(componentSizes || {})) {
    lines.push(`| ${k} | ${componentSizes[k]} |`);
  }
  lines.push("");
  lines.push(`---`);
  lines.push(``);
  lines.push(`*Generated by Fragment Viewer. Build PDF with:*`);
  lines.push("```bash");
  lines.push(`pandoc report.md -o report.pdf --toc --number-sections \\`);
  lines.push(`  --pdf-engine=xelatex \\`);
  lines.push(`  -V mainfont='DejaVu Sans' -V monofont='DejaVu Sans Mono'`);
  lines.push("```");
  return lines.join("\n");
}

// DNA-diagrams modal: renders both the ConstructDiagram (annotated architecture
// ± cut site) and the ProductFragmentViz (ssDNA cut products) in a single
// preview pane, plus a bundle-export row that downloads both diagrams at
// once (combined SVG, combined PNG, or individual files per format).
