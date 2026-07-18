import { isCharacterTriggered, type CardRow } from "../shared/types";
import { type ThoughtLogEntry } from "./memoraid-notes";

export interface SchemaItem {
  subject: string;
  text: string;
  retired?: boolean;
  aliases?: string[];
}

/** Split a schema subject label "Canonical | a, b" into canonical + alias list. */
export function parseSubjectLabel(raw: string): { subject: string; aliases: string[] } {
  const s = String(raw || "");
  const bar = s.indexOf("|");
  if (bar === -1) return { subject: s.trim(), aliases: [] };
  const subject = s.slice(0, bar).trim();
  const aliases = s.slice(bar + 1).split(",").map((a) => a.trim()).filter(Boolean);
  return { subject, aliases };
}

/** Render a schema item's bracket label ("Canonical | a, b" or just "Canonical"). */
export function formatSubjectLabel(item: SchemaItem): string {
  const aliases = (item.aliases || []).filter(Boolean);
  return aliases.length ? `${item.subject} | ${aliases.join(", ")}` : item.subject;
}

/** Tokenize a subject/alias label: lowercase, split on "/" and "," (NOT spaces), trimmed. */
export function subjectTokens(name: string): string[] {
  return String(name || "")
    .split(/[\/,]/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

/** All match tokens for a schema item: canonical name + every alias. */
export function schemaItemTokens(item: SchemaItem): Set<string> {
  const out = new Set<string>();
  for (const t of subjectTokens(item.subject)) out.add(t);
  for (const a of item.aliases || []) for (const t of subjectTokens(a)) out.add(t);
  return out;
}

/** Kinship/role nouns where subjects differing only by owner ("My Father", "Veya's Father",
 *  "Vallois Father", "The Father") almost always denote the SAME person within one character's own
 *  memory. Keying on the bare noun collapses that alias explosion (the reported "Veya's Father / My
 *  Father / Vallois Father / Father / The Vallois Father / The Father" proliferation). Scoped to kinship
 *  ONLY — a generic head noun like "sword" or "guard" must NOT cross-merge different objects. */
const KINSHIP_NOUNS = new Set([
  "father", "mother", "mom", "mum", "dad", "papa", "daddy", "mommy", "parent", "parents",
  "brother", "sister", "sibling", "son", "daughter", "child", "children", "kid",
  "husband", "wife", "spouse", "partner", "uncle", "aunt", "auntie", "cousin", "nephew", "niece",
  "grandfather", "grandmother", "grandpa", "grandma", "granddad", "grandmom", "granddaughter", "grandson",
]);

/** Leading determiners/possessives stripped when normalizing a subject label for equivalence. */
const SUBJECT_LEADING_STRIP = new Set(["the", "a", "an", "my", "your", "his", "her", "their", "our", "its"]);

/** Concept-synonym clusters: paraphrase head nouns the model rotates between for the SAME concept
 *  ("Our Relationship" / "Our Connection" / "Our Bond"), which the token/kinship guards can't catch.
 *  Each cluster maps to its first (canonical) word. Deliberately small and conservative — a bad
 *  cluster silently merges distinct subjects, so only near-certain paraphrase sets belong here. */
const SYNONYM_CLUSTERS: string[][] = [
  ["relationship", "connection", "bond"],
  ["home", "house", "apartment", "flat"],
  ["job", "work", "career"],
  ["past", "history", "backstory"],
];
const SYNONYM_CANON = new Map<string, string>();
for (const cluster of SYNONYM_CLUSTERS) for (const w of cluster) SYNONYM_CANON.set(w, cluster[0]!);

/** Which "owner" a stripped possessive refers to, for the synonym-cluster key: first/second-person
 *  and article determiners all mean the OWNER's own concept ("own"); a third-person or named
 *  possessive keeps its word so "My Apartment" and "Veya's Apartment" never merge. */
const OWN_POSSESSIVES = new Set(["the", "a", "an", "my", "your", "our", "its"]);

/** Canonical equivalence keys for a subject label — the duplication guard. Strips leading
 *  articles/possessive determiners and any leading possessive-OWNER token (a word ending in `'s`/`'`,
 *  e.g. "Veya's", "Vallois'"), then keys on the remaining phrase; when the head (last) word is a kinship
 *  noun it ALSO keys on that bare noun ("kin:father") so subjects with different owners collapse to one
 *  person. Two subjects are equivalent when these key sets intersect. Article/possessive-only variants
 *  ("The Sword" vs "My Sword") also collapse via the shared remaining phrase, while genuinely distinct
 *  multi-word subjects ("Red Sword" vs "Blue Sword") do not. */
export function subjectAliasKeys(name: string): Set<string> {
  const out = new Set<string>();
  let s = String(name || "").toLowerCase().replace(/[’]/g, "'");
  s = s.replace(/[^a-z0-9'\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return out;
  const words = s.split(" ");
  let i = 0;
  // Strip leading articles/possessive-determiners and possessive-owner tokens — never the head word.
  // Remember WHOSE possessive was stripped: first/second-person + articles collapse to "own"; a
  // named/third-person possessive keeps its word so different people's homes/jobs never merge.
  let ownerSlot = "own";
  while (i < words.length - 1) {
    const w = words[i]!;
    if (SUBJECT_LEADING_STRIP.has(w)) { ownerSlot = OWN_POSSESSIVES.has(w) ? ownerSlot : w; i++; continue; }
    if (/'s?$/.test(w)) { ownerSlot = w.replace(/'s?$/, ""); i++; continue; }
    break;
  }
  const cleaned = words.slice(i).map((w) => w.replace(/'/g, ""));
  const phrase = cleaned.join(" ").trim();
  if (phrase) out.add(phrase);
  const head = cleaned[cleaned.length - 1] || "";
  if (KINSHIP_NOUNS.has(head)) out.add("kin:" + head);
  // Concept-synonym key: only for a bare concept head (single-word phrase after stripping), scoped
  // by whose it is — "our relationship"/"our connection" share syn:own:relationship, while
  // "veya's apartment" gets syn:veya:home and never touches "my apartment" (syn:own:home).
  if (cleaned.length === 1) {
    const canon = SYNONYM_CANON.get(head) || SYNONYM_CANON.get(head.replace(/s$/, ""));
    if (canon) out.add(`syn:${ownerSlot}:${canon}`);
  }
  return out;
}

/** Full merge-match key set for a schema item: its token set (canonical + aliases, "/"- and ","-split)
 *  PLUS the canonical-equivalence alias keys of the canonical name and every alias. Items merge when
 *  these intersect — this is where the article/possessive/kinship duplication guard takes effect. */
export function schemaItemMatchKeys(item: SchemaItem): Set<string> {
  const out = schemaItemTokens(item);
  for (const k of subjectAliasKeys(item.subject)) out.add(k);
  for (const a of item.aliases || []) for (const k of subjectAliasKeys(a)) out.add(k);
  return out;
}

/** Name words: lowercased, punctuation-stripped, space-split (drops quotes so `Iracema "Ira"` → [iracema, ira]). */
function nameWords(s: string): string[] {
  return String(s || "").toLowerCase().replace(/["'’.,]/g, "").split(/\s+/).filter(Boolean);
}

/** Is this schema subject the card's OWN character (self-knowledge)? A Crystallized card is [owner]'s
 *  memory, so an entry ABOUT the owner is redundant with their character card. Matches when the
 *  shorter name's words are all contained in the longer's (full-name or first-name match), across the
 *  canonical subject and any aliases — so `[Smoke]`, `[Smoke Brytefayme]`, and `[Ira]` (for owner
 *  `Iracema "Ira"`) are all recognized, while a merely name-adjacent subject (e.g. `Anna` vs `Ann`) is not. */
export function isSelfSubject(item: SchemaItem, ownerName: string | undefined): boolean {
  const owner = nameWords(ownerName || "");
  if (!owner.length) return false;
  for (const cand of [item.subject, ...(item.aliases || [])]) {
    const w = nameWords(cand);
    if (!w.length) continue;
    const [short, long] = w.length <= owner.length ? [w, owner] : [owner, w];
    if (short.every((x) => long.includes(x))) return true;
  }
  return false;
}

/** A complete distilled fact ends in sentence punctuation (optionally closed by a quote/paren). An
 *  entry that doesn't is almost always the tail of a generation truncated mid-sentence by the model's
 *  token limit — the "Knows cuts off mid-sentence" case. */
export function looksTruncated(text: string): boolean {
  const t = String(text || "").trim();
  if (!t) return true;
  return !/[.!?…][)"'’\]]?$/.test(t);
}

function unionAliases(...lists: (string[] | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) for (const a of list || []) {
    const key = a.trim().toLowerCase();
    if (a.trim() && !seen.has(key)) { seen.add(key); out.push(a.trim()); }
  }
  return out;
}

/** Merge schema items whose match keys intersect (token overlap OR the article/possessive/kinship
 *  duplication guard, via schemaItemMatchKeys). First match survives (keeps canonical); the absorbed
 *  item's text replaces (most-recent wins), its name folds in as an alias, and its aliases join. */
export function dedupeSchema(schema: SchemaItem[]): SchemaItem[] {
  const result: SchemaItem[] = [];
  const sets: Set<string>[] = [];
  for (const item of schema) {
    const tokens = schemaItemMatchKeys(item);
    let idx = -1;
    for (let i = 0; i < result.length; i++) {
      for (const t of tokens) { if (sets[i]?.has(t)) { idx = i; break; } }
      if (idx !== -1) break;
    }
    if (idx === -1) {
      const copy: SchemaItem = { ...item, aliases: unionAliases(item.aliases) };
      result.push(copy);
      sets.push(schemaItemMatchKeys(copy));
    } else {
      const s = result[idx]!;
      s.text = item.text; // most-recent wins
      // The absorbed subject's own name becomes an alias of the survivor (so its trigger still fires
      // and a later distillation recognizes it), alongside the absorbed item's aliases.
      const extra = [item.subject, ...(item.aliases || [])]
        .flatMap((label) => label.split(/[\/,]/))
        .map((sub) => sub.trim())
        .filter((sub) => sub && sub.toLowerCase() !== s.subject.toLowerCase());
      s.aliases = unionAliases(s.aliases, extra);
      s.retired = (s.retired ?? false) && (item.retired ?? false);
      sets[idx] = schemaItemMatchKeys(s);
    }
  }
  return result;
}

export interface MemoryNode {
  id: string;
  vibrancy: number; // 3, 2, 1, 0
  snapshot: string;
  links: string[];
}

export interface OutlookBelief {
  text: string;
  strength: number;
}

export interface CrystallizedState {
  schema: SchemaItem[];
  nodes: MemoryNode[];
  unreferencedPasses: Record<string, number>;
  outlook: OutlookBelief[];
  // Concrete personal TEXTURE (tastes, habits, quirks, pet peeves, rituals, small opinions about
  // things — positive, negative, or neutral) — the "texture that makes a person feel alive", kept
  // deliberately separate from the emotional/identity layers (Knows/Vivid/Outlook) so it can't drift
  // back into that register. Reuses the OutlookBelief {text, strength} shape, but preferences NEVER
  // decay (they can only be refined in place, or removed via the manual editor); `strength` is a pure
  // reinforcement counter for render ranking. Effectively uncapped (the user hand-seeds many). Optional:
  // pre-existing IndexedDB states (and older test fixtures) predate this layer — readers guard with `|| []`.
  preferences?: OutlookBelief[];
}

export interface DistillationBufferItem {
  actionText: string;
  thoughtText?: string;
  turn: number;
}

function extractThoughtInner(text: string): string {
  let inner = (text || "").trim();
  inner = inner.replace(/^\[?\s*[^\n\]]*\bThoughts:\s*/i, ""); // drop a leading "[Name's Thoughts:" header
  inner = inner.replace(/^[\s[]+/, "").replace(/[\s\]]+$/, "").trim(); // drop remaining wrapping brackets
  return inner;
}

/** Parses the stored Crystallized Memory block from a card's Notes (description) field. */
export function parseCrystallized(notes?: string | null): CrystallizedState {
  const state: CrystallizedState = {
    schema: [],
    nodes: [],
    unreferencedPasses: {},
    outlook: [],
    preferences: [],
  };
  if (!notes) return state;

  const header = "[CRYSTALLIZED MEMORY]";
  const idx = notes.indexOf(header);
  const block = idx !== -1 ? notes.slice(idx + header.length) : notes;

  // Split sections by "### "
  const sections = block.split(/\n###\s+/);
  
  for (const sec of sections) {
    const lines = sec.split("\n");
    const firstLine = lines[0];
    const titleLine = firstLine ? firstLine.trim().toLowerCase() : "";
    
    if (titleLine.includes("i. schema")) {
      for (let i = 1; i < lines.length; i++) {
        const rawLine = lines[i];
        if (!rawLine) continue;
        const line = rawLine.trim();
        if (!line.startsWith("- ")) continue;
        
        // Match format: - [Subject] Text
        const match = line.match(/^-\s*\[([^\]]+)\]\s*(.*)$/);
        if (match && match[1] !== undefined && match[2] !== undefined) {
          const { subject, aliases } = parseSubjectLabel(match[1]);
          let text = match[2].trim();
          const retired = text.endsWith("(retired)");
          if (retired) {
            text = text.slice(0, -9).trim();
            if (text.endsWith(";")) text = text.slice(0, -1).trim();
            if (text.endsWith("-")) text = text.slice(0, -1).trim();
            text = text.trim();
          }
          state.schema.push({ subject, text, retired, aliases });
        }
      }
    } else if (titleLine.includes("ii. nodes")) {
      let currentNode: Partial<MemoryNode> | null = null;
      for (let i = 1; i < lines.length; i++) {
        const rawLine = lines[i];
        if (!rawLine) continue;
        const line = rawLine.trim();
        if (line.startsWith("- Node_ID:")) {
          if (currentNode && currentNode.id) {
            state.nodes.push(currentNode as MemoryNode);
          }
          currentNode = {
            id: line.slice(10).trim(),
            vibrancy: 3,
            snapshot: "",
            links: []
          };
        } else if (currentNode) {
          if (line.startsWith("Vibrancy:")) {
            const vMatch = line.match(/Vibrancy:\s*(\d+)\/3/);
            if (vMatch && vMatch[1] !== undefined) {
              currentNode.vibrancy = parseInt(vMatch[1]);
            }
          } else if (line.startsWith("Snapshot:")) {
            let snap = line.slice(9).trim();
            if (snap.endsWith("]")) snap = snap.slice(0, -1).trim();
            currentNode.snapshot = snap;
          } else if (line.startsWith("Links:")) {
            const linksStr = line.slice(6).trim();
            currentNode.links = linksStr ? linksStr.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean) : [];
          } else if (line.startsWith("  ") || line.startsWith("\t")) {
            if (currentNode.snapshot) {
              currentNode.snapshot += " " + line.trim();
            }
          }
        }
      }
      if (currentNode && currentNode.id) {
        state.nodes.push(currentNode as MemoryNode);
      }
    } else if (titleLine.includes("iii. bookkeeping") || titleLine.includes("bookkeeping")) {
      for (let i = 1; i < lines.length; i++) {
        const rawLine = lines[i];
        if (!rawLine) continue;
        const line = rawLine.trim();
        if (line.startsWith("- SubjectUnreferencedPasses:")) {
          const val = line.slice(28).trim();
          const pairs = val.split(/[,;]+/);
          for (const p of pairs) {
            const parts = p.split("=");
            if (parts.length === 2) {
              const p0 = parts[0];
              const p1 = parts[1];
              if (p0 && p1) {
                state.unreferencedPasses[p0.trim()] = parseInt(p1.trim()) || 0;
              }
            }
          }
        }
      }
    }
  }

  return state;
}

/** Serializes the Crystallized Memory state back into a machine-readable Notes string. */
export function serializeCrystallized(state: CrystallizedState): string {
  const lines: string[] = ["[CRYSTALLIZED MEMORY]", ""];
  
  lines.push("### I. SCHEMA");
  for (const item of state.schema) {
    const retiredStr = item.retired ? " (retired)" : "";
    lines.push(`- [${formatSubjectLabel(item)}] ${item.text}${retiredStr}`);
  }
  lines.push("");
  
  lines.push("### II. NODES");
  for (const node of state.nodes) {
    lines.push(`- Node_ID: ${node.id}`);
    lines.push(`  Vibrancy: ${node.vibrancy}/3`);
    lines.push(`  Snapshot: ${node.snapshot}`);
    if (node.links && node.links.length > 0) {
      lines.push(`  Links: ${node.links.join(", ")}`);
    } else {
      lines.push("  Links: ");
    }
  }
  lines.push("");
  
  lines.push("### III. BOOKKEEPING");
  const passesStr = Object.entries(state.unreferencedPasses)
    .map(([subj, count]) => `${subj}=${count}`)
    .join(", ");
  lines.push(`- SubjectUnreferencedPasses: ${passesStr}`);
  
  return lines.join("\n");
}

export interface CrystallizedCaps { knows: number; recalls: number; vivid: number; outlook: number; preferences: number; }

type CapSource = {
  crystallizedKnowsCap?: number; crystallizedRecallsCap?: number;
  crystallizedVividCap?: number; crystallizedOutlookCap?: number;
  crystallizedPreferencesCap?: number;
};

/** Per-layer render-count caps, resolved `adv.X ?? settings.X ?? built-in default` — the same
 *  effective-value pattern as crystallizedInterval/EntryMaxChars/NodeCap. Defaults rebalanced toward
 *  TEXTURE (the emotional/identity layers were saturating every scene): knows 2, recalls 2, vivid 4,
 *  outlook 2, preferences 4 — texture-forward instead of identity-dominant. */
export function effectiveCrystallizedCaps(adv: CapSource | undefined | null, settings: CapSource | undefined | null): CrystallizedCaps {
  const pick = (k: keyof CapSource, d: number) => adv?.[k] ?? settings?.[k] ?? d;
  return {
    knows: pick("crystallizedKnowsCap", 2),
    recalls: pick("crystallizedRecallsCap", 2),
    vivid: pick("crystallizedVividCap", 4),
    outlook: pick("crystallizedOutlookCap", 2),
    preferences: pick("crystallizedPreferencesCap", 4),
  };
}

/** Remove empty/malformed entries from a Crystallized state so nothing hollow is stored, fed back into
 *  the next distillation's "current state" context, or rendered. Safe + idempotent: only drops entries
 *  with no usable content (empty subject/text/snapshot) and normalizes missing arrays. Returns the
 *  (possibly new) state plus whether anything changed — used by the one-time DB heal that runs when an
 *  older database is imported or upgraded into v1.2. */
export function sanitizeCrystallizedState(state: CrystallizedState): { state: CrystallizedState; changed: boolean } {
  if (!state || typeof state !== "object") return { state, changed: false };
  const schema = (state.schema || []).filter((i) => String(i?.subject || "").trim() && String(i?.text || "").trim());
  const nodes = (state.nodes || []).filter((n) => String(n?.snapshot || "").trim());
  const outlook = (state.outlook || []).filter((b) => String(b?.text || "").trim());
  const preferences = (state.preferences || []).filter((b) => String(b?.text || "").trim());
  const changed =
    schema.length !== (state.schema || []).length ||
    nodes.length !== (state.nodes || []).length ||
    outlook.length !== (state.outlook || []).length ||
    preferences.length !== (state.preferences || []).length;
  if (!changed) return { state, changed: false };
  return { state: { ...state, schema, nodes, outlook, preferences }, changed: true };
}

export function renderCrystallizedEntry(state: CrystallizedState, name: string, maxChars: number): string {
  // Drop retired subjects and the card's OWN character (self-knowledge belongs in their character
  // card, not their Crystallized "Knows"). The self-filter here also self-heals cards distilled
  // before this rule existed, without waiting for a re-distillation.
  const activeSchema = state.schema.filter(item => !item.retired && !isSelfSubject(item, name));
  let schemaItems = activeSchema.slice();
  
  const highVibrancyNodes = state.nodes
    .map((node, index) => ({ node, index }))
    .filter(item => item.node.vibrancy >= 2)
    .sort((a, b) => {
      if (b.node.vibrancy !== a.node.vibrancy) {
        return b.node.vibrancy - a.node.vibrancy;
      }
      return b.index - a.index; // newest first (highest index first)
    });

  let nodesToRender = [...highVibrancyNodes];

  // Outlook is the lowest-priority block (Knows → Vivid Memories → Outlook), so it is the first
  // thing dropped when the budget is tight — trimmed from the weakest belief (end of the
  // strength-sorted list) before either Vivid Memories or Knows give up any of their own content.
  let outlookLines = (state.outlook || [])
    .filter((b) => b.strength >= 2)
    .sort((a, b) => b.strength - a.strength)
    .map((b) => b.text);

  // Preferences never decay, so there is no weak-belief noise to gate out (unlike Outlook's >=2);
  // rank by strength only (this non-scene path has no scene text to relevance-match against).
  let preferenceLines = (state.preferences || [])
    .slice()
    .sort((a, b) => b.strength - a.strength)
    .map((b) => b.text);

  while (true) {
    const value = buildRenderedString(name, schemaItems, nodesToRender.map(n => n.node.snapshot), outlookLines, [], preferenceLines);
    if (value.length <= maxChars) return value;

    if (outlookLines.length > 0) {
      outlookLines.pop();
      continue;
    }
    if (preferenceLines.length > 0) {
      preferenceLines.pop();
      continue;
    }
    if (nodesToRender.length > 0) {
      // Trim lowest vibrancy and oldest first (which sits at the end of the sorted array)
      nodesToRender.pop();
      continue;
    }
    if (schemaItems.length === 0) {
      return value;
    }
    schemaItems.pop();
  }
}

/** Scene-aware render (§Q). Same source state, but the rendered VALUE reflects who is in the current
 *  scene: Knows shows the present cast first (characters before non-characters), capped; a Recalls
 *  block carries scene-relevant memory-bank pulls; Vivid and Outlook are capped too. Entry order is
 *  fixed: Knows → Recalls → Vivid Memories → Outlook. The char-budget backstop rarely engages (the
 *  item caps are the primary limiter); when it does it drops Recalls → Vivid → Knows-extras and never
 *  trims Outlook below one line. Never splits a line. */
export function renderCrystallizedEntryScene(
  state: CrystallizedState,
  name: string,
  opts: {
    maxChars: number;
    caps: CrystallizedCaps;
    presentSubjectTokens: Set<string>;
    recalls: string[];
    isCharacterSubject: (item: SchemaItem) => boolean;
    // Content-word tokens of the current scene text (snapshotTokens). Preferences are relevance-matched
    // against these so the ones the scene is actually touching surface first; omit for a pure
    // strength-ranked fill (e.g. the non-scene callers / tests).
    sceneTokens?: Set<string>;
  }
): string {
  const sceneToks = opts.sceneTokens || new Set<string>();
  const active = state.schema.filter(i => !i.retired && !isSelfSubject(i, name));
  const isPresent = (i: SchemaItem) => {
    for (const t of schemaItemTokens(i)) if (opts.presentSubjectTokens.has(t)) return true;
    return false;
  };
  // How much the current scene is about THIS subject — content-word overlap of its name+fact with the
  // scene tokens. Used only as a tiebreak *within* each present/absent tier (present-cast priority and
  // character-before-thing still dominate), so when there are more subjects than the cap the ones the
  // scene is actually touching win the remaining slots. Array.sort is stable, so ties keep prior order.
  const knowsRelevance = (i: SchemaItem) => {
    const kt = snapshotTokens(`${i.subject} ${i.text}`);
    let rel = 0; for (const t of kt) if (sceneToks.has(t)) rel++;
    return rel;
  };
  const byRelevance = (a: SchemaItem, b: SchemaItem) => knowsRelevance(b) - knowsRelevance(a);
  // Present first (characters before non-characters), then the rest — each tier scene-relevance-ranked.
  const presentChars = active.filter(i => isPresent(i) && opts.isCharacterSubject(i)).sort(byRelevance);
  const presentOther = active.filter(i => isPresent(i) && !opts.isCharacterSubject(i)).sort(byRelevance);
  const absentChars  = active.filter(i => !isPresent(i) && opts.isCharacterSubject(i)).sort(byRelevance);
  const absentOther  = active.filter(i => !isPresent(i) && !opts.isCharacterSubject(i)).sort(byRelevance);
  let schemaItems = [...presentChars, ...presentOther, ...absentChars, ...absentOther].slice(0, Math.max(0, opts.caps.knows));

  let vivid = state.nodes
    .map((node, index) => ({ node, index }))
    .filter(x => x.node.vibrancy >= 2)
    .sort((a, b) => (b.node.vibrancy - a.node.vibrancy) || (b.index - a.index))
    .slice(0, Math.max(0, opts.caps.vivid))
    .map(x => x.node.snapshot);

  let recalls = opts.recalls.slice(0, Math.max(0, opts.caps.recalls));

  let outlook = (state.outlook || [])
    .filter(b => b.strength >= 2)
    .sort((a, b) => b.strength - a.strength)
    .map(b => b.text)
    .slice(0, Math.max(0, opts.caps.outlook));

  // Preferences: NLP scene-match first, strength as the tiebreak/fallback. Every preference is scored by
  // how many of its content words the scene is currently touching; the block always fills to the cap
  // (relevant ones first, else the strongest) so this texture is "always around". Never decays, so no
  // strength gate.
  let preferences = (state.preferences || [])
    .map(b => {
      const pt = snapshotTokens(b.text);
      let rel = 0; for (const t of pt) if (sceneToks.has(t)) rel++;
      return { text: b.text, rel, strength: b.strength };
    })
    .sort((a, b) => (b.rel - a.rel) || (b.strength - a.strength))
    .slice(0, Math.max(0, opts.caps.preferences))
    .map(p => p.text);

  while (true) {
    const value = buildRenderedString(name, schemaItems, vivid, outlook, recalls, preferences);
    if (value.length <= opts.maxChars) return value;
    if (recalls.length > 0) { recalls.pop(); continue; }
    if (vivid.length > 0) { vivid.pop(); continue; }
    if (schemaItems.length > 1) { schemaItems.pop(); continue; }
    if (outlook.length > 1) { outlook.pop(); continue; }
    if (preferences.length > 1) { preferences.pop(); continue; } // protected below Outlook: trimmed last
    return value; // floor: one Knows + one Outlook + one Preference; never split a line
  }
}

/** JSON-string escape for a rendered value (only inner quotes/backslashes need it — the value is
 *  AI-facing display, never parsed back by us). */
function jsonEscape(s: string): string {
  return String(s || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Soft per-line cap on a rendered Knows entry's text — keeps a single runaway subject from
 *  dominating the entry's character budget at the expense of other subjects/Vivid Memories. */
export const KNOWS_ENTRY_MAXCHARS = 240;

function capKnowsText(text: string): string {
  return text.length > KNOWS_ENTRY_MAXCHARS ? text.slice(0, KNOWS_ENTRY_MAXCHARS - 1).trimEnd() + "…" : text;
}

// The rendered VALUE (what AID injects for the AI to read) uses quoted-name pairs, not "- [Name]"
// bullets: a bare "Name" reads as the story-card's actual name, so the AI reuses it instead of
// inventing one. Both sections are comma-separated {…} entries (no trailing comma). The DESCRIPTION's
// schema bookkeeping (aliases, retirement) is unchanged — only this display format changed.
function buildRenderedString(name: string, schema: SchemaItem[], snapshots: string[], outlookLines: string[] = [], recallLines: string[] = [], preferenceLines: string[] = []): string {
  const lines: string[] = [`[${name}'s Crystallized Memory`];

  // Knows: only entries that have BOTH a non-empty label AND non-empty text. An empty field would
  // render {"Name": ""} (or {"": "…"}), injecting a bare "" pair into the AI's context — the model then
  // echoes empty quotes into the story. Empties can arrive from an imported DB / stale schema, so we
  // guard at the render boundary (the injection point), not just at distillation.
  const knows = schema
    .map((item) => ({
      label: [item.subject, ...(item.aliases || [])].map((s) => String(s || "").trim()).filter(Boolean).join(" | "),
      text: capKnowsText(String(item.text || "").trim()),
    }))
    .filter((k) => k.label && k.text);
  if (knows.length > 0) {
    lines.push("Knows:");
    knows.forEach((k, i) => {
      const comma = i < knows.length - 1 ? "," : "";
      // Key = canonical name plus any aliases, pipe-separated ("Name | Alias1 | Alias2"), so the AI
      // sees every name it can reuse for this subject.
      lines.push(`{"${jsonEscape(k.label)}": "${jsonEscape(k.text)}"}${comma}`);
    });
  }
  // Every other section drops empty entries too — a bare {} is context noise the AI can mimic.
  // Recalls: scene-relevant memory-bank pulls, framed as active recollection. Sits directly after
  // Knows (both are "about the people present"), before Vivid Memories and Outlook.
  const recalls = recallLines.map((t) => String(t || "").trim()).filter(Boolean);
  if (recalls.length > 0) {
    lines.push("Recalls:");
    recalls.forEach((t, i) => {
      const comma = i < recalls.length - 1 ? "," : "";
      lines.push(`{${jsonEscape(t)}}${comma}`);
    });
  }
  const vivid = snapshots.map((s) => String(s || "").trim()).filter(Boolean);
  if (vivid.length > 0) {
    lines.push("Vivid Memories:");
    vivid.forEach((snap, i) => {
      const comma = i < vivid.length - 1 ? "," : "";
      lines.push(`{${snap}}${comma}`);
    });
  }
  // Preferences: concrete personal texture (tastes/habits/quirks). Placed before Outlook — the
  // lowest-priority block — so the char-budget floor trims Outlook first and this texture is protected.
  const prefs = preferenceLines.map((t) => String(t || "").trim()).filter(Boolean);
  if (prefs.length > 0) {
    lines.push("Preferences:");
    prefs.forEach((t, i) => {
      const comma = i < prefs.length - 1 ? "," : "";
      lines.push(`{${jsonEscape(t)}}${comma}`);
    });
  }
  const outlook = outlookLines.map((t) => String(t || "").trim()).filter(Boolean);
  if (outlook.length > 0) {
    lines.push("Outlook:");
    outlook.forEach((t, i) => {
      const comma = i < outlook.length - 1 ? "," : "";
      lines.push(`{${jsonEscape(t)}}${comma}`);
    });
  }
  lines.push("]");
  return lines.join("\n");
}

/** Updates node vibrancy based on buffer presence (triggered nodes reset to 3/3; others decrement). Returns dying node IDs. */
export function reinforceAndDecay(
  state: CrystallizedState,
  buffer: DistillationBufferItem[]
): { state: CrystallizedState; dyingNodeIds: string[] } {
  const combinedText = buffer.map(item => `${item.actionText} ${item.thoughtText || ""}`).join("\n");
  const dyingNodeIds: string[] = [];

  const nextNodes = state.nodes.map(node => {
    const suffix = node.id.replace(/^\d+_(.*)$/, "$1");
    const isTriggered = isCharacterTriggered(combinedText, suffix, node.id);
    
    let nextVibrancy = node.vibrancy;
    if (isTriggered) {
      nextVibrancy = 3;
    } else {
      nextVibrancy = Math.max(0, node.vibrancy - 1);
    }

    if (nextVibrancy === 0 && node.vibrancy > 0) {
      dyingNodeIds.push(node.id);
    }

    return {
      ...node,
      vibrancy: nextVibrancy
    };
  });

  // Track unreferenced passes for schema subjects referenced in buffer
  const nextUnreferenced = { ...state.unreferencedPasses };
  const nextSchema = state.schema.map(item => {
    const isSubjTriggered = isCharacterTriggered(combinedText, item.subject, "");
    let retired = item.retired;
    if (isSubjTriggered) {
      nextUnreferenced[item.subject] = 0;
      // Re-instate retired subjects if they reappear
      retired = false;
    } else {
      nextUnreferenced[item.subject] = (nextUnreferenced[item.subject] || 0) + 1;
    }
    return {
      ...item,
      retired
    };
  });

  return {
    state: {
      ...state,
      schema: nextSchema,
      nodes: nextNodes,
      unreferencedPasses: nextUnreferenced
    },
    dyingNodeIds
  };
}

/** Parses LLM output into schema updates and new nodes. */
export function parseLlmOutput(output: string): { schema: Omit<SchemaItem, "retired">[]; newSnapshots: string[] } {
  let cleaned = output.trim();
  if (cleaned.startsWith("[")) cleaned = cleaned.slice(1);
  if (cleaned.endsWith("]")) cleaned = cleaned.slice(0, -1);
  if (cleaned.startsWith("{")) cleaned = cleaned.slice(1);
  if (cleaned.endsWith("}")) cleaned = cleaned.slice(0, -1);
  cleaned = cleaned.trim();

  const result = {
    schema: [] as Omit<SchemaItem, "retired">[],
    newSnapshots: [] as string[]
  };

  const sections = cleaned.split(/\n###\s+/);
  for (const sec of sections) {
    const lines = sec.split("\n");
    const firstLine = lines[0];
    const titleLine = firstLine ? firstLine.trim().toLowerCase() : "";

    if (titleLine.includes("i. schema") || titleLine.includes("schema")) {
      for (let i = 1; i < lines.length; i++) {
        const rawLine = lines[i];
        if (!rawLine) continue;
        const line = rawLine.trim();
        if (!line.startsWith("- ")) continue;
        const match = line.match(/^-\s*\[([^\]]+)\]\s*(.*)$/);
        if (match && match[1] !== undefined && match[2] !== undefined) {
          const { subject, aliases } = parseSubjectLabel(match[1]);
          result.schema.push({
            subject,
            text: match[2].trim(),
            aliases
          });
        }
      }
    } else if (titleLine.includes("ii. new nodes") || titleLine.includes("new nodes") || titleLine.includes("nodes")) {
      for (let i = 1; i < lines.length; i++) {
        const rawLine = lines[i];
        if (!rawLine) continue;
        const line = rawLine.trim();
        if (!line.startsWith("- ")) continue;
        let text = line.slice(2).trim();
        if (text.startsWith("Snapshot:")) {
          text = text.slice(9).trim();
        }
        if (text.endsWith("]")) {
          text = text.slice(0, -1).trim();
        }
        if (text) {
          result.newSnapshots.push(text);
        }
      }
    }
  }

  // Fallback line-by-line parsing if sections are missing
  if (result.schema.length === 0 && result.newSnapshots.length === 0) {
    const lines = output.split("\n");
    let inSchema = false;
    let inNodes = false;
    for (const line of lines) {
      const trimmed = line.trim();
      const lower = trimmed.toLowerCase();
      if (lower.includes("schema")) {
        inSchema = true;
        inNodes = false;
        continue;
      }
      if (lower.includes("new nodes") || lower.includes("nodes")) {
        inNodes = true;
        inSchema = false;
        continue;
      }
      
      if (trimmed.startsWith("- ")) {
        if (inSchema) {
          const match = trimmed.match(/^-\s*\[([^\]]+)\]\s*(.*)$/);
          if (match && match[1] !== undefined && match[2] !== undefined) {
            const { subject, aliases } = parseSubjectLabel(match[1]);
            result.schema.push({
              subject,
              text: match[2].trim(),
              aliases
            });
          }
        } else if (inNodes) {
          let text = trimmed.slice(2).trim();
          if (text.startsWith("Snapshot:")) {
            text = text.slice(9).trim();
          }
          if (text.endsWith("]")) {
            text = text.slice(0, -1).trim();
          }
          if (text) {
            result.newSnapshots.push(text);
          }
        }
      }
    }
  }

  // Safety net: generated replies are often wrapped in [] and the model frequently omits the
  // "### I. SCHEMA" header, so a bare "- [Subject] facts" line becomes a headerless section's title
  // and is dropped by the header-based parse above (and the fallback only runs when NOTHING parsed,
  // which fails once a NEW NODES section is present). Capture any "- [Subject] text" line not already
  // represented. Snapshot lines ("- Snapshot: …") have no leading bracket, so they're never matched.
  const haveSubjects = new Set(result.schema.map((s) => s.subject.toLowerCase()));
  for (const rawLine of cleaned.split("\n")) {
    const m = rawLine.trim().match(/^-\s*\[([^\]]+)\]\s*(.+)$/);
    if (!m || m[1] === undefined || m[2] === undefined) continue;
    const { subject, aliases } = parseSubjectLabel(m[1]);
    if (!subject || haveSubjects.has(subject.toLowerCase())) continue;
    result.schema.push({ subject, text: m[2].trim(), aliases });
    haveSubjects.add(subject.toLowerCase());
  }

  return result;
}

function extractKeyword(snapshot: string): string {
  const clean = snapshot.replace(/[^\w\s]/g, "");
  const words = clean.split(/\s+/).filter(Boolean);
  const stops = new Set([
    "the", "a", "an", "he", "she", "it", "they", "we", "i", "you", "in", "on", "at", "to",
    "for", "with", "of", "and", "but", "or", "is", "was", "were", "am", "are", "have", "has",
    "had", "do", "does", "did", "his", "her", "their", "my", "your", "our", "him", "them", "us",
    "me", "this", "that", "these", "those", "then", "there", "here", "when", "where", "why", "how",
    "so", "no", "not", "yes", "up", "out", "about", "into"
  ]);
  
  for (const word of words) {
    const lower = word.toLowerCase();
    if (!stops.has(lower) && word.length > 2) {
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }
  }
  
  return "Memory";
}

const SNAPSHOT_STOPWORDS = new Set([
  "the","and","that","with","from","this","have","were","was","for","his","her","him","she","they",
  "into","onto","over","under","then","than","them","their","been","being","would","could","first",
  "time","when","what","which","while","about","against","still","just","like","some","only","more",
]);

export function snapshotTokens(s: string): Set<string> {
  return new Set(
    String(s || "").toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/)
      .filter((w) => w.length >= 4 && !SNAPSHOT_STOPWORDS.has(w))
  );
}

export const OUTLOOK_CAP = 5;

/** A generalized belief mentions no proper-noun entity (those are Knows). Heuristic: reject a line
 *  containing a capitalized non-sentence-initial word (a name) — keeps Outlook first-person + general. */
function isEntitySpecific(line: string): boolean {
  const body = line.replace(/^\s*[-*•]\s*/, "").trim();
  const words = body.split(/\s+/).slice(1); // ignore sentence-initial capital
  return words.some((w) => /^[A-Z][a-z]{2,}/.test(w));
}

/** Belief lines under a "Beliefs:" marker in the nodes-pass output. First-person, generalized. */
export function parseOutlook(nodesOutput: string): string[] {
  const lines = String(nodesOutput || "").replace(/\r/g, "").split("\n");
  const start = lines.findIndex((l) => /^\s*beliefs\s*:/i.test(l));
  if (start === -1) return [];
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const raw = lines[i]!.trim();
    if (!raw) continue;
    if (/^[A-Za-z .]+:\s*$/.test(raw)) break; // next marker
    const text = raw.replace(/^\s*[-*•]\s*/, "").trim();
    if (!text || !/[a-z]/i.test(text)) continue; // belt and suspenders: reject letterless noise (e.g. a stray "]")
    if (!isEntitySpecific(text)) out.push(text);
  }
  return out;
}

// Preferences are effectively UNCAPPED (the user seeds many by hand and none ever decay); this is a
// pure anti-runaway safety valve, well above any realistic count — the render cap is the real limit.
export const PREFERENCES_STORE_CAP = 200;

/** Strength assigned to a manually-seeded preference (a light "pin" above the auto-distilled default of
 *  3, so user seeds rank a step higher when relevance ties). Preferences never decay, so this only
 *  affects render ranking. */
export const MANUAL_PREFERENCE_STRENGTH = 4;

/** Preference lines under a "Preferences:" marker in the preferences-pass output. First-person, concrete
 *  texture. Unlike Outlook these MAY name a thing (a film, a food), so the entity filter is NOT applied;
 *  the prompt is responsible for keeping people/relationships out. */
export function parsePreferences(prefsOutput: string): string[] {
  const lines = String(prefsOutput || "").replace(/\r/g, "").split("\n");
  const start = lines.findIndex((l) => /^\s*preferences\s*:/i.test(l));
  if (start === -1) return [];
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const raw = lines[i]!.trim();
    if (!raw) continue;
    if (/^[A-Za-z .]+:\s*$/.test(raw)) break; // next marker
    const text = raw.replace(/^\s*[-*•]\s*/, "").trim();
    if (!text || !/[a-z]/i.test(text)) continue; // reject letterless noise (e.g. a stray "]")
    out.push(text);
  }
  return out;
}

/** Preferences NEVER decay — but they CAN change. A fresh line that matches an existing preference
 *  (token overlap ≥ 0.6, the dedup guard) REFINES it in place (text replaced with the newer phrasing,
 *  strength bumped) — that is the "can change". A genuinely new line is appended. Nothing is ever
 *  dropped by distillation (only manual deletion removes a preference); strength is a reinforcement
 *  counter used purely for render ranking, not decay. Order is preserved (matches refine in place). */
export function reconcilePreferences(existing: OutlookBelief[], fresh: string[]): OutlookBelief[] {
  const kept: OutlookBelief[] = existing.map((b) => ({ text: b.text, strength: b.strength }));
  const keptTokens = kept.map((k) => snapshotTokens(k.text));
  for (const line of fresh) {
    const ft = snapshotTokens(line);
    let matched = -1;
    for (let i = 0; i < kept.length; i++) {
      const kt = keptTokens[i]!;
      let inter = 0; for (const t of kt) if (ft.has(t)) inter++;
      if (kt.size > 0 && inter / kt.size >= 0.6) { matched = i; break; }
    }
    if (matched >= 0) {
      kept[matched] = { text: line, strength: Math.min(kept[matched]!.strength + 1, 5) }; // refine + reinforce
      keptTokens[matched] = ft;
    } else {
      kept.push({ text: line, strength: 3 });
      keptTokens.push(ft);
    }
  }
  return kept.slice(0, PREFERENCES_STORE_CAP);
}

/** Apply a user-edited preference list from the NPC Memory Bank editor. Authoritative FULL replace:
 *  deletions (a removed line) and additions both take effect — unlike distillation, the editor is the
 *  one place a preference can be removed. Strength is preserved for a line whose text already existed
 *  (case-insensitive) so its reinforcement history / ranking survives an edit; genuinely new manual
 *  lines get MANUAL_PREFERENCE_STRENGTH. Exact-duplicate manual lines are de-duped. */
export function applyManualPreferences(existing: OutlookBelief[], texts: string[]): OutlookBelief[] {
  const byText = new Map((existing || []).map((b) => [b.text.trim().toLowerCase(), b.strength]));
  const out: OutlookBelief[] = [];
  const seen = new Set<string>();
  for (const raw of texts || []) {
    const text = String(raw || "").trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ text, strength: byText.get(key) ?? MANUAL_PREFERENCE_STRENGTH });
  }
  return out;
}

/** Reinforce (strength=3) re-evidenced beliefs, decay the rest by 1, drop at 0, cap to OUTLOOK_CAP. */
export function reconcileOutlook(existing: OutlookBelief[], fresh: string[]): OutlookBelief[] {
  const freshTokenSets = fresh.map(snapshotTokens);
  const kept: OutlookBelief[] = [];
  for (const b of existing) {
    const bt = snapshotTokens(b.text);
    const reinforced = freshTokenSets.some((ft) => {
      let inter = 0; for (const t of bt) if (ft.has(t)) inter++;
      return bt.size > 0 && inter / bt.size >= 0.6;
    });
    const strength = reinforced ? 3 : b.strength - 1;
    if (strength > 0) kept.push({ text: b.text, strength });
  }
  for (let i = 0; i < fresh.length; i++) {
    const ft = freshTokenSets[i]!;
    const already = kept.some((k) => {
      const kt = snapshotTokens(k.text); let inter = 0; for (const t of kt) if (ft.has(t)) inter++;
      return kt.size > 0 && inter / kt.size >= 0.6;
    });
    if (!already) kept.push({ text: fresh[i]!, strength: 3 });
  }
  return kept.sort((a, b) => b.strength - a.strength).slice(0, OUTLOOK_CAP);
}

/** Merges LLM output, generates Node IDs, cleans faded nodes, and handles subject retirement.
 *  `allowNewSubject` (optional) gates BRAND-NEW subjects only — existing subjects always keep
 *  updating. Used for the never-met gate: the distillation buffer is the GLOBAL story window, so an
 *  owner's schema pass sees scenes they weren't in and invents Knows entries for characters the
 *  owner has never met (the "Romy knows Juniper" bug). The caller passes a co-presence predicate
 *  (character subjects require owner+subject sharing a scene in the window; places/things exempt). */
export function reconcile(
  state: CrystallizedState,
  llmOutput: string,
  nodeCap = 12,
  retirementThreshold = 3,
  ownerName?: string,
  allowNewSubject?: (subject: string, aliases: string[]) => boolean
): CrystallizedState {
  const parsedLlm = parseLlmOutput(llmOutput);

  // Distillation hygiene on the generated schema:
  //  - Drop a truncated trailing entry: the model's token limit cuts the LAST line mid-sentence, and
  //    merging it would overwrite a complete stored fact with a fragment ("…the Knows cuts off").
  //  - Drop self-subjects: an entry about the card's OWN character is redundant with their character
  //    card. (Belt-and-suspenders with the prompt, which also tells the model to omit self.)
  const genSchema = parsedLlm.schema.slice();
  // Only treat the tail as truncated when the model is CLEARLY punctuating elsewhere (≥1 other entry
  // ends with terminal punctuation) but the last entry doesn't — that's a mid-sentence cutoff, not a
  // uniformly terse/unpunctuated style. Avoids dropping legitimately short facts.
  if (genSchema.length >= 2 && looksTruncated(genSchema[genSchema.length - 1]!.text)
      && genSchema.slice(0, -1).some((p) => !looksTruncated(p.text))) {
    genSchema.pop();
  }
  const cleanGenSchema = genSchema.filter((p) => !isSelfSubject({ subject: p.subject, text: p.text, retired: false, aliases: p.aliases }, ownerName));

  // Match-key merge: a generated subject folds into any existing item sharing a match key — a token
  // (canonical or alias) OR an article/possessive/kinship equivalence key (schemaItemMatchKeys), so
  // "The Father"/"My Father"/"Vallois Father" fold into one subject instead of proliferating. The
  // survivor keeps its canonical name + user aliases.
  const newSchema: SchemaItem[] = state.schema.map((e) => ({ ...e, aliases: (e.aliases || []).slice() }));
  const sets = newSchema.map(schemaItemMatchKeys);
  for (const parsed of cleanGenSchema) {
    const pkeys = schemaItemMatchKeys({ subject: parsed.subject, text: parsed.text, retired: false, aliases: parsed.aliases });
    let idx = -1;
    for (let i = 0; i < newSchema.length; i++) {
      for (const t of pkeys) { if (sets[i]?.has(t)) { idx = i; break; } }
      if (idx !== -1) break;
    }
    if (idx >= 0) {
      newSchema[idx]!.text = parsed.text; // keep subject/aliases/retired
    } else {
      // Never-met gate: a BRAND-NEW subject must pass the caller's predicate (existing subjects
      // above always keep updating — they were legitimately established at some point).
      if (allowNewSubject && !allowNewSubject(parsed.subject, parsed.aliases || [])) continue;
      const item: SchemaItem = { subject: parsed.subject, text: parsed.text, retired: false, aliases: (parsed.aliases || []).slice() };
      newSchema.push(item);
      sets.push(schemaItemMatchKeys(item));
      state.unreferencedPasses[parsed.subject] = 0;
    }
  }
  // Durably drop self-subjects already stored from pre-rule distillations (render also filters them).
  state.schema = dedupeSchema(newSchema).filter((item) => !isSelfSubject(item, ownerName));

  // Erase nodes that decayed to 0
  let activeNodes = state.nodes.filter(n => n.vibrancy > 0);

  // Full-list rewrite (prompt-driven dedup): the nodes pass sees the current Vivid list and returns
  // the COMPLETE updated one — merging/dedup is the model's job. Mechanical guards only:
  //  - no parsed lines → keep the existing list (an empty/garbled pass must not wipe memories)
  //  - exact-duplicate lines within one pass are skipped
  //  - a line matching an existing snapshot keeps that node's id (stable for the vivid-memory log)
  //  - a truncated trailing line (output-ceiling mid-word cutoff) is dropped — same asymmetry rule as
  //    the schema-side hygiene above: only when the model is CLEARLY punctuating elsewhere (>=1 other
  //    line ends with terminal punctuation) but the last one doesn't, so a uniformly terse/unpunctuated
  //    list isn't damaged.
  const newSnapshots = parsedLlm.newSnapshots.slice();
  if (newSnapshots.length >= 2 && looksTruncated(newSnapshots[newSnapshots.length - 1]!)
      && newSnapshots.slice(0, -1).some((s) => !looksTruncated(s))) {
    newSnapshots.pop();
  }
  if (newSnapshots.length > 0) {
    let nextSeq = Math.max(0, ...activeNodes.map(n => {
      const match = n.id.match(/^(\d+)_/);
      return match && match[1] !== undefined ? parseInt(match[1]) : 0;
    })) + 1;
    const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
    const seen = new Set<string>();
    const replaced: MemoryNode[] = [];
    for (const snap of newSnapshots) {
      const line = snap.replace(/\s+/g, " ").trim();
      if (!line || seen.has(norm(line))) continue;
      seen.add(norm(line));
      const existing = activeNodes.find(n => norm(n.snapshot) === norm(line));
      if (existing) {
        replaced.push({ ...existing, vibrancy: 3, snapshot: line });
      } else {
        const keyword = extractKeyword(line);
        replaced.push({ id: `${String(nextSeq).padStart(2, "0")}_${keyword}`, vibrancy: 3, snapshot: line, links: [] });
        nextSeq++;
      }
    }
    activeNodes = replaced;
  }

  // Enforce node cap
  if (activeNodes.length > nodeCap) {
    const sortedForPruning = activeNodes.map((node, index) => ({ node, index }))
      .sort((a, b) => {
        if (a.node.vibrancy !== b.node.vibrancy) {
          return a.node.vibrancy - b.node.vibrancy;
        }
        return a.index - b.index;
      });
    
    const keepIndices = new Set(
      sortedForPruning.slice(activeNodes.length - nodeCap).map(item => item.index)
    );
    
    activeNodes = activeNodes.filter((_, index) => keepIndices.has(index));
  }

  state.nodes = activeNodes;

  // Retire faded & unreferenced subjects
  for (const item of state.schema) {
    if (item.retired) continue;
    
    const passes = state.unreferencedPasses[item.subject] ?? 0;
    if (passes >= retirementThreshold) {
      const subjectNameLower = item.subject.toLowerCase();
      const hasActiveNodes = state.nodes.some(node => {
        return node.snapshot.toLowerCase().includes(subjectNameLower) ||
               node.id.toLowerCase().includes(subjectNameLower);
      });
      
      if (!hasActiveNodes) {
        item.retired = true;
      }
    }
  }

  return state;
}

/** Pure predicate: check if a new distillation interval is due (one-interval lag rule). */
export function isWindowDue(totalActions: number, lastThrough: number, K: number): boolean {
  return totalActions >= lastThrough + 2 * K;
}

/** The next distillation window after lastThrough — ALWAYS K-aligned [lastThrough, lastThrough+K].
 *  Never clamp the end to totalActions: that knocks the marker off the K-grid and desyncs the
 *  automatic cadence (the "Distill now dates from 193 instead of 200" bug). */
export function distillationWindow(lastThrough: number, K: number): { start: number; end: number } {
  return { start: lastThrough, end: lastThrough + K };
}

/** Manual "Distill now" is ready once a full K-window of new actions exists. Unlike the automatic
 *  cadence (isWindowDue) it has NO one-interval lag — the user is explicitly asking to catch up the
 *  next ready window now — but it still only fires on a whole window so the grid stays aligned. */
export function isManualWindowReady(totalActions: number, lastThrough: number, K: number): boolean {
  return totalActions >= lastThrough + K;
}

/** Build the generation command for the manual "Consolidate" pass over a Crystallized card's
 *  existing schema. MUST carry the literal {{title}} token, resolved to the card title at generation. */
export function buildConsolidateCommand(knowledgeBlock: string): string {
  return (
    "Consolidate {{title}}'s knowledge list. Merge subjects that refer to the SAME entity or the SAME concept into ONE line, " +
    "keeping the existing canonical name and PRESERVING any aliases after a '|' (never split an aliased group). " +
    "Output ONLY lines in the exact form '- [Canonical | alias1, alias2] facts' (omit the '| ...' when there are no aliases). " +
    "Do not invent new subjects.\n\nKNOWLEDGE:\n" + knowledgeBlock
  );
}

/** Is this card a valid SOURCE character card for distillation? Excludes generated MemorAID memory
 *  cards and the generated "<name> - Crystallized" card (which shares the source's keys, so it would
 *  otherwise satisfy the filter and get distilled twice under a second bookkeeping key). */
export function isDistillationSourceCard(
  card: { type?: string; title?: string; keys?: string; deletedAt?: string | null },
  importantNames: string[]
): boolean {
  if (card.deletedAt) return false;
  const type = (card.type || "").toLowerCase();
  if (type !== "character" && type !== "custom") return false;
  const title = (card.title || "").toLowerCase();
  if (title.endsWith(" (memory)")) return false;
  // A crystallized-TYPE card is already excluded by the character/custom guard above; this catches the
  // generated "<name> - Crystallized" card when it carries a custom type and the source's keys.
  if (title.endsWith(" - crystallized")) return false;
  const keysList = (card.keys || "").split(/[,;]+/).map((k) => k.trim().toLowerCase()).filter(Boolean);
  return importantNames.some((name) => title === name || keysList.includes(name));
}

/** Pairs recent actions in the window with the NPC's thought log entries. */
export function buildDistillationBuffer(
  actions: any[],
  thoughtLog: ThoughtLogEntry[],
  window: { start: number; end: number }
): DistillationBufferItem[] {
  const buffer: DistillationBufferItem[] = [];
  
  for (let i = window.start; i < window.end; i++) {
    if (i < 0 || i >= actions.length) continue;
    const act = actions[i];
    const turnNum = i + 1; // 1-based turn number
    
    const thought = thoughtLog.find(e => e.turn === turnNum);
    const cleanThought = thought ? extractThoughtInner(thought.text) : undefined;
    
    buffer.push({
      actionText: act.text || "",
      thoughtText: cleanThought,
      turn: turnNum
    });
  }
  
  return buffer;
}

/** Finds the crystallized card for a given character. */
export function findCrystallizedCard(cards: CardRow[], name: string): CardRow | undefined {
  const targetTitle = `${name} - Crystallized`.toLowerCase();
  return cards.find(
    (c) =>
      !c.deletedAt &&
      ((c.type || "").toLowerCase() === "crystallized" ||
       (c.type || "").toLowerCase() === "memory" ||
       (c.type || "").toLowerCase() === "character" ||
       (c.type || "").toLowerCase() === "custom") &&
      (c.title || "").toLowerCase() === targetTitle
  );
}
