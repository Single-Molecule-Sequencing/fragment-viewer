// src/lib/preprocess.js — signal preprocessing helpers (pure functions).
//
// Extracted from FragmentViewer.jsx to keep the monolith under the 2000-line
// cap per issue #13. All functions are order-independent and operate on plain
// number arrays; no React, no DOM. The shared pipeline entrypoint is
// preprocessTrace() — individual transforms are exported for unit tests.


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

// Simple boxcar (moving-average) smooth. Fastest option; blunts peaks more
// than Savitzky–Golay but is robust to any window size. Edges clamp instead
// of wrapping. Window is forced to an odd int ≥ 3.
export function movingAverage(trace, window = 5) {
  if (!trace || !trace.length) return [];
  const w = Math.max(3, Math.floor(window / 2) * 2 + 1);
  const half = (w - 1) / 2;
  const n = trace.length;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(n - 1, i + half);
    let s = 0, c = 0;
    for (let j = lo; j <= hi; j++) { s += trace[j]; c++; }
    out[i] = s / c;
  }
  return out;
}

// Rolling median — robust to single-sample spikes (shot noise, ADC glitch).
// Window is forced to odd ≥ 3. O(n·w log w) from per-window sort; fine for
// w ≤ 21 and n ≤ 20 000.
export function medianFilter(trace, window = 5) {
  if (!trace || !trace.length) return [];
  const w = Math.max(3, Math.floor(window / 2) * 2 + 1);
  const half = (w - 1) / 2;
  const n = trace.length;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(n - 1, i + half);
    const buf = [];
    for (let j = lo; j <= hi; j++) buf.push(trace[j]);
    buf.sort((a, b) => a - b);
    out[i] = buf[Math.floor(buf.length / 2)];
  }
  return out;
}

// Linear-trend detrend: subtract the best-fit line y = a + b·i. Useful for
// removing capillary electrophoresis drift that a rolling-min baseline
// can't catch (slow global slope across the whole run).
export function detrendLinear(trace) {
  if (!trace || !trace.length) return [];
  const n = trace.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sx += i; sy += trace[i]; sxx += i * i; sxy += i * trace[i]; }
  const denom = n * sxx - sx * sx;
  const b = denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
  const a = (sy - b * sx) / n;
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = trace[i] - (a + b * i);
  return out;
}

// Log transform: y = log10(max(1, x + 1)) × scale. Compresses dynamic range
// so small peaks remain visible alongside saturated ones without clipping.
// Scale defaults to 1000 so the log-compressed range maps back to RFU-like
// magnitudes (log10(30000) × 1000 ≈ 4480).
export function logTransform(trace, scale = 1000) {
  if (!trace || !trace.length) return [];
  const n = trace.length;
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.log10(Math.max(1, trace[i] + 1)) * scale;
  return out;
}

// First-difference derivative — (x[i+1] - x[i-1]) / 2. Emphasizes peak
// edges; flat regions go to zero. Output is shifted to have the same
// baseline as a typical RFU signal by adding back the mean of the input.
export function firstDerivative(trace) {
  if (!trace || !trace.length) return [];
  const n = trace.length;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += trace[i];
  const mean = sum / n;
  const out = new Array(n);
  out[0] = mean;
  out[n - 1] = mean;
  for (let i = 1; i < n - 1; i++) {
    out[i] = mean + (trace[i + 1] - trace[i - 1]) / 2;
  }
  return out;
}

// Apply a full preprocessing chain to a single trace. Order matters:
//   clip → log → baseline-subtract → detrend → smooth → derivative.
// All options default to no-op. Exposed so the UI can wire one control per
// step and we can test the composed behavior.
export function preprocessTrace(trace, opts = {}) {
  if (!trace || !trace.length) return [];
  let t = trace.slice();
  if (opts.clip && opts.clipCeiling > 0) t = clipSaturated(t, opts.clipCeiling);
  if (opts.log) t = logTransform(t, opts.logScale || 1000);
  if (opts.baseline) {
    const bl = rollingBaseline(t, opts.baselineWindow || 201);
    t = subtractBaseline(t, bl);
  }
  if (opts.detrend) t = detrendLinear(t);
  // Smoother family: "savgol" | "moving" | "median" | "none"
  if (opts.smooth === "savgol") {
    t = savitzkyGolay(t, opts.savgolWindow || 7, opts.savgolOrder || 2);
  } else if (opts.smooth === "moving") {
    t = movingAverage(t, opts.movingWindow || 5);
  } else if (opts.smooth === "median") {
    t = medianFilter(t, opts.medianWindow || 5);
  }
  if (opts.derivative) t = firstDerivative(t);
  return t;
}
