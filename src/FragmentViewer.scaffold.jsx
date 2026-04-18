import { useState, useMemo, useRef, useEffect } from "react";
import {
  Activity, Crosshair, Scissors, Layers, GitCompare,
  Upload, Database, Microscope, FileDown, RotateCcw,
  CheckCircle2, AlertTriangle, ChevronRight, ExternalLink,
} from "lucide-react";

// ----------------------------------------------------------------------
// Design system — small set of primitives reused across tabs.
// Built on Tailwind (configured in tailwind.config.js with dye accents).
// ----------------------------------------------------------------------

// Wrapper card: rounded, subtle shadow, optional header with title + actions.
export function Panel({ title, subtitle, actions, children, className = "", padded = true }) {
  return (
    <section className={`bg-white rounded-xl border border-zinc-200 shadow-soft overflow-hidden ${className}`}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 px-4 py-3 border-b border-zinc-100">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-zinc-900 tracking-tight truncate">{title}</h2>}
            {subtitle && <p className="text-xs text-zinc-500 mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-1.5 shrink-0">{actions}</div>}
        </header>
      )}
      <div className={padded ? "p-4" : ""}>{children}</div>
    </section>
  );
}

// Big-number metric tile.
export function Stat({ label, value, hint, tone = "default" }) {
  const toneCls = {
    default: "text-zinc-900",
    sky: "text-sky-700",
    emerald: "text-emerald-700",
    amber: "text-amber-700",
    rose: "text-rose-700",
  }[tone] || "text-zinc-900";
  return (
    <div className="px-3 py-2.5 rounded-lg bg-zinc-50 border border-zinc-100">
      <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`mt-0.5 text-xl font-semibold tracking-tight num ${toneCls}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-zinc-500">{hint}</div>}
    </div>
  );
}

// Inline rounded label; optional accent color.
export function Pill({ children, tone = "neutral", className = "" }) {
  const tones = {
    neutral: "bg-zinc-100 text-zinc-700 border-zinc-200",
    sky:     "bg-sky-50 text-sky-700 border-sky-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber:   "bg-amber-50 text-amber-800 border-amber-200",
    rose:    "bg-rose-50 text-rose-700 border-rose-200",
    dark:    "bg-zinc-900 text-zinc-100 border-zinc-900",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium rounded border ${tones[tone] || tones.neutral} ${className}`}>
      {children}
    </span>
  );
}

// Color-coded dye reference. Use anywhere a dye letter appears so users
// associate the channel with its color throughout the viewer.
export function DyeChip({ dye, showLabel = false, className = "" }) {
  const palette = { B: "#1e6fdb", G: "#16a34a", Y: "#ca8a04", R: "#dc2626", O: "#ea580c" };
  const label   = { B: "6-FAM",   G: "HEX",     Y: "TAMRA",   R: "ROX",     O: "GS500LIZ" };
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span aria-hidden className="w-2.5 h-2.5 rounded-full ring-1 ring-inset ring-black/10" style={{ background: palette[dye] || "#94a3b8" }} />
      <span className="text-xs font-mono text-zinc-700">{dye}</span>
      {showLabel && <span className="text-[11px] text-zinc-500">{label[dye] || dye}</span>}
    </span>
  );
}

// Form field wrapper: label + input. Pass <input> / <select> as children.
export function Field({ label, hint, children, className = "" }) {
  return (
    <label className={`flex flex-col gap-1 text-xs ${className}`}>
      <span className="font-medium text-zinc-700">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-zinc-500">{hint}</span>}
    </label>
  );
}

// Standard button used in chrome + tab toolbars.
export function ToolButton({ icon: Icon, children, onClick, title, variant = "ghost", size = "sm", type = "button", className = "" }) {
  const variants = {
    primary: "bg-zinc-900 text-white hover:bg-zinc-800",
    secondary: "bg-zinc-100 text-zinc-800 hover:bg-zinc-200 border border-zinc-200",
    ghost:   "text-zinc-700 hover:text-zinc-900 hover:bg-zinc-100",
    dark:    "text-zinc-300 hover:text-white hover:bg-zinc-800",
    danger:  "bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200",
  };
  const sizes = { sm: "px-2 py-1 text-xs gap-1.5", md: "px-3 py-1.5 text-sm gap-2" };
  return (
    <button
      type={type}
      onClick={onClick}
      title={title}
      className={`inline-flex items-center font-medium rounded-md transition focus-ring ${variants[variant] || variants.ghost} ${sizes[size] || sizes.sm} ${className}`}
    >
      {Icon && <Icon size={size === "md" ? 16 : 14} />}
      {children && <span>{children}</span>}
    </button>
  );
}

// ----------------------------------------------------------------------
// GeneMapper TSV parser (browser-side; mirrors scripts/build_artifact.py)
// ----------------------------------------------------------------------
export function parseGenemapperTSV(text) {
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return { peaks: {} };
  const header = lines[0].split("\t").map(h => h.trim());
  const idx = (k) => header.findIndex(h => h.toLowerCase() === k.toLowerCase());
  const ci = {
    sample: idx("Sample Name") >= 0 ? idx("Sample Name") : idx("SampleName"),
    dye:    idx("Dye/Sample Peak") >= 0 ? idx("Dye/Sample Peak") : idx("Dye"),
    size:   idx("Size"),
    height: idx("Height"),
    area:   idx("Area"),
    width:  idx("Width in BP") >= 0 ? idx("Width in BP") : idx("Width"),
  };
  if (ci.sample < 0 || ci.dye < 0 || ci.size < 0) {
    throw new Error("Header missing one of: Sample Name, Dye/Sample Peak, Size");
  }
  const peaks = {};
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split("\t");
    if (row.length <= ci.sample) continue;
    const sample = (row[ci.sample] || "").trim();
    const dyeFull = (row[ci.dye] || "").trim();
    const dye = dyeFull.split(",")[0].trim().toUpperCase();
    if (!sample || !dye) continue;
    const size = parseFloat(row[ci.size]);
    if (!Number.isFinite(size)) continue;
    const height = parseFloat(row[ci.height]) || 0;
    const area = parseFloat(row[ci.area]) || 0;
    const width = parseFloat(row[ci.width]) || 1;
    if (!peaks[sample]) peaks[sample] = {};
    if (!peaks[sample][dye]) peaks[sample][dye] = [];
    peaks[sample][dye].push([
      Math.round(size * 100) / 100,
      Math.round(height * 10) / 10,
      Math.round(area * 10) / 10,
      Math.round(width * 1000) / 1000,
    ]);
  }
  return { peaks };
}

// ----------------------------------------------------------------------
// Drag-drop zone for new GeneMapper TSV exports.
// Listens for drag events anywhere in the window and lights up only while
// a file is being dragged. On drop, parses the TSV and calls onData. The
// toolbar Upload button uses the same handleFiles via a ref; see Toolbar.
// ----------------------------------------------------------------------
function DropOverlay({ onData }) {
  const [active, setActive] = useState(false);
  const [error, setError] = useState(null);

  const handleFiles = async (files) => {
    setError(null);
    if (!files || files.length === 0) return;
    const f = files[0];
    try {
      const text = await f.text();
      const parsed = parseGenemapperTSV(text);
      if (Object.keys(parsed.peaks).length === 0) {
        setError("No samples found. Is this a GeneMapper TSV export?");
        return;
      }
      onData(parsed.peaks);
    } catch (e) {
      setError(e.message || "Failed to parse file");
    }
  };

  useEffect(() => {
    let depth = 0;
    const onEnter = (e) => { e.preventDefault(); depth++; if (e.dataTransfer?.types?.includes("Files")) setActive(true); };
    const onLeave = (e) => { e.preventDefault(); depth--; if (depth <= 0) { setActive(false); depth = 0; } };
    const onOver  = (e) => { e.preventDefault(); };
    const onDrop  = (e) => { e.preventDefault(); depth = 0; setActive(false); handleFiles(e.dataTransfer?.files); };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  // Auto-clear errors after 4 s
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(t);
  }, [error]);

  return (
    <>
      {active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none no-print">
          <div className="absolute inset-0 bg-sky-500/10 backdrop-blur-[1px]" />
          <div className="relative px-8 py-6 rounded-2xl border-2 border-dashed border-sky-500 bg-white shadow-2xl max-w-md mx-4">
            <div className="flex items-center gap-3 text-sky-700">
              <div className="p-2 rounded-lg bg-sky-50">
                <Upload size={20} />
              </div>
              <div>
                <div className="text-base font-semibold tracking-tight">Drop to load dataset</div>
                <div className="text-xs text-zinc-500 mt-0.5">GeneMapper or PeakScanner TSV export (.txt, .tsv, .csv)</div>
              </div>
            </div>
          </div>
        </div>
      )}
      {error && (
        <div className="fixed bottom-10 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-600 text-white text-xs shadow-xl no-print">
          <AlertTriangle size={14} />
          <span>{error}</span>
        </div>
      )}
    </>
  );
}

// Compact upload button used by the Toolbar. Mirrors DropOverlay's parser.
function UploadButton({ onData }) {
  const inputRef = useRef(null);
  return (
    <>
      <ToolButton
        icon={Upload}
        variant="dark"
        title="Load a GeneMapper TSV export (drag-drop also works anywhere in the window)"
        onClick={() => inputRef.current?.click()}
      >
        Load TSV
      </ToolButton>
      <input
        ref={inputRef}
        type="file"
        accept=".txt,.tsv,.csv"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            const parsed = parseGenemapperTSV(await f.text());
            if (Object.keys(parsed.peaks).length > 0) onData(parsed.peaks);
          } catch (err) {
            console.error("[fragment-viewer] TSV parse failed:", err);
          }
          e.target.value = "";
        }}
        className="hidden"
      />
    </>
  );
}

// ======================================================================
// DATA — peak table, shipped as a JS literal by the build step
// ======================================================================
const DATA = __DATA__;

// ======================================================================
// CONSTANTS — dyes, size standard, lab defaults
// ======================================================================
const DYE = {
  B: { name: "6-FAM", color: "#1e6fdb", label: "Blue",   adapter: 1, pair: "Y" },
  G: { name: "HEX",   color: "#2e9e4a", label: "Green",  adapter: 2, pair: "R" },
  Y: { name: "TAMRA", color: "#b8860b", label: "Yellow", adapter: 1, pair: "B" },
  R: { name: "ROX",   color: "#d32f2f", label: "Red",    adapter: 2, pair: "G" },
  O: { name: "LIZ",   color: "#ef6c00", label: "Orange", adapter: null, pair: null },
};
const DYE_ORDER = ["B", "G", "Y", "R", "O"];
const SAMPLE_DYES = ["B", "G", "Y", "R"];
const LIZ_LADDER = [35, 50, 75, 100, 139, 150, 160, 200, 250, 300, 340, 350, 400, 450, 490, 500];

// Lab-known cut chemistry presets (derived from CLC protocol and Cas9 cut geometry)
const CHEMISTRY_PRESETS = [
  { id: "blunt_both",  name: "Blunt cuts on both ends",                                  B: 0, Y: 0, G: 0, R: 0 },
  { id: "blunt_ad1",   name: "Blunt at Adapter 1 end, 4-nt overhang at Adapter 2 end (Cas9 + BsaI)", B: 0, Y: 0, G: 0, R: 4 },
  { id: "blunt_ad2",   name: "4-nt overhang at Adapter 1 end, blunt at Adapter 2 end (BsaI + Cas9)", B: 0, Y: 4, G: 0, R: 0 },
  { id: "oh4_both",    name: "4-nt 5' overhang at both ends (BsaI on both sides)",       B: 0, Y: 4, G: 0, R: 4 },
  { id: "oh1_both",    name: "1-nt 5' overhang at both ends (Cas9 staggered)",           B: 0, Y: 1, G: 0, R: 1 },
];

// ----------------------------------------------------------------------
// CONSTRUCT MODEL — from the SnapGene file V059_gRNA3_Ligated_to_Bridge_Oligos_and_Fluorescent_Adapters.dna
// 226 bp total, linear ligated product.
// Fluor Adapter 1 carries 6-FAM (Blue) + TAMRA (Yellow).
// Fluor Adapter 2 carries HEX (Green) + ROX (Red).
// ----------------------------------------------------------------------
export const CONSTRUCT = {
  total: 226,
  // Full 226 bp construct sequence from the SnapGene file (top strand 5' to 3').
  seq: "CGTACGATGCGTACGACCGATGCCAGGAGACGTGCTGAGGTCCATAGCCTGGACGCTCAGTCGGCAGGTGCCAGAACGTTCCCTGGGAAGGCCCCATGGAAGCCCAGGACTGAGCCACCACCCTCAGCCTCGTCACCTCACCACAGGACTGGCTACCTCTCTGGGCCCTCAGGGATCCAATCGAGTCGCAGGTACCCAGCGGCGATCCGATGACCGTACGTCGACC",
  targetRange: { start: 55, end: 172 },   // 1-indexed, inclusive (118 bp target region)
  components: [
    { key: "ad1",    name: "Fluor Adapter 1", size: 25,  color: "#1e6fdb", dyes: ["B", "Y"] },
    { key: "oh1",    name: "Overhang 1",      size: 4,   color: "#94a3b8", dyes: [] },
    { key: "br1",    name: "Bridge Oligo 1",  size: 25,  color: "#64748b", dyes: [] },
    { key: "target", name: "Target",          size: 118, color: "#334155", dyes: [] },
    { key: "br2",    name: "Bridge Oligo 2",  size: 25,  color: "#64748b", dyes: [] },
    { key: "oh2",    name: "Overhang 2",      size: 4,   color: "#94a3b8", dyes: [] },
    { key: "ad2",    name: "Fluor Adapter 2", size: 25,  color: "#d32f2f", dyes: ["G", "R"] },
  ],
};

// ----------------------------------------------------------------------
// FLUOROPHORE STRAND MAP
// Dyes, strands, and construct positions (verified against the SnapGene file oligos).
// TAMRA  = Oligo A (25 nt) - TOP strand 5' end, at construct position 1
// 6-FAM  = Oligo B (29 nt) - BOT strand 3' end, at construct position 1
// HEX    = Oligo C (25 nt) - BOT strand 5' end, at construct position 226
// ROX    = Oligo D (29 nt) - TOP strand 3' end, at construct position 226
// ----------------------------------------------------------------------
export const DYE_STRAND = {
  B: { strand: "bot", fragment: "left",  end: "3'", pos: 1,   oligoLen: 29 },  // 6-FAM
  Y: { strand: "top", fragment: "left",  end: "5'", pos: 1,   oligoLen: 25 },  // TAMRA
  G: { strand: "bot", fragment: "right", end: "5'", pos: 226, oligoLen: 25 },  // HEX
  R: { strand: "top", fragment: "right", end: "3'", pos: 226, oligoLen: 29 },  // ROX
};

// Possible assembly products. Each specifies which components are present and which dyes are predicted to appear.
export const ASSEMBLY_PRODUCTS = [
  { id: "full",           name: "Full ligation (all 5 parts)",            parts: ["ad1","oh1","br1","target","br2","oh2","ad2"], dyes: ["B","Y","G","R"] },
  { id: "no_ad2",         name: "Missing Adapter 2 (everything except Ad2)", parts: ["ad1","oh1","br1","target","br2","oh2"],        dyes: ["B","Y"] },
  { id: "no_ad1",         name: "Missing Adapter 1 (everything except Ad1)", parts: ["oh1","br1","target","br2","oh2","ad2"],        dyes: ["G","R"] },
  { id: "ad1_br1_target", name: "Ad1 + Br1 + Target only",                    parts: ["ad1","oh1","br1","target"],                    dyes: ["B","Y"] },
  { id: "target_ad2",     name: "Target + Br2 + Ad2 only",                    parts: ["target","br2","oh2","ad2"],                    dyes: ["G","R"] },
  { id: "target_bridges", name: "Target + both bridges (no adapters)",        parts: ["br1","target","br2"],                          dyes: [] },
  { id: "target_only",    name: "Target only (unligated, released)",          parts: ["target"],                                      dyes: [] },
  { id: "adapter_dimer",  name: "Ad1 + Ad2 (no insert)",                      parts: ["ad1","oh1","oh2","ad2"],                        dyes: ["B","Y","G","R"] },
];



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

export function classifyPeaks(sampleData, constructSeq, targetStart, targetEnd, constructSize, componentSizes, assemblyProducts, grnaCatalog, dyeOffsets, heightThreshold, matchTol, clusterTol, overhangsToConsider) {
  const grnas = findGrnas(constructSeq, targetStart, targetEnd);

  // Pre-compute all predictions per dye. Predictions are { size, label, kind, detail }
  const predictionsByDye = { B: [], G: [], Y: [], R: [] };

  for (const g of grnas) {
    const catMatch = matchLabCatalog(g);
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

export const LAB_GRNA_CATALOG = [
  // --- Active fragment analysis construct (V059_gRNA3) ---
  { name: "V059_gRNA3",             spacer: "",                         source: "SnapGene V059_gRNA3 file",  target: "V059 synthetic target (118 bp)", notes: "Active gRNA used in the capillary electrophoresis dataset; exact spacer TBD by user." },

  // --- CYP2D6 pilot panel (chr22, GRCh38) ---
  // Coordinates from pilot_grna_positions.bed; sequences to be filled in from the GRCh38 reference
  { name: "CYP2D6_upstream_1",      spacer: "",   source: "pilot_grna_positions.bed",  target: "chr22:42120246-42120266 (+)", notes: "CYP2D6 upstream pilot panel, member 1" },
  { name: "CYP2D6_upstream_2",      spacer: "",   source: "pilot_grna_positions.bed",  target: "chr22:42120299-42120319 (+)", notes: "CYP2D6 upstream pilot panel, member 2" },
  { name: "CYP2D6_upstream_3",      spacer: "",   source: "pilot_grna_positions.bed",  target: "chr22:42120483-42120503 (+)", notes: "CYP2D6 upstream pilot panel, member 3" },
  { name: "CYP2D6_downstream_1",    spacer: "",   source: "pilot_grna_positions.bed",  target: "chr22:42130953-42130973 (+)", notes: "CYP2D6 downstream pilot panel, member 1" },
  { name: "CYP2D6_downstream_2",    spacer: "",   source: "pilot_grna_positions.bed",  target: "chr22:42131279-42131299 (+)", notes: "CYP2D6 downstream pilot panel, member 2" },
  { name: "CYP2D6_downstream_3",    spacer: "",   source: "pilot_grna_positions.bed",  target: "chr22:42131304-42131324 (+)", notes: "CYP2D6 downstream pilot panel, member 3" },

  // --- PureTarget-style subtelomeric pilot guides (multi-chromosome) ---
  // From pilot_grna_positions.bed; sequences TBD
  { name: "chr1p_1",                spacer: "",   source: "pilot_grna_positions.bed",  target: "chr1:45335-45355 (+)",      notes: "Subtelomeric pilot, 1p arm" },
  { name: "chr1p_2",                spacer: "",   source: "pilot_grna_positions.bed",  target: "chr1:46020-46040 (+)",      notes: "Subtelomeric pilot, 1p arm" },
  { name: "chr1p_3",                spacer: "",   source: "pilot_grna_positions.bed",  target: "chr1:46448-46468 (+)",      notes: "Subtelomeric pilot, 1p arm" },
  { name: "chr17p_1",               spacer: "",   source: "pilot_grna_positions.bed",  target: "chr17:65117-65137 (+)",     notes: "Subtelomeric pilot, 17p arm" },

  // ---- ADD NEW LAB gRNAs BELOW ----
  // { name: "Your_gRNA_Name", spacer: "NNNNNNNNNNNNNNNNNNNN", source: "...", target: "...", notes: "..." },
];

// Normalize spacer for comparison (uppercase, DNA only, strip U's)
export function normalizeSpacer(s) {
  return (s || "").toUpperCase().replace(/U/g, "T").replace(/[^ACGT]/g, "");
}

// Match a candidate gRNA against the lab catalog; returns catalog entry or null.
export function matchLabCatalog(grna) {
  const cand = normalizeSpacer(grna.protospacer);
  if (cand.length !== 20) return null;
  const candRC = cand.split("").reverse().map(c => ({A:"T",T:"A",G:"C",C:"G"})[c] || c).join("");
  for (const entry of LAB_GRNA_CATALOG) {
    const ref = normalizeSpacer(entry.spacer);
    if (ref.length !== 20) continue;
    if (ref === cand || ref === candRC) return entry;
  }
  return null;
}

function productSize(product, componentSizes) {
  let sum = 0;
  for (const k of product.parts) sum += componentSizes[k] || 0;
  return sum;
}

export function componentSizesFrom(construct) {
  const map = {};
  for (const c of construct.components) map[c.key] = c.size;
  return map;
}

// ======================================================================
// HELPERS
// ======================================================================

const fmtBp  = v => (v === null || v === undefined || isNaN(v)) ? "—" : v.toFixed(2);
const fmtInt = v => (v === null || v === undefined || isNaN(v)) ? "—" : Math.round(v).toLocaleString();

// Find the tallest peak for a sample/dye within a size window.
function dominantPeak(peaks, sample, dye, lo = 50, hi = 500) {
  const arr = peaks[sample]?.[dye] || [];
  let best = null;
  for (const p of arr) {
    const [size, height] = p;
    if (size >= lo && size <= hi && (!best || height > best[1])) best = p;
  }
  return best ? { size: best[0], height: best[1], area: best[2], width: best[3] } : null;
}

// Classify a peak relative to target and expected positions.
function classifyPeak(size, target, expectedMap, tol) {
  for (const dye of SAMPLE_DYES) {
    if (Math.abs(size - expectedMap[dye]) <= tol) return { kind: "target", dye };
  }
  if (size < 50) return { kind: "small", dye: null };                 // primer/adapter dimer region
  if (target && size > target + 50) return { kind: "daisy", dye: null }; // daisy-chain or concatemer
  return { kind: "other", dye: null };
}

// Compute per-sample auto defaults: target = median of dominant B/G/Y/R peaks;
// expected_dye = dominant peak position within window of target.
function computeAutoDefaults(peaks) {
  const cfg = {};
  for (const sample of Object.keys(peaks)) {
    const doms = {};
    for (const d of SAMPLE_DYES) doms[d] = dominantPeak(peaks, sample, d);

    // Target: use the minimum size among dominants (shorter strand = reference)
    const sizes = SAMPLE_DYES.map(d => doms[d]?.size).filter(v => v !== undefined);
    let target = sizes.length ? [...sizes].sort((a,b) => a-b)[0] : 200;

    const expected = {};
    for (const d of SAMPLE_DYES) {
      if (doms[d] && Math.abs(doms[d].size - target) < 15) {
        expected[d] = +doms[d].size.toFixed(2);
      } else {
        expected[d] = +target.toFixed(2);
      }
    }
    cfg[sample] = {
      target: +target.toFixed(2),
      expected,
      tolerance: 2.0,
      chemistry: "custom",
    };
  }
  return cfg;
}

// Peak ID: for each sample/dye, find nearest observed peak to expected within tol.
function identifyPeaks(peaks, cfg) {
  const results = {};
  for (const sample of Object.keys(cfg)) {
    const sres = {};
    const s = cfg[sample];
    for (const d of SAMPLE_DYES) {
      const target = s.expected[d];
      const arr = peaks[sample]?.[d] || [];
      let best = null;
      for (const [size, height, area, width] of arr) {
        const delta = size - target;
        if (Math.abs(delta) <= s.tolerance) {
          if (!best || Math.abs(delta) < Math.abs(best.delta)) {
            best = { size, height, area, width, delta };
          }
        }
      }
      // Total channel area (for purity metric)
      let totalArea = 0;
      for (const [, , area] of arr) totalArea += area;
      sres[d] = {
        expected: target,
        match: best,
        purity: best && totalArea > 0 ? best.area / totalArea : null,
        totalArea,
      };
    }
    results[sample] = sres;
  }
  return results;
}

// Build Gaussian-sum SVG path from peaks in a visible range.
function buildGaussianPath(peaks, xRange, yMax, geom, smoothing = 1, logY = false) {
  const [lo, hi] = xRange;
  const { laneTop, laneH, mLeft, plotW } = geom;
  const nSamples = Math.max(120, Math.floor(plotW / 1.2));
  const dx = (hi - lo) / nSamples;
  const ps = peaks.map(p => ({ mu: p[0], h: p[1], sigma: Math.max((p[3] || 0.5) / 2.355 * smoothing, 0.12) }));
  const yTransform = v => logY ? Math.log10(Math.max(1, v + 1)) / Math.log10(Math.max(2, yMax + 1)) : v / yMax;
  let strokePath = "";
  const points = [];
  for (let i = 0; i <= nSamples; i++) {
    const x = lo + i * dx;
    let y = 0;
    for (const p of ps) {
      const z = (x - p.mu) / p.sigma;
      if (z > 5 || z < -5) continue;
      y += p.h * Math.exp(-0.5 * z * z);
    }
    const px = mLeft + (i / nSamples) * plotW;
    const py = laneTop + laneH - Math.min(1, yTransform(Math.max(0, y))) * laneH;
    points.push([px, py]);
    strokePath += (i === 0 ? "M" : "L") + px.toFixed(1) + "," + py.toFixed(1);
  }
  const lastPx = mLeft + plotW;
  const baseY = laneTop + laneH;
  const fillPath = strokePath + "L" + lastPx.toFixed(1) + "," + baseY.toFixed(1) + "L" + mLeft + "," + baseY.toFixed(1) + "Z";
  return { stroke: strokePath, fill: fillPath };
}

// ======================================================================
// MAIN COMPONENT
// ======================================================================
// localStorage key for the calibration sidecar. Persists per-dye offsets across
// page reloads. The viewer also exposes Download/Upload JSON in AutoClassifyTab
// so calibration data can be shared across machines or committed to the repo.
const DYE_OFFSETS_LS_KEY = "fragment-viewer:dye-offsets";

function loadDyeOffsetsFromStorage() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const raw = window.localStorage.getItem(DYE_OFFSETS_LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const ok = ["B", "G", "Y", "R"].every(k => typeof parsed[k] === "number");
    return ok ? parsed : null;
  } catch { return null; }
}

export default function FragmentViewer() {
  // Bumped on drag-drop ingest; used as a key on the outer div to remount the tree
  // and force every useState/useMemo in the subtree to re-initialize from the new
  // (mutated) DATA.peaks. Avoids prop-drilling peaks into all 5 tab components.
  const [dataKey, setDataKey] = useState(0);
  const handleNewPeaks = (newPeaks) => {
    DATA.peaks = newPeaks;
    setDataKey(k => k + 1);
  };

  const samples = useMemo(() => Object.keys(DATA.peaks).sort(), [dataKey]);
  const [tab, setTab] = useState("trace");   // "trace" | "peakid" | "compare"

  // Persistent per-sample config
  const [cfg, setCfg] = useState(() => computeAutoDefaults(DATA.peaks));

  // Editable construct component sizes (from the SnapGene file; user can adjust)
  const [componentSizes, setComponentSizes] = useState(() => componentSizesFrom(CONSTRUCT));
  const setCSize = (k, v) => setComponentSizes(s => ({ ...s, [k]: Math.max(0, v) }));

  // Per-dye mobility offset (bp). Subtracted from observed sizes during classification.
  // Calibrated from a blunt-control ligation; for ABI 3500/3730 with POP-7,
  // typical 6-FAM < HEX < TAMRA < ROX ordering. Defaults to 0 until user calibrates.
  // Persists to localStorage so calibration survives page reload.
  const [dyeOffsets, setDyeOffsets] = useState(
    () => loadDyeOffsetsFromStorage() || { B: 0, G: 0, Y: 0, R: 0 }
  );
  useEffect(() => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(DYE_OFFSETS_LS_KEY, JSON.stringify(dyeOffsets));
      }
    } catch { /* localStorage unavailable; non-fatal */ }
  }, [dyeOffsets]);
  const setDyeOffset = (dye, v) => setDyeOffsets(s => ({ ...s, [dye]: Number(v) || 0 }));

  // User-editable construct sequence (defaults to V059 from SnapGene).
  // Target range is also editable for generalization to other constructs.
  const [constructSeq, setConstructSeq] = useState(CONSTRUCT.seq);
  const [targetStart, setTargetStart] = useState(CONSTRUCT.targetRange.start);
  const [targetEnd, setTargetEnd] = useState(CONSTRUCT.targetRange.end);
  const constructSize = constructSeq.length;

  const results = useMemo(() => identifyPeaks(DATA.peaks, cfg), [cfg]);

  // Total observed peaks across the loaded dataset; surfaced in the status bar.
  const totalPeaks = useMemo(() => {
    let n = 0;
    for (const s of Object.keys(DATA.peaks)) {
      const dyes = DATA.peaks[s] || {};
      for (const d of Object.keys(dyes)) n += (dyes[d] || []).length;
    }
    return n;
  }, [dataKey]);

  // Whether any per-dye offset has been calibrated away from zero.
  const calibrated = ["B", "G", "Y", "R"].some(k => Math.abs(dyeOffsets[k] || 0) > 1e-6);

  return (
    <div key={dataKey} className="h-screen flex flex-col bg-zinc-50 text-zinc-900 font-sans antialiased">
      <PrintStyles />
      <DropOverlay onData={handleNewPeaks} />
      <Toolbar
        sampleCount={samples.length}
        onUpload={handleNewPeaks}
        onResetCalibration={() => setDyeOffsets({ B: 0, G: 0, Y: 0, R: 0 })}
      />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar tab={tab} setTab={setTab} />
        <main className="flex-1 overflow-auto bg-zinc-50">
          <div className="px-6 py-5 max-w-[1400px] mx-auto">
            {tab === "trace"   && <TraceTab   samples={samples} cfg={cfg} setCfg={setCfg} results={results} componentSizes={componentSizes} setCSize={setCSize} />}
            {tab === "peakid"  && <PeakIdTab  samples={samples} cfg={cfg} setCfg={setCfg} results={results} componentSizes={componentSizes} setCSize={setCSize} />}
            {tab === "cutpred" && <CutPredictionTab samples={samples} cfg={cfg} setCfg={setCfg} results={results} />}
            {tab === "autoclass" && <AutoClassifyTab samples={samples} componentSizes={componentSizes} dyeOffsets={dyeOffsets} setDyeOffsets={setDyeOffsets} setDyeOffset={setDyeOffset} constructSeq={constructSeq} setConstructSeq={setConstructSeq} targetStart={targetStart} setTargetStart={setTargetStart} targetEnd={targetEnd} setTargetEnd={setTargetEnd} />}
            {tab === "compare" && <CompareTab samples={samples} cfg={cfg} results={results} />}
          </div>
        </main>
      </div>
      <StatusBar
        sampleCount={samples.length}
        peakCount={totalPeaks}
        calibrated={calibrated}
        construct={`V059 (${constructSize} bp)`}
      />
    </div>
  );
}

// Print stylesheet: hide UI chrome (.no-print), expand the main pane, and
// switch backgrounds to white for PDF export. Triggered by Print to PDF
// in AutoClassifyTab via window.print().
function PrintStyles() {
  return (
    <style>{`
      @media print {
        .no-print { display: none !important; }
        body, html { background: white !important; }
        .h-screen { height: auto !important; min-height: auto !important; background: white !important; }
        main { overflow: visible !important; border: none !important; }
        button, input[type="number"], input[type="file"], select, textarea { display: none !important; }
        .print-show { display: block !important; }
      }
    `}</style>
  );
}

// Top toolbar. Brand + construct chip + global actions. 48px tall.
// Dark bar gives the eye a stable anchor; main pane reads as the work surface.
function Toolbar({ sampleCount, onUpload, onResetCalibration }) {
  return (
    <header className="h-12 flex items-center gap-4 px-4 bg-zinc-950 text-zinc-100 border-b border-zinc-800 no-print">
      <div className="flex items-center gap-2.5">
        <div className="p-1.5 rounded-md bg-zinc-800/80 ring-1 ring-zinc-700">
          <Microscope size={16} className="text-sky-400" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold tracking-tight">Fragment Viewer</span>
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">Athey Lab · SMS</span>
        </div>
      </div>
      <div className="h-6 w-px bg-zinc-800" />
      <div className="hidden md:flex items-center gap-2 text-xs">
        <Pill tone="dark" className="!bg-zinc-900 !border-zinc-700 !text-zinc-300">
          <span className="text-zinc-500">construct</span>
          <span className="font-mono text-zinc-100">V059_gRNA3</span>
        </Pill>
        <Pill tone="dark" className="!bg-zinc-900 !border-zinc-700 !text-zinc-300">
          <Database size={10} className="text-zinc-500" />
          <span className="font-mono text-zinc-100">{sampleCount}</span>
          <span className="text-zinc-500">samples</span>
        </Pill>
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-1">
        <UploadButton onData={onUpload} />
        <ToolButton icon={RotateCcw} variant="dark" title="Reset all per-dye mobility offsets to zero" onClick={onResetCalibration}>
          Reset calib.
        </ToolButton>
        <ToolButton icon={FileDown} variant="dark" title="Open browser print dialog (Save as PDF)" onClick={() => window.print()}>
          PDF
        </ToolButton>
      </div>
    </header>
  );
}

// Left rail. Sectioned: Workflow on top, Resources at bottom (links to lab tools).
function Sidebar({ tab, setTab }) {
  const tabs = [
    { id: "trace",     label: "Electropherogram",  icon: Activity,   hint: "Per-sample trace, smoothing, ladder overlay" },
    { id: "peakid",    label: "Peak ID",           icon: Crosshair,  hint: "Match observed peaks to expected positions" },
    { id: "cutpred",   label: "Cut Prediction",    icon: Scissors,   hint: "Enumerate gRNAs and predict ssDNA products" },
    { id: "autoclass", label: "Auto Classify",     icon: Layers,     hint: "Cluster and identify peaks across all dyes" },
    { id: "compare",   label: "Cross-Sample",      icon: GitCompare, hint: "Overhang offsets and purity grid" },
  ];
  return (
    <nav className="w-52 shrink-0 bg-white border-r border-zinc-200 flex flex-col no-print">
      <div className="px-3 pt-3 pb-1">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Workflow</div>
      </div>
      <ul className="flex flex-col px-2 gap-0.5">
        {tabs.map((t, i) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <li key={t.id}>
              <button
                onClick={() => setTab(t.id)}
                title={t.hint}
                className={`group w-full flex items-center gap-2.5 px-2.5 py-1.5 text-sm rounded-md transition focus-ring ${
                  active
                    ? "bg-zinc-900 text-white"
                    : "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"
                }`}
              >
                <Icon size={15} className={active ? "text-sky-400" : "text-zinc-500 group-hover:text-zinc-700"} />
                <span className="font-medium truncate">{t.label}</span>
                <span className="ml-auto text-[10px] font-mono text-zinc-500/70">{i + 1}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto p-3 border-t border-zinc-100">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">Lab tools</div>
        <ul className="flex flex-col gap-0.5 text-xs text-zinc-600">
          <SidebarLink href="https://github.com/Single-Molecule-Sequencing/cas9-targeted-sequencing" label="cas9-targeted-sequencing" />
          <SidebarLink href="https://github.com/Single-Molecule-Sequencing/golden-gate" label="golden-gate" />
          <SidebarLink href="https://github.com/Single-Molecule-Sequencing/sma-seq-workspace" label="sma-seq" />
          <SidebarLink href="https://www.pharmvar.org" label="PharmVar" />
        </ul>
        <div className="mt-3 text-[10px] text-zinc-500 leading-snug">
          Drag a GeneMapper TSV anywhere in this window to swap datasets.
        </div>
      </div>
    </nav>
  );
}

function SidebarLink({ href, label }) {
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 px-1.5 py-0.5 rounded hover:bg-zinc-100 hover:text-zinc-900 transition"
      >
        <ExternalLink size={10} className="text-zinc-400" />
        <span className="truncate">{label}</span>
      </a>
    </li>
  );
}

// Bottom status bar. Always visible. CLI-style readout.
function StatusBar({ sampleCount, peakCount, calibrated, construct }) {
  return (
    <footer className="h-7 flex items-center gap-3 px-3 bg-zinc-100 text-zinc-600 border-t border-zinc-200 text-[11px] no-print">
      <span className="flex items-center gap-1.5">
        <Database size={11} className="text-zinc-400" />
        <span className="text-zinc-500">samples</span>
        <span className="font-mono text-zinc-800">{sampleCount}</span>
      </span>
      <span className="text-zinc-300">·</span>
      <span className="flex items-center gap-1">
        <span className="text-zinc-500">peaks</span>
        <span className="font-mono text-zinc-800 num">{peakCount.toLocaleString()}</span>
      </span>
      <span className="text-zinc-300">·</span>
      <span className="flex items-center gap-1">
        <span className="text-zinc-500">construct</span>
        <span className="font-mono text-zinc-800">{construct}</span>
      </span>
      <span className="text-zinc-300">·</span>
      <span className="flex items-center gap-1">
        {calibrated
          ? <CheckCircle2 size={11} className="text-emerald-600" />
          : <AlertTriangle size={11} className="text-amber-600" />}
        <span className={calibrated ? "text-emerald-700" : "text-amber-700"}>
          {calibrated ? "calibrated" : "uncalibrated"}
        </span>
      </span>
      <div className="flex-1" />
      <a
        href="https://github.com/Single-Molecule-Sequencing/fragment-viewer"
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-zinc-500 hover:text-zinc-900"
      >
        v0.6.0
      </a>
    </footer>
  );
}

// ======================================================================
// TAB 1 — Single-sample electropherogram viewer with high-res trace
// ======================================================================
function TraceTab({ samples, cfg, setCfg, results, componentSizes, setCSize }) {
  const [sample, setSample] = useState(samples[0]);
  const [channels, setChannels] = useState({ B: true, G: true, Y: true, R: true, O: false });
  const [range, setRange] = useState([0, 260]);
  const [mode, setMode] = useState("trace");          // "trace" | "stem"
  const [stackChannels, setStackChannels] = useState(true);
  const [logY, setLogY] = useState(false);
  const [smoothing, setSmoothing] = useState(1);       // sigma multiplier 0.5 - 3
  const [labelPeaks, setLabelPeaks] = useState(true);
  const [showExpected, setShowExpected] = useState(true);
  const [showLadder, setShowLadder] = useState(true);
  const [hover, setHover] = useState(null);

  const peaks = DATA.peaks[sample] || {};
  const s = cfg[sample];

  const presets = sample.startsWith("gRNA3")
    ? [{ l: "Full", r: [0, 500] }, { l: "Cut site", r: [75, 110] }, { l: "Tight", r: [83, 95] }, { l: "Small", r: [0, 50] }]
    : [{ l: "Full", r: [0, 500] }, { l: "Cut site", r: [185, 225] }, { l: "Tight", r: [196, 210] }, { l: "Small", r: [0, 60] }];

  // Peaks in current window
  const peaksByChannel = useMemo(() => {
    const out = {};
    for (const d of DYE_ORDER) {
      out[d] = [];
      if (!peaks[d]) continue;
      for (const p of peaks[d]) {
        if (p[0] >= range[0] - 5 && p[0] <= range[1] + 5) out[d].push({ dye: d, size: p[0], height: p[1], area: p[2], width: p[3] });
      }
    }
    return out;
  }, [peaks, range]);

  // Per-lane y-max (in visible range)
  const yMaxByChannel = useMemo(() => {
    const out = {};
    for (const d of DYE_ORDER) {
      const inRange = (peaks[d] || []).filter(p => p[0] >= range[0] && p[0] <= range[1]);
      out[d] = inRange.length ? Math.max(...inRange.map(p => p[1])) * 1.12 : 100;
    }
    return out;
  }, [peaks, range]);

  const activeChannels = DYE_ORDER.filter(d => channels[d]);
  const sharedYMax = useMemo(() => {
    if (!activeChannels.length) return 100;
    return Math.max(...activeChannels.map(d => yMaxByChannel[d]));
  }, [activeChannels, yMaxByChannel]);

  // Geometry
  const W = 920;
  const lanesCount = stackChannels ? Math.max(1, activeChannels.length) : 1;
  const laneH = stackChannels ? 108 : 380;
  const m = { l: 64, r: 16, t: 14, b: 40 };
  const laneGap = stackChannels ? 6 : 0;
  const H = m.t + m.b + lanesCount * laneH + (lanesCount - 1) * laneGap;
  const plotW = W - m.l - m.r;
  const xScale = sz => m.l + ((sz - range[0]) / (range[1] - range[0])) * plotW;

  const lanes = stackChannels
    ? activeChannels.map((d, i) => ({ dyes: [d], top: m.t + i * (laneH + laneGap), h: laneH, yMax: yMaxByChannel[d] }))
    : [{ dyes: activeChannels, top: m.t, h: laneH, yMax: sharedYMax }];

  // X ticks
  const xTicks = useMemo(() => {
    const span = range[1] - range[0];
    const step = span <= 15 ? 2 : span <= 40 ? 5 : span <= 120 ? 20 : 50;
    const first = Math.ceil(range[0] / step) * step;
    const t = [];
    for (let v = first; v <= range[1]; v += step) t.push(v);
    return t;
  }, [range]);

  // Drag-to-zoom
  const svgRef = useRef(null);
  const [drag, setDrag] = useState(null);
  const toBp = cx => {
    const r = svgRef.current.getBoundingClientRect();
    const scale = W / r.width;
    return range[0] + (((cx - r.left) * scale - m.l) / plotW) * (range[1] - range[0]);
  };
  const onDown = e => { const bp = toBp(e.clientX); if (bp < range[0] || bp > range[1]) return; setDrag({ s: bp, e: bp }); };
  const onMove = e => { if (drag) setDrag({ ...drag, e: toBp(e.clientX) }); };
  const onUp   = () => {
    if (drag && Math.abs(drag.e - drag.s) > 0.5) {
      const lo = Math.max(0,   Math.min(drag.s, drag.e));
      const hi = Math.min(500, Math.max(drag.s, drag.e));
      setRange([lo, hi]);
    }
    setDrag(null);
  };

  // Reset to full
  const resetZoom = () => setRange([0, 500]);

  // Stats summary for this sample
  const sres = results[sample];

  return (
    <>
      {/* Sample selector */}
      <div className="bg-white rounded-lg border border-zinc-200 p-2.5 mb-2">
        <div className="flex items-center gap-2 mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Sample <span className="text-zinc-400 font-normal normal-case">({samples.length})</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {samples.map(ss => (
            <button key={ss} onClick={() => setSample(ss)}
              className={`px-2.5 py-1 text-xs rounded-md border transition ${ss === sample ? "bg-zinc-900 text-white border-zinc-900" : "bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-100"}`}>
              {ss}
            </button>
          ))}
        </div>
      </div>

      {/* Controls row 1: channels + view mode */}
      <div className="bg-white rounded-lg border border-zinc-200 p-2.5 mb-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Channels</span>
          {DYE_ORDER.map(d => (
            <label key={d} className="flex items-center gap-1 cursor-pointer select-none text-xs">
              <input type="checkbox" checked={channels[d]} onChange={e => setChannels({ ...channels, [d]: e.target.checked })} className="w-3.5 h-3.5 accent-zinc-700" />
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: DYE[d].color }} />
              {DYE[d].label}
            </label>
          ))}
        </div>
        <div className="h-5 w-px bg-zinc-200" />
        <div className="flex items-center gap-1 text-xs">
          <span className="font-semibold uppercase tracking-wide text-zinc-500 mr-1">View</span>
          <div className="inline-flex rounded-md border border-zinc-300 overflow-hidden">
            <button onClick={() => setMode("trace")} className={`px-2 py-1 ${mode === "trace" ? "bg-zinc-900 text-white" : "bg-white text-zinc-700 hover:bg-zinc-100"}`}>Trace</button>
            <button onClick={() => setMode("stem")}  className={`px-2 py-1 ${mode === "stem"  ? "bg-zinc-900 text-white" : "bg-white text-zinc-700 hover:bg-zinc-100"}`}>Stem</button>
          </div>
          <label className="flex items-center gap-1 ml-2 cursor-pointer">
            <input type="checkbox" checked={stackChannels} onChange={e => setStackChannels(e.target.checked)} className="w-3.5 h-3.5 accent-zinc-700" />
            Stacked
          </label>
          <label className="flex items-center gap-1 ml-2 cursor-pointer">
            <input type="checkbox" checked={logY} onChange={e => setLogY(e.target.checked)} className="w-3.5 h-3.5 accent-zinc-700" />
            Log Y
          </label>
          <label className="flex items-center gap-1 ml-2 cursor-pointer">
            <input type="checkbox" checked={labelPeaks} onChange={e => setLabelPeaks(e.target.checked)} className="w-3.5 h-3.5 accent-zinc-700" />
            Peak labels
          </label>
          <label className="flex items-center gap-1 ml-2 cursor-pointer">
            <input type="checkbox" checked={showExpected} onChange={e => setShowExpected(e.target.checked)} className="w-3.5 h-3.5 accent-zinc-700" />
            Expected
          </label>
        </div>
      </div>

      {/* Controls row 2: zoom presets + smoothing */}
      <div className="bg-white rounded-lg border border-zinc-200 p-2.5 mb-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1 text-xs flex-wrap">
          <span className="font-semibold uppercase tracking-wide text-zinc-500 mr-1">Zoom</span>
          {presets.map(p => (
            <button key={p.l} onClick={() => setRange(p.r)} className="px-2 py-1 rounded border border-zinc-300 bg-white hover:bg-zinc-100">{p.l}</button>
          ))}
          <button onClick={resetZoom} className="px-2 py-1 rounded border border-zinc-300 bg-white hover:bg-zinc-100">Reset</button>
          <span className="ml-3 text-zinc-500">x: {range[0].toFixed(1)}–{range[1].toFixed(1)} bp</span>
        </div>
        <div className="h-5 w-px bg-zinc-200" />
        <label className="flex items-center gap-2 text-xs">
          <span className="font-semibold uppercase tracking-wide text-zinc-500">Smoothing</span>
          <input type="range" min="0.5" max="3" step="0.1" value={smoothing}
                 onChange={e => setSmoothing(parseFloat(e.target.value))} className="accent-zinc-700 w-28" />
          <span className="tabular-nums text-zinc-600 w-10">{smoothing.toFixed(1)}x</span>
        </label>
        <label className="flex items-center gap-1 text-xs ml-auto cursor-pointer">
          <input type="checkbox" checked={showLadder} onChange={e => setShowLadder(e.target.checked)} className="w-3.5 h-3.5 accent-orange-500" />
          LIZ ladder marks
        </label>
      </div>

      {/* Electropherogram */}
      <div className="bg-white rounded-lg border border-zinc-200 p-2 mb-2">
        <div className="px-2 pt-1 pb-1 flex items-center justify-between flex-wrap gap-2">
          <div className="text-sm font-medium">{sample}</div>
          <div className="text-[11px] text-zinc-500">
            Drag on plot to zoom · {Object.values(peaksByChannel).reduce((t, a) => t + a.length, 0)} peaks in window
          </div>
        </div>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto cursor-crosshair select-none"
          onMouseDown={onDown}
          onMouseMove={onMove}
          onMouseUp={onUp}
          onMouseLeave={() => { setDrag(null); setHover(null); }}
        >
          {lanes.map((lane, li) => {
            const yScale = h => {
              const norm = logY ? Math.log10(Math.max(1, h + 1)) / Math.log10(Math.max(2, lane.yMax + 1)) : h / lane.yMax;
              return lane.top + lane.h - Math.min(1, norm) * lane.h;
            };
            const yTicks = logY
              ? [1, 10, 100, 1000, 10000, 100000].filter(v => v <= lane.yMax * 1.2)
              : computeLinearTicks(lane.yMax);

            return (
              <g key={li}>
                <rect x={m.l} y={lane.top} width={plotW} height={lane.h} fill="#fafbfc" />

                {yTicks.map(t => (
                  <g key={`y${li}-${t}`}>
                    <line x1={m.l} x2={m.l + plotW} y1={yScale(t)} y2={yScale(t)} stroke="#eef2f7" />
                    <text x={m.l - 4} y={yScale(t) + 3} fontSize="9" textAnchor="end" fill="#64748b">
                      {formatTick(t)}
                    </text>
                  </g>
                ))}

                {xTicks.map(t => (
                  <line key={`xg${li}-${t}`} x1={xScale(t)} x2={xScale(t)} y1={lane.top} y2={lane.top + lane.h} stroke="#eef2f7" />
                ))}

                {/* LIZ ladder marks on bottom lane only */}
                {showLadder && li === lanes.length - 1 && LIZ_LADDER
                  .filter(v => v >= range[0] && v <= range[1])
                  .map(v => (
                    <g key={`liz${v}`}>
                      <line x1={xScale(v)} x2={xScale(v)} y1={lane.top + lane.h} y2={lane.top + lane.h + 5} stroke="#ef6c00" strokeWidth="1.5" />
                    </g>
                  ))}

                {/* Lane frame */}
                <line x1={m.l} x2={m.l + plotW} y1={lane.top + lane.h} y2={lane.top + lane.h} stroke="#334155" />
                <line x1={m.l} x2={m.l} y1={lane.top} y2={lane.top + lane.h} stroke="#334155" />

                {/* Lane label */}
                {stackChannels && (
                  <g>
                    <rect x={m.l + 6} y={lane.top + 4} width={82} height={16} rx="3" fill="white" stroke="#e2e8f0" />
                    <circle cx={m.l + 14} cy={lane.top + 12} r="3.5" fill={DYE[lane.dyes[0]].color} />
                    <text x={m.l + 22} y={lane.top + 15} fontSize="10" fill="#334155" fontWeight="500">
                      {DYE[lane.dyes[0]].label} · {DYE[lane.dyes[0]].name}
                    </text>
                  </g>
                )}

                {/* Expected peak markers (per dye, for lane) */}
                {showExpected && lane.dyes.map(dye => {
                  if (dye === "O" || !s) return null;
                  const exp = s.expected[dye];
                  if (exp < range[0] || exp > range[1]) return null;
                  const x = xScale(exp);
                  const color = DYE[dye].color;
                  return (
                    <g key={`exp-${li}-${dye}`} pointerEvents="none">
                      <line x1={x} x2={x} y1={lane.top} y2={lane.top + lane.h} stroke={color} strokeWidth="1" strokeDasharray="3 3" opacity="0.55" />
                      <rect x={x - 18} y={lane.top + 2} width={36} height={11} rx="2" fill={color} opacity="0.85" />
                      <text x={x} y={lane.top + 10} fontSize="8" textAnchor="middle" fill="white" fontWeight="600">
                        {exp.toFixed(1)}
                      </text>
                    </g>
                  );
                })}

                {/* Trace/Stem rendering per dye */}
                {lane.dyes.map(dye => {
                  const lp = peaksByChannel[dye] || [];
                  if (!lp.length) return null;
                  const laneGeom = { laneTop: lane.top, laneH: lane.h, mLeft: m.l, plotW };
                  if (mode === "trace") {
                    const path = buildGaussianPath(
                      lp.map(p => [p.size, p.height, p.area, p.width]),
                      range, lane.yMax, laneGeom, smoothing, logY
                    );
                    return (
                      <g key={`tr-${li}-${dye}`}>
                        <path d={path.fill}   fill={DYE[dye].color} opacity={stackChannels ? 0.20 : 0.10} />
                        <path d={path.stroke} fill="none" stroke={DYE[dye].color} strokeWidth={1.5} opacity={dye === "O" ? 0.65 : 0.95} />
                      </g>
                    );
                  } else {
                    return (
                      <g key={`st-${li}-${dye}`}>
                        {lp.map((p, i) => {
                          const x = xScale(p.size);
                          return <line key={i} x1={x} x2={x} y1={yScale(0)} y2={yScale(p.height)} stroke={DYE[dye].color} strokeWidth="1.2" opacity={dye === "O" ? 0.6 : 0.92} />;
                        })}
                      </g>
                    );
                  }
                })}

                {/* Peak labels — show the top 4 tallest peaks in visible range */}
                {labelPeaks && (() => {
                  const labeled = [];
                  for (const dye of lane.dyes) {
                    if (dye === "O") continue;
                    const lp = (peaksByChannel[dye] || [])
                      .filter(p => p.size >= range[0] && p.size <= range[1])
                      .sort((a, b) => b.height - a.height)
                      .slice(0, 4);
                    for (const p of lp) labeled.push({ ...p, dye });
                  }
                  return labeled.map((p, i) => {
                    const x = xScale(p.size);
                    const y = yScale(p.height);
                    return (
                      <g key={`lbl-${li}-${i}`} pointerEvents="none">
                        <text x={x} y={y - 4} fontSize="9" textAnchor="middle" fill={DYE[p.dye].color} fontWeight="600" fontFamily="ui-monospace, monospace">
                          {p.size.toFixed(1)}
                        </text>
                      </g>
                    );
                  });
                })()}

                {/* Hover dots */}
                {lane.dyes.map(dye =>
                  (peaksByChannel[dye] || [])
                    .filter(p => p.size >= range[0] && p.size <= range[1])
                    .map((p, i) => {
                      const x = xScale(p.size);
                      const y = yScale(p.height);
                      return (
                        <circle
                          key={`dot-${li}-${dye}-${i}`}
                          cx={x} cy={y} r={3}
                          fill="white" stroke={DYE[dye].color} strokeWidth={1.2}
                          opacity={mode === "trace" ? 0.9 : 0.7}
                          onMouseEnter={() => setHover({ ...p, x, y })}
                          onMouseLeave={() => setHover(null)}
                          style={{ cursor: "pointer" }}
                        />
                      );
                    })
                )}
              </g>
            );
          })}

          {/* X tick labels */}
          {xTicks.map(t => (
            <g key={`xl${t}`}>
              <line x1={xScale(t)} x2={xScale(t)} y1={H - m.b} y2={H - m.b + 4} stroke="#94a3b8" />
              <text x={xScale(t)} y={H - m.b + 15} fontSize="10" textAnchor="middle" fill="#64748b">{t}</text>
            </g>
          ))}
          <text x={m.l + plotW / 2} y={H - 6} fontSize="11" textAnchor="middle" fill="#334155" fontWeight="500">Size (bp)</text>
          <text x={14} y={m.t + (H - m.t - m.b) / 2} fontSize="11" textAnchor="middle" fill="#334155" fontWeight="500"
                transform={`rotate(-90, 14, ${m.t + (H - m.t - m.b) / 2})`}>
            Fluorescence (RFU{logY ? ", log" : ""})
          </text>

          {/* Drag rectangle */}
          {drag && Math.abs(drag.e - drag.s) > 0.1 && (
            <rect
              x={xScale(Math.min(drag.s, drag.e))}
              y={m.t}
              width={Math.abs(xScale(drag.e) - xScale(drag.s))}
              height={H - m.t - m.b}
              fill="#1e6fdb" opacity="0.10" stroke="#1e6fdb" strokeDasharray="3 3"
            />
          )}

          {/* Hover tooltip */}
          {hover && (() => {
            const tw = 156, th = 78;
            const tx = Math.min(W - m.r - tw - 4, Math.max(m.l + 4, hover.x + 10));
            const ty = Math.max(m.t + 4, hover.y - th - 8);
            const exp = s ? s.expected[hover.dye] : null;
            const delta = (exp !== undefined) ? (hover.size - exp) : null;
            return (
              <g pointerEvents="none">
                <rect x={tx} y={ty} width={tw} height={th} rx="4" fill="#0f172a" opacity="0.94" />
                <text x={tx + 8} y={ty + 16} fontSize="11" fill="#fff" fontWeight="600">
                  {DYE[hover.dye].label} · {DYE[hover.dye].name}
                </text>
                <text x={tx + 8} y={ty + 31} fontSize="11" fill="#cbd5e1">Size: {hover.size.toFixed(3)} bp</text>
                <text x={tx + 8} y={ty + 45} fontSize="11" fill="#cbd5e1">Height: {Math.round(hover.height).toLocaleString()}</text>
                <text x={tx + 8} y={ty + 59} fontSize="11" fill="#cbd5e1">Area: {Math.round(hover.area).toLocaleString()} · W {hover.width.toFixed(2)}</text>
                {delta !== null && (
                  <text x={tx + 8} y={ty + 73} fontSize="11" fill="#fef08a">
                    Δ expected: {delta >= 0 ? "+" : ""}{delta.toFixed(2)} bp
                  </text>
                )}
              </g>
            );
          })()}
        </svg>
      </div>

      {/* Side-by-side: per-sample Peak ID summary + visible window peak list */}
      <div className="grid md:grid-cols-2 gap-2 mb-3">
        <SampleSummaryCard sample={sample} cfg={cfg} setCfg={setCfg} results={results[sample]} />
        <VisibleWindowCard peaksByChannel={peaksByChannel} results={results[sample]} cfg={cfg[sample]} />
      </div>
    </>
  );
}

function formatTick(v) {
  if (v >= 10000) return (v / 1000).toFixed(0) + "k";
  if (v >= 1000)  return (v / 1000).toFixed(1) + "k";
  return v.toString();
}

function computeLinearTicks(yMax) {
  const step = yMax > 40000 ? 10000 : yMax > 10000 ? 5000 : yMax > 2000 ? 1000 : yMax > 500 ? 200 : 100;
  const t = [];
  for (let v = 0; v <= yMax; v += step) t.push(v);
  return t;
}

// ======================================================================
// Per-sample summary card on trace tab
// ======================================================================
function SampleSummaryCard({ sample, cfg, setCfg, results }) {
  const s = cfg[sample];
  if (!s || !results) return null;

  const updateExpected = (dye, v) => {
    const nv = parseFloat(v);
    if (!isFinite(nv)) return;
    setCfg({ ...cfg, [sample]: { ...s, expected: { ...s.expected, [dye]: nv } } });
  };
  const updateTarget = v => {
    const nv = parseFloat(v);
    if (!isFinite(nv)) return;
    // Shift all expected by (newtarget - oldtarget)
    const shift = nv - s.target;
    const newExp = { ...s.expected };
    for (const d of SAMPLE_DYES) newExp[d] = +(newExp[d] + shift).toFixed(2);
    setCfg({ ...cfg, [sample]: { ...s, target: nv, expected: newExp } });
  };

  return (
    <div className="bg-white rounded-lg border border-zinc-200 p-3">
      <div className="text-sm font-medium mb-2">Expected peaks · Match quality</div>
      <div className="flex items-center gap-2 mb-2 text-xs">
        <span className="text-zinc-500">Target:</span>
        <input
          type="number" step="0.1" value={s.target}
          onChange={e => updateTarget(e.target.value)}
          className="w-20 px-1.5 py-0.5 border border-zinc-300 rounded text-xs font-mono" />
        <span className="text-zinc-500">bp</span>
        <span className="text-zinc-500 ml-auto">Tol ±{s.tolerance.toFixed(1)} bp</span>
      </div>
      <table className="w-full text-xs">
        <thead className="text-zinc-500">
          <tr className="border-b border-zinc-200">
            <th className="py-1 text-left font-medium">Dye</th>
            <th className="py-1 text-right font-medium">Expected</th>
            <th className="py-1 text-right font-medium">Observed</th>
            <th className="py-1 text-right font-medium">Δ bp</th>
            <th className="py-1 text-right font-medium">Height</th>
            <th className="py-1 text-right font-medium">Purity</th>
          </tr>
        </thead>
        <tbody>
          {SAMPLE_DYES.map(d => {
            const r = results[d];
            const ok = !!r.match;
            return (
              <tr key={d} className="border-b border-zinc-100">
                <td className="py-1">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-middle" style={{ background: DYE[d].color }} />
                  {DYE[d].label}
                </td>
                <td className="py-1 text-right">
                  <input type="number" step="0.1" value={s.expected[d]}
                    onChange={e => updateExpected(d, e.target.value)}
                    className="w-16 px-1.5 py-0.5 border border-zinc-200 rounded text-xs font-mono text-right" />
                </td>
                <td className="py-1 text-right font-mono">{ok ? r.match.size.toFixed(2) : "—"}</td>
                <td className={`py-1 text-right font-mono ${ok ? (Math.abs(r.match.delta) < 1 ? "text-emerald-600" : "text-amber-600") : "text-rose-500"}`}>
                  {ok ? (r.match.delta >= 0 ? "+" : "") + r.match.delta.toFixed(2) : "miss"}
                </td>
                <td className="py-1 text-right font-mono">{ok ? Math.round(r.match.height).toLocaleString() : "—"}</td>
                <td className="py-1 text-right font-mono">{r.purity !== null ? (r.purity * 100).toFixed(0) + "%" : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Overhang offsets inferred from pairing */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <OverhangBadge label="Adapter 1 end (B vs Y · 6-FAM vs TAMRA)" a={results.B?.match?.size} b={results.Y?.match?.size} />
        <OverhangBadge label="Adapter 2 end (G vs R · HEX vs ROX)"    a={results.G?.match?.size} b={results.R?.match?.size} />
      </div>

      {/* Auto-redetect from current data */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <button
          onClick={() => {
            const auto = computeAutoDefaults({ [sample]: DATA.peaks[sample] })[sample];
            setCfg({ ...cfg, [sample]: auto });
          }}
          className="px-2 py-1 text-[11px] rounded border border-zinc-300 bg-white hover:bg-zinc-100">
          Auto-detect from tallest peaks
        </button>
        {CHEMISTRY_PRESETS.map(p => (
          <button
            key={p.id}
            onClick={() => {
              const t = s.target;
              setCfg({ ...cfg, [sample]: { ...s, chemistry: p.id, expected: { B: t + p.B, G: t + p.G, Y: t + p.Y, R: t + p.R } } });
            }}
            title={p.name}
            className="px-2 py-1 text-[11px] rounded border border-zinc-300 bg-white hover:bg-zinc-100">
            {p.id === "blunt_both" ? "Blunt×2" : p.id === "blunt_ad1" ? "Blunt+OH4" : p.id === "blunt_ad2" ? "OH4+Blunt" : p.id === "oh4_both" ? "OH4×2" : "OH1×2"}
          </button>
        ))}
      </div>
    </div>
  );
}

function OverhangBadge({ label, a, b }) {
  const d = (a !== undefined && b !== undefined && a !== null && b !== null) ? b - a : null;
  const interpretation = d === null ? "no pair" :
    Math.abs(d) < 1 ? "blunt (≈0 bp)" :
    (d >= 2 && d <= 5) ? `5' overhang ${d.toFixed(1)} bp` :
    (d <= -2 && d >= -5) ? `inverted ${Math.abs(d).toFixed(1)} bp` :
    "ambiguous";
  return (
    <div className="rounded bg-zinc-50 border border-zinc-200 p-2">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="text-lg font-mono mt-0.5">{d === null ? "—" : `${d >= 0 ? "+" : ""}${d.toFixed(2)}`} <span className="text-xs text-zinc-500">bp</span></div>
      <div className="text-[10px] text-zinc-500 mt-0.5">{interpretation}</div>
    </div>
  );
}

// ======================================================================
// Visible window peak list
// ======================================================================
function VisibleWindowCard({ peaksByChannel, results, cfg }) {
  if (!cfg) return null;
  const peaks = [];
  for (const d of SAMPLE_DYES) {
    for (const p of peaksByChannel[d] || []) peaks.push(p);
  }
  peaks.sort((a, b) => b.height - a.height);
  const top = peaks.slice(0, 15);

  return (
    <div className="bg-white rounded-lg border border-zinc-200 p-3">
      <div className="text-sm font-medium mb-2">Top peaks in visible window · Classification</div>
      <div className="overflow-auto max-h-72">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-white">
            <tr className="text-left text-zinc-500 border-b border-zinc-200">
              <th className="py-1 font-medium">Dye</th>
              <th className="py-1 font-medium text-right">Size</th>
              <th className="py-1 font-medium text-right">Height</th>
              <th className="py-1 font-medium text-right">Area</th>
              <th className="py-1 font-medium">Class</th>
            </tr>
          </thead>
          <tbody>
            {top.map((p, i) => {
              const c = classifyPeak(p.size, cfg.target, cfg.expected, cfg.tolerance);
              const cls = c.kind === "target" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                          c.kind === "daisy"  ? "bg-rose-50 text-rose-700 border-rose-200" :
                          c.kind === "small"  ? "bg-zinc-50 text-zinc-600 border-zinc-200" :
                                                "bg-amber-50 text-amber-700 border-amber-200";
              const label = c.kind === "target" ? `target ${c.dye}` : c.kind === "daisy" ? "daisy" : c.kind === "small" ? "dimer" : "other";
              return (
                <tr key={i} className="border-b border-zinc-100">
                  <td className="py-1"><span className="inline-block w-2 h-2 rounded-sm mr-1 align-middle" style={{ background: DYE[p.dye].color }} />{DYE[p.dye].label}</td>
                  <td className="py-1 text-right font-mono">{p.size.toFixed(2)}</td>
                  <td className="py-1 text-right font-mono">{Math.round(p.height).toLocaleString()}</td>
                  <td className="py-1 text-right font-mono">{Math.round(p.area).toLocaleString()}</td>
                  <td className="py-1">
                    <span className={`inline-block px-1.5 py-0.5 rounded border text-[10px] ${cls}`}>{label}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ======================================================================
// TAB 2 — Peak Identification: config grid + results
// ======================================================================
function PeakIdTab({ samples, cfg, setCfg, results, componentSizes, setCSize }) {
  const [expanded, setExpanded] = useState(() => new Set(samples.slice(0, 1)));
  const [targetSamples, setTargetSamples] = useState([samples[0]]);  // Which samples to apply products to
  const bulkAuto = () => setCfg(computeAutoDefaults(DATA.peaks));

  const applyProduct = (productId, size, dyes) => {
    // Set expected = size for dyes in product, target = size for the selected samples
    const updated = { ...cfg };
    for (const s of targetSamples) {
      const cur = updated[s];
      const newExp = { ...cur.expected };
      for (const d of SAMPLE_DYES) {
        if (dyes.includes(d)) newExp[d] = size;
      }
      updated[s] = { ...cur, target: size, expected: newExp, chemistry: "custom" };
    }
    setCfg(updated);
  };

  return (
    <>
      <AssemblyProductsCard componentSizes={componentSizes} onSizeChange={setCSize} onApply={applyProduct} />

      <div className="bg-white rounded-lg border border-zinc-200 p-2.5 mb-2">
        <div className="flex items-center gap-2 mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Apply product sizes to
        </div>
        <div className="flex flex-wrap gap-1 items-center">
          <button
            onClick={() => setTargetSamples([...samples])}
            className="px-2 py-0.5 text-xs rounded border border-zinc-300 bg-white hover:bg-zinc-100">
            All
          </button>
          <button
            onClick={() => setTargetSamples(samples.filter(s => s.startsWith("V059")))}
            className="px-2 py-0.5 text-xs rounded border border-zinc-300 bg-white hover:bg-zinc-100">
            V059 only
          </button>
          <button
            onClick={() => setTargetSamples(samples.filter(s => s.startsWith("gRNA3")))}
            className="px-2 py-0.5 text-xs rounded border border-zinc-300 bg-white hover:bg-zinc-100">
            gRNA3 only
          </button>
          <button
            onClick={() => setTargetSamples([])}
            className="px-2 py-0.5 text-xs rounded border border-zinc-300 bg-white hover:bg-zinc-100">
            None
          </button>
          <div className="h-4 w-px bg-zinc-200 mx-1" />
          {samples.map(ss => {
            const on = targetSamples.includes(ss);
            return (
              <button key={ss}
                onClick={() => setTargetSamples(on ? targetSamples.filter(x => x !== ss) : [...targetSamples, ss])}
                className={`px-2 py-0.5 text-xs rounded-md border transition ${on ? "bg-zinc-900 text-white border-zinc-900" : "bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-100"}`}>
                {ss}
              </button>
            );
          })}
          <span className="text-xs text-zinc-500 ml-auto">{targetSamples.length} selected</span>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-zinc-200 p-3 mb-2">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <div className="text-sm font-medium">Automated peak identification</div>
            <div className="text-xs text-zinc-600 mt-0.5 max-w-3xl">
              Configure the expected peak position per fluorophore for each sample. The viewer then matches observed peaks to the expected position within ±tolerance and reports match quality. Presets model the cut chemistry: blunt, BsaI (4-nt 5' overhang both ends), or Cas9 with staggered overhang on either or both ends.
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 shrink-0">
            <button onClick={bulkAuto} className="px-2 py-1 text-xs rounded border border-zinc-300 bg-white hover:bg-zinc-100">
              Auto-detect all samples
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {samples.map(sample => (
          <SampleConfigRow
            key={sample}
            sample={sample}
            cfg={cfg} setCfg={setCfg}
            result={results[sample]}
            expanded={expanded.has(sample)}
            toggle={() => {
              const ns = new Set(expanded);
              if (ns.has(sample)) ns.delete(sample); else ns.add(sample);
              setExpanded(ns);
            }}
          />
        ))}
      </div>

      {/* Cross-sample summary grid */}
      <div className="bg-white rounded-lg border border-zinc-200 p-3 mt-3">
        <div className="text-sm font-medium mb-2">Cross-sample match grid</div>
        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-zinc-500 border-b border-zinc-200">
                <th className="py-1 pr-3 font-medium">Sample</th>
                <th className="py-1 pr-2 font-medium text-right">Target</th>
                {SAMPLE_DYES.map(d => (
                  <th key={d} className="py-1 px-2 font-medium text-right">
                    <span className="inline-block w-2 h-2 rounded-sm mr-1 align-middle" style={{ background: DYE[d].color }} />
                    {DYE[d].label}
                  </th>
                ))}
                <th className="py-1 pl-2 font-medium text-right">Matches</th>
              </tr>
            </thead>
            <tbody>
              {samples.map(sample => {
                const s = cfg[sample], r = results[sample];
                const matches = SAMPLE_DYES.filter(d => r[d]?.match).length;
                return (
                  <tr key={sample} className="border-b border-zinc-100">
                    <td className="py-1 pr-3 font-mono">{sample}</td>
                    <td className="py-1 pr-2 text-right font-mono">{s.target.toFixed(1)}</td>
                    {SAMPLE_DYES.map(d => {
                      const m = r[d];
                      if (!m.match) return <td key={d} className="py-1 px-2 text-right text-rose-400 font-mono">miss</td>;
                      const delta = m.match.delta;
                      const color = Math.abs(delta) < 1 ? "text-emerald-700" : Math.abs(delta) < s.tolerance ? "text-amber-700" : "text-rose-500";
                      return (
                        <td key={d} className={`py-1 px-2 text-right font-mono ${color}`}>
                          {m.match.size.toFixed(2)} <span className="text-[10px] text-zinc-500">({delta >= 0 ? "+" : ""}{delta.toFixed(1)})</span>
                        </td>
                      );
                    })}
                    <td className="py-1 pl-2 text-right font-mono">{matches}/4</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function SampleConfigRow({ sample, cfg, setCfg, result, expanded, toggle }) {
  const s = cfg[sample];
  const matches = SAMPLE_DYES.filter(d => result[d]?.match).length;

  const update = (patch) => setCfg({ ...cfg, [sample]: { ...s, ...patch } });
  const updateExpected = (dye, v) => {
    const nv = parseFloat(v);
    if (!isFinite(nv)) return;
    update({ expected: { ...s.expected, [dye]: nv } });
  };
  const applyPreset = (pid) => {
    const p = CHEMISTRY_PRESETS.find(x => x.id === pid);
    if (!p) return;
    const t = s.target;
    update({ chemistry: pid, expected: { B: +(t + p.B).toFixed(2), G: +(t + p.G).toFixed(2), Y: +(t + p.Y).toFixed(2), R: +(t + p.R).toFixed(2) } });
  };

  return (
    <div className="bg-white rounded-lg border border-zinc-200">
      <button onClick={toggle} className="w-full flex items-center justify-between gap-2 p-2.5 text-left hover:bg-zinc-50">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-zinc-400 text-xs">{expanded ? "▾" : "▸"}</span>
          <span className="font-mono text-sm">{sample}</span>
          <span className="text-xs text-zinc-500">Target {s.target.toFixed(1)} bp · Tol ±{s.tolerance.toFixed(1)}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {SAMPLE_DYES.map(d => {
            const ok = !!result[d]?.match;
            return (
              <span key={d}
                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] border ${ok ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-rose-50 border-rose-200 text-rose-600"}`}>
                <span className="inline-block w-2 h-2 rounded-sm" style={{ background: DYE[d].color }} />
                {ok ? "✓" : "✗"}
              </span>
            );
          })}
          <span className="ml-2 text-xs text-zinc-600 font-mono">{matches}/4</span>
        </div>
      </button>
      {expanded && (
        <div className="border-t border-zinc-200 p-3 space-y-3">
          {/* Target + tolerance */}
          <div className="flex flex-wrap gap-3 items-center text-xs">
            <label className="flex items-center gap-1.5">
              <span className="text-zinc-500">Target</span>
              <input type="number" step="0.1" value={s.target}
                onChange={e => {
                  const nv = parseFloat(e.target.value);
                  if (!isFinite(nv)) return;
                  const shift = nv - s.target;
                  const ne = { ...s.expected };
                  for (const d of SAMPLE_DYES) ne[d] = +(ne[d] + shift).toFixed(2);
                  update({ target: nv, expected: ne });
                }}
                className="w-20 px-1.5 py-0.5 border border-zinc-300 rounded font-mono text-right" />
              <span className="text-zinc-500">bp</span>
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-zinc-500">Tolerance ±</span>
              <input type="number" step="0.1" min="0.1" value={s.tolerance}
                onChange={e => update({ tolerance: parseFloat(e.target.value) || 1 })}
                className="w-14 px-1.5 py-0.5 border border-zinc-300 rounded font-mono text-right" />
              <span className="text-zinc-500">bp</span>
            </label>
            <div className="ml-auto flex flex-wrap gap-1">
              <span className="text-zinc-500 mr-1">Preset:</span>
              {CHEMISTRY_PRESETS.map(p => (
                <button key={p.id} onClick={() => applyPreset(p.id)}
                  title={p.name}
                  className={`px-2 py-0.5 rounded border text-[11px] ${s.chemistry === p.id ? "bg-zinc-900 text-white border-zinc-900" : "bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-100"}`}>
                  {p.id === "blunt_both" ? "Blunt×2" : p.id === "blunt_ad1" ? "Blunt+OH4" : p.id === "blunt_ad2" ? "OH4+Blunt" : p.id === "oh4_both" ? "OH4×2" : "OH1×2"}
                </button>
              ))}
              <button onClick={() => {
                const auto = computeAutoDefaults({ [sample]: DATA.peaks[sample] })[sample];
                setCfg({ ...cfg, [sample]: auto });
              }}
                className="px-2 py-0.5 rounded border text-[11px] bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-100">
                Auto
              </button>
            </div>
          </div>

          {/* Per-dye config + observed */}
          <table className="w-full text-xs">
            <thead className="text-zinc-500">
              <tr className="border-b border-zinc-200">
                <th className="py-1 text-left font-medium">Dye</th>
                <th className="py-1 text-right font-medium">Expected (bp)</th>
                <th className="py-1 text-right font-medium">Observed</th>
                <th className="py-1 text-right font-medium">Δ bp</th>
                <th className="py-1 text-right font-medium">Height</th>
                <th className="py-1 text-right font-medium">Area</th>
                <th className="py-1 text-right font-medium">Purity</th>
              </tr>
            </thead>
            <tbody>
              {SAMPLE_DYES.map(d => {
                const r = result[d];
                const ok = !!r.match;
                return (
                  <tr key={d} className="border-b border-zinc-100">
                    <td className="py-1">
                      <span className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-middle" style={{ background: DYE[d].color }} />
                      {DYE[d].label} ({DYE[d].name})
                    </td>
                    <td className="py-1 text-right">
                      <input type="number" step="0.1" value={s.expected[d]}
                        onChange={e => updateExpected(d, e.target.value)}
                        className="w-20 px-1.5 py-0.5 border border-zinc-300 rounded font-mono text-right" />
                    </td>
                    <td className="py-1 text-right font-mono">{ok ? r.match.size.toFixed(2) : "—"}</td>
                    <td className={`py-1 text-right font-mono ${ok ? (Math.abs(r.match.delta) < 1 ? "text-emerald-600" : "text-amber-600") : "text-rose-500"}`}>
                      {ok ? (r.match.delta >= 0 ? "+" : "") + r.match.delta.toFixed(2) : "miss"}
                    </td>
                    <td className="py-1 text-right font-mono">{ok ? Math.round(r.match.height).toLocaleString() : "—"}</td>
                    <td className="py-1 text-right font-mono">{ok ? Math.round(r.match.area).toLocaleString() : "—"}</td>
                    <td className="py-1 text-right font-mono">{r.purity !== null ? (r.purity * 100).toFixed(0) + "%" : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Pair overhangs */}
          <div className="grid grid-cols-2 gap-2">
            <OverhangBadge label="Adapter 1 end (B vs Y · 6-FAM vs TAMRA)" a={result.B?.match?.size} b={result.Y?.match?.size} />
            <OverhangBadge label="Adapter 2 end (G vs R · HEX vs ROX)"    a={result.G?.match?.size} b={result.R?.match?.size} />
          </div>
        </div>
      )}
    </div>
  );
}

// ======================================================================
// TAB 3 — Cross-sample comparison with overlay
// ======================================================================
function AutoClassifyTab({ samples, componentSizes, dyeOffsets, setDyeOffsets, setDyeOffset, constructSeq, setConstructSeq, targetStart, setTargetStart, targetEnd, setTargetEnd }) {
  const [currentSample, setCurrentSample] = useState(samples[0] || "");
  const [heightThreshold, setHeightThreshold] = useState(100);
  const [matchTol, setMatchTol] = useState(8);
  const [clusterTol, setClusterTol] = useState(5);
  const [overhangRange, setOverhangRange] = useState(4);  // consider -N..+N nt
  const [seqDraft, setSeqDraft] = useState(constructSeq);
  const [seqError, setSeqError] = useState("");

  const constructSize = constructSeq.length;
  const sampleData = DATA.peaks[currentSample];

  const overhangs = useMemo(() => {
    const arr = [];
    for (let i = -overhangRange; i <= overhangRange; i++) arr.push(i);
    return arr;
  }, [overhangRange]);

  const classification = useMemo(() => {
    if (!sampleData) return null;
    return classifyPeaks(
      sampleData, constructSeq, targetStart, targetEnd, constructSize,
      componentSizes, ASSEMBLY_PRODUCTS, LAB_GRNA_CATALOG,
      dyeOffsets, heightThreshold, matchTol, clusterTol, overhangs
    );
  }, [sampleData, constructSeq, targetStart, targetEnd, constructSize, componentSizes, dyeOffsets, heightThreshold, matchTol, clusterTol, overhangs]);

  // Auto-calibrate dye offsets from blunt assumption: assume the tallest peak in
  // each channel aligns with its best blunt prediction. Offset = observed - predicted.
  const handleAutoCalibrate = () => {
    if (!sampleData) return;
    const grnas = findGrnas(constructSeq, targetStart, targetEnd);
    const newOffsets = { B: 0, G: 0, Y: 0, R: 0 };
    for (const dye of ["B", "G", "Y", "R"]) {
      const peaks = sampleData[dye] || [];
      if (!peaks.length) continue;
      // Find tallest peak
      let tallest = peaks[0];
      for (const p of peaks) if (p[1] > tallest[1]) tallest = p;
      // Find best blunt prediction across all gRNAs and assembly products
      const predictions = [];
      for (const g of grnas) {
        const pr = predictCutProducts(g, constructSize, 0);
        predictions.push(pr[dye].length);
      }
      for (const prod of ASSEMBLY_PRODUCTS) {
        if (prod.dyes && prod.dyes.indexOf(dye) >= 0) {
          predictions.push(productSize(prod, componentSizes));
        }
      }
      if (!predictions.length) continue;
      let best = predictions[0];
      let bestDelta = Math.abs(tallest[0] - best);
      for (const pr of predictions) {
        const d = Math.abs(tallest[0] - pr);
        if (d < bestDelta) { best = pr; bestDelta = d; }
      }
      newOffsets[dye] = tallest[0] - best;
    }
    for (const dye of ["B", "G", "Y", "R"]) setDyeOffset(dye, newOffsets[dye]);
  };

  const handleResetOffsets = () => {
    for (const dye of ["B", "G", "Y", "R"]) setDyeOffset(dye, 0);
  };

  const handleApplySequence = () => {
    const cleaned = seqDraft.replace(/\s+/g, "").toUpperCase();
    if (!/^[ACGTN]*$/.test(cleaned)) { setSeqError("Only A/C/G/T/N allowed"); return; }
    if (cleaned.length < 50) { setSeqError("Sequence too short (need >= 50 bp)"); return; }
    if (targetStart < 1 || targetEnd > cleaned.length || targetStart >= targetEnd) {
      setSeqError("Target range out of bounds for new sequence length " + cleaned.length);
      return;
    }
    setSeqError("");
    setConstructSeq(cleaned);
  };

  const handleResetSequence = () => {
    setSeqDraft(CONSTRUCT.seq);
    setConstructSeq(CONSTRUCT.seq);
    setTargetStart(CONSTRUCT.targetRange.start);
    setTargetEnd(CONSTRUCT.targetRange.end);
    setSeqError("");
  };

  return (
    <div>
      {/* Top row: sample selector + summary */}
      <div className="bg-white rounded-lg border border-zinc-200 p-3 mb-3">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-xs text-zinc-500 mb-0.5">Sample</label>
            <select value={currentSample} onChange={e => setCurrentSample(e.target.value)}
              className="px-2 py-1 text-sm border border-zinc-300 rounded">
              {samples.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-0.5">Height threshold</label>
            <input type="number" value={heightThreshold} onChange={e => setHeightThreshold(Number(e.target.value) || 0)}
              className="w-20 px-2 py-1 text-sm border border-zinc-300 rounded" />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-0.5">Match tolerance (bp)</label>
            <input type="number" value={matchTol} step="0.5" onChange={e => setMatchTol(Number(e.target.value) || 0)}
              className="w-20 px-2 py-1 text-sm border border-zinc-300 rounded" />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-0.5">Cluster tolerance (bp)</label>
            <input type="number" value={clusterTol} step="0.5" onChange={e => setClusterTol(Number(e.target.value) || 0)}
              className="w-20 px-2 py-1 text-sm border border-zinc-300 rounded" />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-0.5">Overhang range ±</label>
            <input type="number" value={overhangRange} onChange={e => setOverhangRange(Math.max(0, Math.min(10, Number(e.target.value) || 0)))}
              className="w-20 px-2 py-1 text-sm border border-zinc-300 rounded" />
          </div>
          <div className="ml-auto text-xs text-zinc-600">
            Construct length: <span className="font-mono font-semibold">{constructSize}</span> bp &middot; Target: <span className="font-mono">{targetStart}–{targetEnd}</span>
          </div>
        </div>
      </div>

      {/* Dye-mobility offset panel */}
      <Panel
        title="Dye mobility offset"
        subtitle="Subtracted from observed peak sizes before matching. Calibrate using a blunt-control ligation; typical ABI 3500 / 3730 + POP-7 values are 0.2 to 0.8 bp between channels."
        className="mb-3"
        actions={
          <>
            <ToolButton variant="primary" onClick={handleAutoCalibrate} title="Set per-dye offsets so the tallest peak in each channel aligns with its closest blunt prediction">
              Auto-calibrate
            </ToolButton>
            <ToolButton variant="secondary" onClick={handleResetOffsets}>
              Reset
            </ToolButton>
            <ToolButton
              variant="secondary"
              title="Download per-dye offsets as a JSON sidecar; commit to data/calibrations/ for sharing"
              onClick={() => {
                const blob = new Blob([JSON.stringify({ dyeOffsets, savedAt: new Date().toISOString(), sample: currentSample, instrument: "unknown" }, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `dye_offsets_${new Date().toISOString().slice(0,10)}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }}
            >
              Download
            </ToolButton>
            <label className="inline-flex items-center px-2 py-1 text-xs font-medium gap-1.5 rounded-md bg-zinc-100 text-zinc-800 hover:bg-zinc-200 border border-zinc-200 cursor-pointer transition focus-ring">
              Upload
              <input type="file" accept=".json" className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    const obj = JSON.parse(await f.text());
                    const next = obj.dyeOffsets || obj;
                    if (setDyeOffsets && ["B","G","Y","R"].every(k => typeof next[k] === "number")) {
                      setDyeOffsets(next);
                    } else {
                      alert("JSON missing one of B,G,Y,R numeric offsets.");
                    }
                  } catch (err) {
                    alert("Failed to parse JSON: " + err.message);
                  }
                  e.target.value = "";
                }}
              />
            </label>
          </>
        }
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          {["B", "G", "Y", "R"].map(d => (
            <div key={d} className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-zinc-200 bg-zinc-50">
              <DyeChip dye={d} showLabel />
              <div className="flex-1" />
              <input
                type="number"
                step="0.1"
                value={dyeOffsets[d]}
                onChange={e => setDyeOffset(d, e.target.value)}
                className="w-16 px-2 py-1 text-xs font-mono text-right num border border-zinc-300 bg-white rounded-md focus-ring"
              />
              <span className="text-[11px] text-zinc-500">bp</span>
            </div>
          ))}
        </div>
      </Panel>

      {/* Per-dye cluster cards */}
      {classification && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          {["B", "Y", "G", "R"].map(dye => (
            <DyeClusterCard key={dye} dye={dye} data={classification[dye]} dyeOffset={dyeOffsets[dye]} />
          ))}
        </div>
      )}

      {/* Cross-dye interpretation */}
      {classification && (
        <CrossDyeSummary classification={classification} constructSize={constructSize} />
      )}

      {/* Editable construct sequence */}
      <div className="bg-white rounded-lg border border-zinc-200 p-3 mb-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-medium">Construct sequence (editable for generalization)</div>
          <div className="flex gap-2">
            <button onClick={handleApplySequence}
              className="px-2 py-1 text-xs font-medium bg-emerald-700 text-white rounded hover:bg-emerald-600">
              Apply sequence
            </button>
            <button onClick={handleResetSequence}
              className="px-2 py-1 text-xs font-medium bg-zinc-200 rounded hover:bg-zinc-300">
              Reset to V059
            </button>
          </div>
        </div>
        <textarea value={seqDraft} onChange={e => setSeqDraft(e.target.value)}
          className="w-full h-24 p-2 text-xs font-mono border border-zinc-300 rounded"
          placeholder="Paste the full ligated construct sequence (5' to 3' on top strand)" />
        <div className="flex items-center gap-2 mt-2">
          <label className="text-xs text-zinc-600">Target start (1-indexed):</label>
          <input type="number" value={targetStart} onChange={e => setTargetStart(Number(e.target.value) || 1)}
            className="w-20 px-2 py-0.5 text-xs border border-zinc-300 rounded" />
          <label className="text-xs text-zinc-600 ml-3">Target end:</label>
          <input type="number" value={targetEnd} onChange={e => setTargetEnd(Number(e.target.value) || constructSize)}
            className="w-20 px-2 py-0.5 text-xs border border-zinc-300 rounded" />
          <span className="text-xs text-zinc-500 ml-3">
            Length: <span className="font-mono">{seqDraft.replace(/\s+/g, "").length}</span> bp
          </span>
          {seqError && <span className="text-xs text-red-600 ml-3">{seqError}</span>}
        </div>
      </div>
    </div>
  );
}

function DyeClusterCard({ dye, data, dyeOffset }) {
  if (!data || !data.clusters) return null;
  const color = DYE[dye].color;
  const label = DYE[dye].label;
  return (
    <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
      <div className="px-3 py-2 border-b border-zinc-200 flex items-center justify-between"
        style={{background: color + "10"}}>
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded" style={{background: color}} />
          <span className="text-sm font-semibold" style={{color}}>{dye} &middot; {label}</span>
        </div>
        <div className="text-xs text-zinc-600">
          {data.clusters.length} {data.clusters.length === 1 ? "cluster" : "clusters"} &middot; {data.nPeaks} peaks &middot; offset {dyeOffset >= 0 ? "+" : ""}{dyeOffset.toFixed(2)} bp
        </div>
      </div>
      <div className="divide-y divide-zinc-100">
        {data.clusters.length === 0 && (
          <div className="px-3 py-4 text-xs text-zinc-400 italic">No peaks above threshold in this channel.</div>
        )}
        {data.clusters.map((c, i) => (
          <ClusterRow key={i} cluster={c} dyeColor={color} />
        ))}
      </div>
    </div>
  );
}

function ClusterRow({ cluster, dyeColor }) {
  const main = cluster.main;
  const id = cluster.identity;
  const identityLabel = id
    ? (id.kind === "cas9_cut"
        ? (id.grnaName + " " + id.fragment + " (" + id.template + " / " + id.pam_side + ")")
        : id.label)
    : "unassigned";
  return (
    <div className="px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-mono font-bold" style={{color: dyeColor}}>
              {main.size.toFixed(2)} bp
            </span>
            <span className="text-xs text-zinc-500">
              (raw {main.rawSize.toFixed(2)}, height {Math.round(main.height)}, area {Math.round(main.area)})
            </span>
            <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded bg-zinc-100 text-zinc-700">
              {(cluster.channelAbundance * 100).toFixed(1)}% of channel
            </span>
          </div>
          <div className="text-xs text-zinc-700 mt-0.5">
            <span className="font-medium">Best guess:</span> {identityLabel}
          </div>
        </div>
      </div>
      {cluster.peaks.length > 1 && (
        <div className="mt-1.5 pl-3 border-l-2 border-zinc-200">
          <div className="text-[10px] uppercase tracking-wide text-zinc-400 mb-0.5">
            {cluster.peaks.length} species in this cluster (relative to main)
          </div>
          <div className="space-y-0.5">
            {cluster.peaks.map((p, i) => {
              const rel = p.relSize;
              const relLbl = Math.abs(rel) < 0.05 ? "main" : (rel > 0 ? "+" + rel.toFixed(2) + " bp larger" : rel.toFixed(2) + " bp smaller");
              const match = p.bestMatch;
              return (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="font-mono w-16 text-right text-zinc-500">{p.size.toFixed(2)}</span>
                  <span className="w-28 text-zinc-600">{relLbl}</span>
                  <span className="w-16 text-zinc-600">{(p.relAbundance * 100).toFixed(0)}%</span>
                  <span className="text-zinc-700 truncate">
                    {match
                      ? (match.pred.kind === "cas9_cut"
                          ? (match.pred.label + " (Δ=" + match.delta.toFixed(2) + ")")
                          : match.pred.label + " (Δ=" + match.delta.toFixed(2) + ")")
                      : <span className="italic text-zinc-400">no match within tolerance</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function CrossDyeSummary({ classification, constructSize }) {
  // Pair B+Y (Adapter 1 end) and G+R (Adapter 2 end) clusters by proximity.
  // Each dye pair should see matched clusters at the same underlying size if
  // cluster comes from a Cas9 cut.
  const pairClusters = (dyeA, dyeB, pairName) => {
    const a = (classification[dyeA] && classification[dyeA].clusters) || [];
    const b = (classification[dyeB] && classification[dyeB].clusters) || [];
    const rows = [];
    const usedB = new Set();
    for (const ca of a) {
      let bestIdx = -1;
      let bestD = 99;
      for (let j = 0; j < b.length; j++) {
        if (usedB.has(j)) continue;
        const d = Math.abs(ca.mainSize - b[j].mainSize);
        if (d < bestD) { bestD = d; bestIdx = j; }
      }
      if (bestIdx >= 0 && bestD < 20) {
        usedB.add(bestIdx);
        const cb = b[bestIdx];
        rows.push({ a: ca, b: cb, delta: cb.mainSize - ca.mainSize });
      } else {
        rows.push({ a: ca, b: null, delta: null });
      }
    }
    for (let j = 0; j < b.length; j++) if (!usedB.has(j)) rows.push({ a: null, b: b[j], delta: null });
    return { pairName, dyeA, dyeB, rows };
  };

  const p1 = pairClusters("B", "Y", "Adapter 1 end (B + Y)");
  const p2 = pairClusters("G", "R", "Adapter 2 end (G + R)");

  const renderPair = (p) => (
    <div key={p.pairName} className="bg-white rounded-lg border border-zinc-200 p-3">
      <div className="text-sm font-medium mb-2">{p.pairName}</div>
      <div className="text-xs text-zinc-500 mb-2">
        The Δ column reports (size on {p.dyeB}) − (size on {p.dyeA}). Δ ≈ 0 means blunt cut at this adapter end. |Δ| = 4 with consistent sign indicates a 4 nt 5' overhang from BsaI-style or staggered Cas9 chemistry. Values between 0 and 4 indicate mixed chemistries or partial products.
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-zinc-500 border-b border-zinc-200">
            <th className="text-right px-2 py-1">{p.dyeA} main</th>
            <th className="text-right px-2 py-1">{p.dyeB} main</th>
            <th className="text-right px-2 py-1">Δ</th>
            <th className="text-right px-2 py-1">{p.dyeA} abund</th>
            <th className="text-right px-2 py-1">{p.dyeB} abund</th>
            <th className="text-left px-2 py-1">interpretation</th>
          </tr>
        </thead>
        <tbody>
          {p.rows.map((r, i) => {
            let interp = "";
            if (r.a && r.b) {
              const d = r.delta;
              if (Math.abs(d) < 1) interp = "Blunt (consistent across both channels)";
              else if (Math.abs(d - 4) < 1) interp = "4 nt 5' overhang (" + p.dyeB + " longer)";
              else if (Math.abs(d + 4) < 1) interp = "4 nt 5' overhang (" + p.dyeA + " longer)";
              else if (Math.abs(d - 3) < 1 || Math.abs(d + 3) < 1) interp = "3 nt overhang";
              else if (Math.abs(d - 2) < 1 || Math.abs(d + 2) < 1) interp = "2 nt overhang";
              else if (Math.abs(d - 1) < 1 || Math.abs(d + 1) < 1) interp = "1 nt overhang";
              else interp = "Non-paired or measurement noise";
            } else if (r.a) {
              interp = "Only on " + p.dyeA + " — likely missing-adapter product";
            } else {
              interp = "Only on " + p.dyeB + " — likely missing-adapter product";
            }
            return (
              <tr key={i} className="border-b border-zinc-100">
                <td className="text-right px-2 py-1 font-mono">{r.a ? r.a.mainSize.toFixed(2) : "—"}</td>
                <td className="text-right px-2 py-1 font-mono">{r.b ? r.b.mainSize.toFixed(2) : "—"}</td>
                <td className="text-right px-2 py-1 font-mono">{r.delta === null ? "—" : (r.delta >= 0 ? "+" : "") + r.delta.toFixed(2)}</td>
                <td className="text-right px-2 py-1">{r.a ? (r.a.channelAbundance * 100).toFixed(0) + "%" : "—"}</td>
                <td className="text-right px-2 py-1">{r.b ? (r.b.channelAbundance * 100).toFixed(0) + "%" : "—"}</td>
                <td className="px-2 py-1">{interp}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
      {renderPair(p1)}
      {renderPair(p2)}
    </div>
  );
}

function CompareTab({ samples, cfg, results }) {
  const [picked, setPicked] = useState(() => samples.slice(0, 4));
  const [dye,    setDye]    = useState("R");
  const [range,  setRange]  = useState([180, 240]);
  const [normalize, setNormalize] = useState(true);
  const [smoothing, setSmoothing] = useState(1);

  const togglePick = ss => {
    setPicked(p => p.includes(ss) ? p.filter(x => x !== ss) : [...p, ss].slice(0, 8));
  };

  const W = 920, H = 340;
  const m = { l: 60, r: 16, t: 14, b: 42 };
  const plotW = W - m.l - m.r;
  const plotH = H - m.t - m.b;

  // Global y-max across picked samples
  const yMax = useMemo(() => {
    let mx = 0;
    for (const ss of picked) {
      const arr = DATA.peaks[ss]?.[dye] || [];
      for (const p of arr) {
        if (p[0] >= range[0] && p[0] <= range[1]) mx = Math.max(mx, p[1]);
      }
    }
    return mx * 1.1 || 100;
  }, [picked, dye, range]);

  const xScale = s => m.l + ((s - range[0]) / (range[1] - range[0])) * plotW;

  const xTicks = useMemo(() => {
    const span = range[1] - range[0];
    const step = span <= 20 ? 2 : span <= 60 ? 10 : 25;
    const first = Math.ceil(range[0] / step) * step;
    const t = [];
    for (let v = first; v <= range[1]; v += step) t.push(v);
    return t;
  }, [range]);

  // Palette for overlay
  const PALETTE = ["#1e6fdb", "#d32f2f", "#2e9e4a", "#b8860b", "#7c3aed", "#0891b2", "#db2777", "#ea580c"];

  const svgRef = useRef(null);
  const [drag, setDrag] = useState(null);
  const toBp = cx => {
    const r = svgRef.current.getBoundingClientRect();
    return range[0] + (((cx - r.left) * (W / r.width) - m.l) / plotW) * (range[1] - range[0]);
  };

  return (
    <>
      <div className="bg-white rounded-lg border border-zinc-200 p-3 mb-2">
        <div className="text-sm font-medium mb-2">Overlay comparison</div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1">
            <span className="font-semibold uppercase tracking-wide text-zinc-500 mr-1">Channel</span>
            <div className="inline-flex rounded-md border border-zinc-300 overflow-hidden">
              {SAMPLE_DYES.map(d => (
                <button key={d} onClick={() => setDye(d)} className={`px-2 py-1 ${dye === d ? "text-white" : "text-zinc-700 hover:bg-zinc-100"}`}
                  style={dye === d ? { background: DYE[d].color } : {}}>
                  {DYE[d].label}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={normalize} onChange={e => setNormalize(e.target.checked)} className="w-3.5 h-3.5 accent-zinc-700" />
            Normalize per sample
          </label>
          <label className="flex items-center gap-2">
            <span className="text-zinc-500">Smoothing</span>
            <input type="range" min="0.5" max="3" step="0.1" value={smoothing}
                   onChange={e => setSmoothing(parseFloat(e.target.value))} className="accent-zinc-700 w-24" />
            <span className="tabular-nums text-zinc-600 w-8">{smoothing.toFixed(1)}x</span>
          </label>
          <div className="ml-auto flex gap-1">
            {[{ l: "Full", r: [0, 500] }, { l: "Cut 200", r: [180, 230] }, { l: "Cut 88", r: [75, 110] }].map(p => (
              <button key={p.l} onClick={() => setRange(p.r)} className="px-2 py-1 rounded border border-zinc-300 bg-white hover:bg-zinc-100">
                {p.l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Sample picker */}
      <div className="bg-white rounded-lg border border-zinc-200 p-2.5 mb-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">Samples ({picked.length}/8)</div>
        <div className="flex flex-wrap gap-1">
          {samples.map((ss, i) => {
            const idx = picked.indexOf(ss);
            const on = idx >= 0;
            const color = on ? PALETTE[idx % PALETTE.length] : null;
            return (
              <button key={ss} onClick={() => togglePick(ss)}
                className={`px-2.5 py-1 text-xs rounded-md border transition inline-flex items-center gap-1.5 ${on ? "text-white" : "bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-100"}`}
                style={on ? { background: color, borderColor: color } : {}}>
                {on && <span className="inline-block w-2 h-2 rounded-full bg-white" />}
                {ss}
              </button>
            );
          })}
        </div>
      </div>

      {/* Overlay plot */}
      <div className="bg-white rounded-lg border border-zinc-200 p-2 mb-2">
        <div className="px-2 pt-1 pb-1 flex items-center justify-between flex-wrap gap-2">
          <div className="text-sm font-medium">Overlay · {DYE[dye].label} ({DYE[dye].name})</div>
          <div className="text-[11px] text-zinc-500">Drag to zoom · {picked.length} samples</div>
        </div>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto cursor-crosshair"
          onMouseDown={e => { const bp = toBp(e.clientX); if (bp >= range[0] && bp <= range[1]) setDrag({ s: bp, e: bp }); }}
          onMouseMove={e => drag && setDrag({ ...drag, e: toBp(e.clientX) })}
          onMouseUp={() => { if (drag && Math.abs(drag.e - drag.s) > 0.5) { setRange([Math.max(0, Math.min(drag.s, drag.e)), Math.min(500, Math.max(drag.s, drag.e))]); } setDrag(null); }}
          onMouseLeave={() => setDrag(null)}
        >
          <rect x={m.l} y={m.t} width={plotW} height={plotH} fill="#fafbfc" />

          {/* Grid + ticks */}
          {xTicks.map(t => (
            <g key={`xg${t}`}>
              <line x1={xScale(t)} x2={xScale(t)} y1={m.t} y2={m.t + plotH} stroke="#eef2f7" />
              <line x1={xScale(t)} x2={xScale(t)} y1={m.t + plotH} y2={m.t + plotH + 4} stroke="#94a3b8" />
              <text x={xScale(t)} y={m.t + plotH + 15} fontSize="10" textAnchor="middle" fill="#64748b">{t}</text>
            </g>
          ))}

          {/* Axis */}
          <line x1={m.l} x2={m.l + plotW} y1={m.t + plotH} y2={m.t + plotH} stroke="#334155" />
          <line x1={m.l} x2={m.l} y1={m.t} y2={m.t + plotH} stroke="#334155" />
          <text x={m.l + plotW / 2} y={H - 8} fontSize="11" textAnchor="middle" fill="#334155" fontWeight="500">Size (bp)</text>
          <text x={16} y={m.t + plotH / 2} fontSize="11" textAnchor="middle" fill="#334155" fontWeight="500"
                transform={`rotate(-90, 16, ${m.t + plotH / 2})`}>
            {normalize ? "Normalized fluorescence" : "Fluorescence (RFU)"}
          </text>

          {/* Traces */}
          {picked.map((ss, i) => {
            const color = PALETTE[i % PALETTE.length];
            const arr = DATA.peaks[ss]?.[dye] || [];
            if (!arr.length) return null;
            const scopeMax = normalize
              ? Math.max(...arr.filter(p => p[0] >= range[0] && p[0] <= range[1]).map(p => p[1]), 1) * 1.05
              : yMax;
            const laneGeom = { laneTop: m.t, laneH: plotH, mLeft: m.l, plotW };
            const path = buildGaussianPath(arr, range, scopeMax, laneGeom, smoothing, false);
            return (
              <g key={ss}>
                <path d={path.fill}   fill={color} opacity="0.06" />
                <path d={path.stroke} fill="none" stroke={color} strokeWidth="1.75" opacity="0.92" />
              </g>
            );
          })}

          {/* Expected markers from current config, for selected dye, per picked sample */}
          {picked.map((ss, i) => {
            const exp = cfg[ss]?.expected[dye];
            if (exp === undefined || exp < range[0] || exp > range[1]) return null;
            const color = PALETTE[i % PALETTE.length];
            return <line key={`exp-${ss}`} x1={xScale(exp)} x2={xScale(exp)} y1={m.t} y2={m.t + plotH} stroke={color} strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />;
          })}

          {/* Drag rectangle */}
          {drag && Math.abs(drag.e - drag.s) > 0.1 && (
            <rect x={xScale(Math.min(drag.s, drag.e))} y={m.t}
                  width={Math.abs(xScale(drag.e) - xScale(drag.s))} height={plotH}
                  fill="#1e6fdb" opacity="0.10" stroke="#1e6fdb" strokeDasharray="3 3" />
          )}
        </svg>

        {/* Legend */}
        <div className="flex flex-wrap gap-2 px-2 pb-1 pt-1">
          {picked.map((ss, i) => {
            const color = PALETTE[i % PALETTE.length];
            const match = results[ss]?.[dye]?.match;
            return (
              <div key={ss} className="flex items-center gap-1.5 text-[11px]">
                <span className="inline-block w-4 h-0.5" style={{ background: color }} />
                <span className="font-mono">{ss}</span>
                {match && <span className="text-zinc-500">· peak {match.size.toFixed(2)} bp</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Overhang summary chart */}
      <div className="bg-white rounded-lg border border-zinc-200 p-3">
        <div className="text-sm font-medium mb-1">Paired-channel size offsets (putative overhang)</div>
        <div className="text-xs text-zinc-600 mb-2">
          Y→B offset infers the overhang at the Adapter 1 end (6-FAM paired with TAMRA); R→G offset infers the overhang at the Adapter 2 end (HEX paired with ROX). Values near 0 indicate blunt cuts, values near +4 indicate a 4-nt 5' overhang.
        </div>
        <OverhangChart samples={samples} results={results} />
      </div>
    </>
  );
}



// ----------------------------------------------------------------------
// ProductFragmentViz -- Visual rendering of the 4 ssDNA cleavage products.
// For a selected gRNA and overhang model, draws each of the 4 fluor-labeled
// strands as a horizontal bar, colored by channel, with dye position marked,
// length annotated, and template/non-template and PAM-proximal/distal flags.
// ----------------------------------------------------------------------
function ProductFragmentViz({ products, constructSize }) {
  if (!products) return null;
  const W = 920, H = 230;
  const m = { l: 80, r: 80, t: 28, b: 18 };
  const pw = W - m.l - m.r;
  const rowH = 38;
  const barH = 14;

  // Order: top LEFT (Y), bot LEFT (B), top RIGHT (R), bot RIGHT (G)
  const lanes = [
    { dye: "Y", row: 0 },
    { dye: "B", row: 1 },
    { dye: "R", row: 2 },
    { dye: "G", row: 3 },
  ];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      <text x={m.l + pw / 2} y={12} fontSize="10" fill="#475569" textAnchor="middle" fontWeight="600">
        Four labeled ssDNA products after denaturation (scaled to {constructSize} bp construct)
      </text>

      {/* Construct scale ticks at 0, construct size, and 50 bp increments */}
      <line x1={m.l} x2={m.l + pw} y1={m.t - 3} y2={m.t - 3} stroke="#cbd5e1" strokeWidth="1" />
      {[0, 50, 100, 150, 200, 226].filter(v => v <= constructSize).map(v => {
        const x = m.l + (v / constructSize) * pw;
        return (
          <g key={v}>
            <line x1={x} x2={x} y1={m.t - 5} y2={m.t - 1} stroke="#94a3b8" strokeWidth="1" />
            <text x={x} y={m.t - 8} fontSize="8" fill="#64748b" textAnchor="middle">{v}</text>
          </g>
        );
      })}

      {lanes.map(({ dye, row }) => {
        const p = products[dye];
        const y = m.t + row * rowH + 6;
        const fragStart = p.fragment === "LEFT" ? 0 : constructSize - p.length;
        const x1 = m.l + (fragStart / constructSize) * pw;
        const x2 = m.l + ((fragStart + p.length) / constructSize) * pw;
        const dyeColor = DYE[dye].color;

        // Dye marker position: for Y=top LEFT 5' end (left of bar), B=bot LEFT 3' end (left of bar),
        // R=top RIGHT 3' end (right of bar), G=bot RIGHT 5' end (right of bar)
        const dyeOnLeft = (dye === "Y" || dye === "B");
        const dyeX = dyeOnLeft ? x1 : x2;

        return (
          <g key={dye}>
            {/* Lane label (dye info) */}
            <text x={m.l - 6} y={y + 10} fontSize="10" fill="#0f172a" textAnchor="end" fontWeight="600">
              {DYE[dye].name}
            </text>
            <text x={m.l - 6} y={y + 22} fontSize="8" fill="#64748b" textAnchor="end">
              {p.strand} strand
            </text>
            {/* Fragment bar */}
            <rect x={x1} y={y} width={Math.max(1, x2 - x1)} height={barH} fill={dyeColor} opacity="0.85" rx="2" />
            {/* Direction arrow (5' to 3') at the dye end */}
            {dyeOnLeft ? (
              <polygon points={`${x1 + 4},${y + 2} ${x1 + 8},${y + barH / 2} ${x1 + 4},${y + barH - 2}`} fill="white" />
            ) : (
              <polygon points={`${x2 - 4},${y + 2} ${x2 - 8},${y + barH / 2} ${x2 - 4},${y + barH - 2}`} fill="white" />
            )}
            {/* Dye circle */}
            <circle cx={dyeX} cy={y + barH / 2} r="6" fill={dyeColor} stroke="white" strokeWidth="1.5" />
            <text x={dyeX} y={y + barH / 2 + 3} fontSize="7" fill="white" textAnchor="middle" fontWeight="700">{dye}</text>
            {/* Length label */}
            <text x={x2 + 4} y={y + barH / 2 + 3} fontSize="9" fill="#0f172a" fontWeight="700">
              {p.length} nt
            </text>
            {/* Right-side annotations */}
            <text x={m.l + pw + 8} y={y + 6} fontSize="9" fill={p.template === "non-template" ? "#b45309" : "#0369a1"} fontWeight="600">
              {p.template}
            </text>
            <text x={m.l + pw + 8} y={y + 18} fontSize="9" fill={p.pam_side === "proximal" ? "#be123c" : "#475569"}>
              PAM-{p.pam_side}
            </text>
            {/* Fragment annotation */}
            <text x={(x1 + x2) / 2} y={y + barH + 10} fontSize="8" fill="#475569" textAnchor="middle">
              {p.fragment}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function ConstructDiagram({ componentSizes, highlightKey, onHighlight, onSizeChange, cutConstructPos, overhang, grnaStrand, productSizes }) {
  const total = CONSTRUCT.components.reduce((t, c) => t + (componentSizes[c.key] || 0), 0);
  const W = 920, H = 130;
  const m = { l: 10, r: 10, t: 18, b: 38 };
  const pw = W - m.l - m.r;
  let x = m.l;
  const boxes = CONSTRUCT.components.map(c => {
    const w = ((componentSizes[c.key] || 0) / total) * pw;
    const box = { ...c, x, w, size: componentSizes[c.key] || 0 };
    x += w;
    return box;
  });
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
        {/* 5' / 3' labels */}
        <text x={m.l - 2} y={m.t - 4} fontSize="10" fill="#64748b" textAnchor="start">5' →</text>
        <text x={m.l + pw + 2} y={m.t - 4} fontSize="10" fill="#64748b" textAnchor="end">→ 3'</text>

        {/* Component boxes */}
        {boxes.map(b => {
          const hl = highlightKey === b.key;
          return (
            <g key={b.key} style={{ cursor: onHighlight ? "pointer" : "default" }}
               onMouseEnter={() => onHighlight && onHighlight(b.key)}
               onMouseLeave={() => onHighlight && onHighlight(null)}>
              <rect x={b.x} y={m.t} width={Math.max(1, b.w)} height={28} fill={b.color}
                    opacity={hl ? 1 : 0.85} stroke={hl ? "#0f172a" : "white"} strokeWidth={hl ? 1.5 : 1} />
              {b.w > 20 && (
                <text x={b.x + b.w / 2} y={m.t + 18} fontSize="10" fill="white" textAnchor="middle" fontWeight="600" pointerEvents="none">
                  {b.name.replace("Fluor ", "").replace("Oligo ", "")}
                </text>
              )}
              {/* Dye markers above fluor adapters */}
              {b.dyes.map((d, i) => (
                <g key={d}>
                  <circle cx={b.x + 8 + i * 14} cy={m.t - 8} r="5" fill={DYE[d].color} stroke="white" strokeWidth="1" />
                  <text x={b.x + 8 + i * 14} y={m.t - 5} fontSize="7" fill="white" textAnchor="middle" fontWeight="700" pointerEvents="none">
                    {d}
                  </text>
                </g>
              ))}
              {/* Size labels below */}
              <text x={b.x + b.w / 2} y={m.t + 42} fontSize="9" fill="#334155" textAnchor="middle" fontFamily="ui-monospace, monospace">
                {b.size}
              </text>
            </g>
          );
        })}

        {/* Cut site marker (if a gRNA is selected) */}
        {cutConstructPos != null && (() => {
          const cx = m.l + (cutConstructPos / total) * pw;
          const cx2 = m.l + ((cutConstructPos + (overhang || 0)) / total) * pw;
          const leftBp = cutConstructPos;
          const rightBp = total - cutConstructPos;
          return (
            <g>
              {/* Overhang band (top<->bot cut offset) */}
              {overhang > 0 && (
                <rect x={cx} y={m.t - 2} width={Math.max(1, cx2 - cx)} height={32} fill="#fbbf24" opacity="0.35" />
              )}
              {/* Cut line on top strand */}
              <line x1={cx} x2={cx} y1={m.t - 6} y2={m.t + 32} stroke="#dc2626" strokeWidth="2" strokeDasharray="2,2" />
              {/* Cut line on bot strand (if overhang) */}
              {overhang > 0 && (
                <line x1={cx2} x2={cx2} y1={m.t - 6} y2={m.t + 32} stroke="#dc2626" strokeWidth="2" strokeDasharray="2,2" />
              )}
              {/* Scissor triangle */}
              <polygon points={`${cx - 4},${m.t - 10} ${cx + 4},${m.t - 10} ${cx},${m.t - 4}`} fill="#dc2626" />
              <text x={cx} y={m.t - 13} fontSize="9" fill="#dc2626" textAnchor="middle" fontWeight="700">cut</text>
              {/* Size annotations */}
              <text x={m.l + (cutConstructPos / 2 / total) * pw + m.l / 2} y={m.t + 48} fontSize="9" fill="#475569" textAnchor="middle">
                LEFT {leftBp} bp {grnaStrand === "top" ? "(PAM-distal)" : "(PAM-proximal)"}
              </text>
              <text x={m.l + ((cutConstructPos + total) / 2 / total) * pw - m.l / 2} y={m.t + 48} fontSize="9" fill="#475569" textAnchor="middle">
                RIGHT {rightBp} bp {grnaStrand === "top" ? "(PAM-proximal)" : "(PAM-distal)"}
              </text>
            </g>
          );
        })()}

        {/* Scale bar */}
        <line x1={m.l} x2={m.l + pw} y1={m.t + 54} y2={m.t + 54} stroke="#94a3b8" strokeWidth="1" />
        <text x={m.l + pw / 2} y={m.t + 68} fontSize="10" fill="#334155" textAnchor="middle" fontWeight="500">Full ligation product: {total} bp</text>
      </svg>

      {/* Editable component sizes */}
      {onSizeChange && (
        <div className="flex flex-wrap gap-2 pt-1 text-xs">
          <span className="text-zinc-500 font-semibold uppercase tracking-wide">Component sizes (bp):</span>
          {CONSTRUCT.components.map(c => (
            <label key={c.key} className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: c.color }} />
              <span className="text-zinc-600">{c.name.replace("Fluor ", "").replace("Oligo ", "")}</span>
              <input type="number" min="0" step="1" value={componentSizes[c.key] || 0}
                onChange={e => onSizeChange(c.key, parseInt(e.target.value || "0", 10))}
                className="w-14 px-1.5 py-0.5 border border-zinc-300 rounded font-mono text-right text-xs" />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function AssemblyProductsCard({ componentSizes, onSizeChange, onApply }) {
  const [hl, setHl] = useState(null);
  return (
    <div className="bg-white rounded-lg border border-zinc-200 p-3 mb-3">
      <div className="text-sm font-medium mb-2">Construct architecture · Expected product sizes</div>
      <ConstructDiagram componentSizes={componentSizes} highlightKey={hl} onHighlight={setHl} onSizeChange={onSizeChange} />

      <div className="mt-3 text-xs text-zinc-600">
        Choose an assembly product to set expected peak positions for the currently-selected sample. Each product predicts peaks in specific dye channels only.
      </div>
      <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-1.5">
        {ASSEMBLY_PRODUCTS.map(p => {
          const sz = productSize(p, componentSizes);
          return (
            <button key={p.id} onClick={() => onApply(p.id, sz, p.dyes)}
              className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs border border-zinc-200 rounded hover:bg-zinc-50 text-left">
              <span className="truncate">
                <span className="font-medium">{p.name}</span>
                <span className="text-zinc-500 ml-1">
                  {p.dyes.length ? "(" + p.dyes.map(d => DYE[d].label).join(", ") + ")" : "(no dye)"}
                </span>
              </span>
              <span className="font-mono text-zinc-700 shrink-0">{sz} bp</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TargetSequenceView({ fullConstruct, targetStart, targetEnd, grnas, selectedId }) {
  const seq = fullConstruct.substring(targetStart - 1, targetEnd).toUpperCase();
  const annot = new Array(seq.length).fill(null).map(() => ({}));
  for (const g of grnas) {
    const ti = g.target_pos - 1;
    if (g.strand === "top") {
      for (let k = 0; k < 20; k++) if (ti + k < seq.length) annot[ti + k].top = true;
      for (let k = 20; k < 23; k++) if (ti + k < seq.length) { annot[ti + k].top = true; annot[ti + k].isPamTop = true; }
    } else {
      for (let k = 0; k < 3; k++) if (ti + k < seq.length) { annot[ti + k].bot = true; annot[ti + k].isPamBot = true; }
      for (let k = 3; k < 23; k++) if (ti + k < seq.length) annot[ti + k].bot = true;
    }
    if (g.id === selectedId) {
      for (let k = 0; k < 23; k++) if (ti + k < seq.length) annot[ti + k].isSel = true;
    }
  }
  const chunks = [];
  for (let i = 0; i < seq.length; i += 60) chunks.push([i, seq.substring(i, i + 60)]);
  return (
    <div className="bg-zinc-50 rounded border border-zinc-200 p-2 font-mono text-[11px] leading-relaxed overflow-x-auto">
      {chunks.map(([start, chunk]) => (
        <div key={start} className="whitespace-pre">
          <span className="text-zinc-400 select-none">{String(start + 1).padStart(4, " ")}  </span>
          {chunk.split("").map((c, k) => {
            const a = annot[start + k] || {};
            const cls = [
              a.isSel ? "bg-yellow-200" : "",
              a.isPamTop ? "text-green-700 font-bold" : (a.top ? "text-green-600" : ""),
              a.isPamBot ? "text-pink-700 font-bold" : (a.bot ? "text-pink-600" : ""),
            ].filter(Boolean).join(" ");
            return <span key={k} className={cls}>{c}</span>;
          })}
          <span className="text-zinc-400 select-none">  {String(Math.min(start + chunk.length, seq.length)).padStart(4, " ")}</span>
        </div>
      ))}
      <div className="flex flex-wrap gap-3 pt-2 text-[10px] text-zinc-600 border-t border-zinc-200 mt-2">
        <span><span className="inline-block w-3 h-3 bg-green-600 mr-1 align-middle" />Top protospacer</span>
        <span><span className="inline-block w-3 h-3 bg-green-700 mr-1 align-middle" />Top PAM (NGG)</span>
        <span><span className="inline-block w-3 h-3 bg-pink-600 mr-1 align-middle" />Bot protospacer</span>
        <span><span className="inline-block w-3 h-3 bg-pink-700 mr-1 align-middle" />Bot PAM (CCN on top)</span>
        <span><span className="inline-block w-3 h-3 bg-yellow-200 mr-1 align-middle" />Selected gRNA</span>
      </div>
    </div>
  );
}

function CutPredictionTab({ samples, cfg, setCfg, results }) {
  const grnas = useMemo(() => findGrnas(CONSTRUCT.seq, CONSTRUCT.targetRange.start, CONSTRUCT.targetRange.end), []);
  const [selectedId, setSelectedId] = useState(null);
  const [customGrna, setCustomGrna] = useState("");
  const [customError, setCustomError] = useState("");
  const [customGrnaObj, setCustomGrnaObj] = useState(null);
  const [currentSample, setCurrentSample] = useState(samples[0] || "");
  const [overhang, setOverhang] = useState(0);
  const [onlyCatalog, setOnlyCatalog] = useState(false);

  // Pre-compute catalog matches for every candidate gRNA (stable across renders).
  const catalogMatches = useMemo(() => {
    const map = {};
    for (const g of grnas) map[g.id] = matchLabCatalog(g);
    return map;
  }, [grnas]);
  const catalogCount = Object.values(catalogMatches).filter(Boolean).length;
  const visibleGrnas = onlyCatalog ? grnas.filter(g => catalogMatches[g.id]) : grnas;

  const activeGrna = selectedId !== null
    ? (selectedId === -1 ? customGrnaObj : grnas.find(g => g.id === selectedId))
    : null;
  const predictedProducts = activeGrna ? predictCutProducts(activeGrna, CONSTRUCT.total, overhang) : null;

  const observed = {};
  if (currentSample && results[currentSample]) {
    for (const d of SAMPLE_DYES) {
      const r = results[currentSample][d];
      observed[d] = r && r.match ? r.match.size : null;
    }
  }

  const handleAutoPick = () => {
    if (!currentSample) return;
    // Bias toward lab catalog: try catalog-only first, fall back to full set
    const catalogGrnas = grnas.filter(g => catalogMatches[g.id]);
    let best = null;
    if (catalogGrnas.length) {
      best = autoPickGrna(catalogGrnas, observed, CONSTRUCT.total, [0, 1, 2, 3, 4]);
      // Accept catalog match only if reasonable (<=5 bp mean deviation); otherwise fall through
      if (best && best.score > 5) best = null;
    }
    if (!best) best = autoPickGrna(grnas, observed, CONSTRUCT.total, [0, 1, 2, 3, 4]);
    if (best) { setSelectedId(best.grna.id); setOverhang(best.overhang); }
  };

  const handleFindCustom = () => {
    setCustomError(""); setCustomGrnaObj(null);
    const res = locateCustomGrna(customGrna, CONSTRUCT.seq, CONSTRUCT.targetRange.start, CONSTRUCT.targetRange.end);
    if (!res.ok) { setCustomError(res.error); return; }
    setCustomGrnaObj(res.grna); setSelectedId(-1);
  };

  const applyToSample = () => {
    if (!predictedProducts || !currentSample) return;
    setCfg(prev => ({
      ...prev,
      [currentSample]: {
        ...prev[currentSample],
        target: Math.round((predictedProducts.B.length + predictedProducts.Y.length) / 2),
        expected: { B: predictedProducts.B.length, G: predictedProducts.G.length, Y: predictedProducts.Y.length, R: predictedProducts.R.length },
        chemistry: "custom",
      },
    }));
  };

  const predictBlunt = (g) => predictCutProducts(g, CONSTRUCT.total, 0);

  return (
    <>
      <div className="bg-white rounded-lg border border-zinc-200 p-3 mb-2">
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-sm font-medium">Target sequence &middot; construct pos {CONSTRUCT.targetRange.start} to {CONSTRUCT.targetRange.end} ({CONSTRUCT.targetRange.end - CONSTRUCT.targetRange.start + 1} bp)</div>
          <div className="text-xs text-zinc-500">{grnas.length} gRNA candidates ({grnas.filter(g=>g.strand==="top").length} top, {grnas.filter(g=>g.strand==="bot").length} bot)</div>
        </div>
        <TargetSequenceView fullConstruct={CONSTRUCT.seq} targetStart={CONSTRUCT.targetRange.start} targetEnd={CONSTRUCT.targetRange.end} grnas={grnas} selectedId={selectedId} />
        {activeGrna && (
          <div className="mt-3 border-t border-zinc-200 pt-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1">Cut site on full 226 bp construct</div>
            <ConstructDiagram
              componentSizes={componentSizesFrom(CONSTRUCT)}
              cutConstructPos={activeGrna.cut_construct}
              overhang={overhang}
              grnaStrand={activeGrna.strand}
            />
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg border border-zinc-200 p-3 mb-2">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">Custom gRNA (20 nt DNA or RNA)</div>
            <div className="flex gap-1.5 items-center">
              <input type="text" value={customGrna} onChange={e => setCustomGrna(e.target.value)}
                placeholder="e.g. ACGTGCTGAGGTCCATAGCC"
                className="flex-1 px-2 py-1 text-xs border border-zinc-300 rounded font-mono uppercase" />
              <button onClick={handleFindCustom} className="px-2.5 py-1 text-xs rounded bg-zinc-900 text-white hover:bg-zinc-700">Find</button>
            </div>
            {customError && <div className="text-xs text-red-600 mt-1">{customError}</div>}
            {customGrnaObj && <div className="text-xs text-zinc-600 mt-1">Found on <b>{customGrnaObj.strand}</b> strand &middot; target pos {customGrnaObj.target_pos} &middot; PAM {customGrnaObj.pam_seq} &middot; cut at construct pos {customGrnaObj.cut_construct}.</div>}
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">Auto-pick from observed peaks</div>
            <div className="flex gap-1.5 items-center flex-wrap">
              <label className="text-xs text-zinc-600">Sample:</label>
              <select value={currentSample} onChange={e => setCurrentSample(e.target.value)} className="px-1.5 py-1 text-xs border border-zinc-300 rounded">
                {samples.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <button onClick={handleAutoPick} className="px-2.5 py-1 text-xs rounded bg-emerald-700 text-white hover:bg-emerald-600">Auto-pick best match</button>
            </div>
            <div className="text-xs text-zinc-600 mt-1 font-mono">
              observed: B={observed.B?.toFixed(1) ?? "-"} Y={observed.Y?.toFixed(1) ?? "-"} G={observed.G?.toFixed(1) ?? "-"} R={observed.R?.toFixed(1) ?? "-"}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-zinc-200 p-3 mb-2">
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-sm font-medium">gRNA candidates &middot; blunt-cut size predictions</div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500">{catalogCount} of {grnas.length} match lab catalog</span>
            <label className="flex items-center gap-1.5 text-xs text-zinc-700">
              <input type="checkbox" checked={onlyCatalog} onChange={e => setOnlyCatalog(e.target.checked)} className="rounded" />
              Show only lab catalog
            </label>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-zinc-500 border-b border-zinc-200">
                <th className="text-left px-1 py-1">#</th>
                <th className="text-left px-1 py-1">strand</th>
                <th className="text-left px-1 py-1">PAM</th>
                <th className="text-left px-1 py-1">protospacer (20 nt, 5'-to-3')</th>
                <th className="text-right px-1 py-1">targ pos</th>
                <th className="text-right px-1 py-1">cut bp</th>
                <th className="text-right px-1 py-1">Y</th>
                <th className="text-right px-1 py-1">B</th>
                <th className="text-right px-1 py-1">G</th>
                <th className="text-right px-1 py-1">R</th>
                <th className="text-left px-1 py-1">lab catalog</th>
                <th className="text-left px-1 py-1"></th>
              </tr>
            </thead>
            <tbody>
              {visibleGrnas.map(g => {
                const p = predictBlunt(g);
                const sel = g.id === selectedId;
                return (
                  <tr key={g.id} className={`border-b border-zinc-100 ${sel ? "bg-yellow-50" : ""}`}>
                    <td className="px-1 py-0.5 text-zinc-400">{g.id + 1}</td>
                    <td className="px-1 py-0.5">
                      <span className={`px-1 rounded text-white text-[10px] ${g.strand === "top" ? "bg-green-700" : "bg-pink-700"}`}>{g.strand}</span>
                    </td>
                    <td className="px-1 py-0.5 font-bold">{g.pam_seq}</td>
                    <td className="px-1 py-0.5 text-zinc-700">{g.protospacer}</td>
                    <td className="px-1 py-0.5 text-right">{g.target_pos}</td>
                    <td className="px-1 py-0.5 text-right">{g.cut_construct}</td>
                    <td className="px-1 py-0.5 text-right" style={{color:DYE.Y.color}}>{p.Y.length}</td>
                    <td className="px-1 py-0.5 text-right" style={{color:DYE.B.color}}>{p.B.length}</td>
                    <td className="px-1 py-0.5 text-right" style={{color:DYE.G.color}}>{p.G.length}</td>
                    <td className="px-1 py-0.5 text-right" style={{color:DYE.R.color}}>{p.R.length}</td>
                    <td className="px-1 py-0.5">
                      {catalogMatches[g.id] ? (
                        <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px] font-semibold" title={catalogMatches[g.id].notes}>
                          {catalogMatches[g.id].name}
                        </span>
                      ) : (
                        <span className="text-zinc-300 text-[10px]">—</span>
                      )}
                    </td>
                    <td className="px-1 py-0.5">
                      <button onClick={() => setSelectedId(g.id)}
                        className={`px-2 py-0.5 text-[10px] rounded border ${sel ? "bg-yellow-400 border-yellow-500 text-zinc-900" : "bg-white border-zinc-300 text-zinc-700 hover:bg-zinc-100"}`}>
                        {sel ? "selected" : "select"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {activeGrna && predictedProducts && (
        <div className="bg-white rounded-lg border-2 border-yellow-400 p-3 mb-2">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-sm font-medium">
                Selected gRNA: <span className="font-mono">{activeGrna.protospacer}</span>
                <span className="ml-2 px-1.5 rounded text-white text-xs" style={{background: activeGrna.strand === "top" ? "#15803d" : "#be185d"}}>{activeGrna.strand} strand</span>
              </div>
              <div className="text-xs text-zinc-600 mt-0.5">
                PAM: <b>{activeGrna.pam_seq}</b> &middot; target pos {activeGrna.target_pos} &middot; cut at construct pos {activeGrna.cut_construct}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-zinc-600">Cut chemistry:</label>
              <select value={overhang} onChange={e => setOverhang(parseInt(e.target.value, 10))} className="px-1.5 py-1 text-xs border border-zinc-300 rounded">
                <option value={0}>Blunt (Cas9 classic)</option>
                <option value={1}>1 nt 5' overhang</option>
                <option value={2}>2 nt 5' overhang</option>
                <option value={3}>3 nt 5' overhang</option>
                <option value={4}>4 nt 5' overhang</option>
              </select>
            </div>
          </div>

          <div className="mb-3 border border-zinc-200 rounded p-2 bg-zinc-50">
            <ProductFragmentViz products={predictedProducts} constructSize={CONSTRUCT.total} />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-500 border-b border-zinc-200">
                  <th className="text-left px-2 py-1">Dye</th>
                  <th className="text-left px-2 py-1">ssDNA length</th>
                  <th className="text-left px-2 py-1">Fragment</th>
                  <th className="text-left px-2 py-1">Strand</th>
                  <th className="text-left px-2 py-1">Template vs gRNA</th>
                  <th className="text-left px-2 py-1">PAM location</th>
                  <th className="text-left px-2 py-1">&Delta; from observed</th>
                </tr>
              </thead>
              <tbody>
                {["Y","B","G","R"].map(d => {
                  const p = predictedProducts[d];
                  const obs = observed[d];
                  const delta = obs !== null && obs !== undefined ? (obs - p.length) : null;
                  return (
                    <tr key={d} className="border-b border-zinc-100">
                      <td className="px-2 py-1">
                        <span className="inline-block w-3 h-3 rounded-full mr-1.5 align-middle" style={{background:DYE[d].color}} />
                        <span className="font-medium">{DYE[d].name}</span>
                        <span className="text-zinc-500 ml-1">({DYE[d].label})</span>
                      </td>
                      <td className="px-2 py-1 font-mono font-bold">{p.length} nt</td>
                      <td className="px-2 py-1">{p.fragment}</td>
                      <td className="px-2 py-1">{p.strand}</td>
                      <td className="px-2 py-1">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${p.template === "non-template" ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800"}`}>{p.template}</span>
                      </td>
                      <td className="px-2 py-1">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${p.pam_side === "proximal" ? "bg-rose-100 text-rose-800" : "bg-zinc-100 text-zinc-700"}`}>PAM-{p.pam_side}</span>
                      </td>
                      <td className="px-2 py-1 font-mono">
                        {obs !== null && obs !== undefined ? (
                          <span className={`${Math.abs(delta) < 2 ? "text-emerald-700" : Math.abs(delta) < 5 ? "text-amber-700" : "text-red-700"}`}>
                            obs {obs.toFixed(2)} &middot; {delta >= 0 ? "+" : ""}{delta.toFixed(2)} bp
                          </span>
                        ) : <span className="text-zinc-400">no observed peak</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <label className="text-xs text-zinc-600">Apply predicted sizes to:</label>
            <select value={currentSample} onChange={e => setCurrentSample(e.target.value)} className="px-1.5 py-1 text-xs border border-zinc-300 rounded">
              {samples.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button onClick={applyToSample} className="px-2.5 py-1 text-xs rounded bg-zinc-900 text-white hover:bg-zinc-700">Apply to sample</button>
          </div>

          <div className="mt-2 text-[11px] text-zinc-600 leading-snug">
            <b>Legend.</b> <b>non-template strand</b> carries 5'-NGG-3' (the strand the Cas9 gRNA displaces via R-loop). <b>template strand</b> is the complement, hybridized by the gRNA. <b>PAM-proximal</b> fragment contains the PAM sequence; <b>PAM-distal</b> fragment does not. For 5' overhangs, the top-strand cut and bot-strand cut are offset by the overhang length.
          </div>
        </div>
      )}
    </>
  );
}

function OverhangChart({ samples, results }) {
  const W = 920, H = Math.max(220, 40 + samples.length * 22);
  const m = { l: 110, r: 24, t: 10, b: 36 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  const CLIP = 8;
  const bandH = ph / samples.length;
  const xFor = v => m.l + ((Math.max(-CLIP, Math.min(CLIP, v)) + CLIP) / (2 * CLIP)) * pw;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      <line x1={m.l} x2={m.l + pw} y1={m.t + ph} y2={m.t + ph} stroke="#334155" />
      <line x1={m.l + pw / 2} x2={m.l + pw / 2} y1={m.t} y2={m.t + ph} stroke="#94a3b8" strokeDasharray="2 3" />
      {[-CLIP, -4, 0, 4, CLIP].map(t => {
        const x = m.l + ((t + CLIP) / (2 * CLIP)) * pw;
        return (
          <g key={t}>
            <line x1={x} x2={x} y1={m.t + ph} y2={m.t + ph + 4} stroke="#94a3b8" />
            <text x={x} y={m.t + ph + 16} fontSize="10" textAnchor="middle" fill="#64748b">
              {t <= -CLIP ? `≤-${CLIP}` : t >= CLIP ? `≥${CLIP}` : t}
            </text>
          </g>
        );
      })}
      <text x={m.l + pw / 2} y={H - 4} fontSize="11" textAnchor="middle" fill="#334155" fontWeight="500">Size offset (bp)</text>

      {samples.map((sample, i) => {
        const yCenter = m.t + bandH * (i + 0.5);
        const barH = Math.min(8, bandH * 0.3);
        const r = results[sample];
        const b = r?.B?.match, y = r?.Y?.match, g = r?.G?.match, red = r?.R?.match;
        const bvr = (b && y)   ? y.size - b.size   : null;  // Adapter 1 end overhang (B=FAM, Y=TAMRA)
        const gvy = (g && red) ? red.size - g.size : null;  // Adapter 2 end overhang (G=HEX, R=ROX)
        const x0 = m.l + pw / 2;
        return (
          <g key={sample}>
            <text x={m.l - 8} y={yCenter + 4} fontSize="11" textAnchor="end" fill="#334155" fontFamily="ui-monospace, monospace">{sample}</text>
            {bvr !== null && (
              <>
                <rect x={Math.min(x0, xFor(bvr))} y={yCenter - barH - 1}
                      width={Math.abs(xFor(bvr) - x0)} height={barH} fill="#d32f2f"
                      opacity={Math.abs(bvr) > CLIP ? 0.35 : 0.85} />
                <text x={xFor(bvr) + (bvr >= 0 ? 4 : -4)} y={yCenter - 3}
                      fontSize="10" fontFamily="ui-monospace, monospace"
                      textAnchor={bvr >= 0 ? "start" : "end"} fill="#64748b">{bvr.toFixed(2)}</text>
              </>
            )}
            {gvy !== null && (
              <>
                <rect x={Math.min(x0, xFor(gvy))} y={yCenter + 1}
                      width={Math.abs(xFor(gvy) - x0)} height={barH} fill="#b8860b"
                      opacity={Math.abs(gvy) > CLIP ? 0.35 : 0.85} />
                <text x={xFor(gvy) + (gvy >= 0 ? 4 : -4)} y={yCenter + 12}
                      fontSize="10" fontFamily="ui-monospace, monospace"
                      textAnchor={gvy >= 0 ? "start" : "end"} fill="#64748b">{gvy.toFixed(2)}</text>
              </>
            )}
          </g>
        );
      })}

      <g>
        <rect x={W - 210} y={m.t + 4} width={10} height={7} fill="#b8860b" />
        <text x={W - 196} y={m.t + 11} fontSize="10" fill="#334155">Y → B (Adapter 1 end)</text>
        <rect x={W - 210} y={m.t + 18} width={10} height={7} fill="#d32f2f" />
        <text x={W - 196} y={m.t + 25} fontSize="10" fill="#334155">R → G (Adapter 2 end)</text>
      </g>
    </svg>
  );
}
