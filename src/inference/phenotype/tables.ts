import type { Gender, Population } from "./types";

export const HEIGHT_NORMALS: Record<Population, Record<Gender, { mean: number; sd: number }>> = {
  western: { male: { mean: 69.1, sd: 2.9 }, female: { mean: 63.5, sd: 2.7 } },
  global: { male: { mean: 67.5, sd: 3.0 }, female: { mean: 62.8, sd: 2.75 } },
};

export const HANDEDNESS_LEFT_RATE: Record<Gender, number> = { male: 0.116, female: 0.095 };

export interface HeightBand {
  loIn: number; hiIn: number;
  a: [number, number];      // bust (female) / shoulders (male)
  waist: [number, number];
  hip: [number, number];
}

// §A.2.1 male SWH by height (inches). Heights: 5'3"=63 ... 7'2"=86.
export const MALE_BUILD_BY_HEIGHT: HeightBand[] = [
  { loIn: 63, hiIn: 65, a: [41.5, 45.0], waist: [29.5, 34.0], hip: [34.5, 37.5] },
  { loIn: 66, hiIn: 68, a: [43.0, 46.5], waist: [31.0, 35.5], hip: [36.0, 39.5] },
  { loIn: 69, hiIn: 71, a: [44.5, 48.0], waist: [32.0, 37.0], hip: [37.5, 41.5] },
  { loIn: 72, hiIn: 74, a: [46.0, 50.0], waist: [33.0, 38.5], hip: [39.0, 43.0] },
  { loIn: 75, hiIn: 77, a: [48.0, 52.5], waist: [34.5, 40.5], hip: [41.0, 45.5] },
  { loIn: 78, hiIn: 80, a: [51.0, 55.0], waist: [36.0, 42.0], hip: [43.5, 47.5] },
  { loIn: 81, hiIn: 83, a: [54.0, 58.5], waist: [38.0, 44.5], hip: [46.0, 51.0] },
  { loIn: 84, hiIn: 86, a: [58.0, 64.0], waist: [40.0, 49.0], hip: [49.0, 56.0] },
];

// §A.2.2 female BWH by height (inches; "a" = TRUE bust). Heights: 4'10"=58 ... 6'5"=77.
export const FEMALE_BUILD_BY_HEIGHT: HeightBand[] = [
  { loIn: 58, hiIn: 60, a: [31.0, 34.5], waist: [23.5, 26.5], hip: [32.5, 35.5] },
  { loIn: 61, hiIn: 63, a: [32.5, 36.0], waist: [24.5, 28.0], hip: [34.0, 37.5] },
  { loIn: 64, hiIn: 66, a: [34.0, 37.5], waist: [25.5, 29.5], hip: [35.5, 39.5] },
  { loIn: 67, hiIn: 69, a: [35.5, 39.0], waist: [26.5, 31.0], hip: [37.0, 41.0] },
  { loIn: 70, hiIn: 72, a: [36.5, 40.5], waist: [27.5, 32.5], hip: [38.5, 43.0] },
  { loIn: 73, hiIn: 75, a: [38.0, 42.5], waist: [29.0, 34.5], hip: [40.5, 45.0] },
  { loIn: 76, hiIn: 77, a: [40.0, 45.0], waist: [31.0, 37.0], hip: [42.5, 47.5] },
];

export function bandForHeight(bands: HeightBand[], heightInches: number): HeightBand {
  if (heightInches <= bands[0]!.loIn) return bands[0]!;
  const last = bands[bands.length - 1]!;
  if (heightInches >= last.hiIn) return last;
  for (const b of bands) if (heightInches >= b.loIn && heightInches <= b.hiIn) return b;
  // between two bands (gap) → nearest lower band
  let chosen = bands[0]!;
  for (const b of bands) if (b.loIn <= heightInches) chosen = b;
  return chosen;
}

// §A.2.5 population scale split (median-centered percentile tiers).
export const SCALE_TIER_WEIGHTS = [0.05, 0.25, 0.40, 0.25, 0.05];
export const SCALE_TIER_RANGES: [number, number][] = [
  [0.0, 0.05], [0.05, 0.30], [0.30, 0.70], [0.70, 0.95], [0.95, 1.0],
];

export interface CupTier { letter: string; weight: number }

// §A.2.4 worn/self-reported cup distribution (modal B, skews small). A–C ~73%, D–DD ~22%, DDD+ ~5%.
export const CUP_DISTRIBUTION_WORN: CupTier[] = [
  { letter: "AA", weight: 0.02 }, { letter: "A", weight: 0.13 }, { letter: "B", weight: 0.30 },
  { letter: "C", weight: 0.28 }, { letter: "D", weight: 0.15 }, { letter: "DD", weight: 0.07 },
  { letter: "DDD", weight: 0.03 }, { letter: "G", weight: 0.02 },
];

// Properly-fitted realism knob (modal E–G). Off by default.
export const CUP_DISTRIBUTION_FITTED: CupTier[] = [
  { letter: "AA", weight: 0.02 }, { letter: "A", weight: 0.04 }, { letter: "B", weight: 0.09 },
  { letter: "C", weight: 0.15 }, { letter: "D", weight: 0.20 }, { letter: "DD", weight: 0.25 },
  { letter: "DDD", weight: 0.15 }, { letter: "G", weight: 0.10 },
];
