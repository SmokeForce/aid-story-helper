export interface CharacterInput {
  name: string;
  currentEntry: string;
  source?: "card" | "plot";
  type?: string; // Story Card type: character/class/race/location/faction or a custom label
  aliases?: string[]; // alternate names (Story Card trigger keys, first name) used to resolve AI proposals back to this entry
}

export interface InferenceRequest {
  protagonist: string;
  present: string[];
  narrative: string;
  characters: CharacterInput[];
  customPromptSection1?: string;
  customPromptSection2?: string;
  customPromptSection3?: string;
  customPromptSection4?: string;
  typeGuidance?: Record<string, string>; // per-type instruction, keyed by normalized type
  useMemories?: boolean;
}

export interface Proposal {
  name: string;
  action: "update" | "create";
  newEntry: string;
  changeSummary: string;
  suggestedTriggers?: string;
  source?: "card" | "plot";
}

export interface InferenceResponse {
  proposals: Proposal[];
}

export interface Provider {
  infer(req: InferenceRequest): Promise<InferenceResponse>;
  /**
   * Single-shot completion. `cachePrefix`, when provided, is the STABLE leading portion of the
   * user message and is logically prepended to `user` (full prompt = system + cachePrefix + user).
   * Providers that support prompt caching (Claude) emit it as a separate cache-controlled content
   * block so repeated calls sharing the same prefix read it cheaply; others just concatenate it.
   * Only pass it when the same prefix will be reused across ≥2 calls (multi-pass / multi-character),
   * otherwise the cache-write premium is paid with no read to amortize it.
   */
  complete(system: string, user: string, cachePrefix?: string): Promise<string>;
}

/** Test double: returns a fixed response and records the last request. */
export class MockProvider implements Provider {
  lastRequest: InferenceRequest | null = null;
  lastComplete: { system: string; user: string; cachePrefix?: string } | null = null;
  constructor(
    private readonly canned: InferenceResponse,
    private readonly cannedComplete: string = "Mocked completion response"
  ) {}
  async infer(req: InferenceRequest): Promise<InferenceResponse> {
    this.lastRequest = req;
    return this.canned;
  }
  async complete(system: string, user: string, cachePrefix?: string): Promise<string> {
    this.lastComplete = { system, user, cachePrefix };
    return this.cannedComplete;
  }
}
