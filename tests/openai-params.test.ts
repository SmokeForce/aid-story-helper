import { describe, it, expect, afterEach } from "vitest";
import { OpenAIProvider, isRestrictedParamModel, adaptUnsupportedParam } from "../src/inference/openai";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

/** Capture every request body sent, replaying canned responses in order. */
function mockOpenAI(responses: Array<{ status: number; body?: string; text?: string }>) {
  const bodies: any[] = [];
  let i = 0;
  globalThis.fetch = (async (_url: any, init: any) => {
    bodies.push(JSON.parse(init.body));
    const r = responses[Math.min(i, responses.length - 1)]!;
    i++;
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      headers: { get: () => null },
      text: async () => r.text ?? "",
      json: async () => JSON.parse(r.body ?? "{}"),
    } as unknown as Response;
  }) as typeof fetch;
  return { bodies, count: () => i };
}

const OK = { status: 200, body: JSON.stringify({ choices: [{ message: { content: "hi" } }] }) };

describe("isRestrictedParamModel", () => {
  it("flags o-series and gpt-5 families", () => {
    for (const m of ["o1", "o1-mini", "o3", "o3-mini", "o4-mini", "gpt-5", "gpt-5-turbo"]) {
      expect(isRestrictedParamModel(m), m).toBe(true);
    }
  });
  it("leaves conventional chat models alone", () => {
    for (const m of ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo", "chatgpt-4o-latest"]) {
      expect(isRestrictedParamModel(m), m).toBe(false);
    }
  });
});

describe("adaptUnsupportedParam (pure)", () => {
  it("renames max_tokens → max_completion_tokens on the reported error", () => {
    // The exact message users hit: "Max_tokens is not supported by this model"
    const out = adaptUnsupportedParam({ model: "o3", max_tokens: 4096 }, "Max_tokens is not supported by this model");
    expect(out).toEqual({ model: "o3", max_completion_tokens: 4096 });
  });

  it("drops an unsupported temperature", () => {
    const out = adaptUnsupportedParam(
      { model: "o3", temperature: 0.7 },
      "Unsupported value: 'temperature' does not support 0.7 with this model. Only the default (1) is supported.",
    );
    expect(out).toEqual({ model: "o3" });
  });

  it("returns null for unrelated errors so the real error surfaces", () => {
    expect(adaptUnsupportedParam({ model: "x", max_tokens: 1 }, "Incorrect API key provided")).toBeNull();
    expect(adaptUnsupportedParam({ model: "x" }, "max_tokens is not supported")).toBeNull(); // nothing to adapt
  });
});

describe("OpenAIProvider parameter handling", () => {
  it("sends max_tokens + temperature for a conventional model", async () => {
    const m = mockOpenAI([OK]);
    await new OpenAIProvider("k", "gpt-4o-mini", 0.7).complete("sys", "usr");
    expect(m.bodies[0].max_tokens).toBe(4096);
    expect(m.bodies[0].max_completion_tokens).toBeUndefined();
    expect(m.bodies[0].temperature).toBe(0.7);
  });

  it("sends max_completion_tokens and NO temperature for a reasoning model", async () => {
    const m = mockOpenAI([OK]);
    await new OpenAIProvider("k", "o3-mini", 0.7).complete("sys", "usr");
    expect(m.bodies[0].max_completion_tokens).toBe(4096);
    expect(m.bodies[0].max_tokens).toBeUndefined();
    expect(m.bodies[0].temperature).toBeUndefined();
    expect(m.count()).toBe(1); // no wasted round-trip — name detection got it right first try
  });

  it("recovers from an unanticipated model rejecting max_tokens (the live failure)", async () => {
    const m = mockOpenAI([
      { status: 400, text: "Max_tokens is not supported by this model" },
      OK,
    ]);
    // A model name we do NOT classify as restricted, so the first attempt uses max_tokens.
    const out = await new OpenAIProvider("k", "some-future-model", 0.7).complete("sys", "usr");
    expect(out).toBe("hi");
    expect(m.bodies[0].max_tokens).toBe(4096);
    expect(m.bodies[1].max_completion_tokens).toBe(4096);
    expect(m.bodies[1].max_tokens).toBeUndefined();
  });

  it("surfaces a genuine error instead of retrying forever", async () => {
    mockOpenAI([{ status: 401, text: "Incorrect API key provided" }]);
    await expect(new OpenAIProvider("bad", "gpt-4o", 0.7).complete("s", "u"))
      .rejects.toThrow(/HTTP 401 - Incorrect API key/);
  });

  it("omits temperature on infer() for reasoning models", async () => {
    const m = mockOpenAI([{ status: 200, body: JSON.stringify({ choices: [{ message: { content: '{"proposals":[]}' } }] }) }]);
    await new OpenAIProvider("k", "o3-mini").infer({ protagonist: "S", present: [], narrative: "n", characters: [] });
    expect(m.bodies[0].temperature).toBeUndefined();
  });
});
