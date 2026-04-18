// src/tabs/cut_prediction_tab.jsx
// Issue #13 Phase C.5: CutPredictionTab + OverhangChart lifted out of
// FragmentViewer.jsx.
//
// Enumerates Cas9 gRNA candidates in the target window, picks one, renders
// its predicted ssDNA cut products on a construct diagram + 4-channel
// overhang chart, with lab-inventory cross-check via LabInventoryBadge.

import { useState, useMemo } from "react";
import { ExportMenu } from "../components/export_menu.jsx";
import { LabInventoryBadge, LabInventoryPanel } from "../components/lab_inventory.jsx";
import { Panel, Pill, ToolButton, DyeChip, Field } from "../components/primitives.jsx";
import { DYE, SAMPLE_DYES, CONSTRUCT, resolveDyeColor } from "../lib/constants.js";
import {
  findGrnas, predictCutProducts, reverseComplement, productSize,
} from "../lib/biology.js";
import {
  ConstructDiagram,
  ProductFragmentViz,
  TargetSequenceView,
  buildGaussianPath,
  DATA,
} from "../FragmentViewer.jsx";

export function CutPredictionTab({ samples, cfg, setCfg, results }) {
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

export function OverhangChart({ samples, results }) {
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
