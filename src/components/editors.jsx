// src/components/editors.jsx
// Issue #13 Phase C.7: sidebar editors + control rows lifted out of
// FragmentViewer.jsx.
//
//   - SampleStyleRow      — per-sample overlay style controls (width, dash).
//   - EndStructureEditor  — 1-bp overhang editor with dA-tailing prediction.
//   - PostTailingPanel    — post-tailing products + adapter compat + seq dir.
//   - NudgeRow            — generic +/- bp nudge row used by the two above.
//   - PeakShiftPanel      — mobility shift stats between paired samples.
//   - PrepControls        — per-sample prep metadata (lib, chemistry, etc.).

import { useState, useMemo } from "react";
import { Panel, Field, Pill, ToolButton, DyeChip } from "./primitives.jsx";
import { ExportMenu } from "./export_menu.jsx";
import { DYE, resolveDyeColor } from "../lib/constants.js";
import { evaluateDATailing, predictPostTailing, computePeakShiftStats } from "../lib/analysis.js";

export function SampleStyleRow({ title, accent = "zinc", style, setField }) {
  const titleCls = accent === "indigo" ? "text-indigo-700" : "text-zinc-700";
  const dashPatterns = [
    { k: "solid",    l: "Solid",    arr: "none" },
    { k: "dotted",   l: "Dotted",   arr: "1 3", cap: "round" },
    { k: "dashed",   l: "Dashed",   arr: "5 3" },
    { k: "dash-dot", l: "Dash-dot", arr: "5 2 1 2" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
      <span className={`font-semibold tracking-tight ${titleCls} min-w-[22ch]`}>{title}</span>
      <label className="flex items-center gap-1.5" title="Stroke width of the modeled gaussian trace">
        <span className="text-zinc-500">Width</span>
        <input type="range" min="0.5" max="3" step="0.1" value={style.strokeWidth}
               onChange={e => setField("strokeWidth", parseFloat(e.target.value))} className="accent-zinc-700 w-20" />
        <span className="tabular-nums text-zinc-600 w-8">{style.strokeWidth.toFixed(1)}</span>
      </label>
      <label className="flex items-center gap-1.5" title="Stroke opacity (line)">
        <span className="text-zinc-500">Line α</span>
        <input type="range" min="0.1" max="1" step="0.05" value={style.strokeOpacity}
               onChange={e => setField("strokeOpacity", parseFloat(e.target.value))} className="accent-zinc-700 w-20" />
        <span className="tabular-nums text-zinc-600 w-10">{style.strokeOpacity.toFixed(2)}</span>
      </label>
      <label className="flex items-center gap-1.5" title="Fill opacity (under the line)">
        <span className="text-zinc-500">Fill α</span>
        <input type="range" min="0" max="0.6" step="0.02" value={style.fillOpacity}
               onChange={e => setField("fillOpacity", parseFloat(e.target.value))} className="accent-zinc-700 w-20" />
        <span className="tabular-nums text-zinc-600 w-10">{style.fillOpacity.toFixed(2)}</span>
      </label>
      <label className="flex items-center gap-1.5">
        <span className="text-zinc-500">Pattern</span>
        <div className="inline-flex rounded-md border border-zinc-300 overflow-hidden">
          {dashPatterns.map(d => (
            <button key={d.k} onClick={() => setField("dash", d.k)}
              className={`px-1.5 py-0.5 ${style.dash === d.k ? "bg-zinc-900 text-white" : "bg-white text-zinc-700 hover:bg-zinc-100"}`}
              title={d.l}>
              <svg width="26" height="6" aria-hidden style={{ display: "block" }}>
                <line x1="0" y1="3" x2="26" y2="3"
                      stroke={style.dash === d.k ? "white" : "#334155"}
                      strokeWidth="1.5"
                      strokeDasharray={d.arr}
                      strokeLinecap={d.cap || "butt"} />
              </svg>
            </button>
          ))}
        </div>
      </label>
    </div>
  );
}

// End-structure editor: after the Cas9 cut, each of the two fragments has a
// top-strand terminus + a bot-strand terminus. Users can nudge each by ±1 bp
// to model the effect of exonuclease chewback, fill-in, or design changes
// on the resulting overhang. For every end we compute the overhang type +
// length + dA-tail prediction via evaluateDATailing.
//
// Geometric rendering: the zoomed-in cut-site view shows ~20 bp on either
// side of the cut with the top strand above, bot strand below. Each strand
// terminus renders exactly where its offset puts it, so the overhang shape
// reads directly from the geometry (no text-only explanation needed).
export function EndStructureEditor({ cutPos, canonicalOverhang, constructSize, offsets, setOffsets }) {
  const svgRef = useRef(null);
  // Offsets state is lifted to the parent so the PostTailingPanel below can
  // read the same values. The parent (TraceTab) owns the state; we only
  // drive the +/- controls here.
  // Reset offsets when the cut position changes (new gRNA picked).
  useEffect(() => { setOffsets({ lt: 0, lb: 0, rt: 0, rb: 0 }); }, [cutPos, canonicalOverhang]);
  const nudge = (k, delta) => setOffsets(o => ({
    ...o,
    [k]: Math.max(-10, Math.min(10, (o[k] || 0) + delta)),
  }));
  const resetAll = () => setOffsets({ lt: 0, lb: 0, rt: 0, rb: 0 });

  // Absolute strand positions. Baseline: LEFT fragment ends at cutPos on both
  // strands (blunt) unless canonicalOverhang ≠ 0, in which case the bot
  // strand cuts `canonicalOverhang` bp further right on the LEFT end and
  // `canonicalOverhang` bp further right on the RIGHT end (Cas9 sticky-end
  // chemistry: same 4-nt overhang on both sides of the cut).
  const leftTop = cutPos + offsets.lt;
  const leftBot = cutPos + canonicalOverhang + offsets.lb;
  const rightTop = cutPos + offsets.rt;
  const rightBot = cutPos + canonicalOverhang + offsets.rb;

  // Evaluate dA-tailability for each end.
  const leftEval  = evaluateDATailing({ side: "left",  topEnd: leftTop,  botEnd: leftBot  });
  const rightEval = evaluateDATailing({ side: "right", topEnd: rightTop, botEnd: rightBot });

  // Zoomed-in geometry around the cut.
  const W = 1100;
  const H = 240;
  const m = { l: 110, r: 110, t: 40, b: 40 };
  const pw = W - m.l - m.r;
  const window_bp = 16;   // ±16 bp around the cut position
  const xMin = Math.max(0, cutPos - window_bp);
  const xMax = Math.min(constructSize, cutPos + window_bp);
  const bpRange = xMax - xMin;
  const xFor = (bp) => m.l + ((bp - xMin) / bpRange) * pw;

  const strandGap = 38;    // vertical gap between the two strands
  const yTop = m.t + 10;
  const yBot = m.t + 10 + strandGap;

  return (
    <div className="bg-white rounded-lg border border-zinc-200 p-3 mb-3">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <div className="text-sm font-semibold text-zinc-800">End-structure editor · dA-tailability</div>
          <p className="text-xs text-zinc-500 mt-0.5">
            Nudge any strand terminus ±1 bp. The diagram updates geometrically; each end is evaluated for dA-tailing success under the lab protocol (5′→3′ exo chewback → Klenow 3′ dA).
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <ToolButton variant="secondary" onClick={resetAll} title="Reset all four strand termini to the canonical Cas9 cut positions">
            Reset
          </ToolButton>
          <ExportMenu svgRef={svgRef} basename="end_structure" label="Export" />
        </div>
      </div>

      {/* Zoomed-in cut-site diagram */}
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" style={{ background: "white" }}>
        <rect x="0" y="0" width={W} height={H} fill="white" />

        {/* Scale ticks (every 1 bp within the zoom window) */}
        {Array.from({ length: bpRange + 1 }, (_, i) => xMin + i).map(bp => {
          const x = xFor(bp);
          const isCut = bp === cutPos;
          return (
            <g key={`tk-${bp}`}>
              <line x1={x} x2={x} y1={H - m.b} y2={H - m.b + 3}
                    stroke={isCut ? "#dc2626" : "#cbd5e1"} strokeWidth={isCut ? 1.5 : 0.8} />
              {(bp % 5 === 0 || isCut) && (
                <text x={x} y={H - m.b + 14} fontSize="8.5"
                      fill={isCut ? "#dc2626" : "#64748b"} textAnchor="middle"
                      fontWeight={isCut ? "700" : "500"}
                      style={{ fontFamily: "JetBrains Mono, monospace" }}>{bp}</text>
              )}
            </g>
          );
        })}

        {/* 5'/3' orientation labels for each strand */}
        <text x={m.l - 14} y={yTop + 4} fontSize="10" fill="#475569" textAnchor="end" fontWeight="700"
              style={{ fontFamily: "JetBrains Mono, monospace" }}>5′</text>
        <text x={m.l + pw + 14} y={yTop + 4} fontSize="10" fill="#475569" textAnchor="start" fontWeight="700"
              style={{ fontFamily: "JetBrains Mono, monospace" }}>3′</text>
        <text x={m.l - 14} y={yBot + 4} fontSize="10" fill="#475569" textAnchor="end" fontWeight="700"
              style={{ fontFamily: "JetBrains Mono, monospace" }}>3′</text>
        <text x={m.l + pw + 14} y={yBot + 4} fontSize="10" fill="#475569" textAnchor="start" fontWeight="700"
              style={{ fontFamily: "JetBrains Mono, monospace" }}>5′</text>
        <text x={m.l - 40} y={yTop + 4} fontSize="9" fill="#94a3b8" textAnchor="end" fontWeight="600">TOP</text>
        <text x={m.l - 40} y={yBot + 4} fontSize="9" fill="#94a3b8" textAnchor="end" fontWeight="600">BOT</text>

        {/* LEFT fragment: top strand from xMin to leftTop, bot strand from xMin to leftBot */}
        {leftTop > xMin && (
          <rect x={xFor(xMin)} y={yTop - 3} width={xFor(leftTop) - xFor(xMin)} height="6"
                fill="#0ea5e9" rx="1" opacity="0.9" />
        )}
        {leftBot > xMin && (
          <rect x={xFor(xMin)} y={yBot - 3} width={xFor(leftBot) - xFor(xMin)} height="6"
                fill="#0369a1" rx="1" opacity="0.9" />
        )}

        {/* RIGHT fragment: top strand from rightTop to xMax, bot strand from rightBot to xMax */}
        {rightTop < xMax && (
          <rect x={xFor(rightTop)} y={yTop - 3} width={xFor(xMax) - xFor(rightTop)} height="6"
                fill="#0ea5e9" rx="1" opacity="0.9" />
        )}
        {rightBot < xMax && (
          <rect x={xFor(rightBot)} y={yBot - 3} width={xFor(xMax) - xFor(rightBot)} height="6"
                fill="#0369a1" rx="1" opacity="0.9" />
        )}

        {/* Canonical cut line (dashed red) at cutPos */}
        <line x1={xFor(cutPos)} x2={xFor(cutPos)}
              y1={m.t - 6} y2={H - m.b}
              stroke="#dc2626" strokeWidth="1.4" strokeDasharray="4 3" opacity="0.75" />
        {/* "CUT" label */}
        <g transform={`translate(${xFor(cutPos)}, ${m.t - 14})`}>
          <rect x="-18" y="-10" width="36" height="12" rx="2" fill="#dc2626" />
          <text x="0" y="-2" fontSize="9" fill="white" textAnchor="middle" fontWeight="800"
                style={{ letterSpacing: "0.08em" }}>CUT</text>
        </g>

        {/* LEFT-end overhang shading — between leftTop and leftBot */}
        {leftTop !== leftBot && (
          <rect x={Math.min(xFor(leftTop), xFor(leftBot))}
                y={yTop - 3}
                width={Math.abs(xFor(leftTop) - xFor(leftBot))}
                height={yBot - yTop + 6}
                fill="#fbbf24" opacity="0.25" rx="1" />
        )}
        {/* RIGHT-end overhang shading */}
        {rightTop !== rightBot && (
          <rect x={Math.min(xFor(rightTop), xFor(rightBot))}
                y={yTop - 3}
                width={Math.abs(xFor(rightTop) - xFor(rightBot))}
                height={yBot - yTop + 6}
                fill="#fbbf24" opacity="0.25" rx="1" />
        )}

        {/* LEFT fragment caption + dA-tailability pill */}
        <g transform={`translate(${m.l - 6}, ${H - m.b - 6})`}>
          <text x="0" y="0" fontSize="10" fill="#1f2937" textAnchor="end" fontWeight="700">LEFT fragment</text>
          <text x="0" y="14" fontSize="9" fill="#475569" textAnchor="end"
                style={{ fontFamily: "JetBrains Mono, monospace" }}>
            top 3′: {leftTop} bp · bot 5′: {leftBot} bp
          </text>
          <g transform="translate(0, 22)">
            <rect x={leftEval.dATailable ? -70 : -90} y="-10" width={leftEval.dATailable ? 70 : 90} height="16" rx="3"
                  fill={leftEval.dATailable ? (leftEval.confidence === "high" ? "#10b981" : "#f59e0b") : "#e11d48"} />
            <text x={leftEval.dATailable ? -35 : -45} y="1" fontSize="9.5" fill="white" fontWeight="800"
                  textAnchor="middle" style={{ letterSpacing: "0.04em" }}>
              {leftEval.dATailable ? (leftEval.confidence === "high" ? "dA-TAIL ✓" : "dA-TAIL (marginal)") : "dA-TAIL ✗"}
            </text>
          </g>
        </g>

        {/* RIGHT fragment caption + dA-tailability pill */}
        <g transform={`translate(${m.l + pw + 6}, ${H - m.b - 6})`}>
          <text x="0" y="0" fontSize="10" fill="#1f2937" textAnchor="start" fontWeight="700">RIGHT fragment</text>
          <text x="0" y="14" fontSize="9" fill="#475569" textAnchor="start"
                style={{ fontFamily: "JetBrains Mono, monospace" }}>
            top 5′: {rightTop} bp · bot 3′: {rightBot} bp
          </text>
          <g transform="translate(0, 22)">
            <rect x="0" y="-10" width={rightEval.dATailable ? 70 : 90} height="16" rx="3"
                  fill={rightEval.dATailable ? (rightEval.confidence === "high" ? "#10b981" : "#f59e0b") : "#e11d48"} />
            <text x={rightEval.dATailable ? 35 : 45} y="1" fontSize="9.5" fill="white" fontWeight="800"
                  textAnchor="middle" style={{ letterSpacing: "0.04em" }}>
              {rightEval.dATailable ? (rightEval.confidence === "high" ? "dA-TAIL ✓" : "dA-TAIL (marginal)") : "dA-TAIL ✗"}
            </text>
          </g>
        </g>
      </svg>

      {/* +/- controls + dA rationale cards */}
      <div className="grid md:grid-cols-2 gap-3 mt-2 text-xs">
        <div className="border border-zinc-200 rounded-lg p-2.5 bg-zinc-50">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="font-semibold text-zinc-800">LEFT fragment end</span>
            <Pill tone={leftEval.overhangType === "blunt" ? "emerald"
                   : leftEval.overhangType === "5_prime" ? "sky"
                   : "rose"}>
              {leftEval.overhangType === "blunt" ? "blunt" :
               leftEval.overhangType === "5_prime" ? `${leftEval.overhangLen}-nt 5′ overhang` :
               `${leftEval.overhangLen}-nt 3′ overhang`}
            </Pill>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-2">
            <NudgeRow label="Top strand (3′ end)" value={offsets.lt} onMinus={() => nudge("lt", -1)} onPlus={() => nudge("lt", +1)} />
            <NudgeRow label="Bot strand (5′ end)" value={offsets.lb} onMinus={() => nudge("lb", -1)} onPlus={() => nudge("lb", +1)} />
          </div>
          <div className="text-[11px] text-zinc-600">{leftEval.reason}</div>
        </div>
        <div className="border border-zinc-200 rounded-lg p-2.5 bg-zinc-50">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="font-semibold text-zinc-800">RIGHT fragment end</span>
            <Pill tone={rightEval.overhangType === "blunt" ? "emerald"
                   : rightEval.overhangType === "5_prime" ? "sky"
                   : "rose"}>
              {rightEval.overhangType === "blunt" ? "blunt" :
               rightEval.overhangType === "5_prime" ? `${rightEval.overhangLen}-nt 5′ overhang` :
               `${rightEval.overhangLen}-nt 3′ overhang`}
            </Pill>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-2">
            <NudgeRow label="Top strand (5′ end)" value={offsets.rt} onMinus={() => nudge("rt", -1)} onPlus={() => nudge("rt", +1)} />
            <NudgeRow label="Bot strand (3′ end)" value={offsets.rb} onMinus={() => nudge("rb", -1)} onPlus={() => nudge("rb", +1)} />
          </div>
          <div className="text-[11px] text-zinc-600">{rightEval.reason}</div>
        </div>
      </div>
    </div>
  );
}

// Post-dA-tailing product panel: shown below the EndStructureEditor. For
// each of LEFT and RIGHT cut-side ends, renders the end's final structure
// after exo + dA treatment, adapter compatibility, and sequencing
// direction. All outputs come from the shared predictPostTailing helper
// so the display and any downstream analyses stay in sync.
export function PostTailingPanel({ cutPos, canonicalOverhang, constructSize, offsets, topSeq }) {
  const svgRef = useRef(null);
  const leftTop  = cutPos + (offsets.lt || 0);
  const leftBot  = cutPos + canonicalOverhang + (offsets.lb || 0);
  const rightTop = cutPos + (offsets.rt || 0);
  const rightBot = cutPos + canonicalOverhang + (offsets.rb || 0);
  const leftP  = predictPostTailing({ side: "left",  topEnd: leftTop,  botEnd: leftBot,  topSeq });
  const rightP = predictPostTailing({ side: "right", topEnd: rightTop, botEnd: rightBot, topSeq });

  // 4-step reaction diagram per end.
  //   Step 1: ORIGINAL end geometry (from the Cas9 cut + user offsets)
  //   Step 2: Taq 5'→3' EXO — chews back 5' overhangs to blunt
  //   Step 3: Taq 5'→3' POL + dATP — adds single dA to every 3' terminus
  //   Step 4: T/A ADAPTER ligation — shown attached when compatible
  //
  // Taq polymerase uniquely combines 5'→3' exo AND 5'→3' pol activities
  // in one enzyme; a single Taq step does both chewback and dA addition.
  // Taq does NOT have 3'→5' proofreading, so 3' overhangs survive both
  // activities intact and block T/A ligation.
  const W = 1200, H = 460;
  const m = { l: 24, r: 24, t: 40, b: 34 };
  const pw = W - m.l - m.r;
  const stepW = pw / 4 - 8;
  const rowGap = 24;
  const rowH = (H - m.t - m.b - rowGap) / 2;

  const STEPS = [
    { key: "original", label: "1 · Original end",         subtitle: "Cas9 double-strand break"     },
    { key: "exo",      label: "2 · Taq 5′→3′ exo",        subtitle: "Chews 5′ overhangs → blunt"   },
    { key: "pol",      label: "3 · Taq 5′→3′ pol + dATP", subtitle: "Adds 3′-dA to every 3′ end"   },
    { key: "adapter",  label: "4 · T/A adapter ligation", subtitle: "3′-A pairs with adapter 3′-T" },
  ];
  const stepScale = 5;

  const drawEnd = (side, p, step) => {
    const barX = 24;
    const barW = 90;
    const yTop = 18;
    const yBot = 36;
    let topEnd = barX + barW;
    let botEnd = barX + barW;
    let adapterAttached = false;
    if (step === "original") {
      if (p.original.overhangType === "5_prime") {
        if (side === "left") botEnd = barX + barW + p.original.overhangLen * stepScale;
        else                 topEnd = barX + barW + p.original.overhangLen * stepScale;
      } else if (p.original.overhangType === "3_prime") {
        if (side === "left") topEnd = barX + barW + p.original.overhangLen * stepScale;
        else                 botEnd = barX + barW + p.original.overhangLen * stepScale;
      }
    } else if (step === "exo") {
      if (p.original.overhangType === "3_prime") {
        if (side === "left") topEnd = barX + barW + p.original.overhangLen * stepScale;
        else                 botEnd = barX + barW + p.original.overhangLen * stepScale;
      }
    } else if (step === "pol") {
      if (p.dATailed) {
        if (side === "left") topEnd = barX + barW + stepScale;
        else                 botEnd = barX + barW + stepScale;
      } else if (p.original.overhangType === "3_prime") {
        if (side === "left") topEnd = barX + barW + p.original.overhangLen * stepScale;
        else                 botEnd = barX + barW + p.original.overhangLen * stepScale;
      }
    } else if (step === "adapter") {
      if (p.dATailed) {
        adapterAttached = true;
        if (side === "left") topEnd = barX + barW + stepScale;
        else                 botEnd = barX + barW + stepScale;
      } else if (p.original.overhangType === "3_prime") {
        if (side === "left") topEnd = barX + barW + p.original.overhangLen * stepScale;
        else                 botEnd = barX + barW + p.original.overhangLen * stepScale;
      }
    }
    const INSERT_BLUE = "#0ea5e9";
    const INSERT_NAVY = "#0369a1";
    const ADAPTER_PURPLE = "#8b5cf6";
    const ADAPTER_PURPLE_DARK = "#6d28d9";
    const els = [];
    els.push(<rect key="top" x={barX} y={yTop - 3} width={Math.max(2, topEnd - barX)} height="6" fill={INSERT_BLUE} opacity="0.92" rx="1.5" />);
    els.push(<rect key="bot" x={barX} y={yBot - 3} width={Math.max(2, botEnd - barX)} height="6" fill={INSERT_NAVY} opacity="0.92" rx="1.5" />);
    els.push(<text key="t5" x={barX - 6} y={yTop + 3} fontSize="8" fill="#475569" textAnchor="end" fontWeight="700" style={{ fontFamily: "JetBrains Mono, monospace" }}>5′</text>);
    els.push(<text key="b3" x={barX - 6} y={yBot + 3} fontSize="8" fill="#475569" textAnchor="end" fontWeight="700" style={{ fontFamily: "JetBrains Mono, monospace" }}>3′</text>);
    // For pol + adapter steps, show terminal base pill
    if (step === "pol" || step === "adapter") {
      const topTerm = side === "left" ? p.top3After : p.top3Before;
      const botTerm = side === "right" ? p.bot3After : p.bot3Before;
      if (topTerm && topTerm !== "?") {
        const tag = topTerm.slice(-2);
        els.push(
          <g key="tseq" transform={`translate(${topEnd + 3}, ${yTop})`}>
            <rect x="0" y="-6" width={tag.length * 6 + 4} height="9" rx="1.5" fill={p.dATailed && side === "left" ? "#10b981" : "#94a3b8"} />
            <text x={(tag.length * 6 + 4) / 2} y="1.5" fontSize="7.5" fill="white" textAnchor="middle" fontWeight="800" style={{ fontFamily: "JetBrains Mono, monospace" }}>{tag}</text>
          </g>
        );
      }
      if (botTerm && botTerm !== "?") {
        const tag = botTerm.slice(-2);
        els.push(
          <g key="bseq" transform={`translate(${botEnd + 3}, ${yBot})`}>
            <rect x="0" y="-6" width={tag.length * 6 + 4} height="9" rx="1.5" fill={p.dATailed && side === "right" ? "#10b981" : "#94a3b8"} />
            <text x={(tag.length * 6 + 4) / 2} y="1.5" fontSize="7.5" fill="white" textAnchor="middle" fontWeight="800" style={{ fontFamily: "JetBrains Mono, monospace" }}>{tag}</text>
          </g>
        );
      }
    }
    if (adapterAttached) {
      const adapterLen = 60;
      const adapterStart = Math.min(topEnd, botEnd) + 10;
      const adapterEnd = adapterStart + adapterLen;
      els.push(
        <g key="adapter">
          <rect x={adapterStart} y={yTop - 3} width={adapterLen} height="6" fill={ADAPTER_PURPLE} opacity="0.9" rx="1.5" />
          <rect x={adapterStart} y={yBot - 3} width={adapterLen} height="6" fill={ADAPTER_PURPLE_DARK} opacity="0.9" rx="1.5" />
          <g transform={`translate(${adapterStart - 8}, ${side === "left" ? yTop : yBot})`}>
            <rect x="-7" y="-6" width="14" height="9" rx="1.5" fill="#f59e0b" />
            <text x="0" y="1.5" fontSize="7.5" fill="white" textAnchor="middle" fontWeight="800" style={{ fontFamily: "JetBrains Mono, monospace" }}>T</text>
          </g>
          <line x1={adapterStart - 1} x2={side === "left" ? topEnd + 1 : botEnd + 1}
                y1={side === "left" ? yTop : yBot}
                y2={side === "left" ? yTop : yBot}
                stroke="#f59e0b" strokeWidth="1.4" strokeDasharray="1 1" />
          <text x={adapterStart + adapterLen / 2} y={yBot + 14} fontSize="8" fill={ADAPTER_PURPLE_DARK} textAnchor="middle" fontWeight="700" style={{ letterSpacing: "0.05em" }}>T/A ADAPTER</text>
          <text x={adapterEnd + 2} y={yTop + 2.5} fontSize="8" fill={ADAPTER_PURPLE_DARK} fontWeight="700">R1 →</text>
        </g>
      );
    }
    if (step === "adapter" && !p.dATailed) {
      els.push(
        <g key="notcomp" transform={`translate(${barX + barW + 30}, ${(yTop + yBot) / 2})`}>
          <circle cx="0" cy="0" r="12" fill="#fee2e2" stroke="#e11d48" strokeWidth="1.4" />
          <text x="0" y="3.5" fontSize="13" fill="#e11d48" textAnchor="middle" fontWeight="800">✗</text>
          <text x="18" y="0" fontSize="8.5" fill="#e11d48" fontWeight="700">T/A fails</text>
          <text x="18" y="10" fontSize="7.5" fill="#be123c">
            {p.original.overhangType === "3_prime" ? "3′ overhang blocks dA" : "No dA"}
          </text>
        </g>
      );
    }
    return <g>{els}</g>;
  };

  const renderRow = (y0, side, p, rowTitle) => (
    <g>
      <text x={m.l} y={y0 - 6} fontSize="12" fill="#1f2937" fontWeight="700">{rowTitle}</text>
      <text x={m.l + 170} y={y0 - 6} fontSize="10" fill="#64748b">
        Final: <tspan fontWeight="700" fill={p.dATailed ? "#10b981" : "#e11d48"} style={{ fontFamily: "JetBrains Mono, monospace" }}>{p.endCode}</tspan>
        {" · Adapter: "}
        <tspan fontWeight="700" fill={p.adapterCompatible ? "#10b981" : "#e11d48"}>
          {p.adapterCompatible ? "T/A ✓" : "T/A ✗"}
        </tspan>
      </text>
      {STEPS.map((step, i) => {
        const x0 = m.l + i * (stepW + 8);
        return (
          <g key={step.key} transform={`translate(${x0}, ${y0})`}>
            <rect x="0" y="0" width={stepW} height="26" rx="3" fill="#f1f5f9" />
            <text x={stepW / 2} y="11" fontSize="9.5" fill="#0f172a" textAnchor="middle" fontWeight="700">{step.label}</text>
            <text x={stepW / 2} y="22" fontSize="8" fill="#64748b" textAnchor="middle">{step.subtitle}</text>
            <rect x="0" y="30" width={stepW} height={rowH - 34} rx="3" fill="white" stroke="#e2e8f0" strokeWidth="0.8" />
            <g transform={`translate(0, 34)`}>{drawEnd(side, p, step.key)}</g>
            {i < STEPS.length - 1 && (
              <g transform={`translate(${stepW + 1}, ${rowH / 2})`}>
                <line x1="0" y1="0" x2="6" y2="0" stroke="#6366f1" strokeWidth="1.5" />
                <polygon points="4,-3 8,0 4,3" fill="#6366f1" />
              </g>
            )}
          </g>
        );
      })}
    </g>
  );

  return (
    <div className="bg-white rounded-lg border border-zinc-200 p-3 mb-3">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <div className="text-sm font-semibold text-zinc-800">Post-dA-tailing molecular products + adapter ligation</div>
          <p className="text-xs text-zinc-500 mt-0.5">
            Four-step reaction per end. Taq DNA polymerase has BOTH 5′→3′ polymerase AND 5′→3′ exonuclease activity — one enzyme handles both chewback and dA addition in the same tube. Taq lacks 3′→5′ proofreading, so 3′ overhangs survive both activities intact and block T/A ligation.
          </p>
        </div>
        <ExportMenu svgRef={svgRef} basename="post_tailing_reactions" label="Export" />
      </div>

      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" style={{ background: "white" }}>
        <rect x="0" y="0" width={W} height={H} fill="white" />
        <text x={W / 2} y="20" fontSize="13" fill="#0f172a" textAnchor="middle" fontWeight="700">
          Enzymatic end preparation + T/A adapter ligation
        </text>
        {renderRow(m.t + 14,                         "left",  leftP,  "LEFT fragment end")}
        {renderRow(m.t + rowH + rowGap + 14,         "right", rightP, "RIGHT fragment end")}
        <text x={W / 2} y={H - 14} fontSize="10.5" fill="#1f2937" textAnchor="middle" fontWeight="400">
          Blue = insert top strand · Navy = insert bot strand · Purple = T/A adapter · Yellow T = adapter's 3′-T overhang pairing with insert's dA · Green tag = dA-tailed 3′ terminus · Gray tag = unchanged 3′ terminus · Overhangs drawn ×{stepScale} for visibility
        </text>
      </svg>

      <div className="grid md:grid-cols-2 gap-3 mt-2 text-xs">
        {[["LEFT end", leftP, "left"], ["RIGHT end", rightP, "right"]].map(([title, p, side]) => (
          <div key={title} className="border border-zinc-200 rounded-lg p-2.5 bg-zinc-50">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="font-semibold text-zinc-800">{title}</span>
              <Pill tone={p.dATailed ? "emerald" : p.original.overhangType === "3_prime" ? "rose" : "amber"}>
                {p.endCode}
              </Pill>
              {p.adapterCompatible ? (
                <Pill tone="emerald">T/A ligation ✓</Pill>
              ) : (
                <Pill tone="rose">T/A ligation ✗</Pill>
              )}
            </div>
            <div className="mb-1.5">
              <span className="text-zinc-600 mr-2">Terminal:</span>
              <span className="font-mono text-zinc-800">top 3′ {side === "left" ? p.top3After : p.top3Before}</span>
              <span className="text-zinc-400 mx-1">·</span>
              <span className="font-mono text-zinc-800">bot 3′ {side === "right" ? p.bot3After : p.bot3Before}</span>
            </div>
            <div className="text-[11px] text-zinc-600 mb-1.5">{p.adapterReason}</div>
            <div className="text-[11px] text-zinc-600 border-t border-zinc-200 pt-1.5">
              <span className="font-semibold text-zinc-700">Reads from this end:</span> {p.readingDirection}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Compact +/- control used by EndStructureEditor. Label on the left,
// current offset (signed) in the middle, buttons on the right.
export function NudgeRow({ label, value, onMinus, onPlus }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-zinc-600">{label}</span>
      <span className="font-mono font-semibold text-zinc-800 tabular-nums min-w-[3ch] text-center">
        {value > 0 ? `+${value}` : value}
      </span>
      <div className="inline-flex rounded-md border border-zinc-300 overflow-hidden">
        <button onClick={onMinus} className="px-1.5 py-0.5 bg-white hover:bg-zinc-100 text-zinc-700 font-mono">−1</button>
        <button onClick={onPlus}  className="px-1.5 py-0.5 bg-white hover:bg-zinc-100 text-zinc-700 font-mono">+1</button>
      </div>
    </div>
  );
}

// Peak-shift analysis panel — quantifies the dotted-vs-solid visual overlay
// into per-dye bp shifts. For each current-sample peak, finds the nearest
// reference peak within tol and records the signed delta. Median is robust
// to outliers; mean is shown for transparency. Negative values = cut peaks
// are SMALLER in bp than uncut peaks (as expected for cleavage products).
export function PeakShiftPanel({ currentSample, referenceSample, currentPeaks, referencePeaks, palette }) {
  const colorFor = (d) => resolveDyeColor(d, palette);
  const [tol, setTol] = useState(2.5);
  const stats = useMemo(
    () => computePeakShiftStats(currentPeaks, referencePeaks, tol),
    [currentPeaks, referencePeaks, tol]
  );
  return (
    <Panel
      title="Peak shift analysis"
      subtitle={`Signed bp offset: peaks in ${currentSample} minus nearest peaks in ${referenceSample} within tolerance.`}
      className="mb-3"
      actions={
        <label className="flex items-center gap-2 text-xs">
          <span className="text-zinc-600">Tol</span>
          <input type="range" min="0.5" max="5" step="0.1" value={tol}
                 onChange={e => setTol(parseFloat(e.target.value))} className="accent-zinc-700 w-24" />
          <span className="tabular-nums text-zinc-600 w-14">{tol.toFixed(1)} bp</span>
        </label>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {["B", "G", "Y", "R"].map(d => {
          const s = stats.byDye[d] || { n: 0, medianShift: null, meanShift: null };
          const tone = s.medianShift == null ? "neutral"
            : s.medianShift < -0.3 ? "emerald"      // shifted smaller — cleavage expected sign
            : s.medianShift >  0.3 ? "rose"          // shifted larger — unexpected
            :                        "neutral";
          const toneBg = {
            neutral: "bg-zinc-50 border-zinc-200",
            emerald: "bg-emerald-50 border-emerald-200",
            rose:    "bg-rose-50 border-rose-200",
          }[tone];
          return (
            <div key={d} className={`px-3 py-2.5 rounded-lg border ${toneBg}`}>
              <div className="flex items-center gap-2 mb-1">
                <DyeChip dye={d} showLabel />
                <span className="ml-auto text-[11px] text-zinc-500">n={s.n}</span>
              </div>
              {s.n === 0 ? (
                <div className="text-xs text-zinc-400">no matched pairs</div>
              ) : (
                <>
                  <div className="text-xs text-zinc-600">
                    median <span className="font-mono font-semibold text-zinc-800 tabular-nums">
                      {s.medianShift > 0 ? "+" : ""}{s.medianShift.toFixed(2)} bp
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    mean {s.meanShift > 0 ? "+" : ""}{s.meanShift.toFixed(2)} bp
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 text-[11px] text-zinc-500">
        Totals: <span className="font-mono text-zinc-700">{stats.totalN}</span> matched peaks across all four dyes.
        {" "}Green = net shift to smaller sizes (expected after Cas9 cleavage); rose = shift to larger sizes (investigate).
      </div>
    </Panel>
  );
}

// Preprocessing controls block — rendered once for the current sample and,
// when pairing is active, a second time for the reference sample with its
// own `prep` state object. Factored into a component so the two instances
// stay in lockstep visually and only differ in the accent color on the
// border + title.
export function PrepControls({ title, accent = "zinc", prep, setPrepField }) {
  const borderCls = accent === "indigo" ? "border-indigo-200 bg-indigo-50/40" : "border-zinc-200";
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 pt-2 border-t ${borderCls}`}>
      <span className={`font-semibold uppercase tracking-wide ${accent === "indigo" ? "text-indigo-700" : "text-zinc-600"}`}>{title}</span>
      <label className="flex items-center gap-2" title="Smoothing algorithm applied to the raw trace. Savitzky–Golay preserves peak height; moving-average is fastest; median filter is most robust to single-sample spikes.">
        <span className="text-zinc-600">Smooth</span>
        <select value={prep.smooth} onChange={e => setPrepField("smooth", e.target.value)}
                className="px-1.5 py-0.5 text-xs border border-zinc-300 rounded bg-white focus-ring">
          <option value="none">None (raw)</option>
          <option value="savgol">Savitzky–Golay</option>
          <option value="moving">Moving average</option>
          <option value="median">Median filter</option>
        </select>
      </label>
      {prep.smooth === "savgol" && (
        <>
          <label className="flex items-center gap-2">
            <span className="text-zinc-600">Window</span>
            <select value={prep.savgolWindow} onChange={e => setPrepField("savgolWindow", parseInt(e.target.value, 10))}
                    className="px-1.5 py-0.5 text-xs border border-zinc-300 rounded bg-white focus-ring">
              {[5, 7, 9, 11, 13, 15, 17, 19, 21].map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-zinc-600">Order</span>
            <select value={prep.savgolOrder} onChange={e => setPrepField("savgolOrder", parseInt(e.target.value, 10))}
                    className="px-1.5 py-0.5 text-xs border border-zinc-300 rounded bg-white focus-ring">
              <option value={2}>2 (quadratic)</option>
              {prep.savgolWindow >= 7 && prep.savgolWindow <= 9 && <option value={4}>4 (quartic)</option>}
            </select>
          </label>
        </>
      )}
      {prep.smooth === "moving" && (
        <label className="flex items-center gap-2">
          <span className="text-zinc-600">Window</span>
          <select value={prep.movingWindow} onChange={e => setPrepField("movingWindow", parseInt(e.target.value, 10))}
                  className="px-1.5 py-0.5 text-xs border border-zinc-300 rounded bg-white focus-ring">
            {[3, 5, 7, 9, 11, 15, 21, 31].map(w => <option key={w} value={w}>{w}</option>)}
          </select>
        </label>
      )}
      {prep.smooth === "median" && (
        <label className="flex items-center gap-2">
          <span className="text-zinc-600">Window</span>
          <select value={prep.medianWindow} onChange={e => setPrepField("medianWindow", parseInt(e.target.value, 10))}
                  className="px-1.5 py-0.5 text-xs border border-zinc-300 rounded bg-white focus-ring">
            {[3, 5, 7, 9, 11, 15, 21].map(w => <option key={w} value={w}>{w}</option>)}
          </select>
        </label>
      )}
      <label className="flex items-center gap-1 cursor-pointer" title="Rolling-minimum baseline estimation, then subtract. Removes slow drift / dye leak.">
        <input type="checkbox" checked={prep.baseline}
               onChange={e => setPrepField("baseline", e.target.checked)} className="w-3.5 h-3.5 accent-emerald-600" />
        <span className="text-zinc-700">Baseline subtract</span>
      </label>
      {prep.baseline && (
        <label className="flex items-center gap-2">
          <span className="text-zinc-600">Window</span>
          <input type="number" min="11" max="2001" step="2" value={prep.baselineWindow}
                 onChange={e => setPrepField("baselineWindow", Math.max(11, parseInt(e.target.value, 10) || 201))}
                 className="w-20 px-1.5 py-0.5 text-xs border border-zinc-300 rounded bg-white focus-ring tabular-nums" />
        </label>
      )}
      <label className="flex items-center gap-1 cursor-pointer" title="Subtract the best-fit linear trend across the whole trace. Catches capillary-scale drift that a local rolling baseline can miss.">
        <input type="checkbox" checked={!!prep.detrend}
               onChange={e => setPrepField("detrend", e.target.checked)} className="w-3.5 h-3.5 accent-violet-600" />
        <span className="text-zinc-700">Detrend (linear)</span>
      </label>
      <label className="flex items-center gap-1 cursor-pointer" title="Cap the raw signal at a ceiling (tames saturated peaks without touching the peak table)">
        <input type="checkbox" checked={prep.clip}
               onChange={e => setPrepField("clip", e.target.checked)} className="w-3.5 h-3.5 accent-amber-600" />
        <span className="text-zinc-700">Clip saturated</span>
      </label>
      {prep.clip && (
        <label className="flex items-center gap-2">
          <span className="text-zinc-600">Ceiling</span>
          <input type="number" min="1000" step="500" value={prep.clipCeiling}
                 onChange={e => setPrepField("clipCeiling", Math.max(100, parseInt(e.target.value, 10) || 30000))}
                 className="w-24 px-1.5 py-0.5 text-xs border border-zinc-300 rounded bg-white focus-ring tabular-nums" />
        </label>
      )}
      <label className="flex items-center gap-1 cursor-pointer" title="Log10 transform — compresses dynamic range so small peaks and saturated peaks are both visible without clipping.">
        <input type="checkbox" checked={!!prep.log}
               onChange={e => setPrepField("log", e.target.checked)} className="w-3.5 h-3.5 accent-sky-600" />
        <span className="text-zinc-700">Log10 transform</span>
      </label>
      <label className="flex items-center gap-1 cursor-pointer" title="First-difference derivative — emphasizes peak edges; flat regions go to zero. Useful for detecting shoulders and peak splits.">
        <input type="checkbox" checked={!!prep.derivative}
               onChange={e => setPrepField("derivative", e.target.checked)} className="w-3.5 h-3.5 accent-rose-600" />
        <span className="text-zinc-700">1st derivative</span>
      </label>
    </div>
  );
}

