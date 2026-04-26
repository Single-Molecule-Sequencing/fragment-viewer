// src/tabs/sanger/_shared.jsx — constants + small helpers shared across the
// Sanger tab's panels. Underscore prefix flags this as an internal module
// (not part of the tab's import surface from outside).

// Sanger dye-channel convention. Different from CE (B/G/Y/R for fluorophore
// hardware channels); Sanger maps each base to a fixed color so the eye can
// read the chromatogram at a glance.
export const SANGER_BASE_COLORS = {
  A: "#16a34a", // green
  C: "#2563eb", // blue
  G: "#000000", // black
  T: "#dc2626", // red
  N: "#9ca3af",
};

export const VERDICT_STYLE = {
  pass: { bg: "bg-emerald-100", text: "text-emerald-800", label: "PASS" },
  warn: { bg: "bg-amber-100",   text: "text-amber-800",   label: "WARN" },
  fail: { bg: "bg-rose-100",    text: "text-rose-800",    label: "FAIL" },
};

// Canonical small table cell helpers used by every Sanger sub-panel.
export function Th({ children }) {
  return <th className="text-left px-2 py-1 font-medium text-zinc-700">{children}</th>;
}
export function Td({ children, className = "", ...rest }) {
  return <td className={`px-2 py-1 ${className}`} {...rest}>{children}</td>;
}

// Stat tile used by ConsensusPanel + AlignmentSummary + DiffSummary.
export function Stat({ label, value, color = "zinc" }) {
  const cls = {
    emerald: "bg-emerald-50 text-emerald-900 border-emerald-200",
    amber: "bg-amber-50 text-amber-900 border-amber-200",
    rose: "bg-rose-50 text-rose-900 border-rose-200",
    zinc: "bg-zinc-50 text-zinc-900 border-zinc-200",
  }[color] || "bg-zinc-50 text-zinc-900 border-zinc-200";
  return (
    <div className={`rounded border ${cls} p-2`}>
      <div className="text-[10px] uppercase tracking-wider opacity-70">{label}</div>
      <div className="font-mono text-base">{value}</div>
    </div>
  );
}
