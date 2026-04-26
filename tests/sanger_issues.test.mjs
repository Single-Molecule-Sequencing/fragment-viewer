// Tests for src/lib/sanger_issues.js — auto-detect anomaly detectors.

import { describe, it, expect } from "vitest";
import {
  detectMixedPeaks,
  detectLowSignal,
  detectQualityDips,
  detectNRuns,
  detectIssues,
  summarizeIssues,
} from "../src/lib/sanger_issues.js";

// Build a minimal sample shape for tests.
function makeSample({ basecalls, qScores, peakLocations, traces }) {
  return {
    sampleName: "test",
    basecalls: basecalls ?? "",
    qScores: qScores ?? [],
    peakLocations: peakLocations ?? [],
    traces: traces ?? { A: [], C: [], G: [], T: [] },
  };
}

describe("detectMixedPeaks", () => {
  it("flags positions where the secondary peak exceeds minRatio", () => {
    // 3 basecalls, all called A (highest A). Position 1 has a strong G shadow.
    const peaks = [10, 20, 30];
    const A = new Array(40).fill(0);
    const G = new Array(40).fill(0);
    A[10] = 1000; A[20] = 1000; A[30] = 1000;
    G[10] = 100;  G[20] = 600;  G[30] = 50;
    const sample = makeSample({
      basecalls: "AAA",
      qScores: [40, 40, 40],
      peakLocations: peaks,
      traces: { A, C: new Array(40), G, T: new Array(40) },
    });
    const issues = detectMixedPeaks(sample);
    expect(issues).toHaveLength(1);
    expect(issues[0].positionBp).toBe(1);
    expect(issues[0].metadata.calledBase).toBe("A");
    expect(issues[0].metadata.secondaryBase).toBe("G");
    expect(issues[0].metadata.ratio).toBeCloseTo(0.6, 2);
    expect(issues[0].severity).toBe("high");
  });

  it("ignores positions where signal is too weak overall", () => {
    const peaks = [10];
    const A = new Array(20); A[10] = 30;
    const G = new Array(20); G[10] = 25;  // 83% but absolute signal too low
    const sample = makeSample({
      basecalls: "A",
      peakLocations: peaks,
      traces: { A, C: new Array(20), G, T: new Array(20) },
    });
    expect(detectMixedPeaks(sample)).toEqual([]);
  });

  it("ignores N basecalls", () => {
    const peaks = [10];
    const sample = makeSample({
      basecalls: "N",
      peakLocations: peaks,
      traces: { A: new Array(20), C: new Array(20), G: new Array(20), T: new Array(20) },
    });
    expect(detectMixedPeaks(sample)).toEqual([]);
  });
});

describe("detectLowSignal", () => {
  it("flags a contiguous low-signal run ≥ window", () => {
    // 50 basecalls; 0..29 high signal, 30..49 zero signal.
    const peaks = Array.from({ length: 50 }, (_, i) => i * 10);
    const A = new Array(500);
    for (let i = 0; i < 30; i++) A[peaks[i]] = 1000;
    // peaks 30..49 → A=0
    const sample = makeSample({
      basecalls: "A".repeat(50),
      peakLocations: peaks,
      traces: { A, C: new Array(500), G: new Array(500), T: new Array(500) },
    });
    const issues = detectLowSignal(sample, { windowBp: 15 });
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].rangeBp[0]).toBe(30);
    expect(issues[0].rangeBp[1]).toBe(50);
  });

  it("does not flag short low-signal blips below windowBp", () => {
    const peaks = Array.from({ length: 30 }, (_, i) => i * 10);
    const A = new Array(300).fill(1000);
    for (let i = 0; i < 30; i++) A[peaks[i]] = 1000;
    A[peaks[10]] = 0; A[peaks[11]] = 0;  // 2-bp dip; below window of 15
    const sample = makeSample({
      basecalls: "A".repeat(30),
      peakLocations: peaks,
      traces: { A, C: new Array(300), G: new Array(300), T: new Array(300) },
    });
    expect(detectLowSignal(sample, { windowBp: 15 })).toEqual([]);
  });
});

describe("detectQualityDips", () => {
  it("flags a mid-read dip in Q-score", () => {
    // 80 bases, mostly Q40, with bases 30..50 dropping to Q5.
    const qScores = new Array(80).fill(40);
    for (let i = 30; i < 50; i++) qScores[i] = 5;
    const peaks = Array.from({ length: 80 }, (_, i) => i * 10);
    const sample = makeSample({
      basecalls: "A".repeat(80),
      qScores,
      peakLocations: peaks,
      traces: { A: new Array(800), C: [], G: [], T: [] },
    });
    const issues = detectQualityDips(sample, { window: 10, qDrop: 10, minSpan: 5 });
    expect(issues.length).toBeGreaterThanOrEqual(1);
    // The detected range should overlap with the actual dip [30,50).
    const detected = issues[0];
    expect(detected.rangeBp[1]).toBeGreaterThan(30);
    expect(detected.rangeBp[0]).toBeLessThan(50);
  });

  it("returns empty if read is too short", () => {
    expect(detectQualityDips(makeSample({ qScores: [40, 40], peakLocations: [10, 20] })))
      .toEqual([]);
  });
});

describe("detectNRuns", () => {
  it("flags a high-N density run", () => {
    // 30 bases; bases 10..25 are mostly N.
    const basecalls = "ACGTACGTAC" + "NNNNANNNNNNNNNNN" + "ACGT";
    const peaks = Array.from({ length: basecalls.length }, (_, i) => i * 10);
    const sample = makeSample({
      basecalls,
      peakLocations: peaks,
    });
    const issues = detectNRuns(sample, { window: 8, minDensity: 0.5, minRunBp: 8 });
    expect(issues.length).toBeGreaterThanOrEqual(1);
  });
});

describe("detectIssues + summarizeIssues", () => {
  it("returns sorted-by-severity flat list", () => {
    // Sample with both a mixed peak (high) and an N run (medium).
    const peaks = [10, 20, 30, 40, 50, 60];
    const A = new Array(100); A[10] = 1000; A[20] = 1000;
    const G = new Array(100); G[10] = 100; G[20] = 600;  // mixed peak high at idx 1
    const sample = makeSample({
      basecalls: "AAANNN",
      qScores: new Array(6).fill(40),
      peakLocations: peaks,
      traces: { A, C: new Array(100), G, T: new Array(100) },
    });
    const issues = detectIssues(sample, {
      nRuns: { window: 3, minDensity: 0.5, minRunBp: 3 },
      qualityDips: { minSpan: 100 },  // disable for this test
    });
    expect(issues.length).toBeGreaterThanOrEqual(1);
    // Highs come first.
    if (issues.length > 1) {
      const sevRanks = { high: 0, medium: 1, low: 2 };
      for (let i = 0; i < issues.length - 1; i++) {
        expect(sevRanks[issues[i].severity]).toBeLessThanOrEqual(sevRanks[issues[i + 1].severity]);
      }
    }
  });

  it("summarizeIssues counts by type + severity", () => {
    const fake = [
      { type: "mixed_peak", severity: "high" },
      { type: "mixed_peak", severity: "medium" },
      { type: "n_run", severity: "high" },
    ];
    const s = summarizeIssues(fake);
    expect(s.high).toBe(2);
    expect(s.medium).toBe(1);
    expect(s.byType.mixed_peak).toBe(2);
    expect(s.byType.n_run).toBe(1);
    expect(s.total).toBe(3);
  });
});
