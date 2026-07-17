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

// Now import target modules
import { Repo } from "../src/storage/repo";
import { __resetDbForTests } from "../src/storage/db";

const defaultFetchMockImpl = async (url: string, init?: any) => {
  if (url.includes("api.anthropic.com")) {
    return {
      ok: true,
      json: async () => ({
        content: [
          {
            type: "text",
            text: "[\n- Mock generated native memories: She sat on his lap. Impressive height, completely unfazed.\n]"
          }
        ]
      })
    } as unknown as Response;
  }

  const isGql = url.includes("/graphql");
  const body = init && init.body ? JSON.parse(init.body) : null;

  if (isGql && body) {
    const batch = Array.isArray(body) ? body : [body];
    const results = batch.map((item: any) => {
      if (item.operationName === "SaveQueueStoryCard") {
        return {
          data: {
            updateStoryCard: {
              success: true,
              message: "Created card",
              storyCard: {
                id: "111222333",
                type: item.variables.input.type,
                title: item.variables.input.title,
                keys: item.variables.input.keys,
                value: item.variables.input.value,
                description: item.variables.input.description,
                useForCharacterCreation: false,
                updatedAt: new Date().toISOString(),
                __typename: "StoryCard"
              },
              __typename: "StoryCardMutationResponse"
            }
          }
        };
      }
      if (item.operationName === "UseAutoSaveStoryCard") {
        return {
          data: {
            updateStoryCard: {
              success: true,
              message: "Updated card",
              storyCard: {
                id: item.variables.input.id,
                type: item.variables.input.type,
                title: item.variables.input.title,
                keys: item.variables.input.keys,
                value: item.variables.input.value,
                description: item.variables.input.description,
                useForCharacterCreation: false,
                updatedAt: new Date().toISOString(),
                __typename: "StoryCard"
              },
              __typename: "StoryCardMutationResponse"
            }
          }
        };
      }
      if (item.operationName === "GenerateStoryCard") {
        return {
          data: {
            generateStoryCard: {
              success: true,
              message: "Generated card",
              storyCard: {
                id: item.variables.input.id,
                value: "[\n- Mock generated native memories: She sat on his lap. Impressive height, completely unfazed.\n]"
              }
            }
          }
        };
      }
      return { data: {} };
    });
    return {
      ok: true,
      json: async () => results,
    } as unknown as Response;
  }

  return { ok: true, json: async () => ({}) } as unknown as Response;
};

const fetchMock = vi.fn().mockImplementation(defaultFetchMockImpl);

globalThis.fetch = fetchMock;

describe("MemorAID NPC Memory Cards", () => {
  let repo: Repo;
  let checkMemorAIDUpdates: any;
  let checkLookbackAutoUpdates: any;
  const shortId = "6y1tn2Vj-QMD";

  beforeEach(async () => {
    (globalThis as any).indexedDB = new IDBFactory();
    __resetDbForTests();
    repo = new Repo();
    fetchMock.mockImplementation(defaultFetchMockImpl);
    fetchMock.mockClear();
    (browser.tabs.query as any).mockResolvedValue([{ id: 1 }]);
    (browser.tabs.sendMessage as any).mockClear();

    // Dynamically import background to ensure the browser mock is defined first
    const bg = await import("../src/background/background");
    bg.__resetMemoraidStateForTests();
    checkMemorAIDUpdates = bg.checkMemorAIDUpdates;
    checkLookbackAutoUpdates = bg.checkLookbackAutoUpdates;

    // Setup Settings
    await repo.setSettings({
      provider: "claude",
      apiKeys: { claude: "sk-ant-123" },
      model: "claude-3-5-sonnet-latest"
    });
  });

  it("automatically generates and creates a memory card if triggered and absent", async () => {
    // 1. Setup character card and Configure MemorAID card
    // Use realistic title ("Princess Anna Ormecia") with trigger keys — tests key-based matching
    await repo.putCards(shortId, [
      {
        shortId,
        id: "char-anna",
        type: "character",
        title: "Princess Anna Ormecia",
        keys: "Anna, Princess",
        value: "Princess Anna Ormecia. Rose-gold hair, violet eyes."
      },
      {
        shortId,
        id: "config-memoraid",
        type: "custom",
        title: "Configure MemorAID",
        keys: "configure memoraid",
        value: "List important characters here to enable thought tracking.",
        description: "IMPORTANT_CHARACTERS: Anna"
      }
    ]);

    // 2. Setup actions (last action triggers Anna)
    await repo.putActions(shortId, [
      {
        id: "action-1",
        type: "continue",
        text: "Anna walked straight toward your row and asked if the seat was taken.",
        createdAt: "2026-06-06T08:00:00Z"
      }
    ]);

    // 3. Run check
    await checkMemorAIDUpdates(shortId);

    // 4. Verify fetch called Claude API and GQL mutations
    const calls = fetchMock.mock.calls;
    expect(calls.some(c => c[0].includes("api.anthropic.com"))).toBe(true);
    // Verify SaveQueueStoryCard (create) and UseAutoSaveStoryCard (save) were called
    const gqlCalls = calls.filter(c => c[0].includes("/graphql"));
    const gqlBodies = gqlCalls.map(c => JSON.parse(c[1].body)).flat();
    expect(gqlBodies.some((b: any) => b.operationName === "SaveQueueStoryCard")).toBe(true);
    expect(gqlBodies.some((b: any) => b.operationName === "UseAutoSaveStoryCard")).toBe(true);
    expect(gqlBodies.some((b: any) => b.operationName === "GenerateStoryCard")).toBe(false);

    // Verify card was created locally in the DB
    const dbCards = await repo.getCards(shortId);
    const memCard = dbCards.find(c => c.title === "Princess Anna Ormecia (Memory)");
    expect(memCard).toBeDefined();
    expect(memCard?.id).toBe("111222333");
    expect(memCard?.keys).toBe("Anna, Princess");
    expect(memCard?.value).toContain("She sat on his lap");

    // Verify UI sync was broadcasted
    expect(browser.tabs.sendMessage).toHaveBeenCalled();
  });

  it("automatically generates and updates an existing memory card, archiving old memories to description", async () => {
    // 1. Setup character card, existing memory card, and Configure MemorAID card
    await repo.putCards(shortId, [
      {
        shortId,
        id: "char-anna",
        type: "character",
        title: "Anna",
        keys: "anna",
        value: "Princess Anna Ormecia. Rose-gold hair, violet eyes."
      },
      {
        shortId,
        id: "111222333",
        type: "memory",
        title: "Anna (Memory)",
        keys: "anna, anna's memory",
        value: "Old memories: She sat on his lap.",
        description: "Older notes"
      },
      {
        shortId,
        id: "config-memoraid",
        type: "custom",
        title: "Configure MemorAID",
        keys: "configure memoraid",
        value: "List important characters here to enable thought tracking.",
        description: "IMPORTANT_CHARACTERS: Anna"
      }
    ]);

    // 2. Setup actions
    await repo.putActions(shortId, [
      {
        id: "action-1",
        type: "continue",
        text: "Anna walked straight toward your row and asked if the seat was taken.",
        createdAt: "2026-06-06T08:00:00Z"
      }
    ]);

    // 3. Run check
    await checkMemorAIDUpdates(shortId);

    // 4. Verify fetch called Claude API and GQL mutations
    const calls = fetchMock.mock.calls;
    expect(calls.some(c => c[0].includes("api.anthropic.com"))).toBe(true);
    
    // Find all GQL operations
    const gqlCalls = calls.filter(c => c[0].includes("/graphql"));
    const gqlBodies = gqlCalls.map(c => JSON.parse(c[1].body)).flat();
    expect(gqlBodies.some((b: any) => b.operationName === "GenerateStoryCard")).toBe(false);
    expect(gqlBodies.some((b: any) => b.operationName === "UseAutoSaveStoryCard")).toBe(true);
    // Verify the save targets the existing memory card and logs the new thought into the turn-tagged
    // THOUGHT LOG (the thought itself carries the model-synthesized cause).
    const saveOp = gqlBodies.find((b: any) => b.operationName === "UseAutoSaveStoryCard");
    expect(saveOp.variables.input.id).toBe("111222333");
    expect(saveOp.variables.input.description).toContain("[THOUGHT LOG]");
    expect(saveOp.variables.input.description).toMatch(/\(turn \d+\)/);
    expect(saveOp.variables.input.description).toContain("Mock generated native memories");

    // Verify updated locally
    const dbCards = await repo.getCards(shortId);
    const memCard = dbCards.find(c => c.title === "Anna (Memory)");
    expect(memCard?.value).toContain("Mock generated native memories: She sat on his lap. Impressive height, completely unfazed.");
    expect(memCard?.description).toContain("[THOUGHT LOG]");
    expect(memCard?.description).toContain("Mock generated native memories");

    // Verify UI sync was broadcasted
    expect(browser.tabs.sendMessage).toHaveBeenCalled();
  });

  it("does nothing if character is not triggered in the latest action", async () => {
    // 1. Setup character card and Configure MemorAID card
    await repo.putCards(shortId, [
      {
        shortId,
        id: "char-anna",
        type: "character",
        title: "Anna",
        keys: "anna",
        value: "Princess Anna. Rose-gold hair, violet eyes."
      },
      {
        shortId,
        id: "config-memoraid",
        type: "custom",
        title: "Configure MemorAID",
        keys: "configure memoraid",
        value: "List important characters here to enable thought tracking.",
        description: "IMPORTANT_CHARACTERS: Anna"
      }
    ]);

    // 2. Setup actions (last action does NOT mention Anna)
    await repo.putActions(shortId, [
      {
        id: "action-1",
        type: "continue",
        text: "You sit alone in the empty lecture hall and open your notebook.",
        createdAt: "2026-06-06T08:00:00Z"
      }
    ]);

    // 3. Run check
    await checkMemorAIDUpdates(shortId);

    // 4. Verify no generation or creation calls
    expect(fetchMock).not.toHaveBeenCalled();
    const dbCards = await repo.getCards(shortId);
    const memCard = dbCards.find(c => c.title === "Anna (Memory)");
    expect(memCard).toBeUndefined();
  });

  it("does nothing if Configure MemorAID card is absent", async () => {
    // 1. Setup character card only, NO config card
    await repo.putCards(shortId, [
      {
        shortId,
        id: "char-anna",
        type: "character",
        title: "Anna",
        keys: "anna",
        value: "Princess Anna. Rose-gold hair, violet eyes."
      }
    ]);

    // 2. Setup actions (Anna is triggered)
    await repo.putActions(shortId, [
      {
        id: "action-1",
        type: "continue",
        text: "Anna walked straight toward your row and asked if the seat was taken.",
        createdAt: "2026-06-06T08:00:00Z"
      }
    ]);

    // 3. Run check
    await checkMemorAIDUpdates(shortId);

    // 4. Verify no generation/creation calls since config card is missing
    expect(fetchMock).not.toHaveBeenCalled();
    const dbCards = await repo.getCards(shortId);
    const memCard = dbCards.find(c => c.title === "Anna (Memory)");
    expect(memCard).toBeUndefined();
  });

  it("does nothing if character is triggered but NOT in the IMPORTANT_CHARACTERS list", async () => {
    // 1. Setup character card and Configure MemorAID card listing only 'Bob'
    await repo.putCards(shortId, [
      {
        shortId,
        id: "char-anna",
        type: "character",
        title: "Anna",
        keys: "anna",
        value: "Princess Anna. Rose-gold hair, violet eyes."
      },
      {
        shortId,
        id: "config-memoraid",
        type: "custom",
        title: "Configure MemorAID",
        keys: "configure memoraid",
        value: "List important characters here to enable thought tracking.",
        description: "IMPORTANT_CHARACTERS: Bob"
      }
    ]);

    // 2. Setup actions (Anna is triggered)
    await repo.putActions(shortId, [
      {
        id: "action-1",
        type: "continue",
        text: "Anna walked straight toward your row and asked if the seat was taken.",
        createdAt: "2026-06-06T08:00:00Z"
      }
    ]);

    // 3. Run check
    await checkMemorAIDUpdates(shortId);

    // 4. Verify no generation/creation calls since Anna is not in config list
    expect(fetchMock).not.toHaveBeenCalled();
    const dbCards = await repo.getCards(shortId);
    const memCard = dbCards.find(c => c.title === "Anna (Memory)");
    expect(memCard).toBeUndefined();
  });

  it("generates memories using pendingActionText context and returns triggered character names", async () => {
    // 1. Setup character card and Configure MemorAID card listing Anna
    await repo.putCards(shortId, [
      {
        shortId,
        id: "char-anna",
        type: "character",
        title: "Anna",
        keys: "anna",
        value: "Princess Anna. Rose-gold hair, violet eyes."
      },
      {
        shortId,
        id: "config-memoraid",
        type: "custom",
        title: "Configure MemorAID",
        keys: "configure memoraid",
        value: "List important characters here to enable thought tracking.",
        description: "IMPORTANT_CHARACTERS: Anna"
      }
    ]);

    // 2. Setup actions (empty initially)
    await repo.putActions(shortId, []);

    // 3. Run check with pendingActionText triggering Anna
    const updated = await checkMemorAIDUpdates(shortId, "Anna walked straight toward your row.");

    // 4. Verify updatedNames and DB storage
    expect(updated).toEqual(["Anna"]);
    expect(fetchMock).toHaveBeenCalled();

    const dbCards = await repo.getCards(shortId);
    const memCard = dbCards.find(c => c.title === "Anna (Memory)");
    expect(memCard).toBeDefined();
    expect(memCard?.value).toContain("Anna's Thoughts (newest to oldest):");

    // 5. Run check again with same pending text, should skip (duplicate check)
    fetchMock.mockClear();
    const updatedSecond = await checkMemorAIDUpdates(shortId, "Anna walked straight toward your row.");
    expect(updatedSecond).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("handles retry and continue updates properly", async () => {
    // 1. Setup character card and Configure MemorAID card listing Anna
    await repo.putCards(shortId, [
      {
        shortId,
        id: "char-anna",
        type: "character",
        title: "Anna",
        keys: "anna",
        value: "Princess Anna. Rose-gold hair, violet eyes."
      },
      {
        shortId,
        id: "config-memoraid",
        type: "custom",
        title: "Configure MemorAID",
        keys: "configure memoraid",
        value: "List important characters here to enable thought tracking.",
        description: "IMPORTANT_CHARACTERS: Anna"
      }
    ]);

    // 2. Setup actions
    await repo.putActions(shortId, [
      {
        id: "action-1",
        text: "Anna walked straight toward your row.",
        type: "story",
        createdAt: new Date().toISOString()
      } as any
    ]);

    // 3. First invocation generates a thought for the current turn.
    fetchMock.mockClear();
    const updated = await checkMemorAIDUpdates(shortId);
    expect(updated).toEqual(["Anna"]);
    expect(fetchMock).toHaveBeenCalled();

    // 4. Private model: an immediate re-invocation for the SAME turn/scene is deduped — the per-turn
    // thought already exists and the scene-novelty gate sees no change — so nothing regenerates.
    fetchMock.mockClear();
    const updatedAgain = await checkMemorAIDUpdates(shortId);
    expect(updatedAgain).toEqual([]);

    // 5. A genuinely new beat (fresh pending action) is novel, so it generates again.
    fetchMock.mockClear();
    const updatedNext = await checkMemorAIDUpdates(shortId, "Anna leans in close and whispers your name.");
    expect(updatedNext).toEqual(["Anna"]);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("uses the last player action as the latest action during a retry in checkMemorAIDUpdates", async () => {
    // 1. Setup character card and Configure MemorAID card listing Anna
    await repo.putCards(shortId, [
      {
        shortId,
        id: "char-anna",
        type: "character",
        title: "Anna",
        keys: "anna",
        value: "Princess Anna."
      },
      {
        shortId,
        id: "config-memoraid",
        type: "custom",
        title: "Configure MemorAID",
        keys: "configure memoraid",
        value: "List important characters here to enable thought tracking.",
        description: "IMPORTANT_CHARACTERS: Anna"
      }
    ]);

    // 2. Setup actions: Player Action followed by AI Output
    const playerActionTime = new Date(Date.now() - 10000).toISOString();
    const aiOutputTime = new Date().toISOString();
    await repo.putActions(shortId, [
      {
        id: "action-player",
        text: "You wave at Anna and call her name.",
        type: "say",
        createdAt: playerActionTime
      } as any,
      {
        id: "action-ai",
        text: "Anna turns around and smiles at you.",
        type: "see",
        createdAt: aiOutputTime
      } as any
    ]);

    // Mock provider to capture the user prompt sent to it
    let capturedUserPrompt = "";
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes("api.anthropic.com")) {
        const bodyObj = JSON.parse(init.body);
        capturedUserPrompt = bodyObj.messages[0].content;
        return {
          ok: true,
          json: async () => ({
            content: [{ type: "text", text: "[\n- Intake: She hears me call her.\n- Thought: I should acknowledge him.\n- Action: I will walk over to him.\n]" }]
          })
        } as unknown as Response;
      }
      return defaultFetchMockImpl(url, init);
    });

    // 3. Trigger retry
    const updated = await checkMemorAIDUpdates(shortId);
    expect(updated).toEqual(["Anna"]);

    // 4. The generation prompt injects the current-scene lookback window, so it contains the recent
    // player action the character reacts to. (Private's model injects the whole window; it has no
    // retry-flag to exclude the last AI output the way public's did.)
    expect(capturedUserPrompt).toContain("You wave at Anna");
  });

  it("supports Promise return for runtime messaging in Firefox and callback/return-true in Chrome", async () => {
    const bg = await import("../src/background/background");
    const listener = (globalThis as any).browser.runtime.onMessage.addListener.mock.calls[0][0];

    // Mock navigator.userAgent for Firefox
    const originalNavigator = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", {
      value: { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0" },
      writable: true,
      configurable: true
    });

    // When running under Firefox, listener returns a Promise
    const pResult = listener({ kind: "respondToProperNounSuggestion", shortId, properNoun: "Test", accept: true, type: "character" }, {}, undefined);
    expect(pResult instanceof Promise).toBe(true);
    await pResult;

    // Restore or change navigator.userAgent for Chrome
    Object.defineProperty(globalThis, "navigator", {
      value: { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0" },
      writable: true,
      configurable: true
    });

    // When running under Chrome, listener calls sendResponse and returns true
    const sendResponseMock = vi.fn();
    const cResult = listener({ kind: "respondToProperNounSuggestion", shortId, properNoun: "Test", accept: true, type: "character" }, {}, sendResponseMock);
    expect(cResult).toBe(true);
    
    // Wait for async task to run
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(sendResponseMock).toHaveBeenCalled();

    // Clean up
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      writable: true,
      configurable: true
    });
  });

  it("generates a Core Character card in ONE folded provider call using the new field schema (no Psychology/Worldview/Dynamic)", async () => {
    const bg = await import("../src/background/background");

    // Setup character card (no established Appearance → phenotype rewrite path uses the generated one).
    await repo.putCards(shortId, [
      {
        shortId,
        id: "char-anna",
        type: "character",
        title: "Anna",
        keys: "anna",
        value: "Initial Value"
      }
    ]);
    await repo.upsertAdventure({ shortId, protagonistName: "Smoke" });

    // The folded CORE_CARD_TEMPLATE call returns Appearance + Scent + the four behavioral fields at once.
    fetchMock.mockClear();
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("api.anthropic.com")) {
        return {
          ok: true,
          json: async () => ({
            content: [{ type: "text", text:
              "Appearance: Tall and striking with long dark hair and cool green eyes.\n" +
              "Scent: jasmine & smoke\n" +
              "Background: Raised in a house that prized appearances over warmth.\n" +
              "Personality: Proud and self-possessed, warm only with the few who earn it.\n" +
              "Conversational Style: Speaks in measured, deliberate sentences.\n" +
              "Voice: Low and cool, with a clipped precision.\n" +
              "Drive: To be respected on her own terms."
            }]
          })
        } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    });

    const listener = (globalThis as any).browser.runtime.onMessage.addListener.mock.calls[0][0];
    const result = await listener({ kind: "generateCard", shortId, cardId: "char-anna" });
    expect(result).not.toHaveProperty("error");

    // Single folded provider call (the private two-pass collapses for BYO providers — no ~900-char cap).
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const entry = (result as any).entry;
    expect(entry).toContain("Name: Anna");
    expect(entry).toContain("Appearance: Tall and striking");
    expect(entry).toContain("Personality: Proud and self-possessed");
    expect(entry).toContain("Conversational Style: Speaks in measured");
    expect(entry).toContain("Voice: Low and cool");
    expect(entry).toContain("Drive: To be respected on her own terms.");
    // The retired multi-pass schema must be gone (this is the regression the wiring fix addresses).
    expect(entry).not.toMatch(/Psychology:/);
    expect(entry).not.toMatch(/Worldview:/);
    expect(entry).not.toMatch(/Dynamic \(/);
    expect(entry.startsWith("[")).toBe(true);
    expect(entry.endsWith("]")).toBe(true);
  });

  // --- Body re-roll (phenotype-reroll-and-roster-dedup spec §A.6), ported from the private exploit
  //     harness to the public provider mock. ---
  it("re-rolls a character's body: regenerates Appearance + Scent, splices the new key-pair, carries behavioral verbatim (one gen call)", async () => {
    await import("../src/background/background");
    await repo.upsertAdventure({ shortId, title: "T", protagonistName: "Smoke" });
    await repo.putCards(shortId, [{
      shortId, id: "card-rr", type: "character", title: "Monsieur Vallois", keys: "Vallois",
      value: "[\nName: Monsieur Vallois\nAppearance: A short man at 5'3\".\nSWH: 44-33-38\nQuirks: Right-handed\nScent: old iron\nBackground: Born to a dynasty.\nPersonality: A cold strategist.\nVoice: Clipped.\nDrive: Preserve the legacy.\n]",
    }]);
    await repo.putPhenotype({
      shortId, characterKey: "monsieur vallois", provenance: "sampled", gender: "male", population: "western",
      seed: 1, cues: [], archetype: { shape: "V-Taper", scale: "Average" },
      measurements: { heightInches: 63, shoulders: 44, waist: 33, hip: 38 },
      descriptorPhrase: "short, a strong V-taper", keyPair: "SWH: 44-33-38", quirks: ["Right-handed"],
      sampledAt: new Date().toISOString(),
    } as any);

    let genCalls = 0;
    fetchMock.mockClear();
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("api.anthropic.com")) {
        genCalls++;
        return { ok: true, json: async () => ({ content: [{ type: "text", text: "Appearance: A newly-drawn frame.\nScent: cedar & rain" }] }) } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    });

    const listener = (globalThis as any).browser.runtime.onMessage.addListener.mock.calls[0][0];
    const res: any = await listener({ kind: "rerollAppearance", shortId, cardId: "card-rr" });
    expect(res?.error).toBeUndefined();
    expect(genCalls).toBe(1); // pass 1 only

    const pending = (await repo.getVersions(shortId)).find((v) => v.status === "pending" && v.cardId === "card-rr");
    expect(pending).toBeDefined();
    const entry = pending!.entry;
    expect(entry).toContain("Appearance: A newly-drawn frame."); // re-rolled appearance
    expect(entry).toContain("Scent: cedar & rain");              // re-rolled scent
    expect(entry).toContain("Personality: A cold strategist.");  // behavioral carried verbatim
    expect(entry).toContain("Drive: Preserve the legacy.");
    expect(entry).toMatch(/SWH: \d{1,2}-\d{1,2}-\d{1,2}/);       // a (re-rolled) male key-pair present
    expect(entry).not.toMatch(/BWH:/);
    const rec = await repo.getPhenotype(shortId, "monsieur vallois");
    expect(rec?.reroll).toBe(1);                                 // reroll counter advanced
  });

  it("re-roll returns an error when the character has no persisted body, and creates no version", async () => {
    await import("../src/background/background");
    await repo.upsertAdventure({ shortId, title: "T", protagonistName: "Smoke" });
    await repo.putCards(shortId, [{ shortId, id: "card-none", type: "character", title: "Nobody", keys: "Nobody", value: "[\nName: Nobody\n]" }]);
    const listener = (globalThis as any).browser.runtime.onMessage.addListener.mock.calls[0][0];
    const res: any = await listener({ kind: "rerollAppearance", shortId, cardId: "card-none" });
    expect(res?.error).toMatch(/no sampled body/i);
    expect((await repo.getVersions(shortId)).some((v) => v.cardId === "card-none")).toBe(false);
  });

  it("rejecting a body re-roll restores the prior phenotype record (no divergence)", async () => {
    await import("../src/background/background");
    await repo.upsertAdventure({ shortId, title: "T", protagonistName: "Smoke" });
    await repo.putCards(shortId, [{
      shortId, id: "card-rrx", type: "character", title: "Monsieur Vallois", keys: "Vallois",
      value: "[\nName: Monsieur Vallois\nAppearance: A short man.\nSWH: 44-33-38\nBackground: b.\nPersonality: p.\nVoice: v.\nDrive: d.\n]",
    }]);
    await repo.putPhenotype({
      shortId, characterKey: "monsieur vallois", provenance: "sampled", gender: "male", population: "western",
      seed: 1, reroll: 0, cues: [], archetype: { shape: "V-Taper", scale: "Average" },
      measurements: { heightInches: 63, shoulders: 44, waist: 33, hip: 38 },
      descriptorPhrase: "short, a strong V-taper", keyPair: "SWH: 44-33-38", quirks: ["Right-handed"],
      sampledAt: new Date().toISOString(),
    } as any);
    fetchMock.mockClear();
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("api.anthropic.com")) return { ok: true, json: async () => ({ content: [{ type: "text", text: "Appearance: A new frame.\nScent: cedar & rain" }] }) } as any;
      return { ok: true, json: async () => ({}) } as any;
    });
    const listener = (globalThis as any).browser.runtime.onMessage.addListener.mock.calls[0][0];
    await listener({ kind: "rerollAppearance", shortId, cardId: "card-rrx" });

    const afterReroll = await repo.getPhenotype(shortId, "monsieur vallois");
    expect(afterReroll?.reroll).toBe(1);
    const pending = (await repo.getVersions(shortId)).find((v) => v.status === "pending" && v.cardId === "card-rrx");
    expect((pending as any)?.phenotypeRollback?.reroll).toBe(0);

    await listener({ kind: "setVersionStatus", id: pending!.id, status: "rejected" });
    const restored = await repo.getPhenotype(shortId, "monsieur vallois");
    expect(restored?.reroll).toBe(0);
    expect(restored?.keyPair).toBe("SWH: 44-33-38");
  });

  // --- Outlook consolidation on manual Core generation (scene-aware-crystallized §7), ported to the
  //     public provider mock. ---
  it("Core generation injects the Crystallized Outlook + Knows grounding into the prompt", async () => {
    await import("../src/background/background");
    await repo.upsertAdventure({ shortId, title: "T", protagonistName: "Smoke" });
    const renderedValue =
      `[Veya's Crystallized Memory\nKnows:\n{"Fact 0": "Veya remembers a long grounding fact."}\n` +
      `Vivid Memories:\n{Veya once stood alone in the rain and chose to stay.}\n` +
      `Outlook:\n{I no longer perform for safety.}\n]`;
    await repo.putCards(shortId, [
      { shortId, id: "card-veya", type: "character", title: "Veya", keys: "Veya", value: "[\nName: Veya\nAppearance: Tall, sharp-eyed.\nPersonality: Guarded.\n]" },
      { shortId, id: "card-veya-cryst", type: "custom", title: "Veya - Crystallized", keys: "Veya", value: renderedValue, description: "" },
    ]);
    await repo.putCrystallizedState(shortId, "veya", {
      schema: [], nodes: [], unreferencedPasses: {},
      outlook: [{ text: "I no longer perform for safety.", strength: 3 }, { text: "Autonomy is the real wealth.", strength: 3 }],
    } as any);

    let captured = "";
    fetchMock.mockClear();
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes("api.anthropic.com")) {
        const body = init?.body ? JSON.parse(init.body) : {};
        const sys = Array.isArray(body.system) ? body.system.map((s: any) => s?.text || "").join("\n") : String(body.system || "");
        const msgs = (body.messages || []).map((m: any) => Array.isArray(m.content) ? m.content.map((c: any) => c?.text || "").join("\n") : String(m.content || "")).join("\n");
        captured = `${sys}\n${msgs}`;
        return { ok: true, json: async () => ({ content: [{ type: "text", text: "Background: B.\nPersonality: P.\nVoice: V.\nDrive: D." }] }) } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    });

    const listener = (globalThis as any).browser.runtime.onMessage.addListener.mock.calls[0][0];
    const res: any = await listener({ kind: "generateCard", shortId, cardId: "card-veya" });
    expect(res?.error).toBeUndefined();
    expect(captured).toContain("I no longer perform for safety."); // Outlook reached the prompt
    expect(captured).toContain("Autonomy is the real wealth.");
    expect(captured).toContain("Fact 0");                          // Knows grounding reached the prompt
  });

  it("Core generation with no Crystallized state omits the Outlook block but keeps Knows grounding", async () => {
    await import("../src/background/background");
    await repo.upsertAdventure({ shortId, title: "T", protagonistName: "Smoke" });
    await repo.putCards(shortId, [
      { shortId, id: "card-nadia", type: "character", title: "Nadia", keys: "Nadia", value: "[\nName: Nadia\nAppearance: Short.\nPersonality: Sharp.\n]" },
      { shortId, id: "card-nadia-cryst", type: "custom", title: "Nadia - Crystallized", keys: "Nadia", value: "[Nadia's Crystallized Memory\nKnows:\n{\"Farm\": \"Nadia grew up on a farm.\"}\n]", description: "" },
    ]);
    // Deliberately no putCrystallizedState — no IndexedDB row for this character.
    let captured = "";
    fetchMock.mockClear();
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes("api.anthropic.com")) {
        const body = init?.body ? JSON.parse(init.body) : {};
        captured = (body.messages || []).map((m: any) => Array.isArray(m.content) ? m.content.map((c: any) => c?.text || "").join("\n") : String(m.content || "")).join("\n");
        return { ok: true, json: async () => ({ content: [{ type: "text", text: "Background: B.\nPersonality: P.\nVoice: V.\nDrive: D." }] }) } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    });
    const listener = (globalThis as any).browser.runtime.onMessage.addListener.mock.calls[0][0];
    const res: any = await listener({ kind: "generateCard", shortId, cardId: "card-nadia" });
    expect(res?.error).toBeUndefined();
    expect(captured).not.toContain("Current self-beliefs"); // no Outlook (no state)
    expect(captured).toContain("Nadia grew up on a farm.");  // Knows grounding present
  });

  it("Core generation consolidates Outlook for a tracked Crystallize character: clears + archives (reason incorporated)", async () => {
    await import("../src/background/background");
    await repo.setSettings({ provider: "claude", apiKeys: { claude: "sk-ant-123" }, enableCrystallized: true });
    await repo.upsertAdventure({ shortId, title: "T", protagonistName: "Smoke", memoraidCharacters: ["Veya"] });
    await repo.putCards(shortId, [
      { shortId, id: "card-veya", type: "character", title: "Veya", keys: "Veya", value: "[\nName: Veya\nAppearance: Tall.\nPersonality: Guarded.\n]" },
    ]);
    await repo.putCrystallizedState(shortId, "veya", {
      schema: [], nodes: [], unreferencedPasses: {},
      outlook: [{ text: "I no longer perform for safety.", strength: 3 }, { text: "Autonomy is the real wealth.", strength: 3 }],
    } as any);

    fetchMock.mockClear();
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("api.anthropic.com")) return { ok: true, json: async () => ({ content: [{ type: "text", text: "Background: B.\nPersonality: P.\nVoice: V.\nDrive: D." }] }) } as any;
      return { ok: true, json: async () => ({}) } as any;
    });

    const listener = (globalThis as any).browser.runtime.onMessage.addListener.mock.calls[0][0];
    const res: any = await listener({ kind: "generateCard", shortId, cardId: "card-veya" });
    expect(res?.error).toBeUndefined();

    const state = await repo.getCrystallizedState(shortId, "veya");
    expect(state?.outlook?.length ?? 0).toBe(0); // beliefs cleared after incorporation
    const archive = await repo.getCrystallizedArchive(shortId);
    const incorporated = archive.filter((a: any) => a.reason === "incorporated" && a.kind === "outlook");
    expect(incorporated.length).toBe(2); // both beliefs archived, recoverable
  });

  it("respects custom memoraidLookback and memoraidPresenceLookback settings", async () => {
    // 1. Set custom settings
    await repo.setSettings({
      provider: "claude",
      apiKeys: { claude: "sk-ant-123" },
      memoraidLookback: 2,
      memoraidPresenceLookback: 2
    });

    // 2. Put Configure MemorAID card
    await repo.putCards(shortId, [
      {
        shortId,
        id: "config-card",
        type: "custom",
        title: "Configure MemorAID",
        keys: "configure memoraid",
        value: "active",
        description: "IMPORTANT_CHARACTERS: Anna"
      },
      {
        shortId,
        id: "char-anna",
        type: "character",
        title: "Anna",
        keys: "anna",
        value: "Initial Value"
      }
    ]);

    // 3. Put 3 actions in history:
    // Turn 1: Anna is here (3 turns ago)
    // Turn 2: Player walks outside (2 turns ago)
    // Turn 3: Player opens the book (1 turn ago)
    await repo.putActions(shortId, [
      { id: "act1", text: "Anna smiled.", type: "story", createdAt: "2026-06-07T12:00:00Z" },
      { id: "act2", text: "You walked outside.", type: "do", createdAt: "2026-06-07T12:01:00Z" },
      { id: "act3", text: "You opened the book.", type: "do", createdAt: "2026-06-07T12:02:00Z" }
    ]);

    // Learn necessary GQL ops to avoid errors if triggered
    await repo.putOp({
      operationName: "GenerateStoryCard",
      query: "mutation GenerateStoryCard { ... }",
      variableKeys: [],
      kind: "write",
      learnedAt: new Date().toISOString()
    });
    await repo.putOp({
      operationName: "SaveQueueStoryCard",
      query: "mutation SaveQueueStoryCard { ... }",
      variableKeys: [],
      kind: "write",
      learnedAt: new Date().toISOString()
    });

    fetchMock.mockClear();

    // Run checkMemorAIDUpdates. With presence lookback = 2, Anna is NOT in the last 2 actions,
    // so she should not trigger.
    let updated = await checkMemorAIDUpdates(shortId);
    expect(updated).toEqual([]);

    // Now, change memoraidPresenceLookback to 3, so Anna (in act1, 3 actions ago) IS triggered!
    (await import("../src/background/background")).__resetMemoraidStateForTests();
    await repo.setSettings({
      provider: "claude",
      apiKeys: { claude: "sk-ant-123" },
      memoraidPresenceLookback: 3
    });

    updated = await checkMemorAIDUpdates(shortId);
    expect(updated).toContain("Anna");

    // Private model uses ONE lookback window for both presence and generation context (the removed
    // two-window memoraidLookback split is gone). With presence lookback = 3, the generation context
    // is the same 3-action window, so it includes "Anna smiled" too.
    expect(fetchMock).toHaveBeenCalled();
    const genCall = fetchMock.mock.calls.find(call => call[0].includes("api.anthropic.com"));
    expect(genCall).toBeDefined();
    const body = JSON.parse(genCall && genCall[1] ? (genCall[1].body as string) : "{}");
    const messages = body.messages || [];
    const storyInfo = messages[0]?.content || "";
    expect(storyInfo).toContain("Anna smiled");
    expect(storyInfo).toContain("You walked outside");
    expect(storyInfo).toContain("You opened the book");
  });

  it("can refine the latest AID memory natively via refineMemoryBlock message", async () => {
    // 1. Prepare db data (actions, adventure with memoryBankEntries, story cards)
    const act1 = { id: "10", text: "Smoke cooked tacos in the kitchen.", type: "do", createdAt: "2026-06-07T00:00:00Z" };
    const act2 = { id: "11", text: "Rena stepped close and brushed his chest.", type: "continue", createdAt: "2026-06-07T00:00:01Z" };
    const act3 = { id: "12", text: "Smoke smiled and thanked her.", type: "do", createdAt: "2026-06-07T00:00:02Z" };
    
    await repo.putActions(shortId, [act1, act2, act3]);

    const initialMemories = [
      {
        actionIds: ["10"],
        text: "You cooked tacos in the kitchen.",
        lastRelevantActionId: "10",
        __typename: "Memory"
      }
    ];

    await repo.upsertAdventure({
      shortId,
      title: "Test Adventure",
      protagonistName: "Smoke",
      memoryBankEntries: initialMemories
    });

    await repo.putCards(shortId, [
      {
        id: "card-1",
        shortId,
        type: "character",
        title: "Rena",
        keys: "Rena",
        value: "Rena is an executive."
      }
    ]);

    await repo.putOp({
      operationName: "GenerateStoryCard",
      query: "mutation GenerateStoryCard($input: GenerateStoryCardInput!) { generateStoryCard(input: $input) { success storyCard { id value } } }",
      variableKeys: [],
      kind: "write",
      learnedAt: new Date().toISOString()
    });

    await repo.putOp({
      operationName: "EditMemory",
      query: "mutation EditMemory($input: EditMemoryInput!) { editMemory(input: $input) { success } }",
      variableKeys: [],
      kind: "write",
      learnedAt: new Date().toISOString()
    });

    fetchMock.mockClear();
    
    // Custom mock implementation for this test to return custom memory text
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes("api.anthropic.com")) {
        return {
          ok: true,
          json: async () => ({
            content: [
              {
                type: "text",
                text: "You cooked tacos while Rena stepped close and brushed your chest."
              }
            ]
          })
        } as any;
      }
      if (url.includes("/graphql")) {
        const body = JSON.parse(init.body);
        const batch = Array.isArray(body) ? body : [body];
        const results = batch.map((item: any) => {
          if (item.operationName === "EditMemory") {
            return {
              data: {
                editMemory: {
                  success: true
                }
              }
            };
          }
          return { data: {} };
        });
        return { ok: true, json: async () => results } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    });

    // 2. Invoke message listener
    const listener = (globalThis as any).browser.runtime.onMessage.addListener.mock.calls[0][0];
    const result = await listener({ kind: "refineMemoryBlock", shortId, index: 0 });

    // 3. Assert result
    expect(result.ok).toBe(true);
    expect(result.memories).toBeDefined();
    expect(result.memories.length).toBe(1);
    expect(result.memories[0].text).toBe("You cooked tacos while Rena stepped close and brushed your chest.");
    expect(result.memories[0].lastRelevantActionId).toBe("10"); // remains unchanged when actionIds is not empty
    expect(result.memories[0].actionIds).toEqual(["10"]);

    // Verify GraphQL calls were made
    expect(fetchMock).toHaveBeenCalled();
  });

  it("can refine any older AID memory block natively via refineMemoryBlock message", async () => {
    // 1. Prepare db data (actions, adventure with memoryBankEntries, story cards)
    const act1 = { id: "10", text: "Smoke cooked tacos in the kitchen.", type: "do", createdAt: "2026-06-07T00:00:00Z" };
    const act2 = { id: "11", text: "Rena stepped close and brushed his chest.", type: "continue", createdAt: "2026-06-07T00:00:01Z" };
    const act3 = { id: "12", text: "Smoke smiled and thanked her.", type: "do", createdAt: "2026-06-07T00:00:02Z" };
    
    await repo.putActions(shortId, [act1, act2, act3]);

    const initialMemories = [
      {
        actionIds: ["10"],
        text: "You cooked tacos in the kitchen.",
        lastRelevantActionId: "10",
        __typename: "Memory"
      },
      {
        actionIds: ["11"],
        text: "Rena was close.",
        lastRelevantActionId: "11",
        __typename: "Memory"
      }
    ];

    await repo.upsertAdventure({
      shortId,
      title: "Test Adventure",
      protagonistName: "Smoke",
      memoryBankEntries: initialMemories
    });

    await repo.putCards(shortId, [
      {
        id: "card-1",
        shortId,
        type: "character",
        title: "Rena",
        keys: "Rena",
        value: "Rena is an executive."
      }
    ]);

    await repo.putOp({
      operationName: "GenerateStoryCard",
      query: "mutation GenerateStoryCard($input: GenerateStoryCardInput!) { generateStoryCard(input: $input) { success storyCard { id value } } }",
      variableKeys: [],
      kind: "write",
      learnedAt: new Date().toISOString()
    });

    await repo.putOp({
      operationName: "EditMemory",
      query: "mutation EditMemory($input: EditMemoryInput!) { editMemory(input: $input) { success } }",
      variableKeys: [],
      kind: "write",
      learnedAt: new Date().toISOString()
    });

    fetchMock.mockClear();
    
    // Custom mock implementation for this test to return custom memory text
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes("api.anthropic.com")) {
        const body = JSON.parse(init.body);
        const messages = body.messages || [];
        const content = messages[0]?.content || "";
        // Verify that for index 0, the input context matches EXACTLY its action (act1) and does not include un-summarized act3
        expect(content).toContain("Smoke cooked tacos");
        expect(content).not.toContain("Smoke smiled and thanked her");
        return {
          ok: true,
          json: async () => ({
            content: [
              {
                type: "text",
                text: "You cooked tacos in the kitchen, she watched."
              }
            ]
          })
        } as any;
      }
      if (url.includes("/graphql")) {
        const body = JSON.parse(init.body);
        const batch = Array.isArray(body) ? body : [body];
        const results = batch.map((item: any) => {
          if (item.operationName === "EditMemory") {
            return {
              data: {
                editMemory: {
                  success: true
                }
              }
            };
          }
          return { data: {} };
        });
        return { ok: true, json: async () => results } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    });

    // 2. Invoke message listener for index 0 (older block)
    const listener = (globalThis as any).browser.runtime.onMessage.addListener.mock.calls[0][0];
    const result = await listener({ kind: "refineMemoryBlock", shortId, index: 0 });

    // 3. Assert result
    expect(result.ok).toBe(true);
    expect(result.memories).toBeDefined();
    expect(result.memories.length).toBe(2);
    expect(result.memories[0].text).toBe("You cooked tacos in the kitchen, she watched.");
    expect(result.memories[0].actionIds).toEqual(["10"]); // remains unchanged for older block

    // Verify GraphQL calls were made
    expect(fetchMock).toHaveBeenCalled();
  });

  it("falls back to un-summarized actions when refining the latest memory block if its actionIds is empty", async () => {
    // 1. Prepare db data (actions, adventure with memoryBankEntries, story cards)
    const act1 = { id: "10", text: "Smoke cooked tacos in the kitchen.", type: "do", createdAt: "2026-06-07T00:00:00Z" };
    const act2 = { id: "11", text: "Rena stepped close and brushed his chest.", type: "continue", createdAt: "2026-06-07T00:00:01Z" };
    const act3 = { id: "12", text: "Smoke smiled and thanked her.", type: "do", createdAt: "2026-06-07T00:00:02Z" };
    
    await repo.putActions(shortId, [act1, act2, act3]);

    const initialMemories = [
      {
        actionIds: [], // empty actionIds
        text: "You cooked tacos in the kitchen.",
        lastRelevantActionId: "10",
        __typename: "Memory"
      }
    ];

    await repo.upsertAdventure({
      shortId,
      title: "Test Adventure",
      protagonistName: "Smoke",
      memoryBankEntries: initialMemories
    });

    await repo.putCards(shortId, [
      {
        id: "card-1",
        shortId,
        type: "character",
        title: "Rena",
        keys: "Rena",
        value: "Rena is an executive."
      }
    ]);

    await repo.putOp({
      operationName: "GenerateStoryCard",
      query: "mutation GenerateStoryCard($input: GenerateStoryCardInput!) { generateStoryCard(input: $input) { success storyCard { id value } } }",
      variableKeys: [],
      kind: "write",
      learnedAt: new Date().toISOString()
    });

    await repo.putOp({
      operationName: "EditMemory",
      query: "mutation EditMemory($input: EditMemoryInput!) { editMemory(input: $input) { success } }",
      variableKeys: [],
      kind: "write",
      learnedAt: new Date().toISOString()
    });

    fetchMock.mockClear();
    
    // Custom mock implementation for this test to return custom memory text
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes("api.anthropic.com")) {
        const body = JSON.parse(init.body);
        const userPrompt = body.messages[0].content;
        // Verify that it gathered all actions as fallback
        expect(userPrompt).toContain("Smoke cooked tacos");
        expect(userPrompt).toContain("Rena stepped close");
        expect(userPrompt).toContain("Smoke smiled");
        return {
          ok: true,
          json: async () => ({
            content: [
              {
                type: "text",
                text: "You cooked tacos while Rena stepped close and brushed your chest."
              }
            ]
          })
        } as any;
      }
      if (url.includes("/graphql")) {
        const body = JSON.parse(init.body);
        const batch = Array.isArray(body) ? body : [body];
        const results = batch.map((item: any) => {
          if (item.operationName === "EditMemory") {
            return {
              data: {
                editMemory: {
                  success: true
                }
              }
            };
          }
          return { data: {} };
        });
        return { ok: true, json: async () => results } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    });

    // 2. Invoke message listener
    const listener = (globalThis as any).browser.runtime.onMessage.addListener.mock.calls[0][0];
    const result = await listener({ kind: "refineMemoryBlock", shortId, index: 0 });

    // 3. Assert result
    expect(result.ok).toBe(true);
    expect(result.memories).toBeDefined();
    expect(result.memories.length).toBe(1);
    expect(result.memories[0].text).toBe("You cooked tacos while Rena stepped close and brushed your chest.");
    expect(result.memories[0].lastRelevantActionId).toBe("12"); // fallback uses last action id
    expect(result.memories[0].actionIds).toEqual(["10", "11", "12"]);

    // Verify GraphQL calls were made
    expect(fetchMock).toHaveBeenCalled();
  });

  it("automatically regenerates the latest native memory on memoryBankUpdate if enabled and a new block is added or active block grows, and avoids infinite loops", async () => {
    // 1. Enable setting
    await repo.setSettings({
      provider: "claude",
      apiKeys: { claude: "sk-ant-123" },
      model: "claude-3-5-sonnet-latest",
      autoRegenerateMemoryBankEntry: true
    } as any);

    // Prepare mock data
    const act1 = { id: "10", text: "Smoke cooked tacos in the kitchen.", type: "do", createdAt: "2026-06-07T00:00:00Z" };
    const act2 = { id: "11", text: "Rena stepped close and brushed his chest.", type: "continue", createdAt: "2026-06-07T00:00:01Z" };
    await repo.putActions(shortId, [act1, act2]);

    await repo.putCards(shortId, [
      {
        id: "card-1",
        shortId,
        type: "character",
        title: "Rena",
        keys: "Rena",
        value: "Rena is an executive."
      }
    ]);

    await repo.putOp({
      operationName: "GenerateStoryCard",
      query: "mutation GenerateStoryCard($input: GenerateStoryCardInput!) { generateStoryCard(input: $input) { success storyCard { id value } } }",
      variableKeys: [],
      kind: "write",
      learnedAt: new Date().toISOString()
    });

    await repo.putOp({
      operationName: "EditMemory",
      query: "mutation EditMemory($input: EditMemoryInput!) { editMemory(input: $input) { success } }",
      variableKeys: [],
      kind: "write",
      learnedAt: new Date().toISOString()
    });

    const initialMemories = [
      {
        actionIds: ["10"],
        text: "You cooked tacos in the kitchen.",
        lastRelevantActionId: "10",
        __typename: "Memory"
      }
    ];

    await repo.upsertAdventure({
      shortId,
      title: "Test Adventure",
      protagonistName: "Smoke",
      memoryBankEntries: initialMemories
    });

    fetchMock.mockClear();
    let generateCallCount = 0;
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes("api.anthropic.com")) {
        generateCallCount++;
        return {
          ok: true,
          json: async () => ({
            content: [
              {
                type: "text",
                text: "You cooked tacos while Rena brushed your chest."
              }
            ]
          })
        } as any;
      }
      if (url.includes("/graphql")) {
        const body = JSON.parse(init.body);
        const batch = Array.isArray(body) ? body : [body];
        const results = batch.map((item: any) => {
          if (item.operationName === "EditMemory") {
            return {
              data: {
                editMemory: {
                  success: true
                }
              }
            };
          }
          return { data: {} };
        });
        return { ok: true, json: async () => results } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    });

    // 2. Invoke message listener for memoryBankUpdate
    const listener = (globalThis as any).browser.runtime.onMessage.addListener.mock.calls[0][0];
    
    // Case 1: A new block is added
    const newMemoriesList = [
      "You cooked tacos in the kitchen.",
      "Rena brushed your chest."
    ];
    await listener({ kind: "memoryBankUpdate", shortId, memories: newMemoriesList });

    // Wait for async background regeneration to run (since it's fired asynchronously in case "memoryBankUpdate")
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(generateCallCount).toBe(1);

    // Now, simulate the WebSocket broadcast in response to the EditMemory call.
    // The text on the server for the latest memory will now be the refined text.
    // The local database was updated by the refinement function to have actionIds and text "You cooked tacos while Rena brushed your chest."
    const localAdv = await repo.getAdventure(shortId);
    const localMemories = localAdv?.memoryBankEntries || [];
    expect(localMemories[1].text).toBe("You cooked tacos while Rena brushed your chest.");
    expect(localMemories[1].actionIds).toEqual(["11"]);

    // The server broadcast will send:
    const serverBroadcastMemories = [
      "You cooked tacos in the kitchen.",
      "You cooked tacos while Rena brushed your chest."
    ];

    generateCallCount = 0; // reset
    await listener({ kind: "memoryBankUpdate", shortId, memories: serverBroadcastMemories });
    await new Promise(resolve => setTimeout(resolve, 100));

    // It should NOT trigger regeneration again because the text is the same (avoiding infinite loops)
    expect(generateCallCount).toBe(0);

    // Case 2: The active block grows (text changed on the server, e.g. from new action)
    const grownServerMemories = [
      "You cooked tacos in the kitchen.",
      "You cooked tacos while Rena brushed your chest and she hummed."
    ];
    await listener({ kind: "memoryBankUpdate", shortId, memories: grownServerMemories });
    await new Promise(resolve => setTimeout(resolve, 100));

    // It should trigger regeneration since the active block's text changed on the server (which resets actionIds on map)
    expect(generateCallCount).toBe(1);
  });

  it("combined regen: produces the block summary AND the NPC POV block in a SINGLE provider call", async () => {
    const bg = await import("../src/background/background");
    bg.__resetMemoraidStateForTests();
    // Crystallized (which owns the NPC Memory Bank) must be enabled for the combined pass.
    await repo.setSettings({
      provider: "claude",
      apiKeys: { claude: "sk-ant-123" },
      model: "claude-3-5-sonnet-latest",
      enableCrystallized: true
    } as any);

    const act1 = { id: "10", text: "Smoke cooked tacos in the kitchen.", type: "do", createdAt: "2026-06-07T00:00:00Z" };
    const act2 = { id: "11", text: "Rena stepped close and brushed his chest.", type: "continue", createdAt: "2026-06-07T00:00:01Z" };
    await repo.putActions(shortId, [act1, act2]);
    await repo.putCards(shortId, [
      { id: "card-rena", shortId, type: "character", title: "Rena", keys: "Rena", value: "Rena is an executive." }
    ]);
    await repo.upsertAdventure({
      shortId, title: "T", protagonistName: "Smoke",
      memoraidCharacters: ["Rena"],
      memoryBankEntries: [{ actionIds: ["10", "11"], text: "old summary", lastRelevantActionId: "11", __typename: "Memory" }]
    } as any);

    fetchMock.mockClear();
    let providerCalls = 0;
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes("api.anthropic.com")) {
        providerCalls++;
        return { ok: true, json: async () => ({ content: [{ type: "text", text:
          "===SUMMARY===\nYou cooked tacos while Rena leaned in.\n===POV:Rena===\nI stepped close to him, heart racing, and let my hand linger." }] }) } as any;
      }
      if (url.includes("/graphql")) return { ok: true, json: async () => [{ data: { editMemory: { success: true } } }] } as any;
      return { ok: true, json: async () => ({}) } as any;
    });

    const res = await bg.regenerateLatestMemory(shortId);
    expect(res.ok).toBe(true);
    // ONE provider call produced BOTH outputs — no separate per-NPC call re-sending the same context.
    expect(providerCalls).toBe(1);
    // Block summary updated from the SUMMARY section.
    const adv = await repo.getAdventure(shortId);
    expect(adv?.memoryBankEntries?.[0]?.text).toContain("Rena leaned in");
    // NPC memory block stored for Rena from the POV section.
    const npcBlocks = await repo.getNpcMemoryBlocks(shortId, "rena");
    expect(npcBlocks.length).toBe(1);
    expect(npcBlocks[0]!.povText).toContain("heart racing");
  });

  it("adventureMemories with Auto-Update ON generates the latest block's NPC POV ONCE (no redundant forward-auto call)", async () => {
    const bg = await import("../src/background/background");
    bg.__resetMemoraidStateForTests();
    // Both flags on: the combined regen pass owns the latest block; forward-auto must skip it, or the
    // NPC POV is generated twice per turn (combined + a separate per-NPC call).
    await repo.setSettings({
      provider: "claude",
      apiKeys: { claude: "sk-ant-123" },
      model: "claude-3-5-sonnet-latest",
      enableCrystallized: true,
      autoRegenerateMemoryBankEntry: true,
    } as any);

    const act1 = { id: "10", text: "Smoke opened the shop.", type: "do", createdAt: "2026-06-07T00:00:00Z" };
    const act2 = { id: "11", text: "Smoke poured coffee.", type: "do", createdAt: "2026-06-07T00:00:01Z" };
    const act3 = { id: "12", text: "Rena walked in and smiled at him.", type: "continue", createdAt: "2026-06-07T00:00:02Z" };
    await repo.putActions(shortId, [act1, act2, act3]);
    await repo.putCards(shortId, [
      { id: "card-rena", shortId, type: "character", title: "Rena", keys: "Rena", value: "Rena is a regular." }
    ]);
    // Seed an EXISTING block so oldMemories.length > 0 (forward-auto branch requires it), then the
    // update appends a genuinely NEW latest block.
    await repo.upsertAdventure({
      shortId, title: "T", protagonistName: "Smoke",
      memoraidCharacters: ["Rena"],
      memoryBankEntries: [{ actionIds: ["10"], text: "You opened the shop.", lastRelevantActionId: "10", __typename: "Memory" }],
    } as any);

    fetchMock.mockClear();
    let providerCalls = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("api.anthropic.com")) {
        providerCalls++;
        return { ok: true, json: async () => ({ content: [{ type: "text", text:
          "===SUMMARY===\nYou poured coffee as Rena walked in.\n===POV:Rena===\nI walked in and caught his eye, warmth blooming." }] }) } as any;
      }
      if (url.includes("/graphql")) return { ok: true, json: async () => [{ data: { editMemory: { success: true } } }] } as any;
      return { ok: true, json: async () => ({}) } as any;
    });

    const listener = (globalThis as any).browser.runtime.onMessage.addListener.mock.calls[0][0];
    // Old block (matched by text → reused) + a NEW latest block covering acts 11-12 (Rena present).
    await listener({ kind: "adventureMemories", shortId, memories: [
      { actionIds: ["10"], text: "You opened the shop.", lastRelevantActionId: "10" },
      { actionIds: ["11", "12"], text: "You poured coffee; Rena walked in.", lastRelevantActionId: "12" },
    ] });
    // Fire-and-forget regen + forward-auto run async in the handler.
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Exactly ONE provider call: the combined pass. If forward-auto had also fired for the latest
    // block, generateNpcBlock would have made a second anthropic call.
    expect(providerCalls).toBe(1);
    // The NPC POV still landed (from the combined call), anchored to the new block.
    const npcBlocks = await repo.getNpcMemoryBlocks(shortId, "rena");
    expect(npcBlocks.length).toBe(1);
    expect(npcBlocks[0]!.povText).toContain("warmth blooming");
  });

  it("saves and retrieves settings with custom interceptTimeout", async () => {
    // 1. Save settings with a custom interceptTimeout
    await repo.setSettings({
      provider: "claude",
      interceptTimeout: 10
    } as any);

    // 2. Query getState via listener
    const listener = (globalThis as any).browser.runtime.onMessage.addListener.mock.calls[0][0];
    const state = await listener({ kind: "getState", shortId });

    // 3. Verify interceptTimeout is returned correctly
    expect(state.settings).toBeDefined();
    expect(state.settings.interceptTimeout).toBe(10);
  });

  it("saves and retrieves settings with custom characterCardLimit and thoughtCardLimit", async () => {
    // 1. Save settings with custom limits
    await repo.setSettings({
      provider: "claude",
      characterCardLimit: 500,
      thoughtCardLimit: 1500
    } as any);

    // 2. Query getState via listener
    const listener = (globalThis as any).browser.runtime.onMessage.addListener.mock.calls[0][0];
    const state = await listener({ kind: "getState", shortId });

    // 3. Verify limits are returned correctly
    expect(state.settings).toBeDefined();
    expect(state.settings.characterCardLimit).toBe(500);
    expect(state.settings.thoughtCardLimit).toBe(1500);
  });

  it("creates a new story card using createStoryCard message", async () => {
    const op = { operationName: "SaveQueueStoryCard", query: "mutation SaveQueueStoryCard { success }", variableKeys: [], kind: "write", learnedAt: "2026-05-30T00:00:00Z" } as any;
    await repo.putOp(op);

    let createVariables: any = null;
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      const body = JSON.parse(init.body);
      const batch = Array.isArray(body) ? body : [body];
      createVariables = batch[0].variables;
      return {
        ok: true,
        json: async () => [{
          data: {
            updateStoryCard: {
              success: true,
              message: "Created successfully",
              storyCard: {
                id: "server-generated-card-id",
                type: "character",
                title: "Rena",
                keys: "rena",
                description: "Notes about Rena",
                value: "Rena is a merchant.",
                useForCharacterCreation: false,
                updatedAt: "2026-06-07T12:00:00Z",
                __typename: "StoryCard"
              }
            }
          }
        }]
      } as any;
    });

    (globalThis as any).browser.tabs.query.mockResolvedValue([]);

    const listener = (globalThis as any).browser.runtime.onMessage.addListener.mock.calls[0][0];
    const res = await listener({
      kind: "createStoryCard",
      shortId,
      card: {
        type: "character",
        title: "Rena",
        keys: "rena",
        description: "Notes about Rena",
        value: "Rena is a merchant."
      }
    });

    expect(res).toBeDefined();
    expect(res.ok).toBe(true);
    expect(res.id).toBe("server-generated-card-id");
    expect(createVariables).toBeDefined();
    expect(createVariables?.input?.title).toBe("Rena");
    expect(createVariables?.input?.keys).toBe("rena");
    expect(createVariables?.input?.value).toBe("Rena is a merchant.");

    const dbCards = await repo.getCards(shortId);
    expect(dbCards.length).toBe(1);
    const firstCard = dbCards[0];
    expect(firstCard).toBeDefined();
    expect(firstCard?.id).toBe("server-generated-card-id");
    expect(firstCard?.title).toBe("Rena");
  });

  it("updates story card triggers (keys) using saveCardKeys message", async () => {
    const op = { operationName: "UseAutoSaveStoryCard", query: "mutation UseAutoSaveStoryCard { success }", variableKeys: [], kind: "write", learnedAt: "2026-05-30T00:00:00Z" } as any;
    await repo.putOp(op);

    // Initial card setup
    await repo.putCards(shortId, [{
      shortId,
      id: "card-to-update",
      type: "character",
      title: "Rena",
      keys: "rena",
      description: "Notes about Rena",
      value: "Rena is a merchant."
    }]);

    let saveVariables: any = null;
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      const body = JSON.parse(init.body);
      const batch = Array.isArray(body) ? body : [body];
      saveVariables = batch[0].variables;
      return {
        ok: true,
        json: async () => [{
          data: {
            updateStoryCard: {
              success: true,
              message: "Updated successfully",
              storyCard: {
                id: "card-to-update",
                type: "character",
                title: "Rena",
                keys: "rena, merchant",
                description: "Notes about Rena",
                value: "Rena is a merchant.",
                useForCharacterCreation: false,
                updatedAt: "2026-06-07T13:00:00Z",
                __typename: "StoryCard"
              }
            }
          }
        }]
      } as any;
    });

    (globalThis as any).browser.tabs.query.mockResolvedValue([]);

    const listener = (globalThis as any).browser.runtime.onMessage.addListener.mock.calls[0][0];
    const res = await listener({
      kind: "saveCardKeys",
      shortId,
      cardId: "card-to-update",
      keys: "rena, merchant"
    });

    expect(res).toBeDefined();
    expect(res.ok).toBe(true);
    expect(saveVariables).toBeDefined();
    expect(saveVariables?.input?.id).toBe("card-to-update");
    expect(saveVariables?.input?.keys).toBe("rena, merchant");

    const dbCards = await repo.getCards(shortId);
    expect(dbCards.length).toBe(1);
    const updatedCard = dbCards[0];
    expect(updatedCard).toBeDefined();
    expect(updatedCard?.id).toBe("card-to-update");
    expect(updatedCard?.keys).toBe("rena, merchant");
  });



  it("automatically updates active characters that remain in context every N turns", async () => {
    // 1. Setup settings (analyzeWindow/lookbackSize = 20). Automatic updates are opt-in, so enable them.
    await repo.setSettings({
      provider: "claude",
      apiKeys: { claude: "sk-ant-123" },
      analyzeWindow: 20,
      enableAutomaticUpdates: true
    });

    // Learn GenerateStoryCard GQL op
    await repo.putOp({
      operationName: "GenerateStoryCard",
      query: "mutation GenerateStoryCard { ... }",
      variableKeys: [],
      kind: "write",
      learnedAt: new Date().toISOString()
    });

    // 2. Put character card in database
    await repo.putCards(shortId, [
      {
        shortId,
        id: "char-elias",
        type: "character",
        title: "Elias",
        keys: "Elias, elf",
        value: "Elias is an ancient elf."
      }
    ]);

    // 3. Put 25 actions in history where Elias is active
    const actions = Array.from({ length: 25 }, (_, i) => ({
      id: `action-${i}`,
      type: "continue",
      text: `Action ${i}: Elias speaks.`,
      createdAt: new Date(2026, 5, 7, 12, 0, i).toISOString()
    }));
    await repo.putActions(shortId, actions);

    // 4. Put a version representing an update at action count 5
    await repo.putVersion({
      id: "v-elias-old",
      shortId,
      characterName: "Elias",
      entry: "Elias is an ancient elf.",
      changeSummary: "Manual update",
      status: "applied",
      createdAt: new Date().toISOString(),
      actionCount: 5,
      source: "card"
    });

    // 5. Run checkLookbackAutoUpdates with 1 new action
    // Total actions is 25. Last update is 5.
    // Difference is 25 - 5 = 20 >= 20.
    // So it should trigger auto-update!
    fetchMock.mockClear();
    await checkLookbackAutoUpdates(shortId, [actions[24]]);

    // Verify fetch called Claude API instead of GQL GenerateStoryCard
    const calls = fetchMock.mock.calls;
    expect(calls.some(c => c[0].includes("api.anthropic.com"))).toBe(true);

    // Verify new pending version was created at actionCount 25
    const dbVersions = await repo.getVersions(shortId);
    const pendingVersion = dbVersions.find(v => v.characterName === "Elias" && v.status === "pending");
    expect(pendingVersion).toBeDefined();
    expect(pendingVersion?.actionCount).toBe(25);

    // 6. Test that it does NOT update if difference < lookbackSize
    // Change the pending version to status = "applied" and actionCount = 10.
    // Now diff is 25 - 10 = 15 < 20. It should NOT trigger!
    await repo.putVersion({
      ...pendingVersion!,
      status: "applied",
      actionCount: 10
    });

    fetchMock.mockClear();
    await checkLookbackAutoUpdates(shortId, [actions[24]]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does NOT auto-update when enableAutomaticUpdates is off (the opt-in gate)", async () => {
    // Regression: the toggle was ignored — auto-updates ran on the legacy manualMode default.
    await repo.setSettings({ provider: "claude", apiKeys: { claude: "sk-ant-123" }, analyzeWindow: 20 }); // enableAutomaticUpdates undefined -> off
    await repo.putCards(shortId, [{ shortId, id: "char-elias", type: "character", title: "Elias", keys: "Elias, elf", value: "Elias is an ancient elf." }]);
    const actions = Array.from({ length: 25 }, (_, i) => ({ id: `action-${i}`, type: "continue", text: `Action ${i}: Elias speaks.`, createdAt: new Date(2026, 5, 7, 12, 0, i).toISOString() }));
    await repo.putActions(shortId, actions);
    await repo.putVersion({ id: "v-elias-old", shortId, characterName: "Elias", entry: "Elias is an ancient elf.", changeSummary: "Manual", status: "applied", createdAt: new Date().toISOString(), actionCount: 5, source: "card" } as any);

    fetchMock.mockClear();
    await checkLookbackAutoUpdates(shortId, [actions[24]]); // would be DUE (25-5>=20) if the gate were open
    expect(fetchMock).not.toHaveBeenCalled();
    const pending = (await repo.getVersions(shortId)).find(v => v.characterName === "Elias" && v.status === "pending");
    expect(pending).toBeUndefined();
  });

  it("does NOT auto-update a fell-out card if difference < lookbackSize", async () => {
    // 1. Setup settings (analyzeWindow/lookbackSize = 20)
    await repo.setSettings({
      provider: "claude",
      apiKeys: { claude: "sk-ant-123" },
      analyzeWindow: 20
    });

    // 2. Put character card in database
    await repo.putCards(shortId, [
      {
        shortId,
        id: "char-elias",
        type: "character",
        title: "Elias",
        keys: "Elias, elf",
        value: "Elias details."
      }
    ]);

    // 3. Put actions in history where Elias was active but now fell out
    // Turn 0 to 19 (20 actions): Elias is active ("Elias speaks.")
    // Turn 20 to 24 (5 actions): Elias is not active ("You walk.")
    // With lookback = 20:
    // Previous window (Turn 1 to 20): contains Elias.
    // Current window (Turn 5 to 24): does NOT contain Elias (since he fell out after turn 19).
    // So Elias falls out!
    const actions = Array.from({ length: 25 }, (_, i) => ({
      id: `action-${i}`,
      type: "continue",
      text: i < 20 ? "Elias speaks." : "You walk.",
      createdAt: new Date(2026, 5, 7, 12, 0, i).toISOString()
    }));
    await repo.putActions(shortId, actions);

    // 4. Put a version representing an update at action count 15
    await repo.putVersion({
      id: "v-elias-old",
      shortId,
      characterName: "Elias",
      entry: "Elias details.",
      changeSummary: "Manual update",
      status: "applied",
      createdAt: new Date().toISOString(),
      actionCount: 15,
      source: "card",
      cardId: "char-elias"
    } as any);

    // 5. Run checkLookbackAutoUpdates. Elias fell out, but the difference is:
    // totalActionsCount - lastUpdateActionCount = 25 - 15 = 10 < 20.
    // So it should NOT trigger auto-update!
    fetchMock.mockClear();
    await checkLookbackAutoUpdates(shortId, [actions[24]]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does NOT auto-update a fell-out card if the last update was rejected and they haven't been active since", async () => {
    // 1. Setup settings (analyzeWindow/lookbackSize = 20)
    await repo.setSettings({
      provider: "claude",
      apiKeys: { claude: "sk-ant-123" },
      analyzeWindow: 20
    });

    // 2. Put character card in database
    await repo.putCards(shortId, [
      {
        shortId,
        id: "char-elias",
        type: "character",
        title: "Elias",
        keys: "Elias, elf",
        value: "Elias details."
      }
    ]);

    // 3. Put actions in history where Elias was active but now fell out
    // Turn 0 to 4 (5 actions): Elias is active ("Elias speaks.")
    // Turn 5 to 24 (20 actions): Elias is inactive ("You walk.")
    // Elias fell out on Turn 25.
    const actions = Array.from({ length: 25 }, (_, i) => ({
      id: `action-${i}`,
      type: "continue",
      text: i < 5 ? "Elias speaks." : "You walk.",
      createdAt: new Date(2026, 5, 7, 12, 0, i).toISOString()
    }));
    await repo.putActions(shortId, actions);

    // 4. Put a version representing a REJECTED update at turn 5
    await repo.putVersion({
      id: "v-elias-old",
      shortId,
      characterName: "Elias",
      entry: "Elias details.",
      changeSummary: "Rejected update",
      status: "rejected",
      createdAt: new Date().toISOString(),
      actionCount: 5,
      source: "card",
      cardId: "char-elias"
    } as any);

    // 5. Run checkLookbackAutoUpdates. Elias fell out on Turn 25.
    // The cooldown check is met: 25 - 5 = 20 >= 20.
    // BUT Elias has not been active since Turn 5.
    // So it should NOT trigger auto-update!
    fetchMock.mockClear();
    await checkLookbackAutoUpdates(shortId, [actions[24]]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does NOT auto-profile a brand-new card: seedBaselines stamps the current action count, not 0", async () => {
    await repo.setSettings({
      provider: "claude",
      apiKeys: { claude: "sk-ant-123" },
      analyzeWindow: 20
    });
    await repo.putOp({
      operationName: "GenerateStoryCard",
      query: "mutation GenerateStoryCard { ... }",
      variableKeys: [],
      kind: "write",
      learnedAt: new Date().toISOString()
    });
    await repo.upsertAdventure({ shortId, title: "T", protagonistName: "Smoke" });

    // 25 actions already in history; the player mentions "Steve" once in the latest.
    const actions = Array.from({ length: 25 }, (_, i) => ({
      id: `a-${i}`,
      type: "continue",
      text: i === 24 ? 'You say, "I wonder if Steve is around today."' : `Action ${i}.`,
      createdAt: new Date(2026, 5, 13, 12, 0, i).toISOString()
    }));
    await repo.putActions(shortId, actions);

    // A brand-new "Steve" character card appears (e.g. ingested from the server) with NO versions.
    await repo.putCards(shortId, [
      { shortId, id: "card-steve", type: "character", title: "Steve", keys: "Steve", value: "[Name: Steve]" }
    ]);

    // getState seeds baselines for the new card.
    const listener = (globalThis as any).browser.runtime.onMessage.addListener.mock.calls[0][0];
    await listener({ kind: "getState", shortId });

    // Regression: the baseline must be stamped at the current action count (25), not 0.
    const versions = await repo.getVersions(shortId);
    const baseline = versions.find(v => v.characterName === "Steve" && v.status === "applied");
    expect(baseline).toBeDefined();
    expect(baseline?.actionCount).toBe(25);

    // Consequently the auto-update must NOT fire (25 - 25 = 0 < 20) — no dossier for a one-off mention.
    fetchMock.mockClear();
    await checkLookbackAutoUpdates(shortId, [actions[24]]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("seeds independent baselines for two cards that share a name in different categories", async () => {
    await repo.upsertAdventure({ shortId, title: "T", protagonistName: "Smoke" });

    const actions = Array.from({ length: 5 }, (_, i) => ({
      id: `a-${i}`,
      type: "continue",
      text: `Action ${i}.`,
      createdAt: new Date(2026, 5, 13, 12, 0, i).toISOString()
    }));
    await repo.putActions(shortId, actions);

    // A Character "Adrian" and a Plan "Adrian" — same name + same triggers, different category.
    await repo.putCards(shortId, [
      { shortId, id: "char-adrian", type: "character", title: "Adrian", keys: "adrian", value: "[Name: Adrian]" },
      { shortId, id: "plan-adrian", type: "Plan", title: "Adrian", keys: "adrian", value: "Adrian's goal is..." },
    ]);

    // getState seeds baselines for both cards.
    const listener = (globalThis as any).browser.runtime.onMessage.addListener.mock.calls[0][0];
    await listener({ kind: "getState", shortId });

    const versions = await repo.getVersions(shortId);
    const baselines = versions.filter(v => v.characterName === "Adrian" && v.status === "applied");
    const baselineCardIds = baselines.map(v => (v as any).cardId).sort();
    expect(baselineCardIds).toEqual(["char-adrian", "plan-adrian"]);
  });

  it("migrates a legacy 'custom'-typed Configure MemorAID card to the 'MemorAID' type on load (write-back + local)", async () => {
    await repo.upsertAdventure({ shortId, title: "T", protagonistName: "Smoke" });
    await repo.putOp({
      operationName: "UseAutoSaveStoryCard",
      query: "mutation UseAutoSaveStoryCard($input: UpdateStoryCardInput!) { updateStoryCard(input: $input) { success } }",
      variableKeys: [],
      kind: "write",
      learnedAt: new Date().toISOString()
    });
    await repo.putCards(shortId, [
      { shortId, id: "cfg-1", type: "custom", title: "Configure MemorAID", keys: "configure memoraid", value: "List important characters.", description: "IMPORTANT_CHARACTERS: " }
    ]);

    const listener = (globalThis as any).browser.runtime.onMessage.addListener.mock.calls[0][0];
    fetchMock.mockClear();
    await listener({ kind: "getState", shortId });

    // The type change is pushed back to AID via UseAutoSaveStoryCard for the config card.
    const gqlBodies = fetchMock.mock.calls
      .filter((c: any) => typeof c[1]?.body === "string")
      .map((c: any) => { try { return JSON.parse(c[1].body); } catch { return null; } })
      .flat()
      .filter(Boolean);
    const save = gqlBodies.find((b: any) => b?.operationName === "UseAutoSaveStoryCard" && b?.variables?.input?.id === "cfg-1");
    expect(save).toBeTruthy();
    expect(save.variables.input.type).toBe("MemorAID");

    // The local copy reflects the migration so it won't re-fire next load.
    const dbCards = await repo.getCards(shortId);
    expect(dbCards.find(c => c.id === "cfg-1")?.type).toBe("MemorAID");
  });

  it("does NOT rewrite a Configure MemorAID card already typed 'MemorAID' (idempotent)", async () => {
    await repo.upsertAdventure({ shortId, title: "T", protagonistName: "Smoke" });
    await repo.putCards(shortId, [
      { shortId, id: "cfg-1", type: "MemorAID", title: "Configure MemorAID", keys: "configure memoraid", value: "List important characters.", description: "IMPORTANT_CHARACTERS: " }
    ]);

    const listener = (globalThis as any).browser.runtime.onMessage.addListener.mock.calls[0][0];
    fetchMock.mockClear();
    await listener({ kind: "getState", shortId });

    const gqlBodies = fetchMock.mock.calls
      .filter((c: any) => typeof c[1]?.body === "string")
      .map((c: any) => { try { return JSON.parse(c[1].body); } catch { return null; } })
      .flat()
      .filter(Boolean);
    const save = gqlBodies.find((b: any) => b?.operationName === "UseAutoSaveStoryCard" && b?.variables?.input?.id === "cfg-1");
    expect(save).toBeUndefined();
  });

  it("creates a memory card for a virtual character like Celeste in processInterceptedAction", async () => {
    // 1. Setup config card only (no character card for Celeste exists)
    await repo.putCards(shortId, [
      {
        shortId,
        id: "config-memoraid",
        type: "custom",
        title: "Configure MemorAID",
        keys: "configure memoraid",
        value: "active",
        description: "IMPORTANT_CHARACTERS: Celeste"
      }
    ]);

    // Update config cache
    const listener = (globalThis as any).browser.runtime.onMessage.addListener.mock.calls[0][0];
    await listener({ kind: "getState", shortId });

    fetchMock.mockClear();

    // 2. Intercept an action that mentions Celeste
    const res = await listener({
      kind: "processInterceptedAction",
      shortId,
      text: "Celeste enters the study with a measured stride."
    });

    expect(res.error).toBeUndefined();
    expect(res.updatedNames).toContain("Celeste");

    // 3. Verify memory card Celeste (Memory) was created
    const dbCards = await repo.getCards(shortId);
    const memCard = dbCards.find(c => c.title === "Celeste (Memory)");
    expect(memCard).toBeDefined();
    expect(memCard?.keys).toBe("celeste");
  });

  it("skips thought generation for an already-tracked character if they are not mentioned in the latest action", async () => {
    // 1. Setup config card, character card, and an existing memory card
    await repo.putCards(shortId, [
      {
        shortId,
        id: "char-anna",
        type: "character",
        title: "Anna",
        keys: "anna",
        value: "Anna details."
      },
      {
        shortId,
        id: "mem-anna",
        type: "memory",
        title: "Anna (Memory)",
        keys: "anna",
        value: "[Anna's Thoughts:\nIntake: She smiles.\nThought: Nice.\nAction: Wait.\n]",
        description: "[THOUGHT LOG]\n(turn 10)\n[Anna's Thoughts:\nIntake: She smiles.\nThought: Nice.\nAction: Wait.\n]"
      },
      {
        shortId,
        id: "config-memoraid",
        type: "custom",
        title: "Configure MemorAID",
        keys: "configure memoraid",
        value: "active",
        description: "IMPORTANT_CHARACTERS: Anna"
      }
    ]);

    // Setup history where Anna was mentioned in the past, but the latest action does NOT mention her
    await repo.putActions(shortId, [
      { id: "act1", text: "Anna smiled.", type: "story", createdAt: "2026-06-07T12:00:00Z" },
      { id: "act2", text: "You walked outside.", type: "do", createdAt: "2026-06-07T12:01:00Z" }
    ]);

    fetchMock.mockClear();

    // Private model uses WINDOW presence: Anna is still in the recent lookback window (act1), so she
    // is processed — the model itself decides whether she is offstage (→ ears-burning thought). This
    // supersedes public's latest-action-only skip.
    const updated = await checkMemorAIDUpdates(shortId);
    expect(updated).toEqual(["Anna"]);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("generates thoughts for an existing memory card if it has no real thoughts yet, even if not mentioned in the latest action", async () => {
    // 1. Setup config card, character card, and an empty/initial memory card
    await repo.putCards(shortId, [
      {
        shortId,
        id: "char-anna",
        type: "character",
        title: "Anna",
        keys: "anna",
        value: "Anna details."
      },
      {
        shortId,
        id: "mem-anna",
        type: "memory",
        title: "Anna (Memory)",
        keys: "anna",
        value: "[\n - none\n]",
        description: "" // No thought log
      },
      {
        shortId,
        id: "config-memoraid",
        type: "custom",
        title: "Configure MemorAID",
        keys: "configure memoraid",
        value: "active",
        description: "IMPORTANT_CHARACTERS: Anna"
      }
    ]);

    // Setup history where Anna was mentioned in the past, but the latest action does NOT mention her
    await repo.putActions(shortId, [
      { id: "act1", text: "Anna smiled.", type: "story", createdAt: "2026-06-07T12:00:00Z" },
      { id: "act2", text: "You walked outside.", type: "do", createdAt: "2026-06-07T12:01:00Z" }
    ]);

    fetchMock.mockClear();

    // Mock Anthropic response for thought generation
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes("api.anthropic.com")) {
        return {
          ok: true,
          json: async () => ({
            content: [
              {
                type: "text",
                text: "[\nAnna's Thoughts:\nIntake: Anna smiles.\nThought: Nice.\nAction: Wait.\n]"
              }
            ]
          })
        } as unknown as Response;
      }
      return {
        ok: true,
        json: async () => ([
          {
            data: {
              updateStoryCard: {
                success: true,
                message: "Updated card",
                storyCard: {
                  id: "mem-anna",
                  type: "Memory",
                  title: "Anna (Memory)",
                  keys: "anna",
                  value: "[\nAnna's Thoughts:\nIntake: Anna smiles.\nThought: Nice.\nAction: Wait.\n]",
                  description: "[THOUGHT LOG]\n(turn 2)\n[\nAnna's Thoughts:\nIntake: Anna smiles.\nThought: Nice.\nAction: Wait.\n]"
                }
              }
            }
          }
        ])
      };
    });

    const updated = await checkMemorAIDUpdates(shortId);
    expect(updated).toEqual(["Anna"]);
    expect(fetchMock).toHaveBeenCalled();

    const dbCards = await repo.getCards(shortId);
    const memCard = dbCards.find(c => c.title === "Anna (Memory)");
    expect(memCard?.value).toContain("Anna's Thoughts");
  });

  it("does NOT skip thought generation for a continuation action if the character was mentioned in the base action being continued", async () => {
    // 1. Setup config card, character card, and an existing memory card with turn 1 thoughts
    await repo.putCards(shortId, [
      {
        shortId,
        id: "char-anna",
        type: "character",
        title: "Anna",
        keys: "anna",
        value: "Anna details."
      },
      {
        shortId,
        id: "mem-anna",
        type: "memory",
        title: "Anna (Memory)",
        keys: "anna",
        value: "[Anna's Thoughts:\nIntake: She smiles.\nThought: Nice.\nAction: Wait.\n]",
        description: "[THOUGHT LOG]\n(turn 1)\n[Anna's Thoughts:\nIntake: She smiles.\nThought: Nice.\nAction: Wait.\n]"
      },
      {
        shortId,
        id: "config-memoraid",
        type: "custom",
        title: "Configure MemorAID",
        keys: "configure memoraid",
        value: "active",
        description: "IMPORTANT_CHARACTERS: Anna"
      }
    ]);

    // Setup history where Anna was mentioned in action 1, and action 2 is a continuation action
    await repo.putActions(shortId, [
      { id: "act1", text: "Anna smiled.", type: "story", createdAt: "2026-06-07T12:00:00Z" },
      { id: "act2", text: "She walked outside.", type: "continue", createdAt: "2026-06-07T12:01:00Z" }
    ]);

    fetchMock.mockImplementation(async (url: any) => {
      if (typeof url === "string" && url.includes("api.anthropic.com")) {
        return {
          ok: true,
          json: async () => ({
            content: [
              {
                type: "text",
                text: "[\nAnna's Thoughts:\nIntake: Anna is outside.\nThought: Fresh air is nice.\nAction: Look around.\n]"
              }
            ]
          })
        } as unknown as Response;
      }
      return {
        ok: true,
        json: async () => ([
          {
            data: {
              updateStoryCard: {
                success: true,
                message: "Updated card",
                storyCard: {
                  id: "mem-anna",
                  type: "Memory",
                  title: "Anna (Memory)",
                  keys: "anna",
                  value: "[\nAnna's Thoughts:\nIntake: Anna is outside.\nThought: Fresh air is nice.\nAction: Look around.\n]",
                  description: "[THOUGHT LOG]\n(turn 1)\n[Anna's Thoughts:\nIntake: She smiles.\nThought: Nice.\nAction: Wait.\n]\n(turn 2)\n[\nAnna's Thoughts:\nIntake: Anna is outside.\nThought: Fresh air is nice.\nAction: Look around.\n]"
                }
              }
            }
          }
        ])
      };
    });

    const updated = await checkMemorAIDUpdates(shortId);
    expect(updated).toEqual(["Anna"]);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("gates rolling braced format only when memoraidThoughtLookback > 1", async () => {
    // 1. Save settings with memoraidThoughtLookback = 1
    await repo.setSettings({
      provider: "claude",
      apiKeys: { claude: "sk-ant-123" },
      formattingMode: "squareBrackets",
      memoraidThoughtLookback: 1,
      cardCommands: { memoraid: "active" },
      showDebug: true
    } as any);

    // Setup character card and Configure MemorAID card
    await repo.putCards(shortId, [
      {
        shortId,
        id: "char-anna",
        type: "character",
        title: "Anna",
        keys: "anna",
        value: "Anna details."
      },
      {
        shortId,
        id: "config-memoraid",
        type: "custom",
        title: "Configure MemorAID",
        keys: "configure memoraid",
        value: "active",
        description: "IMPORTANT_CHARACTERS: Anna"
      }
    ]);

    await repo.putActions(shortId, []);

    // Mock response
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("api.anthropic.com")) {
        return {
          ok: true,
          json: async () => ({
            content: [{ type: "text", text: "[\n- Intake: Anna smiles.\n- Thought: Nice.\n- Action: Wait.\n]" }]
          })
        } as unknown as Response;
      }
      return {
        ok: true,
        json: async () => ([{
          data: {
            updateStoryCard: {
              success: true,
              message: "Updated card",
              storyCard: {
                id: "mem-anna",
                type: "Memory",
                title: "Anna (Memory)",
                value: "[\nAnna\'s Thoughts:\n- Intake: Anna smiles.\n- Thought: Nice.\n- Action: Wait.\n]"
              }
            }
          }
        }])
      };
    });

    // Run check with lookback = 1. The private model always renders the windowed
    // "(newest to oldest)" header (the old plain-vs-braced threshold was removed).
    let updated = await checkMemorAIDUpdates(shortId, "Anna walked straight toward your row.");
    expect(updated).toEqual(["Anna"]);
    let dbCards = await repo.getCards(shortId);
    let memCard = dbCards.find(c => c.title === "Anna (Memory)");
    expect(memCard?.value).toContain("Anna's Thoughts (newest to oldest):");

    // 2. Update settings to memoraidThoughtLookback = 2
    (globalThis as any).indexedDB = new IDBFactory();
    __resetDbForTests();
    (await import("../src/background/background")).__resetMemoraidStateForTests();
    repo = new Repo();
    await repo.setSettings({
      provider: "claude",
      apiKeys: { claude: "sk-ant-123" },
      formattingMode: "squareBrackets",
      memoraidThoughtLookback: 2,
      cardCommands: { memoraid: "active" },
      showDebug: true
    } as any);

    await repo.putCards(shortId, [
      {
        shortId,
        id: "char-anna",
        type: "character",
        title: "Anna",
        keys: "anna",
        value: "Anna details."
      },
      {
        shortId,
        id: "config-memoraid",
        type: "custom",
        title: "Configure MemorAID",
        keys: "configure memoraid",
        value: "active",
        description: "IMPORTANT_CHARACTERS: Anna"
      }
    ]);

    // Clear actions & database card to run fresh
    await repo.putActions(shortId, []);
    fetchMock.mockClear();

    // Run check with lookback = 2. Should use braced format: "Anna's Thoughts (newest to oldest):"
    updated = await checkMemorAIDUpdates(shortId, "Anna walked straight toward your row.");
    expect(updated).toEqual(["Anna"]);
    dbCards = await repo.getCards(shortId);
    memCard = dbCards.find(c => c.title === "Anna (Memory)");
    expect(memCard?.value).toContain("Anna's Thoughts (newest to oldest):");
    expect(memCard?.value).toContain("{- Intake: Anna smiles.");
  });

  it("handles triggers and mappings for joint character cards correctly without duplicates", async () => {
    // 1. Setup Configure MemorAID and joint character card "Luna and Stella"
    await repo.setSettings({
      provider: "claude",
      apiKeys: { claude: "sk-ant-123" },
      formattingMode: "squareBrackets",
      memoraidThoughtLookback: 1,
      cardCommands: { memoraid: "active" }
    } as any);

    await repo.putCards(shortId, [
      {
        shortId,
        id: "char-joint",
        type: "character",
        title: "Luna and Stella",
        keys: "luna, stella",
        value: "Luna and Stella details."
      },
      {
        shortId,
        id: "mem-joint",
        type: "Memory",
        title: "Luna and Stella (Memory)",
        keys: "luna, stella",
        value: "[\n - none\n]",
        description: ""
      },
      {
        shortId,
        id: "config-memoraid",
        type: "custom",
        title: "Configure MemorAID",
        keys: "configure memoraid",
        value: "active",
        description: "IMPORTANT_CHARACTERS: Luna, Stella"
      }
    ]);

    await repo.putActions(shortId, []);

    // Mock response for joint cards
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("api.anthropic.com")) {
        return {
          ok: true,
          json: async () => ({
            content: [{
              type: "text",
              text: "[\n- Intake: Luna feels form.\n- Thought: Tragedy.\n- Action: Embrace.\n- Intake: Stella watches.\n- Thought: Challenge.\n- Action: Dial back.\n]"
            }]
          })
        } as unknown as Response;
      }
      return {
        ok: true,
        json: async () => ([{
          data: {
            updateStoryCard: {
              success: true,
              message: "Updated card",
              storyCard: {
                id: "mem-joint",
                type: "Memory",
                title: "Luna and Stella (Memory)",
                value: "[\nLuna and Stella's Thoughts:\n- Intake: Luna feels form.\n- Thought: Tragedy.\n- Action: Embrace.\n- Intake: Stella watches.\n- Thought: Challenge.\n- Action: Dial back.\n]"
              }
            }
          }
        }])
      };
    });

    // Run check. Trigger both individual names (Luna and Stella are both listed).
    // They both map to the same joint card. Only 1 generation request should fire, 
    // and both loops should be parsed and present.
    const updated = await checkMemorAIDUpdates(shortId, "Luna and Stella both walked toward you.");
    console.log("FETCHMOCK CALLS:", fetchMock.mock.calls.map((c, i) => `${i + 1}: ${c[0]} ${c[1]?.headers?.Authorization || ""} ${c[1]?.body ? c[1].body.slice(0, 100) : ""}`));
    expect(updated).toEqual(["Luna and Stella"]);
    expect(fetchMock).toHaveBeenCalledTimes(2); // 1 for Anthropic + 1 for GQL writeback

    const dbCards = await repo.getCards(shortId);
    const memCard = dbCards.find(c => c.title === "Luna and Stella (Memory)");
    expect(memCard).toBeDefined();
    expect(memCard?.value).toContain("Luna feels form");
    expect(memCard?.value).toContain("Stella watches");
  });
});

describe("looksLikeCharacterProfile (MemorAID guard)", () => {
  let looksLikeCharacterProfile: any;
  beforeEach(async () => {
    const bg = await import("../src/background/background");
    looksLikeCharacterProfile = bg.looksLikeCharacterProfile;
  });

  it("flags output that returned a character profile instead of thoughts", () => {
    const profile = "Lady Celeste Starfall.\n        *   Appearance: Red curls, blue eyes.\n        *   Personality: Poised, sharp.\n        *   Psychology: Rigid control.\n        *   Dynamic (Smoke): Co-strategist.";
    expect(looksLikeCharacterProfile(profile)).toBe(true);
  });

  it("flags output with Windows CRLF line endings", () => {
    const profile = "Lady Celeste Starfall.\r\n        *   Appearance: Red curls, blue eyes.\r\n        *   Personality: Poised, sharp.\r\n        *   Psychology: Rigid control.\r\n        *   Dynamic (Smoke): Co-strategist.";
    expect(looksLikeCharacterProfile(profile)).toBe(true);
  });

  it("does NOT flag a real Intake/Thought/Action loop", () => {
    const thoughts = "[Celeste's Thoughts:\n- Intake: She slides the letter across the table.\n- Thought: A test of my discretion.\n- Action: I tuck it into my sleeve.\n]";
    expect(looksLikeCharacterProfile(thoughts)).toBe(false);
  });
});

describe("extractThoughtLoop (MemorAID salvage)", () => {
  let extractThoughtLoop: any;
  beforeEach(async () => {
    const bg = await import("../src/background/background");
    extractThoughtLoop = bg.extractThoughtLoop;
  });

  it("recovers the three lines from a Gemma markdown scaffold and ignores the 'Latest Action:' line", () => {
    const messy = `*   Character: Lady Celeste Starfall.\n    *   Latest Action: Celeste pauses, hand on clutch. She looks at Smoke.\n    *   Goal: Generate first-person thoughts based only on the latest action.\n\n    *   Intake: The visual of Smoke's massive frame and the weight of the silence.\n    *   Thought: She is analyzing him not as a man but as a biological asset.\n    *   Action: She keeps her hand on the clutch and holds his gaze.`;
    const out = extractThoughtLoop(messy);
    expect(out).toBe("- Intake: The visual of Smoke's massive frame and the weight of the silence.\n- Thought: She is analyzing him not as a man but as a biological asset.\n- Action: She keeps her hand on the clutch and holds his gaze.");
    expect(out).not.toContain("Latest Action");
    expect(out).not.toContain("Goal:");
    expect(out).not.toContain("*");
  });

  it("returns null when fewer than two of the three labels are present (not a salvageable loop)", () => {
    expect(extractThoughtLoop("- Action: do something")).toBeNull();
    expect(extractThoughtLoop("just some prose with no labels")).toBeNull();
  });

  it("rejects output when it contains literal template placeholder descriptions", () => {
    const placeholderResponse = "[\n- Intake: Sensory/verbal stimulus from the latest action.\n- Thought: Internal opinion/conflict/feeling.\n- Action: Immediate impulse/decision.\n]";
    expect(extractThoughtLoop(placeholderResponse)).toBeNull();
  });

  it("rejects output when it contains the template instruction description text", () => {
    const descResponse = "[\n- Intake: 1 sentence describing the direct sensory, physical, or verbal stimulus they are perceiving\n- Thought: 1 sentence describing their internal opinion\n- Action: 1 sentence describing their immediate impulse\n]";
    expect(extractThoughtLoop(descResponse)).toBeNull();
  });

  it("rejects output when it contains the example template thoughts literally", () => {
    const exampleResponse = "[\n- Intake: She slides the sealed letter across the table to me without a word.\n- Thought: This is a test of my discretion as much as it is an errand.\n- Action: I take it, tuck it into my sleeve, and hold her gaze evenly.\n]";
    expect(extractThoughtLoop(exampleResponse)).toBeNull();
  });

  it("passes already-clean output through unchanged", () => {
    const clean = "- Intake: a\n- Thought: b\n- Action: c";
    expect(extractThoughtLoop(clean)).toBe(clean);
  });

  it("extracts and formats multiple Intake-Thought-Action loops sequentially", () => {
    const multiResponse = `
    - Intake: Luna feels Slimey's trembling form.
    - Thought: A shimmering tragedy.
    - Action: Wrap him in embrace.
    - Intake: Stella watches Slimey's bewilderment.
    - Thought: His vulnerability is a challenge.
    - Action: Dial back aggression.
    `;
    const out = extractThoughtLoop(multiResponse);
    expect(out).toBe(
      "- Intake: Luna feels Slimey's trembling form.\n" +
      "- Thought: A shimmering tragedy.\n" +
      "- Action: Wrap him in embrace.\n" +
      "- Intake: Stella watches Slimey's bewilderment.\n" +
      "- Thought: His vulnerability is a challenge.\n" +
      "- Action: Dial back aggression."
    );
  });
});

describe("stripOuterBrackets", () => {
  let stripOuterBrackets: any;
  beforeEach(async () => {
    const bg = await import("../src/background/background");
    stripOuterBrackets = bg.stripOuterBrackets;
  });

  it("strips outer square brackets", () => {
    expect(stripOuterBrackets("[Lady Celeste Starfall\nAppearance: elegante\n]")).toBe("Lady Celeste Starfall\nAppearance: elegante");
  });

  it("strips outer curly braces", () => {
    expect(stripOuterBrackets("{Lady Celeste Starfall\nAppearance: elegante\n}")).toBe("Lady Celeste Starfall\nAppearance: elegante");
  });

  it("leaves text without outer brackets untouched", () => {
    expect(stripOuterBrackets("Lady Celeste Starfall\nAppearance: elegante")).toBe("Lady Celeste Starfall\nAppearance: elegante");
  });
});





