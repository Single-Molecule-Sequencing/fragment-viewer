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


// ----------------------------------------------------------------------
// Cross-tool URL query params
// ----------------------------------------------------------------------
//
// The deployed viewer accepts three query params for cross-tool deep links:
//
//   ?tab=trace|peakid|cutpred|autoclass|compare|heatmap|sanger
//       Sets the initial active tab.
//
//   ?ref=<url>
//       URL of a SnapGene .dna file. Fetched on mount; on success, parsed
//       via parseSnapgene and used as the Sanger tab's reference sequence.
//       Same-origin only in practice — cross-origin fails silently due to
//       CORS unless the source server explicitly allows it. We do NOT
//       try to disable that protection.
//
//   ?sample=<id>
//       Name of the sample to focus on tab activation. Supported by
//       SangerTab; future TraceTab support will mirror this. The sample
//       must be present in the loaded data (drag-drop, demo, or future
//       ?data= source) — if not present the param is silently ignored.
//
// Producers of these URLs (e.g., golden-gate's PDF QC reports) should use
// `buildViewerUrl` to assemble them so the encoding stays consistent with
// what the viewer accepts.
//
// Validity is constrained: only known tabs, only http/https refs, only
// non-empty sample ids.

const KNOWN_TABS = new Set(["trace", "peakid", "cutpred", "autoclass", "compare", "heatmap", "sanger", "registry"]);

export function parseUrlParams(searchString) {
  // Accept either a leading "?" or just the query body.
  const s = (searchString || "").replace(/^\?/, "");
  if (!s) return {};
  const out = {};
  for (const pair of s.split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const k = decodeURIComponent(eq < 0 ? pair : pair.slice(0, eq));
    const v = eq < 0 ? "" : decodeURIComponent(pair.slice(eq + 1));
    if (k === "tab" && KNOWN_TABS.has(v)) out.tab = v;
    else if (k === "ref" && /^https?:\/\//i.test(v)) out.ref = v;
    else if (k === "ref" && v.startsWith("/")) out.ref = v; // same-origin path
    else if (k === "sample" && v) out.sample = v;
  }
  return out;
}

export function buildViewerUrl(base, { tab, ref, sample } = {}) {
  if (!base) throw new Error("buildViewerUrl: base URL required");
  // Strip any existing query/hash; we add our own.
  const baseClean = base.replace(/[?#].*$/, "").replace(/\/+$/, "/");
  const parts = [];
  if (tab && KNOWN_TABS.has(tab)) parts.push(`tab=${encodeURIComponent(tab)}`);
  if (ref) parts.push(`ref=${encodeURIComponent(ref)}`);
  if (sample) parts.push(`sample=${encodeURIComponent(sample)}`);
  return parts.length ? `${baseClean}?${parts.join("&")}` : baseClean;
}
