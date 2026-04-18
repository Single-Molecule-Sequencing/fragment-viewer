// src/lib/analysis.js — derived analytical helpers (pure functions).
//
// Extracted from FragmentViewer.jsx per issue #13. Signal-to-noise, purity,
// heatmap matrix, peak-shift, dA-tailing classification, residual, and
// auto-calibration — all operate on plain JS objects with the shared
// peak-table shape { [sample]: { [dye]: [[size, height, area, width], ...] } }.
//
// No React. No DOM. Consumed by the main viewer + unit tests.

// ----------------------------------------------------------------------

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

// ----------------------------------------------------------------------
// End-structure evaluation: given a double-strand terminus described by the
// position of each strand's end, classify the overhang type (blunt / 5' / 3')
// and predict whether the end will dA-tail under the lab's standard protocol.
// ----------------------------------------------------------------------
//
// Lab dA-tailing chemistry:
//   Step 1: 5'→3' exonuclease (e.g. T7 exo) chews back 5' single-strand overhangs
//           until the end is blunt. Does NOT act on 3' overhangs.
//   Step 2: Klenow exo- (or Taq) adds a single dA to every 3' terminus.
//
// Outcomes:
//   • Blunt end                → dA-tailed cleanly (Step 2 only)
//   • 5' overhang (≤ ~8 nt)    → chewed back by Step 1, then dA-tailed
//   • 5' overhang (> 8 nt)     → works but efficiency drops; flagged "marginal"
//   • 3' overhang              → dA-tail FAILS — Step 1 doesn't chew, and the
//                                3' terminus is already base-paired/extended
//
// End side semantics:
//   side="left"  = the RIGHT edge of the LEFT fragment (top 3' end + bot 5' end)
//   side="right" = the LEFT  edge of the RIGHT fragment (top 5' end + bot 3' end)
//
// Inputs: topEnd, botEnd = bp positions where each strand terminates on this side.
// Returns: { overhangType, overhangLen, dATailable, confidence, reason }.
export function evaluateDATailing({ side, topEnd, botEnd }) {
  const delta = topEnd - botEnd;
  let overhangType, overhangLen;
  if (delta === 0) {
    overhangType = "blunt"; overhangLen = 0;
  } else if (side === "left") {
    // LEFT end: top 3' / bot 5'. Both strands END here (run from construct
    // start up to this position). Top ends at higher bp = top longer = top
    // 3' sticks out = 3' overhang.
    overhangType = delta > 0 ? "3_prime" : "5_prime";
    overhangLen  = Math.abs(delta);
  } else {
    // RIGHT end: top 5' / bot 3'. Both strands START here (run from this
    // position to the construct end). Top STARTS at lower bp = top longer
    // at this edge = top 5' sticks out = 5' overhang. So delta<0 → 5'.
    overhangType = delta < 0 ? "5_prime" : "3_prime";
    overhangLen  = Math.abs(delta);
  }
  let dATailable, confidence, reason;
  if (overhangType === "blunt") {
    dATailable = true; confidence = "high";
    reason = "Blunt end — Klenow exo⁻ adds 3′ dA directly.";
  } else if (overhangType === "5_prime") {
    if (overhangLen <= 8) {
      dATailable = true; confidence = "high";
      reason = `${overhangLen}-nt 5′ overhang — T7 exo chews back to blunt, then 3′ dA is added.`;
    } else {
      dATailable = true; confidence = "marginal";
      reason = `${overhangLen}-nt 5′ overhang — exceeds typical exo efficiency window; tailing usually succeeds but yield drops.`;
    }
  } else {
    // 3' overhang — exo can't chew it; terminus is already extended.
    dATailable = false; confidence = "high";
    reason = `${overhangLen}-nt 3′ overhang — T7 exo does NOT process 3′ overhangs, and Klenow exo⁻ cannot add dA on top of an already-extended 3′ terminus.`;
  }
  return { overhangType, overhangLen, dATailable, confidence, reason };
}

// ----------------------------------------------------------------------
// Post-dA-tailing product prediction: given an end's geometry + the local
// construct sequence, simulate the lab's exo+dA protocol and return the
// final terminal structure, adapter compatibility, and sequencing
// direction. Used by PostTailingPanel.
// ----------------------------------------------------------------------
export function predictPostTailing({ side, topEnd, botEnd, topSeq }) {
  const evalIn = evaluateDATailing({ side, topEnd, botEnd });
  const rc = (b) => ({ A: "T", T: "A", G: "C", C: "G", N: "N" })[(b || "N").toUpperCase()] || "N";
  const tEnd = Math.max(0, Math.min((topSeq || "").length, topEnd));
  const bEnd = Math.max(0, Math.min((topSeq || "").length, botEnd));

  // Extract terminal sequence context (last 2 bases near the cut side).
  // On LEFT end:  top 3' terminus is at position tEnd-1 (the last base of
  //               the left fragment on top). Bot 5' terminus sits at bEnd-1
  //               (the base paired with top[bEnd-1], read as its complement).
  // On RIGHT end: top 5' terminus at tEnd (first base of right fragment on
  //               top). Bot 3' terminus at bEnd (complement of top[bEnd]).
  let top3Before = "?";
  let bot3Before = "?";
  if (topSeq) {
    if (side === "left") {
      top3Before = (topSeq[tEnd - 1] || "?").toUpperCase();
      // Bot 3' end on LEFT side is at the OUTER (construct-start) edge of
      // the LEFT fragment — use the complement of the first base.
      bot3Before = rc(topSeq[0] || "?");
    } else {
      // RIGHT end: bot 3' terminus is at the cut side.
      bot3Before = rc(topSeq[bEnd] || "?");
      // Top 3' on RIGHT side is at the OUTER (construct-end) edge.
      top3Before = (topSeq[topSeq.length - 1] || "?").toUpperCase();
    }
  }

  // Exo chewback: 5' overhangs are chewed back to blunt. 3' overhangs are
  // untouched. Post-exo overhang type:
  const postExoOverhang = evalIn.overhangType === "5_prime" ? "blunt" : evalIn.overhangType;
  const postExoLen = evalIn.overhangType === "5_prime" ? 0 : evalIn.overhangLen;

  // dA addition: only adds to 3' ends that are EITHER blunt or recessed
  // (post-exo blunting). Fails on 3' overhangs.
  const dATailed = postExoOverhang === "blunt";

  // For LEFT end the cut-side 3' end is TOP 3'; for RIGHT end it's BOT 3'.
  // The OTHER 3' end of the same fragment is at the OUTER edge of the
  // construct. Both 3' ends see dA tailing (it's a solution-phase reaction).
  // But only the CUT-SIDE terminus is what's relevant for this editor — the
  // outer ends are the constant fragment boundary.

  // Final end code: after dA, each blunt end becomes a 1-nt 3' A overhang.
  let endCode;
  if (dATailed) {
    endCode = "3'-A (dA-tailed)";
  } else if (evalIn.overhangType === "blunt") {
    endCode = "blunt (untreated)";
  } else if (evalIn.overhangType === "3_prime") {
    endCode = `${evalIn.overhangLen}-nt 3' overhang (retained)`;
  } else {
    endCode = `${evalIn.overhangLen}-nt 5' overhang (pre-exo)`;
  }

  // Terminal sequence after dA:
  //   Top 3' on LEFT end: base at tEnd-1 followed by A (if tailed) → e.g. "CA"
  //   Bot 3' on RIGHT end: complement(seq[bEnd]) followed by A (if tailed)
  //   3' overhangs: no dA, sequence unchanged
  const top3After = dATailed && side === "left"  ? `${top3Before}A` : top3Before;
  const bot3After = dATailed && side === "right" ? `${bot3Before}A` : bot3Before;

  // TA-ligation adapter compatibility: needs a 1-nt 3' A overhang, which
  // is exactly what dA tailing produces from a blunt or post-exo end.
  const adapterCompatible = dATailed;
  const adapterReason = dATailed
    ? "Single 3′-A overhang is the canonical substrate for T/A ligation adapters (Illumina TruSeq, ONT LSK/SQK ligation kits). Expected high-efficiency ligation."
    : (evalIn.overhangType === "3_prime"
        ? `3′ overhang retained (Taq's 5′→3′ exo does not process 3′ ssDNA). T/A ligation will NOT work — consider T4 DNA polymerase fill-in + Klenow exo⁻ chewback to create a blunt end, OR use a compatible sticky-end adapter if the overhang sequence is defined.`
        : `Left untreated. Blunt-end ligation adapters can be used but at lower efficiency than T/A; alternatively run Taq-mediated dA tailing to recover T/A compatibility.`);

  // Sequencing direction: after T/A adapter ligation at this cut-side end,
  // the adapter's Y-stem presents both strands to the sequencer.
  //   LEFT end: cut-side has top 3' + bot 5'. Adapter's T/A pairs with
  //     top's new 3'-A. Read 1 typically primes from the adapter and reads
  //     INTO the fragment along the top strand 5'→3' direction (from the
  //     cut toward the construct start — so rightward-inside coordinates,
  //     leftward when we draw construct 5'→3' left-to-right).
  //   RIGHT end: cut-side has top 5' + bot 3'. Adapter ligates to bot's
  //     3'-A. R1 reads along bot strand 5'→3' (from cut toward construct
  //     end), which on the diagram runs leftward along the bot strand.
  const readDir = side === "left"
    ? "R1: top strand 3′→5′ (reads INTO left fragment from cut, runs ←). R2: bot strand 5′→3′ runs →."
    : "R1: bot strand 3′→5′ (reads INTO right fragment from cut, runs →). R2: top strand 5′→3′ runs ←.";

  return {
    original: evalIn,
    postExo: { overhangType: postExoOverhang, overhangLen: postExoLen },
    dATailed,
    endCode,
    top3Before, top3After,
    bot3Before, bot3After,
    adapterCompatible,
    adapterReason,
    readingDirection: readDir,
  };
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
