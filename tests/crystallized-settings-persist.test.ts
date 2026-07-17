import { describe, it, expect, beforeEach, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";

// Mock the browser global before importing background (mirrors living-config-persist.test.ts).
(globalThis as any).browser = {
  storage: {
    session: {
      get: vi.fn().mockResolvedValue({ aidToken: "Bearer token123", aidEndpoint: "https://api.aidungeon.com/graphql" }),
      set: vi.fn().mockResolvedValue(undefined),
    },
  },
  runtime: { onMessage: { addListener: vi.fn() } },
  tabs: { query: vi.fn().mockResolvedValue([{ id: 1 }]), sendMessage: vi.fn().mockResolvedValue(undefined) },
};

import { Repo } from "../src/storage/repo";
import { __resetDbForTests } from "../src/storage/db";

globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) } as any);

// Regression: getState serialized only a subset of Settings, dropping every feature-enable flag and the
// Crystallized config. The panel hydrates its toggles from state.settings, so with these missing the
// Crystallized toggle (+ caps) rendered unchecked/default on every refresh — Crystallized read as
// "missing entirely." Same class as the livingConfig/memoraidCharacters drop.
describe("getState round-trips feature-enable flags + Crystallized config", () => {
  let repo: Repo;
  let listener: (msg: any) => any;
  const shortId = "cryst-settings-01";

  beforeEach(async () => {
    (globalThis as any).indexedDB = new IDBFactory();
    __resetDbForTests();
    repo = new Repo();
    const bg = await import("../src/background/background");
    bg.__resetMemoraidStateForTests();
    listener = (browser.runtime.onMessage.addListener as any).mock.calls[0][0];
  });

  it("returns enableCrystallized + caps + feature toggles the panel reads back", async () => {
    await repo.setSettings({
      provider: "claude",
      apiKeys: { claude: "sk-ant-123" },
      enableCrystallized: true,
      crystallizedInterval: 15,
      crystallizedNodeCap: 9,
      crystallizedNpcMemoryCap: 250,
      enableLivingCharacters: false,
      groupThoughtsInRoster: true,
      enableAutomaticUpdates: true,
    });

    const state: any = await listener({ kind: "getState", shortId });
    expect(state?.settings).toBeDefined();
    // The reported bug: this was undefined, so the toggle rendered unchecked every refresh.
    expect(state.settings.enableCrystallized).toBe(true);
    expect(state.settings.crystallizedInterval).toBe(15);
    expect(state.settings.crystallizedNodeCap).toBe(9);
    expect(state.settings.crystallizedNpcMemoryCap).toBe(250);
    // Other feature flags the panel hydrates from the same block.
    expect(state.settings.enableLivingCharacters).toBe(false);
    expect(state.settings.groupThoughtsInRoster).toBe(true);
    expect(state.settings.enableAutomaticUpdates).toBe(true);
    // Defaults surface for unset fields (not dropped).
    expect(state.settings.enableMemorAID).toBe(true);
    expect(state.settings.crystallizedEntryMaxChars).toBe(900);
    expect(state.settings.crystallizedKnowsCap).toBe(2);
  });
});
