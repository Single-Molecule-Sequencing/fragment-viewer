// src/tabs/peak_id_tab.jsx
// Issue #13 Phase C.5: PeakIdTab + its helpers lifted out of FragmentViewer.jsx.
//
// Expected-vs-observed peak matcher. For each sample, the user picks a dye,
// sets a tolerance, and the tab calls identifyPeaks() to produce a per-peak
// classification table. SampleConfigRow renders the collapsible per-sample
// row; VisibleWindowCard + SampleSummaryCard + OverhangBadge are small UI
// helpers used inside the row. PeakSpeciesPopover is the anchored bubble
// that renders when the user clicks a peak in the TraceTab electropherogram
// — shared with the trace view via ../FragmentViewer.jsx re-export.

import { useState, useMemo, useRef, useEffect } from "react";
import { ChevronRight } from "lucide-react";
import { ExportMenu } from "../components/export_menu.jsx";
import { Panel, Pill, Stat, Field, DyeChip, ToolButton } from "../components/primitives.jsx";
import { LabInventoryBadge } from "../components/lab_inventory.jsx";
import { DYE, DYE_ORDER, CONSTRUCT, ASSEMBLY_PRODUCTS, SAMPLE_DYES, CHEMISTRY_PRESETS, resolveDyeColor } from "../lib/constants.js";
import { LAB_GRNA_CATALOG, matchLabCatalog, normalizeSpacer } from "../lib/grna_catalog.js";
import { productSize, findGrnas, predictCutProducts } from "../lib/biology.js";
import { AssemblyProductsCard } from "../components/diagrams.jsx";
import {
  DATA,
  classifyPeak,
  dominantPeak,
  identifyPeaks,
  computeAutoDefaults,
  fmtBp, fmtInt,
  expectedSpeciesForDye,
  speciesAtSize,
  speciesId,
  speciesSchematicProps,
  SpeciesSchematic,
  SPECIES_DASH,
} from "../FragmentViewer.jsx";

export function PeakSpeciesPopover({ hover, componentSizes, constructSize, gRNAs, overhangs, tol = 2.5, onClose }) {
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

// formatTick / computeLinearTicks live in the monolith — TraceTab uses them too.
// They were adjacent in the source range and got sucked in here; removed so
// we don't shadow the monolith defs or drift on axis-tick logic.

// ======================================================================
// Per-sample summary card on trace tab
// ======================================================================
export function SampleSummaryCard({ sample, cfg, setCfg, results }) {
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
export function VisibleWindowCard({ peaksByChannel, results, cfg }) {
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
export function PeakIdTab({ samples, cfg, setCfg, results, componentSizes, setCSize }) {
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

