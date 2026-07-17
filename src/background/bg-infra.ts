import { Repo } from "../storage/repo";

/** Shared background-worker infrastructure: storage handle, AID auth/session state, the
 *  timeout+relay fetch used for all AID GraphQL calls, debug logging, and tab broadcast.
 *  Extracted from background.ts so the engine modules (life cards, crystallized, MemorAID)
 *  and the message-handler orchestration can share one instance of each. */

export const repo = new Repo();

/** In-memory AID session (never persisted to disk; mirrored to storage.session for MV3 recycling). */
export const auth = {
  sessionToken: null as string | null,
  gqlEndpoint: null as string | null,
};

let debugEnabled = false;
const _log = console.log.bind(console);
export function dlog(...args: unknown[]) { if (debugEnabled) _log(...args); }
export function setDebugEnabled(v: boolean) { debugEnabled = v; }

const _originalFetch = globalThis.fetch;

// Background AID fetches previously had no timeout: a single stalled request would hang the
// awaiting turn-check chain forever (symptom: MemorAID stops working until the page is refreshed
// and the MV3 worker restarts). Abort any background request that exceeds this budget so the
// awaiting chain rejects and self-recovers instead of hanging indefinitely.
const AID_FETCH_TIMEOUT_MS = 30000;
async function fetchWithTimeout(url: string, init?: any): Promise<any> {
  if (init?.signal) return _originalFetch(url, init); // caller manages its own abort
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AID_FETCH_TIMEOUT_MS);
  try {
    return await _originalFetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRelay(url: string, init?: any): Promise<any> {
  try {
    return await fetchWithTimeout(url, init);
  } catch (err: any) {
    const isNetworkError = err && (err.name === "TypeError" || err.message?.includes("NetworkError") || err.message?.includes("fetch"));
    if (isNetworkError && url && (url.includes("aidungeon.com") || url === auth.gqlEndpoint)) {
      let shortId: string | null = null;
      if (init?.body) {
        try {
          const bodyObj = JSON.parse(init.body);
          const batch = Array.isArray(bodyObj) ? bodyObj : [bodyObj];
          for (const item of batch) {
            const vars = item.variables || {};
            shortId = vars.shortId || vars.input?.shortId || vars.adventureId || vars.input?.adventureId;
            if (shortId) break;
          }
        } catch {}
      }

      if (shortId) {
        dlog(`[AID bg] Background fetch to ${url} failed. Relaying request via content script for adventure ${shortId}...`);
        try {
          const tabs = await browser.tabs.query({ url: "*://*.aidungeon.com/*" }).catch(() => []);
          let targetTabId: number | null = null;
          for (const tab of tabs) {
            if (tab.id && tab.url && tab.url.includes(shortId!)) {
              targetTabId = tab.id;
              break;
            }
          }
          if (!targetTabId && tabs.length > 0 && tabs[0]?.id !== undefined) {
            targetTabId = tabs[0].id;
          }
          if (targetTabId) {
            const res: any = await browser.tabs.sendMessage(targetTabId, {
              kind: "relayFetch",
              url,
              init: {
                method: init.method,
                headers: init.headers,
                body: init.body
              }
            });
            if (res && typeof res === "object") {
              if (!res.error) {
                dlog("[AID bg] Relay fetch successful.");
                return {
                  ok: res.ok,
                  status: res.status,
                  statusText: res.statusText,
                  headers: new Headers(res.headers || {}),
                  text: async () => res.body,
                  json: async () => JSON.parse(res.body),
                  clone() { return this; }
                } as any;
              } else {
                console.error("[AID bg] Content script returned relay error:", res.error);
                throw new Error(res.error);
              }
            }
          }
        } catch (fallbackErr) {
          console.error("[AID bg] Relay fetch fallback failed:", fallbackErr);
        }
      }
    }
    throw err;
  }
}
/** The fetch used for ALL background AID requests (timeout + content-script relay fallback). */
export const aidFetch = fetchWithRelay;

// storage.session is held in memory and cleared when the browser closes — it is NEVER written
// to disk. We mirror the token/endpoint there so they survive the MV3 event page being unloaded
// while idle; otherwise a push after the background recycled would fail with "no session token".
const sessionStore = (browser.storage as any).session as
  | { get(keys: string[]): Promise<any>; set(items: any): Promise<void> }
  | undefined;

export async function rememberAuth(opts: { token?: string; endpoint?: string }): Promise<void> {
  // Persist ONLY to storage.session (in-memory, session-scoped): the bearer token is never written
  // to persistent disk. It survives MV3 worker recycling within a browser session; a fresh session
  // re-captures it from the first authenticated page request the interceptor sees.
  const patch: Record<string, string> = {};
  if (opts.token) { auth.sessionToken = opts.token; patch.aidToken = opts.token; }
  if (opts.endpoint) { auth.gqlEndpoint = opts.endpoint; patch.aidEndpoint = opts.endpoint; }
  if (sessionStore && Object.keys(patch).length > 0) { try { await sessionStore.set(patch); } catch {} }
}

/** Rehydrate token/endpoint from storage.session if the in-memory copies were lost to worker recycling. */
export async function ensureAuth(): Promise<void> {
  if (auth.sessionToken && auth.gqlEndpoint) return;
  if (!sessionStore) return;
  try {
    const s = await sessionStore.get(["aidToken", "aidEndpoint"]);
    if (!auth.sessionToken && s?.aidToken) auth.sessionToken = s.aidToken;
    if (!auth.gqlEndpoint && s?.aidEndpoint) auth.gqlEndpoint = s.aidEndpoint;
  } catch {}
}

export function isSafeEndpoint(url: string | null): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return (u.hostname === "aidungeon.com" || u.hostname.endsWith(".aidungeon.com")) && u.pathname === "/graphql";
  } catch { return false; }
}

export async function broadcastToTabs(msg: any) {
  try {
    const tabs = await browser.tabs.query({ url: "*://*.aidungeon.com/*" }).catch(() => []);
    for (const tab of tabs) {
      if (tab.id) {
        browser.tabs.sendMessage(tab.id, msg).catch(() => {});
      }
    }
  } catch (err) {
    console.error("[AID bg] Failed to broadcast message to tabs:", err);
  }
}
