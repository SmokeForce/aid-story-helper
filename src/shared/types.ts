// AID wire shapes (see fixtures/aid-graphql-api-reference.md)
export interface RawAction {
  id: string;
  text: string;
  type: string;            // "do" | "say" | "story" | "continue" | "see" | ...
  undoneAt: string | null;
  deletedAt: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ActionUpdatePayload {
  type: string;
  adventureId: string;
  retriedActionId: string | null;
  cachedOutputs: unknown[];
  actions: RawAction[];
}

export interface CanonicalAction {
  id: string;
  text: string;
  type: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface StoryCard {
  id: string;
  type: string;            // Character / Location / ...
  title: string;           // our "Name"
  keys: string;            // our "Triggers"
  value: string;           // our "Entry"
  description?: string;
  shortId?: string;
}

export interface GqlOp {
  operationName: string | null;
  query: string;
  variables?: Record<string, unknown>;
}

export interface OpRecord {
  operationName: string;
  query: string;
  variableKeys: string[];   // shape hint, e.g. ["shortId","limit","desc"]
  kind: "read" | "write";
  learnedAt: string;
}

export interface CardRow { shortId: string; id: string; type: string; title?: string; keys: string; value: string; description?: string; deletedAt?: string | null; }

export interface Version {
  id: string; shortId: string; characterName: string; entry: string; changeSummary: string;
  triggers?: string; status: "pending" | "applied" | "rejected"; createdAt: string;
  source?: "card" | "plot";
  pushedAt?: string;
  actionCount?: number;
}

export interface Settings {
  provider: "claude" | "openai" | "gemini" | "ollama";
  model?: string;
  apiKeys?: Record<string, string>;
  analyzeWindow?: number;
  showDebug?: boolean;
  theme?: string;
  customPromptSection1?: string;
  customPromptSection2?: string;
  customPromptSection3?: string;
  customPromptSection4?: string;
  typeGuidance?: Record<string, string>; // per-card-type AI guidance (character/class/race/location/faction/custom)
  useMemories?: boolean;
  cardCommands?: Record<string, string>;  // per-type Story Card Command templates
  formattingMode?: string;                // AID entry formatting: none | curlyBraces | squareBrackets
  memoraidLookback?: number;              // MemorAID thought generation lookback window
  memoraidPresenceLookback?: number;      // MemorAID presence tracking lookback window
  autoRegenerateNativeMemories?: boolean; // Automatically regenerate last native AID Memory when adventure memories update
  interceptTimeout?: number;              // Action interception release timeout in seconds
  useSinglePassGeneration?: boolean;      // Use single-pass instead of 4-pass character card generation
  locationMode?: "optionA" | "optionB";
  enableProperNounDetection?: boolean;
  manualMode?: boolean;
  memoraidBannerDismissed?: boolean;
}

/** Count story actions in a list of (live) actions. */
export function countActions(actions: unknown[]): number {
  return actions.length;
}

/** The actions comprising the last `n` actions. */
export function sliceLastActions<T>(actions: T[], n: number): T[] {
  if (n <= 0) return [];
  return actions.slice(-n);
}

/**
 * Helper to check if text contains a character's name or keys as a whole word.
 */
export function isCharacterTriggered(text: string, title: string, keys: string): boolean {
  const cleanTitle = stripPossessive(title.trim().toLowerCase());
  const keysList = keys.split(/[,;]+/).map((k) => stripPossessive(k.trim().toLowerCase())).filter(Boolean);
  
  const escapeRegex = (s: string) => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  
  if (cleanTitle) {
    const pattern = new RegExp(`\\b${escapeRegex(cleanTitle)}\\b`, "i");
    if (pattern.test(text)) return true;
  }
  
  for (const key of keysList) {
    const pattern = new RegExp(`\\b${escapeRegex(key)}\\b`, "i");
    if (pattern.test(text)) return true;
  }
  
  return false;
}

/**
 * Like isCharacterTriggered, but returns WHICH title/key tokens actually fire in `text` (the
 * matched triggers), not just a boolean. Used to hand the MemorAID model the concrete presence
 * evidence ("Celeste" matched) instead of making it re-infer presence from prose. Order: title
 * first, then keys; case-insensitive, possessive-stripped, deduped, preserving original casing.
 */
export function matchedTriggers(text: string, title: string, keys: string): string[] {
  const escapeRegex = (s: string) => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const candidates = [title, ...keys.split(/[,;]+/)]
    .map((s) => stripPossessive(s.trim()))
    .filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const cand of candidates) {
    const low = cand.toLowerCase();
    if (seen.has(low)) continue;
    seen.add(low);
    if (new RegExp(`\\b${escapeRegex(low)}\\b`, "i").test(text)) out.push(cand);
  }
  return out;
}

function stripPossessive(s: string): string {
  return s.replace(/['’]s?$/i, "").trim();
}

/**
 * Determine which cards fell out of the action lookback window.
 * Returns the cards that were active in the previous N-action window but are no longer active in the current N-action window.
 */
export function determineFellOutCards<
  C extends { deletedAt?: string | null; type: string; title?: string; keys: string; id: string }
>(
  lookbackSize: number,
  allActions: { type: string; text?: string }[],
  newActionsCount: number,
  cards: C[]
): C[] {
  const currentActions = sliceLastActions(allActions, lookbackSize);
  const currentText = currentActions.map((a) => a.text || "").join(" ").toLowerCase();

  const oldActions = allActions.slice(0, -newActionsCount);
  const previousActions = sliceLastActions(oldActions, lookbackSize);
  const previousText = previousActions.map((a) => a.text || "").join(" ").toLowerCase();

  const activeCharacters = cards.filter((c) => !c.deletedAt && c.type.toLowerCase() === "character");
  const fellOut: C[] = [];

  for (const card of activeCharacters) {
    const name = card.title || "";
    const keys = card.keys || "";
    if (!name.trim() && !keys.trim()) continue;

    const wasActive = isCharacterTriggered(previousText, name, keys);
    const isActive = isCharacterTriggered(currentText, name, keys);

    if (wasActive && !isActive) {
      fellOut.push(card);
    }
  }

  return fellOut;
}

export interface GlobalAsset {
  id: string;
  type: "ain" | "an" | "pe" | "sc";
  title: string;
  keys?: string;
  value: string;
  description?: string;
  createdAt: string;
  cardType?: string;
}
