import { describe, it, expect } from "vitest";
import {
  isContractionToken,
  isElisionToken,
  multiwordDisqualified,
  trimJunkEdgeWords,
  hasMidSentenceCap,
  mentionedInText,
  registerCandidate,
  updatePendingEvidence,
  readyToPromote,
  prunePending,
  PN_CONNECTORS,
  PENDING_PROPER_NOUN_CAP,
} from "../src/inference/proper-nouns";
import type { PendingProperNoun } from "../src/shared/types";

// All example inputs below are REAL false positives / accepted entities from the 2,457-action
// replay log (aid-propernouns-iH3CZJfc3E1v.json) — see the 2026-07-13 hardening spec.

describe("G3 — contraction / elision tokens", () => {
  it("rejects English contractions that surface capitalized at sentence start", () => {
    for (const junk of ["We've", "He'd", "We'll", "She'll", "Didn't", "Wasn't", "They'll", "How're", "Where'd", "I'm"]) {
      expect(isContractionToken(junk), junk).toBe(true);
    }
  });

  it("rejects French pronoun/verb elisions (J'/C'/N' — je/ce/ne never start a name)", () => {
    for (const junk of ["J'aime", "J'apprécie", "C'est", "N'est"]) {
      expect(isElisionToken(junk), junk).toBe(true);
    }
  });

  it("keeps ARTICLE elisions (L'/D' — le/de start real names: L'Amour Secret, D'Artagnan)", () => {
    for (const name of ["L'Amour", "L'Artiste", "D'Artagnan"]) {
      expect(isElisionToken(name), name).toBe(false);
    }
  });

  it("keeps real names (incl. Irish O'-names and plain possessive-stripped names)", () => {
    for (const name of ["Juniper", "Veya", "O'Brien", "Smith"]) {
      expect(isContractionToken(name), name).toBe(false);
      expect(isElisionToken(name), name).toBe(false);
    }
  });
});

describe("G2 — multiword hygiene", () => {
  it("disqualifies phrases with interior lowercase non-connector words", () => {
    expect(multiwordDisqualified("Lyon without")).toBe(true);
    expect(multiwordDisqualified("Veya a good")).toBe(true);
    expect(multiwordDisqualified("Smoke Brytefayme power")).toBe(true);
  });

  it("disqualifies phrases containing contraction tokens", () => {
    expect(multiwordDisqualified("Signal I'm")).toBe(true);
    expect(multiwordDisqualified("Gabi wouldn't")).toBe(true);
  });

  it("allows lowercase connectors inside real names", () => {
    expect(multiwordDisqualified("Claire de Lune")).toBe(false);
    expect(multiwordDisqualified("Mountain of Ravenwood")).toBe(false);
    expect(multiwordDisqualified("Ice Queen of Ravenwood")).toBe(false);
  });

  it("keeps clean capitalized phrases", () => {
    expect(multiwordDisqualified("Juniper Thorne")).toBe(false);
    expect(multiwordDisqualified("Le Petit Refuge")).toBe(false);
    expect(multiwordDisqualified("L'Amour Secret")).toBe(false);
  });
});

describe("junk edge-trim (recovers real names from glued junk)", () => {
  // Predicates stand in for background.ts's ignore-list/demonym (both edges) and POS (lead-only) tests.
  const bothEdgeJunk = new Set(["french", "especially", "since"]);
  const isJunk = (w: string) => bothEdgeJunk.has(w.toLowerCase()) || /^[a-z']/.test(w) || isContractionToken(w) || isElisionToken(w);
  const leadJunk = new Set(["luckily", "seems", "keep"]); // "keep" included to prove lead-only scoping
  const isLeadJunk = (w: string) => leadJunk.has(w.toLowerCase());

  it("trims leading POS junk (adverbs, inflected verbs)", () => {
    expect(trimJunkEdgeWords("Luckily Vegas", isJunk, isLeadJunk)).toBe("Vegas");
    expect(trimJunkEdgeWords("Seems Juniper", isJunk, isLeadJunk)).toBe("Juniper");
  });

  it("trims trailing junk (lowercase words, demonyms, contractions)", () => {
    expect(trimJunkEdgeWords("Chad sneers", isJunk, isLeadJunk)).toBe("Chad");
    expect(trimJunkEdgeWords("Veya French", isJunk, isLeadJunk)).toBe("Veya");
    expect(trimJunkEdgeWords("Signal I'm", isJunk, isLeadJunk)).toBe("Signal");
  });

  it("NEVER applies POS junk to the trailing edge — noun-verb homographs are name material", () => {
    expect(trimJunkEdgeWords("Obsidian Keep", isJunk, isLeadJunk)).toBe("Obsidian Keep");
  });

  it("returns empty when everything is junk", () => {
    expect(trimJunkEdgeWords("Especially since", isJunk, isLeadJunk)).toBe("");
  });

  it("never trims connectors or interior words, and leaves clean phrases whole", () => {
    expect(trimJunkEdgeWords("Ravenwood Commons", isJunk, isLeadJunk)).toBe("Ravenwood Commons");
    expect(trimJunkEdgeWords("Mountain of Ravenwood", isJunk, isLeadJunk)).toBe("Mountain of Ravenwood");
    expect(trimJunkEdgeWords("The Chaos Collective", isJunk, isLeadJunk)).toBe("The Chaos Collective");
  });

  it("never trims a leading ARTICLE elision — the L'Amour Secret regression", () => {
    // The junk predicate mirrors background.ts (contraction/elision test included); the fixed
    // isElisionToken must not flag L'/D' words, so the phrase survives whole.
    expect(trimJunkEdgeWords("L'Amour Secret", isJunk, isLeadJunk)).toBe("L'Amour Secret");
  });

  it("strips orphaned edge connectors after a trim", () => {
    // "French of Vegas"-shaped: trimming the junk head must not leave a dangling connector.
    expect(trimJunkEdgeWords("French of Vegas", isJunk, isLeadJunk)).toBe("Vegas");
  });
});

describe("G1 — mid-sentence capitalization evidence", () => {
  it("a capital explained only by sentence/dialogue position is NOT evidence", () => {
    expect(hasMidSentenceCap("Thank", '"Thank you," she breathes.')).toBe(false);
    expect(hasMidSentenceCap("Want", "Want to come along?\nWant it or not.")).toBe(false);
    expect(hasMidSentenceCap("Oui", '"Oui. Bien sûr."')).toBe(false);
  });

  it("a capital after a lowercase word, comma, or semicolon IS evidence", () => {
    expect(hasMidSentenceCap("Juniper", "you spot Juniper near the doors")).toBe(true);
    expect(hasMidSentenceCap("Spokane", "back home in Spokane, Washington")).toBe(true);
    expect(hasMidSentenceCap("Veya", "and then, Veya smiles")).toBe(true);
  });

  it("is not fooled by the same word lowercase mid-sentence", () => {
    expect(hasMidSentenceCap("Thank", "they thank you profusely. Thank god.")).toBe(false);
  });
});

describe("mention counting (G5 credit rules)", () => {
  it("counts a full-phrase match", () => {
    expect(mentionedInText("Le Petit Refuge", "dinner at Le Petit Refuge tonight")).toBe(true);
    expect(mentionedInText("Juniper", "Juniper waves.")).toBe(true);
    expect(mentionedInText("Juniper", "no one here")).toBe(false);
  });

  it("gives a multiword phrase credit from its distinctive words", () => {
    // "Juniper Thorne" pending; a later action mentioning just "Juniper" counts.
    expect(mentionedInText("Juniper Thorne", "Juniper rolls her eyes", () => false)).toBe(true);
  });

  it("does NOT credit known-name words or connectors", () => {
    // "Smoke Girlfriend": "Smoke" is the protagonist — only "Girlfriend" may credit.
    const isKnownWord = (w: string) => w.toLowerCase() === "smoke";
    expect(mentionedInText("Smoke Girlfriend", "Smoke laughs loudly", isKnownWord)).toBe(false);
    expect(mentionedInText("Smoke Girlfriend", "his Girlfriend arrives", isKnownWord)).toBe(true);
    expect(mentionedInText("Mountain of Ravenwood", "the of them", () => false)).toBe(false);
  });
});

describe("pending pool lifecycle", () => {
  const NOW = "2026-07-13T00:00:00.000Z";

  it("first sighting registers but is not ready (G5)", () => {
    const pending: Record<string, PendingProperNoun> = {};
    registerCandidate(pending, "Juniper", "10", "you spot Juniper near the doors", NOW);
    const e = pending["juniper"]!;
    expect(e).toBeTruthy();
    expect(e.noun).toBe("Juniper");
    expect(e.mentionActionIds).toEqual(["10"]);
    expect(e.hasMidSentenceCap).toBe(true); // evidence from the sighting action itself
    expect(readyToPromote(e)).toBe(false);
  });

  it("second-action mention promotes a single word WITH cap evidence", () => {
    const pending: Record<string, PendingProperNoun> = {};
    registerCandidate(pending, "Juniper", "10", "you spot Juniper near the doors", NOW);
    updatePendingEvidence(pending, "11", "Juniper laughs at that.", NOW);
    const e = pending["juniper"]!;
    expect(e.mentionActionIds).toEqual(["10", "11"]);
    expect(readyToPromote(e)).toBe(true);
  });

  it("a single word with repeat mentions but NO mid-sentence cap never promotes (Thank-class junk)", () => {
    const pending: Record<string, PendingProperNoun> = {};
    registerCandidate(pending, "Thank", "5", '"Thank you," she says.', NOW);
    updatePendingEvidence(pending, "6", '"Thank god." Thank goodness.', NOW);
    updatePendingEvidence(pending, "7", "Thank you again!", NOW);
    const e = pending["thank"]!;
    expect(e.mentionActionIds.length).toBeGreaterThanOrEqual(2);
    expect(e.hasMidSentenceCap).toBe(false);
    expect(readyToPromote(e)).toBe(false);
  });

  it("cap evidence can arrive on a later action and unlock promotion", () => {
    const pending: Record<string, PendingProperNoun> = {};
    registerCandidate(pending, "Ibro", "5", "Ibro nods at you.", NOW); // sentence start, no evidence yet
    expect(pending["ibro"]!.hasMidSentenceCap).toBe(false);
    updatePendingEvidence(pending, "6", "you and Ibro head out", NOW);
    const e = pending["ibro"]!;
    expect(e.hasMidSentenceCap).toBe(true);
    expect(readyToPromote(e)).toBe(true);
  });

  it("multiword candidates skip G1 (no cap evidence needed)", () => {
    const pending: Record<string, PendingProperNoun> = {};
    registerCandidate(pending, "Le Petit Refuge", "5", "Le Petit Refuge is quiet.", NOW);
    updatePendingEvidence(pending, "6", "back to Le Petit Refuge", NOW);
    expect(readyToPromote(pending["le petit refuge"]!)).toBe(true);
  });

  it("does not double-count the same action", () => {
    const pending: Record<string, PendingProperNoun> = {};
    registerCandidate(pending, "Juniper", "10", "with Juniper again, Juniper smiled", NOW);
    updatePendingEvidence(pending, "10", "with Juniper again, Juniper smiled", NOW);
    expect(pending["juniper"]!.mentionActionIds).toEqual(["10"]);
  });

  it("a longer variant UPGRADES the pending entry in place (Juniper → Juniper Thorne)", () => {
    const pending: Record<string, PendingProperNoun> = {};
    registerCandidate(pending, "Juniper", "10", "you spot Juniper near the doors", NOW);
    registerCandidate(pending, "Juniper Thorne", "12", "she is Juniper Thorne, apparently", NOW);
    expect(pending["juniper"]).toBeUndefined();
    const e = pending["juniper thorne"]!;
    expect(e).toBeTruthy();
    expect(e.noun).toBe("Juniper Thorne");
    expect(e.firstActionId).toBe("10");
    expect(e.mentionActionIds).toEqual(["10", "12"]);
    expect(readyToPromote(e)).toBe(true); // two mentions, multiword
  });

  it("a shorter variant counts as a mention of the longer pending entry", () => {
    const pending: Record<string, PendingProperNoun> = {};
    registerCandidate(pending, "Professor Halloway", "10", "you meet Professor Halloway there", NOW);
    registerCandidate(pending, "Halloway", "12", "then Halloway grins", NOW);
    expect(Object.keys(pending)).toEqual(["professor halloway"]);
    expect(pending["professor halloway"]!.mentionActionIds).toEqual(["10", "12"]);
  });

  it("prunes to the cap by lastSeenAt, dropping the stalest", () => {
    const pending: Record<string, PendingProperNoun> = {};
    for (let i = 0; i < PENDING_PROPER_NOUN_CAP + 10; i++) {
      registerCandidate(pending, `Junk${i}`, String(i), `Junk${i} here`, `2026-07-13T00:00:${String(i % 60).padStart(2, "0")}.${String(i).padStart(3, "0")}Z`);
    }
    prunePending(pending);
    expect(Object.keys(pending).length).toBe(PENDING_PROPER_NOUN_CAP);
    expect(pending["junk0"]).toBeUndefined(); // stalest dropped
    expect(pending[`junk${PENDING_PROPER_NOUN_CAP + 9}`]).toBeTruthy(); // newest kept
  });
});

describe("constants", () => {
  it("connectors cover the accepted multiword names' linking words", () => {
    for (const c of ["of", "the", "de", "la", "le", "du"]) expect(PN_CONNECTORS.has(c), c).toBe(true);
  });
});
