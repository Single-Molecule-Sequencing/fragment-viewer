import { describe, it, expect } from "vitest";
import { predictPostTailing } from "../src/FragmentViewer.jsx";

// 20 bp toy sequence; we pick cut positions that land on different bases
// so we can observe the terminal-base behavior without needing the real
// construct. Sequence: A C G T A C G T A C G T A C G T A C G T
const SEQ = "ACGTACGTACGTACGTACGT";

describe("predictPostTailing — blunt end", () => {
  it("dA-tails a blunt LEFT end, adding A to the top 3' terminus", () => {
    // Blunt: topEnd == botEnd == 10. Top 3' terminal = SEQ[9] = 'C'.
    const p = predictPostTailing({ side: "left", topEnd: 10, botEnd: 10, topSeq: SEQ });
    expect(p.dATailed).toBe(true);
    expect(p.adapterCompatible).toBe(true);
    expect(p.top3Before).toBe("C");
    expect(p.top3After).toBe("CA");
    expect(p.endCode).toMatch(/3'-A/);
  });

  it("dA-tails a blunt RIGHT end, adding A to the bot 3' terminus", () => {
    const p = predictPostTailing({ side: "right", topEnd: 10, botEnd: 10, topSeq: SEQ });
    expect(p.dATailed).toBe(true);
    expect(p.adapterCompatible).toBe(true);
    expect(p.bot3After).toBe(p.bot3Before + "A");
  });
});

describe("predictPostTailing — 5' overhang is chewed then tailed", () => {
  it("LEFT end 5' overhang (bot longer) → post-exo blunt → dA-tailed", () => {
    // topEnd=10, botEnd=13 → bot 5' sticks out 3 nt (bot ends 3 nt further right).
    const p = predictPostTailing({ side: "left", topEnd: 10, botEnd: 13, topSeq: SEQ });
    expect(p.original.overhangType).toBe("5_prime");
    expect(p.postExo.overhangType).toBe("blunt");
    expect(p.dATailed).toBe(true);
    expect(p.adapterCompatible).toBe(true);
  });

  it("RIGHT end 5' overhang (top longer on that edge) → blunt → dA-tailed", () => {
    // topEnd=7, botEnd=10 → top starts earlier = top 5' sticks out 3 nt.
    const p = predictPostTailing({ side: "right", topEnd: 7, botEnd: 10, topSeq: SEQ });
    expect(p.original.overhangType).toBe("5_prime");
    expect(p.dATailed).toBe(true);
  });
});

describe("predictPostTailing — 3' overhang fails dA-tailing", () => {
  it("LEFT end 3' overhang (top longer) → exo skips → dA NOT added", () => {
    const p = predictPostTailing({ side: "left", topEnd: 13, botEnd: 10, topSeq: SEQ });
    expect(p.original.overhangType).toBe("3_prime");
    expect(p.postExo.overhangType).toBe("3_prime");
    expect(p.dATailed).toBe(false);
    expect(p.adapterCompatible).toBe(false);
    expect(p.adapterReason).toMatch(/T\/A ligation will NOT work/i);
    expect(p.endCode).toMatch(/3' overhang \(retained\)/);
  });

  it("RIGHT end 3' overhang (bot longer) → dA NOT added", () => {
    const p = predictPostTailing({ side: "right", topEnd: 10, botEnd: 7, topSeq: SEQ });
    expect(p.original.overhangType).toBe("3_prime");
    expect(p.dATailed).toBe(false);
    expect(p.adapterCompatible).toBe(false);
  });
});

describe("predictPostTailing — reading direction and structural fields", () => {
  it("LEFT end reading-direction string mentions both R1 and R2", () => {
    const p = predictPostTailing({ side: "left", topEnd: 10, botEnd: 10, topSeq: SEQ });
    expect(p.readingDirection).toMatch(/R1/i);
    expect(p.readingDirection).toMatch(/R2/i);
  });

  it("RIGHT end reading-direction differs from LEFT", () => {
    const left  = predictPostTailing({ side: "left",  topEnd: 10, botEnd: 10, topSeq: SEQ });
    const right = predictPostTailing({ side: "right", topEnd: 10, botEnd: 10, topSeq: SEQ });
    expect(left.readingDirection).not.toBe(right.readingDirection);
  });

  it("returns terminal base characters from the sequence", () => {
    // SEQ[4] = 'A' at position 5 (1-indexed for topEnd arithmetic)
    const p = predictPostTailing({ side: "left", topEnd: 5, botEnd: 5, topSeq: SEQ });
    // SEQ[4] = 'A' → top3Before = 'A', top3After = 'AA'
    expect(p.top3Before).toBe("A");
    expect(p.top3After).toBe("AA");
  });

  it("handles empty sequence gracefully (fields populated with '?')", () => {
    const p = predictPostTailing({ side: "left", topEnd: 10, botEnd: 10, topSeq: "" });
    expect(p.top3Before).toBe("?");
    expect(p.dATailed).toBe(true);       // dA decision is sequence-independent
    expect(p.adapterCompatible).toBe(true);
  });
});
