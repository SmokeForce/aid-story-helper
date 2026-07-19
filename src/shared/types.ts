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
  cardId?: string;   // the card this version targets (rename-proof tracking — see developer.md §D)
  cardType?: string; // the targeted card's type, stamped at generation time
  phenotypeRollback?: import("../inference/phenotype/types").PhenotypeRecord; // a body re-roll persists the new
    // phenotype record immediately; this snapshots the PRIOR record so rejecting the pending version restores it.
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
  memoraidThoughtLookback?: number;       // MemorAID rolling thought window: N complete prior thoughts kept in the card entry & fed as context (default = 1, single newest thought)
  memoraidPresenceLookback?: number;      // MemorAID presence tracking lookback window
  completionTemperature?: number;         // Sampling temperature for all provider completions (0–1, default 0.7)
  autoRegenerateMemoryBankEntry?: boolean; // Automatically regenerate last native AID Memory when adventure memories update
  interceptTimeout?: number;              // Action interception release timeout in seconds
  useSinglePassGeneration?: boolean;      // Use single-pass instead of 4-pass character card generation
  locationMode?: "optionA" | "optionB";
  enableProperNounDetection?: boolean;
  manualMode?: boolean;
  memoraidBannerDismissed?: boolean;
  logPlotEssentials?: boolean;             // log ONLY the last Update Plot Essentials raw AI request/response to the Console (independent of showDebug verbose logging)
  characterCardLimit?: number;             // Character Card character limit cap (default 600)
  thoughtCardLimit?: number;               // MemorAID Thought Card character limit cap (default 2000)
  // ── Ported feature flags (v1.2.0) ──────────────────────────────────────────
  enableAutomaticUpdates?: boolean;        // Enable automatic Story Card update proposals (drift-gated character evolution). Default OFF; manual "Generate Core Character" always works.
  enableMemorAID?: boolean;                // Enable MemorAID NPC thought tracking (default: true)
  enableLivingCharacters?: boolean;        // Enable Living Characters integration (default: true)
  livingCharactersTitlePrefix?: string;    // Prefix for Life Cards (default: "Life - ")
  livingCharactersKeyPrefix?: string;      // Key prefix for Life Cards (default: "chaos-v2:")
  groupThoughtsInRoster?: boolean;         // Group Thought Cards separately in the Roster (default: false)
  livingCharactersRoster?: string;         // NPC roster for social simulation (one per line)
  livingCharactersPressures?: string;      // Active pressures for social simulation (one per line)
  livingCharactersProtagonistName?: string;// Protagonist name for simulation
  livingCharactersProtagonistInvolvement?: "off" | "normal" | "high" | "always"; // Protagonist involvement frequency
  livingCharactersInterval?: number;       // Turn interval to seed new Life Cards
  livingCharactersMaxActiveCards?: number; // Maximum active Life Cards
  livingCharactersSceneRelevance?: "off" | "strict"; // Scene relevance mode for Life Cards
  livingCharactersDormancyTurns?: number;  // Turns a pressure may sit dormant before being archived (0 = disabled, default 30)
  livingCharactersReseedCooldown?: number; // Turns an owner is ineligible to seed a new pressure after one resolves (0 = disabled, default 30)
  enableCrystallized?: boolean;            // Enable Crystallized long-term memory (default: false)
  crystallizedInterval?: number;           // Default crystallization interval (default: 20)
  crystallizedEntryMaxChars?: number;      // Default crystallized rendered entry max characters (default: 900)
  crystallizedNodeCap?: number;            // Default crystallized node cap (default: 12)
  crystallizedKnowsCap?: number;           // Max Knows lines rendered (default: 2; characters prioritized)
  crystallizedRecallsCap?: number;         // Max Recalls lines rendered (default: 2; floor 0, threshold-gated)
  crystallizedVividCap?: number;           // Max Vivid Memory lines rendered (default: 4)
  crystallizedOutlookCap?: number;         // Max Outlook lines rendered (default: 2)
  crystallizedPreferencesCap?: number;     // Max Preferences (texture) lines rendered (default: 4)
  crystallizedNpcMemoryCap?: number;       // Max stored per-NPC memory-bank blocks (default: 400; prune lowest-salience)
  // Per-pass LLM enable flags (default true / opt-out). Each distillation window runs up to four provider
  // calls per present NPC plus the NPC memory-bank POV; turning one off drops that LLM call. All gated
  // under enableCrystallized (which is itself off by default).
  crystallizedKnowsEnabled?: boolean;      // Run the Schema (Knows) distillation pass (default: true)
  crystallizedNodesEnabled?: boolean;      // Run the Nodes (Vivid Memories) distillation pass (default: true)
  crystallizedOutlookEnabled?: boolean;    // Run the Outlook (Beliefs) distillation pass (default: true)
  crystallizedPreferencesEnabled?: boolean;// Run the Preferences (texture) distillation pass (default: true)
  crystallizedNpcMemoryEnabled?: boolean;  // Generate per-NPC memory-bank POV recollections (default: true)
  phenotypePopulation?: "western" | "global"; // Sampled-body population table for the phenotype engine (default: "western")
  dbHealVersion?: number;                   // Highest one-time DB-heal migration applied (sanitizes imported/upgraded old databases). Absent = 0.
}

/** Count story actions in a list of (live) actions. */
export function countActions(actions: unknown[]): number {
  return actions.length;
}

/**
 * Whether the local IndexedDB looks GENUINELY empty — the only state in which the self-heal
 * "restore your backup" banner should appear. True only when there are no adventures, no actions
 * for the current adventure, and no cards. This gates the banner against the false positive where
 * the initial empty-DB probe races auto-backfill: as soon as backfill repopulates the adventure
 * (e.g. 203 actions), this returns false and the banner is hidden.
 */
export function isLocalDbEmpty(state: {
  adventures?: unknown[];
  actionCount?: number;
  actionsCount?: number;
  cards?: unknown[];
}): boolean {
  const actions = state.actionCount ?? state.actionsCount ?? 0;
  return (state.adventures?.length ?? 0) === 0 && actions === 0 && (state.cards?.length ?? 0) === 0;
}

/** Slice the last N actions from a list of live actions. */
export function sliceLastActions<T>(actions: T[], n: number): T[] {
  if (n <= 0) return [];
  return actions.slice(-n);
}

/** Check if a character is mentioned or active in a block of text. */
export function isCharacterTriggered(text: string, title: string, keys: string): boolean {
  const escapeRegex = (s: string) => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const rawCandidates = [title, ...keys.split(/[,;]+/)]
    .map((s) => stripPossessive(s.trim()))
    .filter(Boolean);
  
  const candidates: string[] = [];
  for (const c of rawCandidates) {
    candidates.push(c);
    if (c.includes(" and ") || c.includes(" & ")) {
      const parts = c.split(/\s+(?:and|&)\s+/i);
      for (const p of parts) {
        const trimmed = p.trim();
        if (trimmed) candidates.push(trimmed);
      }
    }
  }
  
  const textLower = text.toLowerCase();
  for (const cand of candidates) {
    const r = new RegExp(`\\b${escapeRegex(cand.toLowerCase())}\\b`);
    if (r.test(textLower)) return true;
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
  const rawCandidates = [title, ...keys.split(/[,;]+/)]
    .map((s) => stripPossessive(s.trim()))
    .filter(Boolean);
  
  const candidates: string[] = [];
  for (const c of rawCandidates) {
    candidates.push(c);
    if (c.includes(" and ") || c.includes(" & ")) {
      const parts = c.split(/\s+(?:and|&)\s+/i);
      for (const p of parts) {
        const trimmed = p.trim();
        if (trimmed) candidates.push(trimmed);
      }
    }
  }

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

  const activeCharacters = cards.filter((c) => 
    !c.deletedAt && 
    ((c.type || "").toLowerCase() === "character" || (c.type || "").toLowerCase() === "custom") &&
    !(c.title || "").toLowerCase().endsWith(" (memory)")
  );
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

/** A proper-noun candidate held in the per-adventure evidence pool (adv.properNounPending) until it
 *  earns promotion to a real suggestion: ≥2 distinct-action mentions (G5), plus — single words only —
 *  one mid-sentence capitalized occurrence (G1). See src/inference/proper-nouns.ts. */
export interface PendingProperNoun {
  noun: string;                // current (possibly variant-upgraded) form
  firstActionId: string;       // action of the first sighting
  mentionActionIds: string[];  // distinct actions where the noun (or its distinctive words) appeared
  hasMidSentenceCap: boolean;  // G1 evidence seen yet? (multiword candidates skip G1)
  lastSeenAt: string;          // ISO timestamp of the latest mention, for pool pruning
}

/** A per-couple pressures pool: when a pressure is seeded between characters `a` and `b` (in either
 *  direction — symmetric), it is drawn EXCLUSIVELY from `pressures` instead of the general pool. Lets
 *  the user say e.g. "Slimey and Romy only ever feel romantic pressures toward each other". */
export interface PressurePair {
  a: string;
  b: string;
  pressures: string[];
}

/** Per-adventure Living Characters simulation config (stored on AdventureMeta.livingConfig).
 *  Replaces the global per-story livingCharacters* settings; each story gets its own cast/dynamics. */
export interface LivingConfig {
  roster?: string;            // NPC roster (one name per line)
  pressures?: string;         // Active pressures pool (one per line) — the DEFAULT pool
  pressurePairs?: PressurePair[]; // Per-couple pools that override the default for that specific pair (symmetric, exclusive)
  protagonistInvolvement?: "off" | "normal" | "high" | "always";
  interval?: number;          // Life Event Interval (avg turns)
  maxActive?: number;         // Max concurrent live relationships
  sceneRelevance?: "off" | "strict";
  dormancyTurns?: number;     // Dormancy timeout (0 = disabled)
  reseedCooldown?: number;    // Reseed cooldown (0 = disabled)
  staleTurns?: number;        // Activity lifespan: in-scene turns without a fresh occurrence before an active thread is archived outright (0 = disabled)
  maxActiveTurns?: number;    // Hard lifetime cap: turns since seed after which a thread is retired REGARDLESS of activity (0 = disabled)
  continueInjectionMode?: "defer" | "skip"; // Continue/retry actions can't carry an injected directive: "defer" (default) holds it for the next do/say/story; "skip" doesn't run LC on continue/retry
}

export type { PhenotypeRecord } from "../inference/phenotype/types";
