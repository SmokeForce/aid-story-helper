import { clamp } from "./rng";

/** Cup letters indexed by volume inches (bust - band): AA=0 .. G=7. */
export const CUP_LADDER = ["AA", "A", "B", "C", "D", "DD", "DDD", "G"] as const;

export function letterToCupVolume(letter: string): number {
  const i = CUP_LADDER.indexOf(letter.toUpperCase() as (typeof CUP_LADDER)[number]);
  return i < 0 ? 2 : i; // unknown letter → modal B
}

export function cupVolumeToLetter(vol: number): string {
  const i = Math.round(clamp(vol, 0, CUP_LADDER.length - 1));
  return CUP_LADDER[i]!;
}

/** True bust (over breast peak) = band number + cup-letter inches (spec §A.1). */
export function braToTrueBust(band: number, cupLetter: string): number {
  return Math.round(band + letterToCupVolume(cupLetter));
}

/** Render a band circumference + true bust back to conventional bra size ("32DD"). */
export function trueBustToBra(trueBustInches: number, band: number): string {
  const evenBand = 2 * Math.round(band / 2);
  return `${evenBand}${cupVolumeToLetter(Math.round(trueBustInches - evenBand))}`;
}
