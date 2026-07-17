// src/inference/phenotype/index.ts
import type { Gender, Population, PhenotypeRecord } from "./types";
import { hashSeed } from "./rng";
import { classify } from "./classify";
import { sampleAnchors, sampleQuirks } from "./sample";

export * from "./types";
export { classify, extractCues, femaleShape, maleShape } from "./classify";
export { sampleAnchors, sampleQuirks, drawHeight } from "./sample";
export { label } from "./label";
export { braToTrueBust, trueBustToBra } from "./braSize";

const GENDER_FIELD_RE = /^\s*[-•*]?\s*Gender(?:\s*&\s*Age)?\s*:\s*(.+)$/im;

// Gendered honorifics/titles that may prefix a character's NAME. The feminine "-ess" forms
// (countess/baroness/duchess/princess) are guarded by word boundaries so a masculine stem
// ("count") never matches its feminine extension; FEMALE is tested before MALE as belt-and-suspenders.
const FEMALE_NAME_TITLE = /\b(mrs|ms|miss|mme|madame|mademoiselle|lady|dame|madam|queen|princess|duchess|countess|baroness|empress|mistress|mother|sister|nun|matron|frau|senora|senorita)\b/i;
const MALE_NAME_TITLE = /\b(mr|mister|monsieur|sir|lord|master|king|prince|duke|earl|count|baron|viscount|emperor|father|brother|herr|senor|sri|don)\b/i;

/** Layered gender resolution (spec §3 decision 2): explicit Gender field → gendered title in the
 *  NAME → pronoun/honorific tally over the CHARACTER-SCOPED cue text → null. The name tier is what
 *  keeps a male character ("Monsieur Vallois") from being mis-gendered by a female-protagonist story;
 *  `storyText` should be the character-scoped cue text, not the whole recent story, so another
 *  character's pronouns don't dominate the tally. */
export function resolveGender(cardValue: string, storyText: string, name = ""): Gender | null {
  // 1) Explicit Gender / Gender & Age field on the card.
  const field = String(cardValue || "").match(GENDER_FIELD_RE)?.[1]?.toLowerCase() || "";
  if (/\bfemale\b|\bwoman\b|\bgirl\b|\bshe\b/.test(field)) return "female";
  if (/\bmale\b|\bman\b|\bboy\b/.test(field)) return "male";
  // 2) Gendered title/honorific in the character's own name (the most reliable card-level signal).
  const nm = String(name || "");
  if (FEMALE_NAME_TITLE.test(nm)) return "female";
  if (MALE_NAME_TITLE.test(nm)) return "male";
  // 3) Pronoun/honorific tally over the (character-scoped) cue text.
  const story = ` ${String(storyText || "").toLowerCase()} `;
  const fem = (story.match(/\b(she|her|hers|herself|woman|girl|lady|mrs|miss|ms)\b/g) || []).length;
  const masc = (story.match(/\b(he|him|his|himself|man|boy|sir|mr|monsieur)\b/g) || []).length;
  if (fem === 0 && masc === 0) return null;
  if (fem > masc) return "female";
  if (masc > fem) return "male";
  return null;
}

export interface PhenotypeInputArgs {
  shortId: string; characterKey: string; name: string;
  gender: Gender | null; population: Population;
  cueText: string;
  existingRecord?: PhenotypeRecord | null;
  hasEstablishedAppearance: boolean;
  existingKeyPairLine?: string | null;
}

export interface PhenotypeInputResult {
  record: PhenotypeRecord;
  appearanceGuidance: string;
  keyPairLine: string;
  quirks: string[];
  rewriteAppearance: boolean;
}

const NO_ANATOMY = "Render build and figure tastefully; do not fabricate explicit sexual anatomy, and never put measurements or a cup size in the prose.";

function guidanceFrom(descriptorPhrase: string, heightInches: number, gender: Gender): string {
  const feet = Math.floor(heightInches / 12), inches = Math.round(heightInches - feet * 12);
  return `Ground ${gender === "female" ? "her" : "his"} physical description on this sampled frame: ${descriptorPhrase}, about ${feet}'${inches}". ${NO_ANATOMY}`;
}

/** Pure orchestrator: decide the path, produce anchors + guidance + the record to persist. */
export function buildPhenotypeInputs(args: PhenotypeInputArgs): PhenotypeInputResult {
  const now = new Date().toISOString();
  const { shortId, characterKey, name, gender, population, cueText } = args;

  // 1) A persisted record → re-inject verbatim (no re-roll), EXCEPT: (a) a skipped record whose gender
  //    now resolves (upgrade to a real body), or (b) a record whose stored gender now definitely
  //    contradicts the resolved gender (a mis-gendered body being corrected). Both fall through to a
  //    fresh sample below; an unresolved (null) gender never triggers a re-roll.
  const rec0 = args.existingRecord;
  const skipUpgrade = !!(rec0 && rec0.provenance === "skipped" && gender);
  const genderMismatch = !!(rec0 && rec0.gender && gender && rec0.gender !== gender);
  if (rec0 && !skipUpgrade && !genderMismatch) {
    const rec = rec0;
    return {
      record: rec,
      appearanceGuidance:
        rec.provenance === "sampled" && rec.gender
          ? guidanceFrom(rec.descriptorPhrase, rec.measurements?.heightInches ?? 0, rec.gender)
          : rec.provenance === "skipped"
            ? `Describe ${name}'s appearance from the story's cues; this being may be non-human or ungendered. ${NO_ANATOMY}`
            : "",
      keyPairLine: rec.keyPair,
      quirks: rec.quirks,
      rewriteAppearance: rec.provenance !== "reverse-seeded",
    };
  }

  // 2) Gender unresolved → skip body; story-only appearance.
  if (!gender) {
    const rec: PhenotypeRecord = {
      shortId, characterKey, provenance: "skipped", gender: null, population,
      seed: hashSeed(`${characterKey}|${name}`), cues: [], archetype: null, measurements: null,
      descriptorPhrase: "", keyPair: "", quirks: [], sampledAt: now,
    };
    return { record: rec, appearanceGuidance: `Describe ${name}'s appearance from the story's cues; this being may be non-human or ungendered. ${NO_ANATOMY}`, keyPairLine: "", quirks: [], rewriteAppearance: true };
  }

  const seed = hashSeed(`${characterKey}|${name}|${gender}|${population}`);
  const archetype = classify(cueText, gender);

  // 3) Established hand-authored appearance → reverse-seed the key-pair anchor, PRESERVE the prose.
  if (args.hasEstablishedAppearance) {
    const keyPair = args.existingKeyPairLine && args.existingKeyPairLine.trim()
      ? args.existingKeyPairLine.trim()
      : sampleAnchors(archetype, population, seed).keyPair; // synthesize a consistent anchor if none authored
    const quirks = sampleQuirks(gender, archetype.cues, seed);
    const rec: PhenotypeRecord = {
      shortId, characterKey, provenance: "reverse-seeded", gender, population, seed,
      cues: archetype.cues, archetype: { shape: archetype.shape, scale: archetype.scale },
      measurements: null, descriptorPhrase: "", keyPair, quirks, sampledAt: now,
    };
    return { record: rec, appearanceGuidance: "", keyPairLine: keyPair, quirks, rewriteAppearance: false };
  }

  // 4) The gap: empty/thin appearance → sample fresh, engine owns the prose.
  const anchors = sampleAnchors(archetype, population, seed);
  const quirks = sampleQuirks(gender, archetype.cues, seed);
  const rec: PhenotypeRecord = {
    shortId, characterKey, provenance: "sampled", gender, population, seed,
    cues: archetype.cues, archetype: { shape: archetype.shape, scale: archetype.scale },
    measurements: anchors.internalMeasurements, descriptorPhrase: anchors.descriptorPhrase,
    keyPair: anchors.keyPair, quirks, sampledAt: now,
  };
  return {
    record: rec,
    appearanceGuidance: guidanceFrom(anchors.descriptorPhrase, anchors.internalMeasurements.heightInches, gender),
    keyPairLine: anchors.keyPair, quirks, rewriteAppearance: true,
  };
}

export interface RerollResult {
  record: PhenotypeRecord;
  appearanceGuidance: string;
  keyPairLine: string;
  quirks: string[];
}

/** Manually re-roll a persisted body: bump the reroll nonce → a different seed → a fresh sample from
 *  the record's OWN stored cues (never re-reading the now-polluted card). Returns null when there is
 *  no body to re-roll (skipped / genderless). A reverse-seeded record is converted to sampled. */
export function rerollPhenotype(rec: PhenotypeRecord): RerollResult | null {
  if (!rec.gender || rec.provenance === "skipped") return null;
  const reroll = (rec.reroll ?? 0) + 1;
  const seed = hashSeed(`${rec.characterKey}|${rec.gender}|${rec.population}|reroll:${reroll}`);
  const archetype = classify((rec.cues || []).join(" "), rec.gender);
  const anchors = sampleAnchors(archetype, rec.population, seed);
  const quirks = sampleQuirks(rec.gender, rec.cues || [], seed);
  const record: PhenotypeRecord = {
    ...rec,
    provenance: "sampled",
    reroll,
    seed,
    archetype: { shape: archetype.shape, scale: archetype.scale },
    measurements: anchors.internalMeasurements,
    descriptorPhrase: anchors.descriptorPhrase,
    keyPair: anchors.keyPair,
    quirks,
    sampledAt: new Date().toISOString(),
  };
  return {
    record,
    appearanceGuidance: guidanceFrom(anchors.descriptorPhrase, anchors.internalMeasurements.heightInches, rec.gender),
    keyPairLine: anchors.keyPair,
    quirks,
  };
}
