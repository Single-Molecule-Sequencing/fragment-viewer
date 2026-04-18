import { describe, it, expect } from "vitest";
import {
  rollingBaseline,
  subtractBaseline,
  savitzkyGolay,
  clipSaturated,
  preprocessTrace,
} from "../src/FragmentViewer.jsx";

describe("rollingBaseline", () => {
  it("returns an array of the same length as the input", () => {
    const t = [10, 20, 30, 40, 50, 40, 30, 20, 10];
    expect(rollingBaseline(t, 3)).toHaveLength(t.length);
  });

  it("finds the local minimum under a gaussian-like bump", () => {
    // Flat baseline at 100 with a peak in the middle; rolling min should stay at 100 away from edges.
    const trace = Array(401).fill(100);
    for (let i = 190; i <= 210; i++) trace[i] = 100 + Math.round(1000 * Math.exp(-((i - 200) ** 2) / 40));
    const bl = rollingBaseline(trace, 51);
    // Peak center has no baseline sample near it (within half-window) below 100 unless the peak itself is min.
    // With window 51 the minimum at i=200 reaches back to i=175 which is 100 → baseline still 100.
    expect(bl[200]).toBe(100);
    expect(bl[0]).toBe(100);
    expect(bl[400]).toBe(100);
  });

  it("clamps a too-small window to 3", () => {
    const t = [5, 4, 3, 2, 1, 2, 3, 4, 5];
    const bl = rollingBaseline(t, 1);
    // window forced to 3 → center value is min of self + neighbors
    expect(bl[4]).toBe(1);
    expect(bl[0]).toBe(4);   // min(5,4) at edge
  });

  it("returns [] on empty or null input", () => {
    expect(rollingBaseline([])).toEqual([]);
    expect(rollingBaseline(null)).toEqual([]);
  });
});

describe("subtractBaseline", () => {
  it("subtracts elementwise and clamps to zero", () => {
    const t  = [100, 200, 150, 90];
    const bl = [ 80, 100, 200, 90];
    expect(subtractBaseline(t, bl)).toEqual([20, 100, 0, 0]);
  });

  it("returns a copy when baseline length mismatches", () => {
    const t = [1, 2, 3];
    const out = subtractBaseline(t, [0]);
    expect(out).toEqual(t);
    expect(out).not.toBe(t);
  });
});

describe("savitzkyGolay", () => {
  it("preserves peak amplitude on a triangular spike with window 7", () => {
    const trace = Array(40).fill(0);
    trace[20] = 1000;
    trace[19] = 500; trace[21] = 500;
    trace[18] = 200; trace[22] = 200;
    const smooth = savitzkyGolay(trace, 7, 2);
    // SG(7,2) reduces a single-sample spike to ~7/21 = 33% of input (coefs peak
    // at 7/21); on this triangular shape it recovers ~2/3 of the raw amplitude.
    // Boxcar-7 would recover only 1400/7 = 200. Assert SG beats that by 3x.
    expect(smooth[20]).toBeGreaterThan(600);
    expect(smooth[20]).toBeLessThanOrEqual(1000);
  });

  it("returns a pass-through copy for an unsupported (window, order)", () => {
    const t = [1, 2, 3, 4, 5];
    expect(savitzkyGolay(t, 99, 2)).toEqual(t);
  });

  it("leaves edges untouched (window/2 samples on each side)", () => {
    const t = [42, 42, 42, 42, 42, 42, 42, 42, 42];
    const out = savitzkyGolay(t, 7, 2);
    // exact pass-through at edges
    expect(out[0]).toBe(42);
    expect(out[out.length - 1]).toBe(42);
  });
});

describe("clipSaturated", () => {
  it("caps values above the ceiling", () => {
    expect(clipSaturated([100, 50000, 20000], 30000)).toEqual([100, 30000, 20000]);
  });

  it("leaves values below untouched", () => {
    expect(clipSaturated([1, 2, 3], 100)).toEqual([1, 2, 3]);
  });
});

describe("preprocessTrace pipeline", () => {
  it("applies clip → baseline → smooth in order", () => {
    const trace = Array(200).fill(100);
    for (let i = 95; i <= 105; i++) trace[i] = 50000;  // saturated peak
    const out = preprocessTrace(trace, {
      clip: true, clipCeiling: 20000,
      baseline: true, baselineWindow: 21,
      smooth: "savgol", savgolWindow: 7, savgolOrder: 2,
    });
    expect(out).toHaveLength(trace.length);
    // Clipped + baseline-subtracted + smoothed: center peak should be ~clip ceiling minus baseline (~100).
    expect(out[100]).toBeGreaterThan(15000);
    expect(out[100]).toBeLessThanOrEqual(20000);
    // Far from the peak, baseline subtraction should pull values close to 0.
    expect(out[10]).toBeLessThan(50);
  });

  it("is a pass-through copy when all options are off/default", () => {
    const trace = [1, 2, 3, 4, 5];
    expect(preprocessTrace(trace)).toEqual(trace);
  });
});
