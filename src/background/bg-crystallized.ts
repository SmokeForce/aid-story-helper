/** Crystallized long-term memory engine: three-pass distillation (schema Knows, vivid-memory nodes,
 *  and a dedicated Outlook/drift-verdict micro-pass, each a provider generation), reconcile, and
 *  persistence of the rendered card. Extracted from background.ts. */
import { repo, auth, dlog, aidFetch as fetch, broadcastToTabs, isSafeEndpoint, ensureAuth } from "./bg-infra";
import { isTitleUserDeleted } from "../inference/deleted-cards";
import { parseMemoNotes } from "../inference/memoraid-notes";
import { parseProtagonistName, DEFAULT_FORMATTING_MODE, pickCommandTemplate, DEFAULT_CARD_COMMANDS, resolveCommand } from "../inference/card-command";
import { type VividMemoryLogEntry, type CrystallizedArchiveEntry } from "../storage/db";
import { buildCardSave, buildCardCreate, DEFAULT_GQL_QUERIES } from "../inference/writeback";
import { generateCard } from "../inference/native";
import { isCharacterTriggered, type CardRow } from "../shared/types";
import { parseCrystallized, renderCrystallizedEntry, renderCrystallizedEntryScene, effectiveCrystallizedCaps, reinforceAndDecay, reconcile, isWindowDue, isManualWindowReady, distillationWindow, isDistillationSourceCard, buildDistillationBuffer, findCrystallizedCard, parseOutlook, reconcileOutlook, parsePreferences, reconcilePreferences, snapshotTokens, type CrystallizedState, type SchemaItem } from "../inference/crystallized";
import { extractSceneSignal, selectRecalls, presentCastSignature, DEFAULT_RECALL_THRESHOLD } from "../inference/npc-memory-bank";
import { getSceneText } from "./bg-scene";
import { DRIFT_JUDGE_INSTRUCTION, parseDriftVerdict, stripDriftVerdictLine } from "../inference/core-character";

/** Extract one ===HEADER=== section's body from a unified multi-section reply — everything between
 *  the header and the nearest following header (headers may arrive in any order), trimmed. Returns
 *  "" when the header is absent (which is what triggers that section's targeted fallback). */
function extractDelimitedSection(raw: string, header: string, allHeaders: string[]): string {
  const start = raw.indexOf(header);
  if (start === -1) return "";
  const bodyStart = start + header.length;
  let end = raw.length;
  for (const h of allHeaders) {
    if (h === header) continue;
    const idx = raw.indexOf(h, bodyStart);
    if (idx !== -1 && idx < end) end = idx;
  }
  return raw.slice(bodyStart, end).trim();
}

export async function checkCrystallizedUpdates(shortId: string): Promise<string[]> {
  await ensureAuth();
  const updatedNames: string[] = [];
  
  const settings = await repo.getSettings();
  if (!settings || !settings.enableCrystallized) {
    dlog("[Crystallized] Disabled in settings. Skipping check.");
    return updatedNames;
  }
  
  const adv = await repo.getAdventure(shortId);
  if (!adv) {
    dlog("[Crystallized] No adventure metadata found. Skipping check.");
    return updatedNames;
  }
  
  const importantNames = (adv.memoraidCharacters || []).map((name) => name.trim().toLowerCase()).filter(Boolean);
  if (importantNames.length === 0) {
    dlog("[Crystallized] No MemorAID characters configured. Skipping crystallized memory check.");
    return updatedNames;
  }
  
  const cards = await repo.getCards(shortId);
  if (!cards || !cards.length) return updatedNames;
  
  const characterCards = cards.filter((c) => isDistillationSourceCard(c, importantNames));
  
  if (characterCards.length === 0) return updatedNames;
  
  const allActions = await repo.getActions(shortId);
  allActions.sort((a, b) => {
    if (a.createdAt && b.createdAt) return a.createdAt.localeCompare(b.createdAt);
    return 0;
  });
  
  const totalActions = allActions.length;
  const K = adv.crystallizedInterval ?? settings.crystallizedInterval ?? 20;
  const nodeCap = adv.crystallizedNodeCap ?? settings.crystallizedNodeCap ?? 12;
  
  const lastDistilledMap = adv.lastDistilledThrough || {};
  let advChanged = false;
  
  for (const charCard of characterCards) {
    const name = charCard.title || "";
    if (isTitleUserDeleted(adv.userDeletedCards, `${name} - Crystallized`)) {
      // The user deleted this Crystallized card — don't recreate it via distillation.
      dlog(`[Crystallized] Skipping user-deleted Crystallized card for ${name}.`);
      continue;
    }
    const lastThrough = lastDistilledMap[name] || 0;

    if (isWindowDue(totalActions, lastThrough, K)) {
      const window = { start: lastThrough, end: lastThrough + K };

      // Activity gate (NLP, zero-LLM): a character with NO mention anywhere in the window has
      // nothing to distill — running the 4 passes anyway burned 4 LLM calls per absent character
      // per window. Skip AND advance the marker (the window is spent either way; a K-aligned grid
      // must not stall). Their memory state stays frozen while offstage — no new experiences, no
      // crowding-out decay. Manual "Distill now" stays ungated (explicit user intent).
      const windowText = allActions.slice(Math.max(0, window.start), window.end).map((a) => a.text || "").join("\n");
      if (!isCharacterTriggered(windowText, name, charCard.keys || "")) {
        dlog(`[Crystallized] ${name} has no mention in window [${window.start}, ${window.end}] — skipping distillation (marker advanced).`);
        lastDistilledMap[name] = window.end;
        advChanged = true;
        continue;
      }

      dlog(`[Crystallized] Distillation window [${window.start}, ${window.end}] is due for ${name}. Running...`);
      try {
        await runDistillationForNPC(shortId, charCard, window, nodeCap);
        lastDistilledMap[name] = window.end;
        advChanged = true;
        updatedNames.push(name);
      } catch (err) {
        console.error(`[Crystallized] Failed distillation for ${name}:`, err);
      }
    }
  }
  
  if (advChanged) {
    adv.lastDistilledThrough = lastDistilledMap;
    await repo.upsertAdventure(adv);
    invalidateSceneCastGate(shortId); // distilled state changed — force the next scene-aware render
  }

  return updatedNames;
}

// Scene-aware re-save gate: last present-cast signature synced per adventure. A no-op scene (same
// cast as last render) skips the network write entirely. Distillation invalidates it (below) so a
// freshly-distilled state always re-renders on the next turn even if the cast didn't move.
const lastSceneCastSig = new Map<string, string>();
export function invalidateSceneCastGate(shortId: string): void { lastSceneCastSig.delete(shortId); }

/** Re-render each Crystallize-enabled character's card VALUE to reflect who is in the current scene
 *  (§Q scene-aware): scene-present Knows first (characters prioritized), a Recalls block pulled from
 *  the per-NPC memory bank (threshold-gated, floor 0), then Vivid + Outlook — all capped. Reads state
 *  only (never mutates schema/nodes/outlook). Gated on present-cast change; per-card value-diff avoids
 *  redundant writes. Called on the gameplay-update path after checkCrystallizedUpdates. */
export async function refreshSceneAwareCrystallized(shortId: string): Promise<void> {
  const settings = await repo.getSettings();
  if (!settings?.enableCrystallized) return;
  const adv = await repo.getAdventure(shortId);
  if (!adv) return;
  const importantNames = (adv.memoraidCharacters || []).map(n => n.trim().toLowerCase()).filter(Boolean);
  if (!importantNames.length) return;
  const cards = await repo.getCards(shortId);
  if (!cards?.length) return;
  const sourceCards = cards.filter(c => isDistillationSourceCard(c, importantNames));
  if (!sourceCards.length) return;

  // Known-subject tokens (for scene extraction) + character-name tokens (for Knows prioritization).
  const knownTokens = new Set<string>();
  const characterTokens = new Set<string>();
  for (const c of cards) {
    if (c.deletedAt) continue;
    const toks = [String(c.title || ""), ...String(c.keys || "").split(/[,;]+/)].map(t => t.trim().toLowerCase()).filter(Boolean);
    for (const t of toks) {
      knownTokens.add(t);
      if ((c.type || "").toLowerCase() === "character") characterTokens.add(t);
    }
  }

  const sceneText = await getSceneText(shortId);
  const signal = extractSceneSignal(sceneText, knownTokens);
  const sceneTokens = snapshotTokens(sceneText); // content words, for Preferences relevance-matching
  const presentTokens = new Set(signal.presentEntities);
  const protagonist = (adv.protagonistName || "").trim().toLowerCase();
  if (protagonist) presentTokens.add(protagonist); // the anchor is always "present"

  const sig = presentCastSignature(presentTokens);
  if (lastSceneCastSig.get(shortId) === sig) return; // scene cast unchanged since last render — no work
  lastSceneCastSig.set(shortId, sig);

  const caps = effectiveCrystallizedCaps(adv, settings);
  const maxChars = adv.crystallizedEntryMaxChars ?? settings.crystallizedEntryMaxChars ?? 900;
  const now = (await repo.getActions(shortId)).length;
  const isCharacterSubject = (item: SchemaItem) => {
    for (const t of [item.subject, ...(item.aliases || [])].map(s => String(s || "").trim().toLowerCase())) {
      if (characterTokens.has(t)) return true;
    }
    return false;
  };

  await ensureAuth();
  for (const charCard of sourceCards) {
    try {
      const name = charCard.title || "";
      const key = name.toLowerCase();
      const cryst = findCrystallizedCard(cards, name);
      if (!cryst) continue;
      const state = await repo.getCrystallizedState(shortId, key);
      if (!state) continue;
      const blocks = caps.recalls > 0 ? await repo.getNpcMemoryBlocks(shortId, key) : [];
      const recalls = selectRecalls(blocks, signal, { cap: caps.recalls, threshold: DEFAULT_RECALL_THRESHOLD, now })
        .map(b => b.povText);
      const value = renderCrystallizedEntryScene(state, name, {
        maxChars, caps, presentSubjectTokens: presentTokens, recalls, isCharacterSubject, sceneTokens,
      });
      if (value === cryst.value) continue; // this character's scene view didn't change — skip the write

      const updateOp = await repo.getOp("UseAutoSaveStoryCard");
      const updateQuery = updateOp?.query || DEFAULT_GQL_QUERIES.UseAutoSaveStoryCard;
      const updatedCard = { ...cryst, value, description: "" };
      if (auth.sessionToken && isSafeEndpoint(auth.gqlEndpoint)) {
        const saveReq = buildCardSave(auth.gqlEndpoint!, updateQuery, auth.sessionToken!, updatedCard, value);
        const saveRes = await fetch(saveReq.url, { method: "POST", headers: saveReq.headers, body: saveReq.body });
        if (!saveRes.ok) { dlog(`[Crystallized] scene re-save HTTP ${saveRes.status} for ${name}`); continue; }
      }
      await repo.putCards(shortId, [updatedCard]);
      broadcastToTabs({ kind: "approvedCardSync", payload: { ok: true, source: "card", cardId: cryst.id, value, description: "" } });
    } catch (err) {
      console.error(`[Crystallized] scene-aware refresh failed for ${charCard.title}:`, err);
    }
  }
}

async function runDistillationForNPC(
  shortId: string,
  charCard: CardRow,
  window: { start: number; end: number },
  nodeCap: number
): Promise<void> {
  let name = charCard.title || "";
  if (name.toLowerCase().endsWith(" - crystallized")) {
    name = name.replace(/\s*-\s*crystallized$/i, "");
  }
  const cards = await repo.getCards(shortId);
  const settings = await repo.getSettings();
  
  let crystallizedCard = findCrystallizedCard(cards, name);
  if (!crystallizedCard) {
    dlog(`[Crystallized] Creating new crystallized card for ${name}`);
    crystallizedCard = await createCrystallizedCard(shortId, name, charCard.keys || name);
  }
  
  const characterKey = name.trim().toLowerCase();
  // Source of truth is IndexedDB (spec §3). Lazy migration: seed from the card's legacy description once.
  let state = await repo.getCrystallizedState(shortId, characterKey);
  if (!state) {
    state = parseCrystallized(crystallizedCard.description || ""); // {} for a fresh card; parses legacy machinery for an existing one
    state.outlook = state.outlook || [];
    state.preferences = state.preferences || [];
  }
  state.preferences = state.preferences || []; // pre-existing IndexedDB states predate the Preferences layer

  const memCardTitle = `${name} (Memory)`;
  const thoughtsCard = cards.find(
    (x) =>
      !x.deletedAt &&
      ((x.type || "").toLowerCase() === "memory" ||
       (x.type || "").toLowerCase() === "character" ||
       (x.type || "").toLowerCase() === "custom") &&
      (x.title || "").toLowerCase() === memCardTitle.toLowerCase()
  );
  
  const thoughtLog = thoughtsCard ? parseMemoNotes(thoughtsCard.description || "").thoughtLog : [];
  
  const allActions = await repo.getActions(shortId);
  allActions.sort((a, b) => {
    if (a.createdAt && b.createdAt) return a.createdAt.localeCompare(b.createdAt);
    return 0;
  });
  const buffer = buildDistillationBuffer(allActions, thoughtLog, window);
  
  const { state: decayedState, dyingNodeIds } = reinforceAndDecay(state, buffer);
  const priorIds = new Set(decayedState.nodes.map(n => n.id));
  // Forensic archive precedent (Task 6b): reconcile() MUTATES and returns the SAME state object
  // (it filters decayedState.nodes down to vibrancy>0 survivors and rewrites schema text in place),
  // so every "what existed before" snapshot must be captured here, before reconcile() runs.
  // decayedState.nodes still holds decay-killed (vibrancy===0) nodes at this point — reinforceAndDecay
  // only zeroes vibrancy, it never removes nodes; removal happens inside reconcile() itself.
  const priorNodesForArchive = decayedState.nodes.map((n) => ({ id: n.id, snapshot: n.snapshot }));
  const priorKnowsText = new Map(decayedState.schema.map((s) => [s.subject, s.text]));
  const priorOutlookTexts = (decayedState.outlook || []).map((b) => b.text);
  const priorPreferencesTexts = (decayedState.preferences || []).map((b) => b.text);

  
  const adv = await repo.getAdventure(shortId);
  const protagonist = (adv?.protagonistName && adv.protagonistName.trim()) || parseProtagonistName(adv?.memory) || "the player character";

  const bufferText = buffer.map(item => {
    const thoughtStr = item.thoughtText ? `\nThoughts: ${item.thoughtText}` : "";
    return `Action: ${item.actionText}${thoughtStr}`;
  }).join("\n\n");
  
  const dyingNodesList = state.nodes.filter(n => dyingNodeIds.includes(n.id));
  const dyingNodesText = dyingNodesList.map(n => `- Snapshot: ${n.snapshot}`).join("\n");
  
  const combinedContext = [
    "Recent story events and character thoughts:",
    bufferText,
    "",
    dyingNodesText ? "Fading memories (absorb their core lessons/facts into the Schema):\n" + dyingNodesText : ""
  ].filter(Boolean).join("\n").slice(0, 3000);
  
  const formattingMode = settings?.formattingMode || DEFAULT_FORMATTING_MODE;
  const generationTargetCard = { ...crystallizedCard, value: "" };

  const cleanLlmOutputBrackets = (text: string): string => {
    let cleaned = text.trim();
    if (cleaned.startsWith("[")) cleaned = cleaned.slice(1);
    if (cleaned.endsWith("]")) cleaned = cleaned.slice(0, -1);
    if (cleaned.startsWith("{")) cleaned = cleaned.slice(1);
    if (cleaned.endsWith("}")) cleaned = cleaned.slice(0, -1);
    return cleaned.trim();
  };

  // ── Unified distillation call ─────────────────────────────────────────────────
  // Knows / Vivid / Outlook / Preferences are distilled in ONE provider call that emits every ENABLED
  // section under an explicit ===HEADER=== delimiter, which we then parse apart. Each section's opt-out
  // flag (default on) simply drops it from the ask. Each section keeps a distinct, self-contained output
  // format so the downstream reconcile/parse logic is unchanged. Robustness: any enabled section the
  // model fails to emit falls back to a single targeted call using that section's own dedicated
  // template — so a weak local model that drops later sections degrades to a few extra calls, never to
  // silent data loss (a single mega-response risks long Vivid snapshots crowding out the later sections).
  const schemaEnabled = settings?.crystallizedKnowsEnabled !== false;
  const nodesEnabled = settings?.crystallizedNodesEnabled !== false;
  const outlookEnabled = settings?.crystallizedOutlookEnabled !== false;
  const preferencesEnabled = settings?.crystallizedPreferencesEnabled !== false;

  // Drift judge (spec §6) rides the Outlook section ONLY when automatic Story Card updates are enabled
  // (default off) and Outlook itself is on. When off, no verdict is requested/parsed and no
  // ccDriftPending is ever set, so no automatic card-revision proposals are queued.
  const driftJudgeEnabled = !!settings?.enableAutomaticUpdates;

  const currentVividText = decayedState.nodes.filter((n) => n.vibrancy > 0).map((n) => `- Snapshot: ${n.snapshot}`).join("\n");
  const currentOutlookText = (decayedState.outlook || []).map((b) => `- ${b.text}`).join("\n");
  const currentPreferencesText = (decayedState.preferences || []).map((b) => `- ${b.text}`).join("\n");

  const H_KNOWS = "===KNOWS===", H_VIVID = "===VIVID===", H_OUTLOOK = "===OUTLOOK===", H_PREFS = "===PREFERENCES===";
  const allHeaders = [H_KNOWS, H_VIVID, H_OUTLOOK, H_PREFS];

  // Section directives — faithful to the standalone templates' rules AND output formats ("### I. SCHEMA"
  // / "- Snapshot: " / "Beliefs:" / "Preferences:") so the parsers downstream are untouched.
  const KNOWS_DIRECTIVE = `${H_KNOWS}\nUpdate your knowledge of the OTHER people, places, things, topics, foods, media, activities and objects you have formed a genuine opinion, preference or attachment to (the player character {protagonist} is simply one more person). This card is your OWN memory, so NEVER add a line about yourself. For each subject write ONE concise first-person line combining the key facts AND how you currently feel about them, EXACT form "- [Subject] one concise factual+emotional sentence"; when the story develops a subject, rewrite that subject's single line in place — never a second line for the same subject. Begin this section with the line "### I. SCHEMA".`;
  const VIVID_DIRECTIVE = `${H_VIVID}\nGive your COMPLETE updated list of Vivid Memories: ONE concise first-person line per distinct scene — the emotional heart of the moment, feeling over fact, each under 140 characters, prefixed "- Snapshot: ". Merge lines describing the same scene; refine a remembered scene rather than duplicating it; drop what has faded; add a line for each genuinely new scene. Maximum 7 lines.`;
  const OUTLOOK_DIRECTIVE = `${H_OUTLOOK}\nGive your COMPLETE updated list of beliefs: first-person, GENERALIZED views of yourself or the world — NEVER about a specific named person. Re-state (refined) every belief that still holds, drop what no longer holds, add at most 2 new ones only if events genuinely shifted something. Maximum 5. Begin this section with a line reading exactly "Beliefs:" then each belief on its own line prefixed "- ".`;
  const PREFS_DIRECTIVE = `${H_PREFS}\nGive your COMPLETE updated list of concrete personal preferences and quirks — the ordinary TEXTURE of a person: tastes, habits, pet peeves, little rituals, small opinions about particular things. Each line first-person and CONCRETE. Re-state (refined) every preference that still fits, drop those that no longer do, add at most 2 new ones only if events revealed them. FORBIDDEN: emotional themes, life-philosophy, feelings about a specific named person, relationships/trauma/growth. Maximum 6. Begin this section with a line reading exactly "Preferences:" then each preference on its own line prefixed "- ".`;

  const directiveParts: string[] = [];
  if (schemaEnabled) directiveParts.push(KNOWS_DIRECTIVE);
  if (nodesEnabled) directiveParts.push(VIVID_DIRECTIVE);
  if (outlookEnabled) directiveParts.push(OUTLOOK_DIRECTIVE + (driftJudgeEnabled ? DRIFT_JUDGE_INSTRUCTION : ""));
  if (preferencesEnabled) directiveParts.push(PREFS_DIRECTIVE);

  let schemaOutput = "", nodesOutput = "", outlookRaw = "", prefsRaw = "";

  if (directiveParts.length > 0) {
    const unifiedCommand = resolveCommand(
      `You are {{title}}, distilling your own long-term memory after the recent story (the player character is {protagonist}). ` +
      `Read the recent events/thoughts and your current memory state, then output ONLY the requested sections below. Emit each section ` +
      `beginning with its exact ===HEADER=== line on its own line, in the order shown, and write nothing outside these sections.\n\n` +
      directiveParts.join("\n\n"),
      protagonist
    );
    const contextParts = [combinedContext];
    if (nodesEnabled) contextParts.push(`Your current Vivid Memories:\n${currentVividText || "(none yet)"}`);
    if (outlookEnabled) contextParts.push(`Your current Beliefs:\n${currentOutlookText || "(none yet)"}`);
    if (preferencesEnabled) contextParts.push(`Your current Preferences:\n${currentPreferencesText || "(none yet)"}`);
    const unifiedContext = contextParts.join("\n\n").slice(0, 6000);

    dlog(`[Crystallized] Dispatching unified distillation (${directiveParts.length} section(s)) for ${name}...`);
    const rUnified = await generateCard(generationTargetCard, unifiedCommand, formattingMode, { storyInformation: unifiedContext });
    // Fatal like the old Schema/Nodes passes: a failed unified call must NOT advance the window marker
    // (the whole window retries next turn), so let it throw out of runDistillationForNPC.
    if (!rUnified.ok) {
      throw new Error(rUnified.message || "unknown error on unified distillation call");
    }
    const unified = rUnified.value || "";
    dlog(`[Crystallized] Unified distillation output: ${unified}`);
    if (schemaEnabled) schemaOutput = extractDelimitedSection(unified, H_KNOWS, allHeaders);
    if (nodesEnabled) nodesOutput = extractDelimitedSection(unified, H_VIVID, allHeaders);
    if (outlookEnabled) outlookRaw = extractDelimitedSection(unified, H_OUTLOOK, allHeaders);
    if (preferencesEnabled) prefsRaw = extractDelimitedSection(unified, H_PREFS, allHeaders);

    // Per-section fallback: an enabled section the unified reply DROPPED (header absent) gets one
    // targeted call using its own template. An empty-but-present section (e.g. just "Beliefs:") is
    // NOT a drop — it legitimately decays that layer, so we leave it. All fallbacks are non-fatal:
    // the primary unified generation already succeeded, so a flaky supplementary call degrades that
    // one layer rather than re-billing the whole window.
    if (schemaEnabled && !schemaOutput.trim()) {
      try {
        dlog(`[Crystallized] Unified reply dropped KNOWS for ${name} — targeted fallback.`);
        const t = resolveCommand(pickCommandTemplate(settings?.cardCommands?.crystallizedSchema, DEFAULT_CARD_COMMANDS.crystallizedSchema || ""), protagonist);
        const r = await generateCard(generationTargetCard, t, formattingMode, { storyInformation: combinedContext });
        if (r.ok) schemaOutput = r.value;
      } catch (err) { dlog(`[Crystallized] Schema fallback failed for ${name}: ${err}`); }
    }
    if (nodesEnabled && !nodesOutput.trim()) {
      try {
        dlog(`[Crystallized] Unified reply dropped VIVID for ${name} — targeted fallback.`);
        const ctx = [currentVividText ? `Your current Vivid Memories:\n${currentVividText}` : "", combinedContext].filter(Boolean).join("\n\n").slice(0, 4000);
        const t = resolveCommand(pickCommandTemplate(settings?.cardCommands?.crystallizedNodes, DEFAULT_CARD_COMMANDS.crystallizedNodes || ""), protagonist);
        const r = await generateCard(generationTargetCard, t, formattingMode, { storyInformation: ctx });
        if (r.ok) nodesOutput = r.value;
      } catch (err) { dlog(`[Crystallized] Nodes fallback failed for ${name}: ${err}`); }
    }
    if (outlookEnabled && !outlookRaw.trim()) {
      try {
        dlog(`[Crystallized] Unified reply dropped OUTLOOK for ${name} — targeted fallback.`);
        const ctx = [`Your current Beliefs:\n${currentOutlookText || "(none yet)"}`, combinedContext].filter(Boolean).join("\n\n").slice(0, 4000);
        const base = resolveCommand(pickCommandTemplate(settings?.cardCommands?.crystallizedOutlook, DEFAULT_CARD_COMMANDS.crystallizedOutlook || ""), protagonist);
        const r = await generateCard(generationTargetCard, driftJudgeEnabled ? `${base}${DRIFT_JUDGE_INSTRUCTION}` : base, formattingMode, { storyInformation: ctx });
        if (r.ok) outlookRaw = r.value;
      } catch (err) { dlog(`[Crystallized] Outlook fallback failed for ${name}: ${err}`); }
    }
    if (preferencesEnabled && !prefsRaw.trim()) {
      try {
        dlog(`[Crystallized] Unified reply dropped PREFERENCES for ${name} — targeted fallback.`);
        const ctx = [`Your current Preferences:\n${currentPreferencesText || "(none yet)"}`, combinedContext].filter(Boolean).join("\n\n").slice(0, 4000);
        const t = resolveCommand(pickCommandTemplate(settings?.cardCommands?.crystallizedPreferences, DEFAULT_CARD_COMMANDS.crystallizedPreferences || ""), protagonist);
        const r = await generateCard(generationTargetCard, t, formattingMode, { storyInformation: ctx });
        if (r.ok) prefsRaw = r.value;
      } catch (err) { dlog(`[Crystallized] Preferences fallback failed for ${name}: ${err}`); }
    }
  } else {
    dlog(`[Crystallized] All distillation sections disabled for ${name} — pure decay window (no provider call).`);
  }

  // Never-met gate (NLP): the buffer is the GLOBAL story window, so the schema pass sees scenes
  // this owner wasn't in and invents Knows entries for characters they've never met ("Romy knows
  // Juniper"). A BRAND-NEW subject that is a CHARACTER (matches a character card's title/keys) is
  // only admitted when owner and subject co-occur in the window — subject present in a buffer item
  // whose neighborhood (±1 item) also has the owner (owner mentioned in the action, or the item
  // carries the owner's own thought). Places/things (Ravenwood, Seattle) are exempt — secondhand
  // knowledge of the world is plausible; secondhand acquaintance is not. Existing subjects always
  // keep updating (reconcile gates new subjects only).
  const charTokens = new Set<string>();
  for (const c of cards) {
    if (c.deletedAt || (c.type || "").toLowerCase() !== "character") continue;
    for (const t of [String(c.title || ""), ...String(c.keys || "").split(/[,;]+/)]) {
      const tok = t.trim().toLowerCase();
      if (tok) charTokens.add(tok);
    }
  }
  const ownerPresentAt = buffer.map((item) =>
    !!(item.thoughtText && item.thoughtText.trim()) || isCharacterTriggered(item.actionText, name, charCard.keys || ""));
  const allowNewSubject = (subject: string, aliases: string[]): boolean => {
    const isCharacterSubj = [subject, ...aliases].some((s) => charTokens.has(String(s || "").trim().toLowerCase()));
    if (!isCharacterSubj) return true;
    for (let i = 0; i < buffer.length; i++) {
      if (!isCharacterTriggered(buffer[i]!.actionText, subject, "")) continue;
      if (ownerPresentAt[i] || ownerPresentAt[i - 1] || ownerPresentAt[i + 1]) return true;
    }
    dlog(`[Crystallized] Gating NEW subject [${subject}] for ${name} — no co-presence in the window (never met).`);
    return false;
  };

  const cleanSchema = cleanLlmOutputBrackets(schemaOutput);
  const cleanNodes = cleanLlmOutputBrackets(nodesOutput);
  // Belt-and-suspenders: the nodes prompt no longer asks for a "Beliefs:" section, but a model may
  // still emit one — split it off before building combinedOutput so parseLlmOutput's NEW NODES loop
  // (which accepts any "- " line, Snapshot: prefix optional) can never swallow a belief line as a
  // Vivid node snapshot (the pollution would otherwise self-feed via the full-list-rewrite context
  // next pass).
  const nodesSnapshotOnly = cleanNodes.split(/^\s*Beliefs\s*:/im)[0] || "";
  const combinedOutput = `${cleanSchema}\n\n### II. NEW NODES\n${nodesSnapshotOnly}`;

  const reconciledState = reconcile(decayedState, combinedOutput, nodeCap, undefined, name, allowNewSubject);

  // Outlook (beliefs) reconcile — from the OUTLOOK section of the unified call (or its fallback).
  // Non-fatal: a dropped section left outlookRaw empty, so beliefs stay untouched (same as the old
  // dropped-call semantics); a present-but-empty "Beliefs:" section legitimately decays them.
  if (outlookEnabled && outlookRaw.trim()) {
    try {
      let outlookOutput = outlookRaw;
      // Drift judge (spec §6): only when automatic updates are enabled. The verdict is parsed from the
      // RAW section, then the line is DISCARDED — parseOutlook runs on the stripped text so the verdict
      // never persists (not in the card, not in IndexedDB state, not in the archive).
      if (driftJudgeEnabled) {
        const drift = parseDriftVerdict(outlookOutput);
        outlookOutput = stripDriftVerdictLine(outlookOutput);
        if (drift.shifted && drift.field) {
          const advDrift = await repo.getAdventure(shortId);
          if (advDrift) {
            advDrift.ccDriftPending = { ...(advDrift.ccDriftPending || {}), [name]: drift.field };
            await repo.upsertAdventure(advDrift);
            dlog(`[Crystallized] Drift judge: ${name}'s ${drift.field} has durably shifted — bounded revision queued.`);
          }
        }
      }
      const cleanOutlook = cleanLlmOutputBrackets(outlookOutput);
      reconciledState.outlook = reconcileOutlook(reconciledState.outlook || [], parseOutlook(cleanOutlook));
    } catch (err) {
      dlog(`[Crystallized] Outlook reconcile failed for ${name} — leaving outlook state untouched: ${err}`);
    }
  }

  // Preferences (concrete personal texture) reconcile — from the PREFERENCES section. Same non-fatal
  // semantics as Outlook. No drift judge here.
  if (preferencesEnabled && prefsRaw.trim()) {
    try {
      const cleanPrefs = cleanLlmOutputBrackets(prefsRaw);
      reconciledState.preferences = reconcilePreferences(reconciledState.preferences || [], parsePreferences(cleanPrefs));
    } catch (err) {
      dlog(`[Crystallized] Preferences reconcile failed for ${name} — leaving preferences state untouched: ${err}`);
    }
  }

  try {
    const now = new Date().toISOString();
    const archive: CrystallizedArchiveEntry[] = [];
    const survivingIds = new Set(reconciledState.nodes.map((n) => n.id));
    for (const n of priorNodesForArchive) {
      if (!survivingIds.has(n.id)) archive.push({ id: crypto.randomUUID(), shortId, characterKey, kind: "vivid", text: n.snapshot, turn: window.end, archivedAt: now });
    }
    for (const s of reconciledState.schema) {
      const prev = priorKnowsText.get(s.subject);
      if (prev !== undefined && prev !== s.text) archive.push({ id: crypto.randomUUID(), shortId, characterKey, kind: "knows", subject: s.subject, text: prev, turn: window.end, archivedAt: now });
    }
    const survivingBeliefs = new Set((reconciledState.outlook || []).map((b) => b.text));
    for (const t of priorOutlookTexts) {
      if (!survivingBeliefs.has(t)) archive.push({ id: crypto.randomUUID(), shortId, characterKey, kind: "outlook", text: t, turn: window.end, archivedAt: now });
    }
    const survivingPrefs = new Set((reconciledState.preferences || []).map((b) => b.text));
    for (const t of priorPreferencesTexts) {
      if (!survivingPrefs.has(t)) archive.push({ id: crypto.randomUUID(), shortId, characterKey, kind: "preferences", text: t, turn: window.end, archivedAt: now });
    }
    await repo.appendCrystallizedArchive(archive);
  } catch (err) {
    console.error(`[Crystallized] Failed to append archive entries:`, err);
  }

  try {
    const newNodes = reconciledState.nodes.filter(n => !priorIds.has(n.id));
    if (newNodes.length > 0) {
      const logEntries: VividMemoryLogEntry[] = newNodes.map(n => ({
        id: crypto.randomUUID(),
        shortId,
        character: name,
        characterKey: name.toLowerCase(),
        nodeId: n.id,
        snapshot: n.snapshot,
        createdTurn: window.end,
        createdAt: new Date().toISOString()
      }));
      await repo.appendVividMemories(logEntries);
      dlog(`[Crystallized] Appended ${logEntries.length} new vivid memory log entries to db for ${name}`);
    }
  } catch (err) {
    console.error(`[Crystallized] Failed to append vivid memories to log:`, err);
  }
  
  await repo.putCrystallizedState(shortId, characterKey, reconciledState);

  const maxChars = adv?.crystallizedEntryMaxChars ?? settings?.crystallizedEntryMaxChars ?? 900;
  const newValue = renderCrystallizedEntry(reconciledState, name, maxChars);

  const updateOp = await repo.getOp("UseAutoSaveStoryCard");
  const updateQuery = updateOp?.query || DEFAULT_GQL_QUERIES.UseAutoSaveStoryCard;

  const updatedCard = {
    ...crystallizedCard,
    value: newValue,
    description: "" // machinery no longer lives on the card — state is in IndexedDB
  };

  dlog(`[Crystallized] Saving updated crystallized card for ${name}...`);
  const saveReq = buildCardSave(auth.gqlEndpoint!, updateQuery, auth.sessionToken!, updatedCard, newValue);
  const saveRes = await fetch(saveReq.url, { method: "POST", headers: saveReq.headers, body: saveReq.body });
  if (!saveRes.ok) {
    throw new Error(`AI Dungeon GQL UseAutoSaveStoryCard failed: HTTP ${saveRes.status}`);
  }

  await repo.putCards(shortId, [updatedCard]);

  broadcastToTabs({
    kind: "approvedCardSync",
    payload: { ok: true, source: "card", cardId: crystallizedCard.id, value: newValue, description: "" }
  });
}

async function createCrystallizedCard(shortId: string, name: string, keys: string): Promise<CardRow> {
  const createOp = await repo.getOp("SaveQueueStoryCard");
  const createQuery = createOp?.query || DEFAULT_GQL_QUERIES.SaveQueueStoryCard;
  
  const tempId = Math.floor(Math.random() * 1e9).toString();
  const initialValue = `[${name}'s Crystallized Memory\nKnows:\n]`;
  const initialDesc = "[CRYSTALLIZED MEMORY]\n\n### I. SCHEMA\n\n### II. NODES\n";
  
  const newCardRow: CardRow = {
    id: tempId,
    shortId,
    type: "Memory",
    title: `${name} - Crystallized`,
    keys,
    value: initialValue,
    description: initialDesc,
  };
  
  const req = buildCardCreate(auth.gqlEndpoint!, createQuery, auth.sessionToken!, newCardRow, initialValue);
  const res = await fetch(req.url, { method: "POST", headers: req.headers, body: req.body });
  if (!res.ok) {
    throw new Error(`AI Dungeon GQL SaveQueueStoryCard failed: HTTP ${res.status}`);
  }
  
  const resJson = await res.json() as any[];
  const returnedCard = resJson[0]?.data?.updateStoryCard?.storyCard ||
                       resJson[0]?.data?.saveQueueStoryCard?.storyCard ||
                       resJson[0]?.data?.updateStoryCard ||
                       resJson[0]?.data?.saveQueueStoryCard;
  
  const isSuccess = resJson[0]?.data?.updateStoryCard?.success || resJson[0]?.data?.saveQueueStoryCard?.success || returnedCard;
  if (!isSuccess) {
    throw new Error(resJson[0]?.errors?.[0]?.message || "Mutation failed");
  }
  
  const actualId = returnedCard?.id || newCardRow.id;
  const targetCard = { ...newCardRow, id: actualId };
  
  await repo.putCards(shortId, [targetCard]);
  
  broadcastToTabs({
    kind: "approvedCardSync",
    payload: { ok: true, source: "card", cardId: actualId, value: initialValue, description: initialDesc }
  });
  
  return targetCard;
}

export async function runCrystallizedDistillationManual(
  shortId: string,
  cardId: string,
  name: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    await ensureAuth();
    if (!auth.sessionToken || !isSafeEndpoint(auth.gqlEndpoint)) {
      return { ok: false, error: "No session token yet — interact with the page once, then retry." };
    }
    
    const adv = await repo.getAdventure(shortId);
    if (!adv) return { ok: false, error: "Adventure not found." };
    
    const cards = await repo.getCards(shortId);
    if (!cards) return { ok: false, error: "Cards not found." };
    
    let charCard = cards.find(c => c.id === cardId);
    if (!charCard) return { ok: false, error: "Character card not found." };

    // If the selected card is the crystallized card itself, find the parent character card
    if ((charCard.title || "").toLowerCase().endsWith(" - crystallized") || (charCard.type || "").toLowerCase() === "crystallized") {
      const baseName = (charCard.title || "").replace(/\s*-\s*crystallized$/i, "");
      const parentCard = cards.find(c =>
        !c.deletedAt &&
        ((c.type || "").toLowerCase() === "character" || (c.type || "").toLowerCase() === "custom") &&
        (c.title || "").toLowerCase() === baseName.toLowerCase()
      );
      if (parentCard) {
        charCard = parentCard;
      }
    }
    
    const allActions = await repo.getActions(shortId);
    allActions.sort((a, b) => {
      if (a.createdAt && b.createdAt) return a.createdAt.localeCompare(b.createdAt);
      return 0;
    });
    
    const totalActions = allActions.length;
    const lastDistilledMap = adv.lastDistilledThrough || {};
    const lastThrough = lastDistilledMap[name] || 0;
    
    const settings = await repo.getSettings();
    const K = adv.crystallizedInterval ?? settings?.crystallizedInterval ?? 20;
    const nodeCap = adv.crystallizedNodeCap ?? settings?.crystallizedNodeCap ?? 12;
    
    if (!isManualWindowReady(totalActions, lastThrough, K)) {
      return { ok: false, error: `Not enough new actions for a full distillation window yet (need ${lastThrough + K}, have ${totalActions}).` };
    }

    // K-aligned window, never clamped to totalActions — keeps the marker on the grid so the automatic
    // cadence stays in sync (clamping to the current turn was the "dates from 193 not 200" bug).
    const window = distillationWindow(lastThrough, K);

    dlog(`[Crystallized] Running manual distillation window [${window.start}, ${window.end}] for ${name}`);
    await runDistillationForNPC(shortId, charCard, window, nodeCap);

    lastDistilledMap[name] = window.end;
    adv.lastDistilledThrough = lastDistilledMap;
    await repo.upsertAdventure(adv);
    
    return { ok: true };
  } catch (err: any) {
    console.error(`[Crystallized] Manual distillation failed:`, err);
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function saveCrystallizedState(shortId: string, card: CardRow, state: CrystallizedState): Promise<{ ok?: boolean; error?: string }> {
  await ensureAuth();
  if (!auth.sessionToken || !isSafeEndpoint(auth.gqlEndpoint)) {
    return { error: "No session token yet — interact with the page once, then retry." };
  }
  const adv = await repo.getAdventure(shortId);
  const settings = await repo.getSettings();
  const name = (card.title || "").replace(/\s*-\s*crystallized$/i, "").trim() || "Character";
  const characterKey = name.trim().toLowerCase();
  const maxChars = adv?.crystallizedEntryMaxChars ?? settings?.crystallizedEntryMaxChars ?? 900;
  await repo.putCrystallizedState(shortId, characterKey, state);
  const newValue = renderCrystallizedEntry(state, name, maxChars);
  const updateOp = await repo.getOp("UseAutoSaveStoryCard");
  const updateQuery = updateOp?.query || DEFAULT_GQL_QUERIES.UseAutoSaveStoryCard;
  const updated = { ...card, value: newValue, description: "" };
  const saveReq = buildCardSave(auth.gqlEndpoint!, updateQuery, auth.sessionToken!, updated, newValue);
  const saveRes = await fetch(saveReq.url, { method: "POST", headers: saveReq.headers, body: saveReq.body });
  if (!saveRes.ok) return { error: `AI Dungeon save failed: HTTP ${saveRes.status}` };
  const json = await saveRes.json() as any;
  const returnedCard = json?.[0]?.data?.updateStoryCard?.storyCard || json?.[0]?.data?.updateStoryCard;
  const isSuccess = json?.[0]?.data?.updateStoryCard?.success || returnedCard;
  if (!isSuccess) {
    const msgStr = json?.[0]?.data?.updateStoryCard?.message || json?.[0]?.errors?.[0]?.message || "Mutation failed";
    return { error: `AI Dungeon rejected save: ${msgStr}` };
  }
  await repo.putCards(shortId, [updated]);
  broadcastToTabs({ kind: "approvedCardSync", payload: { ok: true, source: "card", cardId: card.id, value: newValue, description: "" } });
  return { ok: true };
}
