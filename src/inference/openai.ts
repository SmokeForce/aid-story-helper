import type { Provider, InferenceRequest, InferenceResponse, CompleteOptions } from "./provider";
import { DEFAULT_COMPLETION_TEMPERATURE } from "./provider";
import { buildPrompt } from "./engine";
import { fetchWithRetry } from "./http";

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

export function parseOpenAIResponse(text: string): InferenceResponse {
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
 * Newer OpenAI families (o-series reasoning models, gpt-5) reject the legacy `max_tokens` in favour of
 * `max_completion_tokens`, and reject any `temperature` other than the default. Detected by name so the
 * common case costs no extra round-trip — `sendChatCompletion` still adapts if a model we did not
 * anticipate rejects a parameter.
 */
export function isRestrictedParamModel(model: string): boolean {
  return /^(o\d|gpt-5)/.test((model || "").toLowerCase());
}

/**
 * Rewrite a request payload in response to an "unsupported parameter" 400 so an unanticipated model
 * still succeeds: rename `max_tokens` → `max_completion_tokens`, or drop a `temperature` the model
 * won't accept. Returns null when the error isn't a parameter complaint we can act on (so the caller
 * surfaces the original error instead of retrying blindly). Pure — unit-tested.
 */
export function adaptUnsupportedParam(
  payload: Record<string, unknown>,
  errText: string,
): Record<string, unknown> | null {
  const e = (errText || "").toLowerCase();
  const unsupported = e.includes("not supported") || e.includes("unsupported") || e.includes("only the default");
  if (!unsupported) return null;

  if (e.includes("max_tokens") && "max_tokens" in payload) {
    const { max_tokens, ...rest } = payload;
    return { ...rest, max_completion_tokens: max_tokens };
  }
  if (e.includes("temperature") && "temperature" in payload) {
    const { temperature, ...rest } = payload;
    return rest;
  }
  return null;
}

/** POST a chat completion, adapting the payload once per rejected parameter before giving up. */
async function sendChatCompletion(apiKey: string, body: Record<string, unknown>): Promise<any> {
  let payload = body;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetchWithRetry("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
    }, { label: "OpenAI" });
    if (res.ok) return res.json();

    const errText = await res.text();
    const adapted = attempt < 2 ? adaptUnsupportedParam(payload, errText) : null;
    if (!adapted) throw new Error(`OpenAI API error: HTTP ${res.status} - ${errText}`);
    payload = adapted;
  }
  throw new Error("OpenAI API error: exhausted parameter adaptation");
}

export class OpenAIProvider implements Provider {
  lastRaw: string | null = null;
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly defaultTemperature?: number,
  ) {}

  async infer(req: InferenceRequest): Promise<InferenceResponse> {
    const { system, user } = buildPrompt(req);
    const modelName = this.model || "gpt-4o-mini";

    // Some older models don't support response_format: { type: "json_object" }
    const useJsonFormat = modelName.includes("gpt-4") || modelName.includes("gpt-3.5-turbo-1106") || modelName.includes("gpt-3.5-turbo-0125");

    const body: any = {
      model: modelName,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
    };
    // Reasoning models accept only the default temperature; sending 0.1 is a hard 400 for them.
    if (!isRestrictedParamModel(modelName)) body.temperature = 0.1;

    if (useJsonFormat) {
      body.response_format = { type: "json_object" };
    }

    const json = await sendChatCompletion(this.apiKey, body);
    this.lastRaw = JSON.stringify(json).slice(0, 4000);
    const content = json.choices?.[0]?.message?.content || "";
    return parseOpenAIResponse(content);
  }

  async complete(system: string, user: string, opts?: CompleteOptions): Promise<string> {
    const modelName = this.model || "gpt-4o-mini";
    // OpenAI caches matching prefixes automatically (no config); fold the stable prefix into the user
    // content, first, so a repeated prefix is byte-identical and eligible for the implicit cache.
    const fullUser = opts?.cachePrefix ? `${opts.cachePrefix}${user}` : user;

    const restricted = isRestrictedParamModel(modelName);
    const maxTokens = opts?.maxTokens ?? 4096;

    const body: any = {
      model: modelName,
      messages: [
        { role: "system", content: system },
        { role: "user", content: fullUser }
      ],
      // o-series / gpt-5 renamed this parameter; sending the legacy name is a hard 400 there.
      ...(restricted ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens }),
    };
    if (!restricted) {
      body.temperature = opts?.temperature ?? this.defaultTemperature ?? DEFAULT_COMPLETION_TEMPERATURE;
    }

    const json = await sendChatCompletion(this.apiKey, body);
    this.lastRaw = JSON.stringify(json).slice(0, 4000);
    return json.choices?.[0]?.message?.content || "";
  }
}

export async function listOpenAIModels(apiKey: string): Promise<string[]> {
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { "authorization": `Bearer ${apiKey}` }
  });
  if (!res.ok) return [];
  const json = await res.json();
  return Array.isArray(json.data)
    ? json.data
        .map((m: any) => m.id)
        .filter((id: string) => id.includes("gpt-") || id.includes("o1-") || id.includes("o3-"))
        .sort()
    : [];
}
