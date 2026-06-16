import { describe, it, expect } from "vitest";
import { recordOp } from "../src/shared/op-registry";
import type { GqlOp } from "../src/shared/types";

describe("recordOp", () => {
  it("derives an OpRecord from a GraphQL op (read)", () => {
    const op: GqlOp = {
      operationName: "GetGameplayAdventure",
      query: "query GetGameplayAdventure($shortId: String, $limit: Int, $desc: Boolean) { x }",
      variables: { shortId: "Z", limit: 50, desc: true },
    };
    const rec = recordOp(op);
    expect(rec).not.toBeNull();
    expect(rec!.operationName).toBe("GetGameplayAdventure");
    expect(rec!.variableKeys).toEqual(["shortId", "limit", "desc"]);
    expect(rec!.kind).toBe("read");
  });

  it("classifies mutations as write", () => {
    const rec = recordOp({ operationName: "UseAutoSaveStoryCard", query: "mutation UseAutoSaveStoryCard($input: X) { x }", variables: { input: {} } });
    expect(rec!.kind).toBe("write");
  });

  it("returns null for ops without an operationName", () => {
    expect(recordOp({ operationName: null, query: "query { x }" })).toBeNull();
  });
});
