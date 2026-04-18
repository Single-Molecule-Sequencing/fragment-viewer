import { describe, it, expect } from "vitest";
import {
  buildHeatmapMatrix,
  heatmapColor,
  computePeakShiftStats,
} from "../src/FragmentViewer.jsx";

describe("buildHeatmapMatrix", () => {
  it("returns a log10-height cell when a peak matches the species within tol", () => {
    const peaksBySample = {
      s1: { B: [[100.3, 10000, 5000, 0.5]], G: [], Y: [], R: [] },
    };
    const species = [{ key: "b100", size: 100, dye: "B", label: "x" }];
    const m = buildHeatmapMatrix({ samples: ["s1"], peaksBySample, species, tol: 1 });
    expect(m.cells.s1.b100).toBeCloseTo(4, 3);
  });

  it("returns null when no peak falls within tol", () => {
    const peaksBySample = {
      s1: { B: [[110, 10000, 5000, 0.5]], G: [], Y: [], R: [] },
    };
    const species = [{ key: "b100", size: 100, dye: "B", label: "x" }];
    const m = buildHeatmapMatrix({ samples: ["s1"], peaksBySample, species, tol: 1 });
    expect(m.cells.s1.b100).toBeNull();
  });

  it("picks the closest peak when multiple fall within tol", () => {
    const peaksBySample = {
      s1: { B: [[100.8, 100, 50, 0.5], [100.1, 10000, 5000, 0.5]], G: [], Y: [], R: [] },
    };
    const species = [{ key: "b100", size: 100, dye: "B", label: "x" }];
    const m = buildHeatmapMatrix({ samples: ["s1"], peaksBySample, species, tol: 1.5 });
    // Closest is 100.1 with height 10000 → log10(10000) = 4
    expect(m.cells.s1.b100).toBeCloseTo(4, 3);
  });

  it("handles multiple samples × species cleanly", () => {
    const peaksBySample = {
      a: { B: [[100, 1000, 500, 0.5]], G: [[150, 100, 50, 0.5]], Y: [], R: [] },
      b: { B: [[100, 100, 50, 0.5]],   G: [],                     Y: [], R: [] },
    };
    const species = [
      { key: "b", size: 100, dye: "B", label: "x" },
      { key: "g", size: 150, dye: "G", label: "y" },
    ];
    const m = buildHeatmapMatrix({ samples: ["a", "b"], peaksBySample, species, tol: 1 });
    expect(m.cells.a.b).toBeCloseTo(3, 3);
    expect(m.cells.a.g).toBeCloseTo(2, 3);
    expect(m.cells.b.b).toBeCloseTo(2, 3);
    expect(m.cells.b.g).toBeNull();
  });
});

describe("heatmapColor", () => {
  it("returns a hex color string", () => {
    expect(heatmapColor(2.0, 1, 4)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("returns the neutral gray for null/NaN", () => {
    expect(heatmapColor(null)).toBe("#e5e7eb");
    expect(heatmapColor(NaN)).toBe("#e5e7eb");
    expect(heatmapColor(undefined)).toBe("#e5e7eb");
  });

  it("clamps out-of-range values to the palette endpoints", () => {
    const veryLow = heatmapColor(-100, 1, 4);
    const veryHigh = heatmapColor(100, 1, 4);
    // Low end ~= dark purple (#440154); high end ~= yellow (#FDE725)
    expect(veryLow).toMatch(/^#4[0-5]/);
    expect(veryHigh.toUpperCase()).toBe("#FDE725");
  });

  it("maps distinct inputs to distinct colors, with luminance increasing toward the high end", () => {
    const a = heatmapColor(1.5, 1, 4);
    const b = heatmapColor(2.5, 1, 4);
    const c = heatmapColor(3.5, 1, 4);
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
    // Viridis goes dark-purple → blue → teal → green → yellow; total
    // luminance (R+G+B) increases monotonically from low to high end.
    const lum = (s) => parseInt(s.slice(1, 3), 16) + parseInt(s.slice(3, 5), 16) + parseInt(s.slice(5, 7), 16);
    expect(lum(a)).toBeLessThan(lum(b));
    expect(lum(b)).toBeLessThan(lum(c));
  });
});

describe("computePeakShiftStats", () => {
  it("detects a consistent −1 bp shift across all dyes", () => {
    // Cut sample: every peak 1 bp smaller than the uncut peak at the same locus.
    const ref = {
      B: [[100, 1000, 0, 0.5], [150, 1000, 0, 0.5]],
      G: [[120, 1000, 0, 0.5]],
      Y: [[130, 1000, 0, 0.5]],
      R: [[160, 1000, 0, 0.5]],
    };
    const cur = {
      B: [[99, 1000, 0, 0.5], [149, 1000, 0, 0.5]],
      G: [[119, 1000, 0, 0.5]],
      Y: [[129, 1000, 0, 0.5]],
      R: [[159, 1000, 0, 0.5]],
    };
    const stats = computePeakShiftStats(cur, ref, 2.0);
    expect(stats.byDye.B.medianShift).toBeCloseTo(-1, 2);
    expect(stats.byDye.G.medianShift).toBeCloseTo(-1, 2);
    expect(stats.byDye.Y.medianShift).toBeCloseTo(-1, 2);
    expect(stats.byDye.R.medianShift).toBeCloseTo(-1, 2);
    expect(stats.totalN).toBe(5);
  });

  it("returns null-shift stats when no peaks match within tol", () => {
    const ref = { B: [[100, 1000, 0, 0.5]], G: [], Y: [], R: [] };
    const cur = { B: [[200, 1000, 0, 0.5]], G: [], Y: [], R: [] };
    const stats = computePeakShiftStats(cur, ref, 2.0);
    expect(stats.byDye.B.n).toBe(0);
    expect(stats.byDye.B.medianShift).toBeNull();
    expect(stats.totalN).toBe(0);
  });

  it("median is robust to a single outlier", () => {
    const ref = { B: [[100, 1000, 0, 0.5]], G: [], Y: [], R: [] };
    const cur = {
      B: [[99, 1000, 0, 0.5], [99.1, 1000, 0, 0.5], [99.05, 1000, 0, 0.5]],
      G: [], Y: [], R: [],
    };
    // Each current peak matches the same reference peak at 100; shifts = -1, -0.9, -0.95
    const stats = computePeakShiftStats(cur, ref, 2.0);
    expect(stats.byDye.B.n).toBe(3);
    expect(stats.byDye.B.medianShift).toBeCloseTo(-0.95, 2);
  });
});
