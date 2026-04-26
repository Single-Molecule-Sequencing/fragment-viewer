// src/lib/sanger_demo.js — synthesize a small ABIF byte stream + parsed
// Sanger sample for the Sanger tab's "Load demo" button. Same AbifBuilder
// pattern as tests/sanger_abif_roundtrip.test.mjs but lifted into the
// runtime bundle so the deployed site can offer a one-click demo.
//
// Adds ~3 KB to the bundle and saves users from having to find an .ab1.

import { parseSangerAbif } from "./abif.js";

// Reference snippet of the V059 construct (matches CONSTRUCT.seq in
// src/lib/constants.js so users can drop the seeded V059 .dna and see
// alignment land cleanly). Length 226 bp is small enough for snappy
// chromatogram render + big enough to feel real.
const V059 =
  "AAGGTTAAGGATTCATTCCCACGGTAACACCAGCACCT" +  // 38 bp
  "GACAGCATCCAGCGCTGGGATAGAACCAGAGCAACTGT" +  // 76
  "TGCAGGTGCACCTGCTTTTCGCTGAATTCGCGGCCGCT" +  // 114
  "TCTAGAGGGTCTGCGATGTTTGGTCTCACCGTTCTGTC" +  // 152
  "TGGTGTAGGTGCTGAATGCTGTCCCCGTCCTCCTGCAT" +  // 190
  "ATCCCAGCGCTGGCTGGCAAGGTCCTACGCT";          // 221

// Slightly clip to 226 if needed (just realism).
function refSeq() {
  return V059.slice(0, 226);
}

function makeSyntheticSanger() {
  const ref = refSeq();
  // Basecalls: same as ref but with two synthetic mismatches at positions
  // 90 and 175 to make the panels light up with realistic findings.
  const arr = ref.split("");
  arr[90] = arr[90] === "A" ? "T" : "A";
  arr[175] = arr[175] === "G" ? "C" : "G";
  // Add a low-Q region near the end (positions 200-220) to simulate
  // the typical back-half blowout.
  const basecalls = arr.join("");
  const qScores = basecalls.split("").map((_, i) => {
    if (i < 10) return 8;          // leading low-Q
    if (i > 200) return 12;         // trailing low-Q
    if (i === 90) return 14;        // local dip at the synthetic mismatch
    return 38 + (i % 11);
  });
  // Peak locations: 12 data points apart.
  const peakLocs = basecalls.split("").map((_, i) => 30 + i * 12);
  const traceLen = peakLocs[peakLocs.length - 1] + 30;

  // 4-channel synthetic Gaussian peaks at each base location.
  const baseToChan = { A: 0, C: 1, G: 2, T: 3 };
  const channels = [
    new Int16Array(traceLen),
    new Int16Array(traceLen),
    new Int16Array(traceLen),
    new Int16Array(traceLen),
  ];
  for (let i = 0; i < basecalls.length; i++) {
    const ch = baseToChan[basecalls[i]];
    if (ch === undefined) continue;
    const px = peakLocs[i];
    for (let dx = -5; dx <= 5; dx++) {
      const x = px + dx;
      if (x >= 0 && x < traceLen) {
        const peakVal = qScores[i] >= 30 ? 1100 : 600;
        channels[ch][x] = Math.max(channels[ch][x], Math.round(peakVal * Math.exp(-dx * dx / 6)));
      }
    }
  }
  // Add a small "shadow" peak at position 90 to simulate a mixed-peak event.
  const px90 = peakLocs[90];
  const shadowCh = (baseToChan[arr[90]] + 2) % 4;  // some other channel
  for (let dx = -4; dx <= 4; dx++) {
    const x = px90 + dx;
    if (x >= 0 && x < traceLen) {
      channels[shadowCh][x] = Math.max(channels[shadowCh][x], Math.round(550 * Math.exp(-dx * dx / 6)));
    }
  }

  return { basecalls, qScores, peakLocs, channels };
}


/**
 * Build a complete in-memory ABIF byte stream that parseSangerAbif accepts,
 * and immediately parse it. Returns a sample suitable for setSamples().
 */
export function generateDemoSample() {
  const { basecalls, qScores, peakLocs, channels } = makeSyntheticSanger();
  const builder = new AbifBuilder();
  builder.addChar("PBAS", 1, basecalls);
  builder.addByteArray("PCON", 1, qScores);
  builder.addI16Array("PLOC", 2, peakLocs);
  builder.addI16Array("DATA", 9, Array.from(channels[0]));
  builder.addI16Array("DATA", 10, Array.from(channels[1]));
  builder.addI16Array("DATA", 11, Array.from(channels[2]));
  builder.addI16Array("DATA", 12, Array.from(channels[3]));
  builder.addCString("FWO_", 1, "ACGT");
  builder.addCString("MODL", 1, "FragmentViewer-DemoSynth");
  const buf = builder.build().buffer;
  return parseSangerAbif(buf, "V059_demo.ab1");
}


/** The reference sequence the demo aligns against. */
export function demoReferenceSequence() {
  return refSeq();
}


// ----------------------------------------------------------------------
// AbifBuilder — minimal ABIF writer (extracted from the test fixture so
// the runtime can also use it).
// ----------------------------------------------------------------------

class AbifBuilder {
  constructor() { this.entries = []; }
  addBytes(name, number, payload) {
    this.entries.push({ name, number, elemType: 1, elemSize: 1, numElements: payload.length, payload });
  }
  addChar(name, number, str) {
    const payload = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) payload[i] = str.charCodeAt(i);
    this.entries.push({ name, number, elemType: 2, elemSize: 1, numElements: str.length, payload });
  }
  addByteArray(name, number, arr) {
    const payload = new Uint8Array(arr);
    this.entries.push({ name, number, elemType: 1, elemSize: 1, numElements: arr.length, payload });
  }
  addI16Array(name, number, arr) {
    const payload = new Uint8Array(arr.length * 2);
    const view = new DataView(payload.buffer);
    for (let i = 0; i < arr.length; i++) view.setInt16(i * 2, arr[i], false);
    this.entries.push({ name, number, elemType: 4, elemSize: 2, numElements: arr.length, payload });
  }
  addCString(name, number, str) {
    const payload = new TextEncoder().encode(str);
    this.entries.push({ name, number, elemType: 19, elemSize: 1, numElements: payload.length, payload });
  }
  build() {
    const HEADER_SIZE = 128;
    let offset = HEADER_SIZE;
    const entryOffsets = [];
    for (const e of this.entries) {
      const dataSize = e.payload.length;
      if (dataSize <= 4) {
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
    buf[0] = 0x41; buf[1] = 0x42; buf[2] = 0x49; buf[3] = 0x46;
    view.setInt16(4, 101, false);
    buf[6] = 0x74; buf[7] = 0x64; buf[8] = 0x69; buf[9] = 0x72;
    view.setInt32(10, 1, false);
    view.setInt16(14, 1023, false);
    view.setInt16(16, 28, false);
    view.setInt32(18, this.entries.length, false);
    view.setInt32(22, dirSize, false);
    view.setInt32(26, dirOffset, false);
    for (const eo of entryOffsets) {
      if (!eo.embed) buf.set(eo.entry.payload, eo.offset);
    }
    for (let i = 0; i < entryOffsets.length; i++) {
      const eo = entryOffsets[i];
      const e = eo.entry;
      const ePos = dirOffset + i * 28;
      const nameBytes = new TextEncoder().encode(e.name);
      for (let k = 0; k < 4; k++) buf[ePos + k] = nameBytes[k] || 0;
      view.setInt32(ePos + 4, e.number, false);
      view.setInt16(ePos + 8, e.elemType, false);
      view.setInt16(ePos + 10, e.elemSize, false);
      view.setInt32(ePos + 12, e.numElements, false);
      view.setInt32(ePos + 16, eo.dataSize, false);
      if (eo.embed) {
        for (let k = 0; k < eo.dataSize; k++) buf[ePos + 20 + k] = e.payload[k];
      } else {
        view.setInt32(ePos + 20, eo.offset, false);
      }
      view.setInt32(ePos + 24, 0, false);
    }
    return buf;
  }
}
