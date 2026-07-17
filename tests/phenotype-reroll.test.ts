import { describe, it, expect } from "vitest";
import { rerollPhenotype } from "../src/inference/phenotype/index";
import type { PhenotypeRecord } from "../src/inference/phenotype/types";

const sampledRec = (over: Partial<PhenotypeRecord> = {}): PhenotypeRecord => ({
  shortId: "a1", characterKey: "monsieur vallois", provenance: "sampled", gender: "male",
  population: "western", seed: 123, cues: [], archetype: { shape: "V-Taper", scale: "Average" },
  measurements: { heightInches: 63, shoulders: 44, waist: 33, hip: 38 },
  descriptorPhrase: "short, a strong V-taper", keyPair: "SWH: 44-33-38", quirks: ["Right-handed"],
  sampledAt: "2026-07-11T00:00:00Z", ...over,
});

describe("rerollPhenotype", () => {
  it("bumps the reroll counter and produces a different body from the same record", () => {
    const rec = sampledRec();
    const r1 = rerollPhenotype(rec)!;
    expect(r1.record.reroll).toBe(1);
    expect(r1.record.keyPair).not.toBe(rec.keyPair); // new draw (nonce'd seed)
    expect(r1.keyPairLine).toMatch(/^SWH: /);
    const r2 = rerollPhenotype(r1.record)!;
    expect(r2.record.reroll).toBe(2);
  });

  it("re-samples from the record's stored cues, NOT any card prose (no pollution)", () => {
    // A record whose cues are empty must sample neutrally regardless of what a card says elsewhere —
    // rerollPhenotype never sees the card, only the record.
    const r = rerollPhenotype(sampledRec({ cues: [] }))!;
    expect(r.record.cues).toEqual([]);
    expect(r.appearanceGuidance).toContain("do not fabricate explicit");
  });

  it("preserves gender/population and forces provenance sampled", () => {
    const r = rerollPhenotype(sampledRec())!;
    expect(r.record.gender).toBe("male");
    expect(r.record.population).toBe("western");
    expect(r.record.provenance).toBe("sampled");
  });

  it("converts a reverse-seeded record to a sampled body", () => {
    const r = rerollPhenotype(sampledRec({ provenance: "reverse-seeded", cues: ["statuesque"], gender: "female" }))!;
    expect(r.record.provenance).toBe("sampled");
    expect(r.keyPairLine).toMatch(/^BWH: /);
  });

  it("returns null for a skipped / genderless record", () => {
    expect(rerollPhenotype(sampledRec({ provenance: "skipped", gender: null }))).toBeNull();
  });
});
