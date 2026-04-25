// Tests for src/lib/snapgene.js writeSnapgene — round-trip with parseSnapgene.

import { describe, it, expect } from "vitest";
import { parseSnapgene, writeSnapgene } from "../src/lib/snapgene.js";

describe("writeSnapgene", () => {
  it("produces a buffer that parseSnapgene round-trips byte-for-byte", () => {
    const seq = "ACGTACGTACGTACGTACGT";
    const buf = writeSnapgene({ sequence: seq, isCircular: false });
    const parsed = parseSnapgene(buf);
    expect(parsed.sequence).toBe(seq);
    expect(parsed.length).toBe(seq.length);
    expect(parsed.isCircular).toBe(false);
    expect(parsed.features).toEqual([]);
  });

  it("preserves circular topology", () => {
    const buf = writeSnapgene({ sequence: "AAAATTTT", isCircular: true });
    expect(parseSnapgene(buf).isCircular).toBe(true);
  });

  it("preserves a custom topology byte (e.g., methylation flags)", () => {
    // Bit 1 set = Dam methylation, bit 0 clear = linear.
    const buf = writeSnapgene({ sequence: "ACGT", topologyByte: 0x02 });
    const parsed = parseSnapgene(buf);
    expect(parsed.topologyByte).toBe(0x02);
    expect(parsed.isCircular).toBe(false);
  });

  it("upper-cases the sequence on write (canonical representation)", () => {
    const buf = writeSnapgene({ sequence: "acgtacgt" });
    expect(parseSnapgene(buf).sequence).toBe("ACGTACGT");
  });

  it("round-trips features with coordinate conversion", () => {
    const features = [
      { name: "promoter", type: "promoter", start: 99, end: 150, strand: 1, color: "#993366" },
      { name: "term",     type: "terminator", start: 199, end: 220, strand: -1, color: "#cccccc" },
    ];
    const buf = writeSnapgene({ sequence: "A".repeat(300), features });
    const parsed = parseSnapgene(buf);
    expect(parsed.features).toHaveLength(2);
    expect(parsed.features[0]).toMatchObject({
      name: "promoter", type: "promoter", start: 99, end: 150, strand: 1, color: "#993366",
    });
    expect(parsed.features[1]).toMatchObject({
      name: "term", strand: -1, start: 199, end: 220,
    });
  });

  it("escapes XML-unsafe characters in feature names", () => {
    const features = [{ name: "5'-UTR & <stuff>", type: "misc_feature", start: 0, end: 10, strand: 0 }];
    const buf = writeSnapgene({ sequence: "A".repeat(20), features });
    const parsed = parseSnapgene(buf);
    expect(parsed.features[0].name).toBe("5'-UTR & <stuff>");
  });

  it("accepts feature_type alias for cross-language interop with the Python writer", () => {
    const features = [{ name: "x", feature_type: "CDS", start: 0, end: 9, strand: 1 }];
    const buf = writeSnapgene({ sequence: "A".repeat(15), features });
    const parsed = parseSnapgene(buf);
    expect(parsed.features[0].type).toBe("CDS");
  });

  it("rejects non-string sequence input", () => {
    expect(() => writeSnapgene({ sequence: null })).toThrow(TypeError);
    expect(() => writeSnapgene({})).toThrow(TypeError);
  });
});
