import { openAidDb, type AdventureMeta, type ActionRow, type VividMemoryLogEntry, type InjectionLogEntry, type CrystallizedArchiveEntry, type NpcMemoryBlock } from "./db";
import type { CanonicalAction, OpRecord, CardRow, Version, Settings, GlobalAsset } from "../shared/types";
import type { CrystallizedState } from "../inference/crystallized";
import type { PhenotypeRecord } from "../inference/phenotype/types";

export type { CrystallizedArchiveEntry, NpcMemoryBlock };

/** Every IndexedDB store, for full backup/restore. */
const BACKUP_STORES = ["adventures", "actions", "operations", "cards", "versions", "settings", "globalAssets", "crystallizedLog", "injectionLog", "crystallizedState", "crystallizedArchive", "phenotype", "npcMemoryBank"] as const;


function byCreatedAt(a: CanonicalAction, b: CanonicalAction): number {
  const ta = a.createdAt ?? "", tb = b.createdAt ?? "";
  if (ta !== tb) return ta < tb ? -1 : 1;
  const na = Number(a.id), nb = Number(b.id);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

const opCache = new Map<string, OpRecord>();
let opCacheInitialized = false;

async function ensureOpCache() {
  if (opCacheInitialized) return;
  try {
    const db = await openAidDb();
    const ops = await db.getAll("operations");
    for (const op of ops) {
      opCache.set(op.operationName, op);
    }
    opCacheInitialized = true;
  } catch (e) {
    console.error("[AID repo] Failed to initialize op cache:", e);
  }
}

export class Repo {
  async upsertAdventure(meta: AdventureMeta): Promise<void> {
    const db = await openAidDb();
    const existing = await db.get("adventures", meta.shortId);
    let title = meta.title;
    if (existing?.title) {
      const isNewGeneric = !title || title === "AI Dungeon" || title === "Untitled Adventure";
      if (isNewGeneric) {
        title = existing.title;
      }
    }
    await db.put("adventures", { 
      createdAt: new Date().toISOString(), 
      ...existing, 
      ...meta, 
      title 
    });
  }

  async getAdventure(shortId: string): Promise<AdventureMeta | undefined> {
    const db = await openAidDb();
    const rec = await db.get("adventures", shortId);
    // Renamed Native/AID-Memory field -> Memory Bank: migrate the legacy `aidMemories` field on a
    // pre-rename record to `memoryBankEntries` (one-time per adventure; persisted so it stops firing).
    if (rec && (rec as any).aidMemories !== undefined && (rec as any).memoryBankEntries === undefined) {
      (rec as any).memoryBankEntries = (rec as any).aidMemories;
      delete (rec as any).aidMemories;
      await db.put("adventures", rec);
    }
    return rec;
  }

  async hideAdventure(shortId: string): Promise<void> {
    const db = await openAidDb();
    const existing = await db.get("adventures", shortId);
    await db.put("adventures", {
      createdAt: new Date().toISOString(),
      ...existing,
      shortId,
      hidden: true
    });
  }

  async unhideAdventure(shortId: string): Promise<void> {
    const db = await openAidDb();
    const existing = await db.get("adventures", shortId);
    if (existing) {
      const { hidden, ...rest } = existing;
      await db.put("adventures", rest);
    }
  }

  async deleteAdventure(shortId: string): Promise<void> {
    const db = await openAidDb();
    const tx = db.transaction(["adventures", "actions", "cards", "versions", "crystallizedLog", "injectionLog", "crystallizedState", "crystallizedArchive", "phenotype", "npcMemoryBank"], "readwrite");
    await tx.objectStore("adventures").delete(shortId);

    const actionKeys = await tx.objectStore("actions").index("by-shortId").getAllKeys(shortId);
    for (const key of actionKeys) {
      await tx.objectStore("actions").delete(key);
    }

    const cardKeys = await tx.objectStore("cards").index("by-shortId").getAllKeys(shortId);
    for (const key of cardKeys) {
      await tx.objectStore("cards").delete(key);
    }

    const versionKeys = await tx.objectStore("versions").index("by-shortId").getAllKeys(shortId);
    for (const key of versionKeys) {
      await tx.objectStore("versions").delete(key);
    }

    const logKeys = await tx.objectStore("crystallizedLog").index("by-shortId").getAllKeys(shortId);
    for (const key of logKeys) await tx.objectStore("crystallizedLog").delete(key);

    const injKeys = await tx.objectStore("injectionLog").index("by-shortId").getAllKeys(shortId);
    for (const key of injKeys) await tx.objectStore("injectionLog").delete(key);

    const csKeys = await tx.objectStore("crystallizedState").index("by-shortId").getAllKeys(shortId);
    for (const key of csKeys) await tx.objectStore("crystallizedState").delete(key);

    const caKeys = await tx.objectStore("crystallizedArchive").index("by-shortId").getAllKeys(shortId);
    for (const key of caKeys) await tx.objectStore("crystallizedArchive").delete(key);

    const phKeys = await tx.objectStore("phenotype").index("by-shortId").getAllKeys(shortId);
    for (const key of phKeys) await tx.objectStore("phenotype").delete(key);

    const nmbKeys = await tx.objectStore("npcMemoryBank").index("by-shortId").getAllKeys(shortId);
    for (const key of nmbKeys) await tx.objectStore("npcMemoryBank").delete(key);

    await tx.done;
  }

  async putActions(shortId: string, actions: CanonicalAction[]): Promise<void> {
    const db = await openAidDb();
    const tx = db.transaction("actions", "readwrite");
    for (const a of actions) await tx.store.put({ ...a, shortId } as ActionRow);
    await tx.done;
  }

  async deleteAction(shortId: string, id: string): Promise<void> {
    const db = await openAidDb();
    await db.delete("actions", [shortId, id]);
  }

  async replaceAllActions(shortId: string, actions: CanonicalAction[]): Promise<void> {
    const db = await openAidDb();
    const tx = db.transaction("actions", "readwrite");
    const keys = await tx.store.index("by-shortId").getAllKeys(shortId);
    for (const key of keys) {
      await tx.store.delete(key);
    }
    for (const a of actions) await tx.store.put({ ...a, shortId } as ActionRow);
    await tx.done;
  }

  async getActions(shortId: string): Promise<CanonicalAction[]> {
    const db = await openAidDb();
    const rows = await db.getAllFromIndex("actions", "by-shortId", shortId);
    return rows.map(({ shortId: _s, ...a }) => a as CanonicalAction).sort(byCreatedAt);
  }

  async getAction(shortId: string, id: string): Promise<CanonicalAction | undefined> {
    const db = await openAidDb();
    const row = await db.get("actions", [shortId, id]);
    if (!row) return undefined;
    const { shortId: _s, ...a } = row;
    return a as CanonicalAction;
  }

  async getActionCount(shortId: string): Promise<number> {
    const db = await openAidDb();
    return db.countFromIndex("actions", "by-shortId", shortId);
  }

  async putOp(rec: OpRecord): Promise<void> {
    const db = await openAidDb();
    await db.put("operations", rec);
    opCache.set(rec.operationName, rec);
  }

  async getOp(operationName: string): Promise<OpRecord | undefined> {
    await ensureOpCache();
    return opCache.get(operationName);
  }

  async getOps(): Promise<OpRecord[]> {
    await ensureOpCache();
    return Array.from(opCache.values());
  }

  async putCards(shortId: string, cards: CardRow[]): Promise<void> {
    const db = await openAidDb(); const tx = db.transaction("cards", "readwrite");
    for (const c of cards) await tx.store.put({ ...c, shortId }); await tx.done;
  }

  async getCards(shortId: string): Promise<CardRow[]> {
    const db = await openAidDb(); return db.getAllFromIndex("cards", "by-shortId", shortId);
  }

  async getAllCards(shortId: string): Promise<CardRow[]> {
    const db = await openAidDb(); return db.getAllFromIndex("cards", "by-shortId", shortId);
  }

  /** Archive (soft-delete) any local card for this adventure whose id is NOT in presentIds.
   *  Self-correcting: a card that reappears is un-archived on its next putCards. */
  async reconcileDeletedCards(shortId: string, presentIds: string[]): Promise<void> {
    const db = await openAidDb();
    const present = new Set(presentIds);
    const tx = db.transaction("cards", "readwrite");
    let cursor = await tx.store.index("by-shortId").openCursor(shortId);
    while (cursor) {
      const c = cursor.value as CardRow;
      if (!present.has(c.id) && c.deletedAt == null) {
        await cursor.update({ ...c, deletedAt: new Date().toISOString() });
      }
      cursor = await cursor.continue();
    }
    await tx.done;
  }

  async putVersion(v: Version): Promise<void> { const db = await openAidDb(); await db.put("versions", v); }

  async deleteVersion(id: string): Promise<void> { const db = await openAidDb(); await db.delete("versions", id); }

  async getVersion(id: string): Promise<Version | undefined> { const db = await openAidDb(); return db.get("versions", id); }

  async getVersions(shortId: string): Promise<Version[]> {
    const db = await openAidDb();
    return (await db.getAllFromIndex("versions", "by-shortId", shortId)).sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  }

  async setVersionStatus(id: string, status: Version["status"]): Promise<void> {
    const db = await openAidDb(); const v = await db.get("versions", id); if (v) await db.put("versions", { ...v, status });
  }

  async setVersionPushed(id: string, pushedAt: string): Promise<void> {
    const db = await openAidDb(); const v = await db.get("versions", id); if (v) await db.put("versions", { ...v, pushedAt });
  }

  async getSettings(): Promise<Settings | undefined> {
    const db = await openAidDb(); const rec = await db.get("settings", "singleton"); if (!rec) return undefined;
    const { _k, ...s } = rec as any;
    const settings = s as Settings;
    if (settings.enableProperNounDetection === undefined && (s as any).enableLocationDetection !== undefined) {
      settings.enableProperNounDetection = (s as any).enableLocationDetection;
      delete (settings as any).enableLocationDetection;
      console.log("[AID repo] Migrating enableLocationDetection ->", settings.enableProperNounDetection, "(enableProperNounDetection).");
      await this.setSettings(settings);
    }
    // Renamed Native/AID-Memory identifiers -> Memory Bank: carry forward the legacy settings key.
    if (settings.autoRegenerateMemoryBankEntry === undefined && (s as any).autoRegenerateNativeMemories !== undefined) {
      settings.autoRegenerateMemoryBankEntry = (s as any).autoRegenerateNativeMemories;
      delete (settings as any).autoRegenerateNativeMemories;
      console.log("[AID repo] Migrating autoRegenerateNativeMemories ->", settings.autoRegenerateMemoryBankEntry, "(autoRegenerateMemoryBankEntry).");
      await this.setSettings(settings);
    }
    // Migration: the former negative-polarity `manualMode` ("suppress automatic updates") toggle is
    // replaced by the positive-polarity `enableAutomaticUpdates` (default OFF). Carry an explicit
    // choice forward: a user who UNchecked manual mode (manualMode === false) wanted automatic
    // updates → true; one who left it checked (true) did not → false. Prefer an already-set new key
    // (if somehow both exist), then drop the stale one. Absent manualMode → no migration → new key
    // stays undefined → reads as off.
    if ((settings as any).manualMode !== undefined) {
      if (settings.enableAutomaticUpdates === undefined) {
        settings.enableAutomaticUpdates = ((settings as any).manualMode === false);
      }
      delete (settings as any).manualMode;
      console.log("[AID repo] Migrating manualMode ->", settings.enableAutomaticUpdates, "(enableAutomaticUpdates).");
      await this.setSettings(settings);
    }
    if (settings.cardCommands?.memoraid) {
      const HISTORICAL_MEMORAID_DEFAULTS = [
        'Generate thoughts for {{title}} in the first-person perspective, capturing their subjective reactions and internal feelings about recent events, especially in relation to {protagonist}. Format the output strictly as a bulleted list inside square brackets, e.g. [\n- thought\n- thought\n]. Write exactly how {{title}} would think in this moment, using their profile and voice. Keep it under 300 characters total.',
        'Generate thoughts for {{title}} in the first-person perspective, capturing their subjective reactions and internal feelings about the recent events, especially in relation to {protagonist}. Format the output strictly as a bulleted list inside square brackets, e.g. [\n- thought\n- thought\n]. Write exactly how {{title}} would think in this moment, using their profile and voice. Keep it under 300 characters total.',
        'Generate {{title}}\'s present, first-person inner thoughts as a short bulleted list, in their own voice and profile. The FIRST bullet must briefly synthesize what just happened that prompted these thoughts (in {{title}}\'s own framing). The remaining bullets are {{title}}\'s reactions and feelings — which may concern {protagonist}, other characters, or unfolding world events, whatever is most on {{title}}\'s mind right now. Do not use markdown or empty lines. Keep it under ~400 characters total. Format as a bulleted list, e.g. [\n- ...\n- ...\n].',
        'Generate {{title}}\'s immediate, first-person thoughts as a short, high-impact bulleted list in their own distinct voice. Follow this strict cognitive progression: 1) Sensory Grounding: What immediate physical/sensory inputs and social cues are they registering (e.g. physical contact, tone, gazes, movements)? 2) Cognitive Dissonance: How does this sensory input conflict with their expectations, social status, or model of {protagonist}? 3) Impulse & Intent: What is their immediate internal impulse or plan of action to resolve this tension? Keep the list under ~400 characters total. Do not use markdown, prefix headers, or empty lines. Format as: [\n- [perception]\n- [dissonance]\n- [impulse]\n].',
        'Generate {{title}}\'s immediate, first-person thoughts as a short, high-impact bulleted list in their own distinct voice. You MUST follow a strict cognitive loop of intake stimuli, thought reaction, and action output, formatting exactly as these three labeled bullets:\n- Intake: [1 sentence describing the direct sensory, physical, or verbal stimulus they are perceiving from {protagonist} or the environment]\n- Thought: [1 sentence describing their internal opinion, cognitive conflict, or feeling about this stimulus]\n- Action: [1 sentence describing their immediate impulse, decision, or plan of action to resolve it]\nDo not use markdown, prefix headers besides the three labels, or empty lines. Wrap the entire response in square brackets: [\n- Intake: ...\n- Thought: ...\n- Action: ...\n].',
        'Generate {{title}}\'s immediate, first-person thoughts as a short, high-impact bulleted list in their own distinct voice. Focus heavily on their specific background, social standing, and behavioral defense mechanisms. For romantic, high-tension, or attraction-based dynamics, express interest through psychological, verbal, or tactical engagement rather than defaulting to physical proximity. Characters must maintain realistic personal space and adhere to their internal boundaries unless a physical escalation is explicitly earned by the immediate narrative context.\n\nYou MUST follow a strict cognitive loop of intake stimuli, thought reaction, and action output, formatting exactly as these three labeled bullets:\n- Intake: [1 sentence describing the direct sensory, physical, or verbal stimulus they are perceiving from {protagonist} or the environment]\n- Thought: [1 sentence describing their internal opinion, cognitive conflict, or feeling about this stimulus]\n- Action: [1 sentence describing their immediate impulse, decision, or plan of action to resolve or advance the interaction]\n\nDo not use markdown, prefix headers besides the three labels, or empty lines. Wrap the entire response in square brackets: [\n- Intake: ...\n- Thought: ...\n- Action: ...\n].',
        'Generate {{title}}\'s immediate, first-person thoughts as a short, high-impact bulleted list in their own distinct voice. Focus heavily on their specific background, social standing, and behavioral defense mechanisms. For romantic, high-tension, or attraction-based dynamics, express interest through psychological, verbal, or tactical engagement rather than defaulting to physical proximity. Characters must maintain realistic personal space and adhere to their internal boundaries unless a physical escalation is explicitly earned by the immediate narrative context.\n\nCRITICAL FOCUS DIRECTIVE: The thoughts generated must be the character\'s reaction strictly and exclusively to the VERY LATEST (the most recent/last) action shown in the Narrative Context. Do not generate thoughts about earlier events, past actions, or characters who have already exited the scene.\n\nYou MUST follow a strict cognitive loop of intake stimuli, thought reaction, and action output, formatting exactly as these three labeled bullets:\n- Intake: [1 sentence describing the direct sensory, physical, or verbal stimulus they are perceiving from {protagonist} or the environment in the latest action]\n- Thought: [1 sentence describing their internal opinion, cognitive conflict, or feeling about this latest stimulus]\n- Action: [1 sentence describing their immediate impulse, decision, or plan of action to resolve or advance the immediate interaction]\n\nDo not use markdown, prefix headers besides the three labels, or empty lines. Wrap the entire response in square brackets: [\n- Intake: ...\n- Thought: ...\n- Action: ...\n].',
        // Pre-example default (had the [none] clause but no worked example / hard rules; weaker models like Gemma dumped a planning scaffold instead of the bracketed block).
        'Generate {{title}}\'s immediate, first-person thoughts as a short, high-impact bulleted list in their own distinct voice. Focus heavily on their specific background, social standing, and behavioral defense mechanisms. For romantic, high-tension, or attraction-based dynamics, express interest through psychological, verbal, or tactical engagement rather than defaulting to physical proximity. Characters must maintain realistic personal space and adhere to their internal boundaries unless a physical escalation is explicitly earned by the immediate narrative context.\n\nCRITICAL FOCUS DIRECTIVE: The thoughts generated must be the character\'s reaction strictly and exclusively to the VERY LATEST (the most recent/last) action shown in the Narrative Context. Do not generate thoughts about earlier events, past actions, or characters who have already exited the scene. If the character {{title}} is not present, mentioned, or active in the latest action, respond with exactly "[none]" (including brackets) and nothing else.\n\nYou MUST follow a strict cognitive loop of intake stimuli, thought reaction, and action output, formatting exactly as these three labeled bullets:\n- Intake: [1 sentence describing the direct sensory, physical, or verbal stimulus they are perceiving from {protagonist} or the environment in the latest action]\n- Thought: [1 sentence describing their internal opinion, cognitive conflict, or feeling about this latest stimulus]\n- Action: [1 sentence describing their immediate impulse, decision, or plan of action to resolve or advance the immediate interaction]\n\nDo not use markdown, prefix headers besides the three labels, or empty lines. Wrap the entire response in square brackets: [\n- Intake: ...\n- Thought: ...\n- Action: ...\n].',
        // Example-based default with <...> placeholders — the placeholders backfired: weak models (Gemma) echoed the placeholder descriptions and/or returned a character profile instead of thoughts.
        'Generate {{title}}\'s immediate, first-person thoughts as a short, high-impact bulleted list in their own distinct voice. Focus heavily on their specific background, social standing, and behavioral defense mechanisms. For romantic, high-tension, or attraction-based dynamics, express interest through psychological, verbal, or tactical engagement rather than defaulting to physical proximity. Characters must maintain realistic personal space and adhere to their internal boundaries unless a physical escalation is explicitly earned by the immediate narrative context.\n\nCRITICAL FOCUS DIRECTIVE: Generate {{title}}\'s reaction strictly and exclusively to the VERY LATEST action shown in the context. Ignore earlier events and characters who have exited the scene. If {{title}} is not present, mentioned, or active in the latest action, output exactly [none] and nothing else.\n\nOUTPUT FORMAT — output ONLY a single bracketed block in EXACTLY this shape, with these three lines and nothing else:\n[\n- Intake: <one sentence: the direct sensory, physical, or verbal stimulus {{title}} perceives from {protagonist} or the environment in the latest action>\n- Thought: <one sentence: {{title}}\'s internal opinion, conflict, or feeling about that stimulus>\n- Action: <one sentence: {{title}}\'s immediate impulse, decision, or next move>\n]\n\nHARD RULES (weaker models tend to break these — do not):\n- Replace each <...> with a single plain sentence in {{title}}\'s own first-person voice. Base every line ONLY on facts present in the provided context; do not invent events, objects, or actions that did not occur.\n- Use ONLY the three labels "- Intake:", "- Thought:", "- Action:". NEVER output any other label such as "Character:", "Goal:", "Stimulus:", or "Latest Action:", and never restate {{title}}\'s profile.\n- Do NOT restate, summarize, plan, or narrate the action, the scene, the character, or your task. Just write the three thoughts.\n- Do NOT use markdown, asterisks (*), bold, headings, indentation, nested lists, or blank lines. Every line starts with "- ".\n- Output nothing before the opening "[" or after the closing "]".\n\nExample of a correctly formatted response (illustrative only — do NOT reuse its wording or facts):\n[\n- Intake: She slides the sealed letter across the table to me without a word.\n- Thought: This is a test of my discretion as much as it is an errand.\n- Action: I take it, tuck it into my sleeve, and hold her gaze evenly.\n]',
        // Prior public-fork default: worked-example + hard-rules 3-line Intake/Thought/Action block
        // (superseded by the two-bullet Intake/Thought + OFFSTAGE lens/monologue template).
        'Generate {{title}}\'s immediate, first-person thoughts as a short, high-impact bulleted list in their own distinct voice. Focus heavily on their specific background, social standing, and behavioral defense mechanisms. For romantic, high-tension, or attraction-based dynamics, express interest through psychological, verbal, or tactical engagement rather than defaulting to physical proximity. Characters must maintain realistic personal space and adhere to their internal boundaries unless a physical escalation is explicitly earned by the immediate narrative context.\n\nCRITICAL FOCUS DIRECTIVE: Generate {{title}}\'s reaction strictly and exclusively to the VERY LATEST action shown in the context. Ignore earlier events and characters who have exited the scene. If {{title}} is not present, mentioned, or active in the latest action, output exactly [none] and nothing else.\n\nOUTPUT: Write EXACTLY three lines, wrapped in square brackets, formatted like the example below — a "- Intake:" line, a "- Thought:" line, and a "- Action:" line. Each line is ONE concrete sentence written in {{title}}\'s own first-person voice reacting to the latest action (the player character is named {protagonist}), grounded only in facts from the provided context.\n\nExample of the required format (illustrative only — write your OWN content; do NOT reuse these words or facts):\n[\n- Intake: She slides the sealed letter across the table to me without a word.\n- Thought: This is a test of my discretion as much as it is an errand.\n- Action: I take it, tuck it into my sleeve, and hold her gaze evenly.\n]\n\nHARD RULES (weaker models break these — do not):\n- Write real, specific content — NOT a description of what each line should contain — and do NOT copy the example.\n- You are writing three momentary thoughts, NOT a character profile. NEVER output a profile field or any label other than "- Intake:", "- Thought:", "- Action:" — no "Appearance:", "Personality:", "Psychology:", "Worldview:", "Dynamic:", "Character:", "Goal:", "Latest Action:", or "Stimulus:".\n- Base every line ONLY on facts in the provided context; do not invent events, objects, or actions.\n- Do NOT restate, summarize, plan, or narrate the action, the scene, the character, or your task.\n- Do NOT use markdown, asterisks (*), bold, headings, indentation, or blank lines. Each line starts with "- ".\n- Output nothing before the opening "[" or after the closing "]".'
      ];
      if (HISTORICAL_MEMORAID_DEFAULTS.includes(settings.cardCommands.memoraid)) {
        console.log("[AID repo] Migrating old memoraid card command to the two-bullet (Intake/Thought + OFFSTAGE) template.");
        const { DEFAULT_CARD_COMMANDS } = await import("../inference/card-command");
        settings.cardCommands.memoraid = DEFAULT_CARD_COMMANDS.memoraid!;
        await this.setSettings(settings);
      }
    }
    if (settings.cardCommands?.location) {
      // Saved copies of superseded location defaults are upgraded to the current default;
      // user-customized templates (anything not matching verbatim) are left untouched.
      const HISTORICAL_LOCATION_DEFAULTS = [
        'Generate an information card entry for {{title}}, a place or location, in an interactive, second-person, present-tense story. Write the entry strictly in the third person about {{title}}: never use "you" or "your". You must begin the entry with specific fields identifying the property Type: and Ownership:. Use clearly labeled fields on their own lines (e.g., Type:, Ownership:, Description:, Features:, Notable Items:) without any markdown formatting or empty lines. Keep the entry high-density, well under the absolute emergency ceiling of 2,000 characters, and do not pad. You must preserve the literal names of specific books, exact instrument models, and unique trophies from the source text; never generalize or substitute them with generic placeholders. Strip out all sensory fluff, decorative adjectives, atmospheric prose, and transient scene recaps. Focus entirely on the location\'s enduring structural features and permanent contents to serve as a lightweight, functional spatial guide for the AI engine. Prioritize ruthless pruning of decorative language to conserve context space.',
        // v1 of the hierarchy-aware template: added Located In: but still stripped all atmosphere/
        // inhabitants flavor, producing sterile inventories.
        'Generate an information card entry for {{title}}, a place or location, in an interactive, second-person, present-tense story. Write the entry strictly in the third person about {{title}}: never use "you" or "your". You must begin the entry with specific fields identifying the property Type:, Located In:, and Ownership:. The Located In: field is MANDATORY and must trace the spatial containment hierarchy from the immediate parent outward to the largest relevant container (room > building/structure > settlement/town > region/realm or border), separated by " > ", in the exact form: Located In: [immediate parent structure] > [settlement or town] > [region, realm, or border]. Always reuse the exact names of places already established in the story or on other location cards so hierarchies stay consistent and their triggers fire; if a parent place is not yet named, state the most specific container the narrative supports rather than omitting the field. Use clearly labeled fields on their own lines (e.g., Type:, Located In:, Ownership:, Description:, Features:, Notable Items:) without any markdown formatting or empty lines. Keep the entry high-density, well under the absolute emergency ceiling of 2,000 characters, and do not pad. You must preserve the literal names of specific books, exact instrument models, and unique trophies from the source text; never generalize or substitute them with generic placeholders. Strip out all sensory fluff, decorative adjectives, atmospheric prose, and transient scene recaps. Focus entirely on the location\'s enduring structural features, permanent contents, and its position within the wider geography to serve as a lightweight, functional spatial guide for the AI engine. Prioritize ruthless pruning of decorative language to conserve context space.',
        // v2 of the hierarchy-aware template: added Inhabitants and Atmosphere flavor fields, but lacks the Name: {{title}} requirement
        'Generate an information card entry for {{title}}, a place or location, in an interactive, second-person, present-tense story. Write the entry strictly in the third person about {{title}}: never use "you" or "your". You must begin the entry with specific fields identifying the property Type:, Located In:, and Ownership:. The Located In: field is MANDATORY and must trace the spatial containment hierarchy from the immediate parent outward to the largest relevant container (room > building/structure > settlement/town > region/realm or border), separated by " > ", in the exact form: Located In: [immediate parent structure] > [settlement or town] > [region, realm, or border]. Always reuse the exact names of places already established in the story or on other location cards so hierarchies stay consistent and their triggers fire; if a parent place is not yet named, state the most specific container the narrative supports rather than omitting the field. Then continue with these labeled fields, each on its own line, without markdown or empty lines:\nDescription: what the place IS and its enduring strategic or narrative purpose — what it is suited for and why it matters.\nInhabitants: who lives in, works in, or frequents the place (peoples, professions, factions) and any enduring social dynamic among them (e.g., an uneasy truce).\nAtmosphere: 1-2 sentences on the place\'s lasting character and how it is experienced, including defining contrasts (e.g., intimidating from outside but warm and livable within).\nFeatures: permanent structural features and layout.\nNotable Items: specific permanent contents. You must preserve the literal names of specific books, exact instrument models, and unique trophies from the source text; never generalize or substitute them with generic placeholders. Keep the entry high-density and well under the absolute emergency ceiling of 2,000 characters; do not pad. Prune transient scene recaps, story events, and redundant decorative wording, but PRESERVE the enduring flavor that defines the place — its atmosphere, social fabric, and narrative role are required content, not fluff. The entry must serve as both a spatial and a narrative guide for the AI engine.'
      ];
      if (HISTORICAL_LOCATION_DEFAULTS.includes(settings.cardCommands.location)) {
        console.log("[AID repo] Migrating old location card command to the hierarchy-aware (Located In:) template.");
        const { DEFAULT_CARD_COMMANDS } = await import("../inference/card-command");
        settings.cardCommands.location = DEFAULT_CARD_COMMANDS.location!;
        await this.setSettings(settings);
      }
    }
    return settings;
  }

  async setSettings(s: Settings): Promise<void> { const db = await openAidDb(); await db.put("settings", { ...s, _k: "singleton" }); }

  /** True when there are no adventures (a freshly-installed / origin-swapped empty DB). */
  async isDbEmpty(): Promise<boolean> {
    const db = await openAidDb();
    return (await db.count("adventures").catch(() => 0)) === 0;
  }

  /** Full backup of every store — survives the moz-extension UUID change that wipes IndexedDB
   *  when the signed XPI is swapped for a test build. API keys are deliberately STRIPPED from the
   *  settings singleton so the backup file is safe to store/share; the user keeps their existing
   *  keys (see importAll) or re-enters them. All other settings are preserved. */
  async exportAll(): Promise<{ __aidBackup: true; dbVersion: number; exportedAt: string; stores: Record<string, any[]> }> {
    const db = await openAidDb();
    const stores: Record<string, any[]> = {};
    for (const s of BACKUP_STORES) {
      const rows = await (db.getAll as any)(s).catch(() => []);
      stores[s] = s === "settings"
        ? rows.map(({ apiKeys, ...rest }: any) => rest) // never export secrets
        : rows;
    }
    return { __aidBackup: true, dbVersion: 4, exportedAt: new Date().toISOString(), stores };
  }

  /** Restore a backup produced by exportAll. Upserts by key (merges into, never wipes, existing data).
   *  The settings singleton is merged so the device's existing API keys are NEVER clobbered: keys
   *  already on this device win; otherwise any keys present in the backup (legacy backups) are kept. */
  async importAll(data: any): Promise<{ ok?: boolean; error?: string; counts?: Record<string, number> }> {
    if (!data || data.__aidBackup !== true || !data.stores || typeof data.stores !== "object") {
      return { error: "Not a valid AID Story Helper backup file." };
    }
    const db = await openAidDb();
    const counts: Record<string, number> = {};
    const hasKeys = (o: any) => o?.apiKeys && Object.keys(o.apiKeys).length > 0;
    for (const s of BACKUP_STORES) {
      const rows = (data.stores as any)[s];
      if (!Array.isArray(rows) || rows.length === 0) continue;
      const existingSettings = s === "settings" ? await db.get("settings", "singleton").catch(() => null) : null;
      const tx = db.transaction(s as any, "readwrite");
      let n = 0;
      for (const row of rows) {
        const toPut = s === "settings"
          ? { ...row, apiKeys: hasKeys(existingSettings) ? (existingSettings as any).apiKeys : (row.apiKeys ?? {}) }
          : row;
        try { await tx.store.put(toPut); n++; } catch { /* skip malformed row */ }
      }
      await tx.done;
      counts[s] = n;
    }
    return { ok: true, counts };
  }

  async getGlobalAssets(): Promise<GlobalAsset[]> {
    const db = await openAidDb();
    return db.getAll("globalAssets");
  }

  async getGlobalAsset(id: string): Promise<GlobalAsset | undefined> {
    const db = await openAidDb();
    return db.get("globalAssets", id);
  }

  async putGlobalAsset(asset: GlobalAsset): Promise<void> {
    const db = await openAidDb();
    await db.put("globalAssets", asset);
  }

  async deleteGlobalAsset(id: string): Promise<void> {
    const db = await openAidDb();
    await db.delete("globalAssets", id);
  }

  /** Force-archive (soft-delete) specific local cards by id, e.g. tombstoned Life cards the server
   *  still lists. Idempotent: already-deleted cards keep their original deletedAt. */
  async markCardsDeleted(shortId: string, ids: string[]): Promise<void> {
    if (!ids.length) return;
    const db = await openAidDb();
    const want = new Set(ids);
    const tx = db.transaction("cards", "readwrite");
    let cursor = await tx.store.index("by-shortId").openCursor(shortId);
    while (cursor) {
      const c = cursor.value as CardRow;
      if (want.has(c.id) && c.deletedAt == null) {
        await cursor.update({ ...c, deletedAt: new Date().toISOString() });
      }
      cursor = await cursor.continue();
    }
    await tx.done;
  }

  /** Hard-delete soft-deleted mirror rows that duplicate a PRESENT live card by (title, type) under a
   *  different id — leftover rows from an id divergence that would otherwise mask the live card in the
   *  roster. Genuine archives (no live same-title twin) and active rows are left untouched. Versions
   *  are keyed by cardId separately and are not affected. */
  async purgeStaleDeletedDuplicates(shortId: string, live: { id: string; title?: string; type?: string }[]): Promise<void> {
    const norm = (s?: string) => String(s || "").trim().toLowerCase();
    const key = (title?: string, type?: string) => `${norm(title)}::${norm(type) || "character"}`;
    const liveByKey = new Map<string, string>();
    for (const c of live) { const t = norm(c.title); if (t) liveByKey.set(key(c.title, c.type), c.id); }
    const db = await openAidDb();
    const tx = db.transaction("cards", "readwrite");
    let cursor = await tx.store.index("by-shortId").openCursor(shortId);
    while (cursor) {
      const c = cursor.value as CardRow;
      if (c.deletedAt) {
        const liveId = liveByKey.get(key(c.title, c.type));
        if (liveId && liveId !== c.id) await cursor.delete();
      }
      cursor = await cursor.continue();
    }
    await tx.done;
  }

  // ── Crystallized / Living Characters / phenotype / NPC memory stores ──
  async appendVividMemories(entries: VividMemoryLogEntry[]): Promise<void> {
    const db = await openAidDb();
    const tx = db.transaction("crystallizedLog", "readwrite");
    for (const entry of entries) {
      await tx.store.put(entry);
    }
    await tx.done;
  }

  async getVividMemoryLog(shortId: string, characterKey?: string): Promise<VividMemoryLogEntry[]> {
    const db = await openAidDb();
    if (characterKey) {
      return db.getAllFromIndex("crystallizedLog", "by-char", [shortId, characterKey]);
    } else {
      return db.getAllFromIndex("crystallizedLog", "by-shortId", shortId);
    }
  }

  async appendInjectionLog(entries: InjectionLogEntry[]): Promise<void> {
    const db = await openAidDb();
    const tx = db.transaction("injectionLog", "readwrite");
    for (const entry of entries) await tx.store.put(entry);
    await tx.done;
  }

  async getInjectionLog(shortId: string): Promise<InjectionLogEntry[]> {
    const db = await openAidDb();
    return db.getAllFromIndex("injectionLog", "by-shortId", shortId);
  }

  async getCrystallizedState(shortId: string, characterKey: string): Promise<CrystallizedState | undefined> {
    const db = await openAidDb();
    const row = await db.get("crystallizedState", [shortId, characterKey]);
    return row?.state;
  }

  async putCrystallizedState(shortId: string, characterKey: string, state: CrystallizedState): Promise<void> {
    const db = await openAidDb();
    await db.put("crystallizedState", { shortId, characterKey, state });
  }

  async appendCrystallizedArchive(entries: CrystallizedArchiveEntry[]): Promise<void> {
    if (!entries.length) return;
    const db = await openAidDb();
    const tx = db.transaction("crystallizedArchive", "readwrite");
    for (const e of entries) await tx.store.put(e);
    await tx.done;
  }

  async getCrystallizedArchive(shortId: string): Promise<CrystallizedArchiveEntry[]> {
    const db = await openAidDb();
    return db.getAllFromIndex("crystallizedArchive", "by-shortId", shortId);
  }

  async getPhenotype(shortId: string, characterKey: string): Promise<PhenotypeRecord | undefined> {
    const db = await openAidDb();
    return db.get("phenotype", [shortId, characterKey]);
  }

  async putPhenotype(rec: PhenotypeRecord): Promise<void> {
    const db = await openAidDb();
    await db.put("phenotype", rec);
  }

  async getNpcMemoryBlocks(shortId: string, characterKey: string): Promise<NpcMemoryBlock[]> {
    const db = await openAidDb();
    return db.getAllFromIndex("npcMemoryBank", "by-char", [shortId, characterKey]);
  }

  async putNpcMemoryBlock(block: NpcMemoryBlock): Promise<void> {
    const db = await openAidDb();
    await db.put("npcMemoryBank", block);
  }

  async deleteNpcMemoryBlocks(shortId: string): Promise<void> {
    const db = await openAidDb();
    const tx = db.transaction("npcMemoryBank", "readwrite");
    const keys = await tx.store.index("by-shortId").getAllKeys(shortId);
    for (const key of keys) await tx.store.delete(key);
    await tx.done;
  }

  async deleteNpcMemoryBlock(shortId: string, characterKey: string, blockId: string): Promise<void> {
    const db = await openAidDb();
    await db.delete("npcMemoryBank", [shortId, characterKey, blockId]);
  }
}

