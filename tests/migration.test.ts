import { describe, it, expect, beforeEach } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { openDB } from "idb";
import { openAidDb, __resetDbForTests } from "../src/storage/db";
import { Repo } from "../src/storage/repo";

describe("v1 -> v2 migration", () => {
  beforeEach(() => { (globalThis as any).indexedDB = new IDBFactory(); __resetDbForTests(); });

  it("migrates a Plan-1 narrative record into per-action rows (no data loss)", async () => {
    // Build the v1 database exactly as Plan 1 had it.
    const v1 = await openDB("aid-tracker", 1, {
      upgrade(db) {
        db.createObjectStore("adventures", { keyPath: "shortId" });
        db.createObjectStore("narrative", { keyPath: "shortId" });
      },
    });
    await v1.put("narrative", {
      shortId: "Z",
      actions: [
        { id: "1", text: "first", type: "do", createdAt: "2026-05-30T00:00:01Z" },
        { id: "2", text: "second", type: "continue", createdAt: "2026-05-30T00:00:02Z" },
      ],
    } as any);
    v1.close();

    // Open v2 — triggers the migration upgrade(1 -> 2).
    await openAidDb();
    const repo = new Repo();
    const actions = await repo.getActions("Z");
    expect(actions.map((a) => a.id)).toEqual(["1", "2"]);
    expect(actions.map((a) => a.text)).toEqual(["first", "second"]);
  });

  it("migrates across multiple adventures", async () => {
    const v1 = await openDB("aid-tracker", 1, {
      upgrade(db) {
        db.createObjectStore("adventures", { keyPath: "shortId" });
        db.createObjectStore("narrative", { keyPath: "shortId" });
      },
    });
    await v1.put("narrative", { shortId: "A", actions: [{ id: "1", text: "a1", type: "do", createdAt: "2026-05-30T00:00:01Z" }] } as any);
    await v1.put("narrative", { shortId: "B", actions: [{ id: "1", text: "b1", type: "do", createdAt: "2026-05-30T00:00:01Z" }] } as any);
    v1.close();
    await openAidDb();
    const repo = new Repo();
    expect((await repo.getActions("A")).map((a) => a.text)).toEqual(["a1"]);
    expect((await repo.getActions("B")).map((a) => a.text)).toEqual(["b1"]);
  });
});
