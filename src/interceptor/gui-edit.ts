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
