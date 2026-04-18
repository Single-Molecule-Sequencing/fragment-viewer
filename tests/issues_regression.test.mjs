// Regression tests for the six open issues fixed in this batch.
import { describe, it, expect } from "vitest";
import {
  classifyPeaks,
  matchLabCatalog,
  DYE_PALETTES,
  resolveDyeColor,
} from "../src/FragmentViewer.jsx";

describe("Issue #2 — matchLabCatalog accepts a custom catalog", () => {
  it("defaults to LAB_GRNA_CATALOG when no catalog is passed", () => {
    // Known entry — V059_gRNA3 spacer from the lab catalog
    const grna = { protospacer: "AGTCCTGTGGTGAGGTGACG" };
    const result = matchLabCatalog(grna);
    expect(result).toBeTruthy();
    // It's either a direct match or a reverse-complement match against an
    // entry in the catalog. Either way the returned entry has a name.
    expect(typeof result.name).toBe("string");
  });

  it("returns null for a catalog that doesn't contain the spacer", () => {
    const grna = { protospacer: "AGTCCTGTGGTGAGGTGACG" };
    const emptyCatalog = [];
    expect(matchLabCatalog(grna, emptyCatalog)).toBeNull();
  });

  it("uses the passed catalog over the module default", () => {
    const grna = { protospacer: "ACGTACGTACGTACGTACGT" };   // 20nt — won't match real entries
    const customCatalog = [{ name: "TEST_GRNA_CUSTOM", spacer: "ACGTACGTACGTACGTACGT" }];
    const result = matchLabCatalog(grna, customCatalog);
    expect(result).toEqual(customCatalog[0]);
  });

  it("classifyPeaks wires its grnaCatalog param through to matchLabCatalog", () => {
    // Smoke test: calling classifyPeaks with a custom single-entry catalog
    // and a sampleData that contains a gRNA-like spacer should match via
    // the custom catalog (if it would match at all). The function has many
    // args; here we just check it doesn't throw and returns an object.
    const sampleData = { B: [], G: [], Y: [], R: [], O: [] };
    const customCatalog = [{ name: "TEST_CUSTOM", spacer: "ACGTACGTACGTACGTACGT" }];
    const out = classifyPeaks(
      sampleData,
      "ACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGT",  // seq long enough to satisfy internal checks
      10, 50,
      226,
      { ad1: 25, oh1: 4, br1: 25, target: 118, br2: 25, oh2: 4, ad2: 25 },
      [],
      customCatalog,
      { B: 0, G: 0, Y: 0, R: 0 },
      100, 8, 5,
      [0]
    );
    // Should be a plain object keyed by dye
    expect(out).toHaveProperty("B");
    expect(out).toHaveProperty("G");
    expect(out).toHaveProperty("Y");
    expect(out).toHaveProperty("R");
  });
});

describe("Issue #3 — dye palette is a single source of truth", () => {
  it("DYE_PALETTES.default is the Tailwind 600 family (matches tailwind.config.js)", () => {
    expect(DYE_PALETTES.default.B.toLowerCase()).toBe("#1e6fdb");
    expect(DYE_PALETTES.default.G.toLowerCase()).toBe("#16a34a");
    expect(DYE_PALETTES.default.Y.toLowerCase()).toBe("#ca8a04");
    expect(DYE_PALETTES.default.R.toLowerCase()).toBe("#dc2626");
    expect(DYE_PALETTES.default.O.toLowerCase()).toBe("#ea580c");
  });

  it("resolveDyeColor returns the default palette for default palette name", () => {
    expect(resolveDyeColor("B", "default").toLowerCase()).toBe("#1e6fdb");
    expect(resolveDyeColor("G", "default").toLowerCase()).toBe("#16a34a");
    expect(resolveDyeColor("Y", "default").toLowerCase()).toBe("#ca8a04");
    expect(resolveDyeColor("R", "default").toLowerCase()).toBe("#dc2626");
  });

  it("resolveDyeColor for 'wong' returns the CB-safe override", () => {
    // Wong palette values are defined in DYE_PALETTES.wong
    expect(resolveDyeColor("B", "wong")).toBe(DYE_PALETTES.wong.B);
    expect(resolveDyeColor("B", "wong")).not.toBe(DYE_PALETTES.default.B);
  });
});
