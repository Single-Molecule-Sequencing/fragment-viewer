// src/tabs/trace_tab.jsx
// Issue #13 Phase C.6: TraceTab lifted out of FragmentViewer.jsx.
//
// The main per-sample electropherogram viewer. Owns 50+ pieces of UI state:
// sample selector, channel toggles, zoom range, smoothing, Y-scale mode,
// grid density, dye offsets, per-sample style rows, end-structure editor,
// post-tailing panel, and the click-pinned species popover. URL hash sync
// is wired via decodeViewState/encodeViewState.
//
// Circular imports from ../FragmentViewer.jsx are intentional. ESM live
// bindings resolve at render time, so the many components still in the
// monolith (Species*, ConstructDiagram, diagrams, modals, etc.) are safe
// to reach here.

import { useState, useMemo, useRef, useEffect } from "react";
import { ArrowLeft, ArrowRight, ChevronRight, FileDown } from "lucide-react";
import { ExportMenu } from "../components/export_menu.jsx";
import { LabInventoryBadge, LabInventoryPanel } from "../components/lab_inventory.jsx";
import { Panel, Stat, Pill, DyeChip, Field, ToolButton } from "../components/primitives.jsx";
import {
  DYE, DYE_ORDER, DYE_PALETTES, SAMPLE_DYES, LIZ_LADDER,
  CHEMISTRY_PRESETS, CONSTRUCT, ASSEMBLY_PRODUCTS, DYE_STRAND,
  resolveDyeColor,
} from "../lib/constants.js";
import {
  LAB_GRNA_CATALOG, normalizeSpacer, matchLabCatalog,
} from "../lib/grna_catalog.js";
import {
  reverseComplement, findGrnas, predictCutProducts, classifyPeaks,
  productSize,
} from "../lib/biology.js";
import {
  buildPeakTableCSV, encodeViewState, decodeViewState,
} from "../lib/viewstate.js";
import {
  exportSvgAsPng, exportSvgAsJpg, exportSvgAsWebp, exportSvgNative,
  mergeRefs, buildCombinedSvg,
} from "../lib/export.js";
import {
  computePeakSNR, computePurityScore, computePeakShiftStats,
  evaluateDATailing, predictPostTailing,
  evaluateGaussianSum, computeResidual, autoCalibrateDyeOffsets,
} from "../lib/analysis.js";
import {
  preprocessTrace,
} from "../lib/preprocess.js";
import {
  formatTick, computeLinearTicks, buildGaussianPath,
} from "../lib/chromatogram.js";
// Components / helpers still in the monolith. Live bindings through ESM.
import {
  DATA,
  SpeciesSchematic, SpeciesLegend, SpeciesSidebar,
  speciesAtSize, speciesId, speciesSchematicProps,
  enumerateAllSpeciesWithIds,
  expectedSpeciesForDye, SPECIES_DASH, COMPONENT_INFO,
  cas9NomenclatureLabel, predictCutFromReactant, TARGET_REACTANTS,
  ConstructDiagram, ProductFragmentViz, AssemblyProductsCard,
  TargetSequenceView,
  StackedChromatogram, MiniChromatogram,
  PeakSpeciesPopover, SampleSummaryCard,
  EndStructureEditor, PostTailingPanel, PeakShiftPanel,
  SampleStyleRow, PrepControls,
  ReportModal, DNADiagramsModal,
  identifyPeaks, computeAutoDefaults,
  inventoryStatus,
} from "../FragmentViewer.jsx";

export function TraceTab({ samples, cfg, setCfg, results, componentSizes, setCSize, constructSeq, targetStart, targetEnd, palette = "default" }) {
  // Local color accessor that honors the active palette. Named to avoid
  // collision with a block-scoped `dyeColor` variable later in the function.
  const colorFor = (d) => resolveDyeColor(d, palette);

  // Seed for useState initializers: decode the URL hash exactly once so the
  // initial render uses the shared view state when present. Subsequent state
  // updates write to the hash (debounced below). Keeping this outside state
  // prevents re-seeding on re-renders.
  const initialViewState = useMemo(() => {
    if (typeof window === "undefined") return null;
    return decodeViewState(window.location.hash);
  }, []);
  const seeded = (key, fallback) => {
    if (initialViewState && initialViewState[key] !== undefined) return initialViewState[key];
    return fallback;
  };
  // Candidate gRNAs in the construct's target window; recomputed only when
  // the construct or target window change (cheap cache-busting).
  const candidateGrnas = useMemo(() => {
    if (!constructSeq) return [];
    return findGrnas(constructSeq, targetStart, targetEnd).map(g => ({
      ...g, name: `cand-${g.id} ${g.strand}-${g.pam_seq}`,
    }));
  }, [constructSeq, targetStart, targetEnd]);
  const constructSize = (constructSeq || "").length || 226;
  const [sample, setSample] = useState(() => {
    // Default to gRNA3_1-1 (the cut sample in the seeded demo pair); falls
    // back to the first loaded sample when the demo isn't present.
    const preferred = samples.includes("gRNA3_1-1") ? "gRNA3_1-1" : samples[0];
    const s = seeded("sample", preferred);
    return samples.includes(s) ? s : samples[0];
  });
  const [channels, setChannels] = useState(() => seeded("channels", { B: true, G: true, Y: true, R: true, O: false }));
  const [range, setRange] = useState(() => {
    const r = seeded("range", [0, 260]);
    return Array.isArray(r) && r.length === 2 ? r : [0, 260];
  });
  const [mode, setMode] = useState(() => seeded("mode", "trace"));
  const [stackChannels, setStackChannels] = useState(() => seeded("stackChannels", true));
  const [logY, setLogY] = useState(() => seeded("logY", false));
  const [smoothing, setSmoothing] = useState(() => seeded("smoothing", 1));
  // Peak labels + Expected markers OFF by default — they clutter the paired
  // overlay view. Users can flip them on from the controls row when needed.
  const [labelPeaks, setLabelPeaks] = useState(() => seeded("labelPeaks", false));
  const [showExpected, setShowExpected] = useState(() => seeded("showExpected", false));
  const [showSpecies, setShowSpecies] = useState(false);

  // Y-axis scaling. "auto" = per-lane peak * 1.12 (legacy default);
  // "shared" = max across visible lanes (useful when comparing channels);
  // "manual" = user-specified ceiling (bypasses zoom multiplier).
  const [yScaleMode, setYScaleMode] = useState("auto");
  const [yZoom, setYZoom] = useState(1.0);            // applied to auto/shared (0.2–5)
  const [yMaxManual, setYMaxManual] = useState(10000);
  const [peakLabelThreshold, setPeakLabelThreshold] = useState(5); // % of yMax below which peak labels are hidden
  const [gridDensity, setGridDensity] = useState("normal"); // "fine" | "normal" | "sparse"
  const [traceOpacity, setTraceOpacity] = useState(0.95);
  const [fillOpacity, setFillOpacity] = useState(0.20);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Per-sample style overrides for the paired overlay. Each sample's modeled
  // gaussian gets an independent stroke width, stroke opacity, fill opacity,
  // and stroke-dash pattern. Defaults preserve the v0.12 dotted/solid
  // convention (cut = solid, uncut = dotted) but let the user fine-tune any
  // of them without touching the global `traceOpacity` / `fillOpacity` used
  // on non-paired views.
  const [currentStyle, setCurrentStyle] = useState(() => seeded("currentStyle", {
    strokeWidth:   1.5,
    strokeOpacity: 0.95,
    fillOpacity:   0.20,
    dash:          "solid",   // "solid" | "dotted" | "dashed" | "dash-dot"
  }));
  const [refStyle, setRefStyle] = useState(() => seeded("refStyle", {
    strokeWidth:   1.3,
    strokeOpacity: 0.95,
    fillOpacity:   0.07,
    dash:          "dotted",
  }));
  const setCurrentStyleField = (k, v) => setCurrentStyle(s => ({ ...s, [k]: v }));
  const setRefStyleField     = (k, v) => setRefStyle(s => ({ ...s, [k]: v }));
  // Map dash-name → strokeDasharray + linecap combo. "solid" uses no dash.
  const dashFor = (d) => {
    if (d === "dotted")   return { dashArr: "1 3",   cap: "round" };
    if (d === "dashed")   return { dashArr: "5 3",   cap: "butt"  };
    if (d === "dash-dot") return { dashArr: "5 2 1 2", cap: "butt"  };
    return { dashArr: "none", cap: "butt" };
  };

  // Raw-trace overlay. Only available for samples loaded from .fsa (traces
  // persisted from parseFsaArrayBuffer). TSV-only samples have no raw data.
  const [showRawTrace, setShowRawTrace] = useState(false);
  const [rawOpacity, setRawOpacity] = useState(0.85);
  const [rawStroke, setRawStroke] = useState(0.8);

  // Overlay interpretation: "raw" draws the preprocessed raw trace on top of
  // the modeled Gaussian; "residual" draws raw − modeled, centered on a zero
  // line. Residual mode makes shoulders, splits, and unmodeled baseline
  // features pop visually without needing any statistical cutoff.
  const [overlayMode, setOverlayMode] = useState("raw"); // "raw" | "residual"

  // Reference sample (typically the uncut / no-Cas9 control) overlaid on
  // the current sample as a ghost trace. Makes it obvious which peaks
  // existed before cleavage and which were generated by cleavage.
  //   pairMode: "none" = hidden; "overlay" = ghost underlay behind current;
  //             "mirror" = butterfly / top-above-bottom layout
  // referenceSample: filename stem or "" for none; "auto" picks the first
  //                  sample whose name matches a NoCas9 / uncut / control regex.
  // Default pairMode to "overlay" when exactly 2 samples are loaded so the
  // seeded demo (V059_4-5 + gRNA3_1-1) lands directly in the paired view.
  // Larger datasets start in "none" so users don't get surprised by a
  // random overlay pair on a 96-sample plate.
  const [pairMode, setPairMode] = useState(() => seeded("pairMode", samples.length === 2 ? "overlay" : "none"));
  const [referenceSample, setReferenceSample] = useState(() => seeded(
    "referenceSample",
    samples.includes("V059_4-5") ? "V059_4-5" : ""
  ));
  const [showUncutCutMarkers, setShowUncutCutMarkers] = useState(() => seeded("showUncutCutMarkers", false));
  const [showPrecursorMarkers, setShowPrecursorMarkers] = useState(() => seeded("showPrecursorMarkers", false));
  // End-structure offsets shared between EndStructureEditor (write) and
  // PostTailingPanel (read). Four ±1 bp adjustments from the canonical
  // Cas9 cut positions — persisted in the URL hash too.
  const [endOffsets, setEndOffsets] = useState(() => seeded("endOffsets", { lt: 0, lb: 0, rt: 0, rb: 0 }));
  // Paired-sample Y-axis scaling.
  //   "shared"      — both samples share one lane yMax (current + reference
  //                   peaks pooled). Preserves absolute signal differences.
  //   "independent" — each sample scales to its own peak max per channel
  //                   ("per-sample normalization"). Preserves SHAPE /
  //                   POSITION information while hiding intensity differences.
  // Per-sample normalization is the default — each sample scales to its own
  // peak max so intensity differences between runs don't hide the shape/
  // position story. Users can flip to Shared for absolute-signal comparisons.
  const [pairScale, setPairScale] = useState(() => seeded("pairScale", "independent"));
  // Independent preprocessing for the reference (uncut) sample. Mirrors the
  // `prep` state that applies to the current sample. Empty defaults = no-op
  // so enabling pairing doesn't accidentally modify the reference display.
  const [prepRef, setPrepRef] = useState(() => seeded("prepRef", {
    smooth: "none", savgolWindow: 7, savgolOrder: 2,
    movingWindow: 5, medianWindow: 5,
    baseline: false, baselineWindow: 201,
    detrend: false,
    clip: false, clipCeiling: 30000,
    log: false, logScale: 1000,
    derivative: false,
  }));
  const setPrepRefField = (k, v) => setPrepRef(p => ({ ...p, [k]: v }));

  // Preprocessing pipeline applied to raw trace before rendering. Purely
  // visual — never mutates the stored traces or the called peak table.
  //
  // Pipeline order: clip → log → baseline → detrend → smooth → derivative.
  // Smoother family: "savgol" | "moving" | "median" | "none".
  const [prep, setPrep] = useState({
    smooth: "none",        // "none" | "savgol" | "moving" | "median"
    savgolWindow: 7,
    savgolOrder: 2,
    movingWindow: 5,
    medianWindow: 5,
    baseline: false,
    baselineWindow: 201,
    detrend: false,
    clip: false,
    clipCeiling: 30000,
    log: false,
    logScale: 1000,
    derivative: false,
  });
  const setPrepField = (k, v) => setPrep(p => ({ ...p, [k]: v }));
  // Default cutting Cas9 = V059_gRNA3. Looked up by name-search so the
  // default survives any reordering of LAB_GRNA_CATALOG entries.
  const [speciesGrnaIdx, setSpeciesGrnaIdx] = useState(() => {
    const idx = LAB_GRNA_CATALOG.findIndex(g => /gRNA3/i.test(g.name || ""));
    return idx >= 0 ? idx : 0;
  });
  const [speciesOverhangs, setSpeciesOverhangs] = useState([0, 4]);  // chemistries to overlay when a gRNA is selected
  const [showLadder, setShowLadder] = useState(true);
  // Peak hover-dot circles cover the trace heavily; off by default, toggle on demand.
  const [showPeakDots, setShowPeakDots] = useState(false);
  const [hover, setHover] = useState(null);
  // Click-pinned species popover (was hover; click is steadier and lets users
  // scroll inside the popover and read full Cas9 nomenclature without losing it).
  const [pinnedPeak, setPinnedPeak] = useState(null);
  // Per-species visibility; empty Set = show every species in the overlay.
  const [hiddenSpeciesIds, setHiddenSpeciesIds] = useState(() => new Set());
  const toggleHidden = (id) => setHiddenSpeciesIds(s => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const peaks = DATA.peaks[sample] || {};
  const rawBundle = (DATA.traces && DATA.traces[sample]) || null;
  const hasRawTrace = !!(rawBundle && rawBundle.bpAxis);
  const s = cfg[sample];

  const [showNoiseFloor, setShowNoiseFloor] = useState(false);

  // Keyboard navigation (listens for the global fv:key event dispatched by
  // FragmentViewer's window keydown handler — keeps state local to the tab).
  useEffect(() => {
    const onKey = (e) => {
      const k = e.detail?.key;
      if (!k) return;
      const idx = samples.indexOf(sample);
      if (k === "ArrowRight" && idx < samples.length - 1) setSample(samples[idx + 1]);
      else if (k === "ArrowLeft" && idx > 0) setSample(samples[idx - 1]);
      else if (k === "[") setSmoothing(v => Math.max(0.5, +(v - 0.1).toFixed(1)));
      else if (k === "]") setSmoothing(v => Math.min(3.0, +(v + 0.1).toFixed(1)));
      else if (k === "f") resetZoom();
      else if (k === "1") setChannels(c => ({ ...c, B: !c.B }));
      else if (k === "2") setChannels(c => ({ ...c, G: !c.G }));
      else if (k === "3") setChannels(c => ({ ...c, Y: !c.Y }));
      else if (k === "4") setChannels(c => ({ ...c, R: !c.R }));
      else if (k === "n") setShowNoiseFloor(v => !v);
      else if (k === "r") setShowRawTrace(v => !v);
    };
    window.addEventListener("fv:key", onKey);
    return () => window.removeEventListener("fv:key", onKey);
  }, [samples, sample]);

  // Serialize the most shareable view state into the URL hash, debounced so
  // drag-zoom doesn't rewrite history on every mousemove. Restoring is done
  // once at mount via `seeded()` — there's no recovery loop here.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = setTimeout(() => {
      const state = {
        sample, range, channels, mode, stackChannels, logY, smoothing,
        pairMode, referenceSample, showUncutCutMarkers, showPrecursorMarkers,
        pairScale, prepRef,
        labelPeaks, showExpected,
        currentStyle, refStyle,
        endOffsets,
      };
      const encoded = encodeViewState(state);
      // Only mutate history if it actually changed; replaceState (not push)
      // so the browser back button doesn't fill with every zoom tweak.
      const next = `#view=${encoded}`;
      if (window.location.hash !== next) {
        try { window.history.replaceState(null, "", next); } catch { /* non-fatal */ }
      }
    }, 250);
    return () => clearTimeout(id);
  }, [sample, range, channels, mode, stackChannels, logY, smoothing,
      pairMode, referenceSample, showUncutCutMarkers, showPrecursorMarkers,
      pairScale, prepRef,
      labelPeaks, showExpected,
      currentStyle, refStyle,
      endOffsets]);

  // Resolve the reference sample name. "auto" picks the first matching
  // uncut / NoCas9 / control candidate from the loaded samples. A manual
  // pick overrides. Empty string = no reference overlay.
  const resolvedReference = useMemo(() => {
    if (!pairMode || pairMode === "none") return "";
    if (referenceSample === "auto" || referenceSample === "") {
      const pat = /(no[-_ ]?cas|uncut|nocleav|control|input|t0)/i;
      const match = samples.find(n => n !== sample && pat.test(n));
      if (match) return match;
      // Fallback: when no name matches the uncut regex, use the FIRST other
      // loaded sample so the overlay always renders on a 2-sample dataset.
      // This is the common case for the seeded V059_4-5 + gRNA3_1-1 demo.
      const anyOther = samples.find(n => n !== sample);
      return anyOther || "";
    }
    return referenceSample === sample ? "" : referenceSample;
  }, [pairMode, referenceSample, samples, sample]);

  const refPeaks = resolvedReference ? (DATA.peaks[resolvedReference] || {}) : {};
  const refRawBundle = resolvedReference ? ((DATA.traces && DATA.traces[resolvedReference]) || null) : null;
  const hasRefRaw = !!(refRawBundle && refRawBundle.bpAxis);

  const presets = sample.startsWith("gRNA3")
    ? [{ l: "Full", r: [0, 500] }, { l: "Cut site", r: [75, 110] }, { l: "Tight", r: [83, 95] }, { l: "Small", r: [0, 50] }]
    : [{ l: "Full", r: [0, 500] }, { l: "Cut site", r: [185, 225] }, { l: "Tight", r: [196, 210] }, { l: "Small", r: [0, 60] }];

  // Peaks in current window
  const peaksByChannel = useMemo(() => {
    const out = {};
    for (const d of DYE_ORDER) {
      out[d] = [];
      if (!peaks[d]) continue;
      for (const p of peaks[d]) {
        if (p[0] >= range[0] - 5 && p[0] <= range[1] + 5) out[d].push({ dye: d, size: p[0], height: p[1], area: p[2], width: p[3] });
      }
    }
    return out;
  }, [peaks, range]);

  // Per-lane y-max (in visible range). This is the "auto" base; the effective
  // lane ceiling also folds in yScaleMode + yZoom + manual override.
  const yMaxByChannel = useMemo(() => {
    const out = {};
    for (const d of DYE_ORDER) {
      const inRange = (peaks[d] || []).filter(p => p[0] >= range[0] && p[0] <= range[1]);
      out[d] = inRange.length ? Math.max(...inRange.map(p => p[1])) * 1.12 : 100;
    }
    return out;
  }, [peaks, range]);

  // Reference-sample y-max per channel, computed independently so the
  // "independent" pair scale can normalize each sample to its own peak max.
  // Same 1.12× headroom factor as the current-sample calc for consistency.
  const refYMaxByChannel = useMemo(() => {
    const out = {};
    for (const d of DYE_ORDER) {
      const inRange = (refPeaks[d] || []).filter(p => p[0] >= range[0] && p[0] <= range[1]);
      out[d] = inRange.length ? Math.max(...inRange.map(p => p[1])) * 1.12 : 100;
    }
    return out;
  }, [refPeaks, range]);

  const activeChannels = DYE_ORDER.filter(d => channels[d]);
  const sharedYMax = useMemo(() => {
    if (!activeChannels.length) return 100;
    return Math.max(...activeChannels.map(d => yMaxByChannel[d]));
  }, [activeChannels, yMaxByChannel]);

  // Resolve the effective lane ceiling for a given dye. yZoom=1 is identity;
  // yZoom>1 shrinks the ceiling (zooms in on small peaks); yZoom<1 grows it
  // (zooms out so tall peaks stop hitting the roof). Manual mode bypasses zoom.
  const yForLane = (d) => {
    if (yScaleMode === "manual") return Math.max(10, yMaxManual);
    const base = yScaleMode === "shared" ? sharedYMax : yMaxByChannel[d];
    return Math.max(10, base / Math.max(0.01, yZoom));
  };

  // Preprocessed raw-trace samples per dye, constrained to the visible bp
  // range. We return {xs: bp[], ys: height[]} for each channel so the render
  // pass can walk them in one loop and build a polyline path. Subsampled to
  // ~plotW resolution so we don't over-draw on wide plots.
  const rawByChannel = useMemo(() => {
    if (!showRawTrace || !hasRawTrace) return {};
    const bpAxis = rawBundle.bpAxis;
    const out = {};
    // Find raw-sample indices that fall inside the visible bp window.
    // bpAxis is monotonically non-decreasing (LIZ-derived); use binary search.
    const findIdx = (bp) => {
      let lo = 0, hi = bpAxis.length - 1;
      while (lo < hi) { const m = (lo + hi) >> 1; if (bpAxis[m] < bp) lo = m + 1; else hi = m; }
      return lo;
    };
    const iLo = Math.max(0, findIdx(range[0]) - 2);
    const iHi = Math.min(bpAxis.length - 1, findIdx(range[1]) + 2);
    for (const d of DYE_ORDER) {
      const src = rawBundle[d];
      if (!src || src.length === 0) continue;
      const pre = preprocessTrace(src, prep);
      // Downsample: keep ~1500 points max in the visible window, regardless of
      // zoom (raw trace at 10 Hz * 30 min = 18000 pts; without this we'd ship
      // 18k SVG verts to every mount).
      const nPts = Math.min(iHi - iLo + 1, 1500);
      const step = Math.max(1, Math.floor((iHi - iLo + 1) / nPts));
      const xs = [];
      const ys = [];
      for (let i = iLo; i <= iHi; i += step) { xs.push(bpAxis[i]); ys.push(pre[i]); }
      // In residual mode, subtract the modeled Gaussian sum at every sampled
      // bp. Use the peaks for that dye in this sample and the same smoothing
      // multiplier that drives the rendered trace so the residual is against
      // what the user is actually looking at.
      if (overlayMode === "residual") {
        const dyePeaks = peaks[d] || [];
        const resid = computeResidual(xs, ys, dyePeaks, smoothing);
        out[d] = { xs, ys: resid, residual: true };
      } else {
        out[d] = { xs, ys, residual: false };
      }
    }
    return out;
  }, [showRawTrace, hasRawTrace, rawBundle, range, prep, overlayMode, peaks, smoothing]);

  // Reference-sample raw trace, preprocessed via prepRef. Only computed
  // when we have a raw bundle for the reference AND the user has chosen
  // to overlay raw traces. Intentionally NOT gated on overlayMode === "raw"
  // vs "residual" for the reference (residual logic lives on the current
  // sample; reference always renders as raw preprocessed data).
  const refRawByChannel = useMemo(() => {
    if (!showRawTrace || !hasRefRaw || pairMode === "none") return {};
    const bpAxis = refRawBundle.bpAxis;
    const out = {};
    const findIdx = (bp) => {
      let lo = 0, hi = bpAxis.length - 1;
      while (lo < hi) { const m = (lo + hi) >> 1; if (bpAxis[m] < bp) lo = m + 1; else hi = m; }
      return lo;
    };
    const iLo = Math.max(0, findIdx(range[0]) - 2);
    const iHi = Math.min(bpAxis.length - 1, findIdx(range[1]) + 2);
    for (const d of DYE_ORDER) {
      const src = refRawBundle[d];
      if (!src || src.length === 0) continue;
      const pre = preprocessTrace(src, prepRef);
      const nPts = Math.min(iHi - iLo + 1, 1500);
      const step = Math.max(1, Math.floor((iHi - iLo + 1) / nPts));
      const xs = [];
      const ys = [];
      for (let i = iLo; i <= iHi; i += step) { xs.push(bpAxis[i]); ys.push(pre[i]); }
      out[d] = { xs, ys };
    }
    return out;
  }, [showRawTrace, hasRefRaw, refRawBundle, range, prepRef, pairMode]);

  // Geometry
  const W = 920;
  const lanesCount = stackChannels ? Math.max(1, activeChannels.length) : 1;
  const laneH = stackChannels ? 108 : 380;
  // When a reference sample is active, reserve 22 extra px at the top for
  // the dotted-vs-solid legend strip so the convention is readable and the
  // exported SVG/PNG/JPG tells the whole story without caption chrome.
  const showPairLegend = pairMode !== "none" && !!resolvedReference;
  const m = { l: 64, r: 16, t: showPairLegend ? 36 : 14, b: 40 };
  const laneGap = stackChannels ? 6 : 0;
  const H = m.t + m.b + lanesCount * laneH + (lanesCount - 1) * laneGap;
  const plotW = W - m.l - m.r;
  const xScale = sz => m.l + ((sz - range[0]) / (range[1] - range[0])) * plotW;

  const lanes = stackChannels
    ? activeChannels.map((d, i) => ({ dyes: [d], top: m.t + i * (laneH + laneGap), h: laneH, yMax: yForLane(d) }))
    : [{ dyes: activeChannels, top: m.t, h: laneH, yMax: yScaleMode === "manual" ? Math.max(10, yMaxManual) : Math.max(10, sharedYMax / Math.max(0.01, yZoom)) }];

  // X ticks — step scales with span and with user-selected grid density
  // (fine halves the step, sparse doubles it). Always produces integer-ish
  // tick values so the axis reads cleanly.
  const xTicks = useMemo(() => {
    const span = range[1] - range[0];
    let step = span <= 15 ? 2 : span <= 40 ? 5 : span <= 120 ? 20 : 50;
    if (gridDensity === "fine") step = Math.max(1, Math.round(step / 2));
    if (gridDensity === "sparse") step = step * 2;
    const first = Math.ceil(range[0] / step) * step;
    const t = [];
    for (let v = first; v <= range[1]; v += step) t.push(v);
    return t;
  }, [range, gridDensity]);

  // Drag-to-zoom
  const svgRef = useRef(null);
  const [drag, setDrag] = useState(null);
  const toBp = cx => {
    const r = svgRef.current.getBoundingClientRect();
    const scale = W / r.width;
    return range[0] + (((cx - r.left) * scale - m.l) / plotW) * (range[1] - range[0]);
  };
  const onDown = e => { const bp = toBp(e.clientX); if (bp < range[0] || bp > range[1]) return; setDrag({ s: bp, e: bp }); };
  const onMove = e => { if (drag) setDrag({ ...drag, e: toBp(e.clientX) }); };
  const onUp   = () => {
    if (drag && Math.abs(drag.e - drag.s) > 0.5) {
      const lo = Math.max(0,   Math.min(drag.s, drag.e));
      const hi = Math.min(500, Math.max(drag.s, drag.e));
      setRange([lo, hi]);
    }
    setDrag(null);
  };

  // Reset to full
  const resetZoom = () => setRange([0, 500]);

  // Stats summary for this sample
  const sres = results[sample];

  // Resolve picked gRNA for the species-at-size hover popover (mirrors the
  // species overlay logic so hover answers the same question shown inline).
  const pickedGrnaForHover = useMemo(() => {
    if (speciesGrnaIdx < 0) return null;
    if (speciesGrnaIdx < 1000) {
      const e = LAB_GRNA_CATALOG[speciesGrnaIdx];
      if (!e || normalizeSpacer(e.spacer).length !== 20) return null;
      const norm = normalizeSpacer(e.spacer);
      const rc = norm.split("").reverse().map(c => ({A:"T",T:"A",G:"C",C:"G"})[c] || c).join("");
      const cand = candidateGrnas.find(g => g.protospacer === norm || g.protospacer === rc);
      return cand ? { ...cand, name: e.name } : null;
    }
    return candidateGrnas[speciesGrnaIdx - 1000] || null;
  }, [speciesGrnaIdx, candidateGrnas]);

  // Per-sample purity score keyed on picked gRNA + overhangs + construct.
  // Falls back to using assembly-product sizes when no gRNA is picked so the
  // score is still meaningful on uncut controls (they should read ~100%
  // purity against the assembly-product set, ~0% against cut products).
  const purityBySample = useMemo(() => {
    const out = {};
    const expectedByDye = { B: [], G: [], Y: [], R: [] };
    if (showUncutCutMarkers && pickedGrnaForHover) {
      for (const oh of speciesOverhangs) {
        const pr = predictCutProducts(pickedGrnaForHover, constructSize, oh);
        for (const dye of ["B", "G", "Y", "R"]) {
          if (pr[dye] && pr[dye].length > 0) expectedByDye[dye].push(pr[dye].length);
        }
      }
    } else {
      for (const prod of ASSEMBLY_PRODUCTS) {
        if (!prod.dyes) continue;
        for (const dye of prod.dyes) {
          if (expectedByDye[dye]) expectedByDye[dye].push(productSize(prod, componentSizes));
        }
      }
    }
    for (const sn of samples) {
      out[sn] = computePurityScore(DATA.peaks[sn] || {}, expectedByDye, 1.8);
    }
    return out;
  }, [samples, pickedGrnaForHover, speciesOverhangs, componentSizes, constructSize, showUncutCutMarkers]);

  // Per-peak SNR for the CURRENT sample (expensive to compute across all
  // samples on every render — keyed only on the active sample + raw bundle).
  // Also returns the lane-wide noise floor (median of per-peak noiseFloor)
  // which drives the dashed reference line in the electropherogram.
  const snrInfo = useMemo(() => {
    if (!hasRawTrace) return { byDye: {}, noiseFloorByDye: {} };
    const byDye = {};
    const noiseFloorByDye = {};
    for (const d of ["B", "G", "Y", "R"]) {
      const src = rawBundle[d];
      if (!src) continue;
      const lp = peaks[d] || [];
      const floors = [];
      byDye[d] = lp.map(p => {
        const r = computePeakSNR(p[0], p[1], src, rawBundle.bpAxis, 4, 1.2);
        if (r.noiseFloor != null) floors.push(r.noiseFloor);
        return r;
      });
      if (floors.length) {
        floors.sort((a, b) => a - b);
        noiseFloorByDye[d] = floors[Math.floor(floors.length / 2)];
      }
    }
    return { byDye, noiseFloorByDye };
  }, [hasRawTrace, rawBundle, peaks]);

  // Compute the full species list once per render, with stable A1/M2/C3
  // displayIds shared across dyes. Both the per-lane plot overlay and the
  // SpeciesSidebar reference this list so the IDs match.
  const allSpeciesWithIds = useMemo(() => {
    if (!showSpecies) return [];
    return enumerateAllSpeciesWithIds({
      componentSizes,
      constructSize,
      gRNAs: pickedGrnaForHover ? [pickedGrnaForHover] : [],
      overhangs: pickedGrnaForHover ? speciesOverhangs : [],
      dyes: ["B", "G", "Y", "R"],
    });
  }, [showSpecies, componentSizes, constructSize, pickedGrnaForHover, speciesOverhangs]);

  return (
    <>
      <div className={showSpecies ? "lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-3" : ""}>
        <div className="min-w-0">
      {/* Sample selector — each button shows the sample name plus a compact
          purity pill colored by fraction of signal matching expected species
          (cut products when a gRNA is picked, assembly products otherwise).
          Keyboard: ← / → step through samples. */}
      <div className="bg-white rounded-lg border border-zinc-200 p-2.5 mb-2">
        <div className="flex items-center gap-2 mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Sample <span className="text-zinc-400 font-normal normal-case">({samples.length})</span>
          <span className="ml-auto text-[10px] font-normal normal-case text-zinc-400">← → to switch · purity = {showUncutCutMarkers && pickedGrnaForHover ? "cut-product match" : "assembly-product match"}</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {samples.map(ss => {
            const pu = purityBySample[ss];
            const pct = pu ? Math.round(pu.purity * 100) : null;
            const pill = pct == null ? null : (
              pct >= 70 ? "bg-emerald-500 text-white" :
              pct >= 40 ? "bg-amber-400 text-zinc-900" :
                          "bg-rose-400 text-white"
            );
            return (
              <button key={ss} onClick={() => setSample(ss)}
                className={`px-2.5 py-1 text-xs rounded-md border transition inline-flex items-center gap-1.5 ${ss === sample ? "bg-zinc-900 text-white border-zinc-900" : "bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-100"}`}>
                <span>{ss}</span>
                {pct != null && pu.n > 0 && (
                  <span className={`px-1 py-0 text-[10px] font-semibold rounded ${pill}`}
                        title={`Purity: ${pu.matches}/${pu.n} peaks matched expected species · height-weighted ${(pu.purity * 100).toFixed(1)}%`}>
                    {pct}%
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Controls row 1: channels + view mode */}
      <div className="bg-white rounded-lg border border-zinc-200 p-2.5 mb-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Channels</span>
          {DYE_ORDER.map(d => (
            <label key={d} className="flex items-center gap-1 cursor-pointer select-none text-xs">
              <input type="checkbox" checked={channels[d]} onChange={e => setChannels({ ...channels, [d]: e.target.checked })} className="w-3.5 h-3.5 accent-zinc-700" />
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: colorFor(d) }} />
              {DYE[d].label}
            </label>
          ))}
        </div>
        <div className="h-5 w-px bg-zinc-200" />
        <div className="flex items-center gap-1 text-xs">
          <span className="font-semibold uppercase tracking-wide text-zinc-500 mr-1">View</span>
          <div className="inline-flex rounded-md border border-zinc-300 overflow-hidden">
            <button onClick={() => setMode("trace")} className={`px-2 py-1 ${mode === "trace" ? "bg-zinc-900 text-white" : "bg-white text-zinc-700 hover:bg-zinc-100"}`}>Trace</button>
            <button onClick={() => setMode("stem")}  className={`px-2 py-1 ${mode === "stem"  ? "bg-zinc-900 text-white" : "bg-white text-zinc-700 hover:bg-zinc-100"}`}>Stem</button>
          </div>
          <label className="flex items-center gap-1 ml-2 cursor-pointer">
            <input type="checkbox" checked={stackChannels} onChange={e => setStackChannels(e.target.checked)} className="w-3.5 h-3.5 accent-zinc-700" />
            Stacked
          </label>
          <label className="flex items-center gap-1 ml-2 cursor-pointer">
            <input type="checkbox" checked={logY} onChange={e => setLogY(e.target.checked)} className="w-3.5 h-3.5 accent-zinc-700" />
            Log Y
          </label>
          <label className="flex items-center gap-1 ml-2 cursor-pointer">
            <input type="checkbox" checked={labelPeaks} onChange={e => setLabelPeaks(e.target.checked)} className="w-3.5 h-3.5 accent-zinc-700" />
            Peak labels
          </label>
          <label className="flex items-center gap-1 ml-2 cursor-pointer">
            <input type="checkbox" checked={showExpected} onChange={e => setShowExpected(e.target.checked)} className="w-3.5 h-3.5 accent-zinc-700" />
            Expected
          </label>
          <label className="flex items-center gap-1 ml-2 cursor-pointer" title="Overlay every species the dye CAN show (assembly products, partial ligation, adapter monomers, optional Cas9 cut products)">
            <input type="checkbox" checked={showSpecies} onChange={e => setShowSpecies(e.target.checked)} className="w-3.5 h-3.5 accent-sky-600" />
            Expected species
          </label>
          <label className="flex items-center gap-1 ml-2 cursor-pointer" title="Render small white-fill circles on every called peak (helpful for hover; can clutter the trace)">
            <input type="checkbox" checked={showPeakDots} onChange={e => setShowPeakDots(e.target.checked)} className="w-3.5 h-3.5 accent-zinc-700" />
            Peak dots
          </label>
        </div>
      </div>

      {/* Controls row: uncut-vs-cut pairing + marker toggles.
          The "uncut reference" overlay lets users see both a no-Cas9 control
          and a cut sample on the same plot, so the cleavage transition is
          visually obvious. Auto-detect matches common NoCas9/uncut patterns
          in the loaded sample names; a manual pick overrides. */}
      <div className="bg-white rounded-lg border border-zinc-200 p-2.5 mb-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Uncut vs cut</span>
        <div className="inline-flex rounded-md border border-zinc-300 overflow-hidden text-xs">
          {[
            { k: "none",    l: "Off" },
            { k: "overlay", l: "Overlay" },
            { k: "mirror",  l: "Mirror" },
          ].map(o => (
            <button key={o.k} onClick={() => setPairMode(o.k)}
              title={
                o.k === "overlay" ? "Reference sample drawn as a ghost trace (gray) under the current sample" :
                o.k === "mirror"  ? "Reference trace drawn mirrored below the x-axis (butterfly plot)" :
                "Hide reference overlay"
              }
              className={`px-2 py-1 ${pairMode === o.k ? "bg-indigo-600 text-white" : "bg-white text-zinc-700 hover:bg-zinc-100"}`}>
              {o.l}
            </button>
          ))}
        </div>
        {pairMode !== "none" && (
          <>
            <label className="flex items-center gap-1.5 text-xs">
              <span className="text-zinc-600">Reference:</span>
              <select value={referenceSample} onChange={e => setReferenceSample(e.target.value)}
                      className="px-2 py-0.5 text-xs border border-zinc-300 rounded bg-white max-w-[22ch] focus-ring">
                <option value="auto">Auto-detect (NoCas9 / uncut / control)</option>
                {samples.filter(n => n !== sample).map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <span className="text-[11px] text-zinc-500">
                {resolvedReference ? <>using <span className="font-mono text-zinc-700">{resolvedReference}</span></> : <span className="text-amber-700">no match</span>}
              </span>
            </label>
            <label className="flex items-center gap-1.5 text-xs"
                   title={
                     pairScale === "independent"
                       ? "Each sample scales to its own per-channel peak max (per-sample normalization). Compares SHAPE / POSITION regardless of intensity differences."
                       : "Both samples share one lane yMax (peaks pooled). Preserves absolute signal differences."
                   }>
              <span className="text-zinc-600">Scale:</span>
              <div className="inline-flex rounded-md border border-zinc-300 overflow-hidden">
                {[
                  { k: "shared",      l: "Shared" },
                  { k: "independent", l: "Per-sample" },
                ].map(o => (
                  <button key={o.k} onClick={() => setPairScale(o.k)}
                    className={`px-2 py-1 ${pairScale === o.k ? "bg-indigo-600 text-white" : "bg-white text-zinc-700 hover:bg-zinc-100"}`}>
                    {o.l}
                  </button>
                ))}
              </div>
            </label>
          </>
        )}
        <div className="h-5 w-px bg-zinc-200" />
        <label className="flex items-center gap-1 text-xs cursor-pointer"
               title="Explicit UNCUT reference line at the full construct size + CUT product lines from the picked gRNA. Works with any single sample; no reference sample needed.">
          <input type="checkbox" checked={showUncutCutMarkers}
                 onChange={e => setShowUncutCutMarkers(e.target.checked)} className="w-3.5 h-3.5 accent-indigo-600" />
          <span className="text-zinc-700">Uncut + cut markers</span>
        </label>
        <label className="flex items-center gap-1 text-xs cursor-pointer"
               title="Mark all pre-cleavage assembly precursors (full construct + partial ligations) with distinctive lines">
          <input type="checkbox" checked={showPrecursorMarkers}
                 onChange={e => setShowPrecursorMarkers(e.target.checked)} className="w-3.5 h-3.5 accent-indigo-600" />
          <span className="text-zinc-700">Precursor markers</span>
        </label>
      </div>

      {/* Per-sample style controls — surfaced only when pairing is active.
          Each of cut and uncut gets its own stroke width, stroke opacity,
          fill opacity, and dash pattern. Decoupled from the global
          traceOpacity/fillOpacity sliders used on non-paired views. */}
      {pairMode !== "none" && (
        <div className="bg-white rounded-lg border border-zinc-200 p-2.5 mb-2 space-y-2">
          <SampleStyleRow
            title={`Cut (solid) · ${sample}`}
            accent="zinc"
            style={currentStyle}
            setField={setCurrentStyleField}
          />
          {resolvedReference && (
            <SampleStyleRow
              title={`Uncut (dotted) · ${resolvedReference}`}
              accent="indigo"
              style={refStyle}
              setField={setRefStyleField}
            />
          )}
        </div>
      )}

      {/* Controls row 3 (species overlay) — visible only when showSpecies is on */}
      {showSpecies && (
        <div className="bg-sky-50 border border-sky-200 rounded-lg p-2.5 mb-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs no-print">
          <div className="flex items-center gap-2">
            <span className="font-semibold uppercase tracking-wide text-sky-700">Species overlay</span>
            {/* Lines colored by lane dye; pattern conveys kind */}
            <span className="inline-flex items-center gap-1 text-zinc-700">
              <svg width="22" height="6" aria-hidden><line x1="0" y1="3" x2="22" y2="3" stroke="currentColor" strokeWidth="1.4" strokeDasharray={SPECIES_DASH.assembly} /></svg>
              assembly
            </span>
            <span className="inline-flex items-center gap-1 text-zinc-700">
              <svg width="22" height="6" aria-hidden><line x1="0" y1="3" x2="22" y2="3" stroke="currentColor" strokeWidth="1.4" strokeDasharray={SPECIES_DASH.monomer} /></svg>
              monomer
            </span>
            <span className="inline-flex items-center gap-1 text-zinc-700">
              <svg width="22" height="6" aria-hidden><line x1="0" y1="3" x2="22" y2="3" stroke="currentColor" strokeWidth="1.4" strokeDasharray={SPECIES_DASH.cut} /></svg>
              cut
            </span>
            <span className="text-zinc-400">·</span>
            <span className="text-zinc-500 text-[11px]">colored by lane dye (B/Y/G/R)</span>
          </div>
          <div className="h-5 w-px bg-sky-200" />
          <label className="flex items-center gap-1.5">
            <span className="text-zinc-600">gRNA:</span>
            <select
              value={speciesGrnaIdx}
              onChange={e => setSpeciesGrnaIdx(parseInt(e.target.value, 10))}
              className="px-2 py-0.5 text-xs border border-zinc-300 rounded bg-white max-w-[28ch] focus-ring"
            >
              <option value={-1}>None (no cut overlay)</option>
              {LAB_GRNA_CATALOG
                .map((g, i) => ({ g, i }))
                .filter(({ g }) => normalizeSpacer(g.spacer).length === 20)
                .map(({ g, i }) => (
                  <option key={`lab-${i}`} value={i}>{g.name} (lab catalog)</option>
                ))}
              {candidateGrnas.length > 0 && (
                <optgroup label={`Candidates in target window (${candidateGrnas.length})`}>
                  {candidateGrnas.map((g, i) => (
                    <option key={`cand-${g.id}`} value={1000 + i}>
                      {g.name} cut@{g.cut_construct}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
          {speciesGrnaIdx >= 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-600">chemistry:</span>
              {[-4, -1, 0, 1, 4].map(oh => {
                const on = speciesOverhangs.includes(oh);
                return (
                  <button
                    key={oh}
                    onClick={() => setSpeciesOverhangs(s => on ? s.filter(x => x !== oh) : [...s, oh].sort((a,b)=>a-b))}
                    className={`px-1.5 py-0.5 rounded border text-[11px] font-mono ${on ? "bg-sky-600 text-white border-sky-700" : "bg-white text-zinc-600 border-zinc-300 hover:border-zinc-400"}`}
                  >
                    {oh === 0 ? "blunt" : (oh > 0 ? `+${oh}` : `${oh}`)}
                  </button>
                );
              })}
            </div>
          )}
          <span className="ml-auto text-[11px] text-zinc-500">Lines drawn per dye lane below the trace.</span>
        </div>
      )}

      {/* Controls row 2: zoom presets + smoothing */}
      <div className="bg-white rounded-lg border border-zinc-200 p-2.5 mb-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1 text-xs flex-wrap">
          <span className="font-semibold uppercase tracking-wide text-zinc-500 mr-1">Zoom</span>
          {presets.map(p => (
            <button key={p.l} onClick={() => setRange(p.r)} className="px-2 py-1 rounded border border-zinc-300 bg-white hover:bg-zinc-100">{p.l}</button>
          ))}
          <button onClick={resetZoom} className="px-2 py-1 rounded border border-zinc-300 bg-white hover:bg-zinc-100">Reset</button>
          <span className="ml-3 text-zinc-500">x: {range[0].toFixed(1)}–{range[1].toFixed(1)} bp</span>
        </div>
        <div className="h-5 w-px bg-zinc-200" />
        <label className="flex items-center gap-2 text-xs">
          <span className="font-semibold uppercase tracking-wide text-zinc-500">Smoothing</span>
          <input type="range" min="0.5" max="3" step="0.1" value={smoothing}
                 onChange={e => setSmoothing(parseFloat(e.target.value))} className="accent-zinc-700 w-28" />
          <span className="tabular-nums text-zinc-600 w-10">{smoothing.toFixed(1)}x</span>
        </label>
        <label className="flex items-center gap-1 text-xs ml-auto cursor-pointer">
          <input type="checkbox" checked={showLadder} onChange={e => setShowLadder(e.target.checked)} className="w-3.5 h-3.5 accent-orange-500" />
          LIZ ladder marks
        </label>
        <button
          onClick={() => setShowAdvanced(v => !v)}
          className={`px-2 py-1 text-xs rounded border transition ${showAdvanced ? "bg-zinc-900 text-white border-zinc-900" : "bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-100"}`}
          title="Y-axis scaling, raw trace, preprocessing, display tuning"
        >
          Advanced {showAdvanced ? "▾" : "▸"}
        </button>
      </div>

      {/* Advanced display panel — collapsible, stays out of the way for 95% of views.
          Groups the Y-axis controls, raw-trace options, and preprocessing pipeline. */}
      {showAdvanced && (
        <div className="bg-zinc-50 border border-zinc-300 rounded-lg p-3 mb-2 text-xs space-y-3 no-print">
          {/* Y-axis scaling group */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="font-semibold uppercase tracking-wide text-zinc-600">Y-axis</span>
            <div className="inline-flex rounded-md border border-zinc-300 overflow-hidden">
              {[
                { k: "auto",   l: "Auto (per-lane)" },
                { k: "shared", l: "Shared" },
                { k: "manual", l: "Manual" },
              ].map(o => (
                <button key={o.k} onClick={() => setYScaleMode(o.k)}
                  className={`px-2 py-1 ${yScaleMode === o.k ? "bg-zinc-900 text-white" : "bg-white text-zinc-700 hover:bg-zinc-100"}`}>
                  {o.l}
                </button>
              ))}
            </div>
            {yScaleMode !== "manual" && (
              <label className="flex items-center gap-2">
                <span className="text-zinc-600">Y-zoom</span>
                <input type="range" min="0.2" max="5" step="0.1" value={yZoom}
                       onChange={e => setYZoom(parseFloat(e.target.value))} className="accent-zinc-700 w-32" />
                <span className="tabular-nums text-zinc-600 w-10">{yZoom.toFixed(1)}x</span>
                <button onClick={() => setYZoom(1.0)} className="px-1.5 py-0.5 border border-zinc-300 rounded bg-white hover:bg-zinc-100" title="Reset to 1.0x">
                  <RotateCcw size={11} />
                </button>
              </label>
            )}
            {yScaleMode === "manual" && (
              <label className="flex items-center gap-2">
                <span className="text-zinc-600">Y-max</span>
                <input type="number" min="100" step="100" value={yMaxManual}
                       onChange={e => setYMaxManual(Math.max(10, parseFloat(e.target.value) || 100))}
                       className="w-24 px-1.5 py-0.5 text-xs border border-zinc-300 rounded bg-white focus-ring tabular-nums" />
                <span className="text-zinc-500">RFU</span>
              </label>
            )}
          </div>

          {/* Display tuning group */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="font-semibold uppercase tracking-wide text-zinc-600">Display</span>
            <label className="flex items-center gap-2">
              <span className="text-zinc-600">Grid</span>
              <select value={gridDensity} onChange={e => setGridDensity(e.target.value)}
                      className="px-1.5 py-0.5 text-xs border border-zinc-300 rounded bg-white focus-ring">
                <option value="fine">Fine</option>
                <option value="normal">Normal</option>
                <option value="sparse">Sparse</option>
              </select>
            </label>
            <label className="flex items-center gap-2" title="Stroke opacity of the modeled trace line (peak-table gaussian path)">
              <span className="text-zinc-600">Trace α</span>
              <input type="range" min="0.1" max="1" step="0.05" value={traceOpacity}
                     onChange={e => setTraceOpacity(parseFloat(e.target.value))} className="accent-zinc-700 w-24" />
              <span className="tabular-nums text-zinc-600 w-10">{traceOpacity.toFixed(2)}</span>
            </label>
            <label className="flex items-center gap-2" title="Fill opacity of the modeled trace">
              <span className="text-zinc-600">Fill α</span>
              <input type="range" min="0" max="0.6" step="0.02" value={fillOpacity}
                     onChange={e => setFillOpacity(parseFloat(e.target.value))} className="accent-zinc-700 w-24" />
              <span className="tabular-nums text-zinc-600 w-10">{fillOpacity.toFixed(2)}</span>
            </label>
            <label className="flex items-center gap-2" title="Hide peak labels whose height is below this % of the lane Y-max (declutters busy traces)">
              <span className="text-zinc-600">Label ≥</span>
              <input type="range" min="0" max="50" step="1" value={peakLabelThreshold}
                     onChange={e => setPeakLabelThreshold(parseFloat(e.target.value))} className="accent-zinc-700 w-24" />
              <span className="tabular-nums text-zinc-600 w-10">{peakLabelThreshold}%</span>
            </label>
          </div>

          {/* Noise floor group — independent of raw trace toggle because the
              noise-floor line is useful even when the raw overlay is off */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="font-semibold uppercase tracking-wide text-zinc-600">Noise floor</span>
            <label className={`flex items-center gap-1 ${hasRawTrace ? "cursor-pointer" : "opacity-50"}`}
                   title={hasRawTrace ? "Draw a dashed reference line per lane at median (peak noise floor) + 3σ, computed from robust MAD of the raw trace. Peaks below the line are likely noise." : "Needs a raw trace (load .fsa/.ab1)"}>
              <input type="checkbox" checked={showNoiseFloor} disabled={!hasRawTrace}
                     onChange={e => setShowNoiseFloor(e.target.checked)} className="w-3.5 h-3.5 accent-slate-600" />
              <span className="font-medium text-zinc-700">Show noise floor (3σ)</span>
            </label>
            {hasRawTrace && showNoiseFloor && (
              <span className="text-[11px] text-zinc-500">
                {["B","G","Y","R"].filter(d => snrInfo.noiseFloorByDye[d] != null).map(d => (
                  <span key={d} className="inline-block mr-2">
                    <DyeChip dye={d} /> <span className="font-mono text-zinc-700">{snrInfo.noiseFloorByDye[d].toFixed(0)}</span>
                  </span>
                ))}
              </span>
            )}
          </div>

          {/* Raw trace group */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="font-semibold uppercase tracking-wide text-zinc-600">Raw trace</span>
            <label className={`flex items-center gap-1 ${hasRawTrace ? "cursor-pointer" : "opacity-50"}`}
                   title={hasRawTrace ? "Overlay the unsmoothed instrument signal (DATA1..4 from the .fsa)" : "Raw trace not available — this sample was loaded from GeneMapper TSV (peaks only). Load .fsa / .ab1 to enable."}>
              <input type="checkbox" checked={showRawTrace} disabled={!hasRawTrace}
                     onChange={e => setShowRawTrace(e.target.checked)} className="w-3.5 h-3.5 accent-fuchsia-600" />
              <span className="font-medium text-zinc-700">Show unsmoothed raw signal</span>
              {!hasRawTrace && <span className="ml-1 text-zinc-500">(load .fsa/.ab1)</span>}
            </label>
            {hasRawTrace && showRawTrace && (
              <>
                <div className="inline-flex rounded-md border border-zinc-300 overflow-hidden" title="Raw = preprocessed DATA1..4 overlay. Residual = raw − modeled gaussians (centered on 0).">
                  {[
                    { k: "raw",      l: "Raw" },
                    { k: "residual", l: "Residual" },
                  ].map(o => (
                    <button key={o.k} onClick={() => setOverlayMode(o.k)}
                      className={`px-2 py-1 text-xs ${overlayMode === o.k ? "bg-fuchsia-600 text-white" : "bg-white text-zinc-700 hover:bg-zinc-100"}`}>
                      {o.l}
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-2">
                  <span className="text-zinc-600">Raw α</span>
                  <input type="range" min="0.1" max="1" step="0.05" value={rawOpacity}
                         onChange={e => setRawOpacity(parseFloat(e.target.value))} className="accent-fuchsia-600 w-24" />
                  <span className="tabular-nums text-zinc-600 w-10">{rawOpacity.toFixed(2)}</span>
                </label>
                <label className="flex items-center gap-2">
                  <span className="text-zinc-600">Stroke</span>
                  <input type="range" min="0.4" max="2" step="0.1" value={rawStroke}
                         onChange={e => setRawStroke(parseFloat(e.target.value))} className="accent-fuchsia-600 w-24" />
                  <span className="tabular-nums text-zinc-600 w-10">{rawStroke.toFixed(1)}</span>
                </label>
              </>
            )}
          </div>

          {/* Preprocessing pipelines (only apply to raw traces). When pairing
              is active and the reference sample has a raw trace, a SECOND
              subsection appears for reference-specific preprocessing — so
              the dotted uncut overlay can have e.g. baseline subtraction on
              while the solid cut trace keeps Savitzky–Golay smoothing. */}
          {hasRawTrace && (
            <PrepControls
              title={pairMode !== "none" && hasRefRaw ? "Preprocess · current (cut, solid)" : "Preprocess"}
              accent="zinc"
              prep={prep}
              setPrepField={setPrepField}
            />
          )}
          {hasRawTrace && pairMode !== "none" && hasRefRaw && (
            <PrepControls
              title="Preprocess · reference (uncut, dotted)"
              accent="indigo"
              prep={prepRef}
              setPrepField={setPrepRefField}
            />
          )}
        </div>
      )}

      {/* Electropherogram */}
      <div className="bg-white rounded-lg border border-zinc-200 p-2 mb-2">
        <div className="px-2 pt-1 pb-1 flex items-center justify-between flex-wrap gap-2">
          <div className="text-sm font-medium">{sample}</div>
          <div className="flex items-center gap-3">
            <div className="text-[11px] text-zinc-500">
              Drag on plot to zoom · {Object.values(peaksByChannel).reduce((t, a) => t + a.length, 0)} peaks in window
            </div>
            <ExportMenu svgRef={svgRef} basename={`${sample}_electropherogram`} label="Export" />
          </div>
        </div>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto cursor-crosshair select-none"
          onMouseDown={onDown}
          onMouseMove={onMove}
          onMouseUp={onUp}
          onMouseLeave={() => { setDrag(null); setHover(null); }}
        >
          {/* Dotted-vs-solid legend — rendered INSIDE the SVG so exported
              figures self-describe: dotted line = reference (uncut) sample,
              solid line = current (cut) sample. Swatches show actual dash
              patterns using neutral slate so the dye lanes below remain the
              visual anchor; the sample names are rendered in mono so
              filenames like V059_4-5 and gRNA3_1-1 read cleanly. */}
          {showPairLegend && (
            <g>
              <rect x={m.l} y="6" width={plotW} height="24" rx="3"
                    fill="#f8fafc" stroke="#e2e8f0" strokeWidth="0.8" />
              <g transform={`translate(${m.l + 10}, 18)`}>
                <line x1="0" y1="0" x2="28" y2="0"
                      stroke="#334155" strokeWidth="1.3"
                      strokeDasharray="1 3" strokeLinecap="round" />
                <text x="34" y="3" fontSize="10" fill="#334155" fontWeight="600">uncut</text>
                <text x="70" y="3" fontSize="9.5" fill="#64748b"
                      fontFamily="ui-monospace, JetBrains Mono, monospace">{resolvedReference}</text>
              </g>
              <g transform={`translate(${m.l + plotW / 2 + 10}, 18)`}>
                <line x1="0" y1="0" x2="28" y2="0"
                      stroke="#334155" strokeWidth="1.6" />
                <text x="34" y="3" fontSize="10" fill="#334155" fontWeight="600">cut</text>
                <text x="60" y="3" fontSize="9.5" fill="#64748b"
                      fontFamily="ui-monospace, JetBrains Mono, monospace">{sample}</text>
              </g>
            </g>
          )}
          {lanes.map((lane, li) => {
            const yScale = h => {
              const norm = logY ? Math.log10(Math.max(1, h + 1)) / Math.log10(Math.max(2, lane.yMax + 1)) : h / lane.yMax;
              return lane.top + lane.h - Math.min(1, norm) * lane.h;
            };
            const yTicks = logY
              ? [1, 10, 100, 1000, 10000, 100000].filter(v => v <= lane.yMax * 1.2)
              : computeLinearTicks(lane.yMax);

            return (
              <g key={li}>
                <rect x={m.l} y={lane.top} width={plotW} height={lane.h} fill="#fafbfc" />

                {yTicks.map(t => (
                  <g key={`y${li}-${t}`}>
                    <line x1={m.l} x2={m.l + plotW} y1={yScale(t)} y2={yScale(t)} stroke="#eef2f7" />
                    <text x={m.l - 4} y={yScale(t) + 3} fontSize="9" textAnchor="end" fill="#64748b">
                      {formatTick(t)}
                    </text>
                  </g>
                ))}

                {xTicks.map(t => (
                  <line key={`xg${li}-${t}`} x1={xScale(t)} x2={xScale(t)} y1={lane.top} y2={lane.top + lane.h} stroke="#eef2f7" />
                ))}

                {/* LIZ ladder marks on bottom lane only */}
                {showLadder && li === lanes.length - 1 && LIZ_LADDER
                  .filter(v => v >= range[0] && v <= range[1])
                  .map(v => (
                    <g key={`liz${v}`}>
                      <line x1={xScale(v)} x2={xScale(v)} y1={lane.top + lane.h} y2={lane.top + lane.h + 5} stroke="#ef6c00" strokeWidth="1.5" />
                    </g>
                  ))}

                {/* Lane frame */}
                <line x1={m.l} x2={m.l + plotW} y1={lane.top + lane.h} y2={lane.top + lane.h} stroke="#334155" />
                <line x1={m.l} x2={m.l} y1={lane.top} y2={lane.top + lane.h} stroke="#334155" />

                {/* Lane label */}
                {stackChannels && (
                  <g>
                    <rect x={m.l + 6} y={lane.top + 4} width={82} height={16} rx="3" fill="white" stroke="#e2e8f0" />
                    <circle cx={m.l + 14} cy={lane.top + 12} r="3.5" fill={colorFor(lane.dyes[0])} />
                    <text x={m.l + 22} y={lane.top + 15} fontSize="10" fill="#334155" fontWeight="500">
                      {DYE[lane.dyes[0]].label} · {DYE[lane.dyes[0]].name}
                    </text>
                  </g>
                )}

                {/* Expected peak markers (per dye, for lane) */}
                {showExpected && lane.dyes.map(dye => {
                  if (dye === "O" || !s) return null;
                  const exp = s.expected[dye];
                  if (exp < range[0] || exp > range[1]) return null;
                  const x = xScale(exp);
                  const color = colorFor(dye);
                  return (
                    <g key={`exp-${li}-${dye}`} pointerEvents="none">
                      <line x1={x} x2={x} y1={lane.top} y2={lane.top + lane.h} stroke={color} strokeWidth="1" strokeDasharray="3 3" opacity="0.55" />
                      <rect x={x - 18} y={lane.top + 2} width={36} height={11} rx="2" fill={color} opacity="0.85" />
                      <text x={x} y={lane.top + 10} fontSize="8" textAnchor="middle" fill="white" fontWeight="600">
                        {exp.toFixed(1)}
                      </text>
                    </g>
                  );
                })}

                {/* Expected SPECIES overlay (assembly + monomer + cut) — colored by dye, kind via dash pattern.
                    Uses enumerateAllSpeciesWithIds so labels are short tags (A1/M2/C3) with
                    full nomenclature in the sidebar / popover / SVG <title>. */}
                {showSpecies && lane.dyes.map(dye => {
                  if (dye === "O") return null;
                  const species = (allSpeciesWithIds || [])
                    .filter(sp => sp.dye === dye)
                    .filter(sp => sp.size >= range[0] && sp.size <= range[1])
                    .filter(sp => !hiddenSpeciesIds.has(speciesId(sp, dye)));
                  if (species.length === 0) return null;
                  // Stack labels across rows. More rows now because cut labels are longer
                  // (full Cas9 nomenclature) so they need more vertical headroom.
                  const minLabelDx = (range[1] - range[0]) / Math.max(1, plotW / 110);
                  const rows = [];
                  const nRows = 6;
                  const place = (size) => {
                    for (let r = 0; r < nRows; r++) {
                      if (rows[r] === undefined || size - rows[r] >= minLabelDx) { rows[r] = size; return r; }
                    }
                    rows[nRows - 1] = size;
                    return nRows - 1;
                  };
                  // Color from dye palette so the overlay reads as belonging to that channel.
                  // Kind is conveyed by stroke-dash pattern (assembly=short dash, monomer=dotted, cut=long dash).
                  const dyeColor = colorFor(dye);
                  return (
                    <g key={`spec-${li}-${dye}`} pointerEvents="none">
                      {species.map((sp, idx) => {
                        const x = xScale(sp.size);
                        const row = place(sp.size);
                        const labelY = lane.top + 14 + row * 13;
                        const tag = sp.displayId || "?";
                        const tagW = Math.max(14, tag.length * 6.2);
                        return (
                          <g key={`sp-${idx}`}>
                            <line
                              x1={x} x2={x} y1={lane.top} y2={lane.top + lane.h}
                              stroke={dyeColor} strokeWidth="0.85"
                              strokeDasharray={SPECIES_DASH[sp.kind] || "1 2"}
                              opacity="0.7"
                            />
                            {/* Compact tag pill: lane-dye background + monospace ID */}
                            <g>
                              <rect
                                x={x - tagW / 2} y={labelY - 7}
                                width={tagW} height={11} rx={2.5}
                                fill={dyeColor} opacity="0.92"
                                stroke="white" strokeWidth="0.8"
                              />
                              <text
                                x={x} y={labelY + 1.5}
                                fontSize="8.5"
                                fill="white"
                                fontWeight="700"
                                textAnchor="middle"
                                style={{ fontFamily: "JetBrains Mono, monospace" }}
                              >
                                <title>{sp.fullLabel || sp.label} · {sp.size} bp</title>
                                {tag}
                              </text>
                            </g>
                          </g>
                        );
                      })}
                    </g>
                  );
                })}

                {/* Noise-floor reference line. Position: yScale(noiseFloor)
                    inside each lane, clipped to the lane frame. Dashed slate
                    color so it reads as a reference, not signal. */}
                {showNoiseFloor && hasRawTrace && lane.dyes.map(dye => {
                  const nf = snrInfo.noiseFloorByDye[dye];
                  if (nf == null) return null;
                  const y = yScale(nf);
                  if (y < lane.top || y > lane.top + lane.h) return null;
                  return (
                    <g key={`nf-${li}-${dye}`} pointerEvents="none">
                      <line x1={m.l} x2={m.l + plotW} y1={y} y2={y}
                            stroke="#475569" strokeWidth="0.7" strokeDasharray="3 2" opacity="0.7" />
                      {stackChannels && (
                        <text x={m.l + plotW - 3} y={y - 2} fontSize="8" fill="#475569" textAnchor="end" fontWeight="600">
                          3σ · {nf.toFixed(0)}
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* Reference-sample ghost trace (uncut/control overlay).
                    Drawn BEFORE the current sample so it sits behind, in a
                    muted gray so it reads as "previous state." In mirror
                    mode the lane height is halved and the ghost goes below
                    the x-axis reflected — a butterfly layout that makes
                    added/removed signal obvious at a glance. */}
                {pairMode !== "none" && resolvedReference && lane.dyes.map(dye => {
                  const lrp = (refPeaks[dye] || [])
                    .filter(p => p[0] >= range[0] - 5 && p[0] <= range[1] + 5);
                  if (!lrp.length) return null;
                  // Reference (uncut) uses the DYE color with a dotted pattern
                  // and the current sample (cut) uses the same dye color with
                  // a solid line. `strokeLinecap="round"` + `strokeDasharray=
                  // "1 3"` yields true dots in SVG.
                  //
                  // Y-axis scaling: when pairScale === "independent" the
                  // reference path normalizes to its OWN per-channel max
                  // (refYMaxByChannel[dye]). When "shared" it uses the lane
                  // yMax (which is derived from the CURRENT sample). This is
                  // per-sample normalization — shape/position comparison
                  // decoupled from absolute signal intensity.
                  const refColor = colorFor(dye);
                  const refFill  = colorFor(dye);
                  const refYMax = pairScale === "independent"
                    ? Math.max(10, refYMaxByChannel[dye])
                    : lane.yMax;
                  const refDash = dashFor(refStyle.dash);
                  if (pairMode === "mirror") {
                    const halfGeom = { laneTop: lane.top + lane.h / 2, laneH: lane.h / 2, mLeft: m.l, plotW };
                    const path = buildGaussianPath(
                      lrp.map(p => [p[0], p[1], p[2], p[3]]),
                      range, refYMax, halfGeom, smoothing, false
                    );
                    return (
                      <g key={`refmir-${li}-${dye}`}
                         transform={`matrix(1 0 0 -1 0 ${2 * (lane.top + lane.h / 2)})`}>
                        <path d={path.fill}   fill={refFill} opacity={refStyle.fillOpacity} />
                        <path d={path.stroke} fill="none" stroke={refColor}
                              strokeWidth={refStyle.strokeWidth}
                              opacity={refStyle.strokeOpacity}
                              strokeDasharray={refDash.dashArr} strokeLinecap={refDash.cap}
                              vectorEffect="non-scaling-stroke" />
                      </g>
                    );
                  }
                  const laneGeom = { laneTop: lane.top, laneH: lane.h, mLeft: m.l, plotW };
                  const path = buildGaussianPath(
                    lrp.map(p => [p[0], p[1], p[2], p[3]]),
                    range, refYMax, laneGeom, smoothing, logY
                  );
                  return (
                    <g key={`refovl-${li}-${dye}`}>
                      <path d={path.fill}   fill={refFill} opacity={refStyle.fillOpacity} />
                      <path d={path.stroke} fill="none" stroke={refColor}
                            strokeWidth={refStyle.strokeWidth}
                            opacity={refStyle.strokeOpacity}
                            strokeDasharray={refDash.dashArr} strokeLinecap={refDash.cap}
                            vectorEffect="non-scaling-stroke" />
                    </g>
                  );
                })}

                {/* Reference raw trace (preprocessed by prepRef). Drawn only
                    when the user has the "show raw trace" overlay on AND the
                    reference sample has an .fsa-derived trace. Uses the
                    reference's independent yMax when pairScale === "independent"
                    so each sample's raw trace scales to its own peak max. */}
                {showRawTrace && pairMode !== "none" && hasRefRaw && lane.dyes.map(dye => {
                  const r = refRawByChannel[dye];
                  if (!r || !r.xs.length) return null;
                  const refYMax = pairScale === "independent"
                    ? Math.max(10, refYMaxByChannel[dye])
                    : lane.yMax;
                  // Same yScale transform as the lane, but rebuilt against
                  // refYMax to normalize the reference sample independently.
                  const yOfRef = (v) => {
                    const norm = logY
                      ? Math.log10(Math.max(1, v + 1)) / Math.log10(Math.max(2, refYMax + 1))
                      : Math.max(0, v) / refYMax;
                    return lane.top + lane.h - Math.min(1, norm) * lane.h;
                  };
                  const { xs, ys } = r;
                  let d2 = "";
                  for (let i = 0; i < xs.length; i++) {
                    const px = xScale(xs[i]);
                    const py = yOfRef(ys[i]);
                    d2 += (i === 0 ? "M" : "L") + px.toFixed(1) + "," + py.toFixed(1);
                  }
                  return (
                    <path key={`rawref-${li}-${dye}`} d={d2} fill="none"
                          stroke={colorFor(dye)} strokeWidth={rawStroke}
                          opacity={rawOpacity * 0.85}
                          strokeDasharray="1 3" strokeLinecap="round"
                          vectorEffect="non-scaling-stroke">
                      <title>{`${dye} reference raw (${resolvedReference}, ${prepRef.smooth === "savgol" ? `SG ${prepRef.savgolWindow}/${prepRef.savgolOrder}` : "unsmoothed"}${prepRef.baseline ? ", baseline-subtracted" : ""}${prepRef.clip ? `, clipped@${prepRef.clipCeiling}` : ""}${pairScale === "independent" ? ", per-sample normalized" : ""})`}</title>
                    </path>
                  );
                })}

                {/* UNCUT + CUT reference markers. Drawn only on the top lane
                    when stacked (or on the single lane when overlaid). The
                    UNCUT line sits at the full construct size; CUT lines at
                    the picked gRNA's predicted product sizes per dye. */}
                {(showUncutCutMarkers || showPrecursorMarkers) && li === 0 && (
                  <g key={`ucmk-${li}`} pointerEvents="none">
                    {/* UNCUT — full construct length */}
                    {showUncutCutMarkers && constructSize >= range[0] && constructSize <= range[1] && (
                      <g>
                        <line x1={xScale(constructSize)} x2={xScale(constructSize)}
                              y1={m.t} y2={m.t + lanesCount * laneH + (lanesCount - 1) * laneGap}
                              stroke="#4f46e5" strokeWidth="1.4" strokeDasharray="1 0" opacity="0.82" />
                        <rect x={xScale(constructSize) - 24} y={m.t + 2}
                              width={48} height={12} rx="2" fill="#4f46e5" />
                        <text x={xScale(constructSize)} y={m.t + 11}
                              fontSize="8.5" fontWeight="700" fill="white" textAnchor="middle">
                          UNCUT
                        </text>
                      </g>
                    )}
                    {/* CUT — predicted cut-product sizes per dye (only when a gRNA is picked) */}
                    {showUncutCutMarkers && pickedGrnaForHover && (() => {
                      const markers = [];
                      for (const oh of speciesOverhangs) {
                        const pr = predictCutProducts(pickedGrnaForHover, constructSize, oh);
                        for (const dye of ["B", "G", "Y", "R"]) {
                          if (!pr[dye] || pr[dye].length <= 0) continue;
                          const sz = pr[dye].length;
                          if (sz < range[0] || sz > range[1]) continue;
                          markers.push({ size: sz, dye, overhang: oh, label: pr[dye].template });
                        }
                      }
                      return markers.map((mk, i) => (
                        <g key={`cutmk-${i}`}>
                          <line x1={xScale(mk.size)} x2={xScale(mk.size)}
                                y1={m.t} y2={m.t + lanesCount * laneH + (lanesCount - 1) * laneGap}
                                stroke={colorFor(mk.dye)} strokeWidth="1" strokeDasharray="5 2" opacity="0.85" />
                          <rect x={xScale(mk.size) - 22} y={m.t + 16 + (i % 4) * 14}
                                width={44} height={12} rx="2" fill={colorFor(mk.dye)} opacity="0.92" />
                          <text x={xScale(mk.size)} y={m.t + 25 + (i % 4) * 14}
                                fontSize="8.5" fontWeight="700" fill="white" textAnchor="middle"
                                style={{ fontFamily: "JetBrains Mono, monospace" }}>
                            CUT·{mk.dye}{mk.overhang === 0 ? "" : (mk.overhang > 0 ? `+${mk.overhang}` : mk.overhang)}
                          </text>
                        </g>
                      ));
                    })()}
                    {/* PRECURSORS — assembly-product sizes with distinct dotted lines */}
                    {showPrecursorMarkers && ASSEMBLY_PRODUCTS.map((prod, pi) => {
                      const sz = productSize(prod, componentSizes);
                      if (sz < range[0] || sz > range[1]) return null;
                      return (
                        <g key={`pre-${pi}`}>
                          <line x1={xScale(sz)} x2={xScale(sz)}
                                y1={m.t} y2={m.t + lanesCount * laneH + (lanesCount - 1) * laneGap}
                                stroke="#8b5cf6" strokeWidth="0.9" strokeDasharray="1 2" opacity="0.7" />
                          <text x={xScale(sz)} y={m.t + lanesCount * laneH + (lanesCount - 1) * laneGap - 2}
                                fontSize="7.5" fill="#8b5cf6" textAnchor="middle" fontWeight="600">
                            {prod.id || `pre${pi}`}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                )}

                {/* Trace/Stem rendering per dye */}
                {lane.dyes.map(dye => {
                  const lp = peaksByChannel[dye] || [];
                  if (!lp.length) return null;
                  const laneGeom = { laneTop: lane.top, laneH: lane.h, mLeft: m.l, plotW };
                  if (mode === "trace") {
                    const path = buildGaussianPath(
                      lp.map(p => [p.size, p.height, p.area, p.width]),
                      range, lane.yMax, laneGeom, smoothing, logY
                    );
                    const curDash = dashFor(currentStyle.dash);
                    // Only apply the per-sample (cut) style when pairing is
                    // on — keep the legacy global controls live on non-paired
                    // views so existing behavior is preserved.
                    const curFillOp   = pairMode !== "none" ? currentStyle.fillOpacity   : (stackChannels ? fillOpacity : fillOpacity * 0.5);
                    const curStrokeOp = pairMode !== "none" ? currentStyle.strokeOpacity : (dye === "O" ? traceOpacity * 0.68 : traceOpacity);
                    const curStrokeW  = pairMode !== "none" ? currentStyle.strokeWidth   : 1.5;
                    return (
                      <g key={`tr-${li}-${dye}`}>
                        <path d={path.fill}   fill={colorFor(dye)} opacity={curFillOp} />
                        <path d={path.stroke} fill="none" stroke={colorFor(dye)}
                              strokeWidth={curStrokeW} opacity={curStrokeOp}
                              strokeDasharray={curDash.dashArr} strokeLinecap={curDash.cap} />
                      </g>
                    );
                  } else {
                    return (
                      <g key={`st-${li}-${dye}`}>
                        {lp.map((p, i) => {
                          const x = xScale(p.size);
                          return <line key={i} x1={x} x2={x} y1={yScale(0)} y2={yScale(p.height)} stroke={colorFor(dye)} strokeWidth="1.2" opacity={dye === "O" ? 0.6 : 0.92} />;
                        })}
                      </g>
                    );
                  }
                })}

                {/* Raw unsmoothed signal overlay. Rendered only when the user
                    enables "Show unsmoothed raw signal" and the sample has an
                    .fsa-derived trace. In "raw" mode, draws preprocessed raw
                    samples on top of the modeled trace. In "residual" mode,
                    draws raw − modeled centered on a zero line at lane
                    midheight — negative residuals go below, positive above. */}
                {showRawTrace && hasRawTrace && overlayMode === "residual" && (
                  <g key={`resid-zero-${li}`} pointerEvents="none">
                    <line x1={m.l} x2={m.l + plotW}
                          y1={lane.top + lane.h / 2} y2={lane.top + lane.h / 2}
                          stroke="#0ea5e9" strokeDasharray="4 3" strokeWidth="0.8" opacity="0.55" />
                    <text x={m.l + 4} y={lane.top + lane.h / 2 - 2} fontSize="8" fill="#0ea5e9" fontWeight="600">
                      0 (residual)
                    </text>
                  </g>
                )}
                {showRawTrace && hasRawTrace && lane.dyes.map(dye => {
                  const r = rawByChannel[dye];
                  if (!r || !r.xs.length) return null;
                  const { xs, ys, residual } = r;
                  // Residual mode uses a symmetric scale around lane midline:
                  // ±yMax/2 fills the lane. Raw mode uses the standard yScale.
                  const laneMid = lane.top + lane.h / 2;
                  const residHalf = lane.h / 2;
                  const residRange = Math.max(lane.yMax / 2, 100);
                  const yOf = residual
                    ? (v) => laneMid - Math.max(-residHalf, Math.min(residHalf, (v / residRange) * residHalf))
                    : (v) => yScale(Math.max(0, v));
                  let d = "";
                  for (let i = 0; i < xs.length; i++) {
                    const px = xScale(xs[i]);
                    const py = yOf(ys[i]);
                    d += (i === 0 ? "M" : "L") + px.toFixed(1) + "," + py.toFixed(1);
                  }
                  const stroke = residual ? "#c026d3" : colorFor(dye);
                  return (
                    <path key={`raw-${li}-${dye}`} d={d} fill="none"
                          stroke={stroke} strokeWidth={rawStroke}
                          opacity={rawOpacity}
                          strokeDasharray={residual ? "none" : "2 1"}
                          vectorEffect="non-scaling-stroke">
                      <title>{residual
                        ? `${dye} residual (raw − modeled gaussians)`
                        : `${dye} raw (${prep.smooth === "savgol" ? `SG ${prep.savgolWindow}/${prep.savgolOrder}` : "unsmoothed"}${prep.baseline ? ", baseline-subtracted" : ""}${prep.clip ? `, clipped@${prep.clipCeiling}` : ""})`}</title>
                    </path>
                  );
                })}

                {/* Peak labels — show the top 4 tallest peaks in visible range,
                    subject to the user-settable min-height threshold. */}
                {labelPeaks && (() => {
                  const labeled = [];
                  const minH = (lane.yMax * peakLabelThreshold) / 100;
                  for (const dye of lane.dyes) {
                    if (dye === "O") continue;
                    const lp = (peaksByChannel[dye] || [])
                      .filter(p => p.size >= range[0] && p.size <= range[1])
                      .filter(p => p.height >= minH)
                      .sort((a, b) => b.height - a.height)
                      .slice(0, 4);
                    for (const p of lp) labeled.push({ ...p, dye });
                  }
                  return labeled.map((p, i) => {
                    const x = xScale(p.size);
                    const y = yScale(p.height);
                    return (
                      <g key={`lbl-${li}-${i}`} pointerEvents="none">
                        <text x={x} y={y - 4} fontSize="9" textAnchor="middle" fill={colorFor(p.dye)} fontWeight="600" fontFamily="ui-monospace, monospace">
                          {p.size.toFixed(1)}
                        </text>
                      </g>
                    );
                  });
                })()}

                {/* Per-peak click hit-targets. Vertical bars span the lane
                    so they're far easier to click than tiny circles; visible
                    dots overlay them when showPeakDots is on. */}
                {lane.dyes.map(dye =>
                  (peaksByChannel[dye] || [])
                    .filter(p => p.size >= range[0] && p.size <= range[1])
                    .map((p, i) => {
                      const x = xScale(p.size);
                      const y = yScale(p.height);
                      const pinned = pinnedPeak && pinnedPeak.dye === dye && Math.abs(pinnedPeak.size - p.size) < 0.05;
                      return (
                        <g key={`hit-${li}-${dye}-${i}`}>
                          {/* Big invisible hit-target rect (full lane height; ~7 px wide) */}
                          <rect
                            x={x - 4} y={lane.top}
                            width={8} height={lane.h}
                            fill="transparent"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPinnedPeak({
                                clientX: e.clientX, clientY: e.clientY,
                                dye, size: p.size, height: p.height, area: p.area,
                              });
                            }}
                            style={{ cursor: "pointer" }}
                          />
                          {/* Visible dot when toggle on, or pin highlight when this peak is selected */}
                          {(showPeakDots || pinned) && (
                            <circle
                              cx={x} cy={y}
                              r={pinned ? 5 : 3}
                              fill={pinned ? colorFor(dye) : "white"}
                              stroke={colorFor(dye)}
                              strokeWidth={pinned ? 1.5 : 1.2}
                              opacity={pinned ? 1 : (mode === "trace" ? 0.9 : 0.7)}
                              pointerEvents="none"
                            />
                          )}
                        </g>
                      );
                    })
                )}
              </g>
            );
          })}

          {/* X tick labels */}
          {xTicks.map(t => (
            <g key={`xl${t}`}>
              <line x1={xScale(t)} x2={xScale(t)} y1={H - m.b} y2={H - m.b + 4} stroke="#94a3b8" />
              <text x={xScale(t)} y={H - m.b + 15} fontSize="10" textAnchor="middle" fill="#64748b">{t}</text>
            </g>
          ))}
          <text x={m.l + plotW / 2} y={H - 6} fontSize="11" textAnchor="middle" fill="#334155" fontWeight="500">Size (bp)</text>
          <text x={14} y={m.t + (H - m.t - m.b) / 2} fontSize="11" textAnchor="middle" fill="#334155" fontWeight="500"
                transform={`rotate(-90, 14, ${m.t + (H - m.t - m.b) / 2})`}>
            Fluorescence (RFU{logY ? ", log" : ""})
          </text>

          {/* Drag rectangle */}
          {drag && Math.abs(drag.e - drag.s) > 0.1 && (
            <rect
              x={xScale(Math.min(drag.s, drag.e))}
              y={m.t}
              width={Math.abs(xScale(drag.e) - xScale(drag.s))}
              height={H - m.t - m.b}
              fill="#1e6fdb" opacity="0.10" stroke="#1e6fdb" strokeDasharray="3 3"
            />
          )}

          {/* Hover tooltip */}
          {hover && (() => {
            const tw = 156, th = 78;
            const tx = Math.min(W - m.r - tw - 4, Math.max(m.l + 4, hover.x + 10));
            const ty = Math.max(m.t + 4, hover.y - th - 8);
            const exp = s ? s.expected[hover.dye] : null;
            const delta = (exp !== undefined) ? (hover.size - exp) : null;
            return (
              <g pointerEvents="none">
                <rect x={tx} y={ty} width={tw} height={th} rx="4" fill="#0f172a" opacity="0.94" />
                <text x={tx + 8} y={ty + 16} fontSize="11" fill="#fff" fontWeight="600">
                  {DYE[hover.dye].label} · {DYE[hover.dye].name}
                </text>
                <text x={tx + 8} y={ty + 31} fontSize="11" fill="#cbd5e1">Size: {hover.size.toFixed(3)} bp</text>
                <text x={tx + 8} y={ty + 45} fontSize="11" fill="#cbd5e1">Height: {Math.round(hover.height).toLocaleString()}</text>
                <text x={tx + 8} y={ty + 59} fontSize="11" fill="#cbd5e1">Area: {Math.round(hover.area).toLocaleString()} · W {hover.width.toFixed(2)}</text>
                {delta !== null && (
                  <text x={tx + 8} y={ty + 73} fontSize="11" fill="#fef08a">
                    Δ expected: {delta >= 0 ? "+" : ""}{delta.toFixed(2)} bp
                  </text>
                )}
              </g>
            );
          })()}
        </svg>
      </div>

      {/* Side-by-side: per-sample Peak ID summary + visible window peak list */}
      <div className="grid md:grid-cols-2 gap-2 mb-3">
        <SampleSummaryCard sample={sample} cfg={cfg} setCfg={setCfg} results={results[sample]} />
        <VisibleWindowCard peaksByChannel={peaksByChannel} results={results[sample]} cfg={cfg[sample]} />
      </div>

      {/* Peak-shift analysis: quantitative companion to the dotted/solid
          overlay. For each dye, compute the observed bp shift between
          current-sample peaks and nearest reference-sample peaks within tol.
          Displayed as a compact per-dye row with n + median + mean. Only
          meaningful when pairing is active. */}
      {pairMode !== "none" && resolvedReference && (
        <PeakShiftPanel
          currentSample={sample}
          referenceSample={resolvedReference}
          currentPeaks={peaks}
          referencePeaks={refPeaks}
          palette={palette}
        />
      )}

      {/* Construct architecture diagram — always visible on the front page so
          users see the molecular context alongside the chromatogram. Shows
          the picked gRNA's cut site + overhang when available. */}
      <div className="bg-white rounded-lg border border-zinc-200 p-3 mb-3">
        <div className="text-sm font-semibold text-zinc-800 mb-2">
          Construct architecture
          {pickedGrnaForHover && (
            <span className="ml-2 text-xs font-normal text-zinc-500">
              cut by <span className="font-mono text-zinc-700">{pickedGrnaForHover.name}</span>
            </span>
          )}
        </div>
        <ConstructDiagram
          componentSizes={componentSizes}
          highlightKey={null}
          onHighlight={null}
          onSizeChange={null}
          cutConstructPos={pickedGrnaForHover ? pickedGrnaForHover.cut_construct : null}
          overhang={pickedGrnaForHover ? Math.abs(speciesOverhangs[0] || 0) : null}
          grnaStrand={pickedGrnaForHover ? pickedGrnaForHover.strand : null}
          pamStart={pickedGrnaForHover ? pickedGrnaForHover.pam_start : null}
          pamSeq={pickedGrnaForHover ? pickedGrnaForHover.pam_seq : null}
        />
      </div>

      {/* End-structure editor + post-dA-tailing products. Offsets are
          shared so the post-tailing panel reflects whatever the user nudged. */}
      {pickedGrnaForHover && (
        <>
          <EndStructureEditor
            cutPos={pickedGrnaForHover.cut_construct}
            canonicalOverhang={speciesOverhangs[0] || 0}
            constructSize={constructSize}
            offsets={endOffsets}
            setOffsets={setEndOffsets}
          />
          <PostTailingPanel
            cutPos={pickedGrnaForHover.cut_construct}
            canonicalOverhang={speciesOverhangs[0] || 0}
            constructSize={constructSize}
            offsets={endOffsets}
            topSeq={constructSeq}
          />
        </>
      )}

      {/* ssDNA cut products diagram — rendered when a gRNA is picked so the
          four expected fluorophore-labeled single strands are visible
          immediately alongside the chromatogram and construct diagram. */}
      {pickedGrnaForHover && (() => {
        const oh = speciesOverhangs[0] || 0;
        const products = predictCutProducts(pickedGrnaForHover, constructSize, oh);
        return (
          <div className="bg-white rounded-lg border border-zinc-200 p-3 mb-3">
            <div className="text-sm font-semibold text-zinc-800 mb-2">
              Expected ssDNA cut products
              <span className="ml-2 text-xs font-normal text-zinc-500">
                <span className="font-mono text-zinc-700">{pickedGrnaForHover.name}</span>
                {" · "}
                {oh === 0 ? "blunt" : (oh > 0 ? `+${oh} overhang` : `${oh} overhang`)}
              </span>
            </div>
            <ProductFragmentViz products={products} constructSize={constructSize} />
          </div>
        );
      })()}

      {/* Static species reference card — always open by default so every
          expected species (assembly + monomer + cut) is visible on the
          front page without extra clicks. */}
      <SpeciesLegend
        componentSizes={componentSizes}
        defaultOpen={true}
        gRNAs={pickedGrnaForHover ? [pickedGrnaForHover] : []}
        overhangs={speciesOverhangs}
        constructSize={constructSize}
      />
        </div>

        {/* Right-rail sidebar with per-species visibility toggles */}
        {showSpecies && (
          <SpeciesSidebar
            componentSizes={componentSizes}
            constructSize={constructSize}
            gRNAs={pickedGrnaForHover ? [pickedGrnaForHover] : []}
            overhangs={pickedGrnaForHover ? speciesOverhangs : []}
            dyes={["B", "G", "Y", "R"]}
            hiddenIds={hiddenSpeciesIds}
            onToggleId={toggleHidden}
            onShowAll={() => setHiddenSpeciesIds(new Set())}
            onHideAll={() => {
              const all = new Set();
              for (const d of ["B","G","Y","R"]) {
                for (const sp of expectedSpeciesForDye(d, componentSizes, constructSize, pickedGrnaForHover ? [pickedGrnaForHover] : [], pickedGrnaForHover ? speciesOverhangs : [])) {
                  all.add(speciesId(sp, d));
                }
              }
              setHiddenSpeciesIds(all);
            }}
          />
        )}
      </div>

      {/* Click-pinned popover: every species whose size matches the clicked peak */}
      {pinnedPeak && (
        <PeakSpeciesPopover
          hover={pinnedPeak}
          componentSizes={componentSizes}
          constructSize={constructSize}
          gRNAs={pickedGrnaForHover ? [pickedGrnaForHover] : []}
          overhangs={pickedGrnaForHover ? speciesOverhangs : []}
          tol={2.5}
          onClose={() => setPinnedPeak(null)}
        />
      )}
    </>
  );
}
