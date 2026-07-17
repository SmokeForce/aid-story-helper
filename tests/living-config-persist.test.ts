import { describe, it, expect, beforeEach, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";

// Mock the browser global before importing background (mirrors memoraid.test.ts).
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

// Regression: getState dropped `livingConfig` and `memoraidCharacters` in the public port, so the panel
// could never repopulate the Living Characters sim config (pairing pressure pools included) or the
// MemorAID roster on reload — the save persisted, but the read-back was missing ("isn't saving").
describe("getState returns per-adventure livingConfig + memoraidCharacters", () => {
  let repo: Repo;
  let listener: (msg: any) => any;
  const shortId = "lc-persist-01";

  beforeEach(async () => {
    (globalThis as any).indexedDB = new IDBFactory();
    __resetDbForTests();
    repo = new Repo();
    const bg = await import("../src/background/background");
    bg.__resetMemoraidStateForTests();
    listener = (browser.runtime.onMessage.addListener as any).mock.calls[0][0];
    await repo.setSettings({ provider: "claude", apiKeys: { claude: "sk-ant-123" } });
  });

  it("round-trips pairing pressure pools saved via setLivingConfig", async () => {
    const config = {
      roster: "Veya\nRomy",
      pressures: "friendship\nrivalry",
      pressurePairs: [{ a: "Veya", b: "Smoke", pressures: ["romance", "devotion"] }],
      maxActive: 2,
    };
    const saveRes = await listener({ kind: "setLivingConfig", shortId, config });
    expect(saveRes?.ok).toBe(true);

    const state: any = await listener({ kind: "getState", shortId });
    expect(state?.livingConfig).toBeDefined();
    expect(state.livingConfig.pressurePairs).toHaveLength(1);
    expect(state.livingConfig.pressurePairs[0]).toEqual({ a: "Veya", b: "Smoke", pressures: ["romance", "devotion"] });
    expect(state.livingConfig.roster).toBe("Veya\nRomy");
  });

  it("round-trips the MemorAID roster saved via setMemoraidCharacters", async () => {
    await listener({ kind: "setMemoraidCharacters", shortId, characters: ["Veya", "Romy"] });
    const state: any = await listener({ kind: "getState", shortId });
    expect(state?.memoraidCharacters).toEqual(["Veya", "Romy"]);
  });
});
