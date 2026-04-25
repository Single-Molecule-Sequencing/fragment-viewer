// src/components/export_studio_modal.jsx — single-pane-of-glass Export Studio.
//
// Aggregates the existing export entry points (CSV peak table, full PDF /
// Markdown report, DNA diagram bundle, shareable URL) into one discoverable
// modal. Additive: every existing button keeps working — power users who
// know the toolbar shortcuts don't lose them. New users get a categorized
// menu describing what each export contains.
//
// The modal does NOT re-implement export logic. It dispatches to the same
// handlers the existing toolbar buttons use, so there is exactly one
// implementation of "download CSV", one of "open report modal", etc.

import { useState } from "react";
import {
  X, FileDown, Database, Layers, ExternalLink, BookOpen, CheckCircle2,
} from "lucide-react";

const ICONS = {
  csv: Database,
  report: BookOpen,
  diagrams: Layers,
  link: ExternalLink,
};

export function ExportStudioModal({
  open,
  onClose,
  onDownloadCsv,
  onOpenReport,
  onOpenDnaDiagrams,
  onCopyLink,
  sampleCount = 0,
  hasUserData = false,
}) {
  const [confirm, setConfirm] = useState("");

  if (!open) return null;

  const flash = (msg) => {
    setConfirm(msg);
    setTimeout(() => setConfirm(""), 2000);
  };

  const items = [
    {
      key: "csv",
      label: "Peak table CSV",
      blurb: "Tidy long-format peak table (sample, dye, size_bp, height, area, width_fwhm_bp). Drop straight into pandas / R / Excel.",
      action: () => { onDownloadCsv?.(); flash("CSV downloaded"); },
      disabled: sampleCount === 0,
      cta: "Download CSV",
    },
    {
      key: "report",
      label: "Full report (PDF or Markdown)",
      blurb: "Multi-section dataset summary: stats, dye offsets, expected species, paired electropherograms, post-tailing products, data tables. Open the report panel and choose Print / Save as PDF or Download Markdown.",
      action: () => { onOpenReport?.(); onClose(); },
      cta: "Open report builder",
    },
    {
      key: "diagrams",
      label: "DNA diagrams (SVG / PNG bundle)",
      blurb: "Construct architecture (PAM + cut site annotations) and ssDNA cut products. Bundle export at 2×–8× raster or native SVG for Illustrator.",
      action: () => { onOpenDnaDiagrams?.(); onClose(); },
      cta: "Open diagrams panel",
    },
    {
      key: "link",
      label: "Shareable view URL",
      blurb: "Copy a URL that restores the current view (sample, zoom, channels, palette, pairing) on another machine. Encoded in the URL fragment — never sent to a server.",
      action: () => { onCopyLink?.(); flash("URL copied to clipboard"); },
      disabled: !hasUserData && sampleCount === 0,
      cta: "Copy URL",
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fv-export-studio-title"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-[640px] max-w-[95vw] max-h-[90vh] overflow-auto"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 py-4 border-b border-zinc-200">
          <div>
            <div id="fv-export-studio-title" className="font-semibold text-zinc-900 flex items-center gap-2">
              <FileDown size={16} className="text-indigo-600" /> Export
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              {sampleCount > 0
                ? `${sampleCount} sample${sampleCount === 1 ? "" : "s"} loaded — pick what to export.`
                : "Load a dataset (drag-drop or use the demo) to enable data exports."}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-700 p-1 rounded"
            aria-label="Close export panel"
          >
            <X size={18} />
          </button>
        </header>

        <ul className="divide-y divide-zinc-100">
          {items.map(item => {
            const Icon = ICONS[item.key];
            return (
              <li key={item.key} className="px-5 py-4 flex items-start gap-4">
                <div className="w-9 h-9 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-700 flex-none">
                  <Icon size={18} />
                </div>
                <div className="flex-1">
                  <div className="font-medium text-zinc-900 text-sm">{item.label}</div>
                  <p className="text-xs text-zinc-600 mt-1 leading-relaxed">{item.blurb}</p>
                </div>
                <button
                  onClick={item.action}
                  disabled={item.disabled}
                  className="flex-none px-3 py-1.5 rounded text-xs font-medium bg-indigo-600 text-white disabled:bg-zinc-300 disabled:text-zinc-600 hover:bg-indigo-700"
                >
                  {item.cta}
                </button>
              </li>
            );
          })}
        </ul>

        <footer className="px-5 py-3 bg-zinc-50 border-t border-zinc-200 flex items-center justify-between">
          {confirm ? (
            <span className="text-xs text-emerald-700 flex items-center gap-1">
              <CheckCircle2 size={12} /> {confirm}
            </span>
          ) : (
            <span className="text-[11px] text-zinc-500">
              Per-plot SVG / PNG buttons remain available on each chromatogram for in-context exports.
            </span>
          )}
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-xs border border-zinc-300 hover:bg-zinc-100"
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
