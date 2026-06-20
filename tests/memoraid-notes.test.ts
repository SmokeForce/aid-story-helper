import { describe, it, expect } from "vitest";
import { parseMemoNotes, buildMemoNotes, pushThought, thoughtsSince, renderThoughtWindow } from "../src/inference/memoraid-notes";

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

describe("renderThoughtWindow", () => {
  it("renders a rolling window of braced thoughts separated by single-newlines", () => {
    const log = [
      { turn: 2, text: "[Anna's Thoughts:\nIntake: She smiles.\nThought: Nice.\nAction: Wait.]" },
      { turn: 1, text: "[Anna's Thoughts:\nIntake: She is outside.\nThought: Fresh air.\nAction: Walk.]" }
    ];
    const out = renderThoughtWindow(log, 2, "Anna", 1000);
    expect(out).toBe(
      "[Anna's Thoughts (newest to oldest):\n" +
      "{Intake: She smiles.\nThought: Nice.\nAction: Wait.\n" +
      "Intake: She is outside.\nThought: Fresh air.\nAction: Walk.}\n" +
      "]"
    );
  });
});
