import type { CanonicalAction, CardRow } from "../shared/types";
import { matchedTriggers } from "../shared/types";
import type { InferenceRequest } from "./provider";
import { parsePlotEssentials } from "./plot";

/** A story card detected as present in the scene, with the trigger token(s) that fired. */
export interface PresentEntity {
  title: string;
  type: string;
  triggers: string[];
}

// Meta/tool cards are not narrative entities and must never be surfaced as "present".
function isMetaCard(c: { title?: string | null }): boolean {
  const t = (c.title || "").toLowerCase().trim();
  if (!t) return false;
  return (
    t === "configure memoraid" ||
    t === "active location anchor" ||
    t.endsWith("(memory)")
  );
}

/**
 * Detect which story cards are present in `text` (typically the Scene Presence Lookback window
 * joined with the held action) by matching their triggers, returning each with the trigger(s)
 * that fired. Meta/tool cards (Configure MemorAID, companion memory cards, location anchors) are
 * excluded. This is the SAME trigger-match logic that gates presence, surfaced as data so the
 * MemorAID model is told who is on-stage instead of re-inferring it from prose.
 */
export function detectPresentCards(
  text: string,
  cards: { title?: string | null; keys?: string | null; type: string; deletedAt?: string | null }[]
): PresentEntity[] {
  const out: PresentEntity[] = [];
  for (const c of cards) {
    if (c.deletedAt || isMetaCard(c)) continue;
    const triggers = matchedTriggers(text, c.title || "", c.keys || "");
    if (triggers.length) out.push({ title: c.title || triggers[0]!, type: c.type, triggers });
  }
  return out;
}

/**
 * Build the universal MemorAID prompt — character-agnostic and provider-agnostic — split into a
 * stable `cachePrefix` and a per-character `user` tail so multi-character turns can prompt-cache
 * the shared scene context (see Provider.complete). The prefix (on-stage roster + prior context +
 * the single latest action) is IDENTICAL for every character in a turn; the tail (this character's
 * profile + the resolved instruction template) is what varies. All directive wording (which entity,
 * react-to-latest, [none]-if-absent, formatting) lives in the template — these labels are structural
 * only. Concatenating `cachePrefix + user` yields the full prompt regardless of whether caching is used.
 */
export function buildMemoraidPrompt(opts: {
  charProfile: string;
  priorActionsText: string;
  latestActionText: string;
  presentEntities: PresentEntity[];
  instructions: string;
}): { cachePrefix: string; user: string } {
  const roster = opts.presentEntities.length
    ? opts.presentEntities
        .map((e) => `- ${e.title} (${e.type}; matched: ${e.triggers.join(", ")})`)
        .join("\n")
    : "(none detected)";
  const cachePrefix =
    `Story cards present in the current scene (by matched trigger):\n${roster}\n\n` +
    `Prior context (older actions, for reference only):\n${opts.priorActionsText || "(none yet)"}\n\n` +
    `Latest action:\n${opts.latestActionText}\n\n`;
  const user = `${opts.charProfile}Instructions:\n${opts.instructions}`;
  return { cachePrefix, user };
}

/**
 * Build the labeled storyInformation base context for regenerating a LOCATION card.
 *
 * Since prompt generation does not feed the card's current entry automatically, we handle it explicitly:
 * 1. The current entry is included with an explicit "authoritative base" directive — without the
 *    label the model treats it as stray prose and rebuilds fields from recent-scene bias,
 *    dropping established inhabitants/atmosphere that recent actions don't feature.
 * 2. Entries of CONTAINING locations are appended: any other location card whose title or
 *    trigger key (≥3 chars) appears in this card's title or its "Located In:" line. This gives
 *    the generator the wider geography's texture (e.g. regenerating "Royal Suite - Fortress of
 *    Misal" pulls in the Fortress/Misal card with its mixed-peoples truce).
 *
 * `parentBudget` caps the appended parent text so gameplay actions retain most of the 4,000-char
 * storyInformation window.
 */
export function buildLocationContext(card: CardRow, cards: CardRow[], parentBudget = 1200): string {
  if (!card.value) return "";
  let ctx =
    `Current entry for this location (authoritative base — update it with new narrative facts and condense, ` +
    `but NEVER drop established inhabitants, social dynamics, atmosphere, or named details merely because ` +
    `recent scenes do not feature them):\n${card.value}\n\n`;

  const locatedInLine = (card.value.match(/Located In:\s*([^\n\]]+)/i)?.[1] || "");
  const searchSpace = `${card.title || ""} ${locatedInLine}`.toLowerCase();
  if (!searchSpace.trim()) return ctx;

  for (const c of cards) {
    if (c.id === card.id || c.deletedAt || (c.type || "").toLowerCase() !== "location" || !c.value) continue;
    const names = [c.title || "", ...(c.keys || "").split(/[,;]+/)]
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length >= 3);
    if (!names.some((n) => searchSpace.includes(n))) continue;

    const chunk = `Containing location "${c.title || c.keys}" (context only — do not merge into this entry):\n${c.value.slice(0, 600)}\n\n`;
    if (chunk.length > parentBudget) break;
    ctx += chunk;
    parentBudget -= chunk.length;
  }
  return ctx;
}

/**
 * Build the inference request for the Plot Essentials update pass. Story Cards are handled
 * separately, so this is Plot-Essentials-only:
 * the always-in-context central/player characters parsed from the adventure memory block.
 */
export function buildAnalyzeRequest(
  protagonist: string,
  recentActions: CanonicalAction[],
  memory?: string
): InferenceRequest {
  const narrative = recentActions.map((a) => a.text).join("\n");
  const characters = parsePlotEssentials(memory).map((b) => {
    const first = b.name.trim().split(/\s+/)[0];
    return { name: b.name, currentEntry: b.text, source: "plot" as const, type: "character", aliases: first && first !== b.name ? [first] : [] };
  });
  return { protagonist, present: characters.map((c) => c.name), narrative, characters };
}
