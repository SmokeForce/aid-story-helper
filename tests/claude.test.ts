import { describe, it, expect } from "vitest";
import { buildClaudeRequest, parseClaudeResponse } from "../src/inference/claude";

describe("buildClaudeRequest", () => {
  it("builds an Anthropic Messages request with caching + browser header", () => {
    const r = buildClaudeRequest("sk-ant-123", "claude-x", "SYSTEM RULES", "USER PAYLOAD");
    expect(r.url).toBe("https://api.anthropic.com/v1/messages");
    expect(r.headers["x-api-key"]).toBe("sk-ant-123");
    expect(r.headers["anthropic-version"]).toBe("2023-06-01");
    expect(r.headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
    expect(r.headers["content-type"]).toMatch(/application\/json/);
    const body = JSON.parse(r.body);
    expect(body.model).toBe("claude-x");
    expect(typeof body.max_tokens).toBe("number");
    // system is a cache-eligible block array
    expect(Array.isArray(body.system)).toBe(true);
    expect(body.system[0].text).toBe("SYSTEM RULES");
    expect(body.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(body.messages).toEqual([{ role: "user", content: "USER PAYLOAD" }]);
  });
});

describe("parseClaudeResponse", () => {
  it("extracts and parses the JSON content block", () => {
    const json = { content: [{ type: "text", text: '{"proposals":[{"name":"Kara","action":"update","newEntry":"x","changeSummary":"s"}]}' }] };
    const r = parseClaudeResponse(json);
    expect(r.proposals).toHaveLength(1);
    expect(r.proposals[0]!.name).toBe("Kara");
  });

  it("strips ```json fences before parsing", () => {
    const fenced = "```json\n{\"proposals\":[]}\n```";
    const r = parseClaudeResponse({ content: [{ type: "text", text: fenced }] });
    expect(r.proposals).toEqual([]);
  });

  it("returns empty proposals on malformed/empty content", () => {
    expect(parseClaudeResponse({ content: [{ type: "text", text: "not json" }] }).proposals).toEqual([]);
    expect(parseClaudeResponse({}).proposals).toEqual([]);
    expect(parseClaudeResponse(null).proposals).toEqual([]);
  });

  it("extracts JSON even when wrapped in prose", () => {
    const text = 'Here are the updates:\n```json\n{"proposals":[{"name":"Kara","action":"update","newEntry":"x","changeSummary":"s"}]}\n```\nHope that helps!';
    const r = parseClaudeResponse({ content: [{ type: "text", text }] });
    expect(r.proposals).toHaveLength(1);
  });

  it("extracts a bare JSON object embedded in prose (no fences)", () => {
    const text = 'Sure. {"proposals":[{"name":"Kara","action":"update","newEntry":"x","changeSummary":"s"}]} Done.';
    const r = parseClaudeResponse({ content: [{ type: "text", text }] });
    expect(r.proposals).toHaveLength(1);
  });

  it("skips non-text leading content blocks", () => {
    const r = parseClaudeResponse({ content: [{ type: "thinking", thinking: "hmm" }, { type: "text", text: '{"proposals":[]}' }] });
    expect(r.proposals).toEqual([]);
  });
});
