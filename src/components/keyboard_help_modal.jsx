// src/components/keyboard_help_modal.jsx
// Issue #13 Phase C.3: Keyboard shortcut cheat sheet lifted out of
// FragmentViewer.jsx. Opens via `?` key or the `?` toolbar button;
// Esc closes. Entries are grouped so users can scan by intent instead of
// memorizing a flat list.

import { useEffect } from "react";
import { ToolButton } from "./primitives.jsx";

function KeyboardHelpModal({ open, onClose, onShowTour }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const groups = [
    {
      title: "Navigation",
      rows: [
        ["← / →", "Previous / next sample"],
        ["f",     "Reset zoom to full range"],
        ["Esc",   "Close modal / clear pin"],
      ],
    },
    {
      title: "Channels",
      rows: [
        ["1 / 2 / 3 / 4", "Toggle B / G / Y / R channel"],
      ],
    },
    {
      title: "Signal processing",
      rows: [
        ["[ / ]", "Decrease / increase smoothing σ multiplier"],
        ["n",     "Toggle 3σ noise-floor reference line"],
        ["r",     "Toggle raw unsmoothed trace overlay"],
      ],
    },
    {
      title: "Help",
      rows: [
        ["?", "Open this cheat sheet"],
      ],
    },
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 pb-10 px-4 overflow-auto no-print">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-xl border border-zinc-200 shadow-2xl">
        <header className="flex items-center justify-between px-5 py-4 border-b border-zinc-200">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Keyboard shortcuts</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Press <kbd className="px-1 py-0.5 text-[10px] rounded border border-zinc-300 bg-zinc-50 font-mono">Esc</kbd> to close</p>
          </div>
          <ToolButton variant="ghost" onClick={onClose}>Close</ToolButton>
        </header>
        <div className="px-5 py-4 space-y-4">
          {groups.map(g => (
            <section key={g.title}>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">{g.title}</h3>
              <ul className="space-y-1.5">
                {g.rows.map(([k, desc]) => (
                  <li key={k} className="flex items-center gap-3 text-xs">
                    <kbd className="inline-block min-w-[4.5ch] text-center px-1.5 py-0.5 rounded border border-zinc-300 bg-zinc-50 font-mono text-zinc-800">{k}</kbd>
                    <span className="text-zinc-700">{desc}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <p className="text-[11px] text-zinc-500 pt-2 border-t border-zinc-100">
            Shortcuts are ignored when typing in an input, select, or textarea.
          </p>
          {onShowTour && (
            <div className="pt-2 border-t border-zinc-100">
              <button
                onClick={() => { onClose(); onShowTour(); }}
                className="text-xs text-indigo-700 hover:text-indigo-900 hover:underline"
              >
                Replay first-run tour →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export { KeyboardHelpModal };
export default KeyboardHelpModal;
