import { describe, it, expect } from "vitest";
import { assembleGenerationPrompt } from "../src/inference/native";

describe("assembleGenerationPrompt (no cachePrefix — legacy layout)", () => {
  it("folds summary + narrative context ahead of the instruction; no cachePrefix", () => {
    const { user, cachePrefix } = assembleGenerationPrompt({
      summaryText: "Story summary:\nThe kingdom is at war.",
      storyInformation: "Cameron draws his sword.",
      instructions: "Write his thought.",
    });
    expect(cachePrefix).toBeUndefined();
    expect(user).toBe(
      "Story summary:\nThe kingdom is at war.\n\n" +
      "Narrative Context:\nCameron draws his sword.\n\n" +
      "Instructions:\nWrite his thought.",
    );
  });

  it("omits the summary block when there is no summary", () => {
    const { user, cachePrefix } = assembleGenerationPrompt({
      storyInformation: "Cameron draws his sword.",
      instructions: "Write his thought.",
    });
    expect(cachePrefix).toBeUndefined();
    expect(user).toBe("Narrative Context:\nCameron draws his sword.\n\nInstructions:\nWrite his thought.");
  });

  it("is instruction-only when there is no summary or context", () => {
    const { user, cachePrefix } = assembleGenerationPrompt({ instructions: "Write his thought." });
    expect(cachePrefix).toBeUndefined();
    expect(user).toBe("Instructions:\nWrite his thought.");
  });
});

describe("assembleGenerationPrompt (cachePrefix — split layout)", () => {
  it("puts summary + stable bulk in the cached prefix and per-call context + instruction in the tail", () => {
    const { user, cachePrefix } = assembleGenerationPrompt({
      summaryText: "Story summary:\nThe kingdom is at war.",
      cachePrefix: "Current scene:\nA duel begins.",
      storyInformation: "Cameron's nature: brave.",
      instructions: "Write his thought.",
    });
    expect(cachePrefix).toBe(
      "Story summary:\nThe kingdom is at war.\n\nCurrent scene:\nA duel begins.\n\n",
    );
    expect(user).toBe("Narrative Context:\nCameron's nature: brave.\n\nInstructions:\nWrite his thought.");
    // Instruction is LAST (recency).
    expect(user.endsWith("Instructions:\nWrite his thought.")).toBe(true);
  });

  it("stable bulk with no summary yields a prefix of just the shared context", () => {
    const { cachePrefix } = assembleGenerationPrompt({
      cachePrefix: "Current scene:\nA duel begins.",
      storyInformation: "Cameron's nature: brave.",
      instructions: "Write his thought.",
    });
    expect(cachePrefix).toBe("Current scene:\nA duel begins.\n\n");
  });

  it("with a prefix but no per-call context, the tail is instruction-only", () => {
    const { user, cachePrefix } = assembleGenerationPrompt({
      cachePrefix: "Current scene:\nA duel begins.",
      instructions: "Write his thought.",
    });
    expect(cachePrefix).toBe("Current scene:\nA duel begins.\n\n");
    expect(user).toBe("Instructions:\nWrite his thought.");
  });

  it("the prefix is byte-identical for two calls sharing the same summary + scene (cacheable)", () => {
    const shared = { summaryText: "Story summary:\nWar.", cachePrefix: "Current scene:\nDuel." };
    const a = assembleGenerationPrompt({ ...shared, storyInformation: "Cameron brave", instructions: "cmd" });
    const b = assembleGenerationPrompt({ ...shared, storyInformation: "Rena wary", instructions: "cmd" });
    expect(a.cachePrefix).toBe(b.cachePrefix);
    expect(a.user).not.toBe(b.user); // tails differ per character
  });
});
