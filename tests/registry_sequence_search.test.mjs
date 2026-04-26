// Tests for src/lib/registry_sequence_search.js — primer/construct
// search by DNA query, with reverse-complement and substring handling.

import { describe, it, expect } from "vitest";
import {
  reverseComplement,
  normalizeDna,
  searchPrimersBySequence,
  annotateHitsWithConstructs,
} from "../src/lib/registry_sequence_search.js";

const PR1 = { id: "PR1", sequence: "ACGTACGTACGTACGTACGT" }; // 20 nt
const PR2 = { id: "PR2", sequence: "TTTTGGGGAAAACCCCAAAA" };
const PR3 = { id: "PR3", sequence: "GCATGCATGCATGCATGCAT" };

describe("reverseComplement", () => {
  it("complements and reverses a simple sequence", () => {
    expect(reverseComplement("ACGT")).toBe("ACGT");
    expect(reverseComplement("AAAA")).toBe("TTTT");
    expect(reverseComplement("ATCG")).toBe("CGAT");
  });

  it("preserves N", () => {
    expect(reverseComplement("ACNGT")).toBe("ACNGT");
  });
});

describe("normalizeDna", () => {
  it("uppercases and strips whitespace and digits", () => {
    expect(normalizeDna(" acgt 12 \nacgt ")).toBe("ACGTACGT");
  });

  it("returns empty for null/undefined/empty", () => {
    expect(normalizeDna(null)).toBe("");
    expect(normalizeDna(undefined)).toBe("");
    expect(normalizeDna("")).toBe("");
  });

  it("strips FASTA headers, keeping sequence", () => {
    expect(normalizeDna(">PR1 forward\nACGTACGT")).toBe("ACGTACGT");
  });

  it("maps non-ACGT letters to N", () => {
    expect(normalizeDna("ACGTYR")).toBe("ACGTNN");
  });
});

describe("searchPrimersBySequence", () => {
  const primers = [PR1, PR2, PR3];

  it("returns empty for queries shorter than minLen", () => {
    expect(searchPrimersBySequence("ACG", primers)).toEqual([]);
  });

  it("returns empty for empty input", () => {
    expect(searchPrimersBySequence("", primers)).toEqual([]);
    expect(searchPrimersBySequence(null, primers)).toEqual([]);
  });

  it("finds an exact forward match", () => {
    const hits = searchPrimersBySequence(PR1.sequence, primers);
    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe("exact");
    expect(hits[0].orientation).toBe("fwd");
    expect(hits[0].primer.id).toBe("PR1");
  });

  it("finds an exact reverse-complement match", () => {
    const hits = searchPrimersBySequence(reverseComplement(PR2.sequence), primers);
    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe("exact");
    expect(hits[0].orientation).toBe("rev");
    expect(hits[0].primer.id).toBe("PR2");
  });

  it("finds query-in-primer when query is a substring of a primer", () => {
    // Use a non-repetitive primer so indexOf gives a unique offset.
    const PR_UNIQUE = { id: "PR_UNIQUE", sequence: "AAACGTGTACGGCATTCGGT" };
    const partial = PR_UNIQUE.sequence.slice(4, 16); // "CGTGTACGGCAT"
    const hits = searchPrimersBySequence(partial, [PR_UNIQUE]);
    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe("query-in-primer");
    expect(hits[0].primerStart).toBe(4);
    expect(hits[0].primerEnd).toBe(16);
  });

  it("finds primer-in-query when primer is a substring of a longer query", () => {
    const longRegion = "GGGG" + PR1.sequence + "TTTT"; // 28 nt, contains PR1
    const hits = searchPrimersBySequence(longRegion, primers);
    const pr1Hit = hits.find((h) => h.primer.id === "PR1");
    expect(pr1Hit).toBeDefined();
    expect(pr1Hit.kind).toBe("primer-in-query");
    expect(pr1Hit.queryStart).toBe(4);
    expect(pr1Hit.queryEnd).toBe(4 + PR1.sequence.length);
  });

  it("finds primer-in-query in reverse orientation with correct query coords", () => {
    // Query is a longer region whose REVCOMP contains PR2.
    const longRev = "AAAA" + reverseComplement(PR2.sequence) + "CCCC"; // 28 nt
    const hits = searchPrimersBySequence(longRev, primers);
    const pr2Hit = hits.find((h) => h.primer.id === "PR2");
    expect(pr2Hit).toBeDefined();
    expect(pr2Hit.kind).toBe("primer-in-query");
    expect(pr2Hit.orientation).toBe("rev");
    // PR2 sits at position 4 in the revcomp; in fwd query coords that's
    // the symmetric position from the end.
    expect(pr2Hit.queryStart).toBe(longRev.length - 4 - PR2.sequence.length);
    expect(pr2Hit.queryEnd).toBe(longRev.length - 4);
  });

  it("ranks exact matches above containment matches", () => {
    // Query exactly matches PR1, AND is contained by a hypothetical
    // longer primer; here we just verify the ordering rule by combining
    // an exact and a containment hit.
    const longerPrimer = { id: "PR_LONG", sequence: "AA" + PR1.sequence + "TT" };
    const hits = searchPrimersBySequence(PR1.sequence, [PR1, longerPrimer]);
    expect(hits[0].primer.id).toBe("PR1"); // exact
    expect(hits[0].kind).toBe("exact");
    expect(hits[1].primer.id).toBe("PR_LONG");
    expect(hits[1].kind).toBe("query-in-primer");
  });

  it("ignores primers with no sequence field", () => {
    const hits = searchPrimersBySequence(PR1.sequence, [PR1, { id: "GHOST" }]);
    expect(hits).toHaveLength(1);
    expect(hits[0].primer.id).toBe("PR1");
  });

  it("tolerates messy input (whitespace, FASTA, lowercase)", () => {
    const messy = `>my pasted thing\n${PR1.sequence.toLowerCase()}\n`;
    const hits = searchPrimersBySequence(messy, primers);
    expect(hits[0].primer.id).toBe("PR1");
    expect(hits[0].kind).toBe("exact");
  });
});

describe("annotateHitsWithConstructs", () => {
  const primerSets = [
    { id: "ps1", members: ["PR1", "PR3"] },
    { id: "ps2", members: ["PR2"] },
    { id: "ps3", members: ["PR1"] }, // PR1 in two sets
  ];
  const constructs = [
    { id: "C_alpha", primer_set: "ps1" },
    { id: "C_beta", primer_set: "ps2" },
    { id: "C_gamma", primer_set: "ps3" },
    { id: "C_orphan" }, // no primer_set
  ];

  it("links a primer to all constructs that share its primer set", () => {
    const hits = searchPrimersBySequence(PR1.sequence, [PR1]);
    const annotated = annotateHitsWithConstructs(hits, primerSets, constructs);
    expect(annotated).toHaveLength(1);
    const h = annotated[0];
    expect(h.linkedPrimerSetIds.sort()).toEqual(["ps1", "ps3"]);
    expect(h.linkedConstructIds.sort()).toEqual(["C_alpha", "C_gamma"]);
  });

  it("returns empty link arrays when the primer is in no set", () => {
    const orphanPrimer = { id: "PR_ORPHAN", sequence: "ACGTACGTACGTACGTACGT" };
    const hits = searchPrimersBySequence(orphanPrimer.sequence, [orphanPrimer]);
    const annotated = annotateHitsWithConstructs(hits, primerSets, constructs);
    expect(annotated[0].linkedPrimerSetIds).toEqual([]);
    expect(annotated[0].linkedConstructIds).toEqual([]);
  });

  it("deduplicates construct ids when multiple sets point to the same construct", () => {
    // Build a scenario where PR1's two sets both pick the same construct.
    const ps = [
      { id: "ps1", members: ["PR1"] },
      { id: "ps2", members: ["PR1"] },
    ];
    const cs = [
      { id: "C_X", primer_set: "ps1" },
      { id: "C_X", primer_set: "ps2" }, // same id (synthetic edge case)
    ];
    const hits = searchPrimersBySequence(PR1.sequence, [PR1]);
    const annotated = annotateHitsWithConstructs(hits, ps, cs);
    // C_X may appear twice in the underlying flatMap, dedup brings it to 1.
    expect(annotated[0].linkedConstructIds).toEqual(["C_X"]);
  });
});
