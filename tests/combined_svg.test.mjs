import { describe, it, expect, beforeEach } from "vitest";
import { buildCombinedSvg } from "../src/FragmentViewer.jsx";

// Minimal DOM shim for Node. buildCombinedSvg uses document.createElementNS
// and the viewBox.baseVal API. We emulate just enough of the SVG DOM to
// exercise the layout math.
function installSvgShim() {
  const nodes = [];
  function makeEl(ns, tag) {
    const el = {
      namespaceURI: ns,
      tagName: tag,
      attrs: {},
      children: [],
      parent: null,
      get childNodes() { return this.children; },
      setAttribute(k, v) { this.attrs[k] = String(v); },
      getAttribute(k) { return this.attrs[k] || null; },
      appendChild(c) { c.parent = this; this.children.push(c); return c; },
      cloneNode(_deep) {
        const copy = makeEl(this.namespaceURI, this.tagName);
        Object.assign(copy.attrs, this.attrs);
        for (const c of this.children) copy.appendChild(c.cloneNode(true));
        return copy;
      },
      set textContent(v) { this._text = v; },
      get textContent() { return this._text || ""; },
    };
    nodes.push(el);
    return el;
  }
  globalThis.document = globalThis.document || {};
  globalThis.document.createElementNS = (ns, tag) => makeEl(ns, tag);
  return nodes;
}

function makeSourceSvg(w, h, nChildren = 1) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = globalThis.document.createElementNS(ns, "svg");
  svg.viewBox = { baseVal: { width: w, height: h } };
  svg.clientWidth = w;
  svg.clientHeight = h;
  for (let i = 0; i < nChildren; i++) {
    const child = globalThis.document.createElementNS(ns, "rect");
    child.setAttribute("data-id", `rect-${i}`);
    svg.appendChild(child);
  }
  return svg;
}

describe("buildCombinedSvg", () => {
  beforeEach(() => installSvgShim());

  it("produces a combined SVG whose viewBox height is sum(heights) + gaps", () => {
    const a = makeSourceSvg(800, 200);
    const b = makeSourceSvg(800, 300);
    const combined = buildCombinedSvg([a, b], { gap: 24 });
    expect(combined.getAttribute("viewBox")).toBe("0 0 800 524");
    //   200 + 24 + 300 = 524
  });

  it("width is the max across sources (centers narrower diagrams)", () => {
    const a = makeSourceSvg(600, 100);
    const b = makeSourceSvg(900, 100);
    const combined = buildCombinedSvg([a, b], { gap: 10 });
    expect(combined.getAttribute("viewBox")).toBe("0 0 900 210");
  });

  it("clones each source's children into position-offset groups (not moved)", () => {
    const a = makeSourceSvg(800, 200, 2);
    const b = makeSourceSvg(800, 300, 3);
    const combined = buildCombinedSvg([a, b], { gap: 24 });
    // combined has: 1 background rect + (optional title) + 2 <g> wrappers.
    // We count <g> wrappers specifically.
    const gs = combined.children.filter(c => c.tagName === "g");
    expect(gs).toHaveLength(2);
    expect(gs[0].children).toHaveLength(2);
    expect(gs[1].children).toHaveLength(3);
    // Each wrapper has a translate(…, yOffset) transform. First = y=0, second = y=224.
    expect(gs[0].getAttribute("transform")).toBe("translate(0, 0)");
    expect(gs[1].getAttribute("transform")).toBe("translate(0, 224)");
    // Source SVGs must remain unmodified (we cloneNode, not move).
    expect(a.children).toHaveLength(2);
    expect(b.children).toHaveLength(3);
  });

  it("injects the SVG xmlns on the combined root", () => {
    const a = makeSourceSvg(400, 100);
    const combined = buildCombinedSvg([a]);
    expect(combined.getAttribute("xmlns")).toBe("http://www.w3.org/2000/svg");
  });

  it("handles empty / null entries without crashing", () => {
    expect(() => buildCombinedSvg([])).not.toThrow();
    expect(() => buildCombinedSvg([null, null])).not.toThrow();
    const a = makeSourceSvg(400, 100);
    const combined = buildCombinedSvg([null, a, null]);
    expect(combined.getAttribute("viewBox")).toBe("0 0 400 100");
  });
});
