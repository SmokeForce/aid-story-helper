import nlp from "compromise";
import { Repo } from "../storage/repo";
import { openAidDb, type AdventureMeta } from "../storage/db";
import { exportAdventure } from "../storage/export";
import { type BgMessage } from "./orchestrator";
import { recordOp } from "../shared/op-registry";
import { buildGameplayRequest, parseGameplayResponse } from "../sync/gameplay-fetch";
import { backfillAll, type Page } from "../sync/backfill";
import { applyActionUpdate, diffActionUpdate } from "../sync/reconcile";
import { buildAnalyzeRequest, buildLocationContext, detectPresentCards, buildMemoraidPrompt } from "../inference/gather";
import { analyze, DEFAULT_TYPE_GUIDANCE, normalizeType } from "../inference/engine";
import { ClaudeProvider, listModels as listClaudeModels } from "../inference/claude";
import { OpenAIProvider, listOpenAIModels } from "../inference/openai";
import { GeminiProvider, listGeminiModels } from "../inference/gemini";
import { OllamaProvider, listOllamaModels } from "../inference/ollama";
import { type Provider } from "../inference/provider";
import { buildCardSave, buildCardCreate, buildMemorySave, buildEditMemory, DEFAULT_GQL_QUERIES, buildGraphQLMutation, buildUpdateAdventureState, type GqlOperation, type GqlMutationRequest } from "../inference/writeback";
import { replaceBlock, parsePlotEssentials, parseMemories } from "../inference/plot";
import { countActions, sliceLastActions, determineFellOutCards, isCharacterTriggered, type CardRow, type Settings, type CanonicalAction, type Version } from "../shared/types";
import { parseOffMetaText, type OffMetaSection } from "../shared/offmeta-parser";
import { defaultCommandForType, resolveCommand, hasTitleToken, parseProtagonistName, DEFAULT_CARD_COMMANDS, DEFAULT_FORMATTING_MODE } from "../inference/card-command";
import { parseMemoNotes, buildMemoNotes, pushThought, thoughtsSince, buildThoughtContext, renderThoughtWindow } from "../inference/memoraid-notes";


const repo = new Repo();
// One-time security cleanup: earlier builds mirrored the bearer token to storage.local (disk).
// Auth now lives only in memory + storage.session, so scrub any token a prior build left on disk.
try { (browser.storage as any).local?.remove?.(["aidToken", "aidEndpoint"]); } catch {}
let sessionToken: string | null = null;       // in-memory only; never persisted to disk
let gqlEndpoint: string | null = null;        // learned AID GraphQL endpoint

const cachedImportantCharacters = new Map<string, string[]>();
const cachedRecentActions = new Map<string, CanonicalAction[]>();

// Session-scoped MemorAID intercept-path timing (resets when the background worker restarts).
// Only the action-intercept path is measured — that is where latency races interceptTimeout.
// Post-turn debounced runs are NOT recorded.
let memoraidTimingLastMs: number | null = null;
let memoraidTimingCount = 0;
let memoraidTimingSumMs = 0;

function memoraidTimingSnapshot() {
  return {
    lastMs: memoraidTimingLastMs,
    avgMs: memoraidTimingCount > 0 ? memoraidTimingSumMs / memoraidTimingCount : null,
    count: memoraidTimingCount,
  };
}

function recordMemoraidTiming(ms: number) {
  memoraidTimingLastMs = ms;
  memoraidTimingCount += 1;
  memoraidTimingSumMs += ms;
  broadcastToTabs({ kind: "memoraidTiming", payload: memoraidTimingSnapshot() });
}

let cachedOffMetaRepo: OffMetaSection[] | null = null;
let lastOffMetaFetchTime = 0;
const OFFMETA_FETCH_COOLDOWN_MS = 5 * 60 * 1000;

async function fetchOffMetaRepositoryIfNeeded(): Promise<OffMetaSection[]> {
  const now = Date.now();
  if (cachedOffMetaRepo && (now - lastOffMetaFetchTime < OFFMETA_FETCH_COOLDOWN_MS)) {
    return cachedOffMetaRepo;
  }

  try {
    const res = await fetch("https://docs.google.com/document/d/1na9MeTcx0QY6MkZdQSkFQFL91sT8BSiJ_6gxrC5sNEU/export?format=txt", { credentials: "omit" });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const text = await res.text();
    const cleanedText = text.replace(/\$\{character\.name\}/g, "{protagonist}");
    const parsed = parseOffMetaText(cleanedText);
    if (parsed.length > 0) {
      cachedOffMetaRepo = parsed;
      lastOffMetaFetchTime = now;
      console.log("[AID bg] Successfully fetched and parsed OffMeta Repository.");
    }
  } catch (err) {
    console.error("[AID bg] Failed to fetch OffMeta Repository:", err);
  }

  return cachedOffMetaRepo || [];
}

// Cards with an auto-update generation currently running (`${shortId}:${cardId}`) — guards
// against duplicate triggers while the multi-pass generation (tens of seconds) is in flight.
const autoUpdateInFlight = new Set<string>();

/**
 * Strip AI-Dungeon-style stutter prefixes from text: a single letter, a hyphen, then a word
 * beginning with the SAME letter (case-insensitive) — e.g. "m-Management" → "Management",
 * "H-here" → "here", "w-w-w-well" → "well" (looped for repeated stutters). The same-first-letter
 * constraint preserves real hyphenated terms like "X-Men", "T-Rex", "e-mail", "Kool-Aid".
 * Without this, a stutter like "m-Management" breaks NLP tagging and "Management Office" is
 * detected as just "Office".
 */
export function deStutter(text: string): string {
  let prev: string;
  let out = text;
  do {
    prev = out;
    out = out.replace(/\b([A-Za-z])-([A-Za-z])/g, (m, a, b) => (a.toLowerCase() === b.toLowerCase() ? b : m));
  } while (out !== prev);
  return out;
}

export function detectProperNouns(text: string, knownNames: string[], lexiconNames: string[] = []): string[] {
  // Preprocess text to strip metadata/commands:
  // 1. Remove bracketed text [...]
  // 2. Remove braced text {...}
  // 3. Remove parenthesized text (...)
  // 4. Remove slash commands and tokens starting with /
  let cleanedText = text
    .replace(/\[[\s\S]*?\]/g, ' ')
    .replace(/\{[\s\S]*?\}/g, ' ')
    .replace(/\([\s\S]*?\)/g, ' ')
    .replace(/\/\S+/g, ' ');

  cleanedText = deStutter(cleanedText);

  const lexicon: Record<string, string> = {};
  const allLexicon = new Set<string>();
  for (const name of knownNames) {
    allLexicon.add(name.trim().toLowerCase());
  }
  for (const name of lexiconNames) {
    allLexicon.add(name.trim().toLowerCase());
  }

  for (const trimmed of allLexicon) {
    if (trimmed) {
      lexicon[trimmed] = "ProperNoun";
      if (trimmed.includes("-")) {
        lexicon[trimmed.replace(/-/g, " ")] = "ProperNoun";
      }
    }
  }

  const doc = nlp(cleanedText, lexicon);
  const ignoreList = new Set([
    "i", "me", "my", "myself", "we", "our", "ours", "ourselves", "you", "your", "yours", "yourself", "yourselves",
    "he", "him", "his", "himself", "she", "her", "hers", "herself", "it", "its", "itself", "they", "them", "their",
    "theirs", "themselves", "what", "which", "who", "whom", "this", "that", "these", "those", "am", "is", "are",
    "was", "were", "be", "been", "being", "have", "has", "had", "having", "do", "does", "did", "doing", "a", "an",
    "the", "and", "but", "if", "or", "because", "as", "until", "while", "of", "at", "by", "for", "with", "about",
    "against", "between", "into", "through", "during", "before", "after", "above", "below", "to", "from", "up",
    "down", "in", "out", "on", "off", "over", "under", "again", "further", "then", "once", "here", "there", "when",
    "where", "why", "how", "all", "any", "both", "each", "few", "more", "most", "other", "some", "such", "no", "nor",
    "not", "only", "own", "same", "so", "than", "too", "very", "s", "t", "can", "will", "just", "don", "should", "now",
    "suddenly", "then", "meanwhile", "next", "yesterday", "tomorrow", "today", "someday", "soon", "actually", "finally",
    "quickly", "slowly", "instead", "however", "therefore", "although", "though", "you'd", "you'll", "you're", "you've",
    "he's", "she's", "it's", "they're", "we're", "i'm", "i've", "i'd", "i'll",
    "yes", "no", "oh", "well", "maybe", "please", "ah", "okay", "ok",
    "everything", "everyone", "everybody", "something", "someone", "somebody", "nothing", "nobody", "anything", "anyone", "anybody",
    
    // Verbs
    "read", "write", "say", "said", "ask", "asked", "look", "looked", "see", "saw", "go", "went", "come", "came", "take", "took", "make", "made", "get", "got", "give", "gave", "find", "found", "think", "thought", "know", "knew", "feel", "felt", "tell", "told", "keep", "kept", "leave", "left", "call", "called", "begin", "began", "start", "started", "try", "tried", "use", "used", "work", "worked", "turn", "turned", "stop", "stopped", "open", "opened", "close", "closed", "sit", "sat", "stand", "stood", "hear", "heard", "listen", "listened", "speak", "spoke", "talk", "talked", "wait", "waits", "waited", "waiting", "sigh", "sighs", "sighed", "sighing", "whisper", "whispers", "whispered", "whispering", "repeat", "repeats", "repeated", "repeating",
    
    // Common noise
    "egyptian", "mayan", "millennials", "millennial", "generation", "generations", "soul", "souls", "audi",
    "truth", "divine", "creator", "light", "sanctuary", "shepherd", "solar", "threshold", "materials", "group", "collective", "empire", "council", "path", "logos", "adversary", "inner", "circle", "law", "one", "theory", "string",

    // Added common words / noise from logs
    "like", "right", "truly", "besides", "success", "forcing", "force", "wait", "perhaps", "sure", "actually",
    "basically", "honestly", "really", "simply", "very", "quite", "already", "still", "even", "also", "always",
    "never", "often", "sometimes", "usually", "finally", "suddenly", "meanwhile", "next", "then", "now", "first",
    "second", "third", "last", "again", "pat", "grace", "yang", "gale", "spike", "skip", "let", "mark",
    "box", "boxes", "mystery", "mysteries", "hello", "hi", "hey", "bye", "goodbye",

    // Metadata & UI terms
    "block", "page", "chapter", "part", "scene", "turn", "action", "status", "error", "warning", "info", "debug",
    "config", "configure", "setting", "settings", "option", "options", "mode", "modes", "value", "values", "key",
    "keys", "title", "description", "note", "notes", "intake", "thought", "thoughts", "character", "characters",
    "location", "locations", "card", "cards", "story", "storycard", "storycards", "helper", "system", "tool",
    "version", "database", "explorer", "bucket", "favorite", "favorites", "global", "local", "item", "items",
    "type", "types", "class", "faction", "event", "events", "command", "commands", "prompt", "prompts", "guide",
    "guides", "user", "player", "protagonist", "vocals", "intro", "outro", "chorus", "verse", "solo", "guitar",
    "drum", "drums", "bass", "piano", "melody", "rhythm", "lyrics", "tempo", "breakdown", "transition",
    "transitions", "climax", "continuation"
  ]);

  const knownLower = new Set(knownNames.map(n => n.toLowerCase().trim()));
  const candidates: string[] = [];
  const rawTerms: string[] = [];
  const escapeRe = (s: string) => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");

  doc.match('#ProperNoun+ (of|the|a|an)* #ProperNoun+').out('array').forEach((s: string) => rawTerms.push(s));
  doc.match('#ProperNoun+').out('array').forEach((s: string) => rawTerms.push(s));

  for (const raw of rawTerms) {
    // 1. Normalize curly quotes/apostrophes
    let cleaned = raw.replace(/[’‘]/g, "'").replace(/[“”]/g, '"');

    // 2. Strip possessives
    cleaned = cleaned.replace(/'s\b/gi, '').trim();
    cleaned = cleaned.replace(/'(?=\s|$)/g, '').trim();

    // 3. Split on punctuation/symbol boundaries (excluding hyphens and internal apostrophes)
    const delimiters = /[.,\/#!$%\^&\*;:{}=\_`~()\[\]\"—–?|<>]+/;
    const parts = cleaned.split(delimiters)
      .map(p => p.replace(/^[-']+|[-']+$/g, '').trim())
      .filter(p => p.length >= 3);

    for (const part of parts) {
      // Ignore if it starts with a lowercase letter (proper nouns must be capitalized) unless defined in the lexicon
      if (/^[a-z]/.test(part) && !allLexicon.has(part.toLowerCase())) continue;

      // Ignore if it's all uppercase and length > 4 (acronyms or headers like "SCENE I")
      if (part === part.toUpperCase() && part.length > 4) continue;

      let cleanedPart = part;
      let words = cleanedPart.split(/\s+/);

      // Strip trailing pronoun "I"
      if (words.length > 1 && words[words.length - 1] === "I") {
        words.pop();
        cleanedPart = words.join(" ");
        words = cleanedPart.split(/\s+/);
      }

      // Extend designations
      const dm = new RegExp(`\\b${escapeRe(cleanedPart)}\\s+([A-Z]\\d{0,2}|\\d{1,3}[A-Z]?)(?![A-Za-z0-9])`).exec(cleanedText);
      if (dm && dm[1] !== "I") {
        cleanedPart = `${cleanedPart} ${dm[1]}`;
        words = cleanedPart.split(/\s+/);
      }

      const lower = cleanedPart.toLowerCase();
      if (ignoreList.has(lower) || knownLower.has(lower)) continue;

      const firstWord = words[0]!.toLowerCase();
      if (ignoreList.has(firstWord) && firstWord !== "the" && firstWord !== "a" && firstWord !== "an") {
        continue;
      }

      // Check sub-names of known names
      let isSubName = false;
      for (const known of knownNames) {
        const kl = known.toLowerCase();
        if (kl !== lower && (kl.startsWith(lower + " ") || kl.endsWith(" " + lower))) {
          isSubName = true;
          break;
        }
      }
      if (isSubName) continue;

      // POS-tag Filter for single-word candidates: if it's a verb/adjective/adverb/etc. in lowercase form
      // and not considered a proper noun by compromise.js, filter it out.
      if (words.length === 1) {
        const docLower = nlp(lower);
        if (!docLower.match('#ProperNoun').found) {
          if (docLower.match('#Verb|#Adjective|#Adverb|#Pronoun|#Conjunction|#Preposition').found) {
            continue;
          }
        }
      }

      if (!candidates.includes(cleanedPart)) {
        candidates.push(cleanedPart);
      }
    }
  }

  // Deduplicate and filter out substrings (e.g. if we have "Silverwood Forest" and "Forest", drop
  // "Forest").
  const filtered: string[] = [];
  for (const item of candidates) {
    const itemLower = item.toLowerCase();
    const isSubstring = candidates.some(other => {
      const otherLower = other.toLowerCase();
      return otherLower !== itemLower && otherLower.includes(itemLower);
    });
    if (!isSubstring && !filtered.includes(item)) {
      filtered.push(item);
    }
  }

  return filtered;
}

export function parseLocationFromMemory(memory: string | undefined): string | null {
  if (!memory) return null;
  const re = /(?:\[|\{)\s*(?:Current|Active)\s+Location:\s*([^\]\}]*)(?:\]|\})/i;
  const match = re.exec(memory);
  return match ? match[1]!.trim() : null;
}

export function updatePlotEssentialsLocation(memory: string | undefined, locationTitle: string | null): string {
  const mem = memory || "";
  const re = /\[\s*(?:Current|Active)\s+Location:\s*[^\]]*\]|\{\s*(?:Current|Active)\s+Location:\s*[^\}]*\}/gi;
  const match = re.exec(mem);
  const newBlock = locationTitle ? `[Current Location: ${locationTitle}]` : "";

  if (match) {
    if (newBlock) {
      return mem.slice(0, match.index) + newBlock + mem.slice(match.index + match[0]!.length);
    } else {
      const before = mem.slice(0, match.index);
      const after = mem.slice(match.index + match[0]!.length);
      return (before.trimEnd() + "\n" + after.trimStart()).trim();
    }
  } else {
    if (newBlock) {
      return mem.trim() ? mem.trim() + "\n\n" + newBlock : newBlock;
    }
    return mem;
  }
}

/**
 * Append `noun` to a comma/semicolon-separated trigger `keys` string, case-insensitively
 * de-duplicated. Preserves the existing separators and ordering; appends with ", ". Returns
 * the original string unchanged if the noun (trimmed) is already present or empty.
 */
export function mergeTriggerKey(keys: string, noun: string): string {
  const add = (noun || "").trim();
  if (!add) return keys || "";
  const existing = (keys || "").split(/[,;]+/).map(k => k.trim()).filter(Boolean);
  if (existing.some(k => k.toLowerCase() === add.toLowerCase())) return keys || "";
  return existing.length ? `${(keys || "").trim().replace(/[,;\s]+$/, "")}, ${add}` : add;
}

function isAliasMatch(nameA: string, nameB: string): boolean {
  const titlesAndArticles = new Set([
    "brother", "sister", "father", "mother", "mr", "mrs", "ms", "dr", "lord", "lady", "sir",
    "king", "queen", "prince", "princess", "captain", "general", "agent", "officer", "constable",
    "detective", "st", "saint", "uncle", "aunt", "grandpa", "grandma", "elder",
    "the", "a", "an", "of", "and", "in", "on", "at", "to", "from", "with"
  ]);

  const getNormalizedWords = (name: string) => {
    return name.toLowerCase()
      .replace(/[-\/\\^$*+?.()|[\]{}]/g, ' ')
      .split(/\s+/)
      .map(w => w.trim())
      .filter(w => w.length > 0 && !titlesAndArticles.has(w));
  };

  const wordsA = getNormalizedWords(nameA);
  const wordsB = getNormalizedWords(nameB);

  if (wordsA.length === 0 || wordsB.length === 0) return false;

  const isSubset = (setSmall: string[], setLarge: string[]) => {
    return setSmall.every(w => setLarge.includes(w));
  };

  // A (the candidate) ⊆ B (existing): the candidate is a SUB-name of a known entity
  // (e.g. "Blake" within "Nathaniel Blake") → always an alias.
  // B ⊆ A: the existing name is a sub-name of the candidate, i.e. the candidate is MORE
  // specific (e.g. existing key "building" ⊆ candidate "Building J"). Only treat as an alias
  // when the existing name is itself distinctive (≥2 words) — otherwise a generic single-word
  // key ("building", "office", "unit") would swallow every more-specific noun containing it.
  return isSubset(wordsA, wordsB) || (isSubset(wordsB, wordsA) && wordsB.length >= 2);
}

export async function runProperNounAutoDetection(shortId: string, newActions?: CanonicalAction[]): Promise<void> {
  const settings = await repo.getSettings();
  // Opt-OUT: detection is ON unless the user explicitly disabled it. It only surfaces suggestions
  // (no AI generation / cost), so default-on is safe; only an explicit `false` turns it off.
  if (settings?.enableProperNounDetection === false) return;

  const adv = await repo.getAdventure(shortId);
  if (!adv) return;

  const cards = await repo.getCards(shortId);
  const suggestions = adv.locationSuggestions || [];
  const logs = adv.properNounLogs || [];

  // Build a list of all existing resolved names/logs/suggestions in this adventure
  const existingNames: string[] = [];
  
  for (const c of cards) {
    if (c.deletedAt) continue;
    if (c.title) existingNames.push(c.title);
    if (c.keys) {
      const parts = c.keys.split(/[,;]+/).map(k => k.trim()).filter(Boolean);
      existingNames.push(...parts);
    }
  }

  if (adv.protagonistName) {
    existingNames.push(adv.protagonistName);
  }

  for (const l of logs) {
    if (l.properNoun) existingNames.push(l.properNoun);
  }

  for (const s of suggestions) {
    if (s.properNoun) existingNames.push(s.properNoun);
  }

  const allCards = await repo.getAllCards(shortId).catch(() => [] as CardRow[]);
  const globalLexiconNames: string[] = [];
  for (const c of allCards) {
    if (c.deletedAt) continue;
    if (c.title) globalLexiconNames.push(c.title);
    if (c.keys) {
      const parts = c.keys.split(/[,;]+/).map(k => k.trim()).filter(Boolean);
      globalLexiconNames.push(...parts);
    }
  }

  let actionsToScan = newActions;
  if (!actionsToScan || actionsToScan.length === 0) {
    const allActions = await repo.getActions(shortId);
    allActions.sort((a, b) => {
      if (a.createdAt && b.createdAt) {
        return a.createdAt.localeCompare(b.createdAt);
      }
      return 0;
    });
    actionsToScan = allActions.slice(-5);
  }

  let updated = false;

  // Ungated decision trail — detection was previously silent, making "X didn't fire" undiagnosable.
  const decisions: string[] = [];

  for (const action of actionsToScan) {
    if (!action.text) continue;
    const candidates = detectProperNouns(action.text, existingNames, globalLexiconNames);
    if (candidates.length) decisions.push(`[${action.id}] candidates=[${candidates.join(", ")}]`);

    for (const noun of candidates) {
      // Perform strict algorithmic alias checking on each candidate noun against our resolved entities
      const aliasOf = existingNames.find(existing => isAliasMatch(noun, existing));
      if (aliasOf) {
        decisions.push(`  "${noun}": skipped (alias of "${aliasOf}")`);
        continue;
      }

      decisions.push(`  "${noun}": SUGGESTED`);
      // Add to suggestions
      suggestions.push({
        properNoun: noun,
        actionId: action.id,
        actionText: action.text,
        timestamp: new Date().toISOString(),
        status: "pending"
      });
      existingNames.push(noun);
      updated = true;
    }
  }

  console.info(
    `[AID bg] Proper-noun detection scanned ${actionsToScan.length} action(s): ` +
    (decisions.length ? decisions.join(" ") : "(no candidates)")
  );

  if (updated) {
    await repo.upsertAdventure({
      shortId,
      locationSuggestions: suggestions
    });
    broadcastToTabs({ kind: "stateUpdated", shortId });
  }
}

async function updateConfigCache(shortId: string) {
  try {
    const cards = await repo.getCards(shortId);
    if (!cards || !cards.length) return;
    const configCard = cards.find(
      (c) =>
        !c.deletedAt &&
        (c.title || "").toLowerCase() === "configure memoraid"
    );
    if (!configCard) {
      cachedImportantCharacters.delete(shortId);
      return;
    }
    const description = configCard.description || "";
    const match = description.match(/IMPORTANT_CHARACTERS\s*:\s*([\s\S]+?)(?=\n\s*[A-Z_]+:|$)/i);
    if (!match || !match[1]) {
      cachedImportantCharacters.delete(shortId);
      return;
    }
    const importantNames = match[1]
      .split(/[,\r\n]+/)
      .map((name) => name.trim().toLowerCase())
      .filter((name) => name.length > 0);
    cachedImportantCharacters.set(shortId, importantNames);
    dlog(`[AID bg] Updated cached important characters for ${shortId}:`, importantNames);
  } catch (err) {
    console.error("[AID bg] Failed to update config cache:", err);
  }
}

async function updateRecentActionsCache(shortId: string, actions?: CanonicalAction[]) {
  try {
    const actList = actions || await repo.getActions(shortId);
    const sliced = actList.slice(-30);
    cachedRecentActions.set(shortId, sliced);
    dlog(`[AID bg] Updated cached recent actions count for ${shortId}:`, sliced.length);
  } catch (err) {
    console.error("[AID bg] Failed to update actions cache:", err);
  }
}

// Debug-gated logging: verbose info traces (action/memory/card text) only print when the user
// enables "Show debug" in Settings. warn/error stay ungated. `debugEnabled` is refreshed whenever
// settings are read/saved (getState/setSettings). `_log` keeps a literal-free ref so the bulk
// console.log -> dlog rename doesn't recurse.
let debugEnabled = false;
const _log = console.log.bind(console);
function dlog(...args: unknown[]) { if (debugEnabled) _log(...args); }

const _originalFetch = globalThis.fetch;
async function fetchWithRelay(url: string, init?: any): Promise<any> {
  try {
    return await _originalFetch(url, init);
  } catch (err: any) {
    const isNetworkError = err && (err.name === "TypeError" || err.message?.includes("NetworkError") || err.message?.includes("fetch"));
    if (isNetworkError && url && (url.includes("aidungeon.com") || url === gqlEndpoint)) {
      let shortId: string | null = null;
      if (init?.body) {
        try {
          const bodyObj = JSON.parse(init.body);
          const batch = Array.isArray(bodyObj) ? bodyObj : [bodyObj];
          for (const item of batch) {
            const vars = item.variables || {};
            shortId = vars.shortId || vars.input?.shortId || vars.adventureId || vars.input?.adventureId;
            if (shortId) break;
          }
        } catch {}
      }

      if (shortId) {
        dlog(`[AID bg] Background fetch to ${url} failed. Relaying request via content script for adventure ${shortId}...`);
        try {
          const tabs = await browser.tabs.query({ url: "*://*.aidungeon.com/*" }).catch(() => []);
          let targetTabId: number | null = null;
          for (const tab of tabs) {
            if (tab.id && tab.url && tab.url.includes(shortId!)) {
              targetTabId = tab.id;
              break;
            }
          }
          if (!targetTabId && tabs.length > 0 && tabs[0]?.id !== undefined) {
            targetTabId = tabs[0].id;
          }
          if (targetTabId) {
            const res: any = await browser.tabs.sendMessage(targetTabId, {
              kind: "relayFetch",
              url,
              init: {
                method: init.method,
                headers: init.headers,
                body: init.body
              }
            });
            if (res && typeof res === "object") {
              if (!res.error) {
                dlog("[AID bg] Relay fetch successful.");
                return {
                  ok: res.ok,
                  status: res.status,
                  statusText: res.statusText,
                  headers: new Headers(res.headers || {}),
                  text: async () => res.body,
                  json: async () => JSON.parse(res.body),
                  clone() { return this; }
                } as any;
              } else {
                console.error("[AID bg] Content script returned relay error:", res.error);
                throw new Error(res.error);
              }
            }
          }
        } catch (fallbackErr) {
          console.error("[AID bg] Relay fetch fallback failed:", fallbackErr);
        }
      }
    }
    throw err;
  }
}
const fetch = fetchWithRelay;

// storage.session is held in memory and cleared when the browser closes — it is NEVER written
// to disk. We mirror the token/endpoint there so they survive the MV3 event page being unloaded
// while idle; otherwise a push after the background recycled would fail with "no session token".
const sessionStore = (browser.storage as any).session as
  | { get(keys: string[]): Promise<any>; set(items: any): Promise<void> }
  | undefined;

async function rememberAuth(opts: { token?: string; endpoint?: string }): Promise<void> {
  const patch: Record<string, string> = {};
  if (opts.token) { sessionToken = opts.token; patch.aidToken = opts.token; }
  if (opts.endpoint) { gqlEndpoint = opts.endpoint; patch.aidEndpoint = opts.endpoint; }
  // Persist ONLY to storage.session: it is in-memory and session-scoped, so the bearer token is
  // never written to persistent disk. It survives MV3 worker recycling within a browser session;
  // a fresh session re-captures the token from the first authenticated page request the interceptor
  // sees (every background op that needs auth is downstream of page activity), so disk persistence
  // bought almost nothing and exposed the token at rest.
  if (sessionStore && Object.keys(patch).length > 0) { try { await sessionStore.set(patch); } catch {} }
}

/** Rehydrate token/endpoint from storage.session if the in-memory copies were lost to worker recycling. */
async function ensureAuth(): Promise<void> {
  if (sessionToken && gqlEndpoint) return;
  if (!sessionStore) return;
  try {
    const s = await sessionStore.get(["aidToken", "aidEndpoint"]);
    if (!sessionToken && s?.aidToken) sessionToken = s.aidToken;
    if (!gqlEndpoint && s?.aidEndpoint) gqlEndpoint = s.aidEndpoint;
  } catch {}
}

function isSafeEndpoint(url: string | null): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return (u.hostname === "aidungeon.com" || u.hostname.endsWith(".aidungeon.com")) && u.pathname === "/graphql";
  } catch { return false; }
}

async function fetchAdventureTitle(shortId: string): Promise<string | null> {
  try {
    await ensureAuth();
    if (!sessionToken || !gqlEndpoint) return null;
    const query = `
      query GetAdventureTitle($shortId: String!) {
        adventure(shortId: $shortId) {
          id
          title
        }
      }
    `;
    const req = {
      url: gqlEndpoint!,
      headers: { "content-type": "application/json", authorization: sessionToken! },
      body: JSON.stringify([{
        operationName: "GetAdventureTitle",
        query,
        variables: { shortId }
      }])
    };
    const res = await fetch(req.url, { method: "POST", headers: req.headers, body: req.body });
    const json = await res.json();
    const items = Array.isArray(json) ? json : [json];
    const title = items[0]?.data?.adventure?.title;
    return title || null;
  } catch (err) {
    console.error(`[AID bg] Failed to fetch title for adventure ${shortId}:`, err);
    return null;
  }
}

let ensureTitlesInProgress = false;
async function ensureAdventureTitles(adventures: AdventureMeta[]): Promise<void> {
  if (ensureTitlesInProgress) return;
  await ensureAuth();
  if (!sessionToken || !gqlEndpoint) return;

  const untitled = adventures.filter(a => {
    const title = a.title;
    return !title || title === "AI Dungeon" || title === "Untitled Adventure" || title === "Adventure";
  });

  if (untitled.length === 0) return;

  ensureTitlesInProgress = true;
  try {
    console.log(`[AID bg] Checking/resolving titles for ${untitled.length} untitled/generic adventure(s)...`);
    for (const adv of untitled) {
      const title = await fetchAdventureTitle(adv.shortId);
      if (title && title !== "AI Dungeon" && title !== "Untitled Adventure" && title !== "Adventure") {
        console.log(`[AID bg] Resolved title for ${adv.shortId} -> "${title}"`);
        await repo.upsertAdventure({ shortId: adv.shortId, title });
        broadcastToTabs({ kind: "stateUpdated", shortId: adv.shortId });
      }
    }
  } catch (err) {
    console.error("[AID bg] Error in ensureAdventureTitles:", err);
  } finally {
    ensureTitlesInProgress = false;
  }
}

async function runBackfill(shortId: string): Promise<{ loaded: number } | { error: string }> {
  const op = await repo.getOp("GetGameplayAdventure");
  if (!op) return { error: "Open the adventure once so I can learn the read operation, then retry." };
  if (op.kind !== "read") return { error: "Refusing to replay a non-read operation." };
  await ensureAuth();
  if (!sessionToken) return { error: "No session token yet — interact with the page once, then retry." };
  if (!isSafeEndpoint(gqlEndpoint)) {
    return { error: "No AI Dungeon GraphQL endpoint observed yet." };
  }
  const endpoint = gqlEndpoint!, token = sessionToken, query = op.query;

  // Fetch memories and storySummary directly using a guaranteed custom query
  try {
    const memoriesQuery = `
      query GetAdventureMemories($shortId: String!) {
        adventure(shortId: $shortId) {
          id
          title
          state {
            memories
          }
        }
      }
    `;
    const memReq = {
      url: endpoint,
      headers: { "content-type": "application/json", authorization: token },
      body: JSON.stringify([{
        operationName: "GetAdventureMemories",
        query: memoriesQuery,
        variables: { shortId }
      }])
    };
    const memRes = await fetch(memReq.url, { method: "POST", headers: memReq.headers, body: memReq.body });
    const memJson = await memRes.json();
    const items = Array.isArray(memJson) ? memJson : [memJson];
    const advData = items[0]?.data?.adventure;
    if (advData) {
      const rawMems = advData.state?.memories;
      const oldMemories = (await repo.getAdventure(shortId))?.memoryBankEntries || [];
      const parsedMems = Array.isArray(rawMems)
        ? rawMems.map((m: any) => {
            const text = typeof m === "string" ? m : (m?.text || "");
            const old = oldMemories.find((o) => o.text === text);
            if (old) return old;
            return typeof m === "string" ? { actionIds: [], text: m } : m;
          })
        : [];
      
      await repo.upsertAdventure({
        shortId,
        title: advData.title || undefined,
        memoryBankEntries: parsedMems
      });
      dlog("[AID bg] Backfilled memories successfully using custom query.");
    }
  } catch (err) {
    console.error("[AID bg] Failed to backfill memories with custom query:", err);
  }

  let backfillCardIds: string[] | null = null;
  const fetcher = async (_cursor: number | string | null): Promise<Page> => {
    const req = buildGameplayRequest(endpoint, query, shortId, token, 100000);
    const res = await fetch(req.url, { method: "POST", headers: req.headers, body: req.body });
    const json = await res.json();
    const parsed = parseGameplayResponse(json);
    const advUpdate: {
      shortId: string;
      title?: string;
      memory?: string;
      memoryBankEntries?: any[];
      instructions?: string;
      authorsNote?: string;
    } = { shortId };
    if (parsed.title) advUpdate.title = parsed.title;
    if (parsed.memory) advUpdate.memory = parsed.memory;
    if (parsed.instructions) advUpdate.instructions = parsed.instructions;
    if (parsed.authorsNote) advUpdate.authorsNote = parsed.authorsNote;
    if (parsed.memoryBankEntries) {
      const oldMemories = (await repo.getAdventure(shortId))?.memoryBankEntries || [];
      advUpdate.memoryBankEntries = parsed.memoryBankEntries.map((m: any) => {
        const text = typeof m === "string" ? m : (m?.text || "");
        const old = oldMemories.find((o) => o.text === text);
        if (old) return old;
        return typeof m === "string" ? { actionIds: [], text: m } : m;
      });
    }
    if (
      advUpdate.title ||
      advUpdate.memory ||
      advUpdate.memoryBankEntries ||
      advUpdate.instructions ||
      advUpdate.authorsNote
    ) {
      await repo.upsertAdventure(advUpdate);
    }
    if (Array.isArray(parsed.storyCards)) {
      await repo.putCards(shortId, parsed.storyCards.map((c) => ({ ...c, shortId })));
      backfillCardIds = parsed.storyCards.map((c: any) => c.id);
    }
    return { actions: parsed.actions, hasMore: false, nextCursor: null };
  };
  const ordered = await backfillAll(fetcher, undefined, 1);
  const canonical = applyActionUpdate([], {
    type: "backfill", adventureId: shortId, retriedActionId: null, cachedOutputs: [], actions: ordered,
  });
  await repo.replaceAllActions(shortId, canonical);
  if (backfillCardIds) await repo.reconcileDeletedCards(shortId, backfillCardIds);
  await seedBaselines(shortId);
  return { loaded: canonical.length };
}

/**
 * Deterministically populate the tracked roster from LOCAL data (Story Cards + Plot Essentials)
 * — no AI call. Creates an "applied" baseline Version for any card/plot entity that doesn't
 * have one yet. Idempotent: existing entities are skipped.
 */
const seedBaselinesInFlight = new Map<string, Promise<Awaited<ReturnType<Repo["getVersions"]>>>>();

/**
 * Populate the roster with deterministic baselines (no AI). Accepts already-loaded data via `ctx`
 * to avoid re-reading the same stores the caller (e.g. getState) just read, and RETURNS the
 * post-seed versions so the caller can reuse them without another getVersions() round-trip.
 */
async function seedBaselines(
  shortId: string,
  ctx?: {
    adv?: Awaited<ReturnType<Repo["getAdventure"]>>;
    cards?: CardRow[];
    actions?: Awaited<ReturnType<Repo["getActions"]>>;
    actionsCount?: number;
  }
): Promise<Awaited<ReturnType<Repo["getVersions"]>>> {
  if (seedBaselinesInFlight.has(shortId)) {
    await seedBaselinesInFlight.get(shortId);
    return repo.getVersions(shortId);
  }

  const promise = (async () => {
    const adv = ctx?.adv ?? await repo.getAdventure(shortId);
    const cards = ctx?.cards ?? await repo.getCards(shortId);
    const versions = await repo.getVersions(shortId);
    const plotBlocks = parsePlotEssentials(adv?.memory);

    // Self-healing: delete duplicate baseline versions
    const baselineKeys = new Set<string>();
    const versionsToKeep: Version[] = [];
    const versionsToDelete: Version[] = [];

    for (const v of versions) {
      const isBaseline = v.changeSummary && v.changeSummary.startsWith("Baseline");
      if (isBaseline) {
        const key = `${v.characterName.toLowerCase()}::${(v as any).cardId || ""}`;
        if (baselineKeys.has(key)) {
          versionsToDelete.push(v);
        } else {
          baselineKeys.add(key);
          versionsToKeep.push(v);
        }
      } else {
        versionsToKeep.push(v);
      }
    }

    if (versionsToDelete.length > 0) {
      dlog(`[AID bg] Found ${versionsToDelete.length} duplicate baselines for ${shortId}. Cleaning up...`);
      for (const v of versionsToDelete) {
        await repo.deleteVersion(v.id);
      }
      versions.length = 0;
      versions.push(...versionsToKeep);
    }

  // Transition any character from Plot Essentials ("plot") to Story Card ("card")
  // if a matching Story Card has been created and synced.
  const activeCardNames = new Set(cards.filter((c) => c.deletedAt == null).map((c) => c.title || c.keys));
  for (const v of versions) {
    if (v.source === "plot" && activeCardNames.has(v.characterName)) {
      v.source = "card";
      if (v.changeSummary === "Baseline (Plot Essentials)") {
        v.changeSummary = "Baseline (Story Card)";
      }
      const match = cards.find(c => c.deletedAt == null && (c.title === v.characterName || c.keys === v.characterName));
      if (match) {
        (v as any).cardId = match.id;
        (v as any).cardType = match.type || "character";
      }
      await repo.putVersion(v);
    }
  }

  // Backfill cardId and cardType for older version records in IndexedDB
  for (const v of versions) {
    if (v.source === "card" && !(v as any).cardId) {
      let match = cards.find(c => {
        const titleMatch = c.title && c.title.trim().toLowerCase() === v.characterName.trim().toLowerCase();
        if (!titleMatch) return false;
        return !(v as any).cardType || c.type === (v as any).cardType;
      });
      if (!match) {
        match = cards.find(c => {
          const keysList = (c.keys || "").split(/[,;]+/).map(k => k.trim().toLowerCase()).filter(Boolean);
          const keysMatch = keysList.includes(v.characterName.trim().toLowerCase());
          if (!keysMatch) return false;
          return !(v as any).cardType || c.type === (v as any).cardType;
        });
      }
      if (!match) {
        match = cards.find(c => c.title && c.title.trim().toLowerCase() === v.characterName.trim().toLowerCase());
      }
      if (match) {
        (v as any).cardId = match.id;
        (v as any).cardType = match.type || "character";
        await repo.putVersion(v);
      }
    }
  }

  // Follow card RENAMES and TYPE CHANGES: versions are keyed by characterName, so renaming a card in AID
  // orphans its history under the old title (a "ghost" roster entry stuck at its old action
  // count) AND resets the auto-update due-predicate for the new title (past updates stop
  // counting, so the card re-triggers every turn). Versions carry cardId — re-point them
  // at the card's CURRENT title and type so history merges and the ghost disappears.
  for (const v of versions) {
    const cid = (v as any).cardId;
    if (!cid || v.source !== "card") continue;
    const card = cards.find((c) => c.id === cid && c.deletedAt == null);
    if (!card) continue; // deleted cards keep their historical name (Archived view)
    const currentName = card.title || card.keys;
    const currentType = card.type || "character";
    let dirty = false;
    if (currentName && v.characterName !== currentName) {
      dlog(`[AID bg] Card ${cid} renamed: migrating version history "${v.characterName}" -> "${currentName}".`);
      v.characterName = currentName;
      dirty = true;
    }
    if ((v as any).cardType !== currentType) {
      dlog(`[AID bg] Card ${cid} type changed: migrating version history cardType "${(v as any).cardType}" -> "${currentType}".`);
      (v as any).cardType = currentType;
      dirty = true;
    }
    if (dirty) {
      await repo.putVersion(v);
    }
  }

  const seenKeys = new Set<string>();
  for (const v of versions) {
    if ((v as any).cardId) {
      seenKeys.add(`id:${(v as any).cardId}`);
    }
    const typeLabel = (v as any).cardType || "";
    if (typeLabel) {
      seenKeys.add(`name-type:${v.characterName.trim().toLowerCase()}:${typeLabel.trim().toLowerCase()}`);
    }
    seenKeys.add(`name:${v.characterName.trim().toLowerCase()}`);
  }

  const totalActions = ctx?.actionsCount ?? ctx?.actions?.length ?? await repo.getActionCount(shortId);
  const entries = [
    ...cards.filter((c) => c.deletedAt == null).map((c) => ({
      name: c.title || c.keys,
      entry: c.value,
      source: "card" as const,
      summary: "Baseline (Story Card)",
      type: c.type || "character",
      cardId: c.id
    })),
    ...plotBlocks.map((b) => ({
      name: b.name,
      entry: b.text,
      source: "plot" as const,
      summary: "Baseline (Plot Essentials)",
      type: undefined,
      cardId: undefined
    })),
  ];

  for (const e of entries) {
    if (!e.name) continue;

    let isSeen = false;
    if (e.cardId) {
      // A real Story Card's identity is its cardId — NOT its name. Two cards may share a name
      // across categories (e.g. a Character "Adrian" and a Plan "Adrian"); each must get its own
      // baseline. Never fall through to the bare-name check for a card that carries a cardId.
      isSeen = seenKeys.has(`id:${e.cardId}`);
      if (!isSeen && e.type) {
        isSeen = seenKeys.has(`name-type:${e.name.trim().toLowerCase()}:${e.type.toLowerCase()}`);
      }
    } else {
      isSeen = seenKeys.has(`name:${e.name.trim().toLowerCase()}`);
    }

    if (!isSeen) {
      const nv = {
        id: crypto.randomUUID(),
        shortId,
        characterName: e.name,
        entry: e.entry,
        // Stamp the baseline at the CURRENT action count, not 0. A baseline is "we captured this
        // card's state as of now" — so the lookback auto-update should wait `analyzeWindow` turns
        // of sustained presence before regenerating. Stamping 0 made every newly-seen card read as
        // `total - 0 >= window` → instantly "due", auto-profiling even one-off mentions.
        changeSummary: e.summary,
        source: e.source,
        status: "applied" as const,
        createdAt: new Date().toISOString(),
        actionCount: totalActions,
        cardId: e.cardId,
        cardType: e.type,
      };
      await repo.putVersion(nv as any);
      versions.push(nv as any);

        if (e.cardId) {
          seenKeys.add(`id:${e.cardId}`);
        }
        if (e.type) {
          seenKeys.add(`name-type:${e.name.trim().toLowerCase()}:${e.type.toLowerCase()}`);
        }
        seenKeys.add(`name:${e.name.trim().toLowerCase()}`);
      }
    }
    return versions;
  })();

  seedBaselinesInFlight.set(shortId, promise);
  try {
    return await promise;
  } finally {
    seedBaselinesInFlight.delete(shortId);
  }
}

/** Dedicated Story Card type for MemorAID's own config card, so it files under its own category
 *  in AID and the panel instead of polluting the generic "custom" group. */
const MEMORAID_CONFIG_TYPE = "MemorAID";

/**
 * Lazily migrate a legacy "Configure MemorAID" config card (historically created with type
 * "custom") to its dedicated {@link MEMORAID_CONFIG_TYPE}. Runs on adventure load (getState):
 * the type change is pushed back to AID via UseAutoSaveStoryCard, and only on success is the local
 * copy updated. Best-effort — if auth isn't ready yet or the push fails, the card is left as-is to
 * retry on the next load, and getState is never blocked. Returns `cards` with any successful local
 * migration applied so callers see the new type immediately.
 */
async function migrateConfigCardType(shortId: string, cards: CardRow[]): Promise<CardRow[]> {
  const stale = cards.find(
    (c) =>
      !c.deletedAt &&
      (c.title || "").toLowerCase() === "configure memoraid" &&
      (c.type || "") !== MEMORAID_CONFIG_TYPE
  );
  if (!stale) return cards;
  try {
    await ensureAuth();
    if (!sessionToken || !isSafeEndpoint(gqlEndpoint)) return cards; // not ready — retry next load
    const updateOp = await repo.getOp("UseAutoSaveStoryCard");
    const updateQuery = updateOp?.query || DEFAULT_GQL_QUERIES.UseAutoSaveStoryCard;
    const migrated = { ...stale, type: MEMORAID_CONFIG_TYPE };
    const req = buildCardSave(gqlEndpoint!, updateQuery, sessionToken!, migrated, migrated.value || "");
    const res = await fetch(req.url, { method: "POST", headers: req.headers, body: req.body });
    if (!res.ok) return cards;
    const json = (await res.json()) as any;
    const ok =
      json?.[0]?.data?.updateStoryCard?.success ||
      json?.[0]?.data?.updateStoryCard?.storyCard ||
      json?.[0]?.data?.updateStoryCard;
    if (!ok) return cards;
    await repo.putCards(shortId, [migrated]);
    dlog(`[AID bg] Migrated "Configure MemorAID" card ${stale.id} from type "${stale.type}" to "${MEMORAID_CONFIG_TYPE}".`);
    return cards.map((c) => (c.id === stale.id ? migrated : c));
  } catch (err) {
    console.warn("[AID bg] Configure MemorAID type migration deferred:", err);
    return cards;
  }
}

async function runAnalyze(shortId: string): Promise<{ count: number; proposedNames: string[]; proposals: { id: string; characterName: string; changeSummary: string; entry: string }[]; warnings: string[]; debug: object } | { error: string }> {
  const settings = await repo.getSettings();
  const providerName = settings?.provider || "claude";
  const apiKey = settings?.apiKeys?.[providerName];
  if (!settings || (!apiKey && providerName !== "ollama")) {
    return { error: `Set your API key/endpoint for ${providerName} in settings.` };
  }
  const adv = await repo.getAdventure(shortId);
  if (!adv?.protagonistName) return { error: "Set your character's name in settings." };
  const windowN = settings.analyzeWindow && settings.analyzeWindow > 0 ? settings.analyzeWindow : 20;
  const allActions = await repo.getActions(shortId);
  const recent = sliceLastActions(allActions, windowN); // last N *actions* (incl. player inputs), not raw actions
  // Plot Essentials only: Story Cards are handled separately via runGenerateCard.
  let req = buildAnalyzeRequest(adv.protagonistName, recent, adv.memory);
  req.useMemories = settings?.useMemories;
  if (settings?.useMemories) {
    const memsText = parseMemories(adv.memory);
    if (memsText) {
      req.characters.push({
        name: "Memories",
        currentEntry: memsText,
        source: "plot",
        type: "custom"
      });
      req.present.push("Memories");
    }
  }
  req.customPromptSection1 = settings?.customPromptSection1;
  req.customPromptSection2 = settings?.customPromptSection2;
  req.customPromptSection3 = settings?.customPromptSection3;
  req.customPromptSection4 = settings?.customPromptSection4;
  req.typeGuidance = { ...DEFAULT_TYPE_GUIDANCE, ...(settings?.typeGuidance ?? {}) };
  if (req.characters.length === 0) return { error: "No Plot Essentials characters found in memory." };

  // Ensure baselines exist (deterministic, no AI) before proposing updates.
  await seedBaselines(shortId);

  // Override currentEntry with the latest applied version so accepted changes carry forward
  const versionsNow = await repo.getVersions(shortId); // ascending by createdAt
  const latestApplied = new Map<string, string>();
  for (const v of versionsNow) if (v.status === "applied") latestApplied.set(v.characterName, v.entry); // last wins
  req = { ...req, characters: req.characters.map((c) => ({ ...c, currentEntry: latestApplied.get(c.name) ?? c.currentEntry })) };

  let provider;
  const model = settings.model || "";
  if (providerName === "openai") {
    provider = new OpenAIProvider(apiKey || "", model || "gpt-4o-mini");
  } else if (providerName === "gemini") {
    provider = new GeminiProvider(apiKey || "", model || "gemini-1.5-pro");
  } else if (providerName === "ollama") {
    provider = new OllamaProvider(apiKey || "http://localhost:11434", model || "llama3");
  } else {
    provider = new ClaudeProvider(apiKey || "", model || "claude-3-5-sonnet-latest");
  }

  const totalActionsCount = countActions(allActions);
  const { proposals, warnings } = await analyze(provider, req);
  const created: { id: string; characterName: string; changeSummary: string; entry: string }[] = [];
  for (const p of proposals) {
    const id = crypto.randomUUID();
    await repo.putVersion({
      id, shortId, characterName: p.name, entry: p.newEntry,
      changeSummary: p.changeSummary, triggers: p.suggestedTriggers, source: p.source,
      status: "pending", createdAt: new Date().toISOString(),
      actionCount: totalActionsCount,
    });
    created.push({ id, characterName: p.name, changeSummary: p.changeSummary, entry: p.newEntry });
  }
  await repo.upsertAdventure({ shortId, lastAnalysisAction: totalActionsCount });
  return {
    count: proposals.length,
    proposedNames: proposals.map((p) => p.name),
    proposals: created,
    warnings,
    debug: {
      narrativeChars: req.narrative.length,
      narrativeTail: req.narrative.slice(-600),
      characters: req.characters.map((c) => c.name),
      rawSnippet: provider.lastRaw ?? "",
      windowN,
    },
  };
}

async function applyVersionLocally(versionId: string): Promise<void> {
  const v = await repo.getVersion(versionId);
  if (!v) return;

  // Plot Essentials characters are not Story Cards; write-back is Plan 4
  if (v.source === "plot") return;

  const cards = await repo.getCards(v.shortId);
  const match = cards.find((c) => (c.title || c.keys) === v.characterName);
  if (match) {
    await repo.putCards(v.shortId, [{ ...match, value: v.entry }]);
  }
  // If no matching card exists for a card-sourced version, skip (no auto-create)
}

async function runApplyToAid(versionId: string): Promise<{ ok: boolean; source?: string; cardId?: string; characterName?: string; value?: string; description?: string; memory?: string } | { error: string }> {
  dlog("[AID bg] runApplyToAid called for version:", versionId);
  const v = await repo.getVersion(versionId);
  if (!v) {
    console.error("[AID bg] Version not found:", versionId);
    return { error: "Version not found." };
  }
  if (v.status !== "applied") {
    console.warn("[AID bg] Version status is not 'applied':", v.status);
    return { error: "Version must be accepted/applied first." };
  }

  dlog("[AID bg] Version data loaded:", JSON.stringify(v));
  await ensureAuth();
  if (!sessionToken) {
    console.error("[AID bg] Missing sessionToken!");
    return { error: "No session token yet — interact with the page once, then retry." };
  }
  if (!isSafeEndpoint(gqlEndpoint)) {
    console.error("[AID bg] Safe endpoint check failed for:", gqlEndpoint);
    return { error: "No AI Dungeon GraphQL endpoint observed yet." };
  }

  const endpoint = gqlEndpoint!;
  const token = sessionToken;

  if (v.source === "card") {
    dlog("[AID bg] Replaying Story Card write mutation...");
    const op = await repo.getOp("UseAutoSaveStoryCard");
    if (!op) {
      console.warn("[AID bg] No learned UseAutoSaveStoryCard mutation!");
      return { error: "Perform a Story Card edit/save once in the AID UI so I can learn the operation shape." };
    }

    const cards = await repo.getCards(v.shortId);
    const card = cards.find((c) => (c.title || c.keys) === v.characterName);
    if (!card) {
      console.error("[AID bg] Story Card not found in DB for:", v.characterName);
      return { error: `No matching Story Card found for '${v.characterName}'.` };
    }

    dlog("[AID bg] Story Card found, building UseAutoSaveStoryCard request payload...");
    const req = buildCardSave(endpoint, op.query, token, card, v.entry);
    dlog("[AID bg] Sending fetch to UseAutoSaveStoryCard...", req.url);
    const res = await fetch(req.url, { method: "POST", headers: req.headers, body: req.body });
    dlog("[AID bg] Fetch response status:", res.status, res.statusText);
    if (!res.ok) {
      console.error("[AID bg] GraphQL card push HTTP failure:", res.status);
      return { error: `GraphQL push failed with HTTP ${res.status}` };
    }

    const json: any = await res.json();
    dlog("[AID bg] Fetch response JSON:", JSON.stringify(json));
    const isSuccess = json?.[0]?.data?.updateStoryCard?.success;
    if (!isSuccess) {
      const msg = json?.[0]?.data?.updateStoryCard?.message || json?.[0]?.errors?.[0]?.message || "Mutation failed";
      console.error("[AID bg] AI Dungeon rejected Story Card update:", msg);
      return { error: `AI Dungeon rejected card update: ${msg}` };
    }

    const now = new Date().toISOString();
    await repo.setVersionPushed(v.id, now);
    dlog("[AID bg] Story Card push successful, database updated.");
    return { ok: true, source: v.source, cardId: card.id, characterName: v.characterName, value: v.entry, description: card.description };
  } else {
    dlog("[AID bg] Replaying Plot Essentials memory write mutation...");
    const op = await repo.getOp("UpdateAdventurePlot");
    const query = op?.query || DEFAULT_GQL_QUERIES.UpdateAdventurePlot;

    const adv = await repo.getAdventure(v.shortId);
    if (!adv) {
      console.error("[AID bg] Adventure metadata not found for shortId:", v.shortId);
      return { error: `Could not locate adventure metadata in database for shortId '${v.shortId}'.` };
    }
    const currentMemory = adv.memory || "";

    dlog("[AID bg] Current memory block length:", currentMemory.length);
    const newMemory = replaceBlock(currentMemory, v.characterName, v.entry);
    if (newMemory === null) {
      console.error("[AID bg] Block replacement failed! replaceBlock returned null for:", v.characterName);
      const parsed = parsePlotEssentials(currentMemory);
      const names = parsed.map((p) => `'${p.name}'`).join(", ");
      return { error: `Could not locate character block for '${v.characterName}' in Plot Essentials. Memory length: ${currentMemory.length} chars. Parsed blocks: [${names || "none"}]` };
    }

    dlog("[AID bg] Memory block successfully replaced. Building UpdateAdventurePlot payload...");
    const req = buildMemorySave(endpoint, query, token, v.shortId, newMemory);
    dlog("[AID bg] Sending fetch to UpdateAdventurePlot...", req.url);
    const res = await fetch(req.url, { method: "POST", headers: req.headers, body: req.body });
    dlog("[AID bg] Fetch response status:", res.status, res.statusText);
    if (!res.ok) {
      console.error("[AID bg] GraphQL memory push HTTP failure:", res.status);
      return { error: `GraphQL push failed with HTTP ${res.status}` };
    }

    const json: any = await res.json();
    dlog("[AID bg] Fetch response JSON:", JSON.stringify(json));
    const isSuccess = json?.[0]?.data?.updateAdventurePlot?.success;
    if (!isSuccess) {
      const msg = json?.[0]?.data?.updateAdventurePlot?.message || json?.[0]?.errors?.[0]?.message || "Mutation failed";
      console.error("[AID bg] AI Dungeon rejected memory update:", msg);
      return { error: `AI Dungeon rejected memory update: ${msg}` };
    }

    await repo.upsertAdventure({ shortId: v.shortId, memory: newMemory });
    const now = new Date().toISOString();
    await repo.setVersionPushed(v.id, now);
    dlog("[AID bg] Plot Essentials push successful, database updated.");
    broadcastToTabs({ kind: "memoryUpdated", shortId: v.shortId, memory: newMemory, previousMemory: currentMemory });
    return { ok: true, source: v.source, memory: newMemory };
  }
}

async function getActiveProvider(): Promise<Provider | { error: string }> {
  const settings = await repo.getSettings();
  const providerName = settings?.provider || "claude";
  const apiKey = settings?.apiKeys?.[providerName];
  if (!settings || (!apiKey && providerName !== "ollama")) {
    return { error: `Set your API key/endpoint for ${providerName} in settings.` };
  }
  const model = settings.model || "";
  if (providerName === "openai") {
    return new OpenAIProvider(apiKey || "", model || "gpt-4o-mini");
  } else if (providerName === "gemini") {
    return new GeminiProvider(apiKey || "", model || "gemini-1.5-pro");
  } else if (providerName === "ollama") {
    return new OllamaProvider(apiKey || "http://localhost:11434", model || "llama3");
  } else {
    return new ClaudeProvider(apiKey || "", model || "claude-3-5-sonnet-latest");
  }
}

function resolveTitleToken(template: string, title: string): string {
  return template.replace(/\{\{\s*title\s*\}\}/g, title);
}

function cleanLlmResponse(text: string): string {
  let cleaned = text.trim();
  const match = cleaned.match(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/) || cleaned.match(/^```[a-zA-Z]*\s*([\s\S]*?)\s*```$/);
  if (match) {
    cleaned = match[1]!.trim();
  }
  return cleaned;
}

function applyFormattingMode(text: string, mode: string): string {
  const trimmed = text.trim();
  if (mode === "squareBrackets") {
    if (!trimmed.startsWith("[")) {
      return `[\n${trimmed}\n]`;
    }
  } else if (mode === "curlyBraces") {
    if (!trimmed.startsWith("{")) {
      return `{\n${trimmed}\n}`;
    }
  }
  return trimmed;
}

function parseFields(text: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const lines = text.split("\n");
  let currentKey = "";
  let currentValue = "";

  const keyRegex = /^(Name|Appearance|Personality|Psychology|Worldview|Quirks|Voice|Goals|Dynamic\s*\([^)]*\))\s*:\s*(.*)/i;

  for (const line of lines) {
    const match = line.match(keyRegex);
    if (match) {
      if (currentKey) {
        fields[currentKey.toLowerCase()] = currentValue.trim();
      }
      currentKey = match[1] || "";
      currentValue = match[2] || "";
    } else {
      if (currentKey) {
        currentValue += "\n" + line;
      }
    }
  }
  if (currentKey) {
    fields[currentKey.toLowerCase()] = currentValue.trim();
  }
  return fields;
}

function reconstructFields(fields: Record<string, string>, protagonist: string): string {
  const order = [
    "name",
    "appearance",
    "personality",
    "psychology",
    "worldview",
    "quirks",
    "voice",
    "goals",
    `dynamic (${protagonist.toLowerCase()})`
  ];
  
  let result = "";
  const addedKeys = new Set<string>();
  
  for (const key of order) {
    const actualKey = Object.keys(fields).find(k => k.toLowerCase() === key || (key.startsWith("dynamic") && k.toLowerCase().startsWith("dynamic")));
    if (actualKey && fields[actualKey]) {
      const val = fields[actualKey];
      let displayKey = actualKey;
      if (key === `dynamic (${protagonist.toLowerCase()})`) {
        displayKey = `Dynamic (${protagonist})`;
      } else {
        displayKey = actualKey.charAt(0).toUpperCase() + actualKey.slice(1);
      }
      result += `${displayKey}: ${val}\n`;
      addedKeys.add(actualKey.toLowerCase());
    }
  }
  
  for (const [k, v] of Object.entries(fields)) {
    if (!addedKeys.has(k.toLowerCase()) && v) {
      const displayKey = k.charAt(0).toUpperCase() + k.slice(1);
      result += `${displayKey}: ${v}\n`;
    }
  }
  
  return result.trim();
}

/**
 * Generate a new Story Card entry using the configured 3rd-party LLM provider.
 * We store the result as a pending proposal — approving it commits via the existing
 * UseAutoSaveStoryCard/SaveQueueStoryCard write-back.
 */
async function runGenerateCard(
  shortId: string,
  cardId: string
): Promise<{ id: string; characterName: string; changeSummary: string; entry: string } | { error: string }> {
  const cards = await repo.getCards(shortId);
  const card = cards.find((c) => c.id === cardId);
  if (!card) return { error: "Story Card not found locally — try Backfill." };

  const name = card.title || card.keys;

  const settings = await repo.getSettings();
  const characterCardLimit = settings?.characterCardLimit ?? 600;
  const providerOrError = await getActiveProvider();
  if ("error" in providerOrError) return { error: providerOrError.error };
  const provider = providerOrError;
  const providerName = settings?.provider || "claude";

  const adv = await repo.getAdventure(shortId);
  const protagonist =
    (adv?.protagonistName && adv.protagonistName.trim()) || parseProtagonistName(adv?.memory) || "the player character";

  const isMemoraid = (card.title || "").toLowerCase().endsWith(" (memory)");
  const typeKey = isMemoraid ? "memoraid" : normalizeType(card.type);
  const template = (settings?.cardCommands?.[typeKey] || (isMemoraid ? (settings?.cardCommands?.memoraid || DEFAULT_CARD_COMMANDS.memoraid) : defaultCommandForType(card.type))) || "";
  if (!hasTitleToken(template)) {
    return { error: "This card-type command is missing the required {{title}} token (AID needs it). Fix it in Settings → Prompts." };
  }
  const command = resolveCommand(template, protagonist);
  const formattingMode = settings?.formattingMode || DEFAULT_FORMATTING_MODE;

  const opts: { storyInformation?: string } = {};
  let baseContext = "";

  // 1. Add Global Adventure Memory / Plot Essentials
  if (adv?.memory && adv.memory.trim()) {
    baseContext += `Plot Essentials (Global Story Context):\n${adv.memory.trim()}\n\n`;
  }

  // 2. Add Existing Card Entry if it exists (except for locations, which are handled in detail below)
  if (normalizeType(card.type) !== "location" && card.value && card.value.trim()) {
    baseContext += `Existing Card Entry for ${name}:\n${card.value.trim()}\n\n`;
  }

  // 3. Add Location or Character-Specific Context
  if (normalizeType(card.type) === "location" && card.value) {
    // Labeled "authoritative base" + containing-location entries (see buildLocationContext).
    baseContext += buildLocationContext(card, cards);
    dlog("[AID bg] Location base context built (current entry + containing locations):", baseContext.length);
  } else if (normalizeType(card.type) === "character") {
    const memCardTitle = `${card.title || ""} (Memory)`;
    const memCard = cards.find(
      (x) =>
        (x.type.toLowerCase() === "memory" || x.type.toLowerCase() === "character") &&
        !x.deletedAt &&
        (x.title || "").toLowerCase() === memCardTitle.toLowerCase()
    );
    if (memCard) {
      // Include the NPC's thoughts (each with the action that caused it) formed SINCE this character
      // card was last updated, newest-first, up to the 4,000-char context budget. The THOUGHT LOG
      // already includes the latest thought; fall back to the current entry if no log exists yet.
      const versions = await repo.getVersions(shortId);
      const lastUpdateTurn = versions
        .filter((v) => v.status === "applied" && v.characterName === card.title)
        .reduce((mx, v) => Math.max(mx, v.actionCount ?? 0), 0);
      const log = parseMemoNotes(memCard.description).thoughtLog;
      const memBlock = thoughtsSince(log, lastUpdateTurn, 3500) || (memCard.value || "");
      if (memBlock.trim()) {
        dlog(`[AID bg] Including ${card.title}'s memories since turn ${lastUpdateTurn} (len ${memBlock.length})`);
        baseContext += `${card.title} has these memories (most recent first):\n${memBlock}\n\n`;
      }
    }
  }

  const allActions = await repo.getActions(shortId);
  allActions.sort((a, b) => {
    if (a.createdAt && b.createdAt) {
      return a.createdAt.localeCompare(b.createdAt);
    }
    return 0;
  });

  const lookbackSize = settings?.analyzeWindow ?? 20;
  const recentActions = sliceLastActions(allActions, lookbackSize);

  // Per-pass context budget. Trim it for latency/load-sensitive local + preview models: a large
  // prompt makes gemma/gemini run a long internal "thinking" pass (~43s on gemma-4 preview) and
  // intermittently 500. Claude/OpenAI keep the full budget — Claude caches the prefix across passes,
  // so the size is cheap on repeat passes, and both handle large context reliably.
  const maxLen = providerName === "ollama" ? 8000 : providerName === "gemini" ? 7000 : 16000;
  const availableLen = Math.max(2000, maxLen - baseContext.length);
  
  let contextParts: string[] = [];
  let charCount = 0;
  
  for (let i = recentActions.length - 1; i >= 0; i--) {
    const act = recentActions[i];
    if (!act) continue;
    const text = (act.text || "").trim();
    if (!text) continue;
    
    // Check if adding this text plus newline exceeds available length
    if (charCount + text.length + 1 > availableLen) {
      break;
    }
    contextParts.unshift(text);
    charCount += text.length + 1;
  }
  
  const gameplayContext = contextParts.join("\n");
  const finalContext = (baseContext + gameplayContext).trim();
  if (finalContext) {
    opts.storyInformation = finalContext;
    dlog("[AID bg] Populated storyInformation with length:", opts.storyInformation.length);
  }

  let entry = "";
  if (normalizeType(card.type) === "character" && !isMemoraid && !settings?.useSinglePassGeneration) {
    dlog(`[AID bg] Running multi-pass character card generation for ${card.title} using ${providerName}...`);
    
    const currentFields = parseFields(card.value || "");

    const passes = [
      {
        label: "Pass 1 (Core Identity, Physicality & Psychology)",
        template: `Generate ONLY the Name, Appearance, Personality, Psychology, and Worldview fields for {{title}} in the third person based on narrative changes, taking into account their current profile:\n{existing}\nFocus strictly on {{title}} as an independent character (their own traits and core identity), rather than their interactions or relationship with {protagonist}. Format exactly as:\nName: {{title}}\nAppearance: [1-2 sentences detailing complete physical features including height, build/body type, body proportions like long legs, and signature style/colors]\nPersonality: [1-2 sentences on their core disposition, dominant traits, and how they project themselves to the world]\nPsychology: [1-2 sentences on their core internal contradiction, repressed vulnerability/shadow self, or psychological defense mechanism]\nWorldview: [1-2 sentences on how they perceive rules, morality, or social order, and their primary bias/filter for reality]\nDo not write or output any other fields.`
      },
      {
        label: "Pass 2 (Behavior, Motives & Dynamics)",
        template: `Generate ONLY the Quirks, Voice, Goals, and Dynamic ({protagonist}) fields for {{title}} in the third person based on narrative changes and {protagonist}, taking into account their current profile:\n{existing}\nGoals should focus on {{title}}'s independent desires and motivations. Dynamic ({protagonist}) is the only field that should focus on their relationship or attitude toward {protagonist}. Format exactly as:\nQuirks: [1-2 sentences on signature physical tells, nervous habits, and unconscious mannerisms under tension]\nVoice: [1-2 sentences on speech patterns, speed, tone, syntax, and vocabulary choices/dialogue style]\nGoals: [1-2 sentences on their primary desires, motivations, and what they seek or fear in the current situation]\nDynamic ({protagonist}): [1-2 sentences on their specific relationship, psychological friction, or evolving attitude toward {protagonist}]\n\n[CRITICAL RELATIONSHIP PACING DIRECTIVE]\nWhen generating or updating the "Dynamic ({protagonist}):" field, you must enforce realistic psychological inertia and continuity based strictly on the character's pre-existing profile and the immediate context window. \n1. NO SUDDEN ESCALATION: Relationships cannot leap from strangers or casual acquaintances to deep intimacy, unearned trust, or intense codependency—nor to absolute hatred, permanent enmity, or extreme paranoia—within a handful of scene turns, regardless of how high-stakes or dramatic the immediate actions are.\n2. EVALUATE TRANSITIONS: Read the current character profile. If the character's baseline configuration was guarded and defensive, or conversely highly trusting and friendly, the new dynamic text must capture the messy, realistic friction of that transition (e.g., emotional whiplash, cognitive dissonance, lingering caution, or structural shock).\n3. PROGRESSIVE TRACE: Allow behavioral walls to soften or harden organically, but explicitly forbid the character from displaying complete psychological submission, sudden romantic attachment, or instant implacable hatred unless a long, multi-scene chronological history of shared baseline safety or severe betrayal justifies it. Focus the current dynamic update strictly on the immediate realistic increment of their interaction.\n\nDo NOT repeat or output the existing Name, Appearance, Personality, Psychology, or Worldview fields.`
      }
    ];

    for (const pass of passes) {
      dlog(`[AID bg] Executing ${pass.label} using ${providerName}...`);
      const existingStr = reconstructFields(currentFields, protagonist);
      const passTemplate = pass.template.replace("{existing}", existingStr || "No existing profile.");
      const resolvedPassCommand = resolveTitleToken(resolveCommand(passTemplate, protagonist), name);
      
      const system =
        `You are a creative writing assistant updating a character card profile for the target character "${name}". ` +
        `CRITICAL: Do NOT confuse the target character "${name}" with the protagonist ("${protagonist}") or other characters present in the narrative context. ` +
        `All fields (Appearance, Personality, Psychology, Worldview, Quirks, Voice, Goals) must describe "${name}" and only "${name}". ` +
        `The "Dynamic (${protagonist})" field must describe "${name}"'s relationship and attitude towards the protagonist "${protagonist}". ` +
        `Do not mix them up. Follow the format and instructions exactly. ` +
        `CRITICAL LENGTH CONSTRAINT: Keep descriptions highly concise, dense, and condensed. Limit each field value strictly to 1-2 short, focused sentences (maximum 30 words per field). Avoid verbose, flowery, or redundant phrasing.` +
        `\nCRITICAL: The entire generated card entry must be strictly under ${characterCardLimit} characters in length.`;
      // The narrative context is identical across all passes for this character; cache it so passes
      // after the first read the shared prefix at ~0.1x instead of re-sending it at full price.
      const cachePrefix = `Narrative Context:\n${opts.storyInformation || "No narrative context."}\n\n`;
      const user = `Instructions:\n${resolvedPassCommand}`;

      const rawResponse = await provider.complete(system, user, cachePrefix);
      let passOutput = cleanLlmResponse(rawResponse).trim();
      if (passOutput.startsWith("[") && passOutput.endsWith("]")) {
        passOutput = passOutput.slice(1, -1).trim();
      }
      
      const newFields = parseFields(passOutput);
      for (const [k, v] of Object.entries(newFields)) {
        currentFields[k] = v;
      }
    }
    entry = `[\n${reconstructFields(currentFields, protagonist)}\n]`;
    dlog(`[AID bg] Multi-pass generation complete for ${card.title}. Total length: ${entry.length}`);
  } else {
    let finalCommand = command;
    if (normalizeType(card.type) === "character" && !isMemoraid && settings?.useSinglePassGeneration) {
      dlog(`[AID bg] Running single-pass character card generation for ${card.title} using ${providerName}...`);
      const combinedTemplate = `Generate the Name, Appearance, Personality, Psychology, Worldview, Quirks, Voice, Goals, and Dynamic ({protagonist}) fields for {{title}} in the third person based on narrative changes, taking into account their current profile:
{existing}

Format exactly as:
Name: {{title}}
Appearance: [1-2 sentences detailing complete physical features including height, build/body type, body proportions like long legs, and signature style/colors]
Personality: [1-2 sentences on their core disposition, dominant traits, and how they project themselves to the world]
Psychology: [1-2 sentences on their core internal contradiction, repressed vulnerability/shadow self, or psychological defense mechanism]
Worldview: [1-2 sentences on how they perceive rules, morality, or social order, and their primary bias/filter for reality]
Quirks: [1-2 sentences on signature physical tells, nervous habits, and unconscious mannerisms under tension]
Voice: [1-2 sentences on speech patterns, speed, tone, syntax, and vocabulary choices/dialogue style]
Goals: [1-2 sentences on their primary desires, motivations, and what they seek or fear in the current situation]
Dynamic ({protagonist}): [1-2 sentences on their specific relationship, psychological friction, or evolving attitude toward {protagonist}]

[CRITICAL RELATIONSHIP PACING DIRECTIVE]
When generating or updating the "Dynamic ({protagonist}):" field, you must enforce realistic psychological inertia and continuity based strictly on the character's pre-existing profile and the immediate context window. 
1. NO SUDDEN ESCALATION: Relationships cannot leap from strangers or casual acquaintances to deep intimacy, unearned trust, or intense codependency—nor to absolute hatred, permanent enmity, or extreme paranoia—within a handful of scene turns, regardless of how high-stakes or dramatic the immediate actions are.
2. EVALUATE TRANSITIONS: Read the current character profile. If the character's baseline configuration was guarded and defensive, or conversely highly trusting and friendly, the new dynamic text must capture the messy, realistic friction of that transition (e.g., emotional whiplash, cognitive dissonance, lingering caution, or structural shock).
3. PROGRESSIVE TRACE: Allow behavioral walls to soften or harden organically, but explicitly forbid the character from displaying complete psychological submission, sudden romantic attachment, or instant implacable hatred unless a long, multi-scene chronological history of shared baseline safety or severe betrayal justifies it. Focus the current dynamic update strictly on the immediate realistic increment of their interaction.`;
      finalCommand = resolveCommand(combinedTemplate, protagonist);
      finalCommand = finalCommand.replace("{existing}", card.value || "No existing profile.");
    }

    finalCommand = resolveTitleToken(finalCommand, name);

    const system = `You are a creative writing assistant updating a card for ${name}. Follow the format and instructions exactly. ` +
      `CRITICAL LENGTH CONSTRAINT: Keep descriptions highly concise, dense, and condensed. Limit each field value strictly to 1-2 short, focused sentences (maximum 30 words per field). Avoid verbose, flowery, or redundant phrasing.` +
      `\nCRITICAL: The entire generated card entry must be strictly under ${characterCardLimit} characters in length.`;
    const user = `Narrative Context:\n${opts.storyInformation || "No narrative context."}\n\nInstructions:\n${finalCommand}`;

    const rawResponse = await provider.complete(system, user);
    entry = cleanLlmResponse(rawResponse);

    if (normalizeType(card.type) === "character" && !isMemoraid && settings?.useSinglePassGeneration) {
      let val = entry.trim();
      if (!val.startsWith("[")) {
        val = `[\n${val}\n]`;
      }
      entry = val;
    }
  }

  if (!isMemoraid) {
    entry = applyFormattingMode(entry, formattingMode);
  }

  if (!isMemoraid && entry.length > characterCardLimit) {
    if (entry.startsWith("[") && entry.endsWith("]")) {
      entry = entry.slice(0, characterCardLimit - 2).trimEnd() + "\n]";
    } else {
      entry = entry.slice(0, characterCardLimit);
    }
  }

  const totalActionsCount = await repo.getActionCount(shortId);
  const id = crypto.randomUUID();
  await repo.putVersion({
    id, shortId, characterName: name, entry,
    changeSummary: `${providerName.toUpperCase()}-generated update (Action #${totalActionsCount})`,
    source: "card", status: "pending", createdAt: new Date().toISOString(), actionCount: totalActionsCount,
    cardId: card.id, cardType: card.type || "character",
  } as any);
  return { id, characterName: name, changeSummary: `${providerName.toUpperCase()}-generated update (Action #${totalActionsCount})`, entry };
}

export async function checkLookbackAutoUpdates(
  shortId: string,
  newActions: any[]
): Promise<void> {
  const settings = await repo.getSettings();
  if (settings?.manualMode) return;
  const lookbackSize = settings?.analyzeWindow ?? 20;

  const allActions = await repo.getActions(shortId);
  allActions.sort((a, b) => {
    if (a.createdAt && b.createdAt) {
      return a.createdAt.localeCompare(b.createdAt);
    }
    return 0;
  });

  const cards = await repo.getCards(shortId);
  const fellOutCards = determineFellOutCards(lookbackSize, allActions, newActions.length, cards);

  const versions = await repo.getVersions(shortId);
  const totalActionsCount = allActions.length;
  const currentActions = sliceLastActions(allActions, lookbackSize);
  const currentText = currentActions.map((a) => a.text || "").join(" ").toLowerCase();
  const activeCharacters = cards.filter((c) => !c.deletedAt && c.type.toLowerCase() === "character");

  const toUpdateCards: CardRow[] = [];
  for (const card of fellOutCards) {
    const name = card.title || card.keys;
    if (!name) continue;
    const charVersions = versions.filter((v) => (v as any).cardId === card.id || v.characterName === name);
    
    // If the latest version was rejected, skip fell-out updates until they enter the lookback window again
    const sortedVersions = [...charVersions].sort((a, b) => {
      const timeA = a.createdAt || "";
      const timeB = b.createdAt || "";
      return timeB.localeCompare(timeA);
    });
    const latestVersion = sortedVersions[0];
    if (latestVersion && latestVersion.status === "rejected") {
      const rejectTurn = latestVersion.actionCount ?? 0;
      const postRejectActions = allActions.slice(rejectTurn);
      const postRejectText = postRejectActions.map((a) => a.text || "").join(" ").toLowerCase();
      const wasMentionedAfterReject = isCharacterTriggered(postRejectText, card.title || "", card.keys || "");
      if (!wasMentionedAfterReject) {
        dlog(`[AID bg] Skipping fell-out update for "${name}" because the last update was rejected and character has not been active since turn ${rejectTurn}.`);
        continue;
      }
    }

    const lastUpdateActionCount = charVersions.reduce((max, v) => Math.max(max, v.actionCount ?? 0), 0);
    if (totalActionsCount - lastUpdateActionCount >= lookbackSize) {
      toUpdateCards.push(card);
    } else {
      dlog(`[AID bg] Skipping fell-out update for "${name}" because it was updated recently (${totalActionsCount} - ${lastUpdateActionCount} < ${lookbackSize} turns ago).`);
    }
  }

  // Per-character decision trail, logged UNGATED below: the auto-update path is otherwise
  // silent end-to-end, which makes "it didn't trigger" undiagnosable from the console.
  const decisions: string[] = [];

  for (const card of activeCharacters) {
    if (fellOutCards.some((c) => c.id === card.id)) continue;
    const name = card.title || card.keys;
    if (!name) continue;

    const isActive = isCharacterTriggered(currentText, card.title || "", card.keys || "");
    if (isActive) {
      // Match versions by cardId when stamped (rename-proof), falling back to the name for
      // legacy rows that predate cardId stamping.
      const charVersions = versions.filter((v) => (v as any).cardId === card.id || v.characterName === name);
      const lastUpdateActionCount = charVersions.reduce((max, v) => Math.max(max, v.actionCount ?? 0), 0);
      if (totalActionsCount - lastUpdateActionCount >= lookbackSize) {
        decisions.push(`"${name}": DUE (${totalActionsCount} - ${lastUpdateActionCount} >= ${lookbackSize})`);
        toUpdateCards.push(card);
      } else {
        decisions.push(`"${name}": active, not due (${totalActionsCount} - ${lastUpdateActionCount} < ${lookbackSize})`);
      }
    } else {
      decisions.push(`"${name}": not in window`);
    }
  }
  console.info(
    `[AID bg] Lookback check @ ${totalActionsCount} actions (window ${lookbackSize}): ` +
    `fellOut=[${fellOutCards.map((c) => c.title || c.keys).join(", ")}] ` +
    (decisions.length ? decisions.join("; ") : "(no character cards)")
  );

  for (const card of toUpdateCards) {
    const name = card.title || card.keys;
    dlog(`[AID bg] Triggering auto-update for "${name}"...`);

    // The 4-pass generation takes tens of seconds while turn checks keep firing every
    // 1.2s-debounced action — without an in-flight guard the same card gets triggered
    // concurrently before its pending proposal exists, producing duplicate proposals.
    const flightKey = `${shortId}:${card.id}`;
    if (autoUpdateInFlight.has(flightKey)) {
      console.info(`[AID bg] Auto-update for "${name}" already in flight. Skipping duplicate trigger.`);
      continue;
    }

    // Double check if there is already a pending proposal for this character to avoid duplicates!
    // Re-read fresh: the snapshot from the top of this function may predate a proposal that a
    // concurrent/previous run created moments ago.
    const versionsNow = await repo.getVersions(shortId);
    const hasPending = versionsNow.some(
      (v) => ((v as any).cardId === card.id || v.characterName === name) && v.status === "pending"
    );
    if (hasPending) {
      console.info(`[AID bg] Pending proposal already exists for "${name}". Skipping duplicate auto-update.`);
      continue;
    }

    // Trigger update card generation!
    autoUpdateInFlight.add(flightKey);
    try {
      const result = await runGenerateCard(shortId, card.id);
      if (result && !("error" in result)) {
        const cardTitle = card.title || card.keys || "";
        if (cardTitle) {
          await repo.upsertAdventure({ shortId, lastAutoUpdatedCard: cardTitle });
        }
        console.info(`[AID bg] Auto-update proposal created for "${name}".`);
        broadcastToTabs({
          kind: "proposalCreated",
          shortId,
          characterName: name
        });
      } else if (result && "error" in result) {
        // Surface silent skips: auto-updates have no UI feedback path, so a swallowed
        // error here makes the trigger look like it never fired.
        console.warn(`[AID bg] Auto-update for "${name}" did not run:`, result.error);
      }
    } catch (err) {
      console.error(`[AID bg] Auto-update failed for character "${name}":`, err);
    } finally {
      autoUpdateInFlight.delete(flightKey);
    }
  }
}

function capitalizeWords(s: string): string {
  return s.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// Salvage the Intake/Thought/Action loop from a messy MemorAID completion. Weak models (notably
// Gemma) wrap the three thoughts in a Markdown planning scaffold — asterisk bullets and restated
// "Character:"/"Goal:"/"Latest Action:" lines. Pull only the three labeled lines, each anchored to
// its own line start so the scaffold's "Latest Action:" is never mistaken for the "Action:" thought,
// Detect when a weak model returned a CHARACTER PROFILE instead of MemorAID thoughts (it confused
// the task — observed with Gemma generating Appearance/Personality/Psychology/Dynamic fields). Two
// or more profile-field labels is a strong, non-fuzzy signal. Used to discard the generation rather
// than store garbage in the thought card (and push it into AID's context).
const PROFILE_FIELD_RE = /(?:^|\r?\n)[ \t]*[*\-]?[ \t]*(Appearance|Personality|Psychology|Worldview|Quirks|Voice|Goals|Dynamic)[ \t]*[:(]/gi;
export function looksLikeCharacterProfile(text: string): boolean {
  return (text.match(PROFILE_FIELD_RE) || []).length >= 2;
}

export function stripOuterBrackets(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith("[") && cleaned.endsWith("]")) {
    cleaned = cleaned.slice(1, -1).trim();
  } else if (cleaned.startsWith("{") && cleaned.endsWith("}")) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  return cleaned;
}

export function isPlaceholderOrGarbageResponse(text: string): boolean {
  const lowerText = text.toLowerCase();
  const placeholders = [
    "sensory/verbal stimulus",
    "internal opinion/conflict/feeling",
    "immediate impulse/decision",
    "1 sentence describing",
    "one sentence:",
    "stimulus they are perceiving",
    "she slides the sealed letter",
    "test of my discretion",
    "tuck it into my sleeve"
  ];
  return placeholders.some(p => lowerText.includes(p));
}

// and drop everything else. Returns null unless at least two of the three labels are present.
export function extractThoughtLoop(text: string): string | null {
  if (isPlaceholderOrGarbageResponse(text)) {
    return null;
  }

  const loops: Record<string, string>[] = [];
  let currentLoop: Record<string, string> = {};
  const re = /^[ \t]*[*\-]?[ \t]*(Intake|Thought|Action)[ \t]*:[ \t]*(.+?)[ \t]*$/gim;
  let m: RegExpExecArray | null;
  
  while ((m = re.exec(text)) !== null) {
    const key = m[1]![0]!.toUpperCase() + m[1]!.slice(1).toLowerCase();
    const val = m[2]!.trim().replace(/^\*+\s*/, "");
    
    if (currentLoop[key] !== undefined) {
      // We already have this key in the current loop, so start a new loop
      loops.push(currentLoop);
      currentLoop = {};
    }
    currentLoop[key] = val;
  }
  if (Object.keys(currentLoop).length > 0) {
    loops.push(currentLoop);
  }

  const order = ["Intake", "Thought", "Action"];
  const formattedLoops: string[] = [];
  
  for (const loop of loops) {
    const parts = order.filter((k) => loop[k]).map((k) => `- ${k}: ${loop[k]}`);
    if (parts.length >= 2) {
      formattedLoops.push(parts.join("\n"));
    }
  }
  
  return formattedLoops.length > 0 ? formattedLoops.join("\n") : null;
}


export async function checkMemorAIDUpdates(
  shortId: string,
  pendingActionText?: string,
  pendingActionType?: string,
  recordTiming = false
): Promise<string[]> {
  await ensureAuth();
  const updatedNames: string[] = [];
  // Wall-clock start for the intercept-path timing readout. Only recorded (at function exit)
  // when recordTiming is set AND the run actually invoked the model — short-circuits don't count.
  const timingStart = Date.now();
  let didGenerate = false;
  const cards = await repo.getCards(shortId);
  dlog(`[MemorAID] checkMemorAIDUpdates called for ${shortId}. Total cards in local DB:`, cards ? cards.length : 0);
  if (!cards || !cards.length) return updatedNames;

  const settings = ((await repo.getSettings()) || {
    formattingMode: DEFAULT_FORMATTING_MODE,
    cardCommands: DEFAULT_CARD_COMMANDS
  }) as Settings;
  const thoughtCardLimit = settings?.thoughtCardLimit ?? 2000;
  dlog(`[MemorAID] Settings loaded:`, (await repo.getSettings()) ? "yes" : "no (using defaults)");

  // 1. Check if Configure MemorAID card exists
  const configCard = cards.find(
    (c) =>
      !c.deletedAt &&
      (c.title || "").toLowerCase() === "configure memoraid"
  );
  if (!configCard) {
    dlog("[MemorAID] No Configure MemorAID card found. Skipping memory updates.");
    return updatedNames;
  }
  const description = configCard.description || "";
  dlog(`[MemorAID] Parsing Configure MemorAID card description: "${description}"`);
  const match = description.match(/IMPORTANT_CHARACTERS\s*:\s*([\s\S]+?)(?=\n\s*[A-Z_]+:|$)/i);
  if (!match || !match[1]) {
    dlog("[MemorAID] Configure MemorAID card description is missing IMPORTANT_CHARACTERS list. Skipping memory updates.");
    return updatedNames;
  }
  const importantNames = match[1]
    .split(/[,\r\n]+/)
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name.length > 0);
  dlog(`[MemorAID] Parsed important characters:`, importantNames);
  if (importantNames.length === 0) {
    dlog("[MemorAID] Configure MemorAID card lists 0 important characters. Skipping memory updates.");
    return updatedNames;
  }

  const allActions = await repo.getActions(shortId);
  allActions.sort((a, b) => {
    if (a.createdAt && b.createdAt) return a.createdAt.localeCompare(b.createdAt);
    return 0;
  });

  const isContinue = pendingActionType === "continue";
  const isRetry = pendingActionType === "retry";

  const checkActions = [...allActions];
  if (pendingActionText) {
    checkActions.push({
      id: "pending",
      text: pendingActionText,
      type: pendingActionType || "do",
      createdAt: new Date().toISOString()
    } as any);
  } else if (isRetry && checkActions.length >= 2) {
    // If it's a retry and there is no pending action text, the last action in the database
    // is the AI response being retried. Pop it from the check actions so we do not react to it
    // or detect presence from it.
    checkActions.pop();
  }

  const latestAction = checkActions[checkActions.length - 1];

  if (!latestAction || (!latestAction.text && !isContinue)) {
    dlog("[MemorAID] No actions found or latest action has empty text.");
    return updatedNames;
  }
  if (latestAction) {
    dlog(`[MemorAID] Latest action text: "${(latestAction.text || "").slice(0, 100)}..."`);
  }

  const memoraidLookback = settings?.memoraidLookback ?? 8;
  const memoraidPresenceLookback = settings?.memoraidPresenceLookback ?? 5;

  // Slice to the last N actions to check presence in the active scene
  const presenceActions = sliceLastActions(checkActions, memoraidPresenceLookback);
  const presenceText = presenceActions.map((a) => a.text || "").join("\n");

  const triggered: { id: string; title: string; keys: string; baseCard?: CardRow }[] = [];

  for (const impName of importantNames) {
    // 1. Find if there is an existing character card matching this important name
    const baseCard = cards.find((c) => {
      if (c.type.toLowerCase() !== "character") return false;
      if (c.deletedAt) return false;
      if ((c.title || "").toLowerCase().endsWith(" (memory)")) return false;

      const titleLower = (c.title || "").toLowerCase();
      const keysList = (c.keys || "").split(/[,;]+/).map(k => k.trim().toLowerCase()).filter(Boolean);

      if (titleLower === impName || keysList.includes(impName)) return true;

      if (titleLower.includes(" and ") || titleLower.includes(" & ")) {
        const parts = titleLower.split(/\s+(?:and|&)\s+/);
        if (parts.includes(impName)) return true;
      }

      for (const k of keysList) {
        if (k.includes(" and ") || k.includes(" & ")) {
          const parts = k.split(/\s+(?:and|&)\s+/);
          if (parts.includes(impName)) return true;
        }
      }

      return false;
    });

    const title = baseCard ? (baseCard.title || "") : capitalizeWords(impName);
    const keys = baseCard ? (baseCard.keys || "") : impName;
    const charId = baseCard ? baseCard.id : `virtual-${impName}`;

    // 2. Check if triggered in the active scene lookback window
    const isTriggered = isCharacterTriggered(presenceText, title, keys);
    dlog(`[MemorAID] Character "${title}" (from important list: "${impName}") triggered in scene? ${isTriggered} (keys: "${keys}")`);

    if (isTriggered) {
      triggered.push({
        id: charId,
        title,
        keys,
        baseCard
      } as any);
    }
  }

  const seenIds = new Set<string>();
  const dedupledTriggered: typeof triggered = [];
  for (const item of triggered) {
    if (!seenIds.has(item.id)) {
      seenIds.add(item.id);
      dedupledTriggered.push(item);
    }
  }

  if (dedupledTriggered.length === 0) {
    dlog("[MemorAID] No important characters were triggered in the active scene lookback window.");
    return updatedNames;
  }


  const adv = await repo.getAdventure(shortId);

  // 1. Resolve target memory cards (creating them in a batch if missing)
  const creationsToRun: { character: any; cardRow: CardRow; req: GqlMutationRequest }[] = [];
  const characterToMemCardMap = new Map<string, CardRow>();

  for (const c of dedupledTriggered) {
    const titleVal = c.title || "";
    const memCardTitle = `${titleVal} (Memory)`;
    const memCardKeys = c.keys || titleVal;

    const existingMemCard = cards.find(
      (x) =>
        (x.type.toLowerCase() === "memory" || x.type.toLowerCase() === "character") &&
        !x.deletedAt &&
        (x.title || "").toLowerCase() === memCardTitle.toLowerCase()
    );

    if (existingMemCard) {
      characterToMemCardMap.set(c.id, existingMemCard);
    } else {
      dlog(`[MemorAID] Queueing new memory card creation for ${c.title}...`);
      const createOp = await repo.getOp("SaveQueueStoryCard");
      const createQuery = createOp?.query || DEFAULT_GQL_QUERIES.SaveQueueStoryCard;
      const tempId = Math.floor(Math.random() * 1e9).toString();
      const initialValue = "[\n - none\n]";
      const newCardRow: CardRow = {
        id: tempId,
        shortId,
        type: "Memory",
        title: memCardTitle,
        keys: memCardKeys,
        value: initialValue,
        description: "",
      };
      const req = buildCardCreate(gqlEndpoint!, createQuery, sessionToken!, newCardRow, initialValue);
      creationsToRun.push({ character: c, cardRow: newCardRow, req });
    }
  }

  if (creationsToRun.length > 0) {
    await ensureAuth();
    if (sessionToken && isSafeEndpoint(gqlEndpoint)) {
      dlog(`[MemorAID] Batch creating ${creationsToRun.length} memory cards...`);
      const creationOps: GqlOperation[] = creationsToRun.map(item => JSON.parse(item.req.body)[0]);
      try {
        const batchReq = buildGraphQLMutation(gqlEndpoint!, creationOps, sessionToken!);
        const res = await fetch(batchReq.url, { method: "POST", headers: batchReq.headers, body: batchReq.body });
        if (!res.ok) {
          console.error(`[MemorAID] Batch creation push HTTP failure:`, res.status);
        } else {
          const jsonArray = await res.json() as any[];
          for (let i = 0; i < creationsToRun.length; i++) {
            const item = creationsToRun[i]!;
            const resJson = jsonArray[i];
            const returnedCard = resJson?.data?.updateStoryCard?.storyCard ||
                                 resJson?.data?.saveQueueStoryCard?.storyCard ||
                                 resJson?.data?.updateStoryCard ||
                                 resJson?.data?.saveQueueStoryCard;
            const isSuccess = resJson?.data?.updateStoryCard?.success || resJson?.data?.saveQueueStoryCard?.success || returnedCard;
            if (!isSuccess) {
              const msg = resJson?.data?.updateStoryCard?.message || resJson?.errors?.[0]?.message || "Mutation failed";
              console.error(`[MemorAID] AI Dungeon rejected memory card creation for ${item.character.title}:`, msg);
              continue;
            }
            const actualId = returnedCard?.id || item.cardRow.id;
            const targetMemCard = {
              ...item.cardRow,
              id: actualId,
            };
            await repo.putCards(shortId, [targetMemCard]);
            characterToMemCardMap.set(item.character.id, targetMemCard);
            dlog(`[MemorAID] Successfully created empty memory card for ${item.character.title} (ID: ${actualId})`);

            // Notify the page so its Apollo cache refetches and the NEW card shows up in
            // AID's story card list without a reload (the other creation paths already do this).
            broadcastToTabs({
              kind: "approvedCardSync",
              payload: { ok: true, source: "card", cardId: actualId, value: targetMemCard.value || "", description: targetMemCard.description || "" }
            });
          }
        }
      } catch (err) {
        console.error(`[MemorAID] Failed to batch create memory cards:`, err);
      }
    } else {
      console.warn("[MemorAID] Missing session token or endpoint. Cannot create memory cards.");
    }
  }

  let turnNow = countActions(allActions);
  if (pendingActionText || isContinue) {
    turnNow += 1;
  }
  const generationResults: { character: any; targetMemCard: CardRow; trimmedMemory: string; newDesc: string }[] = [];

  if (dedupledTriggered.length > 0) {
    const providerOrError = await getActiveProvider();
    if ("error" in providerOrError) {
      console.warn(`[MemorAID] Cannot generate memories: ${providerOrError.error}`);
    } else {
      const provider = providerOrError;
      await Promise.all(dedupledTriggered.map(async (c) => {
        const targetMemCard = characterToMemCardMap.get(c.id);
        if (!targetMemCard) return;

        let needsPruneSave = false;
        const currentDesc = targetMemCard.description || "";
        const prevNotes = parseMemoNotes(currentDesc);
        const prunedDesc = buildMemoNotes(prevNotes);
        
        if (currentDesc !== prunedDesc) {
          dlog(`[MemorAID] Description for ${c.title} is oversized or needs pruning (${currentDesc.length} -> ${prunedDesc.length} chars). Queueing self-healing save.`);
          targetMemCard.description = prunedDesc;
          needsPruneSave = true;
        }

        const hadThoughtForThisTurn = prevNotes.thoughtLog.some(e => e.turn === turnNow);
        if (isRetry) {
          // Filter out the existing thought for this turn so we can regenerate it
          prevNotes.thoughtLog = prevNotes.thoughtLog.filter(e => e.turn !== turnNow);
          needsPruneSave = true;
        }

        if (prevNotes.thoughtLog.some(e => e.turn === turnNow)) {
          dlog(`[MemorAID] Already generated thought for turn ${turnNow} for ${c.title}. Skipping generation.`);
          if (needsPruneSave) {
            generationResults.push({
              character: c,
              targetMemCard,
              trimmedMemory: targetMemCard.value || "",
              newDesc: prunedDesc
            });
          }
          return;
        }

        const existingMemCard = cards.find(
          (x) =>
            (x.type.toLowerCase() === "memory" || x.type.toLowerCase() === "character") &&
            !x.deletedAt &&
            (x.title || "").toLowerCase() === `${c.title} (Memory)`.toLowerCase()
        );

        let isMentioned = isCharacterTriggered(latestAction.text || "", c.title || "", c.keys || "");
        if (!isMentioned && (isContinue || latestAction.type === "continue")) {
          // If we are continuing, look back through the chain of preceding continuations
          // to see if the character was mentioned in any action within this continuous sequence.
          let idx = checkActions.length - 1;
          while (idx >= 0) {
            const act = checkActions[idx];
            if (!act) break;
            if (isCharacterTriggered(act.text || "", c.title || "", c.keys || "")) {
              isMentioned = true;
              break;
            }
            if (act.type !== "continue") {
              break;
            }
            idx--;
          }
        }
        const hasRealThoughts = prevNotes.thoughtLog.some(e => e.text && e.text !== "[none]");
        const shouldGenerate = isMentioned || (isRetry && hadThoughtForThisTurn);

        if (existingMemCard && hasRealThoughts && !shouldGenerate) {
          dlog(`[MemorAID] Character ${c.title} is not mentioned in the latest action and already has thoughts. Skipping thought generation to prevent repeat triggers.`);
          return;
        }

        dlog(`[MemorAID] Generating memory for ${c.title} using 3rd party provider...`);
        // Universal prompt: pure structured DATA (profile, on-stage roster from trigger matches over
        // the Scene Presence Lookback window + held action, prior context, and the single latest
        // action), with all directive wording left to the editable template. The split lets the
        // template's "react to the latest action / [none] if absent" rule resolve a clear boundary —
        // without it a strict follower (Claude) can't pick the latest action and bails to [none].
        const recentActions = sliceLastActions(checkActions, memoraidLookback);
        const priorActionsText = recentActions.slice(0, -1).map((a) => a.text || "").join("\n").slice(0, 3000);
        const latestActionText = (latestAction.text || "").slice(0, 1500);
        const presentEntities = detectPresentCards(presenceText, cards);

        const template = settings?.cardCommands?.memoraid || DEFAULT_CARD_COMMANDS.memoraid || "";
        const protagonist = (adv?.protagonistName && adv.protagonistName.trim()) || parseProtagonistName(adv?.memory) || "the player character";
        const title = c.title || "Character";
        const titleWithKeys = c.keys ? `${title} (also referred to as: ${c.keys})` : title;
        let resolvedCommand = resolveTitleToken(resolveCommand(template, protagonist), titleWithKeys);
        if (title.toLowerCase().includes(" and ") || title.toLowerCase().includes(" & ")) {
          const names = title.split(/\s+(?:and|&)\s+/i).map(n => n.trim());
          resolvedCommand += `\n\n[JOINT CHARACTER CARD DIRECTIVE]: Since ${title} is a joint character card representing multiple characters, you MUST generate separate, consecutive Intake-Thought-Action loops for each character individually, in this exact order: first a loop for ${names[0]}, and then a loop for ${names[1]}.
- You must explicitly start each character's Intake line by referencing that character by name as the subject (for example: "- Intake: ${names[0]} perceives..." and "- Intake: ${names[1]} perceives...").
- Output both loops sequentially within the single outer brackets, with each line starting with a bullet point. Do not combine their thoughts into a single loop.`;
        }

        const thoughtLookbackVal = settings?.memoraidThoughtLookback ?? 0;
        const thoughtContext = thoughtLookbackVal > 0
          ? buildThoughtContext(prevNotes.thoughtLog, thoughtLookbackVal, title, 3000)
          : "";

        let charProfile = c.baseCard?.value ? `Character Profile for ${title}:\n${stripOuterBrackets(c.baseCard.value)}\n\n` : "";
        if (thoughtContext) {
          charProfile = thoughtContext + "\n\n" + charProfile;
        }
        const system = `You are a creative writing assistant. Your task is to generate first-person subjective thoughts for a character based on their profile and the narrative context. Follow the instructions and formatting rules exactly.\nCRITICAL: The generated thoughts must be strictly under ${thoughtCardLimit} characters in length.`;
        const { cachePrefix, user } = buildMemoraidPrompt({ charProfile, priorActionsText, latestActionText, presentEntities, instructions: resolvedCommand });
        try {
          didGenerate = true;
          // Prompt-cache the shared scene prefix only when ≥2 characters react this turn (guaranteed
          // reuse); for a lone character there is no second read to amortize the cache-write premium,
          // so fold the prefix into the user content instead.
          const rawResponse = dedupledTriggered.length >= 2
            ? await provider.complete(system, user, cachePrefix)
            : await provider.complete(system, cachePrefix + user);
          dlog(`[MemorAID] Raw provider response for ${c.title}: ${JSON.stringify(rawResponse).slice(0, 600)}`);
          let inner = cleanLlmResponse(rawResponse);
          
          const lowerRaw = rawResponse.trim().toLowerCase();
          const lowerInner = inner.trim().toLowerCase();
          if (lowerRaw === "[none]" || lowerRaw === "none" || lowerInner === "[none]" || lowerInner === "none" || lowerInner === "- none") {
            dlog(`[MemorAID] LLM returned none for ${c.title}. Skipping value update, but saving thoughtLog check.`);
            const newDesc = buildMemoNotes({
              thoughtLog: pushThought(prevNotes.thoughtLog, { turn: turnNow, text: "[none]" }),
            });
            generationResults.push({ character: c, targetMemCard, trimmedMemory: targetMemCard.value || "", newDesc });
            return;
          }

          const cleanedInner = inner.replace(/^\s*\[?\s*[^\n\]]*\bThoughts:\s*/i, "")
            .replace(/^[\s[]+/, "").replace(/[\s\]]+$/, "").trim();
          // If a weak model buried the three lines in Markdown/scaffold, recover just those lines so
          // the stored card stays clean regardless of how well the model followed the format.
          const salvaged = extractThoughtLoop(cleanedInner);

          // If the model returned a character profile instead of thoughts (weak model confusing the
          // task), discard it — keep the prior thought rather than poison the card and AID's context.
          // BUT do not discard if we successfully salvaged a valid thought loop from the output!
          if (looksLikeCharacterProfile(rawResponse) && !salvaged) {
            console.warn(`[MemorAID] Discarded generation for ${c.title}: model returned a character profile, not thoughts. The selected model is too weak for this task — use a more capable model (e.g. gemini-2.5-flash or a Claude model).`);
            return;
          }

          if (isPlaceholderOrGarbageResponse(rawResponse) || isPlaceholderOrGarbageResponse(inner)) {
            console.warn(`[MemorAID] Discarded generation for ${c.title}: model returned template placeholders or example text, not actual thoughts.`);
            return;
          }

          if (salvaged) {
            dlog(`[MemorAID] Salvaged Intake/Thought/Action loop from messy output for ${c.title}.`);
            inner = salvaged;
          } else {
            inner = cleanedInner;
          }
          const thoughtsHeader = `${title.trim()}'s Thoughts:`;
          const newThoughtBlock = `[${thoughtsHeader}\n${inner}\n]`;
          const newLog = pushThought(prevNotes.thoughtLog, { turn: turnNow, text: newThoughtBlock });
          const newDesc = buildMemoNotes({ thoughtLog: newLog });

          const thoughtLookbackVal = settings?.memoraidThoughtLookback ?? 1;
          let trimmedMemory = "";
          if (thoughtLookbackVal > 1) {
            trimmedMemory = renderThoughtWindow(newLog, thoughtLookbackVal, title, thoughtCardLimit);
          }
          if (!trimmedMemory) {
            trimmedMemory = newThoughtBlock;
          }

          const ENTRY_CAP = thoughtCardLimit;
          if (trimmedMemory.length > ENTRY_CAP) {
            trimmedMemory = trimmedMemory.slice(0, ENTRY_CAP - 1).trimEnd() + "]";
          }
          dlog(`[MemorAID] Successfully generated 3rd-party memories for ${c.title}: "${trimmedMemory}"`);

          generationResults.push({ character: c, targetMemCard, trimmedMemory, newDesc });
        } catch (err) {
          console.error(`[MemorAID] 3rd party generation failed for ${c.title}:`, err);
        }
      }));
    }
  }

  const savesToRun: { character: any; targetMemCard: CardRow; trimmedMemory: string; newDesc: string; req: GqlMutationRequest }[] = [];
  const updateOp = await repo.getOp("UseAutoSaveStoryCard");
  const updateQuery = updateOp?.query || DEFAULT_GQL_QUERIES.UseAutoSaveStoryCard;

  for (const item of generationResults) {
    const memCardKeys = item.targetMemCard.keys || item.character.title || "";
    const updatedCard = { ...item.targetMemCard, type: "Memory", keys: memCardKeys, value: item.trimmedMemory, description: item.newDesc };
    const req = buildCardSave(gqlEndpoint!, updateQuery, sessionToken!, updatedCard, item.trimmedMemory);
    savesToRun.push({ character: item.character, targetMemCard: item.targetMemCard, trimmedMemory: item.trimmedMemory, newDesc: item.newDesc, req });
  }

  if (savesToRun.length > 0) {
    await ensureAuth();
    if (sessionToken && isSafeEndpoint(gqlEndpoint)) {
      dlog(`[MemorAID] Batch saving ${savesToRun.length} updated memory cards...`);
      const saveOps: GqlOperation[] = savesToRun.map(item => JSON.parse(item.req.body)[0]);
      try {
        const batchReq = buildGraphQLMutation(gqlEndpoint!, saveOps, sessionToken!);
        const res = await fetch(batchReq.url, { method: "POST", headers: batchReq.headers, body: batchReq.body });
        if (!res.ok) {
          console.error(`[MemorAID] Batch update push HTTP failure:`, res.status);
        } else {
          const jsonArray = await res.json() as any[];
          for (let i = 0; i < savesToRun.length; i++) {
            const item = savesToRun[i]!;
            const resJson = jsonArray[i];
            const returnedCard = resJson?.data?.updateStoryCard?.storyCard || resJson?.data?.updateStoryCard;
            const isSuccess = resJson?.data?.updateStoryCard?.success || returnedCard;
            if (!isSuccess) {
              const msg = resJson?.data?.updateStoryCard?.message || resJson?.errors?.[0]?.message || "Mutation failed";
              console.error(`[MemorAID] AI Dungeon rejected memory card save for ${item.character.title}:`, msg);
              continue;
            }
            const updatedCard = { ...item.targetMemCard, type: "Memory", keys: item.targetMemCard.keys || item.character.title || "", value: item.trimmedMemory, description: item.newDesc };
            await repo.putCards(shortId, [updatedCard]);
            dlog(`[MemorAID] Successfully saved updated memories to memory card for ${item.character.title}`);
            updatedNames.push(item.character.title || "Character");

            // Broadcast update to active tabs for UI sync
            broadcastToTabs({
              kind: "approvedCardSync",
              payload: { ok: true, source: "card", cardId: item.targetMemCard.id, value: item.trimmedMemory, description: item.newDesc }
            });
          }
        }
      } catch (err) {
        console.error(`[MemorAID] Failed to batch save memories:`, err);
      }
    } else {
      console.warn("[MemorAID] Missing session token or endpoint. Cannot save memories.");
    }
  }

  if (recordTiming && didGenerate) {
    recordMemoraidTiming(Date.now() - timingStart);
  }

  return updatedNames;

}

async function broadcastToTabs(msg: any) {
  try {
    const tabs = await browser.tabs.query({ url: "*://*.aidungeon.com/*" }).catch(() => []);
    for (const tab of tabs) {
      if (tab.id) {
        browser.tabs.sendMessage(tab.id, msg).catch(() => {});
      }
    }
  } catch (err) {
    console.error("[AID bg] Failed to broadcast message to tabs:", err);
  }
}

const gameplayTurnCheckTimers = new Map<string, any>();

function debouncedGameplayTurnCheck(shortId: string, upserts: any[]) {
  if (gameplayTurnCheckTimers.has(shortId)) {
    clearTimeout(gameplayTurnCheckTimers.get(shortId));
  }
  const timer = setTimeout(async () => {
    try {
      dlog(`[AID bg] Running debounced gameplay turn checks for ${shortId}`);
      await checkLookbackAutoUpdates(shortId, upserts);
      await checkMemorAIDUpdates(shortId);
      await runProperNounAutoDetection(shortId).catch((err) => {
        console.error("[AID bg] Failed running proper noun auto detection:", err);
      });
    } catch (e) {
      console.error("[AID bg] debounced gameplay turn checks threw:", e);
    } finally {
      gameplayTurnCheckTimers.delete(shortId);
    }
  }, 1200); // 1.2 second debounce
  gameplayTurnCheckTimers.set(shortId, timer);
}

// AID's EditMemory mutation hard-rejects memory text over 4,000 chars. A native memory targets
// ~100 tokens, but a weak local model can blow past the length instruction (we saw 34,012 chars) —
// cap before sending so a runaway generation degrades to a truncated memory instead of a server
// rejection. Trim to a clause boundary so the result still reads as a sentence.
const NATIVE_MEMORY_CHAR_CAP = 1500;
function capMemoryBankEntry(text: string): string {
  if (!text || text.length <= NATIVE_MEMORY_CHAR_CAP) return text;
  let t = text.slice(0, NATIVE_MEMORY_CHAR_CAP);
  const brk = Math.max(t.lastIndexOf(". "), t.lastIndexOf("; "), t.lastIndexOf(", "));
  if (brk > NATIVE_MEMORY_CHAR_CAP * 0.5) t = t.slice(0, brk + 1);
  return t.trim();
}

export async function regenerateMemoryBlock(shortId: string, index: number): Promise<{ ok: boolean; error?: string; memories?: any[] }> {
  await ensureAuth();
  if (!sessionToken || !gqlEndpoint) {
    return { ok: false, error: "No session token yet — interact with the page once, then retry." };
  }

  const adv = await repo.getAdventure(shortId);
  if (!adv) {
    return { ok: false, error: "Adventure metadata not found in database." };
  }

  const memories = adv.memoryBankEntries || [];
  if (memories.length === 0) {
    return { ok: false, error: "No native memories found to refine." };
  }

  if (index < 0 || index >= memories.length) {
    return { ok: false, error: `Invalid memory block index: ${index}` };
  }

  const targetMemory = memories[index];
  const allActions = await repo.getActions(shortId);
  if (allActions.length === 0) {
    return { ok: false, error: "No game actions found in database to summarize." };
  }

  // 1. Gather actions belonging to the target memory block
  const targetActionIds = new Set(targetMemory.actionIds || []);
  let targetActions: any[] = [];

  if (targetActionIds.size > 0) {
    // If we have specific action IDs for this block, use EXACTLY those actions
    targetActions = allActions.filter(a => targetActionIds.has(a.id));
  } else {
    // Fallback if no action IDs are associated (e.g. legacy/plain-string memories)
    if (index === memories.length - 1) {
      const summarizedIds = new Set<string>();
      for (let i = 0; i < memories.length - 1; i++) {
        const m = memories[i];
        if (m && m.actionIds) {
          for (const id of m.actionIds) summarizedIds.add(id);
        }
      }
      targetActions = allActions.filter(a => !summarizedIds.has(a.id));
    }
  }

  if (targetActions.length === 0) {
    return { ok: false, error: "No actions found for the scope of the target memory." };
  }

  const providerOrError = await getActiveProvider();
  if ("error" in providerOrError) {
    return { ok: false, error: providerOrError.error };
  }
  const provider = providerOrError;

  // Retrieve protagonist name
  const protagonist = (adv.protagonistName && adv.protagonistName.trim()) || parseProtagonistName(adv.memory) || "the player character";

  const system =
    `You are a creative writing assistant summarizing actions for an interactive story. Your task is to generate a detailed, ` +
    `single-sentence memory block summarizing ONLY the specific actions provided in the user message. Write in the second person ` +
    `(referencing the player as "You" and other characters by name). Format it strictly as a series of comma-separated clauses. ` +
    `The output must start with "You" and follow this exact style: "You [action], [Character] [action], she/he [reflection]...". ` +
    `Target approximately 100 tokens (between 80 and 120 tokens, or roughly 65-85 words) in size. Keep the summary concise ` +
    `and limit it to 4-5 key clauses to prevent exceeding 120 tokens. Under no circumstances should the output exceed 120 tokens. ` +
    `Do not use code blocks or quotes.`;

  const user = `Actions to summarize:\n${targetActions.map(a => a.text || "").join("\n")}`;

  let generatedMemory = "";
  try {
    dlog(`[AID bg] Generating memory summary using 3rd party provider...`);
    const rawResponse = await provider.complete(system, user);
    generatedMemory = cleanLlmResponse(rawResponse);
  } catch (err: any) {
    return { ok: false, error: `3rd party memory generation exception: ${err?.message || err}` };
  }

  let cleaned = generatedMemory.trim();
  if (cleaned.startsWith("[")) cleaned = cleaned.slice(1);
  if (cleaned.endsWith("]")) cleaned = cleaned.slice(0, -1);
  cleaned = cleaned.trim();

  if (!cleaned) {
    return { ok: false, error: "Generated memory text was empty." };
  }

  if (cleaned.length > NATIVE_MEMORY_CHAR_CAP) {
    console.warn(`[AID bg] Generated native memory summary was ${cleaned.length} chars (model overran the ~100-token limit); truncating to ${NATIVE_MEMORY_CHAR_CAP} to satisfy AID's 4,000-char EditMemory cap.`);
    cleaned = capMemoryBankEntry(cleaned);
  }

  // 4. Update the memory object in our database list
  const updatedMemories = [...memories];
  const oldMemory = updatedMemories[index]!;

  const newActionIds = targetActions.map(a => a.id);
  const lastActId = targetActions[targetActions.length - 1]!.id;

  updatedMemories[index] = {
    ...oldMemory,
    text: cleaned,
    actionIds: newActionIds,
    lastRelevantActionId: lastActId
  };

  await repo.upsertAdventure({ shortId, memoryBankEntries: updatedMemories });

  // 5. Replay EditMemory GQL mutation to AI Dungeon to update it on the server
  const editOp = await repo.getOp("EditMemory");
  const editQuery = editOp?.query || DEFAULT_GQL_QUERIES.EditMemory;

  // The target action ID is the original action ID associated with this memory block
  const actionId = (oldMemory.actionIds && oldMemory.actionIds.length > 0)
    ? oldMemory.actionIds[oldMemory.actionIds.length - 1]
    : oldMemory.lastRelevantActionId;
  if (actionId) {
    try {
      dlog(`[AID bg] Replaying EditMemory mutation to update memory on server for action ID: ${actionId}`);
      const req = buildEditMemory(gqlEndpoint!, editQuery, sessionToken!, shortId, actionId, cleaned);
      const res = await fetch(req.url, { method: "POST", headers: req.headers, body: req.body });
      const json = await res.json() as any;
      dlog("[AID bg] EditMemory response:", JSON.stringify(json));
    } catch (err) {
      console.error("[AID bg] Failed to push memory edit to server:", err);
    }
  } else {
    console.warn("[AID bg] Could not find actionId to push memory edit to server.");
  }

  return { ok: true, memories: updatedMemories };
}

export async function regenerateLatestMemory(shortId: string): Promise<{ ok: boolean; error?: string; memories?: any[] }> {
  const adv = await repo.getAdventure(shortId);
  if (!adv) return { ok: false, error: "Adventure metadata not found." };
  const memories = adv.memoryBankEntries || [];
  if (memories.length === 0) {
    return { ok: false, error: "No native memories found to refine." };
  }
  return regenerateMemoryBlock(shortId, memories.length - 1);
}
browser.runtime.onMessage.addListener((msg: BgMessage, sender, sendResponse) => {
  const isFirefox = typeof navigator !== "undefined" && /firefox/i.test(navigator.userAgent);
  if (isFirefox) {
    return handleMessage(msg);
  } else {
    if (typeof sendResponse === "function") {
      handleMessage(msg)
        .then(sendResponse)
        .catch((err) => {
          console.error("[AID bg] Error handling message:", err);
          sendResponse({ error: err?.message || String(err) });
        });
      return true; // Keep the message channel open for sendResponse
    } else {
      return handleMessage(msg);
    }
  }
});

async function handleMessage(msg: BgMessage): Promise<any> {
  try {
    switch (msg.kind) {
      case "openPermissionsPage": {
        try {
          await browser.tabs.create({ url: browser.runtime.getURL("permissions.html") });
          return { ok: true };
        } catch (e: any) {
          console.error("[AID bg] Failed to open permissions page:", e);
          return { error: e?.message || String(e) };
        }
      }
      case "processInterceptedAction": {
        try {
          const importantNames = cachedImportantCharacters.get(msg.shortId);
          if (importantNames && importantNames.length > 0) {
            const settings = await repo.getSettings();
            const presenceLookback = settings?.memoraidPresenceLookback ?? 5;
            
            let recent = cachedRecentActions.get(msg.shortId);
            if (!recent) {
              await updateRecentActionsCache(msg.shortId);
              recent = cachedRecentActions.get(msg.shortId) || [];
            }
            
            const isRetry = msg.type === "retry";
            const sliced = isRetry && recent.length >= 2
              ? recent.slice(0, -1).slice(-presenceLookback)
              : recent.slice(-presenceLookback);
            const combinedText = (sliced.map(a => a.text || "").join("\n") + "\n" + (msg.text || "")).toLowerCase();
            
            const cards = await repo.getCards(msg.shortId) || [];
            const charactersToCheck: { title: string; keys: string }[] = [];
            const seenTitles = new Set<string>();
            for (const impName of importantNames) {
              const baseCard = cards.find(c => {
                if (c.type.toLowerCase() !== "character") return false;
                if (c.deletedAt) return false;
                if ((c.title || "").toLowerCase().endsWith(" (memory)")) return false;
                const titleLower = (c.title || "").toLowerCase();
                const keysList = (c.keys || "").split(/[,;]+/).map(k => k.trim().toLowerCase()).filter(Boolean);
                
                if (titleLower === impName || keysList.includes(impName)) return true;
                
                if (titleLower.includes(" and ") || titleLower.includes(" & ")) {
                  const parts = titleLower.split(/\s+(?:and|&)\s+/);
                  if (parts.includes(impName)) return true;
                }
                
                for (const k of keysList) {
                  if (k.includes(" and ") || k.includes(" & ")) {
                    const parts = k.split(/\s+(?:and|&)\s+/);
                    if (parts.includes(impName)) return true;
                  }
                }
                return false;
              });
              
              const title = baseCard ? baseCard.title || "" : capitalizeWords(impName);
              const keys = baseCard ? baseCard.keys || "" : impName;
              const titleLower = title.toLowerCase();
              
              if (!seenTitles.has(titleLower)) {
                seenTitles.add(titleLower);
                charactersToCheck.push({ title, keys });
              }
            }
            
            const triggered = charactersToCheck.filter(c => 
              isCharacterTriggered(combinedText, c.title, c.keys)
            );
            
            if (triggered.length === 0) {
              dlog("[AID bg] Short-circuit: No tracked characters triggered in caching presence check.");
              return { ok: true, updatedNames: [] };
            }
          }
          const updatedNames = await checkMemorAIDUpdates(msg.shortId, msg.text, msg.type, true);
          return { ok: true, updatedNames };
        } catch (e: any) {
          console.error("[AID bg] processInterceptedAction failed:", e);
          return { error: e?.message || String(e) };
        }
      }
      case "refineMemoryBlock": {
        try {
          const res = await regenerateMemoryBlock(msg.shortId, msg.index);
          return res;
        } catch (e: any) {
          console.error("[AID bg] refineMemoryBlock failed:", e);
          return { error: e?.message || String(e) };
        }
      }
      case "setActiveLocation": {
        try {
          const { shortId, cardId } = msg;
          const adv = await repo.getAdventure(shortId);
          if (!adv) return { error: "Adventure not found" };

          const settings = await repo.getSettings();
          const mode = settings?.locationMode || "optionA";

          let locationTitle: string | null = null;
          let selectedLocationCard: CardRow | undefined;

          if (cardId) {
            const cards = await repo.getCards(shortId);
            selectedLocationCard = cards.find(c => c.id === cardId && !c.deletedAt);
            if (selectedLocationCard) {
              locationTitle = selectedLocationCard.title || selectedLocationCard.keys;
            }
          }

          let finalMemory = adv.memory;
          let hasMemoryChanged = false;

          if (mode === "optionB") {
            // Option B: Active Location Anchor Card
            await ensureAuth();
            if (!sessionToken || !isSafeEndpoint(gqlEndpoint)) {
              return { error: "No session token yet — interact with the page once, then retry." };
            }

            const cards = await repo.getCards(shortId);
            let anchorCard = cards.find(c => !c.deletedAt && c.title === "Active Location Anchor" && c.type === "custom");
            
            const value = selectedLocationCard ? selectedLocationCard.value : "";
            const description = selectedLocationCard ? (selectedLocationCard.description || "") : "";

            if (!anchorCard) {
              // Create the Anchor Card first
              const createOp = await repo.getOp("SaveQueueStoryCard");
              const createQuery = createOp?.query || DEFAULT_GQL_QUERIES.SaveQueueStoryCard;
              const tempId = Math.floor(Math.random() * 1e9).toString();
              const cardRow: CardRow = {
                id: tempId,
                shortId,
                type: "custom",
                title: "Active Location Anchor",
                keys: "ActiveLocationAnchor",
                value: value,
                description: description,
              };
              const req = buildCardCreate(gqlEndpoint!, createQuery, sessionToken!, cardRow, value);
              const res = await fetch(req.url, { method: "POST", headers: req.headers, body: req.body });
              if (!res.ok) {
                return { error: `Creation of Active Location Anchor failed with HTTP ${res.status}` };
              }
              const json = await res.json() as any;
              const returnedCard = json?.[0]?.data?.updateStoryCard?.storyCard ||
                                   json?.[0]?.data?.saveQueueStoryCard?.storyCard ||
                                   json?.[0]?.data?.updateStoryCard ||
                                   json?.[0]?.data?.saveQueueStoryCard;
              const actualId = returnedCard?.id || tempId;
              anchorCard = { ...cardRow, id: actualId };
              await repo.putCards(shortId, [anchorCard]);

              broadcastToTabs({
                kind: "approvedCardSync",
                payload: { ok: true, source: "card", cardId: actualId, value, description }
              });
            } else {
              // Update the existing Anchor Card
              const updateOp = await repo.getOp("UseAutoSaveStoryCard");
              const updateQuery = updateOp?.query || DEFAULT_GQL_QUERIES.UseAutoSaveStoryCard;
              
              const anchorCardRow: CardRow = {
                ...anchorCard,
                value,
                description
              };
              const req = buildCardSave(gqlEndpoint!, updateQuery, sessionToken!, anchorCardRow, value);
              const res = await fetch(req.url, { method: "POST", headers: req.headers, body: req.body });
              if (!res.ok) {
                return { error: `Update of Active Location Anchor failed with HTTP ${res.status}` };
              }
              const json = await res.json() as any;
              const isSuccess = json?.[0]?.data?.updateStoryCard?.success || json?.[0]?.data?.saveQueueStoryCard?.success;
              if (!isSuccess) {
                const msgStr = json?.[0]?.data?.updateStoryCard?.message || json?.[0]?.errors?.[0]?.message || "Mutation failed";
                return { error: `AI Dungeon rejected Anchor update: ${msgStr}` };
              }
              await repo.putCards(shortId, [anchorCardRow]);

              broadcastToTabs({
                kind: "approvedCardSync",
                payload: { ok: true, source: "card", cardId: anchorCard.id, value, description }
              });
            }

            // Write/Ensure '[Current Location: ActiveLocationAnchor]' in Plot Essentials
            const peTarget = locationTitle ? "ActiveLocationAnchor" : null;
            const currentMemory = adv.memory || "";
            const newMemory = updatePlotEssentialsLocation(currentMemory, peTarget);
            if (newMemory !== currentMemory) {
              await ensureAuth();
              if (sessionToken && isSafeEndpoint(gqlEndpoint)) {
                const op = await repo.getOp("UpdateAdventurePlot");
                const query = op?.query || DEFAULT_GQL_QUERIES.UpdateAdventurePlot;
                const req = buildMemorySave(gqlEndpoint!, query, sessionToken!, shortId, newMemory);
                const res = await fetch(req.url, { method: "POST", headers: req.headers, body: req.body });
                if (res.ok) {
                  finalMemory = newMemory;
                  hasMemoryChanged = true;
                }
              } else {
                finalMemory = newMemory;
                hasMemoryChanged = true;
              }
            }
          } else {
            // Option A: Plot Essentials Tagging
            const currentMemory = adv.memory || "";
            const newMemory = updatePlotEssentialsLocation(currentMemory, locationTitle);
            if (newMemory !== currentMemory) {
              await ensureAuth();
              if (!sessionToken || !isSafeEndpoint(gqlEndpoint)) {
                return { error: "No session token yet — interact with the page once, then retry." };
              }
              const op = await repo.getOp("UpdateAdventurePlot");
              const query = op?.query || DEFAULT_GQL_QUERIES.UpdateAdventurePlot;
              const req = buildMemorySave(gqlEndpoint!, query, sessionToken!, shortId, newMemory);
              const res = await fetch(req.url, { method: "POST", headers: req.headers, body: req.body });
              if (!res.ok) {
                return { error: `Plot update failed with HTTP ${res.status}` };
              }
              const json: any = await res.json();
              const isSuccess = json?.[0]?.data?.updateAdventurePlot?.success;
              if (!isSuccess) {
                const msgStr = json?.[0]?.data?.updateAdventurePlot?.message || json?.[0]?.errors?.[0]?.message || "Mutation failed";
                return { error: `AI Dungeon rejected memory update: ${msgStr}` };
              }
              finalMemory = newMemory;
              hasMemoryChanged = true;
            }
          }

          // Single, atomic update to DB
          await repo.upsertAdventure({
            shortId,
            activeLocationId: cardId || undefined,
            memory: finalMemory
          });

          if (hasMemoryChanged && finalMemory) {
            broadcastToTabs({ kind: "memoryUpdated", shortId, memory: finalMemory, previousMemory: adv.memory || "" });
          }

          broadcastToTabs({ kind: "stateUpdated", shortId });
          return { ok: true };
        } catch (err: any) {
          console.error("[AID bg] setActiveLocation failed:", err);
          return { error: err?.message || String(err) };
        }
      }
      case "respondToProperNounSuggestion": {
        try {
          const { shortId, properNoun, accept, type } = msg;
          const adv = await repo.getAdventure(shortId);
          if (!adv) return { error: "Adventure not found" };

          const suggestions = adv.locationSuggestions || [];
          const logs = adv.properNounLogs || [];

          const index = suggestions.findIndex(s => s.properNoun.toLowerCase() === properNoun.toLowerCase());
          if (index === -1) return { error: "Suggestion not found" };

          const suggestion = suggestions[index]!;

          suggestions.splice(index, 1); // Remove from suggestion queue

          if (accept) {
            const isLoc = type.toLowerCase() === "location";
            const isChar = type.toLowerCase() === "character";

            logs.push({
              actionId: suggestion.actionId,
              properNoun: suggestion.properNoun,
              actionText: suggestion.actionText,
              timestamp: new Date().toISOString(),
              isLocation: isLoc,
              isCharacter: isChar,
              type: type
            } as any);

            await repo.upsertAdventure({
              shortId,
              locationSuggestions: suggestions,
              properNounLogs: logs
            });

            // Create new card of specified type
            await ensureAuth();
            if (!sessionToken || !isSafeEndpoint(gqlEndpoint)) {
              // local save only
              const tempId = Math.floor(Math.random() * 1e9).toString();
              const cardRow: CardRow = {
                id: tempId,
                shortId,
                type: type,
                title: properNoun,
                keys: properNoun,
                value: "",
                description: ""
              };
              await repo.putCards(shortId, [cardRow]);
            } else {
              const createOp = await repo.getOp("SaveQueueStoryCard");
              const createQuery = createOp?.query || DEFAULT_GQL_QUERIES.SaveQueueStoryCard;
              try {
                const tempId = Math.floor(Math.random() * 1e9).toString();
                const cardRow: CardRow = {
                  id: tempId,
                  shortId,
                  type: type,
                  title: properNoun,
                  keys: properNoun,
                  value: "",
                  description: ""
                };
                const req = buildCardCreate(gqlEndpoint!, createQuery, sessionToken!, cardRow, "");
                const res = await fetch(req.url, { method: "POST", headers: req.headers, body: req.body });
                if (res.ok) {
                  const json = await res.json() as any;
                  const returnedCard = json?.[0]?.data?.updateStoryCard?.storyCard ||
                                       json?.[0]?.data?.saveQueueStoryCard?.storyCard ||
                                       json?.[0]?.data?.updateStoryCard ||
                                       json?.[0]?.data?.saveQueueStoryCard;
                  const actualId = returnedCard?.id || tempId;
                  const savedCard: CardRow = { ...cardRow, id: actualId };
                  await repo.putCards(shortId, [savedCard]);
                  
                  broadcastToTabs({
                    kind: "approvedCardSync",
                    payload: { ok: true, source: "card", cardId: actualId, value: "", description: "" }
                  });
                } else {
                  await repo.putCards(shortId, [cardRow]);
                }
              } catch (e) {
                console.error(`[AID bg] Failed to create ${type} card on server`, e);
                await repo.putCards(shortId, [{
                  id: Math.floor(Math.random() * 1e9).toString(),
                  shortId,
                  type: type,
                  title: properNoun,
                  keys: properNoun,
                  value: "",
                  description: ""
                }]);
              }
            }
          } else {
            // Rejected
            logs.push({
              actionId: suggestion.actionId,
              properNoun: suggestion.properNoun,
              actionText: suggestion.actionText,
              timestamp: new Date().toISOString(),
              isLocation: false,
              isCharacter: false
            });

            await repo.upsertAdventure({
              shortId,
              locationSuggestions: suggestions,
              properNounLogs: logs
            });
          }

          broadcastToTabs({ kind: "stateUpdated", shortId });
          return { ok: true };
        } catch (err: any) {
          console.error("[AID bg] respondToProperNounSuggestion failed:", err);
          return { error: err?.message || String(err) };
        }
      }
      case "linkProperNounToCard": {
        try {
          const { shortId, properNoun, cardId } = msg;
          const adv = await repo.getAdventure(shortId);
          if (!adv) return { error: "Adventure not found" };

          const cards = await repo.getCards(shortId);
          const card = cards.find(c => c.id === cardId && !c.deletedAt);
          if (!card) return { error: "Target card not found in local database." };

          const newKeys = mergeTriggerKey(card.keys || "", properNoun);

          // Push the alias to AID first (UseAutoSaveStoryCard) — only mutate local state on success
          // so a failed push leaves the suggestion in place to retry. Skip the push if the key was
          // already present (newKeys unchanged) but still resolve the log/suggestion locally.
          if (newKeys !== (card.keys || "")) {
            await ensureAuth();
            if (!sessionToken || !isSafeEndpoint(gqlEndpoint)) {
              return { error: "No session token yet — interact with the page once, then retry." };
            }
            const updateOp = await repo.getOp("UseAutoSaveStoryCard");
            const updateQuery = updateOp?.query || DEFAULT_GQL_QUERIES.UseAutoSaveStoryCard;
            const updatedCard = { ...card, keys: newKeys };
            const req = buildCardSave(gqlEndpoint!, updateQuery, sessionToken!, updatedCard, updatedCard.value);
            const res = await fetch(req.url, { method: "POST", headers: req.headers, body: req.body });
            if (!res.ok) return { error: `Save failed with HTTP ${res.status}` };
            const json = await res.json() as any;
            const returnedCard = json?.[0]?.data?.updateStoryCard?.storyCard || json?.[0]?.data?.updateStoryCard;
            const isSuccess = json?.[0]?.data?.updateStoryCard?.success || returnedCard;
            if (!isSuccess) {
              const msgStr = json?.[0]?.data?.updateStoryCard?.message || json?.[0]?.errors?.[0]?.message || "Mutation failed";
              return { error: `AI Dungeon rejected save: ${msgStr}` };
            }
            await repo.putCards(shortId, [updatedCard]);
            broadcastToTabs({
              kind: "approvedCardSync",
              payload: { ok: true, source: "card", cardId: card.id, value: updatedCard.value, description: updatedCard.description || "", keys: newKeys, prevKeys: card.keys || "" }
            });
          }

          // Resolve the suggestion (if linking from the live banner) and upsert a linked log entry
          // so the noun shows as "→ <card>" in the editor and never re-fires.
          const suggestions = (adv.locationSuggestions || []).filter(
            s => s.properNoun.toLowerCase() !== properNoun.toLowerCase()
          );
          const sourceSug = (adv.locationSuggestions || []).find(
            s => s.properNoun.toLowerCase() === properNoun.toLowerCase()
          );
          const logs = adv.properNounLogs || [];
          const cardType = (card.type || "").toLowerCase();
          const linkFields = {
            isLocation: cardType === "location",
            isCharacter: cardType === "character",
            type: card.type,
            linkedCardId: card.id,
            linkedCardTitle: card.title || card.keys || properNoun,
          };
          const existingLog = logs.find(l => l.properNoun.toLowerCase() === properNoun.toLowerCase());
          if (existingLog) {
            Object.assign(existingLog, linkFields);
          } else {
            logs.push({
              actionId: sourceSug?.actionId || "",
              properNoun,
              actionText: sourceSug?.actionText || "",
              timestamp: new Date().toISOString(),
              ...linkFields,
            });
          }

          await repo.upsertAdventure({ shortId, locationSuggestions: suggestions, properNounLogs: logs });
          broadcastToTabs({ kind: "stateUpdated", shortId });
          return { ok: true };
        } catch (err: any) {
          console.error("[AID bg] linkProperNounToCard failed:", err);
          return { error: err?.message || String(err) };
        }
      }
      case "updateProperNounLog": {
        try {
          const { shortId, properNoun, type } = msg;
          const adv = await repo.getAdventure(shortId);
          if (!adv) return { error: "Adventure not found" };

          const logs = adv.properNounLogs || [];
          const entry = logs.find(l => l.properNoun.toLowerCase() === properNoun.toLowerCase());
          if (entry) {
            // `type` is the chosen card type ("" = None). Store it verbatim; keep the legacy
            // isLocation/isCharacter booleans in sync for backward compatibility.
            const t = (type || "").trim();
            const tl = t.toLowerCase();
            entry.isLocation = tl === "location";
            entry.isCharacter = tl === "character";
            if (t) (entry as any).type = t;
            else delete (entry as any).type;

            await repo.upsertAdventure({
              shortId,
              properNounLogs: logs
            });
            broadcastToTabs({ kind: "stateUpdated", shortId });
          }
          return { ok: true };
        } catch (err: any) {
          console.error("[AID bg] updateProperNounLog failed:", err);
          return { error: err?.message || String(err) };
        }
      }
      case "deleteProperNounLog": {
        try {
          const { shortId, properNoun } = msg;
          const adv = await repo.getAdventure(shortId);
          if (!adv) return { error: "Adventure not found" };

          const logs = adv.properNounLogs || [];
          const filtered = logs.filter(l => l.properNoun.toLowerCase() !== properNoun.toLowerCase());
          await repo.upsertAdventure({
            shortId,
            properNounLogs: filtered
          });
          broadcastToTabs({ kind: "stateUpdated", shortId });
          return { ok: true };
        } catch (err: any) {
          console.error("[AID bg] deleteProperNounLog failed:", err);
          return { error: err?.message || String(err) };
        }
      }
      case "clearProperNounLogs": {
        try {
          const { shortId } = msg;
          await repo.upsertAdventure({
            shortId,
            properNounLogs: []
          });
          broadcastToTabs({ kind: "stateUpdated", shortId });
          return { ok: true };
        } catch (err: any) {
          console.error("[AID bg] clearProperNounLogs failed:", err);
          return { error: err?.message || String(err) };
        }
      }
      case "memoryBankUpdate": {
        const adv = await repo.getAdventure(msg.shortId);
        const oldMemories = adv?.memoryBankEntries || [];
        const normalized = (msg.memories || []).map((m: any) => {
          const text = typeof m === "string" ? m : (m?.text || "");
          const old = oldMemories.find((o) => o.text === text);
          if (old) {
            return old;
          }
          return typeof m === "string" ? { actionIds: [], text: m } : m;
        });

        const update: any = { shortId: msg.shortId, memoryBankEntries: normalized };
        await repo.upsertAdventure(update);

        const settings = await repo.getSettings();
        if (settings?.autoRegenerateMemoryBankEntry) {
          let shouldTrigger = false;
          if (normalized.length > oldMemories.length) {
            const isInitialLoad = oldMemories.length === 0;
            if (!isInitialLoad || normalized.length === 1) {
              shouldTrigger = true;
            }
          } else if (normalized.length > 0 && oldMemories.length > 0) {
            const lastIdx = normalized.length - 1;
            const normIds = normalized[lastIdx].actionIds || [];
            const oldIds = oldMemories[lastIdx].actionIds || [];
            if (normIds.length !== oldIds.length || !normIds.every((id: string, idx: number) => id === oldIds[idx])) {
              shouldTrigger = true;
            }
          }

          if (shouldTrigger) {
            dlog(`[AID bg] Auto-regenerating latest memory block for shortId: ${msg.shortId}`);
            regenerateLatestMemory(msg.shortId).catch(err => {
              console.error("[AID bg] Auto-regeneration of latest memory failed:", err);
            });
          }
        }
        return;
      }
      case "updateMemoryBank": {
        await ensureAuth();
        const normalized = msg.memories.map((m: any) => typeof m === "string" ? { actionIds: [], text: m } : m);
        const adv = await repo.getAdventure(msg.shortId);
        const oldMemories = adv?.memoryBankEntries || [];
        
        await repo.upsertAdventure({ shortId: msg.shortId, memoryBankEntries: normalized });
        
        // Find which memory was edited by diffing by index
        let editedMemory: any = null;
        for (let i = 0; i < normalized.length; i++) {
          const newMem = normalized[i];
          const oldMem = oldMemories[i];
          if (oldMem && newMem.text !== oldMem.text) {
            editedMemory = newMem;
            break;
          }
        }

        if (editedMemory) {
          const actionId = (editedMemory.actionIds && editedMemory.actionIds.length > 0)
            ? editedMemory.actionIds[editedMemory.actionIds.length - 1]
            : editedMemory.lastRelevantActionId;
          if (!actionId) {
            console.warn("[AID bg] Cannot edit memory: no lastRelevantActionId or actionId found for memory text:", editedMemory.text);
            return;
          }
          
          if (sessionToken && gqlEndpoint) {
            const op = await repo.getOp("EditMemory");
            const query = op?.query || DEFAULT_GQL_QUERIES.EditMemory;

            try {
              dlog("[AID bg] Replaying EditMemory mutation to AI Dungeon...");
              const req = buildEditMemory(gqlEndpoint, query, sessionToken, msg.shortId, actionId, capMemoryBankEntry(editedMemory.text));
              const res = await fetch(req.url, { method: "POST", headers: req.headers, body: req.body });
              const json = await res.json() as any;
              dlog("[AID bg] EditMemory response status:", res.status, JSON.stringify(json));
            } catch (err) {
              console.error("[AID bg] Failed to push memory edit to AI Dungeon:", err);
            }
          }
        } else if (normalized.length < oldMemories.length) {
          console.warn("[AID bg] Memory was deleted. AI Dungeon does not support discrete memory deletion mutations natively; skipping push.");
        }
        return;
      }
      case "createConfigCard": {
        await ensureAuth();
        if (!sessionToken || !isSafeEndpoint(gqlEndpoint)) {
          return { error: "No session token yet — interact with the page once, then retry." };
        }
        const createOp = await repo.getOp("SaveQueueStoryCard");
        const createQuery = createOp?.query || DEFAULT_GQL_QUERIES.SaveQueueStoryCard;
        try {
          const tempId = Math.floor(Math.random() * 1e9).toString();
          const configCardRow: CardRow = {
            id: tempId,
            shortId: msg.shortId,
            type: MEMORAID_CONFIG_TYPE,
            title: "Configure MemorAID",
            keys: "configure memoraid",
            description: "IMPORTANT_CHARACTERS: ",
            value: "List important characters here to enable thought tracking.",
          };
          const req = buildCardCreate(gqlEndpoint!, createQuery, sessionToken!, configCardRow, configCardRow.value);
          const res = await fetch(req.url, { method: "POST", headers: req.headers, body: req.body });
          if (!res.ok) {
            return { error: `Creation failed with HTTP ${res.status}` };
          }
          const json = await res.json() as any;
          const returnedCard = json?.[0]?.data?.updateStoryCard?.storyCard ||
                               json?.[0]?.data?.saveQueueStoryCard?.storyCard ||
                               json?.[0]?.data?.updateStoryCard ||
                               json?.[0]?.data?.saveQueueStoryCard;
          const isSuccess = json?.[0]?.data?.updateStoryCard?.success || json?.[0]?.data?.saveQueueStoryCard?.success || returnedCard;
          if (!isSuccess) {
            const msgStr = json?.[0]?.data?.updateStoryCard?.message || json?.[0]?.errors?.[0]?.message || "Mutation failed";
            return { error: `AI Dungeon rejected creation: ${msgStr}` };
          }
          const actualId = returnedCard?.id || tempId;
          const savedCard: CardRow = {
            ...configCardRow,
            id: actualId,
          };
          await repo.putCards(msg.shortId, [savedCard]);
          
          // Broadcast update
          broadcastToTabs({
            kind: "approvedCardSync",
            payload: { ok: true, source: "card", cardId: actualId, value: configCardRow.value, description: configCardRow.description || "" }
          });
          return { ok: true, id: actualId };
        } catch (err: any) {
          return { error: err?.message || String(err) };
        }
      }
      case "createStoryCard": {
        await ensureAuth();
        if (!sessionToken || !isSafeEndpoint(gqlEndpoint)) {
          return { error: "No session token yet — interact with the page once, then retry." };
        }
        const createOp = await repo.getOp("SaveQueueStoryCard");
        const createQuery = createOp?.query || DEFAULT_GQL_QUERIES.SaveQueueStoryCard;
        try {
          const tempId = Math.floor(Math.random() * 1e9).toString();
          const cardRow: CardRow = {
            id: tempId,
            shortId: msg.shortId,
            type: msg.card.type,
            title: msg.card.title,
            keys: msg.card.keys,
            description: msg.card.description || "",
            value: msg.card.value,
          };
          const req = buildCardCreate(gqlEndpoint!, createQuery, sessionToken!, cardRow, cardRow.value);
          const res = await fetch(req.url, { method: "POST", headers: req.headers, body: req.body });
          if (!res.ok) {
            return { error: `Creation failed with HTTP ${res.status}` };
          }
          const json = await res.json() as any;
          const returnedCard = json?.[0]?.data?.updateStoryCard?.storyCard ||
                               json?.[0]?.data?.saveQueueStoryCard?.storyCard ||
                               json?.[0]?.data?.updateStoryCard ||
                               json?.[0]?.data?.saveQueueStoryCard;
          const isSuccess = json?.[0]?.data?.updateStoryCard?.success || json?.[0]?.data?.saveQueueStoryCard?.success || returnedCard;
          if (!isSuccess) {
            const msgStr = json?.[0]?.data?.updateStoryCard?.message || json?.[0]?.errors?.[0]?.message || "Mutation failed";
            return { error: `AI Dungeon rejected creation: ${msgStr}` };
          }
          const actualId = returnedCard?.id || tempId;
          const savedCard: CardRow = {
            ...cardRow,
            id: actualId,
          };
          await repo.putCards(msg.shortId, [savedCard]);
          
          // Broadcast update
          broadcastToTabs({
            kind: "approvedCardSync",
            payload: { ok: true, source: "card", cardId: actualId, value: cardRow.value, description: cardRow.description || "" }
          });
          return { ok: true, id: actualId, card: savedCard };
        } catch (err: any) {
          return { error: err?.message || String(err) };
        }
      }
      case "saveCardKeys": {
        await ensureAuth();
        if (!sessionToken || !isSafeEndpoint(gqlEndpoint)) {
          return { error: "No session token yet — interact with the page once, then retry." };
        }
        const updateOp = await repo.getOp("UseAutoSaveStoryCard");
        const updateQuery = updateOp?.query || DEFAULT_GQL_QUERIES.UseAutoSaveStoryCard;
        try {
          const cards = await repo.getCards(msg.shortId);
          const card = cards.find(c => c.id === msg.cardId);
          if (!card) {
            return { error: "Card not found in local database." };
          }
          const prevKeys = card.keys || "";
          const updatedCard = { ...card, keys: msg.keys };
          const req = buildCardSave(gqlEndpoint!, updateQuery, sessionToken!, updatedCard, updatedCard.value);
          const res = await fetch(req.url, { method: "POST", headers: req.headers, body: req.body });
          if (!res.ok) {
            return { error: `Save failed with HTTP ${res.status}` };
          }
          const json = await res.json() as any;
          const returnedCard = json?.[0]?.data?.updateStoryCard?.storyCard ||
                               json?.[0]?.data?.updateStoryCard;
          const isSuccess = json?.[0]?.data?.updateStoryCard?.success || returnedCard;
          if (!isSuccess) {
            const msgStr = json?.[0]?.data?.updateStoryCard?.message || json?.[0]?.errors?.[0]?.message || "Mutation failed";
            return { error: `AI Dungeon rejected save: ${msgStr}` };
          }
          await repo.putCards(msg.shortId, [updatedCard]);

          // Broadcast update — carry keys so the injected script can protect the open card
          // editor's stale autosave from reverting the new triggers (see approvedCardKeys).
          broadcastToTabs({
            kind: "approvedCardSync",
            payload: { ok: true, source: "card", cardId: msg.cardId, value: updatedCard.value, description: updatedCard.description || "", keys: msg.keys, prevKeys }
          });
          return { ok: true };
        } catch (err: any) {
          return { error: err?.message || String(err) };
        }
      }
      case "getOffMetaRepository": {
        try {
          const sections = await fetchOffMetaRepositoryIfNeeded();
          return { ok: true, sections };
        } catch (err: any) {
          return { error: err?.message || String(err) };
        }
      }
      case "applyOffMetaInstruction": {
        try {
          const { shortId, text, type, itemType } = msg;
          await ensureAuth();
          if (!isSafeEndpoint(gqlEndpoint) || !sessionToken) {
            return { error: "No AI Dungeon GraphQL endpoint or session token observed yet. Please interact with the game first." };
          }
          const endpoint = gqlEndpoint!;
          const token = sessionToken!;

          const getAdventureQuery = `
            query GetAdventureDetails($shortId: String) {
              adventure(shortId: $shortId) {
                id
                authorsNote
                memory
                thirdPerson
                state {
                  instructions
                  storySummary
                  storyCardStoryInformation
                  storyCardInstructions
                  __typename
                }
                __typename
              }
            }
          `;
          const fetchReq = buildGraphQLMutation(endpoint, getAdventureQuery, token, "GetAdventureDetails", { shortId });
          const fetchRes = await fetch(fetchReq.url, { method: "POST", headers: fetchReq.headers, body: fetchReq.body });
          if (!fetchRes.ok) {
            return { error: `Failed to fetch adventure state from AI Dungeon: HTTP ${fetchRes.status}` };
          }
          const fetchJson = await fetchRes.json() as any;
          const advData = fetchJson?.[0]?.data?.adventure;
          if (!advData) {
            const errMsg = fetchJson?.[0]?.errors?.[0]?.message || "GraphQL query failed";
            return { error: `Failed to fetch adventure state: ${errMsg}` };
          }

          const currentAN = advData.authorsNote || "";
          const currentPE = advData.memory || "";
          const currentState = advData.state || {};
          const currentInstructions = currentState.instructions || {};
          const currentAIN = currentInstructions.custom || "";

          const adv = await repo.getAdventure(shortId);
          const protagonist = (adv?.protagonistName && adv.protagonistName.trim()) || parseProtagonistName(currentPE) || "the player character";

          const processedText = text
            .replace(/\$\{character\.name\}/g, protagonist)
            .replace(/\{protagonist\}/gi, protagonist);
          let toAppend = processedText;
          if (itemType === "bullet") {
            toAppend = `- ${processedText}`;
          }

          if (type === "ain") {
            let newAIN = currentAIN.trim();
            if (newAIN.includes(processedText.trim())) {
              return { ok: true, message: "Instruction already present in AI Instructions." };
            }
            newAIN = newAIN ? `${newAIN}\n${toAppend}` : toAppend;

            const op = await repo.getOp("UpdateAdventureState");
            const updateQuery = op?.query || DEFAULT_GQL_QUERIES.UpdateAdventureState;
            const updateReq = buildUpdateAdventureState(
              endpoint,
              updateQuery,
              token,
              shortId,
              newAIN,
              currentState.storySummary || "",
              currentState.storyCardStoryInformation || "",
              currentState.storyCardInstructions || ""
            );
            const updateRes = await fetch(updateReq.url, { method: "POST", headers: updateReq.headers, body: updateReq.body });
            if (!updateRes.ok) {
              return { error: `Failed to save AI Instructions: HTTP ${updateRes.status}` };
            }
            const updateJson = await updateRes.json() as any;
            const returnedAdv = updateJson?.[0]?.data?.updateAdventureState?.adventure || updateJson?.[0]?.data?.updateAdventureState;
            const success = updateJson?.[0]?.data?.updateAdventureState?.success || returnedAdv;
            if (!success) {
              const errMsg = updateJson?.[0]?.data?.updateAdventureState?.message || updateJson?.[0]?.errors?.[0]?.message || "AI Dungeon rejected the update.";
              return { error: `Failed to save AI Instructions: ${errMsg}` };
            }
            broadcastToTabs({
              kind: "stateUpdated",
              shortId,
              type: "ain",
              text: newAIN,
              previousText: currentAIN
            });
            return { ok: true, message: "Successfully applied instruction to AI Instructions." };
          } else {
            let newAN = currentAN.trim();
            let newPE = currentPE.trim();

            if (type === "an") {
              if (newAN.includes(processedText.trim())) {
                return { ok: true, message: "Instruction already present in Author's Note." };
              }
              newAN = newAN ? `${newAN}\n${toAppend}` : toAppend;
            } else {
              if (newPE.includes(processedText.trim())) {
                return { ok: true, message: "Instruction already present in Plot Essentials." };
              }
              newPE = newPE ? `${newPE}\n${toAppend}` : toAppend;
            }

            const op = await repo.getOp("UpdateAdventurePlot");
            const updateQuery = op?.query || DEFAULT_GQL_QUERIES.UpdateAdventurePlot;
            const updateReq = buildMemorySave(endpoint, updateQuery, token, shortId, newPE, newAN);
            const updateRes = await fetch(updateReq.url, { method: "POST", headers: updateReq.headers, body: updateReq.body });
            if (!updateRes.ok) {
              return { error: `Failed to save update: HTTP ${updateRes.status}` };
            }
            const updateJson = await updateRes.json() as any;
            const returnedAdv = updateJson?.[0]?.data?.updateAdventurePlot?.adventure || updateJson?.[0]?.data?.updateAdventurePlot;
            const success = updateJson?.[0]?.data?.updateAdventurePlot?.success || returnedAdv;
            if (!success) {
              const errMsg = updateJson?.[0]?.data?.updateAdventurePlot?.message || updateJson?.[0]?.errors?.[0]?.message || "AI Dungeon rejected the update.";
              return { error: `Failed to save update: ${errMsg}` };
            }
            await repo.upsertAdventure({ shortId, memory: newPE });
            broadcastToTabs({
              kind: "stateUpdated",
              shortId,
              type,
              text: type === "an" ? newAN : newPE,
              previousText: type === "an" ? currentAN : currentPE
            });
            return { ok: true, message: `Successfully applied instruction to ${type === "an" ? "Author's Note" : "Plot Essentials"}.` };
          }
        } catch (err: any) {
          return { error: err?.message || String(err) };
        }
      }
      case "adventureMeta": {
        const update: any = { shortId: msg.shortId };
        if (msg.title !== undefined) update.title = msg.title;
        if (msg.memory !== undefined) {
          update.memory = msg.memory;
          // Parse active location from memory
          const parsedLocTitle = parseLocationFromMemory(msg.memory);
          if (parsedLocTitle) {
            const cards = await repo.getCards(msg.shortId);
            const activeCards = cards.filter(c => !c.deletedAt);
            let matchedCard = activeCards.find(c => c.type === "location" && (c.title?.trim().toLowerCase() === parsedLocTitle.toLowerCase() || c.keys?.trim().toLowerCase() === parsedLocTitle.toLowerCase()));
            if (matchedCard) {
              update.activeLocationId = matchedCard.id;
            } else if (parsedLocTitle.toLowerCase() === "activelocationanchor") {
              // Option B anchor card: keep existing activeLocationId if set
            } else {
              update.activeLocationId = null;
            }
          } else {
            update.activeLocationId = null;
          }
        }
        if (msg.authorsNote !== undefined) update.authorsNote = msg.authorsNote;
        if (msg.instructions !== undefined) update.instructions = msg.instructions;
        
        const advBefore = await repo.getAdventure(msg.shortId);
        const hasMemoryChanged = msg.memory !== undefined && (!advBefore || advBefore.memory !== msg.memory);
        const hasActiveLocationChanged = update.activeLocationId !== undefined && (!advBefore || advBefore.activeLocationId !== update.activeLocationId);
        
        await repo.upsertAdventure(update);
        
        if (hasMemoryChanged || hasActiveLocationChanged) {
          broadcastToTabs({ kind: "stateUpdated", shortId: msg.shortId });
        }
        fetchOffMetaRepositoryIfNeeded().catch(() => {});
        return;
      }
      case "actionUpdate": {
        const { upserts, removeIds } = diffActionUpdate(msg.payload);
        
        // Find which actions are actually new before inserting them
        const newActions: CanonicalAction[] = [];
        for (const a of upserts) {
          const existing = await repo.getAction(msg.shortId, a.id);
          if (!existing) {
            newActions.push(a);
          }
        }

        if (upserts.length) await repo.putActions(msg.shortId, upserts);
        for (const id of removeIds) await repo.deleteAction(msg.shortId, id);
        
        await updateRecentActionsCache(msg.shortId);

        // Run lookback auto-update checks on normal gameplay turns (1 to 5 new actions)
        if (newActions.length > 0 && newActions.length <= 5) {
          debouncedGameplayTurnCheck(msg.shortId, newActions);
        }

        // Run proper noun auto-detection if new actions are registered
        if (newActions.length > 0) {
          runProperNounAutoDetection(msg.shortId, newActions).catch((err) => {
            console.error("[AID bg] Failed running proper noun auto detection:", err);
          });
        }
        return;
      }
      case "exportRequest":
        return exportAdventure(repo, msg.shortId);
      case "authToken":
        await rememberAuth({ token: msg.token });
        return;
      case "learnedOp":
        if (msg.endpoint) await rememberAuth({ endpoint: msg.endpoint });
        for (const op of msg.ops) {
          const r = recordOp(op);
          if (r) await repo.putOp(r);
          const vars = op.variables as any;
          if (op.operationName === "UpdateAdventurePlot" && vars?.input?.memory) {
            const shortId = vars.input.shortId;
            const memory = vars.input.memory;
            if (shortId && memory) {
              dlog("[AID bg] Automatically captured memory from UpdateAdventurePlot for shortId:", shortId);
              await repo.upsertAdventure({ shortId, memory });
            }
          }
          if (op.operationName === "UpdateAdventureState") {
            const shortId = vars?.input?.shortId;
            const instructions = vars?.input?.state?.instructions?.custom;
            if (shortId && typeof instructions === "string") {
              dlog("[AID bg] Automatically captured instructions from UpdateAdventureState for shortId:", shortId);
              await repo.upsertAdventure({ shortId, instructions });
            }
          }
        }
        return;
      case "backfillRequest":
        return runBackfill(msg.shortId);
      case "cardsUpdate":
        await repo.putCards(msg.shortId, msg.cards);
        await updateConfigCache(msg.shortId);
        return;
      case "setSettings": {
        const cur = await repo.getSettings();
        await repo.setSettings({ ...cur, ...msg.settings, apiKeys: { ...(cur?.apiKeys ?? {}), ...(msg.settings.apiKeys ?? {}) } } as any);
        if (msg.settings.showDebug !== undefined) debugEnabled = !!msg.settings.showDebug;
        return;
      }
      case "setProtagonist":
        await repo.upsertAdventure({ shortId: msg.shortId, protagonistName: msg.name });
        return;
      case "analyzeRequest":
        return runAnalyze(msg.shortId);
      case "generateCard":
        return runGenerateCard(msg.shortId, msg.cardId);
      case "setVersionStatus":
        await repo.setVersionStatus(msg.id, msg.status);
        if (msg.status === "applied") {
          await applyVersionLocally(msg.id);
          // Auto-push the approved change to AI Dungeon (Story Card or Plot Essentials block).
          // Convert any thrown error into a returned {error} so the panel always toasts a result;
          // on failure the change stays applied locally and the manual "Apply to AID" button in
          // History & Rewrites remains available for retry/rollback.
          try {
            return await runApplyToAid(msg.id);
          } catch (e: any) {
            console.error("[AID bg] auto-push threw:", e);
            return { error: e?.message || String(e) };
          }
        }
        return;
      case "applyToAid":
        return runApplyToAid(msg.id);
      case "listModels": {
        const s = await repo.getSettings();
        const providerName = msg.provider || s?.provider || "claude";
        const key = msg.apiKey !== undefined ? msg.apiKey : s?.apiKeys?.[providerName];
        if (!key && providerName !== "ollama") return { models: [] };
        
        try {
          if (providerName === "openai") {
            return { models: await listOpenAIModels(key || "") };
          } else if (providerName === "gemini") {
            return { models: await listGeminiModels(key || "") };
          } else if (providerName === "ollama") {
            return { models: await listOllamaModels(key || "http://localhost:11434") };
          } else {
            return { models: await listClaudeModels(key || "") };
          }
        } catch (e) {
          console.error(`[AID bg] listModels failed for ${providerName}:`, e);
          return { models: [] };
        }
      }
      case "getState": {
        // Load each store ONCE and reuse (seedBaselines used to re-read all of these).
        const settings = await repo.getSettings();
        debugEnabled = !!settings?.showDebug; // keep verbose logging in sync with the user's setting
        const adv = await repo.getAdventure(msg.shortId);
        // Lazy, best-effort: rewrite a legacy "custom"-typed Configure MemorAID card to the
        // dedicated MemorAID type (write-back to AID + local) on this load. No-op once migrated.
        const cards = await migrateConfigCardType(msg.shortId, await repo.getCards(msg.shortId));
        const actionsCount = await repo.getActionCount(msg.shortId);
        const ops = await repo.getOps();

        const db = await openAidDb();
        const adventures = (await db.getAll("adventures").catch(() => [])).filter(a => !a.hidden);
        const allCards = await db.getAll("cards").catch(() => []);
        const globalAssets = await db.getAll("globalAssets").catch(() => []);

        await updateConfigCache(msg.shortId);
        await updateRecentActionsCache(msg.shortId);

        console.log(`[AID bg] getState - msg.shortId: ${msg.shortId}`);
        console.log(`[AID bg] getState - Total cards in DB: ${cards.length}, Active: ${cards.filter(c => !c.deletedAt).length}`);
        console.log(`[AID bg] getState - Card titles:\n` + cards.map(c => `- ${c.title || c.keys} (${c.type}, deleted: ${!!c.deletedAt})`).join("\n"));
        console.log(`[AID bg] getState - Ops:`, ops.map(o => `${o.operationName}`));
        const gameplayOp = ops.find(o => o.operationName === "GetGameplayAdventure");
        if (gameplayOp) {
          console.log(`[AID bg] GetGameplayAdventure query contains storyCards: ${gameplayOp.query.includes("storyCards")}`);
        } else {
          console.log(`[AID bg] GetGameplayAdventure query NOT LEARNED YET!`);
        }

        // populate roster from local data (no AI); returns the post-seed versions to reuse
        const versions = await seedBaselines(msg.shortId, { adv, cards, actionsCount });
        const versionsDebug = versions.map(v => {
          let card = cards.find(c => c.title && c.title.trim().toLowerCase() === v.characterName.trim().toLowerCase());
          if (!card) {
            card = cards.find(c => {
              const keysList = (c.keys || "").split(/[,;]+/).map(k => k.trim().toLowerCase()).filter(Boolean);
              return keysList.includes(v.characterName.trim().toLowerCase());
            });
          }
          const type = card ? `${card.type} (deleted: ${!!card.deletedAt})` : "no matching card";
          return `- ${v.characterName} (status: ${v.status}, source: ${v.source}, cardType: ${type})`;
        }).join("\n");
        console.log(`[AID bg] getState - Versions in DB:\n` + versionsDebug);

        const cardCounts: Record<string, number> = {};
        for (const c of cards.filter(c => !c.deletedAt)) {
          cardCounts[c.type] = (cardCounts[c.type] || 0) + 1;
        }
        console.log(`[AID bg] getState - Active Card counts by Type:`, JSON.stringify(cardCounts));

        // Group entries by Story Card type; Plot Essentials entries form their own group.
        const cardTypeByName = new Map<string, string>();
        // Pass 1: Map keys and fallback fullKey
        for (const c of cards) {
          const keysList = (c.keys || "").split(/[,;]+/).map(k => k.trim().toLowerCase()).filter(Boolean);
          for (const k of keysList) {
            cardTypeByName.set(k, c.type || "character");
          }
          const fullKey = (c.title || c.keys || "").trim().toLowerCase();
          if (fullKey) {
            cardTypeByName.set(fullKey, c.type || "character");
          }
        }
        // Pass 2: Map titles (takes priority)
        for (const c of cards) {
          if (c.title) {
            cardTypeByName.set(c.title.trim().toLowerCase(), c.type || "character");
          }
        }
        const plotNames = new Set<string>();
        if (adv?.protagonistName) plotNames.add(adv.protagonistName.trim().toLowerCase());
        const plotBlocks = parsePlotEssentials(adv?.memory || "");
        for (const b of plotBlocks) plotNames.add(b.name.trim().toLowerCase());
        const TYPE_LABELS: Record<string, string> = { character: "Characters", class: "Classes", race: "Races", location: "Locations", faction: "Factions" };
        const typeLabelFor = (nm: string): string => {
          const lower = nm.trim().toLowerCase();
          const t = cardTypeByName.get(lower);
          if (t) return TYPE_LABELS[t.toLowerCase()] ?? t;
          if (plotNames.has(lower)) return "Plot Essentials";
          return "Other";
        };

        const versionsByGroup: Record<string, number> = {};
        for (const v of versions) {
          const lbl = typeLabelFor(v.characterName);
          versionsByGroup[lbl] = (versionsByGroup[lbl] || 0) + 1;
        }
        console.log(`[AID bg] getState - Active Versions by Group Label:`, JSON.stringify(versionsByGroup));

        // Dynamically backfill actionCount for older versions in IndexedDB
        const needsBackfill = versions.some((v) => v.actionCount == null);
        let actions: CanonicalAction[] | null = null;
        if (needsBackfill) {
          actions = await repo.getActions(msg.shortId);
          for (const v of versions) {
            if (v.actionCount == null) {
              const oldTurnCount = (v as any).turnCount;
              const count = actions.filter((a) => a.createdAt && a.createdAt <= v.createdAt).length;
              v.actionCount = count > 0 ? count : (oldTurnCount != null ? oldTurnCount : 0);
              await repo.putVersion(v);
            }
          }
        }

        const keyStatus: Record<string, boolean> = {};
        if (settings?.apiKeys) {
          for (const [k, v] of Object.entries(settings.apiKeys)) {
            keyStatus[k] = !!v;
          }
        }

        // The panel only needs action text for actions referenced by native memories (the AID
        // Memories timeline looks up m.actionIds). Send just those instead of the entire action
        // list (which can be thousands of rows) on every refresh.
        const refIds = new Set<string>();
        for (const m of (adv?.memoryBankEntries ?? [])) {
          if (m && typeof m === "object") {
            for (const id of ((m as any).actionIds ?? [])) refIds.add(String(id));
            if ((m as any).lastRelevantActionId) refIds.add(String((m as any).lastRelevantActionId));
          }
        }
        let referencedActions: CanonicalAction[] = [];
        if (refIds.size) {
          if (actions) {
            referencedActions = actions.filter((a) => refIds.has(a.id));
          } else {
            const loaded = await Promise.all(
              Array.from(refIds).map(id => repo.getAction(msg.shortId, id))
            );
            referencedActions = loaded.filter((a): a is CanonicalAction => a !== undefined);
          }
        }

        return {
          cards,
          allCards,
          adventures,
          globalAssets,
          versions,
          settings: settings ? {
            provider: settings.provider,
            model: settings.model,
            keyStatus,
            analyzeWindow: settings.analyzeWindow ?? 20,
            showDebug: !!settings.showDebug,
            theme: settings.theme || "emerald",
            customPromptSection1: settings.customPromptSection1,
            customPromptSection2: settings.customPromptSection2,
            customPromptSection3: settings.customPromptSection3,
            customPromptSection4: settings.customPromptSection4,
            typeGuidance: settings.typeGuidance,
            cardCommands: { ...DEFAULT_CARD_COMMANDS, ...(settings.cardCommands ?? {}) },
            formattingMode: settings.formattingMode || DEFAULT_FORMATTING_MODE,
            useMemories: settings.useMemories,
            memoraidLookback: settings.memoraidLookback,
            memoraidThoughtLookback: settings.memoraidThoughtLookback ?? 1,
            memoraidPresenceLookback: settings.memoraidPresenceLookback,
            autoRegenerateMemoryBankEntry: !!settings.autoRegenerateMemoryBankEntry,
            interceptTimeout: settings.interceptTimeout ?? 10,
            locationMode: settings.locationMode || "optionA",
            enableProperNounDetection: settings.enableProperNounDetection !== false, // opt-out: checked unless explicitly disabled
            manualMode: !!settings.manualMode,
            memoraidBannerDismissed: !!settings.memoraidBannerDismissed,
            characterCardLimit: settings.characterCardLimit ?? 600,
            thoughtCardLimit: settings.thoughtCardLimit ?? 2000,
          } : null,
          protagonist: adv?.protagonistName ?? null,
          scenario: adv?.title ?? null,
          memory: adv?.memory ?? null,
          actionsCount,
          actionCount: actionsCount,
          actions: referencedActions.map(a => ({ id: a.id, text: a.text, type: a.type })),
          lastAnalysisAction: adv?.lastAnalysisAction ?? null,
          memoryBankEntries: adv?.memoryBankEntries ?? null,
          lastAutoUpdatedCard: adv?.lastAutoUpdatedCard ?? null,
          ops: ops.map((o) => ({ operationName: o.operationName, query: o.query, kind: o.kind })),
          activeLocationId: adv?.activeLocationId ?? null,
          locationSuggestions: adv?.locationSuggestions ?? [],
          properNounLogs: adv?.properNounLogs ?? [],
          memoraidTiming: memoraidTimingSnapshot(),
        };
      }
      case "getManagerData": {
        try {
          const db = await openAidDb();
          const adventures = (await db.getAll("adventures") || []).filter(a => !a.hidden);
          const cards = await db.getAll("cards");
          const globalAssets = await db.getAll("globalAssets");
          const settings = await repo.getSettings();

          // Asynchronously trigger verification/fetching of missing/generic titles
          ensureAdventureTitles(adventures).catch((err) => {
            console.error("[AID bg] Error in background ensureAdventureTitles:", err);
          });

          return {
            ok: true,
            adventures: adventures || [],
            cards: cards || [],
            globalAssets: globalAssets || [],
            settings: settings ? {
              theme: settings.theme || "emerald"
            } : {}
          };
        } catch (err: any) {
          return { error: err?.message || String(err) };
        }
      }
      case "hideAdventure": {
        try {
          await repo.hideAdventure(msg.shortId);
          return { ok: true };
        } catch (err: any) {
          return { error: err?.message || String(err) };
        }
      }
      case "deleteAdventure": {
        try {
          await repo.deleteAdventure(msg.shortId);
          return { ok: true };
        } catch (err: any) {
          return { error: err?.message || String(err) };
        }
      }
      case "unhideAdventure": {
        try {
          await repo.unhideAdventure(msg.shortId);
          return { ok: true };
        } catch (err: any) {
          return { error: err?.message || String(err) };
        }
      }
      case "getHiddenAdventures": {
        try {
          const db = await openAidDb();
          const adventures = await db.getAll("adventures");
          const hidden = (adventures || []).filter(a => !!a.hidden);
          return { ok: true, adventures: hidden };
        } catch (err: any) {
          return { error: err?.message || String(err) };
        }
      }
      case "saveGlobalAsset": {
        try {
          await repo.putGlobalAsset(msg.asset);
          return { ok: true };
        } catch (err: any) {
          return { error: err?.message || String(err) };
        }
      }
      case "deleteGlobalAsset": {
        try {
          await repo.deleteGlobalAsset(msg.id);
          return { ok: true };
        } catch (err: any) {
          return { error: err?.message || String(err) };
        }
      }
      case "importGlobalAsset": {
        try {
          const { shortId, assetId } = msg;
          await ensureAuth();
          if (!isSafeEndpoint(gqlEndpoint) || !sessionToken) {
            return { error: "No AI Dungeon GraphQL endpoint or session token observed yet. Please interact with the game first." };
          }
          const endpoint = gqlEndpoint!;
          const token = sessionToken!;
          
          const db = await openAidDb();
          const asset = await db.get("globalAssets", assetId);
          if (!asset) {
            return { error: "Global asset not found." };
          }
          
          if (asset.type === "sc") {
            const createOp = await repo.getOp("SaveQueueStoryCard");
            const createQuery = createOp?.query || DEFAULT_GQL_QUERIES.SaveQueueStoryCard;
            const tempId = Math.floor(Math.random() * 1e9).toString();
            const cardRow: CardRow = {
              id: tempId,
              shortId: shortId,
              type: asset.cardType || (asset.keys ? "character" : "custom"),
              title: asset.title,
              keys: asset.keys || "",
              description: asset.description || "",
              value: asset.value,
            };
            const req = buildCardCreate(endpoint, createQuery, token, cardRow, cardRow.value);
            const res = await fetch(req.url, { method: "POST", headers: req.headers, body: req.body });
            if (!res.ok) {
              return { error: `Creation failed with HTTP ${res.status}` };
            }
            const json = await res.json() as any;
            const returnedCard = json?.[0]?.data?.updateStoryCard?.storyCard ||
                                 json?.[0]?.data?.saveQueueStoryCard?.storyCard ||
                                 json?.[0]?.data?.updateStoryCard ||
                                 json?.[0]?.data?.saveQueueStoryCard;
            const isSuccess = json?.[0]?.data?.updateStoryCard?.success || json?.[0]?.data?.saveQueueStoryCard?.success || returnedCard;
            if (!isSuccess) {
              const msgStr = json?.[0]?.data?.updateStoryCard?.message || json?.[0]?.errors?.[0]?.message || "Mutation failed";
              return { error: `AI Dungeon rejected creation: ${msgStr}` };
            }
            const actualId = returnedCard?.id || tempId;
            const savedCard: CardRow = {
              ...cardRow,
              id: actualId,
            };
            await repo.putCards(shortId, [savedCard]);
            
            broadcastToTabs({
              kind: "approvedCardSync",
              payload: { ok: true, source: "card", cardId: actualId, value: savedCard.value, description: savedCard.description || "", keys: savedCard.keys }
            });
            return { ok: true, message: `Successfully imported Story Card '${asset.title}'.` };
          } else {
            const getAdventureQuery = `
              query GetAdventureDetails($shortId: String) {
                adventure(shortId: $shortId) {
                  id
                  authorsNote
                  memory
                  state {
                    instructions
                    storySummary
                    storyCardStoryInformation
                    storyCardInstructions
                  }
                }
              }
            `;
            const fetchReq = buildGraphQLMutation(endpoint, getAdventureQuery, token, "GetAdventureDetails", { shortId });
            const fetchRes = await fetch(fetchReq.url, { method: "POST", headers: fetchReq.headers, body: fetchReq.body });
            if (!fetchRes.ok) {
              return { error: `Failed to fetch adventure state: HTTP ${fetchRes.status}` };
            }
            const fetchJson = await fetchRes.json() as any;
            const advData = fetchJson?.[0]?.data?.adventure;
            if (!advData) {
              const errMsg = fetchJson?.[0]?.errors?.[0]?.message || "GraphQL query failed";
              return { error: `Failed to fetch adventure state: ${errMsg}` };
            }
            
            const currentAN = advData.authorsNote || "";
            const currentPE = advData.memory || "";
            const currentState = advData.state || {};
            const currentInstructions = currentState.instructions || {};
            const currentAIN = currentInstructions.custom || "";
            
            if (asset.type === "ain") {
              let newAIN = currentAIN.trim();
              if (newAIN.includes(asset.value.trim())) {
                return { ok: true, message: "Instruction already present in AI Instructions." };
              }
              newAIN = newAIN ? `${newAIN}\n${asset.value}` : asset.value;
              
              const op = await repo.getOp("UpdateAdventureState");
              const updateQuery = op?.query || DEFAULT_GQL_QUERIES.UpdateAdventureState;
              const updateReq = buildUpdateAdventureState(
                endpoint,
                updateQuery,
                token,
                shortId,
                newAIN,
                currentState.storySummary || "",
                currentState.storyCardStoryInformation || "",
                currentState.storyCardInstructions || ""
              );
              const updateRes = await fetch(updateReq.url, { method: "POST", headers: updateReq.headers, body: updateReq.body });
              if (!updateRes.ok) {
                return { error: `Failed to save AI Instructions: HTTP ${updateRes.status}` };
              }
              const updateJson = await updateRes.json() as any;
              const returnedAdv = updateJson?.[0]?.data?.updateAdventureState?.adventure || updateJson?.[0]?.data?.updateAdventureState;
              const success = updateJson?.[0]?.data?.updateAdventureState?.success || returnedAdv;
              if (!success) {
                const errMsg = updateJson?.[0]?.data?.updateAdventureState?.message || updateJson?.[0]?.errors?.[0]?.message || "AI Dungeon rejected the update.";
                return { error: `Failed to save AI Instructions: ${errMsg}` };
              }
              await repo.upsertAdventure({ shortId, instructions: newAIN });
              broadcastToTabs({
                kind: "stateUpdated",
                shortId,
                type: "ain",
                text: newAIN,
                previousText: currentAIN
              });
              return { ok: true, message: "Successfully applied instruction to AI Instructions." };
            } else {
              let newAN = currentAN.trim();
              let newPE = currentPE.trim();
              
              if (asset.type === "an") {
                if (newAN.includes(asset.value.trim())) {
                  return { ok: true, message: "Instruction already present in Author's Note." };
                }
                newAN = newAN ? `${newAN}\n${asset.value}` : asset.value;
              } else {
                let blockText = asset.value.trim();
                if (!blockText.includes(asset.title)) {
                  blockText = `${asset.title} is ${blockText}`;
                }
                if (!blockText.startsWith("[") && !blockText.startsWith("{")) {
                  blockText = `[${blockText}]`;
                }
                if (newPE.includes(blockText)) {
                  return { ok: true, message: "Character Description already present in Plot Essentials." };
                }
                newPE = newPE ? `${newPE}\n${blockText}` : blockText;
              }
              
              const op = await repo.getOp("UpdateAdventurePlot");
              const updateQuery = op?.query || DEFAULT_GQL_QUERIES.UpdateAdventurePlot;
              const updateReq = buildMemorySave(endpoint, updateQuery, token, shortId, newPE, newAN);
              const updateRes = await fetch(updateReq.url, { method: "POST", headers: updateReq.headers, body: updateReq.body });
              if (!updateRes.ok) {
                return { error: `Failed to save update: HTTP ${updateRes.status}` };
              }
              const updateJson = await updateRes.json() as any;
              const returnedAdv = updateJson?.[0]?.data?.updateAdventurePlot?.adventure || updateJson?.[0]?.data?.updateAdventurePlot;
              const success = updateJson?.[0]?.data?.updateAdventurePlot?.success || returnedAdv;
              if (!success) {
                const errMsg = updateJson?.[0]?.data?.updateAdventurePlot?.message || updateJson?.[0]?.errors?.[0]?.message || "AI Dungeon rejected the update.";
                return { error: `Failed to save update: ${errMsg}` };
              }
              await repo.upsertAdventure({ shortId, memory: newPE });
              broadcastToTabs({
                kind: "stateUpdated",
                shortId,
                type: asset.type,
                text: asset.type === "an" ? newAN : newPE,
                previousText: asset.type === "an" ? currentAN : currentPE
              });
              return { ok: true, message: `Successfully applied to ${asset.type === "an" ? "Author's Note" : "Plot Essentials"}.` };
            }
          }
        } catch (err: any) {
          return { error: err?.message || String(err) };
        }
      }
      case "saveCardValue": {
        await ensureAuth();
        if (!sessionToken || !isSafeEndpoint(gqlEndpoint)) {
          return { error: "No session token yet — interact with the page once, then retry." };
        }
        const updateOp = await repo.getOp("UseAutoSaveStoryCard");
        const updateQuery = updateOp?.query || DEFAULT_GQL_QUERIES.UseAutoSaveStoryCard;
        try {
          const cards = await repo.getCards(msg.shortId);
          const card = cards.find(c => c.id === msg.cardId);
          if (!card) {
            return { error: "Card not found in local database." };
          }
          const updatedCard = { ...card, value: msg.value };
          const req = buildCardSave(gqlEndpoint!, updateQuery, sessionToken!, updatedCard, msg.value);
          const res = await fetch(req.url, { method: "POST", headers: req.headers, body: req.body });
          if (!res.ok) {
            return { error: `Save failed with HTTP ${res.status}` };
          }
          const json = await res.json() as any;
          const returnedCard = json?.[0]?.data?.updateStoryCard?.storyCard ||
                               json?.[0]?.data?.updateStoryCard;
          const isSuccess = json?.[0]?.data?.updateStoryCard?.success || returnedCard;
          if (!isSuccess) {
            const msgStr = json?.[0]?.data?.updateStoryCard?.message || json?.[0]?.errors?.[0]?.message || "Mutation failed";
            return { error: `AI Dungeon rejected save: ${msgStr}` };
          }
          await repo.putCards(msg.shortId, [updatedCard]);

          // Broadcast update
          broadcastToTabs({
            kind: "approvedCardSync",
            payload: { ok: true, source: "card", cardId: msg.cardId, value: msg.value, description: updatedCard.description || "" }
          });
          return { ok: true };
        } catch (err: any) {
          return { error: err?.message || String(err) };
        }
      }
      case "exportAll": {
        try {
          const data = await repo.exportAll();
          return { ok: true, data };
        } catch (err: any) {
          return { error: err?.message || String(err) };
        }
      }
      case "importAll": {
        try {
          const res = await repo.importAll(msg.data);
          return res;
        } catch (err: any) {
          return { error: err?.message || String(err) };
        }
      }
      case "isDbEmpty": {
        try {
          const empty = await repo.isDbEmpty();
          return { ok: true, empty };
        } catch (err: any) {
          return { error: err?.message || String(err) };
        }
      }
    }
  } catch (e) {
    console.error("[AID bg]", msg.kind, e);
    throw e;
  }
}
