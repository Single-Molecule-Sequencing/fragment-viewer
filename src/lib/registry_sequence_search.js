// src/lib/registry_sequence_search.js — find primers (and their construct
// linkages) by DNA sequence query.
//
// Use case: a lab user pastes a DNA snippet into the Lab Registry tab and
// wants to know "is this primer already in the registry?" or "which
// primers anneal to this region?".
//
// Why not reuse src/lib/sequence_analyses.js::findPrimerMatches?
// That helper is asymmetric: one primer against one target. The registry
// search is many primers against one query, AND has to handle two
// directions: query-contains-primer (Sanger-region-style) and
// primer-contains-query (paste-a-partial-primer-style). The asymmetric
// helper would still be the inner loop, but the wrapping shape — match
// kind, orientation, linkage to constructs — belongs here.
//
// The registry JSON only carries primer sequences, NOT construct
// sequences (those live in .dna files on Drive that a static web client
// cannot reach). So construct linkage is derived through
// primer_sets[].members.

const COMPLEMENT = { A: "T", T: "A", C: "G", G: "C", N: "N" };

export function reverseComplement(seq) {
  let out = "";
  for (let i = seq.length - 1; i >= 0; i--) {
    out += COMPLEMENT[seq[i]] || "N";
  }
  return out;
}

/**
 * Strip non-ACGTN characters and uppercase. Returns "" for null/undefined.
 * Tolerates whitespace, FASTA headers (>...), digits, and IUPAC ambiguity
 * codes (treated as N).
 */
export function normalizeDna(s) {
  if (!s) return "";
  // Strip FASTA headers if present.
  const noHeader = s.replace(/^>.*$/gm, "");
  return noHeader.toUpperCase().replace(/[^ACGT]/g, (c) => (/\s|\d/.test(c) ? "" : "N"));
}

/**
 * Search every primer for a relationship to the query. Returns an array
 * of hits, each describing kind + orientation + offsets.
 *
 *   kind = "exact"            primer.sequence === query (or revcomp)
 *   kind = "query-in-primer"  query is a substring of primer
 *   kind = "primer-in-query"  primer is a substring of query
 *
 * orientation = "fwd" | "rev" describes which orientation matched
 * (rev = primer matched the reverse-complement of query, OR equivalently
 * query matched the reverse-complement of primer).
 *
 * For a single primer/query pair, only the *strongest* hit is returned
 * (exact > containment), so a primer that is identical to the query
 * doesn't also show up as "query-in-primer".
 *
 * @param {string} rawQuery  user-entered sequence
 * @param {Array<{id:string,sequence?:string}>} primers
 * @param {{minLen?: number}} opts  minimum query length to bother
 *   searching (defaults to 8 — shorter queries hit too noisily)
 */
export function searchPrimersBySequence(rawQuery, primers, opts = {}) {
  const minLen = opts.minLen ?? 8;
  const q = normalizeDna(rawQuery);
  if (q.length < minLen) return [];
  const qRc = reverseComplement(q);

  const hits = [];
  for (const p of primers || []) {
    const seq = normalizeDna(p.sequence);
    if (!seq) continue;
    const hit = bestHit(p, seq, q, qRc);
    if (hit) hits.push(hit);
  }
  // Sort by kind priority then by id for stable display.
  return hits.sort(compareHits);
}

const KIND_PRIORITY = { exact: 0, "query-in-primer": 1, "primer-in-query": 2 };

function compareHits(a, b) {
  const k = KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind];
  if (k !== 0) return k;
  // Within the same kind, prefer forward orientation, then primer id.
  if (a.orientation !== b.orientation) return a.orientation === "fwd" ? -1 : 1;
  return a.primer.id.localeCompare(b.primer.id);
}

function bestHit(primer, seq, q, qRc) {
  // Exact match first (cheapest, strongest signal).
  if (seq === q) return mkHit(primer, "exact", "fwd", 0, seq.length, 0, q.length);
  if (seq === qRc) return mkHit(primer, "exact", "rev", 0, seq.length, 0, q.length);
  // Query is a substring of the primer (user pasted a partial primer).
  let i = seq.indexOf(q);
  if (i >= 0) return mkHit(primer, "query-in-primer", "fwd", i, i + q.length, 0, q.length);
  i = seq.indexOf(qRc);
  if (i >= 0) return mkHit(primer, "query-in-primer", "rev", i, i + qRc.length, 0, q.length);
  // Primer is a substring of the query (user pasted a longer region).
  i = q.indexOf(seq);
  if (i >= 0) return mkHit(primer, "primer-in-query", "fwd", 0, seq.length, i, i + seq.length);
  i = qRc.indexOf(seq);
  if (i >= 0) {
    // primer matched the revcomp of query → primer-in-query, rev orientation
    // map back to query coordinates: positions in qRc correspond to
    // (q.length - end .. q.length - start) in q.
    const qStartFwd = q.length - (i + seq.length);
    const qEndFwd = q.length - i;
    return mkHit(primer, "primer-in-query", "rev", 0, seq.length, qStartFwd, qEndFwd);
  }
  return null;
}

function mkHit(primer, kind, orientation, primerStart, primerEnd, queryStart, queryEnd) {
  return { primer, kind, orientation, primerStart, primerEnd, queryStart, queryEnd };
}


/**
 * For each hit, attach the construct ids that reference the matched
 * primer (via primer_sets[].members + construct.primer_set). Returns a
 * new array of hits with `linkedConstructIds: string[]` added.
 */
export function annotateHitsWithConstructs(hits, primerSets, constructs) {
  // Build primer_id -> [primer_set_ids] index.
  const primerToSets = {};
  for (const ps of primerSets || []) {
    for (const m of ps.members || []) {
      (primerToSets[m] ||= []).push(ps.id);
    }
  }
  // Build primer_set_id -> [construct_ids] index.
  const setToConstructs = {};
  for (const c of constructs || []) {
    if (!c.primer_set) continue;
    (setToConstructs[c.primer_set] ||= []).push(c.id);
  }
  return hits.map((h) => {
    const setIds = primerToSets[h.primer.id] || [];
    const constructIds = [...new Set(setIds.flatMap((sid) => setToConstructs[sid] || []))];
    return { ...h, linkedPrimerSetIds: setIds, linkedConstructIds: constructIds };
  });
}
