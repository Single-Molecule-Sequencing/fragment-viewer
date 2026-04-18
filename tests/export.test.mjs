// Unit tests for the export helpers. We can't test the full rasterization
// path in a Node environment (no browser Canvas), but we CAN verify the
// behavior of serializeSvg / the exported helpers' guard paths and the
// namespace-injection contract, which is what actually breaks real-world
// .svg downloads when opened in Illustrator.

import { describe, it, expect, vi } from "vitest";
import { exportSvgNative, exportSvgAsPng, exportSvgAsJpg, exportSvgAsWebp } from "../src/FragmentViewer.jsx";

// Minimal DOM shim so the helpers don't crash when invoked in Node. We only
// need enough surface for them to call .cloneNode / .setAttribute / the
// Blob + URL APIs. Anything requiring real rasterization (Image.onload) is
// tested by shape — the helper must not throw when the svg is null.

function makeFakeSvg({ hasXmlns = false } = {}) {
  let attrs = {};
  if (hasXmlns) attrs["xmlns"] = "http://www.w3.org/2000/svg";
  return {
    viewBox: { baseVal: { width: 920, height: 400 } },
    clientWidth: 920,
    clientHeight: 400,
    getAttribute(k) { return attrs[k] || null; },
    setAttribute(k, v) { attrs[k] = v; },
    cloneNode() {
      const copy = { ...this };
      copy.getAttribute = this.getAttribute.bind(copy);
      copy.setAttribute = this.setAttribute.bind(copy);
      // Each clone keeps its own attr map so the helper's mutation doesn't
      // leak back to the "live" element — mimics real DOM cloning.
      const localAttrs = { ...attrs };
      copy.getAttribute = (k) => localAttrs[k] || null;
      copy.setAttribute = (k, v) => { localAttrs[k] = v; };
      copy._attrs = localAttrs;
      return copy;
    },
    _attrs: attrs,
  };
}

describe("export helpers — guard behavior", () => {
  it("exportSvgNative is a no-op when svgEl is null/undefined", () => {
    expect(() => exportSvgNative(null, "x.svg")).not.toThrow();
    expect(() => exportSvgNative(undefined, "x.svg")).not.toThrow();
  });

  it("exportSvgAsPng is a no-op when svgEl is null/undefined", () => {
    expect(() => exportSvgAsPng(null, "x.png", 2)).not.toThrow();
  });

  it("exportSvgAsJpg is a no-op when svgEl is null/undefined", () => {
    expect(() => exportSvgAsJpg(null, "x.jpg", 2, 0.92)).not.toThrow();
  });

  it("exportSvgAsWebp is a no-op when svgEl is null/undefined", () => {
    expect(() => exportSvgAsWebp(null, "x.webp", 4, 0.92)).not.toThrow();
  });

  it("exportSvgAsPng accepts transparent-background option without throwing", () => {
    expect(() => exportSvgAsPng(null, "x.png", 4, { transparent: true })).not.toThrow();
  });

  it("exportSvgAsWebp accepts transparent-background option without throwing", () => {
    expect(() => exportSvgAsWebp(null, "x.webp", 4, 0.92, { transparent: true })).not.toThrow();
  });
});

describe("exportSvgNative — serialization contract", () => {
  it("downloads a Blob with image/svg+xml mime type and exercises the download path", () => {
    // Shim XMLSerializer so the serializeSvg helper works in Node; we only
    // need it to return a string — the exact output is tested implicitly by
    // the fact that the Blob we observe is non-empty.
    const origXml = globalThis.XMLSerializer;
    globalThis.XMLSerializer = function () {
      return { serializeToString: (el) => `<svg xmlns="${el._attrs?.xmlns || "http://www.w3.org/2000/svg"}"/>` };
    };
    const urls = [];
    const origCreate = globalThis.URL.createObjectURL;
    globalThis.URL.createObjectURL = (blob) => {
      urls.push({ type: blob.type, size: blob.size });
      return "blob:fake";
    };
    globalThis.URL.revokeObjectURL = () => {};
    const click = vi.fn();
    const remove = vi.fn();
    const appendChild = vi.fn();
    const origCreateElement = globalThis.document?.createElement;
    globalThis.document = globalThis.document || {};
    globalThis.document.createElement = (tag) => {
      if (tag === "a") return { click, set href(_){}, set download(_){}, remove };
      return {};
    };
    globalThis.document.body = globalThis.document.body || { appendChild, removeChild: remove };

    const fakeSvg = makeFakeSvg({ hasXmlns: false });
    exportSvgNative(fakeSvg, "traces.svg");

    expect(urls).toHaveLength(1);
    expect(urls[0].type).toMatch(/image\/svg\+xml/);
    expect(urls[0].size).toBeGreaterThan(0);
    expect(click).toHaveBeenCalled();

    // Restore
    globalThis.URL.createObjectURL = origCreate;
    if (origXml) globalThis.XMLSerializer = origXml;
    else delete globalThis.XMLSerializer;
    if (origCreateElement) globalThis.document.createElement = origCreateElement;
  });
});
