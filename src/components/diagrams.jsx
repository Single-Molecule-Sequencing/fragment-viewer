// src/components/diagrams.jsx
// Issue #13 Phase C.7: DNA architecture + cut-product diagrams lifted out of
// FragmentViewer.jsx.
//
//   - ProductFragmentViz      — 4 ssDNA cut products, one row per dye,
//                              with length annotations + template / PAM flags.
//   - ConstructDiagram        — the full construct as a horizontal stacked
//                              bar with optional cut-site marker and PAM tag.
//   - AssemblyProductsCard    — editable per-component size + apply button.
//   - TargetSequenceView      — sequence viewer with NGG/CCN highlighting.

import { useState, useMemo, useRef } from "react";
import { Panel, ToolButton, DyeChip, Pill } from "./primitives.jsx";
import { ExportMenu } from "./export_menu.jsx";
import { DYE, CONSTRUCT, ASSEMBLY_PRODUCTS, resolveDyeColor } from "../lib/constants.js";
import { productSize } from "../lib/biology.js";
import { mergeRefs } from "../lib/export.js";

export function ProductFragmentViz({ products, constructSize, svgRef: externalSvgRef }) {
  const fragRef = useRef(null);
  const combinedRef = useMemo(() => mergeRefs(fragRef, externalSvgRef), [externalSvgRef]);
  if (!products) return null;

  // Layout zones with strict left/right reserved columns for labels so the
  // bar region never overlaps annotation text. Row heights are generous to
  // give each lane a readable (dye name + strand) two-line label plus
  // room for a "LEFT fragment" subtitle below each bar.
  const W = 1100;
  const m = { l: 160, r: 230, t: 46, b: 24 };
  const pw = W - m.l - m.r;
  const rowH = 64;
  const barH = 18;
  const lanes = [
    { dye: "Y", row: 0 },
    { dye: "B", row: 1 },
    { dye: "R", row: 2 },
    { dye: "G", row: 3 },
  ];
  const H = m.t + lanes.length * rowH + m.b;

  const xForBp = (bp) => m.l + (bp / Math.max(1, constructSize)) * pw;

  return (
    <div>
      {/* Export in its own header row above the figure — matches
          ConstructDiagram / EndStructureEditor / PostTailingPanel (gh#18+#19). */}
      <div className="flex items-center justify-end mb-1.5 no-print">
        <ExportMenu svgRef={fragRef} basename="ssdna_products" label="Export" />
      </div>
      <svg ref={combinedRef} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" style={{ background: "white" }}>
        <rect x="0" y="0" width={W} height={H} fill="white" />

        {/* Title + subtitle */}
        <text x={m.l + pw / 2} y="18" fontSize="13" fill="#0f172a" textAnchor="middle" fontWeight="700">
          Cas9 ssDNA cut products after denaturation
        </text>
        <text x={m.l + pw / 2} y="32" fontSize="10" fill="#64748b" textAnchor="middle">
          Four fluorophore-labeled single strands, scaled to the {constructSize} bp construct
        </text>

        {/* Column-header row for the left/right annotation regions */}
        <text x={m.l - 12} y="40" fontSize="9" fill="#94a3b8" textAnchor="end" fontWeight="600"
              style={{ letterSpacing: "0.06em" }}>CHANNEL · STRAND</text>
        <text x={m.l + pw + 12} y="40" fontSize="9" fill="#94a3b8" textAnchor="start" fontWeight="600"
              style={{ letterSpacing: "0.06em" }}>TEMPLATE · PAM-SIDE · LENGTH</text>

        {/* Construct scale ticks at every 50 bp, plus at 0 and constructSize */}
        <line x1={m.l} x2={m.l + pw} y1={m.t - 6} y2={m.t - 6} stroke="#cbd5e1" strokeWidth="1" />
        {Array.from({ length: Math.floor(constructSize / 50) + 1 }, (_, i) => i * 50)
          .concat([constructSize])
          .filter((v, i, a) => a.indexOf(v) === i && v <= constructSize)
          .map(v => {
            const x = xForBp(v);
            return (
              <g key={`sc-${v}`}>
                <line x1={x} x2={x} y1={m.t - 9} y2={m.t - 3} stroke="#94a3b8" strokeWidth="1" />
                <text x={x} y={m.t - 12} fontSize="9" fill="#64748b" textAnchor="middle"
                      style={{ fontFamily: "JetBrains Mono, monospace" }}>{v}</text>
              </g>
            );
          })}

        {lanes.map(({ dye, row }) => {
          const p = products[dye];
          const yRow = m.t + row * rowH;
          const yBar = yRow + 14;
          const fragStart = p.fragment === "LEFT" ? 0 : constructSize - p.length;
          const x1 = xForBp(fragStart);
          const x2 = xForBp(fragStart + p.length);
          const barW = Math.max(2, x2 - x1);
          const dyeColor = DYE[dye].color;

          // Dye marker sidedness: per construct geometry, Y + B mark the LEFT
          // end of their fragments; R + G mark the RIGHT end. For a LEFT
          // product, "left end" = x1; for a RIGHT product, "left end" = x1.
          // So dyeOnLeft → dyeX = x1; else dyeX = x2.
          const dyeOnLeft = (dye === "Y" || dye === "B");
          const dyeX = dyeOnLeft ? x1 : x2;

          // Length label: inside the bar if it fits (barW > 55), else outside
          // on the opposite end from the dye circle.
          const labelInside = barW > 55;
          const labelX = labelInside
            ? (x1 + x2) / 2
            : (dyeOnLeft ? x2 + 8 : x1 - 8);
          const labelAnchor = labelInside ? "middle" : (dyeOnLeft ? "start" : "end");
          const labelFill = labelInside ? "white" : "#0f172a";

          return (
            <g key={dye}>
              {/* LEFT ANNOTATION COLUMN — dye name + strand */}
              <g>
                <rect x={m.l - 150} y={yRow + 6} width="16" height="28" rx="3" fill={dyeColor} />
                <text x={m.l - 130} y={yRow + 20} fontSize="12" fill="#0f172a"
                      textAnchor="start" fontWeight="700">{DYE[dye].name}</text>
                <text x={m.l - 130} y={yRow + 34} fontSize="9" fill="#64748b" textAnchor="start"
                      style={{ fontFamily: "JetBrains Mono, monospace" }}>
                  {p.strand}-strand
                </text>
              </g>

              {/* Bar + direction arrow */}
              <rect x={x1} y={yBar} width={barW} height={barH}
                    fill={dyeColor} opacity="0.88" rx="3" />
              {/* Direction chevron pointing 5' → 3' from the dye end toward
                  the opposite end. Rendered INSIDE the bar only when the bar
                  is wide enough (> 30 px) to avoid cutting off the chevron. */}
              {barW > 30 && (dyeOnLeft ? (
                <polygon
                  points={`${x1 + 5},${yBar + 4} ${x1 + 11},${yBar + barH / 2} ${x1 + 5},${yBar + barH - 4}`}
                  fill="white" opacity="0.9" />
              ) : (
                <polygon
                  points={`${x2 - 5},${yBar + 4} ${x2 - 11},${yBar + barH / 2} ${x2 - 5},${yBar + barH - 4}`}
                  fill="white" opacity="0.9" />
              ))}

              {/* Dye circle ON the bar edge, with dye letter inside */}
              <circle cx={dyeX} cy={yBar + barH / 2} r="9" fill={dyeColor}
                      stroke="white" strokeWidth="1.8" />
              <text x={dyeX} y={yBar + barH / 2} fontSize="9"
                    fill="white" textAnchor="middle" dominantBaseline="central" fontWeight="800"
                    style={{ fontFamily: "JetBrains Mono, monospace" }}>{dye}</text>

              {/* Length label — inside or outside depending on bar width */}
              <text x={labelX} y={yBar + barH / 2 + 4} fontSize="11"
                    fill={labelFill} textAnchor={labelAnchor} fontWeight="700"
                    style={{ fontFamily: "JetBrains Mono, monospace" }}>
                {p.length} nt
              </text>

              {/* Fragment subtitle below bar (LEFT / RIGHT of cut) */}
              <text x={(x1 + x2) / 2} y={yBar + barH + 14} fontSize="9.5"
                    fill="#475569" textAnchor="middle" fontWeight="500">
                {p.fragment} fragment · {fragStart}–{fragStart + p.length} bp
              </text>

              {/* RIGHT ANNOTATION COLUMN — template + PAM-side + length pill */}
              <g transform={`translate(${m.l + pw + 12}, ${yRow + 4})`}>
                <rect x="0" y="0" width="8" height="36" rx="2"
                      fill={p.template === "non-template" ? "#b45309" : "#0369a1"} opacity="0.85" />
                <text x="14" y="14" fontSize="10.5"
                      fill={p.template === "non-template" ? "#b45309" : "#0369a1"}
                      textAnchor="start" fontWeight="700">{p.template}</text>
                <text x="14" y="28" fontSize="10"
                      fill={p.pam_side === "proximal" ? "#be123c" : "#475569"}
                      textAnchor="start" fontWeight="500">
                  PAM-{p.pam_side}
                </text>
                <g transform="translate(0, 40)">
                  <rect x="0" y="0" width="56" height="14" rx="2" fill="#0f172a" />
                  <text x="28" y="10" fontSize="9.5" fill="white" textAnchor="middle"
                        fontWeight="700" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                    {p.length} nt
                  </text>
                </g>
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function ConstructDiagram({ componentSizes, highlightKey, onHighlight, onSizeChange, cutConstructPos, overhang, grnaStrand, productSizes, pamStart, pamSeq, svgRef: externalSvgRef }) {
  const consRef = useRef(null);
  // The exported ExportMenu below uses consRef; parents can pass an external
  // svgRef (or callback ref) to also get at the DOM node for their own export.
  const combinedRef = useMemo(() => mergeRefs(consRef, externalSvgRef), [externalSvgRef]);
  const total = CONSTRUCT.components.reduce((t, c) => t + (componentSizes[c.key] || 0), 0) || 1;

  // Layout zones (all y coordinates). Each zone has a fixed pixel range so
  // text placed in one zone can never collide with another. Widening the
  // canvas (W=1100) gives component labels enough room to read without
  // ellipsis at publication resolution.
  const W = 1100;
  const m = { l: 16, r: 16 };
  const pw = W - m.l - m.r;
  const Z = {
    dyeTop:   22,    // dye circles sit here
    dyeLabel: 26,    // dye letter inside circle
    boxTop:   44,    // component box top
    boxH:     40,    // component box height
    boxBot:   84,    // = boxTop + boxH
    sizeText: 99,    // component size label baseline
    cutTop:   36,    // cut line starts (above boxes for scissor visibility)
    cutBot:   88,    // cut line ends (just below boxes)
    cutLabel: 30,    // "cut" text above the scissor
    bracketY: 114,   // bracket line y
    bracketLabel: 130, // bracket label baseline
    scaleBar: 158,   // scale bar y
    scaleLabel: 174, // "Full ligation product: N bp"
  };
  const H = 190;

  let x = m.l;
  const boxes = CONSTRUCT.components.map(c => {
    const w = ((componentSizes[c.key] || 0) / total) * pw;
    const box = { ...c, x, w, size: componentSizes[c.key] || 0 };
    x += w;
    return box;
  });

  // Cut geometry
  const hasCut = cutConstructPos != null && cutConstructPos > 0 && cutConstructPos < total;
  const cutX1 = hasCut ? m.l + (cutConstructPos / total) * pw : null;
  const cutX2 = hasCut ? m.l + ((cutConstructPos + (overhang || 0)) / total) * pw : null;

  // Bracket label positions with collision avoidance: when a fragment is
  // narrow (<90 px), the label drops to a second line to avoid the
  // opposing bracket's label. min bracket center spacing is 140 px.
  const leftEndX  = cutX1;
  const rightEndX = m.l + pw;
  const leftStartX = m.l;
  const rightStartX = cutX2 != null ? cutX2 : cutX1;
  const leftCenter  = hasCut ? (leftStartX  + leftEndX)  / 2 : null;
  const rightCenter = hasCut ? (rightStartX + rightEndX) / 2 : null;
  const labelsTooClose = hasCut && Math.abs(rightCenter - leftCenter) < 160;

  return (
    <div>
      {/* Export sits in its own header row above the figure, not floating
          on top of the 3′ end label. Matches EndStructureEditor /
          PostTailingPanel header layout — fixes gh#18. */}
      <div className="flex items-center justify-end mb-1.5 no-print">
        <ExportMenu svgRef={consRef} basename="construct_diagram" label="Export" />
      </div>
      <svg ref={combinedRef} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" style={{ background: "white" }}>
        {/* White background rect for exports */}
        <rect x="0" y="0" width={W} height={H} fill="white" />

        {/* 5' / 3' end labels — at the left and right extremes, well above the boxes */}
        <text x={m.l} y={14} fontSize="11" fill="#475569" textAnchor="start" fontWeight="600"
              fontFamily="ui-monospace, JetBrains Mono, monospace">5′ →</text>
        <text x={m.l + pw} y={14} fontSize="11" fill="#475569" textAnchor="end" fontWeight="600"
              fontFamily="ui-monospace, JetBrains Mono, monospace">→ 3′</text>

        {/* Dye markers on their owning fluor adapters. Stacked 2-high if the
            box carries 2 dyes (Ad1: B+Y, Ad2: G+R in the canonical construct). */}
        {boxes.map(b => b.dyes.length === 0 ? null : (
          <g key={`dye-${b.key}`}>
            {b.dyes.map((d, i) => {
              const cx = b.x + b.w / 2 + (b.dyes.length === 1 ? 0 : (i - (b.dyes.length - 1) / 2) * 18);
              return (
                <g key={d}>
                  <circle cx={cx} cy={Z.dyeTop} r="7" fill={DYE[d].color} stroke="white" strokeWidth="1.4" />
                  <text x={cx} y={Z.dyeTop} fontSize="8.5" fill="white" textAnchor="middle" dominantBaseline="central" fontWeight="800"
                        style={{ fontFamily: "JetBrains Mono, monospace" }}>{d}</text>
                </g>
              );
            })}
          </g>
        ))}

        {/* Component boxes */}
        {boxes.map(b => {
          const hl = highlightKey === b.key;
          // Inside-box name only when the box is wide enough for readable text
          // (at W=1100, 55 px ≈ 6 chars at 11 px). Below that, omit and let
          // the size label below do the identification work via position.
          const showName = b.w > 55;
          const short = b.name
            .replace("Fluor ", "")
            .replace(" Oligo", "")
            .replace("Oligo ", "")
            .replace("Overhang", "OH");
          return (
            <g key={b.key} style={{ cursor: onHighlight ? "pointer" : "default" }}
               onMouseEnter={() => onHighlight && onHighlight(b.key)}
               onMouseLeave={() => onHighlight && onHighlight(null)}>
              <rect x={b.x} y={Z.boxTop} width={Math.max(1, b.w)} height={Z.boxH}
                    fill={b.color}
                    opacity={hl ? 1 : 0.9}
                    stroke={hl ? "#0f172a" : "white"} strokeWidth={hl ? 1.8 : 1} />
              {showName && (
                <text x={b.x + b.w / 2} y={Z.boxTop + Z.boxH / 2 + 4} fontSize="11"
                      fill="white" textAnchor="middle" fontWeight="700" pointerEvents="none"
                      style={{ letterSpacing: "0.02em" }}>
                  {short}
                </text>
              )}
              {/* Size label centered below the box, always rendered. When the
                  box is very narrow (< 26 px) the size is rotated 45° so the
                  text doesn't overlap its neighbors. */}
              {b.w >= 26 ? (
                <text x={b.x + b.w / 2} y={Z.sizeText} fontSize="10.5"
                      fill="#334155" textAnchor="middle" fontWeight="600"
                      style={{ fontFamily: "JetBrains Mono, monospace" }}>
                  {b.size} bp
                </text>
              ) : (
                <text x={b.x + b.w / 2} y={Z.sizeText}
                      fontSize="9" fill="#475569" textAnchor="end"
                      transform={`rotate(-35, ${b.x + b.w / 2}, ${Z.sizeText})`}
                      style={{ fontFamily: "JetBrains Mono, monospace" }}>
                  {b.size}
                </text>
              )}
            </g>
          );
        })}

        {/* PAM site marker — rendered before the cut overlay so the CUT
            line stays on top. PAM is 3 bp; for a top-strand gRNA it sits
            3' of the protospacer (immediately downstream of the cut site);
            for a bot-strand gRNA it sits upstream (position pamStart,
            pamStart+2). `pamSeq` is the actual 3-letter motif (e.g. "CGG")
            when known. */}
        {hasCut && pamStart != null && pamStart >= 0 && pamStart + 3 <= total && (
          <g>
            <rect x={m.l + (pamStart / total) * pw}
                  y={Z.boxTop - 4}
                  width={Math.max(6, (3 / total) * pw)}
                  height={Z.boxH + 8}
                  fill="#8b5cf6" opacity="0.18"
                  stroke="#7c3aed" strokeWidth="0.8" strokeDasharray="3 2" />
            {/* PAM label pill directly above the PAM window, with an NGG
                annotation + orientation triangle showing strand direction */}
            <g transform={`translate(${m.l + ((pamStart + 1.5) / total) * pw}, ${Z.boxTop - 10})`}>
              <rect x="-22" y="-10" width="44" height="11" rx="2" fill="#7c3aed" />
              <text x="0" y="-2" fontSize="8.5" fill="white" textAnchor="middle" fontWeight="800"
                    style={{ fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.06em" }}>
                PAM {pamSeq || "NGG"}
              </text>
              {/* Strand-orientation arrow: top-strand PAM points →, bot-strand ← */}
              {grnaStrand === "top" ? (
                <polygon points="22,-4 30,-4.5 22,-5" fill="#7c3aed" />
              ) : (
                <polygon points="-22,-4 -30,-4.5 -22,-5" fill="#7c3aed" />
              )}
            </g>
          </g>
        )}

        {/* Cut site overlay — rendered AFTER boxes so it sits on top */}
        {hasCut && (
          <g>
            {/* Overhang shading band between top+bottom cut positions */}
            {overhang > 0 && Math.abs(cutX2 - cutX1) > 0.5 && (
              <rect x={Math.min(cutX1, cutX2)} y={Z.boxTop - 2}
                    width={Math.abs(cutX2 - cutX1)} height={Z.boxH + 4}
                    fill="#fbbf24" opacity="0.4" />
            )}
            {/* Primary cut line */}
            <line x1={cutX1} x2={cutX1}
                  y1={Z.cutTop} y2={Z.cutBot}
                  stroke="#dc2626" strokeWidth="2.2" strokeDasharray="4 2" />
            {/* Secondary cut line (bottom strand) when overhang !== 0 */}
            {overhang > 0 && (
              <line x1={cutX2} x2={cutX2}
                    y1={Z.cutTop} y2={Z.cutBot}
                    stroke="#dc2626" strokeWidth="2.2" strokeDasharray="4 2" />
            )}
            {/* Scissor glyph + "CUT" label above — positioned so they don't
                collide with dye markers. Centered over the primary cut.
                Unified geometry with EndStructureEditor per gh#20:
                rect 32×14 rx=3, text at box vertical center, no letter-spacing
                (letter-spacing adds trailing space that breaks textAnchor=middle). */}
            <g transform={`translate(${cutX1}, ${Z.cutLabel})`}>
              <rect x="-16" y="-9" width="32" height="14" rx="3" fill="#dc2626" />
              <text x="0" y="-2" fontSize="9.5" fill="white" textAnchor="middle"
                    fontWeight="800" dominantBaseline="middle">CUT</text>
              <polygon points="-4,7 4,7 0,12" fill="#dc2626" />
            </g>

            {/* LEFT fragment bracket */}
            <g>
              <line x1={leftStartX + 2} x2={leftEndX - 2}
                    y1={Z.bracketY} y2={Z.bracketY}
                    stroke="#64748b" strokeWidth="1.3" />
              <line x1={leftStartX + 2} x2={leftStartX + 2}
                    y1={Z.bracketY - 4} y2={Z.bracketY + 4}
                    stroke="#64748b" strokeWidth="1.3" />
              <line x1={leftEndX - 2} x2={leftEndX - 2}
                    y1={Z.bracketY - 4} y2={Z.bracketY + 4}
                    stroke="#64748b" strokeWidth="1.3" />
              <text x={leftCenter}
                    y={labelsTooClose ? Z.bracketLabel - 2 : Z.bracketLabel}
                    fontSize="10.5" fill="#1f2937" textAnchor="middle" fontWeight="600">
                <tspan style={{ fontFamily: "JetBrains Mono, monospace" }}>{cutConstructPos} bp</tspan>
                <tspan dx="6" fill="#64748b" fontWeight="500">
                  LEFT · {grnaStrand === "top" ? "PAM-distal" : "PAM-proximal"}
                </tspan>
              </text>
            </g>

            {/* RIGHT fragment bracket */}
            <g>
              <line x1={rightStartX + 2} x2={rightEndX - 2}
                    y1={Z.bracketY} y2={Z.bracketY}
                    stroke="#64748b" strokeWidth="1.3" />
              <line x1={rightStartX + 2} x2={rightStartX + 2}
                    y1={Z.bracketY - 4} y2={Z.bracketY + 4}
                    stroke="#64748b" strokeWidth="1.3" />
              <line x1={rightEndX - 2} x2={rightEndX - 2}
                    y1={Z.bracketY - 4} y2={Z.bracketY + 4}
                    stroke="#64748b" strokeWidth="1.3" />
              <text x={rightCenter}
                    y={labelsTooClose ? Z.bracketLabel + 14 : Z.bracketLabel}
                    fontSize="10.5" fill="#1f2937" textAnchor="middle" fontWeight="600">
                <tspan style={{ fontFamily: "JetBrains Mono, monospace" }}>{total - cutConstructPos} bp</tspan>
                <tspan dx="6" fill="#64748b" fontWeight="500">
                  RIGHT · {grnaStrand === "top" ? "PAM-proximal" : "PAM-distal"}
                </tspan>
              </text>
            </g>
          </g>
        )}

        {/* Scale bar + caption — always rendered at the bottom */}
        <line x1={m.l} x2={m.l + pw} y1={Z.scaleBar} y2={Z.scaleBar}
              stroke="#cbd5e1" strokeWidth="1.2" />
        {/* Tick marks every 50 bp */}
        {Array.from({ length: Math.floor(total / 50) + 1 }, (_, i) => i * 50).map(v => {
          const tx = m.l + (v / total) * pw;
          return (
            <g key={`tick-${v}`}>
              <line x1={tx} x2={tx} y1={Z.scaleBar - 3} y2={Z.scaleBar + 3} stroke="#94a3b8" strokeWidth="1" />
              <text x={tx} y={Z.scaleBar + 14} fontSize="8.5" fill="#64748b" textAnchor="middle"
                    style={{ fontFamily: "JetBrains Mono, monospace" }}>{v}</text>
            </g>
          );
        })}
        <text x={m.l + pw / 2} y={Z.scaleLabel + 10} fontSize="10" fill="#334155"
              textAnchor="middle" fontWeight="500">
          {hasCut
            ? `Full ligation product: ${total} bp · cut at position ${cutConstructPos}${overhang > 0 ? ` (+${overhang} nt overhang)` : ""}`
            : `Full ligation product: ${total} bp (uncut)`}
        </text>
      </svg>

      {/* Editable component sizes — form chrome below the SVG, excluded from exports */}
      {onSizeChange && (
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs no-print">
          <span className="text-zinc-500 font-semibold uppercase tracking-wide leading-none">Component sizes (bp):</span>
          {CONSTRUCT.components.map(c => (
            <label key={c.key} className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: c.color }} />
              <span className="text-zinc-600">{c.name.replace("Fluor ", "").replace("Oligo ", "")}</span>
              <input type="number" min="0" step="1" value={componentSizes[c.key] || 0}
                onChange={e => onSizeChange(c.key, parseInt(e.target.value || "0", 10))}
                className="w-14 px-1.5 py-0.5 border border-zinc-300 rounded font-mono text-right text-xs" />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function AssemblyProductsCard({ componentSizes, onSizeChange, onApply }) {
  const [hl, setHl] = useState(null);
  return (
    <div className="bg-white rounded-lg border border-zinc-200 p-3 mb-3">
      <div className="text-sm font-medium mb-2">Construct architecture · Expected product sizes</div>
      <ConstructDiagram componentSizes={componentSizes} highlightKey={hl} onHighlight={setHl} onSizeChange={onSizeChange} />

      <div className="mt-3 text-xs text-zinc-600">
        Choose an assembly product to set expected peak positions for the currently-selected sample. Each product predicts peaks in specific dye channels only.
      </div>
      <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-1.5">
        {ASSEMBLY_PRODUCTS.map(p => {
          const sz = productSize(p, componentSizes);
          return (
            <button key={p.id} onClick={() => onApply(p.id, sz, p.dyes)}
              className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs border border-zinc-200 rounded hover:bg-zinc-50 text-left">
              <span className="truncate">
                <span className="font-medium">{p.name}</span>
                <span className="text-zinc-500 ml-1">
                  {p.dyes.length ? "(" + p.dyes.map(d => DYE[d].label).join(", ") + ")" : "(no dye)"}
                </span>
              </span>
              <span className="font-mono text-zinc-700 shrink-0">{sz} bp</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TargetSequenceView({ fullConstruct, targetStart, targetEnd, grnas, selectedId }) {
  const seq = fullConstruct.substring(targetStart - 1, targetEnd).toUpperCase();
  const annot = new Array(seq.length).fill(null).map(() => ({}));
  for (const g of grnas) {
    const ti = g.target_pos - 1;
    if (g.strand === "top") {
      for (let k = 0; k < 20; k++) if (ti + k < seq.length) annot[ti + k].top = true;
      for (let k = 20; k < 23; k++) if (ti + k < seq.length) { annot[ti + k].top = true; annot[ti + k].isPamTop = true; }
    } else {
      for (let k = 0; k < 3; k++) if (ti + k < seq.length) { annot[ti + k].bot = true; annot[ti + k].isPamBot = true; }
      for (let k = 3; k < 23; k++) if (ti + k < seq.length) annot[ti + k].bot = true;
    }
    if (g.id === selectedId) {
      for (let k = 0; k < 23; k++) if (ti + k < seq.length) annot[ti + k].isSel = true;
    }
  }
  const chunks = [];
  for (let i = 0; i < seq.length; i += 60) chunks.push([i, seq.substring(i, i + 60)]);
  return (
    <div className="bg-zinc-50 rounded border border-zinc-200 p-2 font-mono text-[11px] leading-relaxed overflow-x-auto">
      {chunks.map(([start, chunk]) => (
        <div key={start} className="whitespace-pre">
          <span className="text-zinc-400 select-none">{String(start + 1).padStart(4, " ")}  </span>
          {chunk.split("").map((c, k) => {
            const a = annot[start + k] || {};
            const cls = [
              a.isSel ? "bg-yellow-200" : "",
              a.isPamTop ? "text-green-700 font-bold" : (a.top ? "text-green-600" : ""),
              a.isPamBot ? "text-pink-700 font-bold" : (a.bot ? "text-pink-600" : ""),
            ].filter(Boolean).join(" ");
            return <span key={k} className={cls}>{c}</span>;
          })}
          <span className="text-zinc-400 select-none">  {String(Math.min(start + chunk.length, seq.length)).padStart(4, " ")}</span>
        </div>
      ))}
      <div className="flex flex-wrap gap-3 pt-2 text-[10px] text-zinc-600 border-t border-zinc-200 mt-2">
        <span><span className="inline-block w-3 h-3 bg-green-600 mr-1 align-middle" />Top protospacer</span>
        <span><span className="inline-block w-3 h-3 bg-green-700 mr-1 align-middle" />Top PAM (NGG)</span>
        <span><span className="inline-block w-3 h-3 bg-pink-600 mr-1 align-middle" />Bot protospacer</span>
        <span><span className="inline-block w-3 h-3 bg-pink-700 mr-1 align-middle" />Bot PAM (CCN on top)</span>
        <span><span className="inline-block w-3 h-3 bg-yellow-200 mr-1 align-middle" />Selected gRNA</span>
      </div>
    </div>
  );
}

