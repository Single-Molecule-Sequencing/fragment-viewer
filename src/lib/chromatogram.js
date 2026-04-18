// src/lib/chromatogram.js — pure plot helpers.
//
// Issue #13: lifted out of FragmentViewer.jsx so that both the monolith and
// extracted tab/components files can import them without circular edges.

// Format Y-axis tick label — 10k / 1.2k / 500.
export function formatTick(v) {
  if (v >= 10000) return (v / 1000).toFixed(0) + "k";
  if (v >= 1000)  return (v / 1000).toFixed(1) + "k";
  return v.toString();
}

// Pick tick spacing appropriate to a Y-max. Keeps axes readable across the
// 4-decade range we see on capillary electrophoresis traces.
export function computeLinearTicks(yMax) {
  const step = yMax > 40000 ? 10000 : yMax > 10000 ? 5000 : yMax > 2000 ? 1000 : yMax > 500 ? 200 : 100;
  const t = [];
  for (let v = 0; v <= yMax; v += step) t.push(v);
  return t;
}

// Build a Gaussian-sum SVG path for the visible peaks in a given x-range.
// Called per lane by every chromatogram (TraceTab, CompareTab, StackedChromatogram).
//
// Peak shape: Σᵢ hᵢ · exp(−½ ((x − μᵢ) / σᵢ)²)
// with σᵢ derived from the per-peak width (FWHM) divided by the Gaussian
// FWHM→σ factor 2.355, scaled by `smoothing` so users can broaden/narrow
// the model at will. `logY` re-maps intensity onto log10 so small peaks
// remain visible alongside saturated ones.
//
// Returns { stroke, fill } — two SVG path strings. `stroke` is the line
// through the top of the curve; `fill` closes the path down to the lane
// baseline for a filled area plot.
export function buildGaussianPath(peaks, xRange, yMax, geom, smoothing = 1, logY = false) {
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
