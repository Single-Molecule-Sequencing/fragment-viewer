// src/components/lab_inventory.jsx
// Issue #13 Phase C.3: Lab-inventory UI bits lifted out of FragmentViewer.jsx.
//
// LabInventoryBadge — one-cell status pill ("LAB · {name}" / "name?" / dash).
// LabInventoryPanel — summary card with counts + full per-entry status table.
//
// Both are thin presentational wrappers around `inventoryStatus` in
// lib/grna_catalog.js, which carries the matching rules (spacer eq → name
// prefix → none).

import { Panel, Stat, Pill } from "./primitives.jsx";
import {
  LAB_GRNA_CATALOG, normalizeSpacer, inventoryStatus,
} from "../lib/grna_catalog.js";

// Visual chip showing whether a gRNA is in the lab inventory.
export function LabInventoryBadge({ candidate, compact = false }) {
  const inv = inventoryStatus(candidate);
  if (inv.status === "exact") {
    return <Pill tone="emerald">{compact ? "LAB" : `LAB · ${inv.entry.name}`}</Pill>;
  }
  if (inv.status === "name") {
    return <Pill tone="sky">{compact ? "name?" : `name match · ${inv.entry.name}`}</Pill>;
  }
  return <Pill tone="neutral">{compact ? "—" : "not in lab inventory"}</Pill>;
}

// Summary panel: counts, populated-vs-pending breakdown, per-entry status table.
export function LabInventoryPanel({ candidates = [] }) {
  const total = LAB_GRNA_CATALOG.length;
  const populated = LAB_GRNA_CATALOG.filter(e => normalizeSpacer(e.spacer).length === 20).length;
  const pending = total - populated;
  const matchedExact = candidates.filter(c => inventoryStatus(c).status === "exact").length;
  const matchedName = candidates.filter(c => inventoryStatus(c).status === "name").length;
  return (
    <Panel
      title="Lab gRNA inventory"
      subtitle={`${total} catalog entries · ${populated} with 20-nt spacer · ${pending} pending upstream data (see .project/UNBLOCK_PROMPTS.md)`}
      className="mb-3"
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <Stat label="Catalog entries" value={total} />
        <Stat label="Spacers populated" value={populated} tone={populated > 0 ? "emerald" : "amber"} hint={pending ? `${pending} pending` : null} />
        <Stat label="Candidates matched (spacer)" value={matchedExact} tone={matchedExact > 0 ? "emerald" : "default"} />
        <Stat label="Candidates matched (name)" value={matchedName} tone="sky" />
      </div>
      <div className="overflow-auto">
        <table className="w-full text-xs num">
          <thead>
            <tr className="text-zinc-500 border-b border-zinc-200">
              <th className="text-left px-2 py-1 font-medium">name</th>
              <th className="text-left px-2 py-1 font-medium">target / region</th>
              <th className="text-left px-2 py-1 font-medium">spacer</th>
              <th className="text-left px-2 py-1 font-medium">status</th>
              <th className="text-left px-2 py-1 font-medium">source</th>
            </tr>
          </thead>
          <tbody>
            {LAB_GRNA_CATALOG.map(entry => {
              const ok = normalizeSpacer(entry.spacer).length === 20;
              return (
                <tr key={entry.name} className="border-b border-zinc-100">
                  <td className="px-2 py-1 font-mono text-zinc-800">{entry.name}</td>
                  <td className="px-2 py-1 text-zinc-600">{entry.target}</td>
                  <td className="px-2 py-1 font-mono text-[10px] text-zinc-500">{entry.spacer || <span className="italic text-amber-700">pending</span>}</td>
                  <td className="px-2 py-1">{ok ? <Pill tone="emerald">populated</Pill> : <Pill tone="amber">pending</Pill>}</td>
                  <td className="px-2 py-1 text-zinc-500 text-[11px]">{entry.source}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
