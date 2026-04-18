// src/tabs/auto_classify_tab.jsx
// Issue #13 Phase C.5: AutoClassifyTab + DyeClusterCard + ClusterRow +
// CrossDyeSummary lifted out of FragmentViewer.jsx.
//
// Cluster-and-identify peaks across all dyes against the expected species
// map (derived from ASSEMBLY_PRODUCTS × dye pairings). Surfaces per-cluster
// diagnostics so the user can see what each observed peak most likely IS.

import { useState, useRef, useEffect, useMemo } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { ExportMenu } from "../components/export_menu.jsx";
import { Panel, DyeChip, ToolButton, Field, Pill } from "../components/primitives.jsx";
import {
  ASSEMBLY_PRODUCTS, CONSTRUCT, resolveDyeColor,
} from "../lib/constants.js";
import { LAB_GRNA_CATALOG } from "../lib/grna_catalog.js";
import { productSize } from "../lib/biology.js";
// Helpers still in monolith (pending extraction). Circular import works
// because these are only touched inside function bodies at render time.
import {
  DATA,
  classifyPeak,
  dominantPeak,
  identifyPeaks,
  computeAutoDefaults,
  expectedSpeciesForDye,
  SPECIES_DASH,
  ConstructDiagram,
} from "../FragmentViewer.jsx";

// ======================================================================
export function AutoClassifyTab({ samples, componentSizes, dyeOffsets, setDyeOffsets, setDyeOffset, constructSeq, setConstructSeq, targetStart, setTargetStart, targetEnd, setTargetEnd }) {
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
    // Issue #9 fix: options-object call form. Order-independent and less
    // error-prone than the 13-positional legacy form (which still works).
    return classifyPeaks({
      sampleData,
      constructSeq, targetStart, targetEnd, constructSize,
      componentSizes,
      assemblyProducts: ASSEMBLY_PRODUCTS,
      grnaCatalog: LAB_GRNA_CATALOG,
      dyeOffsets,
      heightThreshold, matchTol, clusterTol,
      overhangsToConsider: overhangs,
    });
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
