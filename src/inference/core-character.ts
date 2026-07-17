/**
 * Core Character card engine (spec: docs/superpowers/specs/2026-07-05-memoraid-character-card-redesign-design.md).
 *
 * The card is a COMPASS, not a script (spec §2/§4.1): it carries the character's interior —
 * values, dispositions, self-view, the formative why — and an elastic vocal texture, from which
 * AID improvises behavior. Never abstract psych labels (→ Vulcan caricature), never enumerated
 * state→response rules (→ locked chatbot). Appearance is assembled LOCALLY (Phase 1: pass-through
 * stub; Phase 2: phenotype engine) so the single ~900-char generation call only produces the
 * behavioral interior. Evolution is rare and drift-gated (§6): a verdict line rides the
 * Crystallized nodes pass (parse-then-discard, same pattern as the Life-card Concluded verdict),
 * and an affirmative proposes a bounded single-field revision spliced in format-preserving.
 */

/** Single-pass behavioral generation: Background/Personality/Conversational Style/Voice/Drive (~900 chars).
 *  {protagonist} is resolved by the caller's resolveCommand; {{title}} is required by AID. */
import type { CrystallizedState, OutlookBelief } from "./crystallized";

export const CORE_BEHAVIORAL_TEMPLATE =
  `Generate the interior character profile for {{title}} in an interactive, second-person, present-tense story where "you"/"your" refers to the player character {protagonist}. Write in third person about {{title}}; never use "you" or "your". Ground everything in how {{title}} has actually behaved in the story. Output EXACTLY these five labeled lines, each on its own line, no markdown, no empty lines, and nothing else:\n` +
  `Background: [1-2 sentences: the formative history that shaped who {{title}} is — the why beneath the personality, kept compact.]\n` +
  `Personality: [3-4 sentences of connected prose describing {{title}}'s interior: their values, dispositions, self-image, and what they want from people. Lead with their dominant everyday mode. State how their inner nature relates to how they present publicly — aligned, or masked. Include at least one genuine imperfection or blind spot, and their relationship to their own appearance (at ease with it, insecure, enjoys the attention, indifferent). FORBIDDEN: single-word trait lists, psychology jargon such as "analytical" or "shadow self" or "worldview", any "when X happens they do Y" rule, and any current scene goal.]\n` +
  `Conversational Style: [1 sentence: how {{title}} actually converses — directness, pacing, whether they answer plainly or wander into tangents, revise themselves mid-thought, ask questions back, or land dry asides. Speech BEHAVIOR, distinct from Voice's timbre; never a fixed "when X they say Y" rule.]\n` +
  `Voice: [1-2 sentences: a durable vocal texture or timbre (like low gravel, warm honey, bright silver) plus speech manner, written so the voice can bend naturally with the scene — never tie a specific tone to a specific trigger.]\n` +
  `Drive: [1 sentence: the ONE overarching life want beneath everything {{title}} does — broad and durable, never their current scene objective.]\n` +
  `Keep the whole output under 900 characters. This is a compass for roleplay, not a script: describe who {{title}} is, never what they always do.`;

export function buildCoreCharacterCommand(): string {
  return CORE_BEHAVIORAL_TEMPLATE;
}

/** Pass 1 of the two-pass Core generation: the PHYSICAL pass — Appearance + Scent only, grounded by the
 *  sampled phenotype frame ({appearanceGuidance}). Kept to ~700 chars so it clears AID's ~900-char
 *  per-call generation ceiling comfortably (the single folded call blew past it and truncated). The
 *  behavioral four are a SECOND call via CORE_BEHAVIORAL_TEMPLATE. */
export const CORE_APPEARANCE_TEMPLATE =
  `Generate the physical description for {{title}} in an interactive, second-person, present-tense story where "you"/"your" refers to the player character {protagonist}. Write in third person about {{title}}; never use "you" or "your". Output EXACTLY these two labeled lines, each on its own line, no markdown, no empty lines, and nothing else:\n` +
  `Appearance: [Rich, durable prose: stature/build, face, hair color+style, eye color, skin, distinguishing marks, movement/presence, and a signature style/apparel preference. {appearanceGuidance} Do NOT restate any measurements or cup size in the prose; render figure tastefully and do NOT fabricate explicit sexual anatomy.]\n` +
  `Scent: [A compact two-part signature scent, form "<a> & <b>" (e.g. "honey & vanilla"); avoid defaulting to lavender/ozone.]\n` +
  `Keep the whole output under 700 characters.`;

export function buildCoreAppearanceCommand(): string {
  return CORE_APPEARANCE_TEMPLATE;
}

/** Phenotype-folded single-pass template (spec §4.1): Appearance + Scent + the four behavioral fields
 *  in ONE call, ~1500-char ceiling. RETIRED from the live flow (the folded call truncated past AID's
 *  ~900-char ceiling) in favor of the two-pass split (CORE_APPEARANCE_TEMPLATE + CORE_BEHAVIORAL_TEMPLATE);
 *  kept exported for reference. {appearanceGuidance} is resolved by the caller with the sampled frame. */
export const CORE_CARD_TEMPLATE =
  `Generate the full character profile for {{title}} in an interactive, second-person, present-tense story where "you"/"your" refers to the player character {protagonist}. Write in third person about {{title}}; never use "you" or "your". Ground everything in how {{title}} has actually behaved in the story. Output EXACTLY these seven labeled lines, each on its own line, no markdown, no empty lines, and nothing else:\n` +
  `Appearance: [Rich, durable prose (stature/build, face, hair color+style, eye color, skin, distinguishing marks, movement/presence, and a signature style/apparel preference). {appearanceGuidance} Do NOT restate any measurements or cup size in the prose; render figure tastefully and do NOT fabricate explicit sexual anatomy.]\n` +
  `Scent: [A compact two-part signature scent, form "<a> & <b>" (e.g. "honey & vanilla"); avoid defaulting to lavender/ozone.]\n` +
  `Background: [1-2 sentences: the formative history that shaped who {{title}} is — the why beneath the personality, kept compact.]\n` +
  `Personality: [3-4 sentences of connected prose describing {{title}}'s interior: values, dispositions, self-image, what they want from people. Lead with their dominant everyday mode. State how their inner nature relates to how they present publicly. Include at least one genuine imperfection and their relationship to their own appearance. FORBIDDEN: single-word trait lists, psychology jargon such as "analytical" or "shadow self" or "worldview", any "when X happens they do Y" rule, and any current scene goal.]\n` +
  `Conversational Style: [1 sentence: how {{title}} actually converses — directness, pacing, tangents, self-revision mid-thought, asking questions back, dry asides. Speech BEHAVIOR, distinct from Voice's timbre; never a fixed "when X they say Y" rule.]\n` +
  `Voice: [1-2 sentences: a durable vocal texture or timbre plus speech manner, written so the voice can bend naturally with the scene — never tie a specific tone to a specific trigger.]\n` +
  `Drive: [1 sentence: the ONE overarching life want beneath everything {{title}} does — broad and durable, never their current scene objective.]\n` +
  `Keep the whole output under 1500 characters. This is a compass for roleplay, not a script: describe who {{title}} is, never what they always do.`;

export function buildCoreCardCommand(): string {
  return CORE_CARD_TEMPLATE;
}

/** Match "Label:" at line start, tolerating "-", "•", "*" bullets, whitespace, and a trailing "\r"
 *  (CRLF-authored cards are split on "\n" alone, so each line may still carry a trailing "\r"). */
function fieldLabelRe(field: string, flags = "im"): RegExp {
  return new RegExp(`^\\s*[-•*]?\\s*${field}\\s*:\\s*`, flags);
}

/** Card fields the module knows about; used so a lazily-lowercased known field (e.g. "personality:")
 *  is still recognized as a field-boundary line, while unknown lowercase sublines (e.g. "eyes:") are not. */
const KNOWN_FIELD_LABELS = new Set(
  ["Name", "Gender", "Age", "Appearance", "BWH", "SWH", "Scent", "Quirks", "Background", "Personality", "Conversational Style", "Voice", "Drive"].map((f) =>
    f.toLowerCase()
  )
);

/** A label-shaped line: optional bullet (captured), word of <=~25 chars, colon (trailing "\r" tolerated). */
const LABEL_LINE_RE = /^\s*([-•*]?)\s*([A-Za-z][A-Za-z' &]{0,24}):\s*/;

/** A card's TOP-LEVEL label style, detected from its "Name:" line — the one field every card is
 *  expected to open with. "•" / "-" mean every genuine top-level field uses that bullet; "bare" means
 *  no bullet prefix; null means no detectable Name line at all (card doesn't follow the Name-first
 *  convention, e.g. a test fixture that starts mid-field). Only "•" and "-" activate the stricter
 *  bullet-style boundary rule below — "bare" and null both fall back to the original behavior exactly,
 *  so plain-label cards (most existing fixtures) never regress. */
function detectTopLevelStyle(cardValue: string): "•" | "-" | "bare" | null {
  const lines = String(cardValue || "").split("\n");
  const nameRe = fieldLabelRe("Name", "i");
  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, "");
    if (!nameRe.test(line)) continue;
    const m = LABEL_LINE_RE.exec(line);
    const bullet = m?.[1] || "";
    return bullet === "•" ? "•" : bullet === "-" ? "-" : "bare";
  }
  return null;
}

/** A field-boundary line — the label-shaped AND (first letter uppercase OR a known field, case-insensitively).
 *  Lowercase unknown labels (hand-authored sublines like "eyes:", "build:") are NOT boundaries: they stay
 *  inside the enclosing block. Uppercase unknown labels (custom fields like "Inventory:") remain boundaries.
 *  When `topStyle` is a real bullet ("•" or "-"), a label-shaped line is ONLY a boundary if its own bullet
 *  matches `topStyle` too — a hand-authored card's top-level fields all share one bullet, so a differently-
 *  (or non-)bulleted label-shaped line is interior subline content, not a sibling field. `topStyle` of
 *  "bare"/null (or omitted) preserves the exact original (non-bullet-aware) behavior. */
function isFieldBoundaryLine(line: string, topStyle?: "•" | "-" | "bare" | null): boolean {
  const m = LABEL_LINE_RE.exec(line);
  if (!m) return false;
  const bullet = m[1] || "";
  const label = m[2]!;
  const labelShapeMatches = /^[A-Z]/.test(label) || KNOWN_FIELD_LABELS.has(label.toLowerCase());
  if (!labelShapeMatches) return false;
  if (topStyle === "•" || topStyle === "-") return bullet === topStyle;
  return true;
}

/** Extract one labeled field's text (label stripped), spanning lines until the next label / bracket.
 *  Returned text is always "\r"-free (this is a read, not a write — trimmed, normalized lines are fine);
 *  boundary detection below still works correctly on CRLF-authored cards. */
export function extractFieldBlock(cardValue: string, field: string): string | null {
  const topStyle = detectTopLevelStyle(cardValue);
  const lines = String(cardValue || "").split("\n");
  const startRe = fieldLabelRe(field, "i");
  let out: string[] | null = null;
  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, "");
    if (out === null) {
      if (startRe.test(line)) out = [line.replace(startRe, "")];
      continue;
    }
    if (isFieldBoundaryLine(line, topStyle) || /^\s*\]\s*$/.test(line)) break;
    out.push(line);
  }
  if (out === null) return null;
  const text = out.join("\n").trim();
  return text.length ? text : null;
}

/** Phase 1 STUB of the phenotype engine's Appearance assembly (spec §5): existing Appearance
 *  block when present, else the lazy description as-is. Phase 2 replaces the body, not the signature.
 *  The 1000-char trim is a pathological-input guard for the no-Appearance-label FALLBACK only; the
 *  labeled-extraction path above is never truncated — a rich hand-authored block passes through whole. */
export function buildAppearanceBlock(existingCardValue: string): string {
  const existing = extractFieldBlock(existingCardValue, "Appearance");
  if (existing !== null) return existing;
  const fallback = String(existingCardValue || "").replace(/^\[+|\]+$/g, "").trim();
  return fallback.slice(0, 1000).trim();
}

/** Fields the regeneration NEVER carries forward as a bare top-level field: Name and Appearance are
 *  reassembled explicitly by the caller, Scent is always regenerated by the phenotype-folded card
 *  template (so a carried Scent would duplicate/compound on every regeneration), and Background/
 *  Personality/Conversational Style/Voice/Drive are the behavioral block that fresh generation supersedes
 *  outright (old trait lists / backstory prose are replaced, not merged). Everything else at the TOP LEVEL
 *  (Gender & Age, Archetype, custom fields, BWH/SWH/Quirks, ...) is durable identity data and is carried
 *  forward verbatim. */
const NON_CARRIED_TOP_LEVEL_FIELDS = new Set(
  ["name", "appearance", "scent", "background", "personality", "conversational style", "voice", "drive"]
);

/** Split a hand-authored (or lazy) card into its TOP-LEVEL fields, in original order, honoring the
 *  same bullet-style boundary rule as extractFieldBlock/spliceField (a differently-bulleted or
 *  lowercase-unknown label-shaped line is a subline of the enclosing field, not a sibling). Returns
 *  `{ label, text }` pairs with the label exactly as authored (case/spacing preserved) and text
 *  exactly as authored (verbatim, multi-line bodies included, "\r"-free). Used to carry every
 *  non-behavioral top-level field (spec: lossless Core Character regeneration) without hardcoding
 *  a fixed field list. */
function splitTopLevelFields(cardValue: string): { label: string; text: string }[] {
  const topStyle = detectTopLevelStyle(cardValue);
  const lines = String(cardValue || "")
    .split("\n")
    .map((l) => l.replace(/\r$/, ""))
    .filter((l) => !/^\s*[\[\]]\s*$/.test(l));

  const fields: { label: string; text: string }[] = [];
  let current: { label: string; body: string[] } | null = null;
  for (const line of lines) {
    if (isFieldBoundaryLine(line, topStyle)) {
      if (current) fields.push({ label: current.label, text: current.body.join("\n").trim() });
      const m = LABEL_LINE_RE.exec(line)!;
      current = { label: m[2]!, body: [line.slice(m[0].length)] };
    } else if (current) {
      current.body.push(line);
    }
  }
  if (current) fields.push({ label: current.label, text: current.body.join("\n").trim() });
  return fields;
}

/** Every top-level field NOT in the non-carried set (Name/Appearance/Background/Personality/Voice/
 *  Drive), formatted as "Label: text" lines in original order, ready to splice between the Appearance
 *  block and the fresh behavioral block. Custom fields, Gender & Age, Archetype, BWH/SWH/Scent/Quirks,
 *  etc. all pass through automatically — no fixed allowlist to keep in sync. */
export function extractCarriedTopLevelFields(cardValue: string): string {
  return splitTopLevelFields(cardValue)
    .filter((f) => f.text && !NON_CARRIED_TOP_LEVEL_FIELDS.has(f.label.toLowerCase()))
    .map((f) => `${f.label}: ${f.text}`)
    .join("\n");
}

/** From a folded Core generation output (CORE_CARD_TEMPLATE — Appearance + Scent + the four behavioral
 *  fields in one call), return the BEHAVIORAL block: every generated top-level field EXCEPT Name and
 *  Appearance (i.e. Scent + Background + Personality + Conversational Style + Voice + Drive), as
 *  "Label: text" lines in order. Appearance is assembled separately (preserved authored prose or the
 *  generated one) so it must not also ride the behavioral slot; Name is emitted by assembleCoreCard. */
export function extractBehavioralBlock(foldedOutput: string): string {
  return splitTopLevelFields(foldedOutput)
    .filter((f) => f.text && f.label.toLowerCase() !== "name" && f.label.toLowerCase() !== "appearance")
    .map((f) => `${f.label}: ${f.text}`)
    .join("\n");
}

/** A behavioral field label at the very START of the block — the signature of the clobber bug
 *  (spec: background.ts's hasSaneAppearance): a prior unrestored generation left the ENTIRE Appearance
 *  value holding an echoed behavioral block, so its first line reads "Personality: ..." / "Background: ..."
 *  etc. Checking only the first line (not the whole block) is deliberate: a genuine rich Appearance block
 *  legitimately mentions "Voice"/"Personality" as an interior subline deep in the prose (e.g. VEYA_CARD's
 *  "-Voice: Low and honeyed, with a teasing lilt." vocal-texture note) without being a clobber artifact. */
const BEHAVIORAL_LABEL_AT_START_RE = /^\s*[-*•]?\s*(Background|Personality|Conversational Style|Voice|Drive)\s*:/i;

/** True when the card carries a real, durable Appearance worth preserving (not empty, not a clobber
 *  artifact echoing behavioral labels). Used to choose the reverse-seeded (preserve) path. */
export function hasEstablishedAppearance(cardValue: string): boolean {
  const block = extractFieldBlock(cardValue, "Appearance");
  if (!block) return false;
  const firstLine = block.split("\n")[0] ?? "";
  if (BEHAVIORAL_LABEL_AT_START_RE.test(firstLine)) return false;
  return block.replace(/\s+/g, " ").trim().length >= 40;
}

/** The card's BWH:/SWH: key-pair line, verbatim (label included), or null. */
export function existingKeyPairLine(cardValue: string): string | null {
  const m = String(cardValue || "").match(/^\s*[-•*]?\s*(BWH|SWH)\s*:\s*[^\n\]]+/im);
  return m ? m[0].replace(/^\s*[-•*]?\s*/, "").trim() : null;
}

/** Assemble the full Core Character card: Name + local Appearance + local key-pair/quirks splice +
 *  carried data fields + generated interior. `keyPairLine`/`quirks` are locally-assembled phenotype
 *  data (spec §5); when present, any carried BWH:/SWH:/Quirks: line they supersede is dropped from
 *  `carryFields` so the same field never appears twice in the assembled card. */
export function assembleCoreCard(opts: {
  name: string;
  appearanceBlock: string;
  behavioral: string;
  carryFields?: string;
  keyPairLine?: string;
  quirks?: string[];
}): string {
  const hasSampledQuirks = !!(opts.quirks && opts.quirks.length);

  // The carried Quirks text (if any), captured before we filter the line out — so authored quirks
  // are MERGED with the sampled ones rather than discarded (spec §6: merge, never replace).
  const carriedQuirksText = (() => {
    const m = (opts.carryFields || "").match(/^\s*[-•*]?\s*Quirks\s*:\s*(.+)$/im);
    return m ? m[1]!.trim() : "";
  })();

  const carried = (opts.carryFields || "")
    .split("\n")
    .filter((l) => {
      if (opts.keyPairLine && /^\s*[-•*]?\s*(BWH|SWH)\s*:/i.test(l)) return false;
      // Drop the carried Quirks line ONLY when we will re-emit a merged Quirks line below; otherwise
      // leave it in place (skipped path has no sampled quirks and must not disturb authored quirks).
      if (hasSampledQuirks && /^\s*[-•*]?\s*Quirks\s*:/i.test(l)) return false;
      return true;
    })
    .join("\n")
    .trim();

  // Merge carried + sampled quirks (only when there are sampled quirks). A sampled handedness entry
  // is dropped if the authored quirks already state handedness (authored wins, no contradiction).
  const carriedHasHandedness = /\b(left|right|ambidextrous)[- ]?hand/i.test(carriedQuirksText);
  const extraQuirks = hasSampledQuirks
    ? opts.quirks!.filter((q) => {
        if (carriedQuirksText.toLowerCase().includes(q.toLowerCase())) return false;
        if (carriedHasHandedness && /\b(left|right|ambidextrous)[- ]?hand/i.test(q)) return false;
        return true;
      })
    : [];
  const mergedQuirks = hasSampledQuirks ? [carriedQuirksText, ...extraQuirks].filter(Boolean).join("; ") : "";

  const parts = [
    `Name: ${opts.name}`,
    `Appearance: ${opts.appearanceBlock}`,
    ...(opts.keyPairLine && opts.keyPairLine.trim() ? [opts.keyPairLine.trim()] : []),
    ...(mergedQuirks ? [`Quirks: ${mergedQuirks}`] : []),
    ...(carried ? [carried] : []),
    opts.behavioral.trim(),
  ];
  return `[\n${parts.join("\n")}\n]`;
}

/** The durable core fed to thought generation (Card→Thoughts anchor, spec §8). */
export function extractDurableCore(cardValue: string, maxChars: number): string {
  const personality = extractFieldBlock(cardValue, "Personality");
  const convStyle = extractFieldBlock(cardValue, "Conversational Style");
  const drive = extractFieldBlock(cardValue, "Drive");
  const parts: string[] = [];
  if (personality) parts.push(`Personality: ${personality}`);
  if (convStyle) parts.push(`Conversational Style: ${convStyle}`);
  if (drive) parts.push(`Drive: ${drive}`);
  return parts.join("\n").slice(0, maxChars).trim();
}

/** Replace exactly one field's text; every other byte of the card is preserved (format-preserving
 *  bounded revision, spec §6 — safe on hand-authored cards with custom fields/bullets). Never strips
 *  "\r" globally: CRLF-authored cards (pasted from Windows editors) keep every untouched line's exact
 *  bytes. The newly inserted field line uses the card's dominant line ending ("\r\n" if the card
 *  contains any, else "\n") so it matches its surroundings. */
export function spliceField(cardValue: string, field: string, newText: string): string {
  const raw = String(cardValue || "");
  const topStyle = detectTopLevelStyle(raw);
  const lines = raw.split("\n");
  const startRe = fieldLabelRe(field, "i");
  const stripCr = (l: string) => l.replace(/\r$/, "");
  const start = lines.findIndex((l) => startRe.test(stripCr(l)));
  if (start === -1) return cardValue;
  let end = start + 1;
  while (end < lines.length && !isFieldBoundaryLine(stripCr(lines[end]!), topStyle) && !/^\s*\]\s*$/.test(stripCr(lines[end]!))) end++;
  const label = stripCr(lines[start]!).match(fieldLabelRe(field, "i"))![0];
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  return [...lines.slice(0, start), `${label}${newText}${eol === "\r\n" ? "\r" : ""}`, ...lines.slice(end)].join("\n");
}

export const DRIFT_VERDICT_FIELDS = ["Personality", "Conversational Style", "Voice", "Drive", "Appearance"] as const;

/** Folded into the Crystallized nodes pass; the verdict line is parsed then DISCARDED (never persisted). */
export const DRIFT_JUDGE_INSTRUCTION =
  `\nFinally, judge whether this evidence shows a SUSTAINED, lasting change in who {{title}} fundamentally is — not a mood, not a scene, but a durable shift in their personality, their voice, their life drive, or a permanent physical change. Be conservative: gradual growth across many events counts; a single dramatic moment does not. End your output with exactly one extra line:\n` +
  `Shifted: [${DRIFT_VERDICT_FIELDS.join(" / ")} / none]`;

export function parseDriftVerdict(text: string): { shifted: boolean; field?: (typeof DRIFT_VERDICT_FIELDS)[number] } {
  // Tolerate a model echoing the instruction's own brackets literally (e.g. "Shifted: [Voice]") —
  // the DRIFT_JUDGE_INSTRUCTION shows "Shifted: [Personality / ... / none]", so an optional leading
  // "[" and trailing "]" around the field must not drop real signal.
  // Capture letters AND internal spaces so a multi-word field ("Conversational Style") isn't clipped to
  // its first word; bounded by an optional "]" and the line end, then trimmed and exact-matched.
  const m = String(text || "").match(/(?:^|\n)\s*[-*•]?\s*Shifted:\s*\[?\s*([A-Za-z][A-Za-z ]*?)\s*\]?\s*(?:\n|$)/i);
  if (!m) return { shifted: false };
  const raw = m[1]!.trim().toLowerCase();
  const field = DRIFT_VERDICT_FIELDS.find((f) => f.toLowerCase() === raw);
  return field ? { shifted: true, field } : { shifted: false };
}

/** Remove the verdict line so it never pollutes crystallized node parsing. */
export function stripDriftVerdictLine(text: string): string {
  return String(text || "")
    .split("\n")
    .filter((l) => !/^\s*[-*•]?\s*Shifted:\s*/i.test(l))
    .join("\n");
}

/** Bounded single-field revision (one generation call). Output = the new field text ONLY;
 *  the caller splices it via spliceField so the rest of the card is untouched. */
export function buildBoundedRevisionCommand(field: string, currentFieldText: string): string {
  return (
    `The character {{title}} has genuinely changed over the story. Their card's ${field} currently reads:\n` +
    `${currentFieldText}\n` +
    `Based on what {{title}} has actually lived through (see the provided memories and thoughts), rewrite ONLY this ${field} text to reflect the sustained change — evolve it, do not replace the person. Preserve everything still true; revise only what the evidence supports. Write in third person about {{title}}. FORBIDDEN: psychology jargon ("analytical", "shadow self", "worldview"), trait lists, "when X they do Y" rules, current scene goals.\n` +
    `Output ONLY the new ${field} text itself — no label, no brackets, no other fields — in under 500 characters.`
  );
}

// ---- Outlook consolidation (§Q → §E) -----------------------------------------------------------
// On a manual Core Character (re)generation — and via a dedicated button — a Crystallize-enabled
// character's current Outlook beliefs are woven into the durable card, then cleared from Crystallized
// (archived first — forgetting is never destructive). The consolidation loop: beliefs gather in
// Crystallized → Core regen bakes them into identity → cleared → gather again.

/** The Outlook beliefs eligible to fold into the character card (render-strength threshold). Returned
 *  as copies so clearing later can't be confused by shared references. */
export function snapshotOutlookForIncorporation(state: CrystallizedState, minStrength = 2): OutlookBelief[] {
  return (state.outlook || []).filter(b => b.strength >= minStrength).map(b => ({ ...b }));
}

/** A new state with exactly the incorporated beliefs removed (matched by normalized text); beliefs
 *  formed after the snapshot are preserved. Does not mutate the input. */
export function clearIncorporatedOutlook(state: CrystallizedState, incorporated: OutlookBelief[]): CrystallizedState {
  const drop = new Set(incorporated.map(b => b.text.trim().toLowerCase()));
  return { ...state, outlook: (state.outlook || []).filter(b => !drop.has(b.text.trim().toLowerCase())) };
}

/** The instruction fragment appended to Core generation so the guaranteed Outlook block is WOVEN into
 *  the character's durable personality/voice (not merely "considered"). LLM owns the prose. */
export const OUTLOOK_INCORPORATION_INSTRUCTION =
  `\n\nThe character has settled into some generalized beliefs about themselves and the world (their Outlook, provided above). ` +
  `Incorporate these beliefs into the durable Personality and Voice — let them shape how {{title}} carries themselves — ` +
  `rather than listing them. They are now part of who {{title}} is.`;
