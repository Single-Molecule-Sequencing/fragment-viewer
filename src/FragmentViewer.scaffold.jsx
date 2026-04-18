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

// ----------------------------------------------------------------------
// Helpers that still need to be reachable through this module's namespace,
// but now live in their topical lib/ module. Re-exported here so existing
// tests + monolith-consuming code keep working unchanged.
// ----------------------------------------------------------------------
export const fmtBp  = v => (v === null || v === undefined || isNaN(v)) ? "—" : v.toFixed(2);
export const fmtInt = v => (v === null || v === undefined || isNaN(v)) ? "—" : Math.round(v).toLocaleString();

import { buildGaussianPath, formatTick, computeLinearTicks } from "./lib/chromatogram.js";
export { buildGaussianPath, formatTick, computeLinearTicks };

// Issue #16 extractions: pure biology + species helpers to lib/species.js,
// report builder to lib/report.js, and the four classification helpers
// (dominantPeak / classifyPeak / computeAutoDefaults / identifyPeaks) to
// lib/analysis.js. The main FragmentViewer below no longer touches these
// directly — the split tabs import them from lib/.
import {
  TARGET_REACTANTS, predictCutFromReactant, cas9NomenclatureLabel,
  expectedSpeciesForDye, SPECIES_DASH, COMPONENT_INFO,
  speciesAtSize, speciesId, enumerateAllSpeciesWithIds,
} from "./lib/species.js";
export {
  TARGET_REACTANTS, predictCutFromReactant, cas9NomenclatureLabel,
  expectedSpeciesForDye, SPECIES_DASH, COMPONENT_INFO,
  speciesAtSize, speciesId, enumerateAllSpeciesWithIds,
};
import {
  SpeciesSchematic, speciesSchematicProps, SpeciesLegend, SpeciesSidebar,
} from "./components/species.jsx";
export { SpeciesSchematic, speciesSchematicProps, SpeciesLegend, SpeciesSidebar };
import {
  dominantPeak, classifyPeak, computeAutoDefaults, identifyPeaks,
} from "./lib/analysis.js";
export { dominantPeak, classifyPeak, computeAutoDefaults, identifyPeaks };
import {
  topNpeaksPerDye, sumHeight, buildReportMarkdown,
} from "./lib/report.js";
export { topNpeaksPerDye, sumHeight, buildReportMarkdown };
import { componentSizesFrom } from "./lib/biology.js";
export { componentSizesFrom };

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

  // Dark-mode viewing toggle (gh#15). Class-strategy: toggle .dark on <html>
  // and our index.css overrides map bg-white / text-zinc-900 / borders /
  // inputs to zinc-950 family. Exported SVG/PNG/JPG/WebP figures are
  // unaffected because their backgrounds are set via inline attributes.
  const [darkMode, setDarkMode] = useState(() => {
    try {
      if (typeof window === "undefined" || !window.localStorage) return false;
      return window.localStorage.getItem("fragment-viewer:dark-mode") === "1";
    } catch { return false; }
  });
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", darkMode);
    }
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem("fragment-viewer:dark-mode", darkMode ? "1" : "0");
      }
    } catch { /* non-fatal */ }
  }, [darkMode]);

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
        darkMode={darkMode}
        setDarkMode={setDarkMode}
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

// DNA-diagrams modal: renders both the ConstructDiagram (annotated architecture
// ± cut site) and the ProductFragmentViz (ssDNA cut products) in a single
// preview pane, plus a bundle-export row that downloads both diagrams at
// once (combined SVG, combined PNG, or individual files per format).
