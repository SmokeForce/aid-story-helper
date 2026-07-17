import type { DimensionBias } from "./types";

/** Domain knowledge: descriptor token (lemma/phrase, lowercase) → axis bias. compromise supplies the
 *  tokens; this map supplies the meaning. Unknown tokens simply carry no bias (graceful degradation). */
export const DESCRIPTOR_LEXICON: Record<string, DimensionBias> = {
  // height
  tall: { height: "high" }, statuesque: { height: "high", shapeHint: "Hourglass" },
  towering: { height: "high" }, "long-legged": { height: "high" }, leggy: { height: "high" },
  lofty: { height: "high" }, short: { height: "low" }, petite: { scale: "low", height: "low" },
  diminutive: { height: "low", scale: "low" }, tiny: { height: "low", scale: "low" },
  // scale / frame
  slim: { scale: "low" }, slender: { scale: "low" }, willowy: { scale: "low", height: "high" },
  wiry: { scale: "low", muscularity: "Lean", shapeHint: "Rectangle/Slim" }, lithe: { scale: "low" },
  lean: { scale: "low", muscularity: "Lean" }, svelte: { scale: "low" }, waifish: { scale: "low" },
  beanpole: { height: "high", scale: "low" }, lanky: { height: "high", scale: "low" },
  gangly: { height: "high", scale: "low" }, average: {}, athletic: { muscularity: "Muscular" },
  toned: { muscularity: "Muscular" }, fit: { muscularity: "Muscular" }, muscular: { muscularity: "Muscular", scale: "high" },
  muscled: { muscularity: "Muscular", scale: "high" }, brawny: { muscularity: "Muscular", scale: "high" },
  jacked: { muscularity: "Muscular", scale: "high" }, burly: { scale: "high", muscularity: "Stocky" },
  stocky: { scale: "high", muscularity: "Stocky" }, "heavy-set": { scale: "high", muscularity: "Stocky" },
  hefty: { scale: "high" }, thickset: { scale: "high", muscularity: "Stocky" }, stout: { scale: "high" },
  chunky: { scale: "high" }, plump: { scale: "high" }, "full-figured": { scale: "high", cup: "high" },
  curvy: { shapeHint: "Hourglass", cup: "high" }, voluptuous: { shapeHint: "Hourglass", cup: "high", scale: "high" },
  buxom: { cup: "high" }, "plus-size": { scale: "high" }, rotund: { scale: "high" },
  // shape (female)
  hourglass: { shapeHint: "Hourglass" }, "pear-shaped": { shapeHint: "Pear/Triangle" },
  "apple-shaped": { shapeHint: "Oval/Apple" }, rectangular: { shapeHint: "Rectangle/Slim" },
  // shoulders (male)
  "broad-shouldered": { shoulders: "high" }, "broad-chested": { shoulders: "high" },
  "v-shaped": { shoulders: "high", shapeHint: "V-Taper" }, "barrel-chested": { shoulders: "high", scale: "high" },
  "narrow-shouldered": { shoulders: "low" },
  // cup (female)
  busty: { cup: "high" }, "big-busted": { cup: "high" }, "large-chested": { cup: "high" },
  "ample-chested": { cup: "high" }, "flat-chested": { cup: "low" }, "small-chested": { cup: "low" },
  "modest-chested": { cup: "low" },
};

/** Emit-side output map: canonical label → readable phrase fragment for the descriptor phrase. */
export const ARCHETYPE_PHRASES: Record<string, string> = {
  Hourglass: "an even hourglass", "Top Hourglass": "a top-heavy hourglass",
  "Spoon/Curvy Pear": "a curvy, hip-forward figure", "Pear/Triangle": "a pear-shaped figure",
  "Rectangle/Slim": "a lean, straight figure", "Inverted Triangle": "a shoulder-forward figure",
  "V-Taper": "a strong V-taper", "Rectangle/Athletic": "an athletic, even build",
  Trapezoid: "a broad, squared-off build", "Triangle/Pear": "a hip-heavy build",
  "Oval/Apple": "a solid, center-set build",
  Petite: "petite", Slim: "slim", Average: "average", "Full/Plus": "full-figured",
  Lean: "lean", Muscular: "muscular", Stocky: "stocky",
};

/** Merge two biases; a later cue overrides an earlier one on any field it sets. */
export function mergeBias(into: DimensionBias, add: DimensionBias): DimensionBias {
  return { ...into, ...add };
}
