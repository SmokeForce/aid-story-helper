import { describe, it, expect, beforeEach, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";

// Mock browser global before importing background
(globalThis as any).browser = {
  storage: {
    session: {
      get: vi.fn().mockResolvedValue({
        aidToken: "Bearer token123",
        aidEndpoint: "https://api.aidungeon.com/graphql"
      }),
      set: vi.fn().mockResolvedValue(undefined),
    },
    local: {
      get: vi.fn().mockResolvedValue({
        aidToken: "Bearer token123",
        aidEndpoint: "https://api.aidungeon.com/graphql"
      }),
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
};

// Top-level fetch mock to prevent Vitest/ESM caching from bypassing mock
let fetchMockImpl = async (url: string, init?: any): Promise<any> => {
  return { ok: true, status: 200, json: async () => [{}] };
};
globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: any) => {
  return fetchMockImpl(url, init);
});

import { Repo } from "../src/storage/repo";
import { __resetDbForTests } from "../src/storage/db";

describe("Duplicate Name Baselines Seeding", () => {
  beforeEach(() => {
    (globalThis as any).indexedDB = new IDBFactory();
    __resetDbForTests();
    fetchMockImpl = async (url: string, init?: any) => {
      return { ok: true, status: 200, json: async () => [{}] };
    };
  });

  it("seeds both cards when cards share the same title/keys but have different types", async () => {
    // Dynamically import background to ensure the browser mock is defined first
    await import("../src/background/background");

    const repo = new Repo();
    const shortId = "adventure-abc";

    // Setup: 2 cards with same title "Tyler" but different types (character vs plans)
    await repo.putCards(shortId, [
      { shortId, id: "card-tyler-char", type: "character", title: "Tyler", keys: "Tyler", value: "[Role: student]" },
      { shortId, id: "card-tyler-plan", type: "plans", title: "Tyler", keys: "Tyler", value: "[Goal: get Alana back]" }
    ]);

    await repo.upsertAdventure({ shortId, title: "T", protagonistName: "Smoke" });

    // Retrieve the registered message listener
    const listener = (globalThis as any).browser.runtime.onMessage.addListener.mock.calls[0][0];
    
    // Send getState message to trigger seedBaselines under the hood
    await listener({ kind: "getState", shortId });

    // Verify both baseline versions exist
    const versions = await repo.getVersions(shortId);
    
    const charBaseline = versions.find(v => (v as any).cardId === "card-tyler-char");
    const planBaseline = versions.find(v => (v as any).cardId === "card-tyler-plan");

    expect(charBaseline).toBeDefined();
    expect(planBaseline).toBeDefined();
    expect(charBaseline?.cardType).toBe("character");
    expect(planBaseline?.cardType).toBe("plans");
    expect(versions).toHaveLength(2);
  });

  it("replaces {protagonist} case-insensitively with the protagonist name when applying off-meta instructions", async () => {
    // Dynamically import background to ensure the browser mock is defined first
    await import("../src/background/background");

    const repo = new Repo();
    const shortId = "adventure-abc";

    // Set protagonist name in settings/adventure
    await repo.upsertAdventure({ shortId, title: "T", protagonistName: "Smoke Brytefayme" });

    // Mock fetch for the GraphQL requests
    const fetchedCalls: any[] = [];
    fetchMockImpl = async (url: string, init?: any) => {
      fetchedCalls.push({ url, init });
      const rawBody = init?.body ? JSON.parse(init.body) : null;
      const body = Array.isArray(rawBody) ? rawBody[0] : rawBody;

      if (body?.operationName === "GetAdventureDetails") {
        return {
          ok: true,
          status: 200,
          json: async () => [{
            data: {
              adventure: {
                id: "adv-123",
                authorsNote: "Existing AN",
                memory: "Existing PE",
                thirdPerson: false,
                state: {
                  instructions: {
                    custom: "Existing AIN"
                  },
                  storySummary: "",
                  storyCardStoryInformation: "",
                  storyCardInstructions: ""
                }
              }
            }
          }]
        };
      }
      if (body?.operationName === "UpdateAdventureState" || body?.query?.includes("updateAdventureState")) {
        return {
          ok: true,
          status: 200,
          json: async () => [{
            data: {
              updateAdventureState: {
                success: true,
                adventure: {
                  id: "adv-123"
                }
              }
            }
          }]
        };
      }
      return { ok: true, status: 200, json: async () => [{}] };
    };

    const listener = (globalThis as any).browser.runtime.onMessage.addListener.mock.calls[0][0];

    // Apply off-meta instruction containing {protagonist}
    const res = await listener({
      kind: "applyOffMetaInstruction",
      shortId,
      text: "Never write dialog for {protagonist} or {PROTAGONIST}.",
      type: "ain",
      itemType: "instruction"
    });

    expect(res).toBeDefined();
    expect(res.ok).toBe(true);

    // Verify the query body has {protagonist} replaced with protagonist name
    const updateCall = fetchedCalls.find(c => {
      const rawBody = JSON.parse(c.init.body);
      const body = Array.isArray(rawBody) ? rawBody[0] : rawBody;
      return body.operationName === "UpdateAdventureState" || body.query?.includes("updateAdventureState");
    });
    expect(updateCall).toBeDefined();
    const updateBody = JSON.parse(updateCall.init.body)[0];
    expect(updateBody.variables.input.state.instructions.custom).toContain("Never write dialog for Smoke Brytefayme or Smoke Brytefayme.");
  });
});
