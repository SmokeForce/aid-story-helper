import { describe, it, expect, vi } from "vitest";

// Mock browser global before importing background
(globalThis as any).browser = {
  storage: {
    session: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    },
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    },
  },
  runtime: {
    onMessage: {
      addListener: vi.fn(),
    },
  },
  tabs: {
    query: vi.fn().mockResolvedValue([]),
    sendMessage: vi.fn().mockResolvedValue(undefined),
  },
};

const { detectProperNouns } = await import("../src/background/background");

describe("detectProperNouns - Fixes and Improvements", () => {
  it("should strip possessives correctly (straight and curly apostrophes)", () => {
    const text = "Luna's expression softens. Stella’s arm was touched. We found Jace's keys. Jace’s book is here.";
    const result1 = detectProperNouns(text, ["Luna", "Stella", "Kevin"]);
    // Since Luna and Stella are in knownNames, they should not be suggested.
    expect(result1).not.toContain("Luna");
    expect(result1).not.toContain("Stella");
    expect(result1).toContain("Jace");
    expect(result1).not.toContain("Jace's");
    expect(result1).not.toContain("Jace’s");
  });

  it("should split punctuation-attached proper nouns and ignore boundaries", () => {
    const text = `That is so sweet of you to say, Slimey. Truly. I... I'm so flattered. Stella! Stop it! Right now!`;
    const result = detectProperNouns(text, ["Luna", "Stella", "Kevin"], ["slimey"]);
    
    // Slimey is in lexicon, so it is a proper noun, but should be resolved cleanly without the trailing period.
    // "Truly", "Stop", "Right" are common words or in the ignore list and should be filtered out.
    expect(result).not.toContain("Slimey. Truly");
    expect(result).not.toContain("Slimey.");
    expect(result).not.toContain("Truly");
    expect(result).not.toContain("Stella! Stop");
    expect(result).not.toContain("Stop");
    expect(result).not.toContain("Right");
  });

  it("should reject lowercase candidates that compromise tags as proper nouns due to lexicon overlap", () => {
    const text = "gives your shoulder a firm, playful pat and shows effortless grace under pressure. They are yin and yang.";
    const result = detectProperNouns(text, ["Luna", "Stella", "Kevin"]);
    
    // "pat", "grace", "yang" are lowercase in the text and should not be treated as proper nouns.
    expect(result).not.toContain("pat");
    expect(result).not.toContain("grace");
    expect(result).not.toContain("yang");
  });

  it("should strip AI Dungeon metadata blocks, commands, and bracketed content completely", () => {
    const text = `[Music: Melancholic classical guitar] /[Vocals: None until 0:24] /AC {Cept This Des-Cent In-To the Night} -> Success!`;
    const result = detectProperNouns(text, ["Luna", "Stella", "Kevin"]);
    
    // Bracketed, braced, parenthesized content, and slash commands should be fully stripped before NLP scans.
    // "Success" is in the metadata ignore list.
    expect(result).toEqual([]);
  });

  it("should ignore capitalized common words/verbs at the start of sentences", () => {
    const text = "Besides, the suspense is killing me. Like a heartbeat that's going too fast. Trapped in a room, you fell.";
    const result = detectProperNouns(text, ["Luna", "Stella", "Kevin"]);
    
    // "Besides" and "Like" are common sentence-starters added to the ignore list.
    // "Trapped" (Adjective) and "Fell" (Verb) are single words that match common POS tags when lowercased and should be filtered.
    expect(result).not.toContain("Besides");
    expect(result).not.toContain("Like");
    expect(result).not.toContain("Trapped");
    expect(result).not.toContain("Fell");
  });

  it("should preserve valid multi-word proper nouns", () => {
    const text = "They drove in a Toyota Corolla to see Lorna Shore perform.";
    const result = detectProperNouns(text, ["Luna", "Stella", "Kevin"]);
    
    expect(result).toContain("Toyota Corolla");
    expect(result).toContain("Lorna Shore");
  });

  it("should preserve single-word proper nouns that are not common verbs/adjectives", () => {
    const text = "They listened to Gojira and Meshuggah. Steve listened to them.";
    const result = detectProperNouns(text, ["Luna", "Stella", "Kevin"]);
    
    expect(result).toContain("Gojira");
    expect(result).toContain("Meshuggah");
    expect(result).toContain("Steve");
  });
});
