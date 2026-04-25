// Unit tests for src/lib/snapgene.js. Mirrors the Python suite in
// golden-gate/tests/test_gg_qc_snapgene.py — same synthetic round-trip,
// same invalid-cookie + truncated-payload rejection, same feature
// coordinate conversions (SnapGene 1-based inclusive → 0-based exclusive end).

import { describe, it, expect } from "vitest";
import { parseSnapgene, SnapGeneFormatError } from "../src/lib/snapgene.js";

// ----------------------------------------------------------------------
// Helpers — synthesize a minimal valid .dna byte stream
// ----------------------------------------------------------------------

function ascii(s) {
  const buf = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) buf[i] = s.charCodeAt(i);
  return buf;
}

function concat(...arrs) {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

function u32be(n) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, false);
  return b;
}

function makeSegment(id, payload) {
  return concat(new Uint8Array([id]), u32be(payload.length), payload);
}

function makeDna({ sequence, circular = false, featuresXml = null } = {}) {
  const cookie = makeSegment(0x09, ascii("SnapGene\x00\x01\x00\x0f\x00\x14"));
  const topology = new Uint8Array([circular ? 0x01 : 0x00]);
  const seqSeg = makeSegment(0x00, concat(topology, ascii(sequence)));
  const featSeg = featuresXml ? makeSegment(0x0a, ascii(featuresXml)) : new Uint8Array(0);
  return concat(cookie, seqSeg, featSeg);
}

// ----------------------------------------------------------------------
// Tests
// ----------------------------------------------------------------------

describe("parseSnapgene", () => {
  it("round-trips a linear sequence", () => {
    const seq = "ACGTACGTACGT";
    const buf = makeDna({ sequence: seq, circular: false });
    const f = parseSnapgene(buf);
    expect(f.sequence).toBe(seq);
    expect(f.length).toBe(seq.length);
    expect(f.isCircular).toBe(false);
    expect(f.features).toEqual([]);
  });

  it("round-trips a circular sequence", () => {
    const buf = makeDna({ sequence: "AAAATTTT", circular: true });
    expect(parseSnapgene(buf).isCircular).toBe(true);
  });

  it("rejects a file missing the SnapGene cookie", () => {
    // Just a sequence segment — no cookie.
    const seqPayload = concat(new Uint8Array([0x00]), ascii("ACGT"));
    const bad = makeSegment(0x00, seqPayload);
    expect(() => parseSnapgene(bad)).toThrow(SnapGeneFormatError);
  });

  it("rejects a truncated payload without crashing", () => {
    // Cookie says length=14 but only 4 bytes follow.
    const truncated = concat(new Uint8Array([0x09]), u32be(14), ascii("Snap"));
    expect(() => parseSnapgene(truncated)).toThrow(SnapGeneFormatError);
  });

  it("preserves the topology byte for methylation flags", () => {
    // Bit 1 set (Dam methylation), bit 0 clear (linear).
    const cookie = makeSegment(0x09, ascii("SnapGene\x00\x01\x00\x0f\x00\x14"));
    const seqSeg = makeSegment(0x00, concat(new Uint8Array([0x02]), ascii("ACGT")));
    const f = parseSnapgene(concat(cookie, seqSeg));
    expect(f.isCircular).toBe(false);
    expect(f.topologyByte).toBe(0x02);
  });

  it("parses features XML and converts 1-based inclusive → 0-based exclusive", () => {
    const xml = `<Features nextValidID="1">
      <Feature recentID="0" name="Promoter" type="promoter" directionality="1">
        <Segments>
          <Segment range="100-150" color="#993366"/>
        </Segments>
      </Feature>
      <Feature recentID="1" name="Term" type="terminator" directionality="2">
        <Segments>
          <Segment range="200-220" color="#cccccc"/>
        </Segments>
      </Feature>
    </Features>`;
    const f = parseSnapgene(makeDna({ sequence: "A".repeat(300), featuresXml: xml }));
    expect(f.features).toHaveLength(2);
    expect(f.features[0]).toMatchObject({
      name: "Promoter",
      type: "promoter",
      start: 99,    // 100 − 1 (1-based inclusive → 0-based inclusive)
      end: 150,     // 150 (1-based inclusive end → 0-based exclusive)
      strand: 1,
      color: "#993366",
    });
    expect(f.features[1]).toMatchObject({
      name: "Term",
      strand: -1,   // directionality="2" → reverse strand
      start: 199,
      end: 220,
    });
  });

  it("flattens multi-segment features into one record per segment", () => {
    const xml = `<Features>
      <Feature name="MultiPart" type="CDS" directionality="1">
        <Segments>
          <Segment range="10-50"/>
          <Segment range="100-200"/>
        </Segments>
      </Feature>
    </Features>`;
    const f = parseSnapgene(makeDna({ sequence: "A".repeat(300), featuresXml: xml }));
    expect(f.features).toHaveLength(2);
    expect(f.features.every(x => x.name === "MultiPart")).toBe(true);
    expect(f.features.map(x => [x.start, x.end])).toEqual([[9, 50], [99, 200]]);
  });

  it("tolerates malformed feature ranges by skipping them", () => {
    const xml = `<Features>
      <Feature name="OK" type="misc" directionality="0">
        <Segments>
          <Segment range="5-10"/>
          <Segment range="bogus"/>
          <Segment range="100-200"/>
        </Segments>
      </Feature>
    </Features>`;
    const f = parseSnapgene(makeDna({ sequence: "A".repeat(300), featuresXml: xml }));
    expect(f.features).toHaveLength(2);
    expect(f.features.map(x => x.start)).toEqual([4, 99]);
  });
});
