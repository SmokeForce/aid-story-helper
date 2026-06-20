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
  | { kind: "actionUpdate"; shortId: string; payload: ActionUpdatePayload }
  | { kind: "adventureMeta"; shortId: string; title?: string; memory?: string; authorsNote?: string; instructions?: string }
  | { kind: "exportRequest"; shortId: string }
  | { kind: "authToken"; token: string }
  | { kind: "learnedOp"; ops: GqlOp[]; endpoint?: string }
  | { kind: "backfillRequest"; shortId: string }
  | { kind: "cardsUpdate"; shortId: string; cards: CardRow[] }
  | { kind: "setSettings"; settings: Settings }
  | { kind: "setProtagonist"; shortId: string; name: string }
  | { kind: "analyzeRequest"; shortId: string }
  | { kind: "generateCard"; shortId: string; cardId: string }
  | { kind: "setVersionStatus"; id: string; status: Version["status"] }
  | { kind: "applyToAid"; id: string }
  | { kind: "getState"; shortId: string }
  | { kind: "listModels"; provider?: string; apiKey?: string }
  | { kind: "memoryBankUpdate"; shortId: string; memories: any[] }
  | { kind: "updateMemoryBank"; shortId: string; memories: any[] }
  | { kind: "createConfigCard"; shortId: string }
  | { kind: "createStoryCard"; shortId: string; card: { type: string; title: string; keys: string; value: string; description?: string } }
  | { kind: "saveCardKeys"; shortId: string; cardId: string; keys: string }
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
  | { kind: "saveGlobalAsset"; asset: GlobalAsset }
  | { kind: "deleteGlobalAsset"; id: string }
  | { kind: "importGlobalAsset"; shortId: string; assetId: string }
  | { kind: "saveCardValue"; shortId: string; cardId: string; value: string }
  | { kind: "exportAll" }
  | { kind: "importAll"; data: any }
  | { kind: "isDbEmpty" }
  | { kind: "hideAdventure"; shortId: string }
  | { kind: "deleteAdventure"; shortId: string }
  | { kind: "unhideAdventure"; shortId: string }
  | { kind: "getHiddenAdventures" };



