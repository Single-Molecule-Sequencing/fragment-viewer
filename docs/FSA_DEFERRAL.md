# FSA_DEFERRAL.md — Why .fsa native ingestion is deferred

The viewer today ingests GeneMapper TSV peak-table exports (one row per called
peak). It does not directly parse the underlying ABIF binary (`.fsa`) traces
that come off the CE instrument. This document records why and what would have
to change to enable native `.fsa` support later.

## Why deferred

1. **No ABIF parser on the artifact runtime allowlist.** The Claude.ai artifact
   runtime restricts npm imports to `lucide-react`, `recharts`, `mathjs`,
   `lodash`, `d3`, and `shadcn/ui`. The two viable JS ABIF parsers
   (`abif-parser`, `biojs-io-ab1`) are not on that list, and neither is in the
   "almost stdlib" tier that the runtime might add silently. Adding either
   would split the codebase into "works as artifact" and "works only via
   Vite," which we explicitly want to avoid.
2. **Peak-calling has to live somewhere.** The GeneMapper export is post-peak-
   calling: the instrument vendor's algorithm has already identified peak
   centers, heights, and areas. To ingest raw `.fsa` traces we would also need
   a peak caller (typically a smoothed-derivative + local-max algorithm). That
   is non-trivial and would duplicate vendor logic. GeneMapper's behaviour is
   the lab's effective ground truth.
3. **The TSV path covers every existing user request.** Isaac, Nina, and Rachel
   all currently start their analysis from a GeneMapper export. Until someone
   asks for `.fsa`, it is speculative effort.

## What would have to change to enable it

If a user later asks for `.fsa` ingestion the work is:

1. Pick an ABIF parser. `abif-parser` is the pragmatic choice; about 30 KB
   minified, zero deps, works in browsers and Node. Vendor it into
   `src/lib/abif/` if the artifact allowlist still rejects npm imports, or
   import normally if a future runtime extension allows it.
2. Implement a peak caller. Recommended starting point: Gaussian-smoothed
   first-derivative zero-crossings on each per-dye trace, with a
   noise-threshold gate. Validate against a sample where the GeneMapper
   peak table is known.
3. Wire `.fsa` files into the existing `DropZone`. Detect by extension; route
   to the new parser instead of `parseGenemapperTSV`.
4. Add a "vendor agreement" toggle in the UI: when both a `.fsa` and its
   matching GeneMapper TSV are loaded, show the per-peak delta between the
   in-browser caller and GeneMapper.
5. Add unit tests against a synthetic `.fsa` fixture (a tiny known-shape file
   the team builds once; check it into `tests/fixtures/`).

Effort estimate: 1 to 2 days for steps 1 to 3; another day for step 4 and the
test fixtures. Not justified today; revisit when there is concrete demand.

## Related

- `docs/CONTRIBUTING.md` §1 lists the artifact runtime allowlist that drives
  this deferral.
- `scripts/build_artifact.py` is the Python-side parser that today owns the
  GeneMapper -> JSON shape.
- `.project/PLAN.md` "Deliberately deferred" lists this item and the SMA-seq
  cross-link as the two near-term deferrals.
