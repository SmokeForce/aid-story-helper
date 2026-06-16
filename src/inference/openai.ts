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

export class OpenAIProvider implements Provider {
  lastRaw: string | null = null;
  constructor(private readonly apiKey: string, private readonly model: string) {}

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
      temperature: 0.1
    };

    if (useJsonFormat) {
      body.response_format = { type: "json_object" };
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI API error: HTTP ${res.status} - ${errText}`);
    }

    const json = await res.json();
    this.lastRaw = JSON.stringify(json).slice(0, 4000);
    const content = json.choices?.[0]?.message?.content || "";
    return parseOpenAIResponse(content);
  }

  async complete(system: string, user: string, cachePrefix?: string): Promise<string> {
    const modelName = this.model || "gpt-4o-mini";
    // No Anthropic-style prompt caching here — fold the stable prefix into the user content so none is lost.
    const fullUser = cachePrefix ? `${cachePrefix}${user}` : user;

    const body: any = {
      model: modelName,
      messages: [
        { role: "system", content: system },
        { role: "user", content: fullUser }
      ],
      temperature: 0.1
    };

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI API error: HTTP ${res.status} - ${errText}`);
    }

    const json = await res.json();
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
