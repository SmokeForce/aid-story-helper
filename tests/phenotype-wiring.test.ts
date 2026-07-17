// tests/phenotype-wiring.test.ts
import { describe, it, expect, vi, beforeAll } from "vitest";

// Mock browser global before importing background — background.ts touches `browser.storage.session`
// at module scope via bg-infra.ts. A static top-level `import` of background.ts runs before this
// assignment (ES import hoisting), so — mirroring tests/memoraid.test.ts — we dynamically import
// background.ts inside beforeAll, after this mock is installed.
(globalThis as any).browser = {
  storage: {
    session: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    },
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    },
  },
  runtime: {
    onMessage: {
      addListener: vi.fn(),
    },
  },
  tabs: {
    query: vi.fn().mockResolvedValue([{ id: 1 }]),
    sendMessage: vi.fn().mockResolvedValue(undefined),
  },
  permissions: {
    contains: vi.fn().mockResolvedValue(true),
  },
};

let gatherCharacterCueText: typeof import("../src/background/background").gatherCharacterCueText;

beforeAll(async () => {
  ({ gatherCharacterCueText } = await import("../src/background/background"));
});

describe("gatherCharacterCueText", () => {
  const actions = [
    { text: "The tavern was loud." },
    { text: "Vallois drew his rapier, tall and broad-shouldered." },
    { text: "She poured the wine." },
    { text: "A monsieur in a fine coat bowed." },
  ] as any[];

  it("includes the card value plus only actions mentioning the name/keys", () => {
    const out = gatherCharacterCueText("Name: Monsieur Vallois", actions, "Monsieur Vallois", "Vallois, monsieur");
    expect(out).toContain("Monsieur Vallois");       // card value
    expect(out).toContain("broad-shouldered");        // name mention
    expect(out).toContain("monsieur in a fine coat"); // key mention
    expect(out).not.toContain("poured the wine");     // unrelated action excluded
  });

  it("is capped and tolerant of empty inputs", () => {
    expect(gatherCharacterCueText("", [], "X", "")).toBe("");
    expect(gatherCharacterCueText("Name: X", [], "X", "").length).toBeGreaterThan(0);
  });
});
