import { describe, it, expect, beforeEach } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { Repo } from "../src/storage/repo";
import { __resetDbForTests } from "../src/storage/db";

describe("Repo cards/versions/settings", () => {
  beforeEach(() => { (globalThis as any).indexedDB = new IDBFactory(); __resetDbForTests(); });

  it("stores and lists cards by shortId", async () => {
    const repo = new Repo();
    await repo.putCards("Z", [{ shortId: "Z", id: "1", type: "character", title: "Kara", keys: "Kara", value: "[Role: knight]" }]);
    expect((await repo.getCards("Z")).map((c) => c.title)).toEqual(["Kara"]);
  });

  it("stores versions and updates status, listed by shortId ordered by createdAt", async () => {
    const repo = new Repo();
    await repo.putVersion({ id: "v1", shortId: "Z", characterName: "Kara", entry: "x", changeSummary: "lost arm", status: "pending", createdAt: "2026-05-30T00:00:00Z" });
    await repo.setVersionStatus("v1", "applied");
    const vs = await repo.getVersions("Z");
    expect(vs).toHaveLength(1);
    expect(vs[0]!.status).toBe("applied");
  });

  it("round-trips settings (singleton)", async () => {
    const repo = new Repo();
    await repo.setSettings({ provider: "claude", model: "claude-opus-4-8", apiKeys: { claude: "sk-x" } });
    const s = await repo.getSettings();
    expect(s?.provider).toBe("claude");
    expect(s?.apiKeys?.claude).toBe("sk-x");
  });
});

describe("Repo card archival (reconcileDeletedCards)", () => {
  beforeEach(() => { (globalThis as any).indexedDB = new IDBFactory(); __resetDbForTests(); });
  it("archives cards absent from the present set, leaves present ones untouched", async () => {
    const repo = new Repo();
    await repo.putCards("Z", [
      { shortId: "Z", id: "1", type: "character", keys: "A", value: "a" },
      { shortId: "Z", id: "2", type: "location", keys: "B", value: "b" },
    ]);
    await repo.reconcileDeletedCards("Z", ["1"]); // id "2" absent -> archived
    const cards = await repo.getCards("Z");
    const c1 = cards.find((c) => c.id === "1");
    const c2 = cards.find((c) => c.id === "2");
    expect(c1?.deletedAt ?? null).toBe(null);
    expect(typeof c2?.deletedAt).toBe("string");
  });
});
