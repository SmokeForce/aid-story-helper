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
  if (providerName === "openai") return new OpenAIProvider(apiKey || "", model || "gpt-4o-mini");
  if (providerName === "gemini") return new GeminiProvider(apiKey || "", model || "gemini-1.5-pro");
  if (providerName === "ollama") return new OllamaProvider(apiKey || "http://localhost:11434", model || "llama3");
  return new ClaudeProvider(apiKey || "", model || "claude-3-5-sonnet-latest");
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

  const parts: string[] = [];
  // includeStorySummary (default true): fold the adventure's persistent story summary (Plot
  // Essentials / memory) into the context, the provider-side equivalent of AID's server-side flag.
  if (opts?.includeStorySummary !== false && card.shortId) {
    try {
      const adv = await repo.getAdventure(card.shortId);
      const summary = (adv?.memory || "").trim();
      if (summary) parts.push(`Story summary:\n${summary}`);
    } catch { /* summary is best-effort context */ }
  }
  const ctx = (opts?.storyInformation || "").trim();
  if (ctx) parts.push(`Narrative Context:\n${ctx}`);
  const user = parts.length
    ? `${parts.join("\n\n")}\n\nInstructions:\n${resolvedCommand}`
    : `Instructions:\n${resolvedCommand}`;

  try {
    const raw = await prov.complete(system, user);
    return { ok: true, value: cleanCompletion(raw) };
  } catch (err: any) {
    return { ok: false, value: "", message: err?.message || String(err) };
  }
}
