// src/lib/snapgene_diff.js — compare two SnapGene .dna files.
//
// Pure JS, no deps. Operates on the SnapGeneFile shape produced by
// parseSnapgene. Returns a diff object with:
//
//   sequenceDiff: {
//     identity:         number (0..1)
//     length:           number (aligned length incl. gaps)
//     matches:          number
//     mismatches:       number
//     gaps:             number
//     edits:            Array<{kind, posA, posB, baseA, baseB}>
//   }
//   featureDiff: {
//     onlyInA:          Array<feature>          // features present in A, missing in B
//     onlyInB:          Array<feature>
//     bothMatched:      Array<{a, b, exact}>    // matched by name+type+position
//   }
//   topology: {a: bool, b: bool, changed: bool}
//
// Sequence comparison uses the same Smith-Waterman / global-alignment
// approach as src/lib/sanger.js but with simpler scoring since both
// inputs are full sequences (not trimmed reads).

import { localAlign } from "./sanger.js";


/**
 * @param {{sequence, isCircular, features}} a
 * @param {{sequence, isCircular, features}} b
 * @param {{maxAlignLen?: number}} opts - if either sequence > maxAlignLen,
 *   skip the alignment-based sequence diff (returns identity-by-equality
 *   only). Default 50000 (CYP2D6 full assembly fits).
 * @returns {object}
 */
export function diffSnapgene(a, b, opts = {}) {
  const maxAlignLen = opts.maxAlignLen ?? 50_000;

  // Sequence diff via local alignment when sizes are tractable.
  let sequenceDiff;
  if (a.sequence === b.sequence) {
    sequenceDiff = {
      identity: 1, matches: a.sequence.length, mismatches: 0, gaps: 0,
      length: a.sequence.length, edits: [],
      identical: true,
    };
  } else if (a.sequence.length > maxAlignLen || b.sequence.length > maxAlignLen) {
    sequenceDiff = {
      identity: a.sequence === b.sequence ? 1 : 0,
      identical: false,
      tooLargeToAlign: true,
      lengthA: a.sequence.length,
      lengthB: b.sequence.length,
    };
  } else {
    const aln = localAlign(a.sequence, b.sequence);
    const edits = enumerateEdits(aln);
    sequenceDiff = {
      identity: aln.identity,
      matches: aln.matches,
      mismatches: aln.mismatches,
      gaps: aln.gaps,
      length: aln.length,
      edits,
      identical: false,
      lengthA: a.sequence.length,
      lengthB: b.sequence.length,
      alignedRange: { a: [aln.queryStart, aln.queryEnd], b: [aln.targetStart, aln.targetEnd] },
    };
  }

  // Feature diff: match by (name, type, start, end) tuple. Also compute
  // "fuzzy" matches where name+type match but coords drifted (renamed
  // or shifted features).
  const featureDiff = compareFeatures(a.features || [], b.features || []);

  return {
    sequenceDiff,
    featureDiff,
    topology: {
      a: !!a.isCircular,
      b: !!b.isCircular,
      changed: !!a.isCircular !== !!b.isCircular,
    },
  };
}


// ----------------------------------------------------------------------
// Edit-list extraction from a localAlign result
// ----------------------------------------------------------------------
//
// Walks the aligned strings to emit a flat list of substitution / insertion /
// deletion events with positions in both A and B coordinate frames. Insertions
// (gap in A) advance only B; deletions (gap in B) advance only A.

function enumerateEdits(aln) {
  const edits = [];
  // localAlign uses target = first arg, query = second arg. We passed
  // a.sequence as query, b.sequence as target → alignedTarget is b's
  // aligned form, alignedQuery is a's.
  let aPos = aln.queryStart;
  let bPos = aln.targetStart;
  const t = aln.alignedTarget;  // b's aligned characters
  const q = aln.alignedQuery;   // a's aligned characters
  for (let k = 0; k < t.length; k++) {
    const tc = t[k];
    const qc = q[k];
    if (tc === "-" && qc !== "-") {
      // Gap in B (deletion in B / insertion in A).
      edits.push({ kind: "delete_in_b", posA: aPos, posB: bPos, baseA: qc, baseB: "-" });
      aPos++;
    } else if (qc === "-" && tc !== "-") {
      // Gap in A (insertion in B / deletion in A).
      edits.push({ kind: "insert_in_b", posA: aPos, posB: bPos, baseA: "-", baseB: tc });
      bPos++;
    } else if (tc !== qc) {
      edits.push({ kind: "substitution", posA: aPos, posB: bPos, baseA: qc, baseB: tc });
      aPos++; bPos++;
    } else {
      aPos++; bPos++;
    }
  }
  return edits;
}


// ----------------------------------------------------------------------
// Feature diff
// ----------------------------------------------------------------------

function featureKey(f) {
  return `${f.name || ""}|${f.type || ""}|${f.start | 0}-${f.end | 0}|${f.strand | 0}`;
}

function compareFeatures(aFeats, bFeats) {
  const aMap = new Map();
  const bMap = new Map();
  for (const f of aFeats) aMap.set(featureKey(f), f);
  for (const f of bFeats) bMap.set(featureKey(f), f);
  const onlyInA = [];
  const onlyInB = [];
  const bothMatched = [];

  // Exact matches.
  const aMatched = new Set();
  const bMatched = new Set();
  for (const [key, fa] of aMap) {
    if (bMap.has(key)) {
      bothMatched.push({ a: fa, b: bMap.get(key), exact: true });
      aMatched.add(key);
      bMatched.add(key);
    }
  }
  // Fuzzy matches by (name, type) — different coords.
  for (const [key, fa] of aMap) {
    if (aMatched.has(key)) continue;
    for (const [bKey, fb] of bMap) {
      if (bMatched.has(bKey)) continue;
      if (fa.name === fb.name && (fa.type || "") === (fb.type || "")) {
        bothMatched.push({ a: fa, b: fb, exact: false });
        aMatched.add(key);
        bMatched.add(bKey);
        break;
      }
    }
  }
  for (const [key, fa] of aMap) if (!aMatched.has(key)) onlyInA.push(fa);
  for (const [key, fb] of bMap) if (!bMatched.has(key)) onlyInB.push(fb);

  return { onlyInA, onlyInB, bothMatched };
}
