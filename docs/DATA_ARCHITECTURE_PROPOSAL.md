# Data architecture proposal: sequences, primers, designs, results

**Status:** draft for discussion · **Author:** Greg Farnum (with Claude) · **Date:** 2026-04-26

## TL;DR

Build a thin **registry layer** on top of the lab's existing Google Drive storage. Three small YAML files (constructs, primers, runs) become the index of truth; raw artifacts (`.dna`, `.ab1`, gel images, etc.) keep living in Drive at canonical paths. A nightly indexer walks the registry, resolves Drive paths, computes checksums, and writes a single SQLite + JSON dashboard. Fragment-viewer gets a new **Lab Registry** tab that surfaces the index with search + cross-links into the existing analysis tools.

No central database server. No app to deploy beyond the existing GitHub Pages site. Editable by anyone with git access; cached locally; reproducible.

---

## 1. Why this exists

Today the lab manages cloning artifacts across:

- **Google Drive** — `.dna` files, `.ab1` Sanger runs, gel images, primer order sheets (`.xlsx` / `.gsheet`)
- **`golden-gate/` repo** — Python QC pipeline, manuscript, project meta
- **`fragment-viewer/` repo** — `public/grna_catalog.json` (runtime gRNA catalog)
- **`smaseq-qc/` repo** — Golden Gate adapter QC + SMA-seq pipeline
- **Notion / Slack / email** — verification status, primer reordering decisions

Loose coupling. Constructs lose provenance as they move between Drive folders; primer sequences are duplicated across xlsx files; verification status lives in someone's head. When a clone passes Sanger, that fact is recorded by *editing the file's parent folder name in Drive*. When a primer set is reused, there's no reliable way to find prior usage.

What's needed: a **lightweight, version-controlled, queryable** layer that:

1. names every artifact uniquely (`construct_id`, `primer_id`, `run_id`, `design_id`)
2. links artifacts to each other (this run used these primers against this design and produced these reads)
3. tracks state (designed → ordered → assembled → sequenced → verified)
4. is editable by any lab member without admin access
5. doesn't move data away from where it already lives

## 2. Non-goals

- **Not a LIMS.** No ELN integration, no protocol orchestration, no inventory.
- **Not a sequence database.** Sequence search is a nice-to-have, not the point.
- **Not a sample-tracking app.** Plate / well / freezer location is out of scope.
- **No new servers.** Static deploy to GitHub Pages + cloud storage stays static.

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ Google Drive (canonical bytes — unchanged)                      │
│   ├── Wet Lab/Golden Gate Cloning/                              │
│   │   ├── 5785_6277 CYP2D6/                                     │
│   │   │   ├── 5785_6277 PCR A.dna       ← canonical .dna       │
│   │   │   └── ...                                               │
│   │   └── CYP2D6 Golden Gate Cloning/                           │
│   │       └── Sanger Sequencing/V0 10a_7 30 2025/               │
│   │           ├── 10a-PS1-Premixed.ab1   ← canonical Sanger    │
│   │           └── ...                                           │
│   └── (lab keeps adding files here as today)                    │
└─────────────────────────────────────────────────────────────────┘
            │
            │  drive_path (relative)
            ▼
┌─────────────────────────────────────────────────────────────────┐
│ Registry layer (git-versioned YAML)                             │
│   lab-papers/registry/  (or new lab-registry/ repo)             │
│   ├── constructs.yaml   ← every named construct                 │
│   ├── primers.yaml      ← every primer ever ordered             │
│   └── runs.yaml         ← every Sanger / CE / etc run           │
└─────────────────────────────────────────────────────────────────┘
            │
            │  nightly indexer (CI cron)
            ▼
┌─────────────────────────────────────────────────────────────────┐
│ Index artifacts (built — not edited)                            │
│   ├── lab_registry.db   ← SQLite, ~5 MB; downloadable           │
│   ├── lab_registry.json ← same data; web-fetchable              │
│   └── pages/            ← static HTML reports per construct     │
└─────────────────────────────────────────────────────────────────┘
            │
            │  fetched at runtime
            ▼
┌─────────────────────────────────────────────────────────────────┐
│ Fragment-viewer "Lab Registry" tab                              │
│   ├── Construct browser   (search by name / sequence / status)  │
│   ├── Primer browser      (search by sequence)                  │
│   ├── Run browser         (per-construct verification state)    │
│   └── Cross-link buttons  → opens current viewer tabs with      │
│                             that construct's data preloaded     │
└─────────────────────────────────────────────────────────────────┘
```

Three layers, each independently understandable:

1. **Storage** — unchanged. The lab keeps using Drive.
2. **Registry** — three small YAML files in git. Edited by humans through PRs.
3. **Index** — derived. Generated by a Python script run nightly via GitHub Actions. Never edited by hand.

## 4. Schema

### 4.1 `constructs.yaml`

```yaml
# constructs.yaml — every named construct in the lab
schema_version: 1
constructs:
  - id: V0_10a_7443_7594_CYP2D6        # globally unique; safe in URLs + SnapGene names
    aliases: ["V0 10a", "10a"]         # short names lab actually uses
    project: cyp2d6_golden_gate         # cross-reference to lab-papers
    kind: assembly                     # design | pcr_fragment | level0 | level1 | assembly
    expected_length: 7594               # bp, optional
    parent_design:                      # what this construct *should* be
      drive_path: "Wet Lab/Golden Gate Cloning/CYP2D6 Golden Gate Cloning/Sanger Sequencing/V0 10a_7 30 2025/Sanger Results Alligned V0 10a 7443_7594 CYP2D6 ASSEMBLED.dna"
      sha256: "abc123…"                 # filled by indexer; not edited
    components:                         # what went into this construct
      - construct_id: V059_backbone
      - construct_id: 7443_7594_PCR_A
      - construct_id: 7443_7594_PCR_B
    primer_set: ps1_to_ps6_v0_10a       # FK → primers.yaml::primer_sets
    operator: isaac-farnum
    build_date: 2025-07-30
    status: verified                    # designed | ordered | assembled | sequenced | verified | failed
    verification_run: V0_10a_sanger_2025_07_30   # FK → runs.yaml
    notes: |
      First V0 assembly that passed clean Sanger across all 6 primers.
      Cross-references lab-wiki/entities/projects/cyp2d6_golden_gate.md
```

### 4.2 `primers.yaml`

```yaml
# primers.yaml — every primer ever ordered + reusable primer-set bundles
schema_version: 1
primers:
  - id: PS1_V0_10a
    aliases: ["10a-PS1"]
    sequence: ACGTACGTACGTACGTACGT
    length: 20
    tm_celsius: 58.4                    # optional; computed by indexer
    purpose: sanger                     # sanger | pcr | golden_gate_oligo
    ordered_in: "Sanger Sequencing Order 1_7 30 2025.xlsx"
    order_date: 2025-07-28
    primer_set: ps1_to_ps6_v0_10a
    notes: ""
primer_sets:
  - id: ps1_to_ps6_v0_10a
    purpose: "Sanger verification of V0_10a_7443_7594_CYP2D6"
    members: [PS1_V0_10a, PS2_V0_10a, PS3_V0_10a, PS4_V0_10a, PS5_V0_10a, PS6_V0_10a]
```

### 4.3 `runs.yaml`

```yaml
# runs.yaml — every Sanger / CE / etc run with the construct(s) sequenced
schema_version: 1
runs:
  - id: V0_10a_sanger_2025_07_30
    kind: sanger                         # sanger | ce | nanopore | illumina
    construct_id: V0_10a_7443_7594_CYP2D6
    primer_set: ps1_to_ps6_v0_10a
    operator: isaac-farnum
    submitted: 2025-07-30
    received: 2025-08-01
    drive_dir: "Wet Lab/Golden Gate Cloning/CYP2D6 Golden Gate Cloning/Sanger Sequencing/V0 10a_7 30 2025/"
    files:                                # filled by indexer
      - { path: "10a-PS1-Premixed.ab1", primer: PS1_V0_10a, sha256: "..." }
      - { path: "10a-PS2-Premixed.ab1", primer: PS2_V0_10a, sha256: "..." }
      # ...
    verification:                         # filled by indexer running
                                          # golden-gate's QC pipeline
      reads_loaded: 6
      reads_passed: 5
      reads_warned: 1
      reads_failed: 0
      consensus_identity: 0.9987
      coverage_pct: 99.2
      issues_high: 0
      issues_medium: 2
      report_url: "pages/V0_10a_sanger_2025_07_30.html"
    status: verified
```

## 5. The indexer

Single Python script (`scripts/build_registry_index.py` in `lab-papers`):

```python
# pseudocode
def build_index(registry_root, drive_root, output_root):
    constructs = yaml.safe_load(open(registry_root / "constructs.yaml"))
    primers    = yaml.safe_load(open(registry_root / "primers.yaml"))
    runs       = yaml.safe_load(open(registry_root / "runs.yaml"))

    # 1. Resolve Drive paths → checksums + missing-file warnings
    for c in constructs.constructs:
        if c.parent_design.drive_path:
            full = drive_root / c.parent_design.drive_path
            c.parent_design.sha256 = sha256_of(full) if full.exists() else None
            c.parent_design.exists = full.exists()

    # 2. For each Sanger run, list .ab1 files in the Drive dir
    for r in runs.runs:
        if r.kind == "sanger":
            r.files = list_ab1_files(drive_root / r.drive_dir)
            for f in r.files:
                f.sha256 = sha256_of(drive_root / r.drive_dir / f.path)

    # 3. Run golden-gate QC pipeline against each Sanger run that has
    #    a parent_design with a known sequence. Cache by sha256.
    for r in [r for r in runs.runs if r.kind == "sanger"]:
        c = find_construct(r.construct_id)
        if c.parent_design.exists:
            r.verification = run_gg_qc(
                ab1_dir=drive_root / r.drive_dir,
                reference_dna=drive_root / c.parent_design.drive_path,
                primer_set=find_primer_set(r.primer_set),
            )

    # 4. Write the indexed artifacts
    write_sqlite(output_root / "lab_registry.db", constructs, primers, runs)
    write_json(output_root / "lab_registry.json", constructs, primers, runs)
    write_html_pages(output_root / "pages", runs)
```

Runs nightly via GitHub Actions cron. Output committed to a `lab-registry-index` branch (or pushed to a separate index-only repo). Fragment-viewer fetches the JSON.

## 6. Fragment-viewer "Lab Registry" tab

8th tab next to Sanger:

```
┌── Lab Registry ─────────────────────────────────────────────────┐
│  Search: [_____________________]   [constructs / primers / runs]│
│                                                                 │
│  Constructs (147):                                              │
│  ┌─ V0_10a_7443_7594_CYP2D6  ✓ verified  2025-07-30  6/6 PS─┐  │
│  │  ┌─ V0_10b_7443_7594_CYP2D6  ⚠ 1 warn  2025-07-30  5/6 PS┐│  │
│  │  │  ┌─ V0_6b_6545_6884_CYP2D6  ✓ verified  2025-07-30   ┐││  │
│  │  │  │  ...                                              │││  │
│  │  │  └────────────────────────────────────────────────────┘││  │
│  │  └─────────────────────────────────────────────────────────┘│  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Selected: V0_10a_7443_7594_CYP2D6                              │
│  ┌─ Open in Sanger viewer →   Open .dna in design tab → ──────┐  │
│  │  Build:    2025-07-30 isaac-farnum                          │  │
│  │  Primers:  ps1_to_ps6_v0_10a (6 primers)                    │  │
│  │  Run:      V0_10a_sanger_2025_07_30 (6 reads, 99.87% cons)  │  │
│  │  Issues:   0 high · 2 medium                                │  │
│  │  Notes:    First V0 assembly that passed clean Sanger...    │  │
│  └─────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

Buttons cross-link into existing tools using the URL params we already shipped:
- `?tab=sanger&ref=<drive-url>&sample=<construct_id>`
- `?tab=trace&sample=<id>` (if the construct has CE data too)

## 7. Workflow examples

### 7.1 Adding a new construct

```
1. Lab member creates SnapGene .dna; uploads to Drive at canonical path
2. PR to lab-registry/constructs.yaml: add a new entry pointing at the .dna
3. CI indexer runs; checksums the file, computes parent-design length,
   posts back as a CI comment on the PR
4. Merge → next nightly index picks up the new construct
```

### 7.2 Adding Sanger results

```
1. Submit reads to sequencing service
2. Service emails back .ab1 zip; lab member uploads to a new Drive subfolder
3. PR to lab-registry/runs.yaml: add a run with construct_id + primer_set
   + drive_dir; leave files: + verification: empty
4. CI indexer walks drive_dir, fills files: + sha256 + verification:
5. Static HTML report deployed to lab-registry-index/pages/<run_id>.html
6. Fragment-viewer's Lab Registry tab shows the new run with status
```

### 7.3 Reusing a primer

```
1. Lab member opens fragment-viewer Lab Registry tab; searches primer
   sequence "ACGTACGT..."
2. Sees "PS1_V0_10a (used in 3 prior runs against V0_10a, V0_10b, V0_8b)"
3. References the existing primer_id in their new construct's primer_set
   instead of ordering a duplicate
```

## 8. Implementation phases

| Phase | Effort | Deliverable |
|---|---|---|
| 0. **Schema agreed** | discussion | This doc + sibling YAML schemas |
| 1. **Bootstrap** | 2-3 days | Empty registry + indexer skeleton + 5-10 hand-written entries |
| 2. **Backfill** | 1-2 weeks | Walk existing Drive folders, generate registry stubs (humans review + commit) |
| 3. **Lab Registry tab** | 1 week | New fragment-viewer tab consuming the JSON index |
| 4. **CI indexer + cross-checks** | 1 week | Nightly cron, broken-link reports, drift alerts |
| 5. **Cross-tool links** | ongoing | golden-gate QC PDFs link into Lab Registry; SnapGene `.dna` paths resolve via registry |

## 9. Trade-offs considered

| Approach | Verdict |
|---|---|
| **Centralized PostgreSQL + web app** | Too much infra. Needs hosting, auth, backups. Lab is small. |
| **Notion** | Proprietary. Not version-controlled. Search is OK, structure is loose. |
| **SQLite-as-truth** | Editing requires a tool. Not git-reviewable. |
| **YAML-as-truth + indexed SQLite** ✓ | Editable by anyone via PR; reviewable; reproducible; cached locally; cheap. |
| **One YAML per construct** | Too many files; merge conflicts on every edit. |
| **One mega-YAML** | Unwieldy at scale (1000+ entries). |
| **Three YAML files (constructs / primers / runs)** ✓ | Each file ≤ ~500 lines; logical separation; minimal merge conflicts. |

## 10. What's already in place

- **`fragment-viewer/public/grna_catalog.json`** (PR #27) — runtime-fetched JSON catalog already follows the "edit the JSON, commit, deployed users see the change on next visit" pattern. The Lab Registry tab uses the same loader pattern.
- **`fragment-viewer/src/lib/snapgene.js`** — read + write `.dna` programmatically, so the indexer can crack open any registered .dna and extract sequence + features for the index.
- **`golden-gate/lib/qc/`** — full QC pipeline that takes `.ab1` + reference `.dna` and produces verification stats; the indexer calls into this to fill `runs.yaml::verification`.
- **`fragment-viewer/src/lib/sequence_analyses.js`** — primer matching, restriction site finder, ORF finder; the Lab Registry tab uses these for sequence-search queries.
- **Cross-tool URL params** (PR #28) — `?tab=`, `?ref=`, `?sample=` already work, so the Lab Registry tab can deep-link into existing analysis tools.

## 11. Open questions

1. **Where does the registry repo live?** Three options:
   - Inside `lab-papers/` — co-located with manuscripts that consume it
   - New `lab-registry/` repo — separation of concerns
   - Inside `golden-gate/` — closest to the existing QC pipeline that consumes it
2. **Auth on Drive paths.** Indexer needs read access to the lab Drive. Options:
   - rclone with a service account (matches the lab-drive skill in memory)
   - Manual Drive→git-LFS sync of just the `.dna` references (deduplicates, avoids API)
3. **Construct ID conventions.** Proposed: `<construct-prefix>_<descriptor>_<gene>` (e.g., `V0_10a_7443_7594_CYP2D6`). Strict enough for unambiguous parsing; readable enough for humans.
4. **Primer reuse semantics.** Two primers with identical sequences but different orders — same `id` or different? (Proposed: same `id`, multiple `ordered_in:` entries.)
5. **What happens when a Drive file is moved.** Proposed: indexer flags the broken path; PR required to update `drive_path:` (forces audit trail).

## 12. Related lab tools

- **`lab-system`** (existing) — workspace + skill management; the Lab Registry tab could become a `lab-system` workspace surface.
- **`lab-papers`** — manuscript-level metadata; the registry's `project:` field cross-references this.
- **`fragment-viewer`** — the analysis surface; gains a Lab Registry tab as part of this proposal.
- **`golden-gate`** — Type-IIS cloning project shell; consumes the registry to power its QC reports.
- **`smaseq-qc`** — separate adapter QC pipeline; would gain Sanger run linkage in time.

---

**Next step:** if this proposal is acceptable, the smallest useful next PR is a `lab-registry/` skeleton with one hand-written construct + the Python indexer that walks the schema (no Drive integration yet). That's the v0 that proves the schema in 2-3 hours; everything else builds on it.
