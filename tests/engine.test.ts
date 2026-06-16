import { describe, it, expect } from "vitest";
import { buildPrompt, validateProposals, analyze } from "../src/inference/engine";
import { MockProvider } from "../src/inference/provider";
import type { InferenceRequest, InferenceResponse } from "../src/inference/provider";

const req: InferenceRequest = {
  protagonist: "Smoke",
  present: ["Jessica Sterling"],
  narrative: "You ask about the alley. Jessica's mask cracks.",
  characters: [{ name: "Jessica Sterling", currentEntry: "Appearance: blonde.\nPersonality: queen bee manipulator.", source: "card" }],
};

describe("buildPrompt", () => {
  it("emits system rules naming the protagonist and constraints, and a user payload with the data", () => {
    const { system, user } = buildPrompt(req);
    expect(system).toMatch(/second-person/i);
    expect(system).toContain("Smoke");          // protagonist substituted
    expect(system).toMatch(/update.*only|only.*update/i); // update-only constraint stated
    expect(system).toMatch(/JSON/i);            // output format stated
    expect(user).toContain("Jessica Sterling"); // character included
    expect(user).toContain("alley");            // narrative included
  });

  it("does NOT include plotEssentials field in user payload (plot chars go in characters array)", () => {
    const { user } = buildPrompt(req);
    expect(user).not.toContain("plotEssentials");
  });
});

describe("validateProposals", () => {
  const chars = [{ name: "Jessica Sterling", currentEntry: "x", source: "card" as const }];

  it("keeps a valid update proposal unchanged", () => {
    const resp: InferenceResponse = { proposals: [{ name: "Jessica Sterling", action: "update", newEntry: "Appearance: y\nPersonality: z", changeSummary: "softened" }] };
    const { proposals, warnings } = validateProposals(resp, chars);
    expect(proposals).toHaveLength(1);
    expect(warnings).toEqual([]);
  });

  it("attaches source from the characters map to each proposal", () => {
    const plotChars = [{ name: "Smoke Brytefayme", currentEntry: "- Your name: Smoke Brytefayme", source: "plot" as const }];
    const resp: InferenceResponse = { proposals: [{ name: "Smoke Brytefayme", action: "update", newEntry: "Updated entry", changeSummary: "something changed" }] };
    const { proposals } = validateProposals(resp, plotChars);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]!.source).toBe("plot");
  });

  it("attaches source:'card' for card characters", () => {
    const resp: InferenceResponse = { proposals: [{ name: "Jessica Sterling", action: "update", newEntry: "x", changeSummary: "s" }] };
    const { proposals } = validateProposals(resp, chars);
    expect(proposals[0]!.source).toBe("card");
  });

  it("truncates protagonist's entry to 3500 chars and warns", () => {
    const smokeChar = [{ name: "Smoke", currentEntry: "x", source: "plot" as const }];
    const long = "a".repeat(4000);
    const { proposals, warnings } = validateProposals(
      { proposals: [{ name: "Smoke", action: "update", newEntry: long, changeSummary: "s" }] },
      smokeChar,
      "Smoke"
    );
    expect(proposals[0]!.newEntry.length).toBe(3500);
    expect(warnings.some((w) => /3500|truncat/i.test(w))).toBe(true);
  });

  it("truncates other Plot Essentials character's entry to 2000 chars and warns", () => {
    const plotChars = [{ name: "Jessica Sterling", currentEntry: "x", source: "plot" as const }];
    const long = "a".repeat(2500);
    const { proposals, warnings } = validateProposals(
      { proposals: [{ name: "Jessica Sterling", action: "update", newEntry: long, changeSummary: "s" }] },
      plotChars,
      "Smoke"
    );
    expect(proposals[0]!.newEntry.length).toBe(2000);
    expect(warnings.some((w) => /2000|truncat/i.test(w))).toBe(true);
  });

  it("truncates Story Card entry to 2000 chars and warns", () => {
    const long = "a".repeat(2500);
    const { proposals, warnings } = validateProposals(
      { proposals: [{ name: "Jessica Sterling", action: "update", newEntry: long, changeSummary: "s" }] },
      chars,
      "Smoke"
    );
    expect(proposals[0]!.newEntry.length).toBe(2000);
    expect(warnings.some((w) => /2000|truncat/i.test(w))).toBe(true);
  });

  it("drops a proposal for an unknown character (no create allowed)", () => {
    const { proposals, warnings } = validateProposals({ proposals: [{ name: "Ghost", action: "update", newEntry: "x", changeSummary: "s" }] }, chars);
    expect(proposals).toHaveLength(0);
    expect(warnings.some((w) => /Ghost/.test(w))).toBe(true);
  });

  it("resolves a proposal by Story Card alias/trigger and canonicalizes the name", () => {
    // AID refers to "mia" (a trigger key / first name) but the card is titled "Mia Johansson".
    const miaChars = [{ name: "Mia Johansson", currentEntry: "x", source: "card" as const, aliases: ["Mia", "Johansson"] }];
    const { proposals, warnings } = validateProposals(
      { proposals: [{ name: "mia", action: "update", newEntry: "y", changeSummary: "s" }] },
      miaChars
    );
    expect(warnings).toHaveLength(0);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]!.name).toBe("Mia Johansson"); // canonicalized to the card title
    expect(proposals[0]!.source).toBe("card");
  });

  it("does not let an alias override a canonical name belonging to another character", () => {
    const both = [
      { name: "Mia Johansson", currentEntry: "x", source: "card" as const, aliases: ["Mia"] },
      { name: "Mia", currentEntry: "z", source: "card" as const, aliases: [] },
    ];
    const { proposals } = validateProposals(
      { proposals: [{ name: "Mia", action: "update", newEntry: "y", changeSummary: "s" }] },
      both
    );
    expect(proposals[0]!.name).toBe("Mia"); // exact canonical match wins over the alias
  });

  it("ignores forcing-function 'skip' verdicts silently (no proposal, no warning)", () => {
    const { proposals, warnings } = validateProposals(
      {
        proposals: [
          { name: "Jessica Sterling", action: "update", newEntry: "y", changeSummary: "grew" },
          { name: "Jessica Sterling", action: "skip", reason: "only mentioned in passing" } as any,
        ],
      },
      chars
    );
    expect(proposals).toHaveLength(1);
    expect(proposals[0]!.changeSummary).toBe("grew");
    expect(warnings).toHaveLength(0);
  });

  it("drops a create proposal for an unknown name (create not allowed; only update known characters)", () => {
    const { proposals, warnings } = validateProposals({ proposals: [{ name: "NewGuy", action: "create", newEntry: "x", changeSummary: "s" }] }, chars);
    expect(proposals).toHaveLength(0);
    expect(warnings.some((w) => /NewGuy/.test(w))).toBe(true);
  });

  it("warns on a trigger that collides with a common word", () => {
    const { warnings } = validateProposals({ proposals: [{ name: "Jessica Sterling", action: "update", newEntry: "x", changeSummary: "s", suggestedTriggers: "cat" }] }, chars);
    expect(warnings.some((w) => /trigger/i.test(w))).toBe(true);
  });

  it("does not warn on a distinctive trigger", () => {
    const { warnings } = validateProposals({ proposals: [{ name: "Jessica Sterling", action: "update", newEntry: "x", changeSummary: "s", suggestedTriggers: "Jessica" }] }, chars);
    expect(warnings.filter((w) => /trigger/i.test(w))).toEqual([]);
  });
});

describe("analyze (golden fixture: Jessica Sterling)", () => {
  it("returns a section-preserving update proposal from a provider response", async () => {
    const before = "Appearance: beautiful, blonde, blue-eyed.\nPersonality: master manipulator, queen bee.";
    const after = "Appearance: beautiful, blonde, blue-eyed; increasingly wears oversized comfortable clothing, shedding the designer armor.\nPersonality: formerly the queen bee manipulator; following her encounter with Smoke her worldview is dismantled, craving genuine connection.";
    const gReq: InferenceRequest = { protagonist: "Smoke", present: ["Jessica Sterling"], narrative: "Jessica admits she just wants to be seen.", characters: [{ name: "Jessica Sterling", currentEntry: before, source: "card" }] };
    const provider = new MockProvider({ proposals: [{ name: "Jessica Sterling", action: "update", newEntry: after, changeSummary: "Queen Bee armor cracking; craves genuine connection." }] });
    const { proposals } = await analyze(provider, gReq);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]!.name).toBe("Jessica Sterling");
    expect(proposals[0]!.newEntry).toContain("Appearance:");
    expect(proposals[0]!.newEntry).toContain("Personality:");
    expect(proposals[0]!.changeSummary.length).toBeGreaterThan(0);
    expect(proposals[0]!.source).toBe("card");
  });
});

describe("buildPrompt per-type guidance", () => {
  it("injects guidance only for present types, mapping non-standard types to custom", () => {
    const req: any = {
      protagonist: "Smoke",
      present: ["A", "B"],
      narrative: "x",
      characters: [
        { name: "A", currentEntry: "a", source: "card", type: "location" },
        { name: "B", currentEntry: "b", source: "card", type: "Song" },
      ],
    };
    const { system, user } = buildPrompt(req);
    expect(system).toMatch(/PER-TYPE GUIDANCE/);
    expect(system).toMatch(/- location:/);
    expect(system).toMatch(/- custom:/); // "Song" normalizes to custom
    expect(system).not.toMatch(/- character:/); // no character-type entries in this batch
    expect(user).toContain('"type": "location"');
  });
});
