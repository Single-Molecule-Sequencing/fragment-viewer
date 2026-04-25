// src/lib/sanger.js — Sanger basecall analysis: Mott trim + local alignment.
//
// Pure JS, no deps. Mirror of golden-gate/lib/qc/sanger.py — same Mott trim
// algorithm, same local-alignment scoring defaults, same identity/mismatch/
// gap accounting. Lets the JS viewer and the Python QC pipeline produce
// comparable identity numbers for the same .ab1 + reference pair.
//
// What this module does NOT do:
// - parse .ab1 (that's abif.js → parseSangerAbif)
// - render anything (that's tabs/sanger_tab.jsx)


// ----------------------------------------------------------------------
// Mott trim
// ----------------------------------------------------------------------
//
// Sanger reads decay at both ends. A fixed Q-cutoff is too harsh; the Mott
// trimmer (used by phred / cross_match) finds the maximal-sum window of
// (q − q_cutoff). Returns {start, end} as 0-based half-open indices into the
// basecall string. Returns {start:0, end:0} if no window scores positive.

export function mottTrim(qScores, qCutoff = 20) {
  if (!qScores || qScores.length === 0) return { start: 0, end: 0 };
  let bestSum = 0, currentSum = 0;
  let bestStart = 0, currentStart = 0;
  let bestEnd = 0;
  for (let i = 0; i < qScores.length; i++) {
    const s = qScores[i] - qCutoff;
    if (currentSum + s < 0) {
      currentSum = 0;
      currentStart = i + 1;
    } else {
      currentSum += s;
      if (currentSum > bestSum) {
        bestSum = currentSum;
        bestStart = currentStart;
        bestEnd = i + 1;
      }
    }
  }
  if (bestSum === 0) return { start: 0, end: 0 };
  return { start: bestStart, end: bestEnd };
}


// ----------------------------------------------------------------------
// Local pairwise alignment (Smith-Waterman, banded by no band — full DP).
// ----------------------------------------------------------------------
//
// Defaults match golden-gate/lib/qc/sanger.py: match=+2, mismatch=−1,
// open_gap=−2, extend_gap=−0.5. The aligner also charges open_gap on the
// FIRST gap, so a length-1 gap costs `open_gap` and a length-k gap costs
// `open_gap + (k − 1) * extend_gap`. With these defaults a length-1 gap is
// worse than a single mismatch and a length-2 gap is worse than two
// mismatches, which matches Biopython's PairwiseAligner local mode.
//
// Returns:
//   {
//     identity: 0..1 (matches / aligned_length),
//     matches, mismatches, gaps,
//     length: aligned_length (incl. gaps),
//     targetStart, targetEnd, queryStart, queryEnd,
//     alignedTarget, alignedQuery   // strings with '-' for gaps
//   }

const NEG_INF = -Infinity;

export function localAlign(query, target, opts = {}) {
  const match = opts.match ?? 2.0;
  const mismatch = opts.mismatch ?? -1.0;
  const openGap = opts.openGap ?? -2.0;
  const extendGap = opts.extendGap ?? -0.5;

  const Q = (query || "").toUpperCase();
  const T = (target || "").toUpperCase();
  const m = Q.length;
  const n = T.length;

  if (m === 0 || n === 0) {
    return {
      identity: 0, matches: 0, mismatches: 0, gaps: 0, length: 0,
      targetStart: 0, targetEnd: 0, queryStart: 0, queryEnd: 0,
      alignedTarget: "", alignedQuery: "",
    };
  }

  // Three matrices: H = match path, E = horizontal gap (gap in query),
  // F = vertical gap (gap in target). Backtracking pointer matrix is
  // packed into a single Int8Array for speed.
  // States: 0=stop, 1=diagonal (match/mm), 2=up (gap in target), 3=left (gap in query).
  const H = new Float64Array((m + 1) * (n + 1));
  const E = new Float64Array((m + 1) * (n + 1));
  const F = new Float64Array((m + 1) * (n + 1));
  const ptr = new Int8Array((m + 1) * (n + 1));

  // Initialise gap matrices to -inf so opening costs are charged exactly once.
  for (let k = 0; k < E.length; k++) { E[k] = NEG_INF; F[k] = NEG_INF; }
  for (let k = 0; k <= n; k++) { H[k] = 0; }
  for (let i = 0; i <= m; i++) { H[i * (n + 1)] = 0; }

  let bestScore = 0;
  let bestI = 0, bestJ = 0;

  for (let i = 1; i <= m; i++) {
    const qi = Q.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const idx = i * (n + 1) + j;
      const tj = T.charCodeAt(j - 1);

      // Gap in target (advance i, hold j).
      const eOpen = H[(i - 1) * (n + 1) + j] + openGap;
      const eExt  = E[(i - 1) * (n + 1) + j] + extendGap;
      E[idx] = eOpen > eExt ? eOpen : eExt;

      // Gap in query (advance j, hold i).
      const fOpen = H[i * (n + 1) + (j - 1)] + openGap;
      const fExt  = F[i * (n + 1) + (j - 1)] + extendGap;
      F[idx] = fOpen > fExt ? fOpen : fExt;

      // Diagonal (match/mismatch).
      const diag = H[(i - 1) * (n + 1) + (j - 1)] + (qi === tj ? match : mismatch);

      // Pick best of diag, E, F, 0 (local).
      let best = 0;
      let from = 0;
      if (diag > best) { best = diag; from = 1; }
      if (E[idx] > best) { best = E[idx]; from = 2; }
      if (F[idx] > best) { best = F[idx]; from = 3; }
      H[idx] = best;
      ptr[idx] = from;

      if (best > bestScore) {
        bestScore = best;
        bestI = i;
        bestJ = j;
      }
    }
  }

  // Backtrack from (bestI, bestJ).
  const aQ = [];
  const aT = [];
  let i = bestI, j = bestJ;
  while (i > 0 && j > 0) {
    const idx = i * (n + 1) + j;
    const from = ptr[idx];
    if (from === 0) break;
    if (from === 1) {
      aQ.push(Q[i - 1]);
      aT.push(T[j - 1]);
      i--; j--;
    } else if (from === 2) {
      aQ.push(Q[i - 1]);
      aT.push("-");
      i--;
    } else { // from === 3
      aQ.push("-");
      aT.push(T[j - 1]);
      j--;
    }
  }
  const alignedQuery = aQ.reverse().join("");
  const alignedTarget = aT.reverse().join("");

  let matches = 0, mismatches = 0, gaps = 0;
  for (let k = 0; k < alignedQuery.length; k++) {
    const a = alignedTarget[k];
    const b = alignedQuery[k];
    if (a === "-" || b === "-") gaps++;
    else if (a === b) matches++;
    else mismatches++;
  }
  const length = alignedQuery.length;
  const identity = length ? matches / length : 0;

  return {
    identity, matches, mismatches, gaps, length,
    targetStart: j,        // 0-based start in target
    targetEnd: bestJ,      // 0-based exclusive end in target
    queryStart: i,
    queryEnd: bestI,
    alignedTarget,
    alignedQuery,
  };
}


// ----------------------------------------------------------------------
// Mismatch enumeration: walk an aligned (target, query) pair → list of
// {position_in_target, ref_base, query_base, kind: "mismatch"|"insertion"|"deletion"}.
// position_in_target is 0-based; insertions advance only the query pointer,
// deletions advance only the target pointer.

export function enumerateMismatches(aln) {
  const out = [];
  let tPos = aln.targetStart;
  let qPos = aln.queryStart;
  const t = aln.alignedTarget;
  const q = aln.alignedQuery;
  for (let k = 0; k < t.length; k++) {
    const tc = t[k];
    const qc = q[k];
    if (tc === "-") {
      out.push({ position: tPos, refBase: "-", queryBase: qc, kind: "insertion" });
      qPos++;
    } else if (qc === "-") {
      out.push({ position: tPos, refBase: tc, queryBase: "-", kind: "deletion" });
      tPos++;
    } else if (tc !== qc) {
      out.push({ position: tPos, refBase: tc, queryBase: qc, kind: "mismatch" });
      tPos++;
      qPos++;
    } else {
      tPos++;
      qPos++;
    }
  }
  return out;
}


// ----------------------------------------------------------------------
// One-shot Sanger QC: parsed .ab1 + reference sequence → identity payload.
// Same shape (and same field names) as golden-gate/lib/qc/sanger.py's
// QCResult.payload, so the two viewers can show the same numbers.

export function scoreSangerVsReference(parsed, reference, opts = {}) {
  const qCutoff = opts.qCutoff ?? 20;
  const passIdentity = opts.passIdentity ?? 0.99;
  const warnIdentity = opts.warnIdentity ?? 0.95;

  const trim = mottTrim(parsed.qScores, qCutoff);
  const trimmed = parsed.basecalls.slice(trim.start, trim.end);

  if (trimmed.length === 0) {
    return {
      verdict: "fail",
      summary: `no bases survive Q>=${qCutoff} trim`,
      qCutoff, trim,
      identity: 0, matches: 0, mismatches: 0, gaps: 0, length: 0,
      mismatchList: [],
    };
  }

  const aln = localAlign(trimmed, reference);
  let verdict = "fail";
  if (aln.identity >= passIdentity) verdict = "pass";
  else if (aln.identity >= warnIdentity) verdict = "warn";

  return {
    verdict,
    summary:
      `${aln.matches}/${aln.length} = ${(aln.identity * 100).toFixed(2)}% identity ` +
      `(${aln.mismatches} mismatches, ${aln.gaps} gaps); Q>=${qCutoff} trim ${trim.start}-${trim.end}`,
    qCutoff,
    trim,
    ...aln,
    mismatchList: enumerateMismatches(aln),
  };
}
