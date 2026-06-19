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
    // All thoughts are wrapped inside a single set of braces, so it is chronologically grouped
    // as a single content block for AID's model, representing the window newest-to-oldest or oldest-to-newest.
    const body = ordered.join("\n");
    const full = `[${label}\n{${body}}\n]`;
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
