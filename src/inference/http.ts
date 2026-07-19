// Shared HTTP helper for provider API calls: per-attempt timeout (AbortController) + retry with
// backoff that honors a `Retry-After` header. Every provider's infer()/complete() network call routes
// through this so a transient 429/5xx or a hung socket doesn't silently drop a generation — important
// now that MemorAID fans out several calls concurrently, which raises the odds of a rate-limit hit.

export interface FetchRetryOptions {
  /** Abort a single attempt after this many ms (default 60_000). */
  timeoutMs?: number;
  /** Total attempts including the first (default 3). */
  maxAttempts?: number;
  /** Which HTTP statuses are worth retrying (default: 408/409/425/429 and any 5xx). */
  isRetryable?: (status: number) => boolean;
  /** Label used in the thrown error message ("Claude", "OpenAI", ...). */
  label?: string;
}

const DEFAULT_RETRYABLE = (s: number): boolean =>
  s === 408 || s === 409 || s === 425 || s === 429 || (s >= 500 && s < 600);

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Parse a `Retry-After` header (delta-seconds or an HTTP date) into seconds, or null. */
export function parseRetryAfter(header: string | null | undefined): number | null {
  if (!header) return null;
  const secs = Number(header);
  if (Number.isFinite(secs)) return Math.max(0, secs);
  const when = Date.parse(header);
  if (!Number.isNaN(when)) return Math.max(0, (when - Date.now()) / 1000);
  return null;
}

/** Backoff for `attempt` (0-based): honor Retry-After when present, else exponential w/ an 8s cap. */
function backoffMs(attempt: number, retryAfterSec: number | null): number {
  if (retryAfterSec != null) return Math.min(retryAfterSec * 1000, 30_000);
  return Math.min(500 * 2 ** attempt, 8_000);
}

/**
 * fetch() with a per-attempt timeout and retry/backoff. Returns the Response for the caller to read
 * (including a final non-OK response, so provider-specific error messages are preserved). Throws only
 * when every attempt fails at the network layer (connection error or timeout).
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options?: FetchRetryOptions,
): Promise<Response> {
  const {
    timeoutMs = 60_000,
    maxAttempts = 3,
    isRetryable = DEFAULT_RETRYABLE,
    label = "provider",
  } = options || {};

  let lastErr = "";
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) return res;
      if (isRetryable(res.status) && attempt < maxAttempts - 1) {
        await sleep(backoffMs(attempt, parseRetryAfter(res.headers?.get?.("retry-after"))));
        continue;
      }
      return res; // non-retryable, or out of attempts: let the caller surface the error body
    } catch (err: any) {
      clearTimeout(timer);
      lastErr = err?.name === "AbortError" ? `timed out after ${timeoutMs}ms` : err?.message || String(err);
      if (attempt < maxAttempts - 1) {
        await sleep(backoffMs(attempt, null));
        continue;
      }
      throw new Error(`${label} request failed: ${lastErr}`);
    }
  }
  throw new Error(`${label} request failed: ${lastErr}`);
}
