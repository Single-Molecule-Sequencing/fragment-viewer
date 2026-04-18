// src/components/modals.jsx
// Issue #13 Phase C.8: DNA-diagrams modal + one-click report modal.
//
//   - DNADiagramsModal — preview pane with ConstructDiagram +
//                        ProductFragmentViz + bundle-export row.
//   - ReportModal      — printable dataset summary. Mounted to document.body
//                        via createPortal so body.fv-report-printing
//                        print CSS can hide everything else.

import { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { FileDown } from "lucide-react";
import { Panel, Pill, Stat, ToolButton, DyeChip } from "./primitives.jsx";
import { ExportMenu } from "./export_menu.jsx";
import { PostTailingPanel } from "./editors.jsx";
import {
  ConstructDiagram, ProductFragmentViz,
} from "./diagrams.jsx";
import { StackedChromatogram } from "./chromatograms.jsx";
import {
  DYE, CONSTRUCT, ASSEMBLY_PRODUCTS, resolveDyeColor,
} from "../lib/constants.js";
import { LAB_GRNA_CATALOG, normalizeSpacer } from "../lib/grna_catalog.js";
import {
  findGrnas, predictCutProducts, reverseComplement, productSize,
} from "../lib/biology.js";
import {
  downloadBlob, exportSvgNative, exportSvgAsPng, exportSvgAsJpg, exportSvgAsWebp,
  buildCombinedSvg, mergeRefs,
} from "../lib/export.js";
import { buildPeakTableCSV } from "../lib/viewstate.js";
import {
  topNpeaksPerDye, sumHeight,
} from "../lib/report.js";
// Still in monolith (pending future extraction).
import {
  buildReportMarkdown, SpeciesLegend,
  expectedSpeciesForDye, SPECIES_DASH,
  enumerateAllSpeciesWithIds,
} from "../FragmentViewer.jsx";

export function DNADiagramsModal({
  open, onClose,
  componentSizes, constructSeq, targetStart, targetEnd,
}) {
  const constructRef = useRef(null);
  const productsRef  = useRef(null);
  const [grnaIdx, setGrnaIdx] = useState(0);
  const [overhang, setOverhang] = useState(0);
  const [includeCut, setIncludeCut] = useState(true);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Resolve the picked gRNA from the lab catalog, matching against the
  // user's construct window. Same logic as HeatmapTab's pickedCutGrna.
  const pickedGrna = useMemo(() => {
    if (!includeCut) return null;
    const entry = LAB_GRNA_CATALOG[grnaIdx];
    if (!entry) return null;
    const norm = normalizeSpacer(entry.spacer);
    if (norm.length !== 20) return null;
    const rc = reverseComplement(norm);
    const candidates = findGrnas(constructSeq, targetStart, targetEnd);
    const cand = candidates.find(g => g.protospacer === norm || g.protospacer === rc);
    return cand ? { ...cand, name: entry.name } : null;
  }, [includeCut, grnaIdx, constructSeq, targetStart, targetEnd]);

  const constructSize = (constructSeq || "").length || 226;
  const predictedProducts = useMemo(() => {
    if (!pickedGrna) return null;
    return predictCutProducts(pickedGrna, constructSize, overhang);
  }, [pickedGrna, constructSize, overhang]);

  const bundle = (kind, scale = 4) => {
    const svgs = [];
    if (constructRef.current) svgs.push(constructRef.current);
    if (productsRef.current)  svgs.push(productsRef.current);
    if (svgs.length === 0) return;
    const combined = buildCombinedSvg(svgs, { gap: 32, title: "Fragment Viewer DNA diagrams" });
    // The combined SVG isn't in the document — exportSvgNative / rasterize
    // both work on detached elements because they serialize via
    // XMLSerializer rather than reading live computed styles.
    const base = pickedGrna
      ? `dna_diagrams_${pickedGrna.name}_oh${overhang}`
      : "dna_diagrams_uncut";
    switch (kind) {
      case "svg":  exportSvgNative(combined, `${base}.svg`); break;
      case "png":  exportSvgAsPng(combined, `${base}@${scale}x.png`, scale); break;
      case "png_alpha":
        exportSvgAsPng(combined, `${base}@${scale}x_alpha.png`, scale, { transparent: true });
        break;
      case "jpg":  exportSvgAsJpg(combined, `${base}@${scale}x_q92.jpg`, scale, 0.92); break;
      case "webp": exportSvgAsWebp(combined, `${base}@${scale}x_q92.webp`, scale, 0.92); break;
      default: break;
    }
  };
  const individualBoth = (fmt) => {
    const suffix = pickedGrna ? `_${pickedGrna.name}_oh${overhang}` : "_uncut";
    const doOne = (ref, name) => {
      if (!ref.current) return;
      if (fmt === "svg")  exportSvgNative(ref.current, `${name}${suffix}.svg`);
      if (fmt === "png")  exportSvgAsPng(ref.current, `${name}${suffix}@4x.png`, 4);
      if (fmt === "webp") exportSvgAsWebp(ref.current, `${name}${suffix}@4x_q92.webp`, 4, 0.92);
    };
    doOne(constructRef, "construct_diagram");
    doOne(productsRef,  "ssdna_products");
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-6 pb-6 px-4 overflow-auto no-print">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-6xl bg-white rounded-xl border border-zinc-200 shadow-2xl">
        <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-zinc-200">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">DNA diagrams</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Full-construct architecture (with / without cut) plus Cas9 ssDNA cut-product products. Professional SVG layout with no overlapping text; scales to any resolution.
            </p>
          </div>
          <ToolButton variant="ghost" onClick={onClose}>Close</ToolButton>
        </header>

        {/* Diagram configuration */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 border-b border-zinc-100 bg-zinc-50 text-xs">
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={includeCut} onChange={e => setIncludeCut(e.target.checked)}
                   className="w-3.5 h-3.5 accent-zinc-700" />
            <span className="font-medium text-zinc-700">Include Cas9 cut site</span>
          </label>
          {includeCut && (
            <>
              <label className="flex items-center gap-1.5">
                <span className="text-zinc-600">gRNA:</span>
                <select value={grnaIdx} onChange={e => setGrnaIdx(parseInt(e.target.value, 10))}
                        className="px-2 py-0.5 text-xs border border-zinc-300 rounded bg-white max-w-[24ch] focus-ring">
                  {LAB_GRNA_CATALOG
                    .map((g, i) => ({ g, i }))
                    .filter(({ g }) => normalizeSpacer(g.spacer).length === 20)
                    .map(({ g, i }) => <option key={`dd-${i}`} value={i}>{g.name}</option>)}
                </select>
                {!pickedGrna && <span className="text-amber-700 text-[11px]">gRNA not in construct target window</span>}
              </label>
              <label className="flex items-center gap-1.5">
                <span className="text-zinc-600">Overhang:</span>
                {[-4, -1, 0, 1, 4].map(oh => {
                  const on = overhang === oh;
                  return (
                    <button key={oh} onClick={() => setOverhang(oh)}
                      className={`px-1.5 py-0.5 rounded border text-[11px] font-mono ${on ? "bg-zinc-900 text-white border-zinc-900" : "bg-white text-zinc-600 border-zinc-300 hover:border-zinc-400"}`}>
                      {oh === 0 ? "blunt" : (oh > 0 ? `+${oh}` : `${oh}`)}
                    </button>
                  );
                })}
              </label>
            </>
          )}
        </div>

        {/* Preview pane — diagrams rendered at their native SVG viewBox, scaled responsively */}
        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-zinc-800">Construct architecture</h3>
              <ExportMenu svgRef={constructRef} basename="construct_diagram" label="Export" />
            </div>
            <div className="border border-zinc-200 rounded-lg bg-white p-2">
              <ConstructDiagram
                componentSizes={componentSizes}
                highlightKey={null}
                onHighlight={null}
                onSizeChange={null}
                cutConstructPos={pickedGrna && includeCut ? pickedGrna.cut_construct : null}
                overhang={pickedGrna && includeCut ? Math.abs(overhang) : null}
                grnaStrand={pickedGrna ? pickedGrna.strand : null}
                pamStart={pickedGrna ? pickedGrna.pam_start : null}
                pamSeq={pickedGrna ? pickedGrna.pam_seq : null}
                svgRef={constructRef}
              />
            </div>
          </section>
          {pickedGrna && includeCut && predictedProducts && (
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-zinc-800">ssDNA cut products</h3>
                <ExportMenu svgRef={productsRef} basename="ssdna_products" label="Export" />
              </div>
              <div className="border border-zinc-200 rounded-lg bg-white p-2">
                <ProductFragmentViz products={predictedProducts} constructSize={constructSize} svgRef={productsRef} />
              </div>
            </section>
          )}
        </div>

        {/* Bundle-export footer — single-click download of both diagrams combined */}
        <footer className="px-5 py-3 border-t border-zinc-200 bg-zinc-50 text-xs flex flex-wrap items-center gap-2">
          <span className="font-semibold text-zinc-700 mr-1">Bundle (both diagrams):</span>
          <ToolButton variant="primary" onClick={() => bundle("svg")}>Combined SVG</ToolButton>
          <ToolButton variant="primary" onClick={() => bundle("png", 4)}>Combined PNG @ 4×</ToolButton>
          <ToolButton variant="secondary" onClick={() => bundle("png", 6)}>PNG @ 6×</ToolButton>
          <ToolButton variant="secondary" onClick={() => bundle("png_alpha", 4)}>PNG transparent</ToolButton>
          <ToolButton variant="secondary" onClick={() => bundle("webp", 4)}>WebP</ToolButton>
          <ToolButton variant="secondary" onClick={() => bundle("jpg", 4)}>JPG</ToolButton>
          <span className="w-px h-4 bg-zinc-300 mx-1" />
          <span className="font-semibold text-zinc-700 mr-1">Separate files:</span>
          <ToolButton variant="secondary" onClick={() => individualBoth("svg")}>SVG ×2</ToolButton>
          <ToolButton variant="secondary" onClick={() => individualBoth("png")}>PNG ×2</ToolButton>
          <ToolButton variant="secondary" onClick={() => individualBoth("webp")}>WebP ×2</ToolButton>
        </footer>
      </div>
    </div>
  );
}

export function ReportModal({
  open, onClose, samples, peaksBySample, dyeOffsets, componentSizes,
  constructSize, targetStart, targetEnd,
  constructSeq, palette = "default",
}) {
  // Refs for every diagram SVG we render inside the modal so "Export all"
  // can reach in and download each as a separate file.
  const constructRef = useRef(null);
  const productsRef  = useRef(null);
  const chromRefs    = useRef({});

  // Resolve the picked cutting gRNA (gRNA3 by default) against the construct
  // target window. Falls back to null when the spacer doesn't match.
  const pickedGrna = useMemo(() => {
    const idx = LAB_GRNA_CATALOG.findIndex(g => /gRNA3/i.test(g.name || ""));
    const entry = LAB_GRNA_CATALOG[idx >= 0 ? idx : 0];
    if (!entry) return null;
    const norm = normalizeSpacer(entry.spacer);
    if (norm.length !== 20) return null;
    const rc = reverseComplement(norm);
    const candidates = findGrnas(constructSeq, targetStart, targetEnd);
    const cand = candidates.find(g => g.protospacer === norm || g.protospacer === rc);
    return cand ? { ...cand, name: entry.name } : null;
  }, [constructSeq, targetStart, targetEnd]);

  // Expected species list — assembly products (uncut) + cut products (if gRNA).
  const expectedSpecies = useMemo(() => {
    const list = [];
    for (const prod of ASSEMBLY_PRODUCTS) {
      const sz = productSize(prod, componentSizes);
      list.push({
        kind: "assembly",
        id: prod.id,
        name: prod.name,
        size: sz,
        dyes: prod.dyes || [],
      });
    }
    if (pickedGrna) {
      for (const oh of [0, 4]) {
        const pr = predictCutProducts(pickedGrna, constructSize, oh);
        for (const dye of ["B", "G", "Y", "R"]) {
          if (!pr[dye] || pr[dye].length <= 0) continue;
          list.push({
            kind: "cut",
            id: `cut-${dye}-${oh}`,
            name: `Cut product · ${dye} · ${oh === 0 ? "blunt" : `+${oh}`}`,
            size: pr[dye].length,
            dyes: [dye],
          });
        }
      }
    }
    return list;
  }, [componentSizes, pickedGrna, constructSize]);

  // Cut products for the ssDNA diagram (blunt chemistry by default).
  const cutProducts = useMemo(() => {
    if (!pickedGrna) return null;
    return predictCutProducts(pickedGrna, constructSize, 0);
  }, [pickedGrna, constructSize]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const generatedAt = new Date();
  const dateStr = generatedAt.toISOString().slice(0, 10);

  const printSafePrint = () => {
    document.body.classList.add("fv-report-printing");
    // Two RAFs guarantee the print CSS (visibility / overflow overrides) has
    // actually been applied before the browser's print dialog snapshots the
    // DOM. A bare setTimeout can fire before the style/layout pass. After
    // printing the class stays ~500 ms so the browser-side preview window
    // (if the user clicks "Preview") re-reads the right state.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print();
        setTimeout(() => document.body.classList.remove("fv-report-printing"), 500);
      });
    });
  };
  const downloadMd = () => {
    const md = buildReportMarkdown({
      samples, peaksBySample, dyeOffsets, componentSizes,
      constructSize, targetStart, targetEnd, generatedAt,
      expectedSpecies, pickedGrna,
    });
    downloadBlob(new Blob([md], { type: "text/markdown" }), `fragment_report_${dateStr}.md`);
  };
  const downloadAllPeakCsv = () => {
    const csv = buildPeakTableCSV(peaksBySample);
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `fragment_report_${dateStr}_peaks.csv`);
  };
  const downloadExpectedSpeciesCsv = () => {
    const rows = ["id,kind,name,size_bp,dyes"];
    for (const sp of expectedSpecies) {
      rows.push(`${sp.id},${sp.kind},"${sp.name}",${sp.size},${(sp.dyes || []).join("|")}`);
    }
    downloadBlob(new Blob([rows.join("\n") + "\n"], { type: "text/csv;charset=utf-8" }),
                 `fragment_report_${dateStr}_expected_species.csv`);
  };
  // "Export all" → one-click download of every deliverable. Files arrive as
  // separate downloads (not zipped — no jszip dependency) but with a shared
  // prefix so they sort together on disk.
  const exportAll = () => {
    const prefix = `fragment_report_${dateStr}`;
    // Diagrams
    if (constructRef.current) exportSvgAsPng(constructRef.current, `${prefix}_construct@4x.png`, 4);
    if (productsRef.current)  exportSvgAsPng(productsRef.current,  `${prefix}_cut_products@4x.png`, 4);
    if (constructRef.current) exportSvgNative(constructRef.current, `${prefix}_construct.svg`);
    if (productsRef.current)  exportSvgNative(productsRef.current,  `${prefix}_cut_products.svg`);
    // Combined diagrams
    const svgs = [constructRef.current, productsRef.current].filter(Boolean);
    if (svgs.length) {
      const combined = buildCombinedSvg(svgs, { gap: 32, title: "DNA diagrams" });
      exportSvgAsPng(combined, `${prefix}_dna_diagrams_combined@4x.png`, 4);
      exportSvgNative(combined, `${prefix}_dna_diagrams_combined.svg`);
    }
    // Chromatograms (one PNG per sample for each of Figure 3 + Figure 4)
    for (const s of samples) {
      const fig3 = chromRefs.current[`fig3-${s}`];
      const fig4 = chromRefs.current[`fig4-${s}`];
      if (fig3) exportSvgAsPng(fig3, `${prefix}_fig3_paired_${s}@4x.png`, 4);
      if (fig4) exportSvgAsPng(fig4, `${prefix}_fig4_annotated_${s}@4x.png`, 4);
    }
    // Tables
    downloadAllPeakCsv();
    downloadExpectedSpeciesCsv();
    // Narrative
    downloadMd();
  };

  // Portal to document.body so .fv-report-root becomes a true direct child
  // of <body>. This makes the print CSS selector `body > *:not(.fv-report-
  // root)` work reliably and frees the modal from the FragmentViewer root's
  // `h-screen` + flex layout constraints during print — the report now
  // flows naturally across multiple PDF pages instead of clipping to one
  // viewport.
  return createPortal(
    <div className="fv-report-root fv-keep-light fixed inset-0 z-50 flex items-start justify-center pt-6 pb-6 px-4 overflow-auto">
      <div className="fv-report-backdrop fixed inset-0 bg-black/40 no-print" onClick={onClose} />
      <div className="relative w-full max-w-5xl bg-white rounded-xl border border-zinc-200 shadow-2xl">
        <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-zinc-200">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Fragment Viewer report</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {dateStr} · {samples.length} sample{samples.length === 1 ? "" : "s"} · construct {constructSize} bp
              {pickedGrna && <> · cut by <span className="font-mono text-zinc-700">{pickedGrna.name}</span></>}
            </p>
          </div>
          <div className="fv-report-actions flex items-center gap-1.5 no-print">
            <ToolButton icon={FileDown} variant="primary" onClick={exportAll}
              title="One-click: downloads every diagram (SVG+PNG), chromatogram (PNG), peak table (CSV), expected-species table (CSV), and markdown narrative as separate files — all prefixed with today's date">
              Export all
            </ToolButton>
            <ToolButton icon={FileDown} variant="secondary" onClick={printSafePrint} title="Open the browser print dialog — choose 'Save as PDF' for a single-file deliverable with the entire report (diagrams, chromatograms, tables) on sequential pages">
              Print / Save as PDF
            </ToolButton>
            <ToolButton icon={FileDown} variant="secondary" onClick={downloadMd} title="Narrative markdown — ready for pandoc+xelatex+DejaVu Sans">
              Markdown
            </ToolButton>
            <ToolButton variant="ghost" onClick={onClose}>Close</ToolButton>
          </div>
        </header>
        <div className="px-5 py-4 space-y-5 max-h-[80vh] overflow-y-auto fv-report-content">
          {/* ─── Section A · Summary & dataset metadata ─────────────────── */}
          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 border-b border-zinc-200 pb-1">
            A. Dataset summary
          </div>
          <section>
            <h3 className="text-sm font-semibold text-zinc-800 mb-2">Dataset</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <Stat label="Samples" value={samples.length} />
              <Stat label="Construct" value={`${constructSize} bp`} hint={`target ${targetStart}–${targetEnd}`} />
              <Stat label="Total peaks" value={samples.reduce((t, s) => t + ["B","G","Y","R","O"].reduce((tt, d) => tt + (peaksBySample[s]?.[d]?.length || 0), 0), 0)} />
              <Stat label="Calibrated" value={["B","G","Y","R"].some(k => Math.abs(dyeOffsets[k]) > 1e-6) ? "yes" : "no"} hint="dye offsets nonzero" />
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-zinc-800 mb-2">Dye mobility offsets (bp)</h3>
            <div className="grid grid-cols-4 gap-2 text-xs">
              {["B", "G", "Y", "R"].map(d => (
                <div key={d} className="flex items-center justify-between px-2.5 py-2 rounded-lg border border-zinc-200 bg-zinc-50">
                  <DyeChip dye={d} />
                  <span className="font-mono text-zinc-800 tabular-nums">{dyeOffsets[d].toFixed(3)}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ─── Section B · Construct architecture & expected species ── */}
          <div className="fv-report-page-break text-[10px] font-bold uppercase tracking-wider text-zinc-400 border-b border-zinc-200 pb-1 mt-4">
            B. Construct, cut site, and expected species
          </div>
          <section>
            <h3 className="text-sm font-semibold text-zinc-800 mb-2">
              Figure 1. Construct architecture{pickedGrna && <> · PAM + Cas9 cut at {pickedGrna.name}</>}
            </h3>
            <div className="border border-zinc-200 rounded-lg bg-white p-2">
              <ConstructDiagram
                componentSizes={componentSizes}
                highlightKey={null}
                onHighlight={null}
                onSizeChange={null}
                cutConstructPos={pickedGrna ? pickedGrna.cut_construct : null}
                overhang={pickedGrna ? 0 : null}
                grnaStrand={pickedGrna ? pickedGrna.strand : null}
                pamStart={pickedGrna ? pickedGrna.pam_start : null}
                pamSeq={pickedGrna ? pickedGrna.pam_seq : null}
                svgRef={constructRef}
              />
            </div>
            <p className="fv-report-caption text-[12.5px] leading-relaxed text-zinc-700 mt-2 mb-1 px-1">
              <b>Figure 1.</b> Full {constructSize} bp ligated construct drawn 5′→3′ (top strand).
              Colored boxes are the assembly components (fluorescent adapters Ad1/Ad2, bridge
              oligos Br1/Br2, overhangs, target insert). Dye circles above the adapters show
              which fluorophores label that component. {pickedGrna ? (
                <>The purple band marks the {pickedGrna.name} PAM site (<span className="font-mono">{pickedGrna.pam_seq || "NGG"}</span>,
                {pickedGrna.strand}-strand). The red dashed line marks the Cas9 double-strand cut
                at construct position {pickedGrna.cut_construct}; LEFT and RIGHT fragment spans
                are labeled beneath with their PAM-proximal / PAM-distal classification.</>
              ) : <>Uncut view — no gRNA picked.</>}
            </p>
          </section>

          {pickedGrna && cutProducts && (
            <section>
              <h3 className="text-sm font-semibold text-zinc-800 mb-2">Figure 2. Expected ssDNA cut products</h3>
              <div className="border border-zinc-200 rounded-lg bg-white p-2">
                <ProductFragmentViz products={cutProducts} constructSize={constructSize} svgRef={productsRef} />
              </div>
              <p className="fv-report-caption text-[12.5px] leading-relaxed text-zinc-700 mt-2 mb-1 px-1">
                <b>Figure 2.</b> The four fluorophore-labeled single-stranded products released
                after Cas9 cleavage + denaturation of the ligated construct. Each bar represents
                one ssDNA, scaled to the {constructSize} bp construct; the dye circle marks the
                labeled end (5′ for B / Y on Ad1, 3′ for G / R on Ad2). The right column
                annotates each product's template classification (template / non-template strand)
                and PAM-proximal vs PAM-distal position, plus the ssDNA length in nt.
              </p>
            </section>
          )}

          {/* Expected species table */}
          <section>
            <h3 className="text-sm font-semibold text-zinc-800 mb-2">
              Expected species
              <span className="ml-2 text-[11px] font-normal text-zinc-500">{expectedSpecies.length} entries</span>
            </h3>
            <div className="overflow-x-auto border border-zinc-200 rounded-lg">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-zinc-50">
                  <tr className="text-left text-zinc-500 border-b border-zinc-200">
                    <th className="py-1.5 px-2 font-medium">ID</th>
                    <th className="py-1.5 px-2 font-medium">Kind</th>
                    <th className="py-1.5 px-2 font-medium">Name</th>
                    <th className="py-1.5 px-2 font-medium text-right">Size (bp)</th>
                    <th className="py-1.5 px-2 font-medium">Dyes</th>
                  </tr>
                </thead>
                <tbody>
                  {expectedSpecies.map(sp => (
                    <tr key={sp.id} className="border-b border-zinc-100">
                      <td className="py-1.5 px-2 font-mono text-zinc-700">{sp.id}</td>
                      <td className="py-1.5 px-2">
                        <Pill tone={sp.kind === "cut" ? "rose" : "sky"}>{sp.kind}</Pill>
                      </td>
                      <td className="py-1.5 px-2 text-zinc-800">{sp.name}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums font-mono text-zinc-700">{Number(sp.size).toFixed(1)}</td>
                      <td className="py-1.5 px-2">
                        <span className="inline-flex items-center gap-1">
                          {(sp.dyes || []).map(d => <DyeChip key={d} dye={d} />)}
                          {(!sp.dyes || sp.dyes.length === 0) && <span className="text-zinc-300">—</span>}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Figure 3: paired overlay chromatogram — mirrors the front
              page's stacked 4-color view with dotted uncut + solid cut.
              Drawn for each loaded sample, with the first OTHER sample
              auto-picked as the reference (matches TraceTab's auto-pair
              default). */}
          {/* ─── Section C · Chromatograms (paired overlay + annotated) ── */}
          <div className="fv-report-page-break text-[10px] font-bold uppercase tracking-wider text-zinc-400 border-b border-zinc-200 pb-1 mt-4">
            C. Capillary electrophoresis — paired overlay and annotated views
          </div>
          {samples.length >= 2 && (
            <section>
              <h3 className="text-sm font-semibold text-zinc-800 mb-2">
                Figure 3. Paired 4-color stacked electropherograms (cut vs uncut, per-sample normalized)
              </h3>
              <div className="space-y-4">
                {samples.map(s => {
                  const refName = samples.find(n => n !== s) || null;
                  return (
                    <div key={`fig3-${s}`} className="border border-zinc-200 rounded-lg bg-white p-2">
                      <StackedChromatogram
                        peaks={peaksBySample[s] || {}}
                        refPeaks={refName ? (peaksBySample[refName] || {}) : null}
                        refSampleName={refName}
                        currentSampleName={s}
                        palette={palette}
                        svgRef={(el) => { chromRefs.current[`fig3-${s}`] = el; }}
                        range={[0, 260]}
                        title={`${s}  ·  paired overlay vs ${refName || "—"}`}
                        caption={[
                          `Figure 3. 4-channel stacked electropherogram for sample ${s}. Each horizontal lane shows one dye`,
                          `channel (B=6-FAM, G=HEX, Y=TAMRA, R=ROX) with modeled-gaussian peak heights scaled to that`,
                          `channel's own maximum (per-sample normalization). Solid lines = current sample (${s}); dotted lines =`,
                          `reference sample (${refName || "—"}) for side-by-side comparison. X-axis: fragment size (bp) calibrated`,
                          `to GS500-LIZ. Colors match the dye palette indicated in the left column.`,
                        ].join("\n")}
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Figure 4: same electropherogram but with EXPECTED-SPECIES
              annotations overlaid — each dye lane gets tick marks + tags at
              the predicted positions of assembly products and cut products.
              Adjacent species legend reproduces the legend card. */}
          <section>
            <h3 className="text-sm font-semibold text-zinc-800 mb-2">
              Figure 4. Annotated 4-color stacked electropherograms with expected species
            </h3>
            <div className="grid md:grid-cols-[minmax(0,1fr)_320px] gap-3 items-start">
              <div className="space-y-3">
                {samples.map(s => (
                  <div key={`fig4-${s}`} className="border border-zinc-200 rounded-lg bg-white p-2">
                    <StackedChromatogram
                      peaks={peaksBySample[s] || {}}
                      expectedSpecies={expectedSpecies}
                      palette={palette}
                      svgRef={(el) => { chromRefs.current[`fig4-${s}`] = el; }}
                      range={[0, 260]}
                      currentSampleName={s}
                      title={`${s}  ·  annotated with expected species`}
                      caption={[
                        `Figure 4. Annotated 4-channel stacked electropherogram for ${s}. Dotted per-dye vertical ticks mark`,
                        `expected assembly-product positions; dashed ticks with "CUT" pills mark predicted Cas9 cut-product`,
                        `sizes. Species-size to dye-channel mapping follows the construct architecture and picked gRNA`,
                        `(see Figures 1–2). Traces are per-sample normalized to each channel's peak max so all four dyes`,
                        `read cleanly; absolute RFU comparison between channels is not meaningful in this view.`,
                      ].join("\n")}
                    />
                  </div>
                ))}
              </div>
              <div className="border border-zinc-200 rounded-lg bg-white p-2">
                <div className="px-1 py-1 text-xs font-semibold text-zinc-700">
                  Molecular species legend
                </div>
                <div className="text-[11px] text-zinc-500 px-1 mb-2">
                  Every expected species the CLC assay can produce, grouped by dye channel and kind (assembly precursor or Cas9 cut product).
                </div>
                <SpeciesLegend
                  componentSizes={componentSizes}
                  defaultOpen={true}
                  gRNAs={pickedGrna ? [pickedGrna] : []}
                  overhangs={[0, 4]}
                  constructSize={constructSize}
                />
              </div>
            </div>
          </section>

          {/* ─── Section D · Molecular products after end prep ──────────── */}
          {pickedGrna && (
            <div className="fv-report-page-break text-[10px] font-bold uppercase tracking-wider text-zinc-400 border-b border-zinc-200 pb-1 mt-4">
              D. Molecular products after Taq end-prep + adapter ligation
            </div>
          )}
          {/* Figure 5: Post-dA-tailing products panel — reuses the same
              component the front page shows, evaluated at the canonical
              cut positions (offsets all zero = canonical cut). */}
          {pickedGrna && (
            <section>
              <h3 className="text-sm font-semibold text-zinc-800 mb-2">
                Figure 5. Post-dA-tailing molecular products + T/A adapter ligation
              </h3>
              <div className="border border-zinc-200 rounded-lg bg-white p-2">
                <PostTailingPanel
                  cutPos={pickedGrna.cut_construct}
                  canonicalOverhang={0}
                  constructSize={constructSize}
                  offsets={{ lt: 0, lb: 0, rt: 0, rb: 0 }}
                  topSeq={constructSeq}
                />
              </div>
              <p className="fv-report-caption text-[12.5px] leading-relaxed text-zinc-700 mt-2 mb-1 px-1">
                <b>Figure 5.</b> Simulated molecular products after the lab's 5′→3′ exonuclease +
                Klenow exo⁻ dA-tailing protocol, applied at the canonical {pickedGrna.name} cut positions.
                Blue bars = top strand, navy bars = bot strand. Green pills = dA-tailed 3′ termini
                (T/A-ligation adapter ready); gray pills = untreated. Each end's T/A-ligation
                compatibility and sequencing direction are annotated.
              </p>
            </section>
          )}

          {/* ─── Section E · Data tables (per-sample peak + height summary) ── */}
          <div className="fv-report-page-break text-[10px] font-bold uppercase tracking-wider text-zinc-400 border-b border-zinc-200 pb-1 mt-4">
            E. Data tables
          </div>
          <section>
            <h3 className="text-sm font-semibold text-zinc-800 mb-2">Per-sample peak summary</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-left text-zinc-500 border-b border-zinc-200">
                    <th className="py-1.5 pr-3 font-medium">Sample</th>
                    <th className="py-1.5 px-2 font-medium text-right">Peaks</th>
                    <th className="py-1.5 px-2 font-medium text-right">ΣHeight</th>
                    {["B","G","Y","R"].map(d => (
                      <th key={d} className="py-1.5 px-2 font-medium">
                        <span className="inline-flex items-center gap-1">
                          <DyeChip dye={d} /> <span className="text-zinc-400 font-normal">top 1</span>
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {samples.map(s => {
                    const p = peaksBySample[s] || {};
                    const nPeaks = ["B","G","Y","R","O"].reduce((t, d) => t + (p[d]?.length || 0), 0);
                    const total = sumHeight(p);
                    const top = topNpeaksPerDye(p, 1);
                    return (
                      <tr key={s} className="border-b border-zinc-100 hover:bg-zinc-50">
                        <td className="py-1.5 pr-3 font-mono text-zinc-800 truncate max-w-[18ch]" title={s}>{s}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-zinc-700">{nPeaks}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-zinc-700">{total.toFixed(0)}</td>
                        {["B","G","Y","R"].map(d => (
                          <td key={d} className="py-1.5 px-2 font-mono text-zinc-600 tabular-nums">
                            {top[d].length ? `${top[d][0].size.toFixed(2)} (${top[d][0].height.toFixed(0)})` : <span className="text-zinc-300">—</span>}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="text-[11px] text-zinc-500">
            Generated by Fragment Viewer at {generatedAt.toISOString()}. "Export all" produces: diagrams (SVG+PNG, individual + combined), per-sample chromatograms (PNG), peak table (CSV), expected-species table (CSV), and markdown narrative. "Print / Save as PDF" captures the entire rendered report including all diagrams and chromatograms in a single file.
          </section>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Compact single-sample electropherogram used inside the report. Renders
// modeled gaussians for each of B/G/Y/R in a single lane, with dashed
// vertical markers at every expected-species size. svgRef prop lets the
// caller grab the <svg> element for export (used by "Export all").
// Reusable stacked 4-color electropherogram for reports. Each dye channel
