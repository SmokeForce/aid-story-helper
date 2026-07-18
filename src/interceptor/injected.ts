import { WsTracker } from "../shared/ws-tracker";
import { extractOps } from "../shared/gql-detect";
import { requestHasNativeCardGeneration, generatedCardIdsFromRequest, collectGeneratedCardUpdates } from "../shared/native-generate";
import { pickActiveField } from "./gui-edit";

// Runs in the PAGE (MAIN) world. No extension APIs here — only postMessage.
(() => {
  const isGql = (u: unknown) => typeof u === "string" && /graphql/i.test(u);
  // Restrict to same-origin delivery so the token/story data can't be read by
  // cross-origin iframes embedded on the page (the isolated content script is same-origin).
  const post = (detail: unknown) =>
    window.postMessage({ source: "aid-tracker", detail }, location.origin);

  // Whitelisted WS operation names — ContextUpdate and other internal channels
  // are intentionally excluded to avoid forwarding assembled prompt data.
  const WS_ALLOW = new Set(["ActionUpdates", "AdventureStoryCardsUpdate", "AdventureMetadataUpdate", "Memory", "AdventureMemoriesUpdate"]);

  // Registry of extension-approved story card entries to override page autosaves.
  const approvedCards = new Map<string, { value: string; description?: string }>();

  // Extension-approved trigger KEYS per card id. `prev` is the exact pre-update keys string.
  // Card keys live in their own field (not covered by approvedCards' value/description), and an
  // OPEN AID card editor autosaves the keys it still shows (stale) — reverting an extension keys
  // change (link-to-card / save-triggers). We detect a stale autosave by exact-set match against
  // `prev` and rewrite it to `keys`; any other keys value is a genuine user edit and is adopted.
  const approvedCardKeys = new Map<string, { keys: string; prev: string }>();
  // Order-insensitive, case-insensitive key-set signature for comparing trigger strings.
  const keySig = (s: string) =>
    (s || "").split(/[,;]+/).map(k => k.trim().toLowerCase()).filter(Boolean).sort().join(",");

  // Mutates a card write's `keys` in place when it's a stale autosave echoing the pre-update keys;
  // adopts a genuine user keys-edit as the new truth. Returns true if it rewrote the keys.
  function applyApprovedKeys(cardInput: any): boolean {
    if (!cardInput || !cardInput.id) return false;
    const ak = approvedCardKeys.get(cardInput.id);
    if (!ak) return false;
    const cur = keySig(cardInput.keys || "");
    if (cur === keySig(ak.keys)) return false; // already the approved set
    if (cur === keySig(ak.prev)) {
      dlog("[AID injected] Restoring approved trigger keys for card ID:", cardInput.id);
      cardInput.keys = ak.keys;
      return true;
    }
    // Neither approved nor pre-update set → a real user edit of the triggers. Adopt it.
    approvedCardKeys.set(cardInput.id, { keys: cardInput.keys || "", prev: cardInput.keys || "" });
    return false;
  }

  // Extension-approved Plot Essentials memory per shortId. `previous` is the exact pre-update
  // text: it lets us (a) find the open PE editor textarea by exact match and rewrite it, and
  // (b) detect stale page autosaves (UpdateAdventurePlot echoing the pre-update text) that
  // would otherwise revert the extension's change on the server.
  const approvedMemories = new Map<string, { memory: string; previous?: string }>();
  const normMem = (s: string) => (s || "").replace(/\r\n/g, "\n").trim();

  // Sliding cache to debounce rapid duplicate story card write requests
  const lastSentWrites = new Map<string, { sig: string; timestamp: number }>();
  const WRITE_DEBOUNCE_MS = 3000;

  // Full write signature — a save differing in ANY field (incl. keys/title/type) is a real
  // change and must reach the server. Deduping on value+description alone swallowed
  // keys-only saves (trigger cleaning, panel "save triggers").
  function cardWriteSig(ci: any): string {
    return JSON.stringify([ci.value || "", ci.description || "", ci.keys || "", ci.title || "", ci.type || ""]);
  }

  function buildMockCardResponse(operationName: string, input: any) {
    return {
      data: {
        updateStoryCard: {
          success: true,
          message: "Successfully updated story card (mocked)",
          storyCard: {
            id: input.id,
            type: input.type,
            title: input.title || "",
            description: input.description || "",
            keys: input.keys || "",
            value: input.value || "",
            useForCharacterCreation: !!input.useForCharacterCreation,
            updatedAt: new Date().toISOString(),
            __typename: "StoryCard"
          },
          __typename: "UpdateStoryCardResponse"
        }
      }
    };
  }

  let lastActiveElement: HTMLInputElement | HTMLTextAreaElement | null = null;
  let lastActiveTime = 0;

  window.addEventListener("input", (e) => {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
      lastActiveElement = target;
      lastActiveTime = Date.now();
    }
  }, true);

  window.addEventListener("change", (e) => {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
      lastActiveElement = target;
      lastActiveTime = Date.now();
    }
  }, true);

  window.addEventListener("focusin", (e) => {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
      lastActiveElement = target;
      lastActiveTime = Date.now();
    }
  }, true);

  function isEditingInGui(cardInput?: any): boolean {
    if (cardInput && (cardInput.title || "").toLowerCase() === "configure memoraid") {
      return true;
    }

    const el = pickActiveField(document.activeElement, lastActiveElement, lastActiveTime, Date.now()) as HTMLTextAreaElement | HTMLInputElement | null;
    if (!el) return false;

    if (cardInput) {
      const activeVal = (el.value || "").trim().replace(/\r\n/g, "\n");
      const val = (cardInput.value || "").trim().replace(/\r\n/g, "\n");
      const desc = (cardInput.description || "").trim().replace(/\r\n/g, "\n");
      const keys = (cardInput.keys || "").trim().replace(/\r\n/g, "\n");
      const title = (cardInput.title || "").trim().replace(/\r\n/g, "\n");

      if (activeVal === val || activeVal === desc || activeVal === keys || activeVal === title) {
        return true;
      }

      const placeholder = (el.placeholder || el.getAttribute("placeholder") || "").toLowerCase();
      if (placeholder.includes("keys") || 
          placeholder.includes("description") || 
          placeholder.includes("entry") || 
          placeholder.includes("title") ||
          placeholder.includes("character")) {
        return true;
      }

      const testId = (el.getAttribute("data-testid") || "").toLowerCase();
      if (testId.includes("card") || testId.includes("character") || testId.includes("story")) {
        return true;
      }
    }

    const container = el.closest('[role="dialog"]') || 
                      el.closest('[role="presentation"]') ||
                      el.closest('.drawer') ||
                      el.closest('.modal') ||
                      el.closest('[aria-label*="story card" i]') ||
                      el.closest('[aria-label*="character" i]');
    return !!container;
  }

  function applyResponseOverrides(obj: any): boolean {
    if (!obj || typeof obj !== "object") return false;
    let modified = false;

    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        if (applyResponseOverrides(obj[i])) {
          modified = true;
        }
      }
    } else {
      if (obj.id && (obj.__typename === "StoryCard" || typeof obj.value === "string")) {
        if (approvedCards.has(obj.id)) {
          const approved = approvedCards.get(obj.id)!;
          if (obj.value !== approved.value) {
            dlog("[AID injected] Overriding stale card value in GQL response for ID:", obj.id);
            obj.value = approved.value;
            modified = true;
          }
          if (approved.description !== undefined && obj.description !== approved.description) {
            dlog("[AID injected] Overriding stale card description in GQL response for ID:", obj.id);
            obj.description = approved.description;
            modified = true;
          }
        }
        // Restore approved trigger keys if the server response still carries the stale set.
        const ak = approvedCardKeys.get(obj.id);
        if (ak && typeof obj.keys === "string" && keySig(obj.keys) === keySig(ak.prev) && keySig(obj.keys) !== keySig(ak.keys)) {
          dlog("[AID injected] Overriding stale card keys in GQL response for ID:", obj.id);
          obj.keys = ak.keys;
          modified = true;
        }
      }
      for (const key of Object.keys(obj)) {
        if (typeof obj[key] === "object" && obj[key] !== null) {
          if (applyResponseOverrides(obj[key])) {
            modified = true;
          }
        }
      }
    }
    return modified;
  }

  function getApolloClient(): any {
    if ((window as any).__APOLLO_CLIENT__) {
      return (window as any).__APOLLO_CLIENT__;
    }
    try {
      const root = document.querySelector('#__next') || document.querySelector('#app') || document.body;
      if (!root) return null;
      const keys = Object.keys(root);
      const reactKey = keys.find(k => k.startsWith('__reactContainer$') || k.startsWith('__reactFiber$'));
      if (!reactKey) return null;
      
      let startFiber = (root as any)[reactKey];
      if (startFiber && startFiber.current) {
        startFiber = startFiber.current;
      }
      
      const stack: any[] = [startFiber];
      let visitedCount = 0;
      
      while (stack.length > 0 && visitedCount < 1000) {
        const fiber = stack.pop();
        if (!fiber) continue;
        visitedCount++;
        
        // Check props and stateNode
        if (fiber.memoizedProps?.client && typeof fiber.memoizedProps.client.cache?.modify === 'function') {
          dlog("[AID injected] Found Apollo Client in memoizedProps");
          return fiber.memoizedProps.client;
        }
        if (fiber.stateNode?.props?.client && typeof fiber.stateNode.props.client.cache?.modify === 'function') {
          dlog("[AID injected] Found Apollo Client in stateNode props");
          return fiber.stateNode.props.client;
        }
        // Check dependencies/context
        if (fiber.dependencies?.firstContext?.memoizedValue?.client && typeof fiber.dependencies.firstContext.memoizedValue.client.cache?.modify === 'function') {
          dlog("[AID injected] Found Apollo Client in React Context");
          return fiber.dependencies.firstContext.memoizedValue.client;
        }
        
        // Traverse child and sibling via fast O(1) stack push
        if (fiber.sibling) stack.push(fiber.sibling);
        if (fiber.child) stack.push(fiber.child);
      }
    } catch (e) {
      console.warn("[AID injected] Error searching for Apollo Client:", e);
    }
    return null;
  }

  const pendingActionResolvers = new Map<string, (val: { updatedNames: string[]; injectText: string }) => void>();
  const adventureIdMap = new Map<string, string>();

  // When AI Dungeon natively (re)generates a Story Card, its fresh value must not be reverted by the
  // stale-value guard (approvedCards is seeded with the pre-generation snapshot on page load). If we
  // can read the target card id from the request we release just that card; otherwise we briefly
  // suspend the response-override entirely so the generation can't be clobbered. Deadline is a
  // page-clock ms timestamp; 0 = inactive.
  let overridesSuppressedUntil = 0;
  const GENERATE_SUPPRESS_MS = 6000;

  function getShortIdFromAdventureId(advId: string): string {
    if (!advId) return "";
    const cleanAdvId = String(advId).replace(/^Adventure:/, "");
    // If cleanAdvId is already a public shortId (e.g. 8-12 characters, no hyphens), return it directly.
    if (cleanAdvId.length < 15 && !cleanAdvId.includes("-") && !/^\d+$/.test(cleanAdvId)) {
      return cleanAdvId;
    }
    
    // 1. Check adventureIdMap cache
    for (const [sid, id] of adventureIdMap.entries()) {
      const cleanId = String(id).replace(/^Adventure:/, "");
      if (cleanId === cleanAdvId) return sid;
    }
    
    // 2. Check Apollo Cache
    try {
      const client = getApolloClient();
      const data = client?.cache?.extract();
      if (data) {
        // Try exact cache key first
        const exactKey = `Adventure:${cleanAdvId}`;
        if (data[exactKey]?.shortId) {
          const sid = data[exactKey].shortId;
          if (sid && !/^\d+$/.test(sid)) {
            adventureIdMap.set(sid, cleanAdvId);
            return sid;
          }
        }
        // Fallback: search all Adventure: keys
        for (const key of Object.keys(data)) {
          if (key.startsWith("Adventure:") && key.includes(cleanAdvId)) {
            const sid = data[key]?.shortId;
            if (sid && !/^\d+$/.test(sid)) {
              adventureIdMap.set(sid, cleanAdvId);
              return sid;
            }
          }
        }
      }
    } catch {}

    // 3. Fallback: Parse URL pathname segments
    const segments = window.location.pathname.split('/');
    for (const segment of segments) {
      if (segment && segment.length >= 8 && segment.length <= 22 && !/^\d+$/.test(segment)) {
        if (!["adventure", "scenario", "play", "settings", "profile", "explore", "featured", "main"].includes(segment.toLowerCase())) {
          return segment;
        }
      }
    }

    // 4. Regex URL fallback
    const m = window.location.pathname.match(/\/(?:play|adventure|scenario)\/([^\/]+)/);
    if (m && !/^\d+$/.test(m[1]!) && m[1]!.length < 15) {
      return m[1]!;
    }
    
    return cleanAdvId;
  }

  let interceptTimeoutMs = 10000;
  let warnedNoApollo = false;
  let showDebug = false;

  // cache.modify can only update entities ALREADY in the Apollo cache — a brand-new card
  // (MemorAID memory card, Configure MemorAID, panel-created cards) never appears in the
  // page's story card list until its list queries refetch. Throttled to avoid refetch storms.
  let lastActiveRefetch = 0;
  function maybeRefetchActiveQueries(client: any, reason: string, force = false) {
    const nowTs = Date.now();
    if (!force && (nowTs - lastActiveRefetch < 5000)) return;
    if (!force) lastActiveRefetch = nowTs;
    try {
      if (typeof client.refetchQueries === "function") {
        dlog("[AID injected] Refetching active queries:", reason);
        const p: any = client.refetchQueries({ include: "active" });
        if (p && typeof p.then === "function") p.then(null, () => {});
      }
    } catch (e) {
      console.warn("[AID injected] refetchQueries failed:", e);
    }
  }

  function findAdventureCacheId(client: any, shortId: string): string | null {
    try {
      const data = client.cache.extract();
      if (!data) return null;

      // 1. Try mapping from the intercepted GQL response
      let cachedId = adventureIdMap.get(shortId);

      // 2. If not found in map, attempt to discover it from any Action keys in the cache
      if (!cachedId) {
        for (const key of Object.keys(data)) {
          if (key.startsWith("Action:")) {
            try {
              // Action:{"adventureId":"202503922","id":"501"}
              const match = key.match(/"adventureId"\s*:\s*"([^"]+)"/) || key.match(/Action:([^:]+)/);
              if (match && match[1]) {
                cachedId = match[1];
                adventureIdMap.set(shortId, cachedId);
                dlog("[AID injected] Discovered adventureId from cache Action key:", shortId, "->", cachedId);
                break;
              }
            } catch {}
          }
        }
      }

      // 3. Look for exact key or a key starting with Adventure: containing the GQL UUID
      if (cachedId) {
        const exactKey = `Adventure:${cachedId}`;
        if (data[exactKey]) return exactKey;
        for (const key of Object.keys(data)) {
          if (key.startsWith("Adventure:") && key.includes(cachedId)) {
            return key;
          }
        }
      }

      // 4. Try to find the reference in ROOT_QUERY under adventure(...)
      const rootQuery = data["ROOT_QUERY"];
      if (rootQuery) {
        for (const field of Object.keys(rootQuery)) {
          if (field.startsWith("adventure(") && field.includes(shortId)) {
            const ref = rootQuery[field];
            if (ref && typeof ref === "object" && typeof ref.__ref === "string") {
              return ref.__ref;
            }
          }
        }
      }

      // 5. Try to search entities directly
      const adventureKeys = Object.keys(data).filter(k => k.startsWith("Adventure:"));
      for (const key of adventureKeys) {
        const entity = data[key];
        if (entity && (entity.shortId === shortId || entity.id === shortId)) {
          return key;
        }
      }

      // 6. Fallback: if only one Adventure exists in cache, return it
      if (adventureKeys.length === 1) {
        return adventureKeys[0]!;
      }
    } catch (err) {
      console.warn("[AID injected] Error searching for Adventure cache ID:", err);
    }
    return null;
  }
  const dlog = (...args: any[]) => {
    if (showDebug) console.log(...args);
  };
  let originalPlaceholder: string | null = null;
  let placeholderTimeout: any = null;

  function setPlaceholderText(text: string) {
    const inputEl = document.getElementById("game-text-input") as HTMLTextAreaElement | null;
    if (inputEl) {
      if (originalPlaceholder === null) {
        originalPlaceholder = inputEl.placeholder || "";
      }
      inputEl.placeholder = text;
    }
  }

  function restorePlaceholder() {
    const inputEl = document.getElementById("game-text-input") as HTMLTextAreaElement | null;
    if (inputEl && originalPlaceholder !== null) {
      inputEl.placeholder = originalPlaceholder;
      originalPlaceholder = null;
    }
  }

  function flashPlaceholder(text: string, duration = 1200) {
    if (placeholderTimeout) {
      clearTimeout(placeholderTimeout);
    }
    setPlaceholderText(text);
    placeholderTimeout = setTimeout(() => {
      restorePlaceholder();
      placeholderTimeout = null;
    }, duration);
  }

  function setReactInputValue(el: HTMLTextAreaElement | HTMLInputElement, val: string) {
    const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) {
      setter.call(el, val);
    } else {
      el.value = val;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // Rewrites the open Plot Essentials editor (textarea or contenteditable) after the extension
  // pushed a memory update server-side. React keeps editor text in LOCAL state, so Apollo cache
  // updates/refetches never repaint it — the user keeps seeing (and autosaving!) the stale text
  // until reload. Matching is EXACT against the pre-update text so a user's in-progress edit is
  // never clobbered.
  function updateOpenPlotEditorDom(newMemory: string, previousMemory?: string) {
    let updated = 0;
    try {
      const textareas = Array.from(document.querySelectorAll("textarea"));
      
      if (previousMemory) {
        const prevNorm = normMem(previousMemory);
        if (prevNorm) {
          for (const ta of textareas) {
            if (ta.id === "game-text-input") continue;
            if (normMem(ta.value) === prevNorm && ta.value !== newMemory) {
              setReactInputValue(ta, newMemory);
              updated++;
            }
          }
        }
      } else {
        // Fallback: Find the Plot Essentials textarea by content or parent/placeholder matching
        for (const ta of textareas) {
          if (ta.id === "game-text-input") continue;
          const val = ta.value || "";
          const placeholder = (ta.getAttribute("placeholder") || "").toLowerCase();
          const containerText = ta.closest("div")?.textContent || "";
          const isMemoryTextarea = 
            placeholder.includes("plot essentials") || 
            placeholder.includes("memory") ||
            placeholder.includes("details are essential") ||
            containerText.includes("Plot Essentials") ||
            containerText.includes("Memory") ||
            val.includes("You are the player:") ||
            val.includes("[Current Location:") ||
            val.includes("[Active Location:");
            
          if (isMemoryTextarea && ta.value !== newMemory) {
            setReactInputValue(ta, newMemory);
            updated++;
          }
        }
      }

      // Do the same for contenteditable
      const editables = Array.from(document.querySelectorAll('[contenteditable="true"]')) as HTMLElement[];
      if (previousMemory) {
        const prevNorm = normMem(previousMemory);
        if (prevNorm) {
          for (const el of editables) {
            if (normMem(el.textContent || "") === prevNorm) {
              el.textContent = newMemory;
              el.dispatchEvent(new Event("input", { bubbles: true }));
              updated++;
            }
          }
        }
      } else {
        for (const el of editables) {
          const txt = el.textContent || "";
          const containerText = el.closest("div")?.textContent || "";
          const isMemoryEditable = 
            containerText.includes("Plot Essentials") ||
            containerText.includes("Memory") ||
            txt.includes("You are the player:") ||
            txt.includes("[Current Location:") ||
            txt.includes("[Active Location:");
            
          if (isMemoryEditable && txt !== newMemory) {
            el.textContent = newMemory;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            updated++;
          }
        }
      }

      if (updated > 0) {
        dlog(`[AID injected] Rewrote ${updated} open Plot Essentials editor(s) with the updated memory.`);
      } else {
        dlog("[AID injected] No open PE editor matched the pre-update memory text. Skipping DOM update.");
      }
    } catch (err) {
      console.warn("[AID injected] Error updating open PE editor DOM:", err);
    }
  }

  function updateOpenAINEditorDom(newAIN: string, previousAIN?: string) {
    let updated = 0;
    try {
      const textareas = Array.from(document.querySelectorAll("textarea"));
      if (previousAIN) {
        const prevNorm = normMem(previousAIN);
        if (prevNorm) {
          for (const ta of textareas) {
            if (ta.id === "game-text-input") continue;
            if (normMem(ta.value) === prevNorm && ta.value !== newAIN) {
              setReactInputValue(ta, newAIN);
              updated++;
            }
          }
        }
      } else {
        for (const ta of textareas) {
          if (ta.id === "game-text-input") continue;
          const val = ta.value || "";
          const placeholder = (ta.getAttribute("placeholder") || "").toLowerCase();
          const containerText = ta.closest("div")?.textContent || "";
          const isAINTextarea = 
            placeholder.includes("ai instructions") || 
            placeholder.includes("custom instructions") ||
            containerText.includes("AI Instructions") ||
            containerText.includes("Custom Instructions");
            
          if (isAINTextarea && ta.value !== newAIN) {
            setReactInputValue(ta, newAIN);
            updated++;
          }
        }
      }
      if (updated > 0) {
        dlog(`[AID injected] Rewrote ${updated} open AI Instructions editor(s) with the updated AIN.`);
      }
    } catch (err) {
      console.warn("[AID injected] Error updating open AIN editor DOM:", err);
    }
  }

  function updateOpenANEditorDom(newAN: string, previousAN?: string) {
    let updated = 0;
    try {
      const textareas = Array.from(document.querySelectorAll("textarea"));
      if (previousAN) {
        const prevNorm = normMem(previousAN);
        if (prevNorm) {
          for (const ta of textareas) {
            if (ta.id === "game-text-input") continue;
            if (normMem(ta.value) === prevNorm && ta.value !== newAN) {
              setReactInputValue(ta, newAN);
              updated++;
            }
          }
        }
      } else {
        for (const ta of textareas) {
          if (ta.id === "game-text-input") continue;
          const val = ta.value || "";
          const placeholder = (ta.getAttribute("placeholder") || "").toLowerCase();
          const containerText = ta.closest("div")?.textContent || "";
          const isANTextarea = 
            placeholder.includes("author's note") || 
            placeholder.includes("authors note") ||
            placeholder.includes("style, format, pace") ||
            containerText.includes("Author's Note") ||
            containerText.includes("Authors Note");
            
          if (isANTextarea && ta.value !== newAN) {
            setReactInputValue(ta, newAN);
            updated++;
          }
        }
      }
      if (updated > 0) {
        dlog(`[AID injected] Rewrote ${updated} open Author's Note editor(s) with the updated AN.`);
      }
    } catch (err) {
      console.warn("[AID injected] Error updating open AN editor DOM:", err);
    }
  }

  function updateOpenEditorDom(value: string, description?: string) {
    try {
      // Find the active modal/drawer/dialog wrapper. If none is open, do nothing.
      const dialog = document.querySelector('[role="dialog"]') || 
                     document.querySelector('[role="presentation"]') ||
                     document.querySelector('.drawer') ||
                     document.querySelector('.modal');
      
      if (!dialog) {
        dlog("[AID injected] No card editor modal/drawer detected. Skipping DOM update.");
        return;
      }
      
      const textareas = Array.from(dialog.querySelectorAll("textarea"));
      
      let entryTextarea: HTMLTextAreaElement | null = null;
      let notesTextarea: HTMLTextAreaElement | null = null;
      
      for (const ta of textareas) {
        if (ta.id === "game-text-input" || ta.placeholder?.includes("Type here")) continue;
        
        let parentText = "";
        let curr: HTMLElement | null = ta;
        for (let i = 0; i < 4 && curr; i++) {
          parentText += " " + (curr.textContent || "");
          curr = curr.parentElement;
        }
        parentText = parentText.toLowerCase();
        
        if (parentText.includes("entry") && !parentText.includes("notes") && !parentText.includes("description")) {
          entryTextarea = ta;
        } else if (parentText.includes("notes") || parentText.includes("description")) {
          notesTextarea = ta;
        }
      }
      
      // Fallback: if they don't have labeled parent elements, use first and last textareas in the dialog
      if (!entryTextarea || !notesTextarea) {
        const cardTextareas = textareas.filter(ta => ta.id !== "game-text-input");
        if (cardTextareas.length >= 2) {
          if (!entryTextarea) entryTextarea = cardTextareas[0]!;
          if (!notesTextarea) notesTextarea = cardTextareas[cardTextareas.length - 1]!;
        }
      }
      
      if (entryTextarea && entryTextarea.value !== value) {
        setReactInputValue(entryTextarea, value);
        dlog("[AID injected] Programmatically updated ENTRY textarea in DOM.");
      }
      if (notesTextarea && description !== undefined && notesTextarea.value !== description) {
        setReactInputValue(notesTextarea, description);
        dlog("[AID injected] Programmatically updated NOTES textarea in DOM.");
      }
    } catch (err) {
      console.warn("[AID injected] Error updating open editor DOM:", err);
    }
  }

  window.addEventListener("message", async (ev) => {
    if (ev.origin !== location.origin) return;

    if (ev.data?.source === "aid-extension-host-relay" && ev.data?.kind === "relayFetchRequest") {
      const { requestId, url, init } = ev.data;
      const scriptId = "aid-relay-" + Math.random().toString(36).substring(7);
      let resolved = false;

      const responseListener = (event: MessageEvent) => {
        if (event.origin !== location.origin || event.data?.source !== "aid-relay-response" || event.data?.scriptId !== scriptId) return;
        resolved = true;
        window.removeEventListener("message", responseListener);
        
        window.postMessage({
          source: "aid-extension-host",
          kind: "relayFetchResponse",
          requestId,
          response: event.data.response
        }, location.origin);
      };
      window.addEventListener("message", responseListener);

      // 1. Try DOM Event Handler route (inherits page origin, bypassing extension script source tracking in Firefox)
      try {
        const el = document.createElement("div");
        el.style.display = "none";
        el.setAttribute("onclick", `
          (async () => {
            const scriptId = ${JSON.stringify(scriptId)};
            try {
              const res = await fetch(window.__relayUrl, window.__relayInit);
              const bodyText = await res.text();
              const headers = {};
              res.headers.forEach((v, k) => { headers[k] = v; });
              
              window.postMessage({
                source: "aid-relay-response",
                scriptId,
                response: {
                  ok: res.ok,
                  status: res.status,
                  statusText: res.statusText,
                  body: bodyText,
                  headers
                }
              }, window.location.origin);
            } catch (err) {
              window.postMessage({
                source: "aid-relay-response",
                scriptId,
                response: { error: err?.message || String(err) }
              }, window.location.origin);
            }
          })();
        `);
        document.body.appendChild(el);
        (window as any).__relayUrl = url;
        // __aidRelay marks this as extension-authored traffic: the fetch proxy must pass it
        // through untouched (dedup mocking a background write would fake success while the
        // server never receives it; overrides are redundant — background data is authoritative).
        (window as any).__relayInit = { ...(init || {}), __aidRelay: true };
        el.click();
        el.remove();
        delete (window as any).__relayUrl;
        delete (window as any).__relayInit;
      } catch (e) {
        // inline execution setting error
      }

      // 2. CSP Fallback: if inline scripts are blocked by CSP, fall back to direct fetch after 150ms
      setTimeout(async () => {
        if (resolved) return;
        window.removeEventListener("message", responseListener);
        dlog("[AID injected] Inline event relay timed out (likely CSP block). Falling back to direct page fetch.");
        try {
          const res = await _fetch(url, init);
          const bodyText = await res.text();
          const headers: Record<string, string> = {};
          res.headers.forEach((v, k) => { headers[k] = v; });

          window.postMessage({
            source: "aid-extension-host",
            kind: "relayFetchResponse",
            requestId,
            response: {
              ok: res.ok,
              status: res.status,
              statusText: res.statusText,
              body: bodyText,
              headers
            }
          }, location.origin);
        } catch (err: any) {
          window.postMessage({
            source: "aid-extension-host",
            kind: "relayFetchResponse",
            requestId,
            response: { error: err?.message || String(err) }
          }, location.origin);
        }
      }, 150);
      return;
    }

    if (ev.data?.source !== "aid-extension-host") return;
    if (ev.data?.kind === "fillSetupInput" && typeof ev.data.value === "string") {
      let typeHereInput = document.querySelector('input[placeholder*="Type here"], textarea[placeholder*="Type here"]') as HTMLInputElement | HTMLTextAreaElement | null;
      if (!typeHereInput) {
        // Fallback: find any visible text input or textarea in the main document
        const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea')) as (HTMLInputElement | HTMLTextAreaElement)[];
        typeHereInput = inputs.find(el => {
          if (el.getRootNode() !== document) return false;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return false;
          const id = (el.id || "").toLowerCase();
          const cls = (el.className || "").toLowerCase();
          const placeholder = (el.getAttribute("placeholder") || "").toLowerCase();
          if (id.includes("search") || cls.includes("search") || placeholder.includes("search")) return false;
          return true;
        }) || null;
      }
      if (typeHereInput) {
        const current = typeHereInput.value || "";
        let newValue = ev.data.value;
        const trimmed = current.trim();
        if (trimmed) {
          let separator = ", ";
          if (trimmed.endsWith(",")) {
            separator = " ";
          }
          // If the new value starts with a bullet point "-" or the current value contains list items/newlines, use a newline separator
          if (newValue.startsWith("-") || trimmed.includes("\n") || trimmed.startsWith("-")) {
            separator = "\n";
          }
          newValue = trimmed + separator + newValue;
        }
        setReactInputValue(typeHereInput, newValue);
        dlog("[AID injected] Programmatically filled setup input via postMessage (additive):", newValue);
      }
      return;
    }
    if (ev.data?.kind === "seedApprovedCards" && Array.isArray(ev.data.cards)) {
      try {
        let client = getApolloClient();
        for (const card of ev.data.cards) {
          if (card && typeof card.id === "string" && typeof card.value === "string") {
            approvedCards.set(card.id, { value: card.value, description: card.description });
            if (client) {
              client.cache.modify({
                id: `StoryCard:${card.id}`,
                fields: {
                  value() { return card.value; },
                  description(existing: any) { return card.description !== undefined ? card.description : existing; }
                }
              });
            }
          }
        }
        
        if (client) {
          dlog("[AID injected] Seeded approved cards registry & Apollo cache:", ev.data.cards.length);
        } else {
          dlog("[AID injected] Apollo Client not found yet. Retrying seeding in background...");
          const cardsToSeed = [...ev.data.cards];
          let retries = 0;
          const retryInterval = setInterval(() => {
            client = getApolloClient();
            retries++;
            if (client) {
              clearInterval(retryInterval);
              dlog("[AID injected] Found Apollo Client on retry. Seeding cache...");
              try {
                for (const card of cardsToSeed) {
                  if (card && typeof card.id === "string" && typeof card.value === "string") {
                    client.cache.modify({
                      id: `StoryCard:${card.id}`,
                      fields: {
                        value() { return card.value; },
                        description(existing: any) { return card.description !== undefined ? card.description : existing; }
                      }
                    });
                  }
                }
              } catch (e) {
                console.warn("[AID injected] Error seeding Apollo cache on retry:", e);
              }
            } else if (retries >= 15) {
              clearInterval(retryInterval);
              dlog("[AID injected] Max retries reached. Apollo Client not found on page.");
            }
          }, 1000);
        }
      } catch (err) {
        console.warn("[AID injected] Error seeding Apollo cache:", err);
      }
      return;
    }
    if (ev.data?.kind === "approvedCard" && typeof ev.data.cardId === "string" && typeof ev.data.value === "string") {
      const cardId = ev.data.cardId;
      const value = ev.data.value;
      const description = ev.data.description;
      const newKeys = typeof ev.data.keys === "string" ? ev.data.keys : undefined;
      const prevKeys = typeof ev.data.prevKeys === "string" ? ev.data.prevKeys : undefined;
      if (newKeys !== undefined) {
        approvedCardKeys.set(cardId, { keys: newKeys, prev: prevKeys ?? "" });
      }

      // A freshly created, still-empty card: don't register an "" override (a thought may be
      // saved seconds later, and the stale empty override would blank the card in refetched
      // responses). Just make the page refetch so the new card shows up in its list.
      const isEmptyNewCard = value === "" && !approvedCards.has(cardId);
      if (!isEmptyNewCard) {
        approvedCards.set(cardId, { value, description });
        dlog("[AID injected] Registered approved card override:", cardId, value.length);

        // Attempt to update the open editor DOM textareas directly
        updateOpenEditorDom(value, description);
      }

      // Attempt to silently update the Apollo Client cache directly
      try {
        const client = getApolloClient();
        if (client) {
          let inCache = true;
          try {
            inCache = !!(client.cache.extract() || {})[`StoryCard:${cardId}`];
          } catch { /* assume present; modify below is a no-op either way */ }

          dlog("[AID injected] Performing direct cache update for StoryCard:", cardId, "inCache:", inCache);
          if (!isEmptyNewCard) {
            client.cache.modify({
              id: `StoryCard:${cardId}`,
              fields: {
                value() { return value; },
                description(existing: any) { return description !== undefined ? description : existing; },
                keys(existing: any) { return newKeys !== undefined ? newKeys : existing; }
              }
            });
          } else if (newKeys !== undefined) {
            client.cache.modify({ id: `StoryCard:${cardId}`, fields: { keys() { return newKeys; } } });
          }

          if (!inCache) {
            // New card: lists won't include it via cache.modify — pull fresh data.
            maybeRefetchActiveQueries(client, `new card ${cardId} not in Apollo cache`);
          }
        } else {
          if (!warnedNoApollo) {
            warnedNoApollo = true;
            console.warn("[AID injected] Apollo Client not found on page — closed card editors may show stale values until reload (fetch-hijack overrides still active).");
          }
          dlog("[AID injected] Apollo Client not found on page. Relying on fetch-hijack fallback.");
        }
      } catch (err) {
        console.error("[AID injected] Failed to silently update Apollo Client cache:", err);
      }
    }
    if (ev.data?.kind === "approvedMemory" && typeof ev.data.shortId === "string" && typeof ev.data.memory === "string") {
      const shortId = ev.data.shortId;
      const memory = ev.data.memory;
      const previousMemory = typeof ev.data.previousMemory === "string" ? ev.data.previousMemory : undefined;
      approvedMemories.set(shortId, { memory, previous: previousMemory });

      // The PE editor pane keeps its text in React-local state — update it directly.
      updateOpenPlotEditorDom(memory, previousMemory);
      try {
        const client = getApolloClient();
        if (client) {
          const advKey = findAdventureCacheId(client, shortId);
          if (advKey) {
            dlog("[AID injected] Performing direct cache update for Adventure memory:", advKey);
            client.cache.modify({
              id: advKey,
              fields: {
                memory() { return memory; }
              }
            });
          }
          maybeRefetchActiveQueries(client, `memory update for shortId ${shortId}`, true);
        } else {
          dlog("[AID injected] Apollo Client not found on page for memory update.");
        }
      } catch (err) {
        console.error("[AID injected] Failed to silently update Apollo Client cache for memory:", err);
      }
    }
    if (ev.data?.kind === "approvedState" && typeof ev.data.shortId === "string" && typeof ev.data.type === "string" && typeof ev.data.text === "string") {
      const shortId = ev.data.shortId;
      const type = ev.data.type;
      const text = ev.data.text;
      const previousText = typeof ev.data.previousText === "string" ? ev.data.previousText : undefined;

      try {
        const client = getApolloClient();
        const advKey = client ? findAdventureCacheId(client, shortId) : null;

        if (type === "ain") {
          updateOpenAINEditorDom(text, previousText);
          if (client && advKey) {
            dlog("[AID injected] Performing direct cache update for AI Instructions:", advKey);
            client.cache.modify({
              id: advKey,
              fields: {
                state(existing: any) {
                  return {
                    ...existing,
                    instructions: {
                      ...(existing?.instructions || {}),
                      custom: text
                    }
                  };
                }
              }
            });
            maybeRefetchActiveQueries(client, `AI Instructions update for shortId ${shortId}`, true);
          }
        } else if (type === "an") {
          updateOpenANEditorDom(text, previousText);
          if (client && advKey) {
            dlog("[AID injected] Performing direct cache update for Author's Note:", advKey);
            client.cache.modify({
              id: advKey,
              fields: {
                authorsNote() { return text; }
              }
            });
            maybeRefetchActiveQueries(client, `Author's Note update for shortId ${shortId}`, true);
          }
        } else if (type === "pe") {
          updateOpenPlotEditorDom(text, previousText);
          if (client && advKey) {
            dlog("[AID injected] Performing direct cache update for Plot Essentials:", advKey);
            client.cache.modify({
              id: advKey,
              fields: {
                memory() { return text; }
              }
            });
            maybeRefetchActiveQueries(client, `Plot Essentials update for shortId ${shortId}`, true);
          }
        }
      } catch (err) {
        console.error("[AID injected] Failed to silently update Apollo Client cache for state:", err);
      }
    }
    if (ev.data?.kind === "actionApproved" && typeof ev.data.requestId === "string") {
      const resolve = pendingActionResolvers.get(ev.data.requestId);
      if (resolve) {
        pendingActionResolvers.delete(ev.data.requestId);
        resolve({ updatedNames: ev.data.updatedNames || [], injectText: ev.data.injectText || "" });
      }
    }
    if (ev.data?.kind === "settingsUpdate") {
      if (typeof ev.data.interceptTimeout === "number") {
        interceptTimeoutMs = ev.data.interceptTimeout * 1000;
        dlog("[AID injected] Updated action intercept timeout (ms):", interceptTimeoutMs);
      }
      if (typeof ev.data.debug === "boolean") {
        showDebug = ev.data.debug;
      }
    }
  });

  // Extract adventure metadata (title/memory/storyCards) from a parsed GQL response batch
  // and forward it to the content script.
  function postAdventureLoaded(responseJson: any, requestBody?: string) {
    const batch = Array.isArray(responseJson) ? responseJson : [responseJson];
    let reqBatch: any[] = [];
    if (requestBody) {
      try {
        const parsed = JSON.parse(requestBody);
        reqBatch = Array.isArray(parsed) ? parsed : [parsed];
      } catch {}
    }

    for (let i = 0; i < batch.length; i++) {
      const item = batch[i];
      let adv = item?.data?.adventure;
      
      const updateAdv = item?.data?.updateAdventurePlot?.adventure;
      if (updateAdv) {
        adv = updateAdv;
      }

      const updateStateAdv = item?.data?.updateAdventureState?.adventure || item?.data?.updateAdventureState;
      if (updateStateAdv) {
        adv = updateStateAdv;
      }

      if (adv) {
        let shortId = adv.shortId;
        if (!shortId && reqBatch[i]) {
          const vars = reqBatch[i].variables || {};
          const rawId = vars.shortId || vars.input?.shortId || vars.adventureId || vars.input?.adventureId;
          shortId = rawId ? getShortIdFromAdventureId(rawId) : null;
        }

        if (shortId) {
          if (adv.id) {
            adventureIdMap.set(shortId, adv.id);
            dlog("[AID injected] Mapped shortId to adventureId:", shortId, "->", adv.id);
          }
          post({
            transport: "adventureLoaded",
            shortId,
            title: adv.title,
            memory: adv.memory || adv.state?.memory,
            authorsNote: adv.authorsNote,
            instructions: typeof adv.state?.instructions === "string" ? adv.state.instructions : (adv.state?.instructions?.custom || ""),
            storyCards: adv.storyCards
          });
        }
      }
    }
  }

  async function maybeInterceptAction(batch: any[]): Promise<{ updatedNames: string[]; injected: boolean }> {
    const actionReq = batch.find((item: any) => item.operationName === "ActionRequest");
    if (!actionReq) return { updatedNames: [], injected: false };

    const actionInput = actionReq.variables?.input;
    const actionText = actionInput?.text;
    const actionType = actionInput?.type;
    const adventureId = actionInput?.adventureId;
    let shortId = adventureId ? getShortIdFromAdventureId(adventureId) : null;

    if (!shortId || /^\d+$/.test(String(shortId))) {
      for (const sib of batch) {
        const sid = sib?.variables?.shortId || sib?.variables?.input?.shortId || sib?.variables?.adventureId || sib?.variables?.input?.adventureId;
        if (sid) {
          const resolved = getShortIdFromAdventureId(String(sid));
          if (resolved && !/^\d+$/.test(resolved)) {
            shortId = resolved;
            break;
          }
        }
      }
    }

    const isInterceptionTarget = !!(shortId && (
      (actionText && (actionType === "do" || actionType === "say" || actionType === "story")) ||
      (actionType === "retry" || actionType === "continue")
    ));

    var startTime = Date.now();
    dlog("[AID injected] maybeInterceptAction check:", {
      adventureId,
      resolvedShortId: shortId,
      actionType,
      hasText: !!actionText,
      isTarget: isInterceptionTarget
    });

    if (isInterceptionTarget) {
      dlog("[AID injected] Intercepted ActionRequest for MemorAID pre-run:", actionText || `(${actionType})`);
      setPlaceholderText("[MemorAID] Character is reflecting...");

      var requestId = Math.random().toString(36).substring(7);
      var promise = new Promise<{ updatedNames: string[]; injectText: string }>((resolve) => {
        pendingActionResolvers.set(requestId, resolve);
      });

      post({
        transport: "interceptedAction",
        requestId,
        shortId,
        text: actionText,
        type: actionType
      });

      var timedOut = false;
      const timeoutId = setTimeout(() => {
        const resolve = pendingActionResolvers.get(requestId);
        if (resolve) {
          console.warn(`[AID injected] Interception timed out after ${Date.now() - startTime}ms. Releasing ActionRequest.`);
          pendingActionResolvers.delete(requestId);
          timedOut = true;
          restorePlaceholder();
          resolve({ updatedNames: [], injectText: "" });
        }
      }, interceptTimeoutMs);

      const { updatedNames, injectText } = await promise;

      // Append the Living Characters directive to the outgoing action text. Mutating actionInput is
      // enough for the fetch path (the caller re-serializes init.body when injected); the XHR/WebSocket
      // paths re-send the raw body, so injection applies on the fetch transport only.
      let injected = false;
      if (injectText && actionInput && typeof actionInput.text === "string") {
        actionInput.text = `${actionInput.text} ${injectText}`.trim();
        injected = true;
        dlog("[AID injected] Appended Living Characters directive to outgoing action.");
      }

      if (!timedOut) {
        clearTimeout(timeoutId);
        dlog(`[AID injected] Interception approved after ${Date.now() - startTime}ms. updatedNames:`, updatedNames);
        if (updatedNames && updatedNames.length > 0) {
          flashPlaceholder(`[MemorAID] Thoughts synchronized: ${updatedNames.join(", ")}!`);
        } else {
          restorePlaceholder();
        }
      }
      return { updatedNames, injected };
    }
    return { updatedNames: [], injected: false };
  }

  // --- fetch ---
  const _fetch = window.fetch;
  window.fetch = async function (input: any, init?: any) {
    // Extension-relayed background requests bypass ALL interception (see __aidRelay above).
    if (init && (init as any).__aidRelay) {
      return _fetch(input, init);
    }
    const url = typeof input === "string" ? input : (input as Request)?.url;
    let res: Response | null = null;
    let fetchCalled = false;

    // Intercept and rewrite Story Card autosave payloads if we have a newer approved value
    if (isGql(url) && init?.body) {
      try {
        const bodyObj = JSON.parse(init.body);
        const batch = Array.isArray(bodyObj) ? bodyObj : [bodyObj];

        // 1. Intercept player action (ActionRequest) for MemorAID pre-run thought generation
        //    and Living Characters prompt-injection directive append.
        let actionInjected = false;
        const actionReq = batch.find((item: any) => item.operationName === "ActionRequest");
        if (actionReq) {
          const r = await maybeInterceptAction(batch);
          actionInjected = r.injected;
        }

        // 1b. Native card generation: AID's own "Generate" issues a card-generation mutation whose
        // fresh value the stale-value guard would otherwise revert. Release the guard for the target
        // card(s) if we can read their id; else briefly suspend the response-override so the generated
        // value can't be clobbered. The generated value is adopted from the response below.
        if (requestHasNativeCardGeneration(batch)) {
          const genIds = generatedCardIdsFromRequest(batch);
          if (genIds.length) {
            for (const gid of genIds) { approvedCards.delete(gid); approvedCardKeys.delete(gid); }
            dlog("[AID injected] Native card generation — released stale-value guard for:", genIds.join(", "));
          } else {
            overridesSuppressedUntil = Date.now() + GENERATE_SUPPRESS_MS;
            dlog("[AID injected] Native card generation (target id not in request) — suspending response overrides briefly.");
          }
        }

        // 2. Perform client-side GraphQL Deduplication & Debouncing
        // Clean up old entries from lastSentWrites map to prevent memory growth
        if (lastSentWrites.size > 200) {
          const threshold = Date.now() - WRITE_DEBOUNCE_MS * 2;
          for (const [id, record] of lastSentWrites.entries()) {
            if (record.timestamp < threshold) {
              lastSentWrites.delete(id);
            }
          }
        }

        const now = Date.now();
        const writesInThisBatch = new Map<string, string>(); // cardId -> cardWriteSig
        const decisions: {
          originalIndex: number;
          operationName: string;
          shouldMock: boolean;
          mockResponse?: any;
          cardInput?: any;
        }[] = [];

        const itemsToSend: any[] = [];
        let hasCardWrites = false;
        let plotRewritten = false;

        for (let i = 0; i < batch.length; i++) {
          const item = batch[i];

          // Stale-autosave protection for Plot Essentials: if the page autosaves the EXACT
          // pre-update memory text (its editor never learned about the extension's push),
          // rewrite it to the approved memory so the server isn't silently reverted.
          // A user edit differs from the pre-update text and passes through untouched —
          // it then becomes the new source of truth.
          if (item.operationName === "UpdateAdventurePlot" && typeof item.variables?.input?.memory === "string") {
            const adventureId = item.variables.input.shortId || item.variables.input.adventureId;
            const plotSid = adventureId ? getShortIdFromAdventureId(adventureId) : null;
            const approvedMem = plotSid ? approvedMemories.get(String(plotSid)) : undefined;
            if (approvedMem) {
              const outgoing = normMem(item.variables.input.memory);
              if (approvedMem.previous && outgoing === normMem(approvedMem.previous) && outgoing !== normMem(approvedMem.memory)) {
                dlog("[AID injected] Intercepted stale Plot Essentials autosave. Overriding with approved memory for", plotSid);
                item.variables.input.memory = approvedMem.memory;
                plotRewritten = true;
              } else {
                // The page sent something else (user edit or already-synced text): adopt it as
                // the new truth so we never fight the user's own changes.
                approvedMemories.set(String(plotSid), { memory: item.variables.input.memory });
              }
            }
          }

          const isCardWrite = item.operationName === "UseAutoSaveStoryCard" || item.operationName === "SaveQueueStoryCard";
          const cardInput = item.variables?.input;
          const cardId = cardInput?.id;

          if (isCardWrite && cardInput && cardId) {
            hasCardWrites = true;
            // Apply approved overrides first
            if (approvedCards.has(cardId)) {
              if (isEditingInGui(cardInput)) {
                dlog("[AID injected] User is editing manually in GUI. Updating approvedCards registry for card ID:", cardId);
                approvedCards.set(cardId, { value: cardInput.value, description: cardInput.description });
              } else {
                const approved = approvedCards.get(cardId)!;
                if (cardInput.value !== approved.value) {
                  dlog("[AID injected] Intercepted Story Card autosave. Overriding stale value for card ID:", cardId);
                  cardInput.value = approved.value;
                }
                if (approved.description !== undefined && cardInput.description !== approved.description) {
                  dlog("[AID injected] Intercepted Story Card autosave. Overriding stale description for card ID:", cardId);
                  cardInput.description = approved.description;
                }
              }
            }
            // Keys protection runs INDEPENDENTLY of the value/description isEditingInGui branch:
            // a stale autosave (keys == pre-update set) is rewritten to the approved keys; any
            // other keys value is a real user edit and becomes the new truth. (Mutating cardInput
            // in place is enough — itemsToSend holds the same reference.)
            applyApprovedKeys(cardInput);

            const sig = cardWriteSig(cardInput);
            let shouldMock = false;
            let mockReason = "";

            const batchDup = writesInThisBatch.get(cardId);
            if (batchDup === sig) {
              shouldMock = true;
              mockReason = "batch duplicate";
            } else {
              const recent = lastSentWrites.get(cardId);
              if (recent && (now - recent.timestamp) < WRITE_DEBOUNCE_MS && recent.sig === sig) {
                shouldMock = true;
                mockReason = "recent debounce";
              }
            }

            if (shouldMock) {
              dlog(`[AID injected] Debouncing/Deduplicating card write for ID: ${cardId} (${mockReason})`);
              decisions.push({
                originalIndex: i,
                operationName: item.operationName,
                shouldMock: true,
                mockResponse: buildMockCardResponse(item.operationName, cardInput),
                cardInput
              });
            } else {
              writesInThisBatch.set(cardId, sig);
              lastSentWrites.set(cardId, { sig, timestamp: now });
              decisions.push({
                originalIndex: i,
                operationName: item.operationName,
                shouldMock: false,
                cardInput
              });
              itemsToSend.push(item);
            }
          } else {
            decisions.push({
              originalIndex: i,
              operationName: item.operationName || "",
              shouldMock: false
            });
            itemsToSend.push(item);
          }
        }

        // A rewritten Plot Essentials payload (or an injected action) must be re-serialized for the
        // non-stripped send path (the stripped path rebuilds its body from itemsToSend refs and picks
        // it up).
        if (plotRewritten || actionInjected) {
          init.body = JSON.stringify(bodyObj);
        }

        // Only act if we actually have card writes and we've modified/stripped/debounced something
        if (hasCardWrites && itemsToSend.length < batch.length) {
          if (itemsToSend.length === 0) {
            // All operations in this batch are mocked/debounced!
            dlog("[AID injected] All operations in batch were debounced/deduplicated. Returning mock response.");
            const responseData = Array.isArray(bodyObj)
              ? decisions.map(d => d.mockResponse)
              : decisions[0]?.mockResponse;
            res = new Response(JSON.stringify(responseData), {
              status: 200,
              statusText: "OK",
              headers: new Headers({ "content-type": "application/json" })
            });
            fetchCalled = true;
          } else {
            // Mix of sent and mocked operations. Send the stripped batch.
            dlog(`[AID injected] Stripped batch: sending ${itemsToSend.length}/${batch.length} operations to server.`);
            const newBody = Array.isArray(bodyObj) ? itemsToSend : itemsToSend[0];
            const modifiedInit = {
              ...init,
              body: JSON.stringify(newBody)
            };
            
            const realRes = await _fetch(input, modifiedInit);
            fetchCalled = true;

            // Keep an unread clone for fallback — once .json() consumes realRes's body, handing
            // realRes to the page makes its body-read throw, which kills Apollo's request loop
            // (the page stops updating until reload).
            const realResClone = realRes.clone();
            try {
              const serverJson = await realRes.json();
              const serverBatch = Array.isArray(serverJson) ? serverJson : [serverJson];
              if (serverBatch.length !== itemsToSend.length) {
                throw new Error(`stripped-batch response mismatch: sent ${itemsToSend.length}, got ${serverBatch.length}`);
              }
              let serverIndex = 0;
              const combinedBatch = decisions.map(dec => {
                if (dec.shouldMock) {
                  return dec.mockResponse;
                } else {
                  return serverBatch[serverIndex++];
                }
              });
              const combinedJson = Array.isArray(bodyObj) ? combinedBatch : combinedBatch[0];

              const resHeaders = new Headers();
              realRes.headers.forEach((val, key) => {
                resHeaders.set(key, val);
              });

              res = new Response(JSON.stringify(combinedJson), {
                status: realRes.status,
                statusText: realRes.statusText,
                headers: resHeaders
              });
            } catch (err) {
              console.warn("[AID injected] Failed to merge server batch response, falling back to raw response:", err);
              res = realResClone;
            }
          }
        } else {
          // If we had no card writes, or we had card writes but nothing was debounced/deduplicated,
          // check if we updated card values in place via approved overrides
          let modified = false;
          for (const item of batch) {
            if (item.operationName === "UseAutoSaveStoryCard" || item.operationName === "SaveQueueStoryCard") {
              const cardInput = item.variables?.input;
              if (cardInput && cardInput.id && approvedCards.has(cardInput.id)) {
                if (isEditingInGui(cardInput)) {
                  dlog("[AID injected] User is editing manually in GUI (fallback). Updating approvedCards registry for card ID:", cardInput.id);
                  approvedCards.set(cardInput.id, { value: cardInput.value, description: cardInput.description });
                } else {
                  const approved = approvedCards.get(cardInput.id)!;
                  if (cardInput.value !== approved.value) {
                    cardInput.value = approved.value;
                    modified = true;
                  }
                  if (approved.description !== undefined && cardInput.description !== approved.description) {
                    cardInput.description = approved.description;
                    modified = true;
                  }
                }
              }
              // Keys protection is independent of the value/description editing heuristic.
              if (cardInput && applyApprovedKeys(cardInput)) modified = true;
            }
          }
          if (modified) {
            init.body = JSON.stringify(bodyObj);
          }
        }

        // Forward the FINAL card-write inputs (post-override) to the extension so GUI edits
        // reach the local DB immediately. Beta does not reliably broadcast
        // AdventureStoryCardsUpdate over WS, so without this, cards edited in AID's UI
        // (e.g. Configure MemorAID) only propagate on the next page reload's gameplay fetch.
        // Mocked (debounced-duplicate) writes are skipped — their content was forwarded
        // when the original write went out.
        try {
          const savedCards = decisions
            .filter((d) => !d.shouldMock && d.cardInput && d.cardInput.id)
            .map((d) => d.cardInput);
          if (savedCards.length) {
            dlog("[AID injected] Forwarding page card writes to extension:", savedCards.length);
            post({ transport: "cardWrites", cards: savedCards });
          }
        } catch { /* never block the request on forwarding */ }
      } catch (err) {
        console.warn("[AID injected] Error inside fetch interceptor try block:", err);
      }
    }

    if (!fetchCalled || !res) {
      res = await _fetch(input, init);
    }
    if (isGql(url)) {
      // Only ever touch plain JSON responses. Anything else (streamed/multipart/event-stream)
      // must pass through untouched and IMMEDIATELY — awaiting .json() on a streamed response
      // blocks the page's fetch until the stream closes, freezing UI updates.
      const contentType = (res.headers.get("content-type") || "").toLowerCase();
      const isJsonResponse = contentType.includes("json");

      if (isJsonResponse && approvedCards.size > 0) {
        // Overrides may need to rewrite stale card values BEFORE the page parses the body,
        // so this path is synchronous by necessity.
        try {
          const clone = res.clone();
          const responseJson = await clone.json();

          // Native card generation: adopt the freshly generated value(s) as the new authoritative
          // value BEFORE the stale-value override runs, so the generation is not reverted (and any
          // later autosave is protected at the new value, not the pre-generation snapshot).
          try {
            for (const u of collectGeneratedCardUpdates(init?.body, responseJson)) {
              approvedCards.set(u.id, { value: u.value, description: u.description ?? approvedCards.get(u.id)?.description });
              dlog("[AID injected] Adopted natively-generated value for card:", u.id);
            }
          } catch { /* ignore adoption errors, fall through to override */ }

          // Skip the stale-value override entirely while a native generation is in flight whose target
          // id we couldn't read from the request (the generated value may arrive in a later fetch).
          const overridesSuppressed = Date.now() < overridesSuppressedUntil;
          const modified = overridesSuppressed ? false : applyResponseOverrides(responseJson);
          postAdventureLoaded(responseJson, init?.body);

          if (modified) {
            const resHeaders = new Headers();
            res.headers.forEach((val, key) => {
              resHeaders.set(key, val);
            });
            res = new Response(JSON.stringify(responseJson), {
              status: res.status,
              statusText: res.statusText,
              headers: resHeaders
            });
          }
        } catch (err) {
          // Ignore parsing errors and keep the original response
        }
      } else if (isJsonResponse) {
        // No overrides registered — never block the page on body parsing (fire-and-forget,
        // the pre-debounce behavior).
        try {
          res.clone().json().then((responseJson: any) => postAdventureLoaded(responseJson, init?.body)).catch(() => {});
        } catch { /* ignore */ }
      }

      const activeSid = (() => {
        const m = window.location.pathname.match(/\/play\/([^\/]+)/) || 
                  window.location.pathname.match(/\/adventure\/([^\/]+)/) ||
                  window.location.pathname.match(/\/scenario\/([^\/]+)/);
        return m ? m[1]! : null;
      })();

      let skipLog = false;
      if (init?.body) {
        try {
          const bodyObj = JSON.parse(init.body);
          const batch = Array.isArray(bodyObj) ? bodyObj : [bodyObj];
          for (const item of batch) {
            const vars = item.variables || {};
            const itemSid = vars.shortId || vars.input?.shortId || vars.adventureId || vars.input?.adventureId;
            const isMatch = itemSid && (
              String(itemSid) === activeSid || 
              (activeSid ? adventureIdMap.get(activeSid) === String(itemSid) : false)
            );
            if (activeSid && itemSid && !isMatch) {
              skipLog = true;
              break;
            }
          }
        } catch {}
      }

      if (!skipLog) {
        dlog("[AID GQL Request]", init?.body);
      }

      try {
        const ops = extractOps(init?.body);

        // Capture auth token from request headers (never modifies the request).
        const hdrs = new Headers(
          (init && (init.headers as HeadersInit)) ||
          (typeof input !== "string" && input ? (input as Request).headers : undefined) ||
          {}
        );
        const auth = hdrs.get("authorization");
        if (auth) post({ transport: "auth", token: auth });

        // Post observed op shapes for the registry.
        if (ops.length && !skipLog) post({ transport: "op", ops, url });
      } catch { /* ignore */ }
    }
    return res;
  };

  // --- XMLHttpRequest interceptor ---
  const _xhrOpen = XMLHttpRequest.prototype.open;
  const _xhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (this: any, method: string, url: string, ...rest: any[]) {
    this.__aidUrl = url;
    return (_xhrOpen as any).apply(this, [method, url, ...rest]);
  };
  XMLHttpRequest.prototype.send = function (this: any, body?: any) {
    const self = this;
    const args = arguments;

    self.addEventListener("load", function() {
      try {
        if (isGql(self.__aidUrl) && self.responseText) {
          const resJson = JSON.parse(self.responseText);
          postAdventureLoaded(resJson, body);
        }
      } catch { /* ignore */ }
    });

    try {
      if (isGql(self.__aidUrl) && typeof body === "string") {
        const parsed = JSON.parse(body);
        const batch = Array.isArray(parsed) ? parsed : [parsed];
        const actionReq = batch.find((item: any) => item.operationName === "ActionRequest");
        if (actionReq) {
          dlog("[AID injected] Intercepted ActionRequest over XHR for MemorAID pre-run!");
          (async () => {
            try {
              await maybeInterceptAction(batch);
            } catch (err) {
              console.error("[AID injected] Error during XHR ActionRequest interception:", err);
            } finally {
              _xhrSend.apply(self, args as any);
            }
          })();
          return;
        }
      }
    } catch (err) {
      dlog("[AID injected] Error checking XHR body for ActionRequest:", err);
    }

    return (_xhrSend as any).apply(self, args);
  };

  // --- WebSocket (graphql-ws) ---
  const tracker = new WsTracker();
  const _WS = window.WebSocket;
  function WSProxy(url: string, protocols?: any) {
    dlog("[AID WS Proxy] Created new WebSocket connection to:", url);
    const ws = protocols !== undefined ? new _WS(url, protocols) : new _WS(url);
    if (isGql(url) || /graphql|subscription/i.test(String(url))) {
      const _send = ws.send.bind(ws);
      ws.send = function (data: any) {
        if (typeof data === "string") {
          tracker.handle(data); // learn subscribe ids
          try {
            const p = JSON.parse(data);
            const op = p?.payload?.operationName || p?.operationName;
            if (op === "ActionRequest") {
              dlog("[AID injected] Intercepted ActionRequest over WebSocket for MemorAID pre-run!");
              const batch = [p?.payload || p];
              (async () => {
                try {
                  await maybeInterceptAction(batch);
                } catch (err) {
                  console.error("[AID injected] Error during WebSocket ActionRequest interception:", err);
                } finally {
                  _send(data);
                }
              })();
              return;
            }
          } catch { /* ignore */ }
        }
        return _send(data);
      };
      ws.addEventListener("message", (ev) => {
        if (typeof ev.data !== "string") return;
        const resolved = tracker.handle(ev.data);
        // Only forward whitelisted operations — ContextUpdate is never posted.
        if (resolved && WS_ALLOW.has(resolved.operationName)) {
          const activeSid = (() => {
            const m = window.location.pathname.match(/\/play\/([^\/]+)/) || 
                      window.location.pathname.match(/\/adventure\/([^\/]+)/) ||
                      window.location.pathname.match(/\/scenario\/([^\/]+)/);
            return m ? m[1]! : null;
          })();

          let skipWs = false;
          if (activeSid) {
            // First check the subscription's resolved shortId
            if (resolved.shortId && !/^\d+$/.test(resolved.shortId) && resolved.shortId !== activeSid) {
              skipWs = true;
            } else if (resolved.data) {
              // Fallback: check the payload structure
              const data = resolved.data as any;
              const adv = data?.adventureMetadataUpdate || data?.adventureStoryCardsUpdate || data?.memoryBankUpdateUpdate || data?.memory || data?.actionUpdates;
              const itemSid = adv?.shortId || adv?.adventure?.shortId || adv?.adventureId;
              if (itemSid && !/^\d+$/.test(String(itemSid)) && String(itemSid) !== activeSid) {
                skipWs = true;
              }
            }
          }

          dlog("[AID WS Message]", resolved.operationName, "resolved shortId:", resolved.shortId, "activeSid:", activeSid, "skip:", skipWs);

          if (!skipWs) {
            post({ transport: "ws", operationName: resolved.operationName, data: resolved.data });
          }
        }
      });
    }
    return ws as WebSocket;
  }
  (WSProxy as any).prototype = _WS.prototype;
  (WSProxy as any).CONNECTING = 0; (WSProxy as any).OPEN = 1; (WSProxy as any).CLOSING = 2; (WSProxy as any).CLOSED = 3;
  window.WebSocket = WSProxy as any;
})();
