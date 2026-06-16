import type { CanonicalAction, RawAction, ActionUpdatePayload } from "../shared/types";

function toCanonical(a: RawAction): CanonicalAction {
  return { id: a.id, text: a.text, type: a.type, createdAt: a.createdAt, updatedAt: a.updatedAt };
}
function isLive(a: RawAction): boolean {
  return a.undoneAt == null && a.deletedAt == null;
}

export interface ActionUpdateDiff {
  upserts: CanonicalAction[];
  removeIds: string[];
}

/** Split an ActionUpdates payload into actions to upsert (live) and ids to delete (undone/deleted). */
export function diffActionUpdate(payload: ActionUpdatePayload): ActionUpdateDiff {
  const upserts: CanonicalAction[] = [];
  const removeIds: string[] = [];
  for (const a of payload.actions) {
    if (isLive(a)) upserts.push(toCanonical(a));
    else removeIds.push(a.id);
  }
  return { upserts, removeIds };
}

/**
 * Apply one ActionUpdates payload to the canonical list.
 * - undone/deleted actions are removed
 * - existing ids are updated in place (edits)
 * - new live ids are appended in payload order
 */
export function applyActionUpdate(
  current: CanonicalAction[],
  payload: ActionUpdatePayload
): CanonicalAction[] {
  const result = [...current];
  const indexById = new Map(result.map((a, i) => [a.id, i] as const));

  for (const raw of payload.actions) {
    const at = indexById.get(raw.id);
    if (!isLive(raw)) {
      if (at !== undefined) {
        result.splice(at, 1);
        indexById.clear();
        result.forEach((a, i) => indexById.set(a.id, i));
      }
      continue;
    }
    if (at !== undefined) {
      result[at] = toCanonical(raw);
    } else {
      indexById.set(raw.id, result.length);
      result.push(toCanonical(raw));
    }
  }
  return result;
}

/**
 * Tail-integrity check: compare a local list against a remote action list (oldest→newest),
 * aligned at their ends. Returns the local index of the first mismatch, or -1 if the
 * overlapping tail matches exactly (by id + text).
 */
export function findDivergenceIndex(local: CanonicalAction[], remote: RawAction[]): number {
  const n = Math.min(local.length, remote.length);
  for (let k = 1; k <= n; k++) {
    const l = local[local.length - k]!;
    const r = remote[remote.length - k]!;
    if (l.id !== r.id || l.text !== r.text) return local.length - k;
  }
  return -1;
}
