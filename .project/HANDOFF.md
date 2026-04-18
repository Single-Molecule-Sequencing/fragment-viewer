# HANDOFF.md — Current project state

Last updated: 2026-04-18 (v0.7.0 visual overhaul + skill extraction round, repo at commit `00c8ca0` or later).

## Status

The repo is published at `Single-Molecule-Sequencing/fragment-viewer` on GitHub. Every code task in `.project/PLAN.md` buckets A and B is shipped. The remaining open items are upstream wet-lab data captured as paste-ready prompts in `.project/UNBLOCK_PROMPTS.md`.

## What works today

- The viewer renders correctly under Claude.ai artifact mode (paste `src/FragmentViewer.jsx`) and via the Vite scaffold (`npm install && npm run dev`).
- `npm run build` produces a Pages-ready `dist/` directory; the `.github/workflows/pages.yml` workflow deploys on every push to `main`.
- `scripts/build_artifact.py data/blue_export.txt` round-trips cleanly into `src/FragmentViewer.jsx`. The scaffold tracks the viewer; `scripts/regen_scaffold.py` regenerates it after viewer edits.
- `scripts/ingest_to_kb.py --all` syncs `LAB_GRNA_CATALOG` and the parsed dataset into `~/lab_knowledge.db`.
- `scripts/cross_link_smaseq.py` reports overlap between fragment-viewer samples and SMA-seq registry entries; today returns 0 matches (no current CLC sample has gone into SMA-seq yet).
- Vitest passes 19 unit tests covering `classifyPeaks`, `predictCutProducts`, `matchLabCatalog`, `findGrnas`, `normalizeSpacer`, `componentSizesFrom`, and the BIOLOGY constants.
- CI on every push runs jsx-parse, biology-sync, catalog-coverage, python-syntax (with ruff), ingest-roundtrip, fa-data-schema, unit-tests, scaffold-in-sync.
- Skill `/fragment-viewer` is installed via symlink chain `~/.claude/skills/fragment-viewer/` → `~/repos/ont-ecosystem/skills/fragment-viewer/SKILL.md` → repo SKILL.md, and triggers from any Claude Code session on terms documented in the SKILL frontmatter.
- Project registered in `lab-papers/papers.yaml::projects[fragment-viewer]` so `/menu` surfaces it.
- Lab-query-router corpus includes 5 fragment-viewer paths (README, CLAUDE, docs/, SKILL.md, .project/); the JSX is intentionally excluded so it does not dilute the corpus.
- Post-edit hook `~/.claude/hooks/post-edit-fragment-viewer.sh` resyncs the KB whenever the JSX or `data/fa_data.json` are touched.
- systemd user timer `fragment-viewer-ingest.timer` fires nightly at 03:30 local; service uses `~/.local/bin/fragment-viewer-ingest` wrapper to dodge systemd argv whitespace parsing.

## What needs human action

### Once-only: enable GitHub Pages

The Pages workflow (`.github/workflows/pages.yml`) is committed and runs on every push, but the Pages site itself is not yet enabled in the repo. Run one of:

```bash
# Via gh
gh api -X POST repos/Single-Molecule-Sequencing/fragment-viewer/pages \
  -f source[branch]=main -f source[path]=/ -f build_type=workflow

# Or via Settings > Pages in the GitHub UI: set Source = "GitHub Actions"
```

After enabling, the next push to `main` deploys to `https://single-molecule-sequencing.github.io/fragment-viewer/`.

### Upstream wet-lab data (Bucket C)

See `.project/UNBLOCK_PROMPTS.md`. The five items:

1. **V059_gRNA3 spacer** (Isaac). Unblocks the green-badge feature for the headline gRNA.
2. **gRNA3_X-Y construct identity** (Isaac). Today the viewer treats these samples as V059, which they are not.
3. **Dye mobility offset calibration data** (Isaac + Nina). Wet-lab blunt-control run. Unblocks instrument-specific defaults.
4. **10 catalog spacers** (self-serve via `samtools faidx`). Mechanical once GRCh38 access is verified.
5. **Adapter pairing re-validation** (Isaac, low priority). Paranoia check on the v0.3 dye-pairing fix.

## Sharp edges

- The viewer JSX must remain a self-contained ES module. Adding `import` statements that pull from local modules will break the Claude.ai artifact use case. Tests that need the helpers should `import { ... } from "../src/FragmentViewer.jsx"` directly (already wired in `tests/classifier.test.mjs`).
- `scripts/ingest_to_kb.py` regex-extracts `LAB_GRNA_CATALOG`. Adding fields outside the standard `name|spacer|source|target|notes` set will silently drop them.
- The scaffold and the viewer must be kept in sync. A CI job (`scaffold-in-sync`) catches drift; run `python scripts/regen_scaffold.py` after every JSX edit.
- `package-lock.json` is gitignored. CI does `npm install` cold each run. If reproducibility becomes an issue, commit the lock and re-add `cache: npm` to the workflows.
- The `dataKey` re-mount trick used by drag-drop ingestion mutates `DATA.peaks` in place. Tests that assert on the catalog or constants should use the imported references; tests that assert on `DATA.peaks` would need to swap that pattern out.

## Recently shipped (this session)

- 16 commits on `main` taking the repo from `89d2863` to `00c8ca0`.
- 4 sibling repos updated and pushed: `lab-papers` (project registration + 10 related_skills), `lab-wiki` (CE-fragment decision record + auto-anchor + clc-fragment-analysis entity page), `lab-query-router` (corpus paths).
- 4 new skills extracted and installed via symlink chain into `~/.claude/skills/`: `cas9-cut-predictor`, `genemapper-parser`, `clc-construct-registry`, `clc-visualizations`.
- Tailwind v3 + Inter + JetBrains Mono now load in the Vite build (the deployed Pages site was previously rendering raw unstyled HTML).
- Design system primitives (`Panel`, `Stat`, `Pill`, `DyeChip`, `Field`, `ToolButton`) drive the chrome and are ready for tab-body composition.
- Latent bug fixed in `classifyPeaks` vote tally (caught by the new unit test).
- Latent CI bug fixed in `validate.yml` esbuild loader flag.
- GitHub Pages enabled and serving at the randomized private-repo subdomain.

## Files NOT in the repo that the viewer depends on

These are local-only and not committed:

- `package-lock.json` (gitignored; CI installs cold)
- `node_modules/` (gitignored; `npm install` on first dev run)
- `dist/` (gitignored; produced by `npm run build`)
- `lab_knowledge.db` (gitignored; lives in `~/`)
- `data/calibrations/*.json` (created by the Download JSON button in AutoClassifyTab; may be committed if the lab wants shared defaults)

## Where to start the next session

If upstream data has landed, jump to `.project/PLAN.md` "Active priorities" and apply the data. Otherwise, next likely work is enabling Pages (one-shot) and watching for the first real-world drag-drop usage to see whether `parseGenemapperTSV` needs to accept any column variants the test fixture missed.
