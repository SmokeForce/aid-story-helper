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
