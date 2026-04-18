// src/components/export_menu.jsx
// Issue #13 Phase C.2: ExportMenu lifted out of FragmentViewer.jsx.
// One FileDown button opens a grouped popover listing every format we can
// write (SVG, PNG @ 2–8×, transparent PNG, JPG, WebP). Adding a new format
// is a one-line change in the `entries` map + one case in doExport.

import { useState, useRef, useEffect } from "react";
import { FileDown } from "lucide-react";
import { ToolButton } from "./primitives.jsx";
import {
  exportSvgNative, exportSvgAsPng, exportSvgAsJpg, exportSvgAsWebp,
} from "../lib/export.js";

// Props:
//   svgRef   — React ref pointing at the <svg> element to export.
//   basename — filename stem; the format-specific suffix is appended.
//   formats  — array of format keys to show. Defaults to all below.
//              Order controls menu order within each group.
export function ExportMenu({
  svgRef,
  basename = "figure",
  formats = ["svg", "png2", "png4", "png6", "png8", "png4_alpha", "jpg_hi", "jpg_std", "webp_hi"],
  variant = "secondary",
  label = "Export",
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (anchorRef.current && !anchorRef.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);
  const doExport = (kind) => {
    const el = svgRef?.current;
    if (!el) return;
    switch (kind) {
      case "svg":        exportSvgNative(el, `${basename}.svg`); break;
      case "png2":       exportSvgAsPng(el, `${basename}@2x.png`, 2); break;
      case "png4":       exportSvgAsPng(el, `${basename}@4x.png`, 4); break;
      case "png6":       exportSvgAsPng(el, `${basename}@6x.png`, 6); break;
      case "png8":       exportSvgAsPng(el, `${basename}@8x.png`, 8); break;
      case "png4_alpha": exportSvgAsPng(el, `${basename}@4x_alpha.png`, 4, { transparent: true }); break;
      case "jpg_hi":     exportSvgAsJpg(el, `${basename}@4x_q92.jpg`, 4, 0.92); break;
      case "jpg_std":    exportSvgAsJpg(el, `${basename}@2x_q80.jpg`, 2, 0.80); break;
      case "webp_hi":    exportSvgAsWebp(el, `${basename}@4x_q92.webp`, 4, 0.92); break;
      case "webp_alpha": exportSvgAsWebp(el, `${basename}@4x_alpha.webp`, 4, 0.92, { transparent: true }); break;
      default: break;
    }
    setOpen(false);
  };
  const entries = {
    svg:        { group: "Vector",     label: "SVG · vector, editable",   hint: "Best for publication figures (Illustrator / Inkscape)" },
    png2:       { group: "Raster",     label: "PNG @ 2×",                 hint: "Screens, slides · ~1840 px wide" },
    png4:       { group: "Raster",     label: "PNG @ 4×",                 hint: "Publication, 300 DPI single column · ~3680 px" },
    png6:       { group: "Raster",     label: "PNG @ 6×",                 hint: "Posters, 300 DPI double column · ~5520 px" },
    png8:       { group: "Raster",     label: "PNG @ 8×",                 hint: "Giant prints, zoom-in crops · ~7360 px" },
    png4_alpha: { group: "Transparent",label: "PNG @ 4× · transparent",   hint: "Alpha channel for compositing in Illustrator / PowerPoint" },
    jpg_hi:     { group: "Compact",    label: "JPG @ 4× · high quality",  hint: "Q92; ~3-5× smaller than PNG" },
    jpg_std:    { group: "Compact",    label: "JPG @ 2× · standard",      hint: "Q80; email-friendly size" },
    webp_hi:    { group: "Compact",    label: "WebP @ 4× · high quality", hint: "Q92; ~25-40% smaller than JPG at equal quality" },
    webp_alpha: { group: "Transparent",label: "WebP @ 4× · transparent",  hint: "Q92 + alpha; best-in-class size for alpha-channel output" },
  };
  // Group headers. Preserves `formats` order within each group so callers
  // can still fully control the menu contents.
  const groups = [];
  const seen = new Set();
  for (const k of formats) {
    const g = entries[k]?.group || "Other";
    if (!seen.has(g)) { groups.push(g); seen.add(g); }
  }
  return (
    <div ref={anchorRef} className="relative inline-block">
      <ToolButton icon={FileDown} variant={variant} onClick={() => setOpen(v => !v)} title="Export this figure — SVG / PNG / JPG / WebP at multiple resolutions, with optional transparent background">
        {label} {open ? "▾" : "▸"}
      </ToolButton>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-40 w-72 bg-white border border-zinc-200 rounded-lg shadow-xl overflow-hidden no-print max-h-[80vh] overflow-y-auto">
          {groups.map(g => (
            <div key={g}>
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 bg-zinc-50 border-b border-zinc-100">
                {g}
              </div>
              <ul className="divide-y divide-zinc-100">
                {formats.filter(k => (entries[k]?.group || "Other") === g).map(k => (
                  <li key={k}>
                    <button onClick={() => doExport(k)}
                      className="w-full px-3 py-2 flex items-start gap-2 text-left hover:bg-zinc-50 focus:bg-zinc-100 focus:outline-none">
                      <FileDown size={13} className="text-zinc-400 mt-0.5 shrink-0" />
                      <span className="min-w-0">
                        <span className="block text-xs font-medium text-zinc-800">{entries[k].label}</span>
                        <span className="block text-[11px] text-zinc-500">{entries[k].hint}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
