// Tests for the multi-read analytics added to src/lib/sanger.js:
// computeCoverageDepth, findCoverageGaps, computeConsensus,
// computeQualityHistogram.

import { describe, it, expect } from "vitest";
import {
  computeCoverageDepth,
  findCoverageGaps,
  computeConsensus,
  computeQualityHistogram,
  scoreSangerVsReference,
} from "../src/lib/sanger.js";

// Helper: build a fake "score"-shaped object for a read that perfectly
// matches the reference at [start..end). No mismatches, no gaps.
function fakePerfectScore(reference, start, end) {
  const sub = reference.slice(start, end);
  return {
    identity: 1, matches: sub.length, mismatches: 0, gaps: 0,
    length: sub.length,
    targetStart: start, targetEnd: end, queryStart: 0, queryEnd: sub.length,
    alignedTarget: sub, alignedQuery: sub,
  };
}

describe("computeCoverageDepth", () => {
  it("returns zeros for no reads", () => {
    const d = computeCoverageDepth([], 10);
    expect(Array.from(d)).toEqual([0,0,0,0,0,0,0,0,0,0]);
  });

  it("counts each read at every ref position it covers", () => {
    const ref = "AAAAAAAAAA";
    const reads = [
      { score: fakePerfectScore(ref, 0, 5) },
      { score: fakePerfectScore(ref, 3, 8) },
    ];
    const d = computeCoverageDepth(reads, ref.length);
    // pos 0,1,2: read1 only (1)
    // pos 3,4: both reads (2)
    // pos 5,6,7: read2 only (1)
    // pos 8,9: nothing (0)
    expect(Array.from(d)).toEqual([1,1,1,2,2,1,1,1,0,0]);
  });

  it("does not count insertions (gap-in-target) toward reference coverage", () => {
    // Read inserts an extra base at ref pos 2: alignedTarget has "-" there.
    const score = {
      length: 6,
      targetStart: 0, targetEnd: 5, queryStart: 0, queryEnd: 6,
      alignedTarget: "AC-GTA",  // "-" = insertion in read
      alignedQuery:  "ACTGTA",
    };
    const d = computeCoverageDepth([{ score }], 5);
    // Walk: A C - G T A → ref positions 0,1,(skip),2,3,4 → all five covered once.
    expect(Array.from(d)).toEqual([1,1,1,1,1]);
  });

  it("counts deletions in read (gap-in-query) toward reference coverage", () => {
    // Read deletes ref pos 2: alignedQuery has "-" there.
    const score = {
      length: 5,
      targetStart: 0, targetEnd: 5, queryStart: 0, queryEnd: 4,
      alignedTarget: "ACGTA",
      alignedQuery:  "AC-TA",
    };
    const d = computeCoverageDepth([{ score }], 5);
    expect(Array.from(d)).toEqual([1,1,1,1,1]);
  });
});

describe("findCoverageGaps", () => {
  it("returns no gaps when fully covered", () => {
    expect(findCoverageGaps(new Uint16Array([1,1,1,1]))).toEqual([]);
  });

  it("finds a single internal gap", () => {
    expect(findCoverageGaps(new Uint16Array([2,2,0,0,1,1])))
      .toEqual([{ start: 2, end: 4 }]);
  });

  it("finds gaps at start and end", () => {
    expect(findCoverageGaps(new Uint16Array([0,0,1,1,0])))
      .toEqual([{ start: 0, end: 2 }, { start: 4, end: 5 }]);
  });
});

describe("computeConsensus", () => {
  it("perfect agreement produces the reference back", () => {
    const ref = "ACGTACGTAC";
    const reads = [
      { name: "r1", score: fakePerfectScore(ref, 0, 5) },
      { name: "r2", score: fakePerfectScore(ref, 5, 10) },
    ];
    const out = computeConsensus(reads, ref);
    expect(out.consensusSeq).toBe(ref);
    expect(out.uncertainty).toEqual([]);
    expect(out.gaps).toEqual([]);
  });

  it("uncovered positions fall back to lowercase reference (gapAsLowercase=true default)", () => {
    const ref = "ACGTACGTAC";
    const reads = [{ name: "r1", score: fakePerfectScore(ref, 0, 5) }];
    const out = computeConsensus(reads, ref);
    // Positions 0..4 covered → uppercase ref; 5..9 uncovered → lowercase ref.
    expect(out.consensusSeq).toBe("ACGTAcgtac");
    expect(out.gaps).toEqual([{ start: 5, end: 10 }]);
  });

  it("flags positions where reads disagree as uncertainty", () => {
    const ref = "ACGT";
    // Two reads, both covering pos 0..3, but read2 mutates pos 1.
    const reads = [
      { name: "r1", score: { length: 4, targetStart: 0, targetEnd: 4, alignedTarget: "ACGT", alignedQuery: "ACGT" } },
      { name: "r2", score: { length: 4, targetStart: 0, targetEnd: 4, alignedTarget: "ACGT", alignedQuery: "ATGT" } },
    ];
    const out = computeConsensus(reads, ref);
    // Tie between C (1 vote) and T (1 vote) at pos 1 → "N".
    expect(out.consensusSeq[1]).toBe("N");
    expect(out.uncertainty.find(u => u.pos === 1)).toBeDefined();
    expect(out.uncertainty[0].votes.map(v => v.base).sort()).toEqual(["C", "T"]);
  });

  it("majority wins when one read disagrees", () => {
    const ref = "ACGT";
    const reads = [
      { name: "r1", score: { length: 4, targetStart: 0, targetEnd: 4, alignedTarget: "ACGT", alignedQuery: "ACGT" } },
      { name: "r2", score: { length: 4, targetStart: 0, targetEnd: 4, alignedTarget: "ACGT", alignedQuery: "ACGT" } },
      { name: "r3", score: { length: 4, targetStart: 0, targetEnd: 4, alignedTarget: "ACGT", alignedQuery: "ATGT" } },
    ];
    const out = computeConsensus(reads, ref);
    expect(out.consensusSeq).toBe("ACGT");
    expect(out.uncertainty.find(u => u.pos === 1)).toBeDefined();
  });
});

describe("computeQualityHistogram", () => {
  it("returns empty stats for empty input", () => {
    expect(computeQualityHistogram([])).toEqual({ bins: [], max: 0, mean: 0, median: 0, total: 0 });
    expect(computeQualityHistogram(null)).toEqual({ bins: [], max: 0, mean: 0, median: 0, total: 0 });
  });

  it("counts per-Q bins and computes mean / median", () => {
    // Lower-median convention for even n: the function returns the bin
    // where cumulative count first crosses total/2. With 6 values, that's
    // the 3rd entry (Q=20).
    const out = computeQualityHistogram([20, 20, 20, 30, 30, 40]);
    expect(out.bins[20]).toBe(3);
    expect(out.bins[30]).toBe(2);
    expect(out.bins[40]).toBe(1);
    expect(out.max).toBe(40);
    expect(out.mean).toBeCloseTo(160 / 6, 4);
    expect(out.median).toBe(20);
    expect(out.total).toBe(6);
  });

  it("integrates with scoreSangerVsReference output (smoke check)", () => {
    const ref = "A".repeat(40);
    const parsed = { basecalls: ref, qScores: new Array(40).fill(40) };
    const r = scoreSangerVsReference(parsed, ref);
    const hist = computeQualityHistogram(parsed.qScores);
    expect(r.identity).toBe(1);
    expect(hist.median).toBe(40);
  });
});
