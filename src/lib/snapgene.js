// src/lib/snapgene.js — minimal SnapGene .dna file reader.
//
// Browser-side pure JS; no npm dep. Mirror of golden-gate/lib/qc/snapgene.py
// (Python). Both viewers + the golden-gate QC pipeline use this primitive so
// `.dna` files become a first-class input across the lab toolkit.
//
// File format (reverse-engineered, stable across SnapGene 4.x/5.x/6.x):
//   Each chunk is [1B segment_id][4B big-endian length][length B payload].
//
// Segments we read:
//   0x09 — cookie / file description. Validates the file is a SnapGene .dna
//          (payload starts with ASCII "SnapGene").
//   0x00 — DNA sequence. Payload: [1B topology_flags] + sequence_bytes.
//          Topology bit 0 = circular (1) or linear (0). Other bits encode
//          methylation flags (Dam/Dcm/EcoKI) — exposed via .topologyByte.
//   0x0A — features (XML). Optional. Each <Feature>/<Segments>/<Segment range>
//          becomes one feature record (we flatten multi-segment features so
//          callers see the actual coordinates).
//
// Other segments (primers, notes, enzymes, view state) are skipped silently.
// Reference: github.com/Edinburgh-Genome-Foundry/SnapGeneReader

const COOKIE_MAGIC = "SnapGene";
const SEGMENT_COOKIE = 0x09;
const SEGMENT_SEQUENCE = 0x00;
const SEGMENT_FEATURES = 0x0a;

export class SnapGeneFormatError extends Error {
  constructor(message) {
    super(message);
    this.name = "SnapGeneFormatError";
  }
}

// ----------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------

/**
 * Parse a .dna ArrayBuffer (or Uint8Array) into a SnapGeneFile object.
 *
 * @param {ArrayBuffer|Uint8Array} buf
 * @returns {{
 *   sequence: string,         // upper-case ASCII (A/C/G/T/N + IUPAC)
 *   length: number,
 *   isCircular: boolean,
 *   topologyByte: number,     // raw flag byte (bit 0 = circular, bits 1..3 = methylation)
 *   features: Array<SnapGeneFeature>
 * }}
 * @throws {SnapGeneFormatError}
 */
export function parseSnapgene(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const segments = [...walkSegments(u8)];

  if (segments.length === 0 || segments[0].id !== SEGMENT_COOKIE) {
    throw new SnapGeneFormatError("missing cookie segment");
  }
  if (!startsWithAscii(segments[0].payload, COOKIE_MAGIC)) {
    throw new SnapGeneFormatError("cookie missing 'SnapGene' magic");
  }

  let seqPayload = null;
  let featPayload = null;
  for (const seg of segments) {
    if (seg.id === SEGMENT_SEQUENCE && seqPayload === null) seqPayload = seg.payload;
    else if (seg.id === SEGMENT_FEATURES && featPayload === null) featPayload = seg.payload;
  }
  if (seqPayload === null || seqPayload.length < 1) {
    throw new SnapGeneFormatError("no sequence segment");
  }

  const topologyByte = seqPayload[0];
  const sequence = bytesToAscii(seqPayload.subarray(1)).toUpperCase();
  const isCircular = (topologyByte & 0x01) !== 0;
  const features = featPayload ? parseFeaturesXml(bytesToAscii(featPayload)) : [];

  return {
    sequence,
    length: sequence.length,
    isCircular,
    topologyByte,
    features,
  };
}

/**
 * Convenience: parse a File (drag-drop) → SnapGeneFile via parseSnapgene.
 * Returns a Promise.
 */
export function readSnapgeneFile(file) {
  return file.arrayBuffer().then(parseSnapgene);
}

// ----------------------------------------------------------------------
// Internals
// ----------------------------------------------------------------------

/** @typedef {{id: number, payload: Uint8Array}} SnapGeneSegment */
/** @typedef {{name: string, type: string, start: number, end: number, strand: number, color: string}} SnapGeneFeature */

function* walkSegments(u8) {
  let pos = 0;
  const n = u8.length;
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  while (pos < n) {
    if (pos + 5 > n) return; // truncated trailer
    const id = u8[pos];
    const length = view.getUint32(pos + 1, false); // big-endian
    const payloadStart = pos + 5;
    const payloadEnd = payloadStart + length;
    if (payloadEnd > n) return; // malformed; stop
    yield { id, payload: u8.subarray(payloadStart, payloadEnd) };
    pos = payloadEnd;
  }
}

function startsWithAscii(u8, prefix) {
  if (u8.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (u8[i] !== prefix.charCodeAt(i)) return false;
  }
  return true;
}

function bytesToAscii(u8) {
  // Use TextDecoder when available (browser + modern Node); fall back to
  // String.fromCharCode for the test runner if needed.
  if (typeof TextDecoder !== "undefined") {
    return new TextDecoder("ascii", { fatal: false }).decode(u8);
  }
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return s;
}

// ----------------------------------------------------------------------
// Features XML parser
// ----------------------------------------------------------------------
//
// We don't pull a full XML lib — features XML is very regular:
//   <Features ...>
//     <Feature name="..." type="..." directionality="1|2"...>
//       <Segments>
//         <Segment range="start-end" color="#xxxxxx" .../>
//       </Segments>
//     </Feature>
//   </Features>
//
// A focused regex pass is faster + has zero deps. We tolerate attribute order,
// extra whitespace, and self-closing tags. SnapGene 1-based-inclusive ranges
// are converted to 0-based start / 0-based-exclusive end (Python-style),
// matching the Python reader's coordinates so cross-language tests can
// compare features field-by-field.

const FEATURE_RE = /<Feature\b([^>]*)>([\s\S]*?)<\/Feature>/g;
const SEGMENT_RE = /<Segment\b([^/>]*?)\/?>/g;
const ATTR_RE = /(\w[\w:-]*)\s*=\s*"([^"]*)"/g;

function parseFeaturesXml(xml) {
  const out = [];
  let mFeat;
  FEATURE_RE.lastIndex = 0;
  while ((mFeat = FEATURE_RE.exec(xml)) !== null) {
    const featAttrs = parseAttrs(mFeat[1]);
    const name = featAttrs.name || "";
    const type = featAttrs.type || "";
    const direction = featAttrs.directionality || "0";
    const strand = direction === "1" ? 1 : direction === "2" ? -1 : 0;

    const inner = mFeat[2];
    let mSeg;
    SEGMENT_RE.lastIndex = 0;
    while ((mSeg = SEGMENT_RE.exec(inner)) !== null) {
      const segAttrs = parseAttrs(mSeg[1]);
      const range = segAttrs.range || "";
      const dash = range.indexOf("-");
      if (dash <= 0) continue;
      const startStr = range.substring(0, dash);
      const endStr = range.substring(dash + 1);
      const startNum = parseInt(startStr, 10);
      const endNum = parseInt(endStr, 10);
      if (!Number.isFinite(startNum) || !Number.isFinite(endNum)) continue;
      out.push({
        name,
        type,
        start: startNum - 1, // 1-based inclusive → 0-based inclusive
        end: endNum,         // 1-based inclusive end → 0-based exclusive
        strand,
        color: segAttrs.color || "",
      });
    }
  }
  return out;
}

function parseAttrs(s) {
  const out = {};
  let m;
  ATTR_RE.lastIndex = 0;
  while ((m = ATTR_RE.exec(s)) !== null) {
    out[m[1]] = m[2];
  }
  return out;
}
