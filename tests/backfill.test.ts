import { describe, it, expect } from "vitest";
import { backfillAll, type Page } from "../src/sync/backfill";
import type { RawAction } from "../src/shared/types";

const mk = (id: string): RawAction => ({
  id, text: "t" + id, type: "do", undoneAt: null, deletedAt: null,
  createdAt: `2026-05-30T00:00:${id.padStart(2, "0")}Z`,
});

describe("backfillAll", () => {
  it("pages until hasMore is false and returns actions ordered oldest->newest", async () => {
    const pages: Record<number, Page> = {
      0: { actions: [mk("05"), mk("04"), mk("03")], hasMore: true, nextCursor: 2 },
      2: { actions: [mk("02"), mk("01")], hasMore: false, nextCursor: null },
    };
    const fetcher = async (cursor: number | string | null) => pages[(cursor as number) ?? 0]!;
    const all = await backfillAll(fetcher, undefined, 50);
    expect(all.map((a) => a.id)).toEqual(["01", "02", "03", "04", "05"]);
  });

  it("dedupes overlapping ids across pages", async () => {
    const pages: Record<number, Page> = {
      0: { actions: [mk("03"), mk("02")], hasMore: true, nextCursor: 1 },
      1: { actions: [mk("02"), mk("01")], hasMore: false, nextCursor: null },
    };
    const fetcher = async (cursor: number | string | null) => pages[(cursor as number) ?? 0]!;
    const all = await backfillAll(fetcher, undefined, 50);
    expect(all.map((a) => a.id)).toEqual(["01", "02", "03"]);
  });

  it("stops at maxPages to avoid runaway loops", async () => {
    let calls = 0;
    const fetcher = async () => { calls++; return { actions: [mk("01")], hasMore: true, nextCursor: 1 } as Page; };
    const all = await backfillAll(fetcher, undefined, 3);
    expect(calls).toBe(3);
    expect(all.length).toBeGreaterThan(0);
  });

  it("reports progress via the callback", async () => {
    const seen: number[] = [];
    const pages: Record<number, Page> = {
      0: { actions: [mk("02")], hasMore: true, nextCursor: 1 },
      1: { actions: [mk("01")], hasMore: false, nextCursor: null },
    };
    const fetcher = async (cursor: number | string | null) => pages[(cursor as number) ?? 0]!;
    await backfillAll(fetcher, (loaded) => seen.push(loaded), 50);
    expect(seen).toEqual([1, 2]);
  });
});
