import { describe, it, expect } from "vitest";
import {
  computePeakSNR,
  computePurityScore,
  resolveDyeColor,
  DYE_PALETTES,
} from "../src/FragmentViewer.jsx";

describe("computePeakSNR", () => {
  it("returns null SNR when no raw trace is available", () => {
    const r = computePeakSNR(200, 1000, null, null);
    expect(r.snr).toBeNull();
    expect(r.noiseFloor).toBeNull();
  });

  it("computes a high SNR for a clear peak above a flat-noise baseline", () => {
    // Flat trace at noise level 100, with tiny random-ish variance, and a peak of 1000 at bp=200.
    const n = 500;
    const bpAxis = new Float32Array(n);
    const trace = new Array(n);
    for (let i = 0; i < n; i++) {
      bpAxis[i] = 150 + (i / n) * 100; // 150..250 bp
      // Tight gaussian noise around 100 (σ≈2)
      trace[i] = 100 + (((i * 37) % 11) - 5) * 0.4;
    }
    const peakIdx = Math.floor(n / 2);
    const peakHeight = 1000;
    trace[peakIdx] = peakHeight;
    const r = computePeakSNR(bpAxis[peakIdx], peakHeight, trace, bpAxis, 4, 1.2);
    expect(r.snr).not.toBeNull();
    expect(r.snr).toBeGreaterThan(50);
    expect(r.noiseFloor).toBeGreaterThan(100);
    expect(r.noiseFloor).toBeLessThan(200);
  });

  it("returns null when there aren't enough samples in the window", () => {
    const trace = [10, 11, 12];
    const bpAxis = new Float32Array([100, 101, 102]);
    const r = computePeakSNR(101, 50, trace, bpAxis, 4, 1.2);
    expect(r.snr).toBeNull();
  });

  it("excludes the peak from noise estimation (robust to tall peaks)", () => {
    // If exclusion didn't work, the peak itself would dominate the MAD and
    // the noise floor would be way higher than the true baseline.
    const n = 400;
    const bpAxis = new Float32Array(n);
    const trace = new Array(n);
    for (let i = 0; i < n; i++) {
      bpAxis[i] = 150 + (i / n) * 100;
      trace[i] = 50 + (((i * 13) % 7) - 3) * 0.3; // ~50 baseline, tight noise
    }
    // Add a giant peak spanning ±0.5 bp around 200.
    for (let i = 0; i < n; i++) {
      if (Math.abs(bpAxis[i] - 200) < 0.5) trace[i] = 50000;
    }
    const r = computePeakSNR(200, 50000, trace, bpAxis, 4, 1.2);
    expect(r.snr).not.toBeNull();
    expect(r.noiseFloor).toBeLessThan(200); // noise floor reflects baseline, not the peak
  });
});

describe("computePurityScore", () => {
  it("returns 1.0 when every peak falls within tol of an expected size", () => {
    const peaks = {
      B: [[100.0, 500, 0, 0.5], [150.0, 400, 0, 0.5]],
      G: [[200.0, 300, 0, 0.5]],
      Y: [],
      R: [],
    };
    const expected = { B: [100, 150], G: [200], Y: [], R: [] };
    const r = computePurityScore(peaks, expected, 1.0);
    expect(r.purity).toBeCloseTo(1.0, 3);
    expect(r.matches).toBe(3);
    expect(r.n).toBe(3);
  });

  it("returns 0.0 when no peaks match any expected size", () => {
    const peaks = { B: [[50, 1000, 0, 0.5]], G: [], Y: [], R: [] };
    const expected = { B: [100], G: [], Y: [], R: [] };
    const r = computePurityScore(peaks, expected, 1.0);
    expect(r.purity).toBe(0);
    expect(r.matches).toBe(0);
    expect(r.n).toBe(1);
  });

  it("is height-weighted, not count-weighted", () => {
    const peaks = {
      B: [
        [100, 10000, 0, 0.5],    // matches expected
        [120, 100, 0, 0.5],      // no match (small)
      ],
      G: [], Y: [], R: [],
    };
    const expected = { B: [100], G: [], Y: [], R: [] };
    const r = computePurityScore(peaks, expected, 1.0);
    // 10000 / 10100 ≈ 0.990
    expect(r.purity).toBeGreaterThan(0.98);
    expect(r.matches).toBe(1);
    expect(r.n).toBe(2);
  });

  it("does not cross dye channels (B peak at G's expected size is not counted)", () => {
    const peaks = { B: [[200, 1000, 0, 0.5]], G: [], Y: [], R: [] };
    const expected = { B: [], G: [200], Y: [], R: [] };
    const r = computePurityScore(peaks, expected, 1.0);
    expect(r.purity).toBe(0);
  });
});

describe("resolveDyeColor + palette integrity", () => {
  it("default palette matches the DYE constant", () => {
    // Default palette is the "baseline" colors the lab has been using; the
    // contract is that the default matches the original DYE[d].color values.
    expect(resolveDyeColor("B", "default").toLowerCase()).toBe("#1e6fdb");
    expect(resolveDyeColor("G", "default").toLowerCase()).toBe("#2e9e4a");
    expect(resolveDyeColor("Y", "default").toLowerCase()).toBe("#b8860b");
    expect(resolveDyeColor("R", "default").toLowerCase()).toBe("#d32f2f");
  });

  it("Wong palette returns the canonical Nature Methods colors", () => {
    expect(resolveDyeColor("B", "wong").toUpperCase()).toBe("#0072B2");
    expect(resolveDyeColor("G", "wong").toUpperCase()).toBe("#009E73");
  });

  it("unknown palette falls back to default (safety)", () => {
    expect(resolveDyeColor("B", "made-up")).toBe(resolveDyeColor("B", "default"));
  });

  it("every palette defines B, G, Y, R, O", () => {
    for (const name of Object.keys(DYE_PALETTES)) {
      for (const d of ["B", "G", "Y", "R", "O"]) {
        expect(typeof DYE_PALETTES[name][d]).toBe("string");
        expect(DYE_PALETTES[name][d]).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    }
  });
});
