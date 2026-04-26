// src/tabs/sanger/primer_mapping.jsx — drop a primer FASTA, see where each
// primer lands on the reference + each loaded read's trim window.

import { useState, useMemo, useRef } from "react";
import { findPrimerMatches, parseMultiFasta } from "../../lib/sequence_analyses.js";
import { mottTrim } from "../../lib/sanger.js";
import { Th, Td } from "./_shared.jsx";

export function PrimerMappingPanel({ primers, setPrimers, samples, qCutoff, referenceSeq, referenceLabel }) {
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
          <button onClick={() => fileRef.current?.click()} className="px-2 py-1 rounded border border-zinc-300 text-[10px] hover:bg-zinc-50">Load FASTA…</button>
          <button onClick={() => setPasteOpen(true)} className="px-2 py-1 rounded border border-zinc-300 text-[10px] hover:bg-zinc-50">Paste…</button>
          {primers.length > 0 && (
            <button onClick={() => setPrimers([])} className="px-2 py-1 rounded border border-zinc-300 text-[10px] hover:bg-zinc-50">Clear</button>
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
