import { describe, it, expect, beforeEach, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";

// Mock the browser global before importing background. Session store provides auth so the
// UseAutoSaveStoryCard push path is exercised end-to-end.
(globalThis as any).browser = {
  storage: {
    session: {
      get: vi.fn().mockResolvedValue({ aidToken: "Bearer token123", aidEndpoint: "https://api.aidungeon.com/graphql" }),
      set: vi.fn().mockResolvedValue(undefined),
    },
    local: {
      get: vi.fn().mockResolvedValue({ aidToken: "Bearer token123", aidEndpoint: "https://api.aidungeon.com/graphql" }),
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

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as any;

// Dynamic import: background.ts touches `browser` at module load, so it must load AFTER the
// mock above (a static import would be hoisted above the mock assignment).
const { mergeTriggerKey } = await import("../src/background/background");

describe("mergeTriggerKey", () => {
  it("appends a new key with comma-space", () => {
    expect(mergeTriggerKey("Steve", "Pookie")).toBe("Steve, Pookie");
  });
  it("dedupes case-insensitively (no change)", () => {
    expect(mergeTriggerKey("Steve,Pookie", "pookie")).toBe("Steve,Pookie");
    expect(mergeTriggerKey("Steve", "steve")).toBe("Steve");
  });
  it("seeds from empty/whitespace keys", () => {
    expect(mergeTriggerKey("", "Pookie")).toBe("Pookie");
    expect(mergeTriggerKey("   ", "Pookie")).toBe("Pookie");
  });
  it("preserves existing separators and strips trailing ones", () => {
    expect(mergeTriggerKey("Steve; Bob", "Pookie")).toBe("Steve; Bob, Pookie");
    expect(mergeTriggerKey("Steve,", "Pookie")).toBe("Steve, Pookie");
  });
  it("ignores an empty noun", () => {
    expect(mergeTriggerKey("Steve", "   ")).toBe("Steve");
  });
});

describe("linkProperNounToCard handler", () => {
  let repo: Repo;
  let listener: any;
  const shortId = "adv-link";

  beforeEach(async () => {
    (globalThis as any).indexedDB = new IDBFactory();
    __resetDbForTests();
    repo = new Repo();
    fetchMock.mockReset();
    ((globalThis as any).browser.tabs.sendMessage as any).mockClear();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [{ data: { updateStoryCard: { success: true, storyCard: { id: "card-steve" } } } }],
    });

    const bg = await import("../src/background/background");
    void bg;
    listener = (globalThis as any).browser.runtime.onMessage.addListener.mock.calls[0][0];

    await repo.setSettings({ provider: "claude", apiKeys: { claude: "k" } } as any);
    await repo.putCards(shortId, [
      { shortId, id: "card-steve", type: "character", title: "Steve", keys: "Steve", value: "A guy." },
    ]);
    await repo.upsertAdventure({
      shortId,
      title: "T",
      locationSuggestions: [
        { properNoun: "Pookie", actionId: "12", actionText: "Hey Pookie!", timestamp: new Date().toISOString(), status: "pending" },
      ],
      properNounLogs: [],
    });
  });

  it("merges the key, pushes to AID, removes the suggestion, and writes a linked log", async () => {
    const res = await listener({ kind: "linkProperNounToCard", shortId, properNoun: "Pookie", cardId: "card-steve" });
    expect(res).toEqual({ ok: true });

    const bodies = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body)).flat();
    const save = bodies.find((b: any) => b.operationName === "UseAutoSaveStoryCard");
    expect(save).toBeTruthy();
    expect(save.variables.input.keys).toBe("Steve, Pookie");

    const cards = await repo.getCards(shortId);
    expect(cards.find((c) => c.id === "card-steve")!.keys).toBe("Steve, Pookie");

    // The approvedCardSync broadcast must carry the new + previous keys so the injected script
    // can protect an open card editor's stale autosave from reverting the trigger.
    const sync = ((globalThis as any).browser.tabs.sendMessage as any).mock.calls
      .map((c: any[]) => c[1])
      .find((m: any) => m?.kind === "approvedCardSync");
    expect(sync).toBeTruthy();
    expect(sync.payload.keys).toBe("Steve, Pookie");
    expect(sync.payload.prevKeys).toBe("Steve");

    const adv = await repo.getAdventure(shortId);
    expect((adv!.locationSuggestions || []).length).toBe(0);
    const log = (adv!.properNounLogs || []).find((l) => l.properNoun === "Pookie");
    expect(log).toBeTruthy();
    expect((log as any).linkedCardId).toBe("card-steve");
    expect((log as any).linkedCardTitle).toBe("Steve");
    expect(log!.isCharacter).toBe(true);
    expect(log!.isLocation).toBe(false);
  });

  it("leaves state untouched and errors when the AID push fails", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => [{}] });
    const res = await listener({ kind: "linkProperNounToCard", shortId, properNoun: "Pookie", cardId: "card-steve" });
    expect(res.error).toBeTruthy();

    const adv = await repo.getAdventure(shortId);
    expect((adv!.locationSuggestions || []).length).toBe(1); // suggestion still pending for retry
    const cards = await repo.getCards(shortId);
    expect(cards.find((c) => c.id === "card-steve")!.keys).toBe("Steve"); // key not added
  });

  it("retroactively links without a push when the noun is already a key", async () => {
    await repo.putCards(shortId, [
      { shortId, id: "card-steve", type: "character", title: "Steve", keys: "Steve, Pookie", value: "A guy." },
    ]);
    fetchMock.mockClear();

    const res = await listener({ kind: "linkProperNounToCard", shortId, properNoun: "Pookie", cardId: "card-steve" });
    expect(res).toEqual({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled(); // key already present → no server write

    const adv = await repo.getAdventure(shortId);
    const log = (adv!.properNounLogs || []).find((l) => l.properNoun === "Pookie");
    expect((log as any).linkedCardId).toBe("card-steve");
    expect((adv!.locationSuggestions || []).length).toBe(0);
  });

  it("errors when the target card does not exist", async () => {
    const res = await listener({ kind: "linkProperNounToCard", shortId, properNoun: "Pookie", cardId: "nope" });
    expect(res.error).toBeTruthy();
  });
});
