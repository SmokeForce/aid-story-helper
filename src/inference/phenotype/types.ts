export type Gender = "female" | "male";
export type Population = "western" | "global";

/** Accumulated axis biases from the descriptor lexicon (all optional; absent = no bias). */
export interface DimensionBias {
  height?: "low" | "high";      // "short" / "tall"
  scale?: "low" | "high";       // overall frame percentile
  shoulders?: "low" | "high";   // male shoulder-axis pin
  cup?: "low" | "high";         // female cup-axis pin
  shapeHint?: string;           // suggested shape label (e.g. "Hourglass")
  muscularity?: string;         // male muscularity hint (Lean/Muscular/Stocky)
}

export interface Archetype {
  gender: Gender;
  shape: string;                // e.g. "Hourglass", "V-Taper"
  scale: string;                // e.g. "Average", "Muscular"
  cues: string[];               // extracted descriptor tokens
  bias: DimensionBias;          // composed axis biases
}

export interface PhenotypeMeasurements {
  heightInches: number;
  waist: number;
  hip: number;
  // female axes:
  bustTrue?: number;
  band?: number;
  cupVolume?: number;
  // male axis:
  shoulders?: number;
}

export interface SampledAnchors {
  descriptorPhrase: string;
  keyPair: string;              // "BWH: 32DD-23-35" / "SWH: 44-32-38"
  internalMeasurements: PhenotypeMeasurements;
}

export type Provenance = "sampled" | "reverse-seeded" | "skipped";

export interface PhenotypeRecord {
  shortId: string;
  characterKey: string;         // name.trim().toLowerCase()
  provenance: Provenance;
  gender: Gender | null;        // null ⇔ "skipped"
  population: Population;
  seed: number;
  reroll?: number;              // manual re-roll counter; absent/0 = the original deterministic sample
  cues: string[];
  archetype: { shape: string; scale: string } | null;
  measurements: PhenotypeMeasurements | null;
  descriptorPhrase: string;
  keyPair: string;              // "" when skipped
  quirks: string[];
  sampledAt: string;            // ISO
}
