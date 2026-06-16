import type { RawAction } from "../shared/types";

export interface Page {
  actions: RawAction[];
  hasMore: boolean;
  nextCursor: number | string | null;
}

export type PageFetcher = (cursor: number | string | null) => Promise<Page>;
export type OnProgress = (loaded: number) => void;

/**
 * Repeatedly fetch pages until `hasMore` is false (or maxPages reached), de-duplicating
 * actions by id and returning them ordered oldest->newest by createdAt then numeric id.
 */
export async function backfillAll(
  fetcher: PageFetcher,
  onProgress: OnProgress | undefined,
  maxPages: number
): Promise<RawAction[]> {
  const byId = new Map<string, RawAction>();
  let cursor: number | string | null = null;
  for (let i = 0; i < maxPages; i++) {
    const page = await fetcher(cursor);
    for (const a of page.actions) byId.set(a.id, a);
    onProgress?.(byId.size);
    if (!page.hasMore) break;
    cursor = page.nextCursor;
    if (cursor == null) break;
  }
  return [...byId.values()].sort((a, b) => {
    const ta = a.createdAt ?? "", tb = b.createdAt ?? "";
    if (ta !== tb) return ta < tb ? -1 : 1;
    const na = Number(a.id), nb = Number(b.id);
    return !Number.isNaN(na) && !Number.isNaN(nb) ? na - nb : a.id < b.id ? -1 : 1;
  });
}
