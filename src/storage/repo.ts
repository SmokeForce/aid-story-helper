import { openAidDb, type AdventureMeta, type ActionRow } from "./db";
import type { CanonicalAction, OpRecord, CardRow, Version, Settings, GlobalAsset } from "../shared/types";


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
    return db.get("adventures", shortId);
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
    const tx = db.transaction(["adventures", "actions", "cards", "versions"], "readwrite");
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
        'Generate {{title}}\'s immediate, first-person thoughts as a short, high-impact bulleted list in their own distinct voice. Focus heavily on their specific background, social standing, and behavioral defense mechanisms. For romantic, high-tension, or attraction-based dynamics, express interest through psychological, verbal, or tactical engagement rather than defaulting to physical proximity. Characters must maintain realistic personal space and adhere to their internal boundaries unless a physical escalation is explicitly earned by the immediate narrative context.\n\nCRITICAL FOCUS DIRECTIVE: Generate {{title}}\'s reaction strictly and exclusively to the VERY LATEST action shown in the context. Ignore earlier events and characters who have exited the scene. If {{title}} is not present, mentioned, or active in the latest action, output exactly [none] and nothing else.\n\nOUTPUT FORMAT — output ONLY a single bracketed block in EXACTLY this shape, with these three lines and nothing else:\n[\n- Intake: <one sentence: the direct sensory, physical, or verbal stimulus {{title}} perceives from {protagonist} or the environment in the latest action>\n- Thought: <one sentence: {{title}}\'s internal opinion, conflict, or feeling about that stimulus>\n- Action: <one sentence: {{title}}\'s immediate impulse, decision, or next move>\n]\n\nHARD RULES (weaker models tend to break these — do not):\n- Replace each <...> with a single plain sentence in {{title}}\'s own first-person voice. Base every line ONLY on facts present in the provided context; do not invent events, objects, or actions that did not occur.\n- Use ONLY the three labels "- Intake:", "- Thought:", "- Action:". NEVER output any other label such as "Character:", "Goal:", "Stimulus:", or "Latest Action:", and never restate {{title}}\'s profile.\n- Do NOT restate, summarize, plan, or narrate the action, the scene, the character, or your task. Just write the three thoughts.\n- Do NOT use markdown, asterisks (*), bold, headings, indentation, nested lists, or blank lines. Every line starts with "- ".\n- Output nothing before the opening "[" or after the closing "]".\n\nExample of a correctly formatted response (illustrative only — do NOT reuse its wording or facts):\n[\n- Intake: She slides the sealed letter across the table to me without a word.\n- Thought: This is a test of my discretion as much as it is an errand.\n- Action: I take it, tuck it into my sleeve, and hold her gaze evenly.\n]'
      ];
      if (HISTORICAL_MEMORAID_DEFAULTS.includes(settings.cardCommands.memoraid)) {
        console.log("[AID repo] Migrating old memoraid card command to the new Intake-Thought-Action template.");
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
}

