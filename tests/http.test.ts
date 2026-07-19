import { describe, it, expect, afterEach } from "vitest";
import { fetchWithRetry, parseRetryAfter } from "../src/inference/http";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

/** Mock fetch that replays a sequence of canned responses; last entry repeats. Records call count. */
function mockSequence(responses: Array<{ status: number; headers?: Record<string, string>; body?: string }>) {
  let i = 0;
  globalThis.fetch = (async () => {
    const r = responses[Math.min(i, responses.length - 1)]!;
    i++;
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      headers: { get: (k: string) => r.headers?.[k.toLowerCase()] ?? null },
      text: async () => r.body ?? "",
      json: async () => (r.body ? JSON.parse(r.body) : {}),
    } as unknown as Response;
  }) as typeof fetch;
  return { count: () => i };
}

describe("parseRetryAfter", () => {
  it("parses delta-seconds", () => expect(parseRetryAfter("3")).toBe(3));
  it("returns null for missing/garbage", () => {
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter("not-a-date")).toBeNull();
  });
});

describe("fetchWithRetry", () => {
  it("returns the response on a first success (single call)", async () => {
    const m = mockSequence([{ status: 200, body: '{"ok":true}' }]);
    const res = await fetchWithRetry("https://x", { method: "POST" });
    expect(res.ok).toBe(true);
    expect(m.count()).toBe(1);
  });

  it("retries a 429 then succeeds (Retry-After: 0 → no wait)", async () => {
    const m = mockSequence([
      { status: 429, headers: { "retry-after": "0" } },
      { status: 200, body: "ok" },
    ]);
    const res = await fetchWithRetry("https://x", {}, { label: "Test" });
    expect(res.ok).toBe(true);
    expect(m.count()).toBe(2);
  });

  it("returns a non-retryable 400 immediately (no retry, no throw)", async () => {
    const m = mockSequence([{ status: 400, body: "bad" }]);
    const res = await fetchWithRetry("https://x", {});
    expect(res.status).toBe(400);
    expect(m.count()).toBe(1);
  });

  it("exhausts attempts on a persistent 429 and returns the last response", async () => {
    const m = mockSequence([{ status: 429, headers: { "retry-after": "0" } }]);
    const res = await fetchWithRetry("https://x", {}, { maxAttempts: 3 });
    expect(res.status).toBe(429);
    expect(m.count()).toBe(3);
  });

  it("throws a labeled timeout error when a request exceeds the timeout", async () => {
    globalThis.fetch = ((_url: any, init: any) => new Promise((_, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const e: any = new Error("aborted"); e.name = "AbortError"; reject(e);
      });
    })) as typeof fetch;
    await expect(
      fetchWithRetry("https://x", {}, { timeoutMs: 20, maxAttempts: 1, label: "Ollama" }),
    ).rejects.toThrow(/Ollama request failed: timed out after 20ms/);
  });
});
