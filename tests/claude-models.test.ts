import { describe, it, expect } from "vitest";
import { buildModelsRequest, parseModelsResponse } from "../src/inference/claude";

describe("buildModelsRequest", () => {
  it("GET /v1/models with auth + version + browser header", () => {
    const r = buildModelsRequest("sk-ant-1");
    expect(r.url).toMatch(/^https:\/\/api\.anthropic\.com\/v1\/models/);
    expect(r.headers["x-api-key"]).toBe("sk-ant-1");
    expect(r.headers["anthropic-version"]).toBe("2023-06-01");
    expect(r.headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
  });
});

describe("parseModelsResponse", () => {
  it("extracts model ids from data[].id", () => {
    const ids = parseModelsResponse({ data: [{ id: "claude-opus-4-1-20250805" }, { id: "claude-sonnet-4-5-20250929" }] });
    expect(ids).toEqual(["claude-opus-4-1-20250805", "claude-sonnet-4-5-20250929"]);
  });
  it("filters out the legacy/unavailable claude-fable-5 model", () => {
    const ids = parseModelsResponse({
      data: [
        { id: "claude-opus-4-1-20250805" },
        { id: "claude-fable-5" },
        { id: "claude-sonnet-4-5-20250929" }
      ]
    });
    expect(ids).toEqual(["claude-opus-4-1-20250805", "claude-sonnet-4-5-20250929"]);
  });
  it("returns [] for malformed", () => {
    expect(parseModelsResponse(null)).toEqual([]);
    expect(parseModelsResponse({})).toEqual([]);
  });
});
