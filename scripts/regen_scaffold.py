#!/usr/bin/env python3
"""
regen_scaffold.py — Regenerate src/FragmentViewer.scaffold.jsx from the current viewer.

The scaffold is the viewer with the inlined `const DATA = {...};` literal swapped for
`const DATA = __DATA__;`. `scripts/build_artifact.py` substitutes new GeneMapper data
into that placeholder.

Usage:
    python scripts/regen_scaffold.py
"""
from __future__ import annotations
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
VIEWER = REPO_ROOT / "src" / "FragmentViewer.jsx"
SCAFFOLD = REPO_ROOT / "src" / "FragmentViewer.scaffold.jsx"


def main() -> int:
    if not VIEWER.exists():
        print(f"[regen] {VIEWER} not found", file=sys.stderr)
        return 1
    # Explicit UTF-8: the JSX has em-dashes; Python's default encoding on
    # Windows is cp1252 and raises UnicodeDecodeError on those bytes.
    src = VIEWER.read_text(encoding="utf-8")
    lines = src.splitlines(keepends=True)
    data_idx = next(
        (i for i, line in enumerate(lines)
         if line.startswith("const DATA = ")
         or line.startswith("export const DATA = ")
         or line.startswith("let DATA = ")),
        None,
    )
    if data_idx is None:
        print("[regen] No `const DATA = ` / `export const DATA = ` / `let DATA = ` line found", file=sys.stderr)
        return 2
    prefix = lines[data_idx].split("=", 1)[0].rstrip() + " = "
    lines[data_idx] = f"{prefix}__DATA__;\n"
    SCAFFOLD.write_text("".join(lines), encoding="utf-8")
    print(f"[regen] Wrote {SCAFFOLD} ({SCAFFOLD.stat().st_size} bytes); DATA at line {data_idx + 1}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
