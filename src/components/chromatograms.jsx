// src/components/chromatograms.jsx
// Issue #13 Phase C.8: 4-channel stacked electropherograms.
//
// StackedChromatogram renders a single sample as 4 per-dye lanes with
// optional reference overlay (dotted for uncut / solid for cut) and
// expected-species vertical markers. MiniChromatogram is a thin wrapper
// that forwards to StackedChromatogram at the default report size.

import { DYE, resolveDyeColor } from "../lib/constants.js";
import { buildGaussianPath } from "../lib/chromatogram.js";

export function StackedChromatogram({
  peaks, refPeaks = null, refSampleName = null,
  expectedSpecies = null, palette = "default", svgRef,
  title = "", caption = "",
  range = [0, 260],
  currentSampleName = "",
}) {
  const W = 1100;
  // Bottom margin scales with caption line count at ~14 px per line + 50 px
  // lead so in-SVG captions don't get clipped by the viewBox.
  const captionLineCount = caption ? String(caption).split(/\n/).length : 0;
  const m = { l: 80, r: 24, t: (title ? 34 : 12), b: captionLineCount > 0 ? 58 + captionLineCount * 14 : 32 };
  const channels = ["B", "G", "Y", "R"];
  const laneH = 92;
  const laneGap = 8;
  const plotH = channels.length * laneH + (channels.length - 1) * laneGap;
  const H = m.t + plotH + m.b;
  const pw = W - m.l - m.r;
  const [xMin, xMax] = range;
  const xScale = (bp) => m.l + ((bp - xMin) / Math.max(1, xMax - xMin)) * pw;
  const colorFor = (d) => resolveDyeColor(d, palette);

  // Per-dye Y-max for the CURRENT sample only — reference overlay uses its
  // own y-max so the dotted trace normalizes independently (per-sample
  // normalization, matching the front-page default).
  const curYMax = {};
  const refYMax = {};
  for (const d of channels) {
    const lpC = (peaks?.[d] || []).filter(p => p[0] >= xMin && p[0] <= xMax);
    curYMax[d] = lpC.length ? Math.max(...lpC.map(p => p[1])) * 1.12 : 100;
    const lpR = ((refPeaks && refPeaks[d]) || []).filter(p => p[0] >= xMin && p[0] <= xMax);
    refYMax[d] = lpR.length ? Math.max(...lpR.map(p => p[1])) * 1.12 : 100;
  }

  // X ticks every 50 bp
  const tickStep = (xMax - xMin) <= 40 ? 5 : (xMax - xMin) <= 120 ? 20 : 50;
  const xTicks = [];
  for (let v = Math.ceil(xMin / tickStep) * tickStep; v <= xMax; v += tickStep) xTicks.push(v);

  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" style={{ background: "white" }}>
      <rect x="0" y="0" width={W} height={H} fill="white" />

      {/* Title (optional) */}
      {title && (
        <text x={m.l + pw / 2} y={18} fontSize="13" fill="#0f172a" textAnchor="middle" fontWeight="700">
          {title}
        </text>
      )}

      {/* Paired legend strip (dotted uncut + solid cut) — rendered inside
          the SVG so export figures are self-describing */}
      {refPeaks && (
        <g>
          <rect x={m.l + pw / 2 - 260} y={m.t - 20} width={520} height={14} rx="2"
                fill="#f8fafc" stroke="#e2e8f0" strokeWidth="0.8" />
          <g transform={`translate(${m.l + pw / 2 - 250}, ${m.t - 10})`}>
            <line x1="0" y1="0" x2="28" y2="0" stroke="#334155" strokeWidth="1.3"
                  strokeDasharray="1 3" strokeLinecap="round" />
            <text x="34" y="3" fontSize="9" fill="#334155" fontWeight="600">uncut</text>
            <text x="70" y="3" fontSize="9" fill="#64748b"
                  style={{ fontFamily: "JetBrains Mono, monospace" }}>{refSampleName || "reference"}</text>
          </g>
          <g transform={`translate(${m.l + pw / 2 + 20}, ${m.t - 10})`}>
            <line x1="0" y1="0" x2="28" y2="0" stroke="#334155" strokeWidth="1.6" />
            <text x="34" y="3" fontSize="9" fill="#334155" fontWeight="600">cut</text>
            <text x="60" y="3" fontSize="9" fill="#64748b"
                  style={{ fontFamily: "JetBrains Mono, monospace" }}>{currentSampleName || "current"}</text>
          </g>
        </g>
      )}

      {/* Per-channel lane rendering */}
      {channels.map((dye, idx) => {
        const laneTop = m.t + idx * (laneH + laneGap);
        const yMax = curYMax[dye];
        const rYMax = refYMax[dye];
        const laneGeom = { laneTop, laneH, mLeft: m.l, plotW: pw };
        const lp = (peaks?.[dye] || []).filter(p => p[0] >= xMin - 5 && p[0] <= xMax + 5);
        const lpR = ((refPeaks && refPeaks[dye]) || []).filter(p => p[0] >= xMin - 5 && p[0] <= xMax + 5);
        const curPath = lp.length ? buildGaussianPath(lp.map(p => [p[0], p[1], p[2], p[3]]),
                                                     [xMin, xMax], yMax, laneGeom, 1, false) : null;
        const refPath = lpR.length ? buildGaussianPath(lpR.map(p => [p[0], p[1], p[2], p[3]]),
                                                     [xMin, xMax], rYMax, laneGeom, 1, false) : null;
        return (
          <g key={`lane-${dye}`}>
            {/* Lane background + frame */}
            <rect x={m.l} y={laneTop} width={pw} height={laneH} fill="#fafbfc" stroke="#cbd5e1" strokeWidth="0.6" />
            {/* Lane label (dye name + color swatch) */}
            <g transform={`translate(${m.l - 8}, ${laneTop + laneH / 2})`}>
              <circle cx={-6} cy="-1" r="5" fill={colorFor(dye)} />
              <text x="-16" y="3" fontSize="10" fill="#0f172a" textAnchor="end" fontWeight="700">
                {DYE[dye].label}
              </text>
              <text x="-16" y="14" fontSize="8.5" fill="#64748b" textAnchor="end"
                    style={{ fontFamily: "JetBrains Mono, monospace" }}>
                {DYE[dye].name}
              </text>
            </g>
            {/* Expected-species markers (per dye) — drawn behind the trace */}
            {expectedSpecies && expectedSpecies.filter(sp => {
              const hasThisDye = (sp.dyes || []).includes(dye);
              return hasThisDye && sp.size >= xMin && sp.size <= xMax;
            }).map(sp => {
              const x = xScale(sp.size);
              const isCut = sp.kind === "cut";
              return (
                <g key={`sp-${dye}-${sp.id}`}>
                  <line x1={x} x2={x} y1={laneTop} y2={laneTop + laneH}
                        stroke={colorFor(dye)}
                        strokeWidth="0.9"
                        strokeDasharray={isCut ? "4 2" : "1 3"}
                        strokeLinecap={isCut ? "butt" : "round"}
                        opacity="0.6" />
                  {/* Tiny tag at the top of the lane */}
                  <rect x={x - 16} y={laneTop + 2} width="32" height="10" rx="1.5"
                        fill={colorFor(dye)} opacity="0.9" />
                  <text x={x} y={laneTop + 10} fontSize="7.5" fill="white" textAnchor="middle"
                        fontWeight="700" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                    {isCut ? "CUT" : (sp.id || "").slice(0, 6)}
                  </text>
                </g>
              );
            })}
            {/* Reference (uncut) trace: dotted, same dye color */}
            {refPath && (
              <g>
                <path d={refPath.fill} fill={colorFor(dye)} opacity="0.06" />
                <path d={refPath.stroke} fill="none" stroke={colorFor(dye)} strokeWidth="1.2"
                      opacity="0.9" strokeDasharray="1 3" strokeLinecap="round" />
              </g>
            )}
            {/* Current (cut) trace: solid, same dye color */}
            {curPath && (
              <g>
                <path d={curPath.fill} fill={colorFor(dye)} opacity="0.14" />
                <path d={curPath.stroke} fill="none" stroke={colorFor(dye)} strokeWidth="1.5" opacity="0.95" />
              </g>
            )}
          </g>
        );
      })}

      {/* X-axis ticks below the bottom lane */}
      {(() => {
        const yAxisBase = m.t + plotH;
        return (
          <>
            <line x1={m.l} x2={m.l + pw} y1={yAxisBase} y2={yAxisBase} stroke="#334155" strokeWidth="0.8" />
            {xTicks.map(v => (
              <g key={`x-${v}`}>
                <line x1={xScale(v)} x2={xScale(v)} y1={yAxisBase} y2={yAxisBase + 4} stroke="#94a3b8" />
                <text x={xScale(v)} y={yAxisBase + 14} fontSize="9" fill="#64748b" textAnchor="middle"
                      style={{ fontFamily: "JetBrains Mono, monospace" }}>{v}</text>
              </g>
            ))}
            <text x={m.l + pw / 2} y={yAxisBase + 28} fontSize="10" fill="#475569" textAnchor="middle" fontWeight="600">
              Size (bp)
            </text>
          </>
        );
      })()}

      {/* Caption — one or more lines wrapped inside the SVG so the figure
          ships self-contained with its legend. First line rendered bolder
          so it reads as a figure lede (e.g. "Figure 3. ..."). */}
      {caption && (() => {
        const lines = String(caption).split(/\n/);
        const base = H - m.b + 50;
        const lineH = 14;
        return lines.map((line, i) => (
          <text key={`cap-${i}`} x={m.l} y={base + i * lineH} fontSize="11"
                fill="#1f2937" fontWeight={i === 0 ? "700" : "400"}>
            {line}
          </text>
        ));
      })()}
    </svg>
  );
}

// Backwards-compatible shim: the old MiniChromatogram prop shape is retained
// and routed through the new StackedChromatogram so callers (per-sample
// loops in the report) don't need to be rewritten.
export function MiniChromatogram({ peaks, expectedSpecies, palette = "default", svgRef }) {
  return (
    <StackedChromatogram
      peaks={peaks}
      expectedSpecies={expectedSpecies}
      palette={palette}
      svgRef={svgRef}
      range={[0, 300]}
    />
  );
}
