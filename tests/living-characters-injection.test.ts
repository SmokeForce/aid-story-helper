import { describe, it, expect, beforeEach, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";

// Mock the browser global before importing background (mirrors living-config-persist.test.ts).
(globalThis as any).browser = {
  storage: {
    session: {
      get: vi.fn().mockResolvedValue({ aidToken: "Bearer token123", aidEndpoint: "https://api.aidungeon.com/graphql" }),
      set: vi.fn().mockResolvedValue(undefined),
    },
  },
  runtime: { onMessage: { addListener: vi.fn() } },
  tabs: { query: vi.fn().mockResolvedValue([{ id: 1 }]), sendMessage: vi.fn().mockResolvedValue(undefined) },
};

import { Repo } from "../src/storage/repo";
import { __resetDbForTests } from "../src/storage/db";

globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) } as any);

// Regression: the public port dropped the Living Characters prompt-injection block from
// processInterceptedAction, so the handler never returned `injectText` — LC directives were never
// appended to the outgoing action (injected.ts also ignored injectText). Both sides are restored;
// this pins the background side end-to-end via the message listener.
describe("processInterceptedAction returns Living Characters injectText", () => {
  let repo: Repo;
  let listener: (msg: any) => any;
  const shortId = "lc-inject-01";

  beforeEach(async () => {
    (globalThis as any).indexedDB = new IDBFactory();
    __resetDbForTests();
    repo = new Repo();
    const bg = await import("../src/background/background");
    bg.__resetMemoraidStateForTests();
    listener = (browser.runtime.onMessage.addListener as any).mock.calls[0][0];
    await repo.setSettings({ provider: "claude", apiKeys: { claude: "sk-ant-123" }, enableLivingCharacters: true });
  });

  it("flushes a held directive onto an injectable action and clears the queue", async () => {
    // An identity-less held directive (owner/pressure empty) is always kept by filterLiveDirectives —
    // it flushes on the next do/say/story action, which is what a deferred continue/retry produces.
    const held = { owner: "", target: "", pressure: "", momentum: "", text: "[Veya feels rivalry toward you; let this surface naturally.]" };
    await repo.upsertAdventure({ shortId, title: "T", protagonistName: "Smoke", pendingInjections: [held], livingConfig: {} } as any);
    await repo.putActions(shortId, [{ id: "1", text: "I step inside.", type: "do", createdAt: "2026-06-07T00:00:00Z" }]);

    const res: any = await listener({ kind: "processInterceptedAction", shortId, text: "I look around.", type: "do" });
    expect(res?.ok).toBe(true);
    expect(res.injectText).toContain("let this surface naturally");

    // Queue is drained after a successful flush.
    const adv = await repo.getAdventure(shortId);
    expect(adv?.pendingInjections ?? []).toHaveLength(0);
    // And the injection was logged.
    const logs = await repo.getInjectionLog(shortId);
    expect(logs.some(l => l.directiveText.includes("let this surface naturally"))).toBe(true);
  });

  it("returns empty injectText when there is nothing to inject", async () => {
    await repo.upsertAdventure({ shortId, title: "T", protagonistName: "Smoke", livingConfig: {} } as any);
    await repo.putActions(shortId, [{ id: "1", text: "I wait.", type: "do", createdAt: "2026-06-07T00:00:00Z" }]);

    const res: any = await listener({ kind: "processInterceptedAction", shortId, text: "I wait quietly.", type: "do" });
    expect(res?.ok).toBe(true);
    expect(res.injectText || "").toBe("");
  });
});
