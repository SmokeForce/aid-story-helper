import { describe, it, expect } from "vitest";
import { buildAnalyzeRequest, buildLocationContext, detectPresentCards, buildMemoraidPrompt } from "../src/inference/gather";
import { matchedTriggers } from "../src/shared/types";
import type { CardRow } from "../src/shared/types";

describe("matchedTriggers", () => {
  it("returns the title/key tokens that fire, deduped and possessive-stripped", () => {
    const text = "You offer your arm to Celeste's hand as Lady Starfall watches.";
    expect(matchedTriggers(text, "Lady Celeste Starfall", "Celeste, Lady Celeste, Lady Starfall"))
      .toEqual(["Celeste", "Lady Starfall"]); // possessive "Celeste's" matches; full title absent
  });
  it("returns empty when neither title nor keys appear", () => {
    expect(matchedTriggers("The dock is busy.", "King Marcus", "Marcus, King")).toEqual([]);
  });
});

describe("detectPresentCards", () => {
  const cards = [
    { title: "Lady Celeste Starfall", keys: "Celeste, Lady Starfall", type: "character" },
    { title: "King Marcus Silverwulf", keys: "Marcus, King Marcus", type: "character" },
    { title: "Configure MemorAID", keys: "", type: "custom" },
    { title: "Lady Celeste Starfall (Memory)", keys: "Celeste", type: "Memory" },
    { title: "The Dock", keys: "dock, landing platform", type: "location" },
    { title: "Old Card", keys: "celeste", type: "character", deletedAt: "2026-01-01" },
  ];
  it("surfaces present non-meta cards with their matched triggers", () => {
    const present = detectPresentCards("Celeste steps onto the dock beside you.", cards);
    const byTitle = Object.fromEntries(present.map((p) => [p.title, p]));
    expect(byTitle["Lady Celeste Starfall"]?.triggers).toEqual(["Celeste"]);
    expect(byTitle["The Dock"]?.triggers).toContain("dock");
    expect(byTitle["King Marcus Silverwulf"]).toBeUndefined(); // not in text
  });
  it("excludes meta/tool cards (Configure MemorAID, companion Memory cards) and soft-deleted cards", () => {
    const present = detectPresentCards("Celeste is here.", cards);
    expect(present.find((p) => p.title === "Configure MemorAID")).toBeUndefined();
    expect(present.find((p) => p.title.endsWith("(Memory)"))).toBeUndefined();
    expect(present.find((p) => p.title === "Old Card")).toBeUndefined();
  });
});

describe("buildMemoraidPrompt", () => {
  it("splits the shared scene prefix from the per-character tail (for prompt caching)", () => {
    const { cachePrefix, user } = buildMemoraidPrompt({
      charProfile: "Character Profile for Celeste:\nNoble.\n\n",
      priorActionsText: "Earlier stuff.",
      latestActionText: "You offer your arm to Celeste.",
      presentEntities: [{ title: "Lady Celeste Starfall", type: "character", triggers: ["Celeste"] }],
      instructions: "TEMPLATE_DIRECTIVE",
    });
    // Shared, character-independent content lives in the cacheable prefix.
    expect(cachePrefix).toContain("present in the current scene");
    expect(cachePrefix).toContain("- Lady Celeste Starfall (character; matched: Celeste)");
    expect(cachePrefix).toContain("Latest action:\nYou offer your arm to Celeste.");
    // Per-character content (profile) and the instruction template live in the variable tail.
    expect(user).toContain("Character Profile for Celeste:");
    expect(user).toContain("Instructions:\nTEMPLATE_DIRECTIVE");
    expect(user).not.toContain("present in the current scene");
    // No character name baked into instruction prose (universal/structural labels only).
    expect(cachePrefix + user).not.toContain("reaction strictly to THIS");
  });
  it("shows (none detected) when no entities are present", () => {
    const { cachePrefix } = buildMemoraidPrompt({
      charProfile: "", priorActionsText: "", latestActionText: "x", presentEntities: [], instructions: "i",
    });
    expect(cachePrefix).toContain("(none detected)");
  });
});

describe("buildAnalyzeRequest (Plot Essentials only)", () => {
  it("parses plot essentials memory into source:'plot' characters", () => {
    const memory = `[- Your name: Smoke Brytefayme
- Your gender: Male
- Personality: philosophical, direct]

[Jessica Sterling is the school's queen bee.
Appearance: blonde, blue-eyed.
Personality: master manipulator, in transition.]`;
    const req = buildAnalyzeRequest("Smoke", [], memory);
    const plotChars = req.characters.filter((c) => c.source === "plot");
    expect(plotChars.map((c) => c.name)).toContain("Jessica Sterling");
    expect(plotChars.map((c) => c.name)).toContain("Smoke Brytefayme");
    expect(req.characters.every((c) => c.source === "plot")).toBe(true); // no card-sourced entries
  });

  it("aliases a plot character on the first name", () => {
    const req = buildAnalyzeRequest("Smoke", [], "[Jessica Sterling is the queen bee.]");
    const jess = req.characters.find((c) => c.name === "Jessica Sterling");
    expect(jess?.aliases).toContain("Jessica");
  });

  it("carries the narrative through", () => {
    const req = buildAnalyzeRequest("Smoke", [
      { id: "10", text: "You greet Jessica.", type: "do" },
      { id: "11", text: "Jessica hesitates.", type: "continue" },
    ], "[Jessica Sterling is the queen bee.]");
    expect(req.protagonist).toBe("Smoke");
    expect(req.narrative).toContain("You greet Jessica.");
    expect(req.narrative).toContain("Jessica hesitates.");
  });

  it("does NOT expose a plotEssentials field on the returned request", () => {
    const req = buildAnalyzeRequest("Smoke", [], "[Jessica Sterling is the queen bee.]");
    expect((req as any).plotEssentials).toBeUndefined();
  });

  it("returns empty characters when no memory", () => {
    const req = buildAnalyzeRequest("Smoke", []);
    expect(req.characters).toEqual([]);
  });
});

describe("buildLocationContext", () => {
  const fortress: CardRow = {
    shortId: "S", id: "c-fortress", type: "location", title: "The Fortress of Misal",
    keys: "Misal,Fortress,border,town",
    value: "{Name: Misal\nType: Border Town and Fortress\nHumans, elves, dwarves, tieflings, drow, beastfolk, merchants, soldiers, spies, and refugees live there under an uneasy truce.}"
  };
  const suite: CardRow = {
    shortId: "S", id: "c-suite", type: "location", title: "Royal Suite - Fortress of Misal",
    keys: "royal suite",
    value: "[Type: Royal Suite\nLocated In: Fortress of Misal > Misal > Tarian-Sepikha border\nOwnership: Sadyra\nFeatures: Heavy oak doors.]"
  };
  const unrelated: CardRow = {
    shortId: "S", id: "c-beach", type: "location", title: "Nobody's Beach", keys: "beach",
    value: "[Type: Beach]"
  };
  const character: CardRow = {
    shortId: "S", id: "c-sadyra", type: "character", title: "Misal Guard", keys: "guard",
    value: "A guard."
  };

  it("labels the current entry as the authoritative base", () => {
    const ctx = buildLocationContext(suite, [fortress, suite, unrelated]);
    expect(ctx).toContain("authoritative base");
    expect(ctx).toContain("NEVER drop established inhabitants");
    expect(ctx).toContain("Heavy oak doors.");
  });

  it("pulls containing locations matched via title/keys against the card title and Located In line", () => {
    const ctx = buildLocationContext(suite, [fortress, suite, unrelated]);
    expect(ctx).toContain('Containing location "The Fortress of Misal"');
    expect(ctx).toContain("uneasy truce");
    expect(ctx).not.toContain("Nobody's Beach");
  });

  it("excludes itself, deleted cards, and non-location cards", () => {
    const deletedFortress = { ...fortress, deletedAt: "2026-06-11T00:00:00Z" };
    const ctx = buildLocationContext(suite, [deletedFortress, suite, character]);
    expect(ctx).not.toContain("Containing location");
  });

  it("does not pull child locations into a parent's context", () => {
    // Regenerating the fortress: the suite's title/keys do not appear in the fortress's
    // title or Located In line, so it must not leak in.
    const ctx = buildLocationContext(fortress, [fortress, suite, unrelated]);
    expect(ctx).not.toContain("Royal Suite");
  });

  it("returns empty string for a card with no value", () => {
    expect(buildLocationContext({ ...suite, value: "" }, [fortress])).toBe("");
  });

  it("respects the parent budget", () => {
    const ctx = buildLocationContext(suite, [fortress], 10);
    expect(ctx).toContain("authoritative base");
    expect(ctx).not.toContain("Containing location");
  });
});
