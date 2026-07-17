/** Shared per-adventure scene cache: the last ~30 actions and the sanitized in-scene text window
 *  used for ALL presence checks (MemorAID + Living Characters). Extracted from background.ts. */
import { repo, dlog } from "./bg-infra";
import { type CanonicalAction } from "../shared/types";
import { buildSceneText } from "../inference/living-characters";

export const cachedRecentActions = new Map<string, CanonicalAction[]>();
export const cachedSceneText = new Map<string, string>();

export async function updateRecentActionsCache(shortId: string, actions?: CanonicalAction[]) {
  try {
    const actList = actions || await repo.getActions(shortId);
    const sliced = actList.slice(-30);
    cachedRecentActions.set(shortId, sliced);
    const lookback = (await repo.getSettings())?.memoraidPresenceLookback ?? 5;
    cachedSceneText.set(shortId, buildSceneText(sliced.slice(-lookback).map(a => a.text || "")));
    dlog(`[AID bg] Updated cached recent actions count for ${shortId}:`, sliced.length);
  } catch (err) {
    console.error("[AID bg] Failed to update actions cache:", err);
  }
}

/** The shared, sanitized in-scene window for an adventure. Folds in the pending action text when
 *  provided (the player's just-submitted action is part of the scene). One source of truth for all
 *  presence checks. */
export async function getSceneText(shortId: string, pendingText?: string): Promise<string> {
  const lookback = (await repo.getSettings())?.memoraidPresenceLookback ?? 5;
  let recent = cachedRecentActions.get(shortId);
  if (!recent) {
    await updateRecentActionsCache(shortId);
    recent = cachedRecentActions.get(shortId) || [];
  }
  const sliced = recent.slice(-lookback).map(a => a.text || "");
  const text = buildSceneText(sliced, pendingText);
  if (!pendingText) cachedSceneText.set(shortId, text);
  return text;
}

