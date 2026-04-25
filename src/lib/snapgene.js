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
    out[m[1]] = xmlUnescape(m[2]);
  }
  return out;
}

// Decode the small set of XML entities used by SnapGene feature attributes.
// Numeric entities aren't currently emitted in feature names by the writer,
// but tolerate them on read so externally-authored .dna files don't trip.
function xmlUnescape(s) {
  return String(s)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, "&"); // last so we don't double-decode
}


// ----------------------------------------------------------------------
// SnapGene .dna writer (round-trip companion to parseSnapgene)
// ----------------------------------------------------------------------
//
// Produces a minimal .dna byte stream that SnapGene 4.x+ opens as a valid
// file. We write only three segments — cookie (0x09), sequence (0x00),
// features (0x0A) — which is what every consumer of our pipeline needs
// (primers, notes, enzymes are not currently emitted; SnapGene fills in
// reasonable defaults if missing).
//
// API:
//   writeSnapgene({sequence, isCircular?, topologyByte?, features?}) -> Uint8Array
//
// `topologyByte` overrides the topology-from-isCircular default and lets
// callers preserve methylation flags read out of an existing .dna file.

const COOKIE_PAYLOAD = strToBytes("SnapGene\x00\x01\x00\x0f\x00\x14");

export function writeSnapgene({
  sequence,
  isCircular = false,
  topologyByte,
  features = [],
} = {}) {
  if (typeof sequence !== "string") {
    throw new TypeError("writeSnapgene: sequence (string) required");
  }

  const cookie = makeSegmentBytes(SEGMENT_COOKIE, COOKIE_PAYLOAD);

  const topology = topologyByte != null ? topologyByte : (isCircular ? 0x01 : 0x00);
  const seqBytes = strToBytes(sequence.toUpperCase());
  const seqPayload = new Uint8Array(1 + seqBytes.length);
  seqPayload[0] = topology;
  seqPayload.set(seqBytes, 1);
  const seqSeg = makeSegmentBytes(SEGMENT_SEQUENCE, seqPayload);

  const segments = [cookie, seqSeg];
  if (features.length > 0) {
    const xml = featuresToXml(features);
    segments.push(makeSegmentBytes(SEGMENT_FEATURES, strToBytes(xml)));
  }
  return concatBytes(segments);
}

function makeSegmentBytes(id, payload) {
  const out = new Uint8Array(5 + payload.length);
  out[0] = id;
  // Big-endian length prefix.
  new DataView(out.buffer, out.byteOffset).setUint32(1, payload.length, false);
  out.set(payload, 5);
  return out;
}

function concatBytes(arrs) {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

function strToBytes(s) {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(s);
  }
  const buf = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) buf[i] = s.charCodeAt(i) & 0xff;
  return buf;
}

// XML escape for feature name/type/color. Coordinates are integers, so safe.
function xmlEscape(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function featuresToXml(features) {
  // Group consecutive features by name+type+strand+color into one <Feature>
  // with multiple <Segment range="..."> entries — that's how SnapGene
  // represents multi-segment features (e.g., a CDS split by an intron).
  // For our use case we emit one <Feature> per record because the records
  // come back from parseSnapgene already flattened per-segment, and that's
  // the simplest output that opens correctly in SnapGene.
  const parts = [`<Features nextValidID="${features.length}">`];
  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    // Convert 0-based-exclusive end → 1-based-inclusive (SnapGene convention).
    const start1 = (f.start | 0) + 1;
    const end1 = (f.end | 0);
    const direction = f.strand > 0 ? "1" : f.strand < 0 ? "2" : "0";
    parts.push(
      `<Feature recentID="${i}" name="${xmlEscape(f.name || "feature")}" `
      + `type="${xmlEscape(f.feature_type || f.type || "misc_feature")}" `
      + `directionality="${direction}" allowSegmentOverlaps="0" consecutiveTranslationNumbering="1">`
      + `<Segments><Segment range="${start1}-${end1}" `
      + `color="${xmlEscape(f.color || "#a6acaf")}" type="standard"/></Segments>`
      + `</Feature>`
    );
  }
  parts.push("</Features>");
  return parts.join("");
}
