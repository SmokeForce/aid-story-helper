import { describe, it, expect } from "vitest";
import {
  DEFAULT_CARD_COMMANDS,
  defaultCommandForType,
  hasTitleToken,
  resolveCommand,
  parseProtagonistName,
} from "../src/inference/card-command";

import type { CardRow } from "../src/shared/types";

describe("card command templates", () => {
  it("every default template requires {{title}} and uses {protagonist} (except location)", () => {
    for (const [type, tpl] of Object.entries(DEFAULT_CARD_COMMANDS)) {
      expect(hasTitleToken(tpl), `${type} missing {{title}}`).toBe(true);
      if (type !== "location") {
        expect(tpl.includes("{protagonist}"), `${type} missing {protagonist}`).toBe(true);
      }
    }
  });

  it("defaultCommandForType maps known types and falls back to custom", () => {
    expect(defaultCommandForType("location")).toBe(DEFAULT_CARD_COMMANDS.location);
    expect(defaultCommandForType("Character")).toBe(DEFAULT_CARD_COMMANDS.character);
    expect(defaultCommandForType("Song")).toBe(DEFAULT_CARD_COMMANDS.custom); // non-standard → custom
    expect(defaultCommandForType(undefined)).toBe(DEFAULT_CARD_COMMANDS.character);
  });

  it("resolveCommand substitutes {protagonist} but leaves {{title}} for AID", () => {
    const out = resolveCommand("Entry for {{title}}; you are {protagonist}.", "Smoke Brytefayme");
    expect(out).toBe("Entry for {{title}}; you are Smoke Brytefayme.");
    expect(out).toContain("{{title}}");
    expect(out).not.toContain("{protagonist}");
  });

  it("hasTitleToken is tolerant of inner spacing", () => {
    expect(hasTitleToken("x {{ title }} y")).toBe(true);
    expect(hasTitleToken("no token here")).toBe(false);
  });
});

describe("parseProtagonistName", () => {
  it("reads the established Your name / Player Name conventions", () => {
    expect(parseProtagonistName("[- Your name: Smoke Brytefayme\n- Gender: Male]")).toBe("Smoke Brytefayme");
    expect(parseProtagonistName("Player Name: Jane Doe\nfoo")).toBe("Jane Doe");
  });
  it("returns null when absent", () => {
    expect(parseProtagonistName("nothing relevant")).toBeNull();
    expect(parseProtagonistName(undefined)).toBeNull();
  });
});

