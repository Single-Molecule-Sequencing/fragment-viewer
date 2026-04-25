// src/tabs/sanger_tab.jsx — 7th tab: Sanger .ab1 chromatogram viewer +
// alignment-to-reference QC.
//
// Reuses the same drag-drop UX and reference-loading conventions as the
// other tabs. Inputs:
//   - .ab1 / .scf  → parseSangerAbif → basecalls + Q-scores + 4-channel trace
//   - .dna         → parseSnapgene  → reference construct sequence
//   - .fasta       → first record's sequence → reference
//   - text paste   → reference (raw sequence or FASTA-formatted)
//
// Outputs:
//   - Per-sample chromatogram (SVG, 4 channels, basecall labels, Q-score line)
//   - Mott Q-trim guides on the chromatogram
//   - Alignment-to-reference: identity %, verdict pill, mismatch table
//   - CSV / SVG / PNG export
//
// Mirrors golden-gate/lib/qc/sanger.py's analytics so the same .ab1 +
// reference pair produces the same identity number in both tools.

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import {
  Upload, FileDown, AlertTriangle, CheckCircle2, Microscope,
} from "lucide-react";

import { parseSangerAbif } from "../lib/abif.js";
import { parseSnapgene } from "../lib/snapgene.js";
import {
  mottTrim,
  scoreSangerVsReference,
} from "../lib/sanger.js";
import { downloadBlob } from "../lib/export.js";

// Sanger dye-channel convention. Different from CE (B/G/Y/R for fluorophore
// hardware channels); Sanger maps each base to a fixed color so the eye can
// read the chromatogram at a glance.
const SANGER_BASE_COLORS = {
  A: "#16a34a", // green
  C: "#2563eb", // blue
  G: "#000000", // black
  T: "#dc2626", // red
  N: "#9ca3af",
};

const VERDICT_STYLE = {
  pass: { bg: "bg-emerald-100", text: "text-emerald-800", label: "PASS" },
  warn: { bg: "bg-amber-100",   text: "text-amber-800",   label: "WARN" },
  fail: { bg: "bg-rose-100",    text: "text-rose-800",    label: "FAIL" },
};

function parseFasta(text) {
  // Returns the first record's sequence, ignoring '>' header line(s).
  if (!text) return "";
  const lines = text.split(/\r?\n/);
  if (lines[0]?.startsWith(">")) {
    const out = [];
    for (let i = 1; i < lines.length; i++) {
      const ln = lines[i];
      if (ln.startsWith(">")) break;
      out.push(ln.trim());
    }
    return out.join("").toUpperCase();
  }
  return text.replace(/\s+/g, "").toUpperCase();
}

export function SangerTab() {
  const [samples, setSamples] = useState({}); // {stem: parsed}
  const [active, setActive] = useState(null);
  const [reference, setReference] = useState("");
  const [referenceLabel, setReferenceLabel] = useState("");
  const [qCutoff, setQCutoff] = useState(20);
  const [error, setError] = useState(null);
  const [pasteOpen, setPasteOpen] = useState(false);

  const fileInputRef = useRef(null);

  // ----- File ingest --------------------------------------------------
  const ingestFile = useCallback(async (file) => {
    setError(null);
    const lower = file.name.toLowerCase();
    try {
      const buf = await file.arrayBuffer();
      if (lower.endsWith(".ab1") || lower.endsWith(".scf") || lower.endsWith(".fsa")) {
        const parsed = parseSangerAbif(buf, file.name);
        if (!parsed.basecalls) {
          setError(`${file.name}: no basecalls (PBAS tag missing). Is this a Sanger .ab1?`);
          return;
        }
        setSamples(prev => ({ ...prev, [parsed.sampleName]: parsed }));
        setActive(prev => prev ?? parsed.sampleName);
      } else if (lower.endsWith(".dna")) {
        const sg = parseSnapgene(buf);
        setReference(sg.sequence);
        setReferenceLabel(`${file.name} (${sg.length} bp${sg.isCircular ? ", circular" : ""})`);
      } else if (lower.endsWith(".fasta") || lower.endsWith(".fa") || lower.endsWith(".fna")) {
        const text = new TextDecoder().decode(buf);
        const seq = parseFasta(text);
        if (!seq) { setError(`${file.name}: no FASTA sequence found.`); return; }
        setReference(seq);
        setReferenceLabel(`${file.name} (${seq.length} bp)`);
      } else {
        setError(`${file.name}: unsupported. Drop .ab1, .scf, .dna, .fasta.`);
      }
    } catch (e) {
      setError(`${file.name}: ${e.message || e}`);
    }
  }, []);

  const onUploadInput = (e) => {
    for (const f of e.target.files || []) ingestFile(f);
    e.target.value = "";
  };

  // ----- Active sample analysis --------------------------------------
  const activeSample = active ? samples[active] : null;
  const score = useMemo(() => {
    if (!activeSample || !reference) return null;
    return scoreSangerVsReference(activeSample, reference, { qCutoff });
  }, [activeSample, reference, qCutoff]);

  // ----- CSV / SVG export --------------------------------------------
  const handleExportMismatchCsv = () => {
    if (!score) return;
    const rows = [["position_in_reference", "ref_base", "query_base", "kind"]];
    for (const m of score.mismatchList) {
      rows.push([m.position, m.refBase, m.queryBase, m.kind]);
    }
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    downloadBlob(blob, `sanger_mismatches_${active}.csv`);
  };
  const chromatogramRef = useRef(null);
  const handleExportSvg = () => {
    if (!chromatogramRef.current) return;
    const svg = chromatogramRef.current.outerHTML;
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    downloadBlob(blob, `sanger_chromatogram_${active}.svg`);
  };

  // ----- Render -------------------------------------------------------
  return (
    <div className="flex flex-col gap-4">
      <Header />

      {error && (
        <div className="flex items-start gap-2 px-3 py-2 rounded border border-rose-300 bg-rose-50 text-rose-900 text-sm">
          <AlertTriangle size={14} className="mt-0.5 flex-none" />
          <div className="flex-1">{error}</div>
          <button onClick={() => setError(null)} className="text-rose-700 hover:underline">dismiss</button>
        </div>
      )}

      <DropZone onFile={ingestFile} onPickFiles={() => fileInputRef.current?.click()}>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".ab1,.scf,.fsa,.dna,.fasta,.fa,.fna"
          onChange={onUploadInput}
          className="hidden"
        />
      </DropZone>

      <div className="grid grid-cols-12 gap-4">
        <SampleList
          className="col-span-3"
          samples={samples}
          active={active}
          onPick={setActive}
        />

        <div className="col-span-9 space-y-4">
          <ReferencePanel
            reference={reference}
            referenceLabel={referenceLabel}
            onClear={() => { setReference(""); setReferenceLabel(""); }}
            onPaste={() => setPasteOpen(true)}
          />

          {pasteOpen && (
            <PasteReferenceModal
              onClose={() => setPasteOpen(false)}
              onApply={(seq, label) => {
                setReference(seq);
                setReferenceLabel(label);
                setPasteOpen(false);
              }}
            />
          )}

          <ControlsBar
            qCutoff={qCutoff}
            setQCutoff={setQCutoff}
            score={score}
            onExportCsv={handleExportMismatchCsv}
            onExportSvg={handleExportSvg}
            disableExports={!score}
          />

          <ChromatogramPanel
            sample={activeSample}
            qCutoff={qCutoff}
            score={score}
            svgRef={chromatogramRef}
          />

          {score && <AlignmentSummary score={score} sample={activeSample} reference={reference} />}
          {score && <MismatchTable score={score} />}
        </div>
      </div>
    </div>
  );
}


// ----------------------------------------------------------------------
// Header
// ----------------------------------------------------------------------

function Header() {
  return (
    <div>
      <h1 className="text-xl font-bold flex items-center gap-2">
        <Microscope size={20} className="text-indigo-600" />
        Sanger Viewer
      </h1>
      <p className="mt-1 text-sm text-zinc-600">
        Drop <code>.ab1</code> chromatograms and a <code>.dna</code> / FASTA reference. Mott Q-trim, local alignment, mismatch enumeration. Same analytics as the golden-gate Python QC pipeline.
      </p>
    </div>
  );
}


// ----------------------------------------------------------------------
// Drop zone
// ----------------------------------------------------------------------

function DropZone({ onFile, onPickFiles, children }) {
  const [over, setOver] = useState(false);
  const onDragOver = (e) => { e.preventDefault(); e.stopPropagation(); setOver(true); };
  const onDragLeave = () => setOver(false);
  const onDrop = (e) => {
    e.preventDefault(); e.stopPropagation();
    setOver(false);
    for (const f of e.dataTransfer?.files || []) onFile(f);
  };
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`rounded-lg border-2 border-dashed p-4 text-sm flex items-center justify-between gap-3 transition-colors ${
        over ? "border-indigo-500 bg-indigo-50" : "border-zinc-300 bg-white"
      }`}
    >
      <div className="flex items-center gap-2 text-zinc-700">
        <Upload size={16} />
        <span>Drop <code>.ab1</code>, <code>.scf</code>, <code>.dna</code>, or <code>.fasta</code> files here</span>
      </div>
      <button
        onClick={onPickFiles}
        className="px-3 py-1.5 rounded bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-700"
      >
        Pick files…
      </button>
      {children}
    </div>
  );
}


// ----------------------------------------------------------------------
// Sample list
// ----------------------------------------------------------------------

function SampleList({ samples, active, onPick, className = "" }) {
  const names = Object.keys(samples).sort();
  if (names.length === 0) {
    return (
      <div className={`${className} rounded-lg border border-zinc-200 bg-white p-3 text-xs text-zinc-500`}>
        No samples yet. Drop one or more <code>.ab1</code> files.
      </div>
    );
  }
  return (
    <div className={`${className} rounded-lg border border-zinc-200 bg-white p-2 max-h-[28rem] overflow-auto`}>
      <div className="px-1 pb-1 text-[10px] uppercase tracking-wider text-zinc-500">Samples ({names.length})</div>
      <div className="flex flex-col gap-0.5">
        {names.map(n => (
          <button
            key={n}
            onClick={() => onPick(n)}
            className={`text-left px-2 py-1 rounded text-xs hover:bg-zinc-100 ${
              n === active ? "bg-indigo-100 text-indigo-900 font-medium" : "text-zinc-800"
            }`}
            title={`${samples[n].basecalls.length} bases, ${samples[n].qScores.length} Q-scores`}
          >
            <div className="truncate">{n}</div>
            <div className="text-[10px] text-zinc-500">
              {samples[n].basecalls.length} bp
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}


// ----------------------------------------------------------------------
// Reference panel
// ----------------------------------------------------------------------

function ReferencePanel({ reference, referenceLabel, onClear, onPaste }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 text-xs">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="font-medium text-zinc-800">Reference sequence</div>
        <div className="flex items-center gap-2">
          <button onClick={onPaste} className="px-2 py-1 rounded border border-zinc-300 hover:bg-zinc-50">
            Paste FASTA / sequence…
          </button>
          {reference && (
            <button onClick={onClear} className="px-2 py-1 rounded border border-zinc-300 hover:bg-zinc-50">
              Clear
            </button>
          )}
        </div>
      </div>
      {reference ? (
        <div className="text-zinc-700">
          <div className="text-[11px] font-medium">{referenceLabel || `${reference.length} bp`}</div>
          <div className="mt-1 font-mono text-[10px] truncate text-zinc-500">{reference.slice(0, 80)}{reference.length > 80 ? "…" : ""}</div>
        </div>
      ) : (
        <div className="text-zinc-500">
          Drop a <code>.dna</code> or <code>.fasta</code> file, or paste a sequence to enable alignment.
        </div>
      )}
    </div>
  );
}


function PasteReferenceModal({ onClose, onApply }) {
  const [text, setText] = useState("");
  const apply = () => {
    const seq = parseFasta(text);
    if (!seq) return;
    onApply(seq, `pasted (${seq.length} bp)`);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-2xl w-[600px] max-w-[95vw] p-4" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold mb-2">Paste reference</h3>
        <p className="text-xs text-zinc-600 mb-2">Accept FASTA (header line starting with <code>&gt;</code>) or raw A/C/G/T text.</p>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={10}
          className="w-full font-mono text-xs border border-zinc-300 rounded p-2"
          placeholder=">my_reference&#10;ATCGATCGATCGATCG..."
        />
        <div className="flex justify-end gap-2 mt-3">
          <button onClick={onClose} className="px-3 py-1.5 rounded border border-zinc-300">Cancel</button>
          <button onClick={apply} className="px-3 py-1.5 rounded bg-indigo-600 text-white">Use this</button>
        </div>
      </div>
    </div>
  );
}


// ----------------------------------------------------------------------
// Controls bar
// ----------------------------------------------------------------------

function ControlsBar({ qCutoff, setQCutoff, score, onExportCsv, onExportSvg, disableExports }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 flex flex-wrap items-center gap-4">
      <label className="text-xs flex items-center gap-2">
        <span className="text-zinc-700">Mott Q-cutoff</span>
        <input
          type="range" min={0} max={40} step={1}
          value={qCutoff}
          onChange={e => setQCutoff(parseInt(e.target.value, 10))}
          className="w-32"
        />
        <span className="font-mono text-zinc-900 w-8 text-right">{qCutoff}</span>
      </label>

      {score && <VerdictPill verdict={score.verdict} identity={score.identity} />}

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={onExportCsv}
          disabled={disableExports}
          className="px-2.5 py-1.5 rounded border border-zinc-300 text-xs flex items-center gap-1 disabled:opacity-40 hover:bg-zinc-50"
        >
          <FileDown size={12} /> CSV mismatches
        </button>
        <button
          onClick={onExportSvg}
          disabled={!score && true}
          className="px-2.5 py-1.5 rounded border border-zinc-300 text-xs flex items-center gap-1 disabled:opacity-40 hover:bg-zinc-50"
        >
          <FileDown size={12} /> SVG chromatogram
        </button>
      </div>
    </div>
  );
}

function VerdictPill({ verdict, identity }) {
  const v = VERDICT_STYLE[verdict] || VERDICT_STYLE.fail;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${v.bg} ${v.text}`}>
      {verdict === "pass" ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
      {v.label} · {(identity * 100).toFixed(2)}%
    </span>
  );
}


// ----------------------------------------------------------------------
// Chromatogram (SVG)
// ----------------------------------------------------------------------

function ChromatogramPanel({ sample, qCutoff, score, svgRef }) {
  if (!sample) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500">
        Pick a sample to view its chromatogram.
      </div>
    );
  }

  const { basecalls, qScores, peakLocations, traces } = sample;
  const trim = useMemo(() => mottTrim(qScores, qCutoff), [qScores, qCutoff]);

  // Visible window: clamp to peakLocations to avoid drawing the entire trace
  // when only a small Q-window is informative.
  const traceLen = traces.A?.length || traces.C?.length || traces.G?.length || traces.T?.length || 0;
  if (!traceLen) {
    return <div className="rounded-lg border border-zinc-200 bg-white p-3 text-sm text-zinc-500">No analyzed-trace channels (DATA9..12) in this file.</div>;
  }
  const xStart = peakLocations[0] ?? 0;
  const xEnd = peakLocations[peakLocations.length - 1] ?? traceLen - 1;
  const W = 1100;
  const H = 200;
  const padX = 10;
  const padTop = 18;
  const padBot = 28;

  // Find max channel value for scaling.
  let maxY = 100;
  for (const base of ["A", "C", "G", "T"]) {
    const t = traces[base];
    if (!t) continue;
    for (let i = xStart; i <= xEnd; i++) {
      if (t[i] > maxY) maxY = t[i];
    }
  }
  const xToPx = (x) => padX + ((x - xStart) / Math.max(1, xEnd - xStart)) * (W - 2 * padX);
  const yToPx = (y) => padTop + (1 - y / maxY) * (H - padTop - padBot);

  // Mott trim region in trace-x coordinates.
  const trimX0 = peakLocations[trim.start] ?? xStart;
  const trimX1 = peakLocations[Math.max(0, trim.end - 1)] ?? xEnd;

  // Mismatch positions (in reference space) -> nope, we want them in trimmed-query
  // space, which maps onto peakLocations[trim.start + queryOffset]. Walk the
  // alignment to mark each mismatch query-position on the chromatogram.
  const queryHighlights = [];
  if (score && score.mismatchList) {
    let qPos = score.queryStart; // 0-based in TRIMMED basecalls
    let tPos = score.targetStart;
    const t = score.alignedTarget;
    const q = score.alignedQuery;
    for (let k = 0; k < t.length; k++) {
      const tc = t[k]; const qc = q[k];
      if (tc === "-") {
        queryHighlights.push({ qPos: trim.start + qPos, kind: "insertion" });
        qPos++;
      } else if (qc === "-") {
        // Deletion: no query base to highlight.
        tPos++;
      } else if (tc !== qc) {
        queryHighlights.push({ qPos: trim.start + qPos, kind: "mismatch" });
        tPos++; qPos++;
      } else {
        tPos++; qPos++;
      }
    }
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 overflow-x-auto">
      <div className="text-xs text-zinc-600 mb-1 flex items-center justify-between">
        <span>{sample.sampleName} — {basecalls.length} bp · trim Q≥{qCutoff}: {trim.start}–{trim.end}</span>
        <span className="font-mono text-zinc-500">trace points {xStart}–{xEnd}</span>
      </div>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
        {/* Trim shading */}
        {trim.end > trim.start && (
          <rect
            x={xToPx(trimX0)} y={padTop - 6}
            width={Math.max(1, xToPx(trimX1) - xToPx(trimX0))}
            height={H - padTop - padBot + 6}
            fill="#bae6fd" fillOpacity={0.18}
          />
        )}
        {/* Channel polylines */}
        {["G", "A", "T", "C"].map(base => {
          const t = traces[base];
          if (!t) return null;
          let d = "";
          for (let i = xStart; i <= xEnd; i++) {
            const cmd = i === xStart ? "M" : "L";
            d += `${cmd}${xToPx(i).toFixed(1)},${yToPx(t[i]).toFixed(1)} `;
          }
          return (
            <path
              key={base}
              d={d}
              stroke={SANGER_BASE_COLORS[base]}
              strokeWidth={1.0}
              fill="none"
              opacity={0.92}
            />
          );
        })}
        {/* Mismatch highlights — vertical lines at the query base position */}
        {queryHighlights.map((h, i) => {
          const x = peakLocations[h.qPos];
          if (x == null) return null;
          return (
            <line
              key={i}
              x1={xToPx(x)} x2={xToPx(x)}
              y1={padTop - 4} y2={H - padBot + 2}
              stroke={h.kind === "mismatch" ? "#f43f5e" : "#f59e0b"}
              strokeWidth={1.5}
              strokeDasharray="3 2"
              opacity={0.7}
            />
          );
        })}
        {/* Basecall labels (only when readable) */}
        {basecalls.length <= 250 && peakLocations.map((px, i) => {
          if (px < xStart || px > xEnd) return null;
          const base = basecalls[i] || "N";
          return (
            <text
              key={i}
              x={xToPx(px)} y={padTop - 4}
              fontSize={9}
              textAnchor="middle"
              fill={SANGER_BASE_COLORS[base] || "#6b7280"}
              fontFamily="monospace"
            >{base}</text>
          );
        })}
        {/* Q-score line at the bottom */}
        <QScoreLine
          qScores={qScores} peakLocations={peakLocations}
          xStart={xStart} xEnd={xEnd}
          xToPx={xToPx}
          yBase={H - padBot + 14} qThresh={qCutoff}
        />
        {/* Axis ticks (data-point indices) */}
        {[0, 0.25, 0.5, 0.75, 1.0].map(f => {
          const x = xStart + f * (xEnd - xStart);
          return (
            <g key={f}>
              <line x1={xToPx(x)} x2={xToPx(x)} y1={H - padBot} y2={H - padBot + 4} stroke="#9ca3af" />
              <text x={xToPx(x)} y={H - padBot + 14} textAnchor="middle" fontSize={9} fill="#6b7280">
                {Math.round(x)}
              </text>
            </g>
          );
        })}
      </svg>
      <Legend />
    </div>
  );
}

function QScoreLine({ qScores, peakLocations, xStart, xEnd, xToPx, yBase, qThresh }) {
  // Render the per-base Q-score as a stair line just below the chromatogram.
  // Y is fixed-height: yBase − qScore (clamped to [0, 60]).
  const points = [];
  const scale = 0.6; // pixels per Q-unit
  for (let i = 0; i < peakLocations.length; i++) {
    const px = peakLocations[i];
    if (px < xStart || px > xEnd) continue;
    const q = qScores[i] || 0;
    points.push([xToPx(px), yBase - Math.min(q, 60) * scale]);
  }
  if (points.length === 0) return null;
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  return (
    <>
      <line
        x1={xToPx(xStart)} x2={xToPx(xEnd)}
        y1={yBase - qThresh * scale}
        y2={yBase - qThresh * scale}
        stroke="#6b7280" strokeDasharray="2 3" strokeWidth={0.8}
        opacity={0.7}
      />
      <path d={d} stroke="#0ea5e9" strokeWidth={1} fill="none" opacity={0.8} />
    </>
  );
}

function Legend() {
  return (
    <div className="mt-1 flex items-center gap-3 text-[10px] text-zinc-600">
      {Object.entries(SANGER_BASE_COLORS).filter(([b]) => b !== "N").map(([base, c]) => (
        <span key={base} className="inline-flex items-center gap-1">
          <span style={{ background: c }} className="inline-block w-3 h-1.5 rounded" /> {base}
        </span>
      ))}
      <span className="inline-flex items-center gap-1 ml-2">
        <span className="inline-block w-3 h-0.5" style={{ background: "#0ea5e9" }} /> Q-score
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="inline-block w-3 h-2 rounded" style={{ background: "#bae6fd", opacity: 0.4 }} /> Mott trim window
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="inline-block w-px h-3" style={{ background: "#f43f5e" }} /> mismatch
      </span>
    </div>
  );
}


// ----------------------------------------------------------------------
// Alignment summary + mismatch table
// ----------------------------------------------------------------------

function AlignmentSummary({ score, sample, reference }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 text-xs">
      <div className="font-medium text-zinc-800 mb-1">Alignment</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Identity" value={`${(score.identity * 100).toFixed(2)}%`} />
        <Stat label="Matches / aligned" value={`${score.matches} / ${score.length}`} />
        <Stat label="Mismatches" value={String(score.mismatches)} />
        <Stat label="Gaps" value={String(score.gaps)} />
        <Stat label="Reference range" value={`${score.targetStart}–${score.targetEnd} of ${reference.length}`} />
        <Stat label="Query range (trimmed)" value={`${score.queryStart}–${score.queryEnd}`} />
        <Stat label="Q-cutoff" value={`Q≥${score.qCutoff}`} />
        <Stat label="Trim" value={`${score.trim.start}–${score.trim.end} of ${sample.basecalls.length}`} />
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="font-mono text-zinc-900">{value}</div>
    </div>
  );
}

function MismatchTable({ score }) {
  if (!score.mismatchList.length) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 font-medium">
        Perfect match — no mismatches, insertions, or deletions in the aligned window.
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 text-xs">
      <div className="font-medium text-zinc-800 mb-2">
        Mismatches ({score.mismatchList.length})
      </div>
      <div className="max-h-60 overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-zinc-50 sticky top-0">
            <tr>
              <Th>Ref pos</Th>
              <Th>Ref</Th>
              <Th>Query</Th>
              <Th>Kind</Th>
            </tr>
          </thead>
          <tbody>
            {score.mismatchList.map((m, i) => (
              <tr key={i} className="border-t border-zinc-100">
                <Td className="font-mono">{m.position + 1}</Td>
                <Td className="font-mono">{m.refBase}</Td>
                <Td className="font-mono">{m.queryBase}</Td>
                <Td>
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${
                    m.kind === "mismatch" ? "bg-rose-100 text-rose-800"
                    : m.kind === "insertion" ? "bg-amber-100 text-amber-800"
                    : "bg-violet-100 text-violet-800"
                  }`}>{m.kind}</span>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children }) {
  return <th className="text-left px-2 py-1 font-medium text-zinc-700">{children}</th>;
}
function Td({ children, className = "" }) {
  return <td className={`px-2 py-1 ${className}`}>{children}</td>;
}
