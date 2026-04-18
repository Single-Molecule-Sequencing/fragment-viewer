// src/components/drop_zone.jsx
// Issue #13 follow-up (runtime fix for v0.26.1): DropOverlay + UploadButton.
//
// DropOverlay listens for drag events window-wide; on drop parses GeneMapper
// TSV or ABIF .fsa files and calls onData(peaks, traces). UploadButton is
// the toolbar button with the same parsing logic behind a file input.
//
// These were the last two components forcing chrome.jsx to import from
// FragmentViewer.jsx — that circular edge caused Rollup to emit a bundle
// where Toolbar's lexical binding was not populated by the time the main
// render tried to read it. Moving both here cuts the cycle.

import { useState, useRef, useEffect } from "react";
import { Upload, AlertTriangle } from "lucide-react";
import { ToolButton } from "./primitives.jsx";
import { parseFsaArrayBuffer, parseGenemapperTSV } from "../lib/abif.js";

// ----------------------------------------------------------------------
// Drag-drop zone for new GeneMapper TSV exports.
// Listens for drag events anywhere in the window and lights up only while
// a file is being dragged. On drop, parses the TSV and calls onData. The
// toolbar Upload button uses the same handleFiles via a ref; see Toolbar.
// ----------------------------------------------------------------------
export function DropOverlay({ onData }) {
  const [active, setActive] = useState(false);
  const [error, setError] = useState(null);

  const handleFiles = async (files) => {
    setError(null);
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    // Route by extension: .fsa = ABIF binary (one sample per file, batch
    // multi-drop OK); .txt/.tsv/.csv = GeneMapper peak-table TSV.
    const fsa = arr.filter(f => /\.fsa$/i.test(f.name));
    const tsv = arr.filter(f => /\.(txt|tsv|csv)$/i.test(f.name));
    try {
      const merged = {};
      const mergedTraces = {};
      let warnings = [];
      for (const f of fsa) {
        const buf = await f.arrayBuffer();
        const { sampleName, peaks, calibrated, traces, bpAxis } = parseFsaArrayBuffer(buf, f.name);
        if (!calibrated) {
          warnings.push(`${sampleName}: LIZ size standard not calibratable; skipped`);
          continue;
        }
        const key = merged[sampleName] ? `${sampleName}_${f.name.replace(/\.[Ff][Ss][Aa]$/, "")}` : sampleName;
        merged[key] = peaks;
        mergedTraces[key] = { ...traces, bpAxis };
      }
      for (const f of tsv) {
        const text = await f.text();
        const parsed = parseGenemapperTSV(text);
        Object.assign(merged, parsed.peaks);
      }
      const n = Object.keys(merged).length;
      if (n === 0) {
        setError("No samples loaded. Drop GeneMapper .txt/.tsv or ABIF .fsa files.");
        return;
      }
      if (warnings.length) setError(warnings.join("; "));
      onData(merged, mergedTraces);
    } catch (e) {
      setError(e.message || "Failed to parse file(s)");
    }
  };

  useEffect(() => {
    let depth = 0;
    const onEnter = (e) => { e.preventDefault(); depth++; if (e.dataTransfer?.types?.includes("Files")) setActive(true); };
    const onLeave = (e) => { e.preventDefault(); depth--; if (depth <= 0) { setActive(false); depth = 0; } };
    const onOver  = (e) => { e.preventDefault(); };
    const onDrop  = (e) => { e.preventDefault(); depth = 0; setActive(false); handleFiles(e.dataTransfer?.files); };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  // Auto-clear errors after 4 s
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(t);
  }, [error]);

  return (
    <>
      {active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none no-print">
          <div className="absolute inset-0 bg-sky-500/10 backdrop-blur-[1px]" />
          <div className="relative px-8 py-6 rounded-2xl border-2 border-dashed border-sky-500 bg-white shadow-2xl max-w-md mx-4">
            <div className="flex items-center gap-3 text-sky-700">
              <div className="p-2 rounded-lg bg-sky-50">
                <Upload size={20} />
              </div>
              <div>
                <div className="text-base font-semibold tracking-tight">Drop to load dataset</div>
                <div className="text-xs text-zinc-500 mt-0.5">
                  GeneMapper TSV (.txt/.tsv/.csv) <strong>or ABIF .fsa</strong> binary trace files. Multi-file drop OK; .fsa peaks are auto-called via LIZ calibration.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {error && (
        <div className="fixed bottom-10 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-600 text-white text-xs shadow-xl no-print">
          <AlertTriangle size={14} />
          <span>{error}</span>
        </div>
      )}
    </>
  );
}

// Compact upload button used by the Toolbar. Mirrors DropOverlay's parser.
export function UploadButton({ onData }) {
  const inputRef = useRef(null);
  return (
    <>
      <ToolButton
        icon={Upload}
        variant="dark"
        title="Load GeneMapper TSV (.txt/.tsv/.csv) or ABIF .fsa files. Drag-drop anywhere in the window also works."
        onClick={() => inputRef.current?.click()}
      >
        Load data
      </ToolButton>
      <input
        ref={inputRef}
        type="file"
        accept=".txt,.tsv,.csv,.fsa,.ab1"
        multiple
        onChange={async (e) => {
          const files = Array.from(e.target.files || []);
          if (files.length === 0) return;
          try {
            const merged = {};
            const mergedTraces = {};
            for (const f of files) {
              if (/\.fsa$/i.test(f.name) || /\.ab1$/i.test(f.name)) {
                const buf = await f.arrayBuffer();
                const { sampleName, peaks, calibrated, traces, bpAxis } = parseFsaArrayBuffer(buf, f.name);
                if (calibrated) {
                  const key = merged[sampleName] ? `${sampleName}_${f.name.replace(/\.[Ff][Ss][Aa]$/, "")}` : sampleName;
                  merged[key] = peaks;
                  mergedTraces[key] = { ...traces, bpAxis };
                }
              } else {
                const parsed = parseGenemapperTSV(await f.text());
                Object.assign(merged, parsed.peaks);
              }
            }
            if (Object.keys(merged).length > 0) onData(merged, mergedTraces);
          } catch (err) {
            console.error("[fragment-viewer] file parse failed:", err);
          }
          e.target.value = "";
        }}
        className="hidden"
      />
    </>
  );
}
