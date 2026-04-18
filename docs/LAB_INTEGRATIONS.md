# LAB_INTEGRATIONS.md — How fragment-viewer plugs into the rest of the lab

The viewer is one node in a larger graph of Athey lab tooling. This document maps every connection so a new agent can answer "where does the data come from, and where does it go next?" in under a minute.

## The graph at a glance

```
                                 +---------------------+
                                 |  golden-gate-       |
                                 |  assembly  (skill)  |
                                 |  designs Level-0    |
                                 |  plasmids           |
                                 +----------+----------+
                                            |
                                            v
                                 +---------------------+
                                 |  CLC wet-lab        |
                                 |  (Isaac/Nina/Rachel)|
                                 |  cleavage-ligation- |
                                 |  cycling protocol   |
                                 +----------+----------+
                                            |
                                            | GeneMapper TSV
                                            v
       +---------------------------+   +----+----+   +----------------------+
       |  genemapper-parser        |<--+         +-->|  fragment-viewer     |
       |  (skill: parse to JSON)   |             |   |  (this repo: viewer  |
       +---------------------------+   +---------+   |   + skill orchestr.) |
                  ^                                  +----------+-----------+
                  |                                             |
                  |                                             |
                  | reads constructs.yaml                       |
                  |                                             v
       +----------+----------+               +------------------+--------------+
       |  clc-construct-     |<--------------+  cas9-cut-predictor (skill)    |
       |  registry  (skill)  |  reads dye/   |  predicts ssDNA products       |
       +---------------------+  strand conv. +---------------+----------------+
                                                             |
                                                             v
       +---------------------+               +------------------+--------------+
       |  cas9-guide-mapper  |<--------------+  Auto Classify result          |
       |  (off-target / GRCh)|               |  per-cluster identity + Δ      |
       +---------------------+               +------------------+--------------+
                                                             |
       +---------------------+                               v
       |  grna-variant-      |<--------------+  ~/lab_knowledge.db  (KB)     |
       |  checker (patient   |               |  tables: lab_grnas,           |
       |  variants on gRNA   |               |          fragment_analysis_*  |
       |  target site)       |               +------------------+------------+
       +---------------------+                                  |
                                                                v
       +---------------------+               +------------------+--------------+
       |  cas9-panel-eval    |<--------------+  cross_link_smaseq.py        |
       |  (panel performance)|               |  joins CE samples to SMA-seq |
       +---------------------+               |  registry (215 experiments)   |
                                             +-------------------------------+
                                                                |
                                                                v
                                             +-------------------------------+
                                             |  sma-pipeline / sma-prep      |
                                             |  CLC fragments feed library   |
                                             |  prep for downstream long-read|
                                             |  sequencing                   |
                                             +-------------------------------+

Read the rest of this document for what each connection actually does in code.
```

## Upstream connections (data flows into the viewer)

| Source | Connection | What it provides |
|---|---|---|
| **golden-gate-assembly** skill | doc cross-link | Designs the Level-0 plasmid that gets BsaI-released into the CLC ligation reaction. The plasmid sequence is what becomes the 118 bp target inside the 226 bp ligated construct. |
| **CLC wet-lab protocol** (Isaac / Nina / Rachel) | runs on the bench | Produces the GeneMapper TSV exports the viewer ingests. Documented in `docs/BIOLOGY.md` §1. |
| **genemapper-parser** skill | function call | Parses the TSV into the locked JSON peaks schema. Both `scripts/build_artifact.py` and the in-browser `parseGenemapperTSV` use this skill's logic; the skill IS the spec. |
| **clc-construct-registry** skill | YAML lookup | Provides the construct sequence, target window, and per-dye strand assignments. Today only V059_gRNA3 is registered; future variants land here first, then in `CONSTRUCT` in the JSX. |
| **clc-visualizations** skill | matplotlib library + CLI | Headless equivalents of every fragment-viewer figure. Use for manuscript figures, batch QC, or downstream pipelines that cannot run the React app. Mirrors `DYE_COLORS` from the Tailwind theme. |

## Downstream connections (the viewer's outputs flow somewhere)

| Sink | Connection | What it consumes |
|---|---|---|
| **`~/lab_knowledge.db`** | `scripts/ingest_to_kb.py` | The catalog (`lab_grnas` table) and per-sample metadata (`fragment_analysis_experiments` table). The post-edit hook keeps this table fresh on every JSX or `fa_data.json` edit. |
| **cas9-cut-predictor** skill | shared logic + invocation | When a user asks "what should the four ssDNA peaks look like for spacer X on V059?", this skill answers without rendering the React app. Useful for CI, notebooks, and other lab tools. |
| **cas9-guide-mapper** skill | downstream lookup | Once a gRNA is validated by the assay, lab-research-oracle and other tools query cas9-guide-mapper to find genomic coordinates and off-target hits. |
| **grna-variant-checker** skill | downstream lookup | If a gRNA looks promising for a patient sample, grna-variant-checker checks whether known variants in that patient disrupt the protospacer. |
| **cas9-panel-eval** skill | aggregation | When fragment-viewer reveals per-gRNA cleavage chemistry across many samples, cas9-panel-eval rolls those into per-panel x_rel rankings (the framework documented in lab-wiki decisions 2026-04-14). |
| **sma-pipeline / sma-prep** skills | provenance link | CLC fragment products often become SMA-seq library inputs. `scripts/cross_link_smaseq.py` substring-matches sample names between `~/lab_knowledge.db::fragment_analysis_experiments` and `~/.sma-registry/sma_registry.db::experiments`. |

## Lateral connections (sibling tools that share data or context)

| Sibling | Relationship |
|---|---|
| **lab-research-oracle** skill | Searches `~/lab_knowledge.db` and Fireflies / Tactiq transcripts for past mentions of V059, gRNA3, CLC chemistry, fragment analysis. |
| **`/menu`** skill | Surfaces fragment-viewer as an active project via `lab-papers/papers.yaml::projects[fragment-viewer]`; routes "Surprise me" creative slots into fragment-viewer when context matches. |
| **lab-query-router** | Indexes `README.md`, `CLAUDE.md`, `docs/`, `skills/fragment-viewer/SKILL.md`, and `.project/` (5 paths committed; +73 corpus chunks). The 215 KB JSX is intentionally excluded so the catalog and viewer code do not dilute corpus relevance. |
| **lab-wiki** | Houses cross-cutting decision records that touch the assay: `2026-04-18-ont-registry-ce-fragment-platform.md` (proposed CE-platform extension to the ONT registry, anchored to SMS Textbook Part 12 §12.F). |
| **lab-papers** | `papers.yaml::projects[fragment-viewer]` registers the project at lab scale, with `related_projects: [cas9-targeted-sequencing, golden-gate, sma-seq]`. |
| **ONT registry** (proposed) | `lab-wiki/decisions/2026-04-18-ont-registry-ce-fragment-platform.md` proposes a `platform: CE-fragment` value so CE samples become first-class registry entries alongside ONT and PacBio sequencing experiments. |

## How to add a new connection

When introducing a new tool that should plug into fragment-viewer:

1. **Decide the direction.** Upstream (provides data), downstream (consumes outputs), or lateral (shared context).
2. **Pick a connection mechanism.** Most often: a Python skill with a CLI; sometimes a YAML registry; sometimes a SQLite table.
3. **Update three places in lockstep:**
   - `skills/fragment-viewer/SKILL.md` "Cross-references" section
   - This document's table
   - `lab-papers/papers.yaml::projects[fragment-viewer]` (if the connection is at project scale)
4. **If the connection involves shared schema, document it.** The `clc-construct-registry` skill's locked schema in its SKILL.md is the template.

## Re-running this map

Stale within ~30 days of any new skill or major refactor. Audit cadence: revisit when consolidating the ecosystem (`/consolidate` or after a major lab-wide refactor). Lab maintainers with a local `lab-papers` clone can run `python3 -c "import yaml; print(list(yaml.safe_load(open(f'{os.environ[\"LAB_PAPERS_REPO\"]}/papers.yaml'))['projects'].keys()))"` (with `LAB_PAPERS_REPO` pointing at their clone) to confirm no project re-organization invalidated the names above.
