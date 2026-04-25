// src/components/chrome.jsx
// Issue #13 Phase C.8: app chrome lifted out of FragmentViewer.jsx.
//
//   - Toolbar      — 48-px dark bar across the top (brand, construct chip,
//                   upload, palette select, report, DNA-diagrams, CSV, link, ?).
//   - Sidebar      — left workflow rail + "Lab tools" external links.
//   - SidebarLink  — one external link in the rail.
//   - StatusBar    — 28-px bottom bar (sample count, peak count, construct,
//                   calibration state, version pill).

import {
  Microscope, Database, RotateCcw, FileDown, ExternalLink,
  CheckCircle2, AlertTriangle, Sun, Moon,
  Activity, Crosshair, Scissors, Layers, GitCompare,
} from "lucide-react";
import { Pill, ToolButton } from "./primitives.jsx";
import { UploadButton } from "./drop_zone.jsx";

export function Toolbar({ sampleCount, onUpload, onResetCalibration, onOpenReport, palette, setPalette, onDownloadCsv, onCopyLink, onOpenHelp, onOpenDnaDiagrams, onOpenExportStudio, darkMode, setDarkMode }) {
  return (
    <header className="h-12 flex items-center gap-4 px-4 bg-zinc-950 text-zinc-100 border-b border-zinc-800 no-print">
      <div className="flex items-center gap-2.5">
        <div className="p-1.5 rounded-md bg-zinc-800/80 ring-1 ring-zinc-700">
          <Microscope size={16} className="text-sky-400" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold tracking-tight">Fragment Viewer</span>
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">Athey Lab · SMS</span>
        </div>
      </div>
      <div className="h-6 w-px bg-zinc-800" />
      <div className="hidden md:flex items-center gap-2 text-xs">
        <Pill tone="dark" className="!bg-zinc-900 !border-zinc-700 !text-zinc-300">
          <span className="text-zinc-500">construct</span>
          <span className="font-mono text-zinc-100">V059_gRNA3</span>
        </Pill>
        <Pill tone="dark" className="!bg-zinc-900 !border-zinc-700 !text-zinc-300">
          <Database size={10} className="text-zinc-500" />
          <span className="font-mono text-zinc-100">{sampleCount}</span>
          <span className="text-zinc-500">samples</span>
        </Pill>
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-1">
        <UploadButton onData={onUpload} />
        <ToolButton icon={RotateCcw} variant="dark" title="Reset all per-dye mobility offsets to zero" onClick={onResetCalibration}>
          Reset calib.
        </ToolButton>
        <select
          value={palette}
          onChange={e => setPalette(e.target.value)}
          title="Dye color palette — switch to a colorblind-safe palette if needed"
          className="px-2 py-1 text-xs bg-zinc-900 text-zinc-200 border border-zinc-700 rounded-md hover:bg-zinc-800 focus-ring"
        >
          <option value="default">Default palette</option>
          <option value="wong">Wong (CB-safe, Nature Methods)</option>
          <option value="ibm">IBM (CB-safe, slides)</option>
          <option value="grayscale">Grayscale (print)</option>
        </select>
        <ToolButton icon={FileDown} variant="dark" title="Build a one-page report: sample summary, offsets, top peaks — saveable as PDF or markdown" onClick={onOpenReport}>
          Report
        </ToolButton>
        <ToolButton icon={FileDown} variant="dark" title="Open the DNA diagrams panel — construct architecture (with/without cut) + ssDNA cut products. Bundled SVG / PNG / JPG / WebP export at any resolution." onClick={onOpenDnaDiagrams}>
          DNA diagrams
        </ToolButton>
        <ToolButton icon={FileDown} variant="dark" title="Download the full peak table as a tidy long-format CSV (sample, dye, size, height, area, width). Ready for pandas / R / Excel." onClick={onDownloadCsv}>
          CSV
        </ToolButton>
        <ToolButton icon={ExternalLink} variant="dark" title="Copy a shareable URL that restores the current view (sample, zoom, channels, palette, pairing) on another machine" onClick={onCopyLink}>
          Link
        </ToolButton>
        {onOpenExportStudio && (
          <ToolButton
            icon={FileDown}
            variant="dark"
            title="Open the Export panel — single-pane-of-glass for CSV / Report / DNA diagrams / shareable URL exports"
            onClick={onOpenExportStudio}
          >
            Export…
          </ToolButton>
        )}
        <ToolButton
          icon={darkMode ? Sun : Moon}
          variant="dark"
          title={darkMode ? "Switch to light mode (viewing only; exported figures always stay on white)" : "Switch to dark mode (viewing only; exported figures always stay on white)"}
          onClick={() => setDarkMode(!darkMode)}
        >
          {darkMode ? "Light" : "Dark"}
        </ToolButton>
        <ToolButton variant="dark" title="Keyboard shortcuts (press ? anywhere)" onClick={onOpenHelp}>
          ?
        </ToolButton>
      </div>
    </header>
  );
}

// Left rail. Sectioned: Workflow on top, Resources at bottom (links to lab tools).
export function Sidebar({ tab, setTab }) {
  const tabs = [
    { id: "trace",     label: "Electropherogram",  icon: Activity,   hint: "Per-sample trace, smoothing, ladder overlay" },
    { id: "peakid",    label: "Peak ID",           icon: Crosshair,  hint: "Match observed peaks to expected positions" },
    { id: "cutpred",   label: "Cut Prediction",    icon: Scissors,   hint: "Enumerate gRNAs and predict ssDNA products" },
    { id: "autoclass", label: "Auto Classify",     icon: Layers,     hint: "Cluster and identify peaks across all dyes" },
    { id: "compare",   label: "Cross-Sample",      icon: GitCompare, hint: "Overhang offsets and purity grid" },
    { id: "heatmap",   label: "Batch Heatmap",     icon: Database,   hint: "Sample × species heatmap · 96-well-plate view" },
    { id: "sanger",    label: "Sanger",            icon: Microscope, hint: "Sanger .ab1 chromatogram + alignment vs .dna reference" },
  ];
  return (
    <nav className="w-52 shrink-0 bg-white border-r border-zinc-200 flex flex-col no-print">
      <div className="px-3 pt-3 pb-1">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Workflow</div>
      </div>
      <ul className="flex flex-col px-2 gap-0.5">
        {tabs.map((t, i) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <li key={t.id}>
              <button
                onClick={() => setTab(t.id)}
                title={t.hint}
                className={`group w-full flex items-center gap-2.5 px-2.5 py-1.5 text-sm rounded-md transition focus-ring ${
                  active
                    ? "bg-zinc-900 text-white"
                    : "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"
                }`}
              >
                <Icon size={15} className={active ? "text-sky-400" : "text-zinc-500 group-hover:text-zinc-700"} />
                <span className="font-medium truncate">{t.label}</span>
                <span className="ml-auto text-[10px] font-mono text-zinc-500/70">{i + 1}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto p-3 border-t border-zinc-100">
        <div className="text-[10px] text-zinc-500 leading-snug">
          Drag a GeneMapper TSV anywhere in this window to swap datasets.
        </div>
      </div>
    </nav>
  );
}

export function SidebarLink({ href, label }) {
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 px-1.5 py-0.5 rounded hover:bg-zinc-100 hover:text-zinc-900 transition"
      >
        <ExternalLink size={10} className="text-zinc-400" />
        <span className="truncate">{label}</span>
      </a>
    </li>
  );
}

// Bottom status bar. Always visible. CLI-style readout.
export function StatusBar({ sampleCount, peakCount, calibrated, construct }) {
  return (
    <footer className="h-7 flex items-center gap-3 px-3 bg-zinc-100 text-zinc-600 border-t border-zinc-200 text-[11px] no-print">
      <span className="flex items-center gap-1.5">
        <Database size={11} className="text-zinc-400" />
        <span className="text-zinc-500">samples</span>
        <span className="font-mono text-zinc-800">{sampleCount}</span>
      </span>
      <span className="text-zinc-300">·</span>
      <span className="flex items-center gap-1">
        <span className="text-zinc-500">peaks</span>
        <span className="font-mono text-zinc-800 num">{peakCount.toLocaleString()}</span>
      </span>
      <span className="text-zinc-300">·</span>
      <span className="flex items-center gap-1">
        <span className="text-zinc-500">construct</span>
        <span className="font-mono text-zinc-800">{construct}</span>
      </span>
      <span className="text-zinc-300">·</span>
      <span className="flex items-center gap-1">
        {calibrated
          ? <CheckCircle2 size={11} className="text-emerald-600" />
          : <AlertTriangle size={11} className="text-amber-600" />}
        <span className={calibrated ? "text-emerald-700" : "text-amber-700"}>
          {calibrated ? "calibrated" : "uncalibrated"}
        </span>
      </span>
      <div className="flex-1" />
      <a
        href="https://github.com/Single-Molecule-Sequencing/fragment-viewer"
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-zinc-500 hover:text-zinc-900"
      >
        v0.7.0
      </a>
    </footer>
  );
}

// ======================================================================
// TAB 1 — Single-sample electropherogram viewer with high-res trace
// ======================================================================
// Per-sample style row — one instance per overlaid sample. Each row carries
// independent controls for stroke width, stroke opacity, fill opacity, and
