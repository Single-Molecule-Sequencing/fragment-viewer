// src/lib/export.js — figure export helpers (pure browser utilities).
//
// Extracted from FragmentViewer.jsx per issue #13. Handles SVG serialization,
// rasterization to PNG/JPG/WebP, combined-SVG layout, blob download, and
// the shared ref-merging utility. All functions assume a browser context
// (Canvas, XMLSerializer, document.createElement) — node test shims are
// handled at call sites with the same `if (!svgEl) return;` guard pattern
// that the tests exercise.

// Trigger a browser download for a Blob. Shared by every export path so the
// link/cleanup dance lives in one place.
export function downloadBlob(blob, filename) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

// Ensure the SVG has an explicit XML namespace before serialization so that
// saved .svg files render correctly when opened directly (the DOM copy often
// inherits the namespace implicitly and some viewers drop the root otherwise).
export function serializeSvg(svgEl) {
  const clone = svgEl.cloneNode(true);
  if (!clone.getAttribute("xmlns")) clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  if (!clone.getAttribute("xmlns:xlink")) clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  return new XMLSerializer().serializeToString(clone);
}

// Native SVG export — no rasterization, no resolution cap, opens directly in
// Illustrator/Inkscape/Figma. This is the best format for publication figures
// because the downstream editor can tweak text, stroke widths, and colors.
export function exportSvgNative(svgEl, filename) {
  if (!svgEl) return;
  const xml = serializeSvg(svgEl);
  // BOM-less UTF-8 so Illustrator doesn't complain; CSS font stack inherited
  // from the live DOM will fall back on the opener's system fonts.
  const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
  downloadBlob(blob, filename || "fragment-viewer.svg");
}

// Rasterize SVG → Canvas → Blob, then download. Shared by PNG + JPG + WebP
// paths; they only differ in mime type + quality + background treatment.
// When `transparent` is true the canvas skips the white fill — produces a
// PNG/WebP with transparent background for compositing. JPG ignores it
// (JPEG has no alpha channel).
export function rasterizeSvgToCanvas(svgEl, scale, onCanvas, { transparent = false } = {}) {
  const xml = serializeSvg(svgEl);
  const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  const img = new Image();
  img.onload = () => {
    const vb = svgEl.viewBox && svgEl.viewBox.baseVal;
    const w = (vb && vb.width)  || svgEl.clientWidth  || 800;
    const h = (vb && vb.height) || svgEl.clientHeight || 400;
    const canvas = document.createElement("canvas");
    canvas.width  = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    if (!transparent) {
      // Opaque white background — journals expect white, JPGs require
      // opaque, and transparent PNGs read as ugly grey on many templates.
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    onCanvas(canvas);
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}

// High-res PNG (scale ≥ 1; 2 = default, 4 = poster/print, 6 = slide zoom,
// 8 = giant poster / zoom crop). Set { transparent: true } for alpha-channel
// output suitable for Illustrator / PowerPoint compositing.
export function exportSvgAsPng(svgEl, filename, scale = 2, opts = {}) {
  if (!svgEl) return;
  rasterizeSvgToCanvas(svgEl, scale, (canvas) => {
    canvas.toBlob(blob => {
      if (!blob) return;
      downloadBlob(blob, filename || "fragment-viewer.png");
    }, "image/png");
  }, opts);
}

// JPEG with configurable quality (0.92 high, 0.80 standard, 0.60 compact).
// Useful for emailing figures where PNG would be too large — at 0.92 the
// visual cost is negligible and file size drops 3-5x. JPEG is always
// opaque (no alpha channel).
export function exportSvgAsJpg(svgEl, filename, scale = 2, quality = 0.92) {
  if (!svgEl) return;
  rasterizeSvgToCanvas(svgEl, scale, (canvas) => {
    canvas.toBlob(blob => {
      if (!blob) return;
      downloadBlob(blob, filename || "fragment-viewer.jpg");
    }, "image/jpeg", quality);
  });
}

// WebP — modern lossy format that beats JPEG on file-size-per-quality by
// 25–40%. Supported by all current browsers, Illustrator 2022+, and most
// scientific publishing pipelines (check journal submission specs first).
// Accepts { transparent: true } like PNG.
export function exportSvgAsWebp(svgEl, filename, scale = 4, quality = 0.92, opts = {}) {
  if (!svgEl) return;
  rasterizeSvgToCanvas(svgEl, scale, (canvas) => {
    canvas.toBlob(blob => {
      if (!blob) return;
      downloadBlob(blob, filename || "fragment-viewer.webp");
    }, "image/webp", quality);
  }, opts);
}

// Merge multiple React refs so a single DOM element can be captured by both
// a local ref (used by a component's own ExportMenu) and an external ref
// passed in from a parent (ReportModal, DNADiagramsModal). Supports both
// object refs (useRef) and callback refs.
export function mergeRefs(...refs) {
  return (el) => {
    for (const r of refs) {
      if (!r) continue;
      if (typeof r === "function") r(el);
      else r.current = el;
    }
  };
}

// Stack two SVG elements into a single combined SVG for bundled export.
// Computes the union viewBox (stacked vertically with a small gap), copies
// the inner nodes of each source SVG into the combined one, offsets the
// second by the height of the first. Returns a detached <svg> element that
// can be passed to exportSvgNative / exportSvgAsPng / exportSvgAsWebp.
export function buildCombinedSvg(svgList, { gap = 24, title = "DNA diagrams" } = {}) {
  const ns = "http://www.w3.org/2000/svg";
  const combined = document.createElementNS(ns, "svg");
  combined.setAttribute("xmlns", ns);
  combined.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  // Compute viewBox: max width across sources, sum of heights + gaps.
  let maxW = 0;
  let totalH = 0;
  const entries = [];
  for (const s of svgList) {
    if (!s) continue;
    const vb = s.viewBox && s.viewBox.baseVal;
    const w = (vb && vb.width)  || s.clientWidth  || 800;
    const h = (vb && vb.height) || s.clientHeight || 400;
    if (w > maxW) maxW = w;
    entries.push({ src: s, w, h, yOffset: totalH });
    totalH += h + gap;
  }
  totalH = Math.max(0, totalH - gap);  // trim the final gap
  combined.setAttribute("viewBox", `0 0 ${maxW} ${totalH}`);
  combined.setAttribute("width", String(maxW));
  combined.setAttribute("height", String(totalH));
  // White bg rect
  const bg = document.createElementNS(ns, "rect");
  bg.setAttribute("x", "0"); bg.setAttribute("y", "0");
  bg.setAttribute("width", String(maxW)); bg.setAttribute("height", String(totalH));
  bg.setAttribute("fill", "white");
  combined.appendChild(bg);
  // Optional title text — helpful when the file opens standalone
  if (title) {
    const t = document.createElementNS(ns, "title");
    t.textContent = title;
    combined.appendChild(t);
  }
  for (const { src, w, h, yOffset } of entries) {
    // Wrap source svg contents in a <g translate(centerX, yOffset)> so
    // narrower diagrams center horizontally within the combined frame.
    const g = document.createElementNS(ns, "g");
    const xOffset = (maxW - w) / 2;
    g.setAttribute("transform", `translate(${xOffset}, ${yOffset})`);
    // Deep-clone every child of the source SVG.
    for (const child of Array.from(src.childNodes)) {
      g.appendChild(child.cloneNode(true));
    }
    combined.appendChild(g);
  }
  return combined;
}
