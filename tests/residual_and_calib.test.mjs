import { describe, it, expect } from "vitest";
import {
  evaluateGaussianSum,
  computeResidual,
  autoCalibrateDyeOffsets,
  buildReportMarkdown,
} from "../src/FragmentViewer.jsx";

describe("evaluateGaussianSum", () => {
  it("returns 0 for an empty peak table", () => {
    expect(evaluateGaussianSum([], 100)).toBe(0);
    expect(evaluateGaussianSum(null, 100)).toBe(0);
  });

  it("peaks at the center and decays with a 5σ cutoff", () => {
    const peaks = [[100, 1000, 0, 1.0]]; // size, height, area, width
    // sigma = 1.0 / 2.355 ≈ 0.425
    const atCenter = evaluateGaussianSum(peaks, 100);
    const atFar = evaluateGaussianSum(peaks, 105); // ~12 sigma — clipped to 0
    expect(atCenter).toBeCloseTo(1000, 1);
    expect(atFar).toBe(0);
  });

  it("sums multiple peaks additively", () => {
    const a = [[50, 100, 0, 0.5]];
    const b = [[50, 200, 0, 0.5]];
    const both = [[50, 100, 0, 0.5], [50, 200, 0, 0.5]];
    const va = evaluateGaussianSum(a, 50);
    const vb = evaluateGaussianSum(b, 50);
    const vab = evaluateGaussianSum(both, 50);
    expect(vab).toBeCloseTo(va + vb, 3);
    expect(vab).toBeCloseTo(300, 1);
  });
});

describe("computeResidual", () => {
  it("yields zeros when raw perfectly matches the modeled gaussian", () => {
    const peaks = [[50, 500, 0, 1.0]];
    const xs = [40, 45, 50, 55, 60];
    const ys = xs.map(x => evaluateGaussianSum(peaks, x));
    const r = computeResidual(xs, ys, peaks, 1);
    for (const v of r) expect(Math.abs(v)).toBeLessThan(1e-6);
  });

  it("surfaces a shoulder that the peak table misses", () => {
    // Peak table has only the main peak at 50; the raw trace has an unmodeled
    // shoulder at 52. Residual should spike positive at 52.
    const peaks = [[50, 500, 0, 1.0]];
    const xs = [48, 49, 50, 51, 52, 53, 54];
    const ys = xs.map(x =>
      evaluateGaussianSum(peaks, x) +
      evaluateGaussianSum([[52, 120, 0, 0.8]], x)
    );
    const r = computeResidual(xs, ys, peaks, 1);
    const at52 = r[xs.indexOf(52)];
    expect(at52).toBeGreaterThan(50);
  });

  it("returns [] on length mismatch", () => {
    expect(computeResidual([1, 2], [1], [], 1)).toEqual([]);
  });
});

describe("autoCalibrateDyeOffsets", () => {
  it("finds a +0.5 bp systematic shift across samples", () => {
    // Expected 200 bp (blue) and 150 bp (green). Observed is shifted +0.5.
    const peaksBySample = {
      s1: { B: [[200.5, 1000, 0, 0.5]], G: [[150.5, 800, 0, 0.5]], Y: [], R: [] },
      s2: { B: [[200.4, 900, 0, 0.5]],  G: [[150.6, 700, 0, 0.5]], Y: [], R: [] },
      s3: { B: [[200.6, 1100, 0, 0.5]], G: [[150.5, 900, 0, 0.5]], Y: [], R: [] },
    };
    const expectedByDye = { B: [200], G: [150], Y: [], R: [] };
    const { offsets, matchesByDye, n } = autoCalibrateDyeOffsets(peaksBySample, expectedByDye, 2.0);
    expect(offsets.B).toBeCloseTo(0.5, 1);
    expect(offsets.G).toBeCloseTo(0.5, 1);
    expect(matchesByDye.B).toHaveLength(3);
    expect(matchesByDye.G).toHaveLength(3);
    expect(n).toBe(6);
  });

  it("ignores peaks outside the match tolerance", () => {
    const peaksBySample = {
      s1: { B: [[210, 100, 0, 0.5]], G: [], Y: [], R: [] }, // 10 bp away
    };
    const expectedByDye = { B: [200], G: [], Y: [], R: [] };
    const { matchesByDye } = autoCalibrateDyeOffsets(peaksBySample, expectedByDye, 2.0);
    expect(matchesByDye.B).toHaveLength(0);
  });

  it("is robust to a single outlier peak via median", () => {
    // Four samples cluster around +0.2 shift; one sample has a misidentified
    // peak at +1.8. Median should still land at ~0.2, not mean ≈ 0.5.
    const mk = (bp) => ({ B: [[bp, 100, 0, 0.5]], G: [], Y: [], R: [] });
    const peaksBySample = {
      s1: mk(200.2), s2: mk(200.2), s3: mk(200.2), s4: mk(200.2), s5: mk(201.8),
    };
    const { offsets, matchesByDye } = autoCalibrateDyeOffsets(peaksBySample, { B: [200], G: [], Y: [], R: [] }, 3.0);
    expect(matchesByDye.B).toHaveLength(5);
    expect(offsets.B).toBeCloseTo(0.2, 1);
  });

  it("subtracts the current offset from the search target (idempotent re-calibration)", () => {
    // If the user already set offset B = +0.5 and the observed peaks are at
    // 200.5 for an expected size of 200, then after calibration the new offset
    // should be ~+0.5 — NOT double-counted as +1.0.
    const peaksBySample = { s1: { B: [[200.5, 100, 0, 0.5]], G: [], Y: [], R: [] } };
    const current = { B: 0.5, G: 0, Y: 0, R: 0 };
    const { offsets, matchesByDye } = autoCalibrateDyeOffsets(peaksBySample, { B: [200], G: [], Y: [], R: [] }, 1.0, current);
    expect(matchesByDye.B).toHaveLength(1);
    expect(offsets.B).toBeCloseTo(0.5, 2);
  });
});

describe("buildReportMarkdown", () => {
  it("emits a header, samples table, and the pandoc build command", () => {
    const md = buildReportMarkdown({
      samples: ["s1", "s2"],
      peaksBySample: {
        s1: { B: [[100, 500, 0, 0.5]], G: [], Y: [], R: [], O: [] },
        s2: { B: [], G: [[150, 800, 0, 0.5]], Y: [], R: [], O: [] },
      },
      dyeOffsets: { B: 0.1, G: 0.2, Y: 0.3, R: 0.4 },
      componentSizes: { Ad1: 55, Target: 30, Ad2: 50 },
      constructSize: 226,
      targetStart: 60,
      targetEnd: 110,
      generatedAt: new Date("2026-04-18T12:00:00Z"),
    });
    expect(md).toContain("# Fragment Viewer report");
    expect(md).toContain("2026-04-18");
    expect(md).toContain("| Sample |");
    expect(md).toContain("s1");
    expect(md).toContain("s2");
    expect(md).toContain("pandoc report.md");
    expect(md).toContain("xelatex");
    expect(md).toContain("DejaVu Sans");
    // Construct components appear
    expect(md).toContain("Ad1");
    expect(md).toContain("226");
  });
});
