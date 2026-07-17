/** Pure search/aggregation for the panel Home tab (Mobile Rethink Phase A §3-4).
 *  LOCAL and instant: matches only what panel state already holds. No DOM, no IPC. */
import type { CardRow } from "../shared/types";

export interface PanelSearchItem {
  kind: "card" | "npc";
  id: string;    // card id (for an NPC, the Crystallized card's id)
  title: string; // display title (for an NPC, the bare character name)
  sub: string;   // secondary line: the card type, or "NPC"
}

const CRYSTALLIZED_SUFFIX = /\s*-\s*crystallized$/i;

/** Ranked, capped search over story cards. Tiers: title-starts-with (0) > title-contains (1) >
 *  keys-contains (2) > type-contains (3). Case-insensitive substring; deleted cards excluded;
 *  queries under 2 chars return nothing (too noisy to be useful). Crystallized cards surface as
 *  NPC results with the character's bare name. Stable within a tier (input order preserved). */
export function searchPanelItems(query: string, cards: CardRow[] | undefined, max = 12): PanelSearchItem[] {
  const q = String(query || "").trim().toLowerCase();
  if (q.length < 2 || !cards?.length) return [];
  const scored: { score: number; item: PanelSearchItem }[] = [];
  for (const c of cards) {
    if (c.deletedAt) continue;
    const title = String(c.title || "");
    const titleL = title.toLowerCase();
    const keysL = String(c.keys || "").toLowerCase();
    const typeL = String(c.type || "").toLowerCase();
    let score = -1;
    if (titleL.startsWith(q)) score = 0;
    else if (titleL.includes(q)) score = 1;
    else if (keysL.includes(q)) score = 2;
    else if (typeL.includes(q)) score = 3;
    if (score < 0) continue;
    const isNpc = CRYSTALLIZED_SUFFIX.test(title);
    scored.push({
      score,
      item: isNpc
        ? { kind: "npc", id: c.id, title: title.replace(CRYSTALLIZED_SUFFIX, ""), sub: "NPC" }
        : { kind: "card", id: c.id, title, sub: typeL || "card" },
    });
  }
  // Array.prototype.sort is stable, so equal scores keep input (roster) order.
  return scored
    .sort((a, b) => a.score - b.score)
    .slice(0, Math.max(0, max))
    .map((s) => s.item);
}

/** Home-tab badge: how many things need the user's decision right now. */
export function pendingDecisionsCount(
  suggestions: { status: string }[] | undefined,
  versions: { status: string }[] | undefined
): number {
  const s = (suggestions || []).filter((x) => x.status === "pending").length;
  const v = (versions || []).filter((x) => x.status === "pending").length;
  return s + v;
}

/** The newest n decided (non-pending) versions, newest first — Home's recent-activity list. */
export function recentDecidedVersions<T extends { status: string; createdAt: string }>(
  versions: T[] | undefined,
  n = 3
): T[] {
  return (versions || [])
    .filter((v) => v.status !== "pending")
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, Math.max(0, n));
}
