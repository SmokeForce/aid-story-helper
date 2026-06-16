import type { Provider, InferenceRequest, InferenceResponse } from "./provider";
import { buildPrompt } from "./engine";

export interface ClaudeRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

export function buildClaudeRequest(apiKey: string, model: string, system: string, user: string, cachePrefix?: string): ClaudeRequest {
  // When a cachePrefix is supplied, send the user turn as two blocks with the cache breakpoint on
  // the stable prefix — prompt caching is a prefix match, so the breakpoint caches system + prefix
  // together and repeated calls sharing that prefix read it at ~0.1x. The variable tail (`user`)
  // sits after the breakpoint and is never cached. Without a prefix, behaviour is unchanged.
  const messageContent = cachePrefix
    ? [
        { type: "text", text: cachePrefix, cache_control: { type: "ephemeral" } },
        { type: "text", text: user },
      ]
    : user;
  return {
    url: "https://api.anthropic.com/v1/messages",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: messageContent }],
    }),
  };
}

function stripFences(text: string): string {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return (m ? m[1]! : text).trim();
}

function extractFirstTextBlock(json: unknown): string | null {
  const content = (json as any)?.content;
  if (!Array.isArray(content)) return null;
  for (const block of content) {
    if (block && typeof block === "object" && block.type === "text" && typeof block.text === "string") {
      return block.text;
    }
  }
  return null;
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
  // Try from first '{' to last '}'
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const candidate = text.slice(start, end + 1);
  if (!candidate.includes('"proposals"')) return null;
  return candidate;
}

export function parseClaudeResponse(json: unknown): InferenceResponse {
  const text = extractFirstTextBlock(json);
  if (typeof text !== "string") return { proposals: [] };

  // (a) Try fence-stripped text
  const fenceStripped = stripFences(text);
  const fromFence = tryParseProposals(fenceStripped);
  if (fromFence) return fromFence;

  // (b) Try first balanced {...} containing "proposals"
  const balanced = extractBalancedObject(text);
  if (balanced) {
    const fromBalanced = tryParseProposals(balanced);
    if (fromBalanced) return fromBalanced;
  }

  // (c) Fallback
  return { proposals: [] };
}

export function buildModelsRequest(apiKey: string): { url: string; headers: Record<string, string> } {
  return {
    url: "https://api.anthropic.com/v1/models?limit=100",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
  };
}

export function parseModelsResponse(json: unknown): string[] {
  const data = (json as any)?.data;
  return Array.isArray(data)
    ? data
        .map((m: any) => m?.id)
        .filter((x: any): x is string => typeof x === "string")
        .filter((id: string) => id !== "claude-fable-5")
    : [];
}

export async function listModels(apiKey: string): Promise<string[]> {
  const r = buildModelsRequest(apiKey);
  const res = await fetch(r.url, { headers: r.headers });
  return parseModelsResponse(await res.json());
}

export class ClaudeProvider implements Provider {
  lastRaw: string | null = null;
  constructor(private readonly apiKey: string, private readonly model: string) {}
  async infer(req: InferenceRequest): Promise<InferenceResponse> {
    const { system, user } = buildPrompt(req);
    const r = buildClaudeRequest(this.apiKey, this.model, system, user);
    const res = await fetch(r.url, { method: "POST", headers: r.headers, body: r.body });
    const json = await res.json();
    this.lastRaw = JSON.stringify(json).slice(0, 4000);
    return parseClaudeResponse(json);
  }
  async complete(system: string, user: string, cachePrefix?: string): Promise<string> {
    const r = buildClaudeRequest(this.apiKey, this.model, system, user, cachePrefix);
    const res = await fetch(r.url, { method: "POST", headers: r.headers, body: r.body });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Claude API error: HTTP ${res.status} - ${errText}`);
    }
    const json = await res.json();
    this.lastRaw = JSON.stringify(json).slice(0, 4000);
    const u = (json as any)?.usage;
    if (u) {
      // Cache visibility: cache_read_input_tokens > 0 means a prefix hit. If it stays 0 across
      // repeated calls that should share a prefix, the prefix is below the model's minimum
      // cacheable size (Opus 4.8: 4096 tokens; Sonnet 4.6: 2048) or a byte changed in it.
      console.info(`[AID claude] usage: input=${u.input_tokens} cache_write=${u.cache_creation_input_tokens ?? 0} cache_read=${u.cache_read_input_tokens ?? 0} output=${u.output_tokens}`);
    }
    const text = extractFirstTextBlock(json);
    if (typeof text !== "string") {
      throw new Error(`Invalid response structure from Claude: ${JSON.stringify(json)}`);
    }
    return text;
  }
}
