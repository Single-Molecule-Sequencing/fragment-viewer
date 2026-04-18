# CONTRIBUTING.md — Local development for fragment-viewer

This document covers the day to day developer workflow: how to test changes, how to commit, and a few project-specific conventions.

## 1. Prerequisites

- Python 3.11 or newer with `ruff` available on PATH (any way you install it works; the lab uses miniconda).
- Node 20 or newer with npm. The CI uses Node 20.
- `esbuild` for the JSX parse check (`npm install -g esbuild`).
- Optional but recommended: `vitest` for the unit-test harness (`npm install` in the repo root once `package.json` is in place).

The viewer has no runtime dependency outside the React component itself when used as a Claude.ai artifact. The artifact runtime allows imports from `lucide-react`, `recharts`, `mathjs`, `lodash`, `d3`, and `shadcn/ui`. Do not add npm dependencies outside that list without first confirming the artifact runtime supports them.

## 2. Local checks before pushing

Run these from the repo root. None take more than a few seconds.

```bash
# JSX parse (matches CI)
esbuild --loader:.jsx=jsx --bundle=false --log-level=warning src/FragmentViewer.jsx > /dev/null

# Python compile + lint
python -m py_compile scripts/build_artifact.py scripts/ingest_to_kb.py
ruff check scripts/

# Unit tests
npx vitest run

# End to end ingest dry run
python scripts/ingest_to_kb.py --all --kb /tmp/test_kb.db
rm /tmp/test_kb.db
```

## 3. Vite + GitHub Pages

The viewer is also published as a static page at `https://single-molecule-sequencing.github.io/fragment-viewer/`. The Vite scaffold lives in the repo root (`package.json`, `vite.config.js`, `index.html`). To preview locally:

```bash
npm install
npm run dev
```

Open the printed `localhost` URL. Hot reload is on.

To preview the production build:

```bash
npm run build
npm run preview
```

The deploy workflow `.github/workflows/pages.yml` runs on every push to `main` and publishes to the `gh-pages` environment.

## 4. Commit conventions

- Short imperative first line, no period. Optional body explaining the why.
- One logical change per commit. Bug fixes do not need surrounding cleanup.
- Reference open questions or incidents in the body when relevant; do not link to them in the title.
- Push directly to `main`. There is no PR workflow.

Good:

```
Fix esbuild loader flag in CI workflow

The bare --loader=jsx form is rejected by esbuild >=0.20 with
"loader without extension only applies when reading from stdin".
Mapped form --loader:.jsx=jsx is the documented current syntax.
```

Bad:

```
fix(ci): update esbuild — switch to mapped loader (also tidied the workflow).
```

(Reasons: scope prefix not used in this repo, em dashes are out, and the parenthetical reveals the commit does two things.)

## 5. Writing tests for `classifyPeaks`

`classifyPeaks` is exported from `src/FragmentViewer.jsx` so the unit tests can import it directly. The tests live in `tests/` and run with Vitest.

A minimal test fixture:

```js
import { describe, it, expect } from "vitest";
import { classifyPeaks, predictCutProducts, matchLabCatalog, CONSTRUCT, LAB_GRNA_CATALOG } from "../src/FragmentViewer.jsx";

describe("classifyPeaks", () => {
  it("clusters two adjacent peaks within tolerance", () => {
    const sample = { B: [[100.0, 1000, 500, 0.5], [101.5, 800, 400, 0.5]], Y: [], G: [], R: [] };
    const out = classifyPeaks(sample, CONSTRUCT.seq, 55, 172, 226, /* component sizes */ {}, [], LAB_GRNA_CATALOG, { B: 0, Y: 0, G: 0, R: 0 }, 50, 8, 5, [-4,-3,-2,-1,0,1,2,3,4]);
    expect(out.B.clusters.length).toBe(1);
  });
});
```

Helpers to derive `componentSizes` and the assembly product list from `CONSTRUCT` are in the JSX; if you need them in tests, lift them to a small `src/lib/` module rather than importing 200KB of UI.

## 6. House style: no em dashes, no en dashes

User preference (see `CLAUDE.md`): rephrase to avoid em dashes and en dashes in any prose that ends up in the repo. Use commas, semicolons, parentheses, "to", or split into two sentences. Hyphens in compound words like `5'-overhang` or `lab-internal` are fine because they are hyphens, not dashes.

## 7. The `__DATA__` placeholder

`src/FragmentViewer.scaffold.jsx` is the master template for `scripts/build_artifact.py`. The placeholder string is exactly `__DATA__` (no whitespace, no quotes). The script does a single `str.replace` so do not introduce other occurrences of the string anywhere else in the scaffold.

If you need to change the JSX in a way that also affects the scaffold (anything outside the `DATA` literal), edit `src/FragmentViewer.jsx` first, then either rerun the scaffold build (see `scripts/regen_scaffold.py` if it exists) or copy the change manually. Today there is no regen_scaffold.py; the scaffold and the viewer must be kept in sync by hand.

## 8. Where to put new scripts

| Script type | Location | Naming |
|---|---|---|
| One-off analysis or debugging | not in repo; keep on your filesystem | any |
| Reusable Python | `scripts/` | `<verb>_<noun>.py` |
| JS or shell utility | `scripts/` | same |

## 9. When a change touches biology

Re-read `CLAUDE.md` rule 1 first. Then update `docs/BIOLOGY.md` in the same commit as the constants in `FragmentViewer.jsx` and any test fixtures that depend on them. CI grep checks catch a small subset of asymmetric updates; reviewers catch the rest.
