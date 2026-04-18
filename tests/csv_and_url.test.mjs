import { describe, it, expect } from "vitest";
import {
  buildPeakTableCSV,
  encodeViewState,
  decodeViewState,
} from "../src/FragmentViewer.jsx";

describe("buildPeakTableCSV", () => {
  it("emits header + one row per (sample, dye, peak)", () => {
    const peaks = {
      s1: {
        B: [[100.5, 500, 250, 0.5], [150.0, 300, 150, 0.5]],
        G: [[200.0, 800, 400, 0.5]],
        Y: [], R: [], O: [],
      },
      s2: {
        B: [[101.0, 600, 300, 0.5]],
        G: [], Y: [], R: [], O: [],
      },
    };
    const csv = buildPeakTableCSV(peaks);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("sample,dye,size_bp,height,area,width_fwhm_bp");
    // 4 data rows: 2 s1-B + 1 s1-G + 1 s2-B
    expect(lines).toHaveLength(5);
    expect(lines[1]).toBe("s1,B,100.5,500,250,0.5");
    expect(lines[2]).toBe("s1,B,150,300,150,0.5");
    expect(lines[3]).toBe("s1,G,200,800,400,0.5");
    expect(lines[4]).toBe("s2,B,101,600,300,0.5");
  });

  it("skips the LIZ (O) channel by default; includes it when opts.includeO=true", () => {
    const peaks = {
      s1: { B: [], G: [], Y: [], R: [], O: [[50, 1000, 500, 0.5]] },
    };
    expect(buildPeakTableCSV(peaks).trim().split("\n")).toHaveLength(1);
    const withO = buildPeakTableCSV(peaks, { includeO: true }).trim().split("\n");
    expect(withO).toHaveLength(2);
    expect(withO[1]).toBe("s1,O,50,1000,500,0.5");
  });

  it("CSV-escapes sample names that contain commas or quotes", () => {
    const peaks = {
      'odd, name': { B: [[100, 100, 50, 0.5]], G: [], Y: [], R: [], O: [] },
      'quote"name': { B: [[200, 200, 100, 0.5]], G: [], Y: [], R: [], O: [] },
    };
    const csv = buildPeakTableCSV(peaks);
    expect(csv).toContain(`"odd, name",B,100,100,50,0.5`);
    expect(csv).toContain(`"quote""name",B,200,200,100,0.5`);
  });

  it("returns just the header when given an empty dataset", () => {
    expect(buildPeakTableCSV({})).toBe("sample,dye,size_bp,height,area,width_fwhm_bp\n");
    expect(buildPeakTableCSV(null)).toBe("sample,dye,size_bp,height,area,width_fwhm_bp\n");
  });
});

describe("encodeViewState / decodeViewState", () => {
  it("round-trips a simple view-state object", () => {
    const state = {
      sample: "gRNA3_1-1",
      range: [75, 110],
      channels: { B: true, G: true, Y: true, R: true, O: false },
      mode: "trace",
      stackChannels: true,
      logY: false,
      smoothing: 1.2,
      pairMode: "overlay",
      referenceSample: "V059_4-5",
    };
    const encoded = encodeViewState(state);
    expect(typeof encoded).toBe("string");
    expect(encoded.length).toBeGreaterThan(0);
    // URL-safe base64: no +, /, or = padding.
    expect(encoded).not.toMatch(/[+/=]/);
    const decoded = decodeViewState("#view=" + encoded);
    expect(decoded).toEqual(state);
  });

  it("decodeViewState accepts either `#view=...` or bare base64", () => {
    const state = { sample: "x", range: [0, 100] };
    const encoded = encodeViewState(state);
    expect(decodeViewState("#view=" + encoded)).toEqual(state);
    expect(decodeViewState(encoded)).toEqual(state);
    expect(decodeViewState("#" + encoded)).toEqual(state);
  });

  it("decodeViewState returns null for empty / garbage input", () => {
    expect(decodeViewState("")).toBeNull();
    expect(decodeViewState("#")).toBeNull();
    expect(decodeViewState("#view=")).toBeNull();
    expect(decodeViewState("#view=not-valid-base64!@#")).toBeNull();
  });

  it("handles Unicode sample names (UTF-8 safe)", () => {
    const state = { sample: "sample_αβγ_✓", range: [0, 100] };
    const encoded = encodeViewState(state);
    const decoded = decodeViewState("#view=" + encoded);
    expect(decoded).toEqual(state);
  });
});
