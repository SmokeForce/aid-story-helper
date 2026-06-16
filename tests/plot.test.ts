import { describe, it, expect } from "vitest";
import { parsePlotEssentials, replaceBlock } from "../src/inference/plot";

const memory = `[- Your name: Smoke Brytefayme
- Your gender: Male
- Personality: philosophical, direct]

- You go to Westridge High School.

[Jessica Sterling is the school's queen bee.
Appearance: blonde, blue-eyed.
Personality: master manipulator, in transition.]

[Jessica´s Inner Circle:
1. Chloe – strategist.
2. Marcus – frontman.]

[- Plot secret:
She is obsessed with you.]`;

describe("parsePlotEssentials", () => {
  it("extracts named character blocks, marks the player, skips lore/group blocks", () => {
    const blocks = parsePlotEssentials(memory);
    const names = blocks.map((b) => b.name);
    expect(names).toContain("Smoke Brytefayme");
    expect(names).toContain("Jessica Sterling");
    expect(names).not.toContain("Jessica´s Inner Circle"); // group list skipped
    expect(blocks.find((b) => b.name === "Smoke Brytefayme")!.isPlayer).toBe(true);
    expect(blocks.find((b) => b.name === "Jessica Sterling")!.isPlayer).toBe(false);
    expect(blocks.find((b) => b.name === "Jessica Sterling")!.text).toContain("Appearance:");
  });
  it("extracts player name when using Player name: prefix", () => {
    const playerMemory = `[Player name: Slimey Brytefayme
- Height: 5'5"
- Weight: 200lbs]`;
    const blocks = parsePlotEssentials(playerMemory);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.name).toBe("Slimey Brytefayme");
    expect(blocks[0]!.isPlayer).toBe(true);
  });
  it("extracts character blocks wrapped in braces {}", () => {
    const braceMemory = `{- Your name: Smoke Brytefayme}
{Jessica Sterling is the school's queen bee.}`;
    const blocks = parsePlotEssentials(braceMemory);
    const names = blocks.map((b) => b.name);
    expect(names).toContain("Smoke Brytefayme");
    expect(names).toContain("Jessica Sterling");
    expect(blocks.find((b) => b.name === "Smoke Brytefayme")!.isPlayer).toBe(true);
    expect(blocks.find((b) => b.name === "Jessica Sterling")!.isPlayer).toBe(false);
  });
  it("returns [] for empty/undefined", () => {
    expect(parsePlotEssentials(undefined)).toEqual([]);
    expect(parsePlotEssentials("")).toEqual([]);
  });
});

describe("replaceBlock", () => {
  it("replaces the named block's inner text, leaving others intact", () => {
    const out = replaceBlock(memory, "Jessica Sterling", "Jessica Sterling is reformed.\nPersonality: kind.");
    expect(out).toContain("[Jessica Sterling is reformed.\nPersonality: kind.]");
    expect(out).toContain("[- Your name: Smoke Brytefayme"); // player block untouched
    expect(out).toContain("[- Plot secret:"); // lore untouched
    expect(out).not.toContain("master manipulator");
  });
  it("replaces and preserves the braces wrapper {}", () => {
    const braceMemory = `{- Your name: Smoke Brytefayme}
{Jessica Sterling is the school's queen bee.}`;
    const out = replaceBlock(braceMemory, "Jessica Sterling", "Jessica Sterling is reformed.");
    expect(out).toContain("{Jessica Sterling is reformed.}");
    expect(out).toContain("{- Your name: Smoke Brytefayme}");
  });
  it("returns null when the name is not found", () => {
    expect(replaceBlock(memory, "Nobody", "x")).toBeNull();
  });
  it("handles empty/undefined memory", () => {
    expect(replaceBlock(undefined, "x", "y")).toBeNull();
    expect(replaceBlock("", "x", "y")).toBeNull();
  });
});

describe("live user memory check", () => {
  it("matches and replaces Jessica Sterling and Smoke Brytefayme in the user's exact memory", () => {
    const userMemory = `[- Your name: Smoke Brytefayme
- Your gender: Male
- your appearance: -Height: 7' (seven foot tall)  -Dominant hand: Left  -IQ: 155-165+  - Your scent: An earthy oak with hint of citrus  -Weight: 385 pounds of pure muscle  -Voice/Tone: You have a deep, gravelly bass voice that resonates the air around you.  -Appearance: You have thick slabs of muscle, a ripped 8-pack for abs, piercing blue eyes, brown hair styled in a swept-back high cut fade, well-trimmed stubble that hints at an eventual full beard, and Caucasian.You have a girthy 11" cock.-Tattoos: You have the words "EARN VICTORY" tattooed on your back in Castellar font, centered over your spine. "Earn" is stacked on top of "Victory," and it spans the entire width of your shoulder blades. 
- Clothing style: well-made but understated 
- Your likes and interests: Philosophy, music of all genres, MMA
- You dislike: shallowness, vapid personalities, materialism
- Additional Info about you: 
- Personality: Intelligent, philosophical, kind, aware, direct, musical
-Instruments You Play: Piano, Guitar, Drums, Singing -Strength: You are incomparably strong, and a master of MMA.
- Your car: blacked-out Audi R8
- Your phone: Google Pixel 10 Pro
- College: double-majored in Philosophy and Sports Medicine
- Job: You are the Strike Coach for the UFC, traveling around the world training fighters. Money is not a problem for you.
- Social Media handle: @StrikrCoachUFC, majority followed by women
- Professional UFC Record Before Soft-Ban: 73-0-0, undefeated Heavyweight champion
- Background: You are considered the UFC's heart-throb, both for your appearance and because you treat women like people and they've only ever had positive interactions with you. There's a popular hash tag, GotSmoked, about women that flirt with you via DMs and only get oblivious, friendly responses in return. You know the game, but it's easier this way. There's articles about how endearing it is, which only spurs more DMs. Your travels have made you functionally a polyglot, able to speak conversationally in a dozen or two languages.
- Childhood:  Your needs and wants were ignored, you were punished for even the slightest of missteps, and severely so in most cases. CPS was involved numerous times, the result being a change from corporeal punishment to extreme isolation for months at a time. and you ended up moving out at 15. ]

- You go to Westridge High School.

[Jessica Sterling is the school's queen bee.
Appearance: Breathtakingly beautiful with an athletic and curvy figure, blonde hair, and piercing blue eyes. While she still possesses the ability to dress strategically—shifting between cute, elegant, or sexy to achieve specific goals—she has begun to strip away the "designer armor." She is increasingly prone to wearing oversized, comfortable clothing (like the sweater in the penthouse) when she feels the need for authenticity or safety, signaling a shift from "performance" to "presence."
Personality: Still seen as the school's master manipulator and "Queen Bee," Jessica operated entirely through a curated social network and a silver tongue, viewing every interaction as a calculated game of chess. However, following her encounter with Smoke, her worldview has been dismantled. She is currently in a state of psychological transition, struggling to reconcile her lifelong habit of manipulation with a desperate, raw craving for genuine connection and "friction."]

[Jessica´s Inner Circle:
1. Chloe – Jessica's right-hand strategist. Sharp, observant, fiercely loyal. Handles logistics, rumor tracking, and social reconnaissance.

2. Marcus – The charismatic frontman. Charming, athletic, uses his popularity to publicly champion Jessica and apply soft pressure where needed.

3. Sienna – The aesthetic curator. From a fashion/art background, she helps Jessica curate her shifting image and wields quiet influence over style and presentation.

4. Jasmine – The social media influencer. She runs a popular, polished lifestyle account that subtly aligns with Jessica's narratives.]

[- Plot secret: 
After you saved Jessica from a group of ten men with bad intentions by beating the shit out of them in a narrow alley, she didn't just see you as a hero—she saw you as the one person who acted without calculation, who moved on pure instinct to protect her. In her world of performances, that moment of genuine, selfless action was a revelation. It became the only "real" thing she's ever experienced, and now she's obsessed with possessing it—and you. She spent the next week in a state of hyper-focused reconnaissance. Using her social network (Chloe for logistics, Jasmine for social media tracking, Marcus for casual observation, Sienna for aesthetic analysis), she compiled a comprehensive dossier on you. She knows your schedule, your friends, your family dynamics, your hobbies, your insecurities, and your aspirations. She has studied you like a subject, and she believes she understands you better than you understand yourself.

Her goal is not just to make you her boyfriend; it is to engineer a reality where you choose her freely, believing it to be your own desire. She wants to be the author of your love story, with herself as the inevitable heroine.

Jessica's parents are extremely wealthy and neglective of Jessica, letting her do what ever she wants.

- Mia is a girl who has a crush on player. make her an obstacle for Jessica that she needs to overcome. Jessica will spread lies about Mia and Jessica will try to keep Mia away from player.]`;

    const outJessica = replaceBlock(userMemory, "Jessica Sterling", "Jessica Sterling is testing!");
    expect(outJessica).not.toBe(userMemory);
    expect(outJessica).toContain("[Jessica Sterling is testing!]");

    const outSmoke = replaceBlock(userMemory, "Smoke Brytefayme", "Smoke Brytefayme is testing!");
    expect(outSmoke).not.toBe(userMemory);
    expect(outSmoke).toContain("[Smoke Brytefayme is testing!]");
  });
});

