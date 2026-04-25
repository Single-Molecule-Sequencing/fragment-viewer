// src/components/first_run_tour.jsx — five-step onboarding overlay.
//
// First-time visitors see a brief tour explaining the lab's drag-drop UX,
// the seven-tab structure, the Sanger reference workflow, and the export
// options. Dismissed tours don't reappear (localStorage-gated). The Help
// modal exposes a "Show tour" action so users can re-trigger the tour
// after dismissing.

import { useState, useEffect } from "react";
import {
  ChevronLeft, ChevronRight, X, Upload, Layers,
  Microscope, FileDown, BookOpen,
} from "lucide-react";

const LS_KEY = "fragment-viewer:tour-shown";
const TOUR_VERSION = "1";  // bump to re-show the tour to existing users when content changes

export function shouldShowTour() {
  if (typeof window === "undefined" || !window.localStorage) return false;
  try {
    return window.localStorage.getItem(LS_KEY) !== TOUR_VERSION;
  } catch { return false; }
}

export function markTourShown() {
  if (typeof window === "undefined" || !window.localStorage) return;
  try { window.localStorage.setItem(LS_KEY, TOUR_VERSION); }
  catch { /* non-fatal */ }
}

const STEPS = [
  {
    icon: BookOpen,
    title: "Welcome",
    body: (
      <>
        <p>Fragment Viewer is the Athey Lab's browser-based viewer for CLC capillary electrophoresis and Sanger sequencing data.</p>
        <p>This 30-second tour shows you the four things to know.</p>
      </>
    ),
  },
  {
    icon: Upload,
    title: "Drag-drop your data",
    body: (
      <>
        <p>Drag <code>.fsa</code>, <code>.ab1</code>, <code>.scf</code>, GeneMapper <code>.txt</code>/<code>.tsv</code>/<code>.csv</code>, or SnapGene <code>.dna</code> files anywhere in the window. Files stay 100% client-side — nothing is uploaded.</p>
        <p>The seeded V059 demo loads automatically so you can poke around without your own data.</p>
      </>
    ),
  },
  {
    icon: Layers,
    title: "Seven workflow tabs",
    body: (
      <>
        <p>The left rail has six CE-fragment tabs (Electropherogram, Peak ID, Cut Prediction, Auto Classify, Cross-Sample, Batch Heatmap) and one Sanger tab.</p>
        <p>Use number keys 1–4 to toggle dye channels in the chromatogram, ←/→ to step through samples, and <kbd>?</kbd> for the full keyboard cheat sheet.</p>
      </>
    ),
  },
  {
    icon: Microscope,
    title: "Sanger workflow",
    body: (
      <>
        <p>Drop a <code>.ab1</code> Sanger read in the Sanger tab. To enable alignment, drop a SnapGene <code>.dna</code> file (or paste FASTA) as the reference. You'll see Mott Q-trim, Smith-Waterman alignment, and a mismatch table.</p>
        <p>Same analytics as golden-gate's Python QC pipeline — identity numbers match across the two tools.</p>
      </>
    ),
  },
  {
    icon: FileDown,
    title: "Export & share",
    body: (
      <>
        <p>Top-bar buttons: <strong>CSV</strong> (peak table), <strong>Link</strong> (URL-encoded view, copy-and-share), <strong>Report</strong> (full PDF with figures).</p>
        <p>Per-plot SVG/PNG export buttons appear on each chromatogram. Click <kbd>?</kbd> any time to see this tour again.</p>
      </>
    ),
  },
];

export function FirstRunTour({ open, onClose }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    // Reset to step 0 each time the tour opens (so re-opens via Help start fresh).
    if (open) setStep(0);
  }, [open]);

  if (!open) return null;

  const total = STEPS.length;
  const current = STEPS[step];
  const Icon = current.icon;
  const isFirst = step === 0;
  const isLast = step === total - 1;

  const close = () => {
    markTourShown();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fv-tour-title"
      onClick={close}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-[480px] max-w-[92vw] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-zinc-200 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700">
            <Icon size={18} />
          </div>
          <div className="flex-1">
            <div id="fv-tour-title" className="font-semibold text-zinc-900">{current.title}</div>
            <div className="text-[11px] text-zinc-500">
              {step + 1} of {total}
            </div>
          </div>
          <button
            onClick={close}
            className="text-zinc-400 hover:text-zinc-700 p-1 rounded"
            aria-label="Close tour"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 text-sm text-zinc-700 leading-relaxed space-y-3">
          {current.body}
        </div>

        <div className="px-5 py-3 bg-zinc-50 border-t border-zinc-200 flex items-center gap-2">
          <button
            onClick={close}
            className="text-xs text-zinc-600 hover:text-zinc-900 px-2 py-1 rounded"
          >
            Skip tour
          </button>
          <div className="ml-auto flex items-center gap-1.5">
            <DotIndicator step={step} total={total} />
            <button
              onClick={() => setStep(s => Math.max(0, s - 1))}
              disabled={isFirst}
              className="px-3 py-1.5 rounded text-xs flex items-center gap-1 border border-zinc-300 disabled:opacity-30 hover:bg-zinc-100"
            >
              <ChevronLeft size={12} /> Back
            </button>
            {isLast ? (
              <button
                onClick={close}
                className="px-3 py-1.5 rounded text-xs bg-indigo-600 text-white hover:bg-indigo-700"
              >
                Get started
              </button>
            ) : (
              <button
                onClick={() => setStep(s => Math.min(total - 1, s + 1))}
                className="px-3 py-1.5 rounded text-xs bg-indigo-600 text-white hover:bg-indigo-700 flex items-center gap-1"
              >
                Next <ChevronRight size={12} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DotIndicator({ step, total }) {
  return (
    <div className="flex items-center gap-1 mr-1">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`w-1.5 h-1.5 rounded-full transition-colors ${
            i === step ? "bg-indigo-600" : "bg-zinc-300"
          }`}
        />
      ))}
    </div>
  );
}
