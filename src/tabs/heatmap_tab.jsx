// src/tabs/heatmap_tab.jsx
// Issue #13 Phase C.4: HeatmapTab lifted out of FragmentViewer.jsx.
//
// Sample × species heatmap — 96-well-plate view. For each loaded sample,
// matches observed peaks to the union of (assembly products × dyes they
// carry) + (cut products for a picked gRNA at blunt + +4 sticky). Cell
// color is log10 of matched peak height; legend auto-scales to 5-95th
// percentile so outliers don't flatten the palette.

import { useState, useMemo, useRef } from "react";
import { ExportMenu } from "../components/export_menu.jsx";
import { resolveDyeColor, ASSEMBLY_PRODUCTS } from "../lib/constants.js";
import { LAB_GRNA_CATALOG, normalizeSpacer } from "../lib/grna_catalog.js";
import {
  reverseComplement, findGrnas, productSize, predictCutProducts,
} from "../lib/biology.js";
import { buildHeatmapMatrix, heatmapColor } from "../lib/analysis.js";
// DATA is the live per-sample peak store, mutated by drag-drop and initialized
// on mount. Imported live from the monolith so heatmap stays in sync with uploads.
import { DATA } from "../FragmentViewer.jsx";

export function HeatmapTab({ samples, componentSizes, constructSeq, targetStart, targetEnd, palette = "default" }) {
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
    // 5th-95th percentile so outliers don't flatten the palette.
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
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block">
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
