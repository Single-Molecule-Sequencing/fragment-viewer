// src/lib/biology.js — Cas9 biology + automated peak classifier (pure JS).
//
// Extracted from FragmentViewer.jsx per issue #13 (Phase B.2). No React,
// no DOM. All gRNA scanning, PAM finding, cut-product prediction, and the
// classifyPeaks automated identifier live here. Dependencies: only
// lib/grna_catalog.js (for matchLabCatalog + LAB_GRNA_CATALOG) which is
// imported where needed.

import { matchLabCatalog, LAB_GRNA_CATALOG } from "./grna_catalog.js";
import { SAMPLE_DYES, CONSTRUCT } from "./constants.js";

// Pure helper: sum component sizes for a product (assembly or partial).
// classifyPeaks uses this internally; kept local to biology.js so the
// module is self-contained.
export function productSize(product, componentSizes) {
  let sum = 0;
  for (const k of product.parts) sum += componentSizes[k] || 0;
  return sum;
}

// ----------------------------------------------------------------------
// Cas9 gRNA / PAM / cut-site prediction
// ----------------------------------------------------------------------
export function reverseComplement(s) {
  const m = { A: "T", T: "A", G: "C", C: "G", N: "N" };
  return s.toUpperCase().split("").reverse().map(c => m[c] || c).join("");
}

// Find all gRNA candidates in the target region. Returns list of objects:
// { id, strand, pam_seq, protospacer, target_pos, cut_construct }
// where cut_construct = last position in the LEFT fragment (top-strand cut position).
export function findGrnas(fullConstruct, targetStart, targetEnd) {
  const seq = fullConstruct.toUpperCase();
  const targetSeq = seq.substring(targetStart - 1, targetEnd);  // 0-indexed slice
  const out = [];
  let id = 0;

  // Top-strand PAMs: NGG on top strand 5' to 3'
  for (let i = 0; i <= targetSeq.length - 23; i++) {
    const t = targetSeq.substring(i + 20, i + 23);
    if (t.length === 3 && t[1] === "G" && t[2] === "G") {
      const proto = targetSeq.substring(i, i + 20);
      // Cut is 3 bp 5' of PAM: between protospacer positions 17 and 18.
      // In the target, cut is between target positions (i+17) and (i+18) using 0-indexed.
      // Equivalently, last base of LEFT fragment = target position (i+17) 0-indexed = (i+18) 1-indexed.
      const cutTargetPos = i + 17 + 1;  // 1-indexed last base of LEFT in target coords
      const cutConstruct = cutTargetPos + targetStart - 1;  // convert to construct coords
      out.push({
        id: id++,
        strand: "top",
        pam_seq: t,
        protospacer: proto,
        target_pos: i + 1,
        cut_construct: cutConstruct,
      });
    }
  }

  // Bot-strand PAMs: CCN on top strand = NGG on bot strand 5' to 3'
  for (let i = 0; i <= targetSeq.length - 23; i++) {
    const t = targetSeq.substring(i, i + 3);
    if (t[0] === "C" && t[1] === "C") {
      // Protospacer on bot is 20 bp 3' of CCN on top.
      const protoOnTop = targetSeq.substring(i + 3, i + 23);
      if (protoOnTop.length < 20) continue;
      const proto = reverseComplement(protoOnTop);   // bot strand 5' to 3'
      const pam_seq = reverseComplement(t);           // NGG on bot strand 5' to 3'
      // Cut on bot is 3 bp 5' of PAM on bot = 3 bp 3' of CCN on top.
      // Cut between top positions (i+5) and (i+6), 0-indexed.
      // Last base of LEFT fragment on top = (i+5) 0-indexed = (i+6) 1-indexed.
      const cutTargetPos = i + 5 + 1;
      const cutConstruct = cutTargetPos + targetStart - 1;
      out.push({
        id: id++,
        strand: "bot",
        pam_seq,
        protospacer: proto,
        target_pos: i + 1,
        cut_construct: cutConstruct,
      });
    }
  }
  return out;
}

// Predict ssDNA products from a Cas9 cut.
// overhang_nt > 0 means 5' overhang of N nt (top cut at cut_construct, bot cut at cut_construct + N)
// overhang_nt = 0 means blunt cut.
export function predictCutProducts(grna, constructSize, overhang_nt = 0) {
  const X = grna.cut_construct;  // 1-indexed last base of LEFT fragment on TOP strand
  const topLeft  = X;
  const topRight = constructSize - X;
  const botLeft  = X + overhang_nt;            // bot cut is further right for 5' overhang
  const botRight = constructSize - X - overhang_nt;

  const pamOnTop = grna.strand === "top";
  // PAM-proximal = fragment containing PAM.
  // PAM on top: PAM is 3' of cut, so RIGHT fragment has PAM -> RIGHT = proximal, LEFT = distal.
  // PAM on bot: PAM (as CCN on top) is 5' of cut on top strand coords, so LEFT fragment contains CCN -> LEFT = proximal.
  const leftIsProximal = !pamOnTop;
  // Non-template = strand with 5'-NGG-3'; template = complementary strand.
  // PAM on top -> top is non-template. PAM on bot -> bot is non-template.
  const topIsNonTemplate = pamOnTop;

  return {
    Y: { length: topLeft,  fragment: "LEFT",  strand: "top", template: topIsNonTemplate ? "non-template" : "template",     pam_side: leftIsProximal ? "proximal" : "distal" },
    B: { length: botLeft,  fragment: "LEFT",  strand: "bot", template: topIsNonTemplate ? "template"     : "non-template", pam_side: leftIsProximal ? "proximal" : "distal" },
    R: { length: topRight, fragment: "RIGHT", strand: "top", template: topIsNonTemplate ? "non-template" : "template",     pam_side: leftIsProximal ? "distal"   : "proximal" },
    G: { length: botRight, fragment: "RIGHT", strand: "bot", template: topIsNonTemplate ? "template"     : "non-template", pam_side: leftIsProximal ? "distal"   : "proximal" },
  };
}

// Auto-pick the gRNA whose predicted cut products best match a sample's observed or expected peaks.
function autoPickGrna(grnas, observed, constructSize, overhangsToTry = [0, 1, 4]) {
  let best = null;
  for (const g of grnas) {
    for (const oh of overhangsToTry) {
      const products = predictCutProducts(g, constructSize, oh);
      let score = 0; let count = 0;
      for (const d of SAMPLE_DYES) {
        const obs = observed[d];
        if (obs === null || obs === undefined) continue;
        score += Math.abs(products[d].length - obs);
        count++;
      }
      if (count < 2) continue;
      score /= count;
      if (!best || score < best.score) {
        best = { grna: g, overhang: oh, products, score };
      }
    }
  }
  return best;
}

// Validate a custom gRNA sequence against the target: find the protospacer match and its PAM.
function locateCustomGrna(grnaSeq, fullConstruct, targetStart, targetEnd) {
  const g = grnaSeq.toUpperCase().replace(/U/g, "T").replace(/[^ACGT]/g, "");
  if (g.length !== 20) return { ok: false, error: "gRNA must be exactly 20 nt" };
  const seq = fullConstruct.toUpperCase();
  const targetSeq = seq.substring(targetStart - 1, targetEnd);

  // Search on top strand for grna + NGG
  const topIdx = targetSeq.indexOf(g);
  if (topIdx >= 0 && topIdx + 22 < targetSeq.length) {
    const pam = targetSeq.substring(topIdx + 20, topIdx + 23);
    if (pam.length === 3 && pam[1] === "G" && pam[2] === "G") {
      return {
        ok: true,
        grna: {
          id: -1, strand: "top", pam_seq: pam, protospacer: g,
          target_pos: topIdx + 1,
          cut_construct: topIdx + 17 + 1 + targetStart - 1,
        },
      };
    }
  }
  // Search on bot strand (reverse complement of grna in the target)
  const grc = reverseComplement(g);
  const botIdx = targetSeq.indexOf(grc);
  if (botIdx >= 3) {
    const pamOnTop = targetSeq.substring(botIdx - 3, botIdx);
    if (pamOnTop.length === 3 && pamOnTop[0] === "C" && pamOnTop[1] === "C") {
      return {
        ok: true,
        grna: {
          id: -1, strand: "bot", pam_seq: reverseComplement(pamOnTop), protospacer: g,
          target_pos: botIdx - 3 + 1,
          cut_construct: botIdx - 3 + 5 + 1 + targetStart - 1,
        },
      };
    }
  }
  return { ok: false, error: "Protospacer not found adjacent to a PAM in target region" };
}



// ----------------------------------------------------------------------
// LAB gRNA CATALOG
// Curated list of gRNAs used by the Athey Lab / Single-Molecule Sequencing project.
// Each entry links an ordered gRNA name to its 20-nt protospacer (5' to 3' of the spacer).
// The viewer cross-references candidate gRNAs in the target region against this catalog
// and highlights matches; the auto-pick function biases toward catalog members.
//
// Sources:
//   - pilot_grna_positions.bed (CYP2D6 upstream/downstream panel, chr22)
//   - V059_gRNA3 construct (SnapGene file) -- the active fragment analysis construct
//   - Fireflies transcripts: Cas9 Subgroup Weekly Meeting 2026-03-20, 2026-02-13, 2026-01-30
//
// To add a new gRNA, append an entry below with: name, spacer (20 nt, 5'-to-3'),
// source_strand ("top"/"bot"/"unknown" relative to the canonical construct or locus),
// target (text describing the biological target), and notes (free text).
// ----------------------------------------------------------------------
// ======================================================================
// Automated Peak Classifier
// ----------------------------------------------------------------------
// For each dye channel in a sample:
//   1. Filter peaks above height threshold (noise floor)
//   2. Apply per-dye mobility offset (calibration)
//   3. Build prediction set: all gRNAs x overhang chemistries + assembly products
//   4. For each observed peak, find nearest prediction (within matchTol bp)
//   5. Cluster peaks within clusterTol bp: they represent the same underlying
//      species with different chemistries (e.g., blunt vs 3 nt overhang)
//   6. Report per cluster: main peak, member peaks with relative size and
//      abundance, best-guess identity, chemistry interpretation
// ======================================================================

// classifyPeaks accepts either the legacy 13-positional signature (for
// backward compat) or an options object. Options form — preferred:
//   classifyPeaks({
//     sampleData, constructSeq, targetStart, targetEnd, constructSize,
//     componentSizes, assemblyProducts, grnaCatalog, dyeOffsets,
//     heightThreshold, matchTol, clusterTol, overhangsToConsider,
//   })
// The positional legacy form is preserved by detecting a first-arg object
// with the shape of sampleData (per-dye arrays). (Issue #9 fix.)
export function classifyPeaks(sampleData, constructSeq, targetStart, targetEnd, constructSize, componentSizes, assemblyProducts, grnaCatalog, dyeOffsets, heightThreshold, matchTol, clusterTol, overhangsToConsider) {
  // Detect options-object call form: first arg has construct/target fields
  // but no per-dye peak arrays at the top level (sampleData has B/G/Y/R).
  if (sampleData && typeof sampleData === "object" && !Array.isArray(sampleData.B) && !Array.isArray(sampleData.G) && "sampleData" in sampleData) {
    const o = sampleData;
    return classifyPeaks(
      o.sampleData, o.constructSeq, o.targetStart, o.targetEnd, o.constructSize,
      o.componentSizes, o.assemblyProducts, o.grnaCatalog, o.dyeOffsets,
      o.heightThreshold, o.matchTol, o.clusterTol, o.overhangsToConsider,
    );
  }
  const grnas = findGrnas(constructSeq, targetStart, targetEnd);

  // Pre-compute all predictions per dye. Predictions are { size, label, kind, detail }
  const predictionsByDye = { B: [], G: [], Y: [], R: [] };

  for (const g of grnas) {
    const catMatch = matchLabCatalog(g, grnaCatalog || LAB_GRNA_CATALOG);
    const baseName = catMatch ? catMatch.name : ("cand_" + g.id);
    for (const oh of overhangsToConsider) {
      const pr = predictCutProducts(g, constructSize, oh);
      for (const d of ["B", "G", "Y", "R"]) {
        const p = pr[d];
        predictionsByDye[d].push({
          size: p.length,
          label: baseName + " " + (oh === 0 ? "blunt" : (oh > 0 ? "+" + oh + "nt OH" : oh + "nt OH")),
          kind: "cas9_cut",
          grnaId: g.id,
          grnaName: baseName,
          strand: g.strand,
          overhang: oh,
          fragment: p.fragment,
          template: p.template,
          pam_side: p.pam_side,
          inCatalog: !!catMatch,
          targetPos: g.target_pos,
        });
      }
    }
  }

  for (const prod of assemblyProducts) {
    const sz = productSize(prod, componentSizes);
    for (const d of prod.dyes || []) {
      if (d in predictionsByDye) {
        predictionsByDye[d].push({
          size: sz,
          label: prod.name,
          kind: "assembly",
          productId: prod.id,
          inCatalog: false,
        });
      }
    }
  }

  // Now classify each dye channel
  const out = {};
  for (const dye of ["B", "G", "Y", "R"]) {
    const raw = (sampleData && sampleData[dye]) || [];
    const offset = (dyeOffsets && dyeOffsets[dye]) || 0;

    // Each peak: [size, height, area, width]. Apply offset.
    const filtered = raw
      .filter(p => p[1] >= heightThreshold)
      .map(p => ({
        rawSize: p[0],
        size: p[0] - offset,       // corrected
        height: p[1],
        area: p[2],
        width: p[3],
      }));

    const totalArea = filtered.reduce((s, p) => s + p.area, 0) || 1;

    const preds = predictionsByDye[dye];

    // Annotate each peak with its best predicted match
    for (const p of filtered) {
      const within = preds
        .map(pp => ({ pred: pp, delta: p.size - pp.size }))
        .filter(x => Math.abs(x.delta) <= matchTol)
        .sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta));
      p.bestMatch = within[0] || null;
      p.altMatches = within.slice(1, 4);
    }

    // Cluster: sort by size, group peaks whose consecutive gap <= clusterTol
    filtered.sort((a, b) => a.size - b.size);
    const clusters = [];
    let cur = null;
    for (const p of filtered) {
      if (!cur || (p.size - cur.lastSize) > clusterTol) {
        cur = { peaks: [], areaSum: 0, mainHeight: 0, main: null, lastSize: p.size };
        clusters.push(cur);
      }
      cur.peaks.push(p);
      cur.areaSum += p.area;
      cur.lastSize = p.size;
      if (p.height > cur.mainHeight) {
        cur.main = p;
        cur.mainHeight = p.height;
      }
    }

    // Compute per-cluster metrics
    for (const c of clusters) {
      c.channelAbundance = c.areaSum / totalArea;
      c.mainSize = c.main.size;
      for (const p of c.peaks) {
        p.relSize = p.size - c.mainSize;      // signed: + = larger, - = smaller
        p.relAbundance = p.area / c.areaSum;  // within-cluster fraction
      }
      // Pick best cluster-level identity: vote by closest match among all member peaks
      const voteMap = new Map();
      for (const p of c.peaks) {
        if (p.bestMatch) {
          const key = p.bestMatch.pred.kind === "cas9_cut"
            ? (p.bestMatch.pred.grnaName + "|" + p.bestMatch.pred.fragment)
            : p.bestMatch.pred.label;
          const w = p.area * (1 / (1 + Math.abs(p.bestMatch.delta)));
          const existing = voteMap.get(key);
          voteMap.set(key, existing
            ? { w: existing.w + w, pred: existing.pred }
            : { w, pred: p.bestMatch.pred });
        }
      }
      let bestIdentity = null;
      let bestW = 0;
      for (const [, v] of voteMap) {
        if (v.w > bestW) { bestW = v.w; bestIdentity = v.pred; }
      }
      c.identity = bestIdentity;

      // Chemistry interpretation: look at rel sizes of member peaks vs main
      // If main is closest-to-blunt (oh=0) and other members are +N or -N, those are chemistry variants
      c.chemistryNotes = [];
      for (const p of c.peaks) {
        if (!p.bestMatch) continue;
        const pr = p.bestMatch.pred;
        if (pr.kind === "cas9_cut") {
          const oh = pr.overhang;
          const sign = oh === 0 ? "blunt" : (oh > 0 ? (oh + " nt 5' overhang (longer strand)") : (Math.abs(oh) + " nt 3' overhang or other"));
          c.chemistryNotes.push({
            size: p.size,
            relSize: p.relSize,
            relAbundance: p.relAbundance,
            interp: pr.grnaName + " " + sign + " (Δ=" + p.bestMatch.delta.toFixed(2) + " bp)",
            kind: pr.kind,
          });
        } else {
          c.chemistryNotes.push({
            size: p.size,
            relSize: p.relSize,
            relAbundance: p.relAbundance,
            interp: pr.label + " (Δ=" + p.bestMatch.delta.toFixed(2) + " bp)",
            kind: pr.kind,
          });
        }
      }
    }

    out[dye] = {
      clusters,
      totalArea,
      nPeaks: filtered.length,
      dyeOffset: offset,
    };
  }

  return out;
}

// ----------------------------------------------------------------------
// componentSizesFrom: given a CONSTRUCT object (from lib/constants.js),
// return a { key: size } map usable as the `componentSizes` prop driving
// productSize() across the app.
// ----------------------------------------------------------------------
export function componentSizesFrom(construct) {
  const map = {};
  for (const c of construct.components) map[c.key] = c.size;
  return map;
}
