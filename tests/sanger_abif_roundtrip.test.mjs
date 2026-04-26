// Tests for parseSangerAbif against an in-memory synthesized ABIF.
//
// Builds a deterministic minimal ABIF byte stream from a synthetic Sanger
// trace, parses it with parseSangerAbif, and asserts that basecalls,
// Q-scores, peak locations, and 4-channel traces survive round-trip.
//
// This is the test fixture we couldn't get from real lab .ab1 files
// without privacy / size concerns. Pure JS; no Python build step.
//
// ABIF spec reference (extracted from biopython AbiIO + the publicly
// available "ABIF File Format Specification" PDF):
//   Header:
//     bytes 0-3   "ABIF" magic
//     bytes 4-5   version (i16 BE)
//     bytes 6-25  pseudo-directory entry pointing at the directory
//                 (we put the actual directory immediately after the
//                  trace data, with this entry pointing at it)
//   Each directory entry (28 bytes):
//     bytes 0-3   tag name (4 chars, ASCII)
//     bytes 4-7   tag number (i32 BE)
//     bytes 8-9   element type (i16 BE) — 1=byte, 2=char, 4=short,
//                 5=int, 7=float, 18=pString, 19=cString
//     bytes 10-11 element size (i16 BE)
//     bytes 12-15 num elements (i32 BE)
//     bytes 16-19 data size (i32 BE) — total bytes
//     bytes 20-23 data offset (i32 BE) — if dataSize ≤ 4, the offset
//                 field IS the value; else it's a file offset
//     bytes 24-27 data handle (i32 BE) — unused

import { describe, it, expect } from "vitest";
import { parseSangerAbif } from "../src/lib/abif.js";

// ----------------------------------------------------------------------
// Helpers to write an ABIF
// ----------------------------------------------------------------------

function write(view, offset, fn) {
  fn(view, offset);
}

function writeI16BE(view, offset, value) {
  view.setInt16(offset, value, false);
}
function writeI32BE(view, offset, value) {
  view.setInt32(offset, value, false);
}

class AbifBuilder {
  constructor() {
    this.entries = [];   // {name, number, elemType, elemSize, numElements, payload (Uint8Array)}
  }

  addBytes(name, number, payload) {
    this.entries.push({
      name, number, elemType: 1, elemSize: 1,
      numElements: payload.length, payload,
    });
  }
  // PBAS: char (elemType 2). One byte per char.
  addChar(name, number, str) {
    const payload = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) payload[i] = str.charCodeAt(i);
    this.entries.push({
      name, number, elemType: 2, elemSize: 1,
      numElements: str.length, payload,
    });
  }
  // PCON: byte array (elemType 1).
  addByteArray(name, number, arr) {
    const payload = new Uint8Array(arr);
    this.entries.push({
      name, number, elemType: 1, elemSize: 1,
      numElements: arr.length, payload,
    });
  }
  // PLOC, DATA: i16 array (elemType 4).
  addI16Array(name, number, arr) {
    const payload = new Uint8Array(arr.length * 2);
    const view = new DataView(payload.buffer);
    for (let i = 0; i < arr.length; i++) view.setInt16(i * 2, arr[i], false);
    this.entries.push({
      name, number, elemType: 4, elemSize: 2,
      numElements: arr.length, payload,
    });
  }
  // FWO_, MODL, etc: cString-like 4-char ASCII
  addCString(name, number, str) {
    // Use elemType 19 (cString) with explicit length; biopython's AbiIO
    // accepts cString and decodes it.
    const payload = new TextEncoder().encode(str);
    this.entries.push({
      name, number, elemType: 19, elemSize: 1,
      numElements: payload.length, payload,
    });
  }

  build() {
    // Layout: header (128 bytes for safety) + payloads concatenated +
    // directory at the end. Directory has one 28-byte entry per tag.
    // Header includes a "directory entry" pointing at the actual directory.
    const HEADER_SIZE = 128;

    // Compute payload offsets. For payloads ≤ 4 bytes, the offset field
    // IS the value (in-line). We keep all our payloads ≥ 5 bytes for
    // simplicity, putting them all in the data area.
    let offset = HEADER_SIZE;
    const entryOffsets = [];
    for (const e of this.entries) {
      const dataSize = e.payload.length;
      if (dataSize <= 4) {
        // Embed in directory entry instead.
        entryOffsets.push({ entry: e, dataSize, offset: -1, embed: true });
      } else {
        entryOffsets.push({ entry: e, dataSize, offset });
        offset += dataSize;
      }
    }
    const dirOffset = offset;
    const dirSize = this.entries.length * 28;
    const totalSize = dirOffset + dirSize;

    const buf = new Uint8Array(totalSize);
    const view = new DataView(buf.buffer);

    // Header.
    buf[0] = 0x41; buf[1] = 0x42; buf[2] = 0x49; buf[3] = 0x46;  // "ABIF"
    writeI16BE(view, 4, 101);  // version

    // ABIF header pseudo-directory entry: 28 bytes starting at offset 6.
    // Name: "tdir", number 1, elemType 1023, numElements = numEntries,
    // dataSize = numEntries * 28, dataOffset = dirOffset.
    buf[6] = 0x74; buf[7] = 0x64; buf[8] = 0x69; buf[9] = 0x72;  // "tdir"
    writeI32BE(view, 10, 1);                  // number
    writeI16BE(view, 14, 1023);               // elemType
    writeI16BE(view, 16, 28);                 // elemSize
    writeI32BE(view, 18, this.entries.length);// numElements
    writeI32BE(view, 22, dirSize);            // dataSize
    writeI32BE(view, 26, dirOffset);          // dataOffset

    // Write payloads.
    for (const eo of entryOffsets) {
      if (!eo.embed) {
        buf.set(eo.entry.payload, eo.offset);
      }
    }

    // Write directory.
    for (let i = 0; i < entryOffsets.length; i++) {
      const eo = entryOffsets[i];
      const e = eo.entry;
      const ePos = dirOffset + i * 28;
      // Tag name.
      const nameBytes = new TextEncoder().encode(e.name);
      for (let k = 0; k < 4; k++) buf[ePos + k] = nameBytes[k] || 0;
      writeI32BE(view, ePos + 4, e.number);
      writeI16BE(view, ePos + 8, e.elemType);
      writeI16BE(view, ePos + 10, e.elemSize);
      writeI32BE(view, ePos + 12, e.numElements);
      writeI32BE(view, ePos + 16, eo.dataSize);
      if (eo.embed) {
        // Inline the payload bytes into bytes 20-23. Any unused bytes are zero.
        for (let k = 0; k < eo.dataSize; k++) buf[ePos + 20 + k] = e.payload[k];
      } else {
        writeI32BE(view, ePos + 20, eo.offset);
      }
      writeI32BE(view, ePos + 24, 0);  // data handle unused
    }

    return buf;
  }
}


// ----------------------------------------------------------------------
// Synthesize a deterministic ABIF + run parseSangerAbif on it
// ----------------------------------------------------------------------

function synthSangerAbif() {
  const basecalls = "ACGTACGTACGTACGTACGTACGTACGTACGTACGT";
  const qScores = basecalls.split("").map((_, i) => 30 + (i % 11));
  // Peak locations: 100 data points apart, starting at offset 20.
  const peakLocs = basecalls.split("").map((_, i) => 20 + i * 10);
  const traceLen = peakLocs[peakLocs.length - 1] + 30;

  // 4 channels of synthetic data: each channel gets a Gaussian-like bump
  // at the peak location of every base assigned to that channel.
  const baseToChan = { A: 0, C: 1, G: 2, T: 3 };
  const channels = [
    new Int16Array(traceLen),
    new Int16Array(traceLen),
    new Int16Array(traceLen),
    new Int16Array(traceLen),
  ];
  for (let i = 0; i < basecalls.length; i++) {
    const ch = baseToChan[basecalls[i]];
    const px = peakLocs[i];
    for (let dx = -4; dx <= 4; dx++) {
      const x = px + dx;
      if (x >= 0 && x < traceLen) {
        channels[ch][x] = Math.max(channels[ch][x], Math.round(1000 * Math.exp(-dx * dx / 4)));
      }
    }
  }

  const builder = new AbifBuilder();
  builder.addChar("PBAS", 1, basecalls);
  builder.addByteArray("PCON", 1, qScores);
  builder.addI16Array("PLOC", 2, peakLocs);
  // DATA9-12 carry the 4 analyzed channels.
  builder.addI16Array("DATA", 9, Array.from(channels[0]));
  builder.addI16Array("DATA", 10, Array.from(channels[1]));
  builder.addI16Array("DATA", 11, Array.from(channels[2]));
  builder.addI16Array("DATA", 12, Array.from(channels[3]));
  // FWO_ tells the parser "channels 9..12 are A/C/G/T in that order".
  builder.addCString("FWO_", 1, "ACGT");
  // Some metadata so meta-readout fields exist.
  builder.addCString("MODL", 1, "SyntheticInstr");
  return { buffer: builder.build().buffer, basecalls, qScores, peakLocs };
}


// ----------------------------------------------------------------------
// Tests
// ----------------------------------------------------------------------

describe("parseSangerAbif round-trip on synthesized ABIF", () => {
  const { buffer, basecalls, qScores, peakLocs } = synthSangerAbif();
  const parsed = parseSangerAbif(buffer, "synth.ab1");

  it("recovers basecalls", () => {
    expect(parsed.basecalls).toBe(basecalls);
  });

  it("recovers Q-scores as integer array", () => {
    expect(parsed.qScores).toEqual(qScores);
  });

  it("recovers peak locations", () => {
    expect(parsed.peakLocations).toEqual(peakLocs);
  });

  it("recovers 4 trace channels named A/C/G/T per FWO_", () => {
    expect(parsed.traces.A).toBeDefined();
    expect(parsed.traces.C).toBeDefined();
    expect(parsed.traces.G).toBeDefined();
    expect(parsed.traces.T).toBeDefined();
    // Channel-to-base assignment via FWO_=ACGT means DATA9→A, 10→C, 11→G, 12→T.
    // The strongest peak in channel A should be at the position of an A basecall.
    const aPeakIdx = parsed.basecalls.indexOf("A");
    const aPeakX = parsed.peakLocations[aPeakIdx];
    expect(parsed.traces.A[aPeakX]).toBeGreaterThan(900);
  });

  it("captures sample name from filename stem", () => {
    expect(parsed.sampleName).toBe("synth");
  });

  it("populates meta with abif version + base order", () => {
    expect(parsed.meta.abifVersion).toBe(101);
    expect(parsed.meta.base_order).toBe("ACGT");
    expect(parsed.meta.n_basecalls).toBe(basecalls.length);
    expect(parsed.meta.n_quality_scores).toBe(qScores.length);
  });
});
