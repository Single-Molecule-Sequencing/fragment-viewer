// Issue #5 fix: point at the in-repo public/demo/*.fsa fixtures (which
// every checkout + CI has) instead of a WSL-only absolute path that
// silently skipped on every non-Greg machine.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseAbifBuffer, parseFsaArrayBuffer, calibrateLizJs } from "../src/FragmentViewer.jsx";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FSA_GRNA3 = path.resolve(HERE, "..", "public", "demo", "gRNA3_1-1.fsa");
const FSA_V059  = path.resolve(HERE, "..", "public", "demo", "V059_4-5.fsa");

function readFsaBuffer(p) {
  const buf = fs.readFileSync(p);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe("ABIF JS parser on real .fsa (gRNA3_1-1)", () => {
  const ab = readFsaBuffer(FSA_GRNA3);

  it("parses header + has DATA1..4 + DATA105", () => {
    const { entries, version } = parseAbifBuffer(ab);
    expect(version).toBeGreaterThan(0);
    expect(entries.DATA1).toBeTruthy();
    expect(entries.DATA105).toBeTruthy();
    expect(entries.DATA1.value.length).toBeGreaterThan(1000);
  });

  it("calibrates via LIZ", () => {
    const { entries } = parseAbifBuffer(ab);
    const interp = calibrateLizJs(entries.DATA105.value);
    expect(interp).toBeTruthy();
    expect(typeof interp(1000)).toBe("number");
  });

  it("end-to-end parseFsaArrayBuffer returns peaks per dye", () => {
    const { sampleName, peaks, calibrated, meta } = parseFsaArrayBuffer(ab, "gRNA3_1-1.fsa");
    expect(sampleName).toBe("gRNA3_1-1");
    expect(calibrated).toBe(true);
    expect(meta.dye_chemistry).toContain("LIZ");
    for (const d of ["B","G","Y","R","O"]) expect(Array.isArray(peaks[d])).toBe(true);
    const total = ["B","G","Y","R"].reduce((t, d) => t + peaks[d].length, 0);
    expect(total).toBeGreaterThan(20);
  });
});

describe("ABIF JS parser on real .fsa (V059_4-5)", () => {
  const ab = readFsaBuffer(FSA_V059);

  it("parses header + peaks per dye on the 4-5 uncut sample", () => {
    const { peaks, calibrated } = parseFsaArrayBuffer(ab, "V059_4-5.fsa");
    expect(calibrated).toBe(true);
    for (const d of ["B","G","Y","R","O"]) expect(Array.isArray(peaks[d])).toBe(true);
    const total = ["B","G","Y","R"].reduce((t, d) => t + peaks[d].length, 0);
    expect(total).toBeGreaterThan(20);
  });
});
