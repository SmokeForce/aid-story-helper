/** Roster group labels for the concrete Story-Card types. */
export const ROSTER_TYPE_LABELS: Record<string, string> = {
  character: "Characters", class: "Classes", race: "Races", location: "Locations", faction: "Factions",
};

/** If a roster entry has an explicit CONCRETE card type (character/location/faction/class/race/custom)
 *  AND its name doesn't itself signal an auto-card, return its group label directly. This bypasses the
 *  panel's fuzzy title-OR-keys classification, which can mis-file an entry under an auto-card group when
 *  some auto-card's KEYS happen to include this name — the real bug where a "Life - Veya Vallois" card
 *  (keys include "Veya Vallois") caused the "Veya Vallois::character" entry to be grouped under Life
 *  instead of Characters. Returns null to fall through to the fuzzy logic (auto-typed / plot / untyped
 *  entries, and any entry whose NAME signals a crystallized/memory/thoughts/life card). */
export function explicitTypeLabel(
  name: string,
  type: string | undefined,
  lifeTitlePrefix = "life - "
): string | null {
  if (!type) return null;
  const nameLc = name.trim().toLowerCase();
  if (
    nameLc.startsWith(lifeTitlePrefix.toLowerCase()) ||
    nameLc.endsWith(" - crystallized") ||
    nameLc.endsWith(" (memory)") ||
    nameLc.endsWith(" - thoughts")
  ) return null;
  const lt = type.toLowerCase();
  if (["character", "location", "faction", "class", "race", "custom"].includes(lt)) {
    return ROSTER_TYPE_LABELS[lt] || (type.charAt(0).toUpperCase() + type.slice(1));
  }
  return null;
}

/** Compute the set of roster name-keys considered deleted, with ACTIVE-WINS: a title/key that any
 *  non-deleted card carries is never deleted, regardless of a stale soft-deleted duplicate row. Keys
 *  are lowercased; both the bare name and a `name::type` variant are emitted (matching the panel's
 *  deleted-name lookups). Fixes live characters vanishing behind a leftover deleted-duplicate row. */
export function computeDeletedNames(
  cards: { title?: string; keys?: string; type?: string; deletedAt?: string | null }[]
): Set<string> {
  const variants = (c: { title?: string; keys?: string; type?: string }): string[] => {
    const type = (c.type || "character").toLowerCase();
    const out: string[] = [];
    const push = (n: string | undefined) => {
      const k = String(n || "").trim().toLowerCase();
      if (k) { out.push(k); out.push(`${k}::${type}`); }
    };
    for (const key of (c.keys || "").split(/[,;]+/)) push(key);
    push(c.title || c.keys);
    push(c.title);
    return out;
  };
  const active = new Set<string>();
  for (const c of cards) if (!c.deletedAt) for (const v of variants(c)) active.add(v);
  const deleted = new Set<string>();
  for (const c of cards) if (c.deletedAt) for (const v of variants(c)) if (!active.has(v)) deleted.add(v);
  return deleted;
}

/** charGroups keys (`name::type`) to add so an ACTIVE (non-deleted) card with NO version history is
 *  still shown in the roster. The roster is built from versions only, so a live card that was never
 *  versioned (re-imported, or churned) is otherwise invisible and unmanageable. Excludes auto-managed
 *  cards (Life-/Memory-/Crystallized-) that live in their own tabs. Skips any name already represented
 *  by a version group (matched by the name part, ignoring the `::type` suffix). */
export function activeCardsMissingFromRoster(
  cards: { title?: string; keys?: string; type?: string; deletedAt?: string | null }[],
  existingGroupKeys: Iterable<string>
): string[] {
  const existing = new Set<string>();
  for (const k of existingGroupKeys) {
    const name = (String(k).split("::")[0] || "").trim().toLowerCase();
    if (name) existing.add(name);
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const c of cards) {
    if (c.deletedAt) continue;
    const title = (c.title || "").trim();
    const tl = title.toLowerCase();
    const type = (c.type || "character").toLowerCase();
    if (type !== "character") continue; // scope: only surface version-less CHARACTER cards (no location/faction/custom clutter)
    if (tl.endsWith(" (memory)") || tl.endsWith(" - crystallized") || tl.startsWith("life - ")) continue;
    const name = title || (c.keys || "").split(/[,;]+/)[0]?.trim() || "";
    if (!name) continue;
    const nameLower = name.toLowerCase();
    if (existing.has(nameLower) || seen.has(nameLower)) continue;
    seen.add(nameLower);
    out.push(`${name}::${type}`);
  }
  return out;
}
