import { describe, it, expect } from "vitest";
import { buildGameplayRequest, parseGameplayResponse } from "../src/sync/gameplay-fetch";

describe("buildGameplayRequest", () => {
  it("builds a batched POST with the op, variables, and auth header", () => {
    const req = buildGameplayRequest(
      "https://api-alpha.aidungeon.com/graphql",
      "query GetGameplayAdventure($shortId: String, $limit: Int, $desc: Boolean) { x }",
      "ZA93QDeU6633",
      "Bearer abc.def.ghi",
      100000
    );
    expect(req.url).toBe("https://api-alpha.aidungeon.com/graphql");
    expect(req.headers["authorization"]).toBe("Bearer abc.def.ghi");
    expect(req.headers["content-type"]).toMatch(/application\/json/);
    const body = JSON.parse(req.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].operationName).toBe("GetGameplayAdventure");
    expect(body[0].variables).toEqual({ shortId: "ZA93QDeU6633", limit: 100000, desc: true });
  });
});

describe("parseGameplayResponse", () => {
  const sample = [
    { data: { someOther: { x: 1 } } },
    { data: { adventure: {
      title: "Saving the Queen Bee",
      actionCount: 277,
      actionWindow: [
        { id: "0", text: "start", type: "start", undoneAt: null, deletedAt: null, createdAt: "2026-05-29T07:03:01Z", updatedAt: "2026-05-29T07:03:01Z" },
        { id: "1", text: "you do", type: "do", undoneAt: null, deletedAt: null, createdAt: "2026-05-29T07:04:00Z", updatedAt: "2026-05-29T07:04:00Z" },
      ],
      storyCards: [
        { id: "157197504", type: "character", title: "Jasmine", keys: "Jasmine", value: "[Role: influencer]" },
      ],
    } } },
  ];

  it("extracts actionWindow + title from a batched response", () => {
    const r = parseGameplayResponse(sample);
    expect(r.title).toBe("Saving the Queen Bee");
    expect(r.actions.map((a) => a.id)).toEqual(["0", "1"]);
    expect(r.actions[1]!.type).toBe("do");
  });

  it("handles a single (non-array) response object", () => {
    const r = parseGameplayResponse(sample[1]);
    expect(r.actions).toHaveLength(2);
  });

  it("returns empty actions when no adventure/actionWindow present", () => {
    const r = parseGameplayResponse([{ data: { nope: {} } }]);
    expect(r.actions).toEqual([]);
    expect(r.title).toBeUndefined();
  });

  it("extracts storyCards from the adventure object", () => {
    const r = parseGameplayResponse(sample);
    expect(r.storyCards).toHaveLength(1);
    expect(r.storyCards![0]!.title).toBe("Jasmine");
    expect(r.storyCards![0]!.type).toBe("character");
    expect(r.storyCards![0]!.value).toBe("[Role: influencer]");
  });

  it("extracts memory (Plot Essentials) from the adventure object", () => {
    const withMemory = [
      { data: { adventure: {
        title: "Saving the Queen Bee",
        actionCount: 277,
        actionWindow: [
          { id: "0", text: "start", type: "start", undoneAt: null, deletedAt: null, createdAt: "2026-05-29T07:03:01Z", updatedAt: "2026-05-29T07:03:01Z" },
        ],
        storyCards: [],
        memory: "[Jessica Sterling is the queen bee. Personality: manipulator.]",
      } } },
    ];
    const r = parseGameplayResponse(withMemory);
    expect(r.memory).toBeDefined();
    expect(r.memory).toContain("Jessica");
  });

  it("extracts aidMemories from the adventure state/gameState object", () => {
    const withMems = [
      { data: { adventure: {
        title: "Saving the Queen Bee",
        actionCount: 277,
        actionWindow: [
          { id: "0", text: "start", type: "start", undoneAt: null, deletedAt: null, createdAt: "2026-05-29T07:03:01Z", updatedAt: "2026-05-29T07:03:01Z" },
        ],
        storyCards: [],
        state: {
          memories: [
            { actionIds: [], text: "Preparing for the Weeping Crags...", lastRelevantActionId: "277" }
          ]
        }
      } } }
    ];
    const r = parseGameplayResponse(withMems);
    expect(r.aidMemories).toBeDefined();
    expect(r.aidMemories).toHaveLength(1);
    expect(r.aidMemories![0]!.text).toBe("Preparing for the Weeping Crags...");
    expect(r.aidMemories![0]!.lastRelevantActionId).toBe("277");
  });

  it("extracts authorsNote from multiple potential locations", () => {
    const r1 = parseGameplayResponse([
      { data: { adventure: {
        actionWindow: [],
        authorsNote: "Direct author note"
      } } }
    ]);
    expect(r1.authorsNote).toBe("Direct author note");

    const r2 = parseGameplayResponse([
      { data: { adventure: {
        actionWindow: [],
        state: { authorsNote: "State author note" }
      } } }
    ]);
    expect(r2.authorsNote).toBe("State author note");

    const r3 = parseGameplayResponse([
      { data: { adventure: {
        actionWindow: [],
        gameState: { authorsNote: "GameState author note" }
      } } }
    ]);
    expect(r3.authorsNote).toBe("GameState author note");
  });

  it("extracts instructions (AI Instructions) from multiple potential locations", () => {
    const r1 = parseGameplayResponse([
      { data: { adventure: {
        actionWindow: [],
        state: { instructions: "State direct string" }
      } } }
    ]);
    expect(r1.instructions).toBe("State direct string");

    const r2 = parseGameplayResponse([
      { data: { adventure: {
        actionWindow: [],
        state: { instructions: { custom: "State custom instructions" } }
      } } }
    ]);
    expect(r2.instructions).toBe("State custom instructions");

    const r3 = parseGameplayResponse([
      { data: { adventure: {
        actionWindow: [],
        gameState: { instructions: "GameState direct string" }
      } } }
    ]);
    expect(r3.instructions).toBe("GameState direct string");

    const r4 = parseGameplayResponse([
      { data: { adventure: {
        actionWindow: [],
        gameState: { instructions: { custom: "GameState custom instructions" } }
      } } }
    ]);
    expect(r4.instructions).toBe("GameState custom instructions");
  });
});
