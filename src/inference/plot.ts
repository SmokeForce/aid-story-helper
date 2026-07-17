export interface PlotBlock { name: string; text: string; isPlayer: boolean; }

const LORE_HINTS = /inner circle|plot secret|^secret\b|^-?\s*plot\b/i;

/** Derive a character name from a Plot Essentials block's inner text, or null for lore/unnamed. */
function blockName(inner: string): { name: string; isPlayer: boolean } | null {
  const text = inner.trim();
  const firstLine = (text.split("\n").find((l) => l.trim()) ?? "").trim();
  const pm = text.match(/(?:Your|Player)\s+name:\s*([^\n]+)/i);
  if (pm) return { name: pm[1]!.trim(), isPlayer: true };
  if (LORE_HINTS.test(firstLine)) return null;
  if (/^(?:Current|Active)\s+Location/i.test(firstLine)) return null;
  const nm = firstLine.match(/^([A-Z][^\n:]*?)\s+(?:is|are)\b/);
  if (nm) return { name: nm[1]!.trim(), isPlayer: false };
  const hm = firstLine.match(/^([A-Z][\w '´.-]{1,40}):/);
  if (hm && !LORE_HINTS.test(hm[1]!)) return { name: hm[1]!.trim(), isPlayer: false };
  return null;
}

export function parsePlotEssentials(memory: string | undefined): PlotBlock[] {
  if (!memory) return [];
  const blocks: PlotBlock[] = [];
  const re = /\[([^\]]+)\]|\{([^\}]+)\}/g; // top-level [...] or {...} blocks
  let m: RegExpExecArray | null;
  while ((m = re.exec(memory)) !== null) {
    const content = m[1] !== undefined ? m[1] : m[2]!;
    const info = blockName(content);
    if (info) blocks.push({ name: info.name, text: content.trim(), isPlayer: info.isPlayer });
  }
  return blocks;
}

export function getRestOfPlotEssentials(memory: string | undefined): string {
  if (!memory) return "";
  const re = /\[([^\]]+)\]|\{([^\}]+)\}/g;
  let lastIndex = 0;
  let result = "";
  let m: RegExpExecArray | null;
  while ((m = re.exec(memory)) !== null) {
    const content = m[1] !== undefined ? m[1] : m[2]!;
    const info = blockName(content);
    if (info) {
      result += memory.slice(lastIndex, m.index);
      lastIndex = re.lastIndex;
    }
  }
  result += memory.slice(lastIndex);
  return result.trim();
}

export function parseMemories(memory: string | undefined): string | null {
  if (!memory) return null;
  const re = /\[\s*(Memories\s*\(newest\s*to\s*oldest\):[\s\S]*?)\]/gi;
  const m = re.exec(memory);
  return m ? m[1]!.trim() : null;
}

/**
 * Replace the inner text of the Plot Essentials `[...]` or `{...}` block whose derived name === `name`
 * with `newEntry`. Returns the memory unchanged if no block matches.
 */
export function replaceBlock(memory: string | undefined, name: string, newEntry: string): string | null {
  if (!memory) return null;
  const targetName = name.trim().toLowerCase();
  
  if (targetName === "memories") {
    const re = /\[\s*(Memories\s*\(newest\s*to\s*oldest\):[\s\S]*?)\]/gi;
    const m = re.exec(memory);
    if (m) {
      return memory.slice(0, m.index) + `[${newEntry}]` + memory.slice(m.index + m[0]!.length);
    }
  }

  const re = /\[([^\]]+)\]|\{([^\}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(memory)) !== null) {
    const isBrace = m[2] !== undefined;
    const content = isBrace ? m[2]! : m[1]!;
    const info = blockName(content);
    if (info && info.name.trim().toLowerCase() === targetName) {
      const wrapperOpen = isBrace ? "{" : "[";
      const wrapperClose = isBrace ? "}" : "]";
      return memory.slice(0, m.index) + `${wrapperOpen}${newEntry}${wrapperClose}` + memory.slice(m.index + m[0]!.length);
    }
  }
  return null;
}

const DETAIL_KEYWORDS =
  /\b(name|age|gender|sex|race|species|height|weight|build|hair|eye|eyes|skin|scent|smell|voice|appearance|apparel|clothing|outfit|attire|looks?|personality|occupation|job|role|class|alignment|likes|dislikes|hobbies|fears?|goals?|motivations?|motives?|background|backstory|origin|description|bio|relationship|status|title|rank|weapons?|equipment|abilities|skills|powers|strengths?|weakness(?:es)?|quirks|mannerisms|demeanor|attitude|disposition|temperament|nationality|orientation|hand|iq)\b/i;

/** Candidate "Key:" / "Key=" boundary, optionally preceded by a list bullet/bracket. */
const DETAIL_CANDIDATE_RE =
  /([-*[])?\s*([A-Za-z][A-Za-z0-9_&/'"-]*(?:\s+[A-Za-z0-9_&/'"][A-Za-z0-9_&/'"-]*)*?)\s*[:=]/g;

/** Is `key` a real detail label, given whether its prefix carried a bullet/bracket? */
function isDetailKey(key: string, bulleted: boolean): boolean {
  const k = key.trim();
  if (!k || k.length > 40) return false;
  if (bulleted) return true; // an explicit "- Label:" / "[Label:" is always a label
  const spaces = (k.match(/\s/g) || []).length;
  if (DETAIL_KEYWORDS.test(k) && spaces <= 2) return true; // known property, allow two words
  if (spaces <= 1 && k.length < 15) return true; // a short, label-like phrase
  return false;
}

/**
 * Extract `{ key, value }` detail pairs from a free-form character/Plot-Essentials block.
 *
 * Handles bulleted lists (`- Age: 30`), multiple inline pairs on one line
 * (`-Dominant hand: Left -IQ: 155`), and multi-line prose fields: a field like
 * `Appearance:` or `Description:` consumes its following paragraphs as a single
 * value until the next genuine bulleted item. Sentences containing a colon in the
 * middle of prose (e.g. `He looks like a warrior: strong`) are not valid keys and
 * are merged back into the preceding field's value with their colon reconstructed.
 */
export function extractDetailsFromText(text: string): { key: string; value: string }[] {
  if (!text) return [];

  // First pass: locate every candidate "key:" boundary with its raw key, bullet flag,
  // and the span of its value (up to the next candidate or end of text).
  type Candidate = { key: string; bulleted: boolean; valStart: number; matchStart: number };
  const candidates: Candidate[] = [];
  DETAIL_CANDIDATE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DETAIL_CANDIDATE_RE.exec(text)) !== null) {
    candidates.push({
      key: m[2]!,
      bulleted: m[1] !== undefined,
      matchStart: m.index,
      valStart: DETAIL_CANDIDATE_RE.lastIndex,
    });
  }

  const clean = (s: string) => s.replace(/[\s\]]+$/, "").replace(/\s+/g, " ").trim();

  const results: { key: string; value: string }[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]!;
    const end = i + 1 < candidates.length ? candidates[i + 1]!.matchStart : text.length;
    const value = clean(text.slice(c.valStart, end));
    const key = c.key.trim();

    if (isDetailKey(key, c.bulleted)) {
      if (/^(?:https?|www|ftp)$/i.test(key)) continue; // ignore URL fragments
      if (value) results.push({ key, value });
    } else if (results.length) {
      // Not a real label — fold it back into the previous field, reconstructing the colon.
      const prev = results[results.length - 1]!;
      prev.value = clean(`${prev.value} ${key}: ${value}`);
    }
  }
  return results;
}
