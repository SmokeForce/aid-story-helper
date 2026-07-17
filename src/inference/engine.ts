import type { InferenceRequest, InferenceResponse, Proposal, CharacterInput, Provider } from "./provider";

const MAX_ENTRY = 2000;
const COMMON_WORDS = ["cat", "art", "the", "an", "or", "is", "in", "on", "he", "she", "it", "you", "a"];

export const DEFAULT_PROMPT_SECTION_1 = [
  "You maintain character descriptions for an interactive, second-person, present-tense story.",
  "\"You\"/\"your\" always refers to the player character named {protagonist}.",
  "Each `characters` entry has a name, currentEntry, and source: 'plot' = part of the always-in-context Plot Essentials (central/player characters); 'card' = a Story Card (only present when triggered).",
  "Propose action:\"update\" ONLY for characters in `characters` whose state the narrative has concretely changed. Preserve the Entry's existing labeled sections (e.g. 'Appearance:','Personality:') and revise only what the evidence supports.",
  "Do NOT invent new characters and do NOT create Story Cards. Only update entries already provided in `characters`."
].join("\n");

export const DEFAULT_PROMPT_SECTION_2 = [
  "CORE PERSONALITY ESSENCE & COMPRESSION RULES:",
  "  - Focus strictly on 'Core Personality Trait' changes and behavioral shifts, keeping only the barest high-level context to explain why their personality has changed that way. We want to capture the character's essence, psychological filters, and worldview rather than log their story actions or situational scenes.",
  "  - For Appearance, focus on what the character 'usually' looks like (e.g., physical features, default public wardrobe, characteristic style) and typical habits (e.g. public wardrobe choices vs. private/at-home preferences). Absolutely ban transient physical states or highly situational details (e.g., do NOT log smudged mascara, exhausted/red eyes, or specific outfits from a single scene; instead record: 'Usually dresses strategically in public to project a desired image, but now prefers oversized, comfortable clothing in private or safe settings').",
  "  - Absolutely forbid narrative 'fluff', specific dialogue summaries, situational scene recaps, transient settings, item logs, or passing interactions (e.g. do NOT write about coffee orders, penthouse scenes, or specific conversations; instead, record the permanent psychological shift and its driver, e.g. 'Motivated by Smoke's public authenticity, she has discarded her manipulative schemes and is resolved to take ownership of her past rumor campaign against Mia').",
  "  - DO NOT repeat or include descriptions of other characters' actions, status, or behaviors (e.g. do NOT write about how Smoke treats A-list women or what he does; focus *strictly* on the target character's own internal traits).",
  "  - Reference established groups or roles where applicable (e.g. refer to a character's associates collectively as their 'inner circle' if defined in context, rather than listing individual names like Chloe, Jasmine, Marcus, etc. redundantly).",
  "  - Treat entries as active, lightweight, high-density LLM instruction guides for roleplaying the character, not as a story timeline.",
  "  - [CRITICAL RELATIONSHIP PACING DIRECTIVE]: When updating the 'Dynamic ({protagonist}):' relationship field, you must enforce realistic psychological inertia and continuity based strictly on the character's pre-existing profile. Relationships cannot leap from strangers or casual acquaintances to deep intimacy, unearned trust, or intense codependency—nor to absolute hatred, permanent enmity, or extreme paranoia—within a handful of turns. Transition updates must capture the messy, realistic friction of changes (e.g. emotional whiplash, caution, or cognitive dissonance) and show progressive organic softening or hardening, rather than sudden extreme swings or total psychological submission. Focus strictly on the immediate realistic increment of their interaction."
].join("\n");

export const DEFAULT_PROMPT_SECTION_3 = [
  "PLOT ESSENTIALS vs. STORY CARDS LIMITS (CEILINGS, NOT TARGETS):",
  "    * Limits are absolute emergency ceilings: 3,500 characters for the protagonist ({protagonist}), and 2,000 characters for all other central Plot Essentials or Story Cards.",
  "    * Limits are NOT targets. Shorter, high-density entries are highly preferred. If a character description can be kept at 600 characters, do NOT write 1,900 characters. Padding or inflating an entry with decorative adjectives or unnecessary narrative history is a failure.",
  "    * Do not use the available character budget just because it exists. Conserve as much space as possible so the total story context window remains large.",
  "    * When proposing an update, prioritize pruning, condensing, or deleting outdated/redundant information so that new updates do not continuously grow the character's size."
].join("\n");

export const DEFAULT_PROMPT_SECTION_4 = [
  "Never fabricate details absent from both the entry and the narrative. changeSummary is a short plain-English line describing what changed.",
  "Respond with STRICT JSON only: {\"proposals\":[{\"name\",\"action\":\"update\",\"newEntry\",\"changeSummary\",\"suggestedTriggers\"?}]}. Return {\"proposals\":[]} if nothing changed."
].join("\n");

export const DEFAULT_SYSTEM_PROMPT = [
  DEFAULT_PROMPT_SECTION_1,
  DEFAULT_PROMPT_SECTION_2,
  DEFAULT_PROMPT_SECTION_3,
  DEFAULT_PROMPT_SECTION_4
].join("\n\n");

/** Default per-type guidance for the AI when updating a Story Card / Plot Essentials entry. */
export const DEFAULT_TYPE_GUIDANCE: Record<string, string> = {
  character: "A person/being. Track core personality, worldview, relationships, and lasting appearance — not transient scene details.",
  class: "A class in the D&D/MMO sense. Track role, abilities/skills, progression, and defining mechanics — not story events.",
  race: "A species or race. Track innate traits, culture, lore, and details the story reveals about the group as a whole.",
  location: "A place. Track its enduring state, notable features, who/what is typically present, and lasting changes to it.",
  faction: "A group or organization. Track its goals, membership, leadership, alliances/rivalries, and shifts in power or status.",
  custom: "A custom entry whose `type` label is the user's own (e.g. 'Song'). Track whatever is most salient for that kind of entity as the story reveals it.",
  memoraid: "First-person subjective thoughts/reactions from the character's perspective. Bulleted list format in square brackets, e.g. [\n- thought\n- thought\n]. Max 300 chars.",
};

const STD_TYPES = new Set(["character", "class", "race", "location", "faction", "memoraid"]);
/** Normalize a card type to a guidance key; non-standard types map to "custom". */
export function normalizeType(t?: string): string {
  const x = (t ?? "character").toLowerCase();
  return STD_TYPES.has(x) ? x : "custom";
}

export function buildPrompt(req: InferenceRequest): { system: string; user: string } {
  const s1 = req.customPromptSection1 || DEFAULT_PROMPT_SECTION_1;
  const s2 = req.customPromptSection2 || DEFAULT_PROMPT_SECTION_2;
  const s3 = req.customPromptSection3 || DEFAULT_PROMPT_SECTION_3;
  const s4 = req.customPromptSection4 || DEFAULT_PROMPT_SECTION_4;
  const template = [s1, s2, s3, s4].join("\n\n");
  let system = template.replace(/{protagonist}/g, req.protagonist);

  // Always-on (independent of the editable sections above): keep proposal names aligned to the
  // provided entries so Story Cards titled differently from their in-story name still match.
  system +=
    "\n\nNAME FIDELITY: In each proposal, set `name` to the EXACT `name` value of the matching " +
    "`characters` entry — not an in-story nickname, first name, or shortened form.";

  // Always-on: counter over-conservatism on secondary characters. The "no transient fluff" rules
  // can make the model skip a character whose growth is shown through an emotional/pivotal scene.
  system +=
    `\n\nCOVERAGE: Independently evaluate EVERY entry in \`characters\` for trackable change — not ` +
    `only the most prominent character in the scene. Beyond overt personality shifts, a character ` +
    `develops through lasting changes in their relationship toward ${req.protagonist}, their ` +
    `confidence or agency, or their self-understanding — and a single pivotal scene can be the ` +
    `evidence of such a lasting shift, even for a supporting character. Continue to distinguish a ` +
    `permanent change (propose an update) from a purely transient mood or one-off situational ` +
    `detail (do not log), but do not dismiss real growth merely because it surfaced in one scene.`;

  // Always-on: require actual presence/participation, not a passing name-drop.
  system +=
    `\n\nPRESENCE: Only update a character who actively participates in this window — one who does ` +
    `or says something, or is directly involved in events that change them. If a character is merely ` +
    `mentioned, referenced, or named in passing without being present or acting, do NOT update them.`;

  // Always-on forcing function: emit a verdict for EVERY character so the model can't silently
  // anchor on the most dramatic one. Only "update" verdicts are applied; "skip" verdicts are ignored.
  system +=
    `\n\nFORCING FUNCTION: You MUST account for EVERY character in \`characters\`. In \`proposals\`, ` +
    `output exactly one entry per character: set \`action\` to "update" with \`newEntry\` and ` +
    `\`changeSummary\` only if the PRESENCE and COVERAGE rules justify a change; otherwise set ` +
    `\`action\` to "skip" with a brief \`reason\`. Do not omit any listed character and do not invent ` +
    `new ones. Only "update" entries are applied.`;

  // Per-type guidance: include only the types actually present in this batch.
  const guidance = { ...DEFAULT_TYPE_GUIDANCE, ...(req.typeGuidance ?? {}) };
  const presentTypes = [...new Set(req.characters.map((c) => normalizeType(c.type)))];
  if (presentTypes.length > 0) {
    system +=
      "\n\nPER-TYPE GUIDANCE — each `characters` entry has a `type`; apply the matching guidance:\n" +
      presentTypes.map((t) => `  - ${t}: ${guidance[t] ?? ""}`).join("\n");
  }

  if (req.useMemories) {
    system +=
      "\n\nMEMORIES BLOCK SPECIAL INSTRUCTIONS:\n" +
      "  - The `Memories` entry is a list in Plot Essentials titled `Memories (newest to oldest)`.\n" +
      "  - Analyze the narrative for any new, permanent, and significant story milestones that occurred.\n" +
      "  - If new milestones occurred, draft them as one-sentence summaries in the second person (e.g. starting with 'You...') and PREPEND them to the top of the Memories list (below the header line `Memories (newest to oldest):`).\n" +
      "  - Keep existing memories intact in the exact order they are listed (do NOT delete them unless they are redundant).\n" +
      "  - Propose an 'update' to the `Memories` entry with the prepended list. If no new major plot events occurred, do NOT update the Memories entry.";
  }

  const user = JSON.stringify(
    { protagonist: req.protagonist, present: req.present, narrative: req.narrative, characters: req.characters },
    null,
    2
  );
  return { system, user };
}

/** The model is asked for `suggestedTriggers` as a comma-string but occasionally returns an array (or
 *  another JSON type). Coerce to the documented comma-string so downstream string ops never crash with
 *  "suggestedTriggers.split is not a function". Returns undefined for null/empty. */
function normalizeSuggestedTriggers(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map((t) => String(t).trim()).filter(Boolean).join(", ");
  return String(v);
}

function triggerWarning(p: Proposal): string | null {
  // Defensive: normalize here too in case a Proposal reaches this from another path.
  const triggers = normalizeSuggestedTriggers(p.suggestedTriggers as unknown);
  if (!triggers) return null;
  const tokens = triggers
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  for (const t of tokens) {
    // Over-fire risk: a very short trigger, or one that is itself a common word
    // (substring matching means e.g. "cat" fires inside "catastrophe").
    if (t.length <= 2 || COMMON_WORDS.includes(t)) {
      return `Trigger "${t}" for ${p.name} may over-fire (too short or a common word).`;
    }
  }
  return null;
}

export function validateProposals(
  resp: InferenceResponse,
  characters: CharacterInput[],
  protagonistName?: string
): { proposals: Proposal[]; warnings: string[] } {
  // Resolve a proposal's name back to a known character — case-insensitively and including
  // Story Card aliases/trigger keys (e.g. the AI says "Mia" but the card is titled "Mia
  // Johansson"). Without this, those proposals are silently dropped and the card never updates.
  const norm = (s: string) => s.trim().toLowerCase();
  const resolver = new Map<string, { name: string; source: "card" | "plot" }>();
  // Pass 1: canonical names take precedence.
  for (const c of characters) resolver.set(norm(c.name), { name: c.name, source: c.source ?? "card" });
  // Pass 2: aliases fill gaps but never override a canonical name.
  for (const c of characters) {
    for (const a of c.aliases ?? []) {
      const key = norm(a);
      if (key && !resolver.has(key)) resolver.set(key, { name: c.name, source: c.source ?? "card" });
    }
  }
  const proposals: Proposal[] = [];
  const warnings: string[] = [];
  for (const raw of resp.proposals ?? []) {
    // Forcing-function "skip" verdicts carry no entry — ignore them silently (not a warning).
    if ((raw as { action?: string }).action === "skip" || !raw.newEntry || !raw.newEntry.trim()) continue;
    const hit = resolver.get(norm(raw.name));
    if (!hit) {
      warnings.push(`Dropped proposal for unknown character "${raw.name}" (create not allowed; only update known characters).`);
      continue;
    }
    const source = hit.source;
    // Canonicalize the name so the version attaches to the right Story Card / Plot block, and normalize
    // suggestedTriggers to the documented comma-string (the model sometimes returns an array).
    const p: Proposal = { ...raw, name: hit.name, source, suggestedTriggers: normalizeSuggestedTriggers((raw as { suggestedTriggers?: unknown }).suggestedTriggers) };
    const isProtagonist = protagonistName && p.name.trim().toLowerCase() === protagonistName.trim().toLowerCase();
    const limit = isProtagonist ? 3500 : 2000;
    if (p.newEntry.length > limit) {
      p.newEntry = p.newEntry.slice(0, limit);
      warnings.push(`Entry for ${p.name} truncated to ${limit} characters.`);
    }
    const tw = triggerWarning(p);
    if (tw) warnings.push(tw);
    proposals.push(p);
  }
  return { proposals, warnings };
}

export async function analyze(
  provider: Provider,
  req: InferenceRequest
): Promise<{ proposals: Proposal[]; warnings: string[] }> {
  const resp = await provider.infer(req);
  return validateProposals(resp, req.characters, req.protagonist);
}
