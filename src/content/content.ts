import { browser } from "./browser-helper";
import { mountPanel } from "./panel";
import type { ActionUpdatePayload } from "../shared/types";
import type { BgMessage, BgResult } from "../background/orchestrator";

// The interceptor runs as a separate MAIN-world content script (manifest), so it installs
// before the page's app boots and beats the page CSP. This script only bridges its
// window.postMessage events to the background.

function isContextValid(): boolean {
  try {
    if (typeof browser === "undefined" || !browser.runtime) {
      return false;
    }
    browser.runtime.getManifest();
    return true;
  } catch (e) {
    return false;
  }
}

let activeShortId: string | null = null;
let lastKnownActionCount: number | null = null;
const autoBackfillsInFlight = new Set<string>();

function detectSetupQuestion(actionCount?: number) {
  // If the game has already initialized actions, setup is complete.
  if (actionCount != null && actionCount > 0) return null;

  // Text question input check (Type here... input active; case-insensitive placeholder check)
  let typeHereInput = document.querySelector('input[placeholder*="Type here" i], textarea[placeholder*="Type here" i]') as HTMLInputElement | HTMLTextAreaElement | null;
  if (!typeHereInput) {
    // Fallback: find any visible text input or textarea in the main document
    const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea')) as (HTMLInputElement | HTMLTextAreaElement)[];
    typeHereInput = inputs.find(el => {
      // Ensure it is in the main document (not inside any Shadow DOM like our side panel)
      if (el.getRootNode() !== document) return false;
      // Ensure it is visible
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      // Skip if it's a search input or something similar
      const id = (el.id || "").toLowerCase();
      const cls = (el.className || "").toLowerCase();
      const placeholder = (el.getAttribute("placeholder") || "").toLowerCase();
      if (id.includes("search") || cls.includes("search") || placeholder.includes("search")) return false;
      return true;
    }) || null;
  }

  if (typeHereInput) {
    let questionText = "";
    const parentContainer = typeHereInput.closest('div');
    if (parentContainer) {
      const texts = Array.from(parentContainer.querySelectorAll('p, span, h1, h2, h3, h4, div'))
        .map(el => el.textContent?.trim() || "")
        .filter(t => t && t.length > 5 && !t.toLowerCase().includes('type here') && !t.includes('NEXT') && !t.includes('FINISH'));
      if (texts.length > 0) {
        questionText = texts[0] || "";
      }
    }
    return {
      type: "text" as const,
      question: questionText || "Enter setup placeholder",
      inputEl: typeHereInput
    };
  }

  // Multiple Choice check (Numbered option buttons active)
  // Scans a broad set of elements and filters out parent wrappers to isolate the leaf choice button elements
  const candidates = Array.from(document.querySelectorAll('div, button, a, [role="button"], li, span'));
  const choiceButtons = candidates.filter(btn => {
    const text = btn.textContent?.trim() || "";
    if (text.length > 80) return false;
    
    // Support relaxed digit format for concatenated text contents (like "1Inner Monologue")
    const isChoiceFormat = /^\d+\s*[\s\.\:\)\-]?\s*[A-Za-z]/.test(text) || 
                           /^\(\d+\)/.test(text) ||
                           /^\d+$/.test(text);
    if (!isChoiceFormat) return false;
    
    // Skip parent wrappers by checking if any child element is also a choice option
    const children = Array.from(btn.querySelectorAll('div, button, a, li, span'));
    const hasChildChoice = children.some(child => {
      const childText = child.textContent?.trim() || "";
      return childText.length <= 80 && (
        /^\d+\s*[\s\.\:\)\-]?\s*[A-Za-z]/.test(childText) || 
        /^\(\d+\)/.test(childText) ||
        /^\d+$/.test(childText)
      );
    });
    
    if (hasChildChoice) return false;
    
    return true;
  }) as HTMLElement[];

  if (choiceButtons.length > 0) {
    let questionText = "";
    const firstBtn = choiceButtons[0];
    if (firstBtn) {
      const parent = firstBtn.parentElement;
      if (parent) {
        const texts = Array.from(parent.querySelectorAll('h1, h2, h3, h4, p, span, div'))
          .map(el => el.textContent?.trim() || "")
          .filter(t => t && t.length > 5 && !choiceButtons.some(btn => (btn.textContent || "").includes(t)));
        if (texts.length > 0) {
          questionText = texts[0] || "";
        }
      }
    }
    return {
      type: "choice" as const,
      question: questionText || "Select setup choice",
      buttons: choiceButtons
    };
  }

  return null;
}

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

/** Typed round-trip for mutation-style background messages (validates the request against
 *  BgMessage and gives the standard BgResult response shape instead of `any`). */
function sendBg(msg: BgMessage): Promise<BgResult> {
  return browser.runtime.sendMessage(msg) as Promise<BgResult>;
}

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
  if (!isContextValid()) return;
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
let count = 0;

// Self-heal: an empty local DB usually means the extension's IndexedDB was wiped (e.g. swapping the
// signed XPI for a test build changes the moz-extension origin). Prompt to restore from a backup file.
(async () => {
  try {
    const res: any = await browser.runtime.sendMessage({ kind: "isDbEmpty" } satisfies BgMessage);
    if (res?.empty) panel.showSelfHealBanner();
  } catch { /* ignore */ }
})();

// Debug-gated logging: verbose info traces only print when "Show debug" is enabled (synced in
// refresh() from state.settings.showDebug). warn/error stay ungated.
let debugEnabled = false;
const _log = console.log.bind(console);
function dlog(...args: unknown[]) { if (debugEnabled) _log(...args); }

function send(msg: BgMessage) {
  if (!isContextValid()) return;
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
    if (!isContextValid()) return;
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
          const actionCountVal = state.actionCount ?? state.actionsCount ?? 0;
          lastKnownActionCount = actionCountVal;
          panel.updateActionCount(
            actionCountVal,
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
    if (!isContextValid()) return;
    dlog(`[AID content] Sending debounced adventureMemories with ${latestMemories.length} memories.`);
    send({
      kind: "adventureMemories",
      shortId: sid,
      memories: latestMemories
    });
    panel.updateMemories(latestMemories);
    latestMemories = [];
  }, 250);
}

async function refreshModels(current?: string) {
  const res: any = await browser.runtime.sendMessage({ kind: "listModels" } satisfies BgMessage);
  panel.setModels(res?.models ?? [], current);
}

async function refresh() {
  if (!isContextValid()) return;
  const sid = currentShortId();
  const isPlayUrl = checkIsPlayUrl();
  // Detect setup questions only on play pages — never on a /scenario/<id> Discover preview,
  // which checkIsPlayUrl excludes (that page's like/bookmark badges and reaction shortcodes
  // like `w_thumbsup` otherwise scrape as bogus questions/choices). The "no actions yet"
  // requirement is enforced post-load below via the fresh actionCountVal, NOT a pre-gate on
  // lastKnownActionCount (which can be stale from a previous adventure and wrongly suppress
  // a genuine scenario-start question).
  let activeQuestion = isPlayUrl ? detectSetupQuestion() : null;

  if (activeQuestion || (sid && isPlayUrl)) {
    const targetSid = sid || activeShortId;
    let state: any = null;
    if (targetSid) {
      state = await browser.runtime.sendMessage({ kind: "getState", shortId: targetSid });
    } else {
      state = await browser.runtime.sendMessage({ kind: "getManagerData" });
    }
    
    if (state) {
      debugEnabled = !!state.settings?.showDebug; // keep verbose logging in sync with the user's setting
      
      // If the adventure already has actions, then setup phase is complete
      const actionCountVal = state.actionCount ?? state.actionsCount ?? 0;
      lastKnownActionCount = actionCountVal;
      if (actionCountVal > 0) {
        activeQuestion = null;
      }
      
      panel.render({
        shortId: state.shortId || targetSid || undefined,
        protagonist: state.protagonist,
        memoraidCharacters: state.memoraidCharacters ?? [],
        livingConfig: state.livingConfig ?? {},
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
        // getState emits the Memory Bank list as `memoryBankEntries` (renamed from `aidMemories`);
        // the panel prop is still `aidMemories`, so map it here. Reading state.aidMemories directly
        // resolved to undefined -> [] and blanked the list on every full refresh() (e.g. after a
        // "Regenerate Latest"), until the next live memory update repopulated it via updateMemories.
        aidMemories: state.memoryBankEntries ?? state.aidMemories ?? [],
        ops: state.ops ?? [],
        activeLocationId: state.activeLocationId ?? null,
        locationSuggestions: state.locationSuggestions ?? [],
        properNounLogs: state.properNounLogs ?? [],
        isManagerOnly: false,
        activeSetupQuestion: activeQuestion ? {
          type: activeQuestion.type,
          question: activeQuestion.question
        } : null
      } as any);
      refreshModels(state.settings?.model);
      
      if (state.settings) {
        // Post settings update to injected script
        window.postMessage({
          source: "aid-extension-host",
          kind: "settingsUpdate",
          interceptTimeout: state.settings?.interceptTimeout ?? 4,
          debug: !!state.settings?.showDebug
        }, location.origin);
      }
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
        protagonist: null,
        activeSetupQuestion: null
      } as any);
    }
  }
}

let lastShortId: string | null = null;
let lastPath: string | null = null;
let lastDocTitle: string | null = null;
let lastActiveQuestionStr = "";

function checkNavigation() {
  if (!isContextValid()) return;
  const sid = currentShortId();
  const path = location.pathname;
  const docTitle = document.title;
  const isPlayUrl = checkIsPlayUrl();

  // Reset activeShortId when transitioning to a new scenario page or setup page to prevent carrying over
  // the previous adventure's ID.
  if (path !== lastPath) {
    const hasIdInUrl = /\/(play|adventure)\/([^/]+)/.test(path) || 
                       new URLSearchParams(location.search).has("adventureId") || 
                       new URLSearchParams(location.search).has("adventure") || 
                       new URLSearchParams(location.search).has("id");
    if (path.includes("/scenario/") || (!hasIdInUrl && (path === "/play" || path.endsWith("/play")))) {
      activeShortId = null;
    }
  }

  const isNavChanged = sid !== lastShortId || path !== lastPath;
  const isTitleChanged = docTitle !== lastDocTitle;
  let shouldRefresh = isNavChanged || isTitleChanged;

  // On play pages, poll the DOM for setup question changes to dynamically toggle or update
  // the Setup Helper widget. detectSetupQuestion(actionCount) self-suppresses once actions exist.
  if (isPlayUrl) {
    const activeQuestion = detectSetupQuestion(lastKnownActionCount ?? undefined);
    const activeQuestionStr = activeQuestion ? JSON.stringify({ type: activeQuestion.type, question: activeQuestion.question }) : "";
    if (activeQuestionStr !== lastActiveQuestionStr) {
      lastActiveQuestionStr = activeQuestionStr;
      shouldRefresh = true;
    }
  }

  if (shouldRefresh) {
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
setInterval(checkNavigation, 1000);
checkNavigation();

// 3) Relay page -> background.
window.addEventListener("message", (ev) => {
  if (!isContextValid()) return;
  if (ev.source !== window || (ev.data as any)?.source !== "aid-tracker") return;
  const detail = (ev.data as any).detail;

  if (detail?.transport === "adventureLoaded") {
    const { shortId, title, memory, authorsNote, instructions, storyCards } = detail;
    activeShortId = shortId;

    // Sync all currently saved cards in local DB with injected.ts approvedCards cache on load
    browser.runtime.sendMessage({ kind: "getState", shortId }).then((state: any) => {
      if (state) {
        lastKnownActionCount = state.actionCount ?? state.actionsCount ?? 0;
        if (Array.isArray(state.cards)) {
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
      send({ kind: "cardsUpdate", shortId, cards, isFullList: true });
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
        updatedNames: res?.updatedNames || [],
        injectText: res?.injectText || ""
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
      send({ kind: "cardsUpdate", shortId: sid, cards, isFullList: true });
    }
    return;
  }
  if (detail?.transport === "authorsNoteUpdate" && detail.shortId) {
    // The user edited their Author's Note in AID — keep our cached copy fresh (stores even "" so a
    // cleared note is captured too).
    send({ kind: "setAuthorsNote", shortId: detail.shortId, authorsNote: detail.authorsNote || "" });
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
      send({ kind: "cardsUpdate", shortId: sid, cards, isFullList: false });
    }
    return;
  }
  // Native card deletion (UseDeleteStoryCard) observed on the page → soft-delete locally so it
  // drops out of the roster/Living Characters tab without a page reload.
  if (detail?.transport === "cardDeletes" && Array.isArray(detail.ids)) {
    const ids = detail.ids.map((x: any) => String(x)).filter(Boolean);
    if (ids.length) {
      dlog("[AID content] Captured page card deletions:", ids.join(", "));
      browser.runtime.sendMessage({ kind: "cardsDeleted", shortId: sid, cardIds: ids }).then(() => refresh()).catch(() => {});
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
    const memories = detail.data?.adventureMemoriesUpdate?.memories;
    // Ignore EMPTY frames: on beta the per-turn WS payload is small/partial and the authoritative
    // full memory window arrives via fetch responses, so mid-turn AID emits an empty memories frame.
    // Persisting it wiped the stored Memory Bank, which blanked the panel every turn while the turn
    // was processing (the list only returned once the next non-empty frame landed). A real full-clear
    // is rare for auto-generated memories; keeping the last non-empty list is the safe default.
    if (Array.isArray(memories) && memories.length > 0) {
      dlog("[AID content] Captured real-time adventure memories update. count:", memories.length);
      bufferMemoriesUpdate(sid, memories);
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
    // Same rename as above: the adventure stores the list as `memoryBankEntries` now (legacy blobs
    // may still carry `aidMemories`), so read the new field first or the export is silently empty.
    const aidMemories = backup.adventure?.memoryBankEntries || backup.adventure?.aidMemories || [];
    blob = new Blob([JSON.stringify(aidMemories, null, 2)], { type: "application/json" });
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

// Full DB backup -> download every store as one JSON (survives the moz-extension UUID change
// that wipes IndexedDB when swapping the signed XPI for a test build).
panel.onBackupAll(async () => {
  try {
    const dump: any = await browser.runtime.sendMessage({ kind: "exportAll" });
    if (!dump || dump.error || !dump.__aidBackup) { panel.showToast(dump?.error || "Backup failed", true); return; }
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `aid-story-helper-backup-${stamp}.json`;
    a.click();
    const total = Object.values(dump.stores || {}).reduce((n: number, r: any) => n + (Array.isArray(r) ? r.length : 0), 0);
    panel.showToast(`Backed up ${total} records. Keep this file private — it contains your settings/API keys.`);
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } catch (err: any) {
    panel.showToast(err?.message || String(err), true);
  }
});

// Full DB restore <- read a backup JSON file and repopulate every store (upsert; never wipes).
panel.onRestoreAll(async () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json,.json";
  input.addEventListener("change", async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const res: any = await browser.runtime.sendMessage({ kind: "importAll", data } satisfies BgMessage);
      if (res?.error) { panel.showToast(res.error, true); return; }
      const total = Object.values(res?.counts || {}).reduce((n: number, c: any) => n + (Number(c) || 0), 0);
      panel.showToast(`Restored ${total} records. Reloading…`);
      setTimeout(() => location.reload(), 1200);
    } catch (err: any) {
      panel.showToast(`Restore failed: ${err?.message || String(err)}`, true);
    }
  }, { once: true });
  input.click();
});

// 5) Backfill button -> ask background to fetch full history.
panel.onBackfill(async () => {
  const sid = currentShortId();
  if (!sid) return;
  panel.setStatus(`Backfilling story…`);
  try {
    const res: any = await browser.runtime.sendMessage({ kind: "backfillRequest", shortId: sid } satisfies BgMessage);
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

panel.onSaveSettings(async (settings, protagonist) => {
  await browser.runtime.sendMessage({ kind: "setSettings", settings });
  
  const sid = currentShortId();
  if (sid && protagonist) {
    await browser.runtime.sendMessage({ kind: "setProtagonist", shortId: sid, name: protagonist });
  }
  
  // Post settings update to injected script
  window.postMessage({
    source: "aid-extension-host",
    kind: "settingsUpdate",
    interceptTimeout: settings.interceptTimeout,
    debug: !!settings.showDebug
  }, location.origin);

  panel.showToast("Settings saved!");
  refreshModels(settings.model || undefined);
  refresh();
});

// 6b) Theme change -> auto-save immediately to persist cosmetics
panel.on("themeChange", async (theme) => {
  const settings = { theme };
  await browser.runtime.sendMessage({ kind: "setSettings", settings });
});

// 7) Analyze button -> trigger inference in background.
panel.on("analyze", async () => {
  const sid = currentShortId(); if (!sid) return;
  const res: any = await browser.runtime.sendMessage({ kind: "analyzeRequest", shortId: sid } satisfies BgMessage);
  panel.showAnalyzeResult(res);
  if (res?.error) panel.showToast("Update failed!", true);
  await refresh();
  panel.showDebug(res?.debug);
});

// 7b) Generate (AID): replay AI Dungeon's native Story Card Command for one card.
panel.on("generateCard", async (cardId) => {
  const sid = currentShortId(); if (!sid) return;
  panel.showToast("Generating via AI Dungeon…");
  const res: any = await browser.runtime.sendMessage({ kind: "generateCard", shortId: sid, cardId } satisfies BgMessage);
  if (res?.error) panel.showToast(`Generate failed: ${res.error}`, true);
  else if (res?.id) panel.showToast(`Proposal ready for ${res.characterName} — review & approve.`);
  await refresh();
});

panel.on("generateCompactCard", async (cardId) => {
  const sid = currentShortId(); if (!sid) return;
  panel.showToast("Generating compact description via AI Dungeon…");
  const res: any = await browser.runtime.sendMessage({ kind: "generateCompactCard", shortId: sid, cardId } satisfies BgMessage);
  if (res?.error) panel.showToast(`Compact generate failed: ${res.error}`, true);
  else if (res?.id) panel.showToast(`Compact proposal ready for ${res.characterName} — review & approve.`);
  await refresh();
});

panel.on("rerollAppearance", async (cardId) => {
  const sid = currentShortId(); if (!sid) return;
  panel.showToast("Re-rolling body via AI Dungeon…");
  const res: any = await browser.runtime.sendMessage({ kind: "rerollAppearance", shortId: sid, cardId } satisfies BgMessage);
  if (res?.error) panel.showToast(`Re-roll failed: ${res.error}`, true);
  else if (res?.id) panel.showToast(`Re-rolled body ready for ${res.characterName} — review & approve.`);
  await refresh();
});

panel.on("distillCrystallized", async (cardId: string, charName: string) => {
  const sid = currentShortId(); if (!sid) return;
  panel.showToast(`Distilling long-term memory for ${charName}...`);
  const res = await sendBg({ kind: "distillCrystallized", shortId: sid, cardId, name: charName });
  if (res?.error) panel.showToast(`Distillation failed: ${res.error}`, true);
  else panel.showToast(`Distillation complete for ${charName}!`);
  // Distill-now rewrites Knows in IndexedDB out from under the Knows-editor — drop the cached
  // schema so the next render refetches instead of showing the pre-distill snapshot (Finding 3).
  panel.clearCrystallizedSchemaCache(cardId);
  await refresh();
});

panel.on("backfillNpcMemories", async (charName: string) => {
  const sid = currentShortId(); if (!sid) return;
  panel.showToast(`Backfilling ${charName}'s memories from native memory blocks...`);
  // Fire-and-forget: per-block `npcMemoryProgress` broadcasts (and a final `done`) drive the UI and
  // button reset. We do NOT await the whole backfill for the reset — a long run can outlive the MV3
  // worker/response channel, which would otherwise hang the button forever. Surface errors only.
  sendBg({ kind: "backfillNpcMemories", shortId: sid, characterTitle: charName })
    .then((res: any) => { if (res?.error) panel.showToast(`Backfill failed: ${res.error}`, true); })
    .catch(() => {});
});

panel.on("getNpcMemoryBank", async (charName: string) => {
  const sid = currentShortId(); if (!sid) return { blocks: [] };
  return await sendBg({ kind: "getNpcMemoryBank", shortId: sid, characterTitle: charName });
});

panel.on("saveNpcMemoryBlock", async (charName: string, blockId: string, povText: string) => {
  const sid = currentShortId(); if (!sid) return { error: "No adventure." };
  const res = await sendBg({ kind: "saveNpcMemoryBlock", shortId: sid, characterTitle: charName, blockId, povText });
  if (res?.error) panel.showToast(`Save failed: ${res.error}`, true); else panel.showToast("Memory saved.");
  return res;
});

panel.on("deleteNpcMemoryBlock", async (charName: string, blockId: string) => {
  const sid = currentShortId(); if (!sid) return { error: "No adventure." };
  const res = await sendBg({ kind: "deleteNpcMemoryBlock", shortId: sid, characterTitle: charName, blockId });
  if (res?.error) panel.showToast(`Delete failed: ${res.error}`, true);
  return res;
});

panel.on("regenerateNpcMemoryBlock", async (charName: string, blockId: string) => {
  const sid = currentShortId(); if (!sid) return { error: "No adventure." };
  const res = await sendBg({ kind: "regenerateNpcMemoryBlock", shortId: sid, characterTitle: charName, blockId });
  if (res?.error) panel.showToast(`Regenerate failed: ${res.error}`, true);
  return res;
});

panel.on("consolidateOutlook", async (charName: string) => {
  const sid = currentShortId(); if (!sid) return;
  panel.showToast(`Consolidating ${charName}'s Outlook into their card...`);
  const res = await sendBg({ kind: "consolidateOutlook", shortId: sid, characterTitle: charName });
  if (res?.error) panel.showToast(`Consolidation failed: ${res.error}`, true);
  else {
    const n = (res as any)?.incorporated ?? 0;
    panel.showToast(n > 0 ? `Proposed a card revision folding in ${n} belief${n === 1 ? "" : "s"} — review & approve.` : `No settled beliefs to consolidate for ${charName}.`);
  }
  await refresh();
});

// Helper to broadcast and open card on successful push
async function handleSuccessfulPush(res: any) {
  // Note: value may legitimately be "" for freshly created (still-empty) memory cards —
  // the sync must still reach the injected script so the page refetches and shows the new card.
  if (res?.ok && res.source === "card" && res.cardId && (typeof res.value === "string" || res.deletedAt)) {
    dlog("[AID content] Successful card push detected. Notifying injected script to sync Apollo cache...");
    // 1. Post message to injected.ts to update Apollo Client and trigger refetch
    window.postMessage({
      source: "aid-extension-host",
      kind: "approvedCard",
      cardId: res.cardId,
      value: res.value,
      description: res.description,
      keys: res.keys,
      prevKeys: res.prevKeys,
      deletedAt: res.deletedAt,
      blockAutosave: res.blockAutosave
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
panel.on("proposalDecision", async (id, status) => {
  try {
    const res = await sendBg({ kind: "setVersionStatus", id, status });
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
panel.on("pushVersion", async (id) => {
  dlog("[AID content] onPushVersion handler triggered for id:", id);
  panel.setStatus("Pushing update to AI Dungeon…");
  try {
    const res = await sendBg({ kind: "applyToAid", id });
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

// 10) Memory Bank Tab Event Hooks
panel.on("updateAidMemories", async (memories) => {
  const sid = currentShortId(); if (!sid) return;
  await browser.runtime.sendMessage({ kind: "updateAidMemories", shortId: sid, memories });
  refresh();
});

panel.on("setMemoraidCharacters", async (characters) => {
  const sid = currentShortId();
  if (!sid) return { error: "No active adventure shortId found" };
  try {
    const res = await sendBg({ kind: "setMemoraidCharacters", shortId: sid, characters });
    refresh();
    if (res?.ok) return { ok: true };
    return { error: res?.error || "unknown error" };
  } catch (err: any) {
    return { error: err?.message || String(err) };
  }
});

panel.on("setLivingConfig", async (config, protagonistName) => {
  const sid = currentShortId();
  if (!sid) return { error: "No active adventure shortId found" };
  try {
    const res = await sendBg({ kind: "setLivingConfig", shortId: sid, config });
    if (protagonistName) await browser.runtime.sendMessage({ kind: "setProtagonist", shortId: sid, name: protagonistName });
    refresh();
    if (res?.ok) return { ok: true };
    return { error: res?.error || "unknown error" };
  } catch (err: any) {
    return { error: err?.message || String(err) };
  }
});

panel.on("createStoryCard", async (card) => {
  const sid = currentShortId();
  if (!sid) return { error: "No active adventure shortId found" };
  panel.setStatus("Creating story card...");
  try {
    const res = await sendBg({ kind: "createStoryCard", shortId: sid, card });
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

panel.on("saveCardKeys", async (cardId, keys) => {
  const sid = currentShortId();
  if (!sid) return { error: "No active adventure shortId found" };
  panel.setStatus("Saving card triggers...");
  try {
    const res = await sendBg({ kind: "saveCardKeys", shortId: sid, cardId, keys });
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

panel.on("saveCardValue", async (cardId, value) => {
  const sid = currentShortId();
  if (!sid) return { error: "No active adventure shortId found" };
  panel.setStatus("Saving card entry...");
  try {
    const res = await sendBg({ kind: "saveCardValue", shortId: sid, cardId, value });
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

panel.on("saveCrystallizedSchema", async (cardId, schema) => {
  const sid = currentShortId();
  if (!sid) return { error: "No active adventure shortId found" };
  try {
    const res = await sendBg({ kind: "saveCrystallizedSchema", shortId: sid, cardId, schema });
    refresh();
    if (res?.ok) { panel.showToast("Knows updated."); }
    return res || { error: "No response" };
  } catch (e: any) {
    return { error: e?.message || String(e) };
  }
});

panel.on("savePreferences", async (cardId, prefs) => {
  const sid = currentShortId();
  if (!sid) return { error: "No active adventure shortId found" };
  try {
    const res = await sendBg({ kind: "savePreferences", shortId: sid, cardId, prefs });
    refresh();
    if (res?.ok) { panel.showToast("Preferences updated."); }
    return res || { error: "No response" };
  } catch (e: any) {
    return { error: e?.message || String(e) };
  }
});

panel.on("consolidateCrystallized", async (cardId) => {
  const sid = currentShortId();
  if (!sid) return { error: "No active adventure shortId found" };
  try {
    const res = await sendBg({ kind: "consolidateCrystallizedSchema", shortId: sid, cardId });
    refresh();
    if (res?.ok) { panel.showToast("Schema consolidated."); }
    return res || { error: "No response" };
  } catch (e: any) {
    return { error: e?.message || String(e) };
  }
});

panel.on("getCrystallizedSchema", async (cardId) => {
  const sid = currentShortId();
  if (!sid) return { error: "No active adventure shortId found" };
  try {
    const res = await sendBg({ kind: "getCrystallizedState", shortId: sid, cardId });
    return res || { error: "No response" };
  } catch (e: any) {
    return { error: e?.message || String(e) };
  }
});

panel.on("deleteStoryCard", async (cardId) => {
  const sid = currentShortId();
  if (!sid) return { error: "No active adventure shortId found" };
  panel.setStatus("Deleting story card...");
  try {
    const res = await sendBg({ kind: "deleteStoryCard", shortId: sid, cardId });
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

panel.on("setLifeCardStatus", async (cardId, status) => {
  const sid = currentShortId();
  if (!sid) return { error: "No active adventure shortId found" };
  panel.setStatus(status === "resolved" ? "Resolving relationship..." : `Setting relationship ${status}...`);
  try {
    const res = await sendBg({ kind: "setLifeCardStatus", shortId: sid, cardId, status });
    refresh();
    if (res?.ok) return { ok: true };
    return { error: res?.error || "unknown error" };
  } catch (err: any) {
    return { error: err?.message || String(err) };
  }
});

panel.on("enqueueLifeInjection", async (owner, target, pressure, momentum) => {
  const sid = currentShortId();
  if (!sid) return { error: "No active adventure shortId found" };
  try {
    return await sendBg({ kind: "enqueueLifeInjection", shortId: sid, owner, target, pressure, momentum }) || { error: "No response" };
  } catch (err: any) {
    return { error: err?.message || String(err) };
  }
});

panel.onRefineMemoryBlock(async (index) => {
  const sid = currentShortId();
  if (!sid) return;
  panel.setStatus(`Regenerating memory block #${index + 1}...`);
  try {
    const res = await sendBg({ kind: "refineMemoryBlock", shortId: sid, index });
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
panel.on("setActiveLocation", async (cardId) => {
  const sid = currentShortId();
  if (!sid) return;
  try {
    const res = await sendBg({ kind: "setActiveLocation", shortId: sid, cardId });
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

panel.on("respondToProperNounSuggestion", async (properNoun, accept, type) => {
  const sid = currentShortId();
  if (!sid) return;
  try {
    const res = await sendBg({ kind: "respondToProperNounSuggestion", shortId: sid, properNoun, accept, type });
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
panel.on("updateProperNounLog", async (properNoun, type) => {
  const sid = currentShortId();
  if (!sid) return;
  try {
    await browser.runtime.sendMessage({ kind: "updateProperNounLog", shortId: sid, properNoun, type });
  } catch { /* surfaced via refresh below */ }
  refresh();
});

panel.on("linkProperNounToCard", async (properNoun, cardId) => {
  const sid = currentShortId();
  if (!sid) return;
  try {
    const res = await sendBg({ kind: "linkProperNounToCard", shortId: sid, properNoun, cardId });
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

panel.on("deleteProperNounLog", async (properNoun) => {
  const sid = currentShortId();
  if (!sid) return;
  try {
    await browser.runtime.sendMessage({ kind: "deleteProperNounLog", shortId: sid, properNoun });
  } catch { /* surfaced via refresh below */ }
  refresh();
});

panel.on("clearProperNounLogs", async () => {
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

panel.on("applyInstruction", () => {
  refresh();
});

panel.on("saveGlobalAsset", async (asset) => {
  const res = await browser.runtime.sendMessage({ kind: "saveGlobalAsset", asset });
  refresh();
  return res;
});

panel.on("deleteGlobalAsset", async (id) => {
  const res = await browser.runtime.sendMessage({ kind: "deleteGlobalAsset", id });
  refresh();
  return res;
});

panel.on("importGlobalAsset", async (assetId) => {
  const sid = currentShortId();
  if (!sid) return { error: "No active adventure." };
  const res = await browser.runtime.sendMessage({ kind: "importGlobalAsset", shortId: sid, assetId });
  refresh();
  return res;
});

panel.on("fillSetupValue", (value) => {
  const activeQuestion = detectSetupQuestion();
  if (!activeQuestion || activeQuestion.type !== "text" || !activeQuestion.inputEl) {
    panel.showToast("No active text input question found to fill.", true);
    return;
  }

  // Send message to injected.ts running in the MAIN world to safely fill the input element
  window.postMessage({
    source: "aid-extension-host",
    kind: "fillSetupInput",
    value: value
  }, location.origin);

  panel.showToast(`Filled "${value.length > 20 ? value.slice(0, 20) + '...' : value}"`);
});



browser.runtime.onMessage.addListener((msg: any) => {
  if (!isContextValid()) return;
  if (msg && msg.kind === "approvedCardSync") {
    handleSuccessfulPush(msg.payload);
    // A card refreshed from AID (e.g. auto-update proposal approved elsewhere) can rewrite Knows
    // out from under the Knows-editor's cached schema — drop it so the next render refetches (Finding 3).
    if (msg.payload?.cardId) panel.clearCrystallizedSchemaCache(msg.payload.cardId);
    refresh();
    return;
  }
  if (msg && msg.kind === "stateUpdated") {
    dlog(`[AID content] State updated received from background. Refreshing...`);
    if (msg.type && typeof msg.text === "string") {
      // Note: allow an empty string so a FULL removal (e.g. the last Active Social Dynamics pressure
      // resolving to an empty note) still syncs the cleared value into AID's Apollo cache + editor.
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
  if (msg && msg.kind === "npcMemoryProgress") {
    // Live incremental splice as the backfill generates each NPC-POV block; `done` resets the button.
    panel.refreshNpcMemory(msg.characterTitle, msg.generated, msg.remaining, msg.done, msg.block);
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
  dlog("[AID content] Direct refresh requested by panel");
  refresh();
});

