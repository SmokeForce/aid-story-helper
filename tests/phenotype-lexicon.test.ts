import { describe, it, expect } from "vitest";
import { DESCRIPTOR_LEXICON, ARCHETYPE_PHRASES, mergeBias } from "../src/inference/phenotype/lexicon";

describe("descriptor lexicon", () => {
  it("maps canonical cues to axis biases", () => {
    expect(DESCRIPTOR_LEXICON["petite"]).toMatchObject({ scale: "low" });
    expect(DESCRIPTOR_LEXICON["statuesque"]).toMatchObject({ height: "high" });
    expect(DESCRIPTOR_LEXICON["busty"]).toMatchObject({ cup: "high" });
    expect(DESCRIPTOR_LEXICON["broad-shouldered"]).toMatchObject({ shoulders: "high" });
    expect(DESCRIPTOR_LEXICON["beanpole"]).toMatchObject({ height: "high", scale: "low" });
  });

  it("is bounded (50-150 entries) and lowercase-keyed", () => {
    const keys = Object.keys(DESCRIPTOR_LEXICON);
    expect(keys.length).toBeGreaterThanOrEqual(50);
    expect(keys.length).toBeLessThanOrEqual(150);
    for (const k of keys) expect(k).toBe(k.toLowerCase());
  });

  it("mergeBias lets a later cue override an earlier one per field", () => {
    const merged = mergeBias({ scale: "low" }, { scale: "high", cup: "high" });
    expect(merged).toEqual({ scale: "high", cup: "high" });
  });

  it("has an output phrase for the canonical archetype labels", () => {
    expect(ARCHETYPE_PHRASES["Hourglass"]).toBeTruthy();
    expect(ARCHETYPE_PHRASES["V-Taper"]).toBeTruthy();
  });
});
