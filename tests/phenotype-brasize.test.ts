// tests/phenotype-brasize.test.ts
import { describe, it, expect } from "vitest";
import { CUP_LADDER, letterToCupVolume, cupVolumeToLetter, braToTrueBust, trueBustToBra } from "../src/inference/phenotype/braSize";

describe("bra-size math", () => {
  it("ladder maps letters to volumes and back", () => {
    expect(CUP_LADDER[0]).toBe("AA");
    expect(letterToCupVolume("D")).toBe(4);
    expect(letterToCupVolume("DD")).toBe(5);
    expect(cupVolumeToLetter(4)).toBe("D");
    expect(cupVolumeToLetter(5)).toBe("DD");
  });

  it("braToTrueBust adds cup inches to band (spec anchor 32D -> 36)", () => {
    expect(braToTrueBust(32, "D")).toBe(36);
    expect(braToTrueBust(32, "DD")).toBe(37);
  });

  it("trueBustToBra round-trips a band+cup", () => {
    expect(trueBustToBra(36, 32)).toBe("32D");
    expect(trueBustToBra(37, 32)).toBe("32DD");
    // Veya: 32DD true bust 37 round-trips
    expect(trueBustToBra(braToTrueBust(32, "DD"), 32)).toBe("32DD");
  });

  it("clamps out-of-ladder volumes to the ends (no crash on extremes)", () => {
    expect(cupVolumeToLetter(-2)).toBe("AA");
    expect(cupVolumeToLetter(99)).toBe(CUP_LADDER[CUP_LADDER.length - 1]);
  });
});
