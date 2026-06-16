import type { Provider, InferenceRequest, InferenceResponse } from "./provider";
import { buildPrompt } from "./engine";

function cleanEndpoint(endpoint: string): string {
  let host = (endpoint || "http://localhost:11434").trim();
  if (!/^https?:\/\//i.test(host)) {
    host = "http://" + host;
  }
  // Strip trailing slashes and common Ollama api paths
  host = host.replace(/\/+$/, "");
  host = host.replace(/\/api\/generate$/, "");
  host = host.replace(/\/api\/chat$/, "");
  host = host.replace(/\/api\/tags$/, "");
  host = host.replace(/\/api$/, "");
  host = host.replace(/\/+$/, "");
  return host;
}

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

export function parseOllamaResponse(text: string): InferenceResponse {
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

export class OllamaProvider implements Provider {
  lastRaw: string | null = null;
  constructor(private readonly endpoint: string, private readonly model: string) {}

  async infer(req: InferenceRequest): Promise<InferenceResponse> {
    const { system, user } = buildPrompt(req);
    const host = cleanEndpoint(this.endpoint);
    const modelName = this.model || "llama3";

    const body = {
      model: modelName,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      format: "json",
      stream: false,
      options: {
        temperature: 0.1
      }
    };

    let res: Response;
    try {
      res = await fetch(`${host}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
    } catch (err: any) {
      throw new Error(
        `Failed to reach Ollama at ${host}/api/chat (${err?.message || err}). ` +
        `Verify that: 1. Ollama is running (visit http://127.0.0.1:11434 in a browser tab). ` +
        `2. You reloaded the extension in chrome://extensions or about:debugging. ` +
        `3. (Firefox only) Localhost permissions are explicitly granted in Firefox Add-ons permissions.`
      );
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Ollama API error: HTTP ${res.status} - ${errText}`);
    }

    const json = await res.json();
    this.lastRaw = JSON.stringify(json).slice(0, 4000);
    const content = json.message?.content || "";
    return parseOllamaResponse(content);
  }

  async complete(system: string, user: string, cachePrefix?: string): Promise<string> {
    const host = cleanEndpoint(this.endpoint);
    const modelName = this.model || "llama3";
    // No Anthropic-style prompt caching here — fold the stable prefix into the user content so none is lost.
    const fullUser = cachePrefix ? `${cachePrefix}${user}` : user;

    const body = {
      model: modelName,
      messages: [
        { role: "system", content: system },
        { role: "user", content: fullUser }
      ],
      stream: false,
      options: {
        temperature: 0.1
      }
    };

    let res: Response;
    try {
      res = await fetch(`${host}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
    } catch (err: any) {
      throw new Error(
        `Failed to reach Ollama at ${host}/api/chat (${err?.message || err}). ` +
        `Verify that: 1. Ollama is running (visit http://127.0.0.1:11434 in a browser tab). ` +
        `2. You reloaded the extension in chrome://extensions or about:debugging. ` +
        `3. (Firefox only) Localhost permissions are explicitly granted in Firefox Add-ons permissions.`
      );
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Ollama API error: HTTP ${res.status} - ${errText}`);
    }

    const json = await res.json();
    this.lastRaw = JSON.stringify(json).slice(0, 4000);
    return json.message?.content || "";
  }
}

export async function listOllamaModels(endpoint: string): Promise<string[]> {
  const host = cleanEndpoint(endpoint);
  try {
    const res = await fetch(`${host}/api/tags`);
    if (!res.ok) return ["llama3", "mistral", "gemma"];
    const json = await res.json();
    return Array.isArray(json.models)
      ? json.models.map((m: any) => m.name).sort()
      : ["llama3", "mistral", "gemma"];
  } catch {
    return ["llama3", "mistral", "gemma"];
  }
}
