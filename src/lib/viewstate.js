// src/lib/viewstate.js — URL view-state + peak-table CSV + merge refs.
//
// Extracted from FragmentViewer.jsx per issue #13. Pure JS — safe for Node
// tests. buildPeakTableCSV is the tidy-CSV exporter; encodeViewState +
// decodeViewState round-trip TraceTab state through a URL-safe base64 hash.

// with pandas/R pipelines — one row per (sample, dye, peak) with size,
// height, area, and FWHM width. Returns a string; caller handles the
// download via downloadBlob.
export function buildPeakTableCSV(peaksBySample, opts = {}) {
  const includeO = opts.includeO === true;
  const dyes = includeO ? ["B", "G", "Y", "R", "O"] : ["B", "G", "Y", "R"];
  const rows = ["sample,dye,size_bp,height,area,width_fwhm_bp"];
  for (const sample of Object.keys(peaksBySample || {}).sort()) {
    const byDye = peaksBySample[sample] || {};
    for (const dye of dyes) {
      const peaks = byDye[dye] || [];
      for (const p of peaks) {
        // CSV-safe: sample names could in principle contain commas, so we
        // wrap any that do. Most lab filenames are safe (underscores only).
        const s = /[,"\n]/.test(sample) ? `"${sample.replace(/"/g, '""')}"` : sample;
        rows.push(`${s},${dye},${p[0]},${p[1]},${p[2]},${p[3]}`);
      }
    }
  }
  return rows.join("\n") + "\n";
}

// ----------------------------------------------------------------------
// Shareable view-state URL encoding (for "Copy link" in the Toolbar).
// State is JSON-stringified, then base64'd into the URL hash. Keeping it
// in the hash (not query string) means the server never sees it and no
// navigation round-trip is needed.
// ----------------------------------------------------------------------
export function encodeViewState(state) {
  try {
    const json = JSON.stringify(state);
    // btoa doesn't handle UTF-8 directly; encode as URI-safe UTF-8 first.
    const b64 = (typeof btoa !== "undefined")
      ? btoa(unescape(encodeURIComponent(json)))
      : Buffer.from(json, "utf-8").toString("base64");
    // URL-safe base64: replace + / = per RFC 4648.
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  } catch { return ""; }
}
export function decodeViewState(hash) {
  if (!hash) return null;
  try {
    // Accept with or without leading "#" + optional "view=" prefix.
    const raw = hash.replace(/^#/, "").replace(/^view=/, "");
    if (!raw) return null;
    // Undo URL-safe base64.
    let b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const json = (typeof atob !== "undefined")
      ? decodeURIComponent(escape(atob(b64)))
      : Buffer.from(b64, "base64").toString("utf-8");
    return JSON.parse(json);
  } catch { return null; }
}
