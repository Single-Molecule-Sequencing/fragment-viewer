// Unit tests for src/lib/sanger.js. Mirrors the analytics behavior of
// golden-gate/lib/qc/sanger.py — same Mott trim algorithm, same scoring
// defaults, same identity/mismatch/gap accounting — so cross-tool numbers
// are stable across the JS viewer and the Python QC pipeline.

import { describe, it, expect } from "vitest";
import {
  mottTrim,
  localAlign,
  enumerateMismatches,
  scoreSangerVsReference,
} from "../src/lib/sanger.js";

// ----------------------------------------------------------------------
// Mott trim
// ----------------------------------------------------------------------

describe("mottTrim", () => {
  it("returns {0,0} on empty input", () => {
    expect(mottTrim([])).toEqual({ start: 0, end: 0 });
    expect(mottTrim(null)).toEqual({ start: 0, end: 0 });
  });

  it("returns {0,0} when no window scores positive", () => {
    expect(mottTrim([5, 5, 5, 5], 20)).toEqual({ start: 0, end: 0 });
  });

  it("trims low-quality flanks of a high-quality middle", () => {
    // Q-cutoff 20: outer 5s contribute -15, inner 30s contribute +10.
    const q = [5, 5, 30, 30, 30, 30, 5, 5];
    const { start, end } = mottTrim(q, 20);
    expect(start).toBe(2);
    expect(end).toBe(6);
  });

  it("keeps the full window when everything is well above cutoff", () => {
    const q = [40, 40, 40, 40];
    expect(mottTrim(q, 20)).toEqual({ start: 0, end: 4 });
  });

  it("recovers from brief mid-read Q-dips", () => {
    // A short low-Q dip in the middle shouldn't truncate the read.
    const q = [40, 40, 40, 5, 40, 40, 40];
    const { start, end } = mottTrim(q, 20);
    expect(start).toBe(0);
    expect(end).toBe(7);
  });
});

// ----------------------------------------------------------------------
// Local alignment
// ----------------------------------------------------------------------

describe("localAlign", () => {
  it("perfect match yields identity=1 with the right ranges", () => {
    // First ACGT starts at index 2 of "AAACGTACGTACGTAAA" (the third A is part
    // of the match path; A also matches the query's leading-A neighborhood
    // ambiguously, but Smith-Waterman picks the longest contiguous run).
    const ref = "XXACGTACGTACGTYY";
    const query = "ACGTACGTACGT";
    const aln = localAlign(query, ref);
    expect(aln.identity).toBe(1);
    expect(aln.matches).toBe(12);
    expect(aln.mismatches).toBe(0);
    expect(aln.gaps).toBe(0);
    expect(aln.length).toBe(12);
    expect(aln.targetStart).toBe(2);
    expect(aln.targetEnd).toBe(14);
  });

  it("counts a single substitution as one mismatch", () => {
    const ref = "ACGTACGTACGT";
    const query = "ACGTAGGTACGT"; // ACGT-G-GTACGT (mismatch at pos 5: C→G)
    const aln = localAlign(query, ref);
    expect(aln.matches).toBe(11);
    expect(aln.mismatches).toBe(1);
    expect(aln.gaps).toBe(0);
  });

  it("returns empty alignment for empty inputs", () => {
    const aln = localAlign("", "ACGT");
    expect(aln.length).toBe(0);
    expect(aln.identity).toBe(0);
  });

  it("ignores flanking unmatched query bases (local mode)", () => {
    const ref = "ACGTACGT";
    const query = "GGGACGTACGTGGG"; // GGG flanks not present in ref
    const aln = localAlign(query, ref);
    expect(aln.matches).toBe(8);
    expect(aln.mismatches).toBe(0);
    expect(aln.gaps).toBe(0);
    expect(aln.targetStart).toBe(0);
    expect(aln.targetEnd).toBe(8);
  });
});

// ----------------------------------------------------------------------
// Mismatch enumeration
// ----------------------------------------------------------------------

describe("enumerateMismatches", () => {
  it("emits no entries for a perfect alignment", () => {
    const aln = localAlign("ACGTACGT", "ACGTACGT");
    expect(enumerateMismatches(aln)).toEqual([]);
  });

  it("records position 0-based in the reference", () => {
    const aln = localAlign("ACGTACTT", "ACGTACGT"); // mismatch at ref pos 6 (G→T)
    const list = enumerateMismatches(aln);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ position: 6, refBase: "G", queryBase: "T", kind: "mismatch" });
  });
});

// ----------------------------------------------------------------------
// scoreSangerVsReference (one-shot analyzer)
// ----------------------------------------------------------------------

describe("scoreSangerVsReference", () => {
  it("PASS verdict on a clean read at default thresholds", () => {
    const ref = "ACGTACGTACGTACGTACGT";
    const parsed = {
      basecalls: ref,
      qScores: new Array(ref.length).fill(40),
    };
    const r = scoreSangerVsReference(parsed, ref);
    expect(r.verdict).toBe("pass");
    expect(r.identity).toBe(1);
    expect(r.matches).toBe(ref.length);
    expect(r.mismatchList).toEqual([]);
  });

  it("FAIL verdict when the entire read is below cutoff", () => {
    const ref = "ACGTACGTACGTACGTACGT";
    const parsed = {
      basecalls: ref,
      qScores: new Array(ref.length).fill(5), // never crosses Q=20
    };
    const r = scoreSangerVsReference(parsed, ref);
    expect(r.verdict).toBe("fail");
    expect(r.summary).toMatch(/no bases survive/);
  });

  it("WARN verdict at intermediate identity", () => {
    // Construct: 100 bp ref, 100 bp read with 4 mismatches → 96% identity.
    // Defaults: pass>=0.99, warn>=0.95 → this should land in WARN.
    const ref = "ACGT".repeat(25); // 100 bp
    const mutated = ref.split("");
    for (const i of [10, 30, 50, 70]) {
      mutated[i] = mutated[i] === "A" ? "T" : "A";
    }
    const parsed = {
      basecalls: mutated.join(""),
      qScores: new Array(ref.length).fill(40),
    };
    const r = scoreSangerVsReference(parsed, ref);
    expect(r.verdict).toBe("warn");
    expect(r.mismatches).toBe(4);
  });
});
