import { describe, it, expect, beforeEach } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { Repo } from "../src/storage/repo";
import { exportAdventure } from "../src/storage/export";
import { __resetDbForTests } from "../src/storage/db";
import type { CardRow } from "../src/shared/types";

describe("exportAdventure", () => {
  beforeEach(() => {
    (globalThis as any).indexedDB = new IDBFactory();
    __resetDbForTests();
  });

  it("serializes an adventure's metadata + actions into a versioned JSON object", async () => {
    const repo = new Repo();
    await repo.upsertAdventure({ shortId: "Z", title: "Queen Bee" });
    await repo.replaceAllActions("Z", [{ id: "1", text: "You open the door.", type: "do" }]);

    const out = await exportAdventure(repo, "Z");
    expect(out.schema).toBe("aid-tracker/export@1");
    expect(out.adventure.shortId).toBe("Z");
    expect(out.adventure.title).toBe("Queen Bee");
    expect(out.actions).toHaveLength(1);
    expect(out.actions[0]!.text).toBe("You open the door.");
    // round-trips through JSON without loss
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });

  it("exports the full action history ordered oldest->newest regardless of insert order", async () => {
    const repo = new Repo();
    await repo.upsertAdventure({ shortId: "Z", title: "T" });
    await repo.putActions("Z", [
      { id: "3", text: "c", type: "do", createdAt: "2026-05-30T00:00:03Z" },
      { id: "1", text: "a", type: "do", createdAt: "2026-05-30T00:00:01Z" },
      { id: "2", text: "b", type: "continue", createdAt: "2026-05-30T00:00:02Z" },
    ]);
    const out = await exportAdventure(repo, "Z");
    expect(out.actions.map((a) => a.id)).toEqual(["1", "2", "3"]);
    expect(out.actions.map((a) => a.text)).toEqual(["a", "b", "c"]);
  });

  it("includes cards and versions (empty arrays when none stored)", async () => {
    const repo = new Repo();
    await repo.upsertAdventure({ shortId: "Z", title: "T" });
    const out = await exportAdventure(repo, "Z");
    expect(Array.isArray(out.cards)).toBe(true);
    expect(Array.isArray(out.versions)).toBe(true);
  });

  it("includes seeded cards in the export", async () => {
    const repo = new Repo();
    await repo.upsertAdventure({ shortId: "Z", title: "T" });
    const card: CardRow = { shortId: "Z", id: "157197504", type: "character", title: "Jasmine", keys: "Jasmine", value: "[Role: influencer]" };
    await repo.putCards("Z", [card]);
    const out = await exportAdventure(repo, "Z");
    expect(out.cards).toHaveLength(1);
    expect(out.cards[0]!.title).toBe("Jasmine");
    expect(out.cards[0]!.type).toBe("character");
    expect(out.cards[0]!.shortId).toBe("Z");
  });
});
