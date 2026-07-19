import { describe, it, expect } from "vitest";
import { buildClaudeRequest } from "../src/inference/claude";

function body(r: { body: string }) { return JSON.parse(r.body); }

describe("buildClaudeRequest — temperature + max_tokens (C+D)", () => {
  it("omits temperature and defaults max_tokens when no extras are given (infer path unchanged)", () => {
    const b = body(buildClaudeRequest("k", "claude-x", "sys", "usr"));
    expect(b.temperature).toBeUndefined();
    expect(b.max_tokens).toBe(8192);
  });

  it("passes temperature through and clamps it to Anthropic's 0–1 range", () => {
    expect(body(buildClaudeRequest("k", "m", "s", "u", undefined, { temperature: 0.7 })).temperature).toBe(0.7);
    expect(body(buildClaudeRequest("k", "m", "s", "u", undefined, { temperature: 1.8 })).temperature).toBe(1);
    expect(body(buildClaudeRequest("k", "m", "s", "u", undefined, { temperature: -0.5 })).temperature).toBe(0);
  });

  it("honors a maxTokens override", () => {
    expect(body(buildClaudeRequest("k", "m", "s", "u", undefined, { maxTokens: 512 })).max_tokens).toBe(512);
  });

  it("emits a cache-controlled prefix block when cachePrefix is set", () => {
    const b = body(buildClaudeRequest("k", "m", "s", "tail", "STABLE PREFIX"));
    const content = b.messages[0].content;
    expect(Array.isArray(content)).toBe(true);
    expect(content[0]).toEqual({ type: "text", text: "STABLE PREFIX", cache_control: { type: "ephemeral" } });
    expect(content[1]).toEqual({ type: "text", text: "tail" });
  });

  it("sends a plain string user turn when there is no cachePrefix", () => {
    const b = body(buildClaudeRequest("k", "m", "s", "usr"));
    expect(b.messages[0].content).toBe("usr");
  });
});
