/** Per-NPC memory bank (scene-aware Recalls). Distills the adventure's memory blocks into
 *  NPC-point-of-view recollections stored in our DB (`npcMemoryBank`), forward-auto as new memory
 *  blocks form plus an on-demand backfill. Generation goes through the provider seam
 *  (`inference/native.ts` → `provider.complete`) over bounded `storyInformation`. Tagging/retrieval
 *  live in the pure `inference/npc-memory-bank.ts`. */
import { repo, dlog, ensureAuth, broadcastToTabs } from "./bg-infra";
import { generateCard } from "../inference/native";
import { DEFAULT_FORMATTING_MODE } from "../inference/card-command";
import { isDistillationSourceCard } from "../inference/crystallized";
import { extractBlockTags, deriveBlockId, charactersPresentInWindow, buildNpcMemoryCommand, pruneToCap, orderNativeBlocksNewestFirst, blocksInvolvingCharacter } from "../inference/npc-memory-bank";
import type { NpcMemoryBlock } from "../storage/db";
import type { CardRow } from "../shared/types";

// ---- Side-effectful generation (integration; hand-verified) -----------------------------------

function cleanGenerated(text: string): string {
  let t = String(text || "").trim();
  if (t.startsWith("[")) t = t.slice(1);
  if (t.endsWith("]")) t = t.slice(0, -1);
  return t.trim();
}

/** The source characters eligible for a memory bank (MemorAID-tracked + a valid distillation source). */
async function resolveSourceCards(shortId: string): Promise<Array<{ title: string; keys: string }>> {
  const adv = await repo.getAdventure(shortId);
  const importantNames = (adv?.memoraidCharacters || []).map(n => n.trim().toLowerCase()).filter(Boolean);
  if (!importantNames.length) return [];
  const cards = await repo.getCards(shortId);
  return cards
    .filter(c => isDistillationSourceCard(c, importantNames))
    .map(c => ({ title: (c.title || "").trim(), keys: c.keys || "" }))
    .filter(s => s.title);
}

/** Generate (and persist) one NPC-POV memory block for `characterTitle` from one native block.
 *  Returns the created block on success, or null (skipped/failed). Never throws. */
export async function generateNpcBlock(
  shortId: string,
  characterTitle: string,
  nativeBlock: { actionIds: string[]; text?: string; lastRelevantActionId?: string },
  sources: Array<{ title: string; keys: string }>
): Promise<NpcMemoryBlock | null> {
  try {
    const anchor = { actionId: nativeBlock.lastRelevantActionId || nativeBlock.actionIds[0], actionIds: nativeBlock.actionIds || [] };
    const characterKey = characterTitle.trim().toLowerCase();

    // Bounded context = exactly this native block's actions (never newer — no context bleed).
    const allActions = await repo.getActions(shortId);
    const idIndex = new Map(allActions.map((a, i) => [a.id, i] as const));
    const ids = new Set(anchor.actionIds);
    const windowActions = allActions.filter(a => ids.has(a.id));
    const contextRaw = (windowActions.length ? windowActions : allActions.slice(-8)).map(a => a.text || "").join("\n").slice(0, 3000);
    if (!contextRaw.trim()) return null;
    // Presence guard: only distill a POV block if the character actually appears in this block's
    // actions. Without it, backfilling a sparsely-present NPC would fabricate a POV for scenes they
    // were never in (bank should be proportional to presence, not the whole timeline).
    const selfSource = sources.find(s => s.title.trim().toLowerCase() === characterKey) || { title: characterTitle, keys: "" };
    if (charactersPresentInWindow(contextRaw, [selfSource]).length === 0) {
      dlog(`[AID bg] Skipping ${characterTitle} — not present in native block ${deriveBlockId(anchor)}`);
      return null;
    }
    const storyInformation = `[storyInformation]\n${contextRaw}\n[/storyInformation]`;

    // Provider generation has no card-autosave side effect, so no neutral handler card is needed:
    // the target is a synthetic card carrying the NPC name for {{title}} resolution.
    const target: CardRow = { id: "", shortId, type: "custom", title: characterTitle, keys: "", value: "" };
    const settings = await repo.getSettings();
    const formattingMode = settings?.formattingMode || DEFAULT_FORMATTING_MODE;

    const r = await generateCard(target, buildNpcMemoryCommand(characterTitle), formattingMode, { storyInformation, includeStorySummary: false });
    if (!r.ok) { dlog(`[AID bg] npc-memory gen failed for ${characterTitle}:`, r.message); return null; }

    return await storeNpcBlockFromPov(shortId, characterTitle, anchor, r.value, sources, idIndex);
  } catch (err) {
    dlog(`[AID bg] generateNpcBlock error for ${characterTitle}:`, err);
    return null;
  }
}

/** Tag + persist a single NPC memory block from an already-generated POV recollection. Shared by the
 *  standalone generation path and the combined memory-block-regeneration pass (which produces every
 *  present NPC's POV in the SAME provider call as the block summary — no re-sending the block context
 *  once per NPC). Returns the stored block, or null if the POV was empty. */
export async function storeNpcBlockFromPov(
  shortId: string,
  characterTitle: string,
  anchor: { actionId?: string; actionIds: string[] },
  rawPov: string,
  sources: Array<{ title: string; keys: string }>,
  idIndex?: Map<string, number>
): Promise<NpcMemoryBlock | null> {
  const povText = cleanGenerated(rawPov);
  if (!povText) return null;
  const characterKey = characterTitle.trim().toLowerCase();

  const knownTokens = new Set(
    sources.flatMap(s => [s.title, ...String(s.keys || "").split(/[,;]+/)])
      .map(t => t.trim().toLowerCase()).filter(Boolean)
  );
  const { entities, keywords } = extractBlockTags(povText, knownTokens);

  const index = idIndex || new Map((await repo.getActions(shortId)).map((a, i) => [a.id, i] as const));
  const indices = anchor.actionIds.map(id => index.get(id)).filter((n): n is number => n !== undefined);
  const turnStart = indices.length ? Math.min(...indices) : 0;
  const turnEnd = indices.length ? Math.max(...indices) : 0;

  const block: NpcMemoryBlock = {
    shortId, characterKey, blockId: deriveBlockId(anchor), sourceAnchor: anchor,
    povText, entities, keywords, turnStart, turnEnd, createdAt: new Date().toISOString(),
  };
  await repo.putNpcMemoryBlock(block);
  return block;
}

/** The MemorAID-tracked source characters actually PRESENT in a block's action text — the NPCs whose
 *  POV should be distilled for that block. */
export async function presentNpcSourcesForBlock(shortId: string, blockText: string): Promise<Array<{ title: string; keys: string }>> {
  const sources = await resolveSourceCards(shortId);
  if (!sources.length) return [];
  const presentKeys = new Set(charactersPresentInWindow(blockText, sources).map(s => s.trim().toLowerCase()));
  return sources.filter(s => presentKeys.has(s.title.trim().toLowerCase()));
}

/** Max NPC memory-bank blocks generated per backfill button press. */
export const BACKFILL_BATCH = 20;

/** Effective per-NPC stored-memory cap (adv ?? settings ?? 400). */
async function effectiveMemoryCap(shortId: string): Promise<number> {
  const adv = await repo.getAdventure(shortId);
  const settings = await repo.getSettings();
  return adv?.crystallizedNpcMemoryCap ?? settings?.crystallizedNpcMemoryCap ?? 400;
}

/** Delete this NPC's lowest-salience blocks so the store holds at most `cap`. */
async function enforceMemoryCap(shortId: string, characterKey: string, cap: number): Promise<void> {
  const blocks = await repo.getNpcMemoryBlocks(shortId, characterKey);
  if (blocks.length <= cap) return;
  const survivors = new Set(pruneToCap(blocks, cap).map(b => b.blockId));
  for (const b of blocks) if (!survivors.has(b.blockId)) await repo.deleteNpcMemoryBlock(shortId, characterKey, b.blockId);
}

/** Regenerate one existing NPC memory block's POV (re-runs generation over its source native block,
 *  upserting by blockId). Returns the new block. */
export async function regenerateNpcMemoryBlock(shortId: string, characterTitle: string, blockId: string): Promise<{ block?: NpcMemoryBlock; error?: string }> {
  const characterKey = characterTitle.trim().toLowerCase();
  const existing = (await repo.getNpcMemoryBlocks(shortId, characterKey)).find(b => b.blockId === blockId);
  if (!existing) return { error: "Memory block not found." };
  const sources = await resolveSourceCards(shortId);
  const nativeBlock = { actionIds: existing.sourceAnchor.actionIds, lastRelevantActionId: existing.sourceAnchor.actionId };
  const block = await generateNpcBlock(shortId, characterTitle, nativeBlock, sources);
  if (!block) return { error: "Regeneration failed (no output or character not present in that block)." };
  return { block };
}

/** Forward-auto: for a freshly-formed native memory block, generate NPC-POV blocks for each source
 *  character present in that block, then prune to the stored-memory cap. Gated on enableCrystallized
 *  upstream. Presence is decided by generateNpcBlock's own guard over the block's ACTION text (which
 *  runs BEFORE any LLM call) — NOT the native SUMMARY, which compresses to pronouns and would
 *  false-negative a present character (the asymmetry that left backfill working but auto-updates not). */
export async function generateNpcBlocksForNewNativeBlock(
  shortId: string,
  nativeBlock: { actionIds: string[]; text?: string; lastRelevantActionId?: string }
): Promise<void> {
  const sources = await resolveSourceCards(shortId);
  if (!sources.length) return;
  const cap = await effectiveMemoryCap(shortId);
  for (const s of sources) {
    const made = await generateNpcBlock(shortId, s.title, nativeBlock, sources);
    if (made) await enforceMemoryCap(shortId, s.title.trim().toLowerCase(), cap);
  }
}

/** On-demand backfill: generate up to BACKFILL_BATCH missing NPC-POV blocks for `characterTitle`,
 *  NEWEST native blocks first, throttled (~250ms gap). Stops early once the stored-memory cap is
 *  reached. Idempotent by blockId — click again to continue. Returns { generated, remaining }. */
export async function backfillNpcMemories(shortId: string, characterTitle: string): Promise<{ generated: number; remaining: number }> {
  await ensureAuth();
  const adv = await repo.getAdventure(shortId);
  const allActions = await repo.getActions(shortId);
  const allActionIds = allActions.map(a => a.id);
  const actionsById = new Map(allActions.map(a => [a.id, a.text || ""] as const));
  const nativeBlocks = (adv?.memoryBankEntries || []).filter((m: any) => m && m.actionIds && m.actionIds.length);
  if (!nativeBlocks.length) return { generated: 0, remaining: 0 };
  const sources = await resolveSourceCards(shortId);
  const characterKey = characterTitle.trim().toLowerCase();
  const cap = await effectiveMemoryCap(shortId);

  // Only backfill blocks where the character actually appears — a sparsely-present NPC's bank stays
  // proportional to their presence, not the whole timeline.
  const selfSource = sources.find(s => s.title.trim().toLowerCase() === characterKey) || { title: characterTitle, keys: "" };
  const ordered = orderNativeBlocksNewestFirst(blocksInvolvingCharacter(nativeBlocks, actionsById, selfSource), allActionIds);

  let existing = new Set((await repo.getNpcMemoryBlocks(shortId, characterKey)).map(b => b.blockId));
  const missing = ordered.filter(b => !existing.has(deriveBlockId({ actionId: b.lastRelevantActionId || b.actionIds[0], actionIds: b.actionIds })));

  let generated = 0;
  for (const block of missing) {
    if (existing.size >= cap) break; // store full — stop generating
    const made = await generateNpcBlock(shortId, characterTitle, block, sources);
    if (made) {
      generated++;
      existing.add(deriveBlockId({ actionId: block.lastRelevantActionId || block.actionIds[0], actionIds: block.actionIds }));
      // Live progress: the panel splices this new block into the list (no full re-render) + ticks the button.
      broadcastToTabs({ kind: "npcMemoryProgress", shortId, characterTitle, generated, remaining: Math.max(0, missing.length - generated), block: made });
      if (generated >= BACKFILL_BATCH) break;
      await new Promise(r => setTimeout(r, 250));
    }
  }
  await enforceMemoryCap(shortId, characterKey, cap);
  const remaining = Math.max(0, missing.length - generated);
  // Final "done" broadcast — resets the button independently of this call's response reaching the
  // panel (a long backfill can outlive the MV3 worker/response channel, orphaning the reply).
  broadcastToTabs({ kind: "npcMemoryProgress", shortId, characterTitle, generated, remaining, done: true });
  return { generated, remaining };
}
