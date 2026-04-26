// Tests for src/lib/sequence_analyses.js — restriction sites, ORFs, GC.

import { describe, it, expect } from "vitest";
import {
  reverseComplement,
  findRecognitionSites,
  findEnzymeSites,
  findOrfs,
  gcComposition,
  overallGc,
  ENZYME_CATALOG,
} from "../src/lib/sequence_analyses.js";

describe("reverseComplement", () => {
  it("complements ACGT", () => {
    expect(reverseComplement("ACGT")).toBe("ACGT");
    expect(reverseComplement("AAAA")).toBe("TTTT");
    expect(reverseComplement("ACGGT")).toBe("ACCGT");
  });
  it("preserves N", () => {
    expect(reverseComplement("NACG")).toBe("CGTN");
  });
});

describe("findRecognitionSites", () => {
  it("finds forward-strand BsaI sites", () => {
    const seq = "AAAGGTCTCAAAA";
    const sites = findRecognitionSites(seq, "GGTCTC");
    expect(sites).toEqual([{ start: 3, end: 9, strand: 1 }]);
  });

  it("finds reverse-complement BsaI sites", () => {
    // GGTCTC reverse-complement = GAGACC
    const seq = "AAAGAGACCAAAA";
    const sites = findRecognitionSites(seq, "GGTCTC");
    expect(sites).toEqual([{ start: 3, end: 9, strand: -1 }]);
  });

  it("does not double-count palindromic sites", () => {
    // EcoRI (GAATTC) is its own reverse complement.
    const seq = "AAAGAATTCAAAA";
    const sites = findRecognitionSites(seq, "GAATTC");
    expect(sites).toHaveLength(1);
    expect(sites[0].strand).toBe(1);
  });

  it("finds multiple sites and sorts by position", () => {
    const seq = "GGTCTCNNNNNNNGAGACC";  // forward at 0, reverse at 13
    const sites = findRecognitionSites(seq, "GGTCTC");
    expect(sites).toEqual([
      { start: 0, end: 6, strand: 1 },
      { start: 13, end: 19, strand: -1 },
    ]);
  });

  it("returns empty for empty inputs", () => {
    expect(findRecognitionSites("", "GAATTC")).toEqual([]);
    expect(findRecognitionSites("ACGT", "")).toEqual([]);
  });
});

describe("findEnzymeSites", () => {
  it("finds all BsaI/BsmBI/EcoRI in a synthetic sequence", () => {
    // BsaI(GGTCTC) at 0; EcoRI(GAATTC) at 10; BsmBI(CGTCTC) reverse(GAGACG) at 20.
    const seq = "GGTCTCAAAA" + "GAATTCAAAA" + "GAGACGAAAA";
    const hits = findEnzymeSites(seq);
    const names = hits.map(h => `${h.enzyme}@${h.start}/${h.strand}`);
    expect(names).toContain("BsaI@0/1");
    expect(names).toContain("EcoRI@10/1");
    expect(names).toContain("BsmBI@20/-1");
  });

  it("flags Type-IIS hits with isTypeIIS", () => {
    const seq = "GGTCTC" + "GAATTC";
    const hits = findEnzymeSites(seq);
    const bsa = hits.find(h => h.enzyme === "BsaI");
    const eco = hits.find(h => h.enzyme === "EcoRI");
    expect(bsa.isTypeIIS).toBe(true);
    expect(eco.isTypeIIS).toBe(false);
  });

  it("can take a custom enzyme list", () => {
    const seq = "GAATTC";
    const hits = findEnzymeSites(seq, [{ name: "Custom", recognition: "AATT", isTypeIIS: false }]);
    expect(hits.find(h => h.enzyme === "Custom")).toBeDefined();
  });
});

describe("findOrfs", () => {
  it("finds an ATG-to-stop ORF on the forward strand", () => {
    // ATG GCG TAA = M A * → 2 codons before stop, length 2.
    // Need ≥50 by default; lower the threshold for testing.
    const seq = "ATGGCGTAA";
    const orfs = findOrfs(seq, { minLengthAa: 1 });
    const fwd = orfs.find(o => o.strand === 1);
    expect(fwd).toBeDefined();
    expect(fwd.start).toBe(0);
    expect(fwd.end).toBe(9);
    expect(fwd.lengthAa).toBe(2);
  });

  it("finds reverse-strand ORFs", () => {
    // Reverse complement of ATGGCGTAA is TTACGCCAT — an ORF on the reverse
    // strand of TTACGCCAT, but the input here is its rc, so put it as-is.
    const seq = "TTACGCCAT";
    const orfs = findOrfs(seq, { minLengthAa: 1 });
    const rev = orfs.find(o => o.strand === -1);
    expect(rev).toBeDefined();
  });

  it("ignores ORFs shorter than minLengthAa", () => {
    const seq = "ATGTAA";  // 1-codon ORF (M-stop), length 1
    const orfs = findOrfs(seq, { minLengthAa: 50 });
    expect(orfs).toEqual([]);
  });

  it("sorts results by length descending", () => {
    // Two ORFs in the same sequence of different lengths.
    const longOrf = "ATG" + "GCG".repeat(60) + "TAA";
    const shortOrf = "ATG" + "GCG".repeat(10) + "TAA";
    const seq = longOrf + "NNN" + shortOrf;
    const orfs = findOrfs(seq, { minLengthAa: 5 });
    expect(orfs.length).toBeGreaterThanOrEqual(2);
    expect(orfs[0].lengthAa).toBeGreaterThan(orfs[1].lengthAa);
  });
});

describe("gcComposition + overallGc", () => {
  it("overallGc returns 0 for empty input", () => {
    expect(overallGc("")).toBe(0);
  });

  it("overallGc counts G + C only", () => {
    expect(overallGc("AAAA")).toBe(0);
    expect(overallGc("GGGG")).toBe(1);
    expect(overallGc("ACGT")).toBeCloseTo(0.5, 4);
  });

  it("gcComposition returns one value per position", () => {
    const seq = "ACGTACGTACGT";
    const gc = gcComposition(seq, 4);
    expect(gc).toHaveLength(seq.length);
    // Every value should be in [0, 1].
    for (let i = 0; i < gc.length; i++) {
      expect(gc[i]).toBeGreaterThanOrEqual(0);
      expect(gc[i]).toBeLessThanOrEqual(1);
    }
  });

  it("gcComposition centered window matches overallGc when window covers all", () => {
    const seq = "AAGGCCTT";  // 4/8 = 0.5 GC
    const gc = gcComposition(seq, 100);  // window much larger than seq
    // With a window larger than seq, every position sees the same fraction.
    expect(gc[0]).toBeCloseTo(0.5, 4);
    expect(gc[gc.length - 1]).toBeCloseTo(0.5, 4);
  });
});

describe("findPrimerMatches", () => {
  it("finds an exact forward primer match", async () => {
    const { findPrimerMatches } = await import("../src/lib/sequence_analyses.js");
    // ACGTACGT first occurs at target[3:11].
    const target = "AAAACGTACGTAAA";
    const matches = findPrimerMatches("ACGTACGT", target, { maxMismatches: 0 });
    expect(matches.find(m => m.start === 3 && m.strand === 1 && m.mismatches === 0)).toBeDefined();
  });
  it("finds a reverse-strand primer match", async () => {
    const { findPrimerMatches } = await import("../src/lib/sequence_analyses.js");
    // Primer ACGT — RC = ACGT (palindrome). Use AAAACC (RC=GGTTTT)
    // primer = AAAACC; target contains GGTTTT.
    const target = "NNNNNNGGTTTTNNNN";
    const matches = findPrimerMatches("AAAACC", target, { maxMismatches: 0 });
    expect(matches.find(m => m.strand === -1)).toBeDefined();
  });
  it("tolerates up to maxMismatches", async () => {
    const { findPrimerMatches } = await import("../src/lib/sequence_analyses.js");
    // Primer ACGTAC; target has ACGTGC (1 mm) at pos 5.
    const target = "NNNNNACGTGCNNNNN";
    const matches = findPrimerMatches("ACGTAC", target, { maxMismatches: 1 });
    expect(matches.find(m => m.start === 5 && m.mismatches === 1)).toBeDefined();
  });
});

describe("parseMultiFasta", () => {
  it("parses two records", async () => {
    const { parseMultiFasta } = await import("../src/lib/sequence_analyses.js");
    const text = ">PS1 forward\nACGTACGT\nACGT\n>PS2 reverse\nGGGGCCCC";
    const out = parseMultiFasta(text);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ name: "PS1 forward", sequence: "ACGTACGTACGT" });
    expect(out[1]).toMatchObject({ name: "PS2 reverse", sequence: "GGGGCCCC" });
  });
  it("ignores trailing blank lines and CR endings", async () => {
    const { parseMultiFasta } = await import("../src/lib/sequence_analyses.js");
    const out = parseMultiFasta(">a\r\nACGT\r\n\r\n>b\r\nTGCA\r\n");
    expect(out).toHaveLength(2);
  });
});

describe("ENZYME_CATALOG sanity", () => {
  it("has BsaI and BsmBI as Type-IIS Golden Gate enzymes", () => {
    const bsa = ENZYME_CATALOG.find(e => e.name === "BsaI");
    const bsmb = ENZYME_CATALOG.find(e => e.name === "BsmBI");
    expect(bsa.isTypeIIS).toBe(true);
    expect(bsa.recognition).toBe("GGTCTC");
    expect(bsmb.isTypeIIS).toBe(true);
    expect(bsmb.recognition).toBe("CGTCTC");
  });
});
