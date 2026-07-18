/**
 * Native-generation guard helpers.
 *
 * AI Dungeon's own "Generate" button for a Story Card entry issues a native card-generation mutation.
 * The interceptor seeds `approvedCards` with every card's value on page load and then reverts any
 * GraphQL response (or outgoing autosave) that carries a *different* value for a known card id — the
 * "don't let AID's autosave silently revert my edits" guard. Left unaware of that native mutation, the
 * guard clobbers a freshly generated value back to the pre-generation snapshot, so native generation
 * appears to do nothing.
 *
 * These pure helpers let the interceptor recognize a native generation and ADOPT its result as the new
 * authoritative value (instead of reverting it), while leaving the guard intact for genuine stale
 * autosave echoes on cards that weren't just generated.
 */

export interface GeneratedCardUpdate {
  id: string;
  value: string;
  description?: string;
}

interface RawOp {
  operationName?: string | null;
  variables?: any;
}

// The GraphQL operation name AI Dungeon uses for native card generation.
const GENERATE_OP = "GenerateStoryCard";

/** Parse a fetch GraphQL body/response (string | object | array) into a flat array of items. */
function normalizeBatch(body: unknown): any[] {
  let parsed: unknown = body;
  if (typeof body === "string") {
    try { parsed = JSON.parse(body); } catch { return []; }
  }
  if (parsed == null) return [];
  return Array.isArray(parsed) ? parsed : [parsed];
}

/** Walk an arbitrary response tree and invoke `cb` on every Story-Card-shaped node (an object with an
 *  `id` that is either `__typename === "StoryCard"` or carries a string `value`). Mirrors the shape
 *  test the interceptor's response-override uses, so adoption and override agree on what a card is. */
function forEachStoryCard(node: unknown, cb: (card: any) => void): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const el of node) forEachStoryCard(el, cb);
    return;
  }
  const obj = node as Record<string, any>;
  if (obj.id && (obj.__typename === "StoryCard" || typeof obj.value === "string")) {
    cb(obj);
  }
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (v && typeof v === "object") forEachStoryCard(v, cb);
  }
}

/** True when the request batch contains a native card-generation mutation. */
export function requestHasNativeCardGeneration(requestBody: unknown): boolean {
  return normalizeBatch(requestBody).some((op: RawOp) => op?.operationName === GENERATE_OP);
}

/** Best-effort extraction of the target Story Card id(s) from a native card-generation request, across
 *  the field shapes AID has used (`variables.input.id`, `variables.storyCardId`, …). Returns [] when no
 *  id can be read — the caller then falls back to a brief blanket override-suppression window. */
export function generatedCardIdsFromRequest(requestBody: unknown): string[] {
  const ids: string[] = [];
  for (const op of normalizeBatch(requestBody) as RawOp[]) {
    if (op?.operationName !== GENERATE_OP) continue;
    const v = op.variables || {};
    const input = v.input || {};
    const cand = v.id ?? v.storyCardId ?? v.cardId
      ?? input.id ?? input.storyCardId ?? input.cardId ?? input.storyCard?.id;
    if (typeof cand === "string" && cand && !ids.includes(cand)) ids.push(cand);
  }
  return ids;
}

/** Given a GraphQL request body and its response, return the Story-Card value updates produced by any
 *  native card-generation operation in the batch — the values the caller should ADOPT as authoritative
 *  so the stale-value guard doesn't revert them. Response[i] is correlated with request[i]; a lone
 *  generation request scans the whole response. Returns [] when the batch has no generation, so
 *  ordinary queries/mutations are never adopted (the guard stays intact for them). */
export function collectGeneratedCardUpdates(requestBody: unknown, responseJson: unknown): GeneratedCardUpdate[] {
  const reqBatch = normalizeBatch(requestBody) as RawOp[];
  if (!reqBatch.some((op) => op?.operationName === GENERATE_OP)) return [];

  const resBatch = normalizeBatch(responseJson);
  const updates: GeneratedCardUpdate[] = [];
  const seen = new Set<string>();
  const collectFrom = (node: unknown) => {
    forEachStoryCard(node, (card) => {
      if (typeof card.id === "string" && card.id && typeof card.value === "string" && !seen.has(card.id)) {
        seen.add(card.id);
        const upd: GeneratedCardUpdate = { id: card.id, value: card.value };
        if (typeof card.description === "string") upd.description = card.description;
        updates.push(upd);
      }
    });
  };

  const onlyGenerate = reqBatch.length === 1 && reqBatch[0]?.operationName === GENERATE_OP;
  if (onlyGenerate) {
    // Lone generation: scan the whole (normalized) response for the returned card.
    collectFrom(resBatch);
  } else {
    for (let i = 0; i < reqBatch.length; i++) {
      if (reqBatch[i]?.operationName === GENERATE_OP) collectFrom(resBatch[i]);
    }
  }
  return updates;
}
