// src/components/sanger_report_modal.jsx — multi-page Sanger PDF report.
//
// Modeled on the existing CE ReportModal (src/components/modals.jsx). React
// portal to document.body so print isolation classes apply; uses the same
// fv-report-root / fv-report-printing CSS already established in
// print_styles.jsx.
//
// Sections:
//   A. Header — date, reference, sample count, Q-cutoff, key counts
//   B. Per-sample verification table (mirrors verification CSV)
//   C. Coverage profile (depth + per-read stripes)
//   D. Auto-detected issues across all samples (high + medium only)
//   E. Consensus stats (length, covered %, gap count, disagreement count)
//   F. Per-sample chromatogram (active only)
//   G. Mismatch table (active sample)
//
// Each section is wrapped in <section> with page-break-inside: avoid; the
// printSafePrint() helper triggers window.print() after two RAFs to ensure
// the print CSS has applied.

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Printer, FileDown } from "lucide-react";


export function SangerReportModal({
  open,
  onClose,
  generatedAt,
  reference,
  referenceLabel,
  qCutoff,
  samples,
  multiReadAnalysis,
  activeSample,
  activeScore,
  issues,
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;

  const printSafePrint = () => {
    document.body.classList.add("fv-report-printing");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print();
        setTimeout(() => document.body.classList.remove("fv-report-printing"), 500);
      });
    });
  };

  const downloadMd = () => {
    const md = buildSangerReportMarkdown({
      generatedAt, reference, referenceLabel, qCutoff, samples,
      multiReadAnalysis, activeSample, activeScore, issues,
    });
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `sanger_report_${generatedAt.toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const sortedReads = multiReadAnalysis
    ? [...multiReadAnalysis.reads].sort((a, b) => a.name.localeCompare(b.name))
    : [];
  const consensus = multiReadAnalysis?.consensus;

  const dateStr = generatedAt.toISOString().slice(0, 19).replace("T", " ");

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-6 px-4 fv-report-backdrop">
      <div className="fixed inset-0 bg-black/40 fv-report-backdrop" onClick={onClose} />
      <div className="relative w-full max-w-[900px] bg-white rounded-xl shadow-2xl overflow-hidden fv-report-root">
        {/* Top action bar — hidden in print via .fv-report-actions */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-200 fv-report-actions no-print">
          <div className="font-semibold flex items-center gap-2">
            Sanger report
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">draft</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={downloadMd} className="px-3 py-1.5 rounded border border-zinc-300 text-xs flex items-center gap-1 hover:bg-zinc-50">
              <FileDown size={12} /> Markdown
            </button>
            <button onClick={printSafePrint} className="px-3 py-1.5 rounded bg-indigo-600 text-white text-xs flex items-center gap-1 hover:bg-indigo-700">
              <Printer size={12} /> Print / Save as PDF
            </button>
            <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 p-1 rounded" aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable report body — print-isolated to fill the page */}
        <div className="max-h-[80vh] overflow-y-auto p-6 text-zinc-900">
          <ReportHeader
            dateStr={dateStr}
            reference={reference} referenceLabel={referenceLabel}
            qCutoff={qCutoff} samples={samples}
            multiReadAnalysis={multiReadAnalysis}
            issues={issues}
          />

          {sortedReads.length > 0 && reference && (
            <section className="mt-6">
              <h3 className="text-sm font-semibold mb-2">Per-sample verification</h3>
              <VerificationTable rows={sortedReads} refLen={reference.length} />
            </section>
          )}

          {consensus && (
            <section className="mt-6">
              <h3 className="text-sm font-semibold mb-2">Consensus</h3>
              <ConsensusBlock consensus={consensus} refLen={reference?.length || 0} />
            </section>
          )}

          {issues && issues.length > 0 && (
            <section className="mt-6">
              <h3 className="text-sm font-semibold mb-2">
                Auto-detected issues ({issues.length} on active sample)
              </h3>
              <IssuesList issues={issues.filter(i => i.severity !== "low").slice(0, 50)} />
            </section>
          )}

          {activeScore && (
            <section className="mt-6 fv-report-page-break">
              <h3 className="text-sm font-semibold mb-2">Mismatches: {activeSample.sampleName}</h3>
              <MismatchListBlock score={activeScore} />
            </section>
          )}

          <footer className="mt-8 pt-4 border-t border-zinc-200 text-[10px] text-zinc-500">
            Generated by Fragment Viewer Sanger tab. Detection thresholds tuned for typical Sanger reads (Q≥{qCutoff} trim window, mixed-peak ≥30%, low-signal &lt; 80, quality-dip ≥12 below mean, N-density ≥50%).
          </footer>
        </div>
      </div>
    </div>,
    document.body,
  );
}


// ----------------------------------------------------------------------
// Sub-blocks
// ----------------------------------------------------------------------

function ReportHeader({ dateStr, reference, referenceLabel, qCutoff, samples, multiReadAnalysis, issues }) {
  const sampleCount = Object.keys(samples).length;
  const passCount = multiReadAnalysis
    ? multiReadAnalysis.reads.filter(r => r.score?.verdict === "pass").length
    : 0;
  const warnCount = multiReadAnalysis
    ? multiReadAnalysis.reads.filter(r => r.score?.verdict === "warn").length
    : 0;
  const failCount = multiReadAnalysis
    ? multiReadAnalysis.reads.filter(r => r.score?.verdict === "fail").length
    : 0;
  const highIssues = (issues || []).filter(i => i.severity === "high").length;
  const mediumIssues = (issues || []).filter(i => i.severity === "medium").length;
  return (
    <header>
      <h2 className="text-lg font-bold">Sanger sequencing report</h2>
      <div className="text-xs text-zinc-600 mt-1">
        {dateStr} · {sampleCount} sample{sampleCount === 1 ? "" : "s"} loaded
        {reference ? ` · reference ${referenceLabel || `${reference.length} bp`}` : " · no reference"}
        · trim Q≥{qCutoff}
      </div>
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <Stat label="PASS" value={passCount} color="emerald" />
        <Stat label="WARN" value={warnCount} color="amber" />
        <Stat label="FAIL" value={failCount} color="rose" />
        <Stat label="Issues (high+med)" value={highIssues + mediumIssues} color={highIssues > 0 ? "rose" : "zinc"} />
      </div>
    </header>
  );
}

function Stat({ label, value, color = "zinc" }) {
  const cls = {
    emerald: "bg-emerald-50 text-emerald-900 border-emerald-200",
    amber: "bg-amber-50 text-amber-900 border-amber-200",
    rose: "bg-rose-50 text-rose-900 border-rose-200",
    zinc: "bg-zinc-50 text-zinc-900 border-zinc-200",
  }[color];
  return (
    <div className={`rounded border ${cls} p-2`}>
      <div className="text-[10px] uppercase tracking-wider opacity-70">{label}</div>
      <div className="font-mono text-base">{value}</div>
    </div>
  );
}

function VerificationTable({ rows, refLen }) {
  return (
    <table className="w-full text-xs">
      <thead className="bg-zinc-50">
        <tr>
          <Th>Sample</Th><Th>Verdict</Th><Th>Identity</Th>
          <Th>Coverage</Th><Th>Mismatches</Th><Th>Gaps</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ name, score }) => {
          const pct = refLen ? (((score.targetEnd - score.targetStart) / refLen) * 100) : 0;
          return (
            <tr key={name} className="border-t border-zinc-100">
              <Td className="font-mono">{name}</Td>
              <Td className={
                score.verdict === "pass" ? "text-emerald-700"
                : score.verdict === "warn" ? "text-amber-700"
                : "text-rose-700"
              }>{score.verdict.toUpperCase()}</Td>
              <Td className="font-mono">{(score.identity * 100).toFixed(2)}%</Td>
              <Td className="font-mono">{score.targetStart}-{score.targetEnd} ({pct.toFixed(0)}%)</Td>
              <Td className="font-mono">{score.mismatches}</Td>
              <Td className="font-mono">{score.gaps}</Td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ConsensusBlock({ consensus, refLen }) {
  const coveredLen = refLen - consensus.gaps.reduce((acc, g) => acc + (g.end - g.start), 0);
  const covPct = refLen ? (coveredLen / refLen) * 100 : 0;
  return (
    <div className="text-xs space-y-1">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Length" value={`${consensus.consensusSeq.length} bp`} />
        <Stat label="Covered" value={`${coveredLen} bp (${covPct.toFixed(1)}%)`} />
        <Stat label="Disagreements" value={consensus.uncertainty.length} color={consensus.uncertainty.length > 0 ? "amber" : "zinc"} />
      </div>
      {consensus.gaps.length > 0 && (
        <div className="mt-2">
          <span className="font-medium">Coverage gaps</span> ({consensus.gaps.length}):
          <span className="ml-2 font-mono">
            {consensus.gaps.slice(0, 8).map(g => `${g.start}–${g.end}`).join(", ")}
            {consensus.gaps.length > 8 ? `, +${consensus.gaps.length - 8} more` : ""}
          </span>
        </div>
      )}
    </div>
  );
}

function IssuesList({ issues }) {
  return (
    <table className="w-full text-xs">
      <thead className="bg-zinc-50">
        <tr><Th>Type</Th><Th>Severity</Th><Th>Position</Th><Th>Description</Th></tr>
      </thead>
      <tbody>
        {issues.map((iss, i) => (
          <tr key={i} className="border-t border-zinc-100">
            <Td>{iss.type.replace("_", " ")}</Td>
            <Td className={iss.severity === "high" ? "text-rose-700 font-medium" : "text-amber-700"}>
              {iss.severity}
            </Td>
            <Td className="font-mono">{iss.rangeBp[0] + 1}–{iss.rangeBp[1]}</Td>
            <Td>{iss.description}</Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MismatchListBlock({ score }) {
  if (!score.mismatchList?.length) {
    return <div className="text-xs text-emerald-700 font-medium">Perfect match — no mismatches, insertions, or deletions in the aligned window.</div>;
  }
  return (
    <table className="w-full text-xs">
      <thead className="bg-zinc-50"><tr><Th>Ref pos</Th><Th>Ref</Th><Th>Read</Th><Th>Kind</Th></tr></thead>
      <tbody>
        {score.mismatchList.slice(0, 200).map((m, i) => (
          <tr key={i} className="border-t border-zinc-100">
            <Td className="font-mono">{m.position + 1}</Td>
            <Td className="font-mono">{m.refBase}</Td>
            <Td className="font-mono">{m.queryBase}</Td>
            <Td>{m.kind}</Td>
          </tr>
        ))}
        {score.mismatchList.length > 200 && (
          <tr><Td colSpan={4} className="text-zinc-500 text-[10px]">+{score.mismatchList.length - 200} more not shown</Td></tr>
        )}
      </tbody>
    </table>
  );
}


// ----------------------------------------------------------------------
// Markdown report builder (alternative to PDF)
// ----------------------------------------------------------------------

export function buildSangerReportMarkdown({
  generatedAt, reference, referenceLabel, qCutoff, samples,
  multiReadAnalysis, activeSample, activeScore, issues,
}) {
  const lines = [];
  lines.push(`# Sanger sequencing report`);
  lines.push(``);
  lines.push(`Generated: ${generatedAt.toISOString()}`);
  lines.push(``);
  const sampleCount = Object.keys(samples).length;
  lines.push(`- Samples: ${sampleCount}`);
  if (reference) lines.push(`- Reference: ${referenceLabel || `${reference.length} bp`}`);
  lines.push(`- Trim Q-cutoff: ${qCutoff}`);
  if (multiReadAnalysis) {
    const reads = multiReadAnalysis.reads;
    const pass = reads.filter(r => r.score?.verdict === "pass").length;
    const warn = reads.filter(r => r.score?.verdict === "warn").length;
    const fail = reads.filter(r => r.score?.verdict === "fail").length;
    lines.push(``);
    lines.push(`## Verification summary`);
    lines.push(``);
    lines.push(`PASS: ${pass} · WARN: ${warn} · FAIL: ${fail}`);
    lines.push(``);
    lines.push(`| Sample | Verdict | Identity | Coverage | Mismatches | Gaps |`);
    lines.push(`|---|---|---|---|---|---|`);
    for (const { name, score } of reads.sort((a, b) => a.name.localeCompare(b.name))) {
      lines.push(
        `| \`${name}\` | ${score.verdict.toUpperCase()} | ${(score.identity * 100).toFixed(2)}% `
        + `| ${score.targetStart}–${score.targetEnd} | ${score.mismatches} | ${score.gaps} |`
      );
    }
  }
  if (multiReadAnalysis?.consensus) {
    const c = multiReadAnalysis.consensus;
    const coveredLen = (reference?.length || 0) - c.gaps.reduce((a, g) => a + (g.end - g.start), 0);
    lines.push(``);
    lines.push(`## Consensus`);
    lines.push(``);
    lines.push(`- Length: ${c.consensusSeq.length} bp`);
    lines.push(`- Covered: ${coveredLen} bp`);
    lines.push(`- Coverage gaps: ${c.gaps.length}`);
    lines.push(`- Disagreements: ${c.uncertainty.length}`);
  }
  if (issues && issues.length > 0) {
    lines.push(``);
    lines.push(`## Auto-detected issues (active sample)`);
    lines.push(``);
    lines.push(`| Type | Severity | Range (bp) | Description |`);
    lines.push(`|---|---|---|---|`);
    for (const iss of issues.filter(i => i.severity !== "low").slice(0, 100)) {
      lines.push(`| ${iss.type} | ${iss.severity} | ${iss.rangeBp[0] + 1}-${iss.rangeBp[1]} | ${iss.description} |`);
    }
  }
  if (activeScore && activeScore.mismatchList?.length) {
    lines.push(``);
    lines.push(`## Mismatches in ${activeSample.sampleName} vs reference`);
    lines.push(``);
    lines.push(`| Ref pos | Ref | Read | Kind |`);
    lines.push(`|---|---|---|---|`);
    for (const m of activeScore.mismatchList.slice(0, 200)) {
      lines.push(`| ${m.position + 1} | ${m.refBase} | ${m.queryBase} | ${m.kind} |`);
    }
  }
  return lines.join("\n") + "\n";
}


// Inline Th/Td so this module is self-contained for the report (the SangerTab's
// Th/Td weren't exported and we don't want to introduce coupling).
function Th({ children }) { return <th className="text-left px-2 py-1 font-medium text-zinc-700">{children}</th>; }
function Td({ children, className = "", ...rest }) { return <td className={`px-2 py-1 ${className}`} {...rest}>{children}</td>; }
