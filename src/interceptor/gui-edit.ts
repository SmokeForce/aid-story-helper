// Pure helper for the injected interceptor's "is the user editing this card in AID's GUI?"
// heuristic. Extracted from injected.ts (a page-context IIFE) so it can be unit-tested.

/** True when the element is a text-entry field (textarea/input). */
function isTextField(el: Element | null | undefined): boolean {
  return !!el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT");
}

/**
 * Pick the text field that represents the user's active card edit.
 *
 * `document.activeElement` is NEVER null — it falls back to <body>, and becomes the
 * "Finish"/"Update" button the moment the user clicks it to save. So by the time a Story
 * Card autosave fires, the focused element is usually NOT the textarea the user just typed
 * into. We therefore prefer the currently-focused field, but fall back to the most-recently
 * focused field (tracked on input/change/focusin) when the current focus is not itself a
 * text field — provided that focus was recent.
 *
 * Previously the injected code used `document.activeElement || lastActiveElement`, but since
 * `activeElement` is never null the fallback never ran: clicking "Finish" left `activeElement`
 * as the button, the tag check failed, the edit was treated as a stale autosave, and the
 * genuine edit was overwritten with the seeded approved value.
 */
export function pickActiveField(
  activeEl: Element | null,
  lastActiveEl: Element | null,
  lastActiveTime: number,
  now: number,
  recentMs = 15000
): Element | null {
  if (isTextField(activeEl)) return activeEl;
  if (isTextField(lastActiveEl) && (now - lastActiveTime) < recentMs) return lastActiveEl;
  return null;
}

/** Normalize an editor/card value for comparison (trim + CRLF→LF), matching isEditingInGui. */
function normalizeEntry(s: string | undefined): string {
  return (s || "").trim().replace(/\r\n/g, "\n");
}

/**
 * Decide whether AID's OPEN card editor may be overwritten with a card's newly generated value.
 *
 * The editor DOM is card-AGNOSTIC — the interceptor can locate "the open dialog" but not which card
 * it belongs to. Without this check, a background regeneration for card X writes its content into
 * whatever editor happens to be open (card Y), and AID's own autosave then persists it — the
 * reported "an existing character Story Card suddenly becomes a MemorAID card" / "the card is just
 * gone" data loss.
 *
 * We only write when the open editor is PROVABLY the same card:
 *  - it already shows the new value (this card, already current), or
 *  - it shows the value we last knew this card to have (`expectedCurrent`).
 *
 * Anything else — including `expectedCurrent === undefined`, meaning we have no prior for this card
 * and therefore cannot establish identity — declines the write. Declining is safe and invisible: the
 * value is already persisted server-side, so the Apollo cache update and the next refetch render it
 * correctly. Refusing to write can only ever lose a cosmetic in-place update; writing to the wrong
 * card destroys user data.
 */
export function shouldUpdateOpenEditor(opts: {
  /** Current contents of the open editor's entry textarea, or undefined if none was resolved. */
  shown: string | undefined;
  /** The new value being pushed for this card. */
  newValue: string;
  /** The value this card was last known to show, if any. */
  expectedCurrent?: string;
}): boolean {
  // No entry textarea resolved: nothing to compare and nothing meaningful to clobber.
  if (opts.shown === undefined) return true;
  const shown = normalizeEntry(opts.shown);
  if (shown === normalizeEntry(opts.newValue)) return true;
  if (opts.expectedCurrent !== undefined && shown === normalizeEntry(opts.expectedCurrent)) return true;
  return false;
}
