import { describe, it, expect, beforeEach, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";

// Mock the browser global before importing bg-crystallized (mirrors crystallized-settings-persist).
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

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as any;

// The four Crystallized distillation layers (Knows, Vivid, Outlook, Preferences) are produced together
// in ONE provider call on the public fork — the private engine split them into four calls only to dodge
// the native GQL output ceiling, which doesn't exist here. Each layer's flag (default on) drops it from
// the single call; a layer the model omits falls back to one targeted call. These tests pin that.
describe("Crystallized unified distillation call", () => {
  let repo: Repo;
  const shortId = "cryst-unified-01";

  // provider(callIndex) returns the anthropic reply text for that (0-based) provider call.
  function mockProvider(counter: { n: number }, provider: (i: number) => string) {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("api.anthropic.com")) {
        const text = provider(counter.n);
        counter.n++;
        return { ok: true, json: async () => ({ content: [{ type: "text", text }] }) } as any;
      }
      if (url.includes("/graphql")) return { ok: true, json: async () => [{ data: {
        saveQueueStoryCard: { success: true, storyCard: { id: "cryst-card-1" } },
        updateStoryCard: { success: true, storyCard: { id: "cryst-card-1" } },
        useAutoSaveStoryCard: { success: true, storyCard: { id: "cryst-card-1" } },
      } }] } as any;
      return { ok: true, json: async () => ({}) } as any;
    });
  }

  const KNOWS = "===KNOWS===\n### I. SCHEMA\n- [Smoke] The stranger who helped me; I feel safe with him.";
  const VIVID = "===VIVID===\n- Snapshot: Rena shared a secret with me, and I let her.";
  const OUTLOOK = "===OUTLOOK===\nBeliefs:\n- I don't have to perform to be safe.";
  const PREFS = "===PREFERENCES===\nPreferences:\n- I always order dessert even when full.";

  async function seed(settingsOverride: Record<string, unknown> = {}) {
    await repo.setSettings({
      provider: "claude",
      apiKeys: { claude: "sk-ant-123" },
      model: "claude-3-5-sonnet-latest",
      enableCrystallized: true,
      crystallizedInterval: 2, // K=2 → isWindowDue needs totalActions >= 2*K = 4
      ...settingsOverride,
    } as any);
    await repo.putActions(shortId, [
      { id: "1", text: "Rena smiled warmly at Smoke.", type: "do", createdAt: "2026-06-07T00:00:00Z" },
      { id: "2", text: "Rena shared a secret with him.", type: "continue", createdAt: "2026-06-07T00:00:01Z" },
      { id: "3", text: "Rena laughed at his joke.", type: "do", createdAt: "2026-06-07T00:00:02Z" },
      { id: "4", text: "Rena walked beside Smoke.", type: "continue", createdAt: "2026-06-07T00:00:03Z" },
    ]);
    await repo.putCards(shortId, [
      { id: "card-rena", shortId, type: "character", title: "Rena", keys: "Rena", value: "Rena is a friend." },
    ]);
    await repo.upsertAdventure({ shortId, title: "T", protagonistName: "Smoke", memoraidCharacters: ["Rena"] } as any);
  }

  beforeEach(async () => {
    (globalThis as any).indexedDB = new IDBFactory();
    __resetDbForTests();
    repo = new Repo();
    fetchMock.mockReset();
  });

  it("produces all four layers in a SINGLE provider call", async () => {
    const { checkCrystallizedUpdates } = await import("../src/background/bg-crystallized");
    await seed();
    const counter = { n: 0 };
    mockProvider(counter, () => [KNOWS, VIVID, OUTLOOK, PREFS].join("\n"));
    const updated = await checkCrystallizedUpdates(shortId);
    expect(updated).toContain("Rena");
    expect(counter.n).toBe(1); // ONE call, not four

    const state = await repo.getCrystallizedState(shortId, "rena");
    expect(state?.schema?.length ?? 0).toBeGreaterThan(0);
    expect(state?.nodes?.length ?? 0).toBeGreaterThan(0);
    expect(state?.outlook?.length ?? 0).toBeGreaterThan(0);
    expect(state?.preferences?.length ?? 0).toBeGreaterThan(0);
  });

  it("dropping Knows + Preferences leaves them out of the (still single) call", async () => {
    const { checkCrystallizedUpdates } = await import("../src/background/bg-crystallized");
    await seed({ crystallizedKnowsEnabled: false, crystallizedPreferencesEnabled: false });
    const counter = { n: 0 };
    // Model only emits the two requested layers.
    mockProvider(counter, () => [VIVID, OUTLOOK].join("\n"));
    await checkCrystallizedUpdates(shortId);
    expect(counter.n).toBe(1); // still one call, no fallback for disabled layers

    const state = await repo.getCrystallizedState(shortId, "rena");
    expect(state?.schema?.length ?? 0).toBe(0);
    expect(state?.preferences?.length ?? 0).toBe(0);
    expect(state?.nodes?.length ?? 0).toBeGreaterThan(0);
    expect(state?.outlook?.length ?? 0).toBeGreaterThan(0);
  });

  it("all layers off → 0 provider calls (pure decay window, no crash)", async () => {
    const { checkCrystallizedUpdates } = await import("../src/background/bg-crystallized");
    await seed({
      crystallizedKnowsEnabled: false,
      crystallizedNodesEnabled: false,
      crystallizedOutlookEnabled: false,
      crystallizedPreferencesEnabled: false,
    });
    const counter = { n: 0 };
    mockProvider(counter, () => "");
    await expect(checkCrystallizedUpdates(shortId)).resolves.toBeDefined();
    expect(counter.n).toBe(0);
  });

  it("a layer the unified reply DROPS falls back to one targeted call", async () => {
    const { checkCrystallizedUpdates } = await import("../src/background/bg-crystallized");
    await seed();
    const counter = { n: 0 };
    // First (unified) call omits OUTLOOK; the targeted fallback supplies it.
    mockProvider(counter, (i) => i === 0 ? [KNOWS, VIVID, PREFS].join("\n") : OUTLOOK);
    await checkCrystallizedUpdates(shortId);
    expect(counter.n).toBe(2); // 1 unified + 1 outlook fallback

    const state = await repo.getCrystallizedState(shortId, "rena");
    expect(state?.outlook?.length ?? 0).toBeGreaterThan(0);
  });
});
