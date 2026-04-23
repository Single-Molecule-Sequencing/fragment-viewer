// Source-level regression tests for the three cosmetic fixes that shipped
// with the v0.28.1 → v0.29.0 carryover (gh#18, gh#19, gh#20).
//
// Same pattern as tests/issues_21_22_23_regression.test.mjs: the underlying
// bugs are all layout/rendering and hard to assert via pure-logic unit tests,
// so we assert the load-bearing source fragments. If someone reverts the fix,
// the test fails with a clear pointer back to this file.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = (p) => readFileSync(resolve(__dirname, "..", p), "utf8");

describe("Issue #18 — ConstructDiagram + ProductFragmentViz Export out of SVG viewBox", () => {
  const diagrams = SRC("src/components/diagrams.jsx");

  it("ConstructDiagram no longer places Export absolute-positioned over the 3′ label", () => {
    // The bug: the Export menu sat `absolute top-1 right-1` inside the
    // relative wrapper that held the SVG, directly overlapping the "→ 3′"
    // end label in the top-right of the viewBox.
    const construct = diagrams.slice(
      diagrams.indexOf("export function ConstructDiagram"),
      diagrams.indexOf("export function AssemblyProductsCard"),
    );
    expect(construct).not.toMatch(/absolute top-1 right-1/);
    expect(construct).toMatch(/flex items-center justify-end[^"]*mb-1\.5/);
    // ExportMenu has to be rendered before the <svg>, not on top of it.
    expect(construct.indexOf("ExportMenu")).toBeLessThan(construct.indexOf("<svg"));
  });

  it("ProductFragmentViz applies the same header-row placement", () => {
    // The same absolute-overlap pattern lived in ProductFragmentViz. Moving
    // Export to a header row everywhere is the only way to match gh#19's
    // "unify placement across each figure panel" acceptance criterion.
    const fragViz = diagrams.slice(
      diagrams.indexOf("export function ProductFragmentViz"),
      diagrams.indexOf("export function ConstructDiagram"),
    );
    expect(fragViz).not.toMatch(/absolute top-1 right-1/);
    expect(fragViz).toMatch(/flex items-center justify-end[^"]*mb-1\.5/);
  });

  it("no diagram component retains the absolute-top-right ExportMenu pattern", () => {
    // Belt-and-braces: scan the whole file.
    expect(diagrams).not.toMatch(/absolute top-1 right-1/);
  });
});

describe("Issue #19 — PostTailing / EndStructure subtitle width capped + Export shrink-0", () => {
  const editors = SRC("src/components/editors.jsx");

  // Helper: slice starting BEFORE the headline so the wrapping
  // <div className="min-w-0 max-w-3xl"> on the preceding line is captured,
  // and ending well after so the Export <div shrink-0> sibling is included.
  const headerSlice = (src, headline, span = 1200, lookBack = 300) => {
    const i = src.indexOf(headline);
    return src.slice(Math.max(0, i - lookBack), i + span);
  };

  it("PostTailingPanel caps the subtitle column and makes the Export wrapper non-shrinking", () => {
    // The long "Four-step reaction per end..." subtitle previously had no
    // width cap, so it spilled into the Export button's flex cell and
    // deformed the button. max-w-3xl caps the column; shrink-0 prevents
    // Export from being squeezed by the subtitle.
    const postTailing = headerSlice(editors, "Post-dA-tailing molecular products");
    expect(postTailing).toMatch(/max-w-3xl/);
    expect(postTailing).toMatch(/shrink-0/);
  });

  it("EndStructureEditor uses the same max-w / shrink-0 pattern", () => {
    // Unify the header layout across BOTH panels so the Export-button shape
    // stays consistent regardless of surrounding subtitle text length.
    const endEditor = headerSlice(editors, "End-structure editor · dA-tailability");
    expect(endEditor).toMatch(/max-w-3xl/);
    expect(endEditor).toMatch(/shrink-0/);
  });
});

describe("Issue #20 — CUT-box geometry + text centering unified", () => {
  const diagrams = SRC("src/components/diagrams.jsx");
  const editors = SRC("src/components/editors.jsx");

  it("ConstructDiagram and EndStructureEditor both use the same CUT rect attrs", () => {
    // Was: ConstructDiagram 32×14 rx=3, EndStructureEditor 36×12 rx=2.
    // Now: both 32×14 rx=3 so the red CUT pill looks identical across
    // panels (gh#20 acceptance).
    const rectAttrs = /rect x="-16" y="-9" width="32" height="14" rx="3" fill="#dc2626"/;
    expect(diagrams).toMatch(rectAttrs);
    expect(editors).toMatch(rectAttrs);
  });

  it("letterSpacing is removed from CUT text so textAnchor=middle actually centers it", () => {
    // letter-spacing adds trailing space past the last glyph; textAnchor=
    // middle then centers glyphs + trailing pad, visually offsetting the
    // text left of anchor. Drop letter-spacing on the short CUT label.
    const constructCut = diagrams.slice(
      diagrams.indexOf('>CUT</text>') - 300,
      diagrams.indexOf('>CUT</text>') + 50,
    );
    const editorsCut = editors.slice(
      editors.indexOf('>CUT</text>') - 300,
      editors.indexOf('>CUT</text>') + 50,
    );
    expect(constructCut).not.toMatch(/letterSpacing/);
    expect(editorsCut).not.toMatch(/letterSpacing/);
  });

  it("CUT text uses dominantBaseline=middle for vertical centering in both panels", () => {
    // Without dominantBaseline, the y coord sits at the glyph baseline and
    // the glyph cluster hangs below; combined with the tight 14-px-tall rect
    // this made the text look bottom-aligned. dominantBaseline="middle"
    // centers vertically regardless of font metrics.
    const findCutBlock = (src) => {
      const i = src.indexOf('>CUT</text>');
      return src.slice(Math.max(0, i - 400), i + 50);
    };
    expect(findCutBlock(diagrams)).toMatch(/dominantBaseline="middle"/);
    expect(findCutBlock(editors)).toMatch(/dominantBaseline="middle"/);
  });
});
