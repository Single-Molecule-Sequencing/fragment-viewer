// src/lib/sequence_analyses.js — pure-JS sequence-level analyses for the
// Sanger tab (and reusable elsewhere): restriction-site finder, ORF finder,
// sliding-window GC composition.
//
// Particular focus on Type-IIS enzymes used by the lab's Golden Gate
// workflow: BsaI and BsmBI. A spurious BsaI/BsmBI site inside a cloned
// fragment is a Golden Gate hazard — the next assembly round would
// fragment the insert. Surfacing them at the chromatogram level catches
// this before sequencing any further constructs.
//
// Reference: docs/BIOLOGY.md (Golden Gate Type-IIS conventions)

// Built-in enzyme palette. Type-IIS enzymes have separate recognition + cut
// sites; we report the recognition-site position. Class-II enzymes
// (EcoRI, etc.) are also included for general utility.

export const ENZYME_CATALOG = [
  // --- Type-IIS (Golden Gate) ---
  { name: "BsaI",  recognition: "GGTCTC", isTypeIIS: true,  cutOffset: 1, overhang: 4 },
  { name: "BsmBI", recognition: "CGTCTC", isTypeIIS: true,  cutOffset: 1, overhang: 4 },
  { name: "BbsI",  recognition: "GAAGAC", isTypeIIS: true,  cutOffset: 2, overhang: 4 },
  { name: "SapI",  recognition: "GCTCTTC", isTypeIIS: true, cutOffset: 1, overhang: 3 },
  // --- Class-II (palindromic, common cloning) ---
  { name: "EcoRI", recognition: "GAATTC", isTypeIIS: false },
  { name: "BamHI", recognition: "GGATCC", isTypeIIS: false },
  { name: "HindIII", recognition: "AAGCTT", isTypeIIS: false },
  { name: "NotI",  recognition: "GCGGCCGC", isTypeIIS: false },
  { name: "XhoI",  recognition: "CTCGAG", isTypeIIS: false },
];

const COMPLEMENT = { A: "T", T: "A", G: "C", C: "G", N: "N" };

export function reverseComplement(seq) {
  const out = new Array(seq.length);
  for (let i = 0; i < seq.length; i++) {
    out[seq.length - 1 - i] = COMPLEMENT[seq[i].toUpperCase()] || "N";
  }
  return out.join("");
}


/**
 * Find all forward + reverse-complement matches of an enzyme recognition
 * sequence in a DNA string. Returns 0-based start positions.
 *
 * @param {string} sequence - DNA sequence (case-insensitive)
 * @param {string} recognition - recognition sequence (uppercase ACGT)
 * @returns {Array<{start: number, end: number, strand: 1 | -1}>}
 */
export function findRecognitionSites(sequence, recognition) {
  if (!sequence || !recognition) return [];
  const seq = sequence.toUpperCase();
  const fwd = recognition.toUpperCase();
  const rev = reverseComplement(fwd);
  const len = fwd.length;
  const out = [];

  // Forward-strand search.
  let i = 0;
  while ((i = seq.indexOf(fwd, i)) !== -1) {
    out.push({ start: i, end: i + len, strand: 1 });
    i++;
  }
  // Reverse-strand search (skip if palindromic to avoid double-reporting).
  if (rev !== fwd) {
    i = 0;
    while ((i = seq.indexOf(rev, i)) !== -1) {
      out.push({ start: i, end: i + len, strand: -1 });
      i++;
    }
  }
  return out.sort((a, b) => a.start - b.start);
}


/**
 * Find every enzyme in `enzymes` against a sequence.
 *
 * @param {string} sequence
 * @param {Array} enzymes - default ENZYME_CATALOG
 * @returns {Array<{enzyme, start, end, strand}>}
 */
export function findEnzymeSites(sequence, enzymes = ENZYME_CATALOG) {
  const hits = [];
  for (const e of enzymes) {
    for (const site of findRecognitionSites(sequence, e.recognition)) {
      hits.push({ enzyme: e.name, isTypeIIS: e.isTypeIIS, ...site });
    }
  }
  return hits.sort((a, b) => a.start - b.start);
}


// ----------------------------------------------------------------------
// ORF (open reading frame) finder
// ----------------------------------------------------------------------

const STANDARD_CODON = {
  TTT: "F", TTC: "F", TTA: "L", TTG: "L", CTT: "L", CTC: "L", CTA: "L", CTG: "L",
  ATT: "I", ATC: "I", ATA: "I", ATG: "M", GTT: "V", GTC: "V", GTA: "V", GTG: "V",
  TCT: "S", TCC: "S", TCA: "S", TCG: "S", CCT: "P", CCC: "P", CCA: "P", CCG: "P",
  ACT: "T", ACC: "T", ACA: "T", ACG: "T", GCT: "A", GCC: "A", GCA: "A", GCG: "A",
  TAT: "Y", TAC: "Y", TAA: "*", TAG: "*", CAT: "H", CAC: "H", CAA: "Q", CAG: "Q",
  AAT: "N", AAC: "N", AAA: "K", AAG: "K", GAT: "D", GAC: "D", GAA: "E", GAG: "E",
  TGT: "C", TGC: "C", TGA: "*", TGG: "W", CGT: "R", CGC: "R", CGA: "R", CGG: "R",
  AGT: "S", AGC: "S", AGA: "R", AGG: "R", GGT: "G", GGC: "G", GGA: "G", GGG: "G",
};

/**
 * Translate a DNA sequence into a protein string using the standard
 * code. Bases not in {A,C,G,T} produce 'X'. Trailing partial codon
 * is dropped.
 */
export function translateDna(dna) {
  const seq = (dna || "").toUpperCase();
  const out = [];
  for (let i = 0; i + 3 <= seq.length; i += 3) {
    out.push(STANDARD_CODON[seq.substring(i, i + 3)] || "X");
  }
  return out.join("");
}


/**
 * Find all open reading frames (ATG → stop) ≥ minLengthAa codons long
 * across all 6 frames (3 forward, 3 reverse). Each ORF is returned as
 * 0-based half-open coordinates on the input sequence.
 *
 * @param {string} sequence
 * @param {{minLengthAa?: number}} opts
 * @returns {Array<{start, end, strand, frame, lengthAa, startCodonPos}>}
 */
export function findOrfs(sequence, opts = {}) {
  const minLen = opts.minLengthAa ?? 50;
  const orfs = [];
  const seqUC = sequence.toUpperCase();
  const len = seqUC.length;

  for (let strand = 1; strand >= -1; strand -= 2) {
    const target = strand === 1 ? seqUC : reverseComplement(seqUC);
    for (let frame = 0; frame < 3; frame++) {
      let inOrf = false;
      let orfStart = -1;
      for (let i = frame; i + 3 <= len; i += 3) {
        const codon = target.substring(i, i + 3);
        const aa = STANDARD_CODON[codon];
        if (!inOrf && codon === "ATG") {
          inOrf = true;
          orfStart = i;
        } else if (inOrf && aa === "*") {
          const lengthAa = (i - orfStart) / 3;
          if (lengthAa >= minLen) {
            // Convert reverse-strand coords back to forward-strand original.
            const origStart = strand === 1 ? orfStart : len - i - 3;
            const origEnd = strand === 1 ? i + 3 : len - orfStart;
            orfs.push({
              start: origStart,
              end: origEnd,
              strand,
              frame: frame + 1,
              lengthAa,
              startCodonPos: orfStart,
            });
          }
          inOrf = false;
        }
      }
    }
  }
  return orfs.sort((a, b) => b.lengthAa - a.lengthAa);
}


// ----------------------------------------------------------------------
// GC composition (sliding-window)
// ----------------------------------------------------------------------

/**
 * Sliding-window GC fraction across a sequence. Returns one value per
 * position by walking a centered window of size `windowSize`. Window
 * shrinks symmetrically near the ends.
 *
 * @param {string} sequence
 * @param {number} windowSize - default 50
 * @returns {Float32Array} gc[i] in [0, 1]
 */
export function gcComposition(sequence, windowSize = 50) {
  const n = sequence.length;
  const gc = new Float32Array(n);
  if (n === 0) return gc;
  const half = Math.floor(windowSize / 2);
  // Build a prefix-sum of GC counts so each window is O(1).
  const ps = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) {
    const c = sequence[i].toUpperCase();
    ps[i + 1] = ps[i] + ((c === "G" || c === "C") ? 1 : 0);
  }
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(n, i + half + 1);
    const wSize = hi - lo;
    gc[i] = wSize > 0 ? (ps[hi] - ps[lo]) / wSize : 0;
  }
  return gc;
}


/**
 * Overall GC% of a sequence (single number).
 */
export function overallGc(sequence) {
  if (!sequence) return 0;
  let count = 0;
  for (let i = 0; i < sequence.length; i++) {
    const c = sequence[i].toUpperCase();
    if (c === "G" || c === "C") count++;
  }
  return count / sequence.length;
}


// ----------------------------------------------------------------------
// Primer mapping
// ----------------------------------------------------------------------
//
// Find a primer (typically 18–25 nt) on a target sequence with up to
// `maxMismatches` mismatches. Searches both strands. Returns 0-based
// half-open ranges with strand and mismatch count.
//
// Naive O(N*M) scan; fine for primer ≈ 20 nt against constructs of
// ≤50 kb. For very long targets use a more efficient algorithm.

/**
 * @param {string} primer
 * @param {string} target
 * @param {{maxMismatches?: number}} opts
 * @returns {Array<{start: number, end: number, strand: 1|-1, mismatches: number}>}
 */
export function findPrimerMatches(primer, target, opts = {}) {
  const maxMm = opts.maxMismatches ?? 2;
  const p = primer.toUpperCase();
  const t = target.toUpperCase();
  if (!p || !t) return [];
  const out = [];
  scanStrand(p, t, 1, maxMm, out);
  // Reverse-complement the primer and scan again as the reverse-strand
  // primer landing on the target.
  const pRc = reverseComplement(p);
  if (pRc !== p) scanStrand(pRc, t, -1, maxMm, out);
  return out.sort((a, b) => a.start - b.start);
}

function scanStrand(primer, target, strand, maxMm, out) {
  const m = primer.length;
  const n = target.length;
  for (let i = 0; i + m <= n; i++) {
    let mm = 0;
    for (let k = 0; k < m && mm <= maxMm; k++) {
      if (target.charCodeAt(i + k) !== primer.charCodeAt(k)) mm++;
    }
    if (mm <= maxMm) {
      out.push({ start: i, end: i + m, strand, mismatches: mm });
    }
  }
}


/**
 * Parse a multi-record FASTA string into an array of {name, sequence}.
 * Tolerates blank lines and CR/LF endings. Sequence is upper-cased and
 * stripped of whitespace.
 */
export function parseMultiFasta(text) {
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const out = [];
  let cur = null;
  for (const line of lines) {
    if (line.startsWith(">")) {
      if (cur && cur.sequence) out.push(cur);
      cur = { name: line.slice(1).trim() || `record_${out.length + 1}`, sequence: "" };
    } else if (cur) {
      cur.sequence += line.trim().toUpperCase();
    }
  }
  if (cur && cur.sequence) out.push(cur);
  return out;
}
