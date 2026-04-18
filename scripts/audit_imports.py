#!/usr/bin/env python3
"""
audit_imports.py — find unresolved import references in src/.

After the #13 monolith split, Rollup silently treated a dozen missing imports
as globals (Toolbar, SAMPLE_DYES, etc.). The build passed, the browser threw
ReferenceError at mount, and every downstream "fix" still left a few more
unresolved names. This script closes that gap.

Two checks, both based on the minified production bundle and the source tree:

  1. SOURCE-SIDE: for each file in src/components + src/tabs, diff the
     identifiers it uses against the identifiers it imports + declares
     locally. Any name that is known to be exported by some other file in
     the repo but isn't imported here is flagged as a likely missing import.

  2. BUNDLE-SIDE: grep the minified dist/ bundle for the list of known
     component names. A correctly-resolved import is minified to a single
     letter (e.g. 'a', 'Xh'); a still-raw PascalCase name is the smoking
     gun of an unresolved reference.

Run the source-side check after any refactor; run the bundle-side check
after `npm run build`. CI should block on both returning 0.
"""
from __future__ import annotations
import glob
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
DIST = ROOT / "dist"

REACT_HOOKS = {
    "useState", "useEffect", "useMemo", "useRef", "useCallback",
    "useLayoutEffect", "createPortal", "forwardRef", "memo",
}
# Props commonly destructured as PascalCase (e.g. `({ icon: Icon })`)
PROP_FALSE_POSITIVES = {"Icon"}


def exported_names(files: list[Path]) -> set[str]:
    """Collect every `export function X`, `export const X`, and `export { X, Y }` name."""
    out: set[str] = set()
    for f in files:
        src = f.read_text()
        for m in re.finditer(
            r"^export\s+(?:function|const|let|var|class)\s+([A-Za-z_][A-Za-z0-9_]*)",
            src,
            re.MULTILINE,
        ):
            out.add(m.group(1))
        for m in re.finditer(r"^export\s*\{\s*([^}]+)\s*\}", src, re.MULTILINE):
            out.update(re.findall(r"[A-Za-z_][A-Za-z0-9_]*", m.group(1)))
    return out


def source_side_missing() -> list[tuple[str, str]]:
    lib_files = list((SRC / "lib").glob("*.js"))
    comp_files = list((SRC / "components").glob("*.jsx"))
    tab_files = list((SRC / "tabs").glob("*.jsx"))
    known = exported_names(lib_files + comp_files + tab_files) | REACT_HOOKS

    missing: list[tuple[str, str]] = []
    # Include lib/ in the check — v0.27.0 slipped through because biology.js
    # and analysis.js picked up SAMPLE_DYES + CONSTRUCT from the monolith
    # scope and stopped working when they moved here.
    for f in lib_files + comp_files + tab_files:
        src = f.read_text()
        # Strip comments and string literals to avoid false matches
        sc = re.sub(r"//.*$", "", src, flags=re.MULTILINE)
        sc = re.sub(r"/\*[\s\S]*?\*/", "", sc)
        sc = re.sub(r'"[^"\\]*(?:\\.[^"\\]*)*"', '""', sc)
        sc = re.sub(r"'[^'\\]*(?:\\.[^'\\]*)*'", "''", sc)

        imports_blob = "\n".join(
            re.findall(
                r"import[\s\S]+?from\s+['\"][^'\"]+['\"]\s*;?", src
            )
        )
        import_ids = set(re.findall(r"\b([A-Za-z_][A-Za-z0-9_]+)\b", imports_blob))
        decl_ids = set(
            re.findall(
                r"\b(?:function|const|let|var|class)\s+([A-Za-z_][A-Za-z0-9_]+)", sc
            )
        )
        used = set(re.findall(r"\b([A-Za-z_][A-Za-z0-9_]+)\b", sc))
        unresolved = (used & known) - import_ids - decl_ids - PROP_FALSE_POSITIVES
        for m in sorted(unresolved):
            missing.append((str(f.relative_to(ROOT)), m))
    return missing


def bundle_side_raw() -> list[tuple[str, int]]:
    """Known component names should be minified; raw occurrences are bugs."""
    candidates = glob.glob(str(DIST / "assets" / "index-*.js"))
    if not candidates:
        return []
    with open(sorted(candidates)[-1]) as f:
        bundle = f.read()

    component_names = [
        # Chrome
        "Toolbar", "Sidebar", "StatusBar", "SidebarLink",
        "DropOverlay", "UploadButton",
        # Diagrams
        "ConstructDiagram", "ProductFragmentViz",
        "AssemblyProductsCard", "TargetSequenceView",
        # Species
        "SpeciesSchematic", "SpeciesLegend", "SpeciesSidebar",
        # Tabs
        "TraceTab", "CompareTab", "HeatmapTab", "PeakIdTab",
        "CutPredictionTab", "AutoClassifyTab", "OverhangChart",
        # Tab helpers
        "VisibleWindowCard", "SampleSummaryCard", "SampleConfigRow",
        "DyeClusterCard", "ClusterRow", "CrossDyeSummary",
        "PeakSpeciesPopover",
        # Chromatograms
        "StackedChromatogram", "MiniChromatogram",
        # Editors
        "EndStructureEditor", "PostTailingPanel", "NudgeRow",
        "SampleStyleRow", "PrepControls", "PeakShiftPanel",
        # Modals
        "DNADiagramsModal", "ReportModal",
        # Design system
        "Panel", "Stat", "Pill", "DyeChip", "Field", "ToolButton",
        "ExportMenu", "LabInventoryBadge", "LabInventoryPanel",
        "PrintStyles", "KeyboardHelpModal",
    ]
    raw: list[tuple[str, int]] = []
    for name in component_names:
        # Bracket the match to rule out substrings of other tokens.
        pattern = r"(?<![A-Za-z0-9_$])" + re.escape(name) + r"(?![A-Za-z0-9_$])"
        n = len(re.findall(pattern, bundle))
        if n:
            raw.append((name, n))
    return raw


def main() -> int:
    src_missing = source_side_missing()
    for f, name in src_missing:
        print(f"src-missing  {f}  {name}")

    raw = bundle_side_raw()
    for name, n in raw:
        print(f"bundle-raw   {name}  × {n}")

    if not src_missing and not raw:
        print("audit clean (0 source-missing, 0 bundle-raw)")
        return 0
    print(
        f"FAIL  {len(src_missing)} source-missing, "
        f"{len(raw)} bundle-raw"
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
