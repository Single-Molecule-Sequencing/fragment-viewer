import { describe, it, expect } from "vitest";
import { evaluateDATailing } from "../src/FragmentViewer.jsx";

describe("evaluateDATailing — LEFT end (top 3' / bot 5')", () => {
  it("classifies blunt end as dA-tailable with high confidence", () => {
    const r = evaluateDATailing({ side: "left", topEnd: 100, botEnd: 100 });
    expect(r.overhangType).toBe("blunt");
    expect(r.overhangLen).toBe(0);
    expect(r.dATailable).toBe(true);
    expect(r.confidence).toBe("high");
  });

  it("classifies top-longer as 3' overhang and fails dA-tailing", () => {
    // LEFT end: top ends at 102, bot ends at 100. Top 3' sticks out 2 bp.
    const r = evaluateDATailing({ side: "left", topEnd: 102, botEnd: 100 });
    expect(r.overhangType).toBe("3_prime");
    expect(r.overhangLen).toBe(2);
    expect(r.dATailable).toBe(false);
    expect(r.reason).toMatch(/3′ overhang/);
  });

  it("classifies bot-longer as 5' overhang with high-confidence dA-tailing", () => {
    // LEFT end: top ends at 98, bot ends at 100. Bot 5' sticks out 2 bp.
    const r = evaluateDATailing({ side: "left", topEnd: 98, botEnd: 100 });
    expect(r.overhangType).toBe("5_prime");
    expect(r.overhangLen).toBe(2);
    expect(r.dATailable).toBe(true);
    expect(r.confidence).toBe("high");
  });

  it("flags very long 5' overhangs (>8 nt) as marginal", () => {
    const r = evaluateDATailing({ side: "left", topEnd: 100, botEnd: 112 });
    expect(r.overhangType).toBe("5_prime");
    expect(r.overhangLen).toBe(12);
    expect(r.dATailable).toBe(true);
    expect(r.confidence).toBe("marginal");
  });
});

describe("evaluateDATailing — RIGHT end (top 5' / bot 3')", () => {
  it("blunt RIGHT end", () => {
    const r = evaluateDATailing({ side: "right", topEnd: 100, botEnd: 100 });
    expect(r.overhangType).toBe("blunt");
    expect(r.dATailable).toBe(true);
  });

  it("top-longer on RIGHT end = 5' overhang (dA-tailable)", () => {
    // RIGHT end: top starts at 98, bot starts at 100 → top extends further
    // LEFT (earlier), so top 5' sticks out.
    const r = evaluateDATailing({ side: "right", topEnd: 98, botEnd: 100 });
    expect(r.overhangType).toBe("5_prime");
    expect(r.overhangLen).toBe(2);
    expect(r.dATailable).toBe(true);
  });

  it("bot-longer on RIGHT end = 3' overhang (NOT dA-tailable)", () => {
    // RIGHT end: top starts at 102, bot starts at 100 → bot extends further
    // LEFT, bot 3' sticks out.
    const r = evaluateDATailing({ side: "right", topEnd: 102, botEnd: 100 });
    expect(r.overhangType).toBe("3_prime");
    expect(r.overhangLen).toBe(2);
    expect(r.dATailable).toBe(false);
  });
});

describe("evaluateDATailing — symmetry and edge cases", () => {
  it("returns the same overhang type regardless of which strand is mentioned first", () => {
    const a = evaluateDATailing({ side: "left", topEnd: 100, botEnd: 100 });
    const b = evaluateDATailing({ side: "left", topEnd: 100, botEnd: 100 });
    expect(a).toEqual(b);
  });

  it("1-nt 5' overhang is always dA-tailable at high confidence", () => {
    const left  = evaluateDATailing({ side: "left",  topEnd: 99,  botEnd: 100 });
    const right = evaluateDATailing({ side: "right", topEnd: 99,  botEnd: 100 });
    expect(left.dATailable).toBe(true);
    expect(left.confidence).toBe("high");
    expect(right.dATailable).toBe(true);
    expect(right.confidence).toBe("high");
  });

  it("1-nt 3' overhang always fails dA-tailing", () => {
    const left  = evaluateDATailing({ side: "left",  topEnd: 101, botEnd: 100 });
    const right = evaluateDATailing({ side: "right", topEnd: 101, botEnd: 100 });
    expect(left.dATailable).toBe(false);
    expect(right.dATailable).toBe(false);
  });

  it("8-nt 5' overhang is the boundary (still high confidence)", () => {
    const r = evaluateDATailing({ side: "left", topEnd: 100, botEnd: 108 });
    expect(r.overhangLen).toBe(8);
    expect(r.confidence).toBe("high");
  });

  it("9-nt 5' overhang crosses into marginal territory", () => {
    const r = evaluateDATailing({ side: "left", topEnd: 100, botEnd: 109 });
    expect(r.overhangLen).toBe(9);
    expect(r.confidence).toBe("marginal");
  });
});
