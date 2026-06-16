import { describe, it, expect } from "vitest";
import { MockProvider } from "../src/inference/provider";
import type { InferenceRequest, InferenceResponse } from "../src/inference/provider";

describe("MockProvider", () => {
  it("returns the canned response it was constructed with", async () => {
    const canned: InferenceResponse = { proposals: [{ name: "Kara", action: "update", newEntry: "x", changeSummary: "lost arm" }] };
    const p = new MockProvider(canned);
    const req: InferenceRequest = { protagonist: "Smoke", present: ["Kara"], narrative: "You watch Kara.", characters: [{ name: "Kara", currentEntry: "[Role: knight]" }] };
    const res = await p.infer(req);
    expect(res).toEqual(canned);
  });

  it("records the last request it received (for assertions)", async () => {
    const p = new MockProvider({ proposals: [] });
    const req: InferenceRequest = { protagonist: "Smoke", present: [], narrative: "n", characters: [] };
    await p.infer(req);
    expect(p.lastRequest).toEqual(req);
  });
});

describe("GeminiProvider", () => {
  const originalFetch = globalThis.fetch;

  it("complete() ignores parts marked with thought: true and returns only actual text", async () => {
    const provider = new (await import("../src/inference/gemini")).GeminiProvider("key123", "gemma-4-26b");
    
    globalThis.fetch = async (url: any) => {
      expect(String(url)).toContain("generativelanguage.googleapis.com");
      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: "* Character: Lady Celeste Starfall...\n - Intake: ...",
                    thought: true
                  },
                  {
                    text: "[\n- Intake: Real intake\n- Thought: Real thought\n- Action: Real action\n]"
                  }
                ]
              }
            }
          ]
        } as any)
      } as unknown as Response;
    };

    try {
      const res = await provider.complete("system instruction", "user prompt");
      expect(res).toBe("[\n- Intake: Real intake\n- Thought: Real thought\n- Action: Real action\n]");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("infer() ignores parts marked with thought: true and parses JSON from the actual text part", async () => {
    const provider = new (await import("../src/inference/gemini")).GeminiProvider("key123", "gemini-1.5-pro");
    
    globalThis.fetch = async (url: any) => {
      expect(String(url)).toContain("generativelanguage.googleapis.com");
      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: "thinking about output format...",
                    thought: true
                  },
                  {
                    text: '{"proposals":[{"name":"Kara","action":"update","newEntry":"x","changeSummary":"s"}]}'
                  }
                ]
              }
            }
          ]
        } as any)
      } as unknown as Response;
    };

    try {
      const req: InferenceRequest = { protagonist: "Smoke", present: ["Kara"], narrative: "n", characters: [] };
      const res = await provider.infer(req);
      expect(res.proposals).toHaveLength(1);
      expect(res.proposals[0]?.name).toBe("Kara");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
