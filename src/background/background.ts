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
// Shared background infra used by the ported feature modules (bg-life/bg-crystallized/bg-npc-memory/
// bg-memoraid/bg-scene). Its `auth` is kept in sync with this module's learned token below so the
// feature modules can make AID card save/delete calls.
import { auth as infraAuth, setDebugEnabled as setInfraDebug } from "./bg-infra";
import { cachedRecentActions, updateRecentActionsCache, cachedSceneText, getSceneText } from "./bg-scene";
// Ported feature engines. Each self-gates on its enable flag (Crystallized/Living Characters default
// OFF for this build), so calling them on the turn-check path is a no-op until the user opts in.
import { checkCrystallizedUpdates, refreshSceneAwareCrystallized, runCrystallizedDistillationManual, saveCrystallizedState, invalidateSceneCastGate } from "./bg-crystallized";
import { checkLifeCardUpdates, archiveLifeCard, tryNativeCardDelete } from "./bg-life";
import { parseCrystallized, parseLlmOutput, dedupeSchema, formatSubjectLabel, buildConsolidateCommand, applyManualPreferences, reconcileOutlook, reconcilePreferences, findCrystallizedCard, type OutlookBelief } from "../inference/crystallized";
import { coercePending, formatLivingCharactersDirective, shouldFireLcOnAction, planInjection, filterLiveDirectives, pressureKey, type PendingInjection, type SeededPair } from "../inference/injection";
import { addUserDeletedCards, removeUserDeletedTitles, isAutoCardTitle } from "../inference/deleted-cards";
import { setLifeCardStatusValue, parseLifeCardEntry } from "../inference/living-characters";
import { generateCard } from "../inference/native";
import { snapshotOutlookForIncorporation, extractFieldBlock, spliceField, buildBoundedRevisionCommand, OUTLOOK_INCORPORATION_INSTRUCTION, clearIncorporatedOutlook, hasEstablishedAppearance, existingKeyPairLine, buildCoreCardCommand, buildCoreAppearanceCommand, assembleCoreCard, extractBehavioralBlock, extractCarriedTopLevelFields, buildAppearanceBlock } from "../inference/core-character";
import { resolveGender, buildPhenotypeInputs, rerollPhenotype } from "../inference/phenotype";
import { extractBlockTags } from "../inference/npc-memory-bank";
import { checkMemorAIDUpdates, selfHealMemoraidEntries, __resetMemoraidStateForTests } from "./bg-memoraid";
export { checkMemorAIDUpdates, selfHealMemoraidEntries, __resetMemoraidStateForTests };
import { presentNpcSourcesForBlock, storeNpcBlockFromPov, generateNpcBlock, backfillNpcMemories, regenerateNpcMemoryBlock, generateNpcBlocksForNewNativeBlock } from "./bg-npc-memory";
import { registerCandidate, updatePendingEvidence, readyToPromote, prunePending, PN_CONNECTORS, isContractionToken, isElisionToken, multiwordDisqualified, trimJunkEdgeWords } from "../inference/proper-nouns";
import type { PendingProperNoun } from "../shared/types";


const repo = new Repo();
// One-time security cleanup: earlier builds mirrored the bearer token to storage.local (disk).
// Auth now lives only in memory + storage.session, so scrub any token a prior build left on disk.
try { (browser.storage as any).local?.remove?.(["aidToken", "aidEndpoint"]); } catch {}
let sessionToken: string | null = null;       // in-memory only; never persisted to disk
let gqlEndpoint: string | null = null;        // learned AID GraphQL endpoint

const cachedImportantCharacters = new Map<string, string[]>();

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
    "transitions", "climax", "continuation",

    // Demonyms / languages / nationalities — proper ADJECTIVES, not entities (biggest live false-positive
    // source; "French" alone fired 100+ times). Kept as an explicit list because compromise unreliably
    // tags these as #ProperNoun even lowercased, defeating the POS filter below.
    "french", "english", "spanish", "italian", "german", "greek", "russian", "chinese", "japanese",
    "korean", "dutch", "portuguese", "brazilian", "mexican", "canadian", "american", "british", "irish",
    "scottish", "welsh", "jamaican", "basque", "afrikaans", "gallic", "bostonian", "frenchwoman",
    "european", "asian", "african", "arab", "arabic", "latin", "roman", "nordic", "slavic", "indian",
    "thai", "vietnamese", "filipino", "turkish", "polish", "swedish", "norwegian", "danish", "finnish",
    "hungarian", "czech", "austrian", "swiss", "belgian", "australian", "egyptian", "persian", "hebrew",
    // Period / style adjectives that read as proper nouns
    "gothic", "renaissance", "baroque", "victorian", "medieval", "olympic", "cartesian",

    // Sentence-initial discourse markers / interjections (capitalized at sentence start, not names).
    "almost", "exactly", "seems", "since", "sorry", "thanks", "totally", "unless", "howdy", "complicated",
    "certainly", "especially", "despite", "except", "enough", "alright", "goodnight", "describe", "discuss",
    "dismissed", "besides", "seriously", "obviously", "apparently", "literally", "frankly", "regardless", "luckily",
    "nonetheless", "furthermore", "moreover", "anyway", "anyhow", "indeed", "absolutely", "definitely",
    "probably", "possibly", "hopefully", "thankfully", "unfortunately", "fortunately", "admittedly",
    "whatever", "somehow", "anyways", "okay", "alrighty", "welp", "yikes", "oops", "ouch", "ugh", "huh",

    // French loanwords / interjections that surface capitalized
    "cela", "dieu", "reine", "c'est", "mon dieu", "voila", "voilà",

    // Generic descriptive nicknames (keep distinctive story epithets; suppress generic placeholders)
    "big guy", "big man", "big boy", "tall guy", "little guy", "pretty girl", "pink one", "man of mystery"
  ]);

  const knownLower = new Set(knownNames.map(n => n.toLowerCase().trim()));
  // Individual WORDS of known names — a multiword candidate whose every word is already known is
  // nothing new ("Veya French" after the demonym trim is just "Veya").
  const knownWordSet = new Set<string>();
  for (const n of knownNames) for (const w of n.toLowerCase().split(/\s+/)) if (w) knownWordSet.add(w);
  // Per-word junk tests for the multiword edge-trim (see trimJunkEdgeWords). Both edges: lowercase
  // non-connector words, contraction/elision shells, demonyms. LEADING edge only: ignore-listed
  // words ("Seems Juniper" → "Juniper", "Luckily Vegas" → "Vegas" — recovering the name the old
  // firstWord check used to drop wholesale). The ignore list must NOT apply to the trailing edge —
  // it is full of noun-verb homographs that are name material there ("Obsidian Keep", the list has
  // "keep"). No POS-based junk at all: compromise reads "building" as a gerund #Verb, which would
  // mangle "Building J".
  const isJunkWord = (w: string): boolean => {
    const lw = w.toLowerCase();
    if (PN_CONNECTORS.has(lw)) return false;
    if (/^[a-z]/.test(w)) return true;
    if (isContractionToken(w) || isElisionToken(w)) return true;
    return nlp(lw).match('#Demonym').found;
  };
  const isLeadJunkWord = (w: string): boolean => {
    const lw = w.toLowerCase();
    return !PN_CONNECTORS.has(lw) && ignoreList.has(lw);
  };
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

      // --- NLP hardening gates (stateless; src/inference/proper-nouns.ts) ---
      // G3: contraction/elision shells ("We've", "Didn't", "J'aime") are never names.
      if (words.length === 1 && (isContractionToken(cleanedPart) || isElisionToken(cleanedPart))) continue;
      if (words.length > 1) {
        // Edge-trim junk glued onto a real name ("Luckily Vegas" → "Vegas", "Chad sneers" → "Chad",
        // "Veya French" → "Veya"); an all-junk phrase trims to nothing.
        const trimmed = trimJunkEdgeWords(cleanedPart, isJunkWord, isLeadJunkWord);
        if (!trimmed) continue;
        if (trimmed !== cleanedPart) {
          cleanedPart = trimmed;
          words = cleanedPart.split(/\s+/);
          if (words.length === 1 && (isContractionToken(cleanedPart) || isElisionToken(cleanedPart))) continue;
        }
        // G2: interior lowercase/contraction words = NLP span over-extension ("Lyon without").
        if (words.length > 1 && multiwordDisqualified(cleanedPart)) continue;
        // Every remaining word already known → nothing new to suggest.
        if (words.length > 1 && words.every(w => PN_CONNECTORS.has(w.toLowerCase()) || knownWordSet.has(w.toLowerCase()))) continue;
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
        // Demonyms/nationalities are proper ADJECTIVES, not entities — drop them even when compromise
        // (unreliably) tags them #ProperNoun, which would otherwise bypass the POS filter below.
        if (docLower.match('#Demonym').found) continue;
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

  // Deduplicate and filter out substrings
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
    // Non-English / additional honorifics so title-prefixed variants dedup onto an existing card
    // (e.g. "Mademoiselle Vallois" / "Monsieur Vallois" → "Vallois"). Proper-noun hardening spec §Dedup.
    "monsieur", "madame", "mademoiselle", "miss", "señor", "senor", "herr", "frau",
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

  // Plot Essentials entities — the always-in-context character/entity block, including the player's own
  // epithets (e.g. "The Beast") that live in the description rather than on a card — are already known
  // and must never be re-flagged as new proper nouns. Add each block's name, then extract any proper
  // nouns embedded in the PE descriptions so aliases/epithets are suppressed too.
  const peBlocks = parsePlotEssentials(adv.memory);
  for (const b of peBlocks) {
    if (b.name) existingNames.push(b.name);
  }
  for (const pn of detectProperNouns(adv.memory || "", existingNames, [])) {
    existingNames.push(pn);
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

  // Evidence pool (G1/G5 gates, src/inference/proper-nouns.ts): a fresh candidate WAITS here until
  // it has ≥2 distinct-action mentions — and, for single words, one MID-SENTENCE capitalized
  // sighting (a capital explained only by sentence/dialogue position is not name evidence) — then
  // promotes to a real suggestion. Deferred, not dropped: junk that never re-occurs ages out.
  const pending: Record<string, PendingProperNoun> = adv.properNounPending || {};
  let pendingChanged = false;
  // Known-name WORDS: excluded from a multiword candidate's G5 mention credit, so "Smoke Girlfriend"
  // isn't kept alive by the protagonist's ubiquitous "Smoke".
  const knownWords = new Set<string>();
  for (const n of existingNames) for (const w of n.toLowerCase().split(/\s+/)) if (w) knownWords.add(w);
  const isKnownWord = (w: string) => knownWords.has(w.toLowerCase());

  // Ungated decision trail — detection was previously silent, making "X didn't fire" undiagnosable.
  const decisions: string[] = [];

  for (const action of actionsToScan) {
    if (!action.text) continue;
    const now = new Date().toISOString();

    // 1. Accrue evidence for candidates already waiting in the pool.
    if (updatePendingEvidence(pending, action.id, action.text, now, isKnownWord)) pendingChanged = true;

    // 2. Fresh detection → the pool (never straight to a suggestion).
    const candidates = detectProperNouns(action.text, existingNames, globalLexiconNames);
    if (candidates.length) decisions.push(`[${action.id}] candidates=[${candidates.join(", ")}]`);

    for (const noun of candidates) {
      // Perform strict algorithmic alias checking on each candidate noun against our resolved entities
      const aliasOf = existingNames.find(existing => isAliasMatch(noun, existing));
      if (aliasOf) {
        decisions.push(`  "${noun}": skipped (alias of "${aliasOf}")`);
        continue;
      }
      registerCandidate(pending, noun, action.id, action.text, now);
      pendingChanged = true;
      decisions.push(`  "${noun}": pending (evidence gate)`);
    }

    // 3. Promote entries whose evidence is now complete; the promoting action supplies the
    //    suggestion's context so the UI shows the freshest mention.
    for (const [key, entry] of Object.entries(pending)) {
      if (!readyToPromote(entry)) continue;
      decisions.push(`  "${entry.noun}": SUGGESTED (mentions=${entry.mentionActionIds.length})`);
      suggestions.push({
        properNoun: entry.noun,
        actionId: action.id,
        actionText: action.text,
        timestamp: now,
        status: "pending"
      });
      existingNames.push(entry.noun);
      for (const w of entry.noun.toLowerCase().split(/\s+/)) if (w) knownWords.add(w);
      delete pending[key];
      pendingChanged = true;
      updated = true;
    }
  }

  const beforePrune = Object.keys(pending).length;
  prunePending(pending);
  if (Object.keys(pending).length !== beforePrune) pendingChanged = true;

  console.info(
    `[AID bg] Proper-noun detection scanned ${actionsToScan.length} action(s): ` +
    (decisions.length ? decisions.join(" ") : "(no candidates)")
  );

  if (updated || pendingChanged) {
    await repo.upsertAdventure({
      shortId,
      locationSuggestions: suggestions,
      properNounPending: pending
    });
    if (updated) broadcastToTabs({ kind: "stateUpdated", shortId });
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

    // Bridge to the ported feature engines (MemorAID, Crystallized, NPC memory bank), which read
    // their source roster from `adv.memoraidCharacters`. Keep it in sync with the Configure MemorAID
    // card so those features track the same important-character list the user already maintains.
    try {
      const adv = await repo.getAdventure(shortId);
      if (adv) {
        const cur = adv.memoraidCharacters || [];
        const same = cur.length === importantNames.length && cur.every((n, i) => n === importantNames[i]);
        if (!same) {
          adv.memoraidCharacters = importantNames;
          await repo.upsertAdventure(adv);
        }
      }
    } catch (err) {
      dlog("[AID bg] Failed to mirror important characters to adv.memoraidCharacters:", err);
    }
  } catch (err) {
    console.error("[AID bg] Failed to update config cache:", err);
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
  if (opts.token) { sessionToken = opts.token; patch.aidToken = opts.token; infraAuth.sessionToken = opts.token; }
  if (opts.endpoint) { gqlEndpoint = opts.endpoint; patch.aidEndpoint = opts.endpoint; infraAuth.gqlEndpoint = opts.endpoint; }
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
  // Mirror into the shared infra so the ported feature modules see the same session.
  infraAuth.sessionToken = sessionToken;
  infraAuth.gqlEndpoint = gqlEndpoint;
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
  if (backfillCardIds) {
    await repo.reconcileDeletedCards(shortId, backfillCardIds);
    // Purge stale soft-deleted mirror rows that duplicate a live card under a different id (roster
    // active-wins Fix 2, phenotype-reroll-and-roster-dedup spec §B.3). Otherwise a dead duplicate row
    // can mask a live character in the roster or trip title-based lookups.
    const liveCards = (await repo.getCards(shortId)).filter((c) => !c.deletedAt);
    await repo.purgeStaleDeletedDuplicates(shortId, liveCards.map((c) => ({ id: c.id, title: c.title, type: c.type })));
  }
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

/** Cue text for phenotype extraction: the card value plus recent action texts where the character's
 *  name or a ≥3-char trigger key appears (the presence-scan pattern from gather.ts). Capped so it
 *  stays a small grounding snippet. */
export function gatherCharacterCueText(cardValue: string, actions: { text?: string }[], name: string, keys: string): string {
  const needles = [name, ...(keys || "").split(/[,;]+/)]
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length >= 3);
  const recent = (actions || []).slice(-40);
  const hits: string[] = [];
  for (const a of recent) {
    const t = (a?.text || "").trim();
    if (!t) continue;
    const lower = t.toLowerCase();
    if (needles.some((n) => lower.includes(n))) hits.push(t);
  }
  return `${String(cardValue || "").trim()}\n${hits.join("\n")}`.trim().slice(0, 2000);
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
  cardId: string,
  templateOverride?: string
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
  // templateOverride (e.g. the panel's Compact button → "backgroundCharacter") forces a single lean
  // generation with that specific command instead of the multi-pass character schema below.
  const template = templateOverride
    ? (settings?.cardCommands?.[templateOverride] || DEFAULT_CARD_COMMANDS[templateOverride] || "")
    : ((settings?.cardCommands?.[typeKey] || (isMemoraid ? (settings?.cardCommands?.memoraid || DEFAULT_CARD_COMMANDS.memoraid) : defaultCommandForType(card.type))) || "");
  if (!hasTitleToken(template)) {
    return { error: "This card-type command is missing the required {{title}} token (AID needs it). Fix it in Settings → Prompts." };
  }
  const command = resolveCommand(template, protagonist);
  const formattingMode = settings?.formattingMode || DEFAULT_FORMATTING_MODE;

  const opts: { storyInformation?: string } = {};
  let baseContext = "";
  // Core Character (spec §5) generation inputs, computed in the character context block below and
  // consumed by the folded-generation branch: the phenotype frame, the clobber-resilient source value
  // the card is regenerated from, and the preserved (reverse-seeded) Appearance prose when we keep it.
  let coreCharPh: ReturnType<typeof buildPhenotypeInputs> | null = null;
  let coreCharSourceValue = "";
  let coreCharPreservedAppearance = "";
  // Outlook consolidation (scene-aware-crystallized §7): a Crystallize-enabled character's settled
  // Outlook beliefs are woven into this generated card and cleared+archived after the pending version
  // is created. Captured in the character context block below when applicable.
  let coreCharOutlook: { key: string; snapshot: OutlookBelief[] } | null = null;

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

    // Crystallized (distilled durable memory) also informs character generation (crystallized-rework §8).
    // Guarantee the Outlook layer reaches generation: read it from the IndexedDB state and LEAD with it,
    // then fill with the rendered Knows/Vivid grounding (rendered card's trailing Outlook section stripped
    // to avoid duplication — the rendered value orders Knows→Vivid→Outlook, so a naive slice truncates it).
    const cryChKeyGen = (card.title || "").trim().toLowerCase();
    const cryStateGen = await repo.getCrystallizedState(shortId, cryChKeyGen);
    const outlookLinesGen = (cryStateGen?.outlook || []).map((b) => `- ${b.text}`).join("\n");
    const crystCardGen = findCrystallizedCard(cards, card.title || "");
    const renderedFullGen = crystCardGen?.value?.trim() || "";
    const outlookMarkerIdxGen = renderedFullGen.search(/(^|\n)\s*Outlook\s*:/i);
    const groundingGen = (outlookMarkerIdxGen >= 0 ? renderedFullGen.slice(0, outlookMarkerIdxGen) : renderedFullGen).trim();
    if (outlookLinesGen || groundingGen) {
      let cblock = `${card.title}'s crystallized memories:\n`;
      if (outlookLinesGen) cblock += `Current self-beliefs (Outlook):\n${outlookLinesGen}\n\n`;
      if (groundingGen) cblock += groundingGen.slice(0, 1200);
      baseContext += `${cblock.trim()}\n\n`;
    }

    // Core Character (spec §5/§6): resolve a clobber-resilient source value, then sample (or re-inject)
    // the phenotype body frame. The result grounds the folded Appearance generation and supplies the
    // local key-pair/quirks splice below; skipped for a compact (templateOverride) Side Character.
    if (!templateOverride) {
      try {
        // Clobber-resilient source: a prior unrestored generation could have left card.value holding
        // only raw behavioral output (no Name/Appearance). If so, fall back to the newest version row
        // that DOES have labeled structure, preferring a sane (non-behavioral-echo) Appearance.
        let sourceValue = card.value || "";
        if (extractFieldBlock(sourceValue, "Appearance") === null && extractFieldBlock(sourceValue, "Name") === null) {
          const versions = await repo.getVersions(shortId);
          const behavioralLabelRe = /(?:^|\n)\s*[-*•]?\s*(Background|Personality|Conversational Style|Voice|Drive)\s*:/i;
          const candidates = versions
            .filter((v) => v.cardId === card.id)
            .sort((a, b) => {
              const aNonPending = a.status !== "pending" ? 1 : 0;
              const bNonPending = b.status !== "pending" ? 1 : 0;
              if (aNonPending !== bNonPending) return bNonPending - aNonPending; // non-pending first
              return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0; // newest first
            });
          const hasSaneAppearance = (v: any) => {
            const block = extractFieldBlock(v.entry, "Appearance");
            return block !== null && !behavioralLabelRe.test(block);
          };
          const fallbackVersion = candidates.find(hasSaneAppearance) ?? candidates.find((v: any) => extractFieldBlock(v.entry, "Name") !== null);
          if (fallbackVersion) sourceValue = fallbackVersion.entry;
        }

        const characterKey = (card.title || "").trim().toLowerCase();
        const recentActs = await repo.getActions(shortId);
        const cueText = gatherCharacterCueText(sourceValue, recentActs, card.title || "", card.keys || "");
        const gender = resolveGender(sourceValue, cueText, card.title || "");
        const population: "western" | "global" = settings?.phenotypePopulation === "global" ? "global" : "western";
        const existingRecord = await repo.getPhenotype(shortId, characterKey);
        const ph = buildPhenotypeInputs({
          shortId, characterKey, name: card.title || card.keys || "Unknown",
          gender, population, cueText, existingRecord: existingRecord ?? null,
          hasEstablishedAppearance: hasEstablishedAppearance(sourceValue),
          existingKeyPairLine: existingKeyPairLine(sourceValue),
        });
        await repo.putPhenotype(ph.record);
        coreCharPh = ph;
        coreCharSourceValue = sourceValue;
        coreCharPreservedAppearance = ph.rewriteAppearance ? "" : buildAppearanceBlock(sourceValue);
      } catch (err) {
        dlog("[AID bg] phenotype appearance step failed (non-fatal):", err);
      }

      // Outlook consolidation (scene-aware-crystallized §7): for a Crystallize-enabled tracked character,
      // snapshot the settled Outlook beliefs, inject them + the incorporation instruction so the generated
      // Personality/Voice weaves them in, and mark them for clear+archive after the pending version lands.
      try {
        const cryChKey = (card.title || "").trim().toLowerCase();
        const importantNamesForGen = (adv?.memoraidCharacters || []).map((n) => n.trim().toLowerCase()).filter(Boolean);
        if (settings?.enableCrystallized && importantNamesForGen.includes(cryChKey)) {
          const cryState = await repo.getCrystallizedState(shortId, cryChKey);
          const snapshot = cryState ? snapshotOutlookForIncorporation(cryState, 2) : [];
          if (snapshot.length > 0) {
            // Beliefs are already injected by the Crystallized-context block above ("Current self-beliefs
            // (Outlook)"); here we only add the instruction to weave them in, and mark them for clear+archive.
            coreCharOutlook = { key: cryChKey, snapshot };
            baseContext += `${OUTLOOK_INCORPORATION_INSTRUCTION.trim().replace(/\{\{title\}\}/g, card.title || "this character")}\n\n`;
          }
        }
      } catch (err) {
        dlog("[AID bg] outlook consolidation snapshot failed (non-fatal):", err);
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

  const isCoreCharacter = normalizeType(card.type) === "character" && !isMemoraid && !templateOverride;
  let entry = "";
  if (isCoreCharacter) {
    // Core Character generation (spec §5): phenotype-grounded Appearance + the interior compass
    // (Background / Personality / Conversational Style / Voice / Drive). BYO providers have no ~900-char
    // output cap, so the whole profile is produced in ONE folded CORE_CARD_TEMPLATE call; the
    // local Appearance / key-pair / quirks are then spliced in by assembleCoreCard. `coreCharPh` may be
    // null only if phenotype sampling threw (logged) — degrade to no guidance, still emitting the format.
    const ph = coreCharPh;
    dlog(`[AID bg] Running Core Character generation for ${card.title} (provenance=${ph?.record.provenance ?? "none"}, rewrite=${ph?.rewriteAppearance ?? false}) using ${providerName}...`);
    const foldedTemplate = buildCoreCardCommand().replace("{appearanceGuidance}", ph?.appearanceGuidance || "");
    const foldedCommand = resolveTitleToken(resolveCommand(foldedTemplate, protagonist), name);
    const system =
      `You are a creative writing assistant generating a character card for the target character "${name}". ` +
      `Write in third person about "${name}"; never confuse them with the protagonist ("${protagonist}") or other characters in the context. ` +
      `Follow the field format and instructions EXACTLY, and output only the labeled lines and nothing else.`;
    const user = `Narrative Context:\n${opts.storyInformation || "No narrative context."}\n\nInstructions:\n${foldedCommand}`;
    const folded = cleanLlmResponse(await provider.complete(system, user)).trim().replace(/^\[+/, "").replace(/\]+$/, "").trim();
    // Rewrite path: use the generated Appearance (fallback to the descriptor phrase / preserved prose).
    // Preserve path: keep the authored appearance and discard the generated one.
    const appearanceBlock = ph?.rewriteAppearance
      ? (extractFieldBlock(folded, "Appearance") || ph?.record.descriptorPhrase || coreCharPreservedAppearance || "")
      : (coreCharPreservedAppearance || extractFieldBlock(folded, "Appearance") || "");
    const behavioral = extractBehavioralBlock(folded);
    const carryFields = extractCarriedTopLevelFields(coreCharSourceValue || card.value || "");
    entry = assembleCoreCard({
      name, appearanceBlock, behavioral, carryFields,
      keyPairLine: ph?.keyPairLine, quirks: ph?.quirks,
    });
    dlog(`[AID bg] Core Character generation complete for ${card.title}. Total length: ${entry.length}`);
  } else {
    // Side Character (templateOverride), locations, custom/faction, and MemorAID (Memory) cards: a
    // single templated provider call with the resolved card-type command.
    const finalCommand = resolveTitleToken(command, name);
    const system = `You are a creative writing assistant updating a card for ${name}. Follow the format and instructions exactly. ` +
      `CRITICAL LENGTH CONSTRAINT: Keep descriptions highly concise, dense, and condensed. Limit each field value strictly to 1-2 short, focused sentences (maximum 30 words per field). Avoid verbose, flowery, or redundant phrasing.` +
      `\nCRITICAL: The entire generated card entry must be strictly under ${characterCardLimit} characters in length.`;
    const user = `Narrative Context:\n${opts.storyInformation || "No narrative context."}\n\nInstructions:\n${finalCommand}`;
    entry = cleanLlmResponse(await provider.complete(system, user));
  }

  if (!isMemoraid) {
    entry = applyFormattingMode(entry, formattingMode);
  }

  // The Core Character card is intentionally rich (spec §4.2, whole card ~2,000 chars); the 600-char
  // characterCardLimit is the Side-Character/compact budget and would butcher it. Cap Core Characters at
  // a generous ceiling instead, well under AID's ~4,000-char EditMemory limit.
  const CORE_CHARACTER_CHAR_CAP = 2400;
  const effectiveCardLimit = isCoreCharacter ? CORE_CHARACTER_CHAR_CAP : characterCardLimit;
  if (!isMemoraid && entry.length > effectiveCardLimit) {
    if (entry.startsWith("[") && entry.endsWith("]")) {
      entry = entry.slice(0, effectiveCardLimit - 2).trimEnd() + "\n]";
    } else {
      entry = entry.slice(0, effectiveCardLimit);
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

  // The snapshot beliefs were woven into this generated card — clear them from Crystallized (archived
  // first, reason "incorporated"; they re-accumulate via distillation). Scene-aware-crystallized §7.
  if (coreCharOutlook) {
    await consolidateOutlookState(shortId, coreCharOutlook.key, coreCharOutlook.snapshot, totalActionsCount);
  }
  return { id, characterName: name, changeSummary: `${providerName.toUpperCase()}-generated update (Action #${totalActionsCount})`, entry };
}

/** Re-roll a character's sampled body (phenotype), regenerate the Appearance prose from the new frame,
 *  and re-splice the new BWH/SWH key-pair line + merged Quirks — carrying Scent and the behavioral block
 *  verbatim — as a pending proposal. `phenotypeRollback` snapshots the prior record so rejecting the
 *  proposal restores it. */
async function runRerollAppearance(shortId: string, cardId: string): Promise<{ id?: string; characterName?: string; changeSummary?: string; entry?: string; error?: string }> {
  const cards = await repo.getCards(shortId);
  const card = cards.find((c) => c.id === cardId && !c.deletedAt);
  if (!card) return { error: "Story Card not found locally — try Backfill." };
  const characterKey = (card.title || "").trim().toLowerCase();
  const rec = await repo.getPhenotype(shortId, characterKey);
  if (!rec) return { error: "No sampled body to re-roll — generate this character first." };
  const rr = rerollPhenotype(rec);
  if (!rr) return { error: "No sampled body to re-roll — this character is non-human or ungendered." };
  await repo.putPhenotype(rr.record);

  const providerOrError = await getActiveProvider();
  if ("error" in providerOrError) return { error: providerOrError.error };
  const provider = providerOrError;
  const settings = await repo.getSettings();
  const adv = await repo.getAdventure(shortId);
  const protagonist = (adv?.protagonistName && adv.protagonistName.trim()) || parseProtagonistName(adv?.memory) || "the player character";
  const sourceValue = card.value || "";

  // PASS 1 (physical): regenerate Appearance + Scent from the re-rolled phenotype frame via the
  // provider seam.
  const appearanceCommand = resolveTitleToken(resolveCommand(buildCoreAppearanceCommand().replace("{appearanceGuidance}", rr.appearanceGuidance), protagonist), card.title || "");
  const system = `You are a creative writing assistant generating the physical description for "${card.title}". Write in third person about "${card.title}"; output ONLY the Appearance and Scent labeled lines and nothing else.`;
  const user = `Instructions:\n${appearanceCommand}`;
  let physicalRaw = "";
  try {
    physicalRaw = cleanLlmResponse(await provider.complete(system, user));
  } catch (err: any) {
    return { error: `Provider generation failed: ${err?.message || err}` };
  }
  const physical = `[\n${physicalRaw.trim().replace(/^\[+/, "").replace(/\]+$/, "").trim()}\n]`;
  const appearanceBlock = extractFieldBlock(physical, "Appearance") || rr.record.descriptorPhrase || "";
  const scentBlock = extractFieldBlock(physical, "Scent");

  // Carry the EXISTING behavioral fields verbatim — a re-roll changes the body, not who they are.
  const behavioralFields = ["Background", "Personality", "Conversational Style", "Voice", "Drive"]
    .map((f) => { const b = extractFieldBlock(sourceValue, f); return b ? `${f}: ${b}` : null; })
    .filter(Boolean).join("\n");
  const behavioral = scentBlock ? `Scent: ${scentBlock}\n${behavioralFields}` : behavioralFields;
  const carryFields = extractCarriedTopLevelFields(sourceValue);
  const entry = assembleCoreCard({
    name: card.title || card.keys || "Unknown",
    appearanceBlock, carryFields, keyPairLine: rr.keyPairLine, quirks: rr.quirks, behavioral,
  });

  const name = card.title || card.keys;
  const totalActionsCount = await repo.getActionCount(shortId);
  const id = crypto.randomUUID();
  await repo.putVersion({
    id, shortId, characterName: name, entry, changeSummary: `Body re-roll (Action #${totalActionsCount})`,
    source: "card", status: "pending", createdAt: new Date().toISOString(), actionCount: totalActionsCount,
    cardId: card.id, cardType: card.type || "character",
    // The new body was persisted above; snapshot the PRIOR record so rejecting this proposal restores it.
    phenotypeRollback: rec,
  } as any);
  return { id, characterName: name, changeSummary: `Body re-roll (Action #${totalActionsCount})`, entry };
}

export async function checkLookbackAutoUpdates(
  shortId: string,
  newActions: any[]
): Promise<void> {
  const settings = await repo.getSettings();
  // Automatic Story Card update proposals are OPT-IN (the "Enable Automatic Updates" toggle, default
  // OFF). Previously gated on the legacy negative-polarity `manualMode` (default off → ran anyway),
  // which ignored the toggle and generated proposals even when the user had left it unchecked.
  if (!settings?.enableAutomaticUpdates) return;
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


// checkMemorAIDUpdates + selfHealMemoraidEntries now live in ./bg-memoraid (the provider-seam
// MemorAID engine). Imported + re-exported at the top of this file.

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
      // Living Characters runs in processInterceptedAction (on the player's action, so its seed
      // directive can be appended to the outgoing action). It is deliberately NOT run here too — a
      // second post-turn pass on the AI-response text would double-seed pressures.
      // Crystallized long-term memory (self-gates on the global enableCrystallized flag — off by default).
      await checkCrystallizedUpdates(shortId).catch((err) => {
        console.error("[AID bg] Crystallized update check threw:", err);
      });
      await refreshSceneAwareCrystallized(shortId).catch((err) => {
        console.error("[AID bg] Crystallized scene-aware refresh threw:", err);
      });
    } catch (e) {
      console.error("[AID bg] debounced gameplay turn checks threw:", e);
    } finally {
      gameplayTurnCheckTimers.delete(shortId);
    }
  }, 1200); // 1.2 second debounce
  gameplayTurnCheckTimers.set(shortId, timer);
}

/** Active Living-Characters pressure pairs derived from the live Life Cards — used to drop held
 *  (deferred) injection directives whose pressure has since resolved or whose card was deleted.
 *  Mirrors bg-life's Life-card identity (type "life", the title prefix, or a chaos-v2: key). */
function activePressurePairs(cards: CardRow[], adv: AdventureMeta | undefined, settings: Settings | undefined): SeededPair[] {
  const titlePrefix = settings?.livingCharactersTitlePrefix || "Life - ";
  const keyPrefix = (settings?.livingCharactersKeyPrefix || "chaos-v2:").toLowerCase();
  const prefixRe = new RegExp(`^${titlePrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
  const archived = new Set(adv?.lcArchived || []);
  const out: SeededPair[] = [];
  for (const c of cards) {
    if (c.deletedAt || !c.id || archived.has(c.id)) continue;
    // Canonical Life Card identity (mirror bg-life's findLifeCardForCharacter): type "life", OR the
    // title prefix, OR a chaos-v2: key — matching title-prefix alone misses cards keyed/typed as Life
    // but titled differently.
    const typeLower = (c.type || "").toLowerCase();
    const titleLower = (c.title || "").toLowerCase();
    const keysList = (c.keys || "").split(/[,;]+/).map(k => k.trim().toLowerCase()).filter(Boolean);
    const isLife = typeLower === "life" || titleLower.startsWith(titlePrefix.toLowerCase()) || keysList.some(k => k.startsWith(keyPrefix));
    if (!isLife) continue;
    const details = parseLifeCardEntry(c.value);
    const status = (details.status || "").toLowerCase();
    if (status === "resolved" || status === "dormant" || status === "concluded") continue;
    // Owner = title minus prefix, else the value's "<owner> Immediate Life Event:" header.
    let owner = (c.title || "").replace(prefixRe, "").trim();
    if (!owner) { const m = /^(.*?) Immediate Life Event:/m.exec(c.value || ""); owner = m ? m[1]!.trim() : ""; }
    if (!owner || !details.target || !details.pressure) continue;
    out.push({ owner, target: details.target, pressure: details.pressure, momentum: details.momentum || "low" });
  }
  return out;
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

/** Parse the delimited combined memory-block response into the block summary and each NPC's POV.
 *  Sections look like `===SUMMARY===\n...` and `===POV:Name===\n...`. Tolerant of missing sections
 *  (callers fall back per section). POVs are keyed by lowercased character name. */
function parseCombinedBlockResponse(raw: string, names: string[]): { summary: string; povs: Map<string, string> } {
  const povs = new Map<string, string>();
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const summaryMatch = raw.match(/===\s*SUMMARY\s*===\s*([\s\S]*?)(?====\s*POV\s*:|===\s*SUMMARY\s*===|$)/i);
  let summary = summaryMatch && summaryMatch[1] ? summaryMatch[1].trim() : "";
  for (const name of names) {
    const re = new RegExp(`===\\s*POV\\s*:\\s*${esc(name)}\\s*===\\s*([\\s\\S]*?)(?====\\s*POV\\s*:|===\\s*SUMMARY\\s*===|$)`, "i");
    const m = raw.match(re);
    if (m && m[1] && m[1].trim()) povs.set(name.trim().toLowerCase(), m[1].trim());
  }
  // No section markers at all → the model returned a plain summary; use the whole thing.
  if (!summary && povs.size === 0) summary = raw.trim();
  return { summary, povs };
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

  const blockText = targetActions.map(a => a.text || "").join("\n");
  const user = `Actions to summarize:\n${blockText}`;

  // Combined pass: when Crystallized (which owns the NPC Memory Bank) is enabled and tracked NPCs are
  // present in this block, produce the block summary AND each NPC's first-person POV recollection in
  // ONE provider call — the block context is identical for all of them, so a separate call per NPC
  // would re-send the same context for a different output. Per-NPC fallback below covers any section
  // the model drops.
  const settingsForNpc = await repo.getSettings();
  const npcSources = (settingsForNpc?.enableCrystallized && settingsForNpc?.crystallizedNpcMemoryEnabled !== false)
    ? await presentNpcSourcesForBlock(shortId, blockText).catch(() => [] as Array<{ title: string; keys: string }>)
    : [];
  const npcPovs = new Map<string, string>();

  let generatedMemory = "";
  try {
    if (npcSources.length > 0) {
      const names = npcSources.map(s => s.title);
      const combinedSystem = system +
        `\n\nAFTER the summary, also produce one first-person, past-tense recollection (1-2 sentences, ` +
        `feeling over fact) for EACH listed character, from their point of view. Output EXACTLY these ` +
        `delimited sections and nothing else:\n===SUMMARY===\n<the summary described above>\n` +
        names.map(n => `===POV:${n}===\n<${n}'s recollection>`).join("\n");
      const combinedUser = `${user}\n\nCharacters for POV sections: ${names.join(", ")}`;
      dlog(`[AID bg] Combined memory-block + NPC-POV generation for ${names.length} NPC(s)...`);
      const raw = cleanLlmResponse(await provider.complete(combinedSystem, combinedUser));
      const parsed = parseCombinedBlockResponse(raw, names);
      generatedMemory = parsed.summary;
      for (const [k, v] of parsed.povs) npcPovs.set(k, v);
    } else {
      dlog(`[AID bg] Generating memory summary using 3rd party provider...`);
      generatedMemory = cleanLlmResponse(await provider.complete(system, user));
    }
  } catch (err: any) {
    return { ok: false, error: `3rd party memory generation exception: ${err?.message || err}` };
  }
  // Summary fallback: if the combined call didn't yield a usable summary, do a dedicated summary call.
  if (!generatedMemory.trim() && npcSources.length > 0) {
    try { generatedMemory = cleanLlmResponse(await provider.complete(system, user)); } catch { /* handled below */ }
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

  // Persist the per-NPC POV blocks distilled in the same combined call. Any NPC the model omitted
  // falls back to its own generation so no memory is silently lost.
  if (npcSources.length > 0) {
    const anchor = { actionId: lastActId, actionIds: newActionIds };
    for (const s of npcSources) {
      try {
        const pov = npcPovs.get(s.title.trim().toLowerCase());
        if (pov && pov.trim()) {
          await storeNpcBlockFromPov(shortId, s.title, anchor, pov, npcSources);
        } else {
          await generateNpcBlock(shortId, s.title, { actionIds: newActionIds, lastRelevantActionId: lastActId }, npcSources);
        }
      } catch (err) {
        dlog(`[AID bg] combined NPC block persistence failed for ${s.title}:`, err);
      }
    }
  }

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

// One-time DB heal for imported/upgraded older databases. Bump when a new heal step is added; the
// stamp (`settings.dbHealVersion`) gates it to run once per database. Restores done via importAll heal
// unconditionally (see repo.importAll); this covers in-place extension upgrades.
const DB_HEAL_VERSION = 1;
let dbHealChecked = false;
async function ensureDbHealed(): Promise<void> {
  if (dbHealChecked) return;
  dbHealChecked = true;
  try {
    const settings = await repo.getSettings();
    if ((settings?.dbHealVersion ?? 0) >= DB_HEAL_VERSION) return;
    const healed = await repo.healAllCrystallizedState();
    await repo.setSettings({ ...(settings || {}), dbHealVersion: DB_HEAL_VERSION } as Settings);
    dlog(`[AID bg] DB heal v${DB_HEAL_VERSION}: sanitized ${healed} Crystallized state(s).`);
  } catch (err) {
    dbHealChecked = false; // let a later call retry
    console.error("[AID bg] DB heal failed:", err);
  }
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

const authorsNoteCaptured = new Set<string>();


async function consolidateOutlookForCharacter(shortId: string, characterTitle: string): Promise<{ ok?: boolean; error?: string; incorporated?: number }> {
  await ensureAuth();
  if (!sessionToken || !isSafeEndpoint(gqlEndpoint)) return { error: "Not authenticated with AI Dungeon yet." };
  const settings = await repo.getSettings();
  if (!settings?.enableCrystallized) return { error: "Crystallized is disabled." };
  const adv = await repo.getAdventure(shortId);
  const characterKey = characterTitle.trim().toLowerCase();
  const importantNames = (adv?.memoraidCharacters || []).map((n) => n.trim().toLowerCase()).filter(Boolean);
  if (!importantNames.includes(characterKey)) return { error: `${characterTitle} is not a Crystallized character.` };

  const state = await repo.getCrystallizedState(shortId, characterKey);
  const snapshot = state ? snapshotOutlookForIncorporation(state, 2) : [];
  if (!state || snapshot.length === 0) return { ok: true, incorporated: 0 };

  const cards = await repo.getCards(shortId);
  const card = cards.find((c) => !c.deletedAt && (c.title || "").trim().toLowerCase() === characterKey
    && (c.type || "").toLowerCase() !== "memory" && !(c.title || "").toLowerCase().endsWith(" (memory)"));
  if (!card) return { error: `No character card found for ${characterTitle}.` };
  const versions = await repo.getVersions(shortId);
  if (versions.some((v) => (v.cardId === card.id || v.characterName === characterTitle) && v.status === "pending")) {
    return { error: "A pending proposal already exists for this character — resolve it first." };
  }

  const field = "Personality";
  const currentFieldText = extractFieldBlock(card.value || "", field) || "";
  const formattingMode = settings?.formattingMode || DEFAULT_FORMATTING_MODE;
  const protagonist = (adv?.protagonistName && adv.protagonistName.trim()) || parseProtagonistName(adv?.memory) || "the player character";
  const command = resolveCommand(buildBoundedRevisionCommand(field, currentFieldText) + OUTLOOK_INCORPORATION_INSTRUCTION, protagonist);
  const evidence = `${characterTitle}'s settled self-beliefs (Outlook) to incorporate:\n${snapshot.map((b) => `- ${b.text}`).join("\n")}`;

  const r = await generateCard(card, command, formattingMode, { storyInformation: evidence.slice(0, 4000) });
  if (!r.ok) return { error: r.message || "Generation failed." };
  const newFieldText = r.value.trim().replace(/^\[+/, "").replace(/\]+$/, "").trim();
  if (!newFieldText) return { error: "Generation returned empty text." };
  const entry = spliceField(card.value || "", field, newFieldText);
  if (entry === card.value) return { error: `Card has no ${field} field to revise.` };

  const totalActionsCount = await repo.getActionCount(shortId);
  await repo.putVersion({
    id: crypto.randomUUID(), shortId, characterName: card.title || card.keys, entry,
    changeSummary: `Outlook consolidated into ${field} (${snapshot.length} belief${snapshot.length === 1 ? "" : "s"})`,
    source: "card", status: "pending", createdAt: new Date().toISOString(),
    actionCount: totalActionsCount, cardId: card.id, cardType: card.type || "character",
  } as any);
  await consolidateOutlookState(shortId, characterKey, snapshot, totalActionsCount);
  return { ok: true, incorporated: snapshot.length };
}

async function consolidateOutlookState(shortId: string, characterKey: string, snapshot: OutlookBelief[], turn: number): Promise<void> {
  if (!snapshot.length) return;
  const state = await repo.getCrystallizedState(shortId, characterKey);
  if (!state) return;
  const now = new Date().toISOString();
  await repo.appendCrystallizedArchive(snapshot.map((b) => ({
    id: crypto.randomUUID(), shortId, characterKey, kind: "outlook" as const,
    text: b.text, turn, archivedAt: now, reason: "incorporated" as const,
  })));
  await repo.putCrystallizedState(shortId, characterKey, clearIncorporatedOutlook(state, snapshot));
  dlog(`[AID bg] Consolidated ${snapshot.length} Outlook belief(s) into ${characterKey}'s card.`);
}


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
          const settings = await repo.getSettings();
          const enableLc = settings?.enableLivingCharacters !== false;

          // MemorAID presence short-circuit (unchanged): only run the NPC-thought pass when a tracked
          // character is actually present this turn. This must NOT gate Living Characters below — LC has
          // its own roster and fires independently — so it only flips runMemorAID, never returns early.
          let runMemorAID = true;
          const importantNames = cachedImportantCharacters.get(msg.shortId);
          if (importantNames && importantNames.length > 0) {
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
              runMemorAID = false;
            }
          } else {
            runMemorAID = false;
          }

          let updatedNames: string[] = [];
          if (runMemorAID) {
            updatedNames = await checkMemorAIDUpdates(msg.shortId, msg.text);
          }

          // ── Living Characters prompt-injection pipeline ────────────────────────────────────────
          // The extension can't touch AID's AI context, so LC seed directives are appended to the
          // outgoing player action — returned here as injectText; the injected MAIN-world script does
          // the actual append before the action is sent. Continue/retry actions carry no player text,
          // so per the per-adventure mode "defer" (default) HOLDS the directive for the next
          // do/say/story and "skip" doesn't run LC there at all; planInjection flushes held directives
          // on the next injectable action. This is the ONLY LC trigger — the post-turn
          // debouncedGameplayTurnCheck deliberately no longer runs it, which would double-seed.
          // Directives are appended to the action; there is no Author's Note injection mode.
          const advInj = await repo.getAdventure(msg.shortId);
          const injMode = advInj?.livingConfig?.continueInjectionMode || "defer";
          const fresh: PendingInjection[] = [];
          let injMeta: Record<string, unknown> | undefined;
          if (enableLc && shouldFireLcOnAction(msg.type, injMode)) {
            const lcResult = await checkLifeCardUpdates(msg.shortId, msg.text);
            if (lcResult.seededPair) {
              fresh.push({ ...lcResult.seededPair, text: formatLivingCharactersDirective(lcResult.seededPair) });
              injMeta = { ...lcResult.seededPair };
            }
          }

          // Drop held directives whose pressure is no longer active (resolved/deleted) before flushing.
          const cardsForGuard = await repo.getCards(msg.shortId);
          const activeKeys = new Set(activePressurePairs(cardsForGuard, advInj, settings).map(p => pressureKey(p.owner, p.pressure)));
          const heldLive = filterLiveDirectives(coercePending(advInj?.pendingInjections), activeKeys);
          const { injectText, nextPending } = planInjection(msg.type, fresh, heldLive);
          const prevPending = advInj?.pendingInjections || [];
          if (advInj && (nextPending.length !== prevPending.length || nextPending.some((d, i) => d.text !== prevPending[i]?.text))) {
            advInj.pendingInjections = nextPending;
            await repo.upsertAdventure(advInj);
          }
          if (injectText) {
            const turnCount = await repo.getActionCount(msg.shortId);
            await repo.appendInjectionLog([{
              id: crypto.randomUUID(),
              shortId: msg.shortId,
              turn: turnCount,
              provider: "living-characters",
              directiveText: injectText,
              meta: injMeta,
              createdAt: new Date().toISOString(),
            }]);
            dlog(`[Injection] Appending directive to action: ${injectText}`);
          }

          return { ok: true, updatedNames, injectText };
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
        if (msg.settings.showDebug !== undefined) { debugEnabled = !!msg.settings.showDebug; setInfraDebug(debugEnabled); }
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
        if (msg.status === "rejected") {
          // Rejecting a body re-roll restores the phenotype record snapshotted when the proposal was
          // made, so the stored body doesn't stay diverged from the (kept) card. No-op for any other
          // version (only re-roll proposals carry a phenotypeRollback). Reroll spec §A.6.
          const rejectedVer = await repo.getVersion(msg.id);
          const rollback = (rejectedVer as any)?.phenotypeRollback;
          if (rollback) await repo.putPhenotype(rollback);
        }
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
      case "adventureMemories": {
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

        // Defense-in-depth: never let an empty update wipe a populated Memory Bank. Beta emits small/
        // partial WS frames mid-turn (the full window comes via fetch), so an empty frame here is a
        // transient, not a real clear — persisting it blanked the panel during turn processing.
        if (normalized.length === 0 && oldMemories.length > 0) {
          return;
        }

        const update: any = { shortId: msg.shortId, memoryBankEntries: normalized };
        await repo.upsertAdventure(update);

        const settings = await repo.getSettings();

        // Forward-auto NPC memory bank (§Q): when genuinely NEW native blocks form (not the initial
        // backfill of a page load), distill each into per-present-NPC POV recollections. Fire-and-forget.
        if (settings?.enableCrystallized && settings?.crystallizedNpcMemoryEnabled !== false && normalized.length > oldMemories.length && oldMemories.length > 0) {
          const newBlocks = normalized.slice(oldMemories.length).filter((b: any) => b && b.actionIds && b.actionIds.length);
          // When Auto-Update is on, regenerateLatestMemory (below) runs the COMBINED block+NPC-POV pass
          // for the latest memory entry in a single provider call — so exclude that entry here, or its
          // NPCs would be generated twice per turn (once combined, once as a redundant separate call),
          // defeating the whole point of the combined pass. Earlier new blocks (multi-block updates,
          // which the combined pass doesn't touch — it only regenerates the latest) still go through
          // forward-auto. Reference-compare against the latest entry so the exclusion is exact even if
          // that entry lacks actionIds (in which case it isn't in newBlocks anyway).
          const latestEntry = normalized[normalized.length - 1];
          const forwardAutoBlocks = settings.autoRegenerateMemoryBankEntry
            ? newBlocks.filter((b: any) => b !== latestEntry)
            : newBlocks;
          for (const block of forwardAutoBlocks) {
            generateNpcBlocksForNewNativeBlock(msg.shortId, block).catch(err => {
              console.error("[AID bg] NPC memory bank auto-generation failed:", err);
            });
          }
        }

        if (settings?.autoRegenerateMemoryBankEntry) {
          let shouldTrigger = false;
          if (normalized.length > oldMemories.length) {
            const isInitialLoad = oldMemories.length === 0;
            if (!isInitialLoad || normalized.length === 1) {
              shouldTrigger = true;
            }
          } else if (normalized.length > 0 && oldMemories.length > 0) {
            const lastIdx = normalized.length - 1;
            const normIds = normalized[lastIdx]?.actionIds || [];
            // oldMemories may be shorter than normalized — guard rather than crash on a fresh block.
            const oldIds = oldMemories[lastIdx]?.actionIds || [];
            if (normIds.length !== oldIds.length || !normIds.every((id: string, idx: number) => id === oldIds[idx])) {
              shouldTrigger = true;
            }
          }

          if (shouldTrigger) {
            dlog(`[AID bg] Auto-regenerating latest memory natively for shortId: ${msg.shortId}`);
            regenerateLatestMemory(msg.shortId).catch(err => {
              console.error("[AID bg] Auto-regeneration of latest memory failed:", err);
            });
          }
        }
        return;
      }
      case "updateAidMemories": {
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
          
          await ensureAuth();
          if (sessionToken && gqlEndpoint) {
            const op = await repo.getOp("EditMemory");
            const query = op?.query || DEFAULT_GQL_QUERIES.EditMemory;

            try {
              dlog("[AID bg] Replaying EditMemory mutation to AI Dungeon...");
              const req = buildEditMemory(gqlEndpoint, query, sessionToken, msg.shortId, actionId, editedMemory.text);
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
      case "setMemoraidCharacters": {
        // Per-adventure MemorAID config (replaces the Configure MemorAID card).
        try {
          const characters = (msg.characters || []).map((c) => String(c || "").trim()).filter(Boolean);
          const advMc = await repo.getAdventure(msg.shortId);
          // Re-enable hook: re-ADDING a character to the MemorAID list (absent before, present now) clears
          // any user-delete tombstone for its auto-cards, so MemorAID/Crystallized regenerate them again.
          const prev = new Set((advMc?.memoraidCharacters || []).map((c) => c.trim().toLowerCase()));
          const added = characters.filter((c) => !prev.has(c.trim().toLowerCase()));
          const patch: AdventureMeta = { shortId: msg.shortId, memoraidCharacters: characters };
          if (added.length && advMc?.userDeletedCards?.length) {
            const titles = added.flatMap((n) => [`${n} (Memory)`, `${n} - Crystallized`]);
            patch.userDeletedCards = removeUserDeletedTitles(advMc.userDeletedCards, titles);
          }
          await repo.upsertAdventure(patch);
          await updateConfigCache(msg.shortId);
          broadcastToTabs({ kind: "stateUpdated", shortId: msg.shortId });
          return { ok: true };
        } catch (err: any) {
          return { error: err?.message || String(err) };
        }
      }
      case "setLivingConfig": {
        // Per-adventure Living Characters simulation config (replaces global livingCharacters* settings).
        try {
          await repo.upsertAdventure({ shortId: msg.shortId, livingConfig: msg.config || {} });
          broadcastToTabs({ kind: "stateUpdated", shortId: msg.shortId });
          return { ok: true };
        } catch (err: any) {
          return { error: err?.message || String(err) };
        }
      }
      case "saveCrystallizedSchema": {
        try {
          const cards = await repo.getCards(msg.shortId);
          const card = cards.find((c) => c.id === msg.cardId && !c.deletedAt);
          if (!card) return { error: "Crystallized card not found." };
          const characterKey = (card.title || "").replace(/\s*-\s*crystallized$/i, "").trim().toLowerCase();
          const state = (await repo.getCrystallizedState(msg.shortId, characterKey)) || parseCrystallized(card.description);
          state.schema = dedupeSchema(msg.schema);
          return await saveCrystallizedState(msg.shortId, card, state);
        } catch (e: any) {
          return { error: e?.message || String(e) };
        }
      }
      case "savePreferences": {
        try {
          const cards = await repo.getCards(msg.shortId);
          const card = cards.find((c) => c.id === msg.cardId && !c.deletedAt);
          if (!card) return { error: "Crystallized card not found." };
          const characterKey = (card.title || "").replace(/\s*-\s*crystallized$/i, "").trim().toLowerCase();
          const state = (await repo.getCrystallizedState(msg.shortId, characterKey)) || parseCrystallized(card.description);
          // Authoritative full replace (honors deletions + additions; preserves strength for unchanged
          // lines). Preferences never decay, so the editor is the only place one can be removed.
          state.preferences = applyManualPreferences(state.preferences || [], msg.prefs);
          return await saveCrystallizedState(msg.shortId, card, state);
        } catch (e: any) {
          return { error: e?.message || String(e) };
        }
      }
      case "consolidateCrystallizedSchema": {
        try {
          const cards = await repo.getCards(msg.shortId);
          const card = cards.find((c) => c.id === msg.cardId && !c.deletedAt);
          if (!card) return { error: "Crystallized card not found." };
          const characterKey = (card.title || "").replace(/\s*-\s*crystallized$/i, "").trim().toLowerCase();
          const state = (await repo.getCrystallizedState(msg.shortId, characterKey)) || parseCrystallized(card.description);
          if (!state.schema.length) return { ok: true };
          await ensureAuth();
          const settings = await repo.getSettings();
          const formattingMode = settings?.formattingMode || DEFAULT_FORMATTING_MODE;
          const current = state.schema.map((s) => `- [${formatSubjectLabel(s)}] ${s.text}`).join("\n");
          const command = buildConsolidateCommand(current);
          const r = await generateCard({ ...card, value: "" }, command, formattingMode, {});
          if (!r.ok) return { error: r.message || "Consolidation generation failed." };
          const parsed = parseLlmOutput(r.value);
          if (parsed.schema.length) state.schema = dedupeSchema(parsed.schema as any);
          return await saveCrystallizedState(msg.shortId, card, state);
        } catch (e: any) {
          return { error: e?.message || String(e) };
        }
      }
      case "getCrystallizedState": {
        try {
          const cards = await repo.getCards(msg.shortId);
          const card = cards.find((c) => c.id === msg.cardId && !c.deletedAt);
          if (!card) return { error: "Crystallized card not found." };
          const characterKey = (card.title || "").replace(/\s*-\s*crystallized$/i, "").trim().toLowerCase();
          const state = (await repo.getCrystallizedState(msg.shortId, characterKey)) || parseCrystallized(card.description);
          return { ok: true, state };
        } catch (e: any) {
          return { error: e?.message || String(e) };
        }
      }
      case "deleteStoryCard": {
        await ensureAuth();
        if (!sessionToken || !isSafeEndpoint(gqlEndpoint)) {
          return { error: "No session token yet — interact with the page once, then retry." };
        }
        try {
          const cards = await repo.getCards(msg.shortId);
          const card = cards.find(c => c.id === msg.cardId);
          if (!card) {
            return { error: "Card not found in local database." };
          }
          const del = await tryNativeCardDelete(msg.shortId, msg.cardId);
          if (!del.ok) {
            return { error: `AI Dungeon rejected delete: ${del.error || "unknown error"}` };
          }
          const delLifePrefix = (await repo.getSettings())?.livingCharactersTitlePrefix || "Life - ";
          const deletedAtStr = new Date().toISOString();
          // Preserve value + description so the Archived copy keeps the card's content (recoverable),
          // matching archiveLifeCard. The card is already gone from AID via tryNativeCardDelete above.
          const updatedCard = { ...card, deletedAt: deletedAtStr };
          await repo.putCards(msg.shortId, [updatedCard]);
          // Tombstone the user's delete so the per-turn savestate can't resurrect it and the auto-card
          // creators won't mint a fresh one (suppressed by title).
          const advDel = await repo.getAdventure(msg.shortId);
          if (advDel) {
            advDel.userDeletedCards = addUserDeletedCards(advDel.userDeletedCards, [{ id: msg.cardId, title: card.title || "" }]);
            await repo.upsertAdventure(advDel);
          }
          broadcastToTabs({
            kind: "approvedCardSync",
            // Only auto-cards (Life/MemorAID/Crystallized) get the AID-autosave block — they're the
            // ones AID's editor resurrects. Regular cards keep their restore-by-reappearance flow.
            payload: { ok: true, source: "card", cardId: msg.cardId, value: updatedCard.value, description: updatedCard.description || "", keys: updatedCard.keys, deletedAt: deletedAtStr, blockAutosave: isAutoCardTitle(card.title, delLifePrefix) }
          });
          return { ok: true };
        } catch (err: any) {
          return { error: err?.message || String(err) };
        }
      }
      case "setLifeCardStatus": {
        await ensureAuth();
        if (!sessionToken || !isSafeEndpoint(gqlEndpoint)) {
          return { error: "No session token yet — interact with the page once, then retry." };
        }
        try {
          const cards = await repo.getCards(msg.shortId);
          const card = cards.find(c => c.id === msg.cardId);
          if (!card) return { error: "Card not found in local database." };

          if (msg.status === "resolved") {
            const arch = await archiveLifeCard(msg.shortId, card);
            if (!arch.ok) return { error: `AI Dungeon rejected the resolve/delete: ${arch.error || "unknown error"}` };
            const advRes = await repo.getAdventure(msg.shortId);
            if (advRes?.lcDormantSince && advRes.lcDormantSince[msg.cardId] != null) {
              delete advRes.lcDormantSince[msg.cardId];
              await repo.upsertAdventure(advRes);
            }
            return { ok: true };
          }

          // active | dormant → rewrite the engine-owned Status line, replay UseAutoSaveStoryCard.
          const newValue = setLifeCardStatusValue(card.value, msg.status);
          const updateOp = await repo.getOp("UseAutoSaveStoryCard");
          const updateQuery = updateOp?.query || DEFAULT_GQL_QUERIES.UseAutoSaveStoryCard;
          const updatedCard = { ...card, value: newValue };
          const saveReq = buildCardSave(gqlEndpoint!, updateQuery, sessionToken!, updatedCard, newValue);
          const saveRes = await fetch(saveReq.url, { method: "POST", headers: saveReq.headers, body: saveReq.body });
          if (!saveRes.ok) return { error: `Status update failed with HTTP ${saveRes.status}` };
          await repo.putCards(msg.shortId, [updatedCard]);

          const adv = await repo.getAdventure(msg.shortId);
          if (adv) {
            adv.lcDormantSince = adv.lcDormantSince || {};
            if (msg.status === "dormant") adv.lcDormantSince[msg.cardId] = (await repo.getActions(msg.shortId)).length;
            else delete adv.lcDormantSince[msg.cardId];
            await repo.upsertAdventure(adv);
          }
          broadcastToTabs({ kind: "approvedCardSync", payload: { ok: true, source: "card", cardId: msg.cardId, value: newValue, description: updatedCard.description || "" } });
          return { ok: true };
        } catch (err: any) {
          return { error: err?.message || String(err) };
        }
      }
      case "enqueueLifeInjection": {
        // A manually-seeded custom Life Card creates the card via createStoryCard but — unlike an
        // auto-seeded pressure — never enqueues the one-shot prompt-injection directive, so its pressure
        // never surfaces via the injection lever. The panel calls this right after a successful custom
        // seed to enqueue that directive; it flushes on the next do/say/story action like any auto seed.
        try {
          const adv = await repo.getAdventure(msg.shortId);
          if (!adv) return { error: "Adventure not found." };
          const pair: SeededPair = { owner: msg.owner, target: msg.target, pressure: msg.pressure, momentum: msg.momentum || "low" };
          const pending = coercePending(adv.pendingInjections);
          pending.push({ ...pair, text: formatLivingCharactersDirective(pair) });
          adv.pendingInjections = pending;
          await repo.upsertAdventure(adv);
          const settings = await repo.getSettings();
          return { ok: true };
        } catch (err: any) {
          return { error: err?.message || String(err) };
        }
      }
      case "cardsDeleted": {
        // A native card deletion (UseDeleteStoryCard) was observed on the page. Mirror it locally so
        // the card drops out of the roster/Living Characters tab immediately (history preserved),
        // freeing its owner for a fresh Life-card seed — without waiting for a page reload.
        if (Array.isArray(msg.cardIds) && msg.cardIds.length) {
          const before = await repo.getCards(msg.shortId);
          await repo.markCardsDeleted(msg.shortId, msg.cardIds);
          // Stamp the reseed cooldown for any deleted Life card's owner so a manual native delete
          // doesn't instantly respawn the relationship either.
          const s = await repo.getSettings();
          const titlePrefix = s?.livingCharactersTitlePrefix || "Life - ";
          const adv = await repo.getAdventure(msg.shortId);
          if (adv) {
            const turn = (await repo.getActions(msg.shortId)).length;
            adv.lcResolvedAt = adv.lcResolvedAt || {};
            for (const id of msg.cardIds) {
              const c = before.find(x => x.id === id);
              const titleLower = (c?.title || "").toLowerCase();
              if (titleLower.startsWith(titlePrefix.toLowerCase())) {
                const owner = (c!.title || "").replace(new RegExp(`^${titlePrefix}`, "i"), "").trim().toLowerCase();
                if (owner) { adv.lcResolvedAt[owner] = turn; }
              }
            }
            // Tombstone every native delete so the per-turn savestate can't resurrect it (the
            // repropagation conflict) and the auto-card creators won't recreate it by title.
            adv.userDeletedCards = addUserDeletedCards(
              adv.userDeletedCards,
              msg.cardIds.map((id) => ({ id, title: before.find((x) => x.id === id)?.title || "" }))
            );
            await repo.upsertAdventure(adv);
          }
          for (const id of msg.cardIds) {
            broadcastToTabs({ kind: "approvedCardSync", payload: { ok: true, source: "card", cardId: id, deletedAt: new Date().toISOString() } });
          }
          await updateConfigCache(msg.shortId);
        }
        return { ok: true };
      }
      case "generateCompactCard":
        return runGenerateCard(msg.shortId, msg.cardId, "backgroundCharacter");
      case "rerollAppearance":
        return runRerollAppearance(msg.shortId, msg.cardId);
      case "distillCrystallized":
        return runCrystallizedDistillationManual(msg.shortId, msg.cardId, msg.name);
      case "backfillNpcMemories":
        return backfillNpcMemories(msg.shortId, msg.characterTitle);
      case "getNpcMemoryBank": {
        const key = msg.characterTitle.trim().toLowerCase();
        const blocks = (await repo.getNpcMemoryBlocks(msg.shortId, key)).sort((a, b) => b.turnEnd - a.turnEnd);
        const s = await repo.getSettings();
        const advM = await repo.getAdventure(msg.shortId);
        return { blocks, cap: advM?.crystallizedNpcMemoryCap ?? s?.crystallizedNpcMemoryCap ?? 400 };
      }
      case "deleteNpcMemoryBlock":
        await repo.deleteNpcMemoryBlock(msg.shortId, msg.characterTitle.trim().toLowerCase(), msg.blockId);
        return { ok: true };
      case "regenerateNpcMemoryBlock":
        return regenerateNpcMemoryBlock(msg.shortId, msg.characterTitle, msg.blockId);
      case "setAuthorsNote":
        // Listener: the user edited their Author's Note in AID. Store it verbatim (even "") so our
        // cache never goes stale, and mark it captured so the load-time fetch won't re-run.
        authorsNoteCaptured.add(msg.shortId);
        await repo.upsertAdventure({ shortId: msg.shortId, authorsNote: msg.authorsNote });
        return { ok: true };
      case "saveNpcMemoryBlock": {
        const key = msg.characterTitle.trim().toLowerCase();
        const existing = (await repo.getNpcMemoryBlocks(msg.shortId, key)).find(b => b.blockId === msg.blockId);
        if (!existing) return { error: "Memory block not found." };
        const cards = await repo.getCards(msg.shortId);
        const known = new Set(
          cards.flatMap(c => [c.title, ...String(c.keys || "").split(/[,;]+/)])
            .map(t => String(t || "").trim().toLowerCase()).filter(Boolean)
        );
        const { entities, keywords } = extractBlockTags(msg.povText, known);
        await repo.putNpcMemoryBlock({ ...existing, povText: msg.povText, entities, keywords });
        return { ok: true };
      }
      case "consolidateOutlook":
        return consolidateOutlookForCharacter(msg.shortId, msg.characterTitle);
      case "getState": {
        await ensureDbHealed(); // once per database: sanitize old imported/upgraded state before it's read
        // Load each store ONCE and reuse (seedBaselines used to re-read all of these).
        const settings = await repo.getSettings();
        debugEnabled = !!settings?.showDebug; setInfraDebug(debugEnabled); // keep verbose logging in sync with the user's setting
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
            // Feature-enable flags + per-feature config the panel reads back to hydrate its toggles.
            // Omitting any of these makes the corresponding checkbox render unchecked (or reset to
            // default) on every getState refresh — the "Crystallized missing entirely" bug class.
            enableAutomaticUpdates: !!settings.enableAutomaticUpdates,
            enableMemorAID: settings.enableMemorAID !== false,
            enableLivingCharacters: settings.enableLivingCharacters !== false,
            livingCharactersTitlePrefix: settings.livingCharactersTitlePrefix ?? "Life - ",
            livingCharactersKeyPrefix: settings.livingCharactersKeyPrefix ?? "chaos-v2:",
            groupThoughtsInRoster: !!settings.groupThoughtsInRoster,
            enableCrystallized: !!settings.enableCrystallized,
            crystallizedInterval: settings.crystallizedInterval ?? 20,
            crystallizedEntryMaxChars: settings.crystallizedEntryMaxChars ?? 900,
            crystallizedNodeCap: settings.crystallizedNodeCap ?? 12,
            crystallizedKnowsCap: settings.crystallizedKnowsCap ?? 2,
            crystallizedRecallsCap: settings.crystallizedRecallsCap ?? 2,
            crystallizedVividCap: settings.crystallizedVividCap ?? 4,
            crystallizedOutlookCap: settings.crystallizedOutlookCap ?? 2,
            crystallizedPreferencesCap: settings.crystallizedPreferencesCap ?? 4,
            crystallizedNpcMemoryCap: settings.crystallizedNpcMemoryCap ?? 400,
            // Per-pass LLM enable flags (default on / opt-out).
            crystallizedKnowsEnabled: settings.crystallizedKnowsEnabled !== false,
            crystallizedNodesEnabled: settings.crystallizedNodesEnabled !== false,
            crystallizedOutlookEnabled: settings.crystallizedOutlookEnabled !== false,
            crystallizedPreferencesEnabled: settings.crystallizedPreferencesEnabled !== false,
            crystallizedNpcMemoryEnabled: settings.crystallizedNpcMemoryEnabled !== false,
          } : null,
          protagonist: adv?.protagonistName ?? null,
          scenario: adv?.title ?? null,
          memory: adv?.memory ?? null,
          // Per-adventure MemorAID roster + Living Characters sim config (incl. pairing pressure pools):
          // the panel repopulates its editors from these, so getState must return them or a saved config
          // silently fails to reload ("pairing pressure pools isn't saving").
          memoraidCharacters: adv?.memoraidCharacters ?? [],
          livingConfig: adv?.livingConfig ?? {},
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
