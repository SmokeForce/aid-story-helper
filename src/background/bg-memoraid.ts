/** MemorAID engine: per-turn NPC thought generation + thought-card upkeep (wrapper self-heal).
 *  Extracted from background.ts. */
import { repo, auth, dlog, aidFetch as fetch, broadcastToTabs, isSafeEndpoint, ensureAuth } from "./bg-infra";
import { getSceneText, cachedRecentActions, cachedSceneText } from "./bg-scene";
import { buildLifeCardContext } from "../inference/living-characters";
import { buildCardSave, buildCardCreate, DEFAULT_GQL_QUERIES, buildGraphQLMutation, type GqlOperation, type GqlMutationRequest } from "../inference/writeback";
import { isDistillationSourceCard } from "../inference/crystallized";
import { generateCard } from "../inference/native";
import { runBatch } from "../shared/concurrency";
import { countActions, isCharacterTriggered, type CardRow, type Settings } from "../shared/types";
import { resolveCommand, parseProtagonistName, DEFAULT_FORMATTING_MODE, DEFAULT_CARD_COMMANDS } from "../inference/card-command";
import { isTitleUserDeleted } from "../inference/deleted-cards";
import { parseMemoNotes, buildMemoNotes, pushThought, buildThoughtContext, renderThoughtWindow, isOnOffstageCooldown, classifyMemoraidPresence, buildEarsBurningThought, isLeakedPrompt, isWrappedThoughtEntry, repairThoughtEntry, isSceneNovel, parseImportantCharacters } from "../inference/memoraid-notes";

// Scene-novelty snapshots per adventure (module-level, MV3-worker-lifetime — a worker restart just
// means one extra generation, never a missed one).
const lastProcessedSceneText = new Map<string, string>();
import { extractDurableCore } from "../inference/core-character";

const memoraidInFlight = new Set<string>();

/** Test-only: clear per-worker MemorAID state (scene-novelty snapshots + in-flight guard) so tests
 *  that reuse one adventure id don't leak the scene-novelty gate between cases. */
export function __resetMemoraidStateForTests(): void {
  lastProcessedSceneText.clear();
  memoraidInFlight.clear();
  cachedRecentActions.clear();
  cachedSceneText.clear();
}

// MemorAID generation runs from two per-turn paths (the synchronous interception path and the
// debounced post-turn chain). Without a guard they can overlap, doubling generation calls
// and worker load. Skip any invocation while one is already running for the same adventure.
export async function checkMemorAIDUpdates(shortId: string, pendingActionText?: string): Promise<string[]> {
  if (memoraidInFlight.has(shortId)) {
    dlog(`[MemorAID] Generation already in flight for ${shortId}; skipping concurrent invocation.`);
    return [];
  }
  memoraidInFlight.add(shortId);
  try {
    return await checkMemorAIDUpdatesImpl(shortId, pendingActionText);
  } finally {
    memoraidInFlight.delete(shortId);
  }
}

async function checkMemorAIDUpdatesImpl(shortId: string, pendingActionText?: string): Promise<string[]> {
  await ensureAuth();
  const updatedNames: string[] = [];
  const cards = await repo.getCards(shortId);
  dlog(`[MemorAID] checkMemorAIDUpdates called for ${shortId}. Total cards in local DB:`, cards ? cards.length : 0);
  if (!cards || !cards.length) return updatedNames;

  const settings = ((await repo.getSettings()) || {
    formattingMode: DEFAULT_FORMATTING_MODE,
    cardCommands: DEFAULT_CARD_COMMANDS
  }) as Settings;
  dlog(`[MemorAID] Settings loaded:`, (await repo.getSettings()) ? "yes" : "no (using defaults)");

  // 1. MemorAID gate + per-adventure important-characters list (replaces the Configure MemorAID card).
  if (settings.enableMemorAID === false) {
    dlog("[MemorAID] Disabled in settings. Skipping memory updates.");
    return updatedNames;
  }
  const adv0 = await repo.getAdventure(shortId);
  let importantNamesOriginal = (adv0?.memoraidCharacters || []).map((name) => name.trim()).filter(Boolean);
  if (importantNamesOriginal.length === 0) {
    // Fallback to the "Configure MemorAID" card's IMPORTANT_CHARACTERS list — the config mechanism
    // used when a per-adventure roster hasn't been set. Supports both ways of configuring MemorAID.
    const configCard = cards.find((c) => !c.deletedAt && (c.title || "").toLowerCase() === "configure memoraid");
    importantNamesOriginal = parseImportantCharacters(configCard?.description).map((n) => n.trim()).filter(Boolean);
  }
  const importantNames = importantNamesOriginal.map((n) => n.toLowerCase());
  if (importantNames.length === 0) {
    dlog("[MemorAID] No important characters configured for this adventure. Skipping memory updates.");
    return updatedNames;
  }
  dlog(`[MemorAID] Important characters (per-adventure):`, importantNames);

  const allActions = await repo.getActions(shortId);
  allActions.sort((a, b) => {
    if (a.createdAt && b.createdAt) return a.createdAt.localeCompare(b.createdAt);
    return 0;
  });

  const checkActions = [...allActions];
  if (pendingActionText) {
    checkActions.push({
      id: "pending",
      text: pendingActionText,
      type: "do",
      createdAt: new Date().toISOString()
    } as any);
  }

  const latestAction = checkActions[checkActions.length - 1];
  if (!latestAction || !latestAction.text) {
    dlog("[MemorAID] No actions found or latest action has empty text.");
    return updatedNames;
  }
  dlog(`[MemorAID] Latest action text: "${latestAction.text.slice(0, 100)}..."`);

  // Filter out character cards that are NOT memory cards themselves, and must be in the importantNames list!
  // Match by title OR any trigger key (e.g. card titled "Princess Anna Ormecia" with keys "Anna, Princess"
  // matches important name "anna").
  const characterCards = cards.filter((c) => isDistillationSourceCard(c, importantNames));
  dlog(`[MemorAID] Found ${characterCards.length} character cards matching important list:`, characterCards.map(c => c.title));

  // Virtual characters (public parity): an explicitly-configured important character with no Story
  // Card still gets tracked. Synthesize a character entry for each important name not covered by a
  // real card's title/keys, so a character named only in the config list or Plot Essentials (e.g.
  // "Celeste") gets a memory card once they appear in the scene.
  const coveredWords = new Set<string>();
  for (const c of characterCards) {
    for (const t of [c.title || "", ...String(c.keys || "").split(/[,;]+/)]) {
      const tl = t.trim().toLowerCase();
      if (tl) coveredWords.add(tl);
    }
  }
  const virtualCharacters: CardRow[] = [];
  for (const orig of importantNamesOriginal) {
    const lower = orig.toLowerCase();
    if (coveredWords.has(lower)) continue;
    virtualCharacters.push({ id: `virtual-${lower}`, shortId, type: "character", title: orig, keys: lower, value: "" });
  }
  const trackableCharacters = [...characterCards, ...virtualCharacters];

  const memoraidThoughtLookback = Math.max(1, settings?.memoraidThoughtLookback ?? 1); // minimum 1 (the current thought); coerces legacy stored 0
  const thoughtCardLimit = settings?.thoughtCardLimit ?? 2000; // MemorAID Thought Card char-entry cap (panel-configurable)
  // Slice to the last N actions to check presence in the active scene
  const presenceText = await getSceneText(shortId, pendingActionText);

  // Scene-novelty gate (NLP, zero-LLM): a Retry that landed on essentially the same beat — or a
  // duplicate invocation — regenerates every present NPC's thought for a scene that hasn't
  // meaningfully changed. Skip the whole cycle when the scene text is a near-duplicate (Jaccard
  // >= 0.9) of the last one processed; the existing thoughts still describe this moment. The
  // snapshot updates only when a cycle actually PROCEEDS, so successive small drifts are compared
  // against the last real generation, not against each other.
  if (!isSceneNovel(lastProcessedSceneText.get(shortId), presenceText)) {
    dlog(`[MemorAID] Scene is a near-duplicate of the last processed one — skipping thought regeneration.`);
    return updatedNames;
  }
  lastProcessedSceneText.set(shortId, presenceText);

  // presenceText is lowercased for trigger matching; the generation prompt needs the ORIGINAL-case
  // scene so the model reads natural text. Build it from the same presence-lookback window (incl. the
  // pending action).
  const presenceLookback = settings?.memoraidPresenceLookback ?? 5;
  const sceneForGeneration = checkActions.slice(-presenceLookback).map((a) => (a.text || "").trim()).filter(Boolean).join("\n");

  // Check which ones are triggered/present in the active scene lookback window
  const triggered = trackableCharacters.filter((c) => {
    const isTriggered = isCharacterTriggered(presenceText, c.title || "", c.keys || "");
    dlog(`[MemorAID] Character "${c.title}" triggered in scene? ${isTriggered} (keys: "${c.keys}")`);
    return isTriggered;
  });
  if (triggered.length === 0) {
    dlog("[MemorAID] No important characters were triggered in the active scene lookback window.");
    return updatedNames;
  }


  const adv = await repo.getAdventure(shortId);

  // 1. Resolve target memory cards (creating them in a batch if missing)
  const creationsToRun: { character: any; cardRow: CardRow; req: GqlMutationRequest }[] = [];
  const characterToMemCardMap = new Map<string, CardRow>();

  for (const c of triggered) {
    const titleVal = c.title || "";
    const memCardTitle = `${titleVal} (Memory)`;
    const memCardKeys = c.keys || titleVal;

    const existingMemCard = cards.find(
      (x) =>
        ((x.type || "").toLowerCase() === "memory" || (x.type || "").toLowerCase() === "character" || (x.type || "").toLowerCase() === "custom") &&
        !x.deletedAt &&
        (x.title || "").toLowerCase() === memCardTitle.toLowerCase()
    );

    if (existingMemCard) {
      characterToMemCardMap.set(c.id, existingMemCard);
    } else if (isTitleUserDeleted(adv?.userDeletedCards, memCardTitle)) {
      // The user deleted this memory card — don't recreate it (that was the reported regeneration).
      dlog(`[MemorAID] Skipping recreation of user-deleted memory card "${memCardTitle}".`);
      continue;
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
      const req = buildCardCreate(auth.gqlEndpoint!, createQuery, auth.sessionToken!, newCardRow, initialValue);
      creationsToRun.push({ character: c, cardRow: newCardRow, req });
    }
  }

  if (creationsToRun.length > 0) {
    await ensureAuth();
    if (auth.sessionToken && isSafeEndpoint(auth.gqlEndpoint)) {
      dlog(`[MemorAID] Batch creating ${creationsToRun.length} memory cards...`);
      const creationOps: GqlOperation[] = creationsToRun.map(item => JSON.parse(item.req.body)[0]);
      try {
        const batchReq = buildGraphQLMutation(auth.gqlEndpoint!, creationOps, auth.sessionToken!);
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

  const turnNow = countActions(checkActions);
  const cooldownMap: Record<string, number> = adv?.memoraidOffstageCooldown ? { ...adv.memoraidOffstageCooldown } : {};
  let cooldownChanged = false;
  const offstageLookback = settings?.memoraidPresenceLookback ?? 5;
  const generationsToRun: { character: any; targetMemCard: CardRow; prevNotes: any; genCard: CardRow; command: string; formattingMode: string; sceneBlock: string; perCharContext: string; opts?: { storyInformation: string; cachePrefix?: string } }[] = [];
  const generationResults: { character: any; targetMemCard: CardRow; value: string; newDesc: string }[] = [];

  for (const c of triggered) {
    const targetMemCard = characterToMemCardMap.get(c.id);
    if (!targetMemCard) continue;

    if (isOnOffstageCooldown(cooldownMap[(c.title || "").toLowerCase()], turnNow)) {
      dlog(`[MemorAID] ${c.title} on offstage cooldown until turn ${cooldownMap[(c.title || "").toLowerCase()]}. Skipping generation.`);
      continue;
    }

    let needsPruneSave = false;
    const currentDesc = targetMemCard.description || "";
    const prevNotes = parseMemoNotes(currentDesc);
    const prunedDesc = buildMemoNotes(prevNotes);
    
    if (currentDesc !== prunedDesc) {
      dlog(`[MemorAID] Description for ${c.title} is oversized or needs pruning (${currentDesc.length} -> ${prunedDesc.length} chars). Queueing self-healing save.`);
      targetMemCard.description = prunedDesc;
      needsPruneSave = true;
    }

    if (prevNotes.thoughtLog.some(e => e.turn === turnNow)) {
      dlog(`[MemorAID] Already generated thought for turn ${turnNow} for ${c.title}. Skipping generation.`);
      if (needsPruneSave) {
        generationResults.push({
          character: c,
          targetMemCard,
          value: targetMemCard.value || "",
          newDesc: prunedDesc
        });
      }
      continue;
    }

    dlog(`[MemorAID] Queueing memory generation for ${c.title}...`);
    // The provider seam only folds in the persistent story summary (Plot Essentials) via
    // includeStorySummary; it does NOT auto-inject the live scene. So the current-scene window (the
    // actions the character must react to) is injected explicitly here, ahead of the rolling
    // prior-thought context and the character's durable core.
    const sceneBlock = `Current scene (react ONLY to the latest action):\n${sceneForGeneration}`;
    const thoughtContext = buildThoughtContext(prevNotes.thoughtLog, memoraidThoughtLookback, c.title || "Character", 3000);
    // Card→Thoughts anchor: the durable core keeps thoughts in-character.
    const durableCore = extractDurableCore(c.value || "", 400);
    const anchoredContext = durableCore
      ? `${c.title || "This character"}'s nature:\n${durableCore}\n\n${thoughtContext}`
      : thoughtContext;
    const lifeContext = settings?.enableLivingCharacters !== false ? buildLifeCardContext(cards, c.title || "", settings) : "";
    // The scene block is identical for every present character this turn (turn-level
    // sceneForGeneration); the life + anchored context is per-character. Keep them apart so a
    // multi-character turn can send the shared scene as a cache-controlled prefix (decided below).
    const perCharContext = [lifeContext, anchoredContext]
      .filter(Boolean)
      .join("\n\n")
      .trim()
      .slice(0, 4000);

    const template = settings?.cardCommands?.memoraid || DEFAULT_CARD_COMMANDS.memoraid || "";
    const protagonist = (adv?.protagonistName && adv.protagonistName.trim()) || parseProtagonistName(adv?.memory) || "the player character";
    // Bias the model toward the panel's Thought Card char limit (a hard slice below still guarantees it).
    const resolvedCommand = resolveCommand(template, protagonist)
      + `\n\nCRITICAL: The generated thoughts must be strictly under ${thoughtCardLimit} characters in length.`;

    const formattingMode = settings?.formattingMode || DEFAULT_FORMATTING_MODE;

    // Clear the card's current value in the generation payload so the LLM generates
    // a fresh thought reaction for this turn from scratch, without being biased
    // to repeat the previous turn's thoughts and actions.
    const generationTargetCard = { ...targetMemCard, value: "" };
    generationsToRun.push({ character: c, targetMemCard, prevNotes, genCard: generationTargetCard, command: resolvedCommand, formattingMode, sceneBlock, perCharContext });
  }


  if (generationsToRun.length > 0) {
    // A multi-character turn re-uses one identical scene + story summary across every character.
    // Send that shared bulk as a cache-controlled prefix (Claude explicit; OpenAI/Gemini implicit;
    // Ollama KV) so the repeat calls are charged the discounted rate. A single-character turn gets
    // no prefix — there's no second call to amortize Claude's cache-write premium against.
    const useSharedPrefix = generationsToRun.length >= 2;
    for (const item of generationsToRun) {
      item.opts = useSharedPrefix
        ? { storyInformation: item.perCharContext, cachePrefix: item.sceneBlock }
        : { storyInformation: [item.sceneBlock, item.perCharContext].filter(Boolean).join("\n\n").trim().slice(0, 4000) };
    }
    // Ollama serves a single model instance — parallel calls just queue on the GPU, so keep it
    // sequential; cloud providers run the batch concurrently. When a shared prefix is in play we warm
    // it on call #1 (awaited alone) before fanning out, so calls #2..N read the cache instead of each
    // racing to write it. generateCard never throws (it resolves to { ok:false }), so a failed call
    // just yields a skipped character below rather than sinking the batch.
    const concurrency = settings?.provider === "ollama" ? 1 : 4;
    dlog(`[MemorAID] Generating ${generationsToRun.length} memories via the configured provider (concurrency=${concurrency}, sharedPrefix=${useSharedPrefix})...`);
    const genResults = await runBatch(
      generationsToRun,
      concurrency,
      (item) => generateCard(item.genCard, item.command, item.formattingMode, item.opts!),
      useSharedPrefix,
    );
    for (let idx = 0; idx < generationsToRun.length; idx++) {
      const item = generationsToRun[idx]!;
      const parsed = genResults[idx]!;
      if (!parsed.ok) {
        console.error(`[MemorAID] Provider generation failed for ${item.character.title}:`, parsed.message || "unknown error");
        continue;
      }
      const generatedMemory = parsed.value;
      const name = (item.character.title || "Character").trim();
      const cdKey = name.toLowerCase();

      if (classifyMemoraidPresence(generatedMemory) === "offstage" || isLeakedPrompt(generatedMemory)) {
        // Mentioned but not present (e.g. others talking about them): do NOT fabricate an
        // in-scene reaction. Append the canned "ears burning" thought (no extra API call) and
        // put the character on cooldown so the lingering mention can't re-trigger every turn it
        // sits in the lookback window.
        const ebThought = `[${name}'s Thoughts:\n${buildEarsBurningThought()}\n]`;
        const ebLog = pushThought(item.prevNotes.thoughtLog, { turn: turnNow, text: ebThought });
        const ebDesc = buildMemoNotes({ thoughtLog: ebLog });
        let ebEntry = renderThoughtWindow(ebLog, Math.max(memoraidThoughtLookback, 1), name, thoughtCardLimit) || ebThought;
        if (ebEntry.length > thoughtCardLimit) ebEntry = ebEntry.slice(0, thoughtCardLimit - 1).trimEnd() + "]";
        generationResults.push({ character: item.character, targetMemCard: item.targetMemCard, value: ebEntry, newDesc: ebDesc });
        cooldownMap[cdKey] = turnNow + offstageLookback;
        cooldownChanged = true;
        dlog(`[MemorAID] ${name} judged offstage — ears-burning thought + cooldown until turn ${cooldownMap[cdKey]}.`);
        continue;
      }

      if (cooldownMap[cdKey] != null) { delete cooldownMap[cdKey]; cooldownChanged = true; } // genuine presence clears any cooldown

      let inner = generatedMemory.trim();
      inner = inner.replace(/^\s*\[?\s*[^\n\]]*\bThoughts:\s*/i, "");
      inner = inner.replace(/^[\s[]+/, "").replace(/[\s\]]+$/, "").trim();
      // The single new thought block is what gets archived into the THOUGHT LOG.
      const newThought = `[${name}'s Thoughts:\n${inner}\n]`;
      dlog(`[MemorAID] Successfully generated memories for ${item.character.title}: "${newThought}"`);

      const newLog = pushThought(item.prevNotes.thoughtLog, { turn: turnNow, text: newThought });
      const newDesc = buildMemoNotes({ thoughtLog: newLog });
      // Card entry = rolling window of the last N thoughts (newest on top). N=0 ⇒ just the new
      // thought. The window is bounded by N AND by the panel's Thought Card char limit: the
      // window drops its oldest thoughts to fit the budget, then a hard slice guarantees the cap.
      let entryValue = renderThoughtWindow(newLog, Math.max(memoraidThoughtLookback, 1), name, thoughtCardLimit)
        || newThought;
      if (entryValue.length > thoughtCardLimit) entryValue = entryValue.slice(0, thoughtCardLimit - 1).trimEnd() + "]";

      generationResults.push({ character: item.character, targetMemCard: item.targetMemCard, value: entryValue, newDesc });
    }
  }

  const savesToRun: { character: any; targetMemCard: CardRow; value: string; newDesc: string; req: GqlMutationRequest }[] = [];
  const updateOp = await repo.getOp("UseAutoSaveStoryCard");
  const updateQuery = updateOp?.query || DEFAULT_GQL_QUERIES.UseAutoSaveStoryCard;

  for (const item of generationResults) {
    const memCardKeys = item.targetMemCard.keys || item.character.title || "";
    const updatedCard = { ...item.targetMemCard, type: "Memory", keys: memCardKeys, value: item.value, description: item.newDesc };
    const req = buildCardSave(auth.gqlEndpoint!, updateQuery, auth.sessionToken!, updatedCard, item.value);
    savesToRun.push({ character: item.character, targetMemCard: item.targetMemCard, value: item.value, newDesc: item.newDesc, req });
  }

  if (savesToRun.length > 0) {
    await ensureAuth();
    if (auth.sessionToken && isSafeEndpoint(auth.gqlEndpoint)) {
      dlog(`[MemorAID] Batch saving ${savesToRun.length} updated memory cards...`);
      const saveOps: GqlOperation[] = savesToRun.map(item => JSON.parse(item.req.body)[0]);
      try {
        const batchReq = buildGraphQLMutation(auth.gqlEndpoint!, saveOps, auth.sessionToken!);
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
            const updatedCard = { ...item.targetMemCard, type: "Memory", keys: item.targetMemCard.keys || item.character.title || "", value: item.value, description: item.newDesc };
            await repo.putCards(shortId, [updatedCard]);
            dlog(`[MemorAID] Successfully saved updated memories to memory card for ${item.character.title}`);
            updatedNames.push(item.character.title || "Character");

            // Broadcast update to active tabs for UI sync
            broadcastToTabs({
              kind: "approvedCardSync",
              payload: { ok: true, source: "card", cardId: item.targetMemCard.id, value: item.value, description: item.newDesc }
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

  if (cooldownChanged && adv) {
    adv.memoraidOffstageCooldown = cooldownMap;
    await repo.upsertAdventure(adv);
  }

  return updatedNames;
}

/**
 * Self-heal MemorAID memory cards whose ENTRY lost its "[<name>'s Thoughts ...]" wrapper. A raw
 * generated thought ("[- Intake... - Action...]") can end up persisted bare on the card when the
 * follow-up wrapped save is lost (a failed save
 * or an open AID card editor re-asserting the raw). Scans every (memory) card and, for any whose entry
 * is unwrapped, re-renders it from the Notes thought log (rescuing the bare thought into the log) and
 * re-saves the wrapped version. Idempotent: wrapped entries are skipped.
 */
export async function selfHealMemoraidEntries(shortId: string): Promise<void> {
  const settings = await repo.getSettings();
  if (settings?.enableMemorAID === false) return;
  const cards = await repo.getCards(shortId);
  const broken = cards.filter((c) =>
    !c.deletedAt &&
    (c.title || "").toLowerCase().endsWith(" (memory)") &&
    (c.value || "").trim() !== "" &&
    !isWrappedThoughtEntry(c.value)
  );
  if (!broken.length) return;
  await ensureAuth();
  if (!(auth.sessionToken && isSafeEndpoint(auth.gqlEndpoint))) return;
  const lookback = Math.max(1, settings?.memoraidThoughtLookback ?? 1); // minimum 1; coerces legacy stored 0
  const turn = await repo.getActionCount(shortId);
  const updateOp = await repo.getOp("UseAutoSaveStoryCard");
  const updateQuery = updateOp?.query || DEFAULT_GQL_QUERIES.UseAutoSaveStoryCard;
  for (const card of broken) {
    const name = (card.title || "").replace(/\s*\(memory\)$/i, "").trim() || "Character";
    const rep = repairThoughtEntry(name, card.value, card.description, lookback, turn);
    if (!rep.changed) continue;
    const updated = { ...card, value: rep.value, description: rep.description };
    try {
      const saveReq = buildCardSave(auth.gqlEndpoint!, updateQuery, auth.sessionToken!, updated, rep.value);
      const res = await fetch(saveReq.url, { method: "POST", headers: saveReq.headers, body: saveReq.body });
      if (res.ok) {
        await repo.putCards(shortId, [updated]);
        broadcastToTabs({ kind: "approvedCardSync", payload: { ok: true, source: "card", cardId: card.id, value: rep.value, description: rep.description } });
        dlog(`[MemorAID] Self-healed unwrapped entry for ${name}.`);
      } else {
        console.error(`[MemorAID] Self-heal save failed for ${name}: HTTP ${res.status}`);
      }
    } catch (err) {
      console.error(`[MemorAID] Self-heal save threw for ${name}:`, err);
    }
  }
}
