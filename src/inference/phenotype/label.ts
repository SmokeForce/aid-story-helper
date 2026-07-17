import type { Gender, PhenotypeMeasurements } from "./types";
import { femaleShape, maleShape } from "./classify";
import { ARCHETYPE_PHRASES } from "./lexicon";

function statureWord(gender: Gender, heightInches: number): string {
  const tall = gender === "female" ? 66 : 71.5; // ~ +1 SD
  const short = gender === "female" ? 61 : 66.5; // ~ −1 SD
  if (heightInches >= tall) return "tall";
  if (heightInches <= short) return "short";
  return "average-height";
}

/** Reverse: measurements → readable descriptor. */
export function label(m: PhenotypeMeasurements, gender: Gender): string {
  const stature = statureWord(gender, m.heightInches);
  let shape: string;
  if (gender === "female") shape = femaleShape(m.bustTrue ?? m.waist, m.waist, m.hip);
  else shape = maleShape(m.shoulders ?? m.waist, m.waist, m.hip);
  const shapePhrase = ARCHETYPE_PHRASES[shape] || shape.toLowerCase();
  return `${stature}, ${shapePhrase}`;
}
