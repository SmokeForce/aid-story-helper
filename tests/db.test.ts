import { describe, it, expect, beforeEach } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { openAidDb, __resetDbForTests } from "../src/storage/db";

describe("openAidDb caching", () => {
  beforeEach(() => { (globalThis as any).indexedDB = new IDBFactory(); __resetDbForTests(); });

  it("returns the same connection instance across calls", async () => {
    const a = await openAidDb();
    const b = await openAidDb();
    expect(a).toBe(b);
  });

  it("returns a fresh connection after reset (new factory)", async () => {
    const a = await openAidDb();
    (globalThis as any).indexedDB = new IDBFactory();
    __resetDbForTests();
    const b = await openAidDb();
    expect(a).not.toBe(b);
  });
});
