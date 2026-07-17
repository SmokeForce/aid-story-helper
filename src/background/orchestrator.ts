import { applyActionUpdate } from "../sync/reconcile";
import type { CanonicalAction, ActionUpdatePayload, GqlOp, CardRow, Settings, Version, GlobalAsset } from "../shared/types";

/** Pure: fold an ActionUpdates payload into the current canonical list. */
export function reduceActionUpdate(
  current: CanonicalAction[],
  payload: ActionUpdatePayload
): CanonicalAction[] {
  return applyActionUpdate(current, payload);
}

// Message contract between content script and background.
export type BgMessage =
  | { kind: "memoryBankUpdate"; shortId: string; memories: any[] }
  | { kind: "updateMemoryBank"; shortId: string; memories: any[] }
  | { kind: "createConfigCard"; shortId: string }
  | { kind: "actionUpdate"; shortId: string; payload: ActionUpdatePayload }
  | { kind: "adventureMeta"; shortId: string; title?: string; memory?: string; authorsNote?: string; instructions?: string }
  | { kind: "setAuthorsNote"; shortId: string; authorsNote: string }
  | { kind: "exportRequest"; shortId: string }
  | { kind: "authToken"; token: string }
  | { kind: "learnedOp"; ops: GqlOp[]; endpoint?: string }
  | { kind: "backfillRequest"; shortId: string }
  | { kind: "cardsUpdate"; shortId: string; cards: CardRow[]; isFullList?: boolean }
  | { kind: "cardsDeleted"; shortId: string; cardIds: string[] }
  | { kind: "setSettings"; settings: Settings }
  | { kind: "setProtagonist"; shortId: string; name: string }
  | { kind: "analyzeRequest"; shortId: string }
  | { kind: "generateCard"; shortId: string; cardId: string }
  | { kind: "generateCompactCard"; shortId: string; cardId: string }
  | { kind: "rerollAppearance"; shortId: string; cardId: string }
  | { kind: "distillCrystallized"; shortId: string; cardId: string; name: string }
  | { kind: "backfillNpcMemories"; shortId: string; characterTitle: string }
  | { kind: "getNpcMemoryBank"; shortId: string; characterTitle: string }
  | { kind: "saveNpcMemoryBlock"; shortId: string; characterTitle: string; blockId: string; povText: string }
  | { kind: "deleteNpcMemoryBlock"; shortId: string; characterTitle: string; blockId: string }
  | { kind: "regenerateNpcMemoryBlock"; shortId: string; characterTitle: string; blockId: string }
  | { kind: "consolidateOutlook"; shortId: string; characterTitle: string }
  | { kind: "setVersionStatus"; id: string; status: Version["status"] }
  | { kind: "applyToAid"; id: string }
  | { kind: "getState"; shortId: string }
  | { kind: "listModels"; provider?: string; apiKey?: string; model?: string }
  | { kind: "adventureMemories"; shortId: string; memories: any[] }
  | { kind: "updateAidMemories"; shortId: string; memories: any[] }
  | { kind: "setMemoraidCharacters"; shortId: string; characters: string[] }
  | { kind: "setLivingConfig"; shortId: string; config: import("../shared/types").LivingConfig }
  | { kind: "createStoryCard"; shortId: string; card: { type: string; title: string; keys: string; value: string; description?: string } }
  | { kind: "saveCardKeys"; shortId: string; cardId: string; keys: string }
  | { kind: "saveCardValue"; shortId: string; cardId: string; value: string }
  | { kind: "saveCrystallizedSchema"; shortId: string; cardId: string; schema: import("../inference/crystallized").SchemaItem[] }
  | { kind: "savePreferences"; shortId: string; cardId: string; prefs: string[] }
  | { kind: "consolidateCrystallizedSchema"; shortId: string; cardId: string }
  | { kind: "getCrystallizedState"; shortId: string; cardId: string }
  | { kind: "deleteStoryCard"; shortId: string; cardId: string }
  | { kind: "setLifeCardStatus"; shortId: string; cardId: string; status: "active" | "dormant" | "resolved" }
  | { kind: "enqueueLifeInjection"; shortId: string; owner: string; target: string; pressure: string; momentum: string }
  | { kind: "processInterceptedAction"; shortId: string; text: string; type: string }
  | { kind: "refineMemoryBlock"; shortId: string; index: number }
  | { kind: "openPermissionsPage" }
  | { kind: "setActiveLocation"; shortId: string; cardId: string | null }
  | { kind: "respondToProperNounSuggestion"; shortId: string; properNoun: string; accept: boolean; type: string }
  | { kind: "linkProperNounToCard"; shortId: string; properNoun: string; cardId: string }
  | { kind: "updateProperNounLog"; shortId: string; properNoun: string; type: string }
  | { kind: "deleteProperNounLog"; shortId: string; properNoun: string }
  | { kind: "clearProperNounLogs"; shortId: string }
  | { kind: "getOffMetaRepository" }
  | { kind: "applyOffMetaInstruction"; shortId: string; text: string; type: "ain" | "an" | "pe"; itemType: "bullet" | "block" }
  | { kind: "getManagerData" }
  | { kind: "exportAll" }
  | { kind: "importAll"; data: any }
  | { kind: "isDbEmpty" }
  | { kind: "saveGlobalAsset"; asset: GlobalAsset }
  | { kind: "deleteGlobalAsset"; id: string }
  | { kind: "importGlobalAsset"; shortId: string; assetId: string }
  | { kind: "hideAdventure"; shortId: string }
  | { kind: "deleteAdventure"; shortId: string }
  | { kind: "unhideAdventure"; shortId: string }
  | { kind: "getHiddenAdventures" };




/** Standard result shape returned by the background's mutation-style message handlers.
 *  `message` carries optional human-readable detail (e.g. importGlobalAsset). */
export type BgResult = { ok?: boolean; error?: string; message?: string };
