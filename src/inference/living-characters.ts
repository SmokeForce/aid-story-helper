/*! @license MIT
 * The Living Characters engine (relationship "Life Cards", pressures, momentum, and the social
 * lifecycle modeled across this module and ./bg-life.ts) is adapted WITH EXPLICIT PERMISSION from the
 * LivingCharacters project by LivingNarratives (aka nerdgrl450 in the AI Dungeon Discord) —
 * https://github.com/LivingNarratives/LivingCharacters — and used under the terms of its MIT license:
 *
 *   Copyright (c) 2026 LivingNarratives
 *
 *   Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
 *   associated documentation files (the "Software"), to deal in the Software without restriction,
 *   including without limitation the rights to use, copy, modify, merge, publish, distribute,
 *   sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
 *   furnished to do so, subject to the following conditions:
 *
 *   The above copyright notice and this permission notice shall be included in all copies or
 *   substantial portions of the Software.
 *
 *   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
 *   NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 *   NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
 *   DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT
 *   OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
import type { CardRow, Settings } from "../shared/types";
import { isCharacterTriggered } from "../shared/types";
import { stripInjectedDirectives } from "./injection";


/**
 * Default pool of relationship pressures for Living Characters seeding, used when an adventure's
 * config lists none. Mirrors the reference engine's curated DEFAULT_PRESSURES — clean, scenario-
 * agnostic *relational emotional tensions* (one character's enduring feeling toward another), not
 * behaviors or events. Newline-separated to match the config textarea format.
 */
export const DEFAULT_LC_PRESSURES =
  "attraction\nfondness\nfriendship\nprotectiveness\ncuriosity\nenvy\njealousy\nrivalry\nbetrayal\nresentment\ntrust\nsuspicion";

/** Roll a seed's momentum, mirroring the reference engine's intensity weighting
 *  (low 65% / medium 28% / high 7%). Pure; rng injectable for tests. */
export function rollMomentum(rng: () => number = Math.random): "low" | "medium" | "high" {
  const roll = rng();
  if (roll < 0.65) return "low";
  if (roll < 0.93) return "medium";
  return "high";
}

export function cleanName(value: string | undefined | null): string {
  let s = String(value || "").replace(/[^A-Za-z0-9 _'-]/g, " ").trim();
  s = s.replace(/\s+/g, " ");
  return s.slice(0, 50);
}

export function keyName(name: string | undefined | null): string {
  return cleanName(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export interface LifeCardDetails {
  target?: string;
  pressure?: string;
  occurrence?: string;
  momentum?: string;
  status?: string;
}

export function buildLifeCardValue(args: {
  owner: string;
  target: string;
  pressure: string;
  occurrence?: string;
  momentum?: string;
  status?: string;
}): string {
  const owner = cleanName(args.owner) || args.owner.trim();
  const target = cleanName(args.target) || args.target.trim();
  const pressure = String(args.pressure || "friendship").trim();
  const occurrence = String(args.occurrence || "none").trim();
  const momentum = String(args.momentum || "low").trim();
  const status = String(args.status || "seedling").trim();
  return [
    `[`,
    `${owner} Immediate Life Event:`,
    `- Target: ${target}`,
    `- Pressure: ${pressure}`,
    `- Relationship: ${owner} feels ${pressure} toward ${target}`,
    `- Urgency: ${momentum}`,
    `- Latest Occurrence driving pressure: ${occurrence}`,
    `- Status: ${status}`,
    `]`
  ].join("\n");
}

/** Parse a Life Card entry's labeled fields. NOTE: accepts both `Occurrence:` and `Latest Occurrence:`
 *  for the occurrence — real cards/prompts write `Latest Occurrence:`. */
export function parseLifeCardEntry(entry: string | undefined | null): LifeCardDetails {
  if (!entry) return {};
  const lines = entry.replace(/\r/g, "").split("\n");
  const data: LifeCardDetails = {};
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx !== -1) {
      const key = line.slice(0, idx).replace(/^\s*-\s*/, "").trim().toLowerCase();
      const value = line.slice(idx + 1).trim();
      if (key === "target") data.target = value;
      else if (key === "pressure") data.pressure = value;
      // Cards/prompts use "Latest Occurrence:"; accept both so the field is actually parsed (without
      // this, occurrence was always undefined → the panel showed "none" and history never logged).
      else if (key === "occurrence" || key === "latest occurrence" || key === "latest occurrence driving pressure") data.occurrence = value;
      else if (key === "momentum" || key === "urgency") data.momentum = value;
      else if (key === "status") {
        data.status = value.replace(/^🌱\s*/, "").trim();
      }
    }
  }
  return data;
}

/**
 * Decide whether a Life Card's social pressure has run its course and the seed card should be
 * archived (soft-deleted), mirroring the reference engine's `if (bucket.status === "resolved")
 * removeStoryCardByKeys(...)`. Two triggers:
 *  - an explicit `resolved` status (today only the manual ✅ Resolve path produces one — the LLM
 *    judge is retired), OR
 *  - the pressure has sat off-scene (`dormant`) for at least `dormancyThreshold` turns — the
 *    remove-at-dormancy grace, the engine's only live call site.
 * `dormancyThreshold <= 0` disables the dormancy timeout.
 */
export function shouldArchiveLifeCard(
  status: string | undefined | null,
  dormantTurns: number,
  dormancyThreshold: number
): boolean {
  const s = String(status || "").toLowerCase().trim();
  if (s === "resolved") return true;
  if (dormancyThreshold > 0 && s === "dormant" && dormantTurns >= dormancyThreshold) return true;
  return false;
}

/**
 * Decide whether an active in-scene thread has gone STALE and should be archived. Mirrors the
 * reference engine's `reminderCount` aging: a thread that keeps being developed stays alive; one
 * that goes `staleTurns` turns with no fresh occurrence (the NLP signal: owner+target sharing the
 * scene resets the clock) ages out even while its owner is on stage. The caller archives it
 * OUTRIGHT (`archiveLifeCard` — delete + HISTORY kept + reseed cooldown), like the reference's
 * `makeDormant` card removal; there is no intermediate visible dormant state. `staleTurns <= 0`
 * disables the lifespan.
 */
export function shouldFadeStale(lastEventTurn: number, turnCount: number, staleTurns: number): boolean {
  if (staleTurns <= 0) return false;
  return turnCount - lastEventTurn >= staleTurns;
}

/**
 * Hard lifetime cap the reference engine deliberately lacks. A thread seeded at `seededTurn` is
 * retired once it has been alive for `maxActiveTurns` turns REGARDLESS of ongoing activity — the
 * backstop for an actively-refreshed pressure that resets its staleness clock every turn and that
 * the resolution judge never concludes. Unlike `shouldFadeStale`, the age is measured from the
 * immutable seed turn and never resets on a fresh occurrence. `maxActiveTurns <= 0` disables it.
 */
export function shouldRetireByAge(seededTurn: number, turnCount: number, maxActiveTurns: number): boolean {
  if (maxActiveTurns <= 0) return false;
  return turnCount - seededTurn >= maxActiveTurns;
}

/** Reads the folded "- Concluded: yes/no" verdict the retired in-scene Life-card LLM refresh used
 *  to emit. NO CALLERS since the v0.4.17 zero-LLM retirement (NLP lifecycle-as-judge, see §P) —
 *  kept exported + tested as reference in case an LLM verdict channel ever returns.
 *  Conservative: only an explicit affirmative resolves; missing/"no"/anything else = not concluded. */
export function parseConcludedVerdict(text: string): boolean {
  return /(?:^|\n)\s*[-*]?\s*Concluded:\s*(yes|true|resolved|concluded)\b/i.test(String(text || ""));
}

/**
 * Replace the `Status:` line of a Life card value with the engine-decided status (stripping any
 * emoji/decoration the prior line carried). Appends a Status line if the value has none. The engine
 * — not the narrative LLM — owns this field.
 */
export function setLifeCardStatusValue(value: string | undefined | null, status: string): string {
  const v = String(value || "").replace(/\r/g, "");
  const statusLine = `Status: ${status}`;
  if (/^\s*-?\s*status:.*$/im.test(v)) {
    return v.replace(/^(\s*-?\s*)status:.*$/im, `$1${statusLine}`);
  }
  return v.length ? `${v}\n${statusLine}` : statusLine;
}

/** Header for the Life Card's bounded relationship-history log (its Notes/description). */
export const LIFE_HISTORY_HEADER = "Social Relationship History:";
/**
 * Max history lines kept on a Life Card (mirrors the reference engine's MAX_EVENT_LOG=12). The log
 * is the ONLY thing in the description; it can never grow past this many one-line entries.
 */
export const LIFE_HISTORY_MAX_LINES = 12;

/**
 * Build the description (notes) for a Life Card as a BOUNDED, deduped relationship log — one line
 * per pressure, newest appended, capped to LIFE_HISTORY_MAX_LINES. This mirrors the reference
 * engine's `eventLog` (a capped array rendered as the description), NOT a cumulative snapshot.
 *
 * `priorHistory` is the single most-recent archived card's description for this owner (already a
 * flat log); we extract its lines, drop any header/legacy wrappers, append `seedLine`, dedup, and
 * keep only the newest N. Passing ALL archived descriptions (or whole nested descriptions) is what
 * caused the old exponential doubling — never do that again.
 */
export function buildSeededDescription(priorHistory: string, seedLine: string, maxLines = LIFE_HISTORY_MAX_LINES): string {
  const strip = (l: string) => l.replace(/^[-\s]+/, "").trim();
  const isHeader = (l: string) => /^(social|prior) relationship history:/i.test(l);
  const prior = String(priorHistory || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !isHeader(l))
    .map(strip)
    .filter(Boolean);
  const newLine = strip(String(seedLine || ""));
  const all = newLine ? [...prior, newLine] : prior;
  const seen = new Set<string>();
  const deduped = all.filter((l) => { const k = l.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  const capped = deduped.slice(-Math.max(1, maxLines));
  return [LIFE_HISTORY_HEADER, ...capped.map((l) => `- ${l}`)].join("\n");
}

/** The canonical one-line history entry for a pressure: "Owner feels pressure towards target (momentum: X)". */
export function buildLifeHistoryLine(owner: string, pressure: string, target: string, momentum: string): string {
  return `${owner} feels ${pressure} towards ${target} (momentum: ${momentum})`;
}

/**
 * Decide whether the engine should ATTEMPT to seed a new Life Card this turn. Mirrors the reference
 * engine's `maybeCreateSeed` pacing (interval-since-last-success + retry, hard slot cap, first-seed
 * bootstrap):
 *  - `interval <= 0` ⇒ Off (never seed).
 *  - before turn 1 ⇒ no seed (let the story form first).
 *  - live relationships (active + dormant) at/over the cap ⇒ wait for one to archive.
 *  - the FIRST card ever (`seedCount <= 0`) ignores the interval and fires as soon as the above allow.
 *  - otherwise attempt only once `turnCount - lastSeedTurn >= interval`. A *failed* attempt must NOT
 *    advance `lastSeedTurn`, so seeding retries every turn until one actually lands.
 */
export function shouldAttemptSeed(args: {
  liveCount: number;
  maxActive: number;
  seedCount: number;
  turnCount: number;
  lastSeedTurn: number;
  interval: number;
}): boolean {
  const { liveCount, maxActive, seedCount, turnCount, lastSeedTurn, interval } = args;
  if (interval <= 0) return false;
  if (turnCount < 1) return false;
  if (liveCount >= maxActive) return false;
  if (seedCount <= 0) return true; // bootstrap: first card ignores the interval
  return turnCount - (lastSeedTurn || 0) >= interval;
}

function pick<T>(list: T[], rng: () => number): T | undefined {
  if (!list.length) return undefined;
  return list[Math.floor(rng() * list.length) % list.length];
}

function weightedPick(pairs: Array<[string, number]>, rng: () => number): string {
  let total = 0;
  for (const [, w] of pairs) total += Math.max(0, w) || 0;
  if (total <= 0) return pairs.length ? pairs[0]![0] : "";
  let roll = rng() * total;
  for (const [name, w] of pairs) {
    roll -= Math.max(0, w) || 0;
    if (roll <= 0) return name;
  }
  return pairs[pairs.length - 1]![0];
}

function normalizeNameForMatch(name: string | undefined | null): string {
  return cleanName(name).toLowerCase();
}

function firstNameAlias(name: string | undefined | null): string {
  const normalized = normalizeNameForMatch(name);
  const first = normalized.split(/\s+/)[0] || "";
  const blockedFirstNameAliases = new Set([
    "captain",
    "dame",
    "dr",
    "guildmaster",
    "king",
    "lady",
    "lord",
    "mr",
    "mrs",
    "ms",
    "prince",
    "princess",
    "queen",
    "sir",
    "the"
  ]);
  return first.length >= 3 && !blockedFirstNameAliases.has(first) ? first : "";
}

export function isSameLivingCharacterName(a: string | undefined | null, b: string | undefined | null): boolean {
  const left = normalizeNameForMatch(a);
  const right = normalizeNameForMatch(b);
  if (!left || !right) return false;
  if (left === right) return true;

  const leftFirst = firstNameAlias(left);
  const rightFirst = firstNameAlias(right);
  if (leftFirst && leftFirst === right) return true;
  if (rightFirst && rightFirst === left) return true;
  return false;
}

/** Choose the pressures pool to seed from for a specific owner→target pairing. A configured
 *  `PressurePair` matches SYMMETRICALLY (either {a,b} or {b,a}, using the same first-name-aware match
 *  as the rest of the engine); the first matching pair with a NON-EMPTY pool wins EXCLUSIVELY (the
 *  default pool is not mixed in). No matching pair → the default pool. Pure; caller pre-splits the
 *  default pool from `lc.pressures`. Only affects WHICH pressure, never who gets seeded. */
export function selectPressurePool(
  owner: string,
  target: string,
  pairs: import("../shared/types").PressurePair[] | undefined,
  defaultPool: string[]
): string[] {
  for (const p of pairs || []) {
    const match =
      (isSameLivingCharacterName(p.a, owner) && isSameLivingCharacterName(p.b, target)) ||
      (isSameLivingCharacterName(p.a, target) && isSameLivingCharacterName(p.b, owner));
    if (!match) continue;
    const pool = (p.pressures || []).map((s) => String(s || "").trim()).filter(Boolean);
    if (pool.length) return pool; // exclusive — no fall-through to the default
  }
  return defaultPool;
}

/**
 * Choose a TARGET for an already-selected NPC owner, applying the protagonist-involvement bias.
 * `involvement` only influences who is TARGETED; it never makes the protagonist an owner.
 *  - "off"    ⇒ protagonist excluded from targets (pure NPC-to-NPC; "" if no NPC remains).
 *  - "always" ⇒ target the protagonist when present.
 *  - "high"   ⇒ protagonist gets ~3x an NPC's weight; NPC-to-NPC still happens.
 *  - "normal" ⇒ uniform over protagonist + NPCs.
 */
function chooseTarget(owner: string, npcRoster: string[], protagonist: string, involvement: string, rng: () => number): string {
  const pool = [protagonist, ...npcRoster].filter((n) => n && !isSameLivingCharacterName(n, owner));
  if (!pool.length) return "";
  const protagInPool = !!protagonist && pool.some((n) => isSameLivingCharacterName(n, protagonist));
  if (involvement === "off") {
    return pick(pool.filter((n) => !isSameLivingCharacterName(n, protagonist)), rng) || "";
  }
  if (involvement === "always" && protagInPool) return protagonist;
  if (involvement === "high" && protagInPool) {
    return weightedPick(pool.map((n) => [n, isSameLivingCharacterName(n, protagonist) ? 3 : 1] as [string, number]), rng);
  }
  return pick(pool, rng) || "";
}

/**
 * Pick the (owner, target) for a new Life Card, scene-gated like the reference engine's seeding.
 *  - `strict` mode: the seed must be anchored on a non-protagonist NPC currently in scene
 *    (`sceneNPCs`). The anchor owns the thread if it is eligible (50/50, or always under "always"
 *    involvement); otherwise an off-scene eligible NPC owns a thread *toward* the in-scene anchor.
 *    Returns null when no scene-eligible pair exists (caller skips without burning the interval).
 *  - `off` mode: ignore scene presence and seed from the full eligible roster.
 * `eligibleOwners` are the NPCs allowed to own a NEW card (no active card + past reseed cooldown).
 * `rng` is injectable for deterministic tests.
 */
export function chooseSeedPair(
  args: {
    sceneNPCs: string[];
    eligibleOwners: string[];
    npcRoster: string[];
    protagonist: string;
    mode: "strict" | "off";
    involvement: string;
  },
  rng: () => number = Math.random
): { owner: string; target: string } | null {
  const { sceneNPCs, eligibleOwners, npcRoster, protagonist, mode, involvement } = args;

  let owner = "";
  let target = "";

  if (mode === "strict") {
    if (!sceneNPCs.length) return null;
    // Owners must be ON STAGE: intersect eligibility with the in-scene set. Targets are likewise
    // in-scene (the protagonist is always present, handled inside chooseTarget via sceneNPCs).
    const inSceneOwners = eligibleOwners.filter((n) => sceneNPCs.indexOf(n) !== -1);
    const anchor = pick(sceneNPCs, rng) || "";
    const anchorCanOwn = inSceneOwners.indexOf(anchor) !== -1;
    const otherOwners = inSceneOwners.filter((n) => n !== anchor);
    const anchorAsOwner = anchorCanOwn && (involvement === "always" || otherOwners.length === 0 || rng() < 0.5);
    if (anchorAsOwner) {
      owner = anchor;
      target = chooseTarget(owner, sceneNPCs, protagonist, involvement, rng);
    } else if (otherOwners.length) {
      target = anchor;
      owner = pick(otherOwners, rng) || "";
    } else if (anchorCanOwn) {
      owner = anchor;
      target = chooseTarget(owner, sceneNPCs, protagonist, involvement, rng);
    }
  } else {
    if (!eligibleOwners.length) return null;
    owner = pick(eligibleOwners, rng) || "";
    target = chooseTarget(owner, npcRoster, protagonist, involvement, rng);
  }

  if (!owner || !target) return null;
  return { owner, target };
}

export function findLifeCardForCharacter(cards: CardRow[], characterName: string, settings?: Settings): CardRow | undefined {
  const keyPrefix = settings?.livingCharactersKeyPrefix || "chaos-v2:";
  const titlePrefix = settings?.livingCharactersTitlePrefix || "Life - ";
  
  const targetKey = `${keyPrefix}${keyName(characterName)}`.toLowerCase();
  const targetTitle = `${titlePrefix}${characterName}`.toLowerCase();
  
  return cards.find((c) => {
    if (c.deletedAt) return false;
    const titleLower = (c.title || "").toLowerCase();
    const typeLower = (c.type || "").toLowerCase();
    const keysList = (c.keys || "").split(/[,;]+/).map((k) => k.trim().toLowerCase()).filter(Boolean);
    
    return (
      titleLower === targetTitle ||
      keysList.includes(targetKey) ||
      (typeLower === "life" && titleLower.includes(characterName.toLowerCase()))
    );
  });
}

export function buildLifeCardContext(cards: CardRow[], characterName: string, settings?: Settings): string {
  const lifeCard = findLifeCardForCharacter(cards, characterName, settings);
  if (!lifeCard) return "";
  
  const parsed = parseLifeCardEntry(lifeCard.value);
  let block = `[Active Social Pressure for ${characterName}]\n`;
  if (parsed.target || parsed.pressure) {
    block += `Relationship Direction: ${characterName} feels ${parsed.pressure || "an unnamed pressure"} toward ${parsed.target || "someone else"}.\n`;
  }
  block += `This direction is one-way unless the story separately establishes reciprocity.\n`;
  if (parsed.target) block += `Target: ${parsed.target}\n`;
  if (parsed.pressure) block += `Pressure: ${parsed.pressure}\n`;
  if (parsed.momentum) block += `Urgency: ${parsed.momentum}\n`;
  if (parsed.occurrence) block += `Latest Occurrence driving pressure: ${parsed.occurrence}\n`;
  if (parsed.status) block += `Status: ${parsed.status}\n`;
  
  const desc = lifeCard.description || "";
  if (desc.trim()) {
    block += `\nSocial Relationship History:\n${desc.trim()}\n`;
  }
  
  return block.trim();
}

/** Build the shared, sanitized presence window: each action text stripped of the extension's own
 *  injected directives, joined with the pending action, lowercased. */
export function buildSceneText(actionTexts: string[], pendingText?: string): string {
  const parts = actionTexts.map(t => stripInjectedDirectives(t || ""));
  if (pendingText) parts.push(stripInjectedDirectives(pendingText));
  return parts.join("\n").toLowerCase();
}

/** Roster members (by name) present in the sanitized scene text. */
export function computeInScene(sceneText: string, roster: { name: string; keys: string }[]): string[] {
  return roster.filter(r => isCharacterTriggered(sceneText, r.name, r.keys)).map(r => r.name);
}
