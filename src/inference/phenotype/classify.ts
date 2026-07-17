import nlp from "compromise";
import type { Archetype, DimensionBias, Gender } from "./types";
import { DESCRIPTOR_LEXICON, mergeBias } from "./lexicon";

/** Female shape from B-W-H inch differences (§A.1). Order matters: most specific first. */
export function femaleShape(bust: number, waist: number, hip: number): string {
  const bustWaist = bust - waist, hipWaist = hip - waist, bustHip = bust - hip;
  const defined = bustWaist >= 9 && hipWaist >= 10; // deep, balanced waist
  if (defined && Math.abs(bustHip) <= 1) return "Hourglass";
  if (defined && bustHip > 1) return "Top Hourglass";
  if (hip - bust >= 4 && hipWaist >= 10 && bustWaist >= 9) return "Spoon/Curvy Pear";
  if (hip - bust >= 2) return "Pear/Triangle";
  if (bust - hip >= 2) return "Inverted Triangle";
  return "Rectangle/Slim";
}

/** Male shape from S-W-H inch differences (§A.1). */
export function maleShape(shoulders: number, waist: number, hip: number): string {
  const shHip = shoulders - hip, shWaist = shoulders - waist;
  if (waist >= shoulders - 2 && shHip <= 3) return "Oval/Apple";
  if (hip - shoulders >= 2) return "Triangle/Pear";
  if (shHip >= 6) return "V-Taper";
  if (shWaist >= 14) return "Trapezoid";
  return "Rectangle/Athletic";
}

/** Pull known descriptor tokens from lazy text. compromise finds adjectives/phrases; we keep only the
 *  ones the lexicon knows (single lemmas + hyphenated multiword forms present verbatim in the text). */
export function extractCues(text: string): string[] {
  const found = new Set<string>();
  const lower = ` ${String(text || "").toLowerCase()} `;
  // Multiword / hyphenated lexicon keys: substring match on the raw lowercased text.
  for (const key of Object.keys(DESCRIPTOR_LEXICON)) {
    if (key.includes("-") || key.includes(" ")) {
      if (lower.includes(` ${key} `) || lower.includes(`${key} `) || lower.includes(` ${key}`)) found.add(key);
    }
  }
  // Single-word cues: lemmatize adjectives via compromise, then look up.
  try {
    const doc = nlp(String(text || ""));
    const adjectives: string[] = doc.adjectives().out("array");
    const words: string[] = doc.terms().out("array");
    for (const raw of [...adjectives, ...words]) {
      const w = raw.toLowerCase().replace(/[^a-z-]/g, "");
      if (w && DESCRIPTOR_LEXICON[w]) found.add(w);
    }
  } catch {
    // compromise failure is non-fatal — multiword matches above still apply.
  }
  return [...found];
}

/** Compose cues into a gendered archetype. Later cues override earlier on conflicting axes. */
export function classify(lazyDesc: string, gender: Gender): Archetype {
  const cues = extractCues(lazyDesc);
  let bias: DimensionBias = {};
  for (const cue of cues) bias = mergeBias(bias, DESCRIPTOR_LEXICON[cue] || {});
  const shape = bias.shapeHint || (gender === "female" ? "Rectangle/Slim" : "Rectangle/Athletic");
  const scale =
    gender === "female"
      ? bias.scale === "low" ? "Slim" : bias.scale === "high" ? "Full/Plus" : "Average"
      : bias.muscularity || (bias.scale === "high" ? "Stocky" : bias.scale === "low" ? "Lean" : "Average");
  return { gender, shape, scale, cues, bias };
}
