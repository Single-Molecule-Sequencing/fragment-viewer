// src/tabs/compare_tab.jsx
// Issue #13 Phase C.5: CompareTab lifted out of FragmentViewer.jsx.
//
// Cross-sample overlay on a single dye channel. User picks 2-8 samples,
// a dye, and a size window; the tab renders a Gaussian-model overlay plus
// a purity grid, optional species annotations, and a peak-species popover.

import { useState, useMemo, useRef } from "react";
import { ExportMenu } from "../components/export_menu.jsx";
import { LabInventoryBadge } from "../components/lab_inventory.jsx";
import {
  DYE, SAMPLE_DYES, resolveDyeColor,
} from "../lib/constants.js";
import { LAB_GRNA_CATALOG, normalizeSpacer } from "../lib/grna_catalog.js";
import { findGrnas } from "../lib/biology.js";
// Helpers still living in the monolith (pending future extraction).
// ESM live-binds these so circular import resolves at render-time.
import { buildGaussianPath } from "../lib/chromatogram.js";
import { ProductFragmentViz } from "../components/diagrams.jsx";
import { PeakSpeciesPopover } from "./peak_id_tab.jsx";
import { OverhangChart } from "./cut_prediction_tab.jsx";
import {
  DATA,
  SPECIES_DASH,
  enumerateAllSpeciesWithIds,
  expectedSpeciesForDye,
  speciesId,
  SpeciesLegend,
  SpeciesSidebar,
} from "../FragmentViewer.jsx";

export function CompareTab({ samples, cfg, results, componentSizes, constructSeq, targetStart, targetEnd }) {
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
