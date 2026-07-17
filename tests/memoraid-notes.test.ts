import { describe, it, expect } from "vitest";
import { parseMemoNotes, buildMemoNotes, pushThought, thoughtsSince, buildThoughtContext, renderThoughtWindow, parseImportantCharacters, serializeImportantCharacters, isOnOffstageCooldown, classifyMemoraidPresence, buildEarsBurningThought, isLeakedPrompt, isWrappedThoughtEntry, repairThoughtEntry, isSceneNovel } from "../src/inference/memoraid-notes";

describe("isSceneNovel (scene-novelty gate)", () => {
  const scene = "Veya crossed the courtyard, rain slicking the obsidian pavement, and stopped at the gate.";
  it("an identical scene is NOT novel", () => {
    expect(isSceneNovel(scene, scene)).toBe(false);
  });
  it("a near-duplicate (tiny wording drift) is NOT novel", () => {
    const drifted = scene.replace("stopped at the gate", "stopped by the gate");
    expect(isSceneNovel(scene, drifted)).toBe(false);
  });
  it("a genuinely different scene IS novel", () => {
    expect(isSceneNovel(scene, "Smoke slammed the ledger shut and demanded answers from the quartermaster.")).toBe(true);
  });
  it("an empty previous snapshot is always novel", () => {
    expect(isSceneNovel(undefined, scene)).toBe(true);
    expect(isSceneNovel("", scene)).toBe(true);
  });
});

describe("MemorAID entry self-heal", () => {
  it("isWrappedThoughtEntry detects the thought-log wrapper", () => {
    expect(isWrappedThoughtEntry("[Veya's Thoughts (newest to oldest):\n{- Intake: x}\n]")).toBe(true);
    expect(isWrappedThoughtEntry("[Veya's Thoughts:\n- Intake: x\n]")).toBe(true);
    expect(isWrappedThoughtEntry("[- Intake: x\n- Thought: y\n- Action: z]")).toBe(false);
    expect(isWrappedThoughtEntry("")).toBe(false);
  });

  it("repairThoughtEntry re-wraps a raw entry, rescuing its thought into the log", () => {
    const raw = "[- Intake: I feel his arm\n- Thought: a divine victory\n- Action: I grin]";
    const desc = "[THOUGHT LOG]\n(turn 193)\n[Veya's Thoughts:\n- Intake: older\n- Action: older]";
    const out = repairThoughtEntry("Veya", raw, desc, 0, 200);
    expect(out.changed).toBe(true);
    expect(isWrappedThoughtEntry(out.value)).toBe(true);
    expect(out.value).toContain("I feel his arm");
    expect(out.description).toContain("(turn 200)"); // rescued thought logged so it is not lost
  });

  it("repairThoughtEntry is a no-op when the entry is already wrapped", () => {
    const wrapped = "[Veya's Thoughts (newest to oldest):\n{- Intake: x}\n]";
    const out = repairThoughtEntry("Veya", wrapped, "", 0, 200);
    expect(out.changed).toBe(false);
    expect(out.value).toBe(wrapped);
  });
});

describe("MemorAID presence gate helpers", () => {
  it("isOnOffstageCooldown: true only while currentTurn < cooldownUntil", () => {
    expect(isOnOffstageCooldown(undefined, 10)).toBe(false);
    expect(isOnOffstageCooldown(12, 10)).toBe(true);
    expect(isOnOffstageCooldown(10, 10)).toBe(false);
    expect(isOnOffstageCooldown(10, 11)).toBe(false);
  });

  it("classifyMemoraidPresence: only the bare OFFSTAGE sentinel / empty -> offstage; any other content -> present", () => {
    expect(classifyMemoraidPresence("OFFSTAGE")).toBe("offstage");
    expect(classifyMemoraidPresence("[OFFSTAGE]")).toBe("offstage");
    expect(classifyMemoraidPresence("OFFSTAGE.")).toBe("offstage");
    expect(classifyMemoraidPresence("   ")).toBe("offstage");
    expect(classifyMemoraidPresence("[- Intake: x\n- Thought: y\n- Action: z]")).toBe("present");
    expect(classifyMemoraidPresence("- Intake: only one label")).toBe("present");
    expect(classifyMemoraidPresence("She turns away.")).toBe("present"); // non-sentinel prose is not suppressed
  });

  it("buildEarsBurningThought: fixed two-bullet Intake/Thought block", () => {
    expect(buildEarsBurningThought()).toBe(
      "- Intake: My ears are suddenly burning — the old sign that someone, somewhere, is talking about me.\n" +
      "- Thought: I wonder who, and what they're saying. Nothing to do about it from here but keep going."
    );
  });

  it("isLeakedPrompt: detects leaked instruction prompts", () => {
    expect(isLeakedPrompt("You are Rael (Memory). This is your story, and you live it as its own main character")).toBe(true);
    expect(isLeakedPrompt("respond with exactly OFFSTAGE and nothing else")).toBe(true);
    expect(isLeakedPrompt("Follow a strict cognitive loop of intake, thought, and action")).toBe(true);
    expect(isLeakedPrompt("Intake: [1 sentence describing the direct sensory, physical, or verbal stimulus they are perceiving]")).toBe(true);
    // Current two-bullet lens/monologue prompt phrases must be caught too.
    expect(isLeakedPrompt("the same events, filtered through their mood, not a neutral camera")).toBe(true);
    expect(isLeakedPrompt("1-2 sentences of her unfiltered internal monologue reacting to that")).toBe(true);
    expect(isLeakedPrompt("Do NOT deliver a polished thesis or a neat conclusion")).toBe(true);
    // Resist-resolution refinement phrases must be caught too.
    expect(isLeakedPrompt("State the observation flatly; this is not a mood piece.")).toBe(true);
    expect(isLeakedPrompt("EXACTLY 1 sentence of unresolved internal reaction — a reflex, a gripe")).toBe(true);
    expect(isLeakedPrompt("forbid the insight-turn that lands on a tidy realization")).toBe(true);
    expect(isLeakedPrompt("She turns and smiles.")).toBe(false);
  });
});

describe("MemorAID important-characters config (Configure MemorAID description)", () => {
  it("parses the IMPORTANT_CHARACTERS list, preserving case and dropping empties", () => {
    expect(parseImportantCharacters("IMPORTANT_CHARACTERS: Anna, Bob,  , Chloe")).toEqual(["Anna", "Bob", "Chloe"]);
    expect(parseImportantCharacters("IMPORTANT_CHARACTERS:\nAnna\nBob\nChloe")).toEqual(["Anna", "Bob", "Chloe"]);
  });

  it("parses with surrounding text and stops at the next FIELD: label", () => {
    const desc = "SYSTEM TOOL: do not edit.\nIMPORTANT_CHARACTERS: Anna, Bob\nOTHER_FIELD: ignored";
    expect(parseImportantCharacters(desc)).toEqual(["Anna", "Bob"]);
  });

  it("returns [] when there is no IMPORTANT_CHARACTERS block", () => {
    expect(parseImportantCharacters("")).toEqual([]);
    expect(parseImportantCharacters("nothing here")).toEqual([]);
  });

  it("serializes a name list into an IMPORTANT_CHARACTERS block", () => {
    expect(serializeImportantCharacters(["Anna", "Bob", "Chloe"])).toBe("IMPORTANT_CHARACTERS: Anna, Bob, Chloe");
    expect(serializeImportantCharacters([" Anna ", "", "Bob"])).toBe("IMPORTANT_CHARACTERS: Anna, Bob");
  });

  it("round-trips parse <-> serialize", () => {
    const names = ["Anna", "Bob Smith", "Chloe"];
    expect(parseImportantCharacters(serializeImportantCharacters(names))).toEqual(names);
  });
});

describe("memoraid notes round-trip", () => {
  it("builds and parses turn-tagged thought log with trigger actions", () => {
    const notes = {
      thoughtLog: [
        { turn: 222, action: "> You lean around her.", text: "[Ana's Thoughts:\n- He ignored me.]" },
        { turn: 218, action: "She sat on your lap.", text: "[Ana's Thoughts:\n- Who is he?]" },
      ],
    };
    const built = buildMemoNotes(notes);
    expect(built).toContain("[THOUGHT LOG]");
    expect(built).toContain("(turn 222) Trigger: > You lean around her.");
    const parsed = parseMemoNotes(built);
    expect(parsed.thoughtLog).toEqual(notes.thoughtLog);
  });

  it("parses an entry with no Trigger line (migrated/legacy)", () => {
    const parsed = parseMemoNotes("[THOUGHT LOG]\n(turn 10)\n[old thought]");
    expect(parsed.thoughtLog).toEqual([{ turn: 10, text: "[old thought]" }]);
  });

  it("parseMemoNotes tolerates empty/undefined", () => {
    expect(parseMemoNotes(undefined)).toEqual({ thoughtLog: [] });
    expect(parseMemoNotes("")).toEqual({ thoughtLog: [] });
  });

  it("parseMemoNotes filters out leaked prompts", () => {
    const rawNotes = "[THOUGHT LOG]\n(turn 12) Trigger: some action\n[Rael's Thoughts:\n- actual valid thought]\n\n(turn 11) Trigger: another action\n{You are Rael (Memory). This is your story, and you live it as its own main character — never a minor figure...}";
    const parsed = parseMemoNotes(rawNotes);
    expect(parsed.thoughtLog).toEqual([{ turn: 12, action: "some action", text: "[Rael's Thoughts:\n- actual valid thought]" }]);
  });
});

describe("pushThought", () => {
  it("prepends newest-first, dedupes identical text, caps length", () => {
    let log: { turn: number; action?: string; text: string }[] = [];
    log = pushThought(log, { turn: 1, text: "a" });
    log = pushThought(log, { turn: 2, text: "b" });
    log = pushThought(log, { turn: 3, text: "a" }); // dup text -> moves to front, drops old
    expect(log.map((e) => e.text)).toEqual(["a", "b"]);
    expect(log[0]!.turn).toBe(3);
    log = pushThought(log, { turn: 4, text: "   " }); // empty -> no-op
    expect(log).toHaveLength(2);
    const seed = Array.from({ length: 15 }, (_, i) => ({ turn: i, text: `t${i}` }));
    const capped = pushThought(seed, { turn: 99, text: "new" }, 15);
    expect(capped).toHaveLength(15);
    expect(capped[0]!.text).toBe("new");

    const seedDefault = Array.from({ length: 20 }, (_, i) => ({ turn: i, text: `t${i}` }));
    const cappedDefault = pushThought(seedDefault, { turn: 99, text: "new" });
    expect(cappedDefault).toHaveLength(15);
    expect(cappedDefault[0]!.text).toBe("new");
  });
});

describe("thoughtsSince", () => {
  const log = [
    { turn: 222, action: "act-c", text: "newest" },
    { turn: 218, action: "act-b", text: "middle" },
    { turn: 210, action: "act-a", text: "old" },
  ];
  it("returns newest-first action+thought pairs formed after sinceTurn", () => {
    expect(thoughtsSince(log, 215, 1000)).toBe("act-c\nnewest\n\nact-b\nmiddle");
    expect(thoughtsSince(log, 222, 1000)).toBe(""); // nothing newer than 222
  });
  it("respects the char budget", () => {
    // 'act-c\nnewest' = 12 chars, +2 = 14; the next pair would exceed.
    expect(thoughtsSince(log, 0, 15)).toBe("act-c\nnewest");
  });
});

describe("buildThoughtContext / renderThoughtWindow", () => {
  const log = [
    { turn: 30, text: "[Ana's Thoughts:\n- newest]" },
    { turn: 20, text: "[Ana's Thoughts:\n- middle]" },
    { turn: 10, text: "[Ana's Thoughts:\n- oldest]" },
  ];

  it("renderThoughtWindow: last N, newest-first, braced blocks, ordered header", () => {
    expect(renderThoughtWindow(log, 2, "Ana", 3000)).toBe("[Ana's Thoughts (newest to oldest):\n{- newest}\n\n{- middle}\n]");
  });

  it("buildThoughtContext: last N, oldest→newest, braced blocks", () => {
    expect(buildThoughtContext(log, 2, "Ana", 3000)).toBe(
      "[Ana's recent thoughts (oldest to newest):\n{- middle}\n\n{- newest}\n]"
    );
  });

  it("returns '' for n<=0 or empty log", () => {
    expect(renderThoughtWindow(log, 0, "Ana", 3000)).toBe("");
    expect(buildThoughtContext(log, 0, "Ana", 3000)).toBe("");
    expect(buildThoughtContext(log, -1, "Ana", 3000)).toBe("");
    expect(renderThoughtWindow([], 3, "Ana", 3000)).toBe("");
  });

  it("N greater than available returns all available", () => {
    expect(renderThoughtWindow(log, 10, "Ana", 3000)).toBe(
      "[Ana's Thoughts (newest to oldest):\n{- newest}\n\n{- middle}\n\n{- oldest}\n]"
    );
  });

  it("drops oldest complete thoughts to fit maxChars; never splits a thought", () => {
    // header "[Ana's Thoughts (newest to oldest):" = 35 chars; +"\n{- newest}\n]" = 48; two blocks = 60.
    expect(renderThoughtWindow(log, 3, "Ana", 55)).toBe("[Ana's Thoughts (newest to oldest):\n{- newest}\n]");
    expect(renderThoughtWindow(log, 3, "Ana", 40)).toBe(""); // not even one block fits
  });

  it("strips per-thought wrappers; no turn/Trigger text leaks", () => {
    const out = renderThoughtWindow([{ turn: 5, action: "> do x", text: "[Bob's Thoughts:\n- hi]" }], 1, "Bob", 3000);
    expect(out).toBe("[Bob's Thoughts (newest to oldest):\n{- hi}\n]");
    expect(out).not.toContain("turn");
    expect(out).not.toContain("Trigger");
  });
});
