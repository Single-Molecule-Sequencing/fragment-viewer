// src/components/species.jsx
// Issue #16: molecular-species UI lifted out of FragmentViewer.jsx.
//
// SpeciesSchematic       — SVG cartoon of one species as a stacked bar.
// speciesSchematicProps  — convert an ASSEMBLY_PRODUCTS or expected-species
//                          entry into SpeciesSchematic props.
// SpeciesLegend          — collapsible key at the bottom of the plot.
// SpeciesSidebar         — full right-rail with toggle / schematic / color
//                          per species, used by TraceTab + CompareTab.
//
// All the pure species helpers these components consume (SPECIES_DASH,
// COMPONENT_INFO, expectedSpeciesForDye, enumerateAllSpeciesWithIds) now
// live in src/lib/species.js.

import { useState, useMemo } from "react";
import { Panel, Pill, ToolButton, DyeChip } from "./primitives.jsx";
import {
  DYE, DYE_HEX, CONSTRUCT, ASSEMBLY_PRODUCTS, resolveDyeColor,
} from "../lib/constants.js";
import { productSize } from "../lib/biology.js";
import {
  COMPONENT_INFO, SPECIES_DASH, TARGET_REACTANTS,
  predictCutFromReactant, expectedSpeciesForDye,
  speciesId, enumerateAllSpeciesWithIds,
} from "../lib/species.js";

// DYE_HEX kept as a thin alias for the default palette so legacy call
// sites in the DyePaletteSwatch etc. don't break. For new code, call
// resolveDyeColor(d, palette) directly. (Issue #3 fix)

export function SpeciesSchematic({
  parts, leftDyes = [], rightDyes = [], width = 220, height = 28,
  scaleToFull = true, showCut = null,
  cutFragment = null,    // null | "LEFT" | "RIGHT" — when set, dim the discarded side and hide its dye dots
}) {
  // Total bp of THIS species; reference total = full construct (226 bp by default).
  const speciesBp = parts.reduce((t, k) => t + (COMPONENT_INFO[k]?.size || 0), 0);
  const fullBp = CONSTRUCT.total;
  const denom = scaleToFull ? fullBp : speciesBp;
  const innerW = width - 28;
  const startX = 14;
  const usedW = (speciesBp / denom) * innerW;
  const barX0 = startX + (innerW - usedW) / (scaleToFull ? 2 : 1);
  let x = barX0;
  const segs = parts.map((k, i) => {
    const info = COMPONENT_INFO[k] || { color: "#a1a1aa", size: 0, name: k };
    const w = (info.size / denom) * innerW;
    const rect = (
      <rect key={`${k}-${i}`} x={x} y={9} width={w} height={10} fill={info.color}>
        <title>{info.name} · {info.size} bp</title>
      </rect>
    );
    const segX = x;
    x += w;
    return { rect, x0: segX, x1: x, key: k };
  });
  // Cut position in SVG coords (if showCut)
  let cutX = null;
  let cutMarker = null;
  if (showCut && typeof showCut.bp === "number" && parts.length) {
    const constructStartBp = parts.includes("ad1") ? 1 : (parts.includes("oh1") ? 26 : (parts[0] === "target" ? 55 : 1));
    const inSpeciesBp = showCut.bp - constructStartBp + 1;
    if (inSpeciesBp >= 0 && inSpeciesBp <= speciesBp) {
      cutX = barX0 + (inSpeciesBp / denom) * innerW;
      cutMarker = (
        <g pointerEvents="none">
          <line x1={cutX} x2={cutX} y1={5} y2={23} stroke="#0f172a" strokeWidth="1.4" />
          <text x={cutX} y={4} fontSize="9" textAnchor="middle" fill="#0f172a">✂</text>
        </g>
      );
    }
  }
  // Determine which dye dots to render (when cutFragment is set, only show the
  // dot on the kept terminus).
  const showLeftDyes  = !cutFragment || cutFragment === "LEFT";
  const showRightDyes = !cutFragment || cutFragment === "RIGHT";
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-label="species schematic">
      <line x1={startX} x2={startX + innerW} y1={14} y2={14} stroke="#e4e4e7" strokeWidth="0.5" />
      {segs.map(s => s.rect)}
      {/* Dim the discarded side when this is a fragment view */}
      {cutFragment === "LEFT" && cutX !== null && (
        <rect x={cutX} y={8} width={(barX0 + usedW) - cutX} height={12} fill="white" opacity="0.72" pointerEvents="none" />
      )}
      {cutFragment === "RIGHT" && cutX !== null && (
        <rect x={barX0} y={8} width={cutX - barX0} height={12} fill="white" opacity="0.72" pointerEvents="none" />
      )}
      {cutMarker}
      {showLeftDyes && leftDyes.map((d, i) => (
        <circle key={`L-${d}`} cx={6} cy={5 + i * 10} r={4} fill={DYE_HEX[d]} stroke="white" strokeWidth="1.2">
          <title>{d} dye on LEFT terminus</title>
        </circle>
      ))}
      {showRightDyes && rightDyes.map((d, i) => (
        <circle key={`R-${d}`} cx={width - 6} cy={5 + i * 10} r={4} fill={DYE_HEX[d]} stroke="white" strokeWidth="1.2">
          <title>{d} dye on RIGHT terminus</title>
        </circle>
      ))}
    </svg>
  );
}

// Convenience: derive (parts, leftDyes, rightDyes) from an ASSEMBLY_PRODUCTS or
// TARGET_REACTANTS entry. Both shapes carry .parts (or .components) and .dyes.
export function speciesSchematicProps(entry) {
  const parts = entry.parts || entry.components || [];
  const allDyes = entry.dyes || [...(entry.left_dyes || []), ...(entry.right_dyes || [])];
  const leftDyes = entry.left_dyes !== undefined
    ? entry.left_dyes
    : (parts.includes("ad1") ? allDyes.filter(d => d === "B" || d === "Y") : []);
  const rightDyes = entry.right_dyes !== undefined
    ? entry.right_dyes
    : (parts.includes("ad2") ? allDyes.filter(d => d === "G" || d === "R") : []);
  return { parts, leftDyes, rightDyes };
}

// ----------------------------------------------------------------------
// SpeciesLegend — a panel listing every static species the assay can
// produce (assembly products + adapter monomers) with a thumbnail
// schematic, name, bp, dye topology. Dynamic Cas9 cut products are NOT
// listed (they depend on the selected gRNA + chemistry); they are
// surfaced via the species overlay and the hover popover instead.
// ----------------------------------------------------------------------
export function SpeciesLegend({ componentSizes, defaultOpen = false, gRNAs = [], overhangs = [0, 4], constructSize = 226 }) {
  const [open, setOpen] = useState(defaultOpen);
  // Adapter monomers as pseudo-species
  const monomers = [
    { id: "ad1_top_25",  name: "Ad1 top oligo (TAMRA, unligated)", parts: ["ad1"],            left_dyes: ["Y"], right_dyes: [], size: 25 },
    { id: "ad1_bot_29",  name: "Ad1 bot oligo (6-FAM, unligated)", parts: ["ad1", "oh1"],     left_dyes: ["B"], right_dyes: [], size: 29 },
    { id: "ad2_bot_25",  name: "Ad2 bot oligo (HEX, unligated)",   parts: ["ad2"],            left_dyes: [],     right_dyes: ["G"], size: 25 },
    { id: "ad2_top_29",  name: "Ad2 top oligo (ROX, unligated)",   parts: ["oh2", "ad2"],     left_dyes: [],     right_dyes: ["R"], size: 29 },
  ];
  const sizes = componentSizes || (() => {
    const m = {}; for (const c of CONSTRUCT.components) m[c.key] = c.size; return m;
  })();
  const productSizeOf = entry => entry.size || (entry.parts || []).reduce((t, k) => t + (sizes[k] || 0), 0);
  // Build cut entries when a gRNA is supplied. Dedup so each unique
  // (reactant, fragment, overhang) appears once with all dyes that carry it.
  const cutRows = useMemo(() => {
    if (!gRNAs.length) return [];
    const out = [];
    const seen = new Map();
    let counter = 0;
    for (const g of gRNAs) {
      for (const oh of overhangs) {
        for (const reactant of TARGET_REACTANTS) {
          const products = predictCutFromReactant(g, reactant, oh);
          if (!products) continue;
          for (const dye of Object.keys(products)) {
            const p = products[dye];
            const key = `${reactant.id}:${p.fragment}:${oh}`;
            if (seen.has(key)) {
              seen.get(key).dyes.push(dye);
              seen.get(key).products.push({ dye, ...p });
              continue;
            }
            counter++;
            const row = {
              displayId: `C${counter}`,
              reactant, fragment: p.fragment, overhang_nt: oh,
              dyes: [dye], products: [{ dye, ...p }],
              cut_bp: g.cut_construct,
              gname: g.name || `cand-${g.id}`,
              key,
            };
            seen.set(key, row);
            out.push(row);
          }
        }
      }
    }
    return out;
  }, [gRNAs, overhangs]);
  return (
    <Panel
      title="Molecular species legend"
      subtitle="Every species the assay can produce, color-keyed to the construct components. Hover any thumbnail for component sizes; dye dots are color-keyed (B blue, Y gold, G green, R red)."
      className="mb-3"
      actions={
        <ToolButton variant="ghost" onClick={() => setOpen(o => !o)} icon={open ? Layers : Layers}>
          {open ? "Hide" : "Show"}
        </ToolButton>
      }
    >
      {open && (
        <div className="space-y-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">Component color key</div>
            <div className="flex flex-wrap gap-2 text-xs">
              {CONSTRUCT.components.map(c => (
                <span key={c.key} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-zinc-200 bg-white">
                  <span className="inline-block w-3 h-3 rounded" style={{ background: c.color }} />
                  <span className="text-zinc-700">{c.name}</span>
                  <span className="font-mono text-zinc-500">· {c.size} bp</span>
                </span>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">Assembly + partial-ligation species</div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-1.5">
              {ASSEMBLY_PRODUCTS.map(p => {
                const props = speciesSchematicProps(p);
                return (
                  <div key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded border border-zinc-100 bg-zinc-50/60">
                    <SpeciesSchematic {...props} width={180} height={26} />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-zinc-800 truncate">{p.name}</div>
                      <div className="text-[10px] text-zinc-500 font-mono">{productSizeOf(p)} bp · dyes: {(p.dyes || []).join(" ") || "—"}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">Adapter monomers (pre-ligation)</div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-1.5">
              {monomers.map(p => {
                const props = speciesSchematicProps(p);
                return (
                  <div key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded border border-zinc-100 bg-zinc-50/60">
                    <SpeciesSchematic {...props} width={180} height={26} />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-zinc-800 truncate">{p.name}</div>
                      <div className="text-[10px] text-zinc-500 font-mono">{p.size} nt</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {cutRows.length > 0 ? (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
                Cas9 cut products ({cutRows.length})
                <span className="ml-2 normal-case font-normal text-zinc-400">— dynamic, depend on selected gRNA + chemistry</span>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-1.5">
                {cutRows.map(row => {
                  const sprops = speciesSchematicProps(row.reactant);
                  // Filter the dye dots to only the ones this fragment side carries
                  const onLeft = row.fragment === "LEFT";
                  const filteredLeft  = onLeft  ? sprops.leftDyes.filter(d => row.dyes.includes(d))  : [];
                  const filteredRight = !onLeft ? sprops.rightDyes.filter(d => row.dyes.includes(d)) : [];
                  return (
                    <div key={row.key} className="flex items-center gap-2 px-2 py-1.5 rounded border border-sky-100 bg-sky-50/40">
                      <span className="inline-flex items-center justify-center min-w-[26px] px-1 py-0.5 rounded bg-sky-600 text-white font-mono font-bold text-[10px]">
                        {row.displayId}
                      </span>
                      <SpeciesSchematic
                        parts={sprops.parts}
                        leftDyes={filteredLeft}
                        rightDyes={filteredRight}
                        showCut={{ bp: row.cut_bp }}
                        cutFragment={row.fragment}
                        width={180} height={26}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-zinc-800 truncate">
                          {row.gname} {row.fragment} cut from {row.reactant.name.split(" (")[0]}
                        </div>
                        <div className="text-[10px] text-zinc-500 font-mono">
                          {row.products[0].length}
                          {row.products.length > 1 && row.products.some(p => p.length !== row.products[0].length)
                            ? ` / ${row.products.filter(p => p.length !== row.products[0].length).map(p => `${p.length}(${p.dye})`).join(",")}`
                            : ""} nt · dyes {row.dyes.join(" ")} · {row.overhang_nt === 0 ? "blunt" : (row.overhang_nt > 0 ? `+${row.overhang_nt}nt 5'OH` : `${row.overhang_nt}nt 3'OH`)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-zinc-500 leading-snug border-t border-zinc-100 pt-2">
              Cas9 <strong>cut products</strong> are dynamic (they depend on the chosen gRNA and chemistry). Toggle <strong>Expected species</strong> in the plot controls and pick a gRNA to see them here.
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

// ----------------------------------------------------------------------
// SpeciesSidebar — right-rail legend listing every species the active
// plot could show (assembly + monomer + cut), with per-species visibility
// toggles. Each row shows: checkbox, schematic thumbnail, size, name,
// dye chips, and a line sample matching the on-plot annotation (lane
// dye color + kind dash pattern). Dye is color-keyed; kind is pattern-
// keyed via SPECIES_DASH. The hostingPlot can be:
//   "trace"    -> shows species on every dye lane in TraceTab
//   "compare"  -> shows species on the single selected dye in CompareTab
// ----------------------------------------------------------------------
export function SpeciesSidebar({
  componentSizes, constructSize, gRNAs, overhangs,
  dyes,                      // dye letters this plot covers (e.g. ["B","G","Y","R"] or ["R"])
  hiddenIds, onToggleId,     // Set of species ids to HIDE; toggling adds/removes
  onShowAll, onHideAll,
  title = "Species legend",
  subtitle = "Tick to overlay; untick to hide. Color = lane dye; pattern = kind (assembly = short dash, monomer = dotted, cut = long dash).",
}) {
  const groups = useMemo(() => {
    const all = enumerateAllSpeciesWithIds({ componentSizes, constructSize, gRNAs, overhangs, dyes });
    const seen = new Set();
    const assembly = [], monomer = [], cuts = [];
    for (const sp of all) {
      const id = speciesId(sp, sp.dye);
      if (seen.has(id)) continue;
      seen.add(id);
      const row = { ...sp, id };  // sp already has dye, lineColor, displayId
      row.dyeColor = sp.lineColor;
      if (sp.kind === "assembly") assembly.push(row);
      else if (sp.kind === "monomer") monomer.push(row);
      else if (sp.kind === "cut") cuts.push(row);
    }
    return { assembly, monomer, cuts };
  }, [dyes, componentSizes, constructSize, gRNAs, overhangs]);

  const total = groups.assembly.length + groups.monomer.length + groups.cuts.length;
  const hiddenCount = (() => {
    let n = 0;
    [...groups.assembly, ...groups.monomer, ...groups.cuts].forEach(r => { if (hiddenIds.has(r.id)) n++; });
    return n;
  })();

  const renderRow = (row) => {
    const visible = !hiddenIds.has(row.id);
    // Build schematic from the species kind + (for cuts) source reactant
    let sprops = { parts: [], leftDyes: [], rightDyes: [] };
    let cutMark = null;
    let cutFrag = null;
    if (row.kind === "cut" && row.source_reactant) {
      const reactant = TARGET_REACTANTS.find(r => r.id === row.source_reactant);
      if (reactant) {
        // For a cut species the schematic shows the parent reactant with the
        // discarded fragment side dimmed and only the kept terminus's dye dot
        // visible. fragment ("LEFT"/"RIGHT") + grna_cut_bp tell us which side.
        sprops = speciesSchematicProps(reactant);
        // Filter dyes to only the one this species carries (the other terminal
        // dye on the same fragment side may belong to a different species row).
        if (row.fragment === "LEFT") {
          sprops = { ...sprops, leftDyes: sprops.leftDyes.filter(d => d === row.dye), rightDyes: [] };
        } else if (row.fragment === "RIGHT") {
          sprops = { ...sprops, leftDyes: [], rightDyes: sprops.rightDyes.filter(d => d === row.dye) };
        }
        cutMark = row.grna_cut_bp ? { bp: row.grna_cut_bp } : null;
        cutFrag = row.fragment || null;
      }
    } else if (row.kind === "assembly") {
      const a = ASSEMBLY_PRODUCTS.find(ap => ap.dyes.includes(row.dye) && Math.abs(productSize(ap, componentSizes) - row.size) < 1);
      if (a) {
        sprops = speciesSchematicProps(a);
        // Restrict to the lane's dye on the relevant terminus
        if (sprops.leftDyes.includes(row.dye)) sprops = { ...sprops, leftDyes: [row.dye], rightDyes: sprops.rightDyes.filter(d => false) };
        else if (sprops.rightDyes.includes(row.dye)) sprops = { ...sprops, leftDyes: [], rightDyes: [row.dye] };
      }
    } else if (row.kind === "monomer") {
      if (row.dye === "Y" && row.size === 25) sprops = { parts: ["ad1"], leftDyes: ["Y"], rightDyes: [] };
      else if (row.dye === "B" && row.size === 29) sprops = { parts: ["ad1","oh1"], leftDyes: ["B"], rightDyes: [] };
      else if (row.dye === "G" && row.size === 25) sprops = { parts: ["ad2"], leftDyes: [], rightDyes: ["G"] };
      else if (row.dye === "R" && row.size === 29) sprops = { parts: ["oh2","ad2"], leftDyes: [], rightDyes: ["R"] };
    }
    return (
      <li key={row.id} className={`flex items-start gap-2 px-2 py-1.5 rounded transition ${visible ? "bg-white" : "bg-zinc-50 opacity-60"} hover:bg-zinc-100`}>
        <input
          type="checkbox" checked={visible}
          onChange={() => onToggleId(row.id)}
          className="mt-1 w-3.5 h-3.5 accent-zinc-700 cursor-pointer"
          aria-label={`Toggle ${row.label}`}
        />
        <div className="shrink-0 mt-0.5">
          <SpeciesSchematic
            parts={sprops.parts} leftDyes={sprops.leftDyes} rightDyes={sprops.rightDyes}
            width={120} height={22}
            showCut={cutMark} cutFragment={cutFrag}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[11px]">
            {row.displayId && (
              <span className="inline-flex items-center justify-center min-w-[22px] px-1 py-0.5 rounded font-mono font-bold text-[10px] text-white"
                    style={{ background: row.dyeColor }}>
                {row.displayId}
              </span>
            )}
            <span className="font-mono text-zinc-800">{row.size} bp</span>
            <DyeChip dye={row.dye} />
          </div>
          <div className="text-[10px] text-zinc-600 leading-tight" title={row.fullLabel || row.label}>
            {row.label}
          </div>
        </div>
        <svg width="22" height="14" aria-hidden className="shrink-0 mt-1">
          <line x1="0" y1="7" x2="22" y2="7" stroke={row.dyeColor} strokeWidth="1.6" strokeDasharray={SPECIES_DASH[row.kind] || "1 2"} />
        </svg>
      </li>
    );
  };

  return (
    <Panel
      title={title}
      subtitle={subtitle}
      className="lg:sticky lg:top-2 self-start"
      actions={
        <>
          <ToolButton variant="ghost" onClick={onShowAll} title="Show every species">
            Show all
          </ToolButton>
          <ToolButton variant="ghost" onClick={onHideAll} title="Hide every species">
            Hide all
          </ToolButton>
        </>
      }
    >
      <div className="text-[10px] text-zinc-500 mb-2 font-mono">
        {total - hiddenCount}/{total} visible
      </div>
      {groups.assembly.length > 0 && (
        <details open className="mb-2">
          <summary className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1 cursor-pointer">
            Assembly + partial ligation ({groups.assembly.length})
          </summary>
          <ul className="flex flex-col gap-0.5">{groups.assembly.map(renderRow)}</ul>
        </details>
      )}
      {groups.monomer.length > 0 && (
        <details open className="mb-2">
          <summary className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1 cursor-pointer">
            Adapter monomers ({groups.monomer.length})
          </summary>
          <ul className="flex flex-col gap-0.5">{groups.monomer.map(renderRow)}</ul>
        </details>
      )}
      {groups.cuts.length > 0 && (
        <details open className="mb-1">
          <summary className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1 cursor-pointer">
            Cas9 cut products ({groups.cuts.length})
          </summary>
          <ul className="flex flex-col gap-0.5">{groups.cuts.map(renderRow)}</ul>
        </details>
      )}
      {total === 0 && (
        <div className="text-xs text-zinc-500">No expected species for the current dye(s) and gRNA selection.</div>
      )}
    </Panel>
  );
}
