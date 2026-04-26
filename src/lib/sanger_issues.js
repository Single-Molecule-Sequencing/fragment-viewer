// src/lib/sanger_issues.js — auto-detect anomalies in Sanger chromatograms.
//
// Pure-JS, no deps. Operates on the parsed Sanger sample shape produced by
// parseSangerAbif (basecalls, qScores, peakLocations, traces). Each detector
// is a small focused function; the orchestrator detectIssues() runs them
// all and returns a flat severity-ranked list.
//
// Each issue is:
//   {
//     type:        "mixed_peak" | "low_signal" | "quality_dip" | "n_run" | "gc_compression",
//     severity:    "high" | "medium" | "low",
//     positionBp:  number   (basecall index, 0-based)
//     rangeBp:     [start, end]  (basecall index range, 0-based half-open)
//     traceX:      number   (data-point index; lookup peakLocations[positionBp])
//     traceRange:  [start, end]
//     description: string   (human-readable)
//     metadata:    {...}    (detector-specific details for the detail view)
//   }

const BASE_INDICES = { A: 0, C: 1, G: 2, T: 3 };
const BASE_FROM_INDEX = ["A", "C", "G", "T"];


// ----------------------------------------------------------------------
// Detector: mixed peaks (heterozygotes / template mixture / contamination)
// ----------------------------------------------------------------------
//
// At each basecall position, look at the trace value of all 4 channels
// at the peak location. If the second-highest channel is ≥ minRatio of the
// highest, the position has a "shadow" peak — a sign of:
//   - heterozygous SNP (germline / plasmid pool)
//   - template mixture (two clones in the same well)
//   - contamination
//   - basecaller indecision (often correlated with low Q)

export function detectMixedPeaks(sample, opts = {}) {
  const minRatio = opts.minRatio ?? 0.30;        // 30% shadow → flag
  const highRatio = opts.highRatio ?? 0.50;      // 50% shadow → high-severity
  const trimRange = opts.trimRange;              // [start, end] in basecall idx; null = whole read
  const { basecalls, peakLocations, traces } = sample;
  const issues = [];
  if (!basecalls || !peakLocations || !traces) return issues;
  const startIdx = trimRange ? trimRange[0] : 0;
  const endIdx = trimRange ? trimRange[1] : basecalls.length;
  for (let i = startIdx; i < endIdx; i++) {
    const px = peakLocations[i];
    if (px == null) continue;
    const callBase = basecalls[i];
    if (!(callBase in BASE_INDICES)) continue;  // skip N
    // 4-channel intensities at this peak position.
    const intensities = [0, 0, 0, 0];
    for (let b = 0; b < 4; b++) {
      const tr = traces[BASE_FROM_INDEX[b]];
      intensities[b] = tr ? (tr[px] ?? 0) : 0;
    }
    const callIdx = BASE_INDICES[callBase];
    const callV = intensities[callIdx];
    if (callV < 50) continue;  // signal too weak to call shadow meaningful
    let secondV = 0;
    let secondIdx = -1;
    for (let b = 0; b < 4; b++) {
      if (b === callIdx) continue;
      if (intensities[b] > secondV) { secondV = intensities[b]; secondIdx = b; }
    }
    const ratio = secondV / callV;
    if (ratio >= minRatio) {
      issues.push({
        type: "mixed_peak",
        severity: ratio >= highRatio ? "high" : "medium",
        positionBp: i,
        rangeBp: [i, i + 1],
        traceX: px,
        traceRange: [Math.max(0, px - 8), px + 8],
        description:
          `Mixed peak at base ${i + 1}: called ${callBase} ` +
          `but ${BASE_FROM_INDEX[secondIdx]} secondary at ${(ratio * 100).toFixed(0)}% intensity`,
        metadata: {
          calledBase: callBase, calledIntensity: callV,
          secondaryBase: BASE_FROM_INDEX[secondIdx], secondaryIntensity: secondV,
          ratio,
        },
      });
    }
  }
  return issues;
}


// ----------------------------------------------------------------------
// Detector: low-signal regions
// ----------------------------------------------------------------------
//
// Slide a window across the trace; flag windows where the maximum of all
// 4 channels stays below a noise-floor threshold. Indicates a region that
// should not be trusted regardless of basecall quality.

export function detectLowSignal(sample, opts = {}) {
  const windowBp = opts.windowBp ?? 30;
  const minSignal = opts.minSignal ?? 80;        // below this → low signal
  const trimRange = opts.trimRange;
  const { basecalls, peakLocations, traces } = sample;
  const issues = [];
  if (!basecalls || !peakLocations || !traces) return issues;
  const startIdx = trimRange ? trimRange[0] : 0;
  const endIdx = trimRange ? trimRange[1] : basecalls.length;
  let runStart = -1;
  let runMaxSignal = 0;
  for (let i = startIdx; i < endIdx; i++) {
    const px = peakLocations[i];
    if (px == null) continue;
    let maxV = 0;
    for (let b = 0; b < 4; b++) {
      const tr = traces[BASE_FROM_INDEX[b]];
      if (!tr) continue;
      const v = tr[px] ?? 0;
      if (v > maxV) maxV = v;
    }
    if (maxV < minSignal) {
      if (runStart < 0) { runStart = i; runMaxSignal = maxV; }
      else if (maxV > runMaxSignal) runMaxSignal = maxV;
    } else if (runStart >= 0) {
      if (i - runStart >= windowBp) {
        issues.push({
          type: "low_signal",
          severity: i - runStart >= windowBp * 2 ? "high" : "medium",
          positionBp: Math.floor((runStart + i) / 2),
          rangeBp: [runStart, i],
          traceX: peakLocations[Math.floor((runStart + i) / 2)] ?? 0,
          traceRange: [
            peakLocations[runStart] ?? 0,
            peakLocations[i - 1] ?? 0,
          ],
          description: `Low signal across ${i - runStart} bp (max channel ≤${runMaxSignal})`,
          metadata: { lengthBp: i - runStart, peakMax: runMaxSignal },
        });
      }
      runStart = -1; runMaxSignal = 0;
    }
  }
  // Tail run.
  if (runStart >= 0 && endIdx - runStart >= windowBp) {
    issues.push({
      type: "low_signal",
      severity: endIdx - runStart >= windowBp * 2 ? "high" : "medium",
      positionBp: Math.floor((runStart + endIdx) / 2),
      rangeBp: [runStart, endIdx],
      traceX: peakLocations[Math.floor((runStart + endIdx) / 2)] ?? 0,
      traceRange: [
        peakLocations[runStart] ?? 0,
        peakLocations[endIdx - 1] ?? 0,
      ],
      description: `Low signal across ${endIdx - runStart} bp (max channel ≤${runMaxSignal})`,
      metadata: { lengthBp: endIdx - runStart, peakMax: runMaxSignal },
    });
  }
  return issues;
}


// ----------------------------------------------------------------------
// Detector: quality dips inside the trim window
// ----------------------------------------------------------------------
//
// The Mott trim already cuts the bad ends. But mid-read Q dips indicate
// local trouble — possible mismatches, basecaller errors, or template
// damage. Flag contiguous spans of length ≥ minSpan where mean Q in a
// rolling window is ≥ qDrop below the trim-window mean.

export function detectQualityDips(sample, opts = {}) {
  const trimRange = opts.trimRange;
  const window = opts.window ?? 15;
  const qDrop = opts.qDrop ?? 12;
  const minSpan = opts.minSpan ?? 8;
  const { qScores, peakLocations } = sample;
  const issues = [];
  if (!qScores || !peakLocations) return issues;
  const startIdx = trimRange ? trimRange[0] : 0;
  const endIdx = trimRange ? trimRange[1] : qScores.length;
  if (endIdx - startIdx < window * 2) return issues;
  // Mean Q across the trim window.
  let sum = 0;
  for (let i = startIdx; i < endIdx; i++) sum += qScores[i];
  const meanQ = sum / (endIdx - startIdx);
  const dipThreshold = meanQ - qDrop;

  // Walk a rolling window; mark spans where rolling mean < dipThreshold.
  let runStart = -1;
  let runMin = Infinity;
  for (let i = startIdx + window; i < endIdx - window; i++) {
    let s = 0;
    for (let k = i - Math.floor(window / 2); k < i + Math.ceil(window / 2); k++) s += qScores[k];
    const localMean = s / window;
    if (localMean < dipThreshold) {
      if (runStart < 0) { runStart = i; runMin = localMean; }
      else if (localMean < runMin) runMin = localMean;
    } else if (runStart >= 0) {
      if (i - runStart >= minSpan) {
        const center = Math.floor((runStart + i) / 2);
        issues.push({
          type: "quality_dip",
          severity: meanQ - runMin >= qDrop * 2 ? "high" : "medium",
          positionBp: center,
          rangeBp: [runStart, i],
          traceX: peakLocations[center] ?? 0,
          traceRange: [peakLocations[runStart] ?? 0, peakLocations[i - 1] ?? 0],
          description:
            `Quality dip at bases ${runStart + 1}-${i}: ` +
            `local mean Q≈${runMin.toFixed(0)} (read mean ${meanQ.toFixed(0)})`,
          metadata: { meanQ, localMin: runMin, lengthBp: i - runStart },
        });
      }
      runStart = -1; runMin = Infinity;
    }
  }
  return issues;
}


// ----------------------------------------------------------------------
// Detector: high-N runs
// ----------------------------------------------------------------------
//
// Spans of basecalls with high N density. The basecaller couldn't decide
// → almost always a low-quality / mixed region.

export function detectNRuns(sample, opts = {}) {
  const minRunBp = opts.minRunBp ?? 5;
  const minDensity = opts.minDensity ?? 0.5;
  const window = opts.window ?? 12;
  const trimRange = opts.trimRange;
  const { basecalls, peakLocations } = sample;
  const issues = [];
  if (!basecalls || !peakLocations) return issues;
  const startIdx = trimRange ? trimRange[0] : 0;
  const endIdx = trimRange ? trimRange[1] : basecalls.length;
  if (endIdx - startIdx < window) return issues;
  // Count Ns in a rolling window; flag runs where density stays ≥ minDensity.
  let runStart = -1;
  let runMaxDensity = 0;
  for (let i = startIdx; i + window <= endIdx; i++) {
    let nCount = 0;
    for (let k = i; k < i + window; k++) if (basecalls[k] === "N") nCount++;
    const density = nCount / window;
    if (density >= minDensity) {
      if (runStart < 0) { runStart = i; runMaxDensity = density; }
      else if (density > runMaxDensity) runMaxDensity = density;
    } else if (runStart >= 0) {
      flushNRun(issues, runStart, i + window, runMaxDensity, basecalls, peakLocations, minRunBp);
      runStart = -1; runMaxDensity = 0;
    }
  }
  // Tail run that touches end-of-read.
  if (runStart >= 0) {
    flushNRun(issues, runStart, endIdx, runMaxDensity, basecalls, peakLocations, minRunBp);
  }
  return issues;
}

function flushNRun(issues, runStart, runEnd, density, basecalls, peakLocations, minRunBp) {
  if (runEnd - runStart < minRunBp) return;
  const clampedEnd = Math.min(runEnd, basecalls.length);
  const center = Math.floor((runStart + clampedEnd) / 2);
  issues.push({
    type: "n_run",
    severity: density >= 0.8 ? "high" : "medium",
    positionBp: center,
    rangeBp: [runStart, clampedEnd],
    traceX: peakLocations[center] ?? 0,
    traceRange: [
      peakLocations[runStart] ?? 0,
      peakLocations[Math.min(clampedEnd - 1, basecalls.length - 1)] ?? 0,
    ],
    description:
      `Ambiguous bases (${(density * 100).toFixed(0)}% N density across ${clampedEnd - runStart} bp)`,
    metadata: { density, lengthBp: clampedEnd - runStart },
  });
}


// ----------------------------------------------------------------------
// Orchestrator
// ----------------------------------------------------------------------
//
// Runs all detectors, returns a flat issue list sorted by severity then
// position. Caller can filter by type or severity for display.

const SEVERITY_RANK = { high: 0, medium: 1, low: 2 };

export function detectIssues(sample, opts = {}) {
  if (!sample || !sample.basecalls) return [];
  const issues = [
    ...detectMixedPeaks(sample, opts.mixedPeaks),
    ...detectLowSignal(sample, opts.lowSignal),
    ...detectQualityDips(sample, opts.qualityDips),
    ...detectNRuns(sample, opts.nRuns),
  ];
  issues.sort((a, b) => {
    const sa = SEVERITY_RANK[a.severity] ?? 3;
    const sb = SEVERITY_RANK[b.severity] ?? 3;
    if (sa !== sb) return sa - sb;
    return a.positionBp - b.positionBp;
  });
  return issues;
}


// Summary: counts by type + severity. Useful for the per-sample badge.
export function summarizeIssues(issues) {
  const out = { high: 0, medium: 0, low: 0, byType: {} };
  for (const iss of issues) {
    out[iss.severity] = (out[iss.severity] ?? 0) + 1;
    out.byType[iss.type] = (out.byType[iss.type] ?? 0) + 1;
  }
  out.total = issues.length;
  return out;
}
