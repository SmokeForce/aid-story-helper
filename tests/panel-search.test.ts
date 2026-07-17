import { describe, it, expect } from "vitest";
import { searchPanelItems, pendingDecisionsCount, recentDecidedVersions } from "../src/inference/panel-search";

const card = (id: string, title: string, keys = "", type = "character", deletedAt?: string) =>
  ({ id, shortId: "s", title, keys, type, value: "", deletedAt } as any);

describe("searchPanelItems", () => {
  const cards = [
    card("1", "Veya Vallois", "veya", "character"),
    card("2", "Vallois Manor", "manor,estate", "location"),
    card("3", "Veya Vallois - Crystallized", "veya", "crystallized"),
    card("4", "Romy DuBois", "romy,girlfriend", "character"),
    card("5", "Deleted Guy", "gone", "character", "2026-01-01T00:00:00Z"),
  ];
  it("ranks title-starts-with first and finds keys-tier matches", () => {
    const r = searchPanelItems("ve", cards);
    expect(r[0]!.title).toBe("Veya Vallois"); // title starts-with beats everything
    const byKeys = searchPanelItems("girlfriend", cards);
    expect(byKeys[0]!.title).toBe("Romy DuBois"); // found via keys
  });
  it("ranks title-contains above keys-contains", () => {
    const mixed = [
      card("a", "The Manor Key", "other", "custom"),   // title contains "manor"
      card("b", "Somewhere", "manor", "location"),      // keys contain "manor"
    ];
    const r = searchPanelItems("manor", mixed);
    expect(r.map((x) => x.id)).toEqual(["a", "b"]);
  });
  it("excludes deleted cards and respects the max cap", () => {
    expect(searchPanelItems("guy", cards)).toHaveLength(0);
    const many = Array.from({ length: 20 }, (_, i) => card(`m${i}`, `Match ${i}`));
    expect(searchPanelItems("match", many).length).toBe(12);
  });
  it("surfaces Crystallized cards as NPC results with the bare name", () => {
    const r = searchPanelItems("veya", cards);
    const npc = r.find((x) => x.kind === "npc");
    expect(npc).toBeTruthy();
    expect(npc!.title).toBe("Veya Vallois"); // ' - Crystallized' stripped
    expect(npc!.id).toBe("3");
    expect(npc!.sub).toBe("NPC");
  });
  it("returns [] for a blank/1-char query or no cards", () => {
    expect(searchPanelItems("", cards)).toEqual([]);
    expect(searchPanelItems("v", cards)).toEqual([]);
    expect(searchPanelItems("veya", undefined)).toEqual([]);
  });
});

describe("pendingDecisionsCount", () => {
  it("sums pending suggestions and pending versions, tolerating undefined", () => {
    expect(pendingDecisionsCount(undefined, undefined)).toBe(0);
    expect(pendingDecisionsCount(
      [{ status: "pending" }, { status: "approved" }],
      [{ status: "pending" }, { status: "applied" }, { status: "pending" }],
    )).toBe(3);
  });
});

describe("recentDecidedVersions", () => {
  it("returns the newest n non-pending versions, newest first", () => {
    const vs = [
      { status: "applied", createdAt: "2026-07-01T00:00:00Z" },
      { status: "pending", createdAt: "2026-07-05T00:00:00Z" },
      { status: "rejected", createdAt: "2026-07-03T00:00:00Z" },
      { status: "applied", createdAt: "2026-07-02T00:00:00Z" },
    ];
    const r = recentDecidedVersions(vs, 2);
    expect(r.map((v) => v.createdAt)).toEqual(["2026-07-03T00:00:00Z", "2026-07-02T00:00:00Z"]);
  });
  it("tolerates undefined", () => {
    expect(recentDecidedVersions(undefined)).toEqual([]);
  });
});
