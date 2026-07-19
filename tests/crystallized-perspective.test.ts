import { describe, it, expect } from "vitest";
import { buildUnifiedDistillationCommand, CRYSTALLIZED_SECTION_HEADERS as H } from "../src/inference/crystallized";

const ALL = { schemaEnabled: true, nodesEnabled: true, outlookEnabled: true, preferencesEnabled: true };

/**
 * Regression: the unified distillation call folded four per-section prompts into one. Each standalone
 * template re-anchored identity ("You are {{title}}… The player character is {protagonist}"), but the
 * unified version stated it only in the preamble — so Vivid/Outlook/Preferences drifted and the card
 * owner absorbed the PLAYER's experiences (an NPC "remembering" escaping Tartarus).
 * The buffer is second-person AID narration whose "You" is the player, which is what makes an
 * unanchored first-person directive bind the wrong person.
 */
describe("unified distillation prompt — perspective contract", () => {
  it("states the second-person contract in the preamble: \"you\" is {protagonist}, not the card owner", () => {
    const cmd = buildUnifiedDistillationCommand(ALL);
    expect(cmd).toContain("second-person");
    // "you" in the narration maps to the protagonist token, explicitly negated for the owner.
    expect(cmd).toMatch(/"you"\/"your" ALWAYS refers to the player character \{protagonist\} — NEVER to you/);
    expect(cmd).toContain("{protagonist} is a SEPARATE person from you");
    expect(cmd).toMatch(/Never adopt \{protagonist\}'s actions, experiences, memories, feelings, or opinions as your own/);
  });

  it("re-anchors identity inside EVERY enabled section, not just the preamble", () => {
    const cmd = buildUnifiedDistillationCommand(ALL);
    for (const header of [H.knows, H.vivid, H.outlook, H.preferences]) {
      const start = cmd.indexOf(header);
      expect(start, `${header} missing`).toBeGreaterThan(-1);
      // Body runs to the next header (or end); it must re-state who the model is.
      const rest = cmd.slice(start + header.length);
      const nextIdx = [H.knows, H.vivid, H.outlook, H.preferences]
        .map((h) => rest.indexOf(h))
        .filter((i) => i !== -1)
        .sort((a, b) => a - b)[0] ?? rest.length;
      const body = rest.slice(0, nextIdx);
      expect(body, `${header} section lost its identity anchor`).toContain("You are {{title}}");
    }
  });

  it("tells Vivid to record only what the owner personally witnessed (the Tartarus-bleed guard)", () => {
    const body = buildUnifiedDistillationCommand(ALL).split(H.vivid)[1]!;
    expect(body).toMatch(/ONLY moments YOU personally witnessed or took part in/);
    expect(body).toMatch(/Scenes experienced by \{protagonist\}[^]*are NOT your memories/);
  });

  it("forbids restating the protagonist's beliefs/preferences as the owner's", () => {
    const cmd = buildUnifiedDistillationCommand(ALL);
    expect(cmd.split(H.outlook)[1]!).toContain("never {protagonist}'s convictions restated as yours");
    expect(cmd.split(H.preferences)[1]!).toContain("never {protagonist}'s");
  });

  it("preserves the exact output formats the downstream parsers depend on", () => {
    const cmd = buildUnifiedDistillationCommand(ALL);
    expect(cmd).toContain('Begin this section with the line "### I. SCHEMA"');
    expect(cmd).toContain('prefixed "- Snapshot: "');
    expect(cmd).toContain('a line reading exactly "Beliefs:"');
    expect(cmd).toContain('a line reading exactly "Preferences:"');
    expect(cmd).toContain('- [Subject] one concise factual+emotional sentence');
  });

  it("emits only the enabled sections (per-pass opt-out still drops the ask)", () => {
    const onlyVivid = buildUnifiedDistillationCommand({
      schemaEnabled: false, nodesEnabled: true, outlookEnabled: false, preferencesEnabled: false,
    });
    expect(onlyVivid).toContain(H.vivid);
    expect(onlyVivid).not.toContain(H.knows);
    expect(onlyVivid).not.toContain(H.outlook);
    expect(onlyVivid).not.toContain(H.preferences);
    // Still carries the perspective contract even when only one section is asked for.
    expect(onlyVivid).toContain("You are {{title}}");
    expect(onlyVivid).toContain("{protagonist} is a SEPARATE person from you");
  });

  it("appends the drift-judge rider to Outlook only when supplied", () => {
    const withJudge = buildUnifiedDistillationCommand({ ...ALL, driftJudgeInstruction: "\nDRIFT_RIDER" });
    expect(withJudge.split(H.outlook)[1]!).toContain("DRIFT_RIDER");
    expect(buildUnifiedDistillationCommand(ALL)).not.toContain("DRIFT_RIDER");
  });
});
