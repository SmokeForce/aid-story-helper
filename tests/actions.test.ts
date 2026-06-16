import { describe, it, expect } from "vitest";
import { countActions, sliceLastActions, determineFellOutCards, isCharacterTriggered } from "../src/shared/types";

// Mirrors the real AID action stream: start (opening), then do/story (player inputs)
// each followed by a continue (AI response), plus standalone continues (Continue presses).
const stream = [
  { id: "0", type: "start", text: "opening" },
  { id: "1", type: "do", text: "> You walk in" },
  { id: "2", type: "continue", text: "AI response 1" },
  { id: "3", type: "do", text: "> You sit" },
  { id: "4", type: "continue", text: "AI response 2" },
  { id: "5", type: "continue", text: "AI response 3 (player pressed Continue)" },
  { id: "6", type: "story", text: "> You narrate" },
  { id: "7", type: "continue", text: "AI response 4" },
];

describe("action model", () => {
  it("countActions counts all actions in the stream", () => {
    expect(countActions(stream)).toBe(8);
  });

  it("sliceLastActions(2) returns the last two actions", () => {
    const r = sliceLastActions(stream, 2).map((a: any) => a.id);
    expect(r).toEqual(["6", "7"]);
  });

  it("sliceLastActions(1) returns the last action", () => {
    const pending = [...stream, { id: "8", type: "do", text: "> You wait" }];
    const r = sliceLastActions(pending, 1).map((a: any) => a.id);
    expect(r).toEqual(["8"]);
  });

  it("sliceLastActions returns everything when fewer actions exist than requested", () => {
    expect(sliceLastActions(stream, 99)).toHaveLength(stream.length);
  });

  it("sliceLastActions(0) returns nothing", () => {
    expect(sliceLastActions(stream, 0)).toHaveLength(0);
  });
});

describe("isCharacterTriggered", () => {
  it("detects character triggers via title/keys with word boundaries", () => {
    expect(isCharacterTriggered("Mia is here.", "Mia", "")).toBe(true);
    expect(isCharacterTriggered("Miami is here.", "Mia", "")).toBe(false);
    expect(isCharacterTriggered("Mia is here.", "Johansson", "Mia,johann")).toBe(true);
    expect(isCharacterTriggered("Miami is here.", "Johansson", "Mia,johann")).toBe(false);
  });

  it("handles possessive forms (e.g. Mia's, Elias') of characters and keys", () => {
    expect(isCharacterTriggered("Mia's dog is here.", "Mia", "")).toBe(true);
    expect(isCharacterTriggered("Elias' book is open.", "Elias", "")).toBe(true);
    expect(isCharacterTriggered("Mia's dog is here.", "Mia's", "")).toBe(true);
    expect(isCharacterTriggered("Elias' book is open.", "Elias'", "")).toBe(true);
    expect(isCharacterTriggered("We went to Elias.", "Elias'", "")).toBe(true);
    expect(isCharacterTriggered("Mia’s dog is here.", "Mia’s", "")).toBe(true);
    expect(isCharacterTriggered("Mia's dog is here.", "Mia’s", "")).toBe(true);
  });
});

describe("determineFellOutCards", () => {
  it("detects cards falling out of the action lookback window", () => {
    // Lookback size of 4 actions.
    const actions = [
      { id: "0", type: "start", text: "opening" },
      { id: "1", type: "do", text: "> Elias walks in" },
      { id: "2", type: "continue", text: "Elias answers" }, // Action 1 (Elias mentioned)
      { id: "3", type: "do", text: "> You sit" },
      { id: "4", type: "continue", text: "AI response 2" }, // Action 2
      { id: "5", type: "do", text: "> You wait" },
      { id: "6", type: "continue", text: "AI response 3" }, // Action 3
    ];

    const cards = [
      { id: "c1", type: "character", title: "Elias", keys: "elias" },
    ];

    // If new action is action 3 (indices 5,6)
    // Previous window of 4 actions = 1, 2, 3, 4 (contains Elias)
    // Current window of 4 actions = 3, 4, 5, 6 (does NOT contain Elias)
    // Elias should fall out!
    const fellOut = determineFellOutCards(4, actions, 2, cards);
    expect(fellOut.map((c: any) => c.id)).toEqual(["c1"]);
  });

  it("does not report cards that remain active", () => {
    const actions = [
      { id: "0", type: "start", text: "opening" },
      { id: "1", type: "do", text: "> Elias walks in" },
      { id: "2", type: "continue", text: "Elias answers" }, // Action 1 (Elias mentioned)
      { id: "3", type: "do", text: "> Elias sits" },
      { id: "4", type: "continue", text: "Elias replies" }, // Action 2 (Elias mentioned)
      { id: "5", type: "do", text: "> You wait" },
      { id: "6", type: "continue", text: "AI response 3" }, // Action 3
    ];

    const cards = [
      { id: "c1", type: "character", title: "Elias", keys: "elias" },
    ];

    // Previous window = 1, 2, 3, 4 (Elias mentioned)
    // Current window = 3, 4, 5, 6 (Elias mentioned in 3 and 4)
    // Elias should NOT fall out because he is still active in the current window!
    const fellOut = determineFellOutCards(4, actions, 2, cards);
    expect(fellOut).toHaveLength(0);
  });
});
