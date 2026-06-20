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

  it("exportAll → importAll round-trips the full DB (survives an origin/UUID swap)", async () => {
    const repo = new Repo();
    await repo.upsertAdventure({ shortId: "Z", title: "Tale", protagonistName: "Kara" });
    await repo.putCards("Z", [{ shortId: "Z", id: "1", type: "character", title: "Kara", keys: "Kara", value: "[knight]", description: "[THOUGHT LOG]\n(turn 5)\n[Kara's Thoughts:\n- hi]" }]);
    await repo.putVersion({ id: "v1", shortId: "Z", characterName: "Kara", entry: "x", changeSummary: "s", status: "applied", createdAt: "2026-05-30T00:00:00Z" });
    await repo.setSettings({ provider: "claude", memoraidThoughtLookback: 4 } as any);

    expect(await repo.isDbEmpty()).toBe(false);
    const backup = await repo.exportAll();
    expect(backup.__aidBackup).toBe(true);
    expect(backup.stores.cards).toHaveLength(1);

    // Simulate the wipe: brand-new empty DB (new extension origin).
    (globalThis as any).indexedDB = new IDBFactory();
    __resetDbForTests();
    const fresh = new Repo();
    expect(await fresh.isDbEmpty()).toBe(true);

    const res = await fresh.importAll(backup);
    expect(res.ok).toBe(true);
    expect(await fresh.isDbEmpty()).toBe(false);
    const cards = await fresh.getCards("Z");
    expect(cards).toHaveLength(1);
    expect(cards[0]!.description).toContain("THOUGHT LOG"); // the rescued thought log
    expect((await fresh.getSettings())?.memoraidThoughtLookback).toBe(4);
    expect((await fresh.getVersions("Z"))[0]!.status).toBe("applied");
  });

  it("importAll rejects a non-backup object", async () => {
    const res = await new Repo().importAll({ foo: "bar" });
    expect(res.error).toBeTruthy();
    expect(res.ok).toBeUndefined();
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
