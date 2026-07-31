import { describe, it, expect } from "vitest";
import { shouldUpdateOpenEditor } from "../src/interceptor/gui-edit";

/**
 * Regression: AID's card editor DOM is card-agnostic — the interceptor can find "the open dialog"
 * but not which card it belongs to. A background regeneration (MemorAID thought, Crystallized
 * re-save, Life card) therefore typed its value into whatever editor was open, and AID's own
 * autosave persisted it: a character Story Card silently became a MemorAID card, or vanished.
 * Reported by two users across multiple scenarios, both models, with and without scripts.
 */
describe("shouldUpdateOpenEditor — open card editor identity gate", () => {
  const CHAR_CARD = "[Role: knight]\nA weathered swordswoman.";
  const MEMORY = "[Rena's Thoughts:\nThe hall smells of rain.\n]";

  it("BLOCKS writing a memory card's value into a different card's open editor", () => {
    // The character card is open; MemorAID regenerates Rena's memory card in the background.
    expect(shouldUpdateOpenEditor({
      shown: CHAR_CARD,
      newValue: MEMORY,
      expectedCurrent: "[Rena's Thoughts:\nAn older thought.\n]",
    })).toBe(false);
  });

  it("ALLOWS the update when the editor shows this card's previous value", () => {
    const prev = "[Rena's Thoughts:\nAn older thought.\n]";
    expect(shouldUpdateOpenEditor({ shown: prev, newValue: MEMORY, expectedCurrent: prev })).toBe(true);
  });

  it("ALLOWS when the editor already shows the new value (same card, already current)", () => {
    expect(shouldUpdateOpenEditor({ shown: MEMORY, newValue: MEMORY, expectedCurrent: undefined })).toBe(true);
  });

  it("BLOCKS when there is no prior for this card — identity cannot be established", () => {
    // First write this session with someone else's card open: refuse rather than guess.
    expect(shouldUpdateOpenEditor({ shown: CHAR_CARD, newValue: MEMORY, expectedCurrent: undefined })).toBe(false);
  });

  it("ALLOWS when no entry textarea was resolved (nothing to clobber)", () => {
    expect(shouldUpdateOpenEditor({ shown: undefined, newValue: MEMORY, expectedCurrent: undefined })).toBe(true);
  });

  it("ignores trailing whitespace and CRLF differences when matching", () => {
    expect(shouldUpdateOpenEditor({
      shown: "  [Role: knight]\r\nA weathered swordswoman.  ",
      newValue: "[Role: knight]\nA weathered swordswoman. Now scarred.",
      expectedCurrent: "[Role: knight]\nA weathered swordswoman.",
    })).toBe(true);
  });

  it("treats an empty open editor as a different card unless that is this card's prior value", () => {
    expect(shouldUpdateOpenEditor({ shown: "", newValue: MEMORY, expectedCurrent: CHAR_CARD })).toBe(false);
    // A genuinely empty freshly-created card whose prior value was "" is still updatable.
    expect(shouldUpdateOpenEditor({ shown: "", newValue: MEMORY, expectedCurrent: "" })).toBe(true);
  });
});
