import { describe, it, expect } from "vitest";
import {
  requestHasNativeCardGeneration,
  generatedCardIdsFromRequest,
  collectGeneratedCardUpdates,
} from "../src/shared/native-generate";

// A native AI Dungeon card generation issues its card-generation mutation. The interceptor must adopt
// the freshly generated value instead of reverting it to the page-load snapshot — but it must NOT start
// trusting arbitrary query responses over its cache, or the anti-stale-autosave guard breaks. These
// tests pin both directions.
describe("native-generate guard helpers", () => {
  const genOp = (id?: string) => ({
    operationName: "GenerateStoryCard",
    variables: id ? { input: { id } } : {},
    query: "mutation GenerateStoryCard { ... }",
  });
  const genResult = (id: string, value: string, description?: string) => ({
    data: { generateStoryCard: { storyCard: { __typename: "StoryCard", id, value, description } } },
  });

  describe("requestHasNativeCardGeneration", () => {
    it("detects the op in an array batch, an object body, and a JSON string", () => {
      expect(requestHasNativeCardGeneration([genOp("c1"), { operationName: "GetStoryCard" }])).toBe(true);
      expect(requestHasNativeCardGeneration(genOp("c1"))).toBe(true);
      expect(requestHasNativeCardGeneration(JSON.stringify([genOp("c1")]))).toBe(true);
    });
    it("is false for ordinary traffic", () => {
      expect(requestHasNativeCardGeneration([{ operationName: "UseAutoSaveStoryCard" }])).toBe(false);
      expect(requestHasNativeCardGeneration("not json")).toBe(false);
      expect(requestHasNativeCardGeneration(null)).toBe(false);
    });
  });

  describe("generatedCardIdsFromRequest", () => {
    it("extracts the target id across field shapes", () => {
      expect(generatedCardIdsFromRequest([genOp("card-1")])).toEqual(["card-1"]);
      expect(generatedCardIdsFromRequest([{ operationName: "GenerateStoryCard", variables: { storyCardId: "card-2" } }])).toEqual(["card-2"]);
      expect(generatedCardIdsFromRequest([{ operationName: "GenerateStoryCard", variables: { id: "card-3" } }])).toEqual(["card-3"]);
    });
    it("returns [] when the id isn't present (caller falls back to suppression)", () => {
      expect(generatedCardIdsFromRequest([genOp(undefined)])).toEqual([]);
      expect(generatedCardIdsFromRequest([{ operationName: "GetStoryCard", variables: { id: "x" } }])).toEqual([]);
    });
  });

  describe("collectGeneratedCardUpdates", () => {
    it("adopts the generated value from a lone GenerateStoryCard response", () => {
      const updates = collectGeneratedCardUpdates(genOp("card-1"), genResult("card-1", "GENERATED", "new desc"));
      expect(updates).toEqual([{ id: "card-1", value: "GENERATED", description: "new desc" }]);
    });

    it("adopts from a JSON-string request/response too", () => {
      const updates = collectGeneratedCardUpdates(JSON.stringify([genOp("card-1")]), JSON.stringify([genResult("card-1", "GENERATED")]));
      expect(updates).toEqual([{ id: "card-1", value: "GENERATED" }]);
    });

    it("index-correlates: in a batch it adopts ONLY the generation result, not a sibling query's card", () => {
      const reqBatch = [genOp("card-gen"), { operationName: "GetStoryCard", variables: {} }];
      const resBatch = [
        genResult("card-gen", "FRESH"),
        { data: { storyCard: { __typename: "StoryCard", id: "card-other", value: "possibly-stale" } } },
      ];
      const updates = collectGeneratedCardUpdates(reqBatch, resBatch);
      expect(updates).toEqual([{ id: "card-gen", value: "FRESH" }]);
      expect(updates.some((u) => u.id === "card-other")).toBe(false);
    });

    it("returns [] for ordinary responses — the stale-value guard stays intact for non-generation traffic", () => {
      const req = [{ operationName: "GetAdventure", variables: {} }];
      const res = [{ data: { storyCard: { __typename: "StoryCard", id: "card-1", value: "server-value" } } }];
      expect(collectGeneratedCardUpdates(req, res)).toEqual([]);
    });
  });
});
