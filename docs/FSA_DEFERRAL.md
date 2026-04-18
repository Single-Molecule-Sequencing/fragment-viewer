# FSA_DEFERRAL.md — superseded by FSA_SUPPORT.md

This file is kept as a redirect. Native ABIF (.fsa) ingestion was added on
2026-04-18; see [`docs/FSA_SUPPORT.md`](./FSA_SUPPORT.md) for the current
documentation, including:

- Pure-JS `parseAbifBuffer` + `parseFsaArrayBuffer` in
  `src/FragmentViewer.jsx` (drag-drop multi-file in the viewer).
- Python CLI at `scripts/fsa_to_json.py` (biopython + scipy) for batch /
  headless ingest.
- LIZ size-standard auto-calibration and simple peak-calling.
- Important caveat: peak calls do not match GeneMapper exactly; for
  canonical analysis use the vendor TSV path.
