import type { Archetype, DimensionBias, Gender, Population, PhenotypeMeasurements, SampledAnchors } from "./types";
import { mulberry32, gaussian, truncatedNormal, clamp } from "./rng";
import {
  HEIGHT_NORMALS, HANDEDNESS_LEFT_RATE, MALE_BUILD_BY_HEIGHT, FEMALE_BUILD_BY_HEIGHT,
  bandForHeight, SCALE_TIER_WEIGHTS, SCALE_TIER_RANGES, CUP_DISTRIBUTION_WORN, type HeightBand,
} from "./tables";
import { letterToCupVolume, trueBustToBra } from "./braSize";
import { femaleShape, maleShape } from "./classify";
import { ARCHETYPE_PHRASES } from "./lexicon";

const EPS_SD = 0.14; // frame-axis correlation knob (§A.2.6): tight → proportional/common.

/** Draw height from the population×gender truncated normal, shifted into a descriptor band by cue. */
export function drawHeight(gender: Gender, population: Population, bias: DimensionBias, rng: () => number): number {
  const { mean, sd } = HEIGHT_NORMALS[population][gender];
  let lo = mean - 3 * sd, hi = mean + 3 * sd;
  if (bias.height === "high") lo = mean + 1 * sd;
  else if (bias.height === "low") hi = mean - 1 * sd;
  return truncatedNormal(mean, sd, lo, hi, rng);
}

/** Weighted pick of a scale tier (5/25/40/25/5), then uniform within its percentile sub-range. Cue
 *  biases the tier choice down/up. Returns p₀ ∈ [0,1]. */
export function drawScalePercentile(bias: DimensionBias, rng: () => number): number {
  const weights = SCALE_TIER_WEIGHTS.slice();
  if (bias.scale === "low") { weights[0]! += 0.15; weights[1]! += 0.15; weights[3]! -= 0.12; weights[4]! -= 0.04; }
  else if (bias.scale === "high") { weights[3]! += 0.15; weights[4]! += 0.12; weights[1]! -= 0.12; weights[0]! -= 0.04; }
  const total = weights.reduce((a, b) => a + Math.max(0, b), 0);
  let r = rng() * total, idx = 0;
  for (let i = 0; i < weights.length; i++) { r -= Math.max(0, weights[i]!); if (r <= 0) { idx = i; break; } }
  const [lo, hi] = SCALE_TIER_RANGES[idx]!;
  return lo + rng() * (hi - lo);
}

function lerp(range: [number, number], p: number): number { return range[0] + clamp(p, 0, 1) * (range[1] - range[0]); }
function axisPercentile(p0: number, pin: "low" | "high" | undefined, rng: () => number): number {
  let p = clamp(p0 + gaussian(rng, 0, EPS_SD), 0, 1);
  if (pin === "high") p = clamp(Math.max(p, 0.85) + Math.abs(gaussian(rng, 0, EPS_SD)) * 0.3, 0, 1);
  else if (pin === "low") p = clamp(Math.min(p, 0.15), 0, 1);
  return p;
}

/** Pick a cup volume (inches) from the worn distribution, biased by a cue. */
function drawCupVolume(bias: DimensionBias, rng: () => number): number {
  const tiers = CUP_DISTRIBUTION_WORN.map(t => ({ vol: letterToCupVolume(t.letter), weight: t.weight }));
  const shift = bias.cup === "high" ? 2.5 : bias.cup === "low" ? 0.4 : 1;
  const weights = tiers.map(t => t.weight * (bias.cup === "high" ? Math.pow(shift, t.vol / 3) : bias.cup === "low" ? Math.pow(shift, t.vol) : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < tiers.length; i++) { r -= weights[i]!; if (r <= 0) return tiers[i]!.vol; }
  return tiers[tiers.length - 1]!.vol;
}

export function sampleAnchors(archetype: Archetype, population: Population, seed: number): SampledAnchors {
  const rng = mulberry32(seed >>> 0);
  const { gender, bias } = archetype;
  const heightInches = drawHeight(gender, population, bias, rng);
  const p0 = drawScalePercentile(bias, rng);
  const bands = gender === "female" ? FEMALE_BUILD_BY_HEIGHT : MALE_BUILD_BY_HEIGHT;
  const band: HeightBand = bandForHeight(bands, Math.round(heightInches));

  const waist = Math.round(lerp(band.waist, axisPercentile(p0, undefined, rng)));
  const hip = Math.round(lerp(band.hip, axisPercentile(p0, undefined, rng)));

  let m: PhenotypeMeasurements;
  let keyPair: string, descriptorPhrase: string, shape: string;

  if (gender === "female") {
    // Frame band (ribcage) axis: the by-height "bust" range minus room for cup (≈ median 4").
    const bandRange: [number, number] = [band.a[0] - 5, band.a[1] - 3];
    const bandIn = lerp(bandRange, axisPercentile(p0, undefined, rng));
    const evenBand = 2 * Math.round(bandIn / 2);
    const cupVolume = drawCupVolume(bias, rng);         // low-correlation axis (band⊥cup)
    const bustTrue = Math.round(clamp(evenBand + cupVolume, band.a[0] - 3, band.a[1] + 5));
    shape = femaleShape(bustTrue, waist, hip);
    keyPair = `BWH: ${trueBustToBra(bustTrue, evenBand)}-${waist}-${hip}`;
    m = { heightInches: Math.round(heightInches), bustTrue, band: evenBand, cupVolume, waist, hip };
    const cupWord = cupVolume <= 2 ? "modest" : cupVolume <= 4 ? "full" : "ample";
    descriptorPhrase = `${statureWord(gender, heightInches)}, ${ARCHETYPE_PHRASES[shape] || shape.toLowerCase()} with a ${cupWord} bust`;
  } else {
    const shoulders = Math.round(lerp(band.a, axisPercentile(p0, bias.shoulders, rng)));
    shape = maleShape(shoulders, waist, hip);
    keyPair = `SWH: ${shoulders}-${waist}-${hip}`;
    m = { heightInches: Math.round(heightInches), shoulders, waist, hip };
    descriptorPhrase = `${statureWord(gender, heightInches)}, ${ARCHETYPE_PHRASES[shape] || shape.toLowerCase()}`;
  }
  return { descriptorPhrase, keyPair, internalMeasurements: m };
}

function statureWord(gender: Gender, heightInches: number): string {
  const tall = gender === "female" ? 66.2 : 72;
  const short = gender === "female" ? 60.8 : 66.2;
  if (heightInches >= tall) return "tall";
  if (heightInches <= short) return "short";
  return "average-height";
}

/** Discrete durable quirks (§A.2.7). First trait: handedness (cue pins, else sample). */
export function sampleQuirks(gender: Gender, cues: string[], seed: number): string[] {
  const rng = mulberry32((seed >>> 0) ^ 0x9e3779b9);
  const out: string[] = [];
  const cued = cues.map(c => c.toLowerCase());
  if (cued.some(c => /left-?handed|southpaw/.test(c))) out.push("Left-handed");
  else if (cued.some(c => /right-?handed/.test(c))) out.push("Right-handed");
  else out.push(rng() < HANDEDNESS_LEFT_RATE[gender] ? "Left-handed" : "Right-handed");
  return out;
}
