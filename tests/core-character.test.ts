import { describe, it, expect } from "vitest";
import {
  CORE_BEHAVIORAL_TEMPLATE,
  buildCoreCharacterCommand,
  extractFieldBlock,
  buildAppearanceBlock,
  assembleCoreCard,
  extractDurableCore,
  spliceField,
  DRIFT_JUDGE_INSTRUCTION,
  parseDriftVerdict,
  stripDriftVerdictLine,
  buildBoundedRevisionCommand,
  extractCarriedTopLevelFields,
  extractBehavioralBlock,
  CORE_CARD_TEMPLATE,
  buildCoreCardCommand,
  hasEstablishedAppearance,
  existingKeyPairLine,
  CORE_APPEARANCE_TEMPLATE,
  buildCoreAppearanceCommand,
} from "../src/inference/core-character";

describe("two-pass Core generation templates", () => {
  it("pass 1 (appearance) asks only for Appearance + Scent under a ~700 ceiling, with the guidance slot", () => {
    expect(CORE_APPEARANCE_TEMPLATE).toContain("Appearance:");
    expect(CORE_APPEARANCE_TEMPLATE).toContain("Scent:");
    expect(CORE_APPEARANCE_TEMPLATE).toContain("{appearanceGuidance}");
    expect(CORE_APPEARANCE_TEMPLATE).toMatch(/700 characters/);
    expect(CORE_APPEARANCE_TEMPLATE.toLowerCase()).toContain("explicit"); // no-anatomy guard
    // Pass 1 must NOT ask for the behavioral fields (those are pass 2).
    expect(CORE_APPEARANCE_TEMPLATE).not.toContain("Personality:");
    expect(CORE_APPEARANCE_TEMPLATE).not.toContain("Drive:");
    expect(buildCoreAppearanceCommand()).toBe(CORE_APPEARANCE_TEMPLATE);
  });

  it("pass 2 (behavioral) is the existing four-field template, no Appearance/Scent", () => {
    expect(buildCoreCharacterCommand()).toBe(CORE_BEHAVIORAL_TEMPLATE);
    expect(CORE_BEHAVIORAL_TEMPLATE).not.toContain("Appearance:");
    expect(CORE_BEHAVIORAL_TEMPLATE).not.toContain("Scent:");
    expect(CORE_BEHAVIORAL_TEMPLATE).toContain("Personality:");
  });
});

const LAZY_CARD = `[
Name: Juniper Thorne
Appearance: Small and wiry with a shock of neon-pink hair and a septum piercing. She typically carries oversized art portfolios and wears eclectic, paint-splattered clothing.
Personality: Energetic, impulsive, affectionate, scatterbrained, bold, intrusive.
Quirks: She frequently bounces on the balls of her feet when excited and subconsciously doodles on her palms.
Voice: Raspy and high-energy with a fast, breathless pace.
]`;

// Hand-authored bullet-style card (real-world failure case): every TOP-LEVEL field uses a "• " bullet,
// while the Appearance block's own internal sublines use bare/"-" label-shaped lines that must NOT be
// mistaken for top-level boundaries (spec: bullet-style top-level boundary detection).
const VEYA_CARD = `[
• Name: Veya
• Gender & Age: Female, appears late 20s
• Archetype: The Seductive Rogue
• Appearance: Veya is tall and striking.
-Stature & Build: Statuesque, athletic build with subtle curves.
-Measurements: Approximately 32DD-23-35, striking hourglass figure.
-Skin & Grooming: Sun-kissed olive skin, meticulously maintained.
-Face: Sharp cheekbones, full lips, piercing green eyes.
-Piercings: A small silver stud in her left nostril.
Sensory Details: She smells faintly of leather and crushed sage.
-Movement: Moves with a predator's unhurried confidence.
-Voice: Low and honeyed, with a teasing lilt.
- Clothes: A fitted leather bodice and worn traveling trousers.
- Feet: Soft leather boots, scuffed from travel.
- Relationship Status: Unattached, fiercely independent.
- Backstory: Grew up on the streets of a port city, learned to survive by her wits.
• Personality: Cunning, flirtatious, guarded, secretly loyal to the few she trusts.
• BWH: 32DD-23-35
]`;

describe("CORE_BEHAVIORAL_TEMPLATE / buildCoreCharacterCommand", () => {
  it("carries the required {{title}} token and the compass rules", () => {
    const cmd = buildCoreCharacterCommand();
    expect(cmd).toBe(CORE_BEHAVIORAL_TEMPLATE);
    expect(cmd).toContain("{{title}}");
    expect(cmd).toContain("{protagonist}");
    // Emits exactly the behavioral fields (appearance is assembled locally, spec §5)
    for (const f of ["Background:", "Personality:", "Conversational Style:", "Voice:", "Drive:"]) expect(cmd).toContain(f);
    expect(cmd).not.toMatch(/Appearance:\s*\[/); // does not ask the model to generate Appearance
    // Anti-caricature bans are stated in-prompt (spec §4.1/§4.4)
    expect(cmd).toMatch(/analytical/i);
    expect(cmd).toMatch(/900 characters/);
    // No banned schema jargon as field labels
    expect(cmd).not.toMatch(/(?:^|\n)\s*(Core|Manner):/);
  });
});

describe("extractFieldBlock", () => {
  it("extracts a single-line field", () => {
    expect(extractFieldBlock(LAZY_CARD, "Voice")).toBe("Raspy and high-energy with a fast, breathless pace.");
  });
  it("extracts a multi-line field up to the next label", () => {
    const v = `[
Appearance: Tall and lean.
Wears a long coat in all weather.
Personality: quiet
]`;
    expect(extractFieldBlock(v, "Appearance")).toBe("Tall and lean.\nWears a long coat in all weather.");
  });
  it("is case-insensitive on the label and tolerates bullets", () => {
    expect(extractFieldBlock("• appearance: short and stocky\n- Voice: flat", "Appearance")).toBe("short and stocky");
  });
  it("returns null when the field is absent", () => {
    expect(extractFieldBlock(LAZY_CARD, "Scent")).toBeNull();
  });
});

describe("buildAppearanceBlock (Phase 1 stub)", () => {
  it("returns the existing Appearance block when present", () => {
    expect(buildAppearanceBlock(LAZY_CARD)).toContain("neon-pink hair");
    expect(buildAppearanceBlock(LAZY_CARD)).not.toMatch(/^Appearance:/i);
  });
  it("passes the whole lazy value through when no Appearance field exists", () => {
    const lazy = "A tall stranger in a gray cloak.";
    expect(buildAppearanceBlock(lazy)).toBe(lazy);
  });
  it("caps pathological input at 1000 chars", () => {
    expect(buildAppearanceBlock("x".repeat(5000)).length).toBeLessThanOrEqual(1000);
  });

  it("[bullet-style boundaries] does not truncate at an interior label-shaped subline on a '• ' top-level card", () => {
    const block = buildAppearanceBlock(VEYA_CARD);
    // The whole physique/sensory/apparel content must survive — none of it is a top-level boundary
    // under the card's "• " bullet style, so the block runs all the way to "• Personality:".
    expect(block).toContain("32DD-23-35");
    expect(block).toContain("Sensory Details");
    expect(block).toContain("Clothes");
    expect(block).toContain("Low and honeyed, with a teasing lilt."); // the -Voice: subline text
    expect(block).not.toContain("Cunning, flirtatious"); // Personality content must not leak in
  });

  it("[bullet-style boundaries] does not truncate the extracted block (no 1000-char guard on the labeled path)", () => {
    // The 1,000-char trim in buildAppearanceBlock only applies to the no-Appearance-label fallback;
    // a rich hand-authored Appearance block must pass through whole.
    const block = buildAppearanceBlock(VEYA_CARD);
    expect(block.length).toBeGreaterThan(400);
    expect(block).toContain("Grew up on the streets"); // -Backstory: subline text, still inside Appearance
  });
});

describe("assembleCoreCard", () => {
  it("assembles Name + Appearance + carried fields + behavioral into one bracketed card", () => {
    const card = assembleCoreCard({
      name: "Juniper Thorne",
      appearanceBlock: "Small and wiry with neon-pink hair.",
      carryFields: "Scent: turpentine & cherry\nQuirks: Left-handed.",
      behavioral: "Background: Art school dropout.\nPersonality: Warm chaos.\nVoice: Raspy, fast.\nDrive: To be taken seriously.",
    });
    expect(card.startsWith("[")).toBe(true);
    expect(card.endsWith("]")).toBe(true);
    expect(card).toContain("Name: Juniper Thorne");
    expect(card).toContain("Appearance: Small and wiry with neon-pink hair.");
    expect(card).toContain("Scent: turpentine & cherry");
    expect(card.indexOf("Appearance:")).toBeLessThan(card.indexOf("Background:"));
  });
  it("omits the carryFields line cleanly when absent", () => {
    const card = assembleCoreCard({ name: "A", appearanceBlock: "b", behavioral: "Personality: c" });
    expect(card).not.toMatch(/\n\n\n/);
  });

  it("[lossless regen] carries all non-behavioral top-level fields (Gender & Age, Archetype) verbatim, full appearance, fresh behavioral — old Personality/Backstory superseded", () => {
    const appearanceBlock = extractFieldBlock(VEYA_CARD, "Appearance")!;
    const carryFields = ["Gender & Age: Female, appears late 20s", "Archetype: The Seductive Rogue"].join("\n");
    const behavioral =
      "Background: Learned to read people before she could read words.\n" +
      "Personality: She trusts almost no one, and the ones she does, she'd bleed for.\n" +
      "Voice: Low and honeyed, with a teasing lilt that hides how carefully she's listening.\n" +
      "Drive: To never again be the one with no leverage in the room.";
    const card = assembleCoreCard({ name: "Veya", appearanceBlock, carryFields, behavioral });

    expect(card).toContain("Gender & Age: Female, appears late 20s");
    expect(card).toContain("Archetype: The Seductive Rogue");
    expect(card).toContain("32DD-23-35"); // full appearance carried
    expect(card).toContain("Sensory Details");
    expect(card).toContain("Grew up on the streets"); // old -Backstory: subline, but as PART of the carried Appearance block, not a top-level field
    expect(card).toContain("To never again be the one with no leverage in the room."); // fresh behavioral
    expect(card).not.toContain("Cunning, flirtatious"); // old top-level Personality trait list superseded
  });
});

describe("extractBehavioralBlock (folded CORE_CARD_TEMPLATE output split)", () => {
  // The folded generation returns Appearance + Scent + the four behavioral fields; the behavioral slot
  // fed to assembleCoreCard must exclude Name and Appearance (Appearance is assembled separately) but
  // keep Scent/Background/Personality/Conversational Style/Voice/Drive verbatim and in order.
  const folded =
    "Name: Katelyn Wilson\n" +
    "Appearance: Tall with a graceful, statuesque presence and warm honey-toned skin.\n" +
    "Scent: wild berries & warm vanilla\n" +
    "Background: Cultivated a life rooted in emotional maturity and kindness.\n" +
    "Personality: Primarily playful and warm, presenting a genuine, open self.\n" +
    "Conversational Style: Speaks with a light, curious energy, asking engaging questions.\n" +
    "Voice: A warm, honey-like timbre that feels comforting and inviting.\n" +
    "Drive: To build a life centered on authentic intimacy and a supportive partnership.";

  it("drops Name and Appearance, keeps Scent through Drive in order", () => {
    const behavioral = extractBehavioralBlock(folded);
    expect(behavioral).not.toMatch(/^\s*Name:/m);
    expect(behavioral).not.toMatch(/Appearance:/);
    expect(behavioral.startsWith("Scent: wild berries & warm vanilla")).toBe(true);
    for (const label of ["Scent", "Background", "Personality", "Conversational Style", "Voice", "Drive"]) {
      expect(behavioral).toContain(`${label}:`);
    }
    expect(behavioral.indexOf("Background:")).toBeLessThan(behavioral.indexOf("Personality:"));
  });

  it("round-trips into the target Core Character format (no Psychology/Worldview)", () => {
    const appearanceBlock = extractFieldBlock(folded, "Appearance")!;
    const behavioral = extractBehavioralBlock(folded);
    const card = assembleCoreCard({
      name: "Katelyn Wilson (Your Love Interest)",
      appearanceBlock, behavioral,
      keyPairLine: "BWH: 36C-29-40",
      quirks: ["Right-handed"],
    });
    for (const label of ["Name:", "Appearance:", "BWH:", "Quirks:", "Scent:", "Background:", "Personality:", "Conversational Style:", "Voice:", "Drive:"]) {
      expect(card).toContain(label);
    }
    // The old multi-pass schema must NOT appear — this is the regression the wiring fix addresses.
    expect(card).not.toMatch(/Psychology:/);
    expect(card).not.toMatch(/Worldview:/);
  });

  it("buildCoreCardCommand carries the {appearanceGuidance} token for the caller to resolve", () => {
    expect(buildCoreCardCommand()).toContain("{appearanceGuidance}");
  });
});

describe("extractCarriedTopLevelFields", () => {
  it("[lossless regen] carries Gender & Age and Archetype verbatim, in order, excluding Name/Appearance/Personality", () => {
    const carried = extractCarriedTopLevelFields(VEYA_CARD);
    expect(carried).toContain("Gender & Age: Female, appears late 20s");
    expect(carried).toContain("Archetype: The Seductive Rogue");
    expect(carried.indexOf("Gender & Age")).toBeLessThan(carried.indexOf("Archetype"));
    expect(carried).not.toMatch(/^Name:/m);
    expect(carried).not.toMatch(/^Appearance:/m);
    expect(carried).not.toContain("Cunning, flirtatious"); // old top-level Personality excluded
  });

  it("carries legacy BWH/SWH/Quirks fields, but NOT Scent (always regenerated — carrying it would duplicate/compound)", () => {
    const v = "[\nName: Juniper\nAppearance: Tall.\nScent: turpentine & cherry\nQuirks: Left-handed.\nPersonality: Warm.\n]";
    const carried = extractCarriedTopLevelFields(v);
    expect(carried).not.toMatch(/Scent:/i);
    expect(carried).toContain("Quirks: Left-handed.");
    expect(carried).not.toContain("Warm.");
  });

  it("returns an empty string when there are no carriable fields", () => {
    const v = "[\nName: Bob\nAppearance: Tall.\nPersonality: Quiet.\n]";
    expect(extractCarriedTopLevelFields(v)).toBe("");
  });
});

describe("extractDurableCore", () => {
  it("returns Personality + Drive under the cap", () => {
    const v = "[\nName: T\nAppearance: tall\nPersonality: warm but guarded\nVoice: low\nDrive: to belong\n]";
    const core = extractDurableCore(v, 400);
    expect(core).toContain("warm but guarded");
    expect(core).toContain("to belong");
    expect(core).not.toContain("tall");
    expect(core.length).toBeLessThanOrEqual(400);
  });
  it("returns empty string when neither field exists", () => {
    expect(extractDurableCore("just prose, no labels", 400)).toBe("");
  });
});

describe("spliceField (bounded, format-preserving revision)", () => {
  it("replaces ONLY the named field; every other line is byte-identical", () => {
    const out = spliceField(LAZY_CARD, "Voice", "Still raspy, but she has learned to slow down when it matters.");
    expect(out).toContain("Voice: Still raspy, but she has learned to slow down when it matters.");
    expect(out).toContain("Name: Juniper Thorne"); // untouched
    expect(out).toContain("bounces on the balls of her feet"); // untouched
    expect(out).not.toContain("fast, breathless pace");
  });
  it("preserves a hand-authored card's custom bullet format", () => {
    const hand = "[\n• Name: Veya\n• Personality: Caring, Honest\n• Quirks: Left-handed.\n]";
    const out = spliceField(hand, "Personality", "Caring, Honest, wiser now");
    expect(out).toContain("• Personality: Caring, Honest, wiser now");
    expect(out).toContain("• Quirks: Left-handed."); // other top-level ("• ") fields untouched
  });
  it("[bullet-style boundaries] a differently-bulleted label-shaped line is a SUBLINE of the field being spliced, not a sibling — it is replaced along with the rest of that field's body", () => {
    // Under the card's "• " top-level style, "- Backstory:" is interior content of the Personality
    // block (same rule as extractFieldBlock), so splicing Personality consumes it too — this is the
    // desired "old Personality/Backstory superseded" behavior from the lossless-regen redesign.
    const hand = "[\n• Name: Veya\n• Personality: Caring, Honest\n- Backstory: From wealth.\n]";
    const out = spliceField(hand, "Personality", "Caring, Honest, wiser now");
    expect(out).toContain("• Personality: Caring, Honest, wiser now");
    expect(out).not.toContain("Backstory: From wealth.");
  });
  it("returns the card unchanged when the field is absent", () => {
    expect(spliceField(LAZY_CARD, "Scent", "pine")).toBe(LAZY_CARD);
  });

  it("preserves CRLF byte-identity on untouched lines; new field text uses CRLF too", () => {
    const crlfCard = "[\r\nName: Bob\r\nVoice: old and tired.\r\nQuirks: hums.\r\n]";
    const out = spliceField(crlfCard, "Voice", "New and steady.");
    // Untouched lines keep their exact \r\n bytes.
    expect(out).toContain("[\r\nName: Bob\r\n");
    expect(out).toContain("\r\nQuirks: hums.\r\n]");
    // The new Voice line uses \r\n on both sides.
    expect(out).toContain("\r\nVoice: New and steady.\r\n");
    expect(out).not.toContain("old and tired");
  });

  it("does not destroy a lowercase known-field line (personality:) when splicing Appearance", () => {
    const v = "[\nAppearance: Tall.\npersonality: quiet\n]";
    const out = spliceField(v, "Appearance", "Short.");
    expect(out).toContain("Appearance: Short.");
    expect(out).toContain("personality: quiet");
    expect(out).not.toContain("Tall.");
  });
});

describe("extractFieldBlock — CRLF and lowercase-label boundary handling", () => {
  it("extracts correctly from a CRLF card and stops at the next label", () => {
    const crlfCard = "[\r\nName: Bob\r\nVoice: old and tired.\r\nQuirks: hums.\r\n]";
    expect(extractFieldBlock(crlfCard, "Voice")).toBe("old and tired.");
    expect(extractFieldBlock(crlfCard, "Name")).toBe("Bob");
  });

  it("treats a lowercase KNOWN field label as a boundary", () => {
    const v = "[\nAppearance: Tall.\npersonality: quiet\n]";
    expect(extractFieldBlock(v, "Appearance")).toBe("Tall.");
    expect(extractFieldBlock(v, "Personality")).toBe("quiet");
  });

  it("keeps a lowercase UNKNOWN label as a subline inside the block", () => {
    const v = "[\nAppearance: Tall.\neyes: emerald green\nVoice: flat\n]";
    expect(extractFieldBlock(v, "Appearance")).toBe("Tall.\neyes: emerald green");
  });
});

describe("extractFieldBlock — bullet-style top-level boundary detection", () => {
  it("on a '• '-top-level card, an uppercase '-Label:' subline is NOT a boundary (stays inside Appearance)", () => {
    const appearance = extractFieldBlock(VEYA_CARD, "Appearance")!;
    expect(appearance).toContain("32DD-23-35");
    expect(appearance).toContain("Sensory Details");
    expect(appearance).toContain("Low and honeyed, with a teasing lilt.");
    expect(appearance).toContain("Grew up on the streets");
    expect(appearance).not.toContain("Cunning, flirtatious");
  });

  it("still stops the Appearance block at the next TOP-LEVEL '• ' field", () => {
    const appearance = extractFieldBlock(VEYA_CARD, "Appearance")!;
    expect(appearance).not.toMatch(/•\s*Personality/i);
  });

  it("extracts Personality itself as only the top-level bulleted content, unaffected by prior sublines", () => {
    expect(extractFieldBlock(VEYA_CARD, "Personality")).toBe(
      "Cunning, flirtatious, guarded, secretly loyal to the few she trusts."
    );
  });

  it("falls back to CURRENT (uppercase-OR-known-label) behavior when there is no detectable Name line", () => {
    // No "Name:" line at all → bare/no top-level style detected → fall back exactly, no regression.
    const v = "Appearance: Tall.\n-Measurements: unknown\nVoice: flat";
    expect(extractFieldBlock(v, "Appearance")).toBe("Tall."); // "-Measurements:" still a boundary (existing rule)
  });

  it("falls back to CURRENT behavior for a bare-style card (no bullet prefix on Name)", () => {
    const v = "[\nName: Bob\nAppearance: Tall.\n-Measurements: unknown\nVoice: flat\n]";
    expect(extractFieldBlock(v, "Appearance")).toBe("Tall."); // bare style -> fallback, "-Measurements:" still boundary
  });
});

describe("drift verdict (parse-then-discard, spec §6)", () => {
  it("instruction carries the Shifted output contract", () => {
    expect(DRIFT_JUDGE_INSTRUCTION).toContain("Shifted:");
    expect(DRIFT_JUDGE_INSTRUCTION).toMatch(/none/);
  });
  it("parses an affirmative with its field", () => {
    expect(parseDriftVerdict("…nodes…\nShifted: Voice")).toEqual({ shifted: true, field: "Voice" });
    expect(parseDriftVerdict("- Shifted: personality")).toEqual({ shifted: true, field: "Personality" });
  });
  it("parses a multi-word field without clipping to its first word", () => {
    expect(parseDriftVerdict("Shifted: Conversational Style")).toEqual({ shifted: true, field: "Conversational Style" });
    expect(parseDriftVerdict("Shifted: [Conversational Style]")).toEqual({ shifted: true, field: "Conversational Style" });
  });
  it("is conservative: none/missing/garbage → not shifted", () => {
    expect(parseDriftVerdict("Shifted: none").shifted).toBe(false);
    expect(parseDriftVerdict("no verdict here").shifted).toBe(false);
    expect(parseDriftVerdict("Shifted: Hairstyle").shifted).toBe(false);
  });
  it("tolerates a model echoing the instruction's brackets around the field", () => {
    // The judge instruction shows "Shifted: [Personality / ... / none]" — a model that echoes the
    // brackets literally (e.g. "Shifted: [Voice]") must still match instead of dropping real signal.
    expect(parseDriftVerdict("Shifted: [Voice]")).toEqual({ shifted: true, field: "Voice" });
    expect(parseDriftVerdict("Shifted: [none]")).toEqual({ shifted: false });
  });
  it("stripDriftVerdictLine removes the line so it never pollutes node parsing", () => {
    const out = stripDriftVerdictLine("{mem one}\nShifted: Voice\n{mem two}");
    expect(out).not.toContain("Shifted:");
    expect(out).toContain("{mem one}");
    expect(out).toContain("{mem two}");
  });
});

describe("buildBoundedRevisionCommand", () => {
  it("carries {{title}}, the field, its current text, and the preserve framing", () => {
    const cmd = buildBoundedRevisionCommand("Voice", "Raspy and fast.");
    expect(cmd).toContain("{{title}}");
    expect(cmd).toContain("Voice");
    expect(cmd).toContain("Raspy and fast.");
    expect(cmd).toMatch(/only|ONLY/);
    expect(cmd).toMatch(/sustained/i);
  });
});

describe("phenotype-folded core template", () => {
  it("template asks for Appearance + Scent + the four behavioral fields with a higher ceiling", () => {
    expect(CORE_CARD_TEMPLATE).toContain("Appearance:");
    expect(CORE_CARD_TEMPLATE).toContain("Scent:");
    expect(CORE_CARD_TEMPLATE).toContain("Personality:");
    expect(CORE_CARD_TEMPLATE).toMatch(/1500 characters/);
    expect(CORE_CARD_TEMPLATE).toContain("{appearanceGuidance}");
    expect(CORE_CARD_TEMPLATE.toLowerCase()).toContain("explicit"); // no-anatomy guard present
    expect(buildCoreCardCommand()).toBe(CORE_CARD_TEMPLATE);
  });

  it("hasEstablishedAppearance is true for a rich block, false for empty/clobbered", () => {
    expect(hasEstablishedAppearance(VEYA_CARD)).toBe(true);
    expect(hasEstablishedAppearance("[\nName: New Guy\n]")).toBe(false);
    // clobbered: Appearance block that embeds behavioral labels is NOT established
    expect(hasEstablishedAppearance("[\nName: X\nAppearance: Personality: cold and aloof\n]")).toBe(false);
  });

  it("existingKeyPairLine returns the card's BWH/SWH line or null", () => {
    expect(existingKeyPairLine(VEYA_CARD)).toBe("BWH: 32DD-23-35");
    expect(existingKeyPairLine("[\nName: X\n]")).toBeNull();
  });
});

describe("assembleCoreCard with local key-pair + quirks", () => {
  it("splices the key-pair line and merges quirks without duplicating carried ones", () => {
    const card = assembleCoreCard({
      name: "Vallois",
      appearanceBlock: "A tall, broad-shouldered man.",
      behavioral: "Background: b.\nPersonality: p.\nVoice: v.\nDrive: d.",
      keyPairLine: "SWH: 46-33-40",
      quirks: ["Left-handed"],
    });
    expect(card).toContain("SWH: 46-33-40");
    expect(card).toContain("Quirks: Left-handed");
    // no duplicate SWH
    expect(card.match(/SWH:/g)!.length).toBe(1);
  });
});

describe("phenotype carry/splice seam (final-review regressions)", () => {
  it("does NOT carry Scent (it is regenerated) — no duplication on regen", () => {
    const card = `[\nName: X\nAppearance: prose.\nScent: cedar & smoke\nArchetype: knight\n]`;
    const carried = extractCarriedTopLevelFields(card);
    expect(carried).not.toMatch(/Scent:/i);
    expect(carried).toContain("Archetype: knight");
  });

  it("merges hand-authored Quirks with sampled quirks (does not discard authored)", () => {
    const out = assembleCoreCard({
      name: "X", appearanceBlock: "prose.",
      behavioral: "Background: b.\nPersonality: p.\nVoice: v.\nDrive: d.",
      carryFields: "Quirks: bounces on the balls of her feet",
      quirks: ["Right-handed"],
    });
    expect(out).toMatch(/Quirks: bounces on the balls of her feet; Right-handed/);
    expect(out.match(/Quirks:/g)!.length).toBe(1);
  });

  it("authored handedness wins over a contradicting sampled handedness", () => {
    const out = assembleCoreCard({
      name: "X", appearanceBlock: "prose.",
      behavioral: "Background: b.\nPersonality: p.\nVoice: v.\nDrive: d.",
      carryFields: "Quirks: Left-handed; doodles on her palms",
      quirks: ["Right-handed"],
    });
    expect(out).toContain("Quirks: Left-handed; doodles on her palms");
    expect(out).not.toMatch(/Right-handed/);
  });
});
