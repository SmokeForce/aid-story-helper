import type { Provider, InferenceRequest, InferenceResponse } from "./provider";
import { buildPrompt } from "./engine";

function stripFences(text: string): string {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return (m ? m[1]! : text).trim();
}

function tryParseProposals(s: string): InferenceResponse | null {
  try {
    const parsed = JSON.parse(s);
    if (parsed && typeof parsed === "object" && "proposals" in parsed) {
      return { proposals: Array.isArray(parsed.proposals) ? parsed.proposals : [] };
    }
    return null;
  } catch {
    return null;
  }
}

function extractBalancedObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const candidate = text.slice(start, end + 1);
  if (!candidate.includes('"proposals"')) return null;
  return candidate;
}

export function parseGeminiResponse(text: string): InferenceResponse {
  const fenceStripped = stripFences(text);
  const fromFence = tryParseProposals(fenceStripped);
  if (fromFence) return fromFence;

  const balanced = extractBalancedObject(text);
  if (balanced) {
    const fromBalanced = tryParseProposals(balanced);
    if (fromBalanced) return fromBalanced;
  }

  return { proposals: [] };
}

/**
 * POST a generateContent request with retry on transient failures. Google returns HTTP 500
 * "Internal error encountered." (and 502/503/429) intermittently — especially on preview/Gemma
 * models — so a single hit shouldn't fail the whole card/thought generation. Retries up to twice
 * with backoff; fails fast on non-retryable 4xx.
 *
 * Gemma models on the Gemini API do NOT reliably support a separate `systemInstruction`, so for all `gemma-*`
 * models the system prompt is folded into the user turn instead (avoiding 500 internal errors).
 */
async function geminiGenerate(
  apiKey: string,
  modelName: string,
  system: string,
  user: string,
  generationConfig: Record<string, unknown>
): Promise<any> {
  const isGemma = modelName.toLowerCase().startsWith("gemma");
  const gemmaNeedsFold = isGemma;
  // Gemma specifically tends to emit Markdown and to restate the prompt as a planning scaffold
  // ("Character:", "Goal:", "Latest Action:", asterisk bullets) instead of following the output
  // format. Append a hard plain-text guard as the LAST thing it reads (recency). System is also
  // folded in here because Gemma on the Gemini API has no separate system instruction.
  const GEMMA_FORMAT_GUARD =
    "\n\nFORMAT (MANDATORY): Output ONLY what the instructions above specify, and nothing else. " +
    "Write plain text — NO Markdown, NO asterisks (*), NO bullet characters other than a literal \"- \", NO bold, NO headings, NO indentation. " +
    "Do NOT restate, label, or narrate the prompt, the scene, the character, or your task — never output lines like \"Character:\", \"Goal:\", \"Latest Action:\", or \"Stimulus:\".";
  const userText = isGemma ? `${user}${GEMMA_FORMAT_GUARD}` : user;
  const body = gemmaNeedsFold
    ? { contents: [{ parts: [{ text: `${system}\n\n${userText}` }] }], generationConfig }
    : { contents: [{ parts: [{ text: userText }] }], systemInstruction: { role: "system", parts: [{ text: system }] }, generationConfig };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  let lastErr = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) return res.json();
    lastErr = await res.text();
    const retryable = res.status === 500 || res.status === 502 || res.status === 503 || res.status === 429;
    if (retryable && attempt < 2) {
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
      continue;
    }
    throw new Error(`Gemini API error: HTTP ${res.status} - ${lastErr}`);
  }
  throw new Error(`Gemini API error: ${lastErr}`);
}

export class GeminiProvider implements Provider {
  lastRaw: string | null = null;
  constructor(private readonly apiKey: string, private readonly model: string) {}

  async infer(req: InferenceRequest): Promise<InferenceResponse> {
    const { system, user } = buildPrompt(req);
    const modelName = this.model || "gemini-1.5-pro";
    const json = await geminiGenerate(this.apiKey, modelName, system, user, {
      responseMimeType: "application/json",
      temperature: 0.1,
    });
    this.lastRaw = JSON.stringify(json).slice(0, 4000);
    const parts = json.candidates?.[0]?.content?.parts || [];
    const content = parts
      .filter((p: any) => !p.thought)
      .map((p: any) => p.text || "")
      .join("");
    return parseGeminiResponse(content);
  }

  async complete(system: string, user: string, cachePrefix?: string): Promise<string> {
    const modelName = this.model || "gemini-1.5-pro";
    // No Anthropic-style prompt caching here — fold the stable prefix into the user content so none is lost.
    const fullUser = cachePrefix ? `${cachePrefix}${user}` : user;
    const json = await geminiGenerate(this.apiKey, modelName, system, fullUser, { temperature: 0.1 });
    this.lastRaw = JSON.stringify(json).slice(0, 4000);
    const parts = json.candidates?.[0]?.content?.parts || [];
    return parts
      .filter((p: any) => !p.thought)
      .map((p: any) => p.text || "")
      .join("");
  }
}

export async function listGeminiModels(apiKey: string): Promise<string[]> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  if (!res.ok) {
    // Return a default fallback list if listing fails
    return ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.0-flash-exp"];
  }
  const json = await res.json();
  return Array.isArray(json.models)
    ? json.models
        // Keep only chat-capable models (drops embedding-only models that can't do completion).
        // If the field is absent, don't exclude — better to over-list than hide a valid model.
        .filter((m: any) => {
          const methods = m?.supportedGenerationMethods;
          return !Array.isArray(methods) || methods.includes("generateContent");
        })
        .map((m: any) => (m?.name || "").replace("models/", ""))
        // Gemini chat models AND Gemma open models (previously gemma-* was filtered out entirely).
        .filter((id: string) => id.startsWith("gemini-") || id.startsWith("gemma-"))
        // Drop robotics-ER models — not text-completion chat models.
        .filter((id: string) => !id.includes("robotics"))
        .sort()
    : ["gemini-1.5-pro", "gemini-1.5-flash"];
}
