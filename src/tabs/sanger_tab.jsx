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
import { parseSnapgene, writeSnapgene } from "../lib/snapgene.js";
import {
  mottTrim,
  scoreSangerVsReference,
  computeCoverageDepth,
  computeConsensus,
  computeQualityHistogram,
} from "../lib/sanger.js";
import {
  ENZYME_CATALOG,
  findEnzymeSites,
  findOrfs,
  gcComposition,
  overallGc,
  findPrimerMatches,
  parseMultiFasta,
} from "../lib/sequence_analyses.js";
import { detectIssues, summarizeIssues } from "../lib/sanger_issues.js";
import { SangerReportModal } from "../components/sanger_report_modal.jsx";
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

export function SangerTab({ initialRefUrl, initialActiveSample } = {}) {
  const [samples, setSamples] = useState({}); // {stem: parsed}
  const [active, setActive] = useState(initialActiveSample || null);
  const [reference, setReference] = useState("");
  const [referenceLabel, setReferenceLabel] = useState("");
  const [referenceTopology, setReferenceTopology] = useState({ isCircular: false, topologyByte: 0 });
  const [qCutoff, setQCutoff] = useState(20);
  const [error, setError] = useState(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  // Per-sample chromatogram zoom: {sampleName: {start, end} | null}.
  // start/end are trace-data-point indices (same coordinate space as
  // peakLocations). null = full-range view.
  const [zoomBySample, setZoomBySample] = useState({});
  // Loaded primers: array of {name, sequence}. Populated via the
  // "Load primers" picker on the PrimerMappingPanel.
  const [primers, setPrimers] = useState([]);
  // Sanger PDF report modal.
  const [reportOpen, setReportOpen] = useState(false);

  const fileInputRef = useRef(null);

  // Honor ?ref=<url> from FragmentViewer's URL-param pass-through. Same-origin
  // URLs work directly; cross-origin requires CORS on the source server. We
  // fetch only once per mount; subsequent drag-drops or paste take over.
  useEffect(() => {
    if (!initialRefUrl || reference) return;
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(initialRefUrl);
        if (!resp.ok) {
          if (!cancelled) setError(`?ref fetch failed: HTTP ${resp.status}`);
          return;
        }
        const buf = await resp.arrayBuffer();
        const sg = parseSnapgene(buf);
        if (cancelled) return;
        setReference(sg.sequence);
        setReferenceLabel(`${initialRefUrl.split("/").pop() || "ref"} (${sg.length} bp${sg.isCircular ? ", circular" : ""})`);
      } catch (e) {
        if (!cancelled) setError(`?ref load failed: ${e.message || e}`);
      }
    })();
    return () => { cancelled = true; };
  }, [initialRefUrl]); // eslint-disable-line react-hooks/exhaustive-deps

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
        setReferenceTopology({ isCircular: sg.isCircular, topologyByte: sg.topologyByte });
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

  // ----- CSV / SVG / FASTA / .dna export ------------------------------
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

  // FASTA of the active sample's Mott-trimmed basecalls (matches what the
  // alignment scored against — i.e., the high-quality window only).
  const handleExportTrimmedFasta = () => {
    if (!activeSample) return;
    const trim = mottTrim(activeSample.qScores, qCutoff);
    const seq = activeSample.basecalls.slice(trim.start, trim.end);
    const fasta = `>${activeSample.sampleName}_Q${qCutoff}_${trim.start}-${trim.end}\n${seq}\n`;
    downloadBlob(
      new Blob([fasta], { type: "text/plain;charset=utf-8" }),
      `${activeSample.sampleName}_trimmed.fasta`,
    );
  };

  // Multi-record FASTA with every loaded sample's trimmed read.
  const handleExportAllFasta = () => {
    const names = Object.keys(samples).sort();
    if (names.length === 0) return;
    const records = [];
    for (const n of names) {
      const s = samples[n];
      const trim = mottTrim(s.qScores, qCutoff);
      records.push(`>${n}_Q${qCutoff}_${trim.start}-${trim.end}\n${s.basecalls.slice(trim.start, trim.end)}`);
    }
    downloadBlob(
      new Blob([records.join("\n") + "\n"], { type: "text/plain;charset=utf-8" }),
      `sanger_reads_${new Date().toISOString().slice(0, 10)}.fasta`,
    );
  };

  // SnapGene .dna of just the active sample's trimmed read (no reference
  // context). Useful when there is no expected reference yet — the user
  // gets a SnapGene-ready file from a chromatogram alone.
  const handleExportTrimmedDna = () => {
    if (!activeSample) return;
    const trim = mottTrim(activeSample.qScores, qCutoff);
    const seq = activeSample.basecalls.slice(trim.start, trim.end);
    const features = [{
      name: `${activeSample.sampleName} trimmed`,
      type: "misc_feature",
      start: 0, end: seq.length, strand: 1,
      color: "#4f46e5",
    }];
    const buf = writeSnapgene({ sequence: seq, isCircular: false, features });
    downloadBlob(new Blob([buf], { type: "application/octet-stream" }), `${activeSample.sampleName}_trimmed.dna`);
  };

  // SnapGene .dna of the reference with each loaded sample's aligned read
  // embedded as a feature spanning [targetStart..targetEnd]. Mirrors the
  // lab's "Sanger Results Aligned ... ASSEMBLED.dna" hand-built artifacts.
  const handleExportAnnotatedRefDna = () => {
    if (!reference) return;
    const features = [];
    const names = Object.keys(samples).sort();
    let i = 0;
    for (const n of names) {
      const s = samples[n];
      const r = scoreSangerVsReference(s, reference, { qCutoff });
      if (r.length === 0) continue;
      const ok = r.verdict === "pass";
      const warn = r.verdict === "warn";
      const color = ok ? "#16a34a" : warn ? "#f59e0b" : "#e11d48";
      const pct = (r.identity * 100).toFixed(2);
      features.push({
        name: `${n}: ${pct}% (${r.matches}/${r.length}, ${r.mismatches} mm, ${r.gaps} gap)`,
        type: "misc_feature",
        start: r.targetStart,
        end: r.targetEnd,
        strand: 1,
        color,
      });
      i++;
    }
    const buf = writeSnapgene({
      sequence: reference,
      isCircular: referenceTopology.isCircular,
      topologyByte: referenceTopology.topologyByte,
      features,
    });
    const fname = `${(referenceLabel || "reference").replace(/[\\/:*?"<>|]/g, "_").replace(/\.[a-z0-9]+$/i, "")}_sanger_annotated.dna`;
    downloadBlob(new Blob([buf], { type: "application/octet-stream" }), fname);
  };

  // ----- Zoom helpers ------------------------------------------------
  const setZoom = (range) => {
    if (!active) return;
    setZoomBySample(prev => ({ ...prev, [active]: range }));
  };
  const resetZoom = () => setZoom(null);

  // ----- Auto-detected trace issues (per active sample) ---------------
  const trimRange = useMemo(() => {
    if (!activeSample) return null;
    const t = mottTrim(activeSample.qScores, qCutoff);
    return [t.start, t.end];
  }, [activeSample, qCutoff]);

  const issues = useMemo(() => {
    if (!activeSample) return [];
    return detectIssues(activeSample, {
      mixedPeaks: { trimRange },
      lowSignal: { trimRange },
      qualityDips: { trimRange },
      nRuns: { trimRange },
    });
  }, [activeSample, trimRange]);

  const issueSummary = useMemo(() => summarizeIssues(issues), [issues]);

  // Click an issue → zoom the main chromatogram to that issue's trace range.
  const focusIssue = useCallback((issue) => {
    if (!issue?.traceRange) return;
    const [s, e] = issue.traceRange;
    const pad = Math.max(20, Math.floor((e - s) * 0.5));
    setZoom({ start: s - pad, end: e + pad });
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  // ----- Multi-read analytics: coverage + consensus -----------------
  // Compute one-shot when reference + ≥1 sample loaded; share results
  // across MultiSampleSummary, CoverageMapPanel, ConsensusPanel.
  const multiReadAnalysis = useMemo(() => {
    if (!reference || Object.keys(samples).length === 0) return null;
    const reads = Object.entries(samples).map(([name, s]) => ({
      name,
      score: scoreSangerVsReference(s, reference, { qCutoff }),
    }));
    const depth = computeCoverageDepth(reads, reference.length);
    const consensus = computeConsensus(reads, reference);
    return { reads, depth, consensus };
  }, [samples, reference, qCutoff]);

  // ----- Verification CSV export ------------------------------------
  // One row per loaded sample: same shape as the lab's
  // "Sanger Verification_<date>.xlsx" worksheets — name, verdict,
  // identity %, coverage range, mismatch + gap counts.
  const handleExportVerificationCsv = () => {
    if (!multiReadAnalysis) return;
    const header = ["sample", "verdict", "identity_pct", "matches", "length", "mismatches", "gaps", "ref_start", "ref_end", "trim_q_cutoff", "trim_start", "trim_end"];
    const rows = [header.join(",")];
    for (const { name, score } of multiReadAnalysis.reads) {
      rows.push([
        name,
        score.verdict,
        (score.identity * 100).toFixed(2),
        score.matches,
        score.length,
        score.mismatches,
        score.gaps,
        score.targetStart,
        score.targetEnd,
        score.qCutoff,
        score.trim?.start ?? 0,
        score.trim?.end ?? 0,
      ].join(","));
    }
    const blob = new Blob([rows.join("\n") + "\n"], { type: "text/csv;charset=utf-8" });
    downloadBlob(blob, `sanger_verification_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  // ----- Consensus exports ------------------------------------------
  const handleExportConsensusFasta = () => {
    if (!multiReadAnalysis) return;
    const seq = multiReadAnalysis.consensus.consensusSeq;
    const fasta = `>${(referenceLabel || "consensus").replace(/\s+/g, "_")}_consensus\n${seq}\n`;
    downloadBlob(
      new Blob([fasta], { type: "text/plain;charset=utf-8" }),
      `sanger_consensus_${new Date().toISOString().slice(0, 10)}.fasta`,
    );
  };
  const handleExportConsensusDna = () => {
    if (!multiReadAnalysis) return;
    const seq = multiReadAnalysis.consensus.consensusSeq;
    // Annotate each gap region as a "no coverage" feature so reviewers
    // can spot them visually in SnapGene.
    const features = multiReadAnalysis.consensus.gaps.map(g => ({
      name: `coverage gap (${g.end - g.start} bp)`,
      type: "misc_feature",
      start: g.start, end: g.end, strand: 0,
      color: "#9ca3af",
    }));
    // Mark uncertainty positions as 1-bp features.
    for (const u of multiReadAnalysis.consensus.uncertainty.slice(0, 200)) {
      const votes = u.votes.map(v => `${v.base}×${v.count}`).join("/");
      features.push({
        name: `disagreement: ${votes}`,
        type: "misc_feature",
        start: u.pos, end: u.pos + 1, strand: 0,
        color: "#f59e0b",
      });
    }
    const buf = writeSnapgene({
      sequence: seq.toUpperCase().replace(/[^ACGTN-]/g, "N"),
      isCircular: referenceTopology.isCircular,
      topologyByte: referenceTopology.topologyByte,
      features,
    });
    downloadBlob(
      new Blob([buf], { type: "application/octet-stream" }),
      `sanger_consensus_${new Date().toISOString().slice(0, 10)}.dna`,
    );
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
            samples={samples}
            hasReference={!!reference}
            onExportCsv={handleExportMismatchCsv}
            onExportSvg={handleExportSvg}
            onExportTrimmedFasta={handleExportTrimmedFasta}
            onExportAllFasta={handleExportAllFasta}
            onExportTrimmedDna={handleExportTrimmedDna}
            onExportAnnotatedRefDna={handleExportAnnotatedRefDna}
            onOpenReport={() => setReportOpen(true)}
            onResetZoom={resetZoom}
            zoomActive={!!(active && zoomBySample[active])}
          />

          <SangerReportModal
            open={reportOpen}
            onClose={() => setReportOpen(false)}
            generatedAt={useMemo(() => new Date(), [reportOpen])}
            reference={reference}
            referenceLabel={referenceLabel}
            qCutoff={qCutoff}
            samples={samples}
            multiReadAnalysis={multiReadAnalysis}
            activeSample={activeSample}
            activeScore={score}
            issues={issues}
          />

          <ChromatogramPanel
            sample={activeSample}
            qCutoff={qCutoff}
            score={score}
            svgRef={chromatogramRef}
            zoom={active ? zoomBySample[active] : null}
            setZoom={setZoom}
          />

          {activeSample && issues.length > 0 && (
            <IssuesPanel
              sample={activeSample}
              qCutoff={qCutoff}
              issues={issues}
              summary={issueSummary}
              onFocus={focusIssue}
            />
          )}

          {multiReadAnalysis && Object.keys(samples).length > 1 && (
            <MultiSampleSummary
              reads={multiReadAnalysis.reads}
              refLen={reference.length}
              active={active}
              onPick={setActive}
              onExportVerificationCsv={handleExportVerificationCsv}
            />
          )}
          {multiReadAnalysis && (
            <CoverageMapPanel
              depth={multiReadAnalysis.depth}
              reads={multiReadAnalysis.reads}
              refLen={reference.length}
              active={active}
              onPick={setActive}
            />
          )}
          {multiReadAnalysis && Object.keys(samples).length > 1 && (
            <StackedReadsPanel
              samples={samples}
              reads={multiReadAnalysis.reads}
              refLen={reference.length}
              qCutoff={qCutoff}
              active={active}
              onPick={setActive}
            />
          )}
          {multiReadAnalysis && Object.keys(samples).length > 0 && (
            <ConsensusPanel
              consensus={multiReadAnalysis.consensus}
              refLen={reference.length}
              onExportFasta={handleExportConsensusFasta}
              onExportDna={handleExportConsensusDna}
            />
          )}
          {activeSample && (
            <QualityHistogramPanel sample={activeSample} qCutoff={qCutoff} />
          )}
          {(reference || multiReadAnalysis?.consensus.consensusSeq) && (
            <SequenceAnalysesPanel
              activeRead={activeSample}
              qCutoff={qCutoff}
              consensusSeq={multiReadAnalysis?.consensus.consensusSeq || ""}
              referenceSeq={reference}
              referenceLabel={referenceLabel}
            />
          )}
          <PrimerMappingPanel
            primers={primers}
            setPrimers={setPrimers}
            samples={samples}
            qCutoff={qCutoff}
            referenceSeq={reference}
            referenceLabel={referenceLabel}
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

function ControlsBar({
  qCutoff, setQCutoff, score, samples, hasReference,
  onExportCsv, onExportSvg, onExportTrimmedFasta, onExportAllFasta,
  onExportTrimmedDna, onExportAnnotatedRefDna, onOpenReport,
  onResetZoom, zoomActive,
}) {
  const sampleCount = Object.keys(samples || {}).length;
  const hasActive = !!score?.length || (samples && Object.values(samples).some(s => s.basecalls?.length));
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 flex flex-wrap items-center gap-3">
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

      {zoomActive && (
        <button
          onClick={onResetZoom}
          className="px-2.5 py-1.5 rounded border border-zinc-300 text-xs flex items-center gap-1 hover:bg-zinc-50"
          title="Reset chromatogram zoom to full range (or press F)"
        >
          Reset zoom
        </button>
      )}

      <div className="ml-auto flex items-center gap-2 flex-wrap">
        <ExportGroup label="From chromatogram">
          <ExportBtn onClick={onExportTrimmedFasta} disabled={!hasActive} title="Mott-trimmed basecalls of the active sample as FASTA">
            FASTA (active)
          </ExportBtn>
          <ExportBtn onClick={onExportTrimmedDna} disabled={!hasActive} title="SnapGene .dna of the active sample's trimmed basecalls (no reference)">
            .dna (active)
          </ExportBtn>
          <ExportBtn onClick={onExportAllFasta} disabled={sampleCount === 0} title={`Multi-record FASTA: every loaded sample (${sampleCount})`}>
            FASTA (all {sampleCount})
          </ExportBtn>
        </ExportGroup>
        <ExportGroup label="With reference">
          <ExportBtn onClick={onExportAnnotatedRefDna} disabled={!hasReference || sampleCount === 0} title="SnapGene .dna of the reference annotated with each loaded read as a feature">
            Annotated .dna
          </ExportBtn>
          <ExportBtn onClick={onExportCsv} disabled={!score} title="Mismatches between the active read and reference, as CSV">
            CSV mismatches
          </ExportBtn>
          <ExportBtn onClick={onExportSvg} disabled={!score} title="Current chromatogram as SVG (Illustrator-editable)">
            SVG
          </ExportBtn>
        </ExportGroup>
        <ExportGroup label="Report">
          <ExportBtn onClick={onOpenReport} disabled={sampleCount === 0} title="Multi-page report: verification table, consensus, issues, mismatches. Print or save as PDF / Markdown.">
            Build report
          </ExportBtn>
        </ExportGroup>
      </div>
    </div>
  );
}

function ExportGroup({ label, children }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500 mr-1">{label}</span>
      {children}
    </div>
  );
}

function ExportBtn({ onClick, disabled, title, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="px-2 py-1 rounded border border-zinc-300 text-xs flex items-center gap-1 disabled:opacity-40 hover:bg-zinc-50"
    >
      <FileDown size={11} /> {children}
    </button>
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

function ChromatogramPanel({ sample, qCutoff, score, svgRef, zoom, setZoom }) {
  if (!sample) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500">
        Pick a sample to view its chromatogram.
      </div>
    );
  }

  const { basecalls, qScores, peakLocations, traces } = sample;
  const trim = useMemo(() => mottTrim(qScores, qCutoff), [qScores, qCutoff]);

  // Visible window: zoom range overrides full trace; clamp to legal bounds.
  const traceLen = traces.A?.length || traces.C?.length || traces.G?.length || traces.T?.length || 0;
  if (!traceLen) {
    return <div className="rounded-lg border border-zinc-200 bg-white p-3 text-sm text-zinc-500">No analyzed-trace channels (DATA9..12) in this file.</div>;
  }
  const fullStart = peakLocations[0] ?? 0;
  const fullEnd = peakLocations[peakLocations.length - 1] ?? traceLen - 1;
  // Clamp zoom to within the full range and ensure at least 4 data points wide
  // (otherwise the chromatogram becomes uninterpretable).
  const minSpan = 4;
  const xStart = Math.max(fullStart, Math.min(fullEnd - minSpan, zoom?.start ?? fullStart));
  const xEnd = Math.min(fullEnd, Math.max(xStart + minSpan, zoom?.end ?? fullEnd));
  const W = 1100;
  const H = 200;
  const padX = 10;
  const padTop = 18;
  const padBot = 28;
  const plotLeft = padX;
  const plotRight = W - padX;
  const plotWidth = plotRight - plotLeft;

  // Integer iteration bounds; zoom math can produce fractional xStart/xEnd
  // but the trace arrays are integer-indexed.
  const iStart = Math.max(0, Math.floor(xStart));
  const iEnd = Math.min(traceLen - 1, Math.ceil(xEnd));

  // Find max channel value within the visible window for y-scaling.
  let maxY = 100;
  for (const base of ["A", "C", "G", "T"]) {
    const t = traces[base];
    if (!t) continue;
    for (let i = iStart; i <= iEnd; i++) {
      if (t[i] > maxY) maxY = t[i];
    }
  }
  const xToPx = (x) => plotLeft + ((x - xStart) / Math.max(1e-6, xEnd - xStart)) * plotWidth;
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

  // ----- Zoom interaction -------------------------------------------
  // Convert a CSS-pixel x within the SVG to a trace-data-point index.
  const cssXToTraceX = (svgEl, clientX) => {
    if (!svgEl) return null;
    const r = svgEl.getBoundingClientRect();
    const cssLeft = r.left + (plotLeft / W) * r.width;
    const cssWidth = (plotWidth / W) * r.width;
    const t = (clientX - cssLeft) / cssWidth;
    const tClamped = Math.max(0, Math.min(1, t));
    return xStart + tClamped * (xEnd - xStart);
  };
  const [brush, setBrush] = useState(null);  // {x0, x1} in trace coords
  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    const t = cssXToTraceX(e.currentTarget, e.clientX);
    if (t == null) return;
    setBrush({ x0: t, x1: t });
  };
  const onMouseMove = (e) => {
    if (!brush) return;
    const t = cssXToTraceX(e.currentTarget, e.clientX);
    if (t == null) return;
    setBrush({ x0: brush.x0, x1: t });
  };
  const onMouseUp = () => {
    if (!brush) return;
    const lo = Math.min(brush.x0, brush.x1);
    const hi = Math.max(brush.x0, brush.x1);
    setBrush(null);
    if (hi - lo >= minSpan && setZoom) {
      setZoom({ start: Math.round(lo), end: Math.round(hi) });
    }
  };
  const onMouseLeave = () => setBrush(null);
  const onDoubleClick = () => { if (setZoom) setZoom(null); };
  const onWheel = (e) => {
    if (!setZoom) return;
    e.preventDefault();
    // Zoom factor: scroll up → zoom in (smaller range), scroll down → out.
    const factor = e.deltaY < 0 ? 0.85 : 1.15;
    const center = cssXToTraceX(e.currentTarget, e.clientX);
    if (center == null) return;
    const newSpan = Math.max(minSpan, (xEnd - xStart) * factor);
    const newStart = Math.max(fullStart, center - newSpan * ((center - xStart) / Math.max(1, xEnd - xStart)));
    const newEnd = Math.min(fullEnd, newStart + newSpan);
    if (newStart <= fullStart && newEnd >= fullEnd) {
      setZoom(null);  // back to full range → drop the override
    } else {
      setZoom({ start: Math.round(newStart), end: Math.round(newEnd) });
    }
  };

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 overflow-x-auto">
      <div className="text-xs text-zinc-600 mb-1 flex items-center justify-between">
        <span>{sample.sampleName} — {basecalls.length} bp · trim Q≥{qCutoff}: {trim.start}–{trim.end}</span>
        <span className="font-mono text-zinc-500">
          trace points {xStart.toFixed(0)}–{xEnd.toFixed(0)}
          {zoom ? <span className="ml-2 text-indigo-600">zoomed</span> : null}
        </span>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%" height={H}
        preserveAspectRatio="none"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
        onDoubleClick={onDoubleClick}
        onWheel={onWheel}
        style={{ cursor: brush ? "ew-resize" : "crosshair", userSelect: "none" }}
      >
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
          for (let i = iStart; i <= iEnd; i++) {
            const cmd = i === iStart ? "M" : "L";
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
        {/* Basecall labels — visible when the *visible* span is short enough
            to render them legibly (~250 visible bases). Zooming in reveals
            them on long reads. */}
        {(() => {
          const visiblePeaks = peakLocations.filter(px => px >= xStart && px <= xEnd);
          if (visiblePeaks.length > 250) return null;
          return peakLocations.map((px, i) => {
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
          });
        })()}
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
        {/* Brush selection rectangle (visible while user is dragging). */}
        {brush && Math.abs(brush.x1 - brush.x0) > 1 && (
          <rect
            x={Math.min(xToPx(brush.x0), xToPx(brush.x1))}
            y={padTop - 6}
            width={Math.abs(xToPx(brush.x1) - xToPx(brush.x0))}
            height={H - padTop - padBot + 6}
            fill="#6366f1" fillOpacity={0.18}
            stroke="#6366f1" strokeOpacity={0.5}
          />
        )}
      </svg>
      <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-500">
        <Legend />
        <span>Drag to brush-zoom · scroll to zoom in/out · double-click to reset</span>
      </div>
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
    <div className="flex items-center gap-3 text-[10px] text-zinc-600">
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
// Multi-sample summary panel
// ----------------------------------------------------------------------
//
// Shows when ≥2 .ab1 files are loaded against a reference. Each row is one
// loaded sample with its alignment verdict + reference range; click to
// focus that sample in the chromatogram. Mirrors the lab's per-construct
// "Sanger Verification" workflow where 6 reads from PS1–PS6 primers all
// align against one expected Golden Gate assembly reference.

function MultiSampleSummary({ reads, refLen, active, onPick, onExportVerificationCsv }) {
  const rows = useMemo(() => [...reads].sort((a, b) => a.name.localeCompare(b.name)), [reads]);
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 text-xs">
      <div className="font-medium text-zinc-800 mb-2 flex items-center justify-between">
        <span>Multi-sample alignment ({rows.length} reads against {refLen} bp reference)</span>
        {onExportVerificationCsv && (
          <button
            onClick={onExportVerificationCsv}
            className="px-2 py-1 rounded border border-zinc-300 text-[10px] flex items-center gap-1 hover:bg-zinc-50"
            title="Export this table as CSV (mirrors lab Sanger Verification xlsx)"
          >
            <FileDown size={11} /> Verification CSV
          </button>
        )}
      </div>
      <table className="w-full">
        <thead className="text-[10px] uppercase tracking-wider text-zinc-500">
          <tr>
            <Th>Sample</Th>
            <Th>Verdict</Th>
            <Th>Identity</Th>
            <Th>Coverage on reference</Th>
            <Th>Mismatches</Th>
            <Th>Gaps</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ name, score }) => {
            const v = VERDICT_STYLE[score.verdict] || VERDICT_STYLE.fail;
            const isActive = name === active;
            const covPct = refLen ? (((score.targetEnd - score.targetStart) / refLen) * 100) : 0;
            return (
              <tr
                key={name}
                onClick={() => onPick(name)}
                className={`border-t border-zinc-100 cursor-pointer ${isActive ? "bg-indigo-50" : "hover:bg-zinc-50"}`}
              >
                <Td className="font-mono">{name}</Td>
                <Td>
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${v.bg} ${v.text}`}>
                    {v.label}
                  </span>
                </Td>
                <Td className="font-mono">{(score.identity * 100).toFixed(2)}%</Td>
                <Td>
                  <CoverageBar start={score.targetStart} end={score.targetEnd} total={refLen} verdict={score.verdict} />
                  <span className="font-mono text-[10px] text-zinc-500">
                    {score.targetStart}-{score.targetEnd} ({covPct.toFixed(0)}%)
                  </span>
                </Td>
                <Td className="font-mono">{score.mismatches}</Td>
                <Td className="font-mono">{score.gaps}</Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CoverageBar({ start, end, total, verdict }) {
  if (!total) return null;
  const color = verdict === "pass" ? "#16a34a" : verdict === "warn" ? "#f59e0b" : "#e11d48";
  return (
    <div className="relative h-1.5 w-full bg-zinc-100 rounded mb-0.5">
      <div
        className="absolute top-0 h-full rounded"
        style={{
          left: `${(start / total) * 100}%`,
          width: `${Math.max(1, ((end - start) / total) * 100)}%`,
          background: color,
        }}
      />
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
function Td({ children, className = "", ...rest }) {
  return <td className={`px-2 py-1 ${className}`} {...rest}>{children}</td>;
}


// ----------------------------------------------------------------------
// CoverageMapPanel — depth-of-coverage profile across the reference
// ----------------------------------------------------------------------
//
// SVG bar chart, one column per reference position. Bar height encodes
// depth (0 = invisible, ≥1 visible). Each loaded read renders as a
// horizontal stripe positioned by its targetStart..targetEnd, color-coded
// by per-read verdict. Clicking a stripe focuses that sample. This is
// the lab's de-facto question: "where on the assembly do I have
// verification coverage, and where do I still need to sequence?"

function CoverageMapPanel({ depth, reads, refLen, active, onPick }) {
  const W = 1100;
  const padX = 10;
  const headerH = 18;
  const rowH = 9;
  const trackH = Math.max(40, reads.length * rowH);
  const depthH = 36;
  const H = headerH + depthH + trackH + 14;
  const plotW = W - 2 * padX;
  const xToPx = (refPos) => padX + (refPos / Math.max(1, refLen)) * plotW;

  let maxDepth = 0;
  for (let i = 0; i < depth.length; i++) if (depth[i] > maxDepth) maxDepth = depth[i];
  if (maxDepth === 0) maxDepth = 1;

  // Build a smoothed/decimated depth poly for SVG perf when refLen is huge.
  const stride = Math.max(1, Math.floor(refLen / W));
  const polyPoints = [];
  for (let i = 0; i < refLen; i += stride) {
    polyPoints.push([xToPx(i), headerH + depthH - (depth[i] / maxDepth) * (depthH - 4)]);
  }
  const depthPoly = polyPoints
    .map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`)
    .join(" ")
    + ` L${xToPx(refLen).toFixed(1)},${(headerH + depthH).toFixed(1)} L${padX},${(headerH + depthH).toFixed(1)} Z`;

  const sortedReads = [...reads].sort((a, b) =>
    (a.score?.targetStart ?? 0) - (b.score?.targetStart ?? 0)
  );

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 text-xs">
      <div className="font-medium text-zinc-800 mb-1 flex items-center justify-between">
        <span>Reference coverage</span>
        <span className="text-[10px] text-zinc-500">
          max depth {maxDepth} · {reads.length} read{reads.length === 1 ? "" : "s"}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
        {/* Reference axis ticks */}
        {[0, 0.25, 0.5, 0.75, 1.0].map(f => {
          const refPos = Math.round(f * refLen);
          return (
            <g key={f}>
              <line x1={xToPx(refPos)} x2={xToPx(refPos)} y1={headerH - 4} y2={headerH} stroke="#9ca3af" />
              <text x={xToPx(refPos)} y={headerH - 6} textAnchor="middle" fontSize={9} fill="#6b7280">
                {refPos}
              </text>
            </g>
          );
        })}
        {/* Depth profile */}
        <path d={depthPoly} fill="#bae6fd" stroke="#0369a1" strokeWidth={0.5} />
        {/* Per-read stripes */}
        {sortedReads.map((r, i) => {
          const s = r.score;
          if (!s || !s.length) return null;
          const y = headerH + depthH + 6 + i * rowH;
          const x0 = xToPx(s.targetStart);
          const x1 = xToPx(s.targetEnd);
          const verdict = s.verdict;
          const color = verdict === "pass" ? "#16a34a" : verdict === "warn" ? "#f59e0b" : "#e11d48";
          const isActive = r.name === active;
          return (
            <g key={r.name} onClick={() => onPick?.(r.name)} style={{ cursor: "pointer" }}>
              <rect
                x={x0} y={y - rowH / 2 + 1}
                width={Math.max(2, x1 - x0)} height={rowH - 2}
                fill={color} fillOpacity={isActive ? 0.95 : 0.55}
                stroke={isActive ? "#1e40af" : "transparent"}
                strokeWidth={isActive ? 1 : 0}
              />
              <title>{`${r.name} — ${s.targetStart}–${s.targetEnd} · ${(s.identity * 100).toFixed(1)}% identity (${verdict})`}</title>
            </g>
          );
        })}
      </svg>
      <div className="mt-1 text-[10px] text-zinc-500">
        Click a read stripe to focus it. Bars above show how many reads cover each reference position.
      </div>
    </div>
  );
}


// ----------------------------------------------------------------------
// ConsensusPanel — majority-vote consensus across overlapping reads
// ----------------------------------------------------------------------

function ConsensusPanel({ consensus, refLen, onExportFasta, onExportDna }) {
  const { consensusSeq, gaps, uncertainty } = consensus;
  const coveredLen = refLen - gaps.reduce((acc, g) => acc + (g.end - g.start), 0);
  const covPct = refLen ? (coveredLen / refLen) * 100 : 0;
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 text-xs">
      <div className="font-medium text-zinc-800 mb-2 flex items-center justify-between">
        <span>Consensus</span>
        <div className="flex items-center gap-2">
          <button
            onClick={onExportFasta}
            className="px-2 py-1 rounded border border-zinc-300 text-[10px] flex items-center gap-1 hover:bg-zinc-50"
            title="Multi-base consensus sequence as FASTA (uppercase = covered, lowercase = uncovered ref fallback, N = disagreement)"
          >
            <FileDown size={11} /> Consensus FASTA
          </button>
          <button
            onClick={onExportDna}
            className="px-2 py-1 rounded border border-zinc-300 text-[10px] flex items-center gap-1 hover:bg-zinc-50"
            title="Consensus as SnapGene .dna; coverage gaps + disagreement positions annotated as features"
          >
            <FileDown size={11} /> Consensus .dna
          </button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-2">
        <Stat label="Length" value={`${consensusSeq.length} bp`} />
        <Stat label="Covered" value={`${coveredLen} bp (${covPct.toFixed(1)}%)`} />
        <Stat label="Disagreements" value={String(uncertainty.length)} />
      </div>
      {gaps.length > 0 && (
        <div className="text-[11px] text-zinc-700">
          <span className="font-medium">Coverage gaps</span> ({gaps.length}):
          <span className="ml-2 font-mono">
            {gaps.slice(0, 5).map(g => `${g.start}–${g.end}`).join(", ")}
            {gaps.length > 5 ? `, +${gaps.length - 5} more` : ""}
          </span>
        </div>
      )}
      {uncertainty.length > 0 && (
        <div className="text-[11px] text-zinc-700 mt-1">
          <span className="font-medium">Disagreements</span> (first 5):
          <span className="ml-2 font-mono">
            {uncertainty.slice(0, 5).map(u =>
              `pos ${u.pos}: ${u.votes.map(v => `${v.base}×${v.count}`).join("/")}`
            ).join("; ")}
          </span>
        </div>
      )}
    </div>
  );
}


// ----------------------------------------------------------------------
// QualityHistogramPanel — per-Q histogram of the active sample
// ----------------------------------------------------------------------

function QualityHistogramPanel({ sample, qCutoff }) {
  const hist = useMemo(() => computeQualityHistogram(sample.qScores), [sample]);
  if (hist.total === 0) return null;
  const W = 600, H = 90;
  const padX = 30, padY = 10;
  const plotW = W - 2 * padX;
  const plotH = H - 2 * padY;
  const maxBin = Math.max(1, ...hist.bins);
  const xToPx = (q) => padX + (q / Math.max(1, hist.max)) * plotW;
  const barW = plotW / Math.max(1, hist.max + 1);
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 text-xs">
      <div className="font-medium text-zinc-800 mb-1 flex items-center justify-between">
        <span>{sample.sampleName} — Q-score distribution</span>
        <span className="text-[10px] text-zinc-500 font-mono">
          mean {hist.mean.toFixed(1)} · median {hist.median} · max {hist.max}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
        {hist.bins.map((count, q) => {
          if (count === 0) return null;
          const h = (count / maxBin) * plotH;
          const x = xToPx(q) - barW / 2;
          // Color: below cutoff = warning, above = healthy.
          const fill = q < qCutoff ? "#f59e0b" : "#0ea5e9";
          return (
            <rect
              key={q}
              x={x} y={H - padY - h}
              width={Math.max(1, barW - 1)} height={h}
              fill={fill}
              opacity={0.8}
            >
              <title>Q={q}: {count} bases</title>
            </rect>
          );
        })}
        {/* Cutoff guide */}
        <line x1={xToPx(qCutoff)} x2={xToPx(qCutoff)} y1={padY} y2={H - padY}
              stroke="#475569" strokeDasharray="3 2" strokeWidth={0.8} />
        <text x={xToPx(qCutoff)} y={padY + 8} fontSize={9} textAnchor="middle" fill="#475569">
          Q≥{qCutoff}
        </text>
        {/* X-axis ticks at multiples of 10 */}
        {[0, 10, 20, 30, 40, 50, 60].filter(q => q <= hist.max).map(q => (
          <g key={q}>
            <line x1={xToPx(q)} x2={xToPx(q)} y1={H - padY} y2={H - padY + 3} stroke="#9ca3af" />
            <text x={xToPx(q)} y={H - 1} fontSize={8} textAnchor="middle" fill="#6b7280">{q}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}


// ----------------------------------------------------------------------
// SequenceAnalysesPanel — restriction sites + ORFs + GC composition
// ----------------------------------------------------------------------
//
// Three sub-panels stacked vertically. Operates on three possible target
// sequences and the user picks which to analyze:
//   1. Active read (Mott-trimmed) — what was actually sequenced
//   2. Consensus across all loaded reads — what the reads agree on
//   3. Reference — the expected design
//
// Type-IIS hits in particular are surfaced loud because a spurious BsaI
// or BsmBI in a Golden Gate insert is a hazard for the next assembly.

function SequenceAnalysesPanel({ activeRead, qCutoff, consensusSeq, referenceSeq, referenceLabel }) {
  // Derive analyzable target sequences.
  const targets = useMemo(() => {
    const out = [];
    if (activeRead) {
      const trim = mottTrim(activeRead.qScores, qCutoff);
      const seq = activeRead.basecalls.slice(trim.start, trim.end);
      if (seq.length >= 6) out.push({ key: "active", label: `Active read (${activeRead.sampleName}, ${seq.length} bp)`, seq });
    }
    if (consensusSeq && consensusSeq.length >= 6) {
      out.push({ key: "consensus", label: `Consensus (${consensusSeq.length} bp)`, seq: consensusSeq });
    }
    if (referenceSeq && referenceSeq.length >= 6) {
      out.push({ key: "ref", label: `Reference (${referenceLabel || `${referenceSeq.length} bp`})`, seq: referenceSeq });
    }
    return out;
  }, [activeRead, qCutoff, consensusSeq, referenceSeq, referenceLabel]);

  const [selected, setSelected] = useState(targets[0]?.key);
  // Reset selection if the previous target disappears (e.g., user clears reference).
  useEffect(() => {
    if (!targets.find(t => t.key === selected)) setSelected(targets[0]?.key);
  }, [targets, selected]);

  const target = targets.find(t => t.key === selected);
  if (!target) return null;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 text-xs">
      <div className="font-medium text-zinc-800 mb-2 flex items-center justify-between">
        <span>Sequence analyses</span>
        <select
          value={selected}
          onChange={e => setSelected(e.target.value)}
          className="text-xs border border-zinc-300 rounded px-2 py-0.5"
        >
          {targets.map(t => (
            <option key={t.key} value={t.key}>{t.label}</option>
          ))}
        </select>
      </div>
      <div className="space-y-3">
        <RestrictionSitesSection seq={target.seq} />
        <ORFSection seq={target.seq} />
        <GCSection seq={target.seq} />
      </div>
    </div>
  );
}

function RestrictionSitesSection({ seq }) {
  const hits = useMemo(() => findEnzymeSites(seq), [seq]);
  const typeIIS = hits.filter(h => h.isTypeIIS);
  const otherHits = hits.filter(h => !h.isTypeIIS);
  return (
    <div className="border border-zinc-100 rounded p-2">
      <div className="font-medium text-zinc-800 mb-1">
        Restriction sites
        {typeIIS.length > 0 && (
          <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] bg-rose-100 text-rose-800">
            {typeIIS.length} Type-IIS hit{typeIIS.length === 1 ? "" : "s"} (Golden Gate hazard)
          </span>
        )}
      </div>
      {hits.length === 0 ? (
        <div className="text-zinc-500">No catalog sites in this sequence.</div>
      ) : (
        <table className="w-full">
          <thead className="text-[10px] uppercase tracking-wider text-zinc-500">
            <tr>
              <Th>Enzyme</Th>
              <Th>Recognition</Th>
              <Th>Position</Th>
              <Th>Strand</Th>
              <Th>Class</Th>
            </tr>
          </thead>
          <tbody>
            {[...typeIIS, ...otherHits].map((h, i) => {
              const enzyme = ENZYME_CATALOG.find(e => e.name === h.enzyme);
              return (
                <tr key={i} className={`border-t border-zinc-100 ${h.isTypeIIS ? "bg-rose-50/40" : ""}`}>
                  <Td className="font-medium">{h.enzyme}</Td>
                  <Td className="font-mono">{enzyme?.recognition}</Td>
                  <Td className="font-mono">{h.start}–{h.end}</Td>
                  <Td>{h.strand === 1 ? "+" : "−"}</Td>
                  <Td className="text-[10px]">{h.isTypeIIS ? "Type-IIS" : "Class-II"}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ORFSection({ seq }) {
  const orfs = useMemo(() => findOrfs(seq, { minLengthAa: 50 }), [seq]);
  if (orfs.length === 0) {
    return (
      <div className="border border-zinc-100 rounded p-2">
        <div className="font-medium text-zinc-800 mb-1">Open reading frames (≥50 aa)</div>
        <div className="text-zinc-500">No ORFs of ≥50 aa found in any of 6 frames.</div>
      </div>
    );
  }
  return (
    <div className="border border-zinc-100 rounded p-2">
      <div className="font-medium text-zinc-800 mb-1">
        Open reading frames (≥50 aa) <span className="text-zinc-500">— {orfs.length} found, longest {orfs[0].lengthAa} aa</span>
      </div>
      <table className="w-full">
        <thead className="text-[10px] uppercase tracking-wider text-zinc-500">
          <tr><Th>Length (aa)</Th><Th>Strand</Th><Th>Frame</Th><Th>Position</Th></tr>
        </thead>
        <tbody>
          {orfs.slice(0, 10).map((o, i) => (
            <tr key={i} className="border-t border-zinc-100">
              <Td className="font-mono">{o.lengthAa}</Td>
              <Td>{o.strand === 1 ? "+" : "−"}</Td>
              <Td className="font-mono">{o.frame}</Td>
              <Td className="font-mono">{o.start}–{o.end}</Td>
            </tr>
          ))}
          {orfs.length > 10 && (
            <tr><Td colSpan={4} className="text-zinc-500 text-[10px]">+{orfs.length - 10} smaller ORFs not shown</Td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ----------------------------------------------------------------------
// StackedReadsPanel — multi-read mini-chromatograms on a shared reference axis
// ----------------------------------------------------------------------
//
// Each loaded read is one horizontal track positioned on the reference axis
// at its [targetStart, targetEnd] alignment range. Within the track, a
// compact 4-channel chromatogram is rendered by mapping reference positions
// back through the alignment to trace-data-point coordinates.
//
// Mismatch positions get vertical markers. Click a track to focus that
// sample in the main chromatogram + analyses above.
//
// Drag-to-brush selects a reference x-range to zoom; double-click resets.
// Zoom is shared across all tracks (one stacked view = one reference axis).

function StackedReadsPanel({ samples, reads, refLen, qCutoff, active, onPick }) {
  const [zoom, setZoom] = useState(null);  // {start, end} in ref coords
  const [brush, setBrush] = useState(null);

  const W = 1200;
  const TRACK_H = 56;
  const padX = 30;
  const headerH = 18;
  const trackGap = 4;
  const plotW = W - 2 * padX;
  const sortedReads = useMemo(
    () => [...reads].sort((a, b) => (a.score?.targetStart ?? 0) - (b.score?.targetStart ?? 0)),
    [reads],
  );
  const H = headerH + sortedReads.length * (TRACK_H + trackGap) + 24;

  const refStart = Math.max(0, Math.floor(zoom?.start ?? 0));
  const refEnd = Math.min(refLen, Math.ceil(zoom?.end ?? refLen));
  const refSpan = Math.max(1, refEnd - refStart);
  const refToPx = (r) => padX + ((r - refStart) / refSpan) * plotW;

  // ----- Brush + zoom interaction --------------------------------------
  const cssXToRef = (svgEl, clientX) => {
    if (!svgEl) return null;
    const r = svgEl.getBoundingClientRect();
    const cssLeft = r.left + (padX / W) * r.width;
    const cssWidth = (plotW / W) * r.width;
    const t = (clientX - cssLeft) / cssWidth;
    const tClamped = Math.max(0, Math.min(1, t));
    return refStart + tClamped * refSpan;
  };
  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    const r = cssXToRef(e.currentTarget, e.clientX);
    if (r == null) return;
    setBrush({ x0: r, x1: r });
  };
  const onMouseMove = (e) => {
    if (!brush) return;
    const r = cssXToRef(e.currentTarget, e.clientX);
    if (r == null) return;
    setBrush({ x0: brush.x0, x1: r });
  };
  const onMouseUp = () => {
    if (!brush) return;
    const lo = Math.min(brush.x0, brush.x1);
    const hi = Math.max(brush.x0, brush.x1);
    setBrush(null);
    if (hi - lo >= 10) setZoom({ start: Math.round(lo), end: Math.round(hi) });
  };
  const onMouseLeave = () => setBrush(null);
  const onDoubleClick = () => setZoom(null);
  const onWheel = (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 0.85 : 1.15;
    const center = cssXToRef(e.currentTarget, e.clientX);
    if (center == null) return;
    const newSpan = Math.max(10, refSpan * factor);
    const newStart = Math.max(0, center - newSpan * ((center - refStart) / refSpan));
    const newEnd = Math.min(refLen, newStart + newSpan);
    if (newStart <= 0 && newEnd >= refLen) setZoom(null);
    else setZoom({ start: Math.round(newStart), end: Math.round(newEnd) });
  };

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 text-xs overflow-x-auto">
      <div className="font-medium text-zinc-800 mb-1 flex items-center justify-between">
        <span>Stacked reads view ({sortedReads.length} reads on shared reference axis)</span>
        <span className="font-mono text-[10px] text-zinc-500">
          ref {refStart}–{refEnd}{zoom ? <span className="ml-2 text-indigo-600">zoomed</span> : null}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none"
        onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave} onDoubleClick={onDoubleClick} onWheel={onWheel}
        style={{ cursor: brush ? "ew-resize" : "crosshair", userSelect: "none" }}
      >
        {/* Reference axis ticks at top */}
        {[0, 0.25, 0.5, 0.75, 1.0].map(f => {
          const r = Math.round(refStart + f * refSpan);
          return (
            <g key={f}>
              <line x1={refToPx(r)} x2={refToPx(r)} y1={headerH - 4} y2={headerH} stroke="#9ca3af" />
              <text x={refToPx(r)} y={headerH - 6} textAnchor="middle" fontSize={9} fill="#6b7280">{r}</text>
            </g>
          );
        })}
        {/* Per-read tracks */}
        {sortedReads.map((readEntry, i) => {
          const sample = samples[readEntry.name];
          if (!sample) return null;
          const yTop = headerH + i * (TRACK_H + trackGap);
          return (
            <ReadTrack
              key={readEntry.name}
              y={yTop} h={TRACK_H} W={W} padX={padX} plotW={plotW}
              refStart={refStart} refEnd={refEnd} refSpan={refSpan}
              refToPx={refToPx}
              sample={sample}
              score={readEntry.score}
              qCutoff={qCutoff}
              isActive={readEntry.name === active}
              onClick={() => onPick(readEntry.name)}
            />
          );
        })}
        {/* Brush selection */}
        {brush && Math.abs(brush.x1 - brush.x0) > 1 && (
          <rect
            x={Math.min(refToPx(brush.x0), refToPx(brush.x1))}
            y={headerH}
            width={Math.abs(refToPx(brush.x1) - refToPx(brush.x0))}
            height={H - headerH - 24}
            fill="#6366f1" fillOpacity={0.15}
            stroke="#6366f1" strokeOpacity={0.5}
          />
        )}
      </svg>
      <div className="mt-1 text-[10px] text-zinc-500">
        Drag to brush-zoom · scroll to zoom · double-click to reset · click a track to focus its chromatogram
      </div>
    </div>
  );
}

function ReadTrack({
  y, h, W, padX, plotW, refStart, refEnd, refSpan, refToPx,
  sample, score, qCutoff, isActive, onClick,
}) {
  // 1. Determine the read's overlap with the visible reference window.
  if (!score || !score.length) {
    return null;
  }
  const tStart = Math.max(refStart, score.targetStart);
  const tEnd = Math.min(refEnd, score.targetEnd);
  if (tEnd <= tStart) {
    // Read doesn't overlap visible window; render a thin placeholder.
    return (
      <g>
        <rect x={padX} y={y + h / 2 - 1} width={plotW} height={2} fill="#e5e7eb" />
        <text x={padX - 4} y={y + h / 2 + 3} fontSize={9} textAnchor="end" fill="#9ca3af">{sample.sampleName}</text>
      </g>
    );
  }

  // 2. Walk the alignment to build refPos → traceX map for the visible
  //    portion of this read. trim is needed because the alignment was
  //    computed on Mott-trimmed basecalls; `peakLocations` is in raw
  //    untrimmed-basecall index space, so we add `trim.start`.
  const trim = mottTrim(sample.qScores, qCutoff);
  const peakLocs = sample.peakLocations;
  const t = score.alignedTarget;
  const q = score.alignedQuery;
  const refTraces = [];  // [{refPos, traceX, qIdxInTrim}]
  let tPos = score.targetStart;
  let qPos = score.queryStart;  // 0-based position in the trimmed read
  for (let k = 0; k < t.length; k++) {
    const tc = t[k];
    const qc = q[k];
    if (tc === "-") { qPos++; continue; }
    if (qc !== "-" && tPos >= tStart && tPos < tEnd) {
      const traceX = peakLocs[trim.start + qPos];
      if (traceX != null) refTraces.push({ refPos: tPos, traceX, qIdxInTrim: qPos });
    }
    if (tc !== "-") tPos++;
    if (qc !== "-") qPos++;
  }

  // 3. Compute y-scaling for this track from visible trace values.
  const traceLen = sample.traces?.A?.length || 0;
  let maxVal = 100;
  for (const { traceX } of refTraces) {
    for (const base of ["A", "C", "G", "T"]) {
      const tr = sample.traces[base];
      if (!tr) continue;
      const v = tr[Math.round(traceX)];
      if (v > maxVal) maxVal = v;
    }
  }
  const tracePlotTop = y + 14;
  const tracePlotH = h - 22;
  const yToPx = (v) => tracePlotTop + (1 - v / maxVal) * tracePlotH;

  // 4. Build polylines per channel and mismatch markers.
  const channelPaths = ["G", "A", "T", "C"].map(base => {
    const tr = sample.traces[base];
    if (!tr) return null;
    let d = "";
    for (let i = 0; i < refTraces.length; i++) {
      const { refPos, traceX } = refTraces[i];
      const x = refToPx(refPos);
      const v = tr[Math.round(traceX)] ?? 0;
      d += `${i === 0 ? "M" : "L"}${x.toFixed(1)},${yToPx(v).toFixed(1)} `;
    }
    return { base, d };
  }).filter(Boolean);

  // Mismatch positions in reference space.
  const mismatches = [];
  let tp = score.targetStart;
  for (let k = 0; k < t.length; k++) {
    const tc = t[k]; const qc = q[k];
    if (tc !== "-" && qc !== "-" && tc !== qc && tp >= tStart && tp < tEnd) {
      mismatches.push(tp);
    }
    if (tc !== "-") tp++;
  }

  void traceLen;

  const verdictColor = score.verdict === "pass" ? "#16a34a"
    : score.verdict === "warn" ? "#f59e0b" : "#e11d48";

  return (
    <g onClick={onClick} style={{ cursor: "pointer" }}>
      {/* Track background */}
      <rect
        x={padX} y={y}
        width={plotW} height={h}
        fill={isActive ? "#eef2ff" : "white"}
        stroke="#e5e7eb"
      />
      {/* Verdict bar on the left edge */}
      <rect x={padX} y={y} width={3} height={h} fill={verdictColor} />
      {/* Sample name */}
      <text x={padX - 4} y={y + 12} fontSize={9} textAnchor="end" fill={isActive ? "#1e3a8a" : "#374151"}
            fontFamily="monospace" fontWeight={isActive ? 700 : 400}>
        {sample.sampleName}
      </text>
      {/* Aligned-range bracket on the reference axis */}
      <rect
        x={refToPx(Math.max(refStart, score.targetStart))}
        y={y + 1} width={Math.max(2, refToPx(Math.min(refEnd, score.targetEnd)) - refToPx(Math.max(refStart, score.targetStart)))}
        height={3} fill={verdictColor} fillOpacity={0.4}
      />
      {/* Mismatch markers */}
      {mismatches.map((p, i) => (
        <line key={i}
          x1={refToPx(p)} x2={refToPx(p)}
          y1={tracePlotTop - 2} y2={tracePlotTop + tracePlotH + 1}
          stroke="#f43f5e" strokeWidth={1} strokeDasharray="2 2" opacity={0.6}
        />
      ))}
      {/* Channel polylines */}
      {channelPaths.map(({ base, d }) => (
        <path key={base} d={d} stroke={SANGER_BASE_COLORS[base]} strokeWidth={0.8} fill="none" opacity={0.85} />
      ))}
      {/* Identity readout */}
      <text x={W - padX + 2} y={y + 12} fontSize={9} textAnchor="start" fill={verdictColor} fontFamily="monospace">
        {(score.identity * 100).toFixed(1)}%
      </text>
    </g>
  );
}


// ----------------------------------------------------------------------
// PrimerMappingPanel — drop a primer FASTA, see where each primer lands
// ----------------------------------------------------------------------
//
// Lab workflow: "I ordered primers PS1-PS6 for this construct; did the
// Sanger reads come back in the right positions?" Drop the primer FASTA
// (or paste it), and this panel shows for each primer:
//  - mapping position(s) on the reference
//  - mapping position(s) on each loaded read's basecalls
//  - strand and mismatch count for each match
//
// Up to 2 mismatches by default (typical primer ordering noise).

function PrimerMappingPanel({ primers, setPrimers, samples, qCutoff, referenceSeq, referenceLabel }) {
  const fileRef = useRef(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [maxMm, setMaxMm] = useState(2);

  const onPick = (e) => {
    for (const f of e.target.files || []) {
      f.text().then(text => {
        const records = parseMultiFasta(text);
        if (records.length > 0) setPrimers(records);
      });
    }
    e.target.value = "";
  };

  const sampleNames = useMemo(() => Object.keys(samples).sort(), [samples]);

  const matches = useMemo(() => {
    if (primers.length === 0) return [];
    return primers.map(primer => {
      const refHits = referenceSeq ? findPrimerMatches(primer.sequence, referenceSeq, { maxMismatches: maxMm }) : [];
      const perReadHits = sampleNames.map(name => {
        const s = samples[name];
        // Search against the trim window of the read for relevance.
        const trim = mottTrim(s.qScores, qCutoff);
        const trimmedRead = s.basecalls.slice(trim.start, trim.end);
        const hits = findPrimerMatches(primer.sequence, trimmedRead, { maxMismatches: maxMm });
        return {
          name,
          hits: hits.map(h => ({ ...h, start: h.start + trim.start, end: h.end + trim.start })),
        };
      });
      return { primer, refHits, perReadHits };
    });
  }, [primers, referenceSeq, samples, sampleNames, qCutoff, maxMm]);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 text-xs">
      <div className="font-medium text-zinc-800 mb-2 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span>Primer mapping</span>
          {primers.length > 0 && (
            <span className="text-[10px] text-zinc-500">({primers.length} primer{primers.length === 1 ? "" : "s"} loaded)</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] flex items-center gap-1 text-zinc-700">
            max mm
            <select
              value={maxMm}
              onChange={e => setMaxMm(Number(e.target.value))}
              className="border border-zinc-300 rounded px-1 py-0.5 text-xs"
            >
              <option value={0}>0</option>
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </label>
          <button
            onClick={() => fileRef.current?.click()}
            className="px-2 py-1 rounded border border-zinc-300 text-[10px] hover:bg-zinc-50"
          >
            Load FASTA…
          </button>
          <button
            onClick={() => setPasteOpen(true)}
            className="px-2 py-1 rounded border border-zinc-300 text-[10px] hover:bg-zinc-50"
          >
            Paste…
          </button>
          {primers.length > 0 && (
            <button
              onClick={() => setPrimers([])}
              className="px-2 py-1 rounded border border-zinc-300 text-[10px] hover:bg-zinc-50"
            >
              Clear
            </button>
          )}
          <input ref={fileRef} type="file" accept=".fasta,.fa,.fna,.txt" multiple onChange={onPick} className="hidden" />
        </div>
      </div>
      {primers.length === 0 ? (
        <div className="text-zinc-500">
          Drop or paste a primer FASTA (multi-record OK) to see where each primer maps on the reference and on each loaded read.
        </div>
      ) : (
        <div className="overflow-auto max-h-96">
          <table className="w-full">
            <thead className="text-[10px] uppercase tracking-wider text-zinc-500 sticky top-0 bg-white">
              <tr>
                <Th>Primer</Th>
                <Th>Length</Th>
                <Th>On reference</Th>
                {sampleNames.map(n => <Th key={n}>On {n}</Th>)}
              </tr>
            </thead>
            <tbody>
              {matches.map(({ primer, refHits, perReadHits }) => (
                <tr key={primer.name} className="border-t border-zinc-100">
                  <Td>
                    <div className="font-mono">{primer.name}</div>
                    <div className="font-mono text-[10px] text-zinc-500 truncate max-w-[12rem]">{primer.sequence}</div>
                  </Td>
                  <Td className="font-mono">{primer.sequence.length} nt</Td>
                  <Td><HitsCell hits={refHits} /></Td>
                  {perReadHits.map(({ name, hits }) => (
                    <Td key={name}><HitsCell hits={hits} /></Td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pasteOpen && (
        <PastePrimersModal
          onClose={() => setPasteOpen(false)}
          onApply={(records) => { setPrimers(records); setPasteOpen(false); }}
        />
      )}
      {referenceLabel && primers.length > 0 && (
        <div className="mt-2 text-[10px] text-zinc-500">
          Reference: {referenceLabel}. Reads scanned within their Q≥{qCutoff} trim window only.
        </div>
      )}
    </div>
  );
}

function HitsCell({ hits }) {
  if (!hits || hits.length === 0) return <span className="text-zinc-400">—</span>;
  return (
    <div className="space-y-0.5">
      {hits.slice(0, 4).map((h, i) => (
        <div key={i} className="font-mono text-[10px]">
          {h.start}–{h.end}
          <span className={`ml-1 ${h.strand === 1 ? "text-emerald-700" : "text-rose-700"}`}>
            {h.strand === 1 ? "+" : "−"}
          </span>
          {h.mismatches > 0 && <span className="ml-1 text-amber-600">({h.mismatches}mm)</span>}
        </div>
      ))}
      {hits.length > 4 && <div className="text-[10px] text-zinc-500">+{hits.length - 4} more</div>}
    </div>
  );
}

function PastePrimersModal({ onClose, onApply }) {
  const [text, setText] = useState("");
  const records = useMemo(() => parseMultiFasta(text), [text]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-2xl w-[600px] max-w-[95vw] p-4" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold mb-2">Paste primer FASTA</h3>
        <p className="text-xs text-zinc-600 mb-2">Multi-record OK. Sequences will be searched on both strands.</p>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={10}
          className="w-full font-mono text-xs border border-zinc-300 rounded p-2"
          placeholder=">PS1 forward primer&#10;ACGTACGTACGTACGTACGT&#10;>PS2 reverse primer&#10;..."
        />
        <div className="flex justify-between items-center mt-3">
          <span className="text-xs text-zinc-500">{records.length} primer{records.length === 1 ? "" : "s"} parsed</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 rounded border border-zinc-300">Cancel</button>
            <button
              onClick={() => onApply(records)}
              disabled={records.length === 0}
              className="px-3 py-1.5 rounded bg-indigo-600 text-white disabled:opacity-40"
            >
              Use these
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


// ----------------------------------------------------------------------
// IssuesPanel — auto-detected trace anomalies, severity-ranked
// ----------------------------------------------------------------------
//
// Lists every issue detected by lib/sanger_issues.js with a per-issue
// "Show" button that zooms the main chromatogram to the issue's trace
// range. Each row also carries a small inline preview SVG (the 4-channel
// trace within ~20 data points around the issue) so the user can scan
// the panel without committing to a zoom.

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

function IssuesPanel({ sample, qCutoff, issues, summary, onFocus }) {
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


function GCSection({ seq }) {
  const overall = overallGc(seq);
  const W = 600, H = 60, padX = 30, padY = 8;
  const plotW = W - 2 * padX;
  const plotH = H - 2 * padY;
  const window = Math.max(20, Math.min(100, Math.floor(seq.length / 20)));
  const gcArr = useMemo(() => gcComposition(seq, window), [seq, window]);
  // Subsample to ~plotW points for SVG perf on long sequences.
  const stride = Math.max(1, Math.floor(seq.length / plotW));
  const points = [];
  for (let i = 0; i < seq.length; i += stride) {
    const x = padX + (i / Math.max(1, seq.length - 1)) * plotW;
    const y = padY + (1 - gcArr[i]) * plotH;
    points.push([x, y]);
  }
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  return (
    <div className="border border-zinc-100 rounded p-2">
      <div className="font-medium text-zinc-800 mb-1 flex items-center justify-between">
        <span>GC composition <span className="text-zinc-500 font-normal">(window {window} bp)</span></span>
        <span className="font-mono text-[10px] text-zinc-600">overall {(overall * 100).toFixed(1)}%</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
        {/* 50% GC reference line */}
        <line
          x1={padX} x2={W - padX}
          y1={padY + plotH / 2} y2={padY + plotH / 2}
          stroke="#9ca3af" strokeDasharray="3 2" strokeWidth={0.6}
        />
        <text x={padX - 4} y={padY + plotH / 2 + 3} fontSize={8} textAnchor="end" fill="#9ca3af">50%</text>
        <text x={padX - 4} y={padY + 6} fontSize={8} textAnchor="end" fill="#9ca3af">100%</text>
        <text x={padX - 4} y={padY + plotH + 3} fontSize={8} textAnchor="end" fill="#9ca3af">0%</text>
        <path d={d} stroke="#0ea5e9" strokeWidth={1} fill="none" />
        {/* Position ticks */}
        {[0, 0.5, 1].map(f => {
          const x = padX + f * plotW;
          return (
            <g key={f}>
              <line x1={x} x2={x} y1={H - padY} y2={H - padY + 2} stroke="#9ca3af" />
              <text x={x} y={H - 1} fontSize={8} textAnchor="middle" fill="#6b7280">
                {Math.round(f * (seq.length - 1))}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

