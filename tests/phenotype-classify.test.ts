import { describe, it, expect } from "vitest";
import { femaleShape, maleShape, extractCues, classify } from "../src/inference/phenotype/classify";

describe("shape math", () => {
  it("classifies the female worked example 36-24-34 as a Top Hourglass", () => {
    // bust>hip (36>34) with a deep waist (bust-waist 12) → top hourglass
    expect(femaleShape(36, 24, 34)).toBe("Top Hourglass");
  });
  it("classifies an even hourglass 37-25-38", () => {
    expect(femaleShape(37, 25, 38)).toBe("Hourglass");
  });
  it("classifies a pear 34-27-40", () => {
    expect(femaleShape(34, 27, 40)).toBe("Pear/Triangle");
  });
  it("classifies a slim rectangle 34-30-35", () => {
    expect(femaleShape(34, 30, 35)).toBe("Rectangle/Slim");
  });
  it("classifies the male worked example 44-32-38 as a V-Taper", () => {
    expect(maleShape(44, 32, 38)).toBe("V-Taper");
  });
  it("classifies a male rectangle 43-36-40", () => {
    expect(maleShape(43, 36, 40)).toBe("Rectangle/Athletic");
  });
  it("classifies a male apple 46-44-44", () => {
    expect(maleShape(46, 44, 44)).toBe("Oval/Apple");
  });
  it("keeps a broad V-taper 44-42-36 as V-Taper, not Oval/Apple", () => {
    expect(maleShape(44, 42, 36)).toBe("V-Taper");
  });
  it("keeps an undefined-waist pear 32-27-37 as Pear/Triangle, not Spoon", () => {
    expect(femaleShape(32, 27, 37)).toBe("Pear/Triangle");
  });
  it("classifies a defined-waist hip-shelf 36-24-42 as Spoon/Curvy Pear", () => {
    expect(femaleShape(36, 24, 42)).toBe("Spoon/Curvy Pear");
  });
});

describe("cue extraction + classify", () => {
  it("extracts known descriptor cues from lazy text (incl. multiword)", () => {
    const cues = extractCues("A tall, broad-shouldered man with a wiry frame");
    expect(cues).toContain("tall");
    expect(cues).toContain("broad-shouldered");
    expect(cues).toContain("wiry");
  });
  it("classify composes cues into an archetype with biases", () => {
    const a = classify("petite but busty", "female");
    expect(a.gender).toBe("female");
    expect(a.bias.scale).toBe("low");
    expect(a.bias.cup).toBe("high");
    expect(a.cues).toEqual(expect.arrayContaining(["petite", "busty"]));
  });
  it("unknown descriptors degrade to a neutral archetype (no bias)", () => {
    const a = classify("a nondescript person", "male");
    expect(a.cues.length).toBe(0);
    expect(a.bias).toEqual({});
  });
});
