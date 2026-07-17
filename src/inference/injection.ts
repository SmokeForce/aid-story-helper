/**
 * Pure helpers for the user-action prompt-injection pipeline. The extension cannot touch
 * AID's AI input/context (the scripting-sandbox capability), so directives are appended to
 * the outgoing player action instead. Directives carry ENGINE-OWNED FACTS ONLY — the narrator
 * authors the actual event (mirrors living_characters_library.js).
 */
export interface SeededPair {
  owner: string;
  target: string;
  pressure: string;
  momentum: string;
}

/** Living Characters seed directive — locked Phase-1 wording (prompt-injection mode). */
export function formatLivingCharactersDirective(pair: SeededPair): string {
  return `[${pair.owner} now feels ${pair.pressure} toward ${pair.target} (momentum: ${pair.momentum}); let this surface naturally.]`;
}

// --- Author's Note mode (roster of active pressures, prose) ---------------------------------------
// When enabled, directives are maintained as a managed [Active Social Dynamics: …] block in the
// Author's Note instead of appended to the action. One {} prose line per active Life Card, rebuilt
// each turn — resolved/deleted pressures drop out. The block is bounded by the sim config's active
// pressure count (maxActive, seed interval, …), so it can't grow endlessly.
const AN_BLOCK_HEADER = "[Active Social Dynamics:";
export const AN_BLOCK_PATTERN = /\n*\[Active Social Dynamics:[\s\S]*?\n\]/g;

/** The Author's Note roster block (prose). Empty string when there are no active pressures. */
export function formatLivingCharactersAuthorsNoteBlock(pairs: SeededPair[]): string {
  if (!pairs.length) return "";
  const lines = pairs.map(p =>
    `{${p.owner} feels ${p.pressure} towards ${p.target}, with a ${p.momentum} sense of urgency. Surface this naturally in the story according to their personality and traits.}`);
  return `${AN_BLOCK_HEADER}\n${lines.join("\n")}\n]`;
}

/** Merge the managed roster block into the user's Author's Note: strip any prior managed block, then
 *  append the new one (blank-line separated) when non-empty. Preserves the rest of the note; an empty
 *  block clears the managed section. */
export function mergeAuthorsNoteBlock(existingNote: string, block: string): string {
  const base = String(existingNote || "").replace(AN_BLOCK_PATTERN, "").trimEnd();
  if (!block) return base;
  return base ? `${base}\n\n${block}` : block;
}

/** Join 0..n provider directives into the single string appended to the action ("" when none). */
export function buildInjectionText(directives: string[]): string {
  return directives.filter(Boolean).join(" ");
}

/** How to handle Living Characters on Continue/retry actions, which carry no player text to append a
 *  directive onto. "defer" (default): still run LC, but hold its directive for the next injectable
 *  action. "skip": don't run LC at all on Continue/retry. */
export type ContinueInjectionMode = "defer" | "skip";

/** Only do/say/story actions carry appendable player text, so they're the only ones we can inject a
 *  directive onto (Continue/retry have no `text` field — the directive would be silently dropped). */
export function canInjectOnAction(actionType: string | undefined): boolean {
  return actionType === "do" || actionType === "say" || actionType === "story";
}

/** Should Living Characters fire this turn? Always on injectable actions; on Continue/retry it fires
 *  only in "defer" mode (so its directive can be held), never in "skip" mode. */
export function shouldFireLcOnAction(actionType: string | undefined, mode: ContinueInjectionMode): boolean {
  return canInjectOnAction(actionType) || mode === "defer";
}

/** A held directive with the pressure identity needed to re-validate it before it fires (a pressure
 *  can resolve or its Life Card be deleted between production on a continue/retry and injection). */
export interface PendingInjection { owner: string; target: string; pressure: string; momentum: string; text: string; }

/** Stable key for an active pressure. */
export function pressureKey(owner: string, pressure: string): string {
  return `${String(owner || "").trim().toLowerCase()}|${String(pressure || "").trim().toLowerCase()}`;
}

/** Coerce a stored pending queue to structured entries. Legacy `string[]` entries become identity-less
 *  `{ text }` (kept on the next flush, then the queue is structured). */
export function coercePending(raw: unknown): PendingInjection[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((e: any) => typeof e === "string"
    ? { owner: "", target: "", pressure: "", momentum: "", text: e }
    : { owner: e?.owner || "", target: e?.target || "", pressure: e?.pressure || "", momentum: e?.momentum || "", text: e?.text || "" })
    .filter(p => p.text);
}

/** Drop held directives whose pressure is no longer active (resolved/deleted). Identity-less legacy
 *  entries are kept so they flush once. */
export function filterLiveDirectives(pending: PendingInjection[], activePressureKeys: Set<string>): PendingInjection[] {
  return pending.filter(p => (!p.owner && !p.pressure) ? true : activePressureKeys.has(pressureKey(p.owner, p.pressure)));
}

/** Decide what to inject now and what to carry forward. On an injectable action: flush held + fresh
 *  directives and clear the queue. On a non-injectable action: inject nothing and hold this turn's
 *  directives (with identity) for the next injectable action. */
export function planInjection(
  actionType: string | undefined,
  fresh: PendingInjection[],
  held: PendingInjection[] | undefined
): { injectText: string; nextPending: PendingInjection[] } {
  const heldF = (held || []).filter(p => p.text);
  const freshF = (fresh || []).filter(p => p.text);
  if (canInjectOnAction(actionType)) {
    return { injectText: buildInjectionText([...heldF, ...freshF].map(p => p.text)), nextPending: [] };
  }
  return { injectText: "", nextPending: [...heldF, ...freshF] };
}

/**
 * Matches the extension's own injected directives so presence detection can ignore them.
 * Keep in sync with the directive formatters above. As more providers are added, extend the
 * alternation with their trailing markers.
 */
export const INJECTION_DIRECTIVE_PATTERN = /\s*\[[^\]]*?let this surface naturally\.\]/gi;

/** Remove the extension's own injected directives from text before presence detection. */
export function stripInjectedDirectives(text: string): string {
  return (text || "").replace(INJECTION_DIRECTIVE_PATTERN, "").trim();
}

