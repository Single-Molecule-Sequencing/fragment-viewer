import { describe, it, expect } from "vitest";
import {
  movingAverage,
  medianFilter,
  detrendLinear,
  logTransform,
  firstDerivative,
  preprocessTrace,
} from "../src/FragmentViewer.jsx";

describe("movingAverage", () => {
  it("returns [] on empty/null input", () => {
    expect(movingAverage([])).toEqual([]);
    expect(movingAverage(null)).toEqual([]);
  });

  it("smooths a constant signal to the same constant", () => {
    const t = Array(20).fill(50);
    expect(movingAverage(t, 5)).toEqual(t);
  });

  it("averages a 5-sample window correctly at the center", () => {
    const t = [0, 0, 100, 0, 0, 0, 0];
    const out = movingAverage(t, 5);
    // Window at index 2 (100): [0, 0, 100, 0, 0] → mean 20
    expect(out[2]).toBe(20);
  });

  it("forces window to odd ≥ 3", () => {
    const t = [10, 20, 30];
    // Window 2 → forced to 3; window 1 → forced to 3
    expect(movingAverage(t, 1)).toEqual(movingAverage(t, 3));
    expect(movingAverage(t, 2)).toEqual(movingAverage(t, 3));
  });
});

describe("medianFilter", () => {
  it("removes single-sample spikes without touching surroundings", () => {
    const t = [10, 10, 10, 10000, 10, 10, 10];
    const out = medianFilter(t, 3);
    // Median of [10, 10000, 10] at idx 3 = 10 (spike suppressed)
    expect(out[3]).toBe(10);
    expect(out[0]).toBe(10);
    expect(out[6]).toBe(10);
  });

  it("preserves step edges better than moving average", () => {
    const t = [0, 0, 0, 0, 100, 100, 100, 100];
    const med = medianFilter(t, 3);
    const avg = movingAverage(t, 3);
    // Step crossing at index 3|4:
    //   median at 3: [0, 0, 100] = 0 → still sharp
    //   avg at 3: (0 + 0 + 100)/3 = 33.33 → blurred
    expect(med[3]).toBe(0);
    expect(avg[3]).toBeGreaterThan(med[3]);
  });

  it("returns [] on empty input", () => {
    expect(medianFilter([])).toEqual([]);
  });
});

describe("detrendLinear", () => {
  it("zeroes a pure linear trend", () => {
    const t = Array.from({ length: 50 }, (_, i) => 2 * i + 5);
    const out = detrendLinear(t);
    for (const v of out) expect(Math.abs(v)).toBeLessThan(1e-6);
  });

  it("preserves a pure peak on a flat baseline", () => {
    const t = Array(50).fill(100);
    t[25] = 1000;
    const out = detrendLinear(t);
    // Single tall peak pulls the linear fit a bit toward its location, so
    // the post-detrend peak height is slightly less than 900 (around 882 in
    // practice). Assert within 50 of the expected height — the point of the
    // test is that the peak survives detrending, not an exact magnitude.
    expect(out[25]).toBeGreaterThan(850);
    expect(out[25]).toBeLessThan(920);
    expect(Math.abs(out[0])).toBeLessThan(50);
  });

  it("returns [] on empty input", () => {
    expect(detrendLinear([])).toEqual([]);
  });
});

describe("logTransform", () => {
  it("compresses a 3-decade dynamic range into a linear-ish output", () => {
    const t = [10, 100, 1000, 10000];
    const out = logTransform(t, 1000);
    // Ideal log-spaced input → equal deltas. The "+1" epsilon in the function
    // (protects log(0)) makes the first delta slightly larger than later
    // ones; at x=10 the relative distortion is ~4%, dropping to <0.1% by
    // x>=100. Assert steps are within 5% of each other overall.
    const deltas = [];
    for (let i = 1; i < out.length; i++) deltas.push(out[i] - out[i - 1]);
    const maxDelta = Math.max(...deltas);
    const minDelta = Math.min(...deltas);
    expect(maxDelta - minDelta).toBeLessThan(maxDelta * 0.05);
  });

  it("handles zero / negative inputs gracefully", () => {
    const t = [0, -50, 100];
    const out = logTransform(t);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(0);
    expect(out[2]).toBeGreaterThan(0);
  });
});

describe("firstDerivative", () => {
  it("is zero everywhere for a constant signal", () => {
    const t = Array(50).fill(42);
    const out = firstDerivative(t);
    // All outputs are mean + 0 = 42
    for (const v of out) expect(v).toBe(42);
  });

  it("spikes at the leading edge of a step", () => {
    const t = Array(40).fill(0);
    for (let i = 20; i < 40; i++) t[i] = 100;
    const out = firstDerivative(t);
    // Centered difference: (t[i+1] - t[i-1]) / 2
    // At i=20: (100 - 0)/2 = 50 (positive spike)
    const mean = t.reduce((s, v) => s + v, 0) / t.length;
    expect(out[20] - mean).toBeCloseTo(50, 1);
  });
});

describe("preprocessTrace — extended pipeline", () => {
  it("applies moving-average smoothing when smooth=moving", () => {
    const t = [0, 0, 100, 0, 0, 0, 0];
    const out = preprocessTrace(t, { smooth: "moving", movingWindow: 5 });
    expect(out[2]).toBe(20);
  });

  it("applies median filter when smooth=median", () => {
    const t = [10, 10, 10, 10000, 10, 10, 10];
    const out = preprocessTrace(t, { smooth: "median", medianWindow: 3 });
    expect(out[3]).toBe(10);
  });

  it("detrend runs BEFORE smooth (check composition order)", () => {
    // Linear trend + flat noise. Detrend zeroes trend; smooth then applies.
    const t = Array.from({ length: 50 }, (_, i) => 2 * i + 5);
    const out = preprocessTrace(t, { detrend: true, smooth: "moving", movingWindow: 5 });
    for (const v of out) expect(Math.abs(v)).toBeLessThan(1);
  });

  it("derivative is last in the pipeline", () => {
    const t = Array(30).fill(0);
    t[15] = 100;
    const out = preprocessTrace(t, { derivative: true });
    // Centered-difference at i=14: (t[15] - t[13])/2 = 50
    const mean = t.reduce((s, v) => s + v, 0) / t.length;
    expect(out[14] - mean).toBeCloseTo(50, 1);
  });
});
