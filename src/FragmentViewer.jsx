import { useState, useMemo, useRef, useEffect } from "react";
import {
  Activity, Crosshair, Scissors, Layers, GitCompare,
  Upload, Database, Microscope, FileDown, RotateCcw,
  CheckCircle2, AlertTriangle, ChevronRight, ExternalLink,
} from "lucide-react";

// ----------------------------------------------------------------------
// Design system — small set of primitives reused across tabs.
// Built on Tailwind (configured in tailwind.config.js with dye accents).
// ----------------------------------------------------------------------

// Wrapper card: rounded, subtle shadow, optional header with title + actions.
export function Panel({ title, subtitle, actions, children, className = "", padded = true }) {
  return (
    <section className={`bg-white rounded-xl border border-zinc-200 shadow-soft overflow-hidden ${className}`}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 px-4 py-3 border-b border-zinc-100">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-zinc-900 tracking-tight truncate">{title}</h2>}
            {subtitle && <p className="text-xs text-zinc-500 mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-1.5 shrink-0">{actions}</div>}
        </header>
      )}
      <div className={padded ? "p-4" : ""}>{children}</div>
    </section>
  );
}

// Big-number metric tile.
export function Stat({ label, value, hint, tone = "default" }) {
  const toneCls = {
    default: "text-zinc-900",
    sky: "text-sky-700",
    emerald: "text-emerald-700",
    amber: "text-amber-700",
    rose: "text-rose-700",
  }[tone] || "text-zinc-900";
  return (
    <div className="px-3 py-2.5 rounded-lg bg-zinc-50 border border-zinc-100">
      <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`mt-0.5 text-xl font-semibold tracking-tight num ${toneCls}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-zinc-500">{hint}</div>}
    </div>
  );
}

// Inline rounded label; optional accent color.
export function Pill({ children, tone = "neutral", className = "" }) {
  const tones = {
    neutral: "bg-zinc-100 text-zinc-700 border-zinc-200",
    sky:     "bg-sky-50 text-sky-700 border-sky-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber:   "bg-amber-50 text-amber-800 border-amber-200",
    rose:    "bg-rose-50 text-rose-700 border-rose-200",
    dark:    "bg-zinc-900 text-zinc-100 border-zinc-900",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium rounded border ${tones[tone] || tones.neutral} ${className}`}>
      {children}
    </span>
  );
}

// Color-coded dye reference. Use anywhere a dye letter appears so users
// associate the channel with its color throughout the viewer.
export function DyeChip({ dye, showLabel = false, className = "" }) {
  const palette = { B: "#1e6fdb", G: "#16a34a", Y: "#ca8a04", R: "#dc2626", O: "#ea580c" };
  const label   = { B: "6-FAM",   G: "HEX",     Y: "TAMRA",   R: "ROX",     O: "GS500LIZ" };
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span aria-hidden className="w-2.5 h-2.5 rounded-full ring-1 ring-inset ring-black/10" style={{ background: palette[dye] || "#94a3b8" }} />
      <span className="text-xs font-mono text-zinc-700">{dye}</span>
      {showLabel && <span className="text-[11px] text-zinc-500">{label[dye] || dye}</span>}
    </span>
  );
}

// Form field wrapper: label + input. Pass <input> / <select> as children.
export function Field({ label, hint, children, className = "" }) {
  return (
    <label className={`flex flex-col gap-1 text-xs ${className}`}>
      <span className="font-medium text-zinc-700">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-zinc-500">{hint}</span>}
    </label>
  );
}

// Standard button used in chrome + tab toolbars.
export function ToolButton({ icon: Icon, children, onClick, title, variant = "ghost", size = "sm", type = "button", className = "" }) {
  const variants = {
    primary: "bg-zinc-900 text-white hover:bg-zinc-800",
    secondary: "bg-zinc-100 text-zinc-800 hover:bg-zinc-200 border border-zinc-200",
    ghost:   "text-zinc-700 hover:text-zinc-900 hover:bg-zinc-100",
    dark:    "text-zinc-300 hover:text-white hover:bg-zinc-800",
    danger:  "bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200",
  };
  const sizes = { sm: "px-2 py-1 text-xs gap-1.5", md: "px-3 py-1.5 text-sm gap-2" };
  return (
    <button
      type={type}
      onClick={onClick}
      title={title}
      className={`inline-flex items-center font-medium rounded-md transition focus-ring ${variants[variant] || variants.ghost} ${sizes[size] || sizes.sm} ${className}`}
    >
      {Icon && <Icon size={size === "md" ? 16 : 14} />}
      {children && <span>{children}</span>}
    </button>
  );
}

// ----------------------------------------------------------------------
// GeneMapper TSV parser (browser-side; mirrors scripts/build_artifact.py)
// ----------------------------------------------------------------------
export function parseGenemapperTSV(text) {
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return { peaks: {} };
  const header = lines[0].split("\t").map(h => h.trim());
  const idx = (k) => header.findIndex(h => h.toLowerCase() === k.toLowerCase());
  const ci = {
    sample: idx("Sample Name") >= 0 ? idx("Sample Name") : idx("SampleName"),
    dye:    idx("Dye/Sample Peak") >= 0 ? idx("Dye/Sample Peak") : idx("Dye"),
    size:   idx("Size"),
    height: idx("Height"),
    area:   idx("Area"),
    width:  idx("Width in BP") >= 0 ? idx("Width in BP") : idx("Width"),
  };
  if (ci.sample < 0 || ci.dye < 0 || ci.size < 0) {
    throw new Error("Header missing one of: Sample Name, Dye/Sample Peak, Size");
  }
  const peaks = {};
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split("\t");
    if (row.length <= ci.sample) continue;
    const sample = (row[ci.sample] || "").trim();
    const dyeFull = (row[ci.dye] || "").trim();
    const dye = dyeFull.split(",")[0].trim().toUpperCase();
    if (!sample || !dye) continue;
    const size = parseFloat(row[ci.size]);
    if (!Number.isFinite(size)) continue;
    const height = parseFloat(row[ci.height]) || 0;
    const area = parseFloat(row[ci.area]) || 0;
    const width = parseFloat(row[ci.width]) || 1;
    if (!peaks[sample]) peaks[sample] = {};
    if (!peaks[sample][dye]) peaks[sample][dye] = [];
    peaks[sample][dye].push([
      Math.round(size * 100) / 100,
      Math.round(height * 10) / 10,
      Math.round(area * 10) / 10,
      Math.round(width * 1000) / 1000,
    ]);
  }
  return { peaks };
}

// ----------------------------------------------------------------------
// ABIF (.fsa) parser — pure JS, no npm dep. Reads the binary directory,
// extracts named tags, and returns {version, entries} where each entry is
// {name, number, elemType, value}. Mirrors the Python biopython AbiIO
// reader closely enough that scripts/fsa_to_json.py and this in-browser
// path produce comparable peak tables.
//
// Big-endian. Element-type codes per ABIF spec (commonly used subset):
//   1=byte, 2=char, 3=word, 4=short(i16), 5=int(i32), 7=float,
//   18=pString (length-prefixed), 19=cString (null-terminated).
export function parseAbifBuffer(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const dec = new TextDecoder("ascii", { fatal: false });
  const tagAt = (off, n = 4) => {
    let s = "";
    for (let i = 0; i < n; i++) s += String.fromCharCode(view.getUint8(off + i));
    return s;
  };
  if (tagAt(0) !== "ABIF") throw new Error("Not an ABIF file (magic mismatch)");
  const version = view.getInt16(4, false);
  const numEntries = view.getInt32(18, false);
  const dirOffset = view.getInt32(26, false);
  const entries = {};
  for (let i = 0; i < numEntries; i++) {
    const e = dirOffset + i * 28;
    const name = tagAt(e);
    const number = view.getInt32(e + 4, false);
    const elemType = view.getInt16(e + 8, false);
    const numElements = view.getInt32(e + 12, false);
    const dataSize = view.getInt32(e + 16, false);
    const dataOffset = view.getInt32(e + 20, false);
    const offset = dataSize <= 4 ? e + 20 : dataOffset;
    let value = null;
    try {
      if (elemType === 2 || elemType === 19) {
        const bytes = new Uint8Array(arrayBuffer, offset, numElements);
        value = dec.decode(bytes).replace(/\x00+$/, "").trim();
      } else if (elemType === 4) {
        value = new Array(numElements);
        for (let j = 0; j < numElements; j++) value[j] = view.getInt16(offset + j * 2, false);
      } else if (elemType === 5) {
        value = new Array(numElements);
        for (let j = 0; j < numElements; j++) value[j] = view.getInt32(offset + j * 4, false);
      } else if (elemType === 18) {
        const len = view.getUint8(offset);
        value = dec.decode(new Uint8Array(arrayBuffer, offset + 1, len));
      } else if (elemType === 7) {
        value = new Array(numElements);
        for (let j = 0; j < numElements; j++) value[j] = view.getFloat32(offset + j * 4, false);
      } else if (elemType === 1) {
        value = view.getUint8(offset);
      } else if (elemType === 3) {
        value = view.getUint16(offset, false);
      }
    } catch { value = null; }
    entries[`${name}${number}`] = { name, number, elemType, value };
  }
  return { version, entries };
}

// GS500LIZ size standard (16 ladder peaks).
const GS500LIZ_SIZES = [35, 50, 75, 100, 139, 150, 160, 200, 250, 300, 340, 350, 400, 450, 490, 500];

// Piecewise-linear interpolator built from LIZ anchor peaks → bp.
// Returns null if too few anchors are detectable.
export function calibrateLizJs(lizTrace, nAnchors = 16) {
  if (!lizTrace || lizTrace.length < 200) return null;
  const peaks = [];
  for (let i = 1; i < lizTrace.length - 1; i++) {
    if (lizTrace[i] > lizTrace[i - 1] && lizTrace[i] >= lizTrace[i + 1] && lizTrace[i] > 50) {
      if (peaks.length && i - peaks[peaks.length - 1].idx < 20) {
        if (lizTrace[i] > peaks[peaks.length - 1].h) {
          peaks[peaks.length - 1] = { idx: i, h: lizTrace[i] };
        }
      } else {
        peaks.push({ idx: i, h: lizTrace[i] });
      }
    }
  }
  if (peaks.length < 5) return null;
  peaks.sort((a, b) => b.h - a.h);
  const top = peaks.slice(0, nAnchors).sort((a, b) => a.idx - b.idx);
  const n = Math.min(top.length, GS500LIZ_SIZES.length);
  const xs = top.slice(0, n).map(p => p.idx);
  const ys = GS500LIZ_SIZES.slice(0, n);
  return (x) => {
    if (x <= xs[0]) return ys[0] + (x - xs[0]) * (ys[1] - ys[0]) / (xs[1] - xs[0]);
    if (x >= xs[n - 1]) return ys[n - 1] + (x - xs[n - 1]) * (ys[n - 1] - ys[n - 2]) / (xs[n - 1] - xs[n - 2]);
    for (let i = 1; i < n; i++) {
      if (x <= xs[i]) return ys[i - 1] + (x - xs[i - 1]) * (ys[i] - ys[i - 1]) / (xs[i] - xs[i - 1]);
    }
    return ys[n - 1];
  };
}

// Simple local-max peak caller. Computes height + FWHM-derived bp width.
export function callPeaksFromTrace(trace, idxToBp, { heightThresh = 100, minSepSamples = 5 } = {}) {
  if (!trace || !trace.length || !idxToBp) return [];
  const raw = [];
  for (let i = 1; i < trace.length - 1; i++) {
    if (trace[i] >= heightThresh && trace[i] > trace[i - 1] && trace[i] >= trace[i + 1]) {
      if (raw.length && i - raw[raw.length - 1].idx < minSepSamples) {
        if (trace[i] > raw[raw.length - 1].h) raw[raw.length - 1] = { idx: i, h: trace[i] };
      } else {
        raw.push({ idx: i, h: trace[i] });
      }
    }
  }
  return raw.map(p => {
    const halfH = p.h / 2;
    let lo = p.idx, hi = p.idx;
    while (lo > 0 && trace[lo] > halfH) lo--;
    while (hi < trace.length - 1 && trace[hi] > halfH) hi++;
    const sizeBp = idxToBp(p.idx);
    const widthBp = Math.max(0.05, idxToBp(hi) - idxToBp(lo));
    const area = p.h * widthBp * 1.064;
    return [
      Math.round(sizeBp * 100) / 100,
      Math.round(p.h * 10) / 10,
      Math.round(area * 10) / 10,
      Math.round(widthBp * 1000) / 1000,
    ];
  });
}

// ----------------------------------------------------------------------
// Signal preprocessing (pure functions; all operate on plain number arrays).
// Exported so tests cover them and advanced users can import from scripts.
// ----------------------------------------------------------------------

// Rolling-minimum baseline: returns a same-length array whose value at
// index i is min(trace[i-w .. i+w]). Used as a cheap CE baseline estimator
// — the true baseline sits under the peaks, so local minima approximate it.
// Default window (201 samples ≈ 0.5 s on 3730 at 10 Hz) is wide enough to
// ignore peaks (typical FWHM ~5 samples) but narrow enough to track slow
// dye leak / capillary drift. Edges clamp instead of wrapping.
export function rollingBaseline(trace, window = 201) {
  if (!trace || !trace.length) return [];
  const w = Math.max(3, Math.floor(window / 2) * 2 + 1);
  const half = (w - 1) / 2;
  const n = trace.length;
  const out = new Array(n);
  // Naive O(n*w) is fine for w~201 and n~11000 (~2.2M ops, sub-100ms in JS).
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(n - 1, i + half);
    let m = Infinity;
    for (let j = lo; j <= hi; j++) if (trace[j] < m) m = trace[j];
    out[i] = m;
  }
  return out;
}

// Subtract a baseline estimate; never returns negative (clamps to 0).
export function subtractBaseline(trace, baseline) {
  if (!trace) return [];
  if (!baseline || baseline.length !== trace.length) return trace.slice();
  const n = trace.length;
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.max(0, trace[i] - baseline[i]);
  return out;
}

// Savitzky–Golay smoothing (symmetric coefficients, order 2 or 4, odd window
// 5/7/9/11/13/15/17/19/21). For CE traces with FWHM ~3-6 samples, window 7 +
// order 2 preserves peak height while killing shot noise. Pre-computed coeffs
// from the classic Savitzky-Golay 1964 tables; see references/savgol-coefs.md
// if we grow more options. Edges fall back to pass-through.
const SAVGOL_COEFS = {
  "5_2":  [-3, 12, 17, 12, -3].map(c => c / 35),
  "7_2":  [-2, 3, 6, 7, 6, 3, -2].map(c => c / 21),
  "9_2":  [-21, 14, 39, 54, 59, 54, 39, 14, -21].map(c => c / 231),
  "11_2": [-36, 9, 44, 69, 84, 89, 84, 69, 44, 9, -36].map(c => c / 429),
  "13_2": [-11, 0, 9, 16, 21, 24, 25, 24, 21, 16, 9, 0, -11].map(c => c / 143),
  "15_2": [-78, -13, 42, 87, 122, 147, 162, 167, 162, 147, 122, 87, 42, -13, -78].map(c => c / 1105),
  "17_2": [-21, -6, 7, 18, 27, 34, 39, 42, 43, 42, 39, 34, 27, 18, 7, -6, -21].map(c => c / 323),
  "19_2": [-136, -51, 24, 89, 144, 189, 224, 249, 264, 269, 264, 249, 224, 189, 144, 89, 24, -51, -136].map(c => c / 2261),
  "21_2": [-171, -76, 9, 84, 149, 204, 249, 284, 309, 324, 329, 324, 309, 284, 249, 204, 149, 84, 9, -76, -171].map(c => c / 3059),
  "7_4":  [5, -30, 75, 131, 75, -30, 5].map(c => c / 231),
  "9_4":  [15, -55, 30, 135, 179, 135, 30, -55, 15].map(c => c / 429),
};
export function savitzkyGolay(trace, window = 7, order = 2) {
  if (!trace || !trace.length) return [];
  const key = `${window}_${order}`;
  const c = SAVGOL_COEFS[key];
  if (!c) return trace.slice(); // unsupported param combo → pass-through
  const half = (c.length - 1) / 2;
  const n = trace.length;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    if (i < half || i >= n - half) { out[i] = trace[i]; continue; }
    let s = 0;
    for (let k = 0; k < c.length; k++) s += c[k] * trace[i - half + k];
    out[i] = s;
  }
  return out;
}

// Clip trace at a ceiling (optional; saturated signal is already clipped by
// the instrument's ADC at 32767 for 16-bit dyes). Users can model a lower
// ceiling to visually flatten saturating peaks instead of having them dwarf
// the rest of the lane.
export function clipSaturated(trace, ceiling = 32000) {
  if (!trace || !trace.length) return [];
  const n = trace.length;
  const out = new Array(n);
  const c = Math.max(1, ceiling);
  for (let i = 0; i < n; i++) out[i] = Math.min(c, trace[i]);
  return out;
}

// Apply a full preprocessing chain to a single trace. Order matters: clip →
// baseline-subtract → smooth. All options default to no-op. Exposed so the
// UI can wire one control per step and we can test the composed behavior.
export function preprocessTrace(trace, opts = {}) {
  if (!trace || !trace.length) return [];
  let t = trace.slice();
  if (opts.clip && opts.clipCeiling > 0) t = clipSaturated(t, opts.clipCeiling);
  if (opts.baseline) {
    const bl = rollingBaseline(t, opts.baselineWindow || 201);
    t = subtractBaseline(t, bl);
  }
  if (opts.smooth === "savgol") {
    t = savitzkyGolay(t, opts.savgolWindow || 7, opts.savgolOrder || 2);
  }
  return t;
}

// Per-peak signal-to-noise ratio. Noise is estimated from the robust MAD
// (median absolute deviation) of the raw trace in a window around the peak,
// with the peak itself excluded from the window. This is robust to nearby
// peaks contaminating the noise estimate — only the tails matter.
//
// Returns { snr, noiseFloor } in raw-trace units, or { snr: null } when the
// caller supplies no raw trace (peak-table-only datasets). MAD is scaled by
// 1.4826 to approximate the gaussian σ.
export function computePeakSNR(peakSizeBp, peakHeight, traceArr, bpAxis, windowBp = 5, excludeBp = 1.5) {
  if (!traceArr || !bpAxis || !traceArr.length || !bpAxis.length) {
    return { snr: null, noiseFloor: null };
  }
  // Binary-search the bpAxis for the window bounds.
  const find = (bp) => {
    let lo = 0, hi = bpAxis.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (bpAxis[m] < bp) lo = m + 1; else hi = m; }
    return lo;
  };
  const iLo = find(peakSizeBp - windowBp);
  const iHi = find(peakSizeBp + windowBp);
  if (iHi - iLo < 10) return { snr: null, noiseFloor: null };
  // Collect samples outside the peak-exclusion band.
  const samples = [];
  for (let i = iLo; i <= iHi; i++) {
    if (Math.abs(bpAxis[i] - peakSizeBp) > excludeBp) samples.push(traceArr[i]);
  }
  if (samples.length < 10) return { snr: null, noiseFloor: null };
  // Median + MAD.
  const sorted = samples.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const absdev = samples.map(v => Math.abs(v - median));
  absdev.sort((a, b) => a - b);
  const mad = absdev[Math.floor(absdev.length / 2)];
  const sigma = Math.max(1, mad * 1.4826);
  const noiseFloor = median + 3 * sigma;  // 3σ above baseline — typical calling threshold
  const snr = peakHeight / sigma;
  return { snr, noiseFloor, sigma, localMedian: median };
}

// Cut-product purity score: fraction of total peak signal (across B/G/Y/R)
// that falls within `tol` bp of any expected cut-product size. A proxy for
// "did the chemistry work" that condenses the whole lane into one number.
// Returns { purity, matchedHeight, totalHeight, matches, n }.
//
// Expected sizes are provided per-dye so the scorer only counts B-channel
// signal against B-channel expectations, etc. (prevents accidental credit
// for, say, a spurious Y peak at a B-only cut size).
export function computePurityScore(peaksByDye, expectedByDye, tol = 1.5) {
  let matchedHeight = 0;
  let totalHeight = 0;
  let matches = 0;
  let n = 0;
  for (const dye of ["B", "G", "Y", "R"]) {
    const peaks = peaksByDye?.[dye] || [];
    const exp = expectedByDye?.[dye] || [];
    for (const p of peaks) {
      totalHeight += p[1];
      n += 1;
      for (const e of exp) {
        if (Math.abs(p[0] - e) <= tol) { matchedHeight += p[1]; matches += 1; break; }
      }
    }
  }
  const purity = totalHeight > 0 ? matchedHeight / totalHeight : 0;
  return { purity, matchedHeight, totalHeight, matches, n };
}

// Build a sample × expected-species matrix for the heatmap view. For each
// (sample, species) cell, search the sample's peaks in the species' dye for
// the nearest peak within `tol` bp of the species size; cell value is
// log10(peak height) if matched, or null if not. Log10 compresses the
// 50-30000 RFU dynamic range into something a diverging palette can cover.
//
// Returns:
//   { rows: [sampleName, ...],
//     cols: [{ key, size, dye, label }, ...],
//     cells: { [sampleName]: { [colKey]: logHeight | null } } }
export function buildHeatmapMatrix({ samples, peaksBySample, species, tol = 2.0 }) {
  const cells = {};
  for (const s of samples) {
    const peaks = (peaksBySample && peaksBySample[s]) || {};
    cells[s] = {};
    for (const sp of species) {
      const lp = peaks[sp.dye] || [];
      let best = null;
      let bestD = Infinity;
      for (const p of lp) {
        const d = Math.abs(p[0] - sp.size);
        if (d < bestD && d <= tol) { bestD = d; best = p; }
      }
      cells[s][sp.key] = best ? Math.log10(Math.max(1, best[1])) : null;
    }
  }
  return { rows: samples, cols: species, cells };
}

// Viridis-like 5-stop palette for log10(height). Input: logH in [minL, maxL];
// returns a CSS hex color. Missing cells render as a neutral gray upstream.
export function heatmapColor(logH, minL = 1.7, maxL = 4.5) {
  if (logH == null || !Number.isFinite(logH)) return "#e5e7eb";
  const t = Math.max(0, Math.min(1, (logH - minL) / (maxL - minL)));
  // 5-stop viridis approximation (sampled from the canonical matplotlib).
  const stops = [
    [0.0, [68, 1, 84]],      // #440154 dark purple
    [0.25,[59, 82, 139]],    // #3B528B blue
    [0.5, [33, 145, 140]],   // #21918C teal
    [0.75,[94, 201, 98]],    // #5EC962 green
    [1.0, [253, 231, 37]],   // #FDE725 yellow
  ];
  let lo = stops[0], hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i][0] && t <= stops[i + 1][0]) { lo = stops[i]; hi = stops[i + 1]; break; }
  }
  const f = (t - lo[0]) / Math.max(1e-9, hi[0] - lo[0]);
  const rgb = lo[1].map((c, i) => Math.round(c + f * (hi[1][i] - c)));
  return `#${rgb.map(v => v.toString(16).padStart(2, "0")).join("")}`;
}

// ----------------------------------------------------------------------
// Peak-shift analysis: quantify how far each cut-sample peak moved
// relative to its matching uncut-sample peak within tol, per dye.
// Returns { byDye: {B: {n, medianShift, meanShift}, ...}, totals }.
// ----------------------------------------------------------------------
export function computePeakShiftStats(currentPeaks, referencePeaks, tol = 2.5) {
  const byDye = { B: [], G: [], Y: [], R: [] };
  for (const d of ["B", "G", "Y", "R"]) {
    const cp = currentPeaks?.[d] || [];
    const rp = referencePeaks?.[d] || [];
    if (!cp.length || !rp.length) continue;
    // For each current peak, find the nearest reference peak within tol.
    for (const pc of cp) {
      let best = null;
      let bestD = Infinity;
      for (const pr of rp) {
        const d2 = Math.abs(pc[0] - pr[0]);
        if (d2 < bestD && d2 <= tol) { bestD = d2; best = pr; }
      }
      if (best) byDye[d].push(pc[0] - best[0]); // signed shift
    }
  }
  const median = (arr) => {
    if (!arr.length) return null;
    const s = arr.slice().sort((a, b) => a - b);
    return s.length % 2 === 1 ? s[(s.length - 1) / 2] : 0.5 * (s[s.length / 2 - 1] + s[s.length / 2]);
  };
  const mean = (arr) => arr.length ? arr.reduce((t, v) => t + v, 0) / arr.length : null;
  const stats = { byDye: {} };
  let totalN = 0;
  for (const d of ["B", "G", "Y", "R"]) {
    const arr = byDye[d];
    stats.byDye[d] = { n: arr.length, medianShift: median(arr), meanShift: mean(arr) };
    totalN += arr.length;
  }
  stats.totalN = totalN;
  return stats;
}

// Evaluate the modeled sum-of-gaussians at a single bp position. Mirrors the
// peak-rendering path in buildGaussianPath but returns a scalar so we can
// sample it at arbitrary x. Used by computeResidual for the residual view
// and by the auto-dye-offset calibrator for expected-vs-observed matching.
export function evaluateGaussianSum(peaks, xBp, smoothing = 1) {
  if (!peaks || !peaks.length) return 0;
  let y = 0;
  for (const p of peaks) {
    const sigma = Math.max((p[3] || 0.5) / 2.355 * smoothing, 0.12);
    const z = (xBp - p[0]) / sigma;
    if (z > 5 || z < -5) continue;
    y += p[1] * Math.exp(-0.5 * z * z);
  }
  return y;
}

// Compute raw - modeled point-by-point. Signed: negative where the Gaussian
// model overshoots (e.g. tails of a too-wide fitted width), positive where
// the raw trace has signal the peak table missed (shoulders, unmodeled dyes,
// primer-dimer). Drives the "residual" overlay mode in TraceTab.
export function computeResidual(xs, ys, peaks, smoothing = 1) {
  if (!xs || !ys || xs.length !== ys.length) return [];
  const out = new Array(xs.length);
  for (let i = 0; i < xs.length; i++) {
    out[i] = ys[i] - evaluateGaussianSum(peaks, xs[i], smoothing);
  }
  return out;
}

// ----------------------------------------------------------------------
// Auto-calibration: per-dye mobility offsets from observed vs. expected.
// ----------------------------------------------------------------------
// Given peaks-by-sample, a list of expected sizes per dye, and a search
// tolerance, compute the median signed residual (observed - expected)
// across all matched pairs per dye. That median becomes the new offset.
//
// Why median: immune to spurious peaks that don't belong to the expected
// species set (primer-dimers, ladder bleed, LIZ spill). We trim matches
// to a tolerance window to avoid pulling offsets toward random peaks.
//
// Returns { offsets: {B,G,Y,R}, matchesByDye: {B: [...], ...}, n: total matches }.
export function autoCalibrateDyeOffsets(peaksBySample, expectedByDye, tol = 3.0, currentOffsets = { B:0, G:0, Y:0, R:0 }) {
  const matchesByDye = { B: [], G: [], Y: [], R: [] };
  for (const sample of Object.keys(peaksBySample || {})) {
    const dyes = peaksBySample[sample] || {};
    for (const dye of ["B", "G", "Y", "R"]) {
      const expSizes = expectedByDye?.[dye];
      const observed = dyes[dye];
      if (!expSizes || !expSizes.length || !observed || !observed.length) continue;
      for (const exp of expSizes) {
        // Shift expected by the currently-applied offset so we're searching
        // in the same bp frame as the observed peaks. After calibration the
        // caller replaces the offset entirely (not adds to it).
        const target = exp + (currentOffsets[dye] || 0);
        let best = null;
        let bestDist = Infinity;
        for (const p of observed) {
          const d = Math.abs(p[0] - target);
          if (d < bestDist && d <= tol) { bestDist = d; best = p; }
        }
        if (best) matchesByDye[dye].push(best[0] - exp);
      }
    }
  }
  const median = (arr) => {
    if (!arr.length) return 0;
    const s = arr.slice().sort((a, b) => a - b);
    const n = s.length;
    return n % 2 === 1 ? s[(n - 1) / 2] : 0.5 * (s[n / 2 - 1] + s[n / 2]);
  };
  const offsets = {
    B: median(matchesByDye.B),
    G: median(matchesByDye.G),
    Y: median(matchesByDye.Y),
    R: median(matchesByDye.R),
  };
  const n = Object.values(matchesByDye).reduce((t, a) => t + a.length, 0);
  return { offsets, matchesByDye, n };
}

// One-shot .fsa → peaks-by-dye for a single sample. Returns
// {sampleName, peaks, meta, calibrated, traces, interp} where peaks matches
// the GeneMapper TSV schema and traces preserves the raw int16 samples per
// dye so the UI can render unsmoothed signal + preprocess on demand.
export function parseFsaArrayBuffer(arrayBuffer, fileName = "sample") {
  const { entries } = parseAbifBuffer(arrayBuffer);
  const get = (k) => entries[k]?.value;
  const trace = (n) => get(`DATA${n}`) || null;
  const liz = trace(105);
  const interp = calibrateLizJs(liz);
  const peaks = {};
  const traces = {};
  if (interp) {
    for (const [ch, dye] of [[1, "B"], [2, "G"], [3, "Y"], [4, "R"]]) {
      const t = trace(ch);
      if (t) {
        peaks[dye] = callPeaksFromTrace(t, interp);
        traces[dye] = t;
      }
    }
    if (liz) {
      peaks.O = callPeaksFromTrace(liz, interp, { heightThresh: 200, minSepSamples: 10 });
      traces.O = liz;
    }
  }
  // Pre-sample the calibration so consumers don't need to re-run interp per
  // render. Array of length = trace length; bpAxis[i] = bp size at sample i.
  let bpAxis = null;
  if (interp && liz) {
    bpAxis = new Float32Array(liz.length);
    for (let i = 0; i < liz.length; i++) bpAxis[i] = interp(i);
  }
  // Sample name preference: filename stem (TUBE1/SMPL1 are typically just
  // well-plate positions like A1/B12 which lose the experiment context).
  const stem = fileName.replace(/\.[Ff][Ss][Aa]$/, "").replace(/\.[Aa][Bb]1$/, "").replace(/^.*[\\/]/, "");
  const meta = {
    instrument_model: get("MODL1"),
    dye_chemistry: [1, 2, 3, 4, 5].map(i => get(`DyeN${i}`) || "").filter(Boolean),
    well: get("TUBE1"),
    container_id: get("CTNM1"),
    n_data_points: liz ? liz.length : 0,
    calibration_anchors: interp ? GS500LIZ_SIZES.length : 0,
  };
  return { sampleName: stem, peaks, meta, calibrated: !!interp, traces, bpAxis };
}

// ----------------------------------------------------------------------
// Drag-drop zone for new GeneMapper TSV exports.
// Listens for drag events anywhere in the window and lights up only while
// a file is being dragged. On drop, parses the TSV and calls onData. The
// toolbar Upload button uses the same handleFiles via a ref; see Toolbar.
// ----------------------------------------------------------------------
function DropOverlay({ onData }) {
  const [active, setActive] = useState(false);
  const [error, setError] = useState(null);

  const handleFiles = async (files) => {
    setError(null);
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    // Route by extension: .fsa = ABIF binary (one sample per file, batch
    // multi-drop OK); .txt/.tsv/.csv = GeneMapper peak-table TSV.
    const fsa = arr.filter(f => /\.fsa$/i.test(f.name));
    const tsv = arr.filter(f => /\.(txt|tsv|csv)$/i.test(f.name));
    try {
      const merged = {};
      const mergedTraces = {};
      let warnings = [];
      for (const f of fsa) {
        const buf = await f.arrayBuffer();
        const { sampleName, peaks, calibrated, traces, bpAxis } = parseFsaArrayBuffer(buf, f.name);
        if (!calibrated) {
          warnings.push(`${sampleName}: LIZ size standard not calibratable; skipped`);
          continue;
        }
        const key = merged[sampleName] ? `${sampleName}_${f.name.replace(/\.[Ff][Ss][Aa]$/, "")}` : sampleName;
        merged[key] = peaks;
        mergedTraces[key] = { ...traces, bpAxis };
      }
      for (const f of tsv) {
        const text = await f.text();
        const parsed = parseGenemapperTSV(text);
        Object.assign(merged, parsed.peaks);
      }
      const n = Object.keys(merged).length;
      if (n === 0) {
        setError("No samples loaded. Drop GeneMapper .txt/.tsv or ABIF .fsa files.");
        return;
      }
      if (warnings.length) setError(warnings.join("; "));
      onData(merged, mergedTraces);
    } catch (e) {
      setError(e.message || "Failed to parse file(s)");
    }
  };

  useEffect(() => {
    let depth = 0;
    const onEnter = (e) => { e.preventDefault(); depth++; if (e.dataTransfer?.types?.includes("Files")) setActive(true); };
    const onLeave = (e) => { e.preventDefault(); depth--; if (depth <= 0) { setActive(false); depth = 0; } };
    const onOver  = (e) => { e.preventDefault(); };
    const onDrop  = (e) => { e.preventDefault(); depth = 0; setActive(false); handleFiles(e.dataTransfer?.files); };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  // Auto-clear errors after 4 s
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(t);
  }, [error]);

  return (
    <>
      {active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none no-print">
          <div className="absolute inset-0 bg-sky-500/10 backdrop-blur-[1px]" />
          <div className="relative px-8 py-6 rounded-2xl border-2 border-dashed border-sky-500 bg-white shadow-2xl max-w-md mx-4">
            <div className="flex items-center gap-3 text-sky-700">
              <div className="p-2 rounded-lg bg-sky-50">
                <Upload size={20} />
              </div>
              <div>
                <div className="text-base font-semibold tracking-tight">Drop to load dataset</div>
                <div className="text-xs text-zinc-500 mt-0.5">
                  GeneMapper TSV (.txt/.tsv/.csv) <strong>or ABIF .fsa</strong> binary trace files. Multi-file drop OK; .fsa peaks are auto-called via LIZ calibration.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {error && (
        <div className="fixed bottom-10 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-600 text-white text-xs shadow-xl no-print">
          <AlertTriangle size={14} />
          <span>{error}</span>
        </div>
      )}
    </>
  );
}

// Compact upload button used by the Toolbar. Mirrors DropOverlay's parser.
function UploadButton({ onData }) {
  const inputRef = useRef(null);
  return (
    <>
      <ToolButton
        icon={Upload}
        variant="dark"
        title="Load GeneMapper TSV (.txt/.tsv/.csv) or ABIF .fsa files. Drag-drop anywhere in the window also works."
        onClick={() => inputRef.current?.click()}
      >
        Load data
      </ToolButton>
      <input
        ref={inputRef}
        type="file"
        accept=".txt,.tsv,.csv,.fsa,.ab1"
        multiple
        onChange={async (e) => {
          const files = Array.from(e.target.files || []);
          if (files.length === 0) return;
          try {
            const merged = {};
            const mergedTraces = {};
            for (const f of files) {
              if (/\.fsa$/i.test(f.name) || /\.ab1$/i.test(f.name)) {
                const buf = await f.arrayBuffer();
                const { sampleName, peaks, calibrated, traces, bpAxis } = parseFsaArrayBuffer(buf, f.name);
                if (calibrated) {
                  const key = merged[sampleName] ? `${sampleName}_${f.name.replace(/\.[Ff][Ss][Aa]$/, "")}` : sampleName;
                  merged[key] = peaks;
                  mergedTraces[key] = { ...traces, bpAxis };
                }
              } else {
                const parsed = parseGenemapperTSV(await f.text());
                Object.assign(merged, parsed.peaks);
              }
            }
            if (Object.keys(merged).length > 0) onData(merged, mergedTraces);
          } catch (err) {
            console.error("[fragment-viewer] file parse failed:", err);
          }
          e.target.value = "";
        }}
        className="hidden"
      />
    </>
  );
}

// ======================================================================
// DATA — peak table, shipped as a JS literal by the build step
// ======================================================================
const DATA = {"peaks":{"V059_4-5":{"B":[[40.07,106.0,15.0,0.133],[41.49,118.0,45.8,0.365],[42.7,110.0,13.3,0.114],[43.92,148.0,323.6,2.055],[45.14,119.0,44.8,0.354],[46.55,123.0,57.7,0.441],[48.18,122.0,144.7,1.115],[54.17,171.0,889.4,4.888],[62.5,123.0,548.9,4.194],[72.22,210.0,922.4,4.128],[75.16,210.0,16.5,0.074],[75.48,107.0,8.7,0.076],[75.74,104.0,5.5,0.05],[75.9,112.0,7.7,0.064],[76.09,152.0,49.6,0.307],[76.32,115.0,6.1,0.05],[76.7,108.0,6.5,0.057],[76.99,139.0,101.4,0.685],[77.19,132.0,7.0,0.05],[77.35,124.0,15.0,0.114],[77.67,129.0,6.9,0.05],[77.83,103.0,5.5,0.05],[78.08,127.0,77.8,0.576],[78.28,121.0,6.4,0.05],[78.44,124.0,6.6,0.05],[78.6,107.0,5.7,0.05],[79.08,111.0,5.9,0.05],[79.24,118.0,6.3,0.05],[79.56,112.0,6.6,0.055],[79.85,111.0,9.9,0.084],[80.04,122.0,8.9,0.069],[80.24,103.0,6.2,0.057],[80.4,107.0,9.6,0.084],[80.66,108.0,5.7,0.05],[80.91,119.0,6.3,0.05],[81.11,107.0,5.7,0.05],[81.33,102.0,5.4,0.05],[81.52,112.0,18.3,0.154],[81.68,103.0,5.5,0.05],[81.84,107.0,16.1,0.142],[82.01,108.0,5.8,0.051],[82.26,110.0,5.9,0.05],[82.52,104.0,21.0,0.19],[82.71,112.0,6.6,0.055],[82.94,100.0,5.3,0.05],[83.16,102.0,6.4,0.059],[83.35,108.0,8.7,0.076],[83.55,120.0,6.4,0.05],[83.77,111.0,5.9,0.05],[83.93,106.0,9.6,0.085],[84.13,175.0,51.8,0.278],[84.35,117.0,6.2,0.05],[84.61,109.0,5.8,0.05],[84.99,112.0,6.0,0.05],[85.15,144.0,24.8,0.162],[85.48,138.0,24.0,0.164],[85.64,118.0,6.3,0.05],[85.96,167.0,38.0,0.214],[86.18,103.0,5.5,0.05],[86.47,100.0,12.3,0.116],[87.34,101.0,7.8,0.072],[87.85,100.0,6.4,0.06],[88.11,103.0,9.1,0.083],[88.62,105.0,5.6,0.05],[88.82,102.0,9.0,0.083],[89.07,106.0,34.6,0.307],[89.85,103.0,5.5,0.05],[90.55,107.0,52.7,0.463],[90.81,107.0,52.7,0.463],[90.97,101.0,8.0,0.075],[91.23,102.0,5.4,0.05],[92.51,100.0,14.6,0.137],[92.83,117.0,6.2,0.05],[93.09,161.0,99.8,0.582],[93.51,117.0,9.0,0.072],[93.67,103.0,5.5,0.05],[95.47,100.0,5.3,0.05],[97.72,103.0,9.9,0.09],[97.91,100.0,6.6,0.062],[98.26,101.0,20.0,0.186],[98.88,107.0,19.6,0.172],[99.13,101.0,12.1,0.112],[99.33,100.0,12.8,0.12],[99.58,101.0,13.4,0.125],[100.92,102.0,45.1,0.416],[101.94,103.0,33.0,0.301],[102.68,109.0,29.8,0.257],[103.23,101.0,19.2,0.179],[103.97,108.0,15.5,0.135],[105.08,107.0,23.7,0.209],[106.1,107.0,52.5,0.461],[107.21,109.0,22.8,0.196],[109.06,100.0,29.5,0.277],[110.07,101.0,22.3,0.208],[110.81,100.0,23.9,0.225],[111.27,105.0,42.5,0.38],[111.92,101.0,11.7,0.109],[112.85,103.0,17.8,0.163],[113.4,101.0,32.3,0.301],[114.42,101.0,23.7,0.22],[116.08,101.0,31.0,0.289],[116.54,103.0,55.9,0.51],[117.1,104.0,30.4,0.275],[118.11,100.0,26.5,0.249],[119.59,103.0,14.2,0.129],[122.0,111.0,16.7,0.141],[123.1,101.0,40.7,0.379],[126.15,112.0,179.5,1.507],[128.19,103.0,17.5,0.159],[130.96,101.0,18.3,0.171],[134.66,106.0,102.0,0.904],[136.5,104.0,20.3,0.183],[136.97,101.0,18.4,0.171],[144.19,106.0,41.8,0.371],[151.93,104.0,16.1,0.145],[152.94,102.0,15.0,0.138],[153.39,100.0,31.4,0.295],[154.59,105.0,28.8,0.258],[156.42,103.0,14.0,0.128],[157.06,100.0,8.4,0.079],[157.61,105.0,38.2,0.342],[159.36,107.0,151.5,1.331],[160.81,107.0,60.1,0.528],[161.26,105.0,8.6,0.077],[162.78,108.0,82.8,0.721],[164.93,100.0,17.8,0.167],[165.47,104.0,14.5,0.131],[168.25,104.0,10.7,0.097],[168.79,107.0,28.1,0.247],[169.78,102.0,27.1,0.25],[171.03,103.0,7.1,0.065],[171.66,201.0,87.3,0.408],[172.47,115.0,28.0,0.229],[173.45,316.0,268.8,0.799],[175.16,100.0,23.9,0.224],[176.95,103.0,13.7,0.125],[177.67,103.0,15.1,0.138],[178.12,101.0,15.6,0.145],[179.64,103.0,20.8,0.19],[181.35,112.0,19.1,0.16],[181.79,100.0,9.1,0.086],[182.69,103.0,21.3,0.194],[183.14,108.0,10.6,0.092],[183.59,119.0,27.2,0.215],[184.57,202.0,94.9,0.441],[185.56,156.0,74.4,0.448],[186.55,139.0,42.1,0.285],[187.53,159.0,64.9,0.384],[187.98,120.0,7.3,0.057],[188.43,135.0,42.1,0.293],[189.06,138.0,47.1,0.321],[190.58,142.0,64.2,0.425],[191.75,224.0,163.8,0.687],[192.56,101.0,11.8,0.11],[193.18,128.0,43.9,0.322],[193.63,124.0,46.7,0.354],[194.62,138.0,61.5,0.419],[195.61,134.0,58.6,0.411],[196.59,116.0,55.5,0.45],[197.49,202.0,80.0,0.372],[198.03,16598.0,5989.6,0.339],[200.37,166.0,395.3,2.238],[204.78,147.0,74.8,0.478],[206.8,139.0,79.5,0.537],[210.39,114.0,42.3,0.349],[211.03,106.0,25.7,0.228],[213.24,131.0,72.0,0.516],[214.25,175.0,85.7,0.46],[214.89,109.0,7.3,0.063],[215.35,129.0,16.1,0.117],[215.9,121.0,11.8,0.092],[216.36,166.0,86.8,0.491],[217.28,109.0,16.8,0.144],[217.74,117.0,24.6,0.198],[218.47,154.0,76.1,0.464],[219.49,143.0,66.6,0.438],[220.5,210.0,64.1,0.287],[221.6,231.0,152.6,0.621],[222.52,161.0,68.2,0.398],[223.71,136.0,37.2,0.257],[224.63,199.0,100.6,0.475],[225.74,247.0,111.8,0.425],[226.38,139.0,9.7,0.066],[226.84,248.0,115.1,0.436],[227.94,235.0,78.4,0.313],[229.87,1051.0,234.7,0.21],[230.79,9632.0,5621.7,0.549],[232.44,196.0,53.8,0.258],[233.36,205.0,326.7,1.498],[234.01,133.0,12.7,0.09],[235.02,157.0,57.6,0.345],[235.48,114.0,11.5,0.095],[236.03,129.0,24.4,0.178],[236.58,113.0,11.5,0.096],[237.04,105.0,9.8,0.088],[237.5,111.0,27.6,0.234],[238.14,184.0,120.6,0.616],[238.69,112.0,6.6,0.055],[239.43,104.0,17.0,0.153],[240.26,181.0,112.8,0.586],[240.9,106.0,9.3,0.083],[241.82,100.0,10.7,0.1],[242.37,104.0,13.6,0.123],[243.11,105.0,18.9,0.169],[244.49,102.0,14.7,0.135],[245.5,105.0,35.3,0.316],[246.42,104.0,69.0,0.624],[247.33,103.0,13.3,0.121],[248.16,105.0,26.9,0.241],[248.99,102.0,14.0,0.129],[249.63,106.0,58.6,0.52],[251.82,100.0,64.6,0.607],[255.28,103.0,70.2,0.641],[257.26,100.0,47.0,0.442],[258.09,102.0,39.1,0.36],[258.91,101.0,18.4,0.171],[259.74,101.0,57.1,0.531],[260.15,100.0,9.9,0.093],[265.26,103.0,13.7,0.125],[268.07,101.0,13.6,0.126],[269.14,100.0,37.6,0.354],[269.88,105.0,16.1,0.144],[272.19,109.0,114.0,0.983],[273.93,101.0,30.7,0.285],[274.42,101.0,21.5,0.2],[275.25,103.0,28.1,0.257],[276.4,103.0,30.0,0.274],[283.09,103.0,101.3,0.924],[283.5,100.0,24.9,0.234],[283.91,100.0,9.6,0.09],[314.96,100.0,21.2,0.199],[324.69,101.0,43.6,0.406],[337.26,108.0,12.9,0.113],[338.41,100.0,43.7,0.411],[350.49,100.0,12.3,0.116],[356.59,101.0,64.4,0.599],[362.85,100.0,14.7,0.139],[368.29,103.0,33.3,0.304],[370.18,101.0,18.2,0.169],[373.39,112.0,53.4,0.448],[378.91,100.0,20.0,0.188],[384.18,106.0,18.8,0.167],[385.17,105.0,21.8,0.195],[389.62,101.0,41.8,0.389],[392.17,100.0,14.3,0.134],[393.9,100.0,36.4,0.342],[394.98,100.0,35.5,0.333],[398.11,100.0,27.2,0.255],[398.93,107.0,16.3,0.143],[400.53,103.0,19.6,0.179],[402.12,100.0,20.1,0.189],[403.45,105.0,23.0,0.206],[405.92,100.0,14.7,0.139],[415.46,101.0,15.3,0.142],[417.14,105.0,16.9,0.152],[419.43,101.0,14.1,0.131],[420.94,103.0,16.2,0.148],[421.64,105.0,68.9,0.616],[422.08,101.0,8.1,0.075],[425.0,104.0,36.3,0.328],[428.18,100.0,12.3,0.115],[428.8,101.0,14.5,0.135],[430.12,101.0,14.6,0.136],[432.24,104.0,33.9,0.306],[433.66,102.0,8.1,0.075],[434.28,103.0,24.9,0.227],[436.22,100.0,41.1,0.387],[436.75,102.0,62.6,0.577],[437.54,100.0,23.7,0.223],[438.07,100.0,27.2,0.255],[438.87,101.0,15.8,0.147],[439.31,104.0,12.2,0.11],[439.84,105.0,19.1,0.171],[442.49,107.0,49.0,0.431],[447.53,106.0,31.7,0.281],[448.85,103.0,59.1,0.539],[449.29,103.0,14.0,0.128],[450.85,104.0,33.2,0.3],[451.61,102.0,12.6,0.116],[456.17,100.0,17.6,0.166],[463.45,100.0,12.3,0.116],[464.04,102.0,25.8,0.238],[466.24,100.0,27.0,0.254],[468.35,101.0,30.3,0.282],[468.86,103.0,17.6,0.16],[469.79,101.0,23.7,0.221],[471.9,107.0,26.4,0.232],[472.58,101.0,12.4,0.115],[474.02,103.0,21.6,0.197],[476.89,102.0,20.8,0.192],[477.74,100.0,9.3,0.087],[478.33,104.0,72.4,0.654],[478.75,102.0,13.0,0.12],[480.19,100.0,14.6,0.137],[481.97,103.0,27.3,0.249],[482.73,100.0,30.6,0.288],[483.57,100.0,14.2,0.134],[485.6,104.0,20.7,0.187],[487.29,101.0,11.3,0.105],[490.82,100.0,34.2,0.322],[491.73,100.0,37.6,0.354],[492.35,103.0,51.7,0.472],[493.16,103.0,28.9,0.264],[495.0,101.0,39.0,0.363],[499.49,102.0,26.2,0.242],[500.0,101.0,5.4,0.05],[500.0,104.0,5.5,0.05],[500.0,103.0,5.5,0.05],[500.0,101.0,5.4,0.05],[500.0,103.0,5.5,0.05],[500.0,105.0,5.6,0.05],[500.0,103.0,5.5,0.05],[500.0,104.0,5.5,0.05],[500.0,106.0,5.6,0.05],[500.0,101.0,5.4,0.05],[500.0,100.0,5.3,0.05],[500.0,105.0,5.6,0.05],[500.0,108.0,5.7,0.05],[500.0,101.0,5.4,0.05],[500.0,104.0,5.5,0.05],[500.0,100.0,5.3,0.05],[500.0,101.0,5.4,0.05],[500.0,106.0,5.6,0.05],[500.0,104.0,5.5,0.05],[500.0,101.0,5.4,0.05],[500.0,101.0,5.4,0.05],[500.0,103.0,5.5,0.05],[500.0,100.0,5.3,0.05],[500.0,100.0,5.3,0.05],[500.0,100.0,5.3,0.05],[500.0,102.0,5.4,0.05],[500.0,101.0,5.4,0.05],[500.0,101.0,5.4,0.05],[500.0,102.0,5.4,0.05],[500.0,103.0,5.5,0.05],[500.0,109.0,5.8,0.05],[500.0,101.0,5.4,0.05],[500.0,105.0,5.6,0.05],[500.0,102.0,5.4,0.05],[500.0,102.0,5.4,0.05],[500.0,103.0,5.5,0.05],[500.0,101.0,5.4,0.05],[500.0,102.0,5.4,0.05],[500.0,100.0,5.3,0.05],[500.0,100.0,5.3,0.05],[500.0,103.0,5.5,0.05],[500.0,101.0,5.4,0.05],[500.0,100.0,5.3,0.05],[500.0,110.0,5.9,0.05],[500.0,104.0,5.5,0.05],[500.0,103.0,5.5,0.05],[500.0,106.0,5.6,0.05],[500.0,107.0,5.7,0.05],[500.0,100.0,5.3,0.05],[500.0,100.0,5.3,0.05],[500.0,107.0,5.7,0.05],[500.0,113.0,6.0,0.05],[500.0,101.0,5.4,0.05],[500.0,105.0,5.6,0.05],[500.0,100.0,5.3,0.05],[500.0,105.0,5.6,0.05],[500.0,107.0,5.7,0.05],[500.0,104.0,5.5,0.05],[500.0,101.0,5.4,0.05],[500.0,100.0,5.3,0.05],[500.0,108.0,5.7,0.05],[500.0,111.0,5.9,0.05],[500.0,103.0,5.5,0.05],[500.0,104.0,5.5,0.05],[500.0,110.0,5.9,0.05],[500.0,106.0,5.6,0.05],[500.0,101.0,5.4,0.05],[500.0,107.0,5.7,0.05],[500.0,110.0,5.9,0.05],[500.0,108.0,5.7,0.05],[500.0,105.0,5.6,0.05],[500.0,115.0,6.1,0.05],[500.0,101.0,5.4,0.05],[500.0,111.0,5.9,0.05],[500.0,107.0,5.7,0.05],[500.0,102.0,5.4,0.05],[500.0,107.0,5.7,0.05],[500.0,102.0,5.4,0.05],[500.0,105.0,5.6,0.05],[500.0,100.0,5.3,0.05],[500.0,105.0,5.6,0.05],[500.0,101.0,5.4,0.05],[500.0,101.0,5.4,0.05],[500.0,108.0,5.7,0.05],[500.0,101.0,5.4,0.05],[500.0,102.0,5.4,0.05],[500.0,107.0,5.7,0.05],[500.0,101.0,5.4,0.05],[500.0,102.0,5.4,0.05],[500.0,106.0,5.6,0.05],[500.0,102.0,5.4,0.05],[500.0,106.0,5.6,0.05],[500.0,107.0,5.7,0.05],[500.0,105.0,5.6,0.05],[500.0,107.0,5.7,0.05],[500.0,108.0,5.7,0.05],[500.0,103.0,5.5,0.05],[500.0,102.0,5.4,0.05],[500.0,103.0,5.5,0.05],[500.0,103.0,5.5,0.05],[500.0,103.0,5.5,0.05],[500.0,101.0,5.4,0.05],[500.0,109.0,5.8,0.05],[500.0,102.0,5.4,0.05],[500.0,101.0,5.4,0.05],[500.0,103.0,5.5,0.05],[500.0,109.0,5.8,0.05],[500.0,104.0,5.5,0.05],[500.0,100.0,5.3,0.05],[500.0,100.0,5.3,0.05],[500.0,104.0,5.5,0.05],[500.0,103.0,5.5,0.05],[500.0,110.0,5.9,0.05],[500.0,100.0,5.3,0.05],[500.0,108.0,5.7,0.05],[500.0,110.0,5.9,0.05],[500.0,106.0,5.6,0.05],[500.0,107.0,5.7,0.05],[500.0,103.0,5.5,0.05],[500.0,107.0,5.7,0.05],[500.0,101.0,5.4,0.05],[500.0,102.0,5.4,0.05],[500.0,110.0,5.9,0.05],[500.0,108.0,5.7,0.05],[500.0,103.0,5.5,0.05],[500.0,105.0,5.6,0.05],[500.0,102.0,5.4,0.05],[500.0,102.0,5.4,0.05],[500.0,108.0,5.7,0.05],[500.0,102.0,5.4,0.05],[500.0,101.0,5.4,0.05],[500.0,105.0,5.6,0.05],[500.0,101.0,5.4,0.05],[500.0,113.0,6.0,0.05],[500.0,103.0,5.5,0.05],[500.0,110.0,5.9,0.05],[500.0,104.0,5.5,0.05],[500.0,103.0,5.5,0.05],[500.0,103.0,5.5,0.05],[500.0,105.0,5.6,0.05],[500.0,106.0,5.6,0.05],[500.0,104.0,5.5,0.05],[500.0,105.0,5.6,0.05],[500.0,104.0,5.5,0.05],[500.0,106.0,5.6,0.05],[500.0,105.0,5.6,0.05],[500.0,101.0,5.4,0.05]],"G":[[35.0,100.0,5.3,0.05],[35.0,129.0,6.9,0.05],[35.0,105.0,5.6,0.05],[35.0,132.0,7.0,0.05],[35.0,103.0,5.5,0.05],[35.0,240.0,115.7,0.453],[42.91,174.0,345.8,1.868],[44.12,111.0,18.0,0.152],[45.95,196.0,294.7,1.413],[47.16,125.0,44.6,0.335],[49.19,180.0,174.7,0.912],[51.39,166.0,190.8,1.08],[57.64,1294.0,6890.8,5.005],[65.97,123.0,64.2,0.49],[75.06,1158.0,748.8,0.608],[75.22,181.0,77.9,0.405],[75.39,148.0,7.9,0.05],[75.55,131.0,7.0,0.05],[75.77,113.0,6.0,0.05],[75.93,116.0,14.1,0.114],[76.51,154.0,28.4,0.173],[77.86,205.0,60.4,0.277],[78.92,115.0,34.1,0.279],[84.0,630.0,116.9,0.174],[85.76,112.0,8.7,0.073],[85.93,116.0,58.8,0.476],[86.12,100.0,5.3,0.05],[94.67,105.0,5.6,0.05],[95.12,295.0,178.6,0.569],[95.28,213.0,11.3,0.05],[159.54,208.0,101.9,0.46],[162.96,404.0,185.7,0.432],[165.65,254.0,130.2,0.482],[169.15,675.0,322.2,0.449],[169.96,109.0,18.9,0.163],[172.83,170.0,73.8,0.408],[183.86,102.0,29.9,0.276],[184.84,144.0,43.5,0.284],[185.38,116.0,41.5,0.337],[186.46,146.0,91.6,0.589],[187.35,116.0,9.6,0.077],[188.07,164.0,79.3,0.454],[188.97,130.0,11.4,0.083],[189.78,1265.0,747.9,0.556],[191.03,301.0,22.1,0.069],[192.38,289.0,130.0,0.423],[193.27,163.0,9.1,0.052],[194.08,305.0,126.3,0.389],[195.07,307.0,33.5,0.102],[196.05,643.0,235.4,0.344],[197.04,4316.0,1085.8,0.236],[198.12,32767.0,27688.4,0.794],[200.09,1038.0,72.7,0.066],[200.92,7233.0,4464.1,0.58],[201.93,1008.0,198.3,0.185],[202.76,570.0,195.6,0.323],[204.78,957.0,456.6,0.448],[205.88,195.0,18.0,0.087],[206.8,853.0,397.8,0.438],[207.9,219.0,51.0,0.219],[208.64,157.0,14.3,0.085],[209.19,161.0,40.1,0.234],[209.74,184.0,134.7,0.688],[210.85,149.0,26.0,0.164],[211.4,152.0,41.1,0.254],[211.95,168.0,65.7,0.368],[212.78,147.0,17.1,0.11],[213.33,133.0,10.5,0.074],[213.79,138.0,18.3,0.125],[214.34,136.0,15.0,0.104],[215.26,128.0,8.2,0.06],[215.81,167.0,91.5,0.515],[216.64,125.0,21.1,0.159],[217.19,164.0,231.2,1.325],[218.11,151.0,32.4,0.202],[219.21,114.0,14.2,0.117],[219.67,138.0,74.4,0.506],[220.4,126.0,20.8,0.155],[220.96,157.0,8.4,0.05],[221.42,192.0,157.6,0.771],[222.06,109.0,7.0,0.06],[222.79,139.0,53.8,0.364],[223.53,112.0,24.5,0.205],[223.99,113.0,6.1,0.051],[224.54,123.0,10.0,0.077],[225.0,142.0,89.9,0.595],[225.55,113.0,8.7,0.072],[226.01,133.0,18.1,0.128],[226.47,135.0,55.0,0.383],[227.02,119.0,6.3,0.05],[227.67,191.0,62.7,0.309],[228.68,1140.0,482.0,0.397],[229.78,1431.0,393.5,0.258],[230.79,15697.0,8539.9,0.511],[231.99,1820.0,752.1,0.388],[233.36,262.0,28.9,0.104],[234.1,123.0,10.0,0.077],[234.74,156.0,99.1,0.597],[235.39,101.0,7.8,0.072],[235.85,128.0,91.6,0.673],[236.31,116.0,40.2,0.326],[237.59,109.0,8.9,0.077],[238.05,167.0,84.5,0.476],[239.25,100.0,20.3,0.191],[240.17,143.0,73.0,0.48],[288.61,123.0,79.1,0.604]],"Y":[[76.93,302.0,218.6,0.68],[85.57,220.0,54.1,0.231],[168.88,381.0,49754.2,122.733],[198.39,1521.0,3836.7,2.371],[201.19,32339.0,3119.7,0.091],[231.07,333.0,68.3,0.193],[231.99,1398.0,717.6,0.482]],"R":[[35.0,102.0,5.4,0.05],[35.0,193.0,10.3,0.05],[35.0,616.0,436.4,0.666],[36.62,124.0,17.7,0.134],[38.24,132.0,23.7,0.169],[39.46,189.0,360.5,1.793],[41.28,137.0,19.7,0.135],[42.5,111.0,16.7,0.141],[43.51,150.0,51.1,0.32],[44.93,160.0,65.0,0.382],[46.35,161.0,31.3,0.182],[47.57,232.0,110.8,0.449],[50.69,958.0,6468.0,6.345],[54.86,675.0,315.0,0.439],[61.11,307.0,149.7,0.458],[75.03,22797.0,48323.7,1.992],[75.55,1322.0,167.9,0.119],[75.77,631.0,33.6,0.05],[76.19,463.0,24.6,0.05],[76.48,1220.0,226.3,0.174],[77.02,257.0,13.7,0.05],[77.38,199.0,10.6,0.05],[77.6,305.0,23.1,0.071],[77.92,1004.0,204.6,0.192],[78.34,217.0,11.5,0.05],[78.7,548.0,66.8,0.115],[78.95,633.0,132.2,0.196],[79.31,164.0,8.7,0.05],[79.53,142.0,28.8,0.19],[79.69,131.0,7.3,0.052],[80.21,112.0,26.9,0.226],[80.53,168.0,35.5,0.199],[80.88,151.0,12.3,0.076],[81.23,127.0,12.2,0.09],[81.68,104.0,7.5,0.068],[81.94,138.0,22.8,0.155],[82.17,110.0,6.7,0.057],[83.07,368.0,73.2,0.187],[83.26,108.0,5.7,0.05],[85.44,123.0,8.5,0.065],[85.76,545.0,102.2,0.176],[85.99,128.0,6.8,0.05],[87.21,155.0,32.4,0.196],[91.52,111.0,5.9,0.05],[91.68,370.0,70.0,0.178],[100.0,416.0,137.3,0.31],[139.0,444.0,236.2,0.5],[150.0,453.0,227.3,0.472],[159.91,432.0,226.7,0.493],[162.33,175.0,82.4,0.443],[165.74,418.0,224.3,0.504],[168.43,234.0,97.6,0.392],[170.58,102.0,13.4,0.123],[171.21,129.0,72.4,0.527],[172.11,130.0,297.1,2.148],[172.91,118.0,38.3,0.305],[176.05,132.0,68.5,0.487],[182.96,103.0,37.1,0.339],[183.86,104.0,47.7,0.431],[186.01,195.0,158.3,0.763],[186.64,155.0,38.8,0.235],[187.8,222.0,122.0,0.516],[188.97,229.0,219.0,0.899],[189.6,131.0,14.6,0.105],[190.49,151.0,22.4,0.139],[190.94,224.0,65.0,0.273],[192.47,1058.0,556.9,0.495],[193.36,436.0,88.9,0.192],[193.99,664.0,178.8,0.253],[194.62,520.0,86.3,0.156],[195.07,838.0,208.1,0.233],[196.05,1707.0,631.6,0.348],[197.04,5294.0,2471.6,0.439],[198.12,25122.0,9874.8,0.369],[198.92,2683.0,1039.2,0.364],[200.0,6149.0,1820.3,0.278],[201.1,32767.0,29313.8,0.841],[202.67,3787.0,669.6,0.166],[203.4,1862.0,150.3,0.076],[204.96,1159.0,532.1,0.431],[205.97,853.0,216.0,0.238],[206.71,714.0,112.3,0.148],[207.9,1117.0,447.4,0.376],[208.55,463.0,50.2,0.102],[209.93,916.0,449.6,0.461],[210.85,379.0,82.6,0.205],[211.31,337.0,68.1,0.19],[211.76,296.0,94.8,0.301],[212.32,283.0,46.7,0.155],[213.14,268.0,61.8,0.217],[213.79,225.0,20.9,0.087],[214.34,264.0,51.7,0.184],[214.8,227.0,24.5,0.101],[215.53,235.0,49.7,0.199],[216.08,197.0,30.2,0.144],[216.73,201.0,32.3,0.151],[217.56,243.0,42.5,0.164],[218.66,199.0,44.5,0.21],[219.39,156.0,14.7,0.088],[219.85,179.0,30.0,0.157],[220.31,158.0,12.6,0.075],[220.77,179.0,106.9,0.561],[221.32,152.0,13.6,0.084],[221.78,171.0,17.3,0.095],[222.24,199.0,20.0,0.094],[222.79,318.0,183.9,0.544],[223.81,211.0,22.5,0.1],[224.63,187.0,114.0,0.573],[225.09,184.0,13.6,0.07],[225.55,119.0,9.4,0.074],[226.01,167.0,11.8,0.067],[226.47,250.0,285.5,1.073],[227.11,242.0,51.6,0.201],[227.67,152.0,8.1,0.05],[228.49,153.0,28.9,0.178],[229.04,221.0,27.2,0.115],[229.87,942.0,501.9,0.501],[231.99,20118.0,10471.8,0.489],[234.28,331.0,28.1,0.08],[234.74,365.0,141.7,0.365],[236.21,239.0,165.8,0.652],[236.76,144.0,23.9,0.156],[237.32,192.0,67.5,0.33],[237.87,141.0,23.1,0.154],[238.6,140.0,13.0,0.087],[239.25,194.0,114.4,0.554],[239.8,128.0,17.3,0.127],[240.44,103.0,10.6,0.097],[241.54,198.0,109.4,0.519],[242.0,106.0,8.3,0.074],[250.0,492.0,241.6,0.462],[250.41,107.0,6.1,0.054],[300.0,397.0,253.1,0.599],[339.91,412.0,244.1,0.557],[350.0,417.0,241.6,0.545],[399.92,490.0,299.6,0.575],[404.33,114.0,93.0,0.766],[450.0,532.0,347.3,0.614],[489.92,536.0,427.9,0.75],[500.0,522.0,225.5,0.406]],"O":[[35.0,949.0,50.5,0.05],[35.0,579.0,30.8,0.05],[35.0,565.0,30.1,0.05],[35.0,964.0,51.3,0.05],[35.0,690.0,36.7,0.05],[35.0,659.0,35.1,0.05],[35.0,4548.0,242.0,0.05],[35.0,16581.0,12355.7,0.7],[39.46,2317.0,3084.2,1.251],[42.3,1636.0,300.2,0.172],[47.77,4373.0,3070.3,0.66],[50.0,23863.0,153107.1,6.03],[75.0,32767.0,277395.3,7.956],[75.58,14228.0,2255.0,0.149],[75.93,8739.0,822.0,0.088],[76.61,5908.0,1205.7,0.192],[77.06,1400.0,84.5,0.057],[77.6,4305.0,1315.3,0.287],[78.25,938.0,49.9,0.05],[78.7,7948.0,1497.9,0.177],[79.08,514.0,27.3,0.05],[79.43,377.0,20.1,0.05],[79.76,289.0,15.4,0.05],[80.24,263.0,14.0,0.05],[80.91,212.0,13.8,0.061],[81.23,241.0,30.6,0.119],[82.62,251.0,13.4,0.05],[83.07,8806.0,1588.5,0.17],[83.39,425.0,22.6,0.05],[83.71,228.0,12.1,0.05],[91.68,9797.0,1651.4,0.158],[92.16,201.0,21.2,0.099],[100.0,10686.0,3568.3,0.314],[101.2,213.0,20.0,0.088],[138.08,258.0,14.6,0.053],[139.0,11825.0,5803.5,0.461],[148.96,270.0,21.4,0.074],[150.0,11628.0,5709.5,0.461],[160.0,11912.0,5476.6,0.432],[198.12,6267.0,1700.5,0.255],[200.0,12426.0,5828.6,0.441],[201.1,6214.0,1586.8,0.24],[248.99,382.0,134.3,0.33],[250.0,12274.0,5806.0,0.445],[298.93,303.0,108.5,0.337],[300.0,11865.0,5976.0,0.473],[338.58,238.0,58.9,0.233],[340.0,12039.0,6298.5,0.492],[348.57,246.0,29.9,0.114],[350.0,12230.0,6349.0,0.488],[398.6,325.0,208.2,0.602],[400.0,12755.0,7451.8,0.549],[447.61,478.0,330.4,0.65],[450.0,13754.0,8627.4,0.59],[487.12,392.0,340.5,0.816],[490.0,14401.0,10427.2,0.681],[496.53,343.0,453.6,1.243],[500.0,14279.0,5479.4,0.361]]},"gRNA3_1-1":{"B":[[125.14,191.0,179.1,0.881]],"G":[[94.64,733.0,162.4,0.208],[95.64,313.0,40.0,0.12],[95.83,289.0,32.6,0.106],[96.25,1111.0,308.9,0.261],[96.79,158.0,8.4,0.05],[96.98,154.0,16.1,0.098],[97.43,121.0,6.4,0.05],[97.69,246.0,39.0,0.149],[190.51,112.0,10.1,0.085],[191.05,144.0,707.7,4.619],[191.77,125.0,13.3,0.1],[192.57,113.0,26.9,0.224]],"Y":[[127.82,151.0,246.3,1.533]],"R":[[35.0,593.0,31.5,0.05],[35.0,105.0,46.6,0.417],[48.41,195.0,40.7,0.196],[50.0,315.0,1775.2,5.297],[56.25,189.0,153.6,0.764],[62.5,169.0,172.3,0.958],[75.0,4267.0,10605.9,2.336],[75.26,250.0,13.3,0.05],[75.48,190.0,22.2,0.11],[75.77,111.0,16.0,0.135],[76.16,107.0,5.7,0.05],[76.51,110.0,21.8,0.187],[96.12,1770.0,461.4,0.245],[96.63,205.0,10.9,0.05],[96.79,158.0,8.4,0.05],[96.98,130.0,6.9,0.05],[97.27,117.0,6.2,0.05],[97.5,430.0,80.6,0.176],[97.69,134.0,7.2,0.05],[97.88,107.0,5.7,0.05],[98.04,108.0,6.7,0.058],[98.23,118.0,8.4,0.067],[160.0,101.0,50.1,0.466],[193.38,109.0,11.0,0.095],[194.18,115.0,498.2,4.072],[300.09,105.0,93.4,0.836],[320.49,101.0,130.1,1.211],[340.0,118.0,103.2,0.822],[349.92,127.0,84.0,0.622],[400.09,155.0,82.2,0.499],[426.2,104.0,14.1,0.128],[428.43,102.0,41.9,0.386],[429.77,104.0,18.3,0.166],[430.93,104.0,33.3,0.301],[434.94,106.0,49.8,0.442],[438.15,118.0,19.1,0.152],[448.66,108.0,57.0,0.496],[450.0,175.0,96.4,0.518],[450.68,102.0,15.7,0.145],[454.87,101.0,31.9,0.296],[456.32,121.0,14.0,0.109],[457.01,107.0,17.5,0.154],[457.69,117.0,16.5,0.133],[459.23,114.0,25.0,0.206],[463.16,100.0,20.6,0.194],[465.13,102.0,11.0,0.102],[465.81,100.0,14.1,0.132],[467.44,105.0,66.5,0.596],[469.83,107.0,51.1,0.449],[470.85,112.0,46.4,0.389],[471.45,106.0,15.8,0.14],[472.22,100.0,37.3,0.35],[472.82,100.0,33.7,0.317],[473.85,107.0,25.3,0.222],[476.41,111.0,16.1,0.136],[476.92,109.0,12.4,0.107],[478.72,110.0,46.4,0.397],[480.77,104.0,11.1,0.1],[481.45,105.0,14.9,0.134],[482.14,108.0,36.8,0.32],[483.33,112.0,10.5,0.088],[484.1,136.0,29.3,0.202],[484.87,112.0,23.6,0.198],[485.64,106.0,12.4,0.11],[486.24,105.0,48.9,0.437],[487.52,151.0,22.8,0.142],[487.95,106.0,25.5,0.226],[488.55,104.0,19.8,0.179],[489.49,129.0,9.7,0.071],[490.0,159.0,129.0,0.763],[490.62,120.0,23.5,0.184],[491.46,109.0,17.2,0.148],[492.81,116.0,14.3,0.116],[493.65,121.0,30.4,0.236],[494.27,114.0,17.2,0.142],[494.9,106.0,54.6,0.484],[495.83,123.0,21.1,0.161],[496.67,111.0,19.9,0.169],[497.19,118.0,18.7,0.149],[498.23,124.0,50.0,0.379],[499.79,163.0,79.0,0.456],[500.0,123.0,6.5,0.05],[500.0,132.0,7.0,0.05],[500.0,118.0,6.3,0.05],[500.0,115.0,6.1,0.05],[500.0,125.0,6.7,0.05],[500.0,116.0,6.2,0.05],[500.0,107.0,5.7,0.05],[500.0,116.0,6.2,0.05],[500.0,130.0,6.9,0.05],[500.0,118.0,6.3,0.05],[500.0,122.0,6.5,0.05],[500.0,115.0,6.1,0.05],[500.0,105.0,5.6,0.05],[500.0,126.0,6.7,0.05],[500.0,105.0,5.6,0.05],[500.0,112.0,6.0,0.05],[500.0,104.0,5.5,0.05],[500.0,103.0,5.5,0.05],[500.0,111.0,5.9,0.05],[500.0,116.0,6.2,0.05],[500.0,131.0,7.0,0.05],[500.0,125.0,6.7,0.05],[500.0,106.0,5.6,0.05],[500.0,130.0,6.9,0.05],[500.0,113.0,6.0,0.05],[500.0,143.0,7.6,0.05],[500.0,113.0,6.0,0.05],[500.0,124.0,6.6,0.05],[500.0,116.0,6.2,0.05],[500.0,138.0,7.3,0.05],[500.0,132.0,7.0,0.05],[500.0,105.0,5.6,0.05],[500.0,123.0,6.5,0.05],[500.0,128.0,6.8,0.05],[500.0,124.0,6.6,0.05],[500.0,121.0,6.4,0.05],[500.0,139.0,7.4,0.05],[500.0,137.0,7.3,0.05],[500.0,112.0,6.0,0.05],[500.0,118.0,6.3,0.05],[500.0,116.0,6.2,0.05],[500.0,141.0,7.5,0.05],[500.0,100.0,5.3,0.05],[500.0,102.0,5.4,0.05],[500.0,123.0,6.5,0.05],[500.0,125.0,6.7,0.05],[500.0,115.0,6.1,0.05],[500.0,133.0,7.1,0.05],[500.0,112.0,6.0,0.05],[500.0,137.0,7.3,0.05],[500.0,118.0,6.3,0.05],[500.0,118.0,6.3,0.05],[500.0,106.0,5.6,0.05],[500.0,122.0,6.5,0.05],[500.0,131.0,7.0,0.05],[500.0,132.0,7.0,0.05],[500.0,125.0,6.7,0.05],[500.0,133.0,7.1,0.05],[500.0,122.0,6.5,0.05],[500.0,103.0,5.5,0.05],[500.0,129.0,6.9,0.05],[500.0,138.0,7.3,0.05],[500.0,116.0,6.2,0.05],[500.0,129.0,6.9,0.05],[500.0,140.0,7.4,0.05],[500.0,105.0,5.6,0.05],[500.0,120.0,6.4,0.05],[500.0,117.0,6.2,0.05],[500.0,101.0,5.4,0.05],[500.0,152.0,8.1,0.05],[500.0,108.0,5.7,0.05],[500.0,135.0,7.2,0.05],[500.0,129.0,6.9,0.05],[500.0,134.0,7.1,0.05],[500.0,120.0,6.4,0.05],[500.0,124.0,6.6,0.05],[500.0,101.0,5.4,0.05],[500.0,131.0,7.0,0.05],[500.0,125.0,6.7,0.05],[500.0,114.0,6.1,0.05],[500.0,127.0,6.8,0.05],[500.0,112.0,6.0,0.05],[500.0,114.0,6.1,0.05],[500.0,124.0,6.6,0.05],[500.0,134.0,7.1,0.05],[500.0,133.0,7.1,0.05],[500.0,116.0,6.2,0.05],[500.0,131.0,7.0,0.05],[500.0,111.0,5.9,0.05],[500.0,130.0,6.9,0.05],[500.0,145.0,7.7,0.05],[500.0,137.0,7.3,0.05],[500.0,138.0,7.3,0.05],[500.0,130.0,6.9,0.05],[500.0,136.0,7.2,0.05],[500.0,135.0,7.2,0.05],[500.0,150.0,8.0,0.05],[500.0,134.0,7.1,0.05],[500.0,118.0,6.3,0.05],[500.0,143.0,7.6,0.05],[500.0,132.0,7.0,0.05],[500.0,108.0,5.7,0.05],[500.0,124.0,6.6,0.05],[500.0,130.0,6.9,0.05],[500.0,163.0,8.7,0.05],[500.0,138.0,7.3,0.05],[500.0,134.0,7.1,0.05],[500.0,135.0,7.2,0.05],[500.0,118.0,6.3,0.05],[500.0,137.0,7.3,0.05],[500.0,135.0,7.2,0.05],[500.0,160.0,8.5,0.05],[500.0,132.0,7.0,0.05],[500.0,128.0,6.8,0.05],[500.0,118.0,6.3,0.05],[500.0,127.0,6.8,0.05],[500.0,131.0,7.0,0.05],[500.0,145.0,7.7,0.05],[500.0,147.0,7.8,0.05],[500.0,113.0,6.0,0.05],[500.0,127.0,6.8,0.05],[500.0,137.0,7.3,0.05],[500.0,152.0,8.1,0.05],[500.0,126.0,6.7,0.05],[500.0,153.0,8.1,0.05],[500.0,132.0,7.0,0.05],[500.0,135.0,7.2,0.05],[500.0,131.0,7.0,0.05],[500.0,146.0,7.8,0.05],[500.0,130.0,6.9,0.05],[500.0,132.0,7.0,0.05],[500.0,117.0,6.2,0.05],[500.0,148.0,7.9,0.05],[500.0,130.0,6.9,0.05],[500.0,115.0,6.1,0.05],[500.0,127.0,6.8,0.05],[500.0,133.0,7.1,0.05],[500.0,151.0,8.0,0.05],[500.0,132.0,7.0,0.05],[500.0,109.0,5.8,0.05],[500.0,166.0,8.8,0.05],[500.0,131.0,7.0,0.05],[500.0,150.0,8.0,0.05],[500.0,144.0,7.7,0.05],[500.0,140.0,7.4,0.05],[500.0,137.0,7.3,0.05],[500.0,171.0,9.1,0.05],[500.0,132.0,7.0,0.05],[500.0,144.0,7.7,0.05],[500.0,161.0,8.6,0.05],[500.0,136.0,7.2,0.05],[500.0,143.0,7.6,0.05],[500.0,144.0,7.7,0.05],[500.0,140.0,7.4,0.05],[500.0,147.0,7.8,0.05],[500.0,138.0,7.3,0.05],[500.0,152.0,8.1,0.05],[500.0,118.0,6.3,0.05],[500.0,133.0,7.1,0.05],[500.0,121.0,6.4,0.05],[500.0,152.0,8.1,0.05],[500.0,158.0,8.4,0.05],[500.0,152.0,8.1,0.05],[500.0,146.0,7.8,0.05],[500.0,128.0,6.8,0.05],[500.0,124.0,6.6,0.05],[500.0,141.0,7.5,0.05],[500.0,148.0,7.9,0.05],[500.0,141.0,7.5,0.05],[500.0,156.0,8.3,0.05],[500.0,128.0,6.8,0.05],[500.0,129.0,6.9,0.05],[500.0,136.0,7.2,0.05],[500.0,137.0,7.3,0.05],[500.0,155.0,8.2,0.05],[500.0,125.0,6.7,0.05],[500.0,145.0,7.7,0.05],[500.0,150.0,8.0,0.05],[500.0,141.0,7.5,0.05],[500.0,137.0,7.3,0.05],[500.0,161.0,8.6,0.05],[500.0,116.0,6.2,0.05],[500.0,122.0,6.5,0.05],[500.0,166.0,8.8,0.05],[500.0,147.0,7.8,0.05],[500.0,134.0,7.1,0.05],[500.0,122.0,6.5,0.05],[500.0,146.0,7.8,0.05],[500.0,163.0,8.7,0.05],[500.0,140.0,7.4,0.05],[500.0,142.0,7.6,0.05],[500.0,128.0,6.8,0.05],[500.0,149.0,7.9,0.05],[500.0,139.0,7.4,0.05],[500.0,120.0,6.4,0.05],[500.0,151.0,8.0,0.05],[500.0,121.0,6.4,0.05],[500.0,142.0,7.6,0.05],[500.0,185.0,9.8,0.05],[500.0,172.0,9.2,0.05],[500.0,155.0,8.2,0.05],[500.0,134.0,7.1,0.05],[500.0,151.0,8.0,0.05],[500.0,128.0,6.8,0.05],[500.0,136.0,7.2,0.05],[500.0,137.0,7.3,0.05],[500.0,158.0,8.4,0.05],[500.0,137.0,7.3,0.05],[500.0,145.0,7.7,0.05],[500.0,160.0,8.5,0.05],[500.0,146.0,7.8,0.05],[500.0,143.0,7.6,0.05],[500.0,172.0,9.2,0.05],[500.0,124.0,6.6,0.05],[500.0,131.0,7.0,0.05]],"O":[[35.0,200.0,10.6,0.05],[35.0,953.0,50.7,0.05],[35.0,2642.0,1768.7,0.629],[37.12,259.0,132.5,0.481],[39.06,437.0,375.2,0.807],[41.71,372.0,104.8,0.265],[45.76,1017.0,805.6,0.744],[48.24,4763.0,1439.4,0.284],[50.0,5581.0,44459.4,7.487],[75.0,32767.0,179210.9,5.14],[75.55,2213.0,247.7,0.105],[75.9,1488.0,204.1,0.129],[76.25,864.0,46.0,0.05],[76.57,1101.0,224.9,0.192],[76.89,454.0,24.2,0.05],[77.57,915.0,333.9,0.343],[78.15,324.0,17.2,0.05],[78.66,1494.0,277.3,0.174],[79.08,217.0,11.5,0.05],[82.19,215.0,40.5,0.177],[83.06,1487.0,267.4,0.169],[91.69,1578.0,279.2,0.166],[100.0,1717.0,567.5,0.311],[139.0,1815.0,933.3,0.483],[150.0,1858.0,946.9,0.479],[160.0,1836.0,873.2,0.447],[200.0,1938.0,936.9,0.454],[250.0,1850.0,925.0,0.47],[300.0,1924.0,996.9,0.487],[340.0,1916.0,1073.6,0.527],[350.0,2044.0,1044.8,0.48],[400.0,2151.0,1257.8,0.55],[450.0,2141.0,1419.6,0.623],[488.72,217.0,69.5,0.301],[490.0,2267.0,1697.4,0.704],[500.0,2281.0,856.2,0.353]]}}};

// Raw trace store (populated on .fsa ingest; empty for the seeded peak-table
// dataset). Keyed by sample → {B,G,Y,R,O: Int16Array, bpAxis: Float32Array}.
// Kept on DATA so that the remount-by-key pattern in FragmentViewer picks it
// up alongside DATA.peaks without any new prop-drilling.
DATA.traces = DATA.traces || {};

// ======================================================================
// CONSTANTS — dyes, size standard, lab defaults
// ======================================================================
const DYE = {
  B: { name: "6-FAM", color: "#1e6fdb", label: "Blue",   adapter: 1, pair: "Y" },
  G: { name: "HEX",   color: "#2e9e4a", label: "Green",  adapter: 2, pair: "R" },
  Y: { name: "TAMRA", color: "#b8860b", label: "Yellow", adapter: 1, pair: "B" },
  R: { name: "ROX",   color: "#d32f2f", label: "Red",    adapter: 2, pair: "G" },
  O: { name: "LIZ",   color: "#ef6c00", label: "Orange", adapter: null, pair: null },
};

// Colorblind-safe palette overrides. Applied via resolveDyeColor() so that
// dye semantics stay fixed (B = blue channel, R = red channel, etc.) but
// the rendered colors shift to options that remain distinguishable under
// deutan (red-green) and protan (red-green) color vision. The Wong palette
// (Nature Methods 2011) is the canonical journal-recommended set; Okabe-Ito
// is a close alternative with a slightly warmer green.
export const DYE_PALETTES = {
  default: { B: "#1e6fdb", G: "#2e9e4a", Y: "#b8860b", R: "#d32f2f", O: "#ef6c00" },
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

const DYE_ORDER = ["B", "G", "Y", "R", "O"];
const SAMPLE_DYES = ["B", "G", "Y", "R"];
const LIZ_LADDER = [35, 50, 75, 100, 139, 150, 160, 200, 250, 300, 340, 350, 400, 450, 490, 500];

// Lab-known cut chemistry presets (derived from CLC protocol and Cas9 cut geometry)
const CHEMISTRY_PRESETS = [
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



// ----------------------------------------------------------------------
// Cas9 gRNA / PAM / cut-site prediction
// ----------------------------------------------------------------------
export function reverseComplement(s) {
  const m = { A: "T", T: "A", G: "C", C: "G", N: "N" };
  return s.toUpperCase().split("").reverse().map(c => m[c] || c).join("");
}

// Find all gRNA candidates in the target region. Returns list of objects:
// { id, strand, pam_seq, protospacer, target_pos, cut_construct }
// where cut_construct = last position in the LEFT fragment (top-strand cut position).
export function findGrnas(fullConstruct, targetStart, targetEnd) {
  const seq = fullConstruct.toUpperCase();
  const targetSeq = seq.substring(targetStart - 1, targetEnd);  // 0-indexed slice
  const out = [];
  let id = 0;

  // Top-strand PAMs: NGG on top strand 5' to 3'
  for (let i = 0; i <= targetSeq.length - 23; i++) {
    const t = targetSeq.substring(i + 20, i + 23);
    if (t.length === 3 && t[1] === "G" && t[2] === "G") {
      const proto = targetSeq.substring(i, i + 20);
      // Cut is 3 bp 5' of PAM: between protospacer positions 17 and 18.
      // In the target, cut is between target positions (i+17) and (i+18) using 0-indexed.
      // Equivalently, last base of LEFT fragment = target position (i+17) 0-indexed = (i+18) 1-indexed.
      const cutTargetPos = i + 17 + 1;  // 1-indexed last base of LEFT in target coords
      const cutConstruct = cutTargetPos + targetStart - 1;  // convert to construct coords
      out.push({
        id: id++,
        strand: "top",
        pam_seq: t,
        protospacer: proto,
        target_pos: i + 1,
        cut_construct: cutConstruct,
      });
    }
  }

  // Bot-strand PAMs: CCN on top strand = NGG on bot strand 5' to 3'
  for (let i = 0; i <= targetSeq.length - 23; i++) {
    const t = targetSeq.substring(i, i + 3);
    if (t[0] === "C" && t[1] === "C") {
      // Protospacer on bot is 20 bp 3' of CCN on top.
      const protoOnTop = targetSeq.substring(i + 3, i + 23);
      if (protoOnTop.length < 20) continue;
      const proto = reverseComplement(protoOnTop);   // bot strand 5' to 3'
      const pam_seq = reverseComplement(t);           // NGG on bot strand 5' to 3'
      // Cut on bot is 3 bp 5' of PAM on bot = 3 bp 3' of CCN on top.
      // Cut between top positions (i+5) and (i+6), 0-indexed.
      // Last base of LEFT fragment on top = (i+5) 0-indexed = (i+6) 1-indexed.
      const cutTargetPos = i + 5 + 1;
      const cutConstruct = cutTargetPos + targetStart - 1;
      out.push({
        id: id++,
        strand: "bot",
        pam_seq,
        protospacer: proto,
        target_pos: i + 1,
        cut_construct: cutConstruct,
      });
    }
  }
  return out;
}

// Predict ssDNA products from a Cas9 cut.
// overhang_nt > 0 means 5' overhang of N nt (top cut at cut_construct, bot cut at cut_construct + N)
// overhang_nt = 0 means blunt cut.
export function predictCutProducts(grna, constructSize, overhang_nt = 0) {
  const X = grna.cut_construct;  // 1-indexed last base of LEFT fragment on TOP strand
  const topLeft  = X;
  const topRight = constructSize - X;
  const botLeft  = X + overhang_nt;            // bot cut is further right for 5' overhang
  const botRight = constructSize - X - overhang_nt;

  const pamOnTop = grna.strand === "top";
  // PAM-proximal = fragment containing PAM.
  // PAM on top: PAM is 3' of cut, so RIGHT fragment has PAM -> RIGHT = proximal, LEFT = distal.
  // PAM on bot: PAM (as CCN on top) is 5' of cut on top strand coords, so LEFT fragment contains CCN -> LEFT = proximal.
  const leftIsProximal = !pamOnTop;
  // Non-template = strand with 5'-NGG-3'; template = complementary strand.
  // PAM on top -> top is non-template. PAM on bot -> bot is non-template.
  const topIsNonTemplate = pamOnTop;

  return {
    Y: { length: topLeft,  fragment: "LEFT",  strand: "top", template: topIsNonTemplate ? "non-template" : "template",     pam_side: leftIsProximal ? "proximal" : "distal" },
    B: { length: botLeft,  fragment: "LEFT",  strand: "bot", template: topIsNonTemplate ? "template"     : "non-template", pam_side: leftIsProximal ? "proximal" : "distal" },
    R: { length: topRight, fragment: "RIGHT", strand: "top", template: topIsNonTemplate ? "non-template" : "template",     pam_side: leftIsProximal ? "distal"   : "proximal" },
    G: { length: botRight, fragment: "RIGHT", strand: "bot", template: topIsNonTemplate ? "template"     : "non-template", pam_side: leftIsProximal ? "distal"   : "proximal" },
  };
}

// Auto-pick the gRNA whose predicted cut products best match a sample's observed or expected peaks.
function autoPickGrna(grnas, observed, constructSize, overhangsToTry = [0, 1, 4]) {
  let best = null;
  for (const g of grnas) {
    for (const oh of overhangsToTry) {
      const products = predictCutProducts(g, constructSize, oh);
      let score = 0; let count = 0;
      for (const d of SAMPLE_DYES) {
        const obs = observed[d];
        if (obs === null || obs === undefined) continue;
        score += Math.abs(products[d].length - obs);
        count++;
      }
      if (count < 2) continue;
      score /= count;
      if (!best || score < best.score) {
        best = { grna: g, overhang: oh, products, score };
      }
    }
  }
  return best;
}

// Validate a custom gRNA sequence against the target: find the protospacer match and its PAM.
function locateCustomGrna(grnaSeq, fullConstruct, targetStart, targetEnd) {
  const g = grnaSeq.toUpperCase().replace(/U/g, "T").replace(/[^ACGT]/g, "");
  if (g.length !== 20) return { ok: false, error: "gRNA must be exactly 20 nt" };
  const seq = fullConstruct.toUpperCase();
  const targetSeq = seq.substring(targetStart - 1, targetEnd);

  // Search on top strand for grna + NGG
  const topIdx = targetSeq.indexOf(g);
  if (topIdx >= 0 && topIdx + 22 < targetSeq.length) {
    const pam = targetSeq.substring(topIdx + 20, topIdx + 23);
    if (pam.length === 3 && pam[1] === "G" && pam[2] === "G") {
      return {
        ok: true,
        grna: {
          id: -1, strand: "top", pam_seq: pam, protospacer: g,
          target_pos: topIdx + 1,
          cut_construct: topIdx + 17 + 1 + targetStart - 1,
        },
      };
    }
  }
  // Search on bot strand (reverse complement of grna in the target)
  const grc = reverseComplement(g);
  const botIdx = targetSeq.indexOf(grc);
  if (botIdx >= 3) {
    const pamOnTop = targetSeq.substring(botIdx - 3, botIdx);
    if (pamOnTop.length === 3 && pamOnTop[0] === "C" && pamOnTop[1] === "C") {
      return {
        ok: true,
        grna: {
          id: -1, strand: "bot", pam_seq: reverseComplement(pamOnTop), protospacer: g,
          target_pos: botIdx - 3 + 1,
          cut_construct: botIdx - 3 + 5 + 1 + targetStart - 1,
        },
      };
    }
  }
  return { ok: false, error: "Protospacer not found adjacent to a PAM in target region" };
}



// ----------------------------------------------------------------------
// LAB gRNA CATALOG
// Curated list of gRNAs used by the Athey Lab / Single-Molecule Sequencing project.
// Each entry links an ordered gRNA name to its 20-nt protospacer (5' to 3' of the spacer).
// The viewer cross-references candidate gRNAs in the target region against this catalog
// and highlights matches; the auto-pick function biases toward catalog members.
//
// Sources:
//   - pilot_grna_positions.bed (CYP2D6 upstream/downstream panel, chr22)
//   - V059_gRNA3 construct (SnapGene file) -- the active fragment analysis construct
//   - Fireflies transcripts: Cas9 Subgroup Weekly Meeting 2026-03-20, 2026-02-13, 2026-01-30
//
// To add a new gRNA, append an entry below with: name, spacer (20 nt, 5'-to-3'),
// source_strand ("top"/"bot"/"unknown" relative to the canonical construct or locus),
// target (text describing the biological target), and notes (free text).
// ----------------------------------------------------------------------
// ======================================================================
// Automated Peak Classifier
// ----------------------------------------------------------------------
// For each dye channel in a sample:
//   1. Filter peaks above height threshold (noise floor)
//   2. Apply per-dye mobility offset (calibration)
//   3. Build prediction set: all gRNAs x overhang chemistries + assembly products
//   4. For each observed peak, find nearest prediction (within matchTol bp)
//   5. Cluster peaks within clusterTol bp: they represent the same underlying
//      species with different chemistries (e.g., blunt vs 3 nt overhang)
//   6. Report per cluster: main peak, member peaks with relative size and
//      abundance, best-guess identity, chemistry interpretation
// ======================================================================

export function classifyPeaks(sampleData, constructSeq, targetStart, targetEnd, constructSize, componentSizes, assemblyProducts, grnaCatalog, dyeOffsets, heightThreshold, matchTol, clusterTol, overhangsToConsider) {
  const grnas = findGrnas(constructSeq, targetStart, targetEnd);

  // Pre-compute all predictions per dye. Predictions are { size, label, kind, detail }
  const predictionsByDye = { B: [], G: [], Y: [], R: [] };

  for (const g of grnas) {
    const catMatch = matchLabCatalog(g);
    const baseName = catMatch ? catMatch.name : ("cand_" + g.id);
    for (const oh of overhangsToConsider) {
      const pr = predictCutProducts(g, constructSize, oh);
      for (const d of ["B", "G", "Y", "R"]) {
        const p = pr[d];
        predictionsByDye[d].push({
          size: p.length,
          label: baseName + " " + (oh === 0 ? "blunt" : (oh > 0 ? "+" + oh + "nt OH" : oh + "nt OH")),
          kind: "cas9_cut",
          grnaId: g.id,
          grnaName: baseName,
          strand: g.strand,
          overhang: oh,
          fragment: p.fragment,
          template: p.template,
          pam_side: p.pam_side,
          inCatalog: !!catMatch,
          targetPos: g.target_pos,
        });
      }
    }
  }

  for (const prod of assemblyProducts) {
    const sz = productSize(prod, componentSizes);
    for (const d of prod.dyes || []) {
      if (d in predictionsByDye) {
        predictionsByDye[d].push({
          size: sz,
          label: prod.name,
          kind: "assembly",
          productId: prod.id,
          inCatalog: false,
        });
      }
    }
  }

  // Now classify each dye channel
  const out = {};
  for (const dye of ["B", "G", "Y", "R"]) {
    const raw = (sampleData && sampleData[dye]) || [];
    const offset = (dyeOffsets && dyeOffsets[dye]) || 0;

    // Each peak: [size, height, area, width]. Apply offset.
    const filtered = raw
      .filter(p => p[1] >= heightThreshold)
      .map(p => ({
        rawSize: p[0],
        size: p[0] - offset,       // corrected
        height: p[1],
        area: p[2],
        width: p[3],
      }));

    const totalArea = filtered.reduce((s, p) => s + p.area, 0) || 1;

    const preds = predictionsByDye[dye];

    // Annotate each peak with its best predicted match
    for (const p of filtered) {
      const within = preds
        .map(pp => ({ pred: pp, delta: p.size - pp.size }))
        .filter(x => Math.abs(x.delta) <= matchTol)
        .sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta));
      p.bestMatch = within[0] || null;
      p.altMatches = within.slice(1, 4);
    }

    // Cluster: sort by size, group peaks whose consecutive gap <= clusterTol
    filtered.sort((a, b) => a.size - b.size);
    const clusters = [];
    let cur = null;
    for (const p of filtered) {
      if (!cur || (p.size - cur.lastSize) > clusterTol) {
        cur = { peaks: [], areaSum: 0, mainHeight: 0, main: null, lastSize: p.size };
        clusters.push(cur);
      }
      cur.peaks.push(p);
      cur.areaSum += p.area;
      cur.lastSize = p.size;
      if (p.height > cur.mainHeight) {
        cur.main = p;
        cur.mainHeight = p.height;
      }
    }

    // Compute per-cluster metrics
    for (const c of clusters) {
      c.channelAbundance = c.areaSum / totalArea;
      c.mainSize = c.main.size;
      for (const p of c.peaks) {
        p.relSize = p.size - c.mainSize;      // signed: + = larger, - = smaller
        p.relAbundance = p.area / c.areaSum;  // within-cluster fraction
      }
      // Pick best cluster-level identity: vote by closest match among all member peaks
      const voteMap = new Map();
      for (const p of c.peaks) {
        if (p.bestMatch) {
          const key = p.bestMatch.pred.kind === "cas9_cut"
            ? (p.bestMatch.pred.grnaName + "|" + p.bestMatch.pred.fragment)
            : p.bestMatch.pred.label;
          const w = p.area * (1 / (1 + Math.abs(p.bestMatch.delta)));
          const existing = voteMap.get(key);
          voteMap.set(key, existing
            ? { w: existing.w + w, pred: existing.pred }
            : { w, pred: p.bestMatch.pred });
        }
      }
      let bestIdentity = null;
      let bestW = 0;
      for (const [, v] of voteMap) {
        if (v.w > bestW) { bestW = v.w; bestIdentity = v.pred; }
      }
      c.identity = bestIdentity;

      // Chemistry interpretation: look at rel sizes of member peaks vs main
      // If main is closest-to-blunt (oh=0) and other members are +N or -N, those are chemistry variants
      c.chemistryNotes = [];
      for (const p of c.peaks) {
        if (!p.bestMatch) continue;
        const pr = p.bestMatch.pred;
        if (pr.kind === "cas9_cut") {
          const oh = pr.overhang;
          const sign = oh === 0 ? "blunt" : (oh > 0 ? (oh + " nt 5' overhang (longer strand)") : (Math.abs(oh) + " nt 3' overhang or other"));
          c.chemistryNotes.push({
            size: p.size,
            relSize: p.relSize,
            relAbundance: p.relAbundance,
            interp: pr.grnaName + " " + sign + " (Δ=" + p.bestMatch.delta.toFixed(2) + " bp)",
            kind: pr.kind,
          });
        } else {
          c.chemistryNotes.push({
            size: p.size,
            relSize: p.relSize,
            relAbundance: p.relAbundance,
            interp: pr.label + " (Δ=" + p.bestMatch.delta.toFixed(2) + " bp)",
            kind: pr.kind,
          });
        }
      }
    }

    out[dye] = {
      clusters,
      totalArea,
      nPeaks: filtered.length,
      dyeOffset: offset,
    };
  }

  return out;
}

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

  // ---- ADD NEW LAB gRNAs BELOW ----
  // { name: "Your_gRNA_Name", spacer: "NNNNNNNNNNNNNNNNNNNN", source: "...", target: "...", notes: "..." },
];

// Normalize spacer for comparison (uppercase, DNA only, strip U's)
export function normalizeSpacer(s) {
  return (s || "").toUpperCase().replace(/U/g, "T").replace(/[^ACGT]/g, "");
}

// Match a candidate gRNA against the lab catalog; returns catalog entry or null.
export function matchLabCatalog(grna) {
  const cand = normalizeSpacer(grna.protospacer);
  if (cand.length !== 20) return null;
  const candRC = cand.split("").reverse().map(c => ({A:"T",T:"A",G:"C",C:"G"})[c] || c).join("");
  for (const entry of LAB_GRNA_CATALOG) {
    const ref = normalizeSpacer(entry.spacer);
    if (ref.length !== 20) continue;
    if (ref === cand || ref === candRC) return entry;
  }
  return null;
}

function productSize(product, componentSizes) {
  let sum = 0;
  for (const k of product.parts) sum += componentSizes[k] || 0;
  return sum;
}

// ----------------------------------------------------------------------
// Lab inventory cross-check.
// Given a candidate gRNA (with protospacer) or a name string, decide whether
// it matches an entry in LAB_GRNA_CATALOG. Three signals, in order:
//   1. exact spacer match (forward or reverse-complement) when the catalog
//      entry has a 20-nt spacer
//   2. name-prefix match (catalog name appears in candidate name or vice versa)
//   3. otherwise: not in inventory
// Returns { status, entry?, signal }.
//   status: "exact" | "name" | "none"
// ----------------------------------------------------------------------
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

// Visual chip showing whether a gRNA is in the lab inventory.
export function LabInventoryBadge({ candidate, compact = false }) {
  const inv = inventoryStatus(candidate);
  if (inv.status === "exact") {
    return <Pill tone="emerald">{compact ? "LAB" : `LAB · ${inv.entry.name}`}</Pill>;
  }
  if (inv.status === "name") {
    return <Pill tone="sky">{compact ? "name?" : `name match · ${inv.entry.name}`}</Pill>;
  }
  return <Pill tone="neutral">{compact ? "—" : "not in lab inventory"}</Pill>;
}

// Summary panel: counts, populated-vs-pending breakdown, per-entry status table.
export function LabInventoryPanel({ candidates = [] }) {
  const total = LAB_GRNA_CATALOG.length;
  const populated = LAB_GRNA_CATALOG.filter(e => normalizeSpacer(e.spacer).length === 20).length;
  const pending = total - populated;
  const matchedExact = candidates.filter(c => inventoryStatus(c).status === "exact").length;
  const matchedName = candidates.filter(c => inventoryStatus(c).status === "name").length;
  return (
    <Panel
      title="Lab gRNA inventory"
      subtitle={`${total} catalog entries · ${populated} with 20-nt spacer · ${pending} pending upstream data (see .project/UNBLOCK_PROMPTS.md)`}
      className="mb-3"
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <Stat label="Catalog entries" value={total} />
        <Stat label="Spacers populated" value={populated} tone={populated > 0 ? "emerald" : "amber"} hint={pending ? `${pending} pending` : null} />
        <Stat label="Candidates matched (spacer)" value={matchedExact} tone={matchedExact > 0 ? "emerald" : "default"} />
        <Stat label="Candidates matched (name)" value={matchedName} tone="sky" />
      </div>
      <div className="overflow-auto">
        <table className="w-full text-xs num">
          <thead>
            <tr className="text-zinc-500 border-b border-zinc-200">
              <th className="text-left px-2 py-1 font-medium">name</th>
              <th className="text-left px-2 py-1 font-medium">target / region</th>
              <th className="text-left px-2 py-1 font-medium">spacer</th>
              <th className="text-left px-2 py-1 font-medium">status</th>
              <th className="text-left px-2 py-1 font-medium">source</th>
            </tr>
          </thead>
          <tbody>
            {LAB_GRNA_CATALOG.map(entry => {
              const ok = normalizeSpacer(entry.spacer).length === 20;
              return (
                <tr key={entry.name} className="border-b border-zinc-100">
                  <td className="px-2 py-1 font-mono text-zinc-800">{entry.name}</td>
                  <td className="px-2 py-1 text-zinc-600">{entry.target}</td>
                  <td className="px-2 py-1 font-mono text-[10px] text-zinc-500">{entry.spacer || <span className="italic text-amber-700">pending</span>}</td>
                  <td className="px-2 py-1">{ok ? <Pill tone="emerald">populated</Pill> : <Pill tone="amber">pending</Pill>}</td>
                  <td className="px-2 py-1 text-zinc-500 text-[11px]">{entry.source}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

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

// ----------------------------------------------------------------------
// Generic SVG -> PNG export (browser-native; no npm deps).
// Serializes the given <svg> element, paints it onto a white canvas at 2x
// scale, and triggers a download. Used by the per-figure Export buttons.
// ----------------------------------------------------------------------
// Trigger a browser download for a Blob. Shared by every export path so the
// link/cleanup dance lives in one place.
function downloadBlob(blob, filename) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

// Ensure the SVG has an explicit XML namespace before serialization so that
// saved .svg files render correctly when opened directly (the DOM copy often
// inherits the namespace implicitly and some viewers drop the root otherwise).
function serializeSvg(svgEl) {
  const clone = svgEl.cloneNode(true);
  if (!clone.getAttribute("xmlns")) clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  if (!clone.getAttribute("xmlns:xlink")) clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  return new XMLSerializer().serializeToString(clone);
}

// Native SVG export — no rasterization, no resolution cap, opens directly in
// Illustrator/Inkscape/Figma. This is the best format for publication figures
// because the downstream editor can tweak text, stroke widths, and colors.
export function exportSvgNative(svgEl, filename) {
  if (!svgEl) return;
  const xml = serializeSvg(svgEl);
  // BOM-less UTF-8 so Illustrator doesn't complain; CSS font stack inherited
  // from the live DOM will fall back on the opener's system fonts.
  const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
  downloadBlob(blob, filename || "fragment-viewer.svg");
}

// Rasterize SVG → Canvas → Blob, then download. Shared by PNG + JPG + WebP
// paths; they only differ in mime type + quality + background treatment.
// When `transparent` is true the canvas skips the white fill — produces a
// PNG/WebP with transparent background for compositing. JPG ignores it
// (JPEG has no alpha channel).
function rasterizeSvgToCanvas(svgEl, scale, onCanvas, { transparent = false } = {}) {
  const xml = serializeSvg(svgEl);
  const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  const img = new Image();
  img.onload = () => {
    const vb = svgEl.viewBox && svgEl.viewBox.baseVal;
    const w = (vb && vb.width)  || svgEl.clientWidth  || 800;
    const h = (vb && vb.height) || svgEl.clientHeight || 400;
    const canvas = document.createElement("canvas");
    canvas.width  = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    if (!transparent) {
      // Opaque white background — journals expect white, JPGs require
      // opaque, and transparent PNGs read as ugly grey on many templates.
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    onCanvas(canvas);
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}

// High-res PNG (scale ≥ 1; 2 = default, 4 = poster/print, 6 = slide zoom,
// 8 = giant poster / zoom crop). Set { transparent: true } for alpha-channel
// output suitable for Illustrator / PowerPoint compositing.
export function exportSvgAsPng(svgEl, filename, scale = 2, opts = {}) {
  if (!svgEl) return;
  rasterizeSvgToCanvas(svgEl, scale, (canvas) => {
    canvas.toBlob(blob => {
      if (!blob) return;
      downloadBlob(blob, filename || "fragment-viewer.png");
    }, "image/png");
  }, opts);
}

// JPEG with configurable quality (0.92 high, 0.80 standard, 0.60 compact).
// Useful for emailing figures where PNG would be too large — at 0.92 the
// visual cost is negligible and file size drops 3-5x. JPEG is always
// opaque (no alpha channel).
export function exportSvgAsJpg(svgEl, filename, scale = 2, quality = 0.92) {
  if (!svgEl) return;
  rasterizeSvgToCanvas(svgEl, scale, (canvas) => {
    canvas.toBlob(blob => {
      if (!blob) return;
      downloadBlob(blob, filename || "fragment-viewer.jpg");
    }, "image/jpeg", quality);
  });
}

// WebP — modern lossy format that beats JPEG on file-size-per-quality by
// 25–40%. Supported by all current browsers, Illustrator 2022+, and most
// scientific publishing pipelines (check journal submission specs first).
// Accepts { transparent: true } like PNG.
export function exportSvgAsWebp(svgEl, filename, scale = 4, quality = 0.92, opts = {}) {
  if (!svgEl) return;
  rasterizeSvgToCanvas(svgEl, scale, (canvas) => {
    canvas.toBlob(blob => {
      if (!blob) return;
      downloadBlob(blob, filename || "fragment-viewer.webp");
    }, "image/webp", quality);
  }, opts);
}

// Stack two SVG elements into a single combined SVG for bundled export.
// Computes the union viewBox (stacked vertically with a small gap), copies
// the inner nodes of each source SVG into the combined one, offsets the
// second by the height of the first. Returns a detached <svg> element that
// can be passed to exportSvgNative / exportSvgAsPng / exportSvgAsWebp.
export function buildCombinedSvg(svgList, { gap = 24, title = "DNA diagrams" } = {}) {
  const ns = "http://www.w3.org/2000/svg";
  const combined = document.createElementNS(ns, "svg");
  combined.setAttribute("xmlns", ns);
  combined.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  // Compute viewBox: max width across sources, sum of heights + gaps.
  let maxW = 0;
  let totalH = 0;
  const entries = [];
  for (const s of svgList) {
    if (!s) continue;
    const vb = s.viewBox && s.viewBox.baseVal;
    const w = (vb && vb.width)  || s.clientWidth  || 800;
    const h = (vb && vb.height) || s.clientHeight || 400;
    if (w > maxW) maxW = w;
    entries.push({ src: s, w, h, yOffset: totalH });
    totalH += h + gap;
  }
  totalH = Math.max(0, totalH - gap);  // trim the final gap
  combined.setAttribute("viewBox", `0 0 ${maxW} ${totalH}`);
  combined.setAttribute("width", String(maxW));
  combined.setAttribute("height", String(totalH));
  // White bg rect
  const bg = document.createElementNS(ns, "rect");
  bg.setAttribute("x", "0"); bg.setAttribute("y", "0");
  bg.setAttribute("width", String(maxW)); bg.setAttribute("height", String(totalH));
  bg.setAttribute("fill", "white");
  combined.appendChild(bg);
  // Optional title text — helpful when the file opens standalone
  if (title) {
    const t = document.createElementNS(ns, "title");
    t.textContent = title;
    combined.appendChild(t);
  }
  for (const { src, w, h, yOffset } of entries) {
    // Wrap source svg contents in a <g translate(centerX, yOffset)> so
    // narrower diagrams center horizontally within the combined frame.
    const g = document.createElementNS(ns, "g");
    const xOffset = (maxW - w) / 2;
    g.setAttribute("transform", `translate(${xOffset}, ${yOffset})`);
    // Deep-clone every child of the source SVG.
    for (const child of Array.from(src.childNodes)) {
      g.appendChild(child.cloneNode(true));
    }
    combined.appendChild(g);
  }
  return combined;
}

// Export menu: a single FileDown button that opens a small popover listing
// every available format. One component replaces all the scattered "export
// PNG" buttons so adding a new format is a one-line change here.
//
// Props:
//   svgRef   — React ref pointing at the <svg> element to export.
//   basename — filename stem; the format-specific suffix is appended.
//   formats  — array of format keys to show. Defaults to all five below.
//              Order controls menu order.
export function ExportMenu({
  svgRef,
  basename = "figure",
  formats = ["svg", "png2", "png4", "png6", "png8", "png4_alpha", "jpg_hi", "jpg_std", "webp_hi"],
  variant = "secondary",
  label = "Export",
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (anchorRef.current && !anchorRef.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);
  const doExport = (kind) => {
    const el = svgRef?.current;
    if (!el) return;
    switch (kind) {
      case "svg":        exportSvgNative(el, `${basename}.svg`); break;
      case "png2":       exportSvgAsPng(el, `${basename}@2x.png`, 2); break;
      case "png4":       exportSvgAsPng(el, `${basename}@4x.png`, 4); break;
      case "png6":       exportSvgAsPng(el, `${basename}@6x.png`, 6); break;
      case "png8":       exportSvgAsPng(el, `${basename}@8x.png`, 8); break;
      case "png4_alpha": exportSvgAsPng(el, `${basename}@4x_alpha.png`, 4, { transparent: true }); break;
      case "jpg_hi":     exportSvgAsJpg(el, `${basename}@4x_q92.jpg`, 4, 0.92); break;
      case "jpg_std":    exportSvgAsJpg(el, `${basename}@2x_q80.jpg`, 2, 0.80); break;
      case "webp_hi":    exportSvgAsWebp(el, `${basename}@4x_q92.webp`, 4, 0.92); break;
      case "webp_alpha": exportSvgAsWebp(el, `${basename}@4x_alpha.webp`, 4, 0.92, { transparent: true }); break;
      default: break;
    }
    setOpen(false);
  };
  const entries = {
    svg:        { group: "Vector",     label: "SVG · vector, editable",   hint: "Best for publication figures (Illustrator / Inkscape)" },
    png2:       { group: "Raster",     label: "PNG @ 2×",                 hint: "Screens, slides · ~1840 px wide" },
    png4:       { group: "Raster",     label: "PNG @ 4×",                 hint: "Publication, 300 DPI single column · ~3680 px" },
    png6:       { group: "Raster",     label: "PNG @ 6×",                 hint: "Posters, 300 DPI double column · ~5520 px" },
    png8:       { group: "Raster",     label: "PNG @ 8×",                 hint: "Giant prints, zoom-in crops · ~7360 px" },
    png4_alpha: { group: "Transparent",label: "PNG @ 4× · transparent",   hint: "Alpha channel for compositing in Illustrator / PowerPoint" },
    jpg_hi:     { group: "Compact",    label: "JPG @ 4× · high quality",  hint: "Q92; ~3-5× smaller than PNG" },
    jpg_std:    { group: "Compact",    label: "JPG @ 2× · standard",      hint: "Q80; email-friendly size" },
    webp_hi:    { group: "Compact",    label: "WebP @ 4× · high quality", hint: "Q92; ~25-40% smaller than JPG at equal quality" },
    webp_alpha: { group: "Transparent",label: "WebP @ 4× · transparent",  hint: "Q92 + alpha; best-in-class size for alpha-channel output" },
  };
  // Group for rendered section headers. Preserves `formats` order within
  // each group so callers can still fully control the menu contents.
  const groups = [];
  const seen = new Set();
  for (const k of formats) {
    const g = entries[k]?.group || "Other";
    if (!seen.has(g)) { groups.push(g); seen.add(g); }
  }
  return (
    <div ref={anchorRef} className="relative inline-block">
      <ToolButton icon={FileDown} variant={variant} onClick={() => setOpen(v => !v)} title="Export this figure — SVG / PNG / JPG / WebP at multiple resolutions, with optional transparent background">
        {label} {open ? "▾" : "▸"}
      </ToolButton>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-40 w-72 bg-white border border-zinc-200 rounded-lg shadow-xl overflow-hidden no-print max-h-[80vh] overflow-y-auto">
          {groups.map(g => (
            <div key={g}>
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 bg-zinc-50 border-b border-zinc-100">
                {g}
              </div>
              <ul className="divide-y divide-zinc-100">
                {formats.filter(k => (entries[k]?.group || "Other") === g).map(k => (
                  <li key={k}>
                    <button onClick={() => doExport(k)}
                      className="w-full px-3 py-2 flex items-start gap-2 text-left hover:bg-zinc-50 focus:bg-zinc-100 focus:outline-none">
                      <FileDown size={13} className="text-zinc-400 mt-0.5 shrink-0" />
                      <span className="min-w-0">
                        <span className="block text-xs font-medium text-zinc-800">{entries[k].label}</span>
                        <span className="block text-[11px] text-zinc-500">{entries[k].hint}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Peak-table CSV export. Produces a tidy long-format CSV that pairs well
// with pandas/R pipelines — one row per (sample, dye, peak) with size,
// height, area, and FWHM width. Returns a string; caller handles the
// download via downloadBlob.
export function buildPeakTableCSV(peaksBySample, opts = {}) {
  const includeO = opts.includeO === true;
  const dyes = includeO ? ["B", "G", "Y", "R", "O"] : ["B", "G", "Y", "R"];
  const rows = ["sample,dye,size_bp,height,area,width_fwhm_bp"];
  for (const sample of Object.keys(peaksBySample || {}).sort()) {
    const byDye = peaksBySample[sample] || {};
    for (const dye of dyes) {
      const peaks = byDye[dye] || [];
      for (const p of peaks) {
        // CSV-safe: sample names could in principle contain commas, so we
        // wrap any that do. Most lab filenames are safe (underscores only).
        const s = /[,"\n]/.test(sample) ? `"${sample.replace(/"/g, '""')}"` : sample;
        rows.push(`${s},${dye},${p[0]},${p[1]},${p[2]},${p[3]}`);
      }
    }
  }
  return rows.join("\n") + "\n";
}

// ----------------------------------------------------------------------
// Shareable view-state URL encoding (for "Copy link" in the Toolbar).
// State is JSON-stringified, then base64'd into the URL hash. Keeping it
// in the hash (not query string) means the server never sees it and no
// navigation round-trip is needed.
// ----------------------------------------------------------------------
export function encodeViewState(state) {
  try {
    const json = JSON.stringify(state);
    // btoa doesn't handle UTF-8 directly; encode as URI-safe UTF-8 first.
    const b64 = (typeof btoa !== "undefined")
      ? btoa(unescape(encodeURIComponent(json)))
      : Buffer.from(json, "utf-8").toString("base64");
    // URL-safe base64: replace + / = per RFC 4648.
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  } catch { return ""; }
}
export function decodeViewState(hash) {
  if (!hash) return null;
  try {
    // Accept with or without leading "#" + optional "view=" prefix.
    const raw = hash.replace(/^#/, "").replace(/^view=/, "");
    if (!raw) return null;
    // Undo URL-safe base64.
    let b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const json = (typeof atob !== "undefined")
      ? decodeURIComponent(escape(atob(b64)))
      : Buffer.from(b64, "base64").toString("utf-8");
    return JSON.parse(json);
  } catch { return null; }
}

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
const COMPONENT_INFO = (() => {
  const m = {};
  for (const c of CONSTRUCT.components) m[c.key] = c;
  return m;
})();

const DYE_HEX = { B: "#1e6fdb", G: "#16a34a", Y: "#ca8a04", R: "#dc2626", O: "#ea580c" };

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

const fmtBp  = v => (v === null || v === undefined || isNaN(v)) ? "—" : v.toFixed(2);
const fmtInt = v => (v === null || v === undefined || isNaN(v)) ? "—" : Math.round(v).toLocaleString();

// Find the tallest peak for a sample/dye within a size window.
function dominantPeak(peaks, sample, dye, lo = 50, hi = 500) {
  const arr = peaks[sample]?.[dye] || [];
  let best = null;
  for (const p of arr) {
    const [size, height] = p;
    if (size >= lo && size <= hi && (!best || height > best[1])) best = p;
  }
  return best ? { size: best[0], height: best[1], area: best[2], width: best[3] } : null;
}

// Classify a peak relative to target and expected positions.
function classifyPeak(size, target, expectedMap, tol) {
  for (const dye of SAMPLE_DYES) {
    if (Math.abs(size - expectedMap[dye]) <= tol) return { kind: "target", dye };
  }
  if (size < 50) return { kind: "small", dye: null };                 // primer/adapter dimer region
  if (target && size > target + 50) return { kind: "daisy", dye: null }; // daisy-chain or concatemer
  return { kind: "other", dye: null };
}

// Compute per-sample auto defaults: target = median of dominant B/G/Y/R peaks;
// expected_dye = dominant peak position within window of target.
function computeAutoDefaults(peaks) {
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
function identifyPeaks(peaks, cfg) {
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

// Build Gaussian-sum SVG path from peaks in a visible range.
function buildGaussianPath(peaks, xRange, yMax, geom, smoothing = 1, logY = false) {
  const [lo, hi] = xRange;
  const { laneTop, laneH, mLeft, plotW } = geom;
  const nSamples = Math.max(120, Math.floor(plotW / 1.2));
  const dx = (hi - lo) / nSamples;
  const ps = peaks.map(p => ({ mu: p[0], h: p[1], sigma: Math.max((p[3] || 0.5) / 2.355 * smoothing, 0.12) }));
  const yTransform = v => logY ? Math.log10(Math.max(1, v + 1)) / Math.log10(Math.max(2, yMax + 1)) : v / yMax;
  let strokePath = "";
  const points = [];
  for (let i = 0; i <= nSamples; i++) {
    const x = lo + i * dx;
    let y = 0;
    for (const p of ps) {
      const z = (x - p.mu) / p.sigma;
      if (z > 5 || z < -5) continue;
      y += p.h * Math.exp(-0.5 * z * z);
    }
    const px = mLeft + (i / nSamples) * plotW;
    const py = laneTop + laneH - Math.min(1, yTransform(Math.max(0, y))) * laneH;
    points.push([px, py]);
    strokePath += (i === 0 ? "M" : "L") + px.toFixed(1) + "," + py.toFixed(1);
  }
  const lastPx = mLeft + plotW;
  const baseY = laneTop + laneH;
  const fillPath = strokePath + "L" + lastPx.toFixed(1) + "," + baseY.toFixed(1) + "L" + mLeft + "," + baseY.toFixed(1) + "Z";
  return { stroke: strokePath, fill: fillPath };
}

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
  const [tab, setTab] = useState("trace");   // "trace" | "peakid" | "compare"

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

  const results = useMemo(() => identifyPeaks(DATA.peaks, cfg), [cfg]);

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

// Print stylesheet: hide UI chrome (.no-print), expand the main pane, and
// switch backgrounds to white for PDF export. Triggered by Print to PDF
// in AutoClassifyTab via window.print().
function PrintStyles() {
  return (
    <style>{`
      @media print {
        .no-print { display: none !important; }
        body, html { background: white !important; }
        .h-screen { height: auto !important; min-height: auto !important; background: white !important; }
        main { overflow: visible !important; border: none !important; }
        button, input[type="number"], input[type="file"], select, textarea { display: none !important; }
        .print-show { display: block !important; }
      }
      /* When the report modal is printing, hide everything outside the report
         container so the browser "Save as PDF" produces a clean document with
         no navigation chrome, modal backdrop, or tab content bleeding in.    */
      body.fv-report-printing > *:not(.fv-report-root) { display: none !important; }
      body.fv-report-printing .fv-report-root { position: static !important; background: white !important; box-shadow: none !important; max-width: none !important; }
      body.fv-report-printing .fv-report-root .fv-report-actions { display: none !important; }
      body.fv-report-printing .fv-report-root .fv-report-backdrop { display: none !important; }
      @media print {
        body.fv-report-printing { background: white !important; }
        body.fv-report-printing .fv-report-root { padding: 0 !important; }
      }
    `}</style>
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

export function buildReportMarkdown({ samples, peaksBySample, dyeOffsets, componentSizes, constructSize, targetStart, targetEnd, generatedAt }) {
  const lines = [];
  const dateStr = (generatedAt || new Date()).toISOString().slice(0, 10);
  lines.push(`# Fragment Viewer report`);
  lines.push("");
  lines.push(`- **Date:** ${dateStr}`);
  lines.push(`- **Samples:** ${samples.length}`);
  lines.push(`- **Construct size:** ${constructSize} bp (target window ${targetStart}–${targetEnd})`);
  lines.push(`- **Dye offsets (bp):** B=${dyeOffsets.B.toFixed(3)} · G=${dyeOffsets.G.toFixed(3)} · Y=${dyeOffsets.Y.toFixed(3)} · R=${dyeOffsets.R.toFixed(3)}`);
  lines.push("");
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

// Keyboard shortcut cheat sheet. Opens via `?` key or the `?` toolbar
// button. Escape closes. Entries are grouped so users can scan by intent
// instead of memorizing a flat list.
function KeyboardHelpModal({ open, onClose }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const groups = [
    {
      title: "Navigation",
      rows: [
        ["← / →", "Previous / next sample"],
        ["f",     "Reset zoom to full range"],
        ["Esc",   "Close modal / clear pin"],
      ],
    },
    {
      title: "Channels",
      rows: [
        ["1 / 2 / 3 / 4", "Toggle B / G / Y / R channel"],
      ],
    },
    {
      title: "Signal processing",
      rows: [
        ["[ / ]", "Decrease / increase smoothing σ multiplier"],
        ["n",     "Toggle 3σ noise-floor reference line"],
        ["r",     "Toggle raw unsmoothed trace overlay"],
      ],
    },
    {
      title: "Help",
      rows: [
        ["?", "Open this cheat sheet"],
      ],
    },
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 pb-10 px-4 overflow-auto no-print">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-xl border border-zinc-200 shadow-2xl">
        <header className="flex items-center justify-between px-5 py-4 border-b border-zinc-200">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Keyboard shortcuts</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Press <kbd className="px-1 py-0.5 text-[10px] rounded border border-zinc-300 bg-zinc-50 font-mono">Esc</kbd> to close</p>
          </div>
          <ToolButton variant="ghost" onClick={onClose}>Close</ToolButton>
        </header>
        <div className="px-5 py-4 space-y-4">
          {groups.map(g => (
            <section key={g.title}>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">{g.title}</h3>
              <ul className="space-y-1.5">
                {g.rows.map(([k, desc]) => (
                  <li key={k} className="flex items-center gap-3 text-xs">
                    <kbd className="inline-block min-w-[4.5ch] text-center px-1.5 py-0.5 rounded border border-zinc-300 bg-zinc-50 font-mono text-zinc-800">{k}</kbd>
                    <span className="text-zinc-700">{desc}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <p className="text-[11px] text-zinc-500 pt-2 border-t border-zinc-100">
            Shortcuts are ignored when typing in an input, select, or textarea.
          </p>
        </div>
      </div>
    </div>
  );
}

// DNA-diagrams modal: renders both the ConstructDiagram (annotated architecture
// ± cut site) and the ProductFragmentViz (ssDNA cut products) in a single
// preview pane, plus a bundle-export row that downloads both diagrams at
// once (combined SVG, combined PNG, or individual files per format).
function DNADiagramsModal({
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
                <ProductFragmentViz products={predictedProducts} constructSize={constructSize} />
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

function ReportModal({ open, onClose, samples, peaksBySample, dyeOffsets, componentSizes, constructSize, targetStart, targetEnd }) {
  if (!open) return null;
  const generatedAt = useMemo(() => new Date(), [open]);
  const dateStr = generatedAt.toISOString().slice(0, 10);
  const printSafePrint = () => {
    document.body.classList.add("fv-report-printing");
    // The next tick lets the class-scoped display:none apply before the
    // browser print pipeline snapshots the DOM.
    setTimeout(() => {
      window.print();
      setTimeout(() => document.body.classList.remove("fv-report-printing"), 250);
    }, 50);
  };
  const downloadMd = () => {
    const md = buildReportMarkdown({
      samples, peaksBySample, dyeOffsets, componentSizes,
      constructSize, targetStart, targetEnd, generatedAt,
    });
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fragment_report_${dateStr}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  return (
    <div className="fv-report-root fixed inset-0 z-50 flex items-start justify-center pt-8 pb-8 px-4 overflow-auto">
      <div className="fv-report-backdrop fixed inset-0 bg-black/40 no-print" onClick={onClose} />
      <div className="relative w-full max-w-3xl bg-white rounded-xl border border-zinc-200 shadow-2xl">
        <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-zinc-200">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Fragment Viewer report</h2>
            <p className="text-xs text-zinc-500 mt-0.5">{dateStr} · {samples.length} sample{samples.length === 1 ? "" : "s"} · construct {constructSize} bp</p>
          </div>
          <div className="fv-report-actions flex items-center gap-1.5 no-print">
            <ToolButton icon={FileDown} variant="primary" onClick={printSafePrint} title="Open the browser print dialog — choose 'Save as PDF' for a self-contained deliverable">
              Print / Save as PDF
            </ToolButton>
            <ToolButton icon={FileDown} variant="secondary" onClick={downloadMd} title="Download a markdown source compatible with the lab's pandoc+xelatex PDF recipe (see rendered block for the exact command)">
              Markdown
            </ToolButton>
            <ToolButton variant="ghost" onClick={onClose}>Close</ToolButton>
          </div>
        </header>
        <div className="px-5 py-4 space-y-5">
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
          <section>
            <h3 className="text-sm font-semibold text-zinc-800 mb-2">Per-sample summary</h3>
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
            Generated by Fragment Viewer at {generatedAt.toISOString()}. Print as PDF for a deliverable, or download as markdown and render with{" "}
            <code className="font-mono">pandoc … --pdf-engine=xelatex -V mainfont='DejaVu Sans'</code> (the lab's canonical PDF recipe).
          </section>
        </div>
      </div>
    </div>
  );
}

// Top toolbar. Brand + construct chip + global actions. 48px tall.
// Dark bar gives the eye a stable anchor; main pane reads as the work surface.
function Toolbar({ sampleCount, onUpload, onResetCalibration, onOpenReport, palette, setPalette, onDownloadCsv, onCopyLink, onOpenHelp, onOpenDnaDiagrams }) {
  return (
    <header className="h-12 flex items-center gap-4 px-4 bg-zinc-950 text-zinc-100 border-b border-zinc-800 no-print">
      <div className="flex items-center gap-2.5">
        <div className="p-1.5 rounded-md bg-zinc-800/80 ring-1 ring-zinc-700">
          <Microscope size={16} className="text-sky-400" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold tracking-tight">Fragment Viewer</span>
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">Athey Lab · SMS</span>
        </div>
      </div>
      <div className="h-6 w-px bg-zinc-800" />
      <div className="hidden md:flex items-center gap-2 text-xs">
        <Pill tone="dark" className="!bg-zinc-900 !border-zinc-700 !text-zinc-300">
          <span className="text-zinc-500">construct</span>
          <span className="font-mono text-zinc-100">V059_gRNA3</span>
        </Pill>
        <Pill tone="dark" className="!bg-zinc-900 !border-zinc-700 !text-zinc-300">
          <Database size={10} className="text-zinc-500" />
          <span className="font-mono text-zinc-100">{sampleCount}</span>
          <span className="text-zinc-500">samples</span>
        </Pill>
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-1">
        <UploadButton onData={onUpload} />
        <ToolButton icon={RotateCcw} variant="dark" title="Reset all per-dye mobility offsets to zero" onClick={onResetCalibration}>
          Reset calib.
        </ToolButton>
        <select
          value={palette}
          onChange={e => setPalette(e.target.value)}
          title="Dye color palette — switch to a colorblind-safe palette if needed"
          className="px-2 py-1 text-xs bg-zinc-900 text-zinc-200 border border-zinc-700 rounded-md hover:bg-zinc-800 focus-ring"
        >
          <option value="default">Default palette</option>
          <option value="wong">Wong (CB-safe, Nature Methods)</option>
          <option value="ibm">IBM (CB-safe, slides)</option>
          <option value="grayscale">Grayscale (print)</option>
        </select>
        <ToolButton icon={FileDown} variant="dark" title="Build a one-page report: sample summary, offsets, top peaks — saveable as PDF or markdown" onClick={onOpenReport}>
          Report
        </ToolButton>
        <ToolButton icon={FileDown} variant="dark" title="Open the DNA diagrams panel — construct architecture (with/without cut) + ssDNA cut products. Bundled SVG / PNG / JPG / WebP export at any resolution." onClick={onOpenDnaDiagrams}>
          DNA diagrams
        </ToolButton>
        <ToolButton icon={FileDown} variant="dark" title="Download the full peak table as a tidy long-format CSV (sample, dye, size, height, area, width). Ready for pandas / R / Excel." onClick={onDownloadCsv}>
          CSV
        </ToolButton>
        <ToolButton icon={ExternalLink} variant="dark" title="Copy a shareable URL that restores the current view (sample, zoom, channels, palette, pairing) on another machine" onClick={onCopyLink}>
          Link
        </ToolButton>
        <ToolButton variant="dark" title="Keyboard shortcuts (press ? anywhere)" onClick={onOpenHelp}>
          ?
        </ToolButton>
      </div>
    </header>
  );
}

// Left rail. Sectioned: Workflow on top, Resources at bottom (links to lab tools).
function Sidebar({ tab, setTab }) {
  const tabs = [
    { id: "trace",     label: "Electropherogram",  icon: Activity,   hint: "Per-sample trace, smoothing, ladder overlay" },
    { id: "peakid",    label: "Peak ID",           icon: Crosshair,  hint: "Match observed peaks to expected positions" },
    { id: "cutpred",   label: "Cut Prediction",    icon: Scissors,   hint: "Enumerate gRNAs and predict ssDNA products" },
    { id: "autoclass", label: "Auto Classify",     icon: Layers,     hint: "Cluster and identify peaks across all dyes" },
    { id: "compare",   label: "Cross-Sample",      icon: GitCompare, hint: "Overhang offsets and purity grid" },
    { id: "heatmap",   label: "Batch Heatmap",     icon: Database,   hint: "Sample × species heatmap · 96-well-plate view" },
  ];
  return (
    <nav className="w-52 shrink-0 bg-white border-r border-zinc-200 flex flex-col no-print">
      <div className="px-3 pt-3 pb-1">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Workflow</div>
      </div>
      <ul className="flex flex-col px-2 gap-0.5">
        {tabs.map((t, i) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <li key={t.id}>
              <button
                onClick={() => setTab(t.id)}
                title={t.hint}
                className={`group w-full flex items-center gap-2.5 px-2.5 py-1.5 text-sm rounded-md transition focus-ring ${
                  active
                    ? "bg-zinc-900 text-white"
                    : "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"
                }`}
              >
                <Icon size={15} className={active ? "text-sky-400" : "text-zinc-500 group-hover:text-zinc-700"} />
                <span className="font-medium truncate">{t.label}</span>
                <span className="ml-auto text-[10px] font-mono text-zinc-500/70">{i + 1}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto p-3 border-t border-zinc-100">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">Lab tools</div>
        <ul className="flex flex-col gap-0.5 text-xs text-zinc-600">
          <SidebarLink href="https://github.com/Single-Molecule-Sequencing/cas9-targeted-sequencing" label="cas9-targeted-sequencing" />
          <SidebarLink href="https://github.com/Single-Molecule-Sequencing/golden-gate" label="golden-gate" />
          <SidebarLink href="https://github.com/Single-Molecule-Sequencing/sma-seq-workspace" label="sma-seq" />
          <SidebarLink href="https://www.pharmvar.org" label="PharmVar" />
        </ul>
        <div className="mt-3 text-[10px] text-zinc-500 leading-snug">
          Drag a GeneMapper TSV anywhere in this window to swap datasets.
        </div>
      </div>
    </nav>
  );
}

function SidebarLink({ href, label }) {
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 px-1.5 py-0.5 rounded hover:bg-zinc-100 hover:text-zinc-900 transition"
      >
        <ExternalLink size={10} className="text-zinc-400" />
        <span className="truncate">{label}</span>
      </a>
    </li>
  );
}

// Bottom status bar. Always visible. CLI-style readout.
function StatusBar({ sampleCount, peakCount, calibrated, construct }) {
  return (
    <footer className="h-7 flex items-center gap-3 px-3 bg-zinc-100 text-zinc-600 border-t border-zinc-200 text-[11px] no-print">
      <span className="flex items-center gap-1.5">
        <Database size={11} className="text-zinc-400" />
        <span className="text-zinc-500">samples</span>
        <span className="font-mono text-zinc-800">{sampleCount}</span>
      </span>
      <span className="text-zinc-300">·</span>
      <span className="flex items-center gap-1">
        <span className="text-zinc-500">peaks</span>
        <span className="font-mono text-zinc-800 num">{peakCount.toLocaleString()}</span>
      </span>
      <span className="text-zinc-300">·</span>
      <span className="flex items-center gap-1">
        <span className="text-zinc-500">construct</span>
        <span className="font-mono text-zinc-800">{construct}</span>
      </span>
      <span className="text-zinc-300">·</span>
      <span className="flex items-center gap-1">
        {calibrated
          ? <CheckCircle2 size={11} className="text-emerald-600" />
          : <AlertTriangle size={11} className="text-amber-600" />}
        <span className={calibrated ? "text-emerald-700" : "text-amber-700"}>
          {calibrated ? "calibrated" : "uncalibrated"}
        </span>
      </span>
      <div className="flex-1" />
      <a
        href="https://github.com/Single-Molecule-Sequencing/fragment-viewer"
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-zinc-500 hover:text-zinc-900"
      >
        v0.7.0
      </a>
    </footer>
  );
}

// ======================================================================
// TAB 1 — Single-sample electropherogram viewer with high-res trace
// ======================================================================
// Per-sample style row — one instance per overlaid sample. Each row carries
// independent controls for stroke width, stroke opacity, fill opacity, and
// dash pattern. The accent parameter themes the row header so the two rows
// are visually distinguishable at a glance (zinc = current/cut, indigo =
// reference/uncut). Previews the current dash pattern inline as a SVG line
// so users see the choice before applying.
function SampleStyleRow({ title, accent = "zinc", style, setField }) {
  const titleCls = accent === "indigo" ? "text-indigo-700" : "text-zinc-700";
  const dashPatterns = [
    { k: "solid",    l: "Solid",    arr: "none" },
    { k: "dotted",   l: "Dotted",   arr: "1 3", cap: "round" },
    { k: "dashed",   l: "Dashed",   arr: "5 3" },
    { k: "dash-dot", l: "Dash-dot", arr: "5 2 1 2" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
      <span className={`font-semibold tracking-tight ${titleCls} min-w-[22ch]`}>{title}</span>
      <label className="flex items-center gap-1.5" title="Stroke width of the modeled gaussian trace">
        <span className="text-zinc-500">Width</span>
        <input type="range" min="0.5" max="3" step="0.1" value={style.strokeWidth}
               onChange={e => setField("strokeWidth", parseFloat(e.target.value))} className="accent-zinc-700 w-20" />
        <span className="tabular-nums text-zinc-600 w-8">{style.strokeWidth.toFixed(1)}</span>
      </label>
      <label className="flex items-center gap-1.5" title="Stroke opacity (line)">
        <span className="text-zinc-500">Line α</span>
        <input type="range" min="0.1" max="1" step="0.05" value={style.strokeOpacity}
               onChange={e => setField("strokeOpacity", parseFloat(e.target.value))} className="accent-zinc-700 w-20" />
        <span className="tabular-nums text-zinc-600 w-10">{style.strokeOpacity.toFixed(2)}</span>
      </label>
      <label className="flex items-center gap-1.5" title="Fill opacity (under the line)">
        <span className="text-zinc-500">Fill α</span>
        <input type="range" min="0" max="0.6" step="0.02" value={style.fillOpacity}
               onChange={e => setField("fillOpacity", parseFloat(e.target.value))} className="accent-zinc-700 w-20" />
        <span className="tabular-nums text-zinc-600 w-10">{style.fillOpacity.toFixed(2)}</span>
      </label>
      <label className="flex items-center gap-1.5">
        <span className="text-zinc-500">Pattern</span>
        <div className="inline-flex rounded-md border border-zinc-300 overflow-hidden">
          {dashPatterns.map(d => (
            <button key={d.k} onClick={() => setField("dash", d.k)}
              className={`px-1.5 py-0.5 ${style.dash === d.k ? "bg-zinc-900 text-white" : "bg-white text-zinc-700 hover:bg-zinc-100"}`}
              title={d.l}>
              <svg width="26" height="6" aria-hidden style={{ display: "block" }}>
                <line x1="0" y1="3" x2="26" y2="3"
                      stroke={style.dash === d.k ? "white" : "#334155"}
                      strokeWidth="1.5"
                      strokeDasharray={d.arr}
                      strokeLinecap={d.cap || "butt"} />
              </svg>
            </button>
          ))}
        </div>
      </label>
    </div>
  );
}

// Peak-shift analysis panel — quantifies the dotted-vs-solid visual overlay
// into per-dye bp shifts. For each current-sample peak, finds the nearest
// reference peak within tol and records the signed delta. Median is robust
// to outliers; mean is shown for transparency. Negative values = cut peaks
// are SMALLER in bp than uncut peaks (as expected for cleavage products).
function PeakShiftPanel({ currentSample, referenceSample, currentPeaks, referencePeaks, palette }) {
  const colorFor = (d) => resolveDyeColor(d, palette);
  const [tol, setTol] = useState(2.5);
  const stats = useMemo(
    () => computePeakShiftStats(currentPeaks, referencePeaks, tol),
    [currentPeaks, referencePeaks, tol]
  );
  return (
    <Panel
      title="Peak shift analysis"
      subtitle={`Signed bp offset: peaks in ${currentSample} minus nearest peaks in ${referenceSample} within tolerance.`}
      className="mb-3"
      actions={
        <label className="flex items-center gap-2 text-xs">
          <span className="text-zinc-600">Tol</span>
          <input type="range" min="0.5" max="5" step="0.1" value={tol}
                 onChange={e => setTol(parseFloat(e.target.value))} className="accent-zinc-700 w-24" />
          <span className="tabular-nums text-zinc-600 w-14">{tol.toFixed(1)} bp</span>
        </label>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {["B", "G", "Y", "R"].map(d => {
          const s = stats.byDye[d] || { n: 0, medianShift: null, meanShift: null };
          const tone = s.medianShift == null ? "neutral"
            : s.medianShift < -0.3 ? "emerald"      // shifted smaller — cleavage expected sign
            : s.medianShift >  0.3 ? "rose"          // shifted larger — unexpected
            :                        "neutral";
          const toneBg = {
            neutral: "bg-zinc-50 border-zinc-200",
            emerald: "bg-emerald-50 border-emerald-200",
            rose:    "bg-rose-50 border-rose-200",
          }[tone];
          return (
            <div key={d} className={`px-3 py-2.5 rounded-lg border ${toneBg}`}>
              <div className="flex items-center gap-2 mb-1">
                <DyeChip dye={d} showLabel />
                <span className="ml-auto text-[11px] text-zinc-500">n={s.n}</span>
              </div>
              {s.n === 0 ? (
                <div className="text-xs text-zinc-400">no matched pairs</div>
              ) : (
                <>
                  <div className="text-xs text-zinc-600">
                    median <span className="font-mono font-semibold text-zinc-800 tabular-nums">
                      {s.medianShift > 0 ? "+" : ""}{s.medianShift.toFixed(2)} bp
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    mean {s.meanShift > 0 ? "+" : ""}{s.meanShift.toFixed(2)} bp
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 text-[11px] text-zinc-500">
        Totals: <span className="font-mono text-zinc-700">{stats.totalN}</span> matched peaks across all four dyes.
        {" "}Green = net shift to smaller sizes (expected after Cas9 cleavage); rose = shift to larger sizes (investigate).
      </div>
    </Panel>
  );
}

// Preprocessing controls block — rendered once for the current sample and,
// when pairing is active, a second time for the reference sample with its
// own `prep` state object. Factored into a component so the two instances
// stay in lockstep visually and only differ in the accent color on the
// border + title.
function PrepControls({ title, accent = "zinc", prep, setPrepField }) {
  const borderCls = accent === "indigo" ? "border-indigo-200 bg-indigo-50/40" : "border-zinc-200";
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 pt-2 border-t ${borderCls}`}>
      <span className={`font-semibold uppercase tracking-wide ${accent === "indigo" ? "text-indigo-700" : "text-zinc-600"}`}>{title}</span>
      <label className="flex items-center gap-2">
        <span className="text-zinc-600">Smooth</span>
        <select value={prep.smooth} onChange={e => setPrepField("smooth", e.target.value)}
                className="px-1.5 py-0.5 text-xs border border-zinc-300 rounded bg-white focus-ring">
          <option value="none">None (raw)</option>
          <option value="savgol">Savitzky–Golay</option>
        </select>
      </label>
      {prep.smooth === "savgol" && (
        <>
          <label className="flex items-center gap-2">
            <span className="text-zinc-600">Window</span>
            <select value={prep.savgolWindow} onChange={e => setPrepField("savgolWindow", parseInt(e.target.value, 10))}
                    className="px-1.5 py-0.5 text-xs border border-zinc-300 rounded bg-white focus-ring">
              {[5, 7, 9, 11, 13, 15, 17, 19, 21].map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-zinc-600">Order</span>
            <select value={prep.savgolOrder} onChange={e => setPrepField("savgolOrder", parseInt(e.target.value, 10))}
                    className="px-1.5 py-0.5 text-xs border border-zinc-300 rounded bg-white focus-ring">
              <option value={2}>2 (quadratic)</option>
              {prep.savgolWindow >= 7 && prep.savgolWindow <= 9 && <option value={4}>4 (quartic)</option>}
            </select>
          </label>
        </>
      )}
      <label className="flex items-center gap-1 cursor-pointer">
        <input type="checkbox" checked={prep.baseline}
               onChange={e => setPrepField("baseline", e.target.checked)} className="w-3.5 h-3.5 accent-emerald-600" />
        <span className="text-zinc-700">Baseline subtract</span>
      </label>
      {prep.baseline && (
        <label className="flex items-center gap-2">
          <span className="text-zinc-600">Window</span>
          <input type="number" min="11" max="2001" step="2" value={prep.baselineWindow}
                 onChange={e => setPrepField("baselineWindow", Math.max(11, parseInt(e.target.value, 10) || 201))}
                 className="w-20 px-1.5 py-0.5 text-xs border border-zinc-300 rounded bg-white focus-ring tabular-nums" />
        </label>
      )}
      <label className="flex items-center gap-1 cursor-pointer" title="Cap the raw signal at a ceiling (tames saturated peaks without touching the peak table)">
        <input type="checkbox" checked={prep.clip}
               onChange={e => setPrepField("clip", e.target.checked)} className="w-3.5 h-3.5 accent-amber-600" />
        <span className="text-zinc-700">Clip saturated</span>
      </label>
      {prep.clip && (
        <label className="flex items-center gap-2">
          <span className="text-zinc-600">Ceiling</span>
          <input type="number" min="1000" step="500" value={prep.clipCeiling}
                 onChange={e => setPrepField("clipCeiling", Math.max(100, parseInt(e.target.value, 10) || 30000))}
                 className="w-24 px-1.5 py-0.5 text-xs border border-zinc-300 rounded bg-white focus-ring tabular-nums" />
        </label>
      )}
    </div>
  );
}

function TraceTab({ samples, cfg, setCfg, results, componentSizes, setCSize, constructSeq, targetStart, targetEnd, palette = "default" }) {
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
  // Paired-sample Y-axis scaling.
  //   "shared"      — both samples share one lane yMax (current + reference
  //                   peaks pooled). Preserves absolute signal differences.
  //   "independent" — each sample scales to its own peak max per channel
  //                   ("per-sample normalization"). Preserves SHAPE /
  //                   POSITION information while hiding intensity differences.
  const [pairScale, setPairScale] = useState(() => seeded("pairScale", "shared"));
  // Independent preprocessing for the reference (uncut) sample. Mirrors the
  // `prep` state that applies to the current sample. Empty defaults = no-op
  // so enabling pairing doesn't accidentally modify the reference display.
  const [prepRef, setPrepRef] = useState(() => seeded("prepRef", {
    smooth: "none", savgolWindow: 7, savgolOrder: 2,
    baseline: false, baselineWindow: 201,
    clip: false, clipCeiling: 30000,
  }));
  const setPrepRefField = (k, v) => setPrepRef(p => ({ ...p, [k]: v }));

  // Preprocessing pipeline applied to raw trace before rendering. Purely
  // visual — never mutates the stored traces or the called peak table.
  const [prep, setPrep] = useState({
    smooth: "none",        // "none" | "savgol"
    savgolWindow: 7,
    savgolOrder: 2,
    baseline: false,
    baselineWindow: 201,
    clip: false,
    clipCeiling: 30000,
  });
  const setPrepField = (k, v) => setPrep(p => ({ ...p, [k]: v }));
  // Default to V059_gRNA3 (index 0 in LAB_GRNA_CATALOG, populated 2026-04-18).
  const [speciesGrnaIdx, setSpeciesGrnaIdx] = useState(0);
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
      currentStyle, refStyle]);

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

      {/* Static species reference card (always available) */}
      <SpeciesLegend
        componentSizes={componentSizes}
        defaultOpen={false}
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

// Floating popover anchored to the clicked peak. Renders <SpeciesSchematic>
// thumbnails so the user sees the molecular structure at a glance. Stays open
// until the user clicks the X, clicks outside, or presses Escape.
function PeakSpeciesPopover({ hover, componentSizes, constructSize, gRNAs, overhangs, tol = 2.5, onClose }) {
  const popoverRef = useRef(null);
  const matches = useMemo(
    () => speciesAtSize({
      bp: hover.size, dye: hover.dye, tol,
      componentSizes, constructSize, gRNAs, overhangs,
    }),
    [hover.size, hover.dye, tol, componentSizes, constructSize, gRNAs, overhangs]
  );
  // Outside-click + Escape dismissal
  useEffect(() => {
    const onMouseDown = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        // Don't dismiss if the user clicked another peak hit-target (let the new click pin it)
        const isPeakHit = e.target?.tagName === "rect" && e.target.getAttribute("fill") === "transparent";
        if (!isPeakHit) onClose && onClose();
      }
    };
    const onKey = (e) => { if (e.key === "Escape") onClose && onClose(); };
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  // Position the popover near the cursor; flip if near the right or bottom
  // edges of the viewport so it stays fully visible.
  const popW = 400, popH = Math.min(440, 100 + matches.length * 60);
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  let left = hover.clientX + 14;
  let top  = hover.clientY + 14;
  if (left + popW > vw - 8) left = Math.max(8, hover.clientX - popW - 14);
  if (top  + popH > vh - 8) top  = Math.max(8, hover.clientY - popH - 14);
  return (
    <div
      ref={popoverRef}
      className="fixed z-50 bg-white rounded-xl border border-zinc-200 shadow-xl overflow-hidden no-print"
      style={{ left, top, width: popW, maxHeight: popH }}
    >
      <div className="px-3 py-2 border-b border-zinc-100 flex items-center gap-2 bg-zinc-50">
        <DyeChip dye={hover.dye} showLabel />
        <div className="flex-1">
          <div className="text-xs font-mono text-zinc-700">{hover.size.toFixed(2)} bp</div>
          <div className="text-[10px] text-zinc-500">height {Math.round(hover.height).toLocaleString()}{hover.area ? ` · area ${Math.round(hover.area).toLocaleString()}` : ""}</div>
        </div>
        <Pill tone="neutral">{matches.length} match{matches.length === 1 ? "" : "es"}</Pill>
        <button
          onClick={onClose}
          className="text-zinc-400 hover:text-zinc-700 text-base leading-none"
          aria-label="Close"
          title="Close (or press Escape)"
        >
          ×
        </button>
      </div>
      <div className="overflow-auto max-h-72 divide-y divide-zinc-100">
        {matches.length === 0 ? (
          <div className="px-3 py-3 text-xs text-zinc-500">
            No expected species within ±{tol} bp on this dye. The peak may be a noise / non-target product, or an unexpected chemistry.
          </div>
        ) : matches.map((sp, i) => {
          const tone = sp.kind === "cut" ? "sky" : sp.kind === "monomer" ? "amber" : "neutral";
          // Build schematic props from the species' source reactant when known
          const reactant = sp.source_reactant ? TARGET_REACTANTS.find(r => r.id === sp.source_reactant) : null;
          const sprops = reactant
            ? speciesSchematicProps(reactant)
            : (() => {
                // Match against ASSEMBLY_PRODUCTS by size + dyes
                const a = ASSEMBLY_PRODUCTS.find(ap => ap.dyes.includes(hover.dye) && Math.abs(productSize(ap, componentSizes) - sp.size) < 1);
                return a ? speciesSchematicProps(a) : { parts: [], leftDyes: [], rightDyes: [] };
              })();
          return (
            <div key={i} className="px-3 py-2 flex items-start gap-2">
              <div className="shrink-0">
                <SpeciesSchematic
                  parts={sprops.parts} leftDyes={sprops.leftDyes} rightDyes={sprops.rightDyes}
                  width={140} height={26}
                  showCut={sp.kind === "cut" && reactant ? { bp: gRNAs[0]?.cut_construct } : null}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Pill tone={tone}>{sp.kind}</Pill>
                  <span className="text-[11px] font-mono text-zinc-500">{sp.size} bp · Δ {sp.dist.toFixed(2)}</span>
                </div>
                <div className="text-[11px] text-zinc-800 leading-snug break-words">
                  {sp.fullLabel || sp.label}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatTick(v) {
  if (v >= 10000) return (v / 1000).toFixed(0) + "k";
  if (v >= 1000)  return (v / 1000).toFixed(1) + "k";
  return v.toString();
}

function computeLinearTicks(yMax) {
  const step = yMax > 40000 ? 10000 : yMax > 10000 ? 5000 : yMax > 2000 ? 1000 : yMax > 500 ? 200 : 100;
  const t = [];
  for (let v = 0; v <= yMax; v += step) t.push(v);
  return t;
}

// ======================================================================
// Per-sample summary card on trace tab
// ======================================================================
function SampleSummaryCard({ sample, cfg, setCfg, results }) {
  const s = cfg[sample];
  if (!s || !results) return null;

  const updateExpected = (dye, v) => {
    const nv = parseFloat(v);
    if (!isFinite(nv)) return;
    setCfg({ ...cfg, [sample]: { ...s, expected: { ...s.expected, [dye]: nv } } });
  };
  const updateTarget = v => {
    const nv = parseFloat(v);
    if (!isFinite(nv)) return;
    // Shift all expected by (newtarget - oldtarget)
    const shift = nv - s.target;
    const newExp = { ...s.expected };
    for (const d of SAMPLE_DYES) newExp[d] = +(newExp[d] + shift).toFixed(2);
    setCfg({ ...cfg, [sample]: { ...s, target: nv, expected: newExp } });
  };

  return (
    <div className="bg-white rounded-lg border border-zinc-200 p-3">
      <div className="text-sm font-medium mb-2">Expected peaks · Match quality</div>
      <div className="flex items-center gap-2 mb-2 text-xs">
        <span className="text-zinc-500">Target:</span>
        <input
          type="number" step="0.1" value={s.target}
          onChange={e => updateTarget(e.target.value)}
          className="w-20 px-1.5 py-0.5 border border-zinc-300 rounded text-xs font-mono" />
        <span className="text-zinc-500">bp</span>
        <span className="text-zinc-500 ml-auto">Tol ±{s.tolerance.toFixed(1)} bp</span>
      </div>
      <table className="w-full text-xs">
        <thead className="text-zinc-500">
          <tr className="border-b border-zinc-200">
            <th className="py-1 text-left font-medium">Dye</th>
            <th className="py-1 text-right font-medium">Expected</th>
            <th className="py-1 text-right font-medium">Observed</th>
            <th className="py-1 text-right font-medium">Δ bp</th>
            <th className="py-1 text-right font-medium">Height</th>
            <th className="py-1 text-right font-medium">Purity</th>
          </tr>
        </thead>
        <tbody>
          {SAMPLE_DYES.map(d => {
            const r = results[d];
            const ok = !!r.match;
            return (
              <tr key={d} className="border-b border-zinc-100">
                <td className="py-1">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-middle" style={{ background: DYE[d].color }} />
                  {DYE[d].label}
                </td>
                <td className="py-1 text-right">
                  <input type="number" step="0.1" value={s.expected[d]}
                    onChange={e => updateExpected(d, e.target.value)}
                    className="w-16 px-1.5 py-0.5 border border-zinc-200 rounded text-xs font-mono text-right" />
                </td>
                <td className="py-1 text-right font-mono">{ok ? r.match.size.toFixed(2) : "—"}</td>
                <td className={`py-1 text-right font-mono ${ok ? (Math.abs(r.match.delta) < 1 ? "text-emerald-600" : "text-amber-600") : "text-rose-500"}`}>
                  {ok ? (r.match.delta >= 0 ? "+" : "") + r.match.delta.toFixed(2) : "miss"}
                </td>
                <td className="py-1 text-right font-mono">{ok ? Math.round(r.match.height).toLocaleString() : "—"}</td>
                <td className="py-1 text-right font-mono">{r.purity !== null ? (r.purity * 100).toFixed(0) + "%" : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Overhang offsets inferred from pairing */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <OverhangBadge label="Adapter 1 end (B vs Y · 6-FAM vs TAMRA)" a={results.B?.match?.size} b={results.Y?.match?.size} />
        <OverhangBadge label="Adapter 2 end (G vs R · HEX vs ROX)"    a={results.G?.match?.size} b={results.R?.match?.size} />
      </div>

      {/* Auto-redetect from current data */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <button
          onClick={() => {
            const auto = computeAutoDefaults({ [sample]: DATA.peaks[sample] })[sample];
            setCfg({ ...cfg, [sample]: auto });
          }}
          className="px-2 py-1 text-[11px] rounded border border-zinc-300 bg-white hover:bg-zinc-100">
          Auto-detect from tallest peaks
        </button>
        {CHEMISTRY_PRESETS.map(p => (
          <button
            key={p.id}
            onClick={() => {
              const t = s.target;
              setCfg({ ...cfg, [sample]: { ...s, chemistry: p.id, expected: { B: t + p.B, G: t + p.G, Y: t + p.Y, R: t + p.R } } });
            }}
            title={p.name}
            className="px-2 py-1 text-[11px] rounded border border-zinc-300 bg-white hover:bg-zinc-100">
            {p.id === "blunt_both" ? "Blunt×2" : p.id === "blunt_ad1" ? "Blunt+OH4" : p.id === "blunt_ad2" ? "OH4+Blunt" : p.id === "oh4_both" ? "OH4×2" : "OH1×2"}
          </button>
        ))}
      </div>
    </div>
  );
}

function OverhangBadge({ label, a, b }) {
  const d = (a !== undefined && b !== undefined && a !== null && b !== null) ? b - a : null;
  const interpretation = d === null ? "no pair" :
    Math.abs(d) < 1 ? "blunt (≈0 bp)" :
    (d >= 2 && d <= 5) ? `5' overhang ${d.toFixed(1)} bp` :
    (d <= -2 && d >= -5) ? `inverted ${Math.abs(d).toFixed(1)} bp` :
    "ambiguous";
  return (
    <div className="rounded bg-zinc-50 border border-zinc-200 p-2">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="text-lg font-mono mt-0.5">{d === null ? "—" : `${d >= 0 ? "+" : ""}${d.toFixed(2)}`} <span className="text-xs text-zinc-500">bp</span></div>
      <div className="text-[10px] text-zinc-500 mt-0.5">{interpretation}</div>
    </div>
  );
}

// ======================================================================
// Visible window peak list
// ======================================================================
function VisibleWindowCard({ peaksByChannel, results, cfg }) {
  if (!cfg) return null;
  const peaks = [];
  for (const d of SAMPLE_DYES) {
    for (const p of peaksByChannel[d] || []) peaks.push(p);
  }
  peaks.sort((a, b) => b.height - a.height);
  const top = peaks.slice(0, 15);

  return (
    <div className="bg-white rounded-lg border border-zinc-200 p-3">
      <div className="text-sm font-medium mb-2">Top peaks in visible window · Classification</div>
      <div className="overflow-auto max-h-72">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-white">
            <tr className="text-left text-zinc-500 border-b border-zinc-200">
              <th className="py-1 font-medium">Dye</th>
              <th className="py-1 font-medium text-right">Size</th>
              <th className="py-1 font-medium text-right">Height</th>
              <th className="py-1 font-medium text-right">Area</th>
              <th className="py-1 font-medium">Class</th>
            </tr>
          </thead>
          <tbody>
            {top.map((p, i) => {
              const c = classifyPeak(p.size, cfg.target, cfg.expected, cfg.tolerance);
              const cls = c.kind === "target" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                          c.kind === "daisy"  ? "bg-rose-50 text-rose-700 border-rose-200" :
                          c.kind === "small"  ? "bg-zinc-50 text-zinc-600 border-zinc-200" :
                                                "bg-amber-50 text-amber-700 border-amber-200";
              const label = c.kind === "target" ? `target ${c.dye}` : c.kind === "daisy" ? "daisy" : c.kind === "small" ? "dimer" : "other";
              return (
                <tr key={i} className="border-b border-zinc-100">
                  <td className="py-1"><span className="inline-block w-2 h-2 rounded-sm mr-1 align-middle" style={{ background: DYE[p.dye].color }} />{DYE[p.dye].label}</td>
                  <td className="py-1 text-right font-mono">{p.size.toFixed(2)}</td>
                  <td className="py-1 text-right font-mono">{Math.round(p.height).toLocaleString()}</td>
                  <td className="py-1 text-right font-mono">{Math.round(p.area).toLocaleString()}</td>
                  <td className="py-1">
                    <span className={`inline-block px-1.5 py-0.5 rounded border text-[10px] ${cls}`}>{label}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ======================================================================
// TAB 2 — Peak Identification: config grid + results
// ======================================================================
function PeakIdTab({ samples, cfg, setCfg, results, componentSizes, setCSize }) {
  const [expanded, setExpanded] = useState(() => new Set(samples.slice(0, 1)));
  const [targetSamples, setTargetSamples] = useState([samples[0]]);  // Which samples to apply products to
  const bulkAuto = () => setCfg(computeAutoDefaults(DATA.peaks));

  const applyProduct = (productId, size, dyes) => {
    // Set expected = size for dyes in product, target = size for the selected samples
    const updated = { ...cfg };
    for (const s of targetSamples) {
      const cur = updated[s];
      const newExp = { ...cur.expected };
      for (const d of SAMPLE_DYES) {
        if (dyes.includes(d)) newExp[d] = size;
      }
      updated[s] = { ...cur, target: size, expected: newExp, chemistry: "custom" };
    }
    setCfg(updated);
  };

  return (
    <>
      <AssemblyProductsCard componentSizes={componentSizes} onSizeChange={setCSize} onApply={applyProduct} />

      <div className="bg-white rounded-lg border border-zinc-200 p-2.5 mb-2">
        <div className="flex items-center gap-2 mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Apply product sizes to
        </div>
        <div className="flex flex-wrap gap-1 items-center">
          <button
            onClick={() => setTargetSamples([...samples])}
            className="px-2 py-0.5 text-xs rounded border border-zinc-300 bg-white hover:bg-zinc-100">
            All
          </button>
          <button
            onClick={() => setTargetSamples(samples.filter(s => s.startsWith("V059")))}
            className="px-2 py-0.5 text-xs rounded border border-zinc-300 bg-white hover:bg-zinc-100">
            V059 only
          </button>
          <button
            onClick={() => setTargetSamples(samples.filter(s => s.startsWith("gRNA3")))}
            className="px-2 py-0.5 text-xs rounded border border-zinc-300 bg-white hover:bg-zinc-100">
            gRNA3 only
          </button>
          <button
            onClick={() => setTargetSamples([])}
            className="px-2 py-0.5 text-xs rounded border border-zinc-300 bg-white hover:bg-zinc-100">
            None
          </button>
          <div className="h-4 w-px bg-zinc-200 mx-1" />
          {samples.map(ss => {
            const on = targetSamples.includes(ss);
            return (
              <button key={ss}
                onClick={() => setTargetSamples(on ? targetSamples.filter(x => x !== ss) : [...targetSamples, ss])}
                className={`px-2 py-0.5 text-xs rounded-md border transition ${on ? "bg-zinc-900 text-white border-zinc-900" : "bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-100"}`}>
                {ss}
              </button>
            );
          })}
          <span className="text-xs text-zinc-500 ml-auto">{targetSamples.length} selected</span>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-zinc-200 p-3 mb-2">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <div className="text-sm font-medium">Automated peak identification</div>
            <div className="text-xs text-zinc-600 mt-0.5 max-w-3xl">
              Configure the expected peak position per fluorophore for each sample. The viewer then matches observed peaks to the expected position within ±tolerance and reports match quality. Presets model the cut chemistry: blunt, BsaI (4-nt 5' overhang both ends), or Cas9 with staggered overhang on either or both ends.
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 shrink-0">
            <button onClick={bulkAuto} className="px-2 py-1 text-xs rounded border border-zinc-300 bg-white hover:bg-zinc-100">
              Auto-detect all samples
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {samples.map(sample => (
          <SampleConfigRow
            key={sample}
            sample={sample}
            cfg={cfg} setCfg={setCfg}
            result={results[sample]}
            expanded={expanded.has(sample)}
            toggle={() => {
              const ns = new Set(expanded);
              if (ns.has(sample)) ns.delete(sample); else ns.add(sample);
              setExpanded(ns);
            }}
          />
        ))}
      </div>

      {/* Cross-sample summary grid */}
      <div className="bg-white rounded-lg border border-zinc-200 p-3 mt-3">
        <div className="text-sm font-medium mb-2">Cross-sample match grid</div>
        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-zinc-500 border-b border-zinc-200">
                <th className="py-1 pr-3 font-medium">Sample</th>
                <th className="py-1 pr-2 font-medium text-right">Target</th>
                {SAMPLE_DYES.map(d => (
                  <th key={d} className="py-1 px-2 font-medium text-right">
                    <span className="inline-block w-2 h-2 rounded-sm mr-1 align-middle" style={{ background: DYE[d].color }} />
                    {DYE[d].label}
                  </th>
                ))}
                <th className="py-1 pl-2 font-medium text-right">Matches</th>
              </tr>
            </thead>
            <tbody>
              {samples.map(sample => {
                const s = cfg[sample], r = results[sample];
                const matches = SAMPLE_DYES.filter(d => r[d]?.match).length;
                return (
                  <tr key={sample} className="border-b border-zinc-100">
                    <td className="py-1 pr-3 font-mono">{sample}</td>
                    <td className="py-1 pr-2 text-right font-mono">{s.target.toFixed(1)}</td>
                    {SAMPLE_DYES.map(d => {
                      const m = r[d];
                      if (!m.match) return <td key={d} className="py-1 px-2 text-right text-rose-400 font-mono">miss</td>;
                      const delta = m.match.delta;
                      const color = Math.abs(delta) < 1 ? "text-emerald-700" : Math.abs(delta) < s.tolerance ? "text-amber-700" : "text-rose-500";
                      return (
                        <td key={d} className={`py-1 px-2 text-right font-mono ${color}`}>
                          {m.match.size.toFixed(2)} <span className="text-[10px] text-zinc-500">({delta >= 0 ? "+" : ""}{delta.toFixed(1)})</span>
                        </td>
                      );
                    })}
                    <td className="py-1 pl-2 text-right font-mono">{matches}/4</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function SampleConfigRow({ sample, cfg, setCfg, result, expanded, toggle }) {
  const s = cfg[sample];
  const matches = SAMPLE_DYES.filter(d => result[d]?.match).length;

  const update = (patch) => setCfg({ ...cfg, [sample]: { ...s, ...patch } });
  const updateExpected = (dye, v) => {
    const nv = parseFloat(v);
    if (!isFinite(nv)) return;
    update({ expected: { ...s.expected, [dye]: nv } });
  };
  const applyPreset = (pid) => {
    const p = CHEMISTRY_PRESETS.find(x => x.id === pid);
    if (!p) return;
    const t = s.target;
    update({ chemistry: pid, expected: { B: +(t + p.B).toFixed(2), G: +(t + p.G).toFixed(2), Y: +(t + p.Y).toFixed(2), R: +(t + p.R).toFixed(2) } });
  };

  return (
    <div className="bg-white rounded-lg border border-zinc-200">
      <button onClick={toggle} className="w-full flex items-center justify-between gap-2 p-2.5 text-left hover:bg-zinc-50">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-zinc-400 text-xs">{expanded ? "▾" : "▸"}</span>
          <span className="font-mono text-sm">{sample}</span>
          <span className="text-xs text-zinc-500">Target {s.target.toFixed(1)} bp · Tol ±{s.tolerance.toFixed(1)}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {SAMPLE_DYES.map(d => {
            const ok = !!result[d]?.match;
            return (
              <span key={d}
                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] border ${ok ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-rose-50 border-rose-200 text-rose-600"}`}>
                <span className="inline-block w-2 h-2 rounded-sm" style={{ background: DYE[d].color }} />
                {ok ? "✓" : "✗"}
              </span>
            );
          })}
          <span className="ml-2 text-xs text-zinc-600 font-mono">{matches}/4</span>
        </div>
      </button>
      {expanded && (
        <div className="border-t border-zinc-200 p-3 space-y-3">
          {/* Target + tolerance */}
          <div className="flex flex-wrap gap-3 items-center text-xs">
            <label className="flex items-center gap-1.5">
              <span className="text-zinc-500">Target</span>
              <input type="number" step="0.1" value={s.target}
                onChange={e => {
                  const nv = parseFloat(e.target.value);
                  if (!isFinite(nv)) return;
                  const shift = nv - s.target;
                  const ne = { ...s.expected };
                  for (const d of SAMPLE_DYES) ne[d] = +(ne[d] + shift).toFixed(2);
                  update({ target: nv, expected: ne });
                }}
                className="w-20 px-1.5 py-0.5 border border-zinc-300 rounded font-mono text-right" />
              <span className="text-zinc-500">bp</span>
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-zinc-500">Tolerance ±</span>
              <input type="number" step="0.1" min="0.1" value={s.tolerance}
                onChange={e => update({ tolerance: parseFloat(e.target.value) || 1 })}
                className="w-14 px-1.5 py-0.5 border border-zinc-300 rounded font-mono text-right" />
              <span className="text-zinc-500">bp</span>
            </label>
            <div className="ml-auto flex flex-wrap gap-1">
              <span className="text-zinc-500 mr-1">Preset:</span>
              {CHEMISTRY_PRESETS.map(p => (
                <button key={p.id} onClick={() => applyPreset(p.id)}
                  title={p.name}
                  className={`px-2 py-0.5 rounded border text-[11px] ${s.chemistry === p.id ? "bg-zinc-900 text-white border-zinc-900" : "bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-100"}`}>
                  {p.id === "blunt_both" ? "Blunt×2" : p.id === "blunt_ad1" ? "Blunt+OH4" : p.id === "blunt_ad2" ? "OH4+Blunt" : p.id === "oh4_both" ? "OH4×2" : "OH1×2"}
                </button>
              ))}
              <button onClick={() => {
                const auto = computeAutoDefaults({ [sample]: DATA.peaks[sample] })[sample];
                setCfg({ ...cfg, [sample]: auto });
              }}
                className="px-2 py-0.5 rounded border text-[11px] bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-100">
                Auto
              </button>
            </div>
          </div>

          {/* Per-dye config + observed */}
          <table className="w-full text-xs">
            <thead className="text-zinc-500">
              <tr className="border-b border-zinc-200">
                <th className="py-1 text-left font-medium">Dye</th>
                <th className="py-1 text-right font-medium">Expected (bp)</th>
                <th className="py-1 text-right font-medium">Observed</th>
                <th className="py-1 text-right font-medium">Δ bp</th>
                <th className="py-1 text-right font-medium">Height</th>
                <th className="py-1 text-right font-medium">Area</th>
                <th className="py-1 text-right font-medium">Purity</th>
              </tr>
            </thead>
            <tbody>
              {SAMPLE_DYES.map(d => {
                const r = result[d];
                const ok = !!r.match;
                return (
                  <tr key={d} className="border-b border-zinc-100">
                    <td className="py-1">
                      <span className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-middle" style={{ background: DYE[d].color }} />
                      {DYE[d].label} ({DYE[d].name})
                    </td>
                    <td className="py-1 text-right">
                      <input type="number" step="0.1" value={s.expected[d]}
                        onChange={e => updateExpected(d, e.target.value)}
                        className="w-20 px-1.5 py-0.5 border border-zinc-300 rounded font-mono text-right" />
                    </td>
                    <td className="py-1 text-right font-mono">{ok ? r.match.size.toFixed(2) : "—"}</td>
                    <td className={`py-1 text-right font-mono ${ok ? (Math.abs(r.match.delta) < 1 ? "text-emerald-600" : "text-amber-600") : "text-rose-500"}`}>
                      {ok ? (r.match.delta >= 0 ? "+" : "") + r.match.delta.toFixed(2) : "miss"}
                    </td>
                    <td className="py-1 text-right font-mono">{ok ? Math.round(r.match.height).toLocaleString() : "—"}</td>
                    <td className="py-1 text-right font-mono">{ok ? Math.round(r.match.area).toLocaleString() : "—"}</td>
                    <td className="py-1 text-right font-mono">{r.purity !== null ? (r.purity * 100).toFixed(0) + "%" : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Pair overhangs */}
          <div className="grid grid-cols-2 gap-2">
            <OverhangBadge label="Adapter 1 end (B vs Y · 6-FAM vs TAMRA)" a={result.B?.match?.size} b={result.Y?.match?.size} />
            <OverhangBadge label="Adapter 2 end (G vs R · HEX vs ROX)"    a={result.G?.match?.size} b={result.R?.match?.size} />
          </div>
        </div>
      )}
    </div>
  );
}

// ======================================================================
// TAB 3 — Cross-sample comparison with overlay
// ======================================================================
function AutoClassifyTab({ samples, componentSizes, dyeOffsets, setDyeOffsets, setDyeOffset, constructSeq, setConstructSeq, targetStart, setTargetStart, targetEnd, setTargetEnd }) {
  const [currentSample, setCurrentSample] = useState(samples[0] || "");
  const [heightThreshold, setHeightThreshold] = useState(100);
  const [matchTol, setMatchTol] = useState(8);
  const [clusterTol, setClusterTol] = useState(5);
  const [overhangRange, setOverhangRange] = useState(4);  // consider -N..+N nt
  const [seqDraft, setSeqDraft] = useState(constructSeq);
  const [seqError, setSeqError] = useState("");

  const constructSize = constructSeq.length;
  const sampleData = DATA.peaks[currentSample];

  const overhangs = useMemo(() => {
    const arr = [];
    for (let i = -overhangRange; i <= overhangRange; i++) arr.push(i);
    return arr;
  }, [overhangRange]);

  const classification = useMemo(() => {
    if (!sampleData) return null;
    return classifyPeaks(
      sampleData, constructSeq, targetStart, targetEnd, constructSize,
      componentSizes, ASSEMBLY_PRODUCTS, LAB_GRNA_CATALOG,
      dyeOffsets, heightThreshold, matchTol, clusterTol, overhangs
    );
  }, [sampleData, constructSeq, targetStart, targetEnd, constructSize, componentSizes, dyeOffsets, heightThreshold, matchTol, clusterTol, overhangs]);

  // Auto-calibrate dye offsets from blunt assumption: assume the tallest peak in
  // each channel aligns with its best blunt prediction. Offset = observed - predicted.
  const handleAutoCalibrate = () => {
    if (!sampleData) return;
    const grnas = findGrnas(constructSeq, targetStart, targetEnd);
    const newOffsets = { B: 0, G: 0, Y: 0, R: 0 };
    for (const dye of ["B", "G", "Y", "R"]) {
      const peaks = sampleData[dye] || [];
      if (!peaks.length) continue;
      // Find tallest peak
      let tallest = peaks[0];
      for (const p of peaks) if (p[1] > tallest[1]) tallest = p;
      // Find best blunt prediction across all gRNAs and assembly products
      const predictions = [];
      for (const g of grnas) {
        const pr = predictCutProducts(g, constructSize, 0);
        predictions.push(pr[dye].length);
      }
      for (const prod of ASSEMBLY_PRODUCTS) {
        if (prod.dyes && prod.dyes.indexOf(dye) >= 0) {
          predictions.push(productSize(prod, componentSizes));
        }
      }
      if (!predictions.length) continue;
      let best = predictions[0];
      let bestDelta = Math.abs(tallest[0] - best);
      for (const pr of predictions) {
        const d = Math.abs(tallest[0] - pr);
        if (d < bestDelta) { best = pr; bestDelta = d; }
      }
      newOffsets[dye] = tallest[0] - best;
    }
    for (const dye of ["B", "G", "Y", "R"]) setDyeOffset(dye, newOffsets[dye]);
  };

  const handleResetOffsets = () => {
    for (const dye of ["B", "G", "Y", "R"]) setDyeOffset(dye, 0);
  };

  // Auto-calibrate from ALL loaded samples against a chosen gRNA's predicted
  // cut sizes (blunt + +4 sticky chemistries, which are what the lab sees on
  // real runs). Median signed residual per dye becomes the new offset.
  // Robust to outliers (wrong peaks, primer-dimers) — needs ≥3 matches per
  // dye before applying; below that it leaves the dye's offset untouched and
  // surfaces a warning.
  const [calibGrnaIdx, setCalibGrnaIdx] = useState(0);
  const [calibResult, setCalibResult] = useState(null);
  const calibrateFromRun = () => {
    // Build the expected-sizes table for the picked gRNA's cut products at
    // the two chemistries we see in practice (blunt and +4 sticky). Each
    // dye gets a list of possible cut-product sizes — we'll try to match
    // every one against observed peaks and take the median of residuals.
    const grnaEntry = LAB_GRNA_CATALOG[calibGrnaIdx];
    if (!grnaEntry) { setCalibResult({ error: "Pick a gRNA from the lab catalog" }); return; }
    const norm = normalizeSpacer(grnaEntry.spacer);
    if (norm.length !== 20) { setCalibResult({ error: `${grnaEntry.name}: spacer length ${norm.length} (need 20)` }); return; }
    const candidates = findGrnas(constructSeq, targetStart, targetEnd);
    const rc = norm.split("").reverse().map(c => ({A:"T",T:"A",G:"C",C:"G"})[c] || c).join("");
    const grna = candidates.find(g => g.protospacer === norm || g.protospacer === rc);
    if (!grna) { setCalibResult({ error: `${grnaEntry.name} spacer not found in construct target window` }); return; }
    const expectedByDye = { B: [], G: [], Y: [], R: [] };
    for (const oh of [0, 4]) {
      const pr = predictCutProducts(grna, constructSize, oh);
      for (const dye of ["B", "G", "Y", "R"]) {
        if (pr[dye] && pr[dye].length > 0) expectedByDye[dye].push(pr[dye].length);
      }
    }
    // Also include assembly-product sizes so well-behaved blunt controls
    // (with no cut products but full/partial ligation products visible) can
    // also drive calibration.
    for (const prod of ASSEMBLY_PRODUCTS) {
      if (!prod.dyes) continue;
      for (const dye of prod.dyes) {
        if (expectedByDye[dye]) expectedByDye[dye].push(productSize(prod, componentSizes));
      }
    }
    const { offsets, matchesByDye, n } = autoCalibrateDyeOffsets(
      DATA.peaks, expectedByDye, 3.0, dyeOffsets
    );
    // Per-dye gate: apply only dyes with ≥3 matches; others keep current offset.
    const minMatches = 3;
    const applied = { B: dyeOffsets.B, G: dyeOffsets.G, Y: dyeOffsets.Y, R: dyeOffsets.R };
    const skipped = [];
    for (const dye of ["B", "G", "Y", "R"]) {
      if (matchesByDye[dye].length >= minMatches) {
        applied[dye] = Math.round(offsets[dye] * 1000) / 1000;
      } else {
        skipped.push(`${dye}(${matchesByDye[dye].length})`);
      }
    }
    for (const dye of ["B", "G", "Y", "R"]) setDyeOffset(dye, applied[dye]);
    setCalibResult({
      grna: grnaEntry.name,
      applied,
      matches: {
        B: matchesByDye.B.length, G: matchesByDye.G.length,
        Y: matchesByDye.Y.length, R: matchesByDye.R.length,
      },
      n,
      skipped,
      nSamples: Object.keys(DATA.peaks).length,
    });
  };

  const handleApplySequence = () => {
    const cleaned = seqDraft.replace(/\s+/g, "").toUpperCase();
    if (!/^[ACGTN]*$/.test(cleaned)) { setSeqError("Only A/C/G/T/N allowed"); return; }
    if (cleaned.length < 50) { setSeqError("Sequence too short (need >= 50 bp)"); return; }
    if (targetStart < 1 || targetEnd > cleaned.length || targetStart >= targetEnd) {
      setSeqError("Target range out of bounds for new sequence length " + cleaned.length);
      return;
    }
    setSeqError("");
    setConstructSeq(cleaned);
  };

  const handleResetSequence = () => {
    setSeqDraft(CONSTRUCT.seq);
    setConstructSeq(CONSTRUCT.seq);
    setTargetStart(CONSTRUCT.targetRange.start);
    setTargetEnd(CONSTRUCT.targetRange.end);
    setSeqError("");
  };

  return (
    <div>
      {/* Top row: sample selector + summary */}
      <div className="bg-white rounded-lg border border-zinc-200 p-3 mb-3">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-xs text-zinc-500 mb-0.5">Sample</label>
            <select value={currentSample} onChange={e => setCurrentSample(e.target.value)}
              className="px-2 py-1 text-sm border border-zinc-300 rounded">
              {samples.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-0.5">Height threshold</label>
            <input type="number" value={heightThreshold} onChange={e => setHeightThreshold(Number(e.target.value) || 0)}
              className="w-20 px-2 py-1 text-sm border border-zinc-300 rounded" />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-0.5">Match tolerance (bp)</label>
            <input type="number" value={matchTol} step="0.5" onChange={e => setMatchTol(Number(e.target.value) || 0)}
              className="w-20 px-2 py-1 text-sm border border-zinc-300 rounded" />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-0.5">Cluster tolerance (bp)</label>
            <input type="number" value={clusterTol} step="0.5" onChange={e => setClusterTol(Number(e.target.value) || 0)}
              className="w-20 px-2 py-1 text-sm border border-zinc-300 rounded" />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-0.5">Overhang range ±</label>
            <input type="number" value={overhangRange} onChange={e => setOverhangRange(Math.max(0, Math.min(10, Number(e.target.value) || 0)))}
              className="w-20 px-2 py-1 text-sm border border-zinc-300 rounded" />
          </div>
          <div className="ml-auto text-xs text-zinc-600">
            Construct length: <span className="font-mono font-semibold">{constructSize}</span> bp &middot; Target: <span className="font-mono">{targetStart}–{targetEnd}</span>
          </div>
        </div>
      </div>

      {/* Dye-mobility offset panel */}
      <Panel
        title="Dye mobility offset"
        subtitle="Subtracted from observed peak sizes before matching. Calibrate using a blunt-control ligation; typical ABI 3500 / 3730 + POP-7 values are 0.2 to 0.8 bp between channels."
        className="mb-3"
        actions={
          <>
            <ToolButton variant="primary" onClick={handleAutoCalibrate} title="Set per-dye offsets so the tallest peak in each channel aligns with its closest blunt prediction (single-sample heuristic)">
              Auto-calibrate
            </ToolButton>
            <select value={calibGrnaIdx} onChange={e => setCalibGrnaIdx(parseInt(e.target.value, 10))}
                    className="px-2 py-1 text-xs border border-zinc-300 rounded bg-white focus-ring max-w-[22ch]">
              {LAB_GRNA_CATALOG
                .map((g, i) => ({ g, i }))
                .filter(({ g }) => normalizeSpacer(g.spacer).length === 20)
                .map(({ g, i }) => (
                  <option key={`cal-${i}`} value={i}>{g.name}</option>
                ))}
            </select>
            <ToolButton variant="primary" onClick={calibrateFromRun} title="Auto-calibrate across ALL loaded samples using the picked gRNA's predicted cut sizes (blunt + +4) plus assembly-product sizes. Median residual per dye, robust to outliers, requires ≥3 matches per dye before applying.">
              Calibrate from run
            </ToolButton>
            <ToolButton variant="secondary" onClick={handleResetOffsets}>
              Reset
            </ToolButton>
            <ToolButton
              variant="secondary"
              title="Download per-dye offsets as a JSON sidecar; commit to data/calibrations/ for sharing"
              onClick={() => {
                const blob = new Blob([JSON.stringify({ dyeOffsets, savedAt: new Date().toISOString(), sample: currentSample, instrument: "unknown" }, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `dye_offsets_${new Date().toISOString().slice(0,10)}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }}
            >
              Download
            </ToolButton>
            <label className="inline-flex items-center px-2 py-1 text-xs font-medium gap-1.5 rounded-md bg-zinc-100 text-zinc-800 hover:bg-zinc-200 border border-zinc-200 cursor-pointer transition focus-ring">
              Upload
              <input type="file" accept=".json" className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    const obj = JSON.parse(await f.text());
                    const next = obj.dyeOffsets || obj;
                    if (setDyeOffsets && ["B","G","Y","R"].every(k => typeof next[k] === "number")) {
                      setDyeOffsets(next);
                    } else {
                      alert("JSON missing one of B,G,Y,R numeric offsets.");
                    }
                  } catch (err) {
                    alert("Failed to parse JSON: " + err.message);
                  }
                  e.target.value = "";
                }}
              />
            </label>
          </>
        }
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          {["B", "G", "Y", "R"].map(d => (
            <div key={d} className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-zinc-200 bg-zinc-50">
              <DyeChip dye={d} showLabel />
              <div className="flex-1" />
              <input
                type="number"
                step="0.1"
                value={dyeOffsets[d]}
                onChange={e => setDyeOffset(d, e.target.value)}
                className="w-16 px-2 py-1 text-xs font-mono text-right num border border-zinc-300 bg-white rounded-md focus-ring"
              />
              <span className="text-[11px] text-zinc-500">bp</span>
            </div>
          ))}
        </div>
        {calibResult && (
          calibResult.error ? (
            <div className="mt-3 px-3 py-2 rounded-md bg-rose-50 border border-rose-200 text-xs text-rose-800">
              <AlertTriangle size={12} className="inline mr-1" /> {calibResult.error}
            </div>
          ) : (
            <div className="mt-3 px-3 py-2 rounded-md bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
              <CheckCircle2 size={12} className="inline mr-1" />
              Calibrated from <span className="font-semibold">{calibResult.nSamples}</span> sample{calibResult.nSamples === 1 ? "" : "s"} against <span className="font-mono font-semibold">{calibResult.grna}</span> ({calibResult.n} total matches):{" "}
              {["B","G","Y","R"].map(d => (
                <span key={d} className="inline-block mr-2 font-mono">
                  {d}={calibResult.applied[d].toFixed(3)} <span className="text-emerald-700/70">(n={calibResult.matches[d]})</span>
                </span>
              ))}
              {calibResult.skipped.length > 0 && (
                <span className="ml-2 text-amber-700">· skipped (&lt;3 matches): {calibResult.skipped.join(", ")}</span>
              )}
            </div>
          )
        )}
      </Panel>

      {/* Per-dye cluster cards */}
      {classification && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          {["B", "Y", "G", "R"].map(dye => (
            <DyeClusterCard key={dye} dye={dye} data={classification[dye]} dyeOffset={dyeOffsets[dye]} />
          ))}
        </div>
      )}

      {/* Cross-dye interpretation */}
      {classification && (
        <CrossDyeSummary classification={classification} constructSize={constructSize} />
      )}

      {/* Editable construct sequence */}
      <div className="bg-white rounded-lg border border-zinc-200 p-3 mb-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-medium">Construct sequence (editable for generalization)</div>
          <div className="flex gap-2">
            <button onClick={handleApplySequence}
              className="px-2 py-1 text-xs font-medium bg-emerald-700 text-white rounded hover:bg-emerald-600">
              Apply sequence
            </button>
            <button onClick={handleResetSequence}
              className="px-2 py-1 text-xs font-medium bg-zinc-200 rounded hover:bg-zinc-300">
              Reset to V059
            </button>
          </div>
        </div>
        <textarea value={seqDraft} onChange={e => setSeqDraft(e.target.value)}
          className="w-full h-24 p-2 text-xs font-mono border border-zinc-300 rounded"
          placeholder="Paste the full ligated construct sequence (5' to 3' on top strand)" />
        <div className="flex items-center gap-2 mt-2">
          <label className="text-xs text-zinc-600">Target start (1-indexed):</label>
          <input type="number" value={targetStart} onChange={e => setTargetStart(Number(e.target.value) || 1)}
            className="w-20 px-2 py-0.5 text-xs border border-zinc-300 rounded" />
          <label className="text-xs text-zinc-600 ml-3">Target end:</label>
          <input type="number" value={targetEnd} onChange={e => setTargetEnd(Number(e.target.value) || constructSize)}
            className="w-20 px-2 py-0.5 text-xs border border-zinc-300 rounded" />
          <span className="text-xs text-zinc-500 ml-3">
            Length: <span className="font-mono">{seqDraft.replace(/\s+/g, "").length}</span> bp
          </span>
          {seqError && <span className="text-xs text-red-600 ml-3">{seqError}</span>}
        </div>
      </div>
    </div>
  );
}

function DyeClusterCard({ dye, data, dyeOffset }) {
  if (!data || !data.clusters) return null;
  const color = DYE[dye].color;
  const label = DYE[dye].label;
  return (
    <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
      <div className="px-3 py-2 border-b border-zinc-200 flex items-center justify-between"
        style={{background: color + "10"}}>
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded" style={{background: color}} />
          <span className="text-sm font-semibold" style={{color}}>{dye} &middot; {label}</span>
        </div>
        <div className="text-xs text-zinc-600">
          {data.clusters.length} {data.clusters.length === 1 ? "cluster" : "clusters"} &middot; {data.nPeaks} peaks &middot; offset {dyeOffset >= 0 ? "+" : ""}{dyeOffset.toFixed(2)} bp
        </div>
      </div>
      <div className="divide-y divide-zinc-100">
        {data.clusters.length === 0 && (
          <div className="px-3 py-4 text-xs text-zinc-400 italic">No peaks above threshold in this channel.</div>
        )}
        {data.clusters.map((c, i) => (
          <ClusterRow key={i} cluster={c} dyeColor={color} />
        ))}
      </div>
    </div>
  );
}

function ClusterRow({ cluster, dyeColor }) {
  const main = cluster.main;
  const id = cluster.identity;
  const identityLabel = id
    ? (id.kind === "cas9_cut"
        ? (id.grnaName + " " + id.fragment + " (" + id.template + " / " + id.pam_side + ")")
        : id.label)
    : "unassigned";
  return (
    <div className="px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-mono font-bold" style={{color: dyeColor}}>
              {main.size.toFixed(2)} bp
            </span>
            <span className="text-xs text-zinc-500">
              (raw {main.rawSize.toFixed(2)}, height {Math.round(main.height)}, area {Math.round(main.area)})
            </span>
            <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded bg-zinc-100 text-zinc-700">
              {(cluster.channelAbundance * 100).toFixed(1)}% of channel
            </span>
          </div>
          <div className="text-xs text-zinc-700 mt-0.5">
            <span className="font-medium">Best guess:</span> {identityLabel}
          </div>
        </div>
      </div>
      {cluster.peaks.length > 1 && (
        <div className="mt-1.5 pl-3 border-l-2 border-zinc-200">
          <div className="text-[10px] uppercase tracking-wide text-zinc-400 mb-0.5">
            {cluster.peaks.length} species in this cluster (relative to main)
          </div>
          <div className="space-y-0.5">
            {cluster.peaks.map((p, i) => {
              const rel = p.relSize;
              const relLbl = Math.abs(rel) < 0.05 ? "main" : (rel > 0 ? "+" + rel.toFixed(2) + " bp larger" : rel.toFixed(2) + " bp smaller");
              const match = p.bestMatch;
              return (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="font-mono w-16 text-right text-zinc-500">{p.size.toFixed(2)}</span>
                  <span className="w-28 text-zinc-600">{relLbl}</span>
                  <span className="w-16 text-zinc-600">{(p.relAbundance * 100).toFixed(0)}%</span>
                  <span className="text-zinc-700 truncate">
                    {match
                      ? (match.pred.kind === "cas9_cut"
                          ? (match.pred.label + " (Δ=" + match.delta.toFixed(2) + ")")
                          : match.pred.label + " (Δ=" + match.delta.toFixed(2) + ")")
                      : <span className="italic text-zinc-400">no match within tolerance</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function CrossDyeSummary({ classification, constructSize }) {
  // Pair B+Y (Adapter 1 end) and G+R (Adapter 2 end) clusters by proximity.
  // Each dye pair should see matched clusters at the same underlying size if
  // cluster comes from a Cas9 cut.
  const pairClusters = (dyeA, dyeB, pairName) => {
    const a = (classification[dyeA] && classification[dyeA].clusters) || [];
    const b = (classification[dyeB] && classification[dyeB].clusters) || [];
    const rows = [];
    const usedB = new Set();
    for (const ca of a) {
      let bestIdx = -1;
      let bestD = 99;
      for (let j = 0; j < b.length; j++) {
        if (usedB.has(j)) continue;
        const d = Math.abs(ca.mainSize - b[j].mainSize);
        if (d < bestD) { bestD = d; bestIdx = j; }
      }
      if (bestIdx >= 0 && bestD < 20) {
        usedB.add(bestIdx);
        const cb = b[bestIdx];
        rows.push({ a: ca, b: cb, delta: cb.mainSize - ca.mainSize });
      } else {
        rows.push({ a: ca, b: null, delta: null });
      }
    }
    for (let j = 0; j < b.length; j++) if (!usedB.has(j)) rows.push({ a: null, b: b[j], delta: null });
    return { pairName, dyeA, dyeB, rows };
  };

  const p1 = pairClusters("B", "Y", "Adapter 1 end (B + Y)");
  const p2 = pairClusters("G", "R", "Adapter 2 end (G + R)");

  const renderPair = (p) => (
    <div key={p.pairName} className="bg-white rounded-lg border border-zinc-200 p-3">
      <div className="text-sm font-medium mb-2">{p.pairName}</div>
      <div className="text-xs text-zinc-500 mb-2">
        The Δ column reports (size on {p.dyeB}) − (size on {p.dyeA}). Δ ≈ 0 means blunt cut at this adapter end. |Δ| = 4 with consistent sign indicates a 4 nt 5' overhang from BsaI-style or staggered Cas9 chemistry. Values between 0 and 4 indicate mixed chemistries or partial products.
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-zinc-500 border-b border-zinc-200">
            <th className="text-right px-2 py-1">{p.dyeA} main</th>
            <th className="text-right px-2 py-1">{p.dyeB} main</th>
            <th className="text-right px-2 py-1">Δ</th>
            <th className="text-right px-2 py-1">{p.dyeA} abund</th>
            <th className="text-right px-2 py-1">{p.dyeB} abund</th>
            <th className="text-left px-2 py-1">interpretation</th>
          </tr>
        </thead>
        <tbody>
          {p.rows.map((r, i) => {
            let interp = "";
            if (r.a && r.b) {
              const d = r.delta;
              if (Math.abs(d) < 1) interp = "Blunt (consistent across both channels)";
              else if (Math.abs(d - 4) < 1) interp = "4 nt 5' overhang (" + p.dyeB + " longer)";
              else if (Math.abs(d + 4) < 1) interp = "4 nt 5' overhang (" + p.dyeA + " longer)";
              else if (Math.abs(d - 3) < 1 || Math.abs(d + 3) < 1) interp = "3 nt overhang";
              else if (Math.abs(d - 2) < 1 || Math.abs(d + 2) < 1) interp = "2 nt overhang";
              else if (Math.abs(d - 1) < 1 || Math.abs(d + 1) < 1) interp = "1 nt overhang";
              else interp = "Non-paired or measurement noise";
            } else if (r.a) {
              interp = "Only on " + p.dyeA + " — likely missing-adapter product";
            } else {
              interp = "Only on " + p.dyeB + " — likely missing-adapter product";
            }
            return (
              <tr key={i} className="border-b border-zinc-100">
                <td className="text-right px-2 py-1 font-mono">{r.a ? r.a.mainSize.toFixed(2) : "—"}</td>
                <td className="text-right px-2 py-1 font-mono">{r.b ? r.b.mainSize.toFixed(2) : "—"}</td>
                <td className="text-right px-2 py-1 font-mono">{r.delta === null ? "—" : (r.delta >= 0 ? "+" : "") + r.delta.toFixed(2)}</td>
                <td className="text-right px-2 py-1">{r.a ? (r.a.channelAbundance * 100).toFixed(0) + "%" : "—"}</td>
                <td className="text-right px-2 py-1">{r.b ? (r.b.channelAbundance * 100).toFixed(0) + "%" : "—"}</td>
                <td className="px-2 py-1">{interp}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
      {renderPair(p1)}
      {renderPair(p2)}
    </div>
  );
}

// Batch heatmap tab — sample × expected-species matrix, log10(height)
// colored with a viridis-like palette. One screen for an entire 96-well
// plate's worth of data. Click a row to copy the sample name.
function HeatmapTab({ samples, componentSizes, constructSeq, targetStart, targetEnd, palette = "default" }) {
  const constructSize = (constructSeq || "").length || 226;
  const colorFor = (d) => resolveDyeColor(d, palette);

  const [speciesSet, setSpeciesSet] = useState("both");   // "assembly" | "cut" | "both"
  const [matchTol, setMatchTol] = useState(2.0);
  const [sortBy, setSortBy] = useState("alpha");          // "alpha" | "total"
  const [filterText, setFilterText] = useState("");
  const [cutGrnaIdx, setCutGrnaIdx] = useState(0);

  // Resolve the picked gRNA from the lab catalog, so the heatmap can include
  // that gRNA's cut products as columns. Gracefully degrade when the spacer
  // doesn't match the construct (the "cut" columns just don't appear).
  const pickedCutGrna = useMemo(() => {
    const entry = LAB_GRNA_CATALOG[cutGrnaIdx];
    if (!entry) return null;
    const norm = normalizeSpacer(entry.spacer);
    if (norm.length !== 20) return null;
    const rc = reverseComplement(norm);
    const candidates = findGrnas(constructSeq, targetStart, targetEnd);
    const cand = candidates.find(g => g.protospacer === norm || g.protospacer === rc);
    return cand ? { ...cand, name: entry.name } : null;
  }, [cutGrnaIdx, constructSeq, targetStart, targetEnd]);

  // Columns: assembly products (one per dye they carry) + cut products for
  // the picked gRNA at the two common chemistries (blunt + +4 sticky).
  const species = useMemo(() => {
    const list = [];
    if (speciesSet !== "cut") {
      for (const prod of ASSEMBLY_PRODUCTS) {
        if (!prod.dyes) continue;
        for (const dye of prod.dyes) {
          list.push({
            key: `asm:${prod.id}:${dye}`,
            size: productSize(prod, componentSizes),
            dye,
            kind: "assembly",
            label: `${prod.id}·${dye}`,
          });
        }
      }
    }
    if (speciesSet !== "assembly" && pickedCutGrna) {
      for (const oh of [0, 4]) {
        const pr = predictCutProducts(pickedCutGrna, constructSize, oh);
        for (const dye of ["B", "G", "Y", "R"]) {
          if (!pr[dye] || pr[dye].length <= 0) continue;
          list.push({
            key: `cut:${dye}:${oh}`,
            size: pr[dye].length,
            dye,
            kind: "cut",
            label: `CUT·${dye}${oh === 0 ? "" : `+${oh}`}`,
          });
        }
      }
    }
    // Sort columns by (dye order, size) for visual coherence.
    const dyeOrder = { B: 0, G: 1, Y: 2, R: 3 };
    list.sort((a, b) => (dyeOrder[a.dye] - dyeOrder[b.dye]) || (a.size - b.size));
    return list;
  }, [speciesSet, pickedCutGrna, componentSizes, constructSize]);

  const filtered = useMemo(() => {
    if (!filterText) return samples;
    const re = (() => { try { return new RegExp(filterText, "i"); } catch { return null; } })();
    return re ? samples.filter(s => re.test(s)) : samples.filter(s => s.toLowerCase().includes(filterText.toLowerCase()));
  }, [samples, filterText]);

  const matrix = useMemo(() => {
    return buildHeatmapMatrix({ samples: filtered, peaksBySample: DATA.peaks, species, tol: matchTol });
  }, [filtered, species, matchTol]);

  const sortedRows = useMemo(() => {
    if (sortBy === "total") {
      return filtered.slice().sort((a, b) => {
        const ta = species.reduce((t, sp) => t + (matrix.cells[a]?.[sp.key] || 0), 0);
        const tb = species.reduce((t, sp) => t + (matrix.cells[b]?.[sp.key] || 0), 0);
        return tb - ta;
      });
    }
    return filtered.slice().sort();
  }, [filtered, sortBy, species, matrix]);

  // Compute color range from the visible cells so the palette auto-scales.
  const colorRange = useMemo(() => {
    const vals = [];
    for (const s of sortedRows) {
      for (const sp of species) {
        const v = matrix.cells[s]?.[sp.key];
        if (v != null) vals.push(v);
      }
    }
    if (!vals.length) return [1.7, 4.5];
    vals.sort((a, b) => a - b);
    // Use 5th-95th percentile so outliers don't flatten the palette.
    const lo = vals[Math.floor(vals.length * 0.05)];
    const hi = vals[Math.floor(vals.length * 0.95)];
    return [lo, hi];
  }, [sortedRows, species, matrix]);

  const svgRef = useRef(null);
  const cellW = 28;
  const cellH = 18;
  const labelW = 200;
  const headerH = 88;
  const W = labelW + species.length * cellW + 16;
  const H = headerH + sortedRows.length * cellH + 10;

  return (
    <div>
      <div className="bg-white rounded-lg border border-zinc-200 p-3 mb-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <div>
            <span className="font-semibold uppercase tracking-wide text-zinc-500 mr-2">Species</span>
            <div className="inline-flex rounded-md border border-zinc-300 overflow-hidden">
              {[
                { k: "both",     l: "Assembly + Cut" },
                { k: "assembly", l: "Assembly only" },
                { k: "cut",      l: "Cut only" },
              ].map(o => (
                <button key={o.k} onClick={() => setSpeciesSet(o.k)}
                  className={`px-2 py-1 ${speciesSet === o.k ? "bg-zinc-900 text-white" : "bg-white text-zinc-700 hover:bg-zinc-100"}`}>
                  {o.l}
                </button>
              ))}
            </div>
          </div>
          {speciesSet !== "assembly" && (
            <label className="flex items-center gap-1.5">
              <span className="text-zinc-600">gRNA:</span>
              <select value={cutGrnaIdx} onChange={e => setCutGrnaIdx(parseInt(e.target.value, 10))}
                      className="px-2 py-0.5 text-xs border border-zinc-300 rounded bg-white max-w-[22ch] focus-ring">
                {LAB_GRNA_CATALOG
                  .map((g, i) => ({ g, i }))
                  .filter(({ g }) => normalizeSpacer(g.spacer).length === 20)
                  .map(({ g, i }) => <option key={`hm-${i}`} value={i}>{g.name}</option>)}
              </select>
            </label>
          )}
          <label className="flex items-center gap-1.5">
            <span className="text-zinc-600">Tol:</span>
            <input type="range" min="0.5" max="5" step="0.1" value={matchTol}
                   onChange={e => setMatchTol(parseFloat(e.target.value))} className="accent-zinc-700 w-24" />
            <span className="tabular-nums text-zinc-600 w-10">{matchTol.toFixed(1)} bp</span>
          </label>
          <label className="flex items-center gap-1.5">
            <span className="text-zinc-600">Sort:</span>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                    className="px-1.5 py-0.5 text-xs border border-zinc-300 rounded bg-white focus-ring">
              <option value="alpha">Sample name (A→Z)</option>
              <option value="total">Total matched signal (high→low)</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <span className="text-zinc-600">Filter:</span>
            <input type="text" value={filterText} onChange={e => setFilterText(e.target.value)}
                   placeholder="regex or substring" className="px-2 py-0.5 text-xs border border-zinc-300 rounded bg-white w-40 focus-ring" />
            <span className="text-[11px] text-zinc-500">{sortedRows.length}/{samples.length}</span>
          </label>
          <div className="ml-auto">
            <ExportMenu svgRef={svgRef} basename="heatmap" label="Export" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-zinc-200 p-2 mb-3 overflow-x-auto">
        {species.length === 0 ? (
          <div className="p-6 text-xs text-zinc-500 text-center">
            No species columns. Toggle to include assembly products or pick a gRNA whose spacer matches the construct.
          </div>
        ) : sortedRows.length === 0 ? (
          <div className="p-6 text-xs text-zinc-500 text-center">
            No samples match the current filter.
          </div>
        ) : (
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
            {/* Column headers: dye-colored capsule + bp-size + kind */}
            {species.map((sp, ci) => {
              const x = labelW + ci * cellW;
              return (
                <g key={`col-${sp.key}`} transform={`translate(${x + cellW / 2}, ${headerH - 6})`}>
                  <g transform="rotate(-55)">
                    <text x="0" y="0" fontSize="9" fill={colorFor(sp.dye)} fontWeight="600"
                          style={{ fontFamily: "JetBrains Mono, monospace" }}>
                      {sp.label}·{sp.size.toFixed(0)}
                    </text>
                  </g>
                </g>
              );
            })}
            {/* Rows */}
            {sortedRows.map((s, ri) => {
              const y = headerH + ri * cellH;
              return (
                <g key={`row-${s}`}>
                  <text x={labelW - 6} y={y + cellH / 2 + 3} fontSize="10" fill="#334155" textAnchor="end"
                        style={{ fontFamily: "JetBrains Mono, monospace" }}>
                    <title>{s}</title>
                    {s.length > 26 ? `…${s.slice(-24)}` : s}
                  </text>
                  {species.map((sp, ci) => {
                    const x = labelW + ci * cellW;
                    const v = matrix.cells[s]?.[sp.key];
                    const fill = heatmapColor(v, colorRange[0], colorRange[1]);
                    return (
                      <g key={`c-${s}-${sp.key}`}>
                        <rect x={x + 1} y={y + 1} width={cellW - 2} height={cellH - 2} rx="2"
                              fill={fill} stroke="white" strokeWidth="0.5">
                          <title>{`${s} · ${sp.label} (${sp.size.toFixed(1)} bp) · ${v != null ? `log10(h)=${v.toFixed(2)} (h=${Math.round(Math.pow(10, v))})` : "no match"}`}</title>
                        </rect>
                      </g>
                    );
                  })}
                </g>
              );
            })}
            {/* Legend swatch */}
            <g transform={`translate(${labelW}, ${headerH + sortedRows.length * cellH + 8})`}>
              {Array.from({ length: 30 }, (_, i) => {
                const t = i / 29;
                const v = colorRange[0] + t * (colorRange[1] - colorRange[0]);
                return <rect key={`lg-${i}`} x={i * 4} y="0" width="4" height="8" fill={heatmapColor(v, colorRange[0], colorRange[1])} />;
              })}
              <text x="0" y="22" fontSize="9" fill="#64748b">log₁₀(h) {colorRange[0].toFixed(1)}</text>
              <text x="120" y="22" fontSize="9" fill="#64748b" textAnchor="end">{colorRange[1].toFixed(1)} ({Math.round(Math.pow(10, colorRange[1]))} RFU)</text>
            </g>
          </svg>
        )}
      </div>
    </div>
  );
}

function CompareTab({ samples, cfg, results, componentSizes, constructSeq, targetStart, targetEnd }) {
  const [picked, setPicked] = useState(() => samples.slice(0, 4));
  const [dye,    setDye]    = useState("R");
  const [range,  setRange]  = useState([180, 240]);
  const [normalize, setNormalize] = useState(true);
  const [smoothing, setSmoothing] = useState(1);
  const [showSpecies, setShowSpecies] = useState(false);
  const [speciesGrnaIdx, setSpeciesGrnaIdx] = useState(0);  // V059_gRNA3 (lab catalog idx 0)
  const [speciesOverhangs, setSpeciesOverhangs] = useState([0, 4]);
  const [hiddenSpeciesIds, setHiddenSpeciesIds] = useState(() => new Set());
  const toggleHiddenCmp = (id) => setHiddenSpeciesIds(s => {
    const next = new Set(s); if (next.has(id)) next.delete(id); else next.add(id); return next;
  });
  const [pinnedPeak, setPinnedPeak] = useState(null);

  const allSpeciesWithIdsCmp = useMemo(() => {
    if (!showSpecies) return [];
    return enumerateAllSpeciesWithIds({
      componentSizes: componentSizes || {},
      constructSize: (constructSeq || "").length || 226,
      gRNAs: (() => {
        if (speciesGrnaIdx < 0) return [];
        if (speciesGrnaIdx < 1000) {
          const e = LAB_GRNA_CATALOG[speciesGrnaIdx];
          if (!e || normalizeSpacer(e.spacer).length !== 20) return [];
          const norm = normalizeSpacer(e.spacer);
          const rc = norm.split("").reverse().map(c => ({A:"T",T:"A",G:"C",C:"G"})[c] || c).join("");
          const cands = (() => {
            if (!constructSeq) return [];
            return findGrnas(constructSeq, targetStart, targetEnd);
          })();
          const cand = cands.find(g => g.protospacer === norm || g.protospacer === rc);
          return cand ? [{ ...cand, name: e.name }] : [];
        }
        return [];
      })(),
      overhangs: speciesOverhangs,
      dyes: [dye],
    });
  }, [showSpecies, componentSizes, constructSeq, targetStart, targetEnd, speciesGrnaIdx, speciesOverhangs, dye]);

  const candidateGrnas = useMemo(() => {
    if (!constructSeq) return [];
    return findGrnas(constructSeq, targetStart, targetEnd).map(g => ({
      ...g, name: `cand-${g.id} ${g.strand}-${g.pam_seq}`,
    }));
  }, [constructSeq, targetStart, targetEnd]);
  const constructSize = (constructSeq || "").length || 226;

  // Resolve the picked gRNA (lab-catalog entry or candidate from target window).
  const pickedGrna = useMemo(() => {
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

  const togglePick = ss => {
    setPicked(p => p.includes(ss) ? p.filter(x => x !== ss) : [...p, ss].slice(0, 8));
  };

  const W = 920, H = 340;
  const m = { l: 60, r: 16, t: 14, b: 42 };
  const plotW = W - m.l - m.r;
  const plotH = H - m.t - m.b;

  // Global y-max across picked samples
  const yMax = useMemo(() => {
    let mx = 0;
    for (const ss of picked) {
      const arr = DATA.peaks[ss]?.[dye] || [];
      for (const p of arr) {
        if (p[0] >= range[0] && p[0] <= range[1]) mx = Math.max(mx, p[1]);
      }
    }
    return mx * 1.1 || 100;
  }, [picked, dye, range]);

  const xScale = s => m.l + ((s - range[0]) / (range[1] - range[0])) * plotW;

  const xTicks = useMemo(() => {
    const span = range[1] - range[0];
    const step = span <= 20 ? 2 : span <= 60 ? 10 : 25;
    const first = Math.ceil(range[0] / step) * step;
    const t = [];
    for (let v = first; v <= range[1]; v += step) t.push(v);
    return t;
  }, [range]);

  // Palette for overlay
  const PALETTE = ["#1e6fdb", "#d32f2f", "#2e9e4a", "#b8860b", "#7c3aed", "#0891b2", "#db2777", "#ea580c"];

  const svgRef = useRef(null);
  const [drag, setDrag] = useState(null);
  const toBp = cx => {
    const r = svgRef.current.getBoundingClientRect();
    return range[0] + (((cx - r.left) * (W / r.width) - m.l) / plotW) * (range[1] - range[0]);
  };

  return (
    <>
      <div className={showSpecies ? "lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-3" : ""}>
        <div className="min-w-0">
      <div className="bg-white rounded-lg border border-zinc-200 p-3 mb-2">
        <div className="text-sm font-medium mb-2">Overlay comparison</div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1">
            <span className="font-semibold uppercase tracking-wide text-zinc-500 mr-1">Channel</span>
            <div className="inline-flex rounded-md border border-zinc-300 overflow-hidden">
              {SAMPLE_DYES.map(d => (
                <button key={d} onClick={() => setDye(d)} className={`px-2 py-1 ${dye === d ? "text-white" : "text-zinc-700 hover:bg-zinc-100"}`}
                  style={dye === d ? { background: DYE[d].color } : {}}>
                  {DYE[d].label}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={normalize} onChange={e => setNormalize(e.target.checked)} className="w-3.5 h-3.5 accent-zinc-700" />
            Normalize per sample
          </label>
          <label className="flex items-center gap-2">
            <span className="text-zinc-500">Smoothing</span>
            <input type="range" min="0.5" max="3" step="0.1" value={smoothing}
                   onChange={e => setSmoothing(parseFloat(e.target.value))} className="accent-zinc-700 w-24" />
            <span className="tabular-nums text-zinc-600 w-8">{smoothing.toFixed(1)}x</span>
          </label>
          <label className="flex items-center gap-1 cursor-pointer" title="Overlay every species the dye CAN show on the multi-sample plot">
            <input type="checkbox" checked={showSpecies} onChange={e => setShowSpecies(e.target.checked)} className="w-3.5 h-3.5 accent-sky-600" />
            Expected species
          </label>
          <div className="ml-auto flex gap-1">
            {[{ l: "Full", r: [0, 500] }, { l: "Cut 200", r: [180, 230] }, { l: "Cut 88", r: [75, 110] }].map(p => (
              <button key={p.l} onClick={() => setRange(p.r)} className="px-2 py-1 rounded border border-zinc-300 bg-white hover:bg-zinc-100">
                {p.l}
              </button>
            ))}
          </div>
        </div>
        {/* Species overlay sub-controls (only when toggle is on) */}
        {showSpecies && (
          <div className="mt-2 pt-2 border-t border-zinc-100 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
            <span className="font-semibold uppercase tracking-wide text-sky-700">Species</span>
            <span className="inline-flex items-center gap-1 text-zinc-700">
              <svg width="22" height="6" aria-hidden><line x1="0" y1="3" x2="22" y2="3" stroke="currentColor" strokeWidth="1.4" strokeDasharray={SPECIES_DASH.assembly} /></svg>
              assembly
            </span>
            <span className="inline-flex items-center gap-1 text-zinc-700">
              <svg width="22" height="6" aria-hidden><line x1="0" y1="3" x2="22" y2="3" stroke="currentColor" strokeWidth="1.4" strokeDasharray={SPECIES_DASH.monomer} /></svg>
              monomer
            </span>
            {pickedGrna && (
              <span className="inline-flex items-center gap-1 text-zinc-700">
                <svg width="22" height="6" aria-hidden><line x1="0" y1="3" x2="22" y2="3" stroke="currentColor" strokeWidth="1.4" strokeDasharray={SPECIES_DASH.cut} /></svg>
                cut
              </span>
            )}
            <span className="text-zinc-500 text-[11px]">colored by selected dye ({DYE[dye].label})</span>
            <div className="h-4 w-px bg-zinc-200 mx-1" />
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
            {pickedGrna && (
              <>
                <LabInventoryBadge candidate={pickedGrna} compact />
                <div className="flex items-center gap-1">
                  <span className="text-zinc-600">overhang:</span>
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
              </>
            )}
          </div>
        )}
      </div>

      {/* Sample picker */}
      <div className="bg-white rounded-lg border border-zinc-200 p-2.5 mb-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">Samples ({picked.length}/8)</div>
        <div className="flex flex-wrap gap-1">
          {samples.map((ss, i) => {
            const idx = picked.indexOf(ss);
            const on = idx >= 0;
            const color = on ? PALETTE[idx % PALETTE.length] : null;
            return (
              <button key={ss} onClick={() => togglePick(ss)}
                className={`px-2.5 py-1 text-xs rounded-md border transition inline-flex items-center gap-1.5 ${on ? "text-white" : "bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-100"}`}
                style={on ? { background: color, borderColor: color } : {}}>
                {on && <span className="inline-block w-2 h-2 rounded-full bg-white" />}
                {ss}
              </button>
            );
          })}
        </div>
      </div>

      {/* Overlay plot */}
      <div className="bg-white rounded-lg border border-zinc-200 p-2 mb-2">
        <div className="px-2 pt-1 pb-1 flex items-center justify-between flex-wrap gap-2">
          <div className="text-sm font-medium">Overlay · {DYE[dye].label} ({DYE[dye].name})</div>
          <div className="flex items-center gap-3">
            <div className="text-[11px] text-zinc-500">Drag to zoom · {picked.length} samples</div>
            <ExportMenu svgRef={svgRef} basename={`cross_sample_overlay_${DYE[dye].label}`} label="Export" />
          </div>
        </div>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto cursor-crosshair"
          onMouseDown={e => { const bp = toBp(e.clientX); if (bp >= range[0] && bp <= range[1]) setDrag({ s: bp, e: bp }); }}
          onMouseMove={e => drag && setDrag({ ...drag, e: toBp(e.clientX) })}
          onMouseUp={() => { if (drag && Math.abs(drag.e - drag.s) > 0.5) { setRange([Math.max(0, Math.min(drag.s, drag.e)), Math.min(500, Math.max(drag.s, drag.e))]); } setDrag(null); }}
          onMouseLeave={() => setDrag(null)}
        >
          <rect x={m.l} y={m.t} width={plotW} height={plotH} fill="#fafbfc" />

          {/* Grid + ticks */}
          {xTicks.map(t => (
            <g key={`xg${t}`}>
              <line x1={xScale(t)} x2={xScale(t)} y1={m.t} y2={m.t + plotH} stroke="#eef2f7" />
              <line x1={xScale(t)} x2={xScale(t)} y1={m.t + plotH} y2={m.t + plotH + 4} stroke="#94a3b8" />
              <text x={xScale(t)} y={m.t + plotH + 15} fontSize="10" textAnchor="middle" fill="#64748b">{t}</text>
            </g>
          ))}

          {/* Axis */}
          <line x1={m.l} x2={m.l + plotW} y1={m.t + plotH} y2={m.t + plotH} stroke="#334155" />
          <line x1={m.l} x2={m.l} y1={m.t} y2={m.t + plotH} stroke="#334155" />
          <text x={m.l + plotW / 2} y={H - 8} fontSize="11" textAnchor="middle" fill="#334155" fontWeight="500">Size (bp)</text>
          <text x={16} y={m.t + plotH / 2} fontSize="11" textAnchor="middle" fill="#334155" fontWeight="500"
                transform={`rotate(-90, 16, ${m.t + plotH / 2})`}>
            {normalize ? "Normalized fluorescence" : "Fluorescence (RFU)"}
          </text>

          {/* Traces */}
          {picked.map((ss, i) => {
            const color = PALETTE[i % PALETTE.length];
            const arr = DATA.peaks[ss]?.[dye] || [];
            if (!arr.length) return null;
            const scopeMax = normalize
              ? Math.max(...arr.filter(p => p[0] >= range[0] && p[0] <= range[1]).map(p => p[1]), 1) * 1.05
              : yMax;
            const laneGeom = { laneTop: m.t, laneH: plotH, mLeft: m.l, plotW };
            const path = buildGaussianPath(arr, range, scopeMax, laneGeom, smoothing, false);
            return (
              <g key={ss}>
                <path d={path.fill}   fill={color} opacity="0.06" />
                <path d={path.stroke} fill="none" stroke={color} strokeWidth="1.75" opacity="0.92" />
              </g>
            );
          })}

          {/* Per-peak click hit-targets (across all picked samples) */}
          {picked.map((ss, i) => {
            const arr = DATA.peaks[ss]?.[dye] || [];
            return arr
              .filter(p => p[0] >= range[0] && p[0] <= range[1])
              .map((p, j) => {
                const x = xScale(p[0]);
                const pinned = pinnedPeak && pinnedPeak.dye === dye && Math.abs(pinnedPeak.size - p[0]) < 0.05 && pinnedPeak.sample === ss;
                return (
                  <g key={`hit-${ss}-${j}`}>
                    <rect
                      x={x - 4} y={m.t}
                      width={8} height={plotH}
                      fill="transparent"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPinnedPeak({
                          clientX: e.clientX, clientY: e.clientY,
                          dye, size: p[0], height: p[1], area: p[2], sample: ss,
                        });
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      style={{ cursor: "pointer" }}
                    />
                    {pinned && (
                      <circle cx={x} cy={m.t + plotH * 0.5} r={5} fill={PALETTE[i % PALETTE.length]} stroke="white" strokeWidth="1.5" pointerEvents="none" />
                    )}
                  </g>
                );
              });
          })}

          {/* Expected markers from current config, for selected dye, per picked sample */}
          {picked.map((ss, i) => {
            const exp = cfg[ss]?.expected[dye];
            if (exp === undefined || exp < range[0] || exp > range[1]) return null;
            const color = PALETTE[i % PALETTE.length];
            return <line key={`exp-${ss}`} x1={xScale(exp)} x2={xScale(exp)} y1={m.t} y2={m.t + plotH} stroke={color} strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />;
          })}

          {/* Expected SPECIES overlay across all samples (one set of lines tied to the selected dye) */}
          {showSpecies && (() => {
            const species = (allSpeciesWithIdsCmp || [])
              .filter(sp => sp.size >= range[0] && sp.size <= range[1])
              .filter(sp => !hiddenSpeciesIds.has(speciesId(sp, dye)));
            if (!species.length) return null;
            // Color comes from the active dye; kind via stroke-dash pattern.
            const dyeColor = DYE[dye].color;
            const minLabelDx = (range[1] - range[0]) / Math.max(1, plotW / 130);
            const rows = [];
            const nRows = 6;
            const place = size => {
              for (let r = 0; r < nRows; r++) {
                if (rows[r] === undefined || size - rows[r] >= minLabelDx) { rows[r] = size; return r; }
              }
              rows[nRows - 1] = size;
              return nRows - 1;
            };
            return (
              <g pointerEvents="none">
                {species.map((sp, idx) => {
                  const x = xScale(sp.size);
                  const row = place(sp.size);
                  const labelY = m.t + 14 + row * 13;
                  const tag = sp.displayId || "?";
                  const tagW = Math.max(16, tag.length * 7);
                  return (
                    <g key={`spec-${idx}`}>
                      <line
                        x1={x} x2={x} y1={m.t} y2={m.t + plotH}
                        stroke={dyeColor} strokeWidth="0.85"
                        strokeDasharray={SPECIES_DASH[sp.kind] || "1 2"}
                        opacity="0.65"
                      />
                      <rect
                        x={x - tagW / 2} y={labelY - 8}
                        width={tagW} height={12} rx={2.5}
                        fill={dyeColor} opacity="0.92"
                        stroke="white" strokeWidth="0.8"
                      />
                      <text
                        x={x} y={labelY + 1}
                        fontSize="9" fontWeight="700"
                        fill="white" textAnchor="middle"
                        style={{ fontFamily: "JetBrains Mono, monospace" }}
                      >
                        <title>{sp.fullLabel || sp.label} · {sp.size} bp</title>
                        {tag}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })()}

          {/* Drag rectangle */}
          {drag && Math.abs(drag.e - drag.s) > 0.1 && (
            <rect x={xScale(Math.min(drag.s, drag.e))} y={m.t}
                  width={Math.abs(xScale(drag.e) - xScale(drag.s))} height={plotH}
                  fill="#1e6fdb" opacity="0.10" stroke="#1e6fdb" strokeDasharray="3 3" />
          )}
        </svg>

        {/* Legend */}
        <div className="flex flex-wrap gap-2 px-2 pb-1 pt-1">
          {picked.map((ss, i) => {
            const color = PALETTE[i % PALETTE.length];
            const match = results[ss]?.[dye]?.match;
            return (
              <div key={ss} className="flex items-center gap-1.5 text-[11px]">
                <span className="inline-block w-4 h-0.5" style={{ background: color }} />
                <span className="font-mono">{ss}</span>
                {match && <span className="text-zinc-500">· peak {match.size.toFixed(2)} bp</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Overhang summary chart */}
      <div className="bg-white rounded-lg border border-zinc-200 p-3">
        <div className="text-sm font-medium mb-1">Paired-channel size offsets (putative overhang)</div>
        <div className="text-xs text-zinc-600 mb-2">
          Y→B offset infers the overhang at the Adapter 1 end (6-FAM paired with TAMRA); R→G offset infers the overhang at the Adapter 2 end (HEX paired with ROX). Values near 0 indicate blunt cuts, values near +4 indicate a 4-nt 5' overhang.
        </div>
        <OverhangChart samples={samples} results={results} />
      </div>

      {/* Static species reference card (always available) */}
      <SpeciesLegend
        componentSizes={componentSizes}
        defaultOpen={false}
        gRNAs={pickedGrna ? [pickedGrna] : []}
        overhangs={speciesOverhangs}
        constructSize={constructSize}
      />
        </div>

        {/* Right-rail sidebar with per-species toggles (CompareTab single dye) */}
        {showSpecies && (
          <SpeciesSidebar
            componentSizes={componentSizes}
            constructSize={constructSize}
            gRNAs={pickedGrna ? [pickedGrna] : []}
            overhangs={pickedGrna ? speciesOverhangs : []}
            dyes={[dye]}
            hiddenIds={hiddenSpeciesIds}
            onToggleId={toggleHiddenCmp}
            onShowAll={() => setHiddenSpeciesIds(new Set())}
            onHideAll={() => {
              const all = new Set();
              for (const sp of expectedSpeciesForDye(dye, componentSizes, constructSize, pickedGrna ? [pickedGrna] : [], pickedGrna ? speciesOverhangs : [])) {
                all.add(speciesId(sp, dye));
              }
              setHiddenSpeciesIds(all);
            }}
            title={`Species legend · ${DYE[dye].label} channel`}
          />
        )}
      </div>

      {/* Click-pinned popover for CompareTab (peaks across multiple samples) */}
      {pinnedPeak && (
        <PeakSpeciesPopover
          hover={pinnedPeak}
          componentSizes={componentSizes}
          constructSize={constructSize}
          gRNAs={pickedGrna ? [pickedGrna] : []}
          overhangs={pickedGrna ? speciesOverhangs : []}
          tol={2.5}
          onClose={() => setPinnedPeak(null)}
        />
      )}
    </>
  );
}



// ----------------------------------------------------------------------
// ProductFragmentViz -- Visual rendering of the 4 ssDNA cleavage products.
// For a selected gRNA and overhang model, draws each of the 4 fluor-labeled
// strands as a horizontal bar, colored by channel, with dye position marked,
// length annotated, and template/non-template and PAM-proximal/distal flags.
// ----------------------------------------------------------------------
function ProductFragmentViz({ products, constructSize }) {
  const fragRef = useRef(null);
  if (!products) return null;

  // Layout zones with strict left/right reserved columns for labels so the
  // bar region never overlaps annotation text. Row heights are generous to
  // give each lane a readable (dye name + strand) two-line label plus
  // room for a "LEFT fragment" subtitle below each bar.
  const W = 1100;
  const m = { l: 160, r: 230, t: 46, b: 24 };
  const pw = W - m.l - m.r;
  const rowH = 64;
  const barH = 18;
  const lanes = [
    { dye: "Y", row: 0 },
    { dye: "B", row: 1 },
    { dye: "R", row: 2 },
    { dye: "G", row: 3 },
  ];
  const H = m.t + lanes.length * rowH + m.b;

  const xForBp = (bp) => m.l + (bp / Math.max(1, constructSize)) * pw;

  return (
    <div className="relative">
      <div className="absolute top-1 right-1 z-10 no-print">
        <ExportMenu svgRef={fragRef} basename="ssdna_products" label="Export" />
      </div>
      <svg ref={fragRef} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" style={{ background: "white" }}>
        <rect x="0" y="0" width={W} height={H} fill="white" />

        {/* Title + subtitle */}
        <text x={m.l + pw / 2} y="18" fontSize="13" fill="#0f172a" textAnchor="middle" fontWeight="700">
          Cas9 ssDNA cut products after denaturation
        </text>
        <text x={m.l + pw / 2} y="32" fontSize="10" fill="#64748b" textAnchor="middle">
          Four fluorophore-labeled single strands, scaled to the {constructSize} bp construct
        </text>

        {/* Column-header row for the left/right annotation regions */}
        <text x={m.l - 12} y="40" fontSize="9" fill="#94a3b8" textAnchor="end" fontWeight="600"
              style={{ letterSpacing: "0.06em" }}>CHANNEL · STRAND</text>
        <text x={m.l + pw + 12} y="40" fontSize="9" fill="#94a3b8" textAnchor="start" fontWeight="600"
              style={{ letterSpacing: "0.06em" }}>TEMPLATE · PAM-SIDE · LENGTH</text>

        {/* Construct scale ticks at every 50 bp, plus at 0 and constructSize */}
        <line x1={m.l} x2={m.l + pw} y1={m.t - 6} y2={m.t - 6} stroke="#cbd5e1" strokeWidth="1" />
        {Array.from({ length: Math.floor(constructSize / 50) + 1 }, (_, i) => i * 50)
          .concat([constructSize])
          .filter((v, i, a) => a.indexOf(v) === i && v <= constructSize)
          .map(v => {
            const x = xForBp(v);
            return (
              <g key={`sc-${v}`}>
                <line x1={x} x2={x} y1={m.t - 9} y2={m.t - 3} stroke="#94a3b8" strokeWidth="1" />
                <text x={x} y={m.t - 12} fontSize="9" fill="#64748b" textAnchor="middle"
                      style={{ fontFamily: "JetBrains Mono, monospace" }}>{v}</text>
              </g>
            );
          })}

        {lanes.map(({ dye, row }) => {
          const p = products[dye];
          const yRow = m.t + row * rowH;
          const yBar = yRow + 14;
          const fragStart = p.fragment === "LEFT" ? 0 : constructSize - p.length;
          const x1 = xForBp(fragStart);
          const x2 = xForBp(fragStart + p.length);
          const barW = Math.max(2, x2 - x1);
          const dyeColor = DYE[dye].color;

          // Dye marker sidedness: per construct geometry, Y + B mark the LEFT
          // end of their fragments; R + G mark the RIGHT end. For a LEFT
          // product, "left end" = x1; for a RIGHT product, "left end" = x1.
          // So dyeOnLeft → dyeX = x1; else dyeX = x2.
          const dyeOnLeft = (dye === "Y" || dye === "B");
          const dyeX = dyeOnLeft ? x1 : x2;

          // Length label: inside the bar if it fits (barW > 55), else outside
          // on the opposite end from the dye circle.
          const labelInside = barW > 55;
          const labelX = labelInside
            ? (x1 + x2) / 2
            : (dyeOnLeft ? x2 + 8 : x1 - 8);
          const labelAnchor = labelInside ? "middle" : (dyeOnLeft ? "start" : "end");
          const labelFill = labelInside ? "white" : "#0f172a";

          return (
            <g key={dye}>
              {/* LEFT ANNOTATION COLUMN — dye name + strand */}
              <g>
                <rect x={m.l - 150} y={yRow + 6} width="16" height="28" rx="3" fill={dyeColor} />
                <text x={m.l - 130} y={yRow + 20} fontSize="12" fill="#0f172a"
                      textAnchor="start" fontWeight="700">{DYE[dye].name}</text>
                <text x={m.l - 130} y={yRow + 34} fontSize="9" fill="#64748b" textAnchor="start"
                      style={{ fontFamily: "JetBrains Mono, monospace" }}>
                  {p.strand}-strand
                </text>
              </g>

              {/* Bar + direction arrow */}
              <rect x={x1} y={yBar} width={barW} height={barH}
                    fill={dyeColor} opacity="0.88" rx="3" />
              {/* Direction chevron pointing 5' → 3' from the dye end toward
                  the opposite end. Rendered INSIDE the bar only when the bar
                  is wide enough (> 30 px) to avoid cutting off the chevron. */}
              {barW > 30 && (dyeOnLeft ? (
                <polygon
                  points={`${x1 + 5},${yBar + 4} ${x1 + 11},${yBar + barH / 2} ${x1 + 5},${yBar + barH - 4}`}
                  fill="white" opacity="0.9" />
              ) : (
                <polygon
                  points={`${x2 - 5},${yBar + 4} ${x2 - 11},${yBar + barH / 2} ${x2 - 5},${yBar + barH - 4}`}
                  fill="white" opacity="0.9" />
              ))}

              {/* Dye circle ON the bar edge, with dye letter inside */}
              <circle cx={dyeX} cy={yBar + barH / 2} r="9" fill={dyeColor}
                      stroke="white" strokeWidth="1.8" />
              <text x={dyeX} y={yBar + barH / 2 + 3.5} fontSize="9"
                    fill="white" textAnchor="middle" fontWeight="800"
                    style={{ fontFamily: "JetBrains Mono, monospace" }}>{dye}</text>

              {/* Length label — inside or outside depending on bar width */}
              <text x={labelX} y={yBar + barH / 2 + 4} fontSize="11"
                    fill={labelFill} textAnchor={labelAnchor} fontWeight="700"
                    style={{ fontFamily: "JetBrains Mono, monospace" }}>
                {p.length} nt
              </text>

              {/* Fragment subtitle below bar (LEFT / RIGHT of cut) */}
              <text x={(x1 + x2) / 2} y={yBar + barH + 14} fontSize="9.5"
                    fill="#475569" textAnchor="middle" fontWeight="500">
                {p.fragment} fragment · {fragStart}–{fragStart + p.length} bp
              </text>

              {/* RIGHT ANNOTATION COLUMN — template + PAM-side + length pill */}
              <g transform={`translate(${m.l + pw + 12}, ${yRow + 4})`}>
                <rect x="0" y="0" width="8" height="36" rx="2"
                      fill={p.template === "non-template" ? "#b45309" : "#0369a1"} opacity="0.85" />
                <text x="14" y="14" fontSize="10.5"
                      fill={p.template === "non-template" ? "#b45309" : "#0369a1"}
                      textAnchor="start" fontWeight="700">{p.template}</text>
                <text x="14" y="28" fontSize="10"
                      fill={p.pam_side === "proximal" ? "#be123c" : "#475569"}
                      textAnchor="start" fontWeight="500">
                  PAM-{p.pam_side}
                </text>
                <g transform="translate(0, 40)">
                  <rect x="0" y="0" width="56" height="14" rx="2" fill="#0f172a" />
                  <text x="28" y="10" fontSize="9.5" fill="white" textAnchor="middle"
                        fontWeight="700" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                    {p.length} nt
                  </text>
                </g>
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ConstructDiagram({ componentSizes, highlightKey, onHighlight, onSizeChange, cutConstructPos, overhang, grnaStrand, productSizes }) {
  const consRef = useRef(null);
  const total = CONSTRUCT.components.reduce((t, c) => t + (componentSizes[c.key] || 0), 0) || 1;

  // Layout zones (all y coordinates). Each zone has a fixed pixel range so
  // text placed in one zone can never collide with another. Widening the
  // canvas (W=1100) gives component labels enough room to read without
  // ellipsis at publication resolution.
  const W = 1100;
  const m = { l: 16, r: 16 };
  const pw = W - m.l - m.r;
  const Z = {
    dyeTop:   22,    // dye circles sit here
    dyeLabel: 26,    // dye letter inside circle
    boxTop:   44,    // component box top
    boxH:     40,    // component box height
    boxBot:   84,    // = boxTop + boxH
    sizeText: 99,    // component size label baseline
    cutTop:   36,    // cut line starts (above boxes for scissor visibility)
    cutBot:   88,    // cut line ends (just below boxes)
    cutLabel: 30,    // "cut" text above the scissor
    bracketY: 114,   // bracket line y
    bracketLabel: 130, // bracket label baseline
    scaleBar: 158,   // scale bar y
    scaleLabel: 174, // "Full ligation product: N bp"
  };
  const H = 190;

  let x = m.l;
  const boxes = CONSTRUCT.components.map(c => {
    const w = ((componentSizes[c.key] || 0) / total) * pw;
    const box = { ...c, x, w, size: componentSizes[c.key] || 0 };
    x += w;
    return box;
  });

  // Cut geometry
  const hasCut = cutConstructPos != null && cutConstructPos > 0 && cutConstructPos < total;
  const cutX1 = hasCut ? m.l + (cutConstructPos / total) * pw : null;
  const cutX2 = hasCut ? m.l + ((cutConstructPos + (overhang || 0)) / total) * pw : null;

  // Bracket label positions with collision avoidance: when a fragment is
  // narrow (<90 px), the label drops to a second line to avoid the
  // opposing bracket's label. min bracket center spacing is 140 px.
  const leftEndX  = cutX1;
  const rightEndX = m.l + pw;
  const leftStartX = m.l;
  const rightStartX = cutX2 != null ? cutX2 : cutX1;
  const leftCenter  = hasCut ? (leftStartX  + leftEndX)  / 2 : null;
  const rightCenter = hasCut ? (rightStartX + rightEndX) / 2 : null;
  const labelsTooClose = hasCut && Math.abs(rightCenter - leftCenter) < 160;

  return (
    <div className="relative">
      <div className="absolute top-1 right-1 z-10 no-print">
        <ExportMenu svgRef={consRef} basename="construct_diagram" label="Export" />
      </div>
      <svg ref={consRef} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" style={{ background: "white" }}>
        {/* White background rect for exports */}
        <rect x="0" y="0" width={W} height={H} fill="white" />

        {/* 5' / 3' end labels — at the left and right extremes, well above the boxes */}
        <text x={m.l} y={14} fontSize="11" fill="#475569" textAnchor="start" fontWeight="600"
              fontFamily="ui-monospace, JetBrains Mono, monospace">5′ →</text>
        <text x={m.l + pw} y={14} fontSize="11" fill="#475569" textAnchor="end" fontWeight="600"
              fontFamily="ui-monospace, JetBrains Mono, monospace">→ 3′</text>

        {/* Dye markers on their owning fluor adapters. Stacked 2-high if the
            box carries 2 dyes (Ad1: B+Y, Ad2: G+R in the canonical construct). */}
        {boxes.map(b => b.dyes.length === 0 ? null : (
          <g key={`dye-${b.key}`}>
            {b.dyes.map((d, i) => {
              const cx = b.x + b.w / 2 + (b.dyes.length === 1 ? 0 : (i - (b.dyes.length - 1) / 2) * 18);
              return (
                <g key={d}>
                  <circle cx={cx} cy={Z.dyeTop} r="7" fill={DYE[d].color} stroke="white" strokeWidth="1.4" />
                  <text x={cx} y={Z.dyeLabel} fontSize="8.5" fill="white" textAnchor="middle" fontWeight="800"
                        style={{ fontFamily: "JetBrains Mono, monospace" }}>{d}</text>
                </g>
              );
            })}
          </g>
        ))}

        {/* Component boxes */}
        {boxes.map(b => {
          const hl = highlightKey === b.key;
          // Inside-box name only when the box is wide enough for readable text
          // (at W=1100, 55 px ≈ 6 chars at 11 px). Below that, omit and let
          // the size label below do the identification work via position.
          const showName = b.w > 55;
          const short = b.name
            .replace("Fluor ", "")
            .replace(" Oligo", "")
            .replace("Oligo ", "")
            .replace("Overhang", "OH");
          return (
            <g key={b.key} style={{ cursor: onHighlight ? "pointer" : "default" }}
               onMouseEnter={() => onHighlight && onHighlight(b.key)}
               onMouseLeave={() => onHighlight && onHighlight(null)}>
              <rect x={b.x} y={Z.boxTop} width={Math.max(1, b.w)} height={Z.boxH}
                    fill={b.color}
                    opacity={hl ? 1 : 0.9}
                    stroke={hl ? "#0f172a" : "white"} strokeWidth={hl ? 1.8 : 1} />
              {showName && (
                <text x={b.x + b.w / 2} y={Z.boxTop + Z.boxH / 2 + 4} fontSize="11"
                      fill="white" textAnchor="middle" fontWeight="700" pointerEvents="none"
                      style={{ letterSpacing: "0.02em" }}>
                  {short}
                </text>
              )}
              {/* Size label centered below the box, always rendered. When the
                  box is very narrow (< 26 px) the size is rotated 45° so the
                  text doesn't overlap its neighbors. */}
              {b.w >= 26 ? (
                <text x={b.x + b.w / 2} y={Z.sizeText} fontSize="10.5"
                      fill="#334155" textAnchor="middle" fontWeight="600"
                      style={{ fontFamily: "JetBrains Mono, monospace" }}>
                  {b.size} bp
                </text>
              ) : (
                <text x={b.x + b.w / 2} y={Z.sizeText}
                      fontSize="9" fill="#475569" textAnchor="end"
                      transform={`rotate(-35, ${b.x + b.w / 2}, ${Z.sizeText})`}
                      style={{ fontFamily: "JetBrains Mono, monospace" }}>
                  {b.size}
                </text>
              )}
            </g>
          );
        })}

        {/* Cut site overlay — rendered AFTER boxes so it sits on top */}
        {hasCut && (
          <g>
            {/* Overhang shading band between top+bottom cut positions */}
            {overhang > 0 && Math.abs(cutX2 - cutX1) > 0.5 && (
              <rect x={Math.min(cutX1, cutX2)} y={Z.boxTop - 2}
                    width={Math.abs(cutX2 - cutX1)} height={Z.boxH + 4}
                    fill="#fbbf24" opacity="0.4" />
            )}
            {/* Primary cut line */}
            <line x1={cutX1} x2={cutX1}
                  y1={Z.cutTop} y2={Z.cutBot}
                  stroke="#dc2626" strokeWidth="2.2" strokeDasharray="4 2" />
            {/* Secondary cut line (bottom strand) when overhang !== 0 */}
            {overhang > 0 && (
              <line x1={cutX2} x2={cutX2}
                    y1={Z.cutTop} y2={Z.cutBot}
                    stroke="#dc2626" strokeWidth="2.2" strokeDasharray="4 2" />
            )}
            {/* Scissor glyph + "CUT" label above — positioned so they don't
                collide with dye markers. Centered over the primary cut. */}
            <g transform={`translate(${cutX1}, ${Z.cutLabel})`}>
              <rect x="-16" y="-9" width="32" height="14" rx="3" fill="#dc2626" />
              <text x="0" y="1" fontSize="9.5" fill="white" textAnchor="middle"
                    fontWeight="800" dominantBaseline="middle"
                    style={{ letterSpacing: "0.08em" }}>CUT</text>
              <polygon points="-4,7 4,7 0,12" fill="#dc2626" />
            </g>

            {/* LEFT fragment bracket */}
            <g>
              <line x1={leftStartX + 2} x2={leftEndX - 2}
                    y1={Z.bracketY} y2={Z.bracketY}
                    stroke="#64748b" strokeWidth="1.3" />
              <line x1={leftStartX + 2} x2={leftStartX + 2}
                    y1={Z.bracketY - 4} y2={Z.bracketY + 4}
                    stroke="#64748b" strokeWidth="1.3" />
              <line x1={leftEndX - 2} x2={leftEndX - 2}
                    y1={Z.bracketY - 4} y2={Z.bracketY + 4}
                    stroke="#64748b" strokeWidth="1.3" />
              <text x={leftCenter}
                    y={labelsTooClose ? Z.bracketLabel - 2 : Z.bracketLabel}
                    fontSize="10.5" fill="#1f2937" textAnchor="middle" fontWeight="600">
                <tspan style={{ fontFamily: "JetBrains Mono, monospace" }}>{cutConstructPos} bp</tspan>
                <tspan dx="6" fill="#64748b" fontWeight="500">
                  LEFT · {grnaStrand === "top" ? "PAM-distal" : "PAM-proximal"}
                </tspan>
              </text>
            </g>

            {/* RIGHT fragment bracket */}
            <g>
              <line x1={rightStartX + 2} x2={rightEndX - 2}
                    y1={Z.bracketY} y2={Z.bracketY}
                    stroke="#64748b" strokeWidth="1.3" />
              <line x1={rightStartX + 2} x2={rightStartX + 2}
                    y1={Z.bracketY - 4} y2={Z.bracketY + 4}
                    stroke="#64748b" strokeWidth="1.3" />
              <line x1={rightEndX - 2} x2={rightEndX - 2}
                    y1={Z.bracketY - 4} y2={Z.bracketY + 4}
                    stroke="#64748b" strokeWidth="1.3" />
              <text x={rightCenter}
                    y={labelsTooClose ? Z.bracketLabel + 14 : Z.bracketLabel}
                    fontSize="10.5" fill="#1f2937" textAnchor="middle" fontWeight="600">
                <tspan style={{ fontFamily: "JetBrains Mono, monospace" }}>{total - cutConstructPos} bp</tspan>
                <tspan dx="6" fill="#64748b" fontWeight="500">
                  RIGHT · {grnaStrand === "top" ? "PAM-proximal" : "PAM-distal"}
                </tspan>
              </text>
            </g>
          </g>
        )}

        {/* Scale bar + caption — always rendered at the bottom */}
        <line x1={m.l} x2={m.l + pw} y1={Z.scaleBar} y2={Z.scaleBar}
              stroke="#cbd5e1" strokeWidth="1.2" />
        {/* Tick marks every 50 bp */}
        {Array.from({ length: Math.floor(total / 50) + 1 }, (_, i) => i * 50).map(v => {
          const tx = m.l + (v / total) * pw;
          return (
            <g key={`tick-${v}`}>
              <line x1={tx} x2={tx} y1={Z.scaleBar - 3} y2={Z.scaleBar + 3} stroke="#94a3b8" strokeWidth="1" />
              <text x={tx} y={Z.scaleBar + 14} fontSize="8.5" fill="#64748b" textAnchor="middle"
                    style={{ fontFamily: "JetBrains Mono, monospace" }}>{v}</text>
            </g>
          );
        })}
        <text x={m.l + pw / 2} y={Z.scaleLabel + 10} fontSize="10" fill="#334155"
              textAnchor="middle" fontWeight="500">
          {hasCut
            ? `Full ligation product: ${total} bp · cut at position ${cutConstructPos}${overhang > 0 ? ` (+${overhang} nt overhang)` : ""}`
            : `Full ligation product: ${total} bp (uncut)`}
        </text>
      </svg>

      {/* Editable component sizes — form chrome below the SVG, excluded from exports */}
      {onSizeChange && (
        <div className="flex flex-wrap gap-2 pt-1 text-xs no-print">
          <span className="text-zinc-500 font-semibold uppercase tracking-wide">Component sizes (bp):</span>
          {CONSTRUCT.components.map(c => (
            <label key={c.key} className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: c.color }} />
              <span className="text-zinc-600">{c.name.replace("Fluor ", "").replace("Oligo ", "")}</span>
              <input type="number" min="0" step="1" value={componentSizes[c.key] || 0}
                onChange={e => onSizeChange(c.key, parseInt(e.target.value || "0", 10))}
                className="w-14 px-1.5 py-0.5 border border-zinc-300 rounded font-mono text-right text-xs" />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function AssemblyProductsCard({ componentSizes, onSizeChange, onApply }) {
  const [hl, setHl] = useState(null);
  return (
    <div className="bg-white rounded-lg border border-zinc-200 p-3 mb-3">
      <div className="text-sm font-medium mb-2">Construct architecture · Expected product sizes</div>
      <ConstructDiagram componentSizes={componentSizes} highlightKey={hl} onHighlight={setHl} onSizeChange={onSizeChange} />

      <div className="mt-3 text-xs text-zinc-600">
        Choose an assembly product to set expected peak positions for the currently-selected sample. Each product predicts peaks in specific dye channels only.
      </div>
      <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-1.5">
        {ASSEMBLY_PRODUCTS.map(p => {
          const sz = productSize(p, componentSizes);
          return (
            <button key={p.id} onClick={() => onApply(p.id, sz, p.dyes)}
              className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs border border-zinc-200 rounded hover:bg-zinc-50 text-left">
              <span className="truncate">
                <span className="font-medium">{p.name}</span>
                <span className="text-zinc-500 ml-1">
                  {p.dyes.length ? "(" + p.dyes.map(d => DYE[d].label).join(", ") + ")" : "(no dye)"}
                </span>
              </span>
              <span className="font-mono text-zinc-700 shrink-0">{sz} bp</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TargetSequenceView({ fullConstruct, targetStart, targetEnd, grnas, selectedId }) {
  const seq = fullConstruct.substring(targetStart - 1, targetEnd).toUpperCase();
  const annot = new Array(seq.length).fill(null).map(() => ({}));
  for (const g of grnas) {
    const ti = g.target_pos - 1;
    if (g.strand === "top") {
      for (let k = 0; k < 20; k++) if (ti + k < seq.length) annot[ti + k].top = true;
      for (let k = 20; k < 23; k++) if (ti + k < seq.length) { annot[ti + k].top = true; annot[ti + k].isPamTop = true; }
    } else {
      for (let k = 0; k < 3; k++) if (ti + k < seq.length) { annot[ti + k].bot = true; annot[ti + k].isPamBot = true; }
      for (let k = 3; k < 23; k++) if (ti + k < seq.length) annot[ti + k].bot = true;
    }
    if (g.id === selectedId) {
      for (let k = 0; k < 23; k++) if (ti + k < seq.length) annot[ti + k].isSel = true;
    }
  }
  const chunks = [];
  for (let i = 0; i < seq.length; i += 60) chunks.push([i, seq.substring(i, i + 60)]);
  return (
    <div className="bg-zinc-50 rounded border border-zinc-200 p-2 font-mono text-[11px] leading-relaxed overflow-x-auto">
      {chunks.map(([start, chunk]) => (
        <div key={start} className="whitespace-pre">
          <span className="text-zinc-400 select-none">{String(start + 1).padStart(4, " ")}  </span>
          {chunk.split("").map((c, k) => {
            const a = annot[start + k] || {};
            const cls = [
              a.isSel ? "bg-yellow-200" : "",
              a.isPamTop ? "text-green-700 font-bold" : (a.top ? "text-green-600" : ""),
              a.isPamBot ? "text-pink-700 font-bold" : (a.bot ? "text-pink-600" : ""),
            ].filter(Boolean).join(" ");
            return <span key={k} className={cls}>{c}</span>;
          })}
          <span className="text-zinc-400 select-none">  {String(Math.min(start + chunk.length, seq.length)).padStart(4, " ")}</span>
        </div>
      ))}
      <div className="flex flex-wrap gap-3 pt-2 text-[10px] text-zinc-600 border-t border-zinc-200 mt-2">
        <span><span className="inline-block w-3 h-3 bg-green-600 mr-1 align-middle" />Top protospacer</span>
        <span><span className="inline-block w-3 h-3 bg-green-700 mr-1 align-middle" />Top PAM (NGG)</span>
        <span><span className="inline-block w-3 h-3 bg-pink-600 mr-1 align-middle" />Bot protospacer</span>
        <span><span className="inline-block w-3 h-3 bg-pink-700 mr-1 align-middle" />Bot PAM (CCN on top)</span>
        <span><span className="inline-block w-3 h-3 bg-yellow-200 mr-1 align-middle" />Selected gRNA</span>
      </div>
    </div>
  );
}

function CutPredictionTab({ samples, cfg, setCfg, results }) {
  const grnas = useMemo(() => findGrnas(CONSTRUCT.seq, CONSTRUCT.targetRange.start, CONSTRUCT.targetRange.end), []);
  const [selectedId, setSelectedId] = useState(null);
  const [customGrna, setCustomGrna] = useState("");
  const [customError, setCustomError] = useState("");
  const [customGrnaObj, setCustomGrnaObj] = useState(null);
  const [currentSample, setCurrentSample] = useState(samples[0] || "");
  const [overhang, setOverhang] = useState(0);
  const [onlyCatalog, setOnlyCatalog] = useState(false);

  // Pre-compute catalog matches for every candidate gRNA (stable across renders).
  const catalogMatches = useMemo(() => {
    const map = {};
    for (const g of grnas) map[g.id] = matchLabCatalog(g);
    return map;
  }, [grnas]);
  const catalogCount = Object.values(catalogMatches).filter(Boolean).length;
  const visibleGrnas = onlyCatalog ? grnas.filter(g => catalogMatches[g.id]) : grnas;

  const activeGrna = selectedId !== null
    ? (selectedId === -1 ? customGrnaObj : grnas.find(g => g.id === selectedId))
    : null;
  const predictedProducts = activeGrna ? predictCutProducts(activeGrna, CONSTRUCT.total, overhang) : null;

  const observed = {};
  if (currentSample && results[currentSample]) {
    for (const d of SAMPLE_DYES) {
      const r = results[currentSample][d];
      observed[d] = r && r.match ? r.match.size : null;
    }
  }

  const handleAutoPick = () => {
    if (!currentSample) return;
    // Bias toward lab catalog: try catalog-only first, fall back to full set
    const catalogGrnas = grnas.filter(g => catalogMatches[g.id]);
    let best = null;
    if (catalogGrnas.length) {
      best = autoPickGrna(catalogGrnas, observed, CONSTRUCT.total, [0, 1, 2, 3, 4]);
      // Accept catalog match only if reasonable (<=5 bp mean deviation); otherwise fall through
      if (best && best.score > 5) best = null;
    }
    if (!best) best = autoPickGrna(grnas, observed, CONSTRUCT.total, [0, 1, 2, 3, 4]);
    if (best) { setSelectedId(best.grna.id); setOverhang(best.overhang); }
  };

  const handleFindCustom = () => {
    setCustomError(""); setCustomGrnaObj(null);
    const res = locateCustomGrna(customGrna, CONSTRUCT.seq, CONSTRUCT.targetRange.start, CONSTRUCT.targetRange.end);
    if (!res.ok) { setCustomError(res.error); return; }
    setCustomGrnaObj(res.grna); setSelectedId(-1);
  };

  const applyToSample = () => {
    if (!predictedProducts || !currentSample) return;
    setCfg(prev => ({
      ...prev,
      [currentSample]: {
        ...prev[currentSample],
        target: Math.round((predictedProducts.B.length + predictedProducts.Y.length) / 2),
        expected: { B: predictedProducts.B.length, G: predictedProducts.G.length, Y: predictedProducts.Y.length, R: predictedProducts.R.length },
        chemistry: "custom",
      },
    }));
  };

  const predictBlunt = (g) => predictCutProducts(g, CONSTRUCT.total, 0);

  return (
    <>
      <LabInventoryPanel candidates={grnas} />
      <div className="bg-white rounded-lg border border-zinc-200 p-3 mb-2">
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-sm font-medium">Target sequence &middot; construct pos {CONSTRUCT.targetRange.start} to {CONSTRUCT.targetRange.end} ({CONSTRUCT.targetRange.end - CONSTRUCT.targetRange.start + 1} bp)</div>
          <div className="text-xs text-zinc-500">{grnas.length} gRNA candidates ({grnas.filter(g=>g.strand==="top").length} top, {grnas.filter(g=>g.strand==="bot").length} bot)</div>
        </div>
        <TargetSequenceView fullConstruct={CONSTRUCT.seq} targetStart={CONSTRUCT.targetRange.start} targetEnd={CONSTRUCT.targetRange.end} grnas={grnas} selectedId={selectedId} />
        {activeGrna && (
          <div className="mt-3 border-t border-zinc-200 pt-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1">Cut site on full 226 bp construct</div>
            <ConstructDiagram
              componentSizes={componentSizesFrom(CONSTRUCT)}
              cutConstructPos={activeGrna.cut_construct}
              overhang={overhang}
              grnaStrand={activeGrna.strand}
            />
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg border border-zinc-200 p-3 mb-2">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">Custom gRNA (20 nt DNA or RNA)</div>
            <div className="flex gap-1.5 items-center">
              <input type="text" value={customGrna} onChange={e => setCustomGrna(e.target.value)}
                placeholder="e.g. ACGTGCTGAGGTCCATAGCC"
                className="flex-1 px-2 py-1 text-xs border border-zinc-300 rounded font-mono uppercase" />
              <button onClick={handleFindCustom} className="px-2.5 py-1 text-xs rounded bg-zinc-900 text-white hover:bg-zinc-700">Find</button>
            </div>
            {customError && <div className="text-xs text-red-600 mt-1">{customError}</div>}
            {customGrnaObj && <div className="text-xs text-zinc-600 mt-1">Found on <b>{customGrnaObj.strand}</b> strand &middot; target pos {customGrnaObj.target_pos} &middot; PAM {customGrnaObj.pam_seq} &middot; cut at construct pos {customGrnaObj.cut_construct}.</div>}
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">Auto-pick from observed peaks</div>
            <div className="flex gap-1.5 items-center flex-wrap">
              <label className="text-xs text-zinc-600">Sample:</label>
              <select value={currentSample} onChange={e => setCurrentSample(e.target.value)} className="px-1.5 py-1 text-xs border border-zinc-300 rounded">
                {samples.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <button onClick={handleAutoPick} className="px-2.5 py-1 text-xs rounded bg-emerald-700 text-white hover:bg-emerald-600">Auto-pick best match</button>
            </div>
            <div className="text-xs text-zinc-600 mt-1 font-mono">
              observed: B={observed.B?.toFixed(1) ?? "-"} Y={observed.Y?.toFixed(1) ?? "-"} G={observed.G?.toFixed(1) ?? "-"} R={observed.R?.toFixed(1) ?? "-"}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-zinc-200 p-3 mb-2">
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-sm font-medium">gRNA candidates &middot; blunt-cut size predictions</div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500">{catalogCount} of {grnas.length} match lab catalog</span>
            <label className="flex items-center gap-1.5 text-xs text-zinc-700">
              <input type="checkbox" checked={onlyCatalog} onChange={e => setOnlyCatalog(e.target.checked)} className="rounded" />
              Show only lab catalog
            </label>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-zinc-500 border-b border-zinc-200">
                <th className="text-left px-1 py-1">#</th>
                <th className="text-left px-1 py-1">strand</th>
                <th className="text-left px-1 py-1">PAM</th>
                <th className="text-left px-1 py-1">protospacer (20 nt, 5'-to-3')</th>
                <th className="text-right px-1 py-1">targ pos</th>
                <th className="text-right px-1 py-1">cut bp</th>
                <th className="text-right px-1 py-1">Y</th>
                <th className="text-right px-1 py-1">B</th>
                <th className="text-right px-1 py-1">G</th>
                <th className="text-right px-1 py-1">R</th>
                <th className="text-left px-1 py-1">lab catalog</th>
                <th className="text-left px-1 py-1"></th>
              </tr>
            </thead>
            <tbody>
              {visibleGrnas.map(g => {
                const p = predictBlunt(g);
                const sel = g.id === selectedId;
                return (
                  <tr key={g.id} className={`border-b border-zinc-100 ${sel ? "bg-yellow-50" : ""}`}>
                    <td className="px-1 py-0.5 text-zinc-400">{g.id + 1}</td>
                    <td className="px-1 py-0.5">
                      <span className={`px-1 rounded text-white text-[10px] ${g.strand === "top" ? "bg-green-700" : "bg-pink-700"}`}>{g.strand}</span>
                    </td>
                    <td className="px-1 py-0.5 font-bold">{g.pam_seq}</td>
                    <td className="px-1 py-0.5 text-zinc-700">{g.protospacer}</td>
                    <td className="px-1 py-0.5 text-right">{g.target_pos}</td>
                    <td className="px-1 py-0.5 text-right">{g.cut_construct}</td>
                    <td className="px-1 py-0.5 text-right" style={{color:DYE.Y.color}}>{p.Y.length}</td>
                    <td className="px-1 py-0.5 text-right" style={{color:DYE.B.color}}>{p.B.length}</td>
                    <td className="px-1 py-0.5 text-right" style={{color:DYE.G.color}}>{p.G.length}</td>
                    <td className="px-1 py-0.5 text-right" style={{color:DYE.R.color}}>{p.R.length}</td>
                    <td className="px-1 py-0.5">
                      <LabInventoryBadge candidate={g} compact />
                    </td>
                    <td className="px-1 py-0.5">
                      <button onClick={() => setSelectedId(g.id)}
                        className={`px-2 py-0.5 text-[10px] rounded border ${sel ? "bg-yellow-400 border-yellow-500 text-zinc-900" : "bg-white border-zinc-300 text-zinc-700 hover:bg-zinc-100"}`}>
                        {sel ? "selected" : "select"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {activeGrna && predictedProducts && (
        <div className="bg-white rounded-lg border-2 border-yellow-400 p-3 mb-2">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-sm font-medium">
                Selected gRNA: <span className="font-mono">{activeGrna.protospacer}</span>
                <span className="ml-2 px-1.5 rounded text-white text-xs" style={{background: activeGrna.strand === "top" ? "#15803d" : "#be185d"}}>{activeGrna.strand} strand</span>
              </div>
              <div className="text-xs text-zinc-600 mt-0.5">
                PAM: <b>{activeGrna.pam_seq}</b> &middot; target pos {activeGrna.target_pos} &middot; cut at construct pos {activeGrna.cut_construct}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-zinc-600">Cut chemistry:</label>
              <select value={overhang} onChange={e => setOverhang(parseInt(e.target.value, 10))} className="px-1.5 py-1 text-xs border border-zinc-300 rounded">
                <option value={0}>Blunt (Cas9 classic)</option>
                <option value={1}>1 nt 5' overhang</option>
                <option value={2}>2 nt 5' overhang</option>
                <option value={3}>3 nt 5' overhang</option>
                <option value={4}>4 nt 5' overhang</option>
              </select>
            </div>
          </div>

          <div className="mb-3 border border-zinc-200 rounded p-2 bg-zinc-50">
            <ProductFragmentViz products={predictedProducts} constructSize={CONSTRUCT.total} />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-500 border-b border-zinc-200">
                  <th className="text-left px-2 py-1">Dye</th>
                  <th className="text-left px-2 py-1">ssDNA length</th>
                  <th className="text-left px-2 py-1">Fragment</th>
                  <th className="text-left px-2 py-1">Strand</th>
                  <th className="text-left px-2 py-1">Template vs gRNA</th>
                  <th className="text-left px-2 py-1">PAM location</th>
                  <th className="text-left px-2 py-1">&Delta; from observed</th>
                </tr>
              </thead>
              <tbody>
                {["Y","B","G","R"].map(d => {
                  const p = predictedProducts[d];
                  const obs = observed[d];
                  const delta = obs !== null && obs !== undefined ? (obs - p.length) : null;
                  return (
                    <tr key={d} className="border-b border-zinc-100">
                      <td className="px-2 py-1">
                        <span className="inline-block w-3 h-3 rounded-full mr-1.5 align-middle" style={{background:DYE[d].color}} />
                        <span className="font-medium">{DYE[d].name}</span>
                        <span className="text-zinc-500 ml-1">({DYE[d].label})</span>
                      </td>
                      <td className="px-2 py-1 font-mono font-bold">{p.length} nt</td>
                      <td className="px-2 py-1">{p.fragment}</td>
                      <td className="px-2 py-1">{p.strand}</td>
                      <td className="px-2 py-1">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${p.template === "non-template" ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800"}`}>{p.template}</span>
                      </td>
                      <td className="px-2 py-1">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${p.pam_side === "proximal" ? "bg-rose-100 text-rose-800" : "bg-zinc-100 text-zinc-700"}`}>PAM-{p.pam_side}</span>
                      </td>
                      <td className="px-2 py-1 font-mono">
                        {obs !== null && obs !== undefined ? (
                          <span className={`${Math.abs(delta) < 2 ? "text-emerald-700" : Math.abs(delta) < 5 ? "text-amber-700" : "text-red-700"}`}>
                            obs {obs.toFixed(2)} &middot; {delta >= 0 ? "+" : ""}{delta.toFixed(2)} bp
                          </span>
                        ) : <span className="text-zinc-400">no observed peak</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <label className="text-xs text-zinc-600">Apply predicted sizes to:</label>
            <select value={currentSample} onChange={e => setCurrentSample(e.target.value)} className="px-1.5 py-1 text-xs border border-zinc-300 rounded">
              {samples.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button onClick={applyToSample} className="px-2.5 py-1 text-xs rounded bg-zinc-900 text-white hover:bg-zinc-700">Apply to sample</button>
          </div>

          <div className="mt-2 text-[11px] text-zinc-600 leading-snug">
            <b>Legend.</b> <b>non-template strand</b> carries 5'-NGG-3' (the strand the Cas9 gRNA displaces via R-loop). <b>template strand</b> is the complement, hybridized by the gRNA. <b>PAM-proximal</b> fragment contains the PAM sequence; <b>PAM-distal</b> fragment does not. For 5' overhangs, the top-strand cut and bot-strand cut are offset by the overhang length.
          </div>
        </div>
      )}
    </>
  );
}

function OverhangChart({ samples, results }) {
  const W = 920, H = Math.max(220, 40 + samples.length * 22);
  const m = { l: 110, r: 24, t: 10, b: 36 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  const CLIP = 8;
  const bandH = ph / samples.length;
  const xFor = v => m.l + ((Math.max(-CLIP, Math.min(CLIP, v)) + CLIP) / (2 * CLIP)) * pw;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      <line x1={m.l} x2={m.l + pw} y1={m.t + ph} y2={m.t + ph} stroke="#334155" />
      <line x1={m.l + pw / 2} x2={m.l + pw / 2} y1={m.t} y2={m.t + ph} stroke="#94a3b8" strokeDasharray="2 3" />
      {[-CLIP, -4, 0, 4, CLIP].map(t => {
        const x = m.l + ((t + CLIP) / (2 * CLIP)) * pw;
        return (
          <g key={t}>
            <line x1={x} x2={x} y1={m.t + ph} y2={m.t + ph + 4} stroke="#94a3b8" />
            <text x={x} y={m.t + ph + 16} fontSize="10" textAnchor="middle" fill="#64748b">
              {t <= -CLIP ? `≤-${CLIP}` : t >= CLIP ? `≥${CLIP}` : t}
            </text>
          </g>
        );
      })}
      <text x={m.l + pw / 2} y={H - 4} fontSize="11" textAnchor="middle" fill="#334155" fontWeight="500">Size offset (bp)</text>

      {samples.map((sample, i) => {
        const yCenter = m.t + bandH * (i + 0.5);
        const barH = Math.min(8, bandH * 0.3);
        const r = results[sample];
        const b = r?.B?.match, y = r?.Y?.match, g = r?.G?.match, red = r?.R?.match;
        const bvr = (b && y)   ? y.size - b.size   : null;  // Adapter 1 end overhang (B=FAM, Y=TAMRA)
        const gvy = (g && red) ? red.size - g.size : null;  // Adapter 2 end overhang (G=HEX, R=ROX)
        const x0 = m.l + pw / 2;
        return (
          <g key={sample}>
            <text x={m.l - 8} y={yCenter + 4} fontSize="11" textAnchor="end" fill="#334155" fontFamily="ui-monospace, monospace">{sample}</text>
            {bvr !== null && (
              <>
                <rect x={Math.min(x0, xFor(bvr))} y={yCenter - barH - 1}
                      width={Math.abs(xFor(bvr) - x0)} height={barH} fill="#d32f2f"
                      opacity={Math.abs(bvr) > CLIP ? 0.35 : 0.85} />
                <text x={xFor(bvr) + (bvr >= 0 ? 4 : -4)} y={yCenter - 3}
                      fontSize="10" fontFamily="ui-monospace, monospace"
                      textAnchor={bvr >= 0 ? "start" : "end"} fill="#64748b">{bvr.toFixed(2)}</text>
              </>
            )}
            {gvy !== null && (
              <>
                <rect x={Math.min(x0, xFor(gvy))} y={yCenter + 1}
                      width={Math.abs(xFor(gvy) - x0)} height={barH} fill="#b8860b"
                      opacity={Math.abs(gvy) > CLIP ? 0.35 : 0.85} />
                <text x={xFor(gvy) + (gvy >= 0 ? 4 : -4)} y={yCenter + 12}
                      fontSize="10" fontFamily="ui-monospace, monospace"
                      textAnchor={gvy >= 0 ? "start" : "end"} fill="#64748b">{gvy.toFixed(2)}</text>
              </>
            )}
          </g>
        );
      })}

      <g>
        <rect x={W - 210} y={m.t + 4} width={10} height={7} fill="#b8860b" />
        <text x={W - 196} y={m.t + 11} fontSize="10" fill="#334155">Y → B (Adapter 1 end)</text>
        <rect x={W - 210} y={m.t + 18} width={10} height={7} fill="#d32f2f" />
        <text x={W - 196} y={m.t + 25} fontSize="10" fill="#334155">R → G (Adapter 2 end)</text>
      </g>
    </svg>
  );
}
