import { describe, it, expect } from "vitest";
import { renderCrystallizedEntry, type CrystallizedState } from "../src/inference/crystallized";

// Regression: a Crystallized card's rendered VALUE is injected into the AI's context. The Knows layer
// renders each subject as {"Name": "text"} — an empty text (or empty subject) produced a bare {"Name": ""}
// / {"": "…"}, injecting an empty "" pair the model then echoes into the story (reported: weird empty
// "" output). Empty entries can arrive from an imported DB / stale schema, so the render boundary must
// drop them — never emit "" or a bare {}.
describe("Crystallized render never injects empty quoted/braced entries", () => {
  const baseState = (): CrystallizedState => ({
    schema: [],
    nodes: [],
    unreferencedPasses: {},
    outlook: [],
    preferences: [],
  });

  it("drops empty-text and empty-subject Knows, keeps the valid ones, and emits no bare \"\"", () => {
    const state = baseState();
    state.schema = [
      { subject: "Cameron", text: "" },                 // empty text → would have rendered {"Cameron": ""}
      { subject: "", text: "orphaned fact" },           // empty subject → would have rendered {"": "…"}
      { subject: "Marissa", text: "A friend I trust." },
    ];
    const out = renderCrystallizedEntry(state, "Smoke", 900);

    expect(out).not.toContain('""');            // no empty quoted string anywhere
    expect(out).not.toMatch(/\{\s*\}/);         // no bare {} entry
    expect(out).toContain("Marissa");           // the valid Knows survives
    expect(out).toContain("A friend I trust.");
    expect(out).not.toContain("Cameron");       // the empty-text subject is gone
  });

  it("omits section entirely (no header) when every entry in it is empty", () => {
    const state = baseState();
    state.schema = [{ subject: "Cameron", text: "   " }]; // whitespace-only → empty
    state.outlook = [{ text: "", strength: 3 }];
    state.preferences = [{ text: "  ", strength: 1 } as any];
    const out = renderCrystallizedEntry(state, "Smoke", 900);

    expect(out).not.toContain('""');
    expect(out).not.toContain("Knows:");        // header suppressed when no valid entries
    expect(out).not.toContain("Outlook:");
    expect(out).not.toContain("Preferences:");
  });

  it("still renders a healthy card normally", () => {
    const state = baseState();
    state.schema = [{ subject: "Rena", text: "Executive; I feel drawn to her." }];
    state.outlook = [{ text: "I don't have to perform to be safe.", strength: 3 }];
    const out = renderCrystallizedEntry(state, "Smoke", 900);

    expect(out).toContain('{"Rena": "Executive; I feel drawn to her."}');
    expect(out).toContain("Outlook:");
    expect(out).not.toContain('""');
  });
});
