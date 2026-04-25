// src/lib/abif.js — ABIF (.fsa / .ab1) parser + LIZ calibration + peak caller.
//
// Extracted from FragmentViewer.jsx per issue #13. Browser-side pure JS
// (DataView, TextDecoder) — no React, no node APIs beyond ArrayBuffer.
// parseGenemapperTSV handles the tab-delimited GeneMapper export path;
// parseFsaArrayBuffer is the canonical entry point for in-browser .fsa
// ingestion that flows into DATA.peaks + DATA.traces.


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
        // Single byte → scalar; multi-byte → Uint8Array (e.g., PCON Q-scores).
        if (numElements <= 1) {
          value = view.getUint8(offset);
        } else {
          value = new Uint8Array(arrayBuffer, offset, numElements);
        }
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
// Sanger ABIF (.ab1) ingestion
// ----------------------------------------------------------------------
//
// Sanger reads carry a different tag set than CE fragment-analysis runs:
//   PBAS1   — basecall string (one ASCII char per call: A/C/G/T/N)
//   PCON1   — Phred-style per-base quality scores (Uint8Array, one per base)
//   PLOC1/2 — basecall locations (data-point index per base; Int16 array)
//   DATA9   — analyzed channel for the base assigned the dye index 1 (G usually)
//   DATA10  — channel 2 (A usually)
//   DATA11  — channel 3 (T usually)
//   DATA12  — channel 4 (C usually)
//   DyeN1..N4 — dye chemistry name strings
//   FWO_1   — base order ("ACGT" or "GATC" etc.) — maps DATA9..12 → A/C/G/T
//
// The Sanger trace channels overlap raw DATA1..4 (the same instrument), but
// DATA9..12 are the *analyzed* (basecaller-input) traces that align with PLOC.
// We expose both the raw 4-channel traces and basecalls + Q-scores so the
// viewer can render a chromatogram aligned with basecall labels.

export function parseSangerAbif(arrayBuffer, fileName = "sample") {
  const { entries, version } = parseAbifBuffer(arrayBuffer);
  const get = (k) => entries[k]?.value;

  const basecalls = (get("PBAS1") || "").toUpperCase();
  const qRaw = get("PCON1");
  const qScores = qRaw instanceof Uint8Array
    ? Array.from(qRaw)
    : (typeof qRaw === "number" ? [qRaw] : []);
  const peakLocsRaw = get("PLOC2") || get("PLOC1") || [];
  const peakLocations = Array.isArray(peakLocsRaw) ? peakLocsRaw.slice() : [];

  // Base order. Default ACGT if missing.
  const fwoStr = get("FWO_1") || "ACGT";
  const baseOrder = fwoStr.slice(0, 4).toUpperCase().split("");

  // Map analyzed-trace channels (DATA9..12) onto A/C/G/T via baseOrder.
  const traces = { A: null, C: null, G: null, T: null };
  for (let i = 0; i < 4; i++) {
    const t = get(`DATA${9 + i}`);
    const base = baseOrder[i];
    if (t && (base === "A" || base === "C" || base === "G" || base === "T")) {
      traces[base] = t;
    }
  }

  // Length sanity: aligned channels should all match.
  const traceLength = traces.A?.length || traces.C?.length
    || traces.G?.length || traces.T?.length || 0;

  const stem = fileName.replace(/\.[Aa][Bb]1$/, "").replace(/\.[Ff][Ss][Aa]$/, "")
    .replace(/^.*[\\/]/, "");

  const meta = {
    abifVersion: version,
    instrument_model: get("MODL1") || "",
    dye_chemistry: [1, 2, 3, 4, 5].map(i => get(`DyeN${i}`) || "").filter(Boolean),
    well: get("TUBE1") || "",
    container_id: get("CTNM1") || "",
    base_order: fwoStr,
    n_basecalls: basecalls.length,
    n_quality_scores: qScores.length,
    trace_length: traceLength,
  };

  return {
    sampleName: stem,
    basecalls,
    qScores,
    peakLocations,
    traces,
    baseOrder,
    meta,
  };
}
