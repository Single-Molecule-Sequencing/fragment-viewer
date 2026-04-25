// tests/grna_catalog_runtime.test.mjs — runtime catalog fetch + fallback.
//
// Verifies that:
//   1. The embedded baseline catalog ships with at least V059_gRNA3 (the
//      demo construct's gRNA — anything fewer breaks the seeded demo).
//   2. validateCatalogShape() accepts well-formed entries and rejects
//      malformed payloads (the runtime fetch's defense-in-depth).
//   3. loadGrnaCatalog() on a 404 returns ok:false and preserves the
//      embedded baseline (the viewer must remain usable on fetch failure).
//   4. loadGrnaCatalog() on a valid JSON response replaces the live
//      catalog and ES module live bindings reflect the change.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  LAB_GRNA_CATALOG,
  validateCatalogShape,
  setGrnaCatalog,
  loadGrnaCatalog,
} from "../src/lib/grna_catalog.js";

describe("embedded baseline catalog", () => {
  it("contains V059_gRNA3 (required for the demo)", () => {
    const v059 = LAB_GRNA_CATALOG.find(e => e.name === "V059_gRNA3");
    expect(v059).toBeDefined();
    expect(v059.spacer).toMatch(/^[ACGT]{20}$/);
  });

  it("every entry has a name + spacer field", () => {
    for (const e of LAB_GRNA_CATALOG) {
      expect(typeof e.name).toBe("string");
      expect(e.name.length).toBeGreaterThan(0);
      expect(typeof e.spacer).toBe("string");
    }
  });
});

describe("validateCatalogShape", () => {
  it("accepts a well-formed array", () => {
    expect(validateCatalogShape([{ name: "g1", spacer: "A".repeat(20) }])).toBe(true);
  });

  it("rejects non-arrays", () => {
    expect(validateCatalogShape({ catalog: [] })).toBe(false);
    expect(validateCatalogShape("a string")).toBe(false);
    expect(validateCatalogShape(null)).toBe(false);
  });

  it("rejects entries without a name", () => {
    expect(validateCatalogShape([{ spacer: "A".repeat(20) }])).toBe(false);
    expect(validateCatalogShape([{ name: "", spacer: "A".repeat(20) }])).toBe(false);
  });

  it("rejects entries without a spacer field at all", () => {
    expect(validateCatalogShape([{ name: "g1" }])).toBe(false);
  });

  it("accepts entries with empty-string spacer (catalog placeholder)", () => {
    // Some catalog entries are intentionally registered with empty spacers
    // before the protospacer is sequenced; matchLabCatalog skips them.
    expect(validateCatalogShape([{ name: "g1", spacer: "" }])).toBe(true);
  });
});

describe("loadGrnaCatalog", () => {
  let originalFetch;
  let originalCatalog;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
    // Snapshot the current catalog so we can restore even on failures.
    originalCatalog = [...LAB_GRNA_CATALOG];
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    setGrnaCatalog(originalCatalog);
  });

  it("preserves baseline on a 404 response", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 404 }));
    const baseline = LAB_GRNA_CATALOG.length;
    const result = await loadGrnaCatalog("./missing.json");
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/404/);
    expect(LAB_GRNA_CATALOG.length).toBe(baseline);
  });

  it("preserves baseline on a network error", async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error("network down"); });
    const baseline = LAB_GRNA_CATALOG.length;
    const result = await loadGrnaCatalog();
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/network down/);
    expect(LAB_GRNA_CATALOG.length).toBe(baseline);
  });

  it("preserves baseline when the JSON shape is invalid", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ not: "an array" }),
    }));
    const baseline = LAB_GRNA_CATALOG.length;
    const result = await loadGrnaCatalog();
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/invalid catalog shape/);
    expect(LAB_GRNA_CATALOG.length).toBe(baseline);
  });

  it("replaces the live catalog on a valid response (live binding visible to importers)", async () => {
    const synth = [
      { name: "test_a", spacer: "ACGT".repeat(5), source: "synth", target: "synth", notes: "" },
      { name: "test_b", spacer: "TGCA".repeat(5), source: "synth", target: "synth", notes: "" },
    ];
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => synth,
    }));
    const result = await loadGrnaCatalog();
    expect(result.ok).toBe(true);
    expect(result.count).toBe(2);
    // Re-import via the live binding — should see the new value.
    const { LAB_GRNA_CATALOG: live } = await import("../src/lib/grna_catalog.js");
    expect(live).toHaveLength(2);
    expect(live[0].name).toBe("test_a");
  });
});
