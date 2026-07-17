// tests/phenotype-index.test.ts
import { describe, it, expect } from "vitest";
import { resolveGender, buildPhenotypeInputs } from "../src/inference/phenotype/index";
import type { PhenotypeRecord } from "../src/inference/phenotype/types";

describe("resolveGender (layered)", () => {
  it("reads an explicit Gender field first", () => {
    expect(resolveGender("Name: X\nGender & Age: Female, 25", "")).toBe("female");
    expect(resolveGender("Name: X\nGender: male", "")).toBe("male");
  });
  it("falls back to story pronoun cues", () => {
    expect(resolveGender("Name: X", "She walked in and set down her bag.")).toBe("female");
    expect(resolveGender("Name: X", "He drew his sword.")).toBe("male");
  });
  it("returns null when nothing resolves (non-human/ungendered)", () => {
    expect(resolveGender("Name: The Construct", "It hummed and rotated.")).toBeNull();
  });
  it("uses a male honorific in the NAME over a female-dominated story (Monsieur Vallois bug)", () => {
    // No Gender field; the recent story is full of the female protagonist's pronouns.
    expect(resolveGender("Name: Monsieur Vallois", "She drew her blade; her eyes met his.", "Monsieur Vallois")).toBe("male");
  });
  it("uses a female honorific in the NAME over a male-dominated story", () => {
    expect(resolveGender("Name: Lady Ashford", "He bowed, and his men followed him.", "Lady Ashford")).toBe("female");
  });
  it("still falls back to story pronouns when the name has no honorific", () => {
    expect(resolveGender("Name: Vallois", "He drew his sword and steadied his aim.", "Vallois")).toBe("male");
  });
  it("does not misfire a feminine title's masculine stem (Countess → female)", () => {
    expect(resolveGender("Name: Countess Bathory", "", "Countess Bathory")).toBe("female");
  });
});

describe("buildPhenotypeInputs", () => {
  const base = { shortId: "a1", characterKey: "vallois", name: "Monsieur Vallois", population: "western" as const };

  it("samples fresh for an empty-appearance new character (the gap)", () => {
    const r = buildPhenotypeInputs({ ...base, gender: "male", cueText: "a tall, broad-shouldered swordsman",
      hasEstablishedAppearance: false });
    expect(r.record.provenance).toBe("sampled");
    expect(r.keyPairLine).toMatch(/^SWH: /);
    expect(r.rewriteAppearance).toBe(true);
    expect(r.appearanceGuidance).toContain("do not fabricate explicit");
    expect(r.appearanceGuidance.toLowerCase()).toContain("tall");
  });

  it("preserves prose for a card that already has an established Appearance (reverse-seeded)", () => {
    const r = buildPhenotypeInputs({ ...base, gender: "female", cueText: "statuesque hourglass",
      hasEstablishedAppearance: true, existingKeyPairLine: "BWH: 32DD-23-35" });
    expect(r.record.provenance).toBe("reverse-seeded");
    expect(r.rewriteAppearance).toBe(false);
    expect(r.keyPairLine).toBe("BWH: 32DD-23-35"); // keeps the authored line
  });

  it("skips the body when gender is null but still allows story-only appearance", () => {
    const r = buildPhenotypeInputs({ ...base, gender: null, cueText: "a shifting construct of light",
      hasEstablishedAppearance: false });
    expect(r.record.provenance).toBe("skipped");
    expect(r.keyPairLine).toBe("");
    expect(r.rewriteAppearance).toBe(true);
    expect(r.record.measurements).toBeNull();
  });

  it("re-injects a persisted sampled record without re-rolling", () => {
    const first = buildPhenotypeInputs({ ...base, gender: "male", cueText: "wiry", hasEstablishedAppearance: false });
    const rec: PhenotypeRecord = first.record;
    const again = buildPhenotypeInputs({ ...base, gender: "male", cueText: "wiry",
      hasEstablishedAppearance: false, existingRecord: rec });
    expect(again.keyPairLine).toBe(first.keyPairLine); // no re-roll
    expect(again.record.seed).toBe(rec.seed);
  });

  it("re-injecting a persisted skipped record keeps story-only guidance (not empty)", () => {
    const first = buildPhenotypeInputs({ ...base, gender: null, cueText: "a construct of light", hasEstablishedAppearance: false });
    const again = buildPhenotypeInputs({ ...base, gender: null, cueText: "a construct of light", hasEstablishedAppearance: false, existingRecord: first.record });
    expect(again.record.provenance).toBe("skipped");
    expect(again.appearanceGuidance.length).toBeGreaterThan(0);
  });

  it("re-rolls a persisted record when the resolved gender now contradicts it (mis-gender correction)", () => {
    // A previously mis-gendered female record...
    const wrong = buildPhenotypeInputs({ ...base, gender: "female", cueText: "petite", hasEstablishedAppearance: false }).record;
    expect(wrong.gender).toBe("female");
    expect(wrong.keyPair).toMatch(/^BWH:/);
    // ...corrected once gender resolution is fixed: the stored female record must NOT be re-injected.
    const fixed = buildPhenotypeInputs({ ...base, gender: "male", cueText: "broad-shouldered",
      hasEstablishedAppearance: false, existingRecord: wrong });
    expect(fixed.record.gender).toBe("male");
    expect(fixed.keyPairLine).toMatch(/^SWH:/);
    expect(fixed.record.provenance).toBe("sampled");
  });
});
