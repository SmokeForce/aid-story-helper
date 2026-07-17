import { describe, it, expect, beforeEach } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { Repo } from "../src/storage/repo";
import { __resetDbForTests } from "../src/storage/db";
import type { OpRecord } from "../src/shared/types";

describe("Repo", () => {
  let repo: Repo;
  beforeEach(() => {
    // fresh in-memory IndexedDB per test for isolation
    (globalThis as any).indexedDB = new IDBFactory();
    __resetDbForTests();
    repo = new Repo();
  });

  it("upserts adventure metadata and reads it back", async () => {
    await repo.upsertAdventure({ shortId: "Z", title: "Queen Bee" });
    const adv = await repo.getAdventure("Z");
    expect(adv?.title).toBe("Queen Bee");
  });

  it("hides and deletes an adventure and its associated data", async () => {
    await repo.upsertAdventure({ shortId: "Z", title: "Queen Bee" });
    await repo.putActions("Z", [{ id: "act1", text: "action text", type: "do" }]);
    await repo.putCards("Z", [{ shortId: "Z", id: "card1", type: "character", title: "Steve", keys: "steve", value: "Bio" }]);
    await repo.putVersion({
      id: "v1",
      shortId: "Z",
      characterName: "Steve",
      entry: "New Bio",
      changeSummary: "Update",
      status: "pending",
      createdAt: "2026-06-13T00:00:00Z",
      source: "card"
    });

    const advBefore = await repo.getAdventure("Z");
    expect(advBefore?.title).toBe("Queen Bee");
    expect(advBefore?.hidden).toBeUndefined();

    await repo.hideAdventure("Z");
    const advHidden = await repo.getAdventure("Z");
    expect(advHidden?.hidden).toBe(true);

    await repo.deleteAdventure("Z");
    const advDeleted = await repo.getAdventure("Z");
    expect(advDeleted).toBeUndefined();

    expect(await repo.getActions("Z")).toEqual([]);
    expect(await repo.getCards("Z")).toEqual([]);
    expect(await repo.getVersions("Z")).toEqual([]);
  });

  it("stores canonical actions per shortId and replaces them on re-save", async () => {
    await repo.replaceAllActions("Z", [{ id: "1", text: "a", type: "do" }]);
    await repo.replaceAllActions("Z", [{ id: "1", text: "a", type: "do" }, { id: "2", text: "b", type: "continue" }]);
    const actions = await repo.getActions("Z");
    expect(actions.map((a) => a.id)).toEqual(["1", "2"]);
  });

  it("isolates actions by shortId", async () => {
    await repo.replaceAllActions("Z", [{ id: "1", text: "a", type: "do" }]);
    await repo.replaceAllActions("Y", [{ id: "9", text: "z", type: "do" }]);
    expect((await repo.getActions("Z")).map((a) => a.id)).toEqual(["1"]);
    expect((await repo.getActions("Y")).map((a) => a.id)).toEqual(["9"]);
  });

  it("exportAll omits API keys but keeps the rest of settings", async () => {
    await repo.setSettings({ provider: "claude", apiKeys: { claude: "sk-secret" }, analyzeWindow: 30 } as any);
    const backup = await repo.exportAll();
    const settingsRows = backup.stores.settings ?? [];
    expect(settingsRows.length).toBe(1);
    expect(settingsRows[0].apiKeys).toBeUndefined();
    // non-secret settings survive the backup
    expect(settingsRows[0].provider).toBe("claude");
    expect(settingsRows[0].analyzeWindow).toBe(30);
    // serialized backup contains no trace of the key
    expect(JSON.stringify(backup)).not.toContain("sk-secret");
  });

  it("importAll never clobbers API keys already on the device", async () => {
    // Device already has keys configured.
    await repo.setSettings({ provider: "claude", apiKeys: { claude: "sk-local" }, analyzeWindow: 20 } as any);
    // A key-free backup (as exportAll now produces) carries other settings changes.
    const backup = {
      __aidBackup: true,
      dbVersion: 4,
      stores: { settings: [{ _k: "singleton", provider: "openai", analyzeWindow: 50 }] },
    };
    const res = await repo.importAll(backup);
    expect(res.ok).toBe(true);

    const settings = await repo.getSettings();
    expect(settings?.apiKeys?.claude).toBe("sk-local"); // preserved, not wiped
    expect(settings?.provider).toBe("openai");           // backup value applied
    expect(settings?.analyzeWindow).toBe(50);
  });
});

describe("Repo v2 per-action rows", () => {
  beforeEach(() => { (globalThis as any).indexedDB = new IDBFactory(); __resetDbForTests(); });

  it("upserts individual actions and returns them ordered by createdAt", async () => {
    const repo = new Repo();
    await repo.putActions("Z", [
      { id: "2", text: "b", type: "continue", createdAt: "2026-05-30T00:00:02Z" },
      { id: "1", text: "a", type: "do", createdAt: "2026-05-30T00:00:01Z" },
    ]);
    const out = await repo.getActions("Z");
    expect(out.map((a) => a.id)).toEqual(["1", "2"]);
  });

  it("replaceAllActions clears prior rows for that shortId (backfill semantics)", async () => {
    const repo = new Repo();
    await repo.putActions("Z", [{ id: "9", text: "old", type: "do", createdAt: "2026-05-30T00:00:09Z" }]);
    await repo.replaceAllActions("Z", [{ id: "1", text: "new", type: "do", createdAt: "2026-05-30T00:00:01Z" }]);
    const out = await repo.getActions("Z");
    expect(out.map((a) => a.id)).toEqual(["1"]);
  });

  it("isolates action rows by shortId", async () => {
    const repo = new Repo();
    await repo.putActions("Z", [{ id: "1", text: "a", type: "do", createdAt: "2026-05-30T00:00:01Z" }]);
    await repo.putActions("Y", [{ id: "1", text: "y", type: "do", createdAt: "2026-05-30T00:00:01Z" }]);
    expect((await repo.getActions("Z")).map((a) => a.text)).toEqual(["a"]);
    expect((await repo.getActions("Y")).map((a) => a.text)).toEqual(["y"]);
  });
});

describe("Repo undo round-trip", () => {
  beforeEach(() => { (globalThis as any).indexedDB = new IDBFactory(); __resetDbForTests(); });
  it("deleteAction removes a row so getActions no longer returns it", async () => {
    const repo = new Repo();
    await repo.putActions("Z", [
      { id: "1", text: "a", type: "do", createdAt: "2026-05-30T00:00:01Z" },
      { id: "2", text: "b", type: "do", createdAt: "2026-05-30T00:00:02Z" },
    ]);
    await repo.deleteAction("Z", "2");
    expect((await repo.getActions("Z")).map((a) => a.id)).toEqual(["1"]);
  });
});

describe("Repo operations store", () => {
  beforeEach(() => { (globalThis as any).indexedDB = new IDBFactory(); __resetDbForTests(); });
  it("stores and retrieves a learned op by operationName", async () => {
    const repo = new Repo();
    const rec: OpRecord = { operationName: "GetGameplayAdventure", query: "query X { y }", variableKeys: ["shortId"], kind: "read", learnedAt: "2026-05-30T00:00:00Z" };
    await repo.putOp(rec);
    expect((await repo.getOp("GetGameplayAdventure"))?.query).toBe("query X { y }");
    expect(await repo.getOp("Nope")).toBeUndefined();
  });
});

describe("Repo settings migration", () => {
  beforeEach(() => { (globalThis as any).indexedDB = new IDBFactory(); __resetDbForTests(); });
  it("automatically migrates historical old defaults for memoraid to the new template", async () => {
    const repo = new Repo();
    const oldTemplate = 'Generate thoughts for {{title}} in the first-person perspective, capturing their subjective reactions and internal feelings about recent events, especially in relation to {protagonist}. Format the output strictly as a bulleted list inside square brackets, e.g. [\n- thought\n- thought\n]. Write exactly how {{title}} would think in this moment, using their profile and voice. Keep it under 300 characters total.';
    await repo.setSettings({
      provider: "claude",
      cardCommands: {
        memoraid: oldTemplate
      }
    } as any);

    const s = await repo.getSettings();
    expect(s?.cardCommands?.memoraid).not.toBe(oldTemplate);
    // Markers of the current default: the two-bullet Intake/Thought lens with the OFFSTAGE presence gate.
    expect(s?.cardCommands?.memoraid).toContain("- Intake:");
    expect(s?.cardCommands?.memoraid).toContain("output exactly OFFSTAGE");
    expect(s?.cardCommands?.memoraid).not.toContain("- Action:");
  });

  it("migrates the legacy manualMode toggle to enableAutomaticUpdates (positive polarity)", async () => {
    const repo = new Repo();
    // A user who UNchecked manual mode wanted automatic updates → enableAutomaticUpdates true.
    await repo.setSettings({ provider: "claude", manualMode: false } as any);
    const s1 = await repo.getSettings();
    expect(s1?.enableAutomaticUpdates).toBe(true);
    expect((s1 as any)?.manualMode).toBeUndefined();
  });

  it("migrates manualMode=true (was suppressing updates) to enableAutomaticUpdates=false", async () => {
    const repo = new Repo();
    await repo.setSettings({ provider: "claude", manualMode: true } as any);
    const s = await repo.getSettings();
    expect(s?.enableAutomaticUpdates).toBe(false);
    expect((s as any)?.manualMode).toBeUndefined();
  });

  it("does not override an already-set enableAutomaticUpdates during manualMode migration", async () => {
    const repo = new Repo();
    // User explicitly unchecked "Enable Automatic Updates" (false) but a stale manualMode lingers.
    await repo.setSettings({ provider: "claude", manualMode: false, enableAutomaticUpdates: false } as any);
    const s = await repo.getSettings();
    expect(s?.enableAutomaticUpdates).toBe(false); // explicit choice wins; not clobbered to true
    expect((s as any)?.manualMode).toBeUndefined();
  });

  it("automatically migrates the historical location default to the hierarchy-aware template", async () => {
    const repo = new Repo();
    const oldTemplate = 'Generate an information card entry for {{title}}, a place or location, in an interactive, second-person, present-tense story. Write the entry strictly in the third person about {{title}}: never use "you" or "your". You must begin the entry with specific fields identifying the property Type: and Ownership:. Use clearly labeled fields on their own lines (e.g., Type:, Ownership:, Description:, Features:, Notable Items:) without any markdown formatting or empty lines. Keep the entry high-density, well under the absolute emergency ceiling of 2,000 characters, and do not pad. You must preserve the literal names of specific books, exact instrument models, and unique trophies from the source text; never generalize or substitute them with generic placeholders. Strip out all sensory fluff, decorative adjectives, atmospheric prose, and transient scene recaps. Focus entirely on the location\'s enduring structural features and permanent contents to serve as a lightweight, functional spatial guide for the AI engine. Prioritize ruthless pruning of decorative language to conserve context space.';
    await repo.setSettings({
      provider: "claude",
      cardCommands: {
        location: oldTemplate
      }
    } as any);

    const s = await repo.getSettings();
    expect(s?.cardCommands?.location).not.toBe(oldTemplate);
    expect(s?.cardCommands?.location).toContain("Located In:");
    expect(s?.cardCommands?.location).toContain("spatial containment hierarchy");
    // v2 additions: flavor fields are mandatory content
    expect(s?.cardCommands?.location).toContain("Inhabitants:");
    expect(s?.cardCommands?.location).toContain("Atmosphere:");
    expect(s?.cardCommands?.location).toContain("Name: {{title}}");
  });

  it("migrates the v1 hierarchy template (no flavor fields) to the current location template", async () => {
    const repo = new Repo();
    const v1 = 'Generate an information card entry for {{title}}, a place or location, in an interactive, second-person, present-tense story. Write the entry strictly in the third person about {{title}}: never use "you" or "your". You must begin the entry with specific fields identifying the property Type:, Located In:, and Ownership:. The Located In: field is MANDATORY and must trace the spatial containment hierarchy from the immediate parent outward to the largest relevant container (room > building/structure > settlement/town > region/realm or border), separated by " > ", in the exact form: Located In: [immediate parent structure] > [settlement or town] > [region, realm, or border]. Always reuse the exact names of places already established in the story or on other location cards so hierarchies stay consistent and their triggers fire; if a parent place is not yet named, state the most specific container the narrative supports rather than omitting the field. Use clearly labeled fields on their own lines (e.g., Type:, Located In:, Ownership:, Description:, Features:, Notable Items:) without any markdown formatting or empty lines. Keep the entry high-density, well under the absolute emergency ceiling of 2,000 characters, and do not pad. You must preserve the literal names of specific books, exact instrument models, and unique trophies from the source text; never generalize or substitute them with generic placeholders. Strip out all sensory fluff, decorative adjectives, atmospheric prose, and transient scene recaps. Focus entirely on the location\'s enduring structural features, permanent contents, and its position within the wider geography to serve as a lightweight, functional spatial guide for the AI engine. Prioritize ruthless pruning of decorative language to conserve context space.';
    await repo.setSettings({
      provider: "claude",
      cardCommands: { location: v1 }
    } as any);

    const s = await repo.getSettings();
    expect(s?.cardCommands?.location).not.toBe(v1);
    expect(s?.cardCommands?.location).toContain("Inhabitants:");
    expect(s?.cardCommands?.location).toContain("Atmosphere:");
    expect(s?.cardCommands?.location).toContain("Name: {{title}}");
  });

  it("migrates the v2 hierarchy template to the current location template", async () => {
    const repo = new Repo();
    const v2 = 'Generate an information card entry for {{title}}, a place or location, in an interactive, second-person, present-tense story. Write the entry strictly in the third person about {{title}}: never use "you" or "your". You must begin the entry with specific fields identifying the property Type:, Located In:, and Ownership:. The Located In: field is MANDATORY and must trace the spatial containment hierarchy from the immediate parent outward to the largest relevant container (room > building/structure > settlement/town > region/realm or border), separated by " > ", in the exact form: Located In: [immediate parent structure] > [settlement or town] > [region, realm, or border]. Always reuse the exact names of places already established in the story or on other location cards so hierarchies stay consistent and their triggers fire; if a parent place is not yet named, state the most specific container the narrative supports rather than omitting the field. Then continue with these labeled fields, each on its own line, without markdown or empty lines:\nDescription: what the place IS and its enduring strategic or narrative purpose — what it is suited for and why it matters.\nInhabitants: who lives in, works in, or frequents the place (peoples, professions, factions) and any enduring social dynamic among them (e.g., an uneasy truce).\nAtmosphere: 1-2 sentences on the place\'s lasting character and how it is experienced, including defining contrasts (e.g., intimidating from outside but warm and livable within).\nFeatures: permanent structural features and layout.\nNotable Items: specific permanent contents. You must preserve the literal names of specific books, exact instrument models, and unique trophies from the source text; never generalize or substitute them with generic placeholders. Keep the entry high-density and well under the absolute emergency ceiling of 2,000 characters; do not pad. Prune transient scene recaps, story events, and redundant decorative wording, but PRESERVE the enduring flavor that defines the place — its atmosphere, social fabric, and narrative role are required content, not fluff. The entry must serve as both a spatial and a narrative guide for the AI engine.';
    await repo.setSettings({
      provider: "claude",
      cardCommands: { location: v2 }
    } as any);

    const s = await repo.getSettings();
    expect(s?.cardCommands?.location).not.toBe(v2);
    expect(s?.cardCommands?.location).toContain("Inhabitants:");
    expect(s?.cardCommands?.location).toContain("Atmosphere:");
    expect(s?.cardCommands?.location).toContain("Name: {{title}}");
  });

  it("leaves a user-customized location command untouched", async () => {
    const repo = new Repo();
    const custom = "My own location template for {{title}} with special rules.";
    await repo.setSettings({
      provider: "claude",
      cardCommands: { location: custom }
    } as any);

    const s = await repo.getSettings();
    expect(s?.cardCommands?.location).toBe(custom);
  });
});

describe("Repo getAction and getActionCount", () => {
  beforeEach(() => { (globalThis as any).indexedDB = new IDBFactory(); __resetDbForTests(); });
  it("retrieves action count and individual actions by ID", async () => {
    const repo = new Repo();
    await repo.putActions("Z", [
      { id: "1", text: "a", type: "do", createdAt: "2026-05-30T00:00:01Z" },
      { id: "2", text: "b", type: "do", createdAt: "2026-05-30T00:00:02Z" },
    ]);
    await repo.putActions("Y", [
      { id: "3", text: "c", type: "do", createdAt: "2026-05-30T00:00:03Z" }
    ]);
    expect(await repo.getActionCount("Z")).toBe(2);
    expect(await repo.getActionCount("Y")).toBe(1);
    expect(await repo.getActionCount("X")).toBe(0);

    const a1 = await repo.getAction("Z", "1");
    expect(a1?.text).toBe("a");
    const a3 = await repo.getAction("Y", "3");
    expect(a3?.text).toBe("c");
    const aNone = await repo.getAction("Z", "3");
    expect(aNone).toBeUndefined();
  });
});

describe("Repo global assets", () => {
  beforeEach(() => { (globalThis as any).indexedDB = new IDBFactory(); __resetDbForTests(); });
  it("performs CRUD operations on global assets", async () => {
    const repo = new Repo();
    const asset1 = {
      id: "asset-1",
      type: "ain" as const,
      title: "Test AIN",
      value: "Do something cool",
      createdAt: "2026-06-13T12:00:00Z"
    };
    const asset2 = {
      id: "asset-2",
      type: "sc" as const,
      title: "Test SC",
      keys: "dragon",
      value: "A fire-breathing beast",
      createdAt: "2026-06-13T12:05:00Z"
    };

    // Verify empty initially
    expect(await repo.getGlobalAssets()).toEqual([]);
    expect(await repo.getGlobalAsset("asset-1")).toBeUndefined();

    // Create / Put
    await repo.putGlobalAsset(asset1);
    await repo.putGlobalAsset(asset2);

    // Retrieve
    expect(await repo.getGlobalAsset("asset-1")).toEqual(asset1);
    const all = await repo.getGlobalAssets();
    expect(all).toHaveLength(2);
    expect(all).toContainEqual(asset1);
    expect(all).toContainEqual(asset2);

    // Update
    const updated1 = { ...asset1, value: "Do something even cooler" };
    await repo.putGlobalAsset(updated1);
    expect(await repo.getGlobalAsset("asset-1")).toEqual(updated1);

    // Delete
    await repo.deleteGlobalAsset("asset-1");
    expect(await repo.getGlobalAsset("asset-1")).toBeUndefined();
    expect(await repo.getGlobalAssets()).toEqual([asset2]);
  });
});

