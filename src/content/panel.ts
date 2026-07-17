import { browser } from "./browser-helper";
import QrCreator from "qr-creator";
import { buildPanelTemplate } from "./panel-template";
import { isSetupPhase, visibleMainTabPane } from "./setup-phase";
import { parsePlotEssentials, getRestOfPlotEssentials, extractDetailsFromText } from "../inference/plot";
import {
  DEFAULT_PROMPT_SECTION_1,
  DEFAULT_PROMPT_SECTION_2,
  DEFAULT_PROMPT_SECTION_3,
  DEFAULT_PROMPT_SECTION_4,
  normalizeType,
} from "../inference/engine";
import { DEFAULT_CARD_COMMANDS, DEFAULT_FORMATTING_MODE } from "../inference/card-command";
import { buildLifeCardValue, keyName, parseLifeCardEntry, DEFAULT_LC_PRESSURES } from "../inference/living-characters";
import { parseCrystallized } from "../inference/crystallized";
import { searchPanelItems, pendingDecisionsCount, type PanelSearchItem } from "../inference/panel-search";
import { renderHome } from "./panel-home";
import type { GlobalAsset, CardRow, Settings, LivingConfig } from "../shared/types";
import { computeDeletedNames, activeCardsMissingFromRoster, explicitTypeLabel } from "../shared/roster";

const TYPE_KEYS = ["character", "class", "race", "location", "faction", "custom", "memoraid"] as const;

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

function safeCallback<T extends (...args: any[]) => any>(cb: T | null | undefined): T {
  return (((...args: any[]) => {
    if (!isContextValid()) {
      console.warn("[AID panel] Extension context is invalidated. Ignoring action.");
      return;
    }
    return cb?.(...args);
  }) as unknown) as T;
}

export interface PanelStateVersion { id: string; characterName: string; entry: string; changeSummary: string; status: string; createdAt: string; pushedAt?: string; actionCount?: number; cardType?: string; cardId?: string; source?: "card" | "plot"; }
export interface PanelState {
  shortId?: string;
  protagonist: string | null;
  scenario?: string | null;
  settings: (Settings & { keyStatus?: Record<string, boolean> }) | null;
  versions: PanelStateVersion[];
  cards?: CardRow[];
  memory?: string | null;
  actionsCount?: number;
  actionCount?: number;
  lastAnalysisAction?: number | null;
  aidMemories?: { actionIds: string[]; text: string; lastRelevantActionId?: string }[] | null;
  lastAutoUpdatedCard?: string | null;
  ops?: { operationName: string; query: string; kind: string }[];
  actions?: { id: string; text: string; type?: string }[] | null;
  livingConfig?: LivingConfig | null;
  memoraidCharacters?: string[];
  activeLocationId?: string | null;
  locationSuggestions?: { properNoun: string; actionId: string; actionText: string; timestamp: string; status: "pending" | "approved" | "rejected"; askingCharacter?: boolean }[];
  properNounLogs?: { actionId: string; properNoun: string; actionText: string; timestamp: string; isLocation: boolean; isCharacter: boolean; type?: string; linkedCardId?: string; linkedCardTitle?: string }[];
  
  // Adventures Manager additions
  isManagerOnly?: boolean;
  adventures?: { shortId: string; title?: string; memory?: string; authorsNote?: string; instructions?: string; createdAt?: string }[];
  globalAssets?: GlobalAsset[];
  allCards?: CardRow[];
  
  // Setup helper additions
  activeSetupQuestion?: {
    type: "text" | "choice";
    question: string;
  } | null;
}
/** Pure-storage panel → host callbacks, registered generically via `panel.on(event, cb)`.
 *  Setters that also wire DOM listeners (onExport, onBackfill, onSaveSettings, onRefineMemoryBlock,
 *  onGrantPermissions, onRefresh, …) keep their dedicated methods on PanelHandle. */
export type NpcMemBlock = { blockId: string; povText: string; entities: string[]; keywords: string[]; turnStart: number; turnEnd: number };

export type PanelEvents = {
  analyze: () => void;
  themeChange: (theme: string) => void;
  applyInstruction: () => void;
  proposalDecision: (versionId: string, status: "applied" | "rejected") => void;
  pushVersion: (versionId: string) => void;
  generateCard: (cardId: string) => void;
  generateCompactCard: (cardId: string) => void;
  rerollAppearance: (cardId: string) => void;
  distillCrystallized: (cardId: string, charName: string) => void;
  backfillNpcMemories?: (charName: string) => void;
  consolidateOutlook?: (charName: string) => void;
  getNpcMemoryBank?: (charName: string) => Promise<{ blocks?: NpcMemBlock[]; cap?: number; error?: string }>;
  saveNpcMemoryBlock?: (charName: string, blockId: string, povText: string) => Promise<{ ok?: boolean; error?: string }>;
  deleteNpcMemoryBlock?: (charName: string, blockId: string) => Promise<{ ok?: boolean; error?: string }>;
  regenerateNpcMemoryBlock?: (charName: string, blockId: string) => Promise<{ block?: NpcMemBlock; error?: string }>;
  updateAidMemories: (memories: any[]) => void;
  setMemoraidCharacters: (characters: string[]) => Promise<{ ok?: boolean; error?: string }>;
  setLivingConfig: (config: LivingConfig, protagonistName: string) => Promise<{ ok?: boolean; error?: string }>;
  createStoryCard: (card: { type: string; title: string; keys: string; value: string; description?: string }) => Promise<{ ok?: boolean; error?: string }>;
  enqueueLifeInjection: (owner: string, target: string, pressure: string, momentum: string) => Promise<{ ok?: boolean; error?: string }>;
  saveCardKeys: (cardId: string, keys: string) => Promise<{ ok?: boolean; error?: string }>;
  saveCardValue: (cardId: string, value: string) => Promise<{ ok?: boolean; error?: string }>;
  saveCrystallizedSchema: (cardId: string, schema: import("../inference/crystallized").SchemaItem[]) => Promise<{ ok?: boolean; error?: string }>;
  savePreferences: (cardId: string, prefs: string[]) => Promise<{ ok?: boolean; error?: string }>;
  getCrystallizedSchema: (cardId: string) => Promise<{ ok?: boolean; error?: string; state?: import("../inference/crystallized").CrystallizedState }>;
  consolidateCrystallized: (cardId: string) => Promise<{ ok?: boolean; error?: string }>;
  deleteStoryCard: (cardId: string) => Promise<{ ok?: boolean; error?: string }>;
  setLifeCardStatus: (cardId: string, status: "active" | "dormant" | "resolved") => Promise<{ ok?: boolean; error?: string }>;
  setActiveLocation: (cardId: string | null) => void;
  respondToProperNounSuggestion: (properNoun: string, accept: boolean, type: string) => void;
  updateProperNounLog: (properNoun: string, type: string) => void;
  linkProperNounToCard: (properNoun: string, cardId: string) => void;
  deleteProperNounLog: (properNoun: string) => void;
  clearProperNounLogs: () => void;
  saveGlobalAsset: (asset: GlobalAsset) => Promise<{ ok?: boolean; error?: string }>;
  deleteGlobalAsset: (id: string) => Promise<{ ok?: boolean; error?: string }>;
  importGlobalAsset: (assetId: string) => Promise<{ ok?: boolean; error?: string; message?: string }>;
  fillSetupValue: (value: string) => void;
};

export interface PanelHandle {
  setStatus(text: string): void;
  showToast(text: string, isError?: boolean): void;
  /** Register a callback for a pure-storage panel event (see PanelEvents). */
  on<K extends keyof PanelEvents>(event: K, cb: PanelEvents[K]): void;
  onExport(cb: (type: "story" | "cards" | "pe" | "aidmemories" | "propernouns" | "all") => void): void;
  onBackupAll(cb: () => void): void;
  onRestoreAll(cb: () => void): void;
  showSelfHealBanner(): void;
  onBackfill(cb: () => void): void;
  onSaveSettings(cb: (settings: Settings, protagonist: string) => void): void;
  onRefineMemoryBlock(cb: (index: number) => void): void;
  onGrantPermissions(cb: () => void): void;
  onRefresh(cb: () => void): void;

  render(state: PanelState): void;
  /** Surgically update the Actions counter + "Since Last Update Check" stat without a full re-render. */
  updateActionCount(count: number, lastAnalysisAction?: number | null): void;
  /** Surgically re-render the Memory Bank list (and unread badge) without a full re-render. */
  updateMemories(memories: PanelState["aidMemories"]): void;
  setModels(models: string[], current?: string): void;
  showDebug(debug: any): void;
  showAnalyzeResult(result: any): void;
  /** Invalidate the Knows-editor schema cache for a card so the next render refetches from
   *  IndexedDB instead of showing a possibly-stale first-fetch snapshot (see crystallizedSchemaCache). */
  clearCrystallizedSchemaCache(cardId: string): void;
  refreshNpcMemory(charName: string, generated?: number, remaining?: number, done?: boolean, block?: NpcMemBlock): void;
}

/** Replace element contents via DOMParser to avoid direct innerHTML assignment (AMO lint).
 *  The <template> wrapper preserves context-sensitive fragments (e.g. <tr>) the head/body parse would drop. */
function setSafeHTML(el: Element | ShadowRoot, html: string): void {
  const doc = new DOMParser().parseFromString(`<template>${html}</template>`, "text/html");
  const tpl = doc.querySelector("template");
  el.textContent = "";
  if (tpl) {
    el.appendChild(document.adoptNode(tpl.content));
  }
}

let refreshCb: (() => void) | null = null;

function triggerRefresh() {
  if (refreshCb) {
    refreshCb();
  } else {
    window.dispatchEvent(new CustomEvent("aid-refresh-panel"));
  }
}

export function mountPanel(): PanelHandle {
  const getManifestVersion = () => {
    try {
      if (typeof browser !== "undefined" && browser.runtime?.getManifest) {
        const manifest = browser.runtime.getManifest();
        if (manifest && manifest.version) return manifest.version;
      }
    } catch (e) {}
    try {
      const g = globalThis as any;
      if (typeof g.chrome !== "undefined" && g.chrome.runtime?.getManifest) {
        const manifest = g.chrome.runtime.getManifest();
        if (manifest && manifest.version) return manifest.version;
      }
    } catch (e) {}
    return "0.2.5";
  };
  const version = getManifestVersion();
  // Pure-storage callbacks registered via panel.on(event, cb) — see PanelEvents.
  const cbs: Partial<PanelEvents> = {};
  const registerPanelEvent = <K extends keyof PanelEvents>(event: K, cb: PanelEvents[K]): void => { cbs[event] = safeCallback(cb); };
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;z-index:2147483647;";
  const root = host.attachShadow({ mode: "open" });
  setSafeHTML(root, buildPanelTemplate(version));
  document.documentElement.appendChild(host);
  function checkUrlVisibility() {
    const isSettingsUrl = location.pathname === "/settings" || location.pathname.endsWith("/settings");
    host.style.display = isSettingsUrl ? "none" : "block";
  }
  setInterval(checkUrlVisibility, 1000);
  checkUrlVisibility();

  let lastState: PanelState | null = null;
  // Crystallized Knows-editor schema cache: IndexedDB is the source of truth post-migration
  // (card.description is retired/always ""), so the panel fetches it via message round-trip
  // and repaints once resolved. Keyed by cardId; cleared entries refetch on next render.
  const crystallizedSchemaCache = new Map<string, import("../inference/crystallized").SchemaItem[]>();
  // Preferences editor cache — populated from the SAME getCrystallizedSchema fetch as the schema cache
  // (the returned state carries both). Values are the plain preference sentences, ranked strongest-first.
  const crystallizedPreferencesCache = new Map<string, string[]>();
  const crystallizedSchemaFetching = new Set<string>();
  const npcMemoryCache = new Map<string, NpcMemBlock[]>();
  const npcMemoryFetching = new Set<string>();
  let npcBackfillWatchdog: ReturnType<typeof setTimeout> | null = null;
  const $ = (id: string) => root.getElementById(id) as HTMLElement;
  const st = $("st"), results = $("results");
  const keyEl = $("key") as HTMLInputElement, protEl = $("prot") as HTMLInputElement, modelEl = $("model") as HTMLSelectElement, winEl = $("win") as HTMLInputElement;
  const memoraidThoughtWinEl = $("memoraid-thought-win") as HTMLInputElement, memoraidPresenceWinEl = $("memoraid-presence-win") as HTMLInputElement;
  const interceptTimeoutEl = $("intercept-timeout") as HTMLInputElement;
  const charCardLimitEl = $("char-card-limit") as HTMLInputElement;
  const memoraidWinEl = $("memoraid-win") as HTMLInputElement;
  const thoughtCardLimitEl = $("thought-card-limit") as HTMLInputElement;
  const provEl = $("prov") as HTMLSelectElement, keyLblEl = $("key-lbl") as HTMLLabelElement;
  const themeEl = $("theme") as HTMLSelectElement;
  const enableLcEl = $("enable-living-characters") as HTMLInputElement;
  const lcTitlePrefixEl = $("lc-title-prefix") as HTMLInputElement;
  const lcKeyPrefixEl = $("lc-key-prefix") as HTMLInputElement;
  const groupThoughtsEl = $("group-thoughts-in-roster") as HTMLInputElement;
  const crystallizedIntervalEl = $("crystallized-interval") as HTMLInputElement;
  const crystallizedEntryMaxCharsEl = $("crystallized-max-chars") as HTMLInputElement;
  const crystallizedNodeCapEl = $("crystallized-node-cap") as HTMLInputElement;
  const crystallizedKnowsCapEl = $("crystallized-knows-cap") as HTMLInputElement;
  const crystallizedRecallsCapEl = $("crystallized-recalls-cap") as HTMLInputElement;
  const crystallizedVividCapEl = $("crystallized-vivid-cap") as HTMLInputElement;
  const crystallizedOutlookCapEl = $("crystallized-outlook-cap") as HTMLInputElement;
  const crystallizedPreferencesCapEl = $("crystallized-preferences-cap") as HTMLInputElement;
  const crystallizedNpcMemoryCapEl = $("crystallized-npc-memory-cap") as HTMLInputElement;

  function updateProviderLabels() {
    const prov = provEl.value;
    if (prov === "openai") {
      keyLblEl.textContent = "OpenAI API key";
      keyEl.placeholder = "sk-...";
    } else if (prov === "gemini") {
      keyLblEl.textContent = "Gemini API key";
      keyEl.placeholder = "AIzaSy...";
    } else if (prov === "ollama") {
      keyLblEl.textContent = "Ollama Host URL";
      keyEl.placeholder = "http://localhost:11434";
    } else {
      keyLblEl.textContent = "Claude API key";
      keyEl.placeholder = "sk-ant-...";
    }
    if (lastState?.settings?.keyStatus?.[prov]) {
      keyEl.placeholder = "•••• (key saved)";
      // Clear value if switching to show placeholder
      if (document.activeElement !== keyEl) {
        keyEl.value = "";
      }
    } else {
      if (document.activeElement !== keyEl) {
        keyEl.value = "";
      }
    }
  }
  provEl.addEventListener("change", updateProviderLabels);

  const box = root.querySelector(".box") as HTMLElement;
  function updateThemeClass() {
    const val = themeEl.value;
    box.className = "box";
    if (isMinimized) box.classList.add("minimized");
    box.classList.add(`theme-${val}`);
  }
  themeEl.addEventListener("change", () => {
    updateThemeClass();
    if (cbs.themeChange) {
      cbs.themeChange(themeEl.value);
    }
  });

  let dragOccurred = false;

  const toggle = root.getElementById("min-toggle") as HTMLElement;
  const contentBody = root.getElementById("content-body") as HTMLElement;

  let isMinimized = localStorage.getItem("aid-tracker-minimized") === "true";

  function applyPosition() {
    if (isMinimized) {
      host.style.bottom = "auto";
      host.style.right = "auto";
      const savedLeft = localStorage.getItem("aid-tracker-pos-left");
      const savedTop = localStorage.getItem("aid-tracker-pos-top");
      let leftVal = savedLeft ? parseFloat(savedLeft) : 12;
      let topVal = savedTop ? parseFloat(savedTop) : window.innerHeight - 60;

      const maxLeft = Math.max(0, window.innerWidth - 45);
      const maxTop = Math.max(0, window.innerHeight - 45);
      leftVal = Math.max(0, Math.min(leftVal, maxLeft));
      topVal = Math.max(0, Math.min(topVal, maxTop));

      host.style.left = leftVal + "px";
      host.style.top = topVal + "px";
      host.style.width = "";
      host.style.height = "";
    } else {
      if (window.innerWidth <= 600) {
        // Mobile docked position, capped so it never covers the whole screen (leaves room to
        // scroll the story underneath). `host` itself carries an explicit size here — the
        // @media (max-width: 600px) cap on `.box:not(.minimized)` in panel-template.ts's CSS
        // only shrinks the inner box, not this outer positioned host, so it's mirrored here.
        host.style.left = "10px";
        host.style.right = "10px";
        host.style.top = "60px";
        host.style.bottom = "auto";
        host.style.width = "calc(100% - 20px)";
        host.style.height = "min(70dvh, 70vh)";

        box.style.width = "100%";
        box.style.height = "100%";
        box.style.maxWidth = "none";
        box.style.maxHeight = "none";
      } else {
        // Desktop floating position
        host.style.bottom = "auto";
        host.style.right = "auto";
        const savedLeft = localStorage.getItem("aid-tracker-pos-left");
        const savedTop = localStorage.getItem("aid-tracker-pos-top");
        let leftVal = savedLeft ? parseFloat(savedLeft) : 12;
        let topVal = savedTop ? parseFloat(savedTop) : window.innerHeight - 500;

        const maxLeft = Math.max(0, window.innerWidth - 320);
        const maxTop = Math.max(0, window.innerHeight - 300);
        leftVal = Math.max(0, Math.min(leftVal, maxLeft));
        topVal = Math.max(0, Math.min(topVal, maxTop));

        host.style.left = leftVal + "px";
        host.style.top = topVal + "px";
        host.style.width = "";
        host.style.height = "";

        const sw = localStorage.getItem("aid-tracker-size-width");
        const sh = localStorage.getItem("aid-tracker-size-height");
        box.style.width = sw || "320px";
        box.style.height = sh || "auto";
        box.style.maxWidth = "90vw";
        box.style.maxHeight = "85vh";
      }
    }
  }

  function updateMinState() {
    const pendingCount = lastState?.versions.filter((v) => v.status === "pending").length ?? 0;
    if (isMinimized) {
      box.classList.add("minimized");
      if (window.innerWidth <= 600) {
        // Mobile circle icon
        let btnContent = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none; display: block;">
  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  <path d="M14 3l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" fill="currentColor" stroke="none" />
</svg>`;
        if (pendingCount > 0) {
          btnContent += `<span class="badge-dot"></span>`;
        }
        setSafeHTML(toggle, btnContent);
      } else {
        // Desktop pill text
        if (pendingCount > 0) {
          setSafeHTML(toggle, `＋ Story Helper <span class="badge-dot"></span>`);
        } else {
          toggle.textContent = "＋ Story Helper";
        }
      }
      st.style.display = "none";
      contentBody.style.display = "none";
      box.style.width = "";
      box.style.height = "";
    } else {
      box.classList.remove("minimized");
      toggle.textContent = "—";
      st.style.display = "block";
      contentBody.style.display = "flex";
    }
    applyPosition();
  }

  // Unified click handler on box for toggle behavior
  box.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;

    // Ignore clicks if they were part of a drag action
    if (dragOccurred) {
      return;
    }

    // Switching tabs swaps the scroll container — the back-to-top button would otherwise linger
    // pointing at the previous pane's scroll position.
    if (target.closest(".main-tab-btn") || target.closest(".subtab-btn")) {
      const btt = root.getElementById("back-to-top");
      if (btt) btt.style.display = "none";
    }

    if (isMinimized) {
      isMinimized = false;
      localStorage.setItem("aid-tracker-minimized", String(isMinimized));
      updateMinState();
    } else if (target.closest("#min-toggle")) {
      isMinimized = true;
      localStorage.setItem("aid-tracker-minimized", String(isMinimized));
      updateMinState();
    } else if (window.innerWidth <= 600 && target.closest("#drag-handle")) {
      // Mobile: the docked panel can't be dragged, so the whole title row doubles as a minimize
      // target — far easier to hit than the small "—" button. Desktop keeps the title as a pure
      // drag handle (minimizing on title-click there would fire after every drag-less click).
      isMinimized = true;
      localStorage.setItem("aid-tracker-minimized", String(isMinimized));
      updateMinState();
    }
  });

  // Back-to-top: long lists (card roster, memory banks) scroll far on every form factor. Scroll
  // events don't bubble, so listen in CAPTURE phase on the content body and track whichever known
  // scroll container the user last scrolled; show the button once it's meaningfully deep.
  {
    let lastScrolledEl: HTMLElement | null = null;
    const backToTop = root.getElementById("back-to-top");
    contentBody.addEventListener("scroll", (e) => {
      const el = e.target as HTMLElement;
      if (!el?.classList) return;
      if (!(el.classList.contains("scrollable-panel") || el.classList.contains("tab-pane") || el.classList.contains("mb-pane"))) return;
      lastScrolledEl = el;
      if (backToTop) backToTop.style.display = el.scrollTop > 300 ? "flex" : "none";
    }, true);
    backToTop?.addEventListener("click", () => {
      lastScrolledEl?.scrollTo({ top: 0, behavior: "smooth" });
      backToTop.style.display = "none";
    });
  }

  // Mobile soft-keyboard handling (visualViewport-driven "keyboard mode").
  //
  // Why the old guard wasn't enough: the wave-5 fix only SKIPPED the JS re-clamp on resize while a
  // panel field was focused — but the panel's mobile size is `min(70dvh, 70vh)` (host inline) plus a
  // `max-height: min(70dvh, 70vh) !important` stylesheet cap on the box, and vh/dvh are CSS units the
  // browser RE-RESOLVES by itself when the soft keyboard shrinks the viewport (Firefox Android shrinks
  // the layout viewport; no resize listener involved). Keyboard halves the viewport → the panel
  // squashes to 70% of half a screen and the field being edited is nowhere in sight.
  //
  // Fix: while an editable field inside the panel is focused AND the keyboard is up (visualViewport
  // height well below its no-keyboard baseline), size the host in fixed PX to fill exactly the visible
  // area above the keyboard — px doesn't re-resolve. `top = vv.offsetTop` also keeps it in view on
  // browsers that overlay the keyboard and pan the visual viewport (Chrome Android) rather than
  // resizing the layout viewport (Firefox Android). The box's !important stylesheet cap is beaten with
  // an inline !important max-height override for the duration. On keyboard close / blur, everything is
  // restored and applyPosition() re-runs. Browsers without visualViewport keep the old skip-the-reclamp
  // behavior (the window resize listener below still guards on editableFocused).
  let editableFocused = false;
  let keyboardMode = false;
  let exitTimer: ReturnType<typeof setTimeout> | undefined;
  const vv = window.visualViewport;
  // No-keyboard viewport height. Updated whenever no panel field is focused (tracks rotation and
  // browser-chrome changes); never updated mid-edit, so it stays the "keyboard closed" reference.
  let vvBaseline = vv ? vv.height : window.innerHeight;
  const KEYBOARD_MIN_DELTA = 100; // px drop below baseline that counts as "keyboard open"

  function isEditableTarget(el: EventTarget | null): el is HTMLElement {
    if (!el || !(el as HTMLElement).tagName) return false;
    const node = el as HTMLElement;
    const tag = node.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || node.isContentEditable === true;
  }

  // Top chrome hidden while typing (mobile keyboard mode): the title bar, stats strip, and the
  // Active Location / suggestion banners contribute nothing mid-edit but eat the little height left
  // above the keyboard. Inline display is saved once on hide (idempotent across repeated vv events)
  // and restored on exit — these are permanent template elements, so a state re-render during
  // keyboard mode can't resurrect them.
  // meta-stats no longer exists as shared chrome (its stat spans moved into the Home pane); the
  // bottom tab bar + footer hide too — nothing above/below the editor earns space while typing.
  const KEYBOARD_HIDE_IDS = ["drag-handle", "location-banners-container", "main-tab-nav", "main-footer"];
  function setChromeHidden(hidden: boolean) {
    for (const id of KEYBOARD_HIDE_IDS) {
      const el = root.getElementById(id) as HTMLElement | null;
      if (!el) continue;
      if (hidden) {
        if (el.dataset.kbPrevDisplay === undefined) el.dataset.kbPrevDisplay = el.style.display;
        el.style.display = "none";
      } else if (el.dataset.kbPrevDisplay !== undefined) {
        el.style.display = el.dataset.kbPrevDisplay;
        delete el.dataset.kbPrevDisplay;
      }
    }
  }

  // Focused-textarea auto-grow (keyboard mode): touch has no usable corner-resize, so while the
  // keyboard is up the textarea being edited is grown to a comfortable share of the space that's
  // left (clamped so surrounding context stays visible). Inline min-height is saved per element and
  // restored on blur, so the row snaps back when editing ends.
  function growFocusedTextarea(el: EventTarget | null) {
    if (!vv || window.innerWidth > 600) return;
    if (!el || (el as HTMLElement).tagName !== "TEXTAREA") return;
    const t = el as HTMLTextAreaElement;
    if (t.dataset.kbPrevMinHeight === undefined) t.dataset.kbPrevMinHeight = t.style.minHeight;
    t.style.setProperty("min-height", Math.max(120, Math.min(Math.round(vv.height * 0.35), 240)) + "px", "important");
  }
  function ungrowTextarea(el: EventTarget | null) {
    if (!el || (el as HTMLElement).tagName !== "TEXTAREA") return;
    const t = el as HTMLTextAreaElement;
    if (t.dataset.kbPrevMinHeight !== undefined) {
      t.style.minHeight = t.dataset.kbPrevMinHeight;
      delete t.dataset.kbPrevMinHeight;
    }
  }

  function applyKeyboardLayout() {
    if (!vv) return;
    keyboardMode = true;
    setChromeHidden(true);
    host.style.left = "10px";
    host.style.right = "10px";
    host.style.width = "calc(100% - 20px)";
    host.style.top = Math.max(0, vv.offsetTop + 6) + "px";
    host.style.height = Math.max(140, vv.height - 12) + "px";
    // Inline !important beats the stylesheet's `max-height: min(70dvh,70vh) !important` mobile cap,
    // which would otherwise re-shrink the box against the keyboard-shrunk viewport.
    box.style.setProperty("max-height", "none", "important");
    box.style.height = "100%";
    box.style.width = "100%";
  }

  function exitKeyboardLayout() {
    if (!keyboardMode) return;
    keyboardMode = false;
    setChromeHidden(false);
    box.style.removeProperty("max-height");
    updateMinState(); // restores the normal docked/floating sizing via applyPosition()
  }

  function onViewportChange() {
    if (!vv) return;
    if (!editableFocused) {
      vvBaseline = vv.height; // keyboard can't be open for the panel — track the real viewport
      if (keyboardMode) exitKeyboardLayout();
      return;
    }
    if (isMinimized || window.innerWidth > 600) return;
    if (vv.height < vvBaseline - KEYBOARD_MIN_DELTA) {
      const entering = !keyboardMode;
      applyKeyboardLayout();
      // Grow the field + scroll the caret into view only on the TRANSITION into keyboard mode — vv
      // fires resize/scroll continuously while panning, and repeated smooth scrolls would fight the
      // user's own scrolling. (vv.height is post-keyboard here, so the grow share is accurate.)
      if (entering) {
        const active = root.activeElement;
        growFocusedTextarea(active);
        if (isEditableTarget(active)) active.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    } else {
      exitKeyboardLayout(); // keyboard dismissed without blurring (e.g. Android back button)
    }
  }
  if (vv) {
    vv.addEventListener("resize", onViewportChange);
    vv.addEventListener("scroll", onViewportChange);
  }

  root.addEventListener("focusin", (e) => {
    const target = e.target;
    if (!isEditableTarget(target)) return;
    if (exitTimer) { clearTimeout(exitTimer); exitTimer = undefined; }
    editableFocused = true;
    // Field hop with the keyboard already up: no vv resize will fire, so grow the new field here.
    if (keyboardMode) growFocusedTextarea(target);
    // Delay for the on-screen keyboard's open animation, then size + scroll the caret into view.
    setTimeout(() => {
      if (root.activeElement !== target) return;
      onViewportChange();
      target.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 300);
  });
  root.addEventListener("focusout", (e) => {
    if (!isEditableTarget(e.target)) return;
    ungrowTextarea(e.target); // per-field, immediate — the next field grows on its own focusin
    // Debounced: focus hopping between two panel fields fires focusout→focusin back-to-back;
    // exiting keyboard mode in that gap would flicker the whole panel resize.
    if (exitTimer) clearTimeout(exitTimer);
    exitTimer = setTimeout(() => {
      exitTimer = undefined;
      const active = root.activeElement;
      if (isEditableTarget(active)) return; // moved to another field — stay in keyboard mode
      editableFocused = false;
      exitKeyboardLayout();
    }, 250);
  });

  window.addEventListener("resize", () => {
    if (editableFocused || keyboardMode) return;
    updateMinState();
  });

  updateMinState();

  box.addEventListener("mouseup", () => {
    if (!isMinimized && window.innerWidth > 600) {
      localStorage.setItem("aid-tracker-size-width", box.style.width);
      localStorage.setItem("aid-tracker-size-height", box.style.height);
    }
  });

  function makeDraggable(el: HTMLElement) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    let startX = 0, startY = 0;

    box.addEventListener("mousedown", (e) => {
      dragOccurred = false;
      onStart(e);
    });
    box.addEventListener("touchstart", (e) => {
      dragOccurred = false;
      onStart(e);
    }, { passive: false });

    function onStart(e: MouseEvent | TouchEvent) {
      const target = e.target as HTMLElement;

      // Do not allow dragging the expanded box on mobile (since it's docked)
      if (!isMinimized && window.innerWidth <= 600) {
        return;
      }

      // If expanded and not clicking/touching on the drag handle, don't drag
      if (!isMinimized && !target.closest("#drag-handle")) {
        return;
      }

      // If expanded and clicking a button (like the minimize button), don't drag
      if (!isMinimized && target.closest("button")) {
        return;
      }

      // Do NOT preventDefault on touchstart! Otherwise emulated click events are canceled on mobile.
      if (e instanceof MouseEvent) {
        e.preventDefault();
      }

      host.classList.add("dragging");

      dragOccurred = false;
      const clientX = e instanceof MouseEvent ? e.clientX : (e.touches[0]?.clientX ?? 0);
      const clientY = e instanceof MouseEvent ? e.clientY : (e.touches[0]?.clientY ?? 0);

      pos3 = clientX;
      pos4 = clientY;
      startX = clientX;
      startY = clientY;

      if (e instanceof MouseEvent) {
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onEnd);
      } else {
        document.addEventListener("touchmove", onMove, { passive: false });
        document.addEventListener("touchend", onEnd);
      }
    }

    function onMove(e: MouseEvent | TouchEvent) {
      const clientX = e instanceof MouseEvent ? e.clientX : (e.touches[0]?.clientX ?? 0);
      const clientY = e instanceof MouseEvent ? e.clientY : (e.touches[0]?.clientY ?? 0);

      // Higher threshold (15px) for touch tap buffer
      if (Math.abs(clientX - startX) > 15 || Math.abs(clientY - startY) > 15) {
        dragOccurred = true;
      }

      // If we are dragging, prevent default touch actions (like scrolling the background page)
      if (dragOccurred || e instanceof MouseEvent) {
        if (e.cancelable) {
          e.preventDefault();
        }
      }

      // Only perform movement logic if we have actually started dragging
      if (!dragOccurred && !(e instanceof MouseEvent)) {
        return;
      }

      pos1 = pos3 - clientX;
      pos2 = pos4 - clientY;
      pos3 = clientX;
      pos4 = clientY;

      let newLeft = el.offsetLeft - pos1;
      let newTop = el.offsetTop - pos2;

      // Keep within viewport boundaries
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const rect = el.getBoundingClientRect();

      newLeft = Math.max(0, Math.min(newLeft, viewportWidth - rect.width));
      newTop = Math.max(0, Math.min(newTop, viewportHeight - rect.height));

      el.style.bottom = "auto";
      el.style.right = "auto";
      el.style.left = newLeft + "px";
      el.style.top = newTop + "px";

      localStorage.setItem("aid-tracker-pos-left", el.style.left);
      localStorage.setItem("aid-tracker-pos-top", el.style.top);
    }

    function onEnd(e: MouseEvent | TouchEvent) {
      host.classList.remove("dragging");
      if (e instanceof MouseEvent) {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onEnd);
      } else {
        document.removeEventListener("touchmove", onMove);
        document.removeEventListener("touchend", onEnd);
      }
    }
  }
  makeDraggable(host);

  const viewTracker = root.getElementById("view-tracker") as HTMLElement;
  const viewSettings = root.getElementById("view-settings") as HTMLElement;
  const viewAnalyze = root.getElementById("view-analyze") as HTMLElement;
  const viewEditor = root.getElementById("view-editor") as HTMLElement;
  const analyzeBody = root.getElementById("analyze-body") as HTMLElement;
  const setupHelperContainer = root.getElementById("setup-helper-container") as HTMLElement;


  function getFormattedChipValue(key: string, val: string): string {
    const k = key.trim().toLowerCase();
    const excluded = ["name", "age", "gender", "sex", "backstory", "personality", "biography", "bio", "history", "class", "race", "faction"];
    if (excluded.includes(k)) {
      return val;
    }
    return `- ${key}: ${val}`;
  }

  setupHelperContainer.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    
    // Check chip click
    const chip = target.closest(".setup-detail-chip");
    if (chip) {
      e.preventDefault(); // Prevent details drawer toggle
      const key = chip.getAttribute("data-key")!;
      const val = chip.getAttribute("data-value")!;
      if (cbs.fillSetupValue) {
        const formatted = getFormattedChipValue(key, val);
        cbs.fillSetupValue(formatted);
      }
      return;
    }
    
    // Check Name/Bio buttons click
    const fillBtn = target.closest(".setup-fill-btn");
    if (fillBtn && lastState?.globalAssets) {
      e.preventDefault(); // Prevent details drawer toggle
      const assetId = fillBtn.getAttribute("data-id")!;
      const asset = lastState.globalAssets.find(a => a.id === assetId);
      if (asset) {
        const field = fillBtn.classList.contains("fill-name") ? "title" : "value";
        const val = field === "title" ? (asset.title || "") : (asset.value || asset.description || "");
        if (val && cbs.fillSetupValue) {
          cbs.fillSetupValue(val);
        }
      }
    }
  });

  setupHelperContainer.addEventListener("input", (e) => {
    const target = e.target as HTMLInputElement;
    if (target && target.id === "setup-favorites-search") {
      const val = target.value;
      const listEl = root.getElementById("setup-favorites-list");
      if (listEl && lastState?.globalAssets) {
        const activeQ = lastState.activeSetupQuestion?.question || "";
        setSafeHTML(listEl, renderSetupFavorites(lastState.globalAssets, val, activeQ, listEl));
      }
    }
  });

  const toastEl = root.getElementById("toast") as HTMLElement;
  let toastTimeout: any = null;

  function showToast(text: string, isError = false) {
    if (toastTimeout) clearTimeout(toastTimeout);
    toastEl.textContent = text;
    if (isError) {
      toastEl.style.background = "rgba(239, 68, 68, 0.95)";
      toastEl.style.boxShadow = "0 8px 24px rgba(239, 68, 68, 0.3)";
    } else {
      toastEl.style.background = "rgba(16, 185, 129, 0.95)";
      toastEl.style.boxShadow = "0 8px 24px rgba(16, 185, 129, 0.3)";
    }
    toastEl.style.display = "block";
    toastEl.offsetHeight; // Force reflow
    toastEl.style.opacity = "1";
    toastEl.style.transform = "translate(-50%, 0)";
    
    toastTimeout = setTimeout(() => {
      toastEl.style.opacity = "0";
      toastEl.style.transform = "translate(-50%, -10px)";
      toastTimeout = setTimeout(() => {
        toastEl.style.display = "none";
      }, 300);
    }, 2500);
  }

  const showTrackerView = () => {
    viewTracker.style.display = "flex"; // Changed to flex to align with outer constraints
    viewSettings.style.display = "none";
    viewAnalyze.style.display = "none";
    viewEditor.style.display = "none";
  };
  const showSettingsView = () => {
    viewTracker.style.display = "none";
    viewSettings.style.display = "flex";
    viewAnalyze.style.display = "none";
    viewEditor.style.display = "none";
    switchTab("tab-gen");
  };
  const showAnalyzeView = () => {
    viewTracker.style.display = "none";
    viewSettings.style.display = "none";
    viewAnalyze.style.display = "flex";
    viewEditor.style.display = "none";
  };

  // Full-panel editor view (Mobile Rethink Phase B): tapping "edit" takes over the panel instead of
  // growing a widget inside a scrolling list. Body content is a SNAPSHOT built at open time —
  // background renderState passes rewrite the hidden panes underneath without touching in-progress
  // edits. The tab bar/footer live inside #view-tracker, so the editor is naturally chrome-free.
  let editorReturnTab = "main-tab-home";
  // One-level back target for editor-from-editor navigation (e.g. editing a memory from inside the
  // Memory Bank view returns to the bank view, not to the tab). Reset on every top-level open.
  let editorOnBack: (() => void) | null = null;
  const openEditorView = (title: string, bodyHtml: string, bind?: (body: HTMLElement) => void, onBack?: () => void) => {
    if (viewEditor.style.display !== "flex") editorReturnTab = activeTabId; // only snapshot on entry from a tab
    editorOnBack = onBack || null;
    viewTracker.style.display = "none";
    viewSettings.style.display = "none";
    viewAnalyze.style.display = "none";
    viewEditor.style.display = "flex";
    const titleEl = root.getElementById("editor-title");
    if (titleEl) titleEl.textContent = title;
    const body = root.getElementById("editor-body") as HTMLElement | null;
    if (body) {
      setSafeHTML(body, bodyHtml);
      bind?.(body);
    }
  };
  const closeEditorView = () => {
    editorOnBack = null;
    showTrackerView();
    switchMainTab(editorReturnTab);
  };
  const goEditorBack = () => {
    if (editorOnBack) { const back = editorOnBack; editorOnBack = null; back(); return; }
    closeEditorView();
  };
  root.getElementById("editor-back")?.addEventListener("click", () => goEditorBack());
  const setAnalyzeLoading = () => {
    setSafeHTML(analyzeBody, `<div style="text-align:center;padding:28px 12px;color:var(--text-secondary);">` +
      `<div class="spinner"></div>` +
      `<div style="margin-top:12px;font-size:12px;font-weight:600;color:var(--text-primary);">Analyzing the story for Plot Essentials updates…</div>` +
      `<div class="note" style="margin-top:6px;">This calls your AI provider, so it can take a bit.</div></div>`);
  };
  root.getElementById("analyze-back")!.addEventListener("click", showTrackerView);

  let offMetaSections: any[] | null = null;
  // Must match OFFMETA_PERMISSION_REQUIRED_PREFIX in src/background/background.ts — the panel
  // can't import that module directly (it's service-worker-only code with side effects).
  const OFFMETA_PERMISSION_REQUIRED_PREFIX = "PERMISSION_REQUIRED:";

  async function loadOffMetaRepository() {
    const container = root.getElementById("offmeta-repo-container");
    if (!container) return;

    if (offMetaSections) {
      renderOffMetaRepository();
      return;
    }

    setSafeHTML(container, `
      <div id="offmeta-loading" style="text-align:center; padding:30px; color:var(--text-secondary);">
        <div class="spinner" style="width:16px; height:16px; margin-bottom:6px; border-width:2px;"></div>
        <div>Fetching rules from Google Doc...</div>
      </div>
    `);

    try {
      const res: any = await browser.runtime.sendMessage({ kind: "getOffMetaRepository" });
      if (res && res.ok && Array.isArray(res.sections)) {
        offMetaSections = res.sections;
        renderOffMetaRepository();
      } else {
        throw new Error(res?.error || "Invalid response");
      }
    } catch (err: any) {
      const rawMessage = err?.message || String(err);
      const isPermissionError = rawMessage.startsWith(OFFMETA_PERMISSION_REQUIRED_PREFIX);

      if (isPermissionError) {
        setSafeHTML(container, `
          <div style="text-align:center; padding:20px; color:#fca5a5;">
            <div style="font-weight:bold; margin-bottom:4px; font-size:11px;">Permission needed</div>
            <div style="font-size:9.5px; margin-bottom:8px;">Firefox needs permission to reach the OffMeta repository (docs.google.com) before it can load these instructions.</div>
            <button id="offmeta-grant-access" style="margin:0; font-size:9.5px; padding:3px 8px; border-radius:4px; background:rgba(16,185,129,0.12); color:var(--accent-color); border:1px solid rgba(16,185,129,0.3); cursor:pointer;">Grant access</button>
          </div>
        `);
        root.getElementById("offmeta-grant-access")?.addEventListener("click", async () => {
          try {
            const res: any = await browser.runtime.sendMessage({ kind: "openPermissionsPage" });
            if (!res || !res.ok) {
              throw new Error(res?.error || "unknown error");
            }
          } catch (openErr: any) {
            setSafeHTML(container, `
              <div style="text-align:center; padding:20px; color:#fca5a5;">
                <div style="font-weight:bold; margin-bottom:4px; font-size:11px;">Failed to open permissions tab</div>
                <div style="font-size:9.5px; margin-bottom:8px;">${esc(openErr?.message || String(openErr))}</div>
                <button id="offmeta-retry" style="margin:0; font-size:9.5px; padding:3px 8px; border-radius:4px; background:rgba(239,68,68,0.1); color:#fca5a5; border:1px solid rgba(239,68,68,0.2); cursor:pointer;">Retry</button>
              </div>
            `);
            root.getElementById("offmeta-retry")?.addEventListener("click", () => {
              loadOffMetaRepository();
            });
          }
        });
        return;
      }

      // Generic failure ALSO offers the grant path: Firefox Android's permissions.contains can
      // report an origin as granted while the fetch still dies unprivileged ("NetworkError"), so
      // never strand the user with only Retry — re-granting (now incl. *.googleusercontent.com,
      // the Docs-export redirect target) is the actual remedy for the permission-shaped failures.
      setSafeHTML(container, `
        <div style="text-align:center; padding:20px; color:#fca5a5;">
          <div style="font-weight:bold; margin-bottom:4px; font-size:11px;">Failed to load repository</div>
          <div style="font-size:9.5px; margin-bottom:8px;">${esc(rawMessage)}</div>
          <div style="display:flex; gap:6px; justify-content:center;">
            <button id="offmeta-retry" style="margin:0; font-size:9.5px; padding:3px 8px; border-radius:4px; background:rgba(239,68,68,0.1); color:#fca5a5; border:1px solid rgba(239,68,68,0.2); cursor:pointer;">Retry</button>
            <button id="offmeta-grant-access" style="margin:0; font-size:9.5px; padding:3px 8px; border-radius:4px; background:rgba(16,185,129,0.12); color:var(--accent-color); border:1px solid rgba(16,185,129,0.3); cursor:pointer;">Grant access</button>
          </div>
        </div>
      `);
      root.getElementById("offmeta-retry")?.addEventListener("click", () => {
        loadOffMetaRepository();
      });
      root.getElementById("offmeta-grant-access")?.addEventListener("click", async () => {
        try {
          const res: any = await browser.runtime.sendMessage({ kind: "openPermissionsPage" });
          if (!res || !res.ok) throw new Error(res?.error || "unknown error");
        } catch (openErr: any) {
          showToast("Failed to open permissions tab: " + (openErr?.message || String(openErr)), true);
        }
      });
    }
  }

  let activeSubTab = "offmeta-subtab-intro";

  function switchSubTab(subTabId: string) {
    activeSubTab = subTabId;
    const btns = root.querySelectorAll(".offmeta-subtab-btn");
    btns.forEach((b) => {
      const active = b.getAttribute("data-subtab") === subTabId;
      b.classList.toggle("active", active);
    });

    const statusEl = root.getElementById("offmeta-status");
    if (statusEl) statusEl.style.display = "none";

    renderOffMetaRepository();
  }

  function renderOffMetaRepository() {
    const container = root.getElementById("offmeta-repo-container");
    const searchContainer = root.getElementById("offmeta-search-container");
    if (!container || !offMetaSections) return;

    if (activeSubTab === "offmeta-subtab-intro") {
      if (searchContainer) searchContainer.style.display = "none";
      
      setSafeHTML(container, `
        <div style="font-size:11.5px; line-height:1.45; color:var(--text-primary); display:flex; flex-direction:column; gap:8px; padding:4px;">
          <div style="background:rgba(52,211,153,0.05); border:1px solid rgba(52,211,153,0.15); border-radius:6px; padding:8px 10px; margin-bottom:4px;">
            <span style="font-weight:700; color:var(--theme-text-color); font-size:12.5px;">Thank You</span>
            <p style="margin:4px 0 0 0; color:var(--text-primary);">A huge thank you to <strong>OffMetaGamer</strong> for graciously allowing this repository to be integrated directly into the AID Story Helper extension!</p>
          </div>
          
          <div style="border:1px solid var(--border-color); border-radius:6px; padding:8px 10px; background:rgba(255,255,255,0.01);">
            <div style="font-weight:700; color:var(--theme-text-color); font-size:12px; margin-bottom:6px; text-transform:uppercase; letter-spacing:0.03em;">Note from OffMetaGamer:</div>
            <div style="font-style:italic; margin-bottom:8px; border-left:2px solid var(--theme-text-color); padding-left:8px; color:var(--text-secondary); font-size:11px;">
              "Special thanks to shiny, Leshok, Hawk, Dirty Kurtis, little hat, SeinSchatten, Zoocata, Aederia, hrafnsnorn, dragonxsx, and all of the other amazing AIN pioneers pushing the boundaries of what AI can do!"
            </div>
            
            <div style="display:flex; flex-direction:column; gap:8px; margin-top:10px;">
              <div>
                ♥️Please keep in mind that I do this as a hobby, it is not my job♥️
              </div>
              <div>
                This resource assumes that you have at least a basic understanding of Plot Components. If you do not understand the basics of AI Instructions, Plot Essentials, Author’s Note, and Placeholders, you may want to first read the <a href="https://help.aidungeon.com/new-player-guide" target="_blank" style="color:var(--theme-text-color); font-weight:bold; text-decoration:underline;">New Player Guide</a> before attempting to utilize this resource. The primary goal is to offer a somewhat organized selection of tried and true AIN/AN that can solve almost any problem that you might run into. Any circumstance under which multiple options are provided with similar purposes indicates that it is worded for specific models or a slightly different effect. Test them until you find one that works well for the model you are using and your specific circumstances. DO NOT take everything in this document and put it into AIN all at once, it will both eat up an absurd amount of tokens and probably also produce terrible results. Instead, pick and choose lines that solve problems you are experiencing or use the sets provided to have a prebuilt experience.
              </div>
              <div style="margin-top:4px; border-top:1px solid var(--border-color); padding-top:8px; display:flex; flex-direction:column; gap:8px;">
                <div style="background:rgba(52,211,153,0.05); border:1px solid rgba(52,211,153,0.15); border-radius:6px; padding:8px 10px; color:var(--text-primary); font-size:11px; line-height:1.4;">
                  Anything that includes <code>\${character.name}</code> is a Placeholder for Scenario creation. In this extension, we dynamically replace <code>\${character.name}</code> with <code>{protagonist}</code> when applying instructions. If you are adding any line with placeholders manually, make sure to replace the placeholder with the relevant information. <code>\${character.name}</code> becomes Dave.
                </div>
                <div style="color:var(--text-secondary); font-size:11px; padding-left:4px;">
                  - <code>[ ]</code> and <code>{ }</code> are used to cluster information. This helps the AI keep track of information that is related to each other better, especially when formatting is otherwise ambiguous.
                </div>
              </div>
            </div>
          </div>
        </div>
      `);
      return;
    }

    if (searchContainer) searchContainer.style.display = "flex";

    const query = (root.getElementById("offmeta-search") as HTMLInputElement | null)?.value?.trim().toLowerCase() || "";
    let html = "";

    for (const sec of offMetaSections) {
      // Filter sections based on activeSubTab
      if (activeSubTab === "offmeta-subtab-premade" && sec.title !== "🤖 Premade AIN") continue;
      if (activeSubTab === "offmeta-subtab-anpe" && sec.title !== "🤖 AN/PE") continue;
      if (activeSubTab === "offmeta-subtab-individual" && (sec.title === "🤖 Premade AIN" || sec.title === "🤖 AN/PE")) continue;

      let sectionHtml = "";
      let matchesSection = false;

      for (const group of sec.groups) {
        let groupHtml = "";
        let groupItemsFiltered: any[] = [];

        for (const item of group.items) {
          const contentMatch = item.content.toLowerCase().includes(query);
          const titleMatch = item.title && item.title.toLowerCase().includes(query);
          const sectionMatch = sec.title.toLowerCase().includes(query);
          const groupMatch = group.name && group.name.toLowerCase().includes(query);

          if (!query || contentMatch || titleMatch || sectionMatch || groupMatch) {
            groupItemsFiltered.push(item);
          }
        }

        if (groupItemsFiltered.length > 0) {
          if (group.name) {
            groupHtml += `<div style="font-size:11px;font-weight:700;color:var(--text-secondary);margin:8px 0 4px 4px;text-transform:uppercase;letter-spacing:0.02em;">${esc(group.name)}</div>`;
          }
          
          groupHtml += `<div style="display:flex;flex-direction:column;gap:6px;">`;

          for (const item of groupItemsFiltered) {
            const isBlock = item.type === "block";
            const displayTitle = item.title || (isBlock ? "Preset Block" : "Instruction");
            
            let itemContent = item.content;
            const protName = lastState?.protagonist || "";
            if (protName) {
              itemContent = itemContent.replace(/\{protagonist\}/gi, protName);
            }
            
            groupHtml += `
              <div class="offmeta-item-card" data-id="${item.id}" style="background:rgba(255,255,255,0.02);border:1px solid var(--border-color);border-radius:6px;padding:6px 8px;display:flex;flex-direction:column;gap:6px;box-sizing:border-box;transition:all 0.2s ease;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;">
                  <span style="font-weight:600;font-size:11.5px;color:var(--theme-text-color);">${esc(displayTitle)}</span>
                  <div style="display:flex;gap:4px;align-items:center;">
                    <button class="offmeta-copy-btn" data-content="${esc(itemContent)}" style="margin:0;padding:3px 6px;font-size:10px;background:rgba(255,255,255,0.04);color:var(--text-secondary);border:1px solid var(--border-color);border-radius:4px;cursor:pointer;" title="Copy to clipboard">Copy</button>
            `;

            if (sec.title === "🤖 AN/PE") {
              groupHtml += `
                    <button class="offmeta-apply-btn" data-id="${item.id}" data-type="an" style="margin:0;padding:3px 6px;font-size:10px;background:rgba(16,185,129,0.1);color:#34d399;border:1px solid rgba(16,185,129,0.2);border-radius:4px;cursor:pointer;">Apply to AN</button>
                    <button class="offmeta-apply-btn" data-id="${item.id}" data-type="pe" style="margin:0;padding:3px 6px;font-size:10px;background:rgba(16,185,129,0.1);color:#34d399;border:1px solid rgba(16,185,129,0.2);border-radius:4px;cursor:pointer;">Apply to PE</button>
              `;
            } else {
              groupHtml += `
                    <button class="offmeta-apply-btn" data-id="${item.id}" data-type="ain" style="margin:0;padding:3px 6px;font-size:10px;background:rgba(16,185,129,0.1);color:#34d399;border:1px solid rgba(16,185,129,0.2);border-radius:4px;cursor:pointer;">Apply AIN</button>
              `;
            }

            groupHtml += `
                  </div>
                </div>
            `;

            if (isBlock) {
              groupHtml += `
                <details style="margin:0;border:none;background:none;padding:0;">
                  <summary style="cursor:pointer;font-size:10.5px;color:var(--text-secondary);padding:2px 0;outline:none;list-style:none;">
                    <span style="border-bottom:1px dashed var(--text-secondary);">Click to preview (${item.content.split('\n').length} lines)</span>
                  </summary>
                  <pre style="margin:4px 0 0 0;font-family:SFMono-Regular,Consolas,monospace;font-size:10px;background:rgba(0,0,0,0.15);padding:6px;border-radius:4px;overflow-x:auto;white-space:pre-wrap;word-break:break-all;color:var(--text-primary);max-height:120px;overflow-y:auto;border:1px solid rgba(255,255,255,0.02);">${esc(itemContent)}</pre>
                </details>
              `;
            } else {
              groupHtml += `
                <div style="font-size:11px;color:var(--text-primary);line-height:1.35;word-break:break-word;">${esc(itemContent)}</div>
              `;
            }

            groupHtml += `</div>`;
          }

          groupHtml += `</div>`;
          sectionHtml += groupHtml;
          matchesSection = true;
        }
      }

      if (matchesSection) {
        // Only show section header if we are in Individual AIN (where there are multiple sections combined)
        const showSecHeader = activeSubTab === "offmeta-subtab-individual";
        html += `
          <div class="offmeta-section-card" style="border-bottom:1px solid var(--border-color);padding-bottom:10px;margin-bottom:6px;">
            ${showSecHeader ? `<div style="font-size:12px;font-weight:700;color:var(--theme-text-color);margin:6px 0;text-transform:uppercase;letter-spacing:0.03em;">${esc(sec.title)}</div>` : ""}
            ${sectionHtml}
          </div>
        `;
      }
    }

    if (!html) {
      html = `<div style="text-align:center;padding:20px;color:var(--text-secondary);font-size:11.5px;">No matching instructions found.</div>`;
    }

    setSafeHTML(container, html);

    // Bind item actions
    container.querySelectorAll(".offmeta-copy-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const target = e.currentTarget as HTMLButtonElement;
        const content = target.getAttribute("data-content") || "";
        navigator.clipboard.writeText(content).then(() => {
          const oldText = target.textContent;
          target.textContent = "Copied!";
          setTimeout(() => { target.textContent = oldText; }, 1500);
        }).catch((err) => {
          console.error("Clipboard copy failed:", err);
        });
      });
    });

    container.querySelectorAll(".offmeta-apply-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const target = e.currentTarget as HTMLButtonElement;
        const id = target.getAttribute("data-id") || "";
        const type = target.getAttribute("data-type") || ""; // "ain" | "an" | "pe"
        
        let foundItem: any = null;
        for (const sec of offMetaSections!) {
          for (const group of sec.groups) {
            const match = group.items.find((it: any) => it.id === id);
            if (match) { foundItem = match; break; }
          }
          if (foundItem) break;
        }

        if (!foundItem) return;

        const oldText = target.textContent;
        target.textContent = "Applying...";
        target.disabled = true;

        const statusEl = root.getElementById("offmeta-status");
        if (statusEl) { statusEl.style.display = "none"; }

        try {
          const sid = lastState?.shortId;
          if (!sid) throw new Error("No active adventure loaded.");

          const res: any = await browser.runtime.sendMessage({
            kind: "applyOffMetaInstruction",
            shortId: sid,
            text: foundItem.content,
            type,
            itemType: foundItem.type
          });

          if (res && res.ok) {
            target.textContent = "Applied!";
            if (statusEl) {
              statusEl.textContent = res.message || "Successfully applied instruction!";
              statusEl.style.background = "rgba(16,185,129,0.1)";
              statusEl.style.color = "#34d399";
              statusEl.style.display = "block";
            }
            if (cbs.applyInstruction) cbs.applyInstruction();
          } else {
            throw new Error(res?.error || "Save rejected by background service worker.");
          }
        } catch (err: any) {
          target.textContent = "Failed";
          if (statusEl) {
            statusEl.textContent = err?.message || String(err);
            statusEl.style.background = "rgba(239,68,68,0.1)";
            statusEl.style.color = "#fca5a5";
            statusEl.style.display = "block";
          }
        } finally {
          setTimeout(() => {
            target.textContent = oldText;
            target.disabled = false;
          }, 3000);
        }
      });
    });
  }

  function switchTab(tabId: string) {
    const panes = root.querySelectorAll(".tab-pane");
    const btns = root.querySelectorAll(".tab-btn");
    panes.forEach((p) => {
      if (p.id === tabId) {
        (p as HTMLElement).style.display = (p.id === "tab-offmeta" || p.id === "tab-manager") ? "flex" : "block";
      } else {
        (p as HTMLElement).style.display = "none";
      }
    });
    btns.forEach((b) => {
      if (b.getAttribute("data-tab") === tabId) {
        b.classList.add("active");
      } else {
        b.classList.remove("active");
      }
    });

    if (tabId === "tab-offmeta") {
      loadOffMetaRepository();
    }
    if (tabId === "tab-manager" && lastState) {
      renderAdventuresManager(lastState);
    }
  }

  root.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tabId = btn.getAttribute("data-tab");
      if (tabId) switchTab(tabId);
    });
  });

  // Adventures Manager sub-tab switching
  function switchManagerSubtab(subtab: string) {
    const globalPane = root.getElementById("subpane-global");
    const explorerPane = root.getElementById("subpane-explorer");
    const btnGlobal = root.getElementById("btn-subtab-global");
    const btnExplorer = root.getElementById("btn-subtab-explorer");

    if (globalPane && explorerPane && btnGlobal && btnExplorer) {
      if (subtab === "global") {
        globalPane.style.display = "flex";
        explorerPane.style.display = "none";
        btnGlobal.classList.add("active");
        btnExplorer.classList.remove("active");
      } else {
        globalPane.style.display = "none";
        explorerPane.style.display = "flex";
        btnExplorer.classList.add("active");
        btnGlobal.classList.remove("active");
      }
    }
    if (lastState) {
      renderAdventuresManager(lastState);
    }
  }

  root.getElementById("btn-subtab-global")?.addEventListener("click", () => switchManagerSubtab("global"));
  root.getElementById("btn-subtab-explorer")?.addEventListener("click", () => switchManagerSubtab("explorer"));
  root.getElementById("btn-view-hidden-adv")?.addEventListener("click", async () => {
    try {
      const res: any = await browser.runtime.sendMessage({ kind: "getHiddenAdventures" });
      if (res?.error) {
        showToast(`Error: ${res.error}`, true);
      } else {
        showHiddenAdventuresModal(res.adventures || []);
      }
    } catch (err: any) {
      showToast(`Error: ${err?.message || err}`, true);
    }
  });

  // Adventures Manager Add Global form visibility toggles
  root.getElementById("btn-show-add-global")?.addEventListener("click", () => {
    const form = root.getElementById("form-add-global");
    const btn = root.getElementById("btn-show-add-global");
    if (form && btn) {
      form.style.display = "flex";
      btn.style.display = "none";
    }
  });

  root.getElementById("btn-cancel-global")?.addEventListener("click", () => {
    const form = root.getElementById("form-add-global");
    const btn = root.getElementById("btn-show-add-global");
    if (form && btn) {
      form.style.display = "none";
      btn.style.display = "block";
      resetAddGlobalForm();
    }
  });

  root.getElementById("global-type")?.addEventListener("change", (e) => {
    const type = (e.target as HTMLSelectElement).value;
    const scFields = root.getElementById("sc-fields");
    if (scFields) {
      scFields.style.display = type === "sc" ? "flex" : "none";
    }
  });

  root.getElementById("btn-save-global")?.addEventListener("click", async () => {
    const type = (root.getElementById("global-type") as HTMLSelectElement).value;
    const title = (root.getElementById("global-title") as HTMLInputElement).value.trim();
    const value = (root.getElementById("global-value") as HTMLTextAreaElement).value.trim();
    
    if (!title || !value) {
      showToast("Title and Content value are required.", true);
      return;
    }

    const asset: GlobalAsset = {
      id: Math.floor(Math.random() * 1e9).toString() + "-" + Date.now(),
      type: type as GlobalAsset["type"],
      title,
      value,
      createdAt: new Date().toISOString()
    };

    if (type === "sc") {
      const scType = (root.getElementById("global-sc-type") as HTMLSelectElement).value;
      const keys = (root.getElementById("global-keys") as HTMLInputElement).value.trim();
      const description = (root.getElementById("global-description") as HTMLTextAreaElement).value.trim();
      
      asset.keys = keys || undefined;
      asset.description = description || undefined;
      asset.cardType = scType;
    }

    if (cbs.saveGlobalAsset) {
      const btn = root.getElementById("btn-save-global") as HTMLButtonElement;
      const oldText = btn.textContent;
      btn.textContent = "Creating...";
      btn.disabled = true;
      try {
        const res = await cbs.saveGlobalAsset(asset);
        if (res?.error) {
          showToast(`Failed to create: ${res.error}`, true);
        } else {
          showToast(`Created favorite '${title}'!`);
          const form = root.getElementById("form-add-global");
          const showBtn = root.getElementById("btn-show-add-global");
          if (form && showBtn) {
            form.style.display = "none";
            showBtn.style.display = "block";
          }
          resetAddGlobalForm();
          triggerRefresh();
        }
      } catch (err: any) {
        showToast(`Error: ${err?.message || err}`, true);
      } finally {
        btn.textContent = oldText;
        btn.disabled = false;
      }
    }
  });

    function showAdventureDeleteModal(shortId: string, advTitle: string) {
      const box = root.querySelector(".box") as HTMLElement | null;
      if (!box) return;

      root.getElementById("adv-delete-modal")?.remove();

      const modal = document.createElement("div");
      modal.id = "adv-delete-modal";
      modal.style.cssText = `
        position:absolute;
        top:0;
        left:0;
        right:0;
        bottom:0;
        background:rgba(18,18,22,0.92);
        z-index:10000;
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        padding:16px;
        box-sizing:border-box;
        backdrop-filter:blur(8px);
        -webkit-backdrop-filter:blur(8px);
      `;

      setSafeHTML(modal, `
        <div style="background:rgba(255,255,255,0.03);border:1px solid var(--border-color);border-radius:12px;padding:16px;width:100%;max-width:280px;box-sizing:border-box;box-shadow:0 10px 25px rgba(0,0,0,0.5);display:flex;flex-direction:column;gap:12px;backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);">
          <div style="font-weight:700;font-size:12.5px;color:var(--text-primary);text-align:center;">Delete Adventure Data?</div>
          <div style="font-size:11px;color:var(--text-secondary);text-align:center;line-height:1.4;word-break:break-all;">"${esc(advTitle)}"<br/><span style="color:var(--text-secondary);font-size:10px;opacity:0.8;">(${esc(shortId)})</span></div>
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:4px;">
            <button id="modal-remove-view" style="width:100%;padding:6px;font-size:11px;margin:0;">Remove from view</button>
            <button id="modal-delete-all" style="width:100%;padding:6px;font-size:11px;margin:0;background:rgba(239,68,68,0.15);color:#fca5a5;border-color:rgba(239,68,68,0.25);font-weight:600;">Delete all adventure data</button>
            <button id="modal-cancel" style="width:100%;padding:6px;font-size:11px;margin:0;background:none;border:none;color:var(--text-secondary);">Cancel</button>
          </div>
        </div>
      `);

      box.appendChild(modal);

      modal.querySelector("#modal-cancel")?.addEventListener("click", () => {
        modal.remove();
      });

      modal.querySelector("#modal-remove-view")?.addEventListener("click", async () => {
        try {
          const res: any = await browser.runtime.sendMessage({ kind: "hideAdventure", shortId });
          if (res?.error) {
            showToast(`Error: ${res.error}`, true);
          } else {
            showToast("Adventure removed from view.");
            triggerRefresh();
          }
        } catch (err: any) {
          showToast(`Error: ${err?.message || err}`, true);
        } finally {
          modal.remove();
        }
      });

      modal.querySelector("#modal-delete-all")?.addEventListener("click", async () => {
        try {
          const res: any = await browser.runtime.sendMessage({ kind: "deleteAdventure", shortId });
          if (res?.error) {
            showToast(`Error: ${res.error}`, true);
          } else {
            showToast("All adventure data deleted.");
            triggerRefresh();
          }
        } catch (err: any) {
          showToast(`Error: ${err?.message || err}`, true);
        } finally {
          modal.remove();
        }
      });
    }

    function showHiddenAdventuresModal(hiddenAdventures: any[]) {
      const box = root.querySelector(".box") as HTMLElement | null;
      if (!box) return;

      root.getElementById("hidden-adv-modal")?.remove();

      const modal = document.createElement("div");
      modal.id = "hidden-adv-modal";
      modal.style.cssText = `
        position:absolute;
        top:0;
        left:0;
        right:0;
        bottom:0;
        background:rgba(18,18,22,0.92);
        z-index:10000;
        display:flex;
        flex-direction:column;
        padding:16px;
        box-sizing:border-box;
        backdrop-filter:blur(8px);
        -webkit-backdrop-filter:blur(8px);
      `;

      let listHtml = "";
      if (hiddenAdventures.length === 0) {
        listHtml = `<div style="text-align:center;color:var(--text-secondary);padding:20px 0;font-size:11.5px;">No hidden adventures found.</div>`;
      } else {
        listHtml = hiddenAdventures.map(adv => `
          <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.02);border:1px solid var(--border-color);border-radius:6px;padding:6px 8px;margin-bottom:6px;gap:6px;box-sizing:border-box;width:100%;">
            <div style="display:flex;flex-direction:column;min-width:0;flex:1;text-align:left;">
              <span style="font-weight:600;font-size:11px;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;" title="${esc(adv.title || "Untitled Adventure")}">${esc(adv.title || "Untitled Adventure")}</span>
              <span style="font-size:9.5px;color:var(--text-secondary);display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">(${esc(adv.shortId)})</span>
            </div>
            <div style="display:flex;gap:4px;flex-shrink:0;">
              <button class="btn-restore-adv btn-micro btn-micro--green" data-shortid="${adv.shortId}">Restore</button>
              <button class="btn-purge-adv btn-micro btn-micro--red" data-shortid="${adv.shortId}" data-title="${esc(adv.title || "Untitled Adventure")}">Delete</button>
            </div>
          </div>
        `).join("");
      }

      setSafeHTML(modal, `
        <div style="background:rgba(255,255,255,0.03);border:1px solid var(--border-color);border-radius:12px;padding:16px;width:100%;height:100%;max-height:100%;box-sizing:border-box;box-shadow:0 10px 25px rgba(0,0,0,0.5);display:flex;flex-direction:column;gap:12px;backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);overflow:hidden;">
          <div style="font-weight:700;font-size:12.5px;color:var(--text-primary);text-align:center;flex-shrink:0;">Hidden Adventures</div>
          <div style="flex:1;overflow-y:auto;min-height:0;padding-right:4px;">
            ${listHtml}
          </div>
          <div style="display:flex;justify-content:center;margin-top:4px;flex-shrink:0;">
            <button id="modal-close-hidden" style="width:100%;padding:6px;font-size:11px;margin:0;">Close</button>
          </div>
        </div>
      `);

      box.appendChild(modal);

      modal.querySelector("#modal-close-hidden")?.addEventListener("click", () => {
        modal.remove();
      });

      modal.querySelectorAll(".btn-restore-adv").forEach(btn => {
        btn.addEventListener("click", async () => {
          const shortId = btn.getAttribute("data-shortid") || "";
          if (!shortId) return;
          try {
            const res: any = await browser.runtime.sendMessage({ kind: "unhideAdventure", shortId });
            if (res?.error) {
              showToast(`Error: ${res.error}`, true);
            } else {
              showToast("Adventure restored to view.");
              triggerRefresh();
              modal.remove();
            }
          } catch (err: any) {
            showToast(`Error: ${err?.message || err}`, true);
          }
        });
      });

      modal.querySelectorAll(".btn-purge-adv").forEach(btn => {
        btn.addEventListener("click", async () => {
          const shortId = btn.getAttribute("data-shortid") || "";
          const advTitle = btn.getAttribute("data-title") || "Untitled Adventure";
          if (!shortId) return;
          showAdventureDeleteModal(shortId, advTitle);
          modal.remove();
        });
      });
    }

  function renderAdventuresManager(state: PanelState) {
    const listGlobal = root.getElementById("global-assets-list");
    const listExplorer = root.getElementById("db-explorer-list");
    if (!listGlobal || !listExplorer) return;

    // Collect open details state before rendering to prevent collapsing
    const openIds = new Set<string>();
    listExplorer.querySelectorAll("details[open]").forEach(el => {
      const oid = el.getAttribute("data-open-id");
      if (oid) openIds.add(oid);
    });

    const openGlobalIds = new Set<string>();
    listGlobal.querySelectorAll("details[open]").forEach(el => {
      const oid = el.getAttribute("data-open-id");
      if (oid) openGlobalIds.add(oid);
    });

    const isOpen = (id: string) => openIds.has(id) ? " open" : "";
    const isGlobalOpen = (id: string) => openGlobalIds.has(id) ? " open" : "";

    const SC_LABEL_ORDER = ["Characters", "Classes", "Races", "Locations", "Factions", "Custom"];
    
    function getCardTypeLabel(cardType: string | undefined): string {
      if (!cardType) return "Custom";
      const lower = cardType.toLowerCase();
      const TYPE_LABELS: Record<string, string> = {
        character: "Characters",
        class: "Classes",
        race: "Races",
        location: "Locations",
        faction: "Factions",
        custom: "Custom"
      };
      if (TYPE_LABELS[lower]) return TYPE_LABELS[lower];
      return cardType.charAt(0).toUpperCase() + cardType.slice(1);
    }

    const isAssetFavorited = (type: string, title: string, value: string, keys?: string): boolean => {
      return globalAssets.some(a => 
        a.type === type && 
        a.title === title && 
        a.value === value && 
        (a.keys || "") === (keys || "")
      );
    };

    // 1. Render Favorites
    const globalAssets = state.globalAssets || [];
    if (globalAssets.length === 0) {
      setSafeHTML(listGlobal, `<div style="text-align:center;color:var(--text-secondary);padding:20px 0;font-size:11.5px;">No favorites stored yet. Add some below or favorite them from local adventures!</div>`);
    } else {
      // Group favorites by type
      const groups: Record<string, GlobalAsset[]> = { ain: [], an: [], pe: [], sc: [] };
      for (const a of globalAssets) {
        const group = groups[a.type];
        if (group) group.push(a);
      }

      const typeTitles = {
        ain: "AI Instructions (AIN)",
        an: "Author's Notes (AN)",
        pe: "Character Descriptions (PE)",
        sc: "Story Cards (SC)"
      };

      let html = "";
      for (const [type, items] of Object.entries(groups)) {
        if (items.length === 0) continue;
        
        if (type === "sc") {
          // Group Story Cards by cardType
          const scGroups: Record<string, GlobalAsset[]> = {};
          for (const item of items) {
            const lbl = getCardTypeLabel(item.cardType);
            if (!scGroups[lbl]) scGroups[lbl] = [];
            scGroups[lbl].push(item);
          }
          const rank = (l: string) => {
            const idx = SC_LABEL_ORDER.indexOf(l);
            return idx === -1 ? 1000 : idx;
          };
          const sortedLabels = Object.keys(scGroups).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));

          for (const lbl of sortedLabels) {
            const subItems = scGroups[lbl] || [];
            const subKey = `sc-${lbl.toLowerCase().replace(/\s+/g, "-")}`;
            html += `<details class="group-header" data-open-id="global-cat-${subKey}"${isGlobalOpen(`global-cat-${subKey}`)}>` +
              `<summary><span>${esc(lbl)} (${subItems.length})</span></summary>` +
              `<div style="padding:4px 8px 8px; display:flex; flex-direction:column; gap:6px;">`;
            for (const item of subItems) {
              const escVal = esc(item.value);
              const scMeta = `<div style="font-size:10px;color:var(--text-secondary);margin-bottom:2px;"><strong>Keys:</strong> ${esc(item.keys || "")}</div>`;
              
              html += `
                <div class="global-asset-card" data-id="${item.id}" style="background:rgba(255,255,255,0.02);border:1px solid var(--border-color);border-radius:8px;padding:8px;box-sizing:border-box;">
                  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;margin-bottom:4px;">
                    <div style="font-weight:600;font-size:11.5px;color:var(--text-primary);word-break:break-all;">${esc(item.title)}</div>
                    <div style="display:flex;gap:4px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;">
                      ${!state.isManagerOnly ? `<button class="btn-import-asset btn-micro btn-micro--green">Import</button>` : ""}
                      <button class="btn-edit-asset btn-micro btn-micro--blue">Edit</button>
                      <button class="btn-delete-asset btn-micro btn-micro--red">Remove From Favorites</button>
                    </div>
                  </div>
                  ${scMeta}
                  <details style="cursor:pointer;" data-open-id="global-val-${item.id}"${isGlobalOpen(`global-val-${item.id}`)}>
                    <summary style="font-size:10.5px;color:var(--text-secondary);list-style:none;">Show value</summary>
                    <div style="margin-top:4px;padding:6px;background:rgba(0,0,0,0.2);border-radius:4px;font-size:10.5px;color:var(--text-primary);white-space:pre-wrap;word-break:break-all;font-family:SFMono-Regular,Consolas,monospace;cursor:text;" class="selectable-text">${escVal}</div>
                  </details>
                </div>
              `;
            }
            html += `</div></details>`;
          }
        } else {
          html += `<details class="group-header" data-open-id="global-cat-${type}"${isGlobalOpen(`global-cat-${type}`)}>` +
            `<summary><span>${typeTitles[type as keyof typeof typeTitles]} (${items.length})</span></summary>` +
            `<div style="padding:4px 8px 8px; display:flex; flex-direction:column; gap:6px;">`;
          for (const item of items) {
            const escVal = esc(item.value);
            
            html += `
              <div class="global-asset-card" data-id="${item.id}" style="background:rgba(255,255,255,0.02);border:1px solid var(--border-color);border-radius:8px;padding:8px;box-sizing:border-box;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;margin-bottom:4px;">
                  <div style="font-weight:600;font-size:11.5px;color:var(--text-primary);word-break:break-all;">${esc(item.title)}</div>
                  <div style="display:flex;gap:4px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;">
                    ${!state.isManagerOnly ? `<button class="btn-import-asset btn-micro btn-micro--green">Import</button>` : ""}
                    <button class="btn-edit-asset btn-micro btn-micro--blue">Edit</button>
                    <button class="btn-delete-asset btn-micro btn-micro--red">Remove From Favorites</button>
                  </div>
                </div>
                <details style="cursor:pointer;" data-open-id="global-val-${item.id}"${isGlobalOpen(`global-val-${item.id}`)}>
                  <summary style="font-size:10.5px;color:var(--text-secondary);list-style:none;">Show value</summary>
                  <div style="margin-top:4px;padding:6px;background:rgba(0,0,0,0.2);border-radius:4px;font-size:10.5px;color:var(--text-primary);white-space:pre-wrap;word-break:break-all;font-family:SFMono-Regular,Consolas,monospace;cursor:text;" class="selectable-text">${escVal}</div>
                </details>
              </div>
            `;
          }
          html += `</div></details>`;
        }
      }
      setSafeHTML(listGlobal, html);

      // Bind import buttons
      listGlobal.querySelectorAll(".btn-import-asset").forEach(btn => {
        btn.addEventListener("click", async () => {
          const card = btn.closest(".global-asset-card");
          const assetId = card?.getAttribute("data-id") || "";
          if (assetId && state.shortId && cbs.importGlobalAsset) {
            btn.textContent = "Importing...";
            const res = await cbs.importGlobalAsset(assetId);
            if (res?.error) {
              showToast(`Import failed: ${res.error}`, true);
              btn.textContent = "Import";
            } else {
              showToast(res?.message || "Successfully imported asset!");
              btn.textContent = "Imported";
              setTimeout(() => { btn.textContent = "Import"; }, 2000);
            }
          }
        });
      });

      // Bind remove (delete) buttons
      listGlobal.querySelectorAll(".btn-delete-asset").forEach(btn => {
        let armTimeout: any = null;
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const card = btn.closest(".global-asset-card");
          const assetId = card?.getAttribute("data-id") || "";
          if (!assetId || !cbs.deleteGlobalAsset) return;

          if (btn.classList.contains("armed")) {
            clearTimeout(armTimeout);
            btn.classList.remove("armed");
            btn.textContent = "Remove From Favorites";
            const res = await cbs.deleteGlobalAsset(assetId);
            if (res?.error) {
              showToast(`Remove failed: ${res.error}`, true);
            } else {
              showToast("Removed from favorites.");
              triggerRefresh();
            }
          } else {
            btn.classList.add("armed");
            btn.textContent = "Confirm Remove?";
            armTimeout = setTimeout(() => {
              btn.classList.remove("armed");
              btn.textContent = "Remove From Favorites";
            }, 3000);
          }
        });
      });

      // Bind edit buttons
      listGlobal.querySelectorAll(".btn-edit-asset").forEach(btn => {
        btn.addEventListener("click", () => {
          const card = btn.closest(".global-asset-card") as HTMLElement;
          const assetId = card?.getAttribute("data-id") || "";
          if (!assetId) return;
          const asset = globalAssets.find(a => a.id === assetId);
          if (!asset) return;

          // Replace card contents with editable form
          let currentType = asset.type;

          const getFormValues = () => {
            const scTypeSelect = card.querySelector(".edit-sc-type") as HTMLSelectElement;
            const customTypeInput = card.querySelector(".edit-sc-custom-type") as HTMLInputElement;
            const titleInput = card.querySelector(".edit-asset-title") as HTMLInputElement;
            const valueTextarea = card.querySelector(".edit-asset-value") as HTMLTextAreaElement;
            const keysInput = card.querySelector(".edit-asset-keys") as HTMLInputElement;
            const descInput = card.querySelector(".edit-asset-desc") as HTMLInputElement;

            let cardType: string | undefined = undefined;
            if (scTypeSelect) {
              if (scTypeSelect.value === "custom") {
                cardType = customTypeInput ? customTypeInput.value.trim() : "custom";
                if (!cardType) cardType = "custom";
              } else {
                cardType = scTypeSelect.value;
              }
            }

            return {
              title: titleInput ? titleInput.value : asset.title,
              value: valueTextarea ? valueTextarea.value : asset.value,
              keys: keysInput ? keysInput.value : asset.keys,
              description: descInput ? descInput.value : asset.description,
              cardType: cardType ?? asset.cardType
            };
          };

          const renderDynamicFields = (type: string, vals: { title: string; value: string; keys?: string; description?: string; cardType?: string }) => {
            if (type === "sc") {
              const standardTypes = ["character", "location", "faction", "class", "race"];
              const currentCardType = vals.cardType || "custom";
              const isStandard = standardTypes.includes(currentCardType.toLowerCase());
              const scType = isStandard ? currentCardType.toLowerCase() : "custom";
              const customTypeValue = !isStandard && currentCardType.toLowerCase() !== "custom" ? currentCardType : "";

              return `
                <label style="font-size:9.5px;font-weight:600;margin:0;">Story Card Type</label>
                <select class="edit-sc-type input-compact input-dark" style="margin:0;">
                  <option value="character" ${scType === "character" ? "selected" : ""}>Character</option>
                  <option value="location" ${scType === "location" ? "selected" : ""}>Location</option>
                  <option value="faction" ${scType === "faction" ? "selected" : ""}>Faction</option>
                  <option value="class" ${scType === "class" ? "selected" : ""}>Class</option>
                  <option value="race" ${scType === "race" ? "selected" : ""}>Race</option>
                  <option value="custom" ${scType === "custom" ? "selected" : ""}>Custom</option>
                </select>

                <div class="edit-sc-custom-type-container" style="display:${scType === "custom" ? "flex" : "none"};flex-direction:column;gap:6px;">
                  <label style="font-size:9.5px;font-weight:600;margin:0;">Custom Type</label>
                  <input class="edit-sc-custom-type input-compact input-dark" type="text" value="${esc(customTypeValue)}" placeholder="Enter custom type..." style="margin:0;" />
                </div>

                <label style="font-size:9.5px;font-weight:600;margin:0;">Name</label>
                <input class="edit-asset-title input-compact input-dark" type="text" value="${esc(vals.title)}" style="margin:0;" />

                <label style="font-size:9.5px;font-weight:600;margin:0;">Entry</label>
                <textarea class="edit-asset-value input-compact input-dark" rows="6" style="margin:0;font-family:SFMono-Regular,Consolas,monospace;resize:vertical;">${esc(vals.value)}</textarea>

                <label style="font-size:9.5px;font-weight:600;margin:0;">Triggers</label>
                <input class="edit-asset-keys input-compact input-dark" type="text" value="${esc(vals.keys || "")}" style="margin:0;" />

                <label style="font-size:9.5px;font-weight:600;margin:0;">Notes</label>
                <input class="edit-asset-desc input-compact input-dark" type="text" value="${esc(vals.description || "")}" style="margin:0;" />
              `;
            } else {
              return `
                <label style="font-size:9.5px;font-weight:600;margin:0;">Title</label>
                <input class="edit-asset-title input-compact input-dark" type="text" value="${esc(vals.title)}" style="margin:0;" />

                <label style="font-size:9.5px;font-weight:600;margin:0;">Value</label>
                <textarea class="edit-asset-value input-compact input-dark" rows="6" style="margin:0;font-family:SFMono-Regular,Consolas,monospace;resize:vertical;">${esc(vals.value)}</textarea>
              `;
            }
          };

          setSafeHTML(card, `
            <div style="display:flex;flex-direction:column;gap:6px;">
              <div style="font-weight:700;font-size:10px;text-transform:uppercase;color:var(--text-secondary);">Edit Favorite</div>
              
              <label style="font-size:9.5px;font-weight:600;margin:0;">Asset Type</label>
              <select class="edit-asset-type input-compact input-dark" style="margin:0;">
                <option value="ain" ${currentType === "ain" ? "selected" : ""}>AI Instructions (AIN)</option>
                <option value="an" ${currentType === "an" ? "selected" : ""}>Author's Note (AN)</option>
                <option value="pe" ${currentType === "pe" ? "selected" : ""}>Character Description (PE)</option>
                <option value="sc" ${currentType === "sc" ? "selected" : ""}>Story Card (SC)</option>
              </select>

              <div class="dynamic-edit-fields" style="display:flex;flex-direction:column;gap:6px;">
              </div>
              
              <div style="display:flex;gap:4px;justify-content:flex-end;margin-top:4px;">
                <button class="btn-save-edit" style="margin:0;padding:2px 8px;font-size:10px;background:rgba(16,185,129,0.2);color:#34d399;border:1px solid rgba(16,185,129,0.3);border-radius:4px;cursor:pointer;">Save</button>
                <button class="btn-cancel-edit btn-cancel" style="margin:0;">Cancel</button>
              </div>
            </div>
          `);

          const dynamicContainer = card.querySelector(".dynamic-edit-fields") as HTMLElement;
          const initialVals = {
            title: asset.title,
            value: asset.value,
            keys: asset.keys,
            description: asset.description,
            cardType: asset.cardType
          };

          const bindDynamicFieldsListeners = () => {
            const scTypeSelect = card.querySelector(".edit-sc-type") as HTMLSelectElement;
            scTypeSelect?.addEventListener("change", (e) => {
              const scType = (e.target as HTMLSelectElement).value;
              const customTypeContainer = card.querySelector(".edit-sc-custom-type-container") as HTMLElement;
              if (customTypeContainer) {
                customTypeContainer.style.display = scType === "custom" ? "flex" : "none";
              }
            });
          };

          // Initial render of dynamic fields
          if (dynamicContainer) {
            setSafeHTML(dynamicContainer, renderDynamicFields(currentType, initialVals));
            bindDynamicFieldsListeners();
          }

          // Handle Asset Type changes
          card.querySelector(".edit-asset-type")?.addEventListener("change", (e) => {
            const newType = (e.target as HTMLSelectElement).value as "ain" | "an" | "pe" | "sc";
            const currentVals = getFormValues();
            currentType = newType;
            if (dynamicContainer) {
              setSafeHTML(dynamicContainer, renderDynamicFields(newType, currentVals));
              bindDynamicFieldsListeners();
            }
          });

          // Bind cancel
          card.querySelector(".btn-cancel-edit")?.addEventListener("click", () => {
            triggerRefresh();
          });

          // Bind save
          card.querySelector(".btn-save-edit")?.addEventListener("click", async () => {
            const typeSelect = card.querySelector(".edit-asset-type") as HTMLSelectElement;
            const vals = getFormValues();

            if (cbs.saveGlobalAsset) {
              const newType = typeSelect.value as "ain" | "an" | "pe" | "sc";
              const updatedAsset: GlobalAsset = {
                ...asset,
                type: newType,
                title: vals.title,
                value: vals.value,
                keys: newType === "sc" ? vals.keys : undefined,
                description: newType === "sc" ? vals.description : undefined,
                cardType: newType === "sc" ? vals.cardType : undefined
              };
              const res = await cbs.saveGlobalAsset(updatedAsset);
              if (res?.error) {
                showToast(`Save failed: ${res.error}`, true);
              } else {
                showToast("Favorite updated.");
                triggerRefresh();
              }
            }
          });
        });
      });
    }

    // 2. Render Database Explorer
    // Sort by recency (newest createdAt first) so the list isn't in arbitrary DB order. Missing
    // timestamps sort to the bottom.
    const adventures = [...(state.adventures || [])].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    const allCards = state.isManagerOnly ? (state.cards || []) : (state.allCards || []);
    if (adventures.length === 0) {
      setSafeHTML(listExplorer, `<div style="text-align:center;color:var(--text-secondary);padding:20px 0;font-size:11.5px;">No saved adventures found in the database.</div>`);
    } else {
      let explorerHtml = "";
      for (const adv of adventures) {
        const advCards = allCards.filter(c => c.shortId === adv.shortId && !c.deletedAt);
        const plotBlocks = parsePlotEssentials(adv.memory || "");
        const restOfPE = getRestOfPlotEssentials(adv.memory || "");
        
        let assetsCount = 0;
        if (adv.instructions) assetsCount++;
        if (adv.authorsNote) assetsCount++;
        assetsCount += plotBlocks.length;
        if (plotBlocks.length === 0 && restOfPE) assetsCount++;
        assetsCount += advCards.length;

        explorerHtml += `
          <details class="adv-explorer-card" style="background:rgba(255,255,255,0.02);border:1px solid var(--border-color);border-radius:8px;margin-bottom:6px;box-sizing:border-box;" data-shortid="${adv.shortId}" data-open-id="adv-${adv.shortId}"${isOpen(`adv-${adv.shortId}`)}>
            <summary style="padding:8px;font-weight:600;font-size:11.5px;color:var(--text-primary);cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;">
              <span style="flex:1;word-break:break-all;font-size:11.5px;text-align:left;">📁 ${esc(adv.title || "Untitled Adventure")} <span style="font-weight:normal;font-size:9.5px;color:var(--text-secondary);">(${esc(adv.shortId)})</span></span>
              <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
                <span style="font-size:9.5px;background:var(--btn-bg);padding:2px 6px;border-radius:4px;color:var(--text-secondary);">${assetsCount} assets</span>
                <button class="btn-delete-adv btn-micro btn-micro--red" data-shortid="${adv.shortId}" data-title="${esc(adv.title || "Untitled Adventure")}">Remove from...</button>
              </div>
            </summary>
            <div style="padding:0 8px 8px 8px;border-top:1px solid var(--border-color);margin-top:4px;display:flex;flex-direction:column;gap:8px;">
              ${adv.instructions ? (() => {
                const isFav = isAssetFavorited("ain", `AIN from ${adv.title || "Adventure"}`, adv.instructions);
                const starChar = isFav ? "★" : "☆";
                const starColor = isFav ? "var(--theme-text-color)" : "var(--text-secondary)";
                return `
                  <details class="group-header" data-open-id="cat-${adv.shortId}-ain"${isOpen(`cat-${adv.shortId}-ain`)}>
                    <summary><span>⚙️ AI Instructions</span></summary>
                    <div style="padding:4px 8px 8px; display:flex; flex-direction:column; gap:6px;">
                      <div class="local-asset-row" style="background:rgba(0,0,0,0.15);padding:6px;border-radius:4px;cursor:default;">
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                          <span style="font-size:10px;color:var(--text-secondary);">Instruction Content</span>
                          <button class="btn-favorite-local" data-type="ain" data-title="AIN from ${esc(adv.title || "Adventure")}" data-value="${esc(adv.instructions)}" style="background:none;border:none;color:${starColor};cursor:pointer;padding:2px;font-size:14px;" title="Toggle Favorite">${starChar}</button>
                        </div>
                        <div style="font-size:10.5px;color:var(--text-primary);font-family:SFMono-Regular,Consolas,monospace;white-space:pre-wrap;max-height:120px;overflow-y:auto;word-break:break-all;margin-top:2px;" class="selectable-text">${esc(adv.instructions)}</div>
                      </div>
                    </div>
                  </details>
                `;
              })() : ""}
              
              ${(plotBlocks.length > 0 || restOfPE) ? (() => {
                const countText = plotBlocks.length > 0 ? ` (${plotBlocks.length})` : "";
                return `
                  <details class="group-header" data-open-id="cat-${adv.shortId}-pe"${isOpen(`cat-${adv.shortId}-pe`)}>
                    <summary><span>👥 Plot Essentials${countText}</span></summary>
                    <div style="padding:4px 8px 8px; display:flex; flex-direction:column; gap:6px;">
                      ${plotBlocks.map(b => {
                        const isFav = isAssetFavorited("pe", b.name, b.text);
                        const starChar = isFav ? "★" : "☆";
                        const starColor = isFav ? "var(--theme-text-color)" : "var(--text-secondary)";
                        return `
                          <div class="local-asset-row" style="background:rgba(0,0,0,0.15);padding:6px;border-radius:4px;">
                            <div style="display:flex;justify-content:space-between;align-items:center;">
                              <span style="font-weight:600;font-size:11px;color:var(--text-primary);">${esc(b.name)}</span>
                              <button class="btn-favorite-local" data-type="pe" data-title="${esc(b.name)}" data-value="${esc(b.text)}" style="background:none;border:none;color:${starColor};cursor:pointer;padding:2px;font-size:14px;" title="Toggle Favorite">${starChar}</button>
                            </div>
                            <details style="cursor:pointer;margin-top:2px;" data-open-id="char-${adv.shortId}-${esc(b.name)}"${isOpen(`char-${adv.shortId}-${esc(b.name)}`)}>
                              <summary style="font-size:10px;color:var(--text-secondary);list-style:none;outline:none;user-select:none;">Show description...</summary>
                              <div style="font-size:10.5px;color:var(--text-secondary);white-space:pre-wrap;margin-top:2px;cursor:text;" class="selectable-text">${esc(b.text)}</div>
                            </details>
                          </div>
                        `;
                      }).join("")}
                      
                      ${restOfPE ? `
                        <details class="local-category-details" style="margin-top:4px;" data-open-id="cat-${adv.shortId}-pe-full"${isOpen(`cat-${adv.shortId}-pe-full`)}>
                          <summary><span>📄 See Full Plot Essentials</span></summary>
                          <div style="padding:4px 8px 8px; display:flex; flex-direction:column; gap:6px;">
                            <div class="local-asset-row" style="background:rgba(0,0,0,0.15);padding:6px;border-radius:4px;cursor:default;">
                              <div style="font-size:10.5px;color:var(--text-primary);font-family:SFMono-Regular,Consolas,monospace;white-space:pre-wrap;max-height:200px;overflow-y:auto;word-break:break-all;margin-top:2px;" class="selectable-text">${esc(restOfPE)}</div>
                            </div>
                          </div>
                        </details>
                      ` : ""}
                    </div>
                  </details>
                `;
              })() : ""}
              
              ${adv.authorsNote ? (() => {
                const isFav = isAssetFavorited("an", `AN from ${adv.title || "Adventure"}`, adv.authorsNote);
                const starChar = isFav ? "★" : "☆";
                const starColor = isFav ? "var(--theme-text-color)" : "var(--text-secondary)";
                return `
                  <details class="group-header" data-open-id="cat-${adv.shortId}-an"${isOpen(`cat-${adv.shortId}-an`)}>
                    <summary><span>📝 Author's Note</span></summary>
                    <div style="padding:4px 8px 8px; display:flex; flex-direction:column; gap:6px;">
                      <div class="local-asset-row" style="background:rgba(0,0,0,0.15);padding:6px;border-radius:4px;cursor:default;">
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                          <span style="font-size:10px;color:var(--text-secondary);">Author's Note Content</span>
                          <button class="btn-favorite-local" data-type="an" data-title="AN from ${esc(adv.title || "Adventure")}" data-value="${esc(adv.authorsNote)}" style="background:none;border:none;color:${starColor};cursor:pointer;padding:2px;font-size:14px;" title="Toggle Favorite">${starChar}</button>
                        </div>
                        <div style="font-size:10.5px;color:var(--text-primary);font-family:SFMono-Regular,Consolas,monospace;white-space:pre-wrap;max-height:120px;overflow-y:auto;word-break:break-all;margin-top:2px;" class="selectable-text">${esc(adv.authorsNote)}</div>
                      </div>
                    </div>
                  </details>
                `;
              })() : ""}

              ${advCards.length > 0 ? (() => {
                // Group advCards by card type
                const scGroups: Record<string, CardRow[]> = {};
                for (const c of advCards) {
                  const lbl = getCardTypeLabel(c.type);
                  if (!scGroups[lbl]) scGroups[lbl] = [];
                  scGroups[lbl].push(c);
                }
                const rank = (l: string) => {
                  const idx = SC_LABEL_ORDER.indexOf(l);
                  return idx === -1 ? 1000 : idx;
                };
                const sortedLabels = Object.keys(scGroups).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));

                return `
                  <details class="group-header" data-open-id="cat-${adv.shortId}-sc"${isOpen(`cat-${adv.shortId}-sc`)}>
                    <summary><span>🗂️ Story Cards (${advCards.length})</span></summary>
                    <div style="padding:4px 8px 8px; display:flex; flex-direction:column; gap:6px;">
                      ${sortedLabels.map(lbl => {
                        const subCards = scGroups[lbl] || [];
                        const subKey = `sc-${lbl.toLowerCase().replace(/\s+/g, "-")}`;
                        return `
                          <details class="local-category-details" data-open-id="cat-${adv.shortId}-${subKey}"${isOpen(`cat-${adv.shortId}-${subKey}`)}>
                            <summary><span>${esc(lbl)} (${subCards.length})</span></summary>
                            <div style="padding:4px 8px 8px; display:flex; flex-direction:column; gap:6px;">
                              ${subCards.map(c => {
                                const isFav = isAssetFavorited("sc", c.title || "", c.value, c.keys);
                                const starChar = isFav ? "★" : "☆";
                                const starColor = isFav ? "var(--theme-text-color)" : "var(--text-secondary)";
                                return `
                                  <div class="local-asset-row" style="background:rgba(0,0,0,0.15);padding:6px;border-radius:4px;">
                                    <div style="display:flex;justify-content:space-between;align-items:center;">
                                      <span style="font-weight:600;font-size:11px;color:var(--text-primary);">${esc(c.title || c.keys || "Untitled")}</span>
                                      <button class="btn-favorite-local" data-type="sc" data-title="${esc(c.title || "")}" data-keys="${esc(c.keys || "")}" data-value="${esc(c.value)}" data-description="${esc(c.description || "")}" data-cardtype="${esc(c.type)}" style="background:none;border:none;color:${starColor};cursor:pointer;padding:2px;font-size:14px;" title="Toggle Favorite">${starChar}</button>
                                    </div>
                                    <div style="font-size:10px;color:var(--text-secondary);margin-top:2px;"><strong>Keys:</strong> ${esc(c.keys || "")}</div>
                                    <details style="cursor:pointer;margin-top:2px;" data-open-id="sc-${adv.shortId}-${c.id}"${isOpen(`sc-${adv.shortId}-${c.id}`)}>
                                      <summary style="font-size:10px;color:var(--text-secondary);list-style:none;outline:none;user-select:none;">Show entry...</summary>
                                      <div style="font-size:10.5px;color:var(--text-secondary);white-space:pre-wrap;margin-top:2px;cursor:text;" class="selectable-text">${esc(c.value)}</div>
                                      ${c.description ? `<div style="font-size:9.5px;color:var(--text-muted);border-top:1px solid rgba(255,255,255,0.05);margin-top:4px;padding-top:4px;cursor:text;" class="selectable-text">${esc(c.description)}</div>` : ""}
                                    </details>
                                  </div>
                                `;
                              }).join("")}
                            </div>
                          </details>
                        `;
                      }).join("")}
                    </div>
                  </details>
                `;
              })() : ""}
            </div>
          </details>
        `;
      }
      setSafeHTML(listExplorer, explorerHtml);

      // Bind favoriting star clicks
      listExplorer.querySelectorAll(".btn-favorite-local").forEach(el => {
        const btn = el as HTMLButtonElement;
        btn.addEventListener("click", async () => {
          const type = btn.getAttribute("data-type") || "";
          const title = btn.getAttribute("data-title") || "";
          const keys = btn.getAttribute("data-keys") || "";
          const value = btn.getAttribute("data-value") || "";
          const description = btn.getAttribute("data-description") || "";
          const cardType = btn.getAttribute("data-cardtype") || "";
          
          const existing = globalAssets.find(a => 
            a.type === type && 
            a.title === title && 
            a.value === value && 
            (a.keys || "") === (keys || "")
          );

          if (existing) {
            if (cbs.deleteGlobalAsset) {
              btn.textContent = "☆";
              btn.style.color = "var(--text-secondary)";
              const res = await cbs.deleteGlobalAsset(existing.id);
              if (res?.error) {
                showToast(`Failed to remove favorite: ${res.error}`, true);
                btn.textContent = "★";
                btn.style.color = "var(--theme-text-color)";
              } else {
                showToast(`Removed '${title}' from favorites.`);
                triggerRefresh();
              }
            }
          } else {
            if (cbs.saveGlobalAsset) {
              btn.textContent = "★";
              btn.style.color = "var(--theme-text-color)";
              const asset: GlobalAsset = {
                id: Math.floor(Math.random() * 1e9).toString() + "-" + Date.now(),
                type: type as GlobalAsset["type"],
                title,
                keys: keys || undefined,
                value,
                description: description || undefined,
                createdAt: new Date().toISOString(),
                cardType: cardType || undefined
              };
              const res = await cbs.saveGlobalAsset(asset);
              if (res?.error) {
                showToast(`Failed to favorite: ${res.error}`, true);
                btn.textContent = "☆";
                btn.style.color = "var(--text-secondary)";
              } else {
                showToast(`Added '${title}' to Favorites!`);
                triggerRefresh();
              }
            }
          }
        });
      });

      // Bind delete adventure buttons
      listExplorer.querySelectorAll(".btn-delete-adv").forEach(el => {
        const btn = el as HTMLButtonElement;
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const shortId = btn.getAttribute("data-shortid") || "";
          const advTitle = btn.getAttribute("data-title") || "Untitled Adventure";
          if (shortId) {
            showAdventureDeleteModal(shortId, advTitle);
          }
        });
      });
    }
  }

  function resetAddGlobalForm() {
    const title = root.getElementById("global-title") as HTMLInputElement | null;
    const val = root.getElementById("global-value") as HTMLTextAreaElement | null;
    const keys = root.getElementById("global-keys") as HTMLInputElement | null;
    const desc = root.getElementById("global-description") as HTMLTextAreaElement | null;
    const type = root.getElementById("global-type") as HTMLSelectElement | null;
    const scFields = root.getElementById("sc-fields") as HTMLElement | null;

    if (title) title.value = "";
    if (val) val.value = "";
    if (keys) keys.value = "";
    if (desc) desc.value = "";
    if (type) type.value = "ain";
    if (scFields) scFields.style.display = "none";
  }

  root.querySelectorAll(".offmeta-subtab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const subTabId = btn.getAttribute("data-subtab");
      if (subTabId) switchSubTab(subTabId);
    });
  });

  // Bind offmeta search input change
  root.getElementById("offmeta-search")?.addEventListener("input", () => {
    const statusEl = root.getElementById("offmeta-status");
    if (statusEl) statusEl.style.display = "none";
    renderOffMetaRepository();
  });

  $("open-settings").addEventListener("click", () => {
    (root.getElementById("prompt-s1") as HTMLTextAreaElement).value = lastState?.settings?.customPromptSection1 || DEFAULT_PROMPT_SECTION_1;
    (root.getElementById("prompt-s2") as HTMLTextAreaElement).value = lastState?.settings?.customPromptSection2 || DEFAULT_PROMPT_SECTION_2;
    (root.getElementById("prompt-s3") as HTMLTextAreaElement).value = lastState?.settings?.customPromptSection3 || DEFAULT_PROMPT_SECTION_3;
    (root.getElementById("prompt-s4") as HTMLTextAreaElement).value = lastState?.settings?.customPromptSection4 || DEFAULT_PROMPT_SECTION_4;
    for (const k of TYPE_KEYS) {
      const el = root.getElementById("cc-" + k) as HTMLTextAreaElement | null;
      if (el) el.value = lastState?.settings?.cardCommands?.[k] || DEFAULT_CARD_COMMANDS[k] || "";
    }
    const fmtEl = root.getElementById("fmt-mode") as HTMLSelectElement | null;
    if (fmtEl) fmtEl.value = lastState?.settings?.formattingMode || DEFAULT_FORMATTING_MODE;
    showSettingsView();
  });

  $("cancel-settings").addEventListener("click", showTrackerView);
  
  $("view-settings").addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const genQrBtn = target.closest("#gen-qr-btn");
    if (genQrBtn && lastState?.settings) {
      (genQrBtn as HTMLButtonElement).disabled = true;
      const originalText = genQrBtn.textContent;
      genQrBtn.textContent = "⏳ Generating...";
      compressSettings(lastState.settings).then((payload) => {
        showQrModal(payload);
      }).catch((err) => {
        console.error("[AID panel] QR generation failed:", err);
      }).finally(() => {
        (genQrBtn as HTMLButtonElement).disabled = false;
        genQrBtn.textContent = originalText;
      });
    }
  });

  $("info-action-lookback").addEventListener("click", (e) => {
    e.stopPropagation();
    $("overlay-action-lookback").style.display = "flex";
  });

  $("info-memoraid-lookback").addEventListener("click", (e) => {
    e.stopPropagation();
    $("overlay-memoraid-lookback").style.display = "flex";
  });
  
  $("info-memories").addEventListener("click", (e) => {
    e.stopPropagation();
    $("overlay-memories").style.display = "flex";
  });
  $("info-memoraid-thought").addEventListener("click", (e) => {
    e.stopPropagation();
    $("overlay-memoraid-thought").style.display = "flex";
  });
  $("info-memoraid-presence").addEventListener("click", (e) => {
    e.stopPropagation();
    $("overlay-memoraid-presence").style.display = "flex";
  });
  $("info-intercept-timeout").addEventListener("click", (e) => {
    e.stopPropagation();
    $("overlay-intercept-timeout").style.display = "flex";
  });
  $("info-help").addEventListener("click", (e) => {
    e.stopPropagation();
    $("overlay-help").style.display = "flex";
  });
  let syncKeys = true;
  const acTitleInput = root.getElementById("ac-title") as HTMLInputElement;
  const acKeysInput = root.getElementById("ac-keys") as HTMLInputElement;
  acTitleInput.addEventListener("input", () => {
    if (syncKeys) {
      acKeysInput.value = acTitleInput.value.trim().toLowerCase();
    }
  });
  acKeysInput.addEventListener("input", () => {
    syncKeys = false;
  });

  {
    // Reveal the custom-type textbox when "Custom" is picked (mirrors the NLP suggestion picker).
    const acTypeSel = root.getElementById("ac-type") as HTMLSelectElement;
    const acCustom = root.getElementById("ac-custom-type") as HTMLInputElement;
    acTypeSel?.addEventListener("change", () => {
      acCustom.style.display = acTypeSel.value === "custom" ? "block" : "none";
      if (acTypeSel.value === "custom") acCustom.focus();
    });
  }
  $("create-card-trigger").addEventListener("click", (e) => {
    e.stopPropagation();
    syncKeys = true;
    acTitleInput.value = "";
    acKeysInput.value = "";
    (root.getElementById("ac-desc") as HTMLInputElement).value = "";
    (root.getElementById("ac-value") as HTMLTextAreaElement).value = "";
    // Populate the type dropdown with base types + this adventure's detected custom types (same
    // source as the NLP picker), defaulting to Character.
    const acTypeSel = root.getElementById("ac-type") as HTMLSelectElement;
    setSafeHTML(acTypeSel, buildTypePickerOptions(lastState?.cards ?? [], "character").replace(/<option value="">None<\/option>/, "") + `<option value="memory">Memory</option>`);
    acTypeSel.value = "character";
    const acCustom = root.getElementById("ac-custom-type") as HTMLInputElement;
    acCustom.value = "";
    acCustom.style.display = "none";
    $("overlay-add-card").style.display = "flex";
  });
  $("ac-submit").addEventListener("click", async () => {
    if (!cbs.createStoryCard) return;
    let type = (root.getElementById("ac-type") as HTMLSelectElement).value;
    if (type === "custom") {
      const ct = (root.getElementById("ac-custom-type") as HTMLInputElement).value.trim();
      if (ct) type = ct;
    }
    const title = acTitleInput.value.trim();
    const keys = acKeysInput.value.trim();
    const description = (root.getElementById("ac-desc") as HTMLInputElement).value.trim();
    const value = (root.getElementById("ac-value") as HTMLTextAreaElement).value.trim();

    if (!title) {
      showToast("Title / Name is required!", true);
      return;
    }

    const btnSubmit = root.getElementById("ac-submit") as HTMLButtonElement;
    btnSubmit.disabled = true;
    btnSubmit.textContent = "⏳ Creating card on AID...";

    try {
      const res = await cbs.createStoryCard({ type, title, keys, value, description });
      if (res.error) {
        showToast(res.error, true);
      } else {
        showToast("Story card created successfully!");
        $("overlay-add-card").style.display = "none";
      }
    } catch (err: any) {
      showToast(err?.message || String(err), true);
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.textContent = "Create & Push to AID";
    }
  });
  root.querySelectorAll(".overlay-close").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-close");
      if (id) $(id).style.display = "none";
    });
  });

  // Main panel Tab Switch handlers
  let activeTabId = "main-tab-home";
  let lastViewedMemoriesCount = -1;
  const knownMemories = new Set<string>();

  function switchMainTab(tabId: string) {
    activeTabId = tabId;
    const panes = root.querySelectorAll(".main-tab-pane");
    const btns = root.querySelectorAll(".main-tab-btn");
    panes.forEach((p) => {
      (p as HTMLElement).style.display = p.id === tabId ? "flex" : "none";
    });
    btns.forEach((b) => {
      if (b.getAttribute("data-tab") === tabId) {
        b.classList.add("active");
      } else {
        b.classList.remove("active");
      }
    });
    if (tabId === "main-tab-memories") {
      // Clear badge
      const badge = root.getElementById("unread-memories-badge");
      if (badge) {
        badge.style.display = "none";
        badge.className = "";
      }
      if (lastState?.aidMemories) {
        lastViewedMemoriesCount = lastState.aidMemories.length;
      }
    } else if (tabId === "main-tab-home") {
      // Clear badge — the pending queue is now in front of the user.
      const pendingBadge = root.getElementById("home-pending-badge");
      if (pendingBadge) {
        pendingBadge.style.display = "none";
        pendingBadge.className = "";
      }
    }
  }

  root.querySelectorAll(".main-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tabId = btn.getAttribute("data-tab");
      if (tabId) switchMainTab(tabId);
    });
  });

  // Global search (Home): local + instant over panel state (Mobile Rethink Phase A §3). A result
  // jumps to the item: story card → Cards tab + open its drawer (data-card-title hook); NPC →
  // Memory tab → NPC sub-tab + open the mbnpc drawer. Drawers re-render on state, so the jump
  // waits a tick for the tab switch to paint.
  function navigateToSearchResult(it: PanelSearchItem): void {
    if (it.kind === "npc") {
      switchMainTab("main-tab-memories");
      (root.querySelector('[data-mbtab="mb-npc"]') as HTMLElement | null)?.click();
      setTimeout(() => {
        const drawer = root.querySelector(`#mb-npc details[data-key="mbnpc:${CSS.escape(it.title)}"]`) as HTMLDetailsElement | null;
        if (drawer) { drawer.open = true; drawer.scrollIntoView({ block: "start", behavior: "smooth" }); }
      }, 50);
      return;
    }
    switchMainTab("main-tab-tracker");
    setTimeout(() => {
      const drawer = root.querySelector(`#results details.char-card[data-card-title="${CSS.escape(it.title)}"]`) as HTMLDetailsElement | null;
      if (drawer) { drawer.open = true; drawer.scrollIntoView({ block: "start", behavior: "smooth" }); }
    }, 50);
  }
  {
    const searchInput = root.getElementById("home-search") as HTMLInputElement | null;
    const resultsEl = root.getElementById("home-search-results") as HTMLElement | null;
    const renderResults = () => {
      if (!searchInput || !resultsEl) return;
      const items = searchPanelItems(searchInput.value, lastState?.cards);
      if (!items.length) { resultsEl.style.display = "none"; resultsEl.textContent = ""; return; }
      setSafeHTML(resultsEl, items.map((it, i) =>
        `<div class="home-result-row" data-res-idx="${i}">
           <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(it.title)}</span>
           <span class="home-result-sub">${esc(it.sub)}</span>
         </div>`).join(""));
      resultsEl.style.display = "flex";
      resultsEl.querySelectorAll("[data-res-idx]").forEach((row) => {
        row.addEventListener("click", () => {
          const it = items[Number(row.getAttribute("data-res-idx"))];
          if (!it) return;
          resultsEl.style.display = "none";
          searchInput.value = "";
          navigateToSearchResult(it);
        });
      });
    };
    let searchTimer: ReturnType<typeof setTimeout> | undefined;
    searchInput?.addEventListener("input", () => {
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(renderResults, 120);
    });
  }

  // Seeding form toggle
  const lcBtnAddCard = root.getElementById("lc-btn-add-card");
  const lcAddCardForm = root.getElementById("lc-add-card-form");
  const lcAddCancelBtn = root.getElementById("lc-add-cancel-btn");
  const lcAddSubmitBtn = root.getElementById("lc-add-submit-btn") as HTMLButtonElement | null;

  if (lcBtnAddCard && lcAddCardForm) {
    lcBtnAddCard.addEventListener("click", () => {
      if (lcAddCardForm.style.display === "none") {
        lcAddCardForm.style.display = "flex";
        
        // Populate owner dropdown
        const ownerSelect = root.getElementById("lc-add-owner") as HTMLSelectElement | null;
        if (ownerSelect) {
          const rosterText = lastState?.settings?.livingCharactersRoster || "";
          let roster = rosterText.split("\n").map((n: string) => n.trim()).filter(Boolean);
          if (roster.length === 0 && lastState?.cards) {
            roster = lastState.cards
              .filter(c => !c.deletedAt && normalizeType(c.type) === "character" && !(c.title || "").toLowerCase().endsWith(" (memory)"))
              .map(c => c.title || "")
              .filter(Boolean);
          }
          
          setSafeHTML(ownerSelect, roster.map((name: string) => `<option value="${esc(name)}">${esc(name)}</option>`).join(""));
        }
      } else {
        lcAddCardForm.style.display = "none";
      }
    });
  }

  if (lcAddCancelBtn && lcAddCardForm) {
    lcAddCancelBtn.addEventListener("click", () => {
      lcAddCardForm.style.display = "none";
    });
  }

  if (lcAddSubmitBtn && lcAddCardForm) {
    lcAddSubmitBtn.addEventListener("click", async () => {
      const ownerSelect = root.getElementById("lc-add-owner") as HTMLSelectElement | null;
      const targetInput = root.getElementById("lc-add-target") as HTMLInputElement | null;
      const pressureInput = root.getElementById("lc-add-pressure") as HTMLInputElement | null;

      const owner = ownerSelect?.value.trim();
      const target = targetInput?.value.trim();
      const pressure = pressureInput?.value.trim() || "friendship";

      if (!owner || !target) {
        showToast("Owner and Target are required!", true);
        return;
      }

      lcAddSubmitBtn.disabled = true;
      lcAddSubmitBtn.textContent = "⏳ Creating...";

      try {
        const titlePrefix = lastState?.settings?.livingCharactersTitlePrefix || "Life - ";
        const keyPrefix = lastState?.settings?.livingCharactersKeyPrefix || "chaos-v2:";
        const initialValue = buildLifeCardValue({ owner, target, pressure, occurrence: "none", momentum: "low", status: "seedling" });
        const initialDesc = `Social Relationship History:\n- Seeded as seedling ${pressure} toward ${target}`;

        if (cbs.createStoryCard) {
          const res = await cbs.createStoryCard({
            type: "Life",
            title: `${titlePrefix}${owner}`,
            keys: `${keyPrefix}${keyName(owner)},${owner},${target}`,
            value: initialValue,
            description: initialDesc
          });

          if (res.error) {
            showToast(res.error, true);
          } else {
            // Enqueue the one-shot prompt-injection directive so the seeded pressure actually surfaces
            // (the create path alone never injects — that was the "custom cards don't inject" gap).
            if (cbs.enqueueLifeInjection) {
              cbs.enqueueLifeInjection(owner, target, pressure, "low").catch(() => {});
            }
            showToast(`Seeded Life Card for ${owner}!`);
            lcAddCardForm.style.display = "none";
            if (targetInput) targetInput.value = "";
            if (pressureInput) pressureInput.value = "";
          }
        }
      } catch (err: any) {
        showToast(err?.message || String(err), true);
      } finally {
        lcAddSubmitBtn.disabled = false;
        lcAddSubmitBtn.textContent = "Create Life Card";
      }
    });
  }

  const memListEl = root.getElementById("aid-memories-list");
  if (memListEl) {
    memListEl.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      
      // Player memory block editing (Phase B): opens the full-panel editor view instead of the old
      // inline swap-in textarea. Save reuses the updateAidMemories full-list update keyed by idx.
      const editBtn = target.closest(".mem-edit-btn");
      if (editBtn) {
        const card = editBtn.closest(".memory-card") as HTMLElement;
        const idx = parseInt(card.getAttribute("data-idx")!, 10);
        const textEl = card.querySelector(".memory-card-text") as HTMLElement | null;
        const currentText = textEl?.textContent || "";
        openEditorView(`Memory Block #${idx + 1}`, `
          <textarea class="editor-mem-text input-dark" rows="10" style="width:100%;box-sizing:border-box;background:rgba(0,0,0,0.3);border:1px solid var(--border-color);color:var(--text-primary);border-radius:6px;padding:6px;font-size:11.5px;line-height:1.4;resize:vertical;font-family:inherit;"></textarea>
          <div style="display:flex;justify-content:flex-end;margin-top:8px;">
            <button class="editor-save-aid-mem action-btn" style="background:rgba(16,185,129,0.15);color:#10b981;border-color:rgba(16,185,129,0.3);">Save</button>
          </div>
        `, (body) => {
          const ta = body.querySelector(".editor-mem-text") as HTMLTextAreaElement | null;
          if (ta) { ta.value = currentText; ta.focus(); }
          body.querySelector(".editor-save-aid-mem")?.addEventListener("click", () => {
            const newText = (ta?.value || "").trim();
            if (newText && lastState?.aidMemories) {
              const updatedMemories = [...lastState.aidMemories];
              const item = updatedMemories[idx];
              if (item) {
                updatedMemories[idx] = {
                  actionIds: item.actionIds || [],
                  text: newText,
                  lastRelevantActionId: item.lastRelevantActionId
                };
                cbs.updateAidMemories?.(updatedMemories);
              }
            }
            closeEditorView();
          });
        });
        return;
      }

      // Handle Delete button click
      const deleteBtn = target.closest(".mem-delete-btn");
      if (deleteBtn) {
        const card = deleteBtn.closest(".memory-card") as HTMLElement;
        const idx = parseInt(card.getAttribute("data-idx")!, 10);
        
        if (lastState?.aidMemories) {
          const updatedMemories = [...lastState.aidMemories];
          updatedMemories.splice(idx, 1);
          cbs.updateAidMemories?.(updatedMemories);
        }
        return;
      }

      // Handle Refine button click
      const refineBtn = target.closest(".mem-refine-btn");
      if (refineBtn) {
        const card = refineBtn.closest(".memory-card") as HTMLElement;
        const idx = parseInt(card.getAttribute("data-idx")!, 10);
        
        const btn = refineBtn as HTMLButtonElement;
        btn.disabled = true;
        btn.style.opacity = "0.5";
        btn.title = "Regenerating...";
        
        refineMemoryBlockCb?.(idx);
        return;
      }

    });
  }

  $("revert-prompt").addEventListener("click", () => {
    (root.getElementById("prompt-s1") as HTMLTextAreaElement).value = DEFAULT_PROMPT_SECTION_1;
    (root.getElementById("prompt-s2") as HTMLTextAreaElement).value = DEFAULT_PROMPT_SECTION_2;
    (root.getElementById("prompt-s3") as HTMLTextAreaElement).value = DEFAULT_PROMPT_SECTION_3;
    (root.getElementById("prompt-s4") as HTMLTextAreaElement).value = DEFAULT_PROMPT_SECTION_4;
    for (const k of TYPE_KEYS) {
      const el = root.getElementById("cc-" + k) as HTMLTextAreaElement | null;
      if (el) el.value = DEFAULT_CARD_COMMANDS[k] ?? "";
    }
    const fmtEl = root.getElementById("fmt-mode") as HTMLSelectElement | null;
    if (fmtEl) fmtEl.value = DEFAULT_FORMATTING_MODE;
  });

  let refineMemoryBlockCb: ((index: number) => void) | null = null;
  let lastDebug: any = null;
  const onResultsClick = (e: Event) => {
    const target = e.target as HTMLElement;
    const an = target.closest("#an");
    if (an && cbs.analyze) {
      showAnalyzeView();
      setAnalyzeLoading();
      cbs.analyze();
      return;
    }
    const gen = target.closest("[data-gen-card]");
    if (gen && cbs.generateCard) {
      const cardId = gen.getAttribute("data-gen-card");
      if (cardId) {
        (gen as HTMLButtonElement).disabled = true;
        gen.textContent = "⏳ Generating via AID…";
        cbs.generateCard(cardId);
      }
      return;
    }
    const genc = target.closest("[data-gen-compact]");
    if (genc && cbs.generateCompactCard) {
      const cardId = genc.getAttribute("data-gen-compact");
      if (cardId) {
        (genc as HTMLButtonElement).disabled = true;
        genc.textContent = "⏳ Compacting…";
        cbs.generateCompactCard(cardId);
      }
      return;
    }
    const reroll = target.closest("[data-reroll-card]");
    if (reroll && cbs.rerollAppearance) {
      const cardId = reroll.getAttribute("data-reroll-card");
      if (cardId) {
        (reroll as HTMLButtonElement).disabled = true;
        reroll.textContent = "⏳ Re-rolling…";
        cbs.rerollAppearance(cardId);
      }
      return;
    }
    const distill = target.closest(".distill-now-btn");
    if (distill && cbs.distillCrystallized) {
      const cardId = distill.getAttribute("data-card-id");
      const charName = distill.getAttribute("data-char-name");
      if (cardId && charName) {
        (distill as HTMLButtonElement).disabled = true;
        distill.textContent = "⏳ Distilling...";
        cbs.distillCrystallized(cardId, charName);
      }
      return;
    }
    const backfillNpc = target.closest(".backfill-npc-memories-btn");
    if (backfillNpc && cbs.backfillNpcMemories) {
      const charName = backfillNpc.getAttribute("data-char-name");
      if (charName) {
        (backfillNpc as HTMLButtonElement).disabled = true;
        backfillNpc.textContent = "⏳ Backfilling...";
        cbs.backfillNpcMemories(charName);
        // Arm a watchdog in case the worker dies before any progress broadcast arrives (re-armed on
        // each npcMemoryProgress via refreshNpcMemory; cleared on the final `done`).
        if (npcBackfillWatchdog) clearTimeout(npcBackfillWatchdog);
        npcBackfillWatchdog = setTimeout(() => {
          npcBackfillWatchdog = null;
          refreshOpenNpcBankList(charName);
          panelHandle.showToast(`Backfill for ${charName} stopped responding — refresh to see what landed.`, true);
        }, 60000);
      }
      return;
    }
    const npcMemRegen = target.closest(".npc-mem-regen-btn");
    if (npcMemRegen && cbs.regenerateNpcMemoryBlock) {
      const charName = npcMemRegen.getAttribute("data-char"); const blockId = npcMemRegen.getAttribute("data-block-id");
      if (charName && blockId) {
        const btn = npcMemRegen as HTMLButtonElement; btn.disabled = true; btn.style.opacity = "0.5"; btn.title = "Regenerating…";
        cbs.regenerateNpcMemoryBlock(charName, blockId).then((res) => {
          const b = (res as any)?.block as NpcMemBlock | undefined;
          const cardEl = npcMemRegen.closest(".npc-mem-block") as HTMLElement | null;
          if (b && cardEl) {
            const textEl = cardEl.querySelector(".memory-card-text") as HTMLElement | null;
            if (textEl) textEl.textContent = b.povText;
            const key = charName.toLowerCase(); const cached = npcMemoryCache.get(key);
            if (cached) { const i = cached.findIndex(x => x.blockId === blockId); if (i >= 0) cached[i] = b; }
          }
          btn.disabled = false; btn.style.opacity = ""; btn.title = "Regenerate this memory";
        }).catch(() => { btn.disabled = false; btn.style.opacity = ""; });
      }
      return;
    }
    // NPC memory block editing (Phase B): opens the full-panel editor view instead of the old
    // inline swap-in textarea. Save reuses saveNpcMemoryBlock and patches the cache + list text.
    const npcMemEdit = target.closest(".npc-mem-edit-btn");
    if (npcMemEdit) {
      const cardEl = npcMemEdit.closest(".npc-mem-block") as HTMLElement | null;
      const textEl = cardEl?.querySelector(".memory-card-text") as HTMLElement | null;
      const charName = cardEl?.getAttribute("data-char"); const blockId = cardEl?.getAttribute("data-block-id");
      if (cardEl && textEl && charName && blockId) {
        const cur = textEl.textContent || "";
        openEditorView(`${charName} — Memory`, `
          <textarea class="editor-mem-text input-dark" rows="10" style="width:100%;box-sizing:border-box;background:rgba(0,0,0,0.3);border:1px solid var(--border-color);color:var(--text-primary);border-radius:6px;padding:6px;font-size:11.5px;line-height:1.4;resize:vertical;font-family:inherit;"></textarea>
          <div style="display:flex;justify-content:flex-end;margin-top:8px;">
            <button class="editor-save-npc-mem action-btn" style="background:rgba(16,185,129,0.15);color:#10b981;border-color:rgba(16,185,129,0.3);">Save</button>
          </div>
        `, (body) => {
          const ta = body.querySelector(".editor-mem-text") as HTMLTextAreaElement | null;
          if (ta) { ta.value = cur; ta.focus(); }
          body.querySelector(".editor-save-npc-mem")?.addEventListener("click", async (ev) => {
            const btn = ev.currentTarget as HTMLButtonElement;
            const newText = (ta?.value || "").trim();
            if (!newText || !cbs.saveNpcMemoryBlock) return;
            btn.disabled = true; btn.textContent = "⏳ Saving...";
            try {
              const r = await cbs.saveNpcMemoryBlock(charName, blockId, newText);
              if (r?.error) throw new Error(r.error);
              const key = charName.toLowerCase(); const cached = npcMemoryCache.get(key);
              if (cached) { const i = cached.findIndex(x => x.blockId === blockId); if (i >= 0) cached[i] = { ...cached[i]!, povText: newText }; }
              showToast("Memory updated.");
              goEditorBack(); // returns to the Memory Bank view (this editor was opened from it)
            } catch (err: any) {
              showToast(err?.message || String(err), true);
              btn.disabled = false; btn.textContent = "Save";
            }
          });
        }, () => openNpcBankView(charName)); // Back returns to the bank view, not the tab
      }
      return;
    }
    const npcMemDel = target.closest(".npc-mem-delete-btn");
    if (npcMemDel && cbs.deleteNpcMemoryBlock) {
      const charName = npcMemDel.getAttribute("data-char"); const blockId = npcMemDel.getAttribute("data-block-id");
      if (charName && blockId) {
        cbs.deleteNpcMemoryBlock(charName, blockId).then(() => {
          npcMemDel.closest(".npc-mem-block")?.remove(); // surgical removal, no full re-render
          const key = charName.toLowerCase(); const cached = npcMemoryCache.get(key);
          if (cached) npcMemoryCache.set(key, cached.filter(x => x.blockId !== blockId));
        });
      }
      return;
    }
    const mbSubtab = target.closest(".subtab-btn[data-mbtab]") as HTMLElement | null;
    if (mbSubtab) {
      const which = mbSubtab.getAttribute("data-mbtab");
      root.querySelectorAll(".subtab-btn[data-mbtab]").forEach((b) => b.classList.toggle("active", b === mbSubtab));
      root.querySelectorAll(".mb-pane").forEach((p) => { (p as HTMLElement).style.display = p.id === which ? "flex" : "none"; });
      return;
    }
    const consolidateOutlook = target.closest(".consolidate-outlook-btn");
    if (consolidateOutlook && cbs.consolidateOutlook) {
      const charName = consolidateOutlook.getAttribute("data-char-name");
      if (charName) {
        (consolidateOutlook as HTMLButtonElement).disabled = true;
        consolidateOutlook.textContent = "⏳ Consolidating...";
        cbs.consolidateOutlook(charName);
      }
      return;
    }
    const del = target.closest(".card-delete-btn") as HTMLButtonElement | null;
    if (del && cbs.deleteStoryCard) {
      const cardId = del.getAttribute("data-card-id");
      if (!cardId) return;
      if (del.classList.contains("armed")) {
        del.classList.remove("armed");
        del.disabled = true;
        del.textContent = "⏳ Deleting…";
        cbs.deleteStoryCard(cardId).then((res) => {
          if (res?.error) { showToast(res.error, true); del.disabled = false; del.textContent = "Delete"; }
          else { showToast("Card deleted."); }
        }).catch((err) => { showToast(err?.message || String(err), true); del.disabled = false; del.textContent = "Delete"; });
      } else {
        del.classList.add("armed");
        del.textContent = "Confirm delete?";
        setTimeout(() => { if (del.classList.contains("armed")) { del.classList.remove("armed"); del.textContent = "Delete"; } }, 3000);
      }
      return;
    }
    // Card entry + triggers editing (Phase B): one button opens the full-panel editor view instead
    // of the old inline triggers-input/entry-textarea widgets. Save pushes only the changed fields
    // via the same saveCardKeys/saveCardValue paths the inline editors used.
    const openCardEditor = target.closest(".open-card-editor");
    if (openCardEditor) {
      const cardId = openCardEditor.getAttribute("data-card-id");
      const card = cardId ? lastState?.cards?.find((c) => c.id === cardId) : undefined;
      if (cardId && card) {
        const origKeys = card.keys || "";
        const origValue = card.value || "";
        openEditorView(card.title || "Card", `
          <label style="font-weight:700;color:var(--text-secondary);font-size:10px;text-transform:uppercase;">Triggers</label>
          <input class="editor-keys input-dark" type="text" value="${esc(origKeys)}" style="width:100%;box-sizing:border-box;background:rgba(255,255,255,0.03);color:var(--text-primary);border:1px solid rgba(255,255,255,0.08);padding:6px 8px;border-radius:6px;font-size:11.5px;" />
          <label style="font-weight:700;color:var(--text-secondary);font-size:10px;text-transform:uppercase;margin-top:6px;">Entry</label>
          <textarea class="editor-entry input-dark" rows="14" style="width:100%;box-sizing:border-box;background:rgba(255,255,255,0.03);color:var(--text-primary);border:1px solid rgba(255,255,255,0.08);padding:6px 8px;border-radius:6px;font-size:11.5px;font-family:SFMono-Regular,Consolas,monospace;resize:vertical;">${esc(origValue)}</textarea>
          <div style="display:flex;justify-content:flex-end;margin-top:8px;">
            <button class="editor-save-card action-btn" style="background:rgba(16,185,129,0.15);color:#10b981;border-color:rgba(16,185,129,0.3);">Save</button>
          </div>
        `, (body) => {
          body.querySelector(".editor-save-card")?.addEventListener("click", async (ev) => {
            const btn = ev.currentTarget as HTMLButtonElement;
            const newKeys = (body.querySelector(".editor-keys") as HTMLInputElement | null)?.value.trim() ?? origKeys;
            const newValue = (body.querySelector(".editor-entry") as HTMLTextAreaElement | null)?.value.trim() ?? origValue;
            btn.disabled = true; btn.textContent = "⏳ Saving...";
            try {
              if (newKeys !== origKeys && cbs.saveCardKeys) {
                const r = await cbs.saveCardKeys(cardId, newKeys);
                if (r?.error) throw new Error(r.error);
              }
              if (newValue !== origValue && cbs.saveCardValue) {
                const r = await cbs.saveCardValue(cardId, newValue);
                if (r?.error) throw new Error(r.error);
              }
              showToast("Card updated.");
              closeEditorView();
            } catch (err: any) {
              showToast(err?.message || String(err), true);
              btn.disabled = false; btn.textContent = "Save";
            }
          });
        });
      }
      return;
    }
    const consolidate = target.closest(".consolidate-crystallized-btn");
    if (consolidate && cbs.consolidateCrystallized) {
      const cardId = consolidate.getAttribute("data-card-id");
      if (cardId) {
        const btn = consolidate as HTMLButtonElement;
        btn.disabled = true;
        btn.textContent = "⏳ Consolidating...";
        cbs.consolidateCrystallized(cardId).then((res) => {
          // Consolidate rewrites Knows in IndexedDB out from under the editor — drop the cached
          // schema so the next render refetches instead of showing the pre-consolidate snapshot (Finding 3).
          if (!res?.error) crystallizedSchemaCache.delete(cardId);
        }).catch((err: any) => {
          showToast(err?.message || String(err), true);
        }).finally(() => {
          btn.disabled = false;
          btn.textContent = "Consolidate";
        });
      }
      return;
    }
    // Knows/Preferences editors open in the full-panel editor view (Phase B). The builders' output
    // is driven by the SAME delegated handlers (bound to #editor-body too), so add/delete/save work
    // unchanged. Schema/prefs come from the caches the NPC drawer render lazily primes.
    const openKnows = target.closest(".open-knows-editor");
    if (openKnows) {
      const cardId = openKnows.getAttribute("data-card-id");
      const charName = openKnows.getAttribute("data-char") || "NPC";
      if (cardId) {
        const card = lastState?.cards?.find((c) => c.id === cardId);
        const schemaItems = crystallizedSchemaCache.get(cardId) || parseCrystallized(card?.description).schema;
        openEditorView(`${charName} — Knows`, buildKnowsEditorHtml(cardId, schemaItems));
      }
      return;
    }
    const openPrefs = target.closest(".open-prefs-editor");
    if (openPrefs) {
      const cardId = openPrefs.getAttribute("data-card-id");
      const charName = openPrefs.getAttribute("data-char") || "NPC";
      if (cardId) {
        const prefTexts = crystallizedPreferencesCache.get(cardId) || [];
        openEditorView(`${charName} — Preferences`, buildPreferencesEditorHtml(cardId, prefTexts));
      }
      return;
    }
    const openBank = target.closest(".open-npc-bank");
    if (openBank) {
      const charName = openBank.getAttribute("data-char");
      if (charName) openNpcBankView(charName);
      return;
    }
    const knowsAdd = target.closest(".knows-add");
    if (knowsAdd) {
      const cardId = knowsAdd.getAttribute("data-card-id");
      if (cardId) {
        const editor = knowsAdd.closest(".knows-editor");
        const container = editor?.querySelector(".knows-rows-container");
        if (container) {
          const idx = container.querySelectorAll(".knows-row").length;
          const div = document.createElement("div");
          div.className = "knows-row";
          div.setAttribute("data-idx", String(idx));
          div.style.cssText = "display:flex;flex-direction:column;gap:4px;margin-bottom:8px;padding:6px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.04);border-radius:6px;";
          setSafeHTML(div as any, `
            <div style="display:flex;gap:6px;align-items:center;">
              <input class="knows-canon input-compact input-dark" value="" placeholder="Subject" style="flex:1;background:rgba(255,255,255,0.03);color:var(--text-primary);border:1px solid rgba(255,255,255,0.08);padding:4px 6px;border-radius:4px;font-size:11px;" />
              <input class="knows-aliases input-compact input-dark" value="" placeholder="aka (comma-separated)" style="flex:1;background:rgba(255,255,255,0.03);color:var(--text-secondary);border:1px solid rgba(255,255,255,0.08);padding:4px 6px;border-radius:4px;font-size:11px;" />
              <button class="knows-del" data-idx="${idx}" style="background:rgba(239, 68, 68, 0.15);color:#f87171;border:1px solid rgba(239, 68, 68, 0.3);border-radius:4px;cursor:pointer;padding:2px 6px;font-size:11px;">✕</button>
            </div>
            <textarea class="knows-text input-dark" rows="2" style="background:rgba(255,255,255,0.03);color:var(--text-primary);border:1px solid rgba(255,255,255,0.08);padding:4px 6px;border-radius:4px;font-size:11px;font-family:inherit;resize:vertical;"></textarea>
          `);
          container.appendChild(div);
        }
      }
      return;
    }
    const knowsDel = target.closest(".knows-del");
    if (knowsDel) {
      const row = knowsDel.closest(".knows-row");
      row?.remove();
      return;
    }
    const knowsSave = target.closest(".knows-save");
    if (knowsSave && cbs.saveCrystallizedSchema) {
      const cardId = knowsSave.getAttribute("data-card-id");
      if (cardId) {
        const editor = knowsSave.closest(".knows-editor");
        if (editor) {
          const rows = Array.from(editor.querySelectorAll(".knows-row"));
          const schema = rows.map((r) => ({
            subject: (r.querySelector(".knows-canon") as HTMLInputElement)?.value.trim() || "",
            aliases: (r.querySelector(".knows-aliases") as HTMLInputElement)?.value.split(",").map((s) => s.trim()).filter(Boolean) || [],
            text: (r.querySelector(".knows-text") as HTMLTextAreaElement)?.value.trim() || "",
          })).filter((s) => s.subject && s.text);
          const btn = knowsSave as HTMLButtonElement;
          btn.disabled = true;
          btn.textContent = "⏳ Saving...";
          cbs.saveCrystallizedSchema(cardId, schema).then((res) => {
            if (res?.error) {
              showToast(res.error, true);
            } else {
              // Keep the cache in sync with what was just saved — otherwise the editor can keep
              // showing the first-fetch snapshot forever while distillation rewrites Knows underneath,
              // and the NEXT manual save would silently clobber that newer state (Finding 3).
              crystallizedSchemaCache.set(cardId, schema);
            }
          }).catch((err: any) => {
            showToast(err?.message || String(err), true);
          }).finally(() => {
            btn.disabled = false;
            btn.textContent = "Save Knows";
          });
        }
      }
      return;
    }
    const prefsAdd = target.closest(".prefs-add");
    if (prefsAdd) {
      const cardId = prefsAdd.getAttribute("data-card-id");
      if (cardId) {
        const editor = prefsAdd.closest(".prefs-editor");
        const container = editor?.querySelector(".prefs-rows-container");
        if (container) {
          const div = document.createElement("div");
          setSafeHTML(div as any, prefRowHtml(""));
          const row = div.firstElementChild;
          if (row) { container.appendChild(row); (row.querySelector(".pref-text") as HTMLTextAreaElement | null)?.focus(); }
        }
      }
      return;
    }
    const prefsDel = target.closest(".pref-del");
    if (prefsDel) {
      prefsDel.closest(".pref-row")?.remove();
      return;
    }
    const prefsSave = target.closest(".prefs-save");
    if (prefsSave && cbs.savePreferences) {
      const cardId = prefsSave.getAttribute("data-card-id");
      if (cardId) {
        const editor = prefsSave.closest(".prefs-editor");
        if (editor) {
          const prefs = Array.from(editor.querySelectorAll(".pref-text"))
            .map((t) => (t as HTMLTextAreaElement).value.trim())
            .filter(Boolean);
          const btn = prefsSave as HTMLButtonElement;
          btn.disabled = true;
          btn.textContent = "⏳ Saving...";
          cbs.savePreferences(cardId, prefs).then((res) => {
            if (res?.error) {
              showToast(res.error, true);
            } else {
              // Keep the editor cache in sync with what was just saved (same rationale as Knows —
              // avoids showing the stale first-fetch snapshot or clobbering a newer save).
              crystallizedPreferencesCache.set(cardId, prefs);
            }
          }).catch((err: any) => {
            showToast(err?.message || String(err), true);
          }).finally(() => {
            btn.disabled = false;
            btn.textContent = "Save Preferences";
          });
        }
      }
      return;
    }
    const memoraidSave = target.closest(".memoraid-save-btn");
    if (memoraidSave && cbs.setMemoraidCharacters) {
      const inputEl = results.querySelector(".memoraid-chars-input") as HTMLTextAreaElement | null;
      const names = (inputEl?.value || "").split(/[\r\n,]+/).map(s => s.trim()).filter(Boolean);
      const btn = memoraidSave as HTMLButtonElement;
      const orig = btn.textContent;
      btn.disabled = true; btn.textContent = "⏳ Saving...";
      cbs.setMemoraidCharacters(names).then((res) => {
        if (res?.error) showToast(res.error, true); else showToast("MemorAID characters saved!");
      }).catch((err: any) => {
        showToast(err?.message || String(err), true);
      }).finally(() => {
        btn.disabled = false; btn.textContent = orig || "💾 Save Characters";
      });
      return;
    }
    const t = target.closest("[data-act]");
    if (!t) return;
    const vid = t.getAttribute("data-vid"); const act = t.getAttribute("data-act");
    console.log("[AID panel] Click detected. act:", act, "vid:", vid);
    if (vid && (act === "applied" || act === "rejected") && cbs.proposalDecision) {
      console.log("[AID panel] Triggering cbs.proposalDecision for vid:", vid, "act:", act);
      cbs.proposalDecision(vid, act);
    }
    if (vid && act === "push" && cbs.pushVersion) {
      console.log("[AID panel] Triggering cbs.pushVersion (onPushVersion) for vid:", vid);
      cbs.pushVersion(vid);
    }
  };
  results.addEventListener("click", onResultsClick);
  // The Memory Bank pane (Player/NPC sub-tabs, NPC Knows editor + memory viewer) lives OUTSIDE
  // #results, so bind the same delegated handler there too — otherwise its clicks never fire.
  { const mbPaneEl = root.getElementById("main-tab-memories"); if (mbPaneEl) mbPaneEl.addEventListener("click", onResultsClick); }
  // The full-panel editor view hosts the Knows/Preferences editors (whose add/delete/save handlers
  // resolve via closest(".knows-editor"/".prefs-editor") in this same delegated handler) — bind it
  // there too so those editors work unchanged inside the view.
  { const editorBodyEl = root.getElementById("editor-body"); if (editorBodyEl) editorBodyEl.addEventListener("click", onResultsClick); }

  // Accept/Reject clicks inside the Update Plot Essentials results view.
  analyzeBody.addEventListener("click", (e) => {
    const t = (e.target as HTMLElement).closest("[data-act]");
    if (!t) return;
    const vid = t.getAttribute("data-vid"); const act = t.getAttribute("data-act");
    if (vid && (act === "applied" || act === "rejected") && cbs.proposalDecision) {
      cbs.proposalDecision(vid, act);
      const actions = t.closest("[data-prop]")?.querySelector(".prop-actions") as HTMLElement | null;
      if (actions) setSafeHTML(actions, act === "applied"
        ? `<span class="note" style="color:var(--accent-color);font-weight:600;">✓ Accepted</span>`
        : `<span class="note" style="color:#f87171;">Rejected</span>`);
    }
  });

  function esc(s: string) { return s.replace(/[\u0026\u003c\u003e\u0022]/g, (c) => ({ "\u0026": "&amp;", "\u003c": "&lt;", "\u003e": "&gt;", "\u0022": "&quot;" }[c]!)); }

  function doesDetailMatchQuestion(key: string, question: string): boolean {
    const k = key.toLowerCase();
    const q = question.toLowerCase();
    if (q.includes(k)) return true;
    if (k === "age" && (q.includes("old") || q.includes("years"))) return true;
    if (k === "gender" && (q.includes("sex") || q.includes("male") || q.includes("female"))) return true;
    if (k === "name" && (q.includes("who are you") || q.includes("called") || q.includes("identity"))) return true;
    return false;
  }

  function renderSetupFavorites(globalAssets: GlobalAsset[], filterText = "", activeQuestion = "", existingContainer?: HTMLElement): string {
    // Only saved Plot Essentials character blocks are offered for scenario setup.
    const filtered = (globalAssets ?? []).filter(a => {
      if (a.type !== "pe") return false;
      if (filterText) {
        const matchText = filterText.toLowerCase();
        return (a.title || "").toLowerCase().includes(matchText) ||
               (a.keys || "").toLowerCase().includes(matchText) ||
               (a.value || "").toLowerCase().includes(matchText);
      }
      return true;
    });

    filtered.sort((a, b) => (a.title || "").localeCompare(b.title || ""));

    if (filtered.length === 0) {
      return `<div style="text-align:center; padding:12px; color:var(--text-secondary); font-size:11px;">No favorite characters found.</div>`;
    }

    // Keep track of previously existing drawers' open states to preserve them
    const existingFavIds = new Set<string>();
    const openFavIds = new Set<string>();
    const container = existingContainer || root.getElementById("setup-favorites-list");
    if (container) {
      container.querySelectorAll(".setup-fav-drawer").forEach(el => {
        const id = el.getAttribute("data-id");
        if (id) {
          existingFavIds.add(id);
          if ((el as HTMLDetailsElement).open) {
            openFavIds.add(id);
          }
        }
      });
    }

    return filtered.map(a => {
      const icon = "👤";
      const typeLabel = "Bio";
      
      // Extract details for chips
      const details = extractDetailsFromText(a.value)
        .concat(extractDetailsFromText(a.description || ""));
      
      // Add name itself as a chip
      details.unshift({ key: "Name", value: a.title });

      // Deduplicate details by key
      const seenKeys = new Set<string>();
      const uniqueDetails = details.filter(d => {
        const k = d.key.toLowerCase();
        if (seenKeys.has(k)) return false;
        seenKeys.add(k);
        return true;
      });

      const chipsHtml = uniqueDetails.map(d => {
        const isMatch = doesDetailMatchQuestion(d.key, activeQuestion);
        const style = isMatch
          ? "background:rgba(168,85,247,0.25); color:#d8b4fe; border:1px solid rgba(168,85,247,0.5); font-weight:600; box-shadow:0 0 4px rgba(168,85,247,0.2);"
          : "background:rgba(255,255,255,0.04); color:var(--text-secondary); border:1px solid rgba(255,255,255,0.06);";
          
        return `
          <span class="setup-detail-chip" data-key="${esc(d.key)}" data-value="${esc(d.value)}" style="padding:2px 6px; border-radius:4px; font-size:9px; cursor:pointer; max-width:100%; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; transition:all 0.15s ease; ${style}" title="Click to fill: ${esc(d.value)}">
            ${esc(d.key)}: ${esc(d.value)}
          </span>
        `;
      }).join("");

      const wasPresent = existingFavIds.has(a.id);
      const isOpen = wasPresent 
        ? openFavIds.has(a.id) 
        : !!(activeQuestion && uniqueDetails.some(d => doesDetailMatchQuestion(d.key, activeQuestion)));

      return `
        <details class="char-card setup-fav-drawer" data-id="${esc(a.id)}" ${isOpen ? "open" : ""}>
          <summary>
            <span>
              ${icon} ${esc(a.title)}
              <span style="color:var(--text-secondary);font-size:10.5px;font-weight:normal;margin-left:4px;">
                (${esc(typeLabel)}${a.description || a.keys ? ` - ${esc(a.description || a.keys || "")}` : ""})
              </span>
            </span>
          </summary>
          <div class="char-card-body" style="background:rgba(0,0,0,0.15); border-top:1px solid rgba(255,255,255,0.04);">
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:9.5px; color:var(--text-secondary);">
              <span>Quick Fill:</span>
              <div style="display:flex; gap:4px;">
                <button class="setup-fill-btn fill-name" data-id="${esc(a.id)}" style="margin:0; padding:2px 6px; font-size:9px; background:rgba(168,85,247,0.15); color:#c084fc; border:1px solid rgba(168,85,247,0.3); border-radius:4px; cursor:pointer;" title="Fill character name">Name</button>
                <button class="setup-fill-btn fill-bio" data-id="${esc(a.id)}" style="margin:0; padding:2px 6px; font-size:9px; background:rgba(16,185,129,0.15); color:#34d399; border:1px solid rgba(16,185,129,0.3); border-radius:4px; cursor:pointer;" title="Fill character entry/bio">Full Bio</button>
              </div>
            </div>
            ${chipsHtml ? `
              <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:2px;">
                ${chipsHtml}
              </div>
            ` : ""}
          </div>
        </details>
      `;
    }).join("");
  }

  // Builds <optgroup>-grouped <option>s of all non-deleted cards for the "link to existing card"
  // pickers (suggestion banner + proper noun log editor). Leads with a disabled placeholder.
  function buildCardPickerOptions(cards: PanelState["cards"]): string {
    const TYPE_LABELS: Record<string, string> = { character: "Characters", class: "Classes", race: "Races", location: "Locations", faction: "Factions", custom: "Custom" };
    const byType = new Map<string, { id: string; label: string }[]>();
    for (const c of (cards ?? [])) {
      if (c.deletedAt) continue;
      const t = (c.type || "custom").toLowerCase();
      const arr = byType.get(t) ?? [];
      arr.push({ id: c.id, label: c.title || c.keys || "(untitled)" });
      byType.set(t, arr);
    }
    const order = ["character", "location", "faction", "class", "race", "custom"];
    const orderedTypes = [...byType.keys()].sort((a, b) => {
      const ia = order.indexOf(a), ib = order.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
    });
    let html = `<option value="" selected>-- existing card --</option>`;
    for (const t of orderedTypes) {
      const label = TYPE_LABELS[t] ?? t;
      const opts = byType.get(t)!.sort((a, b) => a.label.localeCompare(b.label));
      html += `<optgroup label="${esc(label)}">` +
        opts.map(o => `<option value="${esc(o.id)}">${esc(o.label)}</option>`).join("") +
        `</optgroup>`;
    }
    return html;
  }

  // Builds the proper-noun-log classification <option>s: None + the 6 base AID card types +
  // every distinct custom type present in this adventure's cards. `selected` is the log's current
  // type (case-insensitive). The chosen value is stored verbatim on the log (location/character
  // also drive the legacy isLocation/isCharacter booleans).
  function buildTypePickerOptions(cards: PanelState["cards"], selected?: string): string {
    const base: [string, string][] = [
      ["", "None"], ["character", "Character"], ["class", "Class"], ["race", "Race"],
      ["location", "Location"], ["faction", "Faction"], ["custom", "Custom"],
    ];
    const reserved = new Set(["", "character", "class", "race", "location", "faction", "custom", "memory"]);
    const sel = (selected || "").trim().toLowerCase();
    const customTypes: string[] = [];
    const seen = new Set<string>();
    for (const c of (cards ?? [])) {
      if (c.deletedAt) continue;
      const t = (c.type || "").trim();
      const tl = t.toLowerCase();
      if (!t || reserved.has(tl) || seen.has(tl)) continue;
      seen.add(tl);
      customTypes.push(t);
    }
    customTypes.sort((a, b) => a.localeCompare(b));
    let html = base.map(([v, l]) => `<option value="${esc(v)}"${sel === v ? " selected" : ""}>${esc(l)}</option>`).join("");
    if (customTypes.length) {
      html += `<optgroup label="Detected Custom Types">` +
        customTypes.map(t => `<option value="${esc(t)}"${sel === t.toLowerCase() ? " selected" : ""}>${esc(t)}</option>`).join("") +
        `</optgroup>`;
    }
    return html;
  }

  function showAnalyzeResultFn(res: any) {
    if (!res) { setSafeHTML(analyzeBody, `<div class="note">No response.</div>`); return; }
    if (res.error) {
      setSafeHTML(analyzeBody, `<div style="padding:12px;border:1px solid rgba(239,68,68,0.3);background:rgba(239,68,68,0.06);border-radius:8px;color:#fca5a5;font-size:12px;">${esc(res.error)}</div>` +
        `<button id="analyze-done" style="margin-top:12px;width:100%;background:var(--btn-bg);border:1px solid var(--border-color);color:var(--text-primary);font-weight:600;padding:6px;border-radius:6px;">← Back to Tracker</button>`);
      root.getElementById("analyze-done")?.addEventListener("click", showTrackerView);
      return;
    }
    const count = res.count ?? 0;
    const proposals: { id: string; characterName: string; changeSummary: string; entry: string }[] = res.proposals ?? [];
    let html = `<div style="font-weight:700;color:var(--accent-color);font-size:14px;margin-bottom:8px;">${count} proposal${count === 1 ? "" : "s"}</div>`;
    if (count === 0) {
      html += `<div class="note" style="padding:10px;border:1px solid var(--border-color);border-radius:8px;">No changes detected — everything is already up to date.</div>`;
    } else {
      html += proposals.map((p) =>
        `<div class="prop" data-prop>` +
          `<div class="sum">${esc(p.characterName)}</div>` +
          `<div style="color:#9fd;font-size:11px;margin:2px 0 4px;">${esc(p.changeSummary)}</div>` +
          `<details><summary style="color:var(--accent-color);">view proposed entry</summary>` +
            `<div class="code-card"><pre>${esc(p.entry)}</pre></div></details>` +
          `<div class="prop-actions" style="margin-top:6px;">` +
            `<button data-vid="${esc(p.id)}" data-act="applied" style="background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.3);padding:3px 10px;border-radius:6px;font-size:10px;margin-right:4px;">Accept</button>` +
            `<button data-vid="${esc(p.id)}" data-act="rejected" style="background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.3);padding:3px 10px;border-radius:6px;font-size:10px;">Reject</button>` +
          `</div>` +
        `</div>`
      ).join("");
    }
    if (res.warnings?.length) {
      html += `<details style="margin-top:8px;"><summary style="cursor:pointer;color:var(--text-secondary);font-size:11px;">${res.warnings.length} warning(s)</summary>` +
        `<ul style="margin:4px 0;padding-left:18px;">` + res.warnings.map((w: string) => `<li class="note" style="margin:2px 0;">${esc(w)}</li>`).join("") + `</ul></details>`;
    }
    html += `<button id="analyze-done" class="btn-primary" style="margin-top:12px;width:100%;padding:6px;">View Tracker</button>`;
    setSafeHTML(analyzeBody, html);
    root.getElementById("analyze-done")?.addEventListener("click", showTrackerView);
  }

  // Renders the Memory Bank timeline + unread badge. Called from render() and from
  // updateMemories() (surgical WS-driven refresh of just this section).
  /** The Knows (schema) editor markup — migrated from the Card Manager Crystallized card to the
   *  Memory Bank → NPC tab. Delegated handlers (.knows-add/.knows-del/.knows-save) operate on
   *  `.knows-editor[data-card-id]` regardless of where this is rendered. */
  function buildKnowsEditorHtml(genCardId: string, schemaItems: import("../inference/crystallized").SchemaItem[]): string {
    return `<div class="knows-editor" data-card-id="${esc(genCardId)}" style="margin-top:6px;padding:8px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:8px;">` +
      `<div class="knows-rows-container">` +
      schemaItems.map((item, idx) => `
        <div class="knows-row" data-idx="${idx}" style="display:flex;flex-direction:column;gap:4px;margin-bottom:8px;padding:6px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.04);border-radius:6px;">
          <div style="display:flex;gap:6px;align-items:center;">
            <input class="knows-canon input-compact input-dark" value="${esc(item.subject)}" placeholder="Subject" style="flex:1;background:rgba(255,255,255,0.03);color:var(--text-primary);border:1px solid rgba(255,255,255,0.08);padding:4px 6px;border-radius:4px;font-size:11px;" />
            <input class="knows-aliases input-compact input-dark" value="${esc((item.aliases || []).join(', '))}" placeholder="aka (comma-separated)" style="flex:1;background:rgba(255,255,255,0.03);color:var(--text-secondary);border:1px solid rgba(255,255,255,0.08);padding:4px 6px;border-radius:4px;font-size:11px;" />
            <button class="knows-del" data-idx="${idx}" style="background:rgba(239, 68, 68, 0.15);color:#f87171;border:1px solid rgba(239, 68, 68, 0.3);border-radius:4px;cursor:pointer;padding:2px 6px;font-size:11px;">✕</button>
          </div>
          <textarea class="knows-text input-dark" rows="2" style="background:rgba(255,255,255,0.03);color:var(--text-primary);border:1px solid rgba(255,255,255,0.08);padding:4px 6px;border-radius:4px;font-size:11px;font-family:inherit;resize:vertical;">${esc(item.text)}</textarea>
        </div>
      `).join("") +
      `</div>` +
      `<div style="display:flex;gap:8px;margin-top:8px;">` +
        `<button class="knows-add action-btn" data-card-id="${esc(genCardId)}" style="background:rgba(255,255,255,0.04);color:var(--text-primary);border-color:var(--border-color);">+ Add subject</button>` +
        `<button class="knows-save action-btn" data-card-id="${esc(genCardId)}" style="background:rgba(16, 185, 129, 0.15);color:#10b981;border-color:rgba(16, 185, 129, 0.3);">Save Knows</button>` +
      `</div>` +
    `</div>`;
  }

  /** One preference-editor row: a single first-person sentence + delete. Mirrors the Knows editor but
   *  simpler (no subject/aliases). Used by buildPreferencesEditorHtml and the "+ Add preference" click. */
  function prefRowHtml(text: string): string {
    return `<div class="pref-row" style="display:flex;gap:6px;align-items:flex-start;margin-bottom:6px;">
        <textarea class="pref-text input-dark" rows="2" placeholder="e.g. I hate olives. / I love old Audis. / I don't really have an opinion on breadsticks." style="flex:1;background:rgba(255,255,255,0.03);color:var(--text-primary);border:1px solid rgba(255,255,255,0.08);padding:4px 6px;border-radius:4px;font-size:11px;font-family:inherit;resize:vertical;">${esc(text)}</textarea>
        <button class="pref-del" style="background:rgba(239, 68, 68, 0.15);color:#f87171;border:1px solid rgba(239, 68, 68, 0.3);border-radius:4px;cursor:pointer;padding:2px 6px;font-size:11px;">✕</button>
      </div>`;
  }

  /** The per-NPC Preferences editor: concrete personal texture (positive/negative/neutral). Manually
   *  editable, seedable, and effectively uncapped; preferences never decay and are pulled into the scene
   *  by relevance (strength-ranked). Saved as a full authoritative list (deletions honored). */
  function buildPreferencesEditorHtml(genCardId: string, prefTexts: string[]): string {
    return `<div class="prefs-editor" data-card-id="${esc(genCardId)}" style="margin-top:6px;padding:8px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:8px;">` +
      `<div class="note" style="margin-bottom:6px;font-size:10px;color:var(--text-secondary);">Tastes, habits, quirks, pet peeves, opinions about things — positive, negative, or neutral. These never fade; they're pulled in when the scene is relevant. Seed as many as you like.</div>` +
      `<div class="prefs-rows-container">` +
      (prefTexts.length ? prefTexts.map((t) => prefRowHtml(t)).join("") : "") +
      `</div>` +
      `<div style="display:flex;gap:8px;margin-top:8px;">` +
        `<button class="prefs-add action-btn" data-card-id="${esc(genCardId)}" style="background:rgba(255,255,255,0.04);color:var(--text-primary);border-color:var(--border-color);">+ Add preference</button>` +
        `<button class="prefs-save action-btn" data-card-id="${esc(genCardId)}" style="background:rgba(16, 185, 129, 0.15);color:#10b981;border-color:rgba(16, 185, 129, 0.3);">Save Preferences</button>` +
      `</div>` +
    `</div>`;
  }

  /** One NPC memory-bank block's markup — styled like the Player Memory Bank cards (regenerate / edit /
   *  delete icons), minus the "Stored Context" label (the turn range sits there instead). Shared by the
   *  full render and the surgical incremental insert. */
  function renderNpcMemBlockHtml(charName: string, b: NpcMemBlock): string {
    const c = esc(charName); const id = esc(b.blockId);
    return `<div class="npc-mem-block memory-card" data-char="${c}" data-block-id="${id}" data-turn-end="${b.turnEnd}">
        <div class="memory-card-header">
          <div style="display:flex;align-items:center;color:var(--text-secondary);font-size:10px;">turns ${b.turnStart}–${b.turnEnd}</div>
          <div style="display:flex;gap:6px;align-items:center;">
            <button class="npc-mem-regen-btn btn-icon" data-char="${c}" data-block-id="${id}" style="color:#eab308;" title="Regenerate this memory">
              <svg style="width:14px;height:14px;fill:currentColor;" viewBox="0 0 24 24"><path d="M7 2v11h3v9l7-12h-4l4-8z"/></svg>
            </button>
            <button class="npc-mem-edit-btn btn-icon" title="Edit memory">
              <svg style="width:14px;height:14px;fill:currentColor;" viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c0.39-0.39 0.39-1.02 0-1.41l-2.34-2.34c-0.39-0.39-1.02-0.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
            </button>
            <button class="npc-mem-delete-btn btn-icon" data-char="${c}" data-block-id="${id}" style="color:#f87171;" title="Delete memory">
              <svg style="width:14px;height:14px;fill:currentColor;" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </button>
          </div>
        </div>
        <div class="memory-card-text">${esc(b.povText)}</div>
      </div>`;
  }

  /** The per-character NPC memory-bank block list (lazy-loaded + cached). Lives inside the Memory
   *  Bank editor view (openNpcBankView) — the drawer is navigation-only now. */
  function renderNpcMemList(charName: string): string {
    const key = charName.toLowerCase();
    const blocks = npcMemoryCache.get(key);
    if (!blocks) {
      if (!npcMemoryFetching.has(key) && cbs.getNpcMemoryBank) {
        npcMemoryFetching.add(key);
        cbs.getNpcMemoryBank(charName).then((res) => {
          npcMemoryCache.set(key, (res?.blocks as NpcMemBlock[]) || []);
          refreshOpenNpcBankList(charName);
        }).catch(() => {}).finally(() => npcMemoryFetching.delete(key));
      }
      return `<div class="note" style="padding:6px;">Loading…</div>`;
    }
    if (!blocks.length) return `<div class="note" style="padding:6px;">No memories yet — use “Backfill memories”.</div>`;
    return blocks.map((b) => renderNpcMemBlockHtml(charName, b)).join("");
  }

  /** Re-populate the Memory Bank editor view's list for a character IF that view is currently open
   *  (lazy fetch completion, backfill watchdog). No-op otherwise. */
  function refreshOpenNpcBankList(charName: string): void {
    const body = root.getElementById("editor-body");
    if (!body) return;
    const list = Array.from(body.querySelectorAll(".npc-mem-list"))
      .find((el) => el.getAttribute("data-char") === charName) as HTMLElement | undefined;
    if (list) setSafeHTML(list, renderNpcMemList(charName));
  }

  /** The Memory Bank full-panel view for one character: backfill action + the block list. Existing
   *  delegated handlers (backfill, regen, edit, delete) drive everything — they're bound to
   *  #editor-body too. The per-block ✏️ edit opens ANOTHER editor level whose Back returns here. */
  function openNpcBankView(charName: string): void {
    openEditorView(`${charName} — Memory Bank`,
      `<div style="display:flex;gap:6px;flex-shrink:0;"><button class="backfill-npc-memories-btn btn-micro btn-micro--green" data-char-name="${esc(charName)}" title="Generate this character's point-of-view memories from the adventure's native memory blocks">Backfill memories</button></div>` +
      `<div class="npc-mem-list" data-char="${esc(charName)}" style="display:flex;flex-direction:column;gap:8px;">${renderNpcMemList(charName)}</div>`);
  }

  /** Surgically splice one freshly-generated block into the open NPC memory list WITHOUT re-rendering
   *  the whole pane (avoids flicker + scroll-jump during backfill). Keeps the cache in sync. Returns
   *  false if the list DOM isn't present (caller may fall back to a full render). */
  function insertNpcMemBlock(charName: string, block: NpcMemBlock): boolean {
    const key = charName.toLowerCase();
    // Keep the cache consistent (sorted newest-first) so a later full render matches the DOM.
    const cached = npcMemoryCache.get(key);
    if (cached && !cached.some((b) => b.blockId === block.blockId)) {
      cached.push(block);
      cached.sort((a, b) => b.turnEnd - a.turnEnd);
    }
    // The block list lives in the Memory Bank editor view now (the drawer is navigation-only).
    const pane = root.getElementById("editor-body");
    if (!pane) return false;
    let list: HTMLElement | null = null;
    pane.querySelectorAll(".npc-mem-list").forEach((el) => { if (el.getAttribute("data-char") === charName) list = el as HTMLElement; });
    if (!list) return false;
    const listEl = list as HTMLElement;
    if (listEl.querySelector(`.npc-mem-block[data-block-id="${block.blockId.replace(/"/g, '\\"')}"]`)) return true; // already shown
    // Replace the "Loading…/No memories" placeholder if present.
    const placeholder = listEl.querySelector(".note");
    if (placeholder && listEl.children.length === 1) listEl.textContent = "";
    const frag = document.createElement("div");
    setSafeHTML(frag, renderNpcMemBlockHtml(charName, block));
    const node = frag.firstElementChild as HTMLElement | null;
    if (!node) return true;
    // Insert in sorted position (newest turnEnd first).
    let inserted = false;
    for (const existing of Array.from(listEl.querySelectorAll(":scope > .npc-mem-block"))) {
      const te = Number((existing as HTMLElement).getAttribute("data-turn-end") || "0");
      if (block.turnEnd > te) { listEl.insertBefore(node, existing); inserted = true; break; }
    }
    if (!inserted) listEl.appendChild(node);
    return true;
  }

  /** Render the Memory Bank → NPC sub-pane: one drawer per Crystallized NPC (Knows editor + memory
   *  bank viewer). Open-state preserved via data-key. */
  function renderNpcMemoryBank(state: PanelState) {
    const pane = root.getElementById("mb-npc");
    if (!pane) return;
    const crystCards = (state.cards || []).filter((c) => !c.deletedAt && (c.title || "").toLowerCase().endsWith(" - crystallized"));
    if (!crystCards.length) {
      setSafeHTML(pane, `<div class="note" style="padding:12px;">No Crystallized NPCs yet. Enable Crystallized and add characters in the Card Manager → MemorAID section.</div>`);
      return;
    }
    const openKeys = new Set<string>();
    pane.querySelectorAll("details[data-key]").forEach((d) => { if ((d as HTMLDetailsElement).open) openKeys.add(d.getAttribute("data-key") || ""); });
    let html = "";
    for (const cc of crystCards) {
      const charName = (cc.title || "").replace(/\s*-\s*crystallized$/i, "");
      const genCardId = cc.id;
      const cachedSchema = crystallizedSchemaCache.get(genCardId);
      if (!cachedSchema && !crystallizedSchemaFetching.has(genCardId) && cbs.getCrystallizedSchema) {
        crystallizedSchemaFetching.add(genCardId);
        cbs.getCrystallizedSchema(genCardId).then((res) => {
          if (res?.ok && res.state) {
            crystallizedSchemaCache.set(genCardId, res.state.schema || []);
            // Preferences are strength-ranked in the editor (relevance-ranking is scene-only); the
            // background sorts render output, but here we sort by strength for a stable, sensible order.
            crystallizedPreferencesCache.set(genCardId, [...(res.state.preferences || [])].sort((a, b) => b.strength - a.strength).map((p) => p.text));
            if (lastState) renderNpcMemoryBank(lastState);
          }
        }).catch(() => {}).finally(() => crystallizedSchemaFetching.delete(genCardId));
      }
      // All three sections open full-panel views (Phase B + follow-up): the drawer is pure
      // navigation — three large tappable rows whose chevrons signal "opens its own panel".
      html += `<details class="char-card" data-key="mbnpc:${esc(charName)}"><summary>${esc(charName)}</summary>` +
        `<div style="display:flex;flex-direction:column;gap:6px;margin:8px 0;">` +
          `<button class="open-knows-editor npc-section-btn" data-card-id="${esc(genCardId)}" data-char="${esc(charName)}"><span>🧠 Knows</span><span class="npc-section-chevron">›</span></button>` +
          `<button class="open-prefs-editor npc-section-btn" data-card-id="${esc(genCardId)}" data-char="${esc(charName)}"><span>✨ Preferences</span><span class="npc-section-chevron">›</span></button>` +
          `<button class="open-npc-bank npc-section-btn" data-char="${esc(charName)}"><span>📚 Memory Bank</span><span class="npc-section-chevron">›</span></button>` +
        `</div>` +
      `</details>`;
    }
    setSafeHTML(pane, html);
    pane.querySelectorAll("details[data-key]").forEach((d) => { if (openKeys.has(d.getAttribute("data-key") || "")) (d as HTMLDetailsElement).open = true; });
  }

  function renderMemoriesSection(state: PanelState) {
    const refineBtn = root.getElementById("refine-mem") as HTMLButtonElement | null;
    if (refineBtn) {
      refineBtn.disabled = false;
      refineBtn.textContent = "⚡ Regenerate Latest";
    }
    const memListEl = root.getElementById("aid-memories-list");
    if (memListEl) {
      if (!state.aidMemories || state.aidMemories.length === 0) {
        setSafeHTML(memListEl, `<div class="note" style="padding:12px;text-align:center;">No AID-generated memories captured yet.</div>`);
      } else {
        const actionMap = new Map<string, string>();
        if (state.actions) {
          for (const a of state.actions) {
            actionMap.set(a.id, a.text || "");
          }
        }

        const isInitialLoad = knownMemories.size === 0;
        const itemsWithIndex = state.aidMemories.map((m, index) => ({ m, index }));
        const reversedItems = [...itemsWithIndex].reverse();
        setSafeHTML(memListEl, reversedItems.map(({ m, index }) => {
          const text = typeof m === "string" ? m : (m?.text || "");

          const rawM = m as any;
          const isUsed = m && typeof m !== "string" && (rawM.used === true || rawM.isUsed === true || rawM.active === true);

          let statusClass = "stored";
          let statusText = "Stored Context";
          if (isUsed) {
            statusClass = "used";
            statusText = "Used Memory";
          }

          const key = (m && typeof m !== "string" && m.actionIds && m.actionIds.length > 0)
            ? m.actionIds.join(",")
            : text;
          const isNew = !isInitialLoad && key ? !knownMemories.has(key) : false;
          if (key) {
            knownMemories.add(key);
          }

          const matchedTexts = (m && typeof m !== "string" && m.actionIds)
            ? m.actionIds.map(id => actionMap.get(id)).filter((t): t is string => !!t)
            : [];

          const contextHtml = matchedTexts.length > 0
            ? `<details class="memory-context" style="margin-top:6px; border-top:1px solid rgba(255,255,255,0.05); padding-top:4px;">
                 <summary style="cursor:pointer; color:var(--text-secondary); font-size:10px; outline:none; user-select:none;">View Story Context (${matchedTexts.length} turns)</summary>
                 <div class="code-card" style="margin-top:4px; max-height:120px; overflow-y:auto; font-size:10.5px; line-height:1.4; color:var(--text-secondary); white-space:pre-wrap; background:rgba(0,0,0,0.15); border-radius:4px; padding:6px;">${matchedTexts.map(t => esc(t)).join("\n\n")}</div>
               </details>`
            : "";

          return `
            <div class="memory-card ${isNew ? 'ping-new' : ''}" data-idx="${index}">
              <div class="memory-card-header">
                <div style="display:flex;align-items:center;">
                  <span class="memory-status-dot ${statusClass}"></span>
                  <span>${statusText}</span>
                </div>
                <div style="display:flex;gap:6px;align-items:center;">
                  <button class="mem-refine-btn btn-icon" style="color:#eab308;" title="Regenerate this memory with your provider">
                    <svg style="width:14px;height:14px;fill:currentColor;" viewBox="0 0 24 24">
                      <path d="M7 2v11h3v9l7-12h-4l4-8z"/>
                    </svg>
                  </button>
                  <button class="mem-edit-btn btn-icon" title="Edit memory">
                    <svg style="width:14px;height:14px;fill:currentColor;" viewBox="0 0 24 24">
                      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c0.39-0.39 0.39-1.02 0-1.41l-2.34-2.34c-0.39-0.39-1.02-0.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                    </svg>
                  </button>
                  <button class="mem-delete-btn btn-icon" style="color:#f87171;" title="Delete memory">
                    <svg style="width:14px;height:14px;fill:currentColor;" viewBox="0 0 24 24">
                      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                    </svg>
                  </button>
                </div>
              </div>
              <div class="memory-card-text">${esc(text)}</div>
              ${contextHtml}
            </div>
          `;
        }).join(""));
      }
    }

    // Handle unread badge
    const memoriesCount = state.aidMemories?.length ?? 0;
    if (lastViewedMemoriesCount === -1) {
      lastViewedMemoriesCount = memoriesCount;
    }
    const badge = root.getElementById("unread-memories-badge");
    if (badge) {
      if (activeTabId === "main-tab-memories") {
        lastViewedMemoriesCount = memoriesCount;
        badge.style.display = "none";
        badge.className = "";
      } else if (memoriesCount > lastViewedMemoriesCount) {
        badge.textContent = `+${memoriesCount - lastViewedMemoriesCount}`;
        badge.style.display = "inline-block";
        badge.className = "badge-new-memories";
      } else {
        badge.style.display = "none";
        badge.className = "";
      }
    }
  }

  const PRESET_MODES = [
    {
      name: "Drama & Tension",
      emoji: "🎭",
      color: "#f97316", rgb: "249,115,22",
      tagline: "Heart-pounding conflicts. Shifting alliances. Emotional fireworks.",
      blurb: "Soap-opera twists and love triangles that keep you hooked.",
      pressures: ["jealousy", "betrayal", "suspicion", "envy", "rivalry", "confrontation", "gossip", "misunderstanding", "obsession"],
      spark: "A whispered rumor at the dinner table turns into a thrown glass. By midnight, two best friends are not speaking."
    },
    {
      name: "Romance & Connection",
      emoji: "💕",
      color: "#ec4899", rgb: "236,72,153",
      tagline: "Slow burns, deep bonds, and feelings that hit hard.",
      blurb: "The kind of tension that makes the story throb.",
      pressures: ["attraction", "seduction", "protectiveness", "curiosity", "trust", "jealousy", "teasing", "longing"],
      spark: "The power cuts out, her hand finds his in the dark, and neither of them lets go first."
    },
    {
      name: "Chaos & High Drama",
      emoji: "💀",
      color: "#a855f7", rgb: "168,85,247",
      tagline: "Everything spirals into unpredictable intensity.",
      blurb: "Reality-TV levels of 'what the hell just happened?'",
      pressures: ["confrontation", "argument", "suspicion", "narcissism", "overreaction", "paranoia", "betrayal"],
      spark: "An accusation lands wrong, an old text resurfaces, and suddenly everyone is yelling."
    },
    {
      name: "Comedy & Lighthearted",
      emoji: "🤣",
      color: "#eab308", rgb: "234,179,8",
      tagline: "Bursts of absurdity to balance the storm.",
      blurb: "Laughs that make the wild ride even better.",
      pressures: ["awkward", "misunderstanding", "overreaction", "confusion", "silly behavior"],
      spark: "He misheard the question, answered with full confidence, and now the room thinks he is proposing."
    },
    {
      name: "Psychological & Depth",
      emoji: "🧠",
      color: "#22c55e", rgb: "34,197,94",
      tagline: "Dive into the hidden mind and soul.",
      blurb: "Stories that crawl under your skin and stay there.",
      pressures: ["guilt", "envy", "obsession", "avoidance", "suspicion", "regret", "curiosity", "possession"],
      spark: "She edits the apology, deletes it, and decides to act like nothing happened. He notices."
    },
    {
      name: "Survival & Challenge",
      emoji: "☢️",
      color: "#ef4444", rgb: "239,68,68",
      tagline: "High-stakes worlds where every choice bites back.",
      blurb: "Gritty, morally gray survival that refuses to let go.",
      pressures: ["scarcity", "resource competition", "paranoia", "betrayal", "self-preservation", "desperation", "territorial behavior", "fear", "mistrust"],
      spark: "Three cans of food left. Four people. By morning, one bed is empty."
    }
  ];

  const CORE_PRESSURES = ["friendship", "trust", "curiosity", "protectiveness", "jealousy", "rivalry", "attraction", "seduction", "teasing"];
  const WILDCARDS = ["yelling", "food fight", "awkward silence", "broken glass", "stolen letter", "wrong name", "thunderstorm", "uninvited guest", "burnt dinner", "midnight knock"];

  function renderLivingCharactersSection(state: PanelState) {
    if (!state.settings) return;

    const statusBanner = root.getElementById("lc-status-banner");
    if (statusBanner) {
      statusBanner.innerHTML = `
        <div style="background:rgba(16,185,129,0.06); border:1px solid rgba(16,185,129,0.2); border-radius:8px; padding:10px; margin-bottom:4px; font-size:11px; line-height:1.4; color:var(--text-secondary);">
          <div style="font-weight:700; color:#10b981; letter-spacing:0.03em; margin-bottom:2px;">🌱 Living Characters by nerdgrl450</div>
          <div>NPC relationship threads (Life Cards) are managed directly by the extension. No AI Dungeon scripting sandbox or config cards are required.</div>
        </div>
      `;
    }

    const rosterEl = root.getElementById("lc-config-roster") as HTMLTextAreaElement | null;
    const pressuresEl = root.getElementById("lc-config-pressures") as HTMLTextAreaElement | null;
    const protagonistEl = root.getElementById("lc-config-protagonist") as HTMLInputElement | null;
    const involvementEl = root.getElementById("lc-config-involvement") as HTMLSelectElement | null;
    const intervalEl = root.getElementById("lc-config-interval") as HTMLInputElement | null;
    const maxEl = root.getElementById("lc-config-max") as HTMLSelectElement | null;
    const relevanceEl = root.getElementById("lc-config-relevance") as HTMLSelectElement | null;
    const dormancyEl = root.getElementById("lc-config-dormancy") as HTMLInputElement | null;
    const reseedEl = root.getElementById("lc-config-reseed-cooldown") as HTMLInputElement | null;
    const staleEl = root.getElementById("lc-config-stale") as HTMLInputElement | null;
    const maxLifetimeEl = root.getElementById("lc-config-max-lifetime") as HTMLInputElement | null;

    // Per-adventure simulation config (state.livingConfig). Falls back to built-in defaults.
    const lc: LivingConfig = state.livingConfig || {};
    if (rosterEl && root.activeElement !== rosterEl) {
      let rosterText = lc.roster || "";
      if (!rosterText && state.cards) {
        const names = state.cards
          .filter(c => !c.deletedAt && normalizeType(c.type) === "character" && !(c.title || "").toLowerCase().endsWith(" (memory)"))
          .map(c => c.title || "")
          .filter(Boolean);
        rosterText = names.join("\n");
      }
      rosterEl.value = rosterText;
    }
    if (pressuresEl && root.activeElement !== pressuresEl) {
      pressuresEl.value = lc.pressures || DEFAULT_LC_PRESSURES;
    }
    if (protagonistEl && root.activeElement !== protagonistEl) {
      protagonistEl.value = state.protagonist || "";
    }
    if (involvementEl) {
      involvementEl.value = lc.protagonistInvolvement || "normal";
    }
    if (intervalEl && root.activeElement !== intervalEl) {
      intervalEl.value = String(lc.interval ?? 15);
    }
    if (maxEl) {
      maxEl.value = String(lc.maxActive ?? 2);
    }
    if (relevanceEl) {
      relevanceEl.value = lc.sceneRelevance || "strict";
    }
    if (dormancyEl && root.activeElement !== dormancyEl) {
      dormancyEl.value = String(lc.dormancyTurns ?? 7);
    }
    if (reseedEl && root.activeElement !== reseedEl) {
      reseedEl.value = String(lc.reseedCooldown ?? 15);
    }
    if (staleEl && root.activeElement !== staleEl) {
      staleEl.value = String(lc.staleTurns ?? 14);
    }
    if (maxLifetimeEl && root.activeElement !== maxLifetimeEl) {
      maxLifetimeEl.value = String(lc.maxActiveTurns ?? 4);
    }
    const continueModeEl = root.getElementById("lc-config-continue-mode") as HTMLSelectElement | null;
    if (continueModeEl) {
      continueModeEl.value = lc.continueInjectionMode || "defer";
    }

    // Pairing Pressure Pools editor. The container / add-button / datalist are static template elements
    // (stable across renders); here we only repopulate the rows + name suggestions and wire add/delete
    // once. Rows aren't clobbered while the user is typing inside the container.
    const pairingContainer = root.getElementById("lc-pairing-pools");
    const pairingDatalist = root.getElementById("lc-character-names");
    const addPairingBtn = root.getElementById("lc-add-pairing") as HTMLButtonElement | null;
    const pairingRowHtml = (a: string, b: string, pressures: string) =>
      `<div class="lc-pairing-row" style="display:flex; gap:4px; align-items:center; flex-wrap:wrap;">` +
        `<input class="lc-pair-a input-compact input-dark" list="lc-character-names" placeholder="Character A" value="${esc(a)}" style="flex:1; min-width:78px;" />` +
        `<span style="opacity:0.55; font-size:11px;">↔</span>` +
        `<input class="lc-pair-b input-compact input-dark" list="lc-character-names" placeholder="Character B" value="${esc(b)}" style="flex:1; min-width:78px;" />` +
        `<input class="lc-pair-pressures input-compact input-dark" placeholder="romance, devotion" value="${esc(pressures)}" style="flex:2; min-width:110px;" />` +
        `<button class="lc-pairing-del" title="Remove pairing" style="background:rgba(239,68,68,0.15); color:#f87171; border:1px solid rgba(239,68,68,0.3); border-radius:4px; cursor:pointer; padding:2px 6px; font-size:11px; min-height:unset; width:auto;">✕</button>` +
      `</div>`;
    if (pairingDatalist) {
      const names = new Set<string>();
      (lc.roster || "").split("\n").map(n => n.trim()).filter(Boolean).forEach(n => names.add(n));
      (state.cards || [])
        .filter(c => !c.deletedAt && normalizeType(c.type) === "character" && !(c.title || "").toLowerCase().endsWith(" (memory)"))
        .forEach(c => { if (c.title) names.add(c.title); });
      if (state.protagonist) names.add(state.protagonist);
      setSafeHTML(pairingDatalist, Array.from(names).map(n => `<option value="${esc(n)}"></option>`).join(""));
    }
    if (pairingContainer && !pairingContainer.contains(root.activeElement)) {
      const pairs = lc.pressurePairs || [];
      setSafeHTML(pairingContainer, pairs.map(p => pairingRowHtml(p.a || "", p.b || "", (p.pressures || []).join(", "))).join(""));
    }
    if (addPairingBtn && !addPairingBtn.dataset.lcWired) {
      addPairingBtn.dataset.lcWired = "1";
      addPairingBtn.addEventListener("click", () => {
        if (!pairingContainer) return;
        const div = document.createElement("div");
        setSafeHTML(div as any, pairingRowHtml("", "", ""));
        const row = div.firstElementChild;
        if (row) { pairingContainer.appendChild(row); (row.querySelector(".lc-pair-a") as HTMLInputElement | null)?.focus(); }
      });
    }
    if (pairingContainer && !pairingContainer.dataset.lcWired) {
      pairingContainer.dataset.lcWired = "1";
      pairingContainer.addEventListener("click", (e) => {
        const del = (e.target as HTMLElement).closest(".lc-pairing-del");
        if (del) del.closest(".lc-pairing-row")?.remove();
      });
    }

    // Render Core Pressures
    const coreContainer = root.getElementById("lc-core-pills-container");
    if (coreContainer) {
      setSafeHTML(coreContainer, CORE_PRESSURES.map(p => `
        <span class="lc-pill" data-pressure="${p}" style="display:inline-flex; align-items:center; background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.25); border-radius:12px; padding:3px 8px; font-size:10px; cursor:pointer; color:#34d399; user-select:none; font-weight:500; transition:background 0.2s;">${p}</span>
      `).join(""));
      
      coreContainer.querySelectorAll(".lc-pill").forEach(el => {
        el.addEventListener("click", () => {
          const p = el.getAttribute("data-pressure");
          if (p && pressuresEl) {
            const lines = pressuresEl.value.split("\n").map(l => l.trim()).filter(Boolean);
            if (!lines.includes(p)) {
              lines.push(p);
              pressuresEl.value = lines.join("\n");
              showToast(`Added pressure: ${p}`);
            }
          }
        });
      });
    }

    // Render Wildcards
    const wildContainer = root.getElementById("lc-wild-pills-container");
    if (wildContainer) {
      setSafeHTML(wildContainer, WILDCARDS.map(w => `
        <span class="lc-pill-wild" data-wildcard="${w}" style="display:inline-flex; align-items:center; background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.25); border-radius:12px; padding:3px 8px; font-size:10px; cursor:pointer; color:#f87171; user-select:none; font-weight:500; transition:background 0.2s;">${w}</span>
      `).join(""));
      
      wildContainer.querySelectorAll(".lc-pill-wild").forEach(el => {
        el.addEventListener("click", () => {
          const w = el.getAttribute("data-wildcard");
          if (w && pressuresEl) {
            const lines = pressuresEl.value.split("\n").map(l => l.trim()).filter(Boolean);
            if (!lines.includes(w)) {
              lines.push(w);
              pressuresEl.value = lines.join("\n");
              showToast(`Added wildcard: ${w}`);
            }
          }
        });
      });
    }

    // Render Preset Modes
    const modesContainer = root.getElementById("lc-modes-container");
    if (modesContainer) {
      setSafeHTML(modesContainer, PRESET_MODES.map((m, idx) => `
        <div class="preset-card" data-idx="${idx}" style="background:linear-gradient(135deg, rgba(${m.rgb},0.07), rgba(255,255,255,0.01)); border:1px solid rgba(${m.rgb},0.3); border-radius:12px; padding:10px; display:flex; flex-direction:column; gap:5px; box-sizing:border-box; width:100%;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; width:100%;">
            <div style="font-weight:800; color:${m.color}; font-size:12px; text-shadow:0 0 12px rgba(${m.rgb},0.35);">${m.emoji} ${m.name}</div>
            <button class="lc-btn-apply-preset btn-micro" data-idx="${idx}" style="font-weight:600; background:rgba(${m.rgb},0.15); color:${m.color}; border:1px solid rgba(${m.rgb},0.4); white-space:nowrap;">Apply Mode</button>
          </div>
          <div style="font-size:10px; color:var(--text-secondary); line-height:1.3; font-style:italic;">${m.tagline}</div>
          <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:2px;">
            ${m.pressures.map(p => `<span class="lc-preset-pill" data-pressure="${p}" title="Click to add this pressure" style="background:rgba(${m.rgb},0.1); border:1px solid rgba(${m.rgb},0.35); color:${m.color}; border-radius:8px; padding:2px 7px; font-size:9.5px; cursor:pointer; user-select:none; font-weight:500; transition:background 0.2s;">${p}</span>`).join("")}
          </div>
          <div style="border-left:2px solid ${m.color}; font-size:9.5px; color:var(--text-secondary); line-height:1.45; margin-top:4px; font-style:italic; background:rgba(${m.rgb},0.05); border-radius:0 4px 4px 0; padding:4px 6px;">
            <strong style="color:${m.color};">Spark:</strong> ${m.spark}
          </div>
        </div>
      `).join(""));

      modesContainer.querySelectorAll(".lc-btn-apply-preset").forEach(el => {
        el.addEventListener("click", () => {
          const idx = parseInt(el.getAttribute("data-idx")!, 10);
          const mode = PRESET_MODES[idx];
          if (mode && pressuresEl) {
            pressuresEl.value = mode.pressures.join("\n");
            showToast(`Applied preset mode: ${mode.name}`);
          }
        });
      });

      // Individual preset pills: click to append that single pressure to the pool
      modesContainer.querySelectorAll(".lc-preset-pill").forEach(el => {
        el.addEventListener("click", () => {
          const p = el.getAttribute("data-pressure");
          if (p && pressuresEl) {
            const lines = pressuresEl.value.split("\n").map(l => l.trim()).filter(Boolean);
            if (!lines.includes(p)) {
              lines.push(p);
              pressuresEl.value = lines.join("\n");
              showToast(`Added pressure: ${p}`);
            } else {
              showToast(`Already in pool: ${p}`);
            }
          }
        });
      });
    }

    const activeList = root.getElementById("lc-active-list");
    if (activeList) {
      const titlePrefix = state.settings.livingCharactersTitlePrefix || "Life - ";
      const keyPrefix = state.settings.livingCharactersKeyPrefix || "chaos-v2:";

      const lifeCards = (state.cards || []).filter(c => {
        if (c.deletedAt) return false;
        const typeLower = (c.type || "").toLowerCase();
        const titleLower = (c.title || "").toLowerCase();
        const keysList = (c.keys || "").split(/[,;]+/).map(k => k.trim().toLowerCase()).filter(Boolean);
        return (
          typeLower === "life" ||
          titleLower.startsWith(titlePrefix.toLowerCase()) ||
          keysList.some(k => k.startsWith(keyPrefix.toLowerCase()))
        );
      });

      if (lifeCards.length === 0) {
        setSafeHTML(activeList, `<div class="note" style="padding:12px; text-align:center;">No active relationship threads (Life Cards) in play. Seed one below!</div>`);
      } else {
        setSafeHTML(activeList, lifeCards.map(c => {
          const owner = c.title ? c.title.replace(new RegExp(`^${titlePrefix}`, "i"), "").trim() : "Unknown";
          const parsed = parseLifeCardEntry(c.value);
          const targetName = parsed.target || "none";
          const pressureName = parsed.pressure || "none";
          const occurrence = parsed.occurrence || "none";
          const momentum = parsed.momentum || "low";
          const status = (parsed.status || "active").toLowerCase();
          
          let statusColor = "#a855f7";
          let statusIcon = "⚡";
          if (status === "seedling") {
            statusColor = "#10b981";
            statusIcon = "🌱";
          } else if (status === "dormant") {
            statusColor = "#6b7280";
            statusIcon = "💤";
          }

          return `
            <div class="life-card-row" data-cardid="${c.id}" style="background:rgba(255,255,255,0.02); border:1px solid var(--border-color); border-radius:12px; padding:10px; display:flex; flex-direction:column; gap:4px; box-sizing:border-box; width:100%;">
              <div class="life-card-display">
                <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                  <div style="font-weight:700; color:var(--text-primary); font-size:11.5px; display:flex; align-items:center; gap:6px;">
                    <span style="color:${statusColor}; font-weight:bold; font-size:10px; text-transform:uppercase; border:1px solid ${statusColor}; border-radius:4px; padding:1px 5px; background:color-mix(in srgb, ${statusColor}, transparent 92%); display:inline-flex; align-items:center; gap:3px;">
                      <span>${statusIcon}</span><span>${status}</span>
                    </span>
                    <span>${owner} ➔ ${targetName}</span>
                  </div>
                  <div style="display:flex; gap:6px; align-items:center;">
                    <button class="lc-status-toggle-btn btn-icon" title="${status === 'dormant' ? 'Reactivate (back in scene)' : 'Mark dormant (paused)'}" style="font-size:12px;">${status === 'dormant' ? '▶' : '💤'}</button>
                    <button class="lc-resolve-btn btn-icon" style="color:#34d399; font-size:12px;" title="Resolve — archive this pressure, keeping its history">✅</button>
                    <button class="lc-card-edit-btn btn-icon" title="Edit relationship details">
                      <svg style="width:14px;height:14px;fill:currentColor;" viewBox="0 0 24 24">
                        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c0.39-0.39 0.39-1.02 0-1.41l-2.34-2.34c-0.39-0.39-1.02-0.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                      </svg>
                    </button>
                    <button class="lc-card-delete-btn btn-icon" style="color:#f87171;" title="Delete Relationship Card">
                      <svg style="width:14px;height:14px;fill:currentColor;" viewBox="0 0 24 24">
                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                      </svg>
                    </button>
                  </div>
                </div>
                <div style="font-size:11px; margin-top:2px;">
                  <strong style="color:var(--text-primary);">Pressure:</strong> <span style="color:var(--accent-color); font-weight:600;">${pressureName}</span>
                  <span style="margin:0 6px; color:var(--border-color);">|</span>
                  <strong style="color:var(--text-primary);">Urgency:</strong> <span>${momentum}</span>
                </div>
                ${occurrence && occurrence.toLowerCase() !== "none" ? `<div style="font-size:10px; color:var(--text-secondary); line-height:1.4; margin-top:2px; background:rgba(0,0,0,0.1); border-radius:4px; padding:4px 6px; word-break:break-word;">
                  <strong>Latest Occurrence driving pressure:</strong> ${esc(occurrence)}
                </div>` : ""}
              </div>

              <!-- Inline Edit Form -->
              <div class="life-card-edit-form" style="display:none; flex-direction:column; gap:6px; margin-top:4px; border-top:1px solid var(--border-color); padding-top:6px; font-size:10.5px; box-sizing:border-box; width:100%;">
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; box-sizing:border-box; width:100%;">
                  <div style="display:flex; flex-direction:column; gap:2px;">
                    <label style="font-weight:600;">Target Name</label>
                    <input type="text" class="edit-lc-target input-compact input-dark" value="${esc(targetName)}" />
                  </div>
                  <div style="display:flex; flex-direction:column; gap:2px;">
                    <label style="font-weight:600;">Pressure</label>
                    <input type="text" class="edit-lc-pressure input-compact input-dark" value="${esc(pressureName)}" />
                  </div>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; box-sizing:border-box; width:100%;">
                  <div style="display:flex; flex-direction:column; gap:2px;">
                    <label style="font-weight:600;">Urgency</label>
                    <input type="text" class="edit-lc-momentum input-compact input-dark" value="${esc(momentum)}" placeholder="low / medium / high" />
                  </div>
                  <div style="display:flex; flex-direction:column; gap:2px;">
                    <label style="font-weight:600;">Status</label>
                    <select class="edit-lc-status input-compact input-dark">
                      <option value="seedling" ${status === "seedling" ? "selected" : ""}>seedling</option>
                      <option value="active" ${status === "active" ? "selected" : ""}>active</option>
                      <option value="dormant" ${status === "dormant" ? "selected" : ""}>dormant</option>
                    </select>
                  </div>
                </div>
                <div style="display:flex; flex-direction:column; gap:2px;">
                  <label style="font-weight:600;">Latest Occurrence driving pressure</label>
                  <input type="text" class="edit-lc-occurrence input-compact input-dark" value="${esc(occurrence)}" />
                </div>
                <div style="display:flex; gap:6px; justify-content:flex-end; margin-top:2px;">
                  <button class="lc-edit-cancel-btn" style="background:rgba(255,255,255,0.05); border:1px solid var(--border-color); color:var(--text-primary); font-size:10px; padding:3px 8px; border-radius:4px; cursor:pointer; width:auto; min-height:unset;">Cancel</button>
                  <button class="lc-edit-save-btn" style="background:rgba(16,185,129,0.15); border:1px solid rgba(16,185,129,0.3); color:#34d399; font-size:10px; padding:3px 8px; border-radius:4px; cursor:pointer; font-weight:600; width:auto; min-height:unset;">Save Changes</button>
                </div>
              </div>
            </div>
          `;
        }).join(""));

        activeList.querySelectorAll(".life-card-row").forEach(row => {
          const cardId = row.getAttribute("data-cardid")!;
          const displayDiv = row.querySelector(".life-card-display") as HTMLElement;
          const formDiv = row.querySelector(".life-card-edit-form") as HTMLElement;
          
          row.querySelector(".lc-card-edit-btn")?.addEventListener("click", () => {
            displayDiv.style.display = "none";
            formDiv.style.display = "flex";
          });

          row.querySelector(".lc-status-toggle-btn")?.addEventListener("click", async (e) => {
            e.stopPropagation();
            if (!cbs.setLifeCardStatus) return;
            const card = (state.cards || []).find(c => c.id === cardId);
            const cur = (parseLifeCardEntry(card?.value).status || "active").toLowerCase();
            const next = cur === "dormant" ? "active" : "dormant";
            const res = await cbs.setLifeCardStatus(cardId, next);
            if (res.error) showToast(res.error, true);
            else showToast(next === "dormant" ? "Relationship marked dormant." : "Relationship reactivated.");
          });

          row.querySelector(".lc-resolve-btn")?.addEventListener("click", async (e) => {
            e.stopPropagation();
            if (!cbs.setLifeCardStatus) return;
            const res = await cbs.setLifeCardStatus(cardId, "resolved");
            if (res.error) showToast(res.error, true);
            else showToast("Pressure resolved and archived (history kept).");
          });

          row.querySelector(".lc-edit-cancel-btn")?.addEventListener("click", () => {
            displayDiv.style.display = "block";
            formDiv.style.display = "none";
          });

          row.querySelector(".lc-edit-save-btn")?.addEventListener("click", async () => {
            const targetVal = (formDiv.querySelector(".edit-lc-target") as HTMLInputElement).value.trim();
            const pressureVal = (formDiv.querySelector(".edit-lc-pressure") as HTMLInputElement).value.trim();
            const momentumVal = (formDiv.querySelector(".edit-lc-momentum") as HTMLInputElement).value.trim();
            const statusVal = (formDiv.querySelector(".edit-lc-status") as HTMLSelectElement).value;
            const occurrenceVal = (formDiv.querySelector(".edit-lc-occurrence") as HTMLInputElement).value.trim();

            if (!targetVal || !pressureVal) {
              showToast("Target and Pressure are required!", true);
              return;
            }

            const btn = row.querySelector(".lc-edit-save-btn") as HTMLButtonElement;
            btn.disabled = true;
            btn.textContent = "⏳ Saving...";

            try {
              const card = (state.cards || []).find(c => c.id === cardId);
              const ownerName = card?.title ? card.title.replace(new RegExp(`^${titlePrefix}`, "i"), "").trim() : "Unknown";
              const newValue = buildLifeCardValue({ owner: ownerName, target: targetVal, pressure: pressureVal, occurrence: occurrenceVal || "none", momentum: momentumVal || "low", status: statusVal });
              if (cbs.saveCardValue) {
                const res = await cbs.saveCardValue(cardId, newValue);
                if (res.error) {
                  showToast(res.error, true);
                } else {
                  showToast("Relationship updated successfully!");
                }
              }
            } catch (err: any) {
              showToast(err?.message || String(err), true);
            } finally {
              btn.disabled = false;
              btn.textContent = "Save Changes";
            }
          });

          const delBtn = row.querySelector(".lc-card-delete-btn") as HTMLElement | null;
          if (delBtn) {
            let armTimeout: any = null;
            delBtn.addEventListener("click", async (e) => {
              e.stopPropagation();
              if (delBtn.classList.contains("armed")) {
                clearTimeout(armTimeout);
                delBtn.classList.remove("armed");
                delBtn.innerHTML = `<svg style="width:14px;height:14px;fill:currentColor;" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`;
                delBtn.setAttribute("title", "Delete Relationship Card");
                delBtn.setAttribute("style", "color:#f87171;");

                try {
                  if (cbs.deleteStoryCard) {
                    const res = await cbs.deleteStoryCard(cardId);
                    if (res.error) {
                      showToast(res.error, true);
                    } else {
                      showToast("Relationship card deleted.");
                    }
                  }
                } catch (err: any) {
                  showToast(err?.message || String(err), true);
                }
              } else {
                delBtn.classList.add("armed");
                delBtn.innerHTML = `<span style="font-size:9px;font-weight:bold;background:#ef4444;color:#fff;padding:1px 4px;border-radius:3px;display:inline-flex;align-items:center;line-height:1;">Confirm?</span>`;
                delBtn.setAttribute("title", "Click again to confirm delete");
                delBtn.setAttribute("style", "color:#ffffff;");
                
                armTimeout = setTimeout(() => {
                  delBtn.classList.remove("armed");
                  delBtn.innerHTML = `<svg style="width:14px;height:14px;fill:currentColor;" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`;
                  delBtn.setAttribute("title", "Delete Relationship Card");
                  delBtn.setAttribute("style", "color:#f87171;");
                }, 3000);
              }
            });
          }
        });
      }
    }
  }



  async function compressSettings(settings: any): Promise<string> {
    const cleanSettings = { ...settings };
    delete cleanSettings.apiKeys;
    delete cleanSettings.keyStatus;

    // Remove card commands that match the defaults
    if (cleanSettings.cardCommands) {
      const activeCommands: Record<string, string> = {};
      for (const [key, val] of Object.entries(cleanSettings.cardCommands)) {
        if (val && val !== DEFAULT_CARD_COMMANDS[key]) {
          activeCommands[key] = val as string;
        }
      }
      if (Object.keys(activeCommands).length > 0) {
        cleanSettings.cardCommands = activeCommands;
      } else {
        delete cleanSettings.cardCommands;
      }
    }

    // Remove custom prompt sections that match the defaults
    if (cleanSettings.customPromptSection1 === DEFAULT_PROMPT_SECTION_1) delete cleanSettings.customPromptSection1;
    if (cleanSettings.customPromptSection2 === DEFAULT_PROMPT_SECTION_2) delete cleanSettings.customPromptSection2;
    if (cleanSettings.customPromptSection3 === DEFAULT_PROMPT_SECTION_3) delete cleanSettings.customPromptSection3;
    if (cleanSettings.customPromptSection4 === DEFAULT_PROMPT_SECTION_4) delete cleanSettings.customPromptSection4;

    // Remove other settings if they match default values
    if (cleanSettings.theme === "emerald") delete cleanSettings.theme;
    if (cleanSettings.formattingMode === DEFAULT_FORMATTING_MODE) delete cleanSettings.formattingMode;
    if (cleanSettings.analyzeWindow === 20) delete cleanSettings.analyzeWindow;
    if (cleanSettings.memoraidThoughtLookback === 1) delete cleanSettings.memoraidThoughtLookback;
    if (cleanSettings.memoraidPresenceLookback === 5) delete cleanSettings.memoraidPresenceLookback;
    if (cleanSettings.thoughtCardLimit === 2000) delete cleanSettings.thoughtCardLimit;
    if (cleanSettings.interceptTimeout === 4) delete cleanSettings.interceptTimeout;
    if (cleanSettings.locationMode === "optionA") delete cleanSettings.locationMode;
    if (cleanSettings.enableProperNounDetection !== false) delete cleanSettings.enableProperNounDetection;
    if (!cleanSettings.enableAutomaticUpdates) delete cleanSettings.enableAutomaticUpdates;
    if (cleanSettings.showDebug === false) delete cleanSettings.showDebug;
    if (cleanSettings.useMemories === false) delete cleanSettings.useMemories;
    if (cleanSettings.autoRegenerateMemoryBankEntry === false) delete cleanSettings.autoRegenerateMemoryBankEntry;

    const jsonStr = JSON.stringify(cleanSettings);
    try {
      if (typeof CompressionStream !== "undefined") {
        const stream = new Blob([jsonStr]).stream().pipeThrough(new CompressionStream("gzip"));
        const response = new Response(stream);
        const buffer = await response.arrayBuffer();
        
        let binary = "";
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i]!);
        }
        return "gz:" + btoa(binary);
      }
    } catch (err) {
      console.warn("[AID panel] Gzip compression failed, falling back to raw base64:", err);
    }
    return "raw:" + btoa(unescape(encodeURIComponent(jsonStr)));
  }

  // Practical scan-reliability ceiling: past this many chars in the rendered URL, the QR
  // packs so many modules into the fixed on-screen size that phone cameras routinely fail to
  // resolve it. Skip the doomed render and offer the copy-string fallback instead.
  const QR_PAYLOAD_CHAR_THRESHOLD = 1500;

  function showQrModal(payload: string) {
    root.getElementById("qr-modal")?.remove();

    const modal = document.createElement("div");
    modal.id = "qr-modal";
    const activeTheme = lastState?.settings?.theme || "emerald";
    modal.className = `theme-${activeTheme}`;
    modal.style.cssText = "display:flex;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.65);align-items:center;justify-content:center;z-index:10000;backdrop-filter:blur(4px);box-sizing:border-box;";

    const container = document.createElement("div");
    container.style.cssText = "background:var(--bg-panel-solid);border:1px solid var(--border-color);border-radius:12px;padding:20px;width:280px;display:flex;flex-direction:column;align-items:center;gap:12px;box-shadow:0 20px 40px rgba(0,0,0,0.5);text-align:center;color:var(--text-primary);box-sizing:border-box;";

    const title = document.createElement("div");
    title.style.cssText = "font-weight:700;color:var(--theme-text-color);font-size:14px;letter-spacing:0.02em;";
    title.textContent = "Sync Settings to Mobile";

    const note = document.createElement("div");
    note.className = "note";
    note.style.cssText = "margin:0;font-size:11px;line-height:1.4;color:var(--text-secondary);";

    const qrUrl = window.location.origin + "/?importSettings=" + encodeURIComponent(payload);
    const tooLarge = qrUrl.length > QR_PAYLOAD_CHAR_THRESHOLD;

    // Copy-string fallback: always available (primary action when the QR is skipped, secondary
    // option alongside a rendered QR otherwise). There is no paste-based importer in the panel —
    // import only fires from the `?importSettings=` URL param on page load (see
    // checkAndImportQrSettings in content.ts) — so the copied string is the full import URL, meant
    // to be pasted into the mobile browser's address bar.
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "btn";
    copyBtn.style.cssText = "background:rgba(255,255,255,0.08);color:var(--text-primary);font-weight:600;font-size:11px;padding:6px 16px;border-radius:6px;border:1px solid var(--border-color);cursor:pointer;width:100%;text-align:center;";
    copyBtn.textContent = "📋 Copy Sync String";

    const copyFallback = document.createElement("textarea");
    copyFallback.readOnly = true;
    copyFallback.value = qrUrl;
    copyFallback.style.cssText = "display:none;width:100%;height:64px;font-size:9px;font-family:SFMono-Regular,Consolas,monospace;background:rgba(0,0,0,0.3);color:var(--text-primary);border:1px solid var(--border-color);border-radius:6px;padding:6px;box-sizing:border-box;resize:none;";

    copyBtn.addEventListener("click", () => {
      const flashCopied = () => {
        const oldText = copyBtn.textContent;
        copyBtn.textContent = "Copied!";
        setTimeout(() => { copyBtn.textContent = oldText; }, 1500);
      };
      const showFallback = () => {
        copyFallback.style.display = "block";
        copyFallback.focus();
        copyFallback.select();
      };
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(qrUrl).then(flashCopied).catch(showFallback);
      } else {
        showFallback();
      }
    });

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "btn";
    closeBtn.style.cssText = "background:var(--accent-color);color:#fff;font-weight:600;font-size:11px;padding:6px 16px;border-radius:6px;border:none;cursor:pointer;margin-top:4px;width:100%;text-align:center;";
    closeBtn.textContent = "Close";

    container.appendChild(title);

    if (tooLarge) {
      note.textContent = "Settings too large for a reliable QR — copy the sync string instead. Paste the copied link into your mobile browser's address bar (with the extension installed) to import.";
      container.appendChild(note);
      container.appendChild(copyBtn);
      container.appendChild(copyFallback);
    } else {
      note.textContent = "Scan this code with your mobile device's camera to import settings (excluding API keys).";
      container.appendChild(note);

      const canvasContainer = document.createElement("div");
      canvasContainer.id = "qr-canvas-container";
      canvasContainer.style.cssText = "background:#fff;padding:8px;border-radius:8px;display:flex;align-items:center;justify-content:center;box-sizing:border-box;width:180px;height:180px;";
      container.appendChild(canvasContainer);

      try {
        // Fixed near-black on white regardless of theme — theme-accent colors (e.g. cyan) render
        // as low-contrast modules that phone cameras struggle to decode. `quiet: 4` guarantees a
        // >=4-module quiet zone in QR-native units (the surrounding #fff padding adds more on top).
        QrCreator.render({
          text: qrUrl,
          radius: 0.2,
          ecLevel: "M",
          fill: "#111111",
          background: "#ffffff",
          size: 164,
          quiet: 4
        }, canvasContainer);
      } catch (err: any) {
        console.error("[AID panel] QrCreator failed to render:", err);
        canvasContainer.style.background = "#fee2e2";
        canvasContainer.style.color = "#991b1b";
        canvasContainer.style.flexDirection = "column";
        canvasContainer.style.fontSize = "10px";
        canvasContainer.style.padding = "12px";
        canvasContainer.textContent = "QR Code generation failed. The settings payload may be too large. Try resetting some templates to default.";
      }

      const copyCaption = document.createElement("div");
      copyCaption.style.cssText = "font-size:10px;color:var(--text-secondary);";
      copyCaption.textContent = "Can't scan? Copy the sync string instead — paste the link into your mobile browser's address bar.";
      container.appendChild(copyCaption);
      container.appendChild(copyBtn);
      container.appendChild(copyFallback);
    }

    container.appendChild(closeBtn);
    modal.appendChild(container);
    root.appendChild(modal);

    const closeModal = () => modal.remove();
    closeBtn.addEventListener("click", closeModal);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });
  }

  const panelHandle: PanelHandle = {
    setStatus: (t) => { st.textContent = t; },
    showToast: (text, isError) => {
      if (!isContextValid()) return;
      showToast(text, isError);
    },
    onExport: (cb) => {
      const safe = safeCallback(cb);
      $("ex-story").addEventListener("click", () => safe("story"));
      $("ex-cards").addEventListener("click", () => safe("cards"));
      $("ex-pe").addEventListener("click", () => safe("pe"));
      $("ex-aidmemories").addEventListener("click", () => safe("aidmemories"));
      $("ex-propernouns")?.addEventListener("click", () => safe("propernouns"));
      $("ex-all").addEventListener("click", () => safe("all"));
    },
    // Delegated by class so every entry point works, including dynamically re-rendered ones
    // (Debug tab, Adventures Manager header, and the empty-DB self-heal banner).
    onBackupAll: (cb) => {
      const safe = safeCallback(cb);
      root.addEventListener("click", (e) => {
        if ((e.target as HTMLElement)?.closest?.(".db-backup-trigger")) safe();
      });
    },
    onRestoreAll: (cb) => {
      const safe = safeCallback(cb);
      root.addEventListener("click", (e) => {
        if ((e.target as HTMLElement)?.closest?.(".db-restore-trigger")) safe();
      });
    },
    showSelfHealBanner: () => {
      if (!isContextValid()) return;
      const results = root.getElementById("results");
      if (!results || root.getElementById("self-heal-banner")) return;
      const banner = document.createElement("div");
      banner.id = "self-heal-banner";
      banner.setAttribute("style", "margin:8px;padding:10px 12px;background:rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.35);border-radius:8px;color:var(--text-primary);font-size:11.5px;line-height:1.5;");
      setSafeHTML(banner, `<strong>No local data found.</strong> If you just swapped the signed extension for a test build, Firefox cleared its IndexedDB.<br/><button class="db-restore-trigger" style="margin-top:8px;padding:5px 10px;background:rgba(245,158,11,0.22);color:#fbbf24;border:1px solid rgba(245,158,11,0.4);border-radius:6px;cursor:pointer;font-weight:bold;">⬆ Restore from Backup…</button>`);
      // Sibling of #results (not inside it) so it survives render() rebuilds.
      results.parentElement?.insertBefore(banner, results);
    },
    onBackfill: (cb) => ($("bf")).addEventListener("click", safeCallback(cb)),
    onRefineMemoryBlock: (cb) => {
      refineMemoryBlockCb = safeCallback(cb);
      $("refine-mem")?.addEventListener("click", () => {
        const btn = $("refine-mem") as HTMLButtonElement;
        if (btn) {
          btn.disabled = true;
          btn.textContent = "Regenerating memory...";
        }
        if (refineMemoryBlockCb && lastState?.aidMemories && lastState.aidMemories.length > 0) {
          refineMemoryBlockCb(lastState.aidMemories.length - 1);
        }
      });
    },
    showAnalyzeResult: showAnalyzeResultFn,
    onSaveSettings: (cb) => {
      const safe = safeCallback(cb);
      ($("save")).addEventListener("click", () => {
        const n = parseInt(winEl.value, 10);
        const showDbg = (root.getElementById("show-dbg") as HTMLInputElement).checked;
        const useMems = (root.getElementById("use-memories") as HTMLInputElement).checked;
        const autoRegenMems = (root.getElementById("auto-regen-memories") as HTMLInputElement).checked;
        const cardCommands: Record<string, string> = {};
        for (const k of TYPE_KEYS) {
          const el = root.getElementById("cc-" + k) as HTMLTextAreaElement | null;
          const v = el?.value.trim();
          if (v) cardCommands[k] = v;
        }
        const fmtMode = (root.getElementById("fmt-mode") as HTMLSelectElement | null)?.value || DEFAULT_FORMATTING_MODE;
        const mtl = parseInt(memoraidThoughtWinEl.value, 10);
        const mpl = parseInt(memoraidPresenceWinEl.value, 10);
        const to = parseInt(interceptTimeoutEl.value, 10);
        const memoraidThoughtLookback = Number.isFinite(mtl) && mtl >= 1 ? mtl : 1;
        const memoraidPresenceLookback = Number.isFinite(mpl) && mpl > 0 ? mpl : 5;
        const interceptTimeout = Number.isFinite(to) && to > 0 ? to : 4;
        const locMode = (root.getElementById("location-mode") as HTMLSelectElement).value;
        const properNounDetect = (root.getElementById("enable-proper-noun-detection") as HTMLInputElement).checked;
        const enableAutomaticUpdates = (root.getElementById("enable-automatic-updates") as HTMLInputElement).checked;
        const enableMemoraid = (root.getElementById("enable-memoraid") as HTMLInputElement | null)?.checked ?? true;
        const enableCrystallized = (root.getElementById("enable-crystallized") as HTMLInputElement | null)?.checked ?? false;
        const cVal = parseInt((root.getElementById("crystallized-interval") as HTMLInputElement | null)?.value || "", 10);
        const crystallizedInterval = Number.isFinite(cVal) && cVal > 0 ? cVal : 20;
        const mcVal = parseInt((root.getElementById("crystallized-max-chars") as HTMLInputElement | null)?.value || "", 10);
        const crystallizedEntryMaxChars = Number.isFinite(mcVal) && mcVal > 0 ? mcVal : 900;
        const ncVal = parseInt((root.getElementById("crystallized-node-cap") as HTMLInputElement | null)?.value || "", 10);
        const crystallizedNodeCap = Number.isFinite(ncVal) && ncVal > 0 ? ncVal : 12;
        const kcVal = parseInt((root.getElementById("crystallized-knows-cap") as HTMLInputElement | null)?.value || "", 10);
        const crystallizedKnowsCap = Number.isFinite(kcVal) && kcVal > 0 ? kcVal : 2;
        const rcVal = parseInt((root.getElementById("crystallized-recalls-cap") as HTMLInputElement | null)?.value || "", 10);
        const crystallizedRecallsCap = Number.isFinite(rcVal) && rcVal >= 0 ? rcVal : 2;
        const vcVal = parseInt((root.getElementById("crystallized-vivid-cap") as HTMLInputElement | null)?.value || "", 10);
        const crystallizedVividCap = Number.isFinite(vcVal) && vcVal > 0 ? vcVal : 4;
        const ocVal = parseInt((root.getElementById("crystallized-outlook-cap") as HTMLInputElement | null)?.value || "", 10);
        const crystallizedOutlookCap = Number.isFinite(ocVal) && ocVal > 0 ? ocVal : 2;
        const pcVal = parseInt((root.getElementById("crystallized-preferences-cap") as HTMLInputElement | null)?.value || "", 10);
        const crystallizedPreferencesCap = Number.isFinite(pcVal) && pcVal > 0 ? pcVal : 4;
        const nmVal = parseInt((root.getElementById("crystallized-npc-memory-cap") as HTMLInputElement | null)?.value || "", 10);
        const crystallizedNpcMemoryCap = Number.isFinite(nmVal) && nmVal > 0 ? nmVal : 400;
        // Per-pass LLM enable flags (default on / opt-out).
        const crystallizedKnowsEnabled = (root.getElementById("crystallized-knows-enabled") as HTMLInputElement | null)?.checked ?? true;
        const crystallizedNodesEnabled = (root.getElementById("crystallized-nodes-enabled") as HTMLInputElement | null)?.checked ?? true;
        const crystallizedOutlookEnabled = (root.getElementById("crystallized-outlook-enabled") as HTMLInputElement | null)?.checked ?? true;
        const crystallizedPreferencesEnabled = (root.getElementById("crystallized-preferences-enabled") as HTMLInputElement | null)?.checked ?? true;
        const crystallizedNpcMemoryEnabled = (root.getElementById("crystallized-npc-memory-enabled") as HTMLInputElement | null)?.checked ?? true;
        const tcl = parseInt(thoughtCardLimitEl.value, 10);
        const thoughtCardLimit = Number.isFinite(tcl) && tcl >= 100 ? tcl : 2000;

        const settings: Settings = {
          provider: provEl.value as Settings["provider"],
          model: modelEl.value.trim() || undefined,
          analyzeWindow: Number.isFinite(n) && n > 0 ? n : 20,
          showDebug: showDbg,
          theme: themeEl.value,
          customPromptSection1: (root.getElementById("prompt-s1") as HTMLTextAreaElement).value,
          customPromptSection2: (root.getElementById("prompt-s2") as HTMLTextAreaElement).value,
          customPromptSection3: (root.getElementById("prompt-s3") as HTMLTextAreaElement).value,
          customPromptSection4: (root.getElementById("prompt-s4") as HTMLTextAreaElement).value,
          cardCommands,
          useMemories: useMems,
          formattingMode: fmtMode,
          memoraidThoughtLookback,
          memoraidPresenceLookback,
          thoughtCardLimit,
          autoRegenerateMemoryBankEntry: autoRegenMems,
          interceptTimeout,
          locationMode: locMode as Settings["locationMode"],
          enableProperNounDetection: properNounDetect,
          enableAutomaticUpdates,
          enableMemorAID: enableMemoraid,
          enableLivingCharacters: enableLcEl.checked,
          livingCharactersTitlePrefix: lcTitlePrefixEl.value,
          livingCharactersKeyPrefix: lcKeyPrefixEl.value,
          groupThoughtsInRoster: groupThoughtsEl.checked,
          enableCrystallized,
          crystallizedInterval,
          crystallizedEntryMaxChars,
          crystallizedNodeCap,
          crystallizedKnowsCap,
          crystallizedRecallsCap,
          crystallizedVividCap,
          crystallizedOutlookCap,
          crystallizedPreferencesCap,
          crystallizedNpcMemoryCap,
          crystallizedKnowsEnabled,
          crystallizedNodesEnabled,
          crystallizedOutlookEnabled,
          crystallizedPreferencesEnabled,
          crystallizedNpcMemoryEnabled,
        };

        const apiKey = keyEl.value.trim();
        if (apiKey) {
          settings.apiKeys = { [provEl.value]: apiKey };
        }

        safe(settings, protEl.value.trim());
        showTrackerView();
      });

      const lcSaveBtn = root.getElementById("lc-btn-save-config");
      if (lcSaveBtn) {
        lcSaveBtn.addEventListener("click", () => {
          if (!lastState || !lastState.settings) return;
          
          const rosterEl = root.getElementById("lc-config-roster") as HTMLTextAreaElement | null;
          const pressuresEl = root.getElementById("lc-config-pressures") as HTMLTextAreaElement | null;
          const protagonistEl = root.getElementById("lc-config-protagonist") as HTMLInputElement | null;
          const involvementEl = root.getElementById("lc-config-involvement") as HTMLSelectElement | null;
          const intervalEl = root.getElementById("lc-config-interval") as HTMLInputElement | null;
          const maxEl = root.getElementById("lc-config-max") as HTMLSelectElement | null;
          const relevanceEl = root.getElementById("lc-config-relevance") as HTMLSelectElement | null;
          const dormancyEl = root.getElementById("lc-config-dormancy") as HTMLInputElement | null;
          const reseedEl = root.getElementById("lc-config-reseed-cooldown") as HTMLInputElement | null;
          const staleEl = root.getElementById("lc-config-stale") as HTMLInputElement | null;
          const maxLifetimeEl = root.getElementById("lc-config-max-lifetime") as HTMLInputElement | null;

          const nInterval = intervalEl ? parseInt(intervalEl.value, 10) : 15;
          const nMax = maxEl ? parseInt(maxEl.value, 10) : 2;
          const nDormancy = dormancyEl ? parseInt(dormancyEl.value, 10) : 7;
          const nReseed = reseedEl ? parseInt(reseedEl.value, 10) : 15;
          const nStale = staleEl ? parseInt(staleEl.value, 10) : 14;
          const nMaxLifetime = maxLifetimeEl ? parseInt(maxLifetimeEl.value, 10) : 4;

          // Collect the pairing pools (rows with both characters + at least one pressure are kept).
          const pairingContainerSave = root.getElementById("lc-pairing-pools");
          const pressurePairs = pairingContainerSave
            ? Array.from(pairingContainerSave.querySelectorAll(".lc-pairing-row")).map(row => ({
                a: (row.querySelector(".lc-pair-a") as HTMLInputElement | null)?.value.trim() || "",
                b: (row.querySelector(".lc-pair-b") as HTMLInputElement | null)?.value.trim() || "",
                pressures: ((row.querySelector(".lc-pair-pressures") as HTMLInputElement | null)?.value || "")
                  .split(",").map(s => s.trim()).filter(Boolean),
              })).filter(p => p.a && p.b && p.pressures.length)
            : [];

          // Per-adventure simulation config.
          const config = {
            roster: rosterEl ? rosterEl.value.trim() : "",
            pressures: pressuresEl ? pressuresEl.value.trim() : "",
            pressurePairs,
            protagonistInvolvement: involvementEl ? (involvementEl.value as LivingConfig["protagonistInvolvement"]) : "normal",
            interval: Number.isFinite(nInterval) ? nInterval : 15,
            maxActive: Number.isFinite(nMax) ? nMax : 2,
            sceneRelevance: relevanceEl ? (relevanceEl.value as LivingConfig["sceneRelevance"]) : "strict",
            dormancyTurns: Number.isFinite(nDormancy) ? nDormancy : 7,
            reseedCooldown: Number.isFinite(nReseed) ? nReseed : 15,
            staleTurns: Number.isFinite(nStale) ? nStale : 14,
            maxActiveTurns: Number.isFinite(nMaxLifetime) && nMaxLifetime >= 0 ? nMaxLifetime : 4,
            continueInjectionMode: ((root.getElementById("lc-config-continue-mode") as HTMLSelectElement | null)?.value as LivingConfig["continueInjectionMode"]) || "defer",
          };
          const protName = protagonistEl ? protagonistEl.value.trim() : "";

          if (cbs.setLivingConfig) {
            cbs.setLivingConfig(config, protName).then((res) => {
              if (res?.error) showToast(res.error, true); else showToast("Simulation config saved!");
            }).catch((err: any) => showToast(err?.message || String(err), true));
          }
        });
      }
    },
    onGrantPermissions: (cb) => {
      $("grant-permissions")?.addEventListener("click", safeCallback(cb));
    },
    on: registerPanelEvent,
    onRefresh: (cb) => { refreshCb = safeCallback(cb); },
    updateActionCount: (count, lastAnalysisAction) => {
      // Keep lastState coherent so later full renders / handlers see the fresh counts.
      if (lastState) {
        lastState.actionCount = count;
        lastState.actionsCount = count;
        if (lastAnalysisAction !== undefined) lastState.lastAnalysisAction = lastAnalysisAction;
      }
      const statTurn = root.getElementById("stat-turn");
      if (statTurn) statTurn.textContent = String(count);
      const lastAn = (lastAnalysisAction ?? lastState?.lastAnalysisAction) ?? 0;
      const statSince = root.getElementById("stat-since");
      if (statSince) statSince.textContent = lastAn > 0 ? String(count - lastAn) : "-";
    },
    updateMemories: (memories) => {
      if (!lastState) return; // nothing mounted yet — the first full render will include them
      lastState.aidMemories = memories ?? [];
      renderMemoriesSection(lastState);
    },

    setModels: (models, current) => {
      const opts = [...models];
      if (current && !opts.includes(current)) opts.unshift(current);
      setSafeHTML(modelEl, opts.length
        ? opts.map((m) => `<option value="${esc(m)}"${m === current ? " selected" : ""}>${esc(m)}</option>`).join("")
        : `<option value="">(enter API key, then reopen settings)</option>`);
      if (current) modelEl.value = current;
    },
    showDebug: (d) => {
      lastDebug = d;
      const dbgContainer = root.getElementById("debug-container");
      if (dbgContainer) {
        if (d) {
          setSafeHTML(dbgContainer, `<details open style="margin-top:8px;border-top:1px solid #333;padding-top:4px;"><summary style="cursor:pointer;color:#8a8;">🔍 Analyze debug</summary>` +
            `<div class="note">characters: ${esc((d.characters || []).join(", "))}</div>` +
            `<div class="note">narrative chars: ${esc(String(d.narrativeChars))}</div>` +
            `<div class="note">narrative tail:</div><div>${esc(d.narrativeTail || "")}</div>` +
            `<div class="note">raw response (truncated):</div><div>${esc(d.rawSnippet || "")}</div></details>`);
        } else {
          dbgContainer.textContent = "";
        }
      }
    },
    render: (state) => {
      // Update lastState FIRST: the code below (switchTab → renderAdventuresManager, and the
      // manager trigger) reads the module-level `lastState` to repaint the DB explorer. If it's
      // still the PREVIOUS state, those re-renders use stale data and clobber the fresh render —
      // that's why hidden/restored adventures didn't update live (switchTab at the bottom of this
      // function re-rendered the explorer from the old `lastState`). Keep the previous state in
      // `prevState` for change-detection only.
      const prevState = lastState;
      lastState = state;

      // Render active setup question widget if present
      if (state.activeSetupQuestion) {
        setupHelperContainer.style.display = "block";
        const q = state.activeSetupQuestion;
        
        // Preserve open/collapsed drawer state
        const prevDrawer = setupHelperContainer.querySelector(".setup-helper-drawer") as HTMLDetailsElement | null;
        const wasOpen = prevDrawer ? prevDrawer.open : true;

        // Preserve search input value and focus
        const searchInput = setupHelperContainer.querySelector("#setup-favorites-search") as HTMLInputElement | null;
        const searchVal = searchInput ? searchInput.value : "";
        const activeEl = root.activeElement;
        const wasSearchFocused = activeEl && activeEl.id === "setup-favorites-search";

        // Query existing list element to preserve details drawer open states
        const listEl = setupHelperContainer.querySelector("#setup-favorites-list") as HTMLElement | null;

        setSafeHTML(setupHelperContainer, `
          <details class="group-header setup-helper-drawer" ${wasOpen ? "open" : ""} style="--accent-color:#c084fc; --accent-glow:rgba(168,85,247,0.15); border-left-color:#c084fc !important; margin-bottom:8px;">
            <summary style="color:#c084fc !important; font-weight:700;">
              <span>🔮 Scenario Setup: ${q.type === "text" ? "Text Input" : "Multiple Choice"}</span>
            </summary>
            <div style="padding:10px 12px; display:flex; flex-direction:column; gap:8px; box-sizing:border-box; width:100%; background:rgba(168,85,247,0.02); border-top:1px solid rgba(168,85,247,0.15);">
              <div style="font-size:11.5px; line-height:1.45; color:var(--text-primary); font-weight:500; word-break:break-word; max-height:80px; overflow-y:auto; border-left:2px solid rgba(168,85,247,0.3); padding-left:8px; margin-bottom:4px;">
                ${esc(q.question)}
              </div>
              
              ${q.type === "text" ? `
                <div style="position:relative; margin-top:2px;">
                  <input type="text" id="setup-favorites-search" placeholder="Search Favorites..." value="${esc(searchVal)}" style="width:100%; margin:0; padding:5px 8px; font-size:11px; background:rgba(0,0,0,0.3); color:var(--text-primary); border-radius:6px; border:1px solid rgba(255,255,255,0.08); box-sizing:border-box; font-family:inherit;" />
                </div>
                <div id="setup-favorites-list" style="margin-top:4px; padding-right:4px;">
                  ${renderSetupFavorites(state.globalAssets || [], searchVal, q.question, listEl || undefined)}
                </div>
              ` : `
                <div style="font-size:10px; color:var(--text-secondary); font-style:italic;">
                  Select one of the numbered options on the page to proceed.
                </div>
              `}
            </div>
          </details>
        `);

        // Restore focus and cursor position if search was active
        if (wasSearchFocused) {
          const newSearch = root.getElementById("setup-favorites-search") as HTMLInputElement | null;
          if (newSearch) {
            newSearch.focus();
            newSearch.setSelectionRange(searchVal.length, searchVal.length);
          }
        }
      } else {
        setupHelperContainer.style.display = "none";
        setupHelperContainer.innerHTML = "";
      }

      // Setup phase: while a scenario-setup question is active — or the brand-new adventure
      // still has fewer than 2 actions — collapse the Card Manager down to just the Scenario
      // Setup widget. The tab nav, location banners and tracker roster only reappear once setup
      // is complete and the story has reached 2+ actions.
      const setupActionCount = state.actionCount ?? state.actionsCount ?? 0;
      const inSetupPhase = isSetupPhase({
        isManagerOnly: !!state.isManagerOnly,
        hasActiveSetupQuestion: !!state.activeSetupQuestion,
        actionCount: setupActionCount,
      });
      const mainTabNav = viewTracker.querySelector(".main-tab-nav") as HTMLElement | null;
      const locationBanners = root.getElementById("location-banners-container");
      const trackerScrollable = root.getElementById("view-tracker-scrollable");
      const mainTabTracker = root.getElementById("main-tab-tracker");
      if (mainTabNav) mainTabNav.style.display = inSetupPhase ? "none" : "";
      if (locationBanners) locationBanners.style.display = inSetupPhase ? "none" : "";
      if (trackerScrollable) trackerScrollable.style.display = inSetupPhase ? "none" : "";
      // During setup the only visible child of the tracker pane is the (tall) setup widget. Let
      // the pane itself scroll — it's a plain flex div whose height resolves cleanly from the box,
      // unlike the <details>-nested favorites list (a <details> won't propagate a definite height
      // to flex children, which is why an inner overflow-y:auto/max-height there silently fails).
      if (mainTabTracker) mainTabTracker.style.overflowY = inSetupPhase ? "auto" : "";
      // The Scenario Setup widget (Favorited Plot Essentials / character picker) lives inside the
      // tracker pane. Since the Home tab became the default active main-tab pane, a brand-new
      // scenario lands on Home and the widget would stay buried in the display:none tracker pane —
      // so during setup we force the tracker pane visible, then hand control back to the user's
      // active tab once setup ends. The tab nav is hidden above during setup, so this can't fight a
      // user tab switch. (Skipped in manager-only mode, where viewTracker itself is hidden.)
      if (!state.isManagerOnly) {
        const targetPane = visibleMainTabPane(inSetupPhase, activeTabId);
        root.querySelectorAll(".main-tab-pane").forEach((p) => {
          (p as HTMLElement).style.display = p.id === targetPane ? "flex" : "none";
        });
      }

      // Adventures Manager rendering trigger
      const tabManagerPane = root.getElementById("tab-manager");
      if (tabManagerPane && (tabManagerPane.style.display === "block" || tabManagerPane.style.display === "flex" || state.isManagerOnly)) {
        renderAdventuresManager(state);
      }
      
      const isManagerOnly = !!state.isManagerOnly;
      if (isManagerOnly) {
        viewTracker.style.display = "none";
        viewSettings.style.display = "flex";
        viewAnalyze.style.display = "none";
        
        // Hide settings tab navigation and footer in manager-only mode
        const tabNav = viewSettings.querySelector(".tab-nav") as HTMLElement | null;
        if (tabNav) tabNav.style.display = "none";
        const footer = root.getElementById("settings-footer");
        if (footer) footer.style.display = "none";
        
        // Hide all other panes in viewSettings
        viewSettings.querySelectorAll(".tab-pane").forEach(pane => {
          if (pane.id !== "tab-manager") {
            (pane as HTMLElement).style.display = "none";
          }
        });
        
        if (tabManagerPane) tabManagerPane.style.display = "flex";
      } else {
        const tabNav = viewSettings.querySelector(".tab-nav") as HTMLElement | null;
        if (tabNav) tabNav.style.display = "flex";
        const footer = root.getElementById("settings-footer");
        if (footer) footer.style.display = "flex";
        
        // Restore active settings tab visibility
        const activeBtn = viewSettings.querySelector(".tab-btn.active") as HTMLElement | null;
        const currentActiveTab = activeBtn?.getAttribute("data-tab");
        if (currentActiveTab) {
          switchTab(currentActiveTab);
        }

        // Transitioning from manager-only view to gameplay view: switch back to the tracker view
        if (prevState && prevState.isManagerOnly && !isManagerOnly) {
          showTrackerView();
        }
      }

      const isShortIdChanged = !prevState || state.shortId !== prevState.shortId;
      if (state.scenario !== prevState?.scenario || state.protagonist !== prevState?.protagonist) {
        knownMemories.clear();
      }
      // Window title: "AID Story Helper: <Scenario> - <Protagonist>"
      const titleTail = [state.scenario, state.protagonist].filter(Boolean).join(" - ");
      st.textContent = titleTail ? `AID Story Helper: ${titleTail}` : "AID Story Helper";
      if (isShortIdChanged) {
        protEl.value = state.protagonist || "";
      } else if (document.activeElement !== protEl) {
        protEl.value = state.protagonist || "";
      }
      const shouldForceUpdate = isShortIdChanged || !prevState;

      if (state.settings?.theme && (shouldForceUpdate || root.activeElement !== themeEl) && themeEl.value !== state.settings.theme) {
        themeEl.value = state.settings.theme;
        updateThemeClass();
      }
      if (state.settings?.provider && (shouldForceUpdate || root.activeElement !== provEl) && provEl.value !== state.settings.provider) {
        provEl.value = state.settings.provider;
        updateProviderLabels();
      }
      
      const prov = provEl.value;
      if (state.settings?.keyStatus?.[prov] && !keyEl.value) {
        keyEl.placeholder = "•••• (key saved)";
      } else if (!keyEl.value) {
        updateProviderLabels();
      }

      if (state.settings?.analyzeWindow && (!winEl.value || shouldForceUpdate || root.activeElement !== winEl)) {
        winEl.value = String(state.settings.analyzeWindow);
      }
      if (state.settings && (!memoraidThoughtWinEl.value || shouldForceUpdate || root.activeElement !== memoraidThoughtWinEl)) {
        memoraidThoughtWinEl.value = String(Math.max(1, state.settings.memoraidThoughtLookback ?? 1));
      }
      if (state.settings && (!memoraidPresenceWinEl.value || shouldForceUpdate || root.activeElement !== memoraidPresenceWinEl)) {
        memoraidPresenceWinEl.value = String(state.settings.memoraidPresenceLookback ?? 5);
      }
      if (state.settings && (!interceptTimeoutEl.value || shouldForceUpdate || root.activeElement !== interceptTimeoutEl)) {
        interceptTimeoutEl.value = String(state.settings.interceptTimeout ?? 4);
      }
      const locModeEl = root.getElementById("location-mode") as HTMLSelectElement;
      if (locModeEl && state.settings && (shouldForceUpdate || root.activeElement !== locModeEl)) {
        locModeEl.value = state.settings.locationMode || "optionA";
      }
      const properNounDetectEl = root.getElementById("enable-proper-noun-detection") as HTMLInputElement;
      if (properNounDetectEl && state.settings && (shouldForceUpdate || root.activeElement !== properNounDetectEl)) {
        properNounDetectEl.checked = state.settings.enableProperNounDetection !== false; // opt-out: checked unless explicitly disabled
      }
      const autoUpdatesEl = root.getElementById("enable-automatic-updates") as HTMLInputElement;
      if (autoUpdatesEl && state.settings && (shouldForceUpdate || root.activeElement !== autoUpdatesEl)) {
        autoUpdatesEl.checked = !!state.settings.enableAutomaticUpdates;
      }
      const showDbgEl = root.getElementById("show-dbg") as HTMLInputElement;
      if (showDbgEl && state.settings && (shouldForceUpdate || root.activeElement !== showDbgEl)) {
        showDbgEl.checked = !!state.settings.showDebug;
      }
      const useMemsEl = root.getElementById("use-memories") as HTMLInputElement;
      if (useMemsEl && state.settings && (shouldForceUpdate || root.activeElement !== useMemsEl)) {
        useMemsEl.checked = !!state.settings.useMemories;
      }
      const autoRegenMemsEl = root.getElementById("auto-regen-memories") as HTMLInputElement;
      if (autoRegenMemsEl && state.settings && (shouldForceUpdate || root.activeElement !== autoRegenMemsEl)) {
        autoRegenMemsEl.checked = !!state.settings.autoRegenerateMemoryBankEntry;
      }
      if (enableLcEl && state.settings && (shouldForceUpdate || root.activeElement !== enableLcEl)) {
        enableLcEl.checked = state.settings.enableLivingCharacters !== false;
      }
      if (lcTitlePrefixEl && state.settings && (shouldForceUpdate || root.activeElement !== lcTitlePrefixEl)) {
        lcTitlePrefixEl.value = state.settings.livingCharactersTitlePrefix ?? "Life - ";
      }
      if (lcKeyPrefixEl && state.settings && (shouldForceUpdate || root.activeElement !== lcKeyPrefixEl)) {
        lcKeyPrefixEl.value = state.settings.livingCharactersKeyPrefix ?? "chaos-v2:";
      }
      if (groupThoughtsEl && state.settings && (shouldForceUpdate || root.activeElement !== groupThoughtsEl)) {
        groupThoughtsEl.checked = !!state.settings.groupThoughtsInRoster;
      }
      // Dummy inputs for screenshot purposes
      if (charCardLimitEl && (!charCardLimitEl.value || shouldForceUpdate || root.activeElement !== charCardLimitEl)) {
        charCardLimitEl.value = "600";
      }
      if (memoraidWinEl && (!memoraidWinEl.value || shouldForceUpdate || root.activeElement !== memoraidWinEl)) {
        memoraidWinEl.value = "8";
      }
      if (thoughtCardLimitEl && state.settings && (shouldForceUpdate || root.activeElement !== thoughtCardLimitEl) && thoughtCardLimitEl.value !== String(state.settings.thoughtCardLimit ?? 2000)) {
        thoughtCardLimitEl.value = String(state.settings.thoughtCardLimit ?? 2000);
      }

      const enableMemoraidEl = root.getElementById("enable-memoraid") as HTMLInputElement | null;
      if (enableMemoraidEl) enableMemoraidEl.checked = state.settings?.enableMemorAID !== false;

      const enableCrystallizedEl = root.getElementById("enable-crystallized") as HTMLInputElement | null;
      if (enableCrystallizedEl) enableCrystallizedEl.checked = !!state.settings?.enableCrystallized;
      if (crystallizedIntervalEl && (shouldForceUpdate || root.activeElement !== crystallizedIntervalEl)) {
        crystallizedIntervalEl.value = String(state.settings?.crystallizedInterval ?? 20);
      }
      if (crystallizedEntryMaxCharsEl && (shouldForceUpdate || root.activeElement !== crystallizedEntryMaxCharsEl)) {
        crystallizedEntryMaxCharsEl.value = String(state.settings?.crystallizedEntryMaxChars ?? 900);
      }
      if (crystallizedNodeCapEl && (shouldForceUpdate || root.activeElement !== crystallizedNodeCapEl)) {
        crystallizedNodeCapEl.value = String(state.settings?.crystallizedNodeCap ?? 12);
      }
      if (crystallizedKnowsCapEl && (shouldForceUpdate || root.activeElement !== crystallizedKnowsCapEl)) {
        crystallizedKnowsCapEl.value = String(state.settings?.crystallizedKnowsCap ?? 2);
      }
      if (crystallizedRecallsCapEl && (shouldForceUpdate || root.activeElement !== crystallizedRecallsCapEl)) {
        crystallizedRecallsCapEl.value = String(state.settings?.crystallizedRecallsCap ?? 2);
      }
      if (crystallizedVividCapEl && (shouldForceUpdate || root.activeElement !== crystallizedVividCapEl)) {
        crystallizedVividCapEl.value = String(state.settings?.crystallizedVividCap ?? 4);
      }
      if (crystallizedOutlookCapEl && (shouldForceUpdate || root.activeElement !== crystallizedOutlookCapEl)) {
        crystallizedOutlookCapEl.value = String(state.settings?.crystallizedOutlookCap ?? 2);
      }
      if (crystallizedPreferencesCapEl && (shouldForceUpdate || root.activeElement !== crystallizedPreferencesCapEl)) {
        crystallizedPreferencesCapEl.value = String(state.settings?.crystallizedPreferencesCap ?? 4);
      }
      if (crystallizedNpcMemoryCapEl && (shouldForceUpdate || root.activeElement !== crystallizedNpcMemoryCapEl)) {
        crystallizedNpcMemoryCapEl.value = String(state.settings?.crystallizedNpcMemoryCap ?? 400);
      }
      // Per-pass LLM enable checkboxes (default on / opt-out — undefined reads as checked).
      const crystKnowsEl = root.getElementById("crystallized-knows-enabled") as HTMLInputElement | null;
      if (crystKnowsEl) crystKnowsEl.checked = state.settings?.crystallizedKnowsEnabled !== false;
      const crystNodesEl = root.getElementById("crystallized-nodes-enabled") as HTMLInputElement | null;
      if (crystNodesEl) crystNodesEl.checked = state.settings?.crystallizedNodesEnabled !== false;
      const crystOutlookEnEl = root.getElementById("crystallized-outlook-enabled") as HTMLInputElement | null;
      if (crystOutlookEnEl) crystOutlookEnEl.checked = state.settings?.crystallizedOutlookEnabled !== false;
      const crystPrefsEnEl = root.getElementById("crystallized-preferences-enabled") as HTMLInputElement | null;
      if (crystPrefsEnEl) crystPrefsEnEl.checked = state.settings?.crystallizedPreferencesEnabled !== false;
      const crystNpcMemEnEl = root.getElementById("crystallized-npc-memory-enabled") as HTMLInputElement | null;
      if (crystNpcMemEnEl) crystNpcMemEnEl.checked = state.settings?.crystallizedNpcMemoryEnabled !== false;
      if (state.settings) {
        const s1 = root.getElementById("prompt-s1") as HTMLTextAreaElement;
        const s2 = root.getElementById("prompt-s2") as HTMLTextAreaElement;
        const s3 = root.getElementById("prompt-s3") as HTMLTextAreaElement;
        const s4 = root.getElementById("prompt-s4") as HTMLTextAreaElement;
        if (s1 && (shouldForceUpdate || root.activeElement !== s1)) s1.value = state.settings.customPromptSection1 || DEFAULT_PROMPT_SECTION_1;
        if (s2 && (shouldForceUpdate || root.activeElement !== s2)) s2.value = state.settings.customPromptSection2 || DEFAULT_PROMPT_SECTION_2;
        if (s3 && (shouldForceUpdate || root.activeElement !== s3)) s3.value = state.settings.customPromptSection3 || DEFAULT_PROMPT_SECTION_3;
        if (s4 && (shouldForceUpdate || root.activeElement !== s4)) s4.value = state.settings.customPromptSection4 || DEFAULT_PROMPT_SECTION_4;
      }
      const opsEl = root.getElementById("learned-ops-list");
      if (opsEl && state.ops) {
        opsEl.textContent = state.ops.length > 0
          ? state.ops.map(o => `${o.kind === "write" ? "✍" : "📖"} ${o.operationName}:\n${o.query.trim()}`).join("\n\n---\n\n")
          : "None";
      }

      const statTurn = root.getElementById("stat-turn");
      const statLastAuto = root.getElementById("stat-last-auto");

      const curAction = state.actionCount ?? state.actionsCount ?? 0;

      if (statTurn) statTurn.textContent = String(curAction);
      if (statLastAuto) {
        statLastAuto.textContent = state.lastAutoUpdatedCard || "-";
      }

      // Group all versions by character name
      // Group all versions by character name and type (only append type suffix for card-sourced versions)
      const charGroups = new Map<string, PanelStateVersion[]>();
      for (const v of state.versions) {
        const key = v.characterName + (v.source === "card" ? "::" + (v.cardType || "character") : "");
        const arr = charGroups.get(key) ?? [];
        arr.push(v);
        charGroups.set(key, arr);
      }

      // Surface active cards that have no version history yet, so a live card (e.g. a re-imported
      // character never regenerated here) is still visible/manageable in the roster.
      for (const missingKey of activeCardsMissingFromRoster(state.cards ?? [], charGroups.keys())) {
        if (!charGroups.has(missingKey)) charGroups.set(missingKey, []);
      }

      // Sort versions in each character group by createdAt ascending
      for (const list of charGroups.values()) {
        list.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
      }

      let html = "";

      // Sort the character names: protagonist first, then other Plot Essentials characters in order, then others alphabetically.
      const allNames = Array.from(charGroups.keys());
      const sortedNames: string[] = [];
      const placedNames = new Set<string>();

      const addName = (n: string) => {
        const lower = n.trim().toLowerCase();
        for (const an of allNames) {
          const namePart = (an.split("::")[0] || "").trim().toLowerCase();
          if (namePart === lower) {
            const anLower = an.trim().toLowerCase();
            if (!placedNames.has(anLower)) {
              sortedNames.push(an);
              placedNames.add(anLower);
            }
          }
        }
      };

      // 1) Protagonist always first
      if (state.protagonist) {
        addName(state.protagonist);
      }

      // 2) Plot Essentials characters in order they appear
      if (state.memory) {
        const blocks = parsePlotEssentials(state.memory);
        for (const b of blocks) {
          addName(b.name);
        }
      }

      // 3) Remaining characters alphabetically
      const remaining = allNames
        .filter((n) => !placedNames.has(n.trim().toLowerCase()))
        .sort((a, b) => a.localeCompare(b));

      for (const n of remaining) {
        const firstPart = n.split("::")[0];
        if (firstPart) {
          addName(firstPart);
        }
      }

      // Build the sorted list of entries
      const sortedChars = sortedNames.map((name) => [name, charGroups.get(name)!] as [string, PanelStateVersion[]]);

      // Group entries by Story Card type; Plot Essentials entries form their own group.
      const cardTypeByName = new Map<string, string>();
      const cardIdByName = new Map<string, string>();
      const deletedNames = computeDeletedNames(state.cards ?? []);
      // Pass 1: Keys
      for (const c of (state.cards ?? [])) {
        const keysList = (c.keys || "").split(/[,;]+/).map(k => k.trim().toLowerCase()).filter(Boolean);
        for (const k of keysList) {
          cardTypeByName.set(k, c.type || "character");
          cardIdByName.set(k + "::" + (c.type || "character").toLowerCase(), c.id);
          cardIdByName.set(k, c.id);
        }
        const fullKey = (c.title || c.keys || "").trim().toLowerCase();
        if (fullKey) {
          cardTypeByName.set(fullKey, c.type || "character");
          cardIdByName.set(fullKey + "::" + (c.type || "character").toLowerCase(), c.id);
          cardIdByName.set(fullKey, c.id);
        }
      }
      // Pass 2: Titles (titles take priority)
      for (const c of (state.cards ?? [])) {
        if (c.title) {
          const titleLower = c.title.trim().toLowerCase();
          cardTypeByName.set(titleLower, c.type || "character");
          cardIdByName.set(titleLower + "::" + (c.type || "character").toLowerCase(), c.id);
          cardIdByName.set(titleLower, c.id);
        }
      }
      const plotNames = new Set<string>();
      if (state.protagonist) plotNames.add(state.protagonist.trim().toLowerCase());
      for (const b of parsePlotEssentials(state.memory || "")) plotNames.add(b.name.trim().toLowerCase());
      const TYPE_LABELS: Record<string, string> = { character: "Characters", class: "Classes", race: "Races", location: "Locations", faction: "Factions" };
      // The type label is independent of archived state, so an archived card keeps its
      // own type sub-group (Archived → Characters, Archived → Locations, …).
      const typeLabelFor = (key: string): string => {
        const parts = key.split("::");
        const name = parts[0] || "";
        const type = parts[1];

        const titlePrefix = (state.settings?.livingCharactersTitlePrefix || "Life - ").toLowerCase();
        const keyPrefix = (state.settings?.livingCharactersKeyPrefix || "chaos-v2:").toLowerCase();

        // An entry with an explicit concrete card type is classified by that type directly — bypassing
        // the fuzzy title-OR-keys lookups below, which can mis-file it under an auto-card group whose
        // KEYS include this name (real bug: "Life - Veya Vallois" keys include "Veya Vallois", filing the
        // character entry under Life instead of Characters). See explicitTypeLabel.
        const explicit = explicitTypeLabel(name, type, titlePrefix);
        if (explicit) return explicit;

        const isLifeCard = () => {
          if (type && type.toLowerCase() === "life") return true;
          const nameLower = name.trim().toLowerCase();
          if (nameLower.startsWith(titlePrefix)) return true;

          const card = (state.cards ?? []).find(c => !c.deletedAt && (
            c.title?.toLowerCase() === nameLower ||
            c.keys?.split(/[,;]+/).map(k => k.trim().toLowerCase()).includes(nameLower)
          ));
          if (card) {
            if ((card.type || "").toLowerCase() === "life") return true;
            if ((card.title || "").toLowerCase().startsWith(titlePrefix)) return true;
            const keysList = (card.keys || "").split(/[,;]+/).map(k => k.trim().toLowerCase()).filter(Boolean);
            if (keysList.some(k => k.startsWith(keyPrefix))) return true;
          }
          return false;
        };

        if (isLifeCard()) {
          return "Life";
        }

        const isThoughtCard = () => {
          if (!state.settings?.groupThoughtsInRoster) return false;
          if (type && (type.toLowerCase() === "memory" || type.toLowerCase() === "thoughts")) return true;
          const nameLower = name.trim().toLowerCase();
          if (nameLower.endsWith(" (memory)") || nameLower.endsWith(" - thoughts")) return true;

          const card = (state.cards ?? []).find(c => !c.deletedAt && (
            c.title?.toLowerCase() === nameLower ||
            c.keys?.split(/[,;]+/).map(k => k.trim().toLowerCase()).includes(nameLower)
          ));
          if (card) {
            const cardTypeLower = (card.type || "").toLowerCase();
            if (cardTypeLower === "memory" || cardTypeLower === "thoughts") return true;
            const cardTitleLower = (card.title || "").toLowerCase();
            if (cardTitleLower.endsWith(" (memory)") || cardTitleLower.endsWith(" - thoughts")) return true;
          }
          return false;
        };

        const isCrystallizedCard = () => {
          const nameLower = name.trim().toLowerCase();
          if (nameLower.endsWith(" - crystallized")) return true;
          if (type && type.toLowerCase() === "crystallized") return true;
          const exactTitleCard = (state.cards ?? []).find(c => !c.deletedAt && (c.title || "").trim().toLowerCase() === nameLower);
          if (!exactTitleCard) return false;
          const cardTypeLower = (exactTitleCard.type || "").toLowerCase();
          if (cardTypeLower === "crystallized") return true;
          return (exactTitleCard.title || "").trim().toLowerCase().endsWith(" - crystallized");
        };

        if (isCrystallizedCard()) {
          return "Crystallized";
        }

        if (isThoughtCard()) {
          return "Thoughts";
        }

        if (type) {
          const lowerType = type.toLowerCase();
          if (TYPE_LABELS[lowerType]) return TYPE_LABELS[lowerType];
          return type.charAt(0).toUpperCase() + type.slice(1);
        }
        const lower = name.trim().toLowerCase();
        const t = cardTypeByName.get(lower);
        if (t) {
          const lowerT = t.toLowerCase();
          if (TYPE_LABELS[lowerT]) return TYPE_LABELS[lowerT];
          return t.charAt(0).toUpperCase() + t.slice(1);
        }
        if (plotNames.has(lower)) return "Plot Essentials";
        return "Other";
      };
      // A LIVE card supersedes an archived one of the same name+type. After delete-then-re-import,
      // both an archived and an active card carry the title; a name with any active card must render
      // as active (Characters), never Archived — independent of card iteration order.
      const activeNames = new Set<string>();
      for (const c of (state.cards ?? [])) {
        if (c.deletedAt) continue;
        const type = (c.type || "character").toLowerCase();
        const add = (n: string) => {
          const k = n.trim().toLowerCase();
          if (k) { activeNames.add(k); activeNames.add(`${k}::${type}`); }
        };
        if (c.title) add(c.title);
        for (const k of (c.keys || "").split(/[,;]+/)) add(k);
      }
      const isArchived = (key: string): boolean => {
        const parts = key.split("::");
        const name = parts[0] || "";
        const type = parts[1];
        const bareName = name.trim().toLowerCase();
        const lookupKey = type ? `${bareName}::${type.toLowerCase()}` : bareName;
        if (activeNames.has(lookupKey) || activeNames.has(bareName)) return false; // live card wins
        return deletedNames.has(lookupKey) || deletedNames.has(bareName);
      };

      // Split entries into active vs archived; each side is grouped by Story Card type.
      const activeGrouped = new Map<string, [string, PanelStateVersion[]][]>();
      const archivedGrouped = new Map<string, [string, PanelStateVersion[]][]>();
      
      // Pre-populate "Plot Essentials" in activeGrouped so it's always rendered (prevents chicken-and-egg problem)
      activeGrouped.set("Plot Essentials", []);

      // MemorAID config is per-adventure (state.memoraidCharacters), surfaced as a pinned section
      // below; gated by the global enable toggle (default on). Any stray legacy "Configure MemorAID"
      // card is kept out of the normal grouping (it's mid-migration to per-adventure storage).
      const memoraidEnabled = state.settings?.enableMemorAID !== false;
      const memoraidNames: string[] = state.memoraidCharacters ?? [];
      for (const entry of sortedChars) {
        if ((entry[0].split("::")[0] || "").trim().toLowerCase() === "configure memoraid") continue;
        const lbl = typeLabelFor(entry[0]);
        const target = isArchived(entry[0]) ? archivedGrouped : activeGrouped;
        const arr = target.get(lbl) ?? [];
        arr.push(entry);
        target.set(lbl, arr);
      }
      const LABEL_ORDER = ["Plot Essentials", "Characters", "Thoughts", "Crystallized", "Life", "Classes", "Races", "Locations", "Factions"];
      const rank = (l: string) => (l === "Other" ? 1000 : (LABEL_ORDER.indexOf(l) === -1 ? 500 : LABEL_ORDER.indexOf(l)));
      const orderLabels = (keys: Iterable<string>) => [...keys].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));

      // Preserve each category's open/closed state across re-renders. Default (nothing
      // captured yet, e.g. first load) is collapsed, except active Plot Essentials which is open by default for easier discovery.
      const openGroups = new Set<string>();
      const hasExistingGroups = results.querySelectorAll("details[data-group]").length > 0;
      if (!hasExistingGroups) {
        // MemorAID is the first thing open when it has characters; otherwise Plot Essentials.
        openGroups.add(memoraidEnabled && memoraidNames.length ? "memoraid-config" : "active-Plot Essentials");
      } else {
        results.querySelectorAll("details[data-group]").forEach((d) => {
          if ((d as HTMLDetailsElement).open) openGroups.add(d.getAttribute("data-group") || "");
        });
      }

      // Renders the per-character <details> blocks for a list of entries.
      const renderChars = (groupChars: [string, PanelStateVersion[]][], isArchivedSection = false): string => {
        let out = "";
        for (const [key, list] of groupChars) {
          const parts = key.split("::");
          const displayName = parts[0] || "";
          const type = parts[1];
          
          const charPending = list.filter((v) => v.status === "pending");
          const charApplied = list.filter((v) => v.status === "applied");
          
          const hasPending = charPending.length > 0;
          const isCharOpen = hasPending ? " open" : "";
          // CSS handles default styling; only override for special states
          const stateStyles = hasPending
            ? "border-color:rgba(239, 68, 68, 0.25);background:rgba(239, 68, 68, 0.05);"
            : isArchivedSection
              ? "opacity:0.7;"
              : "";
          const titleColor = hasPending ? "color:#fca5a5;" : isArchivedSection ? "color:var(--text-secondary);" : "";
          
          let actionText = "";
          const isProtagonist = state.protagonist && displayName.trim().toLowerCase() === state.protagonist.trim().toLowerCase();
          if (!isProtagonist && charApplied.length > 0) {
            const latest = charApplied[charApplied.length - 1];
            if (latest && latest.actionCount != null) {
              actionText = ` <span style="color:var(--text-secondary);font-size:10.5px;font-weight:normal;margin-left:4px;">(Last Updated: Action #${latest.actionCount})</span>`;
            }
          }

          out += `<details class="char-card" data-card-title="${esc(displayName)}"${isCharOpen}${stateStyles ? ` style="${stateStyles}"` : ""}>` +
            `<summary${titleColor ? ` style="${titleColor}"` : ""}><span>${esc(displayName)}${actionText}` +
              (hasPending ? ` <span style="background:rgba(239, 68, 68, 0.2);color:#fca5a5;font-size:9px;padding:2px 6px;border-radius:4px;margin-left:6px;display:inline-block;vertical-align:middle;font-weight:bold;">Proposal</span>` : "") +
              (isArchivedSection ? ` <span style="background:rgba(255, 255, 255, 0.06);color:var(--text-secondary);font-size:9px;padding:2px 6px;border-radius:4px;margin-left:6px;display:inline-block;vertical-align:middle;">Archived</span>` : "") +
            `</span></summary>` +
            `<div class="char-card-body">`;

          // ⚡ Generate Core Character: generates this card through the configured AI provider.
          const lookupKey = type ? `${displayName.trim().toLowerCase()}::${type.toLowerCase()}` : displayName.trim().toLowerCase();
          const genCardId = cardIdByName.get(lookupKey) ?? cardIdByName.get(displayName.trim().toLowerCase());
          if (genCardId && !isArchivedSection) {
            const isCrystallized = displayName.toLowerCase().endsWith(" - crystallized") || (type && type.toLowerCase() === "crystallized");
            if (isCrystallized) {
              const charName = displayName.replace(/\s*-\s*crystallized$/i, "");
              // Knows editor + Backfill memories moved to Memory Bank → NPC (single home).
              out += `<button class="action-btn distill-now-btn" data-card-id="${esc(genCardId)}" data-char-name="${esc(charName)}" style="margin-bottom:8px;margin-right:6px;background:rgba(59,130,246,0.12);color:#60a5fa;border-color:rgba(59,130,246,0.3);">Distill now</button>` +
                `<button class="action-btn consolidate-crystallized-btn" data-card-id="${esc(genCardId)}" style="margin-bottom:8px;margin-right:6px;background:rgba(168,85,247,0.12);color:#c084fc;border-color:rgba(168,85,247,0.3);">Consolidate</button>` +
                `<button class="action-btn consolidate-outlook-btn" data-char-name="${esc(charName)}" title="Fold this character's settled beliefs (Outlook) into their character card as a proposed revision, then clear them from Crystallized" style="margin-bottom:8px;background:rgba(245,158,11,0.12);color:#fbbf24;border-color:rgba(245,158,11,0.3);">Consolidate Outlook</button>`;
            } else {
              const isCharacterType = (type || "").toLowerCase() === "character";
              const genLabel = isCharacterType ? "⚡ Generate Core Character" : "⚡ Generate (AID)";
              out += `<button class="action-btn" data-gen-card="${esc(genCardId)}" style="margin-bottom:8px;background:rgba(245,158,11,0.12);color:#fbbf24;border-color:rgba(245,158,11,0.3);">${genLabel}</button>`;
              // Character cards also get a compact background-character generator (tight, behavior-first ~600-char card).
              if (isCharacterType) {
                out += `<button class="action-btn" data-gen-compact="${esc(genCardId)}" style="margin-bottom:8px;margin-left:6px;background:rgba(34,211,238,0.12);color:#22d3ee;border-color:rgba(34,211,238,0.3);" title="Generate a shorter side-character card — details without high resolution">✨ Generate Side Character</button>`;
                out += `<button class="action-btn" data-reroll-card="${esc(genCardId)}" style="margin-bottom:8px;margin-left:6px;background:rgba(168,85,247,0.12);color:#c084fc;border-color:rgba(168,85,247,0.3);" title="Re-sample this character's body and rewrite their physical description (keeps personality)">🎲 Re-roll Body</button>`;
              }
            }
            // Delete (any card type): native delete + user-delete tombstone (won't repropagate/regenerate).
            out += `<button class="action-btn card-delete-btn" data-card-id="${esc(genCardId)}" style="margin-bottom:8px;margin-left:6px;background:rgba(239,68,68,0.12);color:#f87171;border-color:rgba(239,68,68,0.3);">Delete</button>`;
          }

          // 1. Pending Proposals Section
          if (hasPending) {
            out += `<div class="pending-proposal-box">` +
              `<div class="pending-title">Pending Proposal</div>` +
              charPending.map((v) => {
                const actionText = v.actionCount != null ? ` (Action ${v.actionCount})` : "";
                return `<div>` +
                  `<div class="pending-summary">${esc(v.changeSummary)}${actionText}</div>` +
                  `<details class="char-section"><summary>view proposed entry</summary>` +
                    `<div class="char-section-body">` +
                      `<div class="code-card" style="border-color:rgba(239, 68, 68, 0.25);border-left-color:rgba(239, 68, 68, 0.5);margin:0;">` +
                        `<div class="code-card-header" style="color:#fca5a5;border-color:rgba(239, 68, 68, 0.15);">Proposed: ${esc(v.changeSummary)}${actionText}</div>` +
                        `<pre style="color:#fdd;">${esc(v.entry)}</pre>` +
                      `</div>` +
                    `</div>` +
                  `</details>` +
                  `<div style="margin-top:8px;">` +
                    `<button class="action-btn" data-vid="${esc(v.id)}" data-act="applied" style="background:rgba(16, 185, 129, 0.15);color:#10b981;border-color:rgba(16, 185, 129, 0.3);margin-right:6px;">Accept</button>` +
                    `<button class="action-btn" data-vid="${esc(v.id)}" data-act="rejected" style="background:rgba(239, 68, 68, 0.15);color:#f87171;border-color:rgba(239, 68, 68, 0.3);">Reject</button>` +
                  `</div>` +
                `</div>`;
              }).join("") +
            `</div>`;
          }

          // 2. Current Entry (latest applied version)
          if (charApplied.length > 0) {
            const latest = charApplied[charApplied.length - 1] as PanelStateVersion;
            const actionText = latest.actionCount != null ? ` (Last Updated Action: #${latest.actionCount})` : "";
            out += `<details class="char-section">` +
              `<summary>Current Entry${actionText}</summary>` +
              `<div class="char-section-body">` +
                `<div class="code-card" style="margin:0;">` +
                  `<div class="code-card-header">Latest: ${esc(latest.changeSummary)}</div>` +
                  `<pre>${esc(latest.entry)}</pre>` +
                `</div>` +
              `</div>` +
            `</details>`;

            if (genCardId && !isArchivedSection) {
              // Triggers + Entry editing moved to the full-panel editor view (Phase B) — one button
              // takes over the panel instead of two cramped inline widgets in the drawer.
              out += `<div style="margin-top:10px;margin-bottom:10px;">` +
                `<button class="open-card-editor action-btn" data-card-id="${esc(genCardId)}" style="background:rgba(255,255,255,0.04);color:var(--text-primary);border-color:var(--border-color);">✏️ Edit Card (entry &amp; triggers)</button>` +
              `</div>`;

              // The Knows (schema) editor for Crystallized cards has moved to Memory Bank → NPC
              // (single home). See renderNpcMemoryBank.
            }

            // 3. History & Rewrites (all applied versions)
            out += `<div class="history-header">History & Rewrites</div>` +
              `<div class="history-list">` +
                [...charApplied].reverse().map((v) => {
                  const time = new Date(v.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                  const actionText = v.actionCount != null ? ` (Action #${v.actionCount})` : "";
                  
                  // Differentiate between baseline headers and update headers
                  const isBaseline = v.changeSummary.startsWith("Baseline");
                  const summaryHeader = isBaseline
                    ? `${esc(v.changeSummary)}${actionText}`
                    : `Action #${v.actionCount ?? "##"}`;

                  return `<details class="history-item">` +
                    `<summary>${summaryHeader}</summary>` +
                    `<div class="history-detail-body">` +
                      `<div class="history-meta">` +
                        `<span>${esc(v.changeSummary)}</span>` +
                        `<span class="note">(${time})</span>` +
                      `</div>` +
                      `<details class="view-entry-detail"><summary>view entry</summary>` +
                        `<div class="code-card" style="margin:4px 0 0;">` +
                          `<pre>${esc(v.entry)}</pre>` +
                        `</div>` +
                      `</details>` +
                      `<div style="margin-top:4px;">` +
                        (v.pushedAt ? `<span class="note" style="color:var(--accent-color);font-weight:600;">✓ Pushed to AID</span>` : `<button class="action-btn" data-vid="${esc(v.id)}" data-act="push">⬆ Apply to AID</button>`) +
                      `</div>` +
                    `</div>` +
                  `</details>`;
                }).join("") +
              `</div>`;
          } else if (charPending.length === 0) {
            out += `<div class="note">No entries recorded.</div>`;
          }

          out += `</div></details>`;
        }
        return out;
      };

      // Render a grouped section (active or archived) with type sub-group accordions
      const renderSection = (grouped: Map<string, [string, PanelStateVersion[]][]>, sectionPrefix: string, isArchivedSection = false): string => {
        let sectionHtml = "";
        for (const lbl of orderLabels(grouped.keys())) {
          const groupKey = `${sectionPrefix}-${lbl}`;
          const chars = grouped.get(lbl)!;
          const wasOpen = openGroups.has(groupKey);
          const charCount = chars.length;
          const pendingCount = chars.reduce((sum, [, vs]) => sum + vs.filter(v => v.status === "pending").length, 0);
          const openAttr = wasOpen ? " open" : "";
          const pendingBadge = pendingCount > 0
            ? ` <span class="badge-new-proposals">+${pendingCount}</span>`
            : "";
          const countBadge = ` <span style="color:var(--text-secondary);font-size:10px;font-weight:normal;">(${charCount})</span>`;

          if (lbl === "Characters" && !isArchivedSection) {
            console.log("[AID panel] Characters group names:", chars.map(c => c[0]));
          }

          let prefixHtml = "";
          if (lbl === "Plot Essentials" && !isArchivedSection) {
            const lookbackVal = state.settings?.analyzeWindow ?? 20;
            const curAction = state.actionCount ?? state.actionsCount ?? 0;
            const lastAnAction = state.lastAnalysisAction ?? 0;
            const sinceLastUpdate = lastAnAction > 0 ? String(curAction - lastAnAction) : "-";
            prefixHtml = `<button id="an" class="btn-primary" style="width:100%;margin-bottom:6px;">⟳ Update Plot Essentials</button>` +
              `<div style="font-size:9.5px;color:var(--text-secondary);margin-bottom:10px;text-align:center;font-family:SFMono-Regular,Consolas,monospace;display:flex;justify-content:space-around;gap:8px;box-sizing:border-box;width:100%;">` +
                `<div>Since Last Update Check: <span id="stat-since" style="color:var(--accent-color);font-weight:bold;">${sinceLastUpdate}</span></div>` +
                `<div>Action Lookback Window: <span id="stat-lookback" style="color:var(--accent-color);font-weight:bold;">${lookbackVal}</span></div>` +
              `</div>`;
          }

          const hasPending = pendingCount > 0;
          const proposalsClass = hasPending ? " has-proposals" : "";

          // Crystallized gets a distinct crystalline treatment (cyan/gem accent + 💎) so it reads as
          // its own thing directly under MemorAID/Thoughts.
          const isCrystal = lbl === "Crystallized";
          const groupStyle = isCrystal ? ` style="--accent-color:#22d3ee; --accent-glow:rgba(34,211,238,0.18); border-left-color:#22d3ee !important;"` : "";
          const lblHtml = isCrystal ? `💎 ${esc(lbl)}` : esc(lbl);
          sectionHtml += `<details class="group-header${proposalsClass}" data-group="${esc(groupKey)}"${openAttr}${groupStyle}>` +
            `<summary><span>${lblHtml}${countBadge}${pendingBadge}</span></summary>` +
            `<div style="padding:4px 8px 8px;">` +
              prefixHtml +
              renderChars(chars, isArchivedSection) +
            `</div>` +
          `</details>`;
        }
        return sectionHtml;
      };

      // --- MemorAID config section (pinned first; per-adventure character list) ---
      if (memoraidEnabled) {
        const mOpen = openGroups.has("memoraid-config") ? " open" : "";
        html += `<details class="group-header" data-group="memoraid-config"${mOpen} style="--accent-color:#fbbf24; --accent-glow:rgba(245,158,11,0.15); border-left-color:#fbbf24 !important;">` +
          `<summary><span>🧠 MemorAID</span></summary>` +
          `<div style="padding:6px 8px 8px;">` +
            `<div class="note" style="margin:0 0 6px;">Characters listed here get NPC thought tracking (MemorAID memory cards). One name per line.</div>` +
            `<label style="font-weight:600;font-size:11px;color:var(--text-primary);">Important Characters</label>` +
            `<textarea class="memoraid-chars-input input-dark" placeholder="e.g.\nAnna\nBob" style="width:100%;min-height:90px;margin:4px 0 8px;box-sizing:border-box;resize:vertical;">${esc(memoraidNames.join("\n"))}</textarea>` +
            `<button class="memoraid-save-btn btn-primary" style="width:100%;">💾 Save Characters</button>` +
          `</div>` +
        `</details>`;
      }

      // --- Active entries ---
      html += renderSection(activeGrouped, "active");

      // --- Archived entries (collapsed by default, with distinct styling) ---
      if (archivedGrouped.size > 0) {
        const totalArchived = [...archivedGrouped.values()].reduce((s, arr) => s + arr.length, 0);
        const archiveGroupKey = "archive-section";
        const wasArchiveOpen = openGroups.has(archiveGroupKey);
        html += `<details class="archive-header" data-group="${archiveGroupKey}"${wasArchiveOpen ? " open" : ""}>` +
          `<summary><span>📦 Archived <span style="font-weight:normal;font-size:10px;">(${totalArchived} card${totalArchived === 1 ? "" : "s"})</span></span></summary>` +
          `<div style="padding:4px 8px 8px;">` +
            `<div class="note" style="margin-bottom:6px;">Cards deleted from AID but preserved here with their history.</div>` +
            renderSection(archivedGrouped, "archived", true) +
          `</div>` +
        `</details>`;
      }

      setSafeHTML(results, html);

      // --- Banners Container ---
      const bannersContainer = root.getElementById("location-banners-container");
      const locationCards = (state.cards ?? []).filter(
        c => !c.deletedAt && (c.type || "").toLowerCase() === "location"
      );

      let bannersHtml = "";
      if (locationCards.length > 0) {
        const activeId = state.activeLocationId || "";
        // Collapsible on mobile (screen real estate): default CLOSED at <=600px, OPEN on desktop;
        // a user's explicit toggle survives re-renders (the whole banner is rebuilt every state
        // refresh, so the previous <details> open state is captured first). The summary always shows
        // the active location name, so the collapsed row still tells you where you are.
        const prevAlm = root.getElementById("alm-banner") as HTMLDetailsElement | null;
        const almOpen = prevAlm ? prevAlm.open : window.innerWidth > 600;
        const activeName = activeId ? (locationCards.find(c => c.id === activeId)?.title || "?") : "";
        bannersHtml += `
          <details id="alm-banner" class="location-manager-banner"${almOpen ? " open" : ""} style="background:rgba(16,185,129,0.05);border:1px solid rgba(16,185,129,0.15);border-radius:8px;padding:8px 10px;margin-bottom:8px;box-sizing:border-box;">
            <summary style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:6px;list-style:none;">
              <span style="font-weight:700;color:var(--theme-text-color);font-size:11px;text-transform:uppercase;letter-spacing:0.03em;white-space:nowrap;">Active Location</span>
              <span style="font-size:11px;color:${activeId ? "var(--accent-color)" : "var(--text-secondary)"};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1;text-align:right;">${activeId ? esc(activeName) : "none"}</span>
            </summary>
            <div style="display:flex;gap:6px;align-items:center;margin-top:6px;">
              <select id="active-location-select" style="margin:0;padding:4px 8px;font-size:11.5px;background:rgba(0,0,0,0.3);color:var(--text-primary);border-radius:6px;border:1px solid rgba(255,255,255,0.08);flex:1;min-width:0;">
                <option value="" ${!activeId ? "selected" : ""}>-- Select Active Location --</option>
                ${locationCards.map(c => `
                  <option value="${esc(c.id)}"${c.id === activeId ? " selected" : ""}>${esc(c.title || c.keys)}</option>
                `).join("")}
              </select>
              ${activeId ? `<button id="clear-active-location" class="btn-micro btn-micro--red" style="flex-shrink:0;">Clear</button>` : ""}
            </div>
          </details>
        `;
      }

      // The "New Noun Detected" suggestion UI moved to the Home tab (panel-home.ts, Phase A §2) —
      // the banners container now carries ONLY the Active Location Manager.
      if (bannersContainer) {
        setSafeHTML(bannersContainer, bannersHtml);

        const selectEl = root.getElementById("active-location-select") as HTMLSelectElement | null;
        selectEl?.addEventListener("change", () => {
          const cardId = selectEl.value || null;
          if (cbs.setActiveLocation) {
            cbs.setActiveLocation(cardId);
          }
        });

        const clearBtn = root.getElementById("clear-active-location");
        clearBtn?.addEventListener("click", () => {
          if (cbs.setActiveLocation) {
            cbs.setActiveLocation(null);
          }
        });
      }

      // Home tab: pending-decisions queue (incl. the relocated noun suggestion) + recent proposals.
      renderHome(root, state, {
        respondToProperNounSuggestion: cbs.respondToProperNounSuggestion,
        linkProperNounToCard: cbs.linkProperNounToCard,
        proposalDecision: cbs.proposalDecision,
      }, { esc, setSafeHTML, buildCardPickerOptions, showToast });

      // --- Proper Noun Log Editor ---
      const pnLogsList = root.getElementById("pn-logs-list");
      if (pnLogsList && state.properNounLogs) {
        if (state.properNounLogs.length === 0) {
          setSafeHTML(pnLogsList, `<div class="note" style="text-align:center;padding:10px 0;">No proper noun logs recorded.</div>`);
        } else {
          const linkPickerOptions = buildCardPickerOptions(state.cards);
          let pnLogsHtml = "";
          for (const log of state.properNounLogs) {
            // Prefer the stored type; fall back to the legacy booleans for old logs.
            const selectedType = log.type || (log.isLocation ? "location" : log.isCharacter ? "character" : "");
            const linkedTag = log.linkedCardTitle
              ? ` <span style="color:#93c5fd;font-size:9.5px;white-space:nowrap;" title="Linked to ${esc(log.linkedCardTitle)}">→ ${esc(log.linkedCardTitle)}</span>`
              : "";
            pnLogsHtml += `
              <div class="pn-log-item" data-pn="${esc(log.properNoun)}" style="display:flex;flex-direction:column;gap:4px;padding:4px 6px;border-bottom:1px solid rgba(255,255,255,0.03);font-size:11px;">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                  <span style="display:flex;align-items:center;gap:4px;overflow:hidden;min-width:0;">
                    <span style="font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:90px;" title="${esc(log.properNoun)}">${esc(log.properNoun)}</span>${linkedTag}
                  </span>
                  <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
                    <select class="pn-log-select" style="margin:0;padding:2px 4px;font-size:10px;width:auto;max-width:120px;background:rgba(0,0,0,0.3);color:var(--text-primary);border-radius:4px;border:1px solid rgba(255,255,255,0.08);">${buildTypePickerOptions(state.cards, selectedType)}</select>
                    <button class="pn-log-link-btn" style="margin:0;padding:2px 4px;background:none;border:none;cursor:pointer;color:var(--text-secondary);" title="Link to existing card">🔗</button>
                    <button class="pn-log-del-btn" style="margin:0;padding:2px 4px;background:none;border:none;cursor:pointer;color:var(--text-secondary);" title="Delete Log">🗑</button>
                  </div>
                </div>
                <div class="pn-log-link-row" style="display:none;gap:4px;align-items:center;">
                  <select class="pn-log-link-select" style="margin:0;padding:2px 4px;font-size:10.5px;flex-grow:1;min-width:0;background:rgba(0,0,0,0.3);color:var(--text-primary);border-radius:4px;border:1px solid rgba(255,255,255,0.08);">${linkPickerOptions}</select>
                </div>
              </div>
            `;
          }
          setSafeHTML(pnLogsList, pnLogsHtml);

          pnLogsList.querySelectorAll(".pn-log-select").forEach(sel => {
            sel.addEventListener("change", () => {
              const item = sel.closest(".pn-log-item");
              const pn = item?.getAttribute("data-pn") || "";
              const val = (sel as HTMLSelectElement).value; // "" = None, else the chosen card type
              if (cbs.updateProperNounLog) {
                cbs.updateProperNounLog(pn, val);
              }
            });
          });

          pnLogsList.querySelectorAll(".pn-log-link-btn").forEach(btn => {
            btn.addEventListener("click", () => {
              const item = btn.closest(".pn-log-item");
              const row = item?.querySelector(".pn-log-link-row") as HTMLElement | null;
              if (row) row.style.display = row.style.display === "none" ? "flex" : "none";
            });
          });

          pnLogsList.querySelectorAll(".pn-log-link-select").forEach(sel => {
            sel.addEventListener("change", () => {
              const item = sel.closest(".pn-log-item");
              const pn = item?.getAttribute("data-pn") || "";
              const cardId = (sel as HTMLSelectElement).value;
              if (cardId && cbs.linkProperNounToCard) {
                cbs.linkProperNounToCard(pn, cardId);
              }
            });
          });

          pnLogsList.querySelectorAll(".pn-log-del-btn").forEach(btn => {
            btn.addEventListener("click", () => {
              const item = btn.closest(".pn-log-item");
              const pn = item?.getAttribute("data-pn") || "";
              if (cbs.deleteProperNounLog) {
                cbs.deleteProperNounLog(pn);
              }
            });
          });
        }
      }

      // Wire clear all logs button
      const clearPnLogsBtn = root.getElementById("clear-pn-logs");
      if (clearPnLogsBtn) {
        // Remove old listener to avoid multiple fires
        const newBtn = clearPnLogsBtn.cloneNode(true);
        clearPnLogsBtn.parentNode?.replaceChild(newBtn, clearPnLogsBtn);
        newBtn.addEventListener("click", () => {
          if (cbs.clearProperNounLogs) {
            cbs.clearProperNounLogs();
          }
        });
      }

      const dbgContainer = root.getElementById("debug-container");
      if (dbgContainer) {
        dbgContainer.style.display = state.settings?.showDebug ? "block" : "none";
        if (state.settings?.showDebug && lastDebug) {
          setSafeHTML(dbgContainer, `<details open style="margin-top:8px;border-top:1px solid #333;padding-top:4px;"><summary style="cursor:pointer;color:#8a8;">🔍 Analyze debug</summary>` +
            `<div class="note">characters: ${esc((lastDebug.characters || []).join(", "))}</div>` +
            `<div class="note">narrative chars: ${esc(String(lastDebug.narrativeChars))}</div>` +
            `<div class="note">narrative tail:</div><div>${esc(lastDebug.narrativeTail || "")}</div>` +
            `<div class="note">raw response (truncated):</div><div>${esc(lastDebug.rawSnippet || "")}</div></details>`);
        } else if (!state.settings?.showDebug) {
          dbgContainer.textContent = "";
        }
      }

      // Render Memory Bank timeline + unread badge (extracted; shared with updateMemories())
      renderMemoriesSection(state);
      // Render the Memory Bank → NPC sub-pane (per-NPC Knows editor + memory-bank viewer).
      renderNpcMemoryBank(state);

      // Render Living Characters section
      renderLivingCharactersSection(state);

      // Home pending-decisions badge: proposals + noun suggestions (Mobile Rethink Phase A §1/§4).
      const pendingTotal = pendingDecisionsCount(state.locationSuggestions, state.versions);
      const homeBadge = root.getElementById("home-pending-badge");
      if (homeBadge) {
        if (activeTabId === "main-tab-home" || pendingTotal === 0) {
          homeBadge.style.display = "none";
          homeBadge.className = "";
        } else {
          homeBadge.textContent = `+${pendingTotal}`;
          homeBadge.style.display = "inline-block";
          homeBadge.className = "badge-new-proposals";
        }
      }

      // Sync minimized toggle button dot
      updateMinState();
    },
    clearCrystallizedSchemaCache: (cardId) => {
      crystallizedSchemaCache.delete(cardId);
      // Distillation rewrites schema AND preferences in the same state, so drop both caches together —
      // otherwise the Preferences editor would keep showing the pre-distillation snapshot.
      crystallizedPreferencesCache.delete(cardId);
    },
    refreshNpcMemory: (charName, generated, remaining, done, block) => {
      // Surgically splice the new block in (no full re-render → no flicker/scroll-jump). Fall back to
      // a full render only if the list DOM isn't present yet.
      if (block && !insertNpcMemBlock(charName, block as NpcMemBlock)) {
        npcMemoryCache.delete(charName.toLowerCase());
        if (lastState) renderNpcMemoryBank(lastState);
      }
      const setBtn = (text: string | null) => {
        root.querySelectorAll(".backfill-npc-memories-btn").forEach((b) => {
          if (b.getAttribute("data-char-name") === charName) {
            (b as HTMLButtonElement).disabled = !!text;
            b.textContent = text ?? "Backfill memories";
          }
        });
      };
      if (npcBackfillWatchdog) { clearTimeout(npcBackfillWatchdog); npcBackfillWatchdog = null; }
      if (done) {
        setBtn(null); // reset without a re-render
        if (typeof generated === "number") {
          panelHandle.showToast(remaining && remaining > 0
            ? `Backfilled ${generated} — ${remaining} left, click again to continue.`
            : `Backfilled ${generated} memories — ${charName} up to date.`);
        }
        return;
      }
      if (typeof generated === "number") {
        setBtn(remaining && remaining > 0 ? `⏳ ${generated} done, ${remaining} left…` : `⏳ ${generated}…`);
      }
      npcBackfillWatchdog = setTimeout(() => {
        npcBackfillWatchdog = null;
        setBtn(null);
        panelHandle.showToast(`Backfill for ${charName} stopped responding — refresh to see what landed.`, true);
      }, 60000);
    },
  };
  return panelHandle;
}
