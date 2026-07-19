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

/** Fallback completion temperature when neither the call nor the provider instance sets one. Kept
 *  consistent across providers so the same feature generates with the same warmth regardless of the
 *  configured backend (Claude previously ran at the API default ~1.0 while the others ran at 0.1). */
export const DEFAULT_COMPLETION_TEMPERATURE = 0.7;

export interface CompleteOptions {
  /**
   * STABLE leading portion of the user message, logically prepended to `user` (full prompt =
   * system + cachePrefix + user). Providers that support prompt caching (Claude) emit it as a
   * separate cache-controlled content block so repeated calls sharing the same prefix read it
   * cheaply; others concatenate it. Only pass it when the same prefix is reused across ≥2 calls
   * (multi-pass / multi-character), otherwise the cache-write premium is paid with no read.
   */
  cachePrefix?: string;
  /** Sampling temperature for this call. Overrides the provider's configured default. */
  temperature?: number;
  /** Max output tokens for this call. Overrides the provider's default cap. */
  maxTokens?: number;
}

export interface Provider {
  infer(req: InferenceRequest): Promise<InferenceResponse>;
  /** Single-shot completion. See {@link CompleteOptions} for the caching/temperature/length knobs. */
  complete(system: string, user: string, opts?: CompleteOptions): Promise<string>;
}

/** Test double: returns a fixed response and records the last request. */
export class MockProvider implements Provider {
  lastRequest: InferenceRequest | null = null;
  lastComplete: { system: string; user: string; opts?: CompleteOptions } | null = null;
  constructor(
    private readonly canned: InferenceResponse,
    private readonly cannedComplete: string = "Mocked completion response"
  ) {}
  async infer(req: InferenceRequest): Promise<InferenceResponse> {
    this.lastRequest = req;
    return this.canned;
  }
  async complete(system: string, user: string, opts?: CompleteOptions): Promise<string> {
    this.lastComplete = { system, user, opts };
    return this.cannedComplete;
  }
}
