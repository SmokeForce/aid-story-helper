/** Per-NPC memory bank retrieval (§Q scene-aware Recalls). Pure, local NLP only — no LLM call at
 *  query time. A block is tagged once at generation with the people/places it involves (`entities`)
 *  and its salient terms (`keywords`); at render time we extract the same from the current scene
 *  window and score each block. Entity overlap with the PRESENT cast is the primary signal; keyword
 *  overlap is secondary; recency/salience only break ties. A relevance THRESHOLD means an irrelevant
 *  scene surfaces nothing (floor zero) — the cap only limits the maximum. */
import nlp from "compromise";
import type { NpcMemoryBlock } from "../storage/db";

export const RECALL_ENTITY_WEIGHT = 10;
export const RECALL_KEYWORD_WEIGHT = 1;
export const DEFAULT_RECALL_THRESHOLD = 10; // ≥ one present-entity match by default

const STOPWORDS = new Set([
  "the", "and", "was", "with", "that", "this", "have", "from", "into", "them", "then", "when",
  "what", "your", "you", "her", "him", "his", "she", "they", "there", "here", "were", "been",
]);

function normToken(t: string): string {
  return String(t || "").toLowerCase().replace(/[^a-z'-]/g, "");
}
function uniq(xs: string[]): string[] { return [...new Set(xs)]; }
function escapeRe(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

/** Does `token` (possibly multi-word) appear as a whole word/phrase in `lowerText`? */
function tokenPresent(lowerText: string, token: string): boolean {
  if (!token) return false;
  return new RegExp(`(^|[^a-z'-])${escapeRe(token)}([^a-z'-]|$)`, "i").test(lowerText);
}

/** Split a text's salient terms into known-subject entities vs. general keywords.
 *  Entities are detected by DIRECT word-match against `knownSubjectTokens` — deterministic and
 *  robust, unlike compromise's context-sensitive proper-noun tagging (which misses "Smoke is here").
 *  When `knownSubjectTokens` is empty (no roster yet), fall back to compromise proper nouns.
 *  Keywords come from compromise nouns, minus entities and stopwords. */
export function extractBlockTags(text: string, knownSubjectTokens: Set<string>): { entities: string[]; keywords: string[] } {
  const raw = String(text || "");
  const lower = raw.toLowerCase();
  const doc = nlp(raw);

  let entities: string[];
  if (knownSubjectTokens.size > 0) {
    entities = uniq([...knownSubjectTokens].filter(tok => tokenPresent(lower, tok)));
  } else {
    entities = uniq((doc.match("#ProperNoun").out("array") as string[]).map(normToken).filter(Boolean));
  }
  const entitySet = new Set(entities);
  // .nouns() yields whole noun PHRASES ("the apartment"); split into individual word tokens.
  const nouns = (doc.nouns().out("array") as string[])
    .flatMap(phrase => phrase.split(/\s+/))
    .map(normToken)
    .filter(Boolean);
  const keywords = uniq(nouns.filter(n => n.length >= 3 && !STOPWORDS.has(n) && !entitySet.has(n)));
  return { entities, keywords };
}

/** The scene-side signal: who/what is present, plus the scene's salient terms. */
export function extractSceneSignal(sceneText: string, knownSubjectTokens: Set<string>): { presentEntities: string[]; keywords: string[] } {
  const { entities, keywords } = extractBlockTags(sceneText, knownSubjectTokens);
  return { presentEntities: entities, keywords };
}

function intersectCount(a: string[], b: string[]): number {
  const setB = new Set(b);
  let n = 0;
  for (const x of new Set(a)) if (setB.has(x)) n++;
  return n;
}

/** Relevance score. 0 when no entity AND no keyword overlap. Recency/salience add < 1 so they never
 *  outweigh a genuine content hit — they only order blocks that already cleared the threshold. */
export function scoreBlock(block: NpcMemoryBlock, presentEntities: string[], sceneKeywords: string[], now: number): number {
  const entityHits = intersectCount(block.entities, presentEntities);
  const kwHits = intersectCount(block.keywords, sceneKeywords);
  const base = RECALL_ENTITY_WEIGHT * entityHits + RECALL_KEYWORD_WEIGHT * kwHits;
  if (base === 0) return 0;
  const recency = now > 0 ? Math.min(0.9, block.turnEnd / (now + 1)) : 0;
  const salience = block.salience ? Math.min(0.9, block.salience) : 0;
  return base + recency + salience;
}

/** Top blocks whose score clears `threshold`, most-relevant first (recency breaks ties), capped.
 *  Returns [] when nothing clears the threshold — an irrelevant scene recalls nothing. */
export function selectRecalls(
  blocks: NpcMemoryBlock[],
  signal: { presentEntities: string[]; keywords: string[] },
  opts: { cap: number; threshold: number; now: number }
): NpcMemoryBlock[] {
  if (opts.cap <= 0) return [];
  return blocks
    .map(b => ({ b, s: scoreBlock(b, signal.presentEntities, signal.keywords, opts.now) }))
    .filter(x => x.s >= opts.threshold)
    .sort((x, y) => (y.s - x.s) || (y.b.turnEnd - x.b.turnEnd))
    .slice(0, opts.cap)
    .map(x => x.b);
}

// ---- Generation-side pure helpers (kept here so they're testable without the bg-infra I/O chain) ----

/** Stable upsert id for a bank block, derived from its source native memory block. */
export function deriveBlockId(anchor: { actionId?: string; actionIds: string[] }): string {
  if (anchor.actionId) return anchor.actionId;
  if (anchor.actionIds && anchor.actionIds.length) return anchor.actionIds[0]!;
  return "blk_empty";
}

/** Lowercased titles of the source characters whose title or a trigger key appears as a whole word
 *  in `windowText`. Deterministic word-match (not POS tagging). */
export function charactersPresentInWindow(windowText: string, sources: Array<{ title: string; keys: string }>): string[] {
  const hay = ` ${String(windowText || "").toLowerCase().replace(/[^a-z0-9'-]+/g, " ")} `;
  const out: string[] = [];
  for (const s of sources) {
    const tokens = [s.title, ...String(s.keys || "").split(/[,;]+/)]
      .map(t => t.trim().toLowerCase()).filter(Boolean);
    if (tokens.some(t => hay.includes(` ${t} `))) out.push(s.title.trim().toLowerCase());
  }
  return [...new Set(out)];
}

/** Order native memory blocks newest-first by the position of their latest action id in `actionOrder`
 *  (the adventure's action list). Used to backfill recent history first. */
export function orderNativeBlocksNewestFirst<T extends { actionIds: string[] }>(blocks: T[], actionOrder: string[]): T[] {
  const pos = new Map(actionOrder.map((id, i) => [id, i] as const));
  const rank = (b: T) => Math.max(-1, ...b.actionIds.map(id => pos.get(id) ?? -1));
  return [...blocks].sort((a, b) => rank(b) - rank(a));
}

/** Keep only native memory blocks whose ACTIONS mention the character (title/keys). Keeps a sparsely-
 *  present NPC's memory bank proportional to their actual presence, not the whole timeline — and stops
 *  the bank generator from fabricating a POV for scenes the character was never in. */
export function blocksInvolvingCharacter<T extends { actionIds: string[] }>(
  blocks: T[], actionsById: Map<string, string>, source: { title: string; keys: string }
): T[] {
  return blocks.filter(b => {
    const text = b.actionIds.map(id => actionsById.get(id) || "").join(" ");
    return charactersPresentInWindow(text, [source]).length > 0;
  });
}

/** Salience for cap-pruning: richer blocks (more people/topics involved) are kept over sparse ones. */
export function blockSalience(b: NpcMemoryBlock): number {
  return b.entities.length * 2 + b.keywords.length + (b.salience ? Math.min(1, b.salience) : 0);
}

/** Keep at most `cap` blocks, highest salience first, ties broken by newest turnEnd. Returns the
 *  survivors (caller deletes the rest). Under-cap input is returned unchanged. */
export function pruneToCap(blocks: NpcMemoryBlock[], cap: number): NpcMemoryBlock[] {
  if (cap <= 0) return [];
  if (blocks.length <= cap) return blocks;
  return [...blocks]
    .sort((a, b) => (blockSalience(b) - blockSalience(a)) || (b.turnEnd - a.turnEnd))
    .slice(0, cap);
}

/** Order-independent, normalized signature of a present-cast token set. Two scenes with the same
 *  people present (any order/case) produce the same signature — the gate for scene-aware re-saves. */
export function presentCastSignature(tokens: Set<string>): string {
  return [...new Set([...tokens].map(t => t.toLowerCase().trim()).filter(Boolean))].sort().join("|");
}

/** The NPC-POV summary directive. The NPC name is baked in literally; the `{{title}}` token is left
 *  present as trailing metadata (it resolves to the target card's title at generation time). */
export function buildNpcMemoryCommand(npcName: string): string {
  const n = npcName.trim() || "the character";
  return (
    `Recall the events inside the [storyInformation]...[/storyInformation] tags from ${n}'s point of view. ` +
    `Write 1-2 sentences, first person, past tense — a vivid personal recollection that emphasizes what ${n} felt over what factually happened. ` +
    `Summarize ONLY what is inside those tags; do not reference anything after or outside them. Output only the sentences, nothing else. ` +
    `(source card: {{title}})`
  );
}
