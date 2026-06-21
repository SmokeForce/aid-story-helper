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

const { detectProperNouns, updatePlotEssentialsLocation, parseLocationFromMemory, deStutter } = await import("../src/background/background");

describe("deStutter", () => {
  it("strips same-letter stutter prefixes, including repeated ones", () => {
    expect(deStutter("m-Management Office")).toBe("Management Office");
    expect(deStutter("H-here y-you go")).toBe("here you go"); // keeps the word's own casing
    expect(deStutter("w-w-w-well")).toBe("well");
    expect(deStutter("d-drop it o-off")).toBe("drop it off");
  });
  it("preserves real hyphenated terms (different first letters)", () => {
    expect(deStutter("X-Men")).toBe("X-Men");
    expect(deStutter("T-Rex")).toBe("T-Rex");
    expect(deStutter("e-mail")).toBe("e-mail");
    expect(deStutter("Kool-Aid")).toBe("Kool-Aid");
  });
});

describe("detectProperNouns + stutter", () => {
  it("detects the FULL proper noun through a stutter prefix (Management Office, not just Office)", () => {
    const text = '"H-here y-you go... I w-was g-going to d-drop it o-off at the m-Management Office..."';
    const res = detectProperNouns(text, []);
    expect(res).toContain("Management Office");
    expect(res).not.toContain("Office");
  });
});

describe("detectProperNouns + designations", () => {
  it("keeps a trailing designator token attached (Building J, not just Building)", () => {
    const res = detectProperNouns('You nod and say, "i-I s-suppose that\'s all of b-b-Building J?"', []);
    expect(res).toContain("Building J");
    expect(res).not.toContain("Building");
  });

  it("handles letter and alphanumeric designators (Unit B, Apartment 4C)", () => {
    const res = detectProperNouns("She is in Unit B and he is in Apartment 4C.", []);
    expect(res).toContain("Unit B");
    expect(res).toContain("Apartment 4C");
  });

  it("does NOT treat a following name as a designator (Building Justin)", () => {
    const res = detectProperNouns("Building Justin came by.", []);
    expect(res).not.toContain("Building J");
    expect(res).not.toContain("Building Justin");
  });

  it("leaves a bare noun alone when no designator follows", () => {
    const res = detectProperNouns("They met at the Obsidian Keep.", []);
    expect(res).toContain("Obsidian Keep");
  });
});

describe("detectProperNouns", () => {
  it("should extract single and multi-word proper nouns", () => {
    const text = "You walk through the gates of Eldoria and enter the Obsidian Keep in the middle of Silverwood Forest.";
    const result = detectProperNouns(text, []);
    expect(result).toContain("Eldoria");
    expect(result).toContain("Obsidian Keep");
    expect(result).toContain("Silverwood Forest");
  });

  it("should ignore capitalized words starting after quotes or periods and conversational fillers", () => {
    const text = '"Forcing it," she whispers. "The sheer violence of the extraction." Yes, she said it. No, she didn\'t.';
    const result = detectProperNouns(text, []);
    expect(result).not.toContain("Forcing");
    expect(result).not.toContain("The");
    expect(result).not.toContain("Yes");
    expect(result).not.toContain("No");

    // Additional tests for quotes inside sentences and after ellipsis/punctuation pauses
    const text2 = 'She said, "Wait for me." She then sighed. "Mochas?" she repeated. "No... damn you... Wait!"';
    const result2 = detectProperNouns(text2, []);
    expect(result2).not.toContain("Wait");
    expect(result2).not.toContain("Mochas");
    expect(result2).not.toContain("No");
  });

  it("should ignore common pronouns and sentence-starting noise", () => {
    const text = "He walked away. Suddenly, she saw the Obsidian Keep. Then they entered. Meanwhile, it was raining.";
    const result = detectProperNouns(text, []);
    expect(result).toContain("Obsidian Keep");
    expect(result).not.toContain("He");
    expect(result).not.toContain("Suddenly");
    expect(result).not.toContain("Then");
    expect(result).not.toContain("Meanwhile");
    expect(result).not.toContain("It");
  });

  it("should ignore known names passed as parameters", () => {
    const text = "Smoke Brytefayme and Jessica went to the Obsidian Keep.";
    const result = detectProperNouns(text, ["Smoke Brytefayme", "Jessica"]);
    expect(result).toContain("Obsidian Keep");
    expect(result).not.toContain("Smoke Brytefayme");
    expect(result).not.toContain("Jessica");
  });

  it("should extract proper nouns containing prepositions", () => {
    const text = "The group traveled to the Forest of Doom in the Land of the Giants.";
    const result = detectProperNouns(text, []);
    expect(result).toContain("Forest of Doom");
    expect(result).toContain("Land of the Giants");
  });

  it("should handle pronoun 'I' suffixes, hyphens, compound names, and ignore sub-names of known names", () => {
    const text1 = "That's Bigfoot country, and by Bigfoot I man yahoos.";
    const result1 = detectProperNouns(text1, []);
    expect(result1).toContain("Bigfoot");
    expect(result1).not.toContain("Bigfoot I");

    const text2 = "Everything I own is tied to the community.";
    const result2 = detectProperNouns(text2, []);
    expect(result2).not.toContain("Everything");
    expect(result2).not.toContain("Everything I");

    const text3 = "Or, you'll drink the Kool-Aid and die.";
    const result3 = detectProperNouns(text3, []);
    expect(result3).toContain("Kool-Aid");
    expect(result3).not.toContain("Kool");
    expect(result3).not.toContain("Aid");

    const text4 = "Yesterday, Nathaniel and Jenny are talking.";
    const result4 = detectProperNouns(text4, []);
    expect(result4).toContain("Nathaniel");
    expect(result4).toContain("Jenny");
    expect(result4).not.toContain("Nathaniel and Jenny");

    const text5 = "Blake is here.";
    const result5 = detectProperNouns(text5, ["Nathaniel Blake"]);
    expect(result5).not.toContain("Blake");

    const text6 = "We went to the Sanctuary.";
    const result6 = detectProperNouns(text6, ["The Sanctuary of the Solar Path"]);
    expect(result6).not.toContain("Sanctuary");
  });

  it("should recognize custom lexicon names passed via lexiconNames", () => {
    const text = "You meet the mysterious eldrin traveler near the gate.";
    const result1 = detectProperNouns(text, [], []);
    expect(result1).not.toContain("eldrin");

    const result2 = detectProperNouns(text, [], ["eldrin"]);
    expect(result2).toContain("eldrin");
  });

  it("should extract proper nouns inside dialogue like Steve", () => {
    const text = 'You say, "Huh, I wonder if Steve is around today."';
    const result = detectProperNouns(text, []);
    expect(result).toContain("Steve");
  });
});

describe("updatePlotEssentialsLocation", () => {
  it("should append the location block when none exists", () => {
    const memory = "[- Your name: Smoke]\n[Jessica is here.]";
    const result = updatePlotEssentialsLocation(memory, "Obsidian Keep");
    expect(result).toContain("[Current Location: Obsidian Keep]");
    expect(result).toContain("[- Your name: Smoke]");
  });

  it("should replace the location block when it already exists", () => {
    const memory = "[- Your name: Smoke]\n[Current Location: Silverwood]\n[Jessica is here.]";
    const result = updatePlotEssentialsLocation(memory, "Obsidian Keep");
    expect(result).toContain("[Current Location: Obsidian Keep]");
    expect(result).not.toContain("Silverwood");
  });

  it("should remove the location block when location is null", () => {
    const memory = "[- Your name: Smoke]\n[Current Location: Silverwood]\n[Jessica is here.]";
    const result = updatePlotEssentialsLocation(memory, null);
    expect(result).not.toContain("Current Location");
    expect(result).not.toContain("Silverwood");
    expect(result).toContain("[- Your name: Smoke]");
  });

  it("should handle empty or undefined memory block", () => {
    expect(updatePlotEssentialsLocation(undefined, "Obsidian Keep")).toBe("[Current Location: Obsidian Keep]");
    expect(updatePlotEssentialsLocation("", "Obsidian Keep")).toBe("[Current Location: Obsidian Keep]");
  });
});

describe("parseLocationFromMemory", () => {
  it("should extract location from memory with brackets", () => {
    const memory = "[- Your name: Smoke]\n[Current Location: Obsidian Keep]\n[Jessica is here.]";
    expect(parseLocationFromMemory(memory)).toBe("Obsidian Keep");
  });

  it("should extract location from memory with curly braces", () => {
    const memory = "{- Your name: Smoke}\n{Active Location: The Royal Suite}\n{Jessica is here.}";
    expect(parseLocationFromMemory(memory)).toBe("The Royal Suite");
  });

  it("should return null if no location is present", () => {
    const memory = "[- Your name: Smoke]\n[Jessica is here.]";
    expect(parseLocationFromMemory(memory)).toBeNull();
    expect(parseLocationFromMemory(undefined)).toBeNull();
    expect(parseLocationFromMemory("")).toBeNull();
  });
});

describe("runProperNounAutoDetection", () => {
  it("should ignore proper nouns that have been registered or declined in properNounLogs", async () => {
    const { IDBFactory } = await import("fake-indexeddb");
    (globalThis as any).indexedDB = new IDBFactory();
    const { __resetDbForTests } = await import("../src/storage/db");
    __resetDbForTests();
    const { Repo } = await import("../src/storage/repo");
    const testRepo = new Repo();

    await testRepo.setSettings({
      provider: "openai",
      enableProperNounDetection: true,
      locationMode: "optionA",
      analyzeWindow: 20,
    } as any);

    const shortId = "test-adv";
    await testRepo.upsertAdventure({
      shortId,
      title: "Test",
      properNounLogs: [
        {
          actionId: "1",
          properNoun: "IgnoredNoun",
          actionText: "This is IgnoredNoun.",
          timestamp: new Date().toISOString(),
          isLocation: false,
          isCharacter: false,
        },
      ],
      locationSuggestions: [],
    });

    const { runProperNounAutoDetection } = await import("../src/background/background");
    
    await runProperNounAutoDetection(shortId, [
      { id: "10", text: "You walked towards IgnoredNoun and found a NewLocation.", type: "do" },
    ]);

    const adv = await testRepo.getAdventure(shortId);
    const suggestions = adv?.locationSuggestions || [];
    const properNouns = suggestions.map((s) => s.properNoun);

    expect(properNouns).toContain("NewLocation");
    expect(properNouns).not.toContain("IgnoredNoun");
  });

  it("should perform alias matching to deduplicate suggestions (e.g. Brother Nathaniel vs Nathaniel Blake)", async () => {
    const { IDBFactory } = await import("fake-indexeddb");
    (globalThis as any).indexedDB = new IDBFactory();
    const { __resetDbForTests } = await import("../src/storage/db");
    __resetDbForTests();
    const { Repo } = await import("../src/storage/repo");
    const testRepo = new Repo();

    await testRepo.setSettings({
      provider: "openai",
      enableProperNounDetection: true,
      locationMode: "optionA",
      analyzeWindow: 20,
    } as any);

    const shortId = "test-adv-alias";
    await testRepo.upsertAdventure({
      shortId,
      title: "Test",
      properNounLogs: [
        {
          actionId: "1",
          properNoun: "Nathaniel Blake",
          actionText: "He is Nathaniel Blake.",
          timestamp: new Date().toISOString(),
          isLocation: false,
          isCharacter: true,
        },
      ],
      locationSuggestions: [],
    });

    const { runProperNounAutoDetection } = await import("../src/background/background");
    
    // We scan actions with candidates "Blake" and "Brother Nathaniel", which are alias variants of "Nathaniel Blake"
    // Also "John Smith" (a new entity) and "John Doe" (another new entity)
    await runProperNounAutoDetection(shortId, [
      { id: "10", text: "Blake spoke to Brother Nathaniel. John Smith met John Doe.", type: "say" },
    ]);

    const adv = await testRepo.getAdventure(shortId);
    const suggestions = adv?.locationSuggestions || [];
    const properNouns = suggestions.map((s) => s.properNoun);

    // "Blake" and "Brother Nathaniel" should be deduplicated and not added
    expect(properNouns).not.toContain("Blake");
    expect(properNouns).not.toContain("Brother Nathaniel");
    // "John Smith" and "John Doe" are different and should be suggested
    expect(properNouns).toContain("John Smith");
    expect(properNouns).toContain("John Doe");
  });

  it("runs by default when enableProperNounDetection is unset (opt-out), and only an explicit false disables it", async () => {
    const { IDBFactory } = await import("fake-indexeddb");
    const { __resetDbForTests } = await import("../src/storage/db");
    const { Repo } = await import("../src/storage/repo");
    const { runProperNounAutoDetection } = await import("../src/background/background");

    // (a) unset → detection RUNS
    (globalThis as any).indexedDB = new IDBFactory();
    __resetDbForTests();
    let repo = new Repo();
    await repo.setSettings({ provider: "openai", analyzeWindow: 20 } as any); // no enableProperNounDetection
    await repo.upsertAdventure({ shortId: "adv-unset", title: "T", properNounLogs: [], locationSuggestions: [] });
    await runProperNounAutoDetection("adv-unset", [{ id: "1", text: "They entered the Obsidian Keep.", type: "do" }]);
    let adv = await repo.getAdventure("adv-unset");
    expect((adv?.locationSuggestions || []).map((s) => s.properNoun)).toContain("Obsidian Keep");

    // (b) explicit false → detection is SKIPPED
    (globalThis as any).indexedDB = new IDBFactory();
    __resetDbForTests();
    repo = new Repo();
    await repo.setSettings({ provider: "openai", analyzeWindow: 20, enableProperNounDetection: false } as any);
    await repo.upsertAdventure({ shortId: "adv-off", title: "T", properNounLogs: [], locationSuggestions: [] });
    await runProperNounAutoDetection("adv-off", [{ id: "1", text: "They entered the Obsidian Keep.", type: "do" }]);
    adv = await repo.getAdventure("adv-off");
    expect((adv?.locationSuggestions || []).length).toBe(0);
  });

  it("migrates a persisted legacy enableLocationDetection flag to enableProperNounDetection (preserving an explicit opt-out)", async () => {
    const { IDBFactory } = await import("fake-indexeddb");
    const { __resetDbForTests } = await import("../src/storage/db");
    const { Repo } = await import("../src/storage/repo");
    const { runProperNounAutoDetection } = await import("../src/background/background");

    (globalThis as any).indexedDB = new IDBFactory();
    __resetDbForTests();
    const repo = new Repo();
    // Persist ONLY the legacy key (as a pre-rename install would have).
    await repo.setSettings({ provider: "openai", analyzeWindow: 20, enableLocationDetection: false } as any);

    // getSettings migrates: new key adopts the old value, stale key is dropped.
    const migrated = await repo.getSettings();
    expect(migrated?.enableProperNounDetection).toBe(false);
    expect((migrated as any)?.enableLocationDetection).toBeUndefined();

    // And the disabled preference is honored end-to-end (detection stays off).
    await repo.upsertAdventure({ shortId: "adv-mig", title: "T", properNounLogs: [], locationSuggestions: [] });
    await runProperNounAutoDetection("adv-mig", [{ id: "1", text: "They entered the Obsidian Keep.", type: "do" }]);
    const adv = await repo.getAdventure("adv-mig");
    expect((adv?.locationSuggestions || []).length).toBe(0);
  });

  it("does NOT let a generic single-word card key swallow a more-specific noun (Building J vs a 'building' key)", async () => {
    const { IDBFactory } = await import("fake-indexeddb");
    (globalThis as any).indexedDB = new IDBFactory();
    const { __resetDbForTests } = await import("../src/storage/db");
    __resetDbForTests();
    const { Repo } = await import("../src/storage/repo");
    const testRepo = new Repo();

    await testRepo.setSettings({
      provider: "openai",
      enableProperNounDetection: true,
      locationMode: "optionA",
      analyzeWindow: 20,
    } as any);

    const shortId = "test-adv-bldg";
    // A location card whose trigger keys include the generic word "building".
    await testRepo.putCards(shortId, [
      { shortId, id: "c-apt", type: "location", title: "Slimey's Apartment Building", keys: "apartment, building", value: "An apartment building." },
    ]);
    await testRepo.upsertAdventure({ shortId, title: "Test", properNounLogs: [], locationSuggestions: [] });

    const { runProperNounAutoDetection } = await import("../src/background/background");
    await runProperNounAutoDetection(shortId, [
      { id: "10", text: 'You nod and say, "i-I s-suppose that\'s all of b-b-Building J?"', type: "do" },
    ]);

    const adv = await testRepo.getAdventure(shortId);
    const properNouns = (adv?.locationSuggestions || []).map((s) => s.properNoun);
    expect(properNouns).toContain("Building J");
  });

  it("should query all cards in the campaign using repo.getAllCards", async () => {
    const { IDBFactory } = await import("fake-indexeddb");
    (globalThis as any).indexedDB = new IDBFactory();
    const { __resetDbForTests } = await import("../src/storage/db");
    __resetDbForTests();
    const { Repo } = await import("../src/storage/repo");
    const testRepo = new Repo();

    const getAllCardsSpy = vi.spyOn(Repo.prototype, "getAllCards");

    await testRepo.setSettings({
      provider: "openai",
      enableProperNounDetection: true,
      locationMode: "optionA",
      analyzeWindow: 20,
    } as any);

    const shortId = "test-adv-lexicon-spy";
    await testRepo.upsertAdventure({
      shortId,
      title: "Test campaign",
      properNounLogs: [],
      locationSuggestions: [],
    });

    const { runProperNounAutoDetection } = await import("../src/background/background");
    await runProperNounAutoDetection(shortId, [
      { id: "10", text: "Some random text.", type: "do" },
    ]);

    expect(getAllCardsSpy).toHaveBeenCalledWith(shortId);
    getAllCardsSpy.mockRestore();
  });

  it("should detect 'Steve' in dialogue when running runProperNounAutoDetection", async () => {
    const { IDBFactory } = await import("fake-indexeddb");
    (globalThis as any).indexedDB = new IDBFactory();
    const { __resetDbForTests } = await import("../src/storage/db");
    __resetDbForTests();
    const { Repo } = await import("../src/storage/repo");
    const testRepo = new Repo();

    await testRepo.setSettings({
      provider: "openai",
      enableProperNounDetection: true,
      locationMode: "optionA",
      analyzeWindow: 20,
    } as any);

    const shortId = "test-adv-steve";
    await testRepo.upsertAdventure({
      shortId,
      title: "Test Steve",
      properNounLogs: [],
      locationSuggestions: [],
    });

    const { runProperNounAutoDetection } = await import("../src/background/background");

    await runProperNounAutoDetection(shortId, [
      { id: "10", text: 'You say, "Huh, I wonder if Steve is around today."', type: "say" },
    ]);

    const adv = await testRepo.getAdventure(shortId);
    const suggestions = adv?.locationSuggestions || [];
    const properNouns = suggestions.map((s) => s.properNoun);

    expect(properNouns).toContain("Steve");
  });

  it("should fall back to scanning the last 5 actions from the database when newActions is not provided", async () => {
    const { IDBFactory } = await import("fake-indexeddb");
    (globalThis as any).indexedDB = new IDBFactory();
    const { __resetDbForTests } = await import("../src/storage/db");
    __resetDbForTests();
    const { Repo } = await import("../src/storage/repo");
    const testRepo = new Repo();

    await testRepo.setSettings({
      provider: "openai",
      enableProperNounDetection: true,
      locationMode: "optionA",
      analyzeWindow: 20,
    } as any);

    const shortId = "test-adv-steve-fallback";
    await testRepo.upsertAdventure({
      shortId,
      title: "Test Steve Fallback",
      properNounLogs: [],
      locationSuggestions: [],
    });

    await testRepo.putActions(shortId, [
      { id: "1", text: "Action 1", type: "story", createdAt: "2026-06-13T10:00:00Z" },
      { id: "2", text: "Action 2", type: "story", createdAt: "2026-06-13T10:01:00Z" },
      { id: "3", text: "Action 3", type: "story", createdAt: "2026-06-13T10:02:00Z" },
      { id: "4", text: "Action 4", type: "story", createdAt: "2026-06-13T10:03:00Z" },
      { id: "5", text: 'You say, "Huh, I wonder if Steve is around today."', type: "say", createdAt: "2026-06-13T10:04:00Z" },
    ]);

    const { runProperNounAutoDetection } = await import("../src/background/background");

    await runProperNounAutoDetection(shortId);

    const adv = await testRepo.getAdventure(shortId);
    const suggestions = adv?.locationSuggestions || [];
    const properNouns = suggestions.map((s) => s.properNoun);

    expect(properNouns).toContain("Steve");
  });
});

