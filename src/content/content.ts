import { mountPanel } from "./panel";
import type { ActionUpdatePayload } from "../shared/types";
import type { BgMessage } from "../background/orchestrator";
import { browser } from "./browser-helper";

// The interceptor runs as a separate MAIN-world content script (manifest), so it installs
// before the page's app boots and beats the page CSP. This script only bridges its
// window.postMessage events to the background.

let activeShortId: string | null = null;
const autoBackfillsInFlight = new Set<string>();

function checkIsPlayUrl(): boolean {
  // NOTE: `/scenario/...` is a published-scenario PREVIEW (Discover), NOT an active adventure —
  // playing a scenario creates a NEW adventure at `/play?adventureId=...`. Treating `/scenario/`
  // as a play page rendered the play tracker on preview pages and registered the scenario id as an
  // empty "Untitled Adventure". Excluded here so preview pages render manager-only and create nothing.
  return location.pathname === "/play" || 
         location.pathname.endsWith("/play") || 
         location.pathname.startsWith("/play/") || 
         location.pathname.startsWith("/adventure/");
}

// shortId from /adventure/{shortId}/... or /play/{shortId} (NOT /scenario/ — that's a preview id).
function currentShortId(): string | null {
  const isPlayUrl = checkIsPlayUrl();
  const m = location.pathname.match(/\/play\/([^/]+)/) || 
            location.pathname.match(/\/adventure\/([^/]+)/);
  if (m) return m[1]!;

  const params = new URLSearchParams(location.search);
  // Only an actual adventure id — NOT scenarioId/scenario (those identify the source scenario,
  // not the played adventure).
  const qId = params.get("adventureId") || params.get("adventure") || params.get("id");
  if (qId) return qId;

  if (isPlayUrl) {
    return activeShortId;
  }
  return null;
}

const panel = mountPanel();

async function decompressSettings(payload: string): Promise<any> {
  if (payload.startsWith("gz:")) {
    const base64Data = payload.slice(3);
    const binaryString = atob(base64Data);
    const bytes = Uint8Array.from(binaryString, c => c.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    const response = new Response(stream);
    const text = await response.text();
    return JSON.parse(text);
  } else if (payload.startsWith("raw:")) {
    const base64Data = payload.slice(4);
    const jsonText = decodeURIComponent(escape(atob(base64Data)));
    return JSON.parse(jsonText);
  } else {
    try {
      const binaryString = atob(payload);
      const bytes = Uint8Array.from(binaryString, c => c.charCodeAt(0));
      if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
        const response = new Response(stream);
        const text = await response.text();
        return JSON.parse(text);
      }
      const jsonText = new TextDecoder().decode(bytes);
      return JSON.parse(jsonText);
    } catch (e) {
      return JSON.parse(payload);
    }
  }
}

async function checkAndImportQrSettings() {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const importPayload = urlParams.get("importSettings");
    if (!importPayload) return;

    panel.showToast("Importing settings...");
    const settings = await decompressSettings(importPayload);
    if (settings && typeof settings === "object") {
      delete settings.apiKeys;
      delete settings.keyStatus;

      await browser.runtime.sendMessage({ kind: "setSettings", settings });
      
      const cleanUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
      
      panel.showToast("Settings imported successfully!");
      refresh();
    } else {
      panel.showToast("Invalid settings payload.", true);
    }
  } catch (err: any) {
    console.error("[AID content] Failed to import QR settings:", err);
    panel.showToast("Import failed: " + (err?.message || String(err)), true);
  }
}

checkAndImportQrSettings();

panel.onRefresh(() => {
  dlog("[AID content] Direct refresh requested by panel callback");
  refresh();
});

panel.onBackupAll(async () => {
  return browser.runtime.sendMessage({ kind: "exportAll" });
});

panel.onRestoreAll(async (data) => {
  const res = await browser.runtime.sendMessage({ kind: "importAll", data });
  refresh();
  return res;
});

panel.onSaveCardValue(async (cardId, value) => {
  const sid = currentShortId();
  if (!sid) return { error: "No active adventure." };
  const res = await browser.runtime.sendMessage({ kind: "saveCardValue", shortId: sid, cardId, value });
  refresh();
  return res;
});
let count = 0;

// Debug-gated logging: verbose info traces only print when "Show debug" is enabled (synced in
// refresh() from state.settings.showDebug). warn/error stay ungated.
let debugEnabled = false;
const _log = console.log.bind(console);
function dlog(...args: unknown[]) { if (debugEnabled) _log(...args); }

function send(msg: BgMessage) {
  browser.runtime.sendMessage(msg).catch(() => {});
}

// Debouncing & Buffering for WebSocket updates
let actionUpdateTimeout: any = null;
let accumulatedActions: any[] = [];
let lastActionPayload: any = null;

function bufferActionUpdate(sid: string, payload: any) {
  if (payload?.actions) {
    accumulatedActions.push(...payload.actions);
    lastActionPayload = payload;
  }
  
  if (actionUpdateTimeout) {
    clearTimeout(actionUpdateTimeout);
  }
  
  actionUpdateTimeout = setTimeout(() => {
    if (accumulatedActions.length > 0 && lastActionPayload) {
      dlog(`[AID content] Sending debounced actionUpdate with ${accumulatedActions.length} actions.`);
      send({
        kind: "actionUpdate",
        shortId: sid,
        payload: {
          ...lastActionPayload,
          actions: accumulatedActions
        } as any
      });
      accumulatedActions = [];
      lastActionPayload = null;
      // Surgical action count update instead of full refresh()
      browser.runtime.sendMessage({ kind: "getState", shortId: sid }).then((state: any) => {
        if (state) {
          panel.updateActionCount(
            state.actionCount ?? state.actionsCount ?? 0,
            state.lastAnalysisAction ?? null
          );
        }
      }).catch(() => {});
    }
  }, 250);
}

let memoriesUpdateTimeout: any = null;
let latestMemories: any[] = [];

function bufferMemoriesUpdate(sid: string, memories: any[]) {
  latestMemories = memories;
  
  if (memoriesUpdateTimeout) {
    clearTimeout(memoriesUpdateTimeout);
  }
  
  memoriesUpdateTimeout = setTimeout(() => {
    dlog(`[AID content] Sending debounced memoryBankUpdate with ${latestMemories.length} memories.`);
    send({
      kind: "memoryBankUpdate",
      shortId: sid,
      memories: latestMemories
    });
    panel.updateMemories(latestMemories);
    latestMemories = [];
  }, 250);
}

async function refreshModels(current?: string) {
  const res: any = await browser.runtime.sendMessage({ kind: "listModels" });
  panel.setModels(res?.models ?? [], current);
}

async function refresh() {
  const sid = currentShortId();
  const isPlayUrl = checkIsPlayUrl();
  
  if (sid && isPlayUrl) {
    const state: any = await browser.runtime.sendMessage({ kind: "getState", shortId: sid });
    if (state) {
      debugEnabled = !!state.settings?.showDebug; // keep verbose logging in sync with the user's setting
      panel.render({
        shortId: state.shortId || sid,
        protagonist: state.protagonist,
        scenario: state.scenario ?? null,
        settings: state.settings,
        versions: state.versions ?? [],
        cards: state.cards ?? [],
        allCards: state.allCards ?? [],
        adventures: state.adventures ?? [],
        globalAssets: state.globalAssets ?? [],
        memory: state.memory ?? null,
        actionsCount: state.actionsCount,
        actionCount: state.actionCount,
        lastAnalysisAction: state.lastAnalysisAction,
        memoryBankEntries: state.memoryBankEntries ?? [],
        ops: state.ops ?? [],
        activeLocationId: state.activeLocationId ?? null,
        locationSuggestions: state.locationSuggestions ?? [],
        properNounLogs: state.properNounLogs ?? [],
        isManagerOnly: false
      } as any);
      refreshModels(state.settings?.model);
      
      // Post settings update to injected script
      window.postMessage({
        source: "aid-extension-host",
        kind: "settingsUpdate",
        interceptTimeout: state.settings?.interceptTimeout ?? 10,
        debug: !!state.settings?.showDebug
      }, location.origin);
    }
  } else {
    const state: any = await browser.runtime.sendMessage({ kind: "getManagerData" });
    if (state) {
      panel.render({
        isManagerOnly: true,
        adventures: state.adventures,
        cards: state.cards,
        globalAssets: state.globalAssets,
        settings: state.settings,
        versions: [],
        protagonist: null
      } as any);
    }
  }
}

let lastShortId: string | null = null;
let lastPath: string | null = null;
let lastDocTitle: string | null = null;
let checkNavigationInterval: any = null;
function checkNavigation() {
  if (typeof browser === "undefined" || !browser.runtime || !browser.runtime.id) {
    if (checkNavigationInterval) {
      clearInterval(checkNavigationInterval);
    }
    return;
  }
  const sid = currentShortId();
  const path = location.pathname;
  const docTitle = document.title;

  const isNavChanged = sid !== lastShortId || path !== lastPath;
  const isTitleChanged = docTitle !== lastDocTitle;

  if (isNavChanged || isTitleChanged) {
    lastShortId = sid;
    lastPath = path;
    lastDocTitle = docTitle;

    if (sid) {
      const isGeneric = !docTitle || docTitle === "AI Dungeon" || docTitle === "Untitled Adventure";
      if (isNavChanged || !isGeneric) {
        send({ kind: "adventureMeta", shortId: sid, title: isGeneric ? undefined : docTitle });
      }

      if (isNavChanged) {
        // Seed approved cards as early as possible on load, before GQL queries finish!
        browser.runtime.sendMessage({ kind: "getState", shortId: sid }).then((state: any) => {
          if (state && Array.isArray(state.cards)) {
            window.postMessage({
              source: "aid-extension-host",
              kind: "seedApprovedCards",
              cards: state.cards.map((card: any) => ({
                id: card.id,
                value: card.value,
                description: card.description || ""
              }))
            }, location.origin);
          }
        }).catch(() => {});
      }
    }
    refresh();
  }
}
checkNavigationInterval = setInterval(checkNavigation, 1000);
checkNavigation();

// 3) Relay page -> background.
window.addEventListener("message", (ev) => {
  if (typeof browser === "undefined" || !browser.runtime || !browser.runtime.id) return;
  if (ev.source !== window || (ev.data as any)?.source !== "aid-tracker") return;
  const detail = (ev.data as any).detail;

  if (detail?.transport === "adventureLoaded") {
    const { shortId, title, memory, authorsNote, instructions, storyCards } = detail;
    activeShortId = shortId;

    // Sync all currently saved cards in local DB with injected.ts approvedCards cache on load
    browser.runtime.sendMessage({ kind: "getState", shortId }).then((state: any) => {
      if (state && Array.isArray(state.cards)) {
        window.postMessage({
          source: "aid-extension-host",
          kind: "seedApprovedCards",
          cards: state.cards.map((card: any) => ({
            id: card.id,
            value: card.value,
            description: card.description || ""
          }))
        }, location.origin);
      }

      const hasAdventure = state && Array.isArray(state.adventures) && state.adventures.some((a: any) => a.shortId === shortId);
      const isSkeleton = hasAdventure && (!state.actionCount || state.actionCount === 0);
      // Only register/backfill when actually PLAYING — a scenario preview page must not create an
      // empty "Untitled Adventure" just because the page loaded scenario data.
      if ((!hasAdventure || isSkeleton) && !autoBackfillsInFlight.has(shortId) && checkIsPlayUrl()) {
        autoBackfillsInFlight.add(shortId);
        console.log(`[AID content] Auto-triggering backfill for new/skeleton adventure: ${shortId}`);
        browser.runtime.sendMessage({ kind: "backfillRequest", shortId }).then((res: any) => {
          console.log(`[AID content] Auto-backfill completed for ${shortId}:`, res);
          refresh();
        }).catch((err: any) => {
          console.error(`[AID content] Auto-backfill failed for ${shortId}:`, err);
        }).finally(() => {
          autoBackfillsInFlight.delete(shortId);
        });
      }
    }).catch(() => {});

    if (title || memory || authorsNote !== undefined || instructions !== undefined) {
      send({ kind: "adventureMeta", shortId, title, memory, authorsNote, instructions });
    }
    if (Array.isArray(storyCards)) {
      const cards = storyCards.map((c: any) => ({
        shortId,
        id: c.id,
        type: c.type,
        title: c.title,
        keys: c.keys,
        value: c.value,
        description: c.description || "",
        deletedAt: c.deletedAt ?? null
      }));
      send({ kind: "cardsUpdate", shortId, cards });
    }
    if (memory) {
      const m = memory.match(/(?:your name|player name)\s*:\s*([^\n\]]+)/i);
      const protagonistName = m ? m[1]!.trim() : null;
      if (protagonistName) {
        send({ kind: "setProtagonist", shortId, name: protagonistName });
      }
    }
    refresh();
    return;
  }

  if (detail?.transport === "interceptedAction") {
    browser.runtime.sendMessage({
      kind: "processInterceptedAction",
      shortId: detail.shortId,
      text: detail.text,
      type: detail.type
    }).then((res: any) => {
      window.postMessage({
        source: "aid-extension-host",
        kind: "actionApproved",
        requestId: detail.requestId,
        updatedNames: res?.updatedNames || []
      }, location.origin);
    }).catch((err: any) => {
      console.error("[AID content] Error processing intercepted action:", err);
      window.postMessage({
        source: "aid-extension-host",
        kind: "actionApproved",
        requestId: detail.requestId,
        updatedNames: []
      }, location.origin);
    });
    return;
  }

  // auth/op messages are NOT gated by sid — a token or op can be observed on any page.
  if (detail?.transport === "auth" && detail.token) {
    send({ kind: "authToken", token: detail.token });
    return;
  }
  if (detail?.transport === "op" && Array.isArray(detail.ops)) {
    send({ kind: "learnedOp", ops: detail.ops, endpoint: detail.url });
    return;
  }


  // Remaining relays require a valid adventure shortId.
  const sid = currentShortId();
  if (!sid) return;

  if (detail?.transport === "ws") {
    dlog("[AID content] Received WS message from page:", detail.operationName, "active sid:", sid);
  }

  if (detail?.transport === "ws" && detail.operationName === "ActionUpdates") {
    const payload = detail.data?.actionUpdates as ActionUpdatePayload | undefined;
    if (payload?.actions) {
      count += payload.actions.length;
      bufferActionUpdate(sid, payload);
    }
    return;
  }
  if (detail?.transport === "ws" && detail.operationName === "AdventureMetadataUpdate") {
    const title = detail.data?.adventureMetadataUpdate?.title;
    if (title) send({ kind: "adventureMeta", shortId: sid, title });
    return;
  }
  if (detail?.transport === "ws" && detail.operationName === "AdventureStoryCardsUpdate") {
    const raw = detail.data?.adventureStoryCardsUpdate?.storyCards;
    if (Array.isArray(raw)) {
      const cards = raw.map((c: any) => ({ shortId: sid, id: c.id, type: c.type, title: c.title, keys: c.keys, value: c.value, description: c.description || "", deletedAt: c.deletedAt ?? null }));
      send({ kind: "cardsUpdate", shortId: sid, cards });
    }
    return;
  }
  // Card saves intercepted from the page's own fetches (GUI edits / autosaves). Beta does not
  // reliably broadcast AdventureStoryCardsUpdate, so this is the live path for GUI card edits
  // to reach the local DB without a page reload.
  if (detail?.transport === "cardWrites" && Array.isArray(detail.cards)) {
    const cards = detail.cards
      .filter((c: any) => c && c.id && (!c.shortId || c.shortId === sid))
      .map((c: any) => ({
        shortId: sid,
        id: String(c.id),
        type: c.type || "custom",
        title: c.title,
        keys: c.keys || "",
        value: c.value || "",
        description: c.description || "",
        deletedAt: null
      }));
    if (cards.length) {
      dlog("[AID content] Captured page card writes:", cards.map((c: any) => c.title || c.id).join(", "));
      send({ kind: "cardsUpdate", shortId: sid, cards });
    }
    return;
  }
  if (detail?.transport === "ws" && detail.operationName === "Memory") {
    const memory = detail.data?.memory?.memory;
    if (memory) {
      dlog("[AID content] Captured real-time memory from WebSocket subscription:", memory.length);
      send({ kind: "adventureMeta", shortId: sid, memory });
    }
    return;
  }
  if (detail?.transport === "ws" && detail.operationName === "AdventureMemoriesUpdate") {
    const memories = detail.data?.memoryBankUpdateUpdate?.memories;
    if (Array.isArray(memories)) {
      dlog("[AID content] Captured real-time adventure memories update. count:", memories.length);
      bufferMemoriesUpdate(sid, memories || []);
    }
    return;
  }
});

// 4) Export button -> ask background, then download the returned JSON.
panel.onExport(async (type) => {
  const sid = currentShortId();
  if (!sid) return;
  const backup = await browser.runtime.sendMessage({ kind: "exportRequest", shortId: sid });
  if (backup == null) { panel.showToast("Nothing to export yet", true); return; }

  let blob: Blob;
  let filename: string;

  if (type === "story") {
    const actions = backup.actions || [];
    blob = new Blob([JSON.stringify(actions, null, 2)], { type: "application/json" });
    filename = `aid-story-${sid}.json`;
  } else if (type === "cards") {
    const cards = backup.cards || [];
    blob = new Blob([JSON.stringify(cards, null, 2)], { type: "application/json" });
    filename = `aid-storycards-${sid}.json`;
  } else if (type === "pe") {
    const memory = backup.adventure?.memory || "";
    blob = new Blob([memory], { type: "text/plain" });
    filename = `aid-pe-${sid}.txt`;
  } else if (type === "aidmemories") {
    const memoryBankEntries = backup.adventure?.memoryBankEntries || [];
    blob = new Blob([JSON.stringify(memoryBankEntries, null, 2)], { type: "application/json" });
    filename = `aid-memories-${sid}.json`;
  } else if (type === "propernouns") {
    const logs = backup.adventure?.properNounLogs || [];
    blob = new Blob([JSON.stringify(logs, null, 2)], { type: "application/json" });
    filename = `aid-propernouns-${sid}.json`;
  } else {
    // "all"
    blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    filename = `aid-all-${sid}.json`;
  }

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  panel.showToast("Data exported successfully!");
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
});

// 5) Backfill button -> ask background to fetch full history.
panel.onBackfill(async () => {
  const sid = currentShortId();
  if (!sid) return;
  panel.setStatus(`Backfilling story…`);
  try {
    const res: any = await browser.runtime.sendMessage({ kind: "backfillRequest", shortId: sid });
    if (res && typeof res.loaded === "number") {
      panel.setStatus(`Backfilled ${res.loaded} actions`);
      panel.showToast("Backfill complete!");
    } else {
      panel.setStatus(`${res?.error ?? "Backfill failed"}`);
      panel.showToast("Backfill failed!", true);
    }
  } catch (err: any) {
    console.error("[AID content] Backfill request failed:", err);
    panel.setStatus(`Backfill failed: ${err?.message || err}`);
    panel.showToast("Backfill failed!", true);
  }
  refresh();
});

panel.onSaveSettings(async (provider, apiKey, protagonist, model, analyzeWindow, showDebug, theme, s1, s2, s3, s4, cardCommands, useMemories, formattingMode, memoraidLookback, memoraidThoughtLookback, memoraidPresenceLookback, autoRegenerateMemoryBankEntry, interceptTimeout, useSinglePassGeneration, locationMode, enableProperNounDetection, manualMode, logPlotEssentials, characterCardLimit, thoughtCardLimit) => {
  const sid = currentShortId();
  const settings: any = {
    provider,
    model: model || undefined,
    analyzeWindow,
    showDebug,
    theme,
    customPromptSection1: s1,
    customPromptSection2: s2,
    customPromptSection3: s3,
    customPromptSection4: s4,
    cardCommands,
    formattingMode,
    useMemories,
    memoraidLookback,
    memoraidThoughtLookback,
    memoraidPresenceLookback,
    autoRegenerateMemoryBankEntry,
    interceptTimeout,
    useSinglePassGeneration,
    locationMode,
    enableProperNounDetection,
    manualMode,
    logPlotEssentials,
    characterCardLimit,
    thoughtCardLimit
  };
  if (apiKey) settings.apiKeys = { [provider]: apiKey };
  await browser.runtime.sendMessage({ kind: "setSettings", settings });
  if (sid && protagonist) await browser.runtime.sendMessage({ kind: "setProtagonist", shortId: sid, name: protagonist });
  
  // Post settings update to injected script
  window.postMessage({
    source: "aid-extension-host",
    kind: "settingsUpdate",
    interceptTimeout,
    debug: !!showDebug
  }, location.origin);

  panel.showToast("Settings saved!");
  refreshModels(model || undefined);
  refresh();
});

// 6b) Theme change -> auto-save immediately to persist cosmetics
panel.onThemeChange(async (theme) => {
  const settings = { theme };
  await browser.runtime.sendMessage({ kind: "setSettings", settings });
});

panel.onDismissMemoraidBanner(async () => {
  await browser.runtime.sendMessage({ kind: "setSettings", settings: { memoraidBannerDismissed: true } });
  refresh();
});

// 6c) Provider change -> refresh models dynamically for the newly selected provider
panel.onProviderChange(async (provider, apiKey) => {
  const res: any = await browser.runtime.sendMessage({
    kind: "listModels",
    provider,
    apiKey: apiKey || undefined
  });
  const models = res?.models ?? [];
  panel.setModels(models, models[0] || undefined);
});

// 7) Analyze button -> trigger inference in background.
panel.onAnalyze(async () => {
  const sid = currentShortId(); if (!sid) return;
  const res: any = await browser.runtime.sendMessage({ kind: "analyzeRequest", shortId: sid });
  panel.showAnalyzeResult(res);
  if (res?.error) panel.showToast("Update failed!", true);
  await refresh();
  panel.showDebug(res?.debug);
});

// 7b) Generate (AID): replay AI Dungeon's native Story Card Command for one card.
panel.onGenerateCard(async (cardId) => {
  const sid = currentShortId(); if (!sid) return;
  panel.showToast("Generating via AI Dungeon…");
  const res: any = await browser.runtime.sendMessage({ kind: "generateCard", shortId: sid, cardId });
  if (res?.error) panel.showToast(`Generate failed: ${res.error}`, true);
  else if (res?.id) panel.showToast(`Proposal ready for ${res.characterName} — review & approve.`);
  await refresh();
});

// Helper to broadcast and open card on successful push
async function handleSuccessfulPush(res: any) {
  // Note: value may legitimately be "" for freshly created (still-empty) memory cards —
  // the sync must still reach the injected script so the page refetches and shows the new card.
  if (res?.ok && res.source === "card" && res.cardId && typeof res.value === "string") {
    dlog("[AID content] Successful card push detected. Notifying injected script to sync Apollo cache...");
    // 1. Post message to injected.ts to update Apollo Client and trigger refetch
    window.postMessage({
      source: "aid-extension-host",
      kind: "approvedCard",
      cardId: res.cardId,
      value: res.value,
      description: res.description,
      keys: res.keys,
      prevKeys: res.prevKeys
    }, location.origin);
  } else if (res?.ok && res.source === "plot" && typeof res.memory === "string") {
    dlog("[AID content] Successful plot push detected. Notifying injected script to sync Apollo cache...");
    const sid = currentShortId();
    if (sid) {
      window.postMessage({
        source: "aid-extension-host",
        kind: "approvedMemory",
        shortId: sid,
        memory: res.memory
      }, location.origin);
    }
  }
}

// 8) Accept/Reject proposal decision -> update version status in background.
// Approving auto-pushes to AI Dungeon; surface the push result as a toast.
panel.onProposalDecision(async (id, status) => {
  try {
    const res: any = await browser.runtime.sendMessage({ kind: "setVersionStatus", id, status });
    if (status === "applied") {
      if (res?.ok) {
        panel.showToast("Approved & pushed to AI Dungeon!");
        await handleSuccessfulPush(res);
      } else {
        panel.showToast(`Approved locally — push failed: ${res?.error || "unknown error"}`, true);
      }
    }
  } catch (err: any) {
    panel.showToast(`Approved locally — push error: ${err?.message || err}`, true);
  }
  refresh();
});

// 9) Push version decision -> send to background, show status, and refresh.
panel.onPushVersion(async (id) => {
  dlog("[AID content] onPushVersion handler triggered for id:", id);
  panel.setStatus("Pushing update to AI Dungeon…");
  try {
    const res: any = await browser.runtime.sendMessage({ kind: "applyToAid", id });
    dlog("[AID content] applyToAid response received:", res);
    if (res?.ok) {
      panel.setStatus("Push successful!");
      panel.showToast("Push successful!");
      await handleSuccessfulPush(res);
    } else {
      panel.setStatus(`Push failed: ${res?.error || "Unknown error"}`);
      panel.showToast(`Push failed: ${res?.error || "Unknown error"}`, true);
    }
  } catch (err: any) {
    console.error("[AID content] Error during applyToAid sendMessage:", err);
    panel.setStatus(`Push failed: ${err?.message || err || "Communication error"}`);
    panel.showToast("Communication error!", true);
  }
  refresh();
});

// 10) AID Memories Tab Event Hooks
panel.onUpdateMemoryBank(async (memories) => {
  const sid = currentShortId(); if (!sid) return;
  await browser.runtime.sendMessage({ kind: "updateMemoryBank", shortId: sid, memories });
  refresh();
});

panel.onCreateConfigCard(async () => {
  const sid = currentShortId();
  if (!sid) return;
  panel.setStatus("Creating Configure MemorAID card...");
  try {
    const res: any = await browser.runtime.sendMessage({ kind: "createConfigCard", shortId: sid });
    if (res?.ok) {
      panel.showToast("Configure MemorAID card created! Refreshing...");
    } else {
      panel.showToast(`Creation failed: ${res?.error || "unknown error"}`, true);
    }
  } catch (err: any) {
    panel.showToast(`Creation error: ${err?.message || err}`, true);
  }
  refresh();
});

panel.onCreateStoryCard(async (card) => {
  const sid = currentShortId();
  if (!sid) return { error: "No active adventure shortId found" };
  panel.setStatus("Creating story card...");
  try {
    const res: any = await browser.runtime.sendMessage({ kind: "createStoryCard", shortId: sid, card });
    refresh();
    if (res?.ok) {
      return { ok: true };
    } else {
      return { error: res?.error || "unknown error" };
    }
  } catch (err: any) {
    return { error: err?.message || String(err) };
  }
});

panel.onSaveCardKeys(async (cardId, keys) => {
  const sid = currentShortId();
  if (!sid) return { error: "No active adventure shortId found" };
  panel.setStatus("Saving card triggers...");
  try {
    const res: any = await browser.runtime.sendMessage({ kind: "saveCardKeys", shortId: sid, cardId, keys });
    refresh();
    if (res?.ok) {
      return { ok: true };
    } else {
      return { error: res?.error || "unknown error" };
    }
  } catch (err: any) {
    return { error: err?.message || String(err) };
  }
});

panel.onRefineMemoryBlock(async (index) => {
  const sid = currentShortId();
  if (!sid) return;
  panel.setStatus(`Refining memory block #${index + 1}...`);
  try {
    const res: any = await browser.runtime.sendMessage({ kind: "refineMemoryBlock", shortId: sid, index });
    if (res?.ok) {
      panel.showToast(`Memory block #${index + 1} regenerated and pushed to AID!`);
    } else {
      panel.showToast(`Refinement failed: ${res?.error || "unknown error"}`, true);
    }
  } catch (err: any) {
    panel.showToast(`Refinement error: ${err?.message || err}`, true);
  }
  refresh();
});



panel.onGrantPermissions(() => {
  panel.showToast("Opening permissions tab...");
  browser.runtime.sendMessage({ kind: "openPermissionsPage" })
    .then((res: any) => {
      if (!res || !res.ok) {
        panel.showToast("Failed to open permissions tab: " + (res?.error || "unknown error"), true);
      }
    })
    .catch((err: any) => {
      panel.showToast("Failed to open permissions tab: " + err.message, true);
    });
});

// Location manager: active location selection + detection suggestion responses.
panel.onSetActiveLocation(async (cardId) => {
  const sid = currentShortId();
  if (!sid) return;
  try {
    const res: any = await browser.runtime.sendMessage({ kind: "setActiveLocation", shortId: sid, cardId });
    if (res?.error) {
      panel.showToast(`Failed to set location: ${res.error}`, true);
    } else {
      panel.showToast(cardId ? "Active location updated." : "Active location cleared.");
    }
  } catch (err: any) {
    panel.showToast(`Failed to set location: ${err?.message || err}`, true);
  }
  refresh();
});

panel.onRespondToProperNounSuggestion(async (properNoun, accept, type) => {
  const sid = currentShortId();
  if (!sid) return;
  try {
    const res: any = await browser.runtime.sendMessage({ kind: "respondToProperNounSuggestion", shortId: sid, properNoun, accept, type });
    if (res?.error) {
      panel.showToast(`Suggestion response failed: ${res.error}`, true);
    } else if (accept) {
      panel.showToast(`"${properNoun}" recorded as ${type}.`);
    }
  } catch (err: any) {
    panel.showToast(`Suggestion response error: ${err?.message || err}`, true);
  }
  refresh();
});

// Proper noun log editor (Debug tab).
panel.onUpdateProperNounLog(async (properNoun, type) => {
  const sid = currentShortId();
  if (!sid) return;
  try {
    await browser.runtime.sendMessage({ kind: "updateProperNounLog", shortId: sid, properNoun, type });
  } catch { /* surfaced via refresh below */ }
  refresh();
});

panel.onLinkProperNounToCard(async (properNoun, cardId) => {
  const sid = currentShortId();
  if (!sid) return;
  try {
    const res: any = await browser.runtime.sendMessage({ kind: "linkProperNounToCard", shortId: sid, properNoun, cardId });
    if (res?.error) {
      panel.showToast(`Link failed: ${res.error}`, true);
    } else {
      panel.showToast(`"${properNoun}" linked to its card.`);
    }
  } catch (err: any) {
    panel.showToast(`Link error: ${err?.message || err}`, true);
  }
  refresh();
});

panel.onDeleteProperNounLog(async (properNoun) => {
  const sid = currentShortId();
  if (!sid) return;
  try {
    await browser.runtime.sendMessage({ kind: "deleteProperNounLog", shortId: sid, properNoun });
  } catch { /* surfaced via refresh below */ }
  refresh();
});

panel.onClearProperNounLogs(async () => {
  const sid = currentShortId();
  if (!sid) return;
  try {
    await browser.runtime.sendMessage({ kind: "clearProperNounLogs", shortId: sid });
    panel.showToast("Proper noun logs cleared.");
  } catch (err: any) {
    panel.showToast(`Failed to clear logs: ${err?.message || err}`, true);
  }
  refresh();
});

panel.onApplyInstruction(() => {
  refresh();
});

panel.onSaveGlobalAsset(async (asset) => {
  const res = await browser.runtime.sendMessage({ kind: "saveGlobalAsset", asset });
  refresh();
  return res;
});

panel.onDeleteGlobalAsset(async (id) => {
  const res = await browser.runtime.sendMessage({ kind: "deleteGlobalAsset", id });
  refresh();
  return res;
});

panel.onImportGlobalAsset(async (assetId) => {
  const sid = currentShortId();
  if (!sid) return { error: "No active adventure." };
  const res = await browser.runtime.sendMessage({ kind: "importGlobalAsset", shortId: sid, assetId });
  refresh();
  return res;
});



browser.runtime.onMessage.addListener((msg: any) => {
  if (msg && msg.kind === "approvedCardSync") {
    handleSuccessfulPush(msg.payload);
    refresh();
    return;
  }
  if (msg && msg.kind === "stateUpdated") {
    dlog(`[AID content] State updated received from background. Refreshing...`);
    if (msg.type && msg.text) {
      window.postMessage({
        source: "aid-extension-host",
        kind: "approvedState",
        shortId: msg.shortId,
        type: msg.type,
        text: msg.text,
        previousText: msg.previousText
      }, location.origin);
    }
    refresh();
    return;
  }
  if (msg && msg.kind === "memoryUpdated") {
    dlog(`[AID content] Memory update received from background. Notifying injected script...`);
    window.postMessage({
      source: "aid-extension-host",
      kind: "approvedMemory",
      shortId: msg.shortId,
      memory: msg.memory,
      previousMemory: msg.previousMemory
    }, location.origin);
    refresh();
    return;
  }
  if (msg && msg.kind === "proposalCreated") {
    dlog(`[AID content] Auto-update proposal created for character: ${msg.characterName}. Refreshing...`);
    refresh();
    return;
  }
  if (msg && msg.kind === "memoraidTiming") {
    // Surgical update of the MemorAID timing readout under Action Intercept Timeout — no full refresh.
    panel.updateMemoraidTiming(msg.payload);
    return;
  }
  if (msg && msg.kind === "relayFetch") {
    return new Promise((resolve) => {
      const requestId = Math.random().toString(36).substring(7);
      const listener = (ev: MessageEvent) => {
        if (ev.origin !== location.origin || ev.data?.source !== "aid-extension-host") return;
        if (ev.data?.kind === "relayFetchResponse" && ev.data.requestId === requestId) {
          window.removeEventListener("message", listener);
          resolve(ev.data.response);
        }
      };
      window.addEventListener("message", listener);

      window.postMessage({
        source: "aid-extension-host-relay",
        kind: "relayFetchRequest",
        requestId,
        url: msg.url,
        init: msg.init
      }, location.origin);
    });
  }
});

window.addEventListener("aid-refresh-panel", () => {
  if (typeof browser === "undefined" || !browser.runtime || !browser.runtime.id) return;
  dlog("[AID content] Direct refresh requested by panel");
  refresh();
});

/**
 * Simulate a high-fidelity user click by dispatching pointer events,
 * mouse events, setting focus, and triggering the click.
 * This guarantees React synthetic events and custom frameworks capture the interaction perfectly.
 */
function simulateFullClick(element: HTMLElement) {
  dlog("[AID content] Simulating high-fidelity click on:", element.tagName, element.textContent?.trim());
  
  try {
    element.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  } catch (e) {}

  // 1. Pointer Down & Mouse Down
  element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, isPrimary: true, view: window }));
  element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
  
  // 2. Focus
  try {
    element.focus?.();
  } catch (e) {}

  // 3. Pointer Up & Mouse Up
  element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, isPrimary: true, view: window }));
  element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
  
  // 4. Click
  element.click();
}

/**
 * Automate opening a Story Card in AI Dungeon's web GUI.
 * This forces the page's React state to fetch the new server-side truth, preventing subsequent autosave clobber.
 */
async function openStoryCardInGui(cardTitle: string) {
  dlog("[AID content] Programmatically opening Story Card in GUI:", cardTitle);
  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const normalizedTitle = cardTitle.trim().toLowerCase();

  try {
    // 0. If a card editor is already open in the page GUI, its React component is mounted and holds a stale local state.
    // We detect active textareas and inputs inside any open drawer or panel container.
    // If found, we locate and click the specific "Back" or "Close" or "Finish" button within that container to force a clean unmount.
    const activeTextareas = Array.from(document.querySelectorAll("textarea"));
    if (activeTextareas.length > 0) {
      dlog("[AID content] Active card editor textareas detected. Finding back/close/finish button...");
      let backBtn: HTMLElement | null = null;
      
      for (const ta of activeTextareas) {
        const container = ta.closest("div[class*='drawer'], div[class*='panel'], div[class*='modal'], div[style*='position'], body > div");
        if (container) {
          backBtn = Array.from(container.querySelectorAll("button, [role='button'], div, span, svg")).find(el => {
            const text = el.textContent?.trim().toLowerCase();
            const label = el.getAttribute("aria-label")?.toLowerCase();
            const cls = el.className && typeof el.className === "string" ? el.className.toLowerCase() : "";
            return text === "back" || label === "back" || cls.includes("back") ||
                   text === "close" || label === "close" || cls.includes("close") ||
                   text === "finish" || label === "finish" || cls.includes("finish") ||
                   label === "go back" || label === "back to list";
          }) as HTMLElement | null;
          if (backBtn) break;
        }
      }

      // Fallback to global back/close/finish button only if none were found inside the container
      if (!backBtn) {
        backBtn = Array.from(document.querySelectorAll("button, [role='button'], div, span, svg")).find(el => {
          const text = el.textContent?.trim().toLowerCase();
          const label = el.getAttribute("aria-label")?.toLowerCase();
          const cls = el.className && typeof el.className === "string" ? el.className.toLowerCase() : "";
          return text === "back" || label === "back" || cls.includes("back") ||
                 text === "close" || label === "close" || cls.includes("close") ||
                 text === "finish" || label === "finish" || cls.includes("finish") ||
                 label === "go back" || label === "back to list";
        }) as HTMLElement | null;
      }

      if (backBtn) {
        const clickTarget = backBtn.closest("button, [role='button']") as HTMLElement || backBtn;
        dlog("[AID content] Clicking close/finish button to unmount stale React state:", clickTarget.textContent || clickTarget.getAttribute("aria-label"));
        simulateFullClick(clickTarget);
        
        // Wait deterministically for the editor textareas to be fully unmounted from the DOM
        const startTime = Date.now();
        while (Date.now() - startTime < 1500) {
          await wait(100);
          const stillHasTextareas = document.querySelectorAll("textarea").length > 0;
          if (!stillHasTextareas) {
            dlog("[AID content] Card editor successfully unmounted.");
            break;
          }
        }
        await wait(1000); // extra cushion for React fiber rendering queue to fully settle
      }
    }

    // 1. Check if the card list drawer is already open and the card is directly visible in the DOM.
    // If it is already visible, we click it directly and skip clicking the sidebar toggle (which would close it!).
    let cardItem = Array.from(document.querySelectorAll("div, span, p, a, li, button")).find(el => {
      if (el.children.length > 2) return false; // ignore large layout elements
      const text = el.textContent?.trim().toLowerCase();
      return text === normalizedTitle || (text?.includes(normalizedTitle) && text.length < 60);
    }) as HTMLElement | null;

    if (cardItem) {
      const clickTarget = cardItem.closest("button, a, li, [role='button']") as HTMLElement || cardItem;
      dlog("[AID content] Story Cards list is already open. Clicking card directly in list:", clickTarget.textContent);
      simulateFullClick(clickTarget);
      await wait(1000); // wait for card details drawer to fully slide in and mount
      panel.showToast(`Story Card '${cardTitle}' opened in AI Dungeon GUI!`);
      return true;
    }

    // 2. Locate the sidebar panel toggle button. We check text, aria-labels, and titles aggressively.
    let sidebarBtn = Array.from(document.querySelectorAll("button, [role='button'], div, span, a")).find(el => {
      const text = el.textContent?.trim().toLowerCase();
      const label = el.getAttribute("aria-label")?.toLowerCase();
      const title = el.getAttribute("title")?.toLowerCase();
      
      return text === "story cards" || text === "plot" || text === "plot essentials" || 
             label === "story cards" || label === "plot" || label === "plot essentials" ||
             title === "story cards" || title === "plot" || title === "plot essentials" ||
             text?.includes("story card") || label?.includes("story card") || title?.includes("story card") ||
             text?.includes("plot") || label?.includes("plot") || title?.includes("plot");
    }) as HTMLElement | null;

    if (sidebarBtn) {
      const clickTarget = sidebarBtn.closest("button, [role='button']") as HTMLElement || sidebarBtn;
      dlog("[AID content] Found sidebar toggle button. Clicking to open:", clickTarget.textContent || clickTarget.getAttribute("aria-label") || clickTarget.getAttribute("title"));
      simulateFullClick(clickTarget);
      await wait(1000); // wait for side drawer animations and React list rendering to fully stabilize
    }

    // 3. Locate the specific card item in the opened sidebar list
    cardItem = Array.from(document.querySelectorAll("div, span, p, a, li, button")).find(el => {
      if (el.children.length > 2) return false;
      const text = el.textContent?.trim().toLowerCase();
      return text === normalizedTitle || (text?.includes(normalizedTitle) && text.length < 60);
    }) as HTMLElement | null;

    if (cardItem) {
      const clickTarget = cardItem.closest("button, a, li, [role='button']") as HTMLElement || cardItem;
      dlog("[AID content] Found card item in list, clicking to open details:", clickTarget.textContent);
      simulateFullClick(clickTarget);
      await wait(1000); // wait for details drawer to mount
      panel.showToast(`Story Card '${cardTitle}' opened in AI Dungeon GUI!`);
      return true;
    }

    // 4. Fallback: Check if there's a nested "Story Cards" or "Cards" sub-tab inside the opened panel
    let subTab = Array.from(document.querySelectorAll("button, div, span")).find(el => {
      const text = el.textContent?.trim().toLowerCase();
      return text === "story cards" || text === "cards";
    }) as HTMLElement | null;

    if (subTab) {
      dlog("[AID content] Found sub-tab in open panel, clicking:", subTab.textContent);
      simulateFullClick(subTab);
      await wait(1000);
      
      cardItem = Array.from(document.querySelectorAll("div, span, p, a, li, button")).find(el => {
        if (el.children.length > 2) return false;
        const text = el.textContent?.trim().toLowerCase();
        return text === normalizedTitle || (text?.includes(normalizedTitle) && text.length < 60);
      }) as HTMLElement | null;

      if (cardItem) {
        const clickTarget = cardItem.closest("button, a, li, [role='button']") as HTMLElement || cardItem;
        dlog("[AID content] Found card item under sub-tab, clicking:", clickTarget.textContent);
        simulateFullClick(clickTarget);
        await wait(1000);
        panel.showToast(`Story Card '${cardTitle}' opened in AI Dungeon GUI!`);
        return true;
      }
    }

    console.warn("[AID content] Could not locate Story Card item in GUI for:", cardTitle);
    panel.showToast(`Pushed! Please open '${cardTitle}' once to sync the GUI.`, false);
  } catch (err) {
    console.error("[AID content] Error programmatically opening card in GUI:", err);
  }
  return false;
}



