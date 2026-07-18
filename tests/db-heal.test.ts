import { describe, it, expect, beforeEach } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { sanitizeCrystallizedState, type CrystallizedState } from "../src/inference/crystallized";
import { Repo } from "../src/storage/repo";
import { __resetDbForTests } from "../src/storage/db";

const state = (o: Partial<CrystallizedState>): CrystallizedState => ({
  schema: [], nodes: [], unreferencedPasses: {}, outlook: [], preferences: [], ...o,
});

describe("sanitizeCrystallizedState (pure)", () => {
  it("drops empty Knows / nodes / outlook / preferences and keeps the valid ones", () => {
    const dirty = state({
      schema: [
        { subject: "Cameron", text: "" },        // empty text
        { subject: "", text: "orphaned" },        // empty subject
        { subject: "Rena", text: "a friend" },
      ],
      nodes: [
        { id: "n1", vibrancy: 3, snapshot: "   ", links: [] },
        { id: "n2", vibrancy: 2, snapshot: "a vivid scene", links: [] },
      ],
      outlook: [{ text: "", strength: 3 }, { text: "I stay guarded.", strength: 2 }],
      preferences: [{ text: "  ", strength: 1 }, { text: "always orders dessert", strength: 1 }],
    });
    const { state: clean, changed } = sanitizeCrystallizedState(dirty);
    expect(changed).toBe(true);
    expect(clean.schema).toEqual([{ subject: "Rena", text: "a friend" }]);
    expect(clean.nodes.map((n) => n.snapshot)).toEqual(["a vivid scene"]);
    expect(clean.outlook).toEqual([{ text: "I stay guarded.", strength: 2 }]);
    expect(clean.preferences).toEqual([{ text: "always orders dessert", strength: 1 }]);
  });

  it("is a no-op on an already-clean state (changed=false, same reference)", () => {
    const clean = state({ schema: [{ subject: "Rena", text: "a friend" }] });
    const res = sanitizeCrystallizedState(clean);
    expect(res.changed).toBe(false);
    expect(res.state).toBe(clean);
  });
});

describe("repo.healAllCrystallizedState (DB)", () => {
  let repo: Repo;
  beforeEach(() => {
    (globalThis as any).indexedDB = new IDBFactory();
    __resetDbForTests();
    repo = new Repo();
  });

  it("sanitizes every stored state, reports the count, and is idempotent", async () => {
    await repo.putCrystallizedState("adv1", "cameron", state({ schema: [{ subject: "Cameron", text: "" }] }));
    await repo.putCrystallizedState("adv1", "rena", state({ schema: [{ subject: "Rena", text: "a friend" }] }));

    const healed = await repo.healAllCrystallizedState();
    expect(healed).toBe(1); // only cameron had an empty entry to drop

    expect((await repo.getCrystallizedState("adv1", "cameron"))?.schema).toEqual([]);
    expect((await repo.getCrystallizedState("adv1", "rena"))?.schema).toEqual([{ subject: "Rena", text: "a friend" }]);

    // Re-running heals nothing (already clean).
    expect(await repo.healAllCrystallizedState()).toBe(0);
  });
});
