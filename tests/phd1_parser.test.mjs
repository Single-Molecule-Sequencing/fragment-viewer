// Test for parsePhd1 — Phred .phd.1 companion file parser.

import { describe, it, expect } from "vitest";
import { parsePhd1 } from "../src/lib/abif.js";

const SAMPLE_PHD1 = `BEGIN_SEQUENCE 10a-PS1-Premixed_E02

BEGIN_COMMENT

CHROMAT_FILE: 10a-PS1-Premixed_E02.ab1
BASECALLER_VERSION: KB 1.4.0
QUALITY_LEVELS: 99
TIME: Fri Aug 01 14:47:11 2025

END_COMMENT

BEGIN_DNA
N 4 12
N 5 25
A 14 38
C 22 51
G 35 64
T 42 77
A 50 90
C 55 103
END_DNA

END_SEQUENCE
`;

describe("parsePhd1", () => {
  it("extracts basecalls + Q-scores + peak locations", () => {
    const out = parsePhd1(SAMPLE_PHD1, "10a-PS1.phd.1");
    expect(out.basecalls).toBe("NNACGTAC");
    expect(out.qScores).toEqual([4, 5, 14, 22, 35, 42, 50, 55]);
    expect(out.peakLocations).toEqual([12, 25, 38, 51, 64, 77, 90, 103]);
  });

  it("captures sample name from BEGIN_SEQUENCE line", () => {
    const out = parsePhd1(SAMPLE_PHD1);
    expect(out.sampleName).toBe("10a-PS1-Premixed_E02");
  });

  it("falls back to filename stem when no BEGIN_SEQUENCE name", () => {
    const minimal = `BEGIN_DNA\nA 40 10\nC 38 20\nEND_DNA`;
    const out = parsePhd1(minimal, "fallback.phd.1");
    expect(out.sampleName).toBe("fallback");
    expect(out.basecalls).toBe("AC");
  });

  it("populates meta from comment block", () => {
    const out = parsePhd1(SAMPLE_PHD1);
    expect(out.meta.CHROMAT_FILE).toBe("10a-PS1-Premixed_E02.ab1");
    expect(out.meta.BASECALLER_VERSION).toBe("KB 1.4.0");
    expect(out.meta.source_format).toBe("phd.1");
  });

  it("returns trace-less sample shape (chromatogram won't render but analysis works)", () => {
    const out = parsePhd1(SAMPLE_PHD1);
    expect(out.traces).toEqual({ A: null, C: null, G: null, T: null });
    expect(out.meta.trace_length).toBe(0);
  });

  it("tolerates CRLF line endings", () => {
    const crlf = SAMPLE_PHD1.replace(/\n/g, "\r\n");
    const out = parsePhd1(crlf);
    expect(out.basecalls).toBe("NNACGTAC");
  });
});
