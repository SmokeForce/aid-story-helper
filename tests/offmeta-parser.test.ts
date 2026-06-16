import { describe, it, expect } from "vitest";
import { parseOffMetaText } from "../src/shared/offmeta-parser";

describe("parseOffMetaText", () => {
  it("parses AIN and AN/PE sections, groups, and items correctly", () => {
    const sampleText = `
👋 Introduction
Some intro text here.

🤖 Premade AIN
Long Form AI Instructions (DS 4 Pro/DS 4 Flash)
The user would like you to pick up telling a collaborative story.
- Use second person, present tense
- No repetition

Zoocata AIN
ROLE: Collaborative Story-writer
- second person, preset tense
- No user input

🤖 AN/PE
Basic Author’s Note:
Setting: Space
Theme: Dark

- This is a roleplaying scenario.

Plot Essentials:
{Your Name: smoke}

[Current Date (MM/DD): 6/1]

⏱️ Pacing
Slow Down:
- Let scenes play out moment by moment
Speed Up:
- Speech should flow naturally

⚙️ Suggested Settings
DeepSeek 4 Pro: 1.2/50
`;

    const parsed = parseOffMetaText(sampleText);

    // Verify sections
    expect(parsed.length).toBe(3);
    expect(parsed[0]!.title).toBe("🤖 Premade AIN");
    expect(parsed[1]!.title).toBe("🤖 AN/PE");
    expect(parsed[2]!.title).toBe("⏱️ Pacing");

    // Verify Premade AIN blocks
    const premadeAIN = parsed[0]!;
    expect(premadeAIN.groups.length).toBe(1);
    expect(premadeAIN.groups[0]!.items.length).toBe(2);
    expect(premadeAIN.groups[0]!.items[0]!.type).toBe("block");
    expect(premadeAIN.groups[0]!.items[0]!.title).toBe("Long Form AI Instructions (DS 4 Pro/DS 4 Flash)");
    expect(premadeAIN.groups[0]!.items[0]!.content).toContain("The user would like");
    expect(premadeAIN.groups[0]!.items[0]!.content).toContain("- No repetition");
    
    expect(premadeAIN.groups[0]!.items[1]!.title).toBe("Zoocata AIN");
    expect(premadeAIN.groups[0]!.items[1]!.content).toContain("ROLE: Collaborative");

    // Verify AN/PE items
    const anpe = parsed[1]!;
    expect(anpe.groups.length).toBe(1);
    const items = anpe.groups[0]!.items;
    expect(items.length).toBe(4); // Basic Author's Note, Bullet, Plot Essentials, Current Date
    expect(items[0]!.type).toBe("block");
    expect(items[0]!.title).toBe("Basic Author’s Note:");
    expect(items[0]!.content).toBe("Setting: Space\nTheme: Dark");

    expect(items[1]!.type).toBe("bullet");
    expect(items[1]!.content).toBe("This is a roleplaying scenario.");

    expect(items[2]!.type).toBe("block");
    expect(items[2]!.title).toBe("Plot Essentials:");
    expect(items[2]!.content).toBe("{Your Name: smoke}");

    expect(items[3]!.type).toBe("block");
    expect(items[3]!.title).toBe("[Current Date (MM/DD): 6/1]");

    // Verify Pacing groups
    const pacing = parsed[2]!;
    expect(pacing.groups.length).toBe(2);
    expect(pacing.groups[0]!.name).toBe("Slow Down:");
    expect(pacing.groups[0]!.items[0]!.content).toBe("Let scenes play out moment by moment");
    expect(pacing.groups[1]!.name).toBe("Speed Up:");
    expect(pacing.groups[1]!.items[0]!.content).toBe("Speech should flow naturally");
  });
});
