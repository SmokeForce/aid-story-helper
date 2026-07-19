// ─────────────────────────────────────────────────────────────────────────────
// GENERATION SEAM (public / BYO-provider build).
//
// This is the public counterpart of the feature modules' generation seam. Every feature that needs
// AI text (MemorAID, Living Characters, Crystallized, per-card ⚡ generate, NPC memory) calls
// `generateCard` here instead of talking to a model directly, so provider wiring lives in ONE place.
//
// It is backed by the user's own configured provider (`provider.complete()` — Claude / OpenAI /
// Gemini / Ollama). Unlike a metered per-call story-card mutation, a BYO provider has no per-call
// output cap, so callers that historically split a single logical generation into multiple passes
// purely to fit a length ceiling can — and do — fold that back into one `generateCard` call here.
// ─────────────────────────────────────────────────────────────────────────────

import type { CardRow } from "../shared/types";
import type { Provider } from "./provider";
import { ClaudeProvider } from "./claude";
import { OpenAIProvider } from "./openai";
import { GeminiProvider } from "./gemini";
import { OllamaProvider } from "./ollama";
import { Repo } from "../storage/repo";

const repo = new Repo();

export interface NativeGenOpts {
  temperature?: number;
  /** Prior/scene context for the generation, rendered ahead of the instruction as "Narrative Context". */
  storyInformation?: string;
  /** Whether to fold the adventure's persistent story summary (Plot Essentials / memory) into the
   *  prompt context — the provider-side equivalent of AID's `includeStorySummary`. Defaults to true
   *  (parity with the native default). Callers wanting tightly-bounded context (e.g. per-block NPC
   *  memory distillation) pass false. Requires `card.shortId` to locate the adventure. */
  includeStorySummary?: boolean;
  /** STABLE leading context shared across a batch of related calls — e.g. the scene block that is
   *  byte-identical for every present character in one MemorAID turn. When set, it (together with the
   *  story summary, which is also batch-stable) is sent as a cache-controlled prefix ahead of the
   *  variable `storyInformation` tail, so providers that cache a matching prefix (Claude explicit
   *  `cache_control`; OpenAI / Gemini implicit prefix caching; Ollama KV reuse) charge repeat batch
   *  calls the discounted rate. Only pass it when ≥2 calls will share the identical prefix, or the
   *  Claude cache-write premium isn't amortized. */
  cachePrefix?: string;
}

/**
 * Pure prompt assembler for `generateCard` — split out so the prefix/tail partitioning is unit-
 * testable without a live provider. Given the (already-labeled) story summary, the variable per-call
 * `storyInformation`, an optional batch-stable `cachePrefix`, and the resolved instruction, returns
 * the `user` turn plus the `cachePrefix` to hand to `provider.complete`.
 *
 * With a `cachePrefix`: the batch-stable bulk (summary + shared context) becomes the cached prefix;
 * the variable context and the instruction stay in the uncached tail, instruction LAST for recency.
 * Without one: behaviour is the legacy single-string layout (summary, then context, then instruction).
 */
export function assembleGenerationPrompt(opts: {
  summaryText?: string;
  storyInformation?: string;
  cachePrefix?: string;
  instructions: string;
}): { user: string; cachePrefix?: string } {
  const summaryText = (opts.summaryText || "").trim();
  const ctx = (opts.storyInformation || "").trim();
  const stable = (opts.cachePrefix || "").trim();
  const instr = `Instructions:\n${opts.instructions}`;

  if (stable) {
    const cachePrefix = `${[summaryText, stable].filter(Boolean).join("\n\n")}\n\n`;
    const tailParts: string[] = [];
    if (ctx) tailParts.push(`Narrative Context:\n${ctx}`);
    tailParts.push(instr);
    return { user: tailParts.join("\n\n"), cachePrefix };
  }

  const parts = [summaryText, ctx ? `Narrative Context:\n${ctx}` : ""].filter(Boolean);
  return { user: parts.length ? `${parts.join("\n\n")}\n\n${instr}` : instr };
}

export interface NativeGenResult {
  ok: boolean;
  /** RAW generated text (code-fence stripped). Callers apply their own bracket/field cleaning — that
   *  is feature-specific. */
  value: string;
  message?: string;
}

/** Build the active BYO provider from settings, or return an error message if it isn't configured. */
async function activeProvider(): Promise<Provider | { error: string }> {
  const settings = await repo.getSettings();
  const providerName = settings?.provider || "claude";
  const apiKey = settings?.apiKeys?.[providerName];
  if (!settings || (!apiKey && providerName !== "ollama")) {
    return { error: `Set your API key/endpoint for ${providerName} in settings.` };
  }
  const model = settings.model || "";
  const temp = settings.completionTemperature; // global default; per-call override still possible
  if (providerName === "openai") return new OpenAIProvider(apiKey || "", model || "gpt-4o-mini", temp);
  if (providerName === "gemini") return new GeminiProvider(apiKey || "", model || "gemini-1.5-pro", temp);
  if (providerName === "ollama") return new OllamaProvider(apiKey || "http://localhost:11434", model || "llama3", temp);
  return new ClaudeProvider(apiKey || "", model || "claude-3-5-sonnet-latest", temp);
}

/** Resolve the {{title}} token (left unresolved in templates) to the target card's title. */
function resolveTitleToken(template: string, title: string): string {
  return template.replace(/\{\{\s*title\s*\}\}/g, title);
}

/** Strip a leading/trailing markdown code fence from a provider completion. */
function cleanCompletion(text: string): string {
  let cleaned = text.trim();
  const match =
    cleaned.match(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/) || cleaned.match(/^```[a-zA-Z]*\s*([\s\S]*?)\s*```$/);
  if (match) cleaned = match[1]!.trim();
  return cleaned;
}

/**
 * Generate one card entry via the configured BYO provider. `command` is the instruction template
 * (with {protagonist} already resolved by the caller); {{title}} is resolved here to the card title.
 * `opts.storyInformation` is rendered as the narrative context. Returns the RAW completion; callers
 * do their own cleaning. Never throws on failure — returns `{ ok:false }`.
 */
export async function generateCard(
  card: CardRow,
  command: string,
  _formattingMode: string,
  opts?: NativeGenOpts
): Promise<NativeGenResult> {
  const prov = await activeProvider();
  if ("error" in prov) return { ok: false, value: "", message: prov.error };

  const title = card.title || card.keys || "this entry";
  const resolvedCommand = resolveTitleToken(command, title);
  const system =
    `You are a creative writing assistant generating a Story Card entry for "${title}". ` +
    `Follow the format and instructions exactly, and output only the entry content.`;

  // includeStorySummary (default true): fold the adventure's persistent story summary (Plot
  // Essentials / memory) into the context, the provider-side equivalent of AID's server-side flag.
  let summaryText = "";
  if (opts?.includeStorySummary !== false && card.shortId) {
    try {
      const adv = await repo.getAdventure(card.shortId);
      const summary = (adv?.memory || "").trim();
      if (summary) summaryText = `Story summary:\n${summary}`;
    } catch { /* summary is best-effort context */ }
  }
  const { user, cachePrefix } = assembleGenerationPrompt({
    summaryText,
    storyInformation: opts?.storyInformation,
    cachePrefix: opts?.cachePrefix,
    instructions: resolvedCommand,
  });

  try {
    // temperature: undefined here → provider falls back to the global (settings.completionTemperature)
    // baked in at construction; a feature that sets opts.temperature overrides it for this call.
    const raw = await prov.complete(system, user, { cachePrefix, temperature: opts?.temperature });
    return { ok: true, value: cleanCompletion(raw) };
  } catch (err: any) {
    return { ok: false, value: "", message: err?.message || String(err) };
  }
}
