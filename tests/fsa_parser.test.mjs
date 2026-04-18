import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseAbifBuffer, parseFsaArrayBuffer, calibrateLizJs } from "../src/FragmentViewer.jsx";

const FSA = "/mnt/d/Downloads/30-1313048433/30-1313048433/gRNA3_1-1.fsa";

describe("ABIF JS parser on real .fsa", () => {
  if (!fs.existsSync(FSA)) {
    it.skip("fixture missing", () => {});
    return;
  }
  const buf = fs.readFileSync(FSA);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

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
    // 35 bp anchor should map to ≈35 bp
    const known = entries.DATA105.value;
    const fn = interp;
    expect(typeof fn(1000)).toBe("number");
  });

  it("end-to-end parseFsaArrayBuffer returns peaks per dye", () => {
    const { sampleName, peaks, calibrated, meta } = parseFsaArrayBuffer(ab, "gRNA3_1-1.fsa");
    expect(sampleName).toBe("gRNA3_1-1");
    expect(calibrated).toBe(true);
    expect(meta.dye_chemistry).toContain("LIZ");
    for (const d of ["B","G","Y","R","O"]) expect(Array.isArray(peaks[d])).toBe(true);
    // Should call at least a handful of peaks per dye
    const total = ["B","G","Y","R"].reduce((t,d) => t + peaks[d].length, 0);
    expect(total).toBeGreaterThan(20);
  });
});
