/**
 * Proper Noun Detection — pure NLP hardening gates + the pending-candidate evidence pool.
 * Spec: docs/superpowers/specs/2026-07-13-proper-noun-hardening-design.md (gitignored local note).
 *
 * Validated against a real 2,457-action story: the current pipeline emitted 368 suggestions of
 * which the user accepted 25 (~90% noise). These gates cut that roughly in half while losing only
 * entities mentioned once in the entire story (accepted trade — create those manually):
 *  - G3 (stateless): contraction/elision tokens ("We've", "J'aime") are never names.
 *  - G2 (stateless): multiword candidates with interior lowercase/contraction words are NLP
 *    over-extensions ("Lyon without", "Gabi wouldn't"); lowercase CONNECTORS are legitimate
 *    ("Claire de Lune").
 *  - Edge-trim (stateless): junk glued onto a real name is trimmed, recovering the name
 *    ("Luckily Vegas" → "Vegas", "Chad sneers" → "Chad").
 *  - G5 (evidence): a candidate is only suggested after appearing in ≥2 distinct actions —
 *    first sighting waits in the pool (deferred, not dropped).
 *  - G1 (evidence, single words): the word must be seen capitalized MID-SENTENCE at least once;
 *    a capital explained only by sentence/dialogue position ("Thank you,") is not name evidence.
 *
 * This module is compromise-free and side-effect-free: POS/demonym/ignore-list junk knowledge is
 * injected by the caller (background.ts) as predicates.
 */
import type { PendingProperNoun } from "../shared/types";

/** Lowercase linking words allowed inside multiword names ("Mountain of Ravenwood",
 *  "Claire de Lune") and excluded from G5 word-level mention credit. */
export const PN_CONNECTORS = new Set([
  "of", "the", "a", "an", "de", "la", "le", "du", "des", "von", "van", "el", "al"
]);

/** Max entries kept in adv.properNounPending — junk that never earns promotion ages out. */
export const PENDING_PROPER_NOUN_CAP = 150;

const CONTRACTION_RE = /^[A-Za-z]+'(d|ll|ve|re|t|s|m)$/i;
// French PRONOUN/VERB elisions only (J'aime, C'est, N'est — je/ce/ne never start a name).
// ARTICLE elisions L'/D' (le/de) are deliberately EXCLUDED: they routinely start real names
// ("L'Amour Secret", "L'Artiste", "D'Artagnan") — flagging them as junk let the edge-trim decap
// "L'Amour Secret" down to "Secret". O' is likewise excluded (Irish names: O'Brien).
const ELISION_RE = /^[JCN]'/i;

/** G3: capitalized English contraction shells ("We've", "Didn't", "I'm") are never names. */
export function isContractionToken(word: string): boolean {
  return CONTRACTION_RE.test(word.trim());
}

/** G3: French pronoun/verb elision tokens ("J'aime", "C'est", "N'est"). Article elisions (L'/D')
 *  are NOT flagged — they start real names ("L'Amour Secret", "D'Artagnan"). This predicate also
 *  feeds the multiword edge-trim's junk test, so it must stay name-safe. */
export function isElisionToken(word: string): boolean {
  return ELISION_RE.test(word.trim());
}

/** G2: a multiword candidate containing an interior lowercase non-connector word or a contraction
 *  token is an NLP span over-extension, not a name. */
export function multiwordDisqualified(phrase: string): boolean {
  const words = phrase.split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  return words.some(w => {
    const lw = w.toLowerCase();
    if (PN_CONNECTORS.has(lw)) return false;
    if (/^[a-z]/.test(w)) return true;
    return isContractionToken(w);
  });
}

/**
 * Trim junk words from the edges of a multiword candidate, recovering the real name inside
 * ("Luckily Vegas" → "Vegas", "Chad sneers" → "Chad", "Veya French" → "Veya"). Junk knowledge is
 * injected by the caller (ignore list + demonym + POS live in background.ts):
 *  - `isJunkWord` applies to BOTH edges — lowercase words, contractions, ignore-listed, demonyms.
 *  - `isLeadJunkWord` applies to the LEADING edge only — POS-based junk (sentence adverbs,
 *    inflected verbs: "Seems Juniper", "Luckily Vegas"). Deliberately never used on the trailing
 *    edge: capitalized noun-verb homographs are name material there ("Obsidian Keep",
 *    "Central Park"), and compromise reads bare "keep"/"park" as verbs.
 * Connectors are never junk themselves, but orphaned edge connectors left behind by a trim are
 * swept too ("French of Vegas" → "Vegas"). Interior words are never touched.
 */
export function trimJunkEdgeWords(
  phrase: string,
  isJunkWord: (w: string) => boolean,
  isLeadJunkWord?: (w: string) => boolean
): string {
  const words = phrase.split(/\s+/).filter(Boolean);
  let start = 0;
  let end = words.length;
  // Alternate edges until stable. A connector is only "orphaned" once it sits at an edge, which
  // can happen after an adjacent junk word is trimmed — hence the loop.
  let changed = true;
  while (changed && start < end) {
    changed = false;
    // Leading edge: connectors here are orphans only if something was already trimmed — a name
    // may legitimately start with "The"/"Le" when nothing else was cut.
    if (start < end && (isJunkWord(words[start]!) || (isLeadJunkWord?.(words[start]!) ?? false))) { start++; changed = true; }
    else if (start > 0 && start < end && PN_CONNECTORS.has(words[start]!.toLowerCase())) { start++; changed = true; }
    if (start < end && (PN_CONNECTORS.has(words[end - 1]!.toLowerCase()) || isJunkWord(words[end - 1]!))) { end--; changed = true; }
  }
  return words.slice(start, end).join(" ");
}

const escapeRe = (s: string) => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");

/**
 * G1 evidence: `word` appears capitalized somewhere its capital is NOT explained by position —
 * preceded (across whitespace) by a lowercase letter, comma, or semicolon. Sentence starts,
 * dialogue openings, and line starts don't count.
 */
export function hasMidSentenceCap(word: string, text: string): boolean {
  const re = new RegExp(`([a-z,;])\\s+${escapeRe(word)}(?![A-Za-z])`, "g");
  return re.test(text);
}

/**
 * G5 mention test: does `text` mention the pending `noun`? Full-phrase match always counts; a
 * multiword noun additionally gets credit from any of its distinctive words — non-connector words
 * that are not already-known names (injected `isKnownWord`), so "Juniper Thorne" is credited by
 * "Juniper" but "Smoke Girlfriend" is NOT credited by the protagonist's ubiquitous "Smoke".
 */
export function mentionedInText(noun: string, text: string, isKnownWord?: (w: string) => boolean): boolean {
  if (new RegExp(`\\b${escapeRe(noun)}\\b`).test(text)) return true;
  const words = noun.split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  return words.some(w => {
    if (PN_CONNECTORS.has(w.toLowerCase())) return false;
    if (isKnownWord && isKnownWord(w)) return false;
    return new RegExp(`\\b${escapeRe(w)}\\b`).test(text);
  });
}

const keyOf = (noun: string) => noun.trim().toLowerCase();
const wordsOf = (noun: string) => noun.toLowerCase().split(/\s+/).filter(Boolean);
const isWordSubset = (small: string[], large: string[]) => small.every(w => large.includes(w));

/**
 * Register a freshly detected candidate into the pending pool. Variant handling keeps one entry
 * per entity:
 *  - exact match → counts as a mention of the existing entry;
 *  - the new noun EXTENDS a pending entry ("Juniper" → "Juniper Thorne") → the entry is upgraded
 *    in place to the longer form (evidence carried over, re-keyed);
 *  - the new noun is a SHORTER variant of a pending entry → counts as a mention of it.
 */
export function registerCandidate(
  pending: Record<string, PendingProperNoun>,
  noun: string,
  actionId: string,
  actionText: string,
  now: string
): void {
  const key = keyOf(noun);
  const newWords = wordsOf(noun);

  let entry = pending[key];
  if (!entry) {
    for (const [k, e] of Object.entries(pending)) {
      const oldWords = wordsOf(e.noun);
      if (newWords.length > oldWords.length && isWordSubset(oldWords, newWords)) {
        // Upgrade: the longer variant becomes the canonical pending form.
        delete pending[k];
        entry = { ...e, noun };
        pending[key] = entry;
        break;
      }
      if (newWords.length < oldWords.length && isWordSubset(newWords, oldWords)) {
        entry = e; // shorter variant → just a mention of the fuller pending name
        break;
      }
    }
  }

  if (!entry) {
    pending[key] = {
      noun,
      firstActionId: actionId,
      mentionActionIds: [actionId],
      hasMidSentenceCap: wordsOf(noun).length === 1 ? hasMidSentenceCap(noun, actionText) : false,
      lastSeenAt: now,
    };
    return;
  }

  if (!entry.mentionActionIds.includes(actionId)) entry.mentionActionIds.push(actionId);
  if (!entry.hasMidSentenceCap && wordsOf(entry.noun).length === 1) {
    entry.hasMidSentenceCap = hasMidSentenceCap(entry.noun, actionText);
  }
  entry.lastSeenAt = now;
}

/**
 * Accrue evidence for ALL pending entries from a new action: distinct-action mention counting and
 * (single words) mid-sentence capitalization. Returns true when anything changed.
 */
export function updatePendingEvidence(
  pending: Record<string, PendingProperNoun>,
  actionId: string,
  actionText: string,
  now: string,
  isKnownWord?: (w: string) => boolean
): boolean {
  let changed = false;
  for (const entry of Object.values(pending)) {
    const single = wordsOf(entry.noun).length === 1;
    if (!entry.mentionActionIds.includes(actionId) && mentionedInText(entry.noun, actionText, isKnownWord)) {
      entry.mentionActionIds.push(actionId);
      entry.lastSeenAt = now;
      changed = true;
    }
    if (single && !entry.hasMidSentenceCap && hasMidSentenceCap(entry.noun, actionText)) {
      entry.hasMidSentenceCap = true;
      changed = true;
    }
  }
  return changed;
}

/** Promotion: ≥2 distinct-action mentions, and single words additionally need G1 cap evidence. */
export function readyToPromote(entry: PendingProperNoun): boolean {
  if (entry.mentionActionIds.length < 2) return false;
  return wordsOf(entry.noun).length > 1 || entry.hasMidSentenceCap;
}

/** Keep only the newest `cap` entries by lastSeenAt — never-promoted junk silently ages out. */
export function prunePending(pending: Record<string, PendingProperNoun>, cap = PENDING_PROPER_NOUN_CAP): void {
  const keys = Object.keys(pending);
  if (keys.length <= cap) return;
  keys.sort((a, b) => pending[b]!.lastSeenAt.localeCompare(pending[a]!.lastSeenAt));
  for (const k of keys.slice(cap)) delete pending[k];
}
