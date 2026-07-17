import { openDB, type IDBPDatabase, type DBSchema } from "idb";
import type { CanonicalAction, OpRecord, CardRow, Version, Settings, GlobalAsset, LivingConfig, PendingProperNoun } from "../shared/types";

export interface AdventureMeta {
  shortId: string;
  title?: string;
  protagonistName?: string;
  createdAt?: string;
  memory?: string;
  authorsNote?: string;
  instructions?: string;
  lastAnalysisAction?: number;
  memoryBankEntries?: any[];
  lastAutoUpdatedCard?: string;
  activeLocationId?: string;
  locationSuggestions?: { properNoun: string; actionId: string; actionText: string; timestamp: string; status: "pending" | "approved" | "rejected"; askingCharacter?: boolean }[];
  properNounLogs?: { actionId: string; properNoun: string; actionText: string; timestamp: string; isLocation: boolean; isCharacter: boolean; type?: string; linkedCardId?: string; linkedCardTitle?: string }[];
  properNounPending?: Record<string, PendingProperNoun>; // evidence pool: candidates awaiting G5 repeat-mention (+ G1 cap evidence for single words) before becoming suggestions
  hidden?: boolean;
  // ── Living Characters simulation bookkeeping (per-adventure) ──
  lcLastSeedTurn?: number;
  lcSeedCount?: number;
  lcDormantSince?: Record<string, number>; // cardId -> turn the pressure first went dormant (for dormancy-timeout archival)
  lcLastEventTurn?: Record<string, number>; // cardId -> turn of the pressure's last meaningful occurrence (staleness clock → fade)
  lcSeededTurn?: Record<string, number>; // cardId -> immutable turn the pressure was seeded (hard lifetime cap; never reset on activity)
  ccDriftPending?: Record<string, string>; // character name -> card field the drift judge says has durably shifted (consumed by runPendingDriftRevisions)
  lcArchived?: string[]; // Life Card ids deliberately archived/resolved; kept soft-deleted even if the server still lists them
  userDeletedCards?: { id: string; title: string }[]; // cards the USER deleted (native or panel); kept soft-deleted against the per-turn savestate putCards, and their titles suppress auto-recreation
  lcResolvedAt?: Record<string, number>; // owner (lowercased) -> turn its last pressure resolved/archived (reseed cooldown)
  memoraidCharacters?: string[]; // per-adventure MemorAID important-characters list (replaces the Configure MemorAID card)
  memoraidOffstageCooldown?: Record<string, number>; // character title (lowercased) -> turn until which MemorAID thought generation is suppressed (offstage/mentioned-not-present)
  livingConfig?: LivingConfig; // per-adventure Living Characters simulation config (replaces global livingCharacters* settings)
  crystallizedInterval?: number;
  crystallizedEntryMaxChars?: number;
  crystallizedNodeCap?: number;
  crystallizedKnowsCap?: number;    // per-adventure override; effective = adv ?? settings ?? 2
  crystallizedRecallsCap?: number;  // per-adventure override; effective = adv ?? settings ?? 2
  crystallizedVividCap?: number;    // per-adventure override; effective = adv ?? settings ?? 4
  crystallizedOutlookCap?: number;  // per-adventure override; effective = adv ?? settings ?? 2
  crystallizedPreferencesCap?: number; // per-adventure override; effective = adv ?? settings ?? 4
  crystallizedNpcMemoryCap?: number; // per-adventure override; effective = adv ?? settings ?? 400
  lastDistilledThrough?: Record<string, number>;
  pendingInjections?: import("../inference/injection").PendingInjection[]; // Living Characters directives held from a Continue/retry for the next injectable action (structured, so stale ones can be dropped). Legacy string[] coerced on read.
}


export interface ActionRow extends CanonicalAction {
  shortId: string;
}

export interface VividMemoryLogEntry {
  id: string;                     // crypto.randomUUID()
  shortId: string;                // adventure
  character: string;              // canonical character name (e.g. "Evie")
  characterKey: string;           // character.toLowerCase() for stable lookup
  nodeId: string;                 // id assigned by reconcile, e.g. "05_Walking"
  snapshot: string;               // the vivid-memory text
  createdTurn: number;            // window.end at distillation time (approx action index)
  createdAt: string;              // ISO timestamp
}

export interface InjectionLogEntry {
  id: string;                       // uuid
  shortId: string;                  // adventure
  turn: number;                     // turn the injection rode on
  provider: string;                 // "living-characters"
  directiveText: string;            // the exact appended string
  meta?: Record<string, unknown>;   // { owner, target, pressure, momentum }
  createdAt: string;                // ISO
}

/** Forensic, append-only record of a Crystallized Vivid/Knows/Outlook item that vanished during
 *  automatic distillation (dropped from the nodes full-list rewrite, overwritten in-place by the
 *  schema pass, or decayed to 0 strength). */
export interface CrystallizedArchiveEntry {
  id: string;                            // crypto.randomUUID()
  shortId: string;                       // adventure
  characterKey: string;                  // character.toLowerCase(), stable lookup
  kind: "vivid" | "knows" | "outlook" | "preferences";
  subject?: string;                      // Knows subject (kind === "knows" only)
  text: string;                          // the vanished text
  turn: number;                          // window.end at distillation time
  archivedAt: string;                    // ISO timestamp
  reason?: "decay" | "incorporated";     // absent ⇒ "decay" (automatic-distillation writers); "incorporated" = folded into the character card
}

/** A single NPC point-of-view memory block, distilled from one of the adventure's native memory
 *  blocks and stored per-NPC in our DB. The deep, queryable well behind scene-aware Recalls.
 *  Upserted by [shortId, characterKey, blockId]; blockId derives from the source memory block. */
export interface NpcMemoryBlock {
  shortId: string;
  characterKey: string;                  // owner NPC name, lowercased
  blockId: string;                       // derived from the source memory block id — the upsert key
  sourceAnchor: { actionId?: string; actionIds: string[] };
  povText: string;                       // NPC point-of-view summary (LLM prose)
  entities: string[];                    // people/places involved (lowercased, canonicalized against Knows subjects)
  keywords: string[];                    // salient non-entity terms (lowercased)
  turnStart: number;
  turnEnd: number;
  salience?: number;                     // optional weight (reserved; retrieval tiebreak)
  createdAt: string;                     // ISO
}

interface AidDB extends DBSchema {
  adventures: { key: string; value: AdventureMeta };
  actions: { key: [string, string]; value: ActionRow; indexes: { "by-shortId": string } };
  operations: { key: string; value: OpRecord };
  cards: { key: [string, string]; value: CardRow; indexes: { "by-shortId": string } };
  versions: { key: string; value: Version; indexes: { "by-shortId": string } };
  settings: { key: string; value: Settings & { _k: string } };
  globalAssets: { key: string; value: GlobalAsset; indexes: { "by-type": string } };
  crystallizedLog: {
    key: string;
    value: VividMemoryLogEntry;
    indexes: { "by-shortId": string; "by-char": [string, string] };
  };
  injectionLog: {
    key: string;
    value: InjectionLogEntry;
    indexes: { "by-shortId": string };
  };
  crystallizedState: {
    key: [string, string];
    value: { shortId: string; characterKey: string; state: import("../inference/crystallized").CrystallizedState };
    indexes: { "by-shortId": string };
  };
  crystallizedArchive: {
    key: string;
    value: CrystallizedArchiveEntry;
    indexes: { "by-shortId": string };
  };
  phenotype: {
    key: [string, string];
    value: import("../inference/phenotype/types").PhenotypeRecord;
    indexes: { "by-shortId": string };
  };
  npcMemoryBank: {
    key: [string, string, string];
    value: NpcMemoryBlock;
    indexes: { "by-shortId": string; "by-char": [string, string] };
  };
}

let _dbPromise: Promise<IDBPDatabase<AidDB>> | null = null;

export function openAidDb(): Promise<IDBPDatabase<AidDB>> {
  if (_dbPromise) return _dbPromise;
  _dbPromise = openDB<AidDB>("aid-tracker", 10, {
    async upgrade(db, oldVersion, _newVersion, tx) {
      if (!db.objectStoreNames.contains("adventures")) {
        db.createObjectStore("adventures", { keyPath: "shortId" });
      }
      if (!db.objectStoreNames.contains("actions")) {
        const store = db.createObjectStore("actions", { keyPath: ["shortId", "id"] });
        store.createIndex("by-shortId", "shortId");
      }
      if (!db.objectStoreNames.contains("operations")) {
        db.createObjectStore("operations", { keyPath: "operationName" });
      }
      if (oldVersion < 2 && (db as any).objectStoreNames.contains("narrative")) {
        const narrative = await (tx as any).objectStore("narrative").getAll();
        const actions = tx.objectStore("actions");
        for (const rec of narrative as Array<{ shortId: string; actions: CanonicalAction[] }>) {
          for (const a of rec.actions ?? []) await actions.put({ ...a, shortId: rec.shortId });
        }
        (db as any).deleteObjectStore("narrative");
      }
      if (!db.objectStoreNames.contains("cards")) { const s = db.createObjectStore("cards", { keyPath: ["shortId", "id"] }); s.createIndex("by-shortId", "shortId"); }
      if (!db.objectStoreNames.contains("versions")) { const s = db.createObjectStore("versions", { keyPath: "id" }); s.createIndex("by-shortId", "shortId"); }
      if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "_k" });
      if (!db.objectStoreNames.contains("globalAssets")) {
        const s = db.createObjectStore("globalAssets", { keyPath: "id" });
        s.createIndex("by-type", "type");
      }
      if (!db.objectStoreNames.contains("crystallizedLog")) {
        const s = db.createObjectStore("crystallizedLog", { keyPath: "id" });
        s.createIndex("by-shortId", "shortId");
        s.createIndex("by-char", ["shortId", "characterKey"]);
      }
      if (!db.objectStoreNames.contains("injectionLog")) {
        const s = db.createObjectStore("injectionLog", { keyPath: "id" });
        s.createIndex("by-shortId", "shortId");
      }
      if (!db.objectStoreNames.contains("crystallizedState")) {
        const s = db.createObjectStore("crystallizedState", { keyPath: ["shortId", "characterKey"] });
        s.createIndex("by-shortId", "shortId");
      }
      if (!db.objectStoreNames.contains("crystallizedArchive")) {
        const s = db.createObjectStore("crystallizedArchive", { keyPath: "id" });
        s.createIndex("by-shortId", "shortId");
      }
      if (!db.objectStoreNames.contains("phenotype")) {
        const s = db.createObjectStore("phenotype", { keyPath: ["shortId", "characterKey"] });
        s.createIndex("by-shortId", "shortId");
      }
      if (!db.objectStoreNames.contains("npcMemoryBank")) {
        const s = db.createObjectStore("npcMemoryBank", { keyPath: ["shortId", "characterKey", "blockId"] });
        s.createIndex("by-shortId", "shortId");
        s.createIndex("by-char", ["shortId", "characterKey"]);
      }
    },
  });
  return _dbPromise;
}

/** Test-only: drop the cached connection so a fresh IDBFactory is picked up. */
export function __resetDbForTests(): void {
  _dbPromise = null;
}
