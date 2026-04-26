// src/tabs/lab_registry_tab.jsx — 8th tab: lab construct + run + primer
// registry browser.
//
// Fetches a JSON index produced by golden-gate's
// scripts/build_lab_registry.py from the canonical raw GitHub URL on mount.
// Surfaces:
//
//   - Header:  total counts + per-status tally
//   - Search:  by construct id / alias / project / status
//   - Table:   one row per registered construct with verification stats
//              + click to open detail panel
//   - Detail:  selected construct's metadata + per-read verification
//              + cross-link buttons that open the Sanger tab via
//                ?tab=sanger&sample=<construct-id>
//
// The JSON is the public output of golden-gate's nightly index build;
// fragment-viewer never fetches the source YAML directly. This keeps the
// viewer dependency-free of golden-gate's build state.

import { useState, useMemo, useEffect } from "react";
import { Database, RefreshCw, AlertTriangle, ExternalLink, Search, Dna } from "lucide-react";
import { searchPrimersBySequence, annotateHitsWithConstructs } from "../lib/registry_sequence_search.js";

// Canonical URL of the registry index. Fetched at runtime; falls back to
// the local dev path when running against a built fragment-viewer that
// has the JSON shipped in public/.
const REGISTRY_URL =
  "https://raw.githubusercontent.com/Single-Molecule-Sequencing/golden-gate/main/registry/dist/lab_registry.json";

const VERDICT_BADGE = {
  verified: "bg-emerald-100 text-emerald-800",
  sequenced: "bg-sky-100 text-sky-800",
  assembled: "bg-zinc-100 text-zinc-700",
  ordered: "bg-amber-50 text-amber-800",
  designed: "bg-zinc-50 text-zinc-600",
  failed: "bg-rose-100 text-rose-800",
  pending: "bg-zinc-100 text-zinc-700",
  complete: "bg-emerald-100 text-emerald-800",
};

export function LabRegistryTab() {
  const [registry, setRegistry] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchMode, setSearchMode] = useState("name"); // "name" | "sequence"
  const [search, setSearch] = useState("");
  const [seqQuery, setSeqQuery] = useState("");
  const [activeId, setActiveId] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(REGISTRY_URL, { cache: "no-cache" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      setRegistry(json);
    } catch (e) {
      setError(`Failed to fetch registry: ${e.message || e}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const constructs = registry?.constructs || [];
  const runs = registry?.runs || [];
  const primers = registry?.primers || [];
  const primerSets = registry?.primer_sets || [];
  const runsByConstruct = useMemo(() => {
    const m = {};
    for (const r of runs) {
      (m[r.construct_id] ||= []).push(r);
    }
    return m;
  }, [runs]);

  // Sequence-search hits (only computed in sequence mode).
  const seqHits = useMemo(() => {
    if (searchMode !== "sequence") return [];
    const raw = searchPrimersBySequence(seqQuery, primers);
    return annotateHitsWithConstructs(raw, primerSets, constructs);
  }, [searchMode, seqQuery, primers, primerSets, constructs]);

  const sequenceMatchedConstructIds = useMemo(() => {
    if (searchMode !== "sequence") return null;
    return new Set(seqHits.flatMap(h => h.linkedConstructIds));
  }, [searchMode, seqHits]);

  // Filter by search query.
  // - name mode: matches id, aliases, project, status, gene (the original behavior).
  // - sequence mode: shows only constructs linked to the sequence-search hits.
  const visible = useMemo(() => {
    if (searchMode === "sequence") {
      if (!seqQuery.trim()) return constructs;
      return constructs.filter(c => sequenceMatchedConstructIds?.has(c.id));
    }
    if (!search.trim()) return constructs;
    const q = search.trim().toLowerCase();
    return constructs.filter(c => {
      const haystack = [
        c.id, c.project, c.status, c.region?.gene,
        ...(c.aliases || []),
      ].filter(Boolean).map(x => String(x).toLowerCase()).join(" ");
      return haystack.includes(q);
    });
  }, [searchMode, constructs, search, seqQuery, sequenceMatchedConstructIds]);

  const active = useMemo(
    () => activeId ? constructs.find(c => c.id === activeId) : null,
    [constructs, activeId],
  );

  return (
    <div className="flex flex-col gap-4">
      <Header registry={registry} loading={loading} onRefresh={load} />
      {error && (
        <div className="flex items-start gap-2 px-3 py-2 rounded border border-rose-300 bg-rose-50 text-rose-900 text-sm">
          <AlertTriangle size={14} className="mt-0.5 flex-none" />
          <div className="flex-1">{error}</div>
          <button onClick={load} className="text-rose-700 hover:underline">retry</button>
        </div>
      )}
      {registry && (
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-7 space-y-3">
            <SearchModeToggle mode={searchMode} onChange={setSearchMode} />
            {searchMode === "name" ? (
              <SearchBar value={search} onChange={setSearch} count={visible.length} total={constructs.length} />
            ) : (
              <SequenceSearchBar
                value={seqQuery}
                onChange={setSeqQuery}
                hitCount={seqHits.length}
                primerCount={primers.length}
              />
            )}
            {searchMode === "sequence" && seqQuery.trim() && (
              <SequenceHitsPanel hits={seqHits} onPickConstruct={setActiveId} />
            )}
            <ConstructTable
              constructs={visible}
              runsByConstruct={runsByConstruct}
              activeId={activeId}
              onPick={setActiveId}
            />
          </div>
          <div className="col-span-5">
            {active ? (
              <ConstructDetail
                construct={active}
                runs={runsByConstruct[active.id] || []}
                primerSets={primerSets}
                primers={primers}
              />
            ) : (
              <div className="rounded-lg border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500">
                Pick a construct to see its full record + per-read verification + cross-links.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


function Header({ registry, loading, onRefresh }) {
  const counts = useMemo(() => {
    if (!registry) return null;
    const c = registry.constructs || [];
    const byStatus = {};
    for (const x of c) byStatus[x.status || "unspecified"] = (byStatus[x.status || "unspecified"] || 0) + 1;
    return {
      constructs: c.length,
      runs: (registry.runs || []).length,
      primers: (registry.primers || []).length,
      primerSets: (registry.primer_sets || []).length,
      byStatus,
    };
  }, [registry]);
  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Database size={20} className="text-indigo-600" />
            Lab Registry
          </h1>
          <p className="mt-1 text-xs text-zinc-600">
            Constructs, primers, and sequencing runs from{" "}
            <a href="https://github.com/Single-Molecule-Sequencing/golden-gate/blob/main/registry/" className="text-indigo-700 hover:underline" target="_blank" rel="noopener noreferrer">
              golden-gate/registry/
            </a>
            {" — "}built nightly, fetched at runtime, never edited here.
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="px-3 py-1.5 rounded border border-zinc-300 text-xs flex items-center gap-1 hover:bg-zinc-50 disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          {loading ? "Fetching…" : "Refresh"}
        </button>
      </div>
      {counts && (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <Stat label="Constructs" value={counts.constructs} />
          <Stat label="Runs" value={counts.runs} />
          <Stat label="Primer sets" value={counts.primerSets} />
          <Stat label="Primers" value={counts.primers} />
        </div>
      )}
      {counts && Object.keys(counts.byStatus).length > 0 && (
        <div className="mt-2 flex items-center gap-1 flex-wrap">
          {Object.entries(counts.byStatus).map(([s, n]) => (
            <span key={s} className={`text-[10px] px-1.5 py-0.5 rounded ${VERDICT_BADGE[s] || "bg-zinc-100 text-zinc-700"}`}>
              {n} {s}
            </span>
          ))}
        </div>
      )}
      {registry?.generated_at && (
        <p className="text-[10px] text-zinc-500 mt-1">
          Index generated {new Date(registry.generated_at).toLocaleString()} ·
          drive root: <span className="font-mono">{registry.drive_root_resolved || "(none — placeholders only)"}</span>
        </p>
      )}
    </div>
  );
}


function Stat({ label, value }) {
  return (
    <div className="rounded border border-zinc-200 bg-white p-2">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="font-mono text-base text-zinc-900">{value}</div>
    </div>
  );
}


function SearchBar({ value, onChange, count, total }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-200 bg-white">
      <Search size={14} className="text-zinc-400" />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Search constructs by id / alias / project / gene / status…"
        className="flex-1 text-sm outline-none bg-transparent"
      />
      <span className="text-[10px] text-zinc-500 font-mono">{count}/{total}</span>
    </div>
  );
}


function SearchModeToggle({ mode, onChange }) {
  const Btn = ({ value, label, icon: Icon }) => (
    <button
      onClick={() => onChange(value)}
      className={`px-2.5 py-1 text-xs flex items-center gap-1 rounded ${
        mode === value
          ? "bg-indigo-600 text-white"
          : "bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-50"
      }`}
    >
      <Icon size={12} />
      {label}
    </button>
  );
  return (
    <div className="flex items-center gap-2">
      <Btn value="name" label="Search by name" icon={Search} />
      <Btn value="sequence" label="Search by sequence" icon={Dna} />
    </div>
  );
}


function SequenceSearchBar({ value, onChange, hitCount, primerCount }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white">
      <div className="flex items-start gap-2 px-3 py-2">
        <Dna size={14} className="text-zinc-400 mt-0.5" />
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Paste DNA (>=8 nt). Searches all primers in either orientation; finds exact, query-in-primer, and primer-in-query hits."
          rows={2}
          className="flex-1 text-xs font-mono outline-none bg-transparent resize-y"
        />
        <span className="text-[10px] text-zinc-500 font-mono mt-0.5">
          {hitCount}/{primerCount}
        </span>
      </div>
    </div>
  );
}


function SequenceHitsPanel({ hits, onPickConstruct }) {
  if (hits.length === 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        No primer matches the query. The query is searched in both orientations against
        every primer's full sequence; matches must be substrings (no mismatches).
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-zinc-200 bg-white">
      <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-100">
        Primer hits ({hits.length})
      </div>
      <div className="max-h-60 overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500">
            <tr>
              <Th>Primer</Th>
              <Th>Match</Th>
              <Th>Orient</Th>
              <Th>Linked constructs</Th>
            </tr>
          </thead>
          <tbody>
            {hits.map(h => (
              <tr key={h.primer.id} className="border-t border-zinc-100 align-top">
                <Td>
                  <div className="font-mono">{h.primer.id}</div>
                  <div className="font-mono text-[10px] text-zinc-500 break-all">{h.primer.sequence}</div>
                </Td>
                <Td>
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${
                    h.kind === "exact" ? "bg-emerald-100 text-emerald-800"
                    : h.kind === "query-in-primer" ? "bg-sky-100 text-sky-800"
                    : "bg-indigo-100 text-indigo-800"
                  }`}>
                    {h.kind}
                  </span>
                </Td>
                <Td className="font-mono text-[10px]">{h.orientation}</Td>
                <Td>
                  {h.linkedConstructIds.length === 0 ? (
                    <span className="text-zinc-400 text-[10px]">no construct link</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {h.linkedConstructIds.map(cid => (
                        <button
                          key={cid}
                          onClick={() => onPickConstruct(cid)}
                          className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 hover:bg-indigo-100 hover:text-indigo-800"
                        >
                          {cid}
                        </button>
                      ))}
                    </div>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


function ConstructTable({ constructs, runsByConstruct, activeId, onPick }) {
  if (constructs.length === 0) {
    return <div className="rounded-lg border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500">No constructs match.</div>;
  }
  return (
    <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500">
          <tr>
            <Th>Construct</Th>
            <Th>Region</Th>
            <Th>Status</Th>
            <Th>Verification</Th>
          </tr>
        </thead>
        <tbody>
          {constructs.map(c => {
            const runs = runsByConstruct[c.id] || [];
            const sangerRun = runs.find(r => r.kind === "sanger");
            const v = sangerRun?.verification || {};
            const isActive = c.id === activeId;
            return (
              <tr
                key={c.id}
                onClick={() => onPick(c.id)}
                className={`border-t border-zinc-100 cursor-pointer ${isActive ? "bg-indigo-50" : "hover:bg-zinc-50"}`}
              >
                <Td>
                  <div className="font-mono">{c.id}</div>
                  {c.aliases?.length > 0 && (
                    <div className="text-[10px] text-zinc-500">{c.aliases.join(" · ")}</div>
                  )}
                </Td>
                <Td>
                  {c.region?.gene && <div>{c.region.gene}</div>}
                  {c.region?.start != null && (
                    <div className="font-mono text-[10px] text-zinc-500">
                      {c.region.start}–{c.region.end}
                    </div>
                  )}
                </Td>
                <Td>
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${VERDICT_BADGE[c.status] || "bg-zinc-100 text-zinc-700"}`}>
                    {c.status || "—"}
                  </span>
                </Td>
                <Td>
                  {sangerRun ? (
                    <VerificationCell v={v} />
                  ) : (
                    <span className="text-zinc-400 text-[10px]">no Sanger run</span>
                  )}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}


function VerificationCell({ v }) {
  if (v.error) return <span className="text-rose-700 text-[10px]">{v.error}</span>;
  if (v.reads_loaded === 0 || v.reads_loaded == null) return <span className="text-zinc-400 text-[10px]">—</span>;
  const total = v.reads_loaded;
  const passed = v.reads_passed || 0;
  const warned = v.reads_warned || 0;
  const failed = v.reads_failed || 0;
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1 text-[10px]">
        <span className="text-emerald-700">{passed}P</span>
        <span className="text-amber-700">{warned}W</span>
        <span className="text-rose-700">{failed}F</span>
        <span className="text-zinc-500 ml-1">of {total}</span>
      </div>
      <div className="flex items-center gap-1 text-[10px] text-zinc-500">
        <span className="font-mono">cov {v.coverage_pct?.toFixed?.(0) ?? v.coverage_pct ?? 0}%</span>
      </div>
    </div>
  );
}


function ConstructDetail({ construct, runs, primerSets, primers }) {
  const sangerRun = runs.find(r => r.kind === "sanger");
  const ps = primerSets.find(s => s.id === construct.primer_set);
  const psMembers = ps ? primers.filter(p => ps.members?.includes(p.id)) : [];

  // Build cross-link URLs into the existing Sanger tab via PR #28's params.
  const baseUrl = (typeof window !== "undefined")
    ? window.location.origin + window.location.pathname
    : "";
  const sangerLink = `${baseUrl}?tab=sanger&sample=${encodeURIComponent(construct.id)}`;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 space-y-3 text-xs">
      <div className="font-mono font-medium text-sm">{construct.id}</div>
      {construct.notes && (
        <p className="text-zinc-700 leading-relaxed whitespace-pre-wrap">{construct.notes}</p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Field label="Project" value={construct.project} />
        <Field label="Kind" value={construct.kind} />
        <Field label="Operator" value={construct.operator} />
        <Field label="Build date" value={construct.build_date} />
        {construct.region?.gene && (
          <Field label="Region" value={`${construct.region.gene} ${construct.region.start}–${construct.region.end}`} />
        )}
        {construct.parent_design?.length > 0 && (
          <Field label="Reference length" value={`${construct.parent_design.length} bp`} />
        )}
        {construct.parent_design?.sha256 && (
          <Field label="Reference SHA-256" value={construct.parent_design.sha256.slice(0, 16) + "…"} mono />
        )}
        <Field label="Primer set" value={ps ? `${ps.id} (${psMembers.length} primers)` : (construct.primer_set || "—")} />
      </div>

      {construct.parent_design?.drive_path && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Reference .dna</div>
          <div className="font-mono text-[10px] text-zinc-700 break-all">
            {construct.parent_design.drive_path}
            {!construct.parent_design.exists && (
              <span className="ml-2 inline-block px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px]">
                missing on Drive
              </span>
            )}
          </div>
        </div>
      )}

      {sangerRun && <RunSummary run={sangerRun} />}

      <div className="pt-2 border-t border-zinc-200 flex flex-wrap gap-2">
        <a
          href={sangerLink}
          className="px-2.5 py-1.5 rounded bg-indigo-600 text-white text-xs flex items-center gap-1 hover:bg-indigo-700"
        >
          <ExternalLink size={12} /> Open in Sanger viewer
        </a>
        {sangerRun?.drive_dir && (
          <span className="text-[10px] text-zinc-500 self-center">
            Run dir: <code className="break-all">{sangerRun.drive_dir}</code>
          </span>
        )}
      </div>
    </div>
  );
}


function Field({ label, value, mono = false }) {
  if (value == null || value === "") return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={mono ? "font-mono text-zinc-900" : "text-zinc-900"}>{value}</div>
    </div>
  );
}


function RunSummary({ run }) {
  const v = run.verification || {};
  return (
    <div className="border border-zinc-100 rounded p-2 space-y-1">
      <div className="font-medium">Sanger run · {run.id}</div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Submitted" value={run.submitted} />
        <Field label="Received" value={run.received} />
      </div>
      {v.reads_loaded > 0 && (
        <>
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 mt-1">Per-read verification</div>
          <table className="w-full text-[10px]">
            <thead className="text-zinc-500">
              <tr>
                <Th>File</Th><Th>Verdict</Th><Th>Identity</Th><Th>Range</Th>
              </tr>
            </thead>
            <tbody>
              {(v.per_read || []).map((r, i) => (
                <tr key={i} className="border-t border-zinc-100">
                  <Td className="font-mono truncate max-w-[10rem]">{r.file}</Td>
                  <Td className={
                    r.verdict === "pass" ? "text-emerald-700"
                    : r.verdict === "warn" ? "text-amber-700"
                    : "text-rose-700"
                  }>{r.verdict?.toUpperCase()}</Td>
                  <Td className="font-mono">{r.identity != null ? `${(r.identity * 100).toFixed(1)}%` : "—"}</Td>
                  <Td className="font-mono">{r.ref_start != null ? `${r.ref_start}–${r.ref_end}` : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}


function Th({ children }) {
  return <th className="text-left px-2 py-1 font-medium">{children}</th>;
}
function Td({ children, className = "" }) {
  return <td className={`px-2 py-1 ${className}`}>{children}</td>;
}
