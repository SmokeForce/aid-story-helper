import { describe, it, expect, beforeEach, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";

// Mock the browser global before importing background (mirrors memoraid.test.ts).
(globalThis as any).browser = {
  storage: {
    session: {
      get: vi.fn().mockResolvedValue({
        aidToken: "Bearer token123",
        aidEndpoint: "https://api.aidungeon.com/graphql",
      }),
      set: vi.fn().mockResolvedValue(undefined),
    },
  },
  runtime: { onMessage: { addListener: vi.fn() } },
  tabs: {
    query: vi.fn().mockResolvedValue([{ id: 1 }]),
    sendMessage: vi.fn().mockResolvedValue(undefined),
  },
};

import { Repo } from "../src/storage/repo";
import { __resetDbForTests } from "../src/storage/db";

globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) } as any);

// Regression: an empty AdventureMemoriesUpdate frame (beta emits small/partial WS payloads mid-turn,
// with the authoritative full window arriving via fetch) must NOT wipe a populated Memory Bank —
// that blanked the panel every turn while the turn was processing.
describe("adventureMemories persistence guard", () => {
  let repo: Repo;
  let listener: (msg: any) => any;
  const shortId = "guard-test-01";
  const seeded = [
    { actionIds: ["a1"], text: "You met the merchant Vaelen." },
    { actionIds: ["a2"], text: "You spoke with the Zephyri scientist." },
  ];

  beforeEach(async () => {
    (globalThis as any).indexedDB = new IDBFactory();
    __resetDbForTests();
    repo = new Repo();

    // background registers its onMessage listener once at first import (the dynamic import is cached),
    // so grab calls[0][0] and do NOT clear the mock between tests.
    const bg = await import("../src/background/background");
    bg.__resetMemoraidStateForTests();
    listener = (browser.runtime.onMessage.addListener as any).mock.calls[0][0];

    await repo.setSettings({ provider: "claude", apiKeys: { claude: "sk-ant-123" }, model: "claude-3-5-sonnet-latest" });
    await repo.upsertAdventure({ shortId, memoryBankEntries: seeded });
  });

  it("does NOT wipe a populated Memory Bank on an empty update", async () => {
    await listener({ kind: "adventureMemories", shortId, memories: [] });
    const adv = await repo.getAdventure(shortId);
    expect(adv?.memoryBankEntries).toHaveLength(2);
    expect(adv?.memoryBankEntries?.map((m: any) => m.text)).toEqual(seeded.map(m => m.text));
  });

  it("still persists a non-empty update (normal turn)", async () => {
    const grown = [...seeded, { actionIds: ["a3"], text: "You accepted the Zephyri's offer." }];
    await listener({ kind: "adventureMemories", shortId, memories: grown });
    const adv = await repo.getAdventure(shortId);
    expect(adv?.memoryBankEntries).toHaveLength(3);
    expect(adv?.memoryBankEntries?.[2]?.text).toBe("You accepted the Zephyri's offer.");
  });

  it("allows the first real population from an empty store", async () => {
    await repo.upsertAdventure({ shortId, memoryBankEntries: [] });
    await listener({ kind: "adventureMemories", shortId, memories: seeded });
    const adv = await repo.getAdventure(shortId);
    expect(adv?.memoryBankEntries).toHaveLength(2);
  });
});
