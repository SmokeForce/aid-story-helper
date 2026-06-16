import { describe, it, expect } from "vitest";
import { buildGraphQLMutation, buildCardSave, buildCardCreate, buildMemorySave, buildEditMemory } from "../src/inference/writeback";

describe("buildGraphQLMutation", () => {
  it("builds a batched mutation POST with operationName, variables, and auth", () => {
    const r = buildGraphQLMutation(
      "https://api-alpha.aidungeon.com/graphql",
      "mutation UseAutoSaveStoryCard($input: X) { x }",
      "Bearer abc.def",
      "UseAutoSaveStoryCard",
      { input: { id: "1", value: "new entry" } }
    );
    expect(r.url).toBe("https://api-alpha.aidungeon.com/graphql");
    expect(r.headers["authorization"]).toBe("Bearer abc.def");
    expect(r.headers["content-type"]).toMatch(/application\/json/);
    const body = JSON.parse(r.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].operationName).toBe("UseAutoSaveStoryCard");
    expect(body[0].variables).toEqual({ input: { id: "1", value: "new entry" } });
    expect(body[0].query).toContain("UseAutoSaveStoryCard");
  });
});

describe("buildCardSave", () => {
  it("builds UseAutoSaveStoryCard mutation with correctly structured variables", () => {
    const card = {
      shortId: "ZA93Q",
      id: "902581929",
      type: "character",
      title: "Mia Johansson",
      keys: "Mia, Johansson",
      value: "old entry",
    };
    const r = buildCardSave(
      "https://api.aidungeon.com/graphql",
      "mutation UseAutoSaveStoryCard($input: UpdateStoryCardInput!) { updateStoryCard(input: $input) { success } }",
      "Bearer token123",
      card,
      "new entry text"
    );

    expect(r.url).toBe("https://api.aidungeon.com/graphql");
    expect(r.headers["authorization"]).toBe("Bearer token123");
    const body = JSON.parse(r.body)[0];
    expect(body.operationName).toBe("UseAutoSaveStoryCard");
    expect(body.variables.input).toEqual({
      id: "902581929",
      type: "character",
      title: "Mia Johansson",
      description: "",
      keys: "Mia, Johansson",
      value: "new entry text",
      shortId: "ZA93Q",
      contentType: "adventure",
      useForCharacterCreation: false,
    });
  });
});

describe("buildCardCreate", () => {
  it("builds SaveQueueStoryCard mutation with correctly structured variables", () => {
    const card = {
      shortId: "ZA93Q",
      id: "902581929",
      type: "character",
      title: "Anna (Memory)",
      keys: "anna, anna's memory",
      value: "initial thoughts",
    };
    const r = buildCardCreate(
      "https://api.aidungeon.com/graphql",
      "mutation SaveQueueStoryCard($input: UpdateStoryCardInput!) { updateStoryCard(input: $input) { success } }",
      "Bearer token123",
      card,
      "generated entry text"
    );

    expect(r.url).toBe("https://api.aidungeon.com/graphql");
    expect(r.headers["authorization"]).toBe("Bearer token123");
    const body = JSON.parse(r.body)[0];
    expect(body.operationName).toBe("SaveQueueStoryCard");
    expect(body.variables.input).toEqual({
      id: "902581929",
      type: "character",
      title: "Anna (Memory)",
      description: "",
      keys: "anna, anna's memory",
      value: "generated entry text",
      shortId: "ZA93Q",
      contentType: "adventure",
      useForCharacterCreation: false,
    });
  });
});

describe("buildMemorySave", () => {
  it("builds UpdateAdventurePlot mutation with correctly structured variables", () => {
    const r = buildMemorySave(
      "https://api.aidungeon.com/graphql",
      "mutation UpdateAdventurePlot($input: AdventurePlotInput) { updateAdventurePlot(input: $input) { success } }",
      "Bearer token123",
      "ZA93Q",
      "new memory text",
      "some author note"
    );

    expect(r.url).toBe("https://api.aidungeon.com/graphql");
    expect(r.headers["authorization"]).toBe("Bearer token123");
    const body = JSON.parse(r.body)[0];
    expect(body.operationName).toBe("UpdateAdventurePlot");
    expect(body.variables.input).toEqual({
      shortId: "ZA93Q",
      thirdPerson: false,
      memory: "new memory text",
      authorsNote: "some author note",
    });
  });

  it("defaults authorsNote to empty string", () => {
    const r = buildMemorySave(
      "https://api.aidungeon.com/graphql",
      "mut",
      "Bearer token123",
      "ZA93Q",
      "new memory text"
    );
    const body = JSON.parse(r.body)[0];
    expect(body.variables.input.authorsNote).toBe("");
  });
});

describe("buildEditMemory", () => {
  it("builds EditMemory mutation with correctly structured variables", () => {
    const r = buildEditMemory(
      "https://api-alpha.aidungeon.com/graphql",
      "mutation EditMemory($input: EditMemoryInput!) { editMemory(input: $input) { success } }",
      "Bearer token123",
      "6y1tn2Vj-QMD",
      "27",
      "updated memory text"
    );

    expect(r.url).toBe("https://api-alpha.aidungeon.com/graphql");
    expect(r.headers["authorization"]).toBe("Bearer token123");
    const body = JSON.parse(r.body)[0];
    expect(body.operationName).toBe("EditMemory");
    expect(body.variables.input).toEqual({
      adventureId: "6y1tn2Vj-QMD",
      actionId: "27",
      text: "updated memory text"
    });
  });
});


