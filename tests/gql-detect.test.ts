import { describe, it, expect } from "vitest";
import { extractOps } from "../src/shared/gql-detect";

describe("extractOps", () => {
  it("flattens a batched array body", () => {
    const body = [
      { operationName: "GetResources", query: "query GetResources { x }", variables: {} },
      { operationName: "ActionRequest", query: "mutation ActionRequest($input: X) { y }", variables: { input: { text: "hi" } } },
    ];
    const ops = extractOps(body);
    expect(ops.map((o) => o.operationName)).toEqual(["GetResources", "ActionRequest"]);
  });

  it("wraps a single (non-array) op", () => {
    const ops = extractOps({ operationName: "GetAdventure", query: "query {}", variables: { shortId: "Z" } });
    expect(ops).toHaveLength(1);
    expect(ops[0]!.operationName).toBe("GetAdventure");
  });

  it("returns [] for non-graphql bodies", () => {
    expect(extractOps("not json")).toEqual([]);
    expect(extractOps(null)).toEqual([]);
    expect(extractOps({ foo: 1 })).toEqual([]);
  });
});
