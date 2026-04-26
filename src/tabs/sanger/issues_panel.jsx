// src/tabs/sanger/issues_panel.jsx — auto-detected trace anomalies, severity-ranked.
//
// Lists every issue detected by lib/sanger_issues.js with a per-issue
// "Show" button that zooms the main chromatogram to the issue's trace
// range. Each row also carries a small inline preview SVG (the 4-channel
// trace within ~20 data points around the issue) so the user can scan
// the panel without committing to a zoom.

import { useState, useMemo } from "react";
import { Th, Td } from "./_shared.jsx";

const ISSUE_TYPE_LABELS = {
  mixed_peak: { label: "Mixed peak", color: "#dc2626", emoji: "⚠" },
  low_signal: { label: "Low signal", color: "#f59e0b", emoji: "▼" },
  quality_dip: { label: "Quality dip", color: "#a16207", emoji: "↓" },
  n_run: { label: "N-rich region", color: "#7c3aed", emoji: "?" },
};

const SEVERITY_BADGE = {
  high: "bg-rose-100 text-rose-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-zinc-100 text-zinc-700",
};

export function IssuesPanel({ sample, qCutoff, issues, summary, onFocus }) {
  const [filter, setFilter] = useState("all");
  const visible = useMemo(() => {
    if (filter === "all") return issues;
    return issues.filter(i => i.severity === filter || i.type === filter);
  }, [issues, filter]);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 text-xs">
      <div className="font-medium text-zinc-800 mb-2 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span>Auto-detected issues</span>
          {summary.high > 0 && (
            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-rose-100 text-rose-800">
              {summary.high} high
            </span>
          )}
          {summary.medium > 0 && (
            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-800">
              {summary.medium} medium
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <FilterChip selected={filter} onChange={setFilter} value="all" label={`all (${summary.total})`} />
          {Object.entries(ISSUE_TYPE_LABELS).map(([t, info]) => (
            summary.byType[t] ? (
              <FilterChip key={t} selected={filter} onChange={setFilter} value={t} label={`${info.label} (${summary.byType[t]})`} />
            ) : null
          ))}
        </div>
      </div>
      <div className="max-h-96 overflow-auto">
        <table className="w-full">
          <thead className="text-[10px] uppercase tracking-wider text-zinc-500 sticky top-0 bg-white">
            <tr>
              <Th>Type</Th>
              <Th>Severity</Th>
              <Th>Position (bp)</Th>
              <Th>Description</Th>
              <Th>Preview</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {visible.map((iss, i) => {
              const info = ISSUE_TYPE_LABELS[iss.type] || { label: iss.type, color: "#6b7280", emoji: "?" };
              return (
                <tr key={i} className="border-t border-zinc-100 hover:bg-zinc-50">
                  <Td>
                    <span className="inline-flex items-center gap-1">
                      <span style={{ color: info.color }}>{info.emoji}</span>
                      {info.label}
                    </span>
                  </Td>
                  <Td>
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${SEVERITY_BADGE[iss.severity]}`}>
                      {iss.severity}
                    </span>
                  </Td>
                  <Td className="font-mono">{iss.rangeBp[0] + 1}–{iss.rangeBp[1]}</Td>
                  <Td>{iss.description}</Td>
                  <Td>
                    <IssueMiniPreview sample={sample} issue={iss} />
                  </Td>
                  <Td>
                    <button
                      onClick={() => onFocus(iss)}
                      className="px-2 py-0.5 rounded border border-zinc-300 text-[10px] hover:bg-zinc-100"
                    >
                      Show →
                    </button>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {visible.length === 0 && (
        <div className="text-zinc-500 italic px-2 py-1">No issues match the current filter.</div>
      )}
      <div className="mt-2 text-[10px] text-zinc-500">
        Detection thresholds tuned for typical Sanger reads (Q≥{qCutoff} trim window). Click "Show →" to focus the main chromatogram on an issue.
      </div>
    </div>
  );
}

function FilterChip({ selected, onChange, value, label }) {
  const active = selected === value;
  return (
    <button
      onClick={() => onChange(value)}
      className={`px-2 py-0.5 rounded text-[10px] border ${
        active ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50"
      }`}
    >
      {label}
    </button>
  );
}

function IssueMiniPreview({ sample, issue }) {
  const W = 100, H = 28;
  const padX = 2;
  const plotW = W - 2 * padX;
  const [tStart, tEnd] = issue.traceRange;
  const span = Math.max(1, tEnd - tStart);
  const padTrace = Math.max(5, Math.floor(span * 0.3));
  const xLo = Math.max(0, tStart - padTrace);
  const xHi = tEnd + padTrace;
  const xToPx = (x) => padX + ((x - xLo) / Math.max(1, xHi - xLo)) * plotW;

  // Find max channel value within the visible mini-window.
  let maxV = 50;
  for (const base of ["A", "C", "G", "T"]) {
    const tr = sample.traces[base];
    if (!tr) continue;
    for (let i = xLo; i <= xHi; i++) if ((tr[i] ?? 0) > maxV) maxV = tr[i];
  }
  const yToPx = (v) => H - 2 - (v / maxV) * (H - 4);

  const baseColors = { A: "#16a34a", C: "#2563eb", G: "#000000", T: "#dc2626" };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} preserveAspectRatio="none">
      {/* Issue range highlight */}
      <rect x={xToPx(tStart)} y={1} width={Math.max(2, xToPx(tEnd) - xToPx(tStart))} height={H - 2}
            fill="#fde68a" fillOpacity={0.6} />
      {["G", "A", "T", "C"].map(base => {
        const tr = sample.traces[base];
        if (!tr) return null;
        let d = "";
        for (let i = xLo; i <= xHi; i++) {
          const v = tr[i] ?? 0;
          d += `${i === xLo ? "M" : "L"}${xToPx(i).toFixed(1)},${yToPx(v).toFixed(1)} `;
        }
        return <path key={base} d={d} stroke={baseColors[base]} strokeWidth={0.6} fill="none" opacity={0.85} />;
      })}
    </svg>
  );
}
