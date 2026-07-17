// Structured storage kept inside an NPC Memory Card's Notes (description) field. The Entry (value)
// is the only thing AID sends to the model; Notes are our out-of-context reservoir.
//
//   [THOUGHT LOG]
//   (turn N) Trigger: <the action that turn that prompted the thought>
//   <the thought entry>
//
// Each entry pairs a thought with the action that caused it. The log re-enters context when the
// companion character card is regenerated (Additional Generation Context), filtered to entries
// formed since that card was last updated.

export interface ThoughtLogEntry { turn: number; action?: string; text: string; }
export interface MemoNotes { thoughtLog: ThoughtLogEntry[]; }

const LOG = "[THOUGHT LOG]";

/**
 * The "Configure MemorAID" card stores the tracked-character list in its description as
 * `IMPORTANT_CHARACTERS: a, b, c`. These two helpers are the single source of truth for that list
 * (the panel config editor and the background MemorAID run both use them).
 */
export function parseImportantCharacters(description?: string | null): string[] {
  const match = String(description || "").match(/IMPORTANT_CHARACTERS\s*:\s*([\s\S]+?)(?=\n\s*[A-Z_]+:|$)/i);
  if (!match || !match[1]) return [];
  return match[1]
    .split(/[,\r\n]+/)
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

export function serializeImportantCharacters(names: string[]): string {
  const clean = (names || []).map((n) => String(n || "").trim()).filter(Boolean);
  return `IMPORTANT_CHARACTERS: ${clean.join(", ")}`;
}

/** Detects if the text matches the MemorAID prompt instructions, preventing leaks from being parsed or saved. */
export function isLeakedPrompt(text: string): boolean {
  const t = (text || "").toLowerCase();
  return (
    t.includes("this is your story") ||
    t.includes("live it as its own main character") ||
    t.includes("live this story as its own main character") ||
    t.includes("never a minor figure") ||
    t.includes("respond with exactly offstage") ||
    t.includes("strict cognitive loop") ||
    t.includes("sensory, physical, or verbal stimulus") ||
    (t.includes("intake:") && t.includes("thought:") && t.includes("action:") && t.includes("1 sentence")) ||
    // Two-bullet lens/monologue prompts (Action dropped). Distinctive literal phrases that survive
    // {{title}}/{protagonist} substitution, so an echoed prompt is still recognised — covers both the
    // first lens/monologue version (LENS_V1) and the current resist-resolution refinement.
    t.includes("not a neutral camera") ||
    t.includes("unfiltered internal monologue") ||
    t.includes("polished thesis") ||
    t.includes("produce exactly two labeled bullets") ||
    t.includes("not a mood piece") ||
    t.includes("unresolved internal reaction") ||
    t.includes("insight-turn")
  );
}

/** Scene-novelty gate (NLP, zero-LLM): should MemorAID regenerate thoughts for this scene text, or
 *  is it a near-duplicate of the last one processed (a Retry that landed on essentially the same
 *  beat, or a duplicate event)? Jaccard similarity over content-word tokens; similarity >= the
 *  threshold means "not novel — reuse the existing thoughts, skip the per-NPC LLM calls". An empty
 *  previous text is always novel. Threshold is deliberately high (0.9): thoughts should only be
 *  skipped when the scene is essentially unchanged. */
export function isSceneNovel(prevText: string | undefined, nextText: string, threshold = 0.9): boolean {
  const prev = String(prevText || "").trim();
  const next = String(nextText || "").trim();
  if (!prev || !next) return true;
  const tok = (s: string) => new Set(s.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length >= 3));
  const a = tok(prev); const b = tok(next);
  if (!a.size || !b.size) return true;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? false : inter / union < threshold;
}

export function parseMemoNotes(description?: string): MemoNotes {
  const out: MemoNotes = { thoughtLog: [] };
  if (!description) return out;
  const logIdx = description.indexOf(LOG);
  const block = logIdx !== -1 ? description.slice(logIdx + LOG.length) : description;
  const re = /\(turn (\d+)\)(?:[ \t]*Trigger:[ \t]*([^\n]*))?\n?([\s\S]*?)(?=\n\(turn \d+\)|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    const text = (m[3] || "").trim();
    const action = (m[2] || "").trim();
    if (!text && !action) continue;
    if (isLeakedPrompt(text)) continue;
    const entry: ThoughtLogEntry = { turn: Number(m[1]), text };
    if (action) entry.action = action;
    out.thoughtLog.push(entry);
  }
  return out;
}

export function buildMemoNotes(notes: MemoNotes, maxChars = 9000): string {
  if (!notes.thoughtLog.length) return "";
  
  let log = [...notes.thoughtLog];
  while (log.length > 0) {
    const body = log
      .map((e) => `(turn ${e.turn})${e.action ? ` Trigger: ${e.action}` : ""}\n${e.text}`)
      .join("\n\n");
    const full = `${LOG}\n${body}`;
    if (full.length <= maxChars) {
      return full;
    }
    // Remove the oldest entry (newest-first, so pop the end)
    log.pop();
  }
  return "";
}

/** Prepend an entry (newest-first), de-duping identical thought text, capping the log. */
export function pushThought(log: ThoughtLogEntry[], entry: ThoughtLogEntry, maxEntries = 15): ThoughtLogEntry[] {
  const text = (entry.text || "").trim();
  if (!text) return log;
  const deduped = log.filter((e) => e.text !== text);
  return [{ ...entry, text }, ...deduped].slice(0, maxEntries);
}

/** True if a memory-card ENTRY already carries the "[<name>'s Thoughts ...]" wrapper. */
export function isWrappedThoughtEntry(value?: string | null): boolean {
  return /\bthoughts\b\s*(?:\(newest to oldest\)\s*)?:/i.test(String(value || ""));
}

/**
 * Repair a memory-card ENTRY that lost its thought-log wrapper. A raw generated thought
 * ("[- Intake... - Action...]") can end up persisted bare on the card when the follow-up wrapped
 * save is lost (a failed save, or an open AID card editor re-asserting the raw it just saw) —
 * leaving a bare, unlabeled entry.
 * Re-render the entry from the Notes thought log (our own source of truth), rescuing the bare thought
 * currently sitting in the entry into the log so nothing is lost. No-op when already wrapped.
 */
export function repairThoughtEntry(
  name: string,
  value: string | null | undefined,
  description: string | null | undefined,
  lookback: number,
  turn: number
): { value: string; description: string; changed: boolean } {
  const v = String(value || "");
  const desc = String(description || "");
  if (!v.trim() || isWrappedThoughtEntry(v)) return { value: v, description: desc, changed: false };

  // Rescue the bare thought currently in the entry so the repair doesn't drop it.
  const inner = v
    .replace(/^\[?\s*[^\n\]]*\bThoughts:\s*/i, "")
    .replace(/^[\s[]+/, "")
    .replace(/[\s\]]+$/, "")
    .trim();
  let log = parseMemoNotes(desc).thoughtLog;
  if (inner) log = pushThought(log, { turn, text: `[${name}'s Thoughts:\n${inner}\n]` });

  const rendered = renderThoughtWindow(log, Math.max(lookback, 1), name, 6000)
    || (inner ? `[${name}'s Thoughts:\n${inner}\n]` : v);
  const newDesc = log.length ? buildMemoNotes({ thoughtLog: log }) : desc;
  return { value: rendered, description: newDesc, changed: rendered !== v || newDesc !== desc };
}

/** Newest-first "Trigger + thought" entries formed AFTER `sinceTurn`, concatenated up to `maxChars`. */
export function thoughtsSince(log: ThoughtLogEntry[], sinceTurn: number, maxChars: number): string {
  const parts: string[] = [];
  let len = 0;
  for (const e of log) { // newest-first
    if (e.turn <= sinceTurn) continue;
    const piece = e.action ? `${e.action}\n${e.text}` : e.text;
    if (len + piece.length + 2 > maxChars) break;
    parts.push(piece);
    len += piece.length + 2;
  }
  return parts.join("\n\n");
}

/** Strip a stored "[Name's Thoughts:\n … \n]" wrapper, returning the bare inner thought text. */
function extractThoughtInner(text: string): string {
  let inner = (text || "").trim();
  inner = inner.replace(/^\[?\s*[^\n\]]*\bThoughts:\s*/i, ""); // drop a leading "[Name's Thoughts:" header
  inner = inner.replace(/^[\s[]+/, "").replace(/[\s\]]+$/, "").trim(); // drop remaining wrapping brackets
  return inner;
}

/**
 * Render the newest `n` COMPLETE thoughts under a single label. Input `log` is newest-first.
 * Only whole thoughts that fit within `maxChars` are kept (oldest dropped first; a thought is
 * never split). Returns "" when n <= 0, the log is empty, or not even one thought fits.
 */
function renderThoughtBlock(
  log: ThoughtLogEntry[],
  n: number,
  label: string,
  order: "newest-first" | "oldest-first",
  maxChars: number
): string {
  if (!Array.isArray(log) || n <= 0) return "";
  let selected = log.slice(0, n); // newest-first
  while (selected.length > 0) {
    const inners = selected.map((e) => extractThoughtInner(e.text)).filter((s) => s.length > 0);
    if (inners.length === 0) return "";
    const ordered = order === "oldest-first" ? [...inners].reverse() : inners;
    // Each thought is wrapped in braces so the boundary between discrete thoughts is unambiguous
    // (otherwise the stacked Intake/Thought/Action bullets read as one undelimited blob).
    const body = ordered.map((t) => `{${t}}`).join("\n\n");
    const full = `[${label}\n${body}\n]`;
    if (full.length <= maxChars) return full;
    selected = selected.slice(0, -1); // over budget: drop the oldest (tail of newest-first)
  }
  return "";
}

/** MemorAID generation context: the last N complete thoughts, OLDEST→NEWEST, thought text only. */
export function buildThoughtContext(log: ThoughtLogEntry[], n: number, name: string, maxChars: number): string {
  return renderThoughtBlock(log, n, `${name}'s recent thoughts (oldest to newest):`, "oldest-first", maxChars);
}

/** MemorAID card entry: the last N complete thoughts as a rolling window, NEWEST→OLDEST (position 1 = newest). */
export function renderThoughtWindow(log: ThoughtLogEntry[], n: number, name: string, maxChars: number): string {
  return renderThoughtBlock(log, n, `${name}'s Thoughts (newest to oldest):`, "newest-first", maxChars);
}

/** True while a character is suppressed from MemorAID thought generation (offstage cooldown). */
export function isOnOffstageCooldown(cooldownUntil: number | undefined, currentTurn: number): boolean {
  return typeof cooldownUntil === "number" && currentTurn < cooldownUntil;
}

/**
 * Classify a MemorAID generation result. The presence-gated prompt makes the model emit the
 * OFFSTAGE sentinel when the character is only being talked about. Treat OFFSTAGE / empty /
 * label-less output as offstage; any output carrying an Intake/Thought/Action label is a real
 * in-scene thought (lenient, so a slightly malformed-but-real thought is never dropped).
 */
export function classifyMemoraidPresence(output: string): "present" | "offstage" {
  const cleaned = (output || "").trim().replace(/^[[{]+/, "").replace(/[\]}]+$/, "").trim();
  if (cleaned === "") return "offstage";
  // The prompt instructs an absent character to reply with exactly OFFSTAGE; only that bare sentinel
  // (optionally bracket-wrapped or with trailing punctuation) counts as offstage. Any other content
  // is treated as a real thought so a format-drifting-but-genuine generation is never suppressed.
  if (/^offstage[.!]*$/i.test(cleaned)) return "offstage";
  return "present";
}

/**
 * The canned "ears burning" thought for an offstage (mentioned-but-absent) character — engine-owned,
 * no API call. Returned as the bare Intake/Thought block; the caller wraps and renders it like any
 * generated thought, so the `{}`/`[]` formatting and multi-thought window are applied automatically.
 */
export function buildEarsBurningThought(): string {
  return [
    "- Intake: My ears are suddenly burning — the old sign that someone, somewhere, is talking about me.",
    "- Thought: I wonder who, and what they're saying. Nothing to do about it from here but keep going.",
  ].join("\n");
}
