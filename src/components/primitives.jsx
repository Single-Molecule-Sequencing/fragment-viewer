// src/components/primitives.jsx
// Issue #13 Phase C.1: leaf design-system primitives lifted out of the
// FragmentViewer monolith. These are stateless, prop-only components with
// no cross-component dependencies — they compose the chrome + tabs +
// modals but never import them back. Safe to pull in from anywhere.
//
// Re-exported from src/FragmentViewer.jsx so existing imports keep working.

import { DYE_PALETTES } from "../lib/constants.js";

// Wrapper card: rounded, subtle shadow, optional header with title + actions.
export function Panel({ title, subtitle, actions, children, className = "", padded = true }) {
  return (
    <section className={`bg-white rounded-xl border border-zinc-200 shadow-soft overflow-hidden ${className}`}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 px-4 py-3 border-b border-zinc-100">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-zinc-900 tracking-tight truncate">{title}</h2>}
            {subtitle && <p className="text-xs text-zinc-500 mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-1.5 shrink-0">{actions}</div>}
        </header>
      )}
      <div className={padded ? "p-4" : ""}>{children}</div>
    </section>
  );
}

// Big-number metric tile.
export function Stat({ label, value, hint, tone = "default" }) {
  const toneCls = {
    default: "text-zinc-900",
    sky: "text-sky-700",
    emerald: "text-emerald-700",
    amber: "text-amber-700",
    rose: "text-rose-700",
  }[tone] || "text-zinc-900";
  return (
    <div className="px-3 py-2.5 rounded-lg bg-zinc-50 border border-zinc-100">
      <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`mt-0.5 text-xl font-semibold tracking-tight num ${toneCls}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-zinc-500">{hint}</div>}
    </div>
  );
}

// Inline rounded label; optional accent color.
export function Pill({ children, tone = "neutral", className = "" }) {
  const tones = {
    neutral: "bg-zinc-100 text-zinc-700 border-zinc-200",
    sky:     "bg-sky-50 text-sky-700 border-sky-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber:   "bg-amber-50 text-amber-800 border-amber-200",
    rose:    "bg-rose-50 text-rose-700 border-rose-200",
    dark:    "bg-zinc-900 text-zinc-100 border-zinc-900",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium rounded border ${tones[tone] || tones.neutral} ${className}`}>
      {children}
    </span>
  );
}

// Color-coded dye reference. Uses the shared DYE_PALETTES (default family)
// so every dye letter in the UI agrees on a color. Accepts a `palette`
// override for future per-tab palette toggles.
export function DyeChip({ dye, showLabel = false, className = "", palette = "default" }) {
  const label = { B: "6-FAM", G: "HEX", Y: "TAMRA", R: "ROX", O: "GS500LIZ" };
  const color = (DYE_PALETTES?.[palette]?.[dye]) || (DYE_PALETTES?.default?.[dye]) || "#94a3b8";
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span aria-hidden className="w-2.5 h-2.5 rounded-full ring-1 ring-inset ring-black/10" style={{ background: color }} />
      <span className="text-xs font-mono text-zinc-700">{dye}</span>
      {showLabel && <span className="text-[11px] text-zinc-500">{label[dye] || dye}</span>}
    </span>
  );
}

// Form field wrapper: label + input. Pass <input> / <select> as children.
export function Field({ label, hint, children, className = "" }) {
  return (
    <label className={`flex flex-col gap-1 text-xs ${className}`}>
      <span className="font-medium text-zinc-700">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-zinc-500">{hint}</span>}
    </label>
  );
}

// Standard button used in chrome + tab toolbars.
export function ToolButton({ icon: Icon, children, onClick, title, variant = "ghost", size = "sm", type = "button", className = "" }) {
  const variants = {
    primary: "bg-zinc-900 text-white hover:bg-zinc-800",
    secondary: "bg-zinc-100 text-zinc-800 hover:bg-zinc-200 border border-zinc-200",
    ghost:   "text-zinc-700 hover:text-zinc-900 hover:bg-zinc-100",
    dark:    "text-zinc-300 hover:text-white hover:bg-zinc-800",
    danger:  "bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200",
  };
  const sizes = { sm: "px-2 py-1 text-xs gap-1.5", md: "px-3 py-1.5 text-sm gap-2" };
  return (
    <button
      type={type}
      onClick={onClick}
      title={title}
      className={`inline-flex items-center font-medium rounded-md transition focus-ring ${variants[variant] || variants.ghost} ${sizes[size] || sizes.sm} ${className}`}
    >
      {Icon && <Icon size={size === "md" ? 16 : 14} />}
      {children && <span>{children}</span>}
    </button>
  );
}
