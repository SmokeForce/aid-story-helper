/**
 * Pure helpers for the user-deleted-card tombstone (`AdventureMeta.userDeletedCards`).
 *
 * Two jobs, one list:
 *  - **Cache-race defense**: a card the user deletes is soft-deleted locally, but the per-turn
 *    savestate `cardsUpdate` → `putCards` re-adds it from the (stale) server list and clears the
 *    soft-delete. Re-applying `markCardsDeleted(userDeletedIds(...))` after every `putCards` keeps it
 *    gone. (This is the conflict that made even `lcArchived`'d Life cards repropagate — manual deletes
 *    never populated a tombstone.)
 *  - **Auto-recreation suppression**: the title set lets MemorAID/Crystallized/Life creation paths
 *    skip a card the user deleted, so they don't immediately mint a fresh one.
 */
export interface DeletedCardRef {
  id: string;
  title: string;
}

/** Append delete entries, deduping by id (latest title wins). Ignores entries without an id. */
export function addUserDeletedCards(
  existing: DeletedCardRef[] | undefined,
  entries: DeletedCardRef[]
): DeletedCardRef[] {
  const out: DeletedCardRef[] = [];
  const index = new Map<string, number>();
  for (const e of [...(existing || []), ...entries]) {
    const id = String(e?.id || "");
    if (!id) continue;
    const title = String(e?.title || "");
    if (index.has(id)) {
      out[index.get(id)!]!.title = title; // refresh to latest known title
    } else {
      index.set(id, out.length);
      out.push({ id, title });
    }
  }
  return out;
}

/** The tombstoned ids — fed to `repo.markCardsDeleted` to re-assert the soft-delete after `putCards`. */
export function userDeletedIds(list: DeletedCardRef[] | undefined): string[] {
  return (list || []).map((e) => e.id).filter(Boolean);
}

/** Is this an auto-card the extension recreates (MemorAID `… (Memory)`, Crystallized `… - Crystallized`,
 *  or a Life card under `lifePrefix`)? Only auto-cards get the forced re-delete + auto-suppression;
 *  regular cards keep the normal archive→restore-by-reappearance flow untouched. */
export function isAutoCardTitle(title: string | undefined, lifePrefix = "Life - "): boolean {
  const t = String(title || "").trim().toLowerCase();
  if (!t) return false;
  return t.endsWith(" (memory)") || t.endsWith(" - crystallized") || t.startsWith(String(lifePrefix || "").toLowerCase());
}

/** Tombstoned ids restricted to AUTO-cards — fed to `markCardsDeleted` so only auto-cards are forced
 *  to stay deleted against the savestate; regular cards reappear-and-restore as before. */
export function autoCardDeletedIds(list: DeletedCardRef[] | undefined, lifePrefix = "Life - "): string[] {
  return (list || []).filter((e) => isAutoCardTitle(e.title, lifePrefix)).map((e) => e.id).filter(Boolean);
}

/** Did the user delete a card with this title? Case-insensitive; used to suppress auto-recreation. */
export function isTitleUserDeleted(list: DeletedCardRef[] | undefined, title: string | undefined): boolean {
  const t = String(title || "").trim().toLowerCase();
  if (!t) return false;
  return (list || []).some((e) => e.title.trim().toLowerCase() === t);
}

/** Drop tombstone entries whose title matches (case-insensitive). Re-enable on explicit user recreate. */
export function removeUserDeletedTitles(
  list: DeletedCardRef[] | undefined,
  titles: string[]
): DeletedCardRef[] {
  const drop = new Set(titles.map((t) => String(t || "").trim().toLowerCase()).filter(Boolean));
  return (list || []).filter((e) => !drop.has(e.title.trim().toLowerCase()));
}
