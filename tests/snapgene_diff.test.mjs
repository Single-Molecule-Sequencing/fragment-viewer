// Tests for src/lib/snapgene_diff.js — comparing two SnapGene .dna files.

import { describe, it, expect } from "vitest";
import { diffSnapgene } from "../src/lib/snapgene_diff.js";

describe("diffSnapgene sequence diff", () => {
  it("identical sequences → identity 1, no edits", () => {
    const a = { sequence: "ACGTACGTACGT", isCircular: false, features: [] };
    const b = { sequence: "ACGTACGTACGT", isCircular: false, features: [] };
    const d = diffSnapgene(a, b);
    expect(d.sequenceDiff.identity).toBe(1);
    expect(d.sequenceDiff.identical).toBe(true);
  });

  it("single substitution shows up as one edit", () => {
    const a = { sequence: "ACGTACGTACGT", isCircular: false, features: [] };
    const b = { sequence: "ACGTAGGTACGT", isCircular: false, features: [] };  // pos 5: C→G
    const d = diffSnapgene(a, b);
    expect(d.sequenceDiff.identical).toBe(false);
    const subs = d.sequenceDiff.edits.filter(e => e.kind === "substitution");
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({ baseA: "C", baseB: "G" });
  });

  it("topology change is flagged", () => {
    const a = { sequence: "ACGT", isCircular: true, features: [] };
    const b = { sequence: "ACGT", isCircular: false, features: [] };
    const d = diffSnapgene(a, b);
    expect(d.topology.changed).toBe(true);
    expect(d.topology.a).toBe(true);
    expect(d.topology.b).toBe(false);
  });

  it("very large sequences are flagged tooLargeToAlign instead of attempted", () => {
    const big = "A".repeat(100_000);
    const a = { sequence: big, isCircular: false, features: [] };
    const b = { sequence: big.replace(/^.{50000}A/, "T"), isCircular: false, features: [] };
    const d = diffSnapgene(a, b, { maxAlignLen: 50_000 });
    expect(d.sequenceDiff.tooLargeToAlign).toBe(true);
  });
});

describe("diffSnapgene feature diff", () => {
  it("identical feature sets → bothMatched only", () => {
    const features = [
      { name: "promoter", type: "promoter", start: 10, end: 50, strand: 1, color: "#abc" },
      { name: "cds", type: "CDS", start: 100, end: 500, strand: 1 },
    ];
    const a = { sequence: "A".repeat(600), isCircular: false, features };
    const b = { sequence: "A".repeat(600), isCircular: false, features };
    const d = diffSnapgene(a, b);
    expect(d.featureDiff.onlyInA).toEqual([]);
    expect(d.featureDiff.onlyInB).toEqual([]);
    expect(d.featureDiff.bothMatched).toHaveLength(2);
    expect(d.featureDiff.bothMatched.every(m => m.exact)).toBe(true);
  });

  it("feature added in B → onlyInB", () => {
    const a = { sequence: "A".repeat(100), isCircular: false, features: [] };
    const b = { sequence: "A".repeat(100), isCircular: false, features: [
      { name: "new", type: "misc_feature", start: 10, end: 30, strand: 1 },
    ] };
    const d = diffSnapgene(a, b);
    expect(d.featureDiff.onlyInB).toHaveLength(1);
    expect(d.featureDiff.onlyInA).toHaveLength(0);
    expect(d.featureDiff.bothMatched).toHaveLength(0);
  });

  it("feature with shifted coords matches fuzzily by name+type", () => {
    const a = { sequence: "A".repeat(100), isCircular: false, features: [
      { name: "p", type: "promoter", start: 10, end: 30, strand: 1 },
    ] };
    const b = { sequence: "A".repeat(100), isCircular: false, features: [
      { name: "p", type: "promoter", start: 12, end: 32, strand: 1 },
    ] };
    const d = diffSnapgene(a, b);
    expect(d.featureDiff.bothMatched).toHaveLength(1);
    expect(d.featureDiff.bothMatched[0].exact).toBe(false);
  });
});
