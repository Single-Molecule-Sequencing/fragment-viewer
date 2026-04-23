// Source-level regression tests for the three issues closed in this batch.
// The underlying bugs are all render/layout — hard to assert via pure-logic
// unit tests — so we assert the load-bearing fragments of the source code are
// in place. If someone reverts the fix, the test fails with a clear pointer.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = (p) => readFileSync(resolve(__dirname, "..", p), "utf8");

describe("Issue #22 — Lab tools GitHub links removed from sidebar", () => {
  const chrome = SRC("src/components/chrome.jsx");

  it("does not reference the broken lab-tool repos in SidebarLink calls", () => {
    // Per issue: all three lab-tool links 404'd. Acceptance: removed.
    expect(chrome).not.toMatch(/SidebarLink[^)]*cas9-targeted-sequencing/);
    expect(chrome).not.toMatch(/SidebarLink[^)]*sma-seq-workspace/);
    expect(chrome).not.toMatch(/SidebarLink[^)]*PharmVar/);
  });

  it("keeps the drag-and-drop hint in the sidebar footer", () => {
    expect(chrome).toMatch(/Drag a GeneMapper TSV/);
  });
});

describe("Issue #21 — circle / pill text alignment unified with dominantBaseline", () => {
  const diagrams = SRC("src/components/diagrams.jsx");
  const editors = SRC("src/components/editors.jsx");

  it("ConstructDiagram dye circles use dominantBaseline=central on the letter", () => {
    // Two circles — the bar-edge circle and the header row circle — both need
    // dominantBaseline="central" so B/Y/G/R letters sit vertically centered.
    const matches = diagrams.match(/dominantBaseline="central"/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("EndStructureEditor dA-TAIL pill is pushed below the caption line", () => {
    // Pill group translate y was 22 (overlapped the "top 3′: N bp · bot 5′: M bp"
    // caption). Fix: pushed to 34 so caption text clears the pill.
    expect(editors).toMatch(/translate\(0, 34\)/);
    expect(editors).not.toMatch(/letterSpacing: "0\.04em"\s*\}\}>\s*\{leftEval\.dATailable/);
  });

  it("EndStructureEditor dA-TAIL pill text uses dominantBaseline=central", () => {
    const section = editors.slice(editors.indexOf("dA-TAIL") - 400, editors.indexOf("dA-TAIL") + 400);
    expect(section).toMatch(/dominantBaseline="central"/);
  });

  it("PostTailing terminal-base pills use dominantBaseline=central", () => {
    // Tag pills (T/G/C/TA/GA) had no dominantBaseline. Now centered.
    const tseq = editors.slice(editors.indexOf("key=\"tseq\""), editors.indexOf("key=\"tseq\"") + 400);
    expect(tseq).toMatch(/dominantBaseline="central"/);
  });

  it("PostTailing adapter starts 24+ units past min end, clearing the tag pill", () => {
    // Previous adapterStart = Math.min(...) + 10 overlapped a 16-px 2-char tag pill.
    // Fixed to + 24 (clears widest 2-char tag + 3px gap).
    expect(editors).toMatch(/adapterStart = Math\.min\(topEnd, botEnd\) \+ 24/);
  });

  it("Component sizes form uses items-center to align label with option controls", () => {
    // Parent flex was items-stretch by default → "Component sizes (bp):" label
    // appeared slightly taller than the option input labels. Fixed with items-center.
    expect(diagrams).toMatch(/flex flex-wrap items-center gap-2/);
  });
});

describe("Issue #23 — Heatmap SVG renders at fixed pixel scale (not stretched)", () => {
  const heatmap = SRC("src/tabs/heatmap_tab.jsx");

  it("SVG sets explicit width and height attrs (not w-full)", () => {
    // Was: className="w-full h-auto" — SVG stretched to container, so fewer
    // cells → bigger apparent cells + text on screen, but constant on export.
    // Fixed: width={W} height={H} on the svg, dropping w-full.
    expect(heatmap).toMatch(/<svg ref=\{svgRef\} viewBox=\{`0 0 \$\{W\} \$\{H\}`\} width=\{W\} height=\{H\}/);
    expect(heatmap).not.toMatch(/<svg[^>]*className="w-full h-auto"/);
  });

  it("cellW and cellH remain fixed constants (not container-derived)", () => {
    // Scale consistency requires the per-cell SVG unit to be a literal number,
    // not a function of container width or element count.
    expect(heatmap).toMatch(/const cellW = 28;/);
    expect(heatmap).toMatch(/const cellH = 18;/);
  });

  it("W scales linearly with species.length so the container scrolls horizontally", () => {
    // The container wrapping the SVG already has overflow-x-auto (see
    // heatmap_tab.jsx). Scale consistency depends on W = labelW + N * cellW + 16.
    expect(heatmap).toMatch(/W = labelW \+ species\.length \* cellW \+ 16/);
    expect(heatmap).toMatch(/overflow-x-auto/);
  });
});
