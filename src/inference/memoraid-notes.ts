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
