// tests/url_params.test.mjs — cross-tool URL param parsing + URL building.

import { describe, it, expect } from "vitest";
import { parseUrlParams, buildViewerUrl } from "../src/lib/viewstate.js";

describe("parseUrlParams", () => {
  it("returns {} for empty / missing input", () => {
    expect(parseUrlParams("")).toEqual({});
    expect(parseUrlParams(undefined)).toEqual({});
    expect(parseUrlParams("?")).toEqual({});
  });

  it("accepts known tab values", () => {
    expect(parseUrlParams("?tab=trace")).toEqual({ tab: "trace" });
    expect(parseUrlParams("?tab=sanger")).toEqual({ tab: "sanger" });
    expect(parseUrlParams("?tab=heatmap")).toEqual({ tab: "heatmap" });
    expect(parseUrlParams("?tab=registry")).toEqual({ tab: "registry" });
  });

  it("rejects unknown tab values silently", () => {
    expect(parseUrlParams("?tab=bogus")).toEqual({});
    expect(parseUrlParams("?tab=")).toEqual({});
  });

  it("accepts http/https ref URLs", () => {
    expect(parseUrlParams("?ref=https://example.com/x.dna")).toEqual({
      ref: "https://example.com/x.dna",
    });
    expect(parseUrlParams("?ref=http://example.com/x.dna")).toEqual({
      ref: "http://example.com/x.dna",
    });
  });

  it("accepts same-origin path refs", () => {
    expect(parseUrlParams("?ref=/refs/V059.dna")).toEqual({
      ref: "/refs/V059.dna",
    });
  });

  it("rejects non-http refs (file://, javascript:, etc.)", () => {
    expect(parseUrlParams("?ref=javascript:alert(1)")).toEqual({});
    expect(parseUrlParams("?ref=file:///etc/passwd")).toEqual({});
    expect(parseUrlParams("?ref=ftp://example.com/x")).toEqual({});
  });

  it("accepts non-empty sample ids; rejects empty", () => {
    expect(parseUrlParams("?sample=V059_4-5")).toEqual({ sample: "V059_4-5" });
    expect(parseUrlParams("?sample=")).toEqual({});
  });

  it("decodes URL-encoded values", () => {
    expect(parseUrlParams("?sample=well%20A03")).toEqual({ sample: "well A03" });
  });

  it("parses multiple params in one URL", () => {
    expect(parseUrlParams("?tab=sanger&ref=/refs/x.dna&sample=plate1_A03")).toEqual({
      tab: "sanger",
      ref: "/refs/x.dna",
      sample: "plate1_A03",
    });
  });

  it("ignores unknown keys", () => {
    expect(parseUrlParams("?unknown=foo&tab=trace")).toEqual({ tab: "trace" });
  });
});

describe("buildViewerUrl", () => {
  const BASE = "https://single-molecule-sequencing.github.io/fragment-viewer/";

  it("returns base unchanged when no params provided", () => {
    expect(buildViewerUrl(BASE)).toBe(BASE);
    expect(buildViewerUrl(BASE, {})).toBe(BASE);
  });

  it("strips existing query/hash from base", () => {
    expect(buildViewerUrl(BASE + "?old=1#hash", { tab: "sanger" })).toMatch(
      /\?tab=sanger$/
    );
  });

  it("encodes tab + ref + sample together", () => {
    const url = buildViewerUrl(BASE, {
      tab: "sanger",
      ref: "https://example.com/x.dna",
      sample: "plate1_A03",
    });
    expect(url).toContain("tab=sanger");
    expect(url).toContain("ref=https%3A%2F%2Fexample.com%2Fx.dna");
    expect(url).toContain("sample=plate1_A03");
  });

  it("rejects an unknown tab silently (omits it)", () => {
    const url = buildViewerUrl(BASE, { tab: "bogus", sample: "x" });
    expect(url).not.toContain("bogus");
    expect(url).toContain("sample=x");
  });

  it("throws when base is missing", () => {
    expect(() => buildViewerUrl("")).toThrow();
    expect(() => buildViewerUrl(null)).toThrow();
  });

  it("round-trips with parseUrlParams", () => {
    const url = buildViewerUrl(BASE, { tab: "sanger", sample: "x" });
    const search = url.slice(url.indexOf("?"));
    expect(parseUrlParams(search)).toEqual({ tab: "sanger", sample: "x" });
  });
});
