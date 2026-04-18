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
    src = VIEWER.read_text()
    lines = src.splitlines(keepends=True)
    if not lines[5].startswith("const DATA = "):
        print(f"[regen] Expected `const DATA = ` at line 6, got: {lines[5][:60]!r}", file=sys.stderr)
        return 2
    lines[5] = "const DATA = __DATA__;\n"
    SCAFFOLD.write_text("".join(lines))
    print(f"[regen] Wrote {SCAFFOLD} ({SCAFFOLD.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
