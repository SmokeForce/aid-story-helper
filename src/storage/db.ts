import { openDB, type IDBPDatabase, type DBSchema } from "idb";
import type { CanonicalAction, OpRecord, CardRow, Version, Settings, GlobalAsset } from "../shared/types";

export interface AdventureMeta {
  shortId: string;
  title?: string;
  protagonistName?: string;
  createdAt?: string;
  memory?: string;
  authorsNote?: string;
  instructions?: string;
  lastAnalysisAction?: number;
  aidMemories?: any[];
  lastAutoUpdatedCard?: string;
  activeLocationId?: string;
  locationSuggestions?: { properNoun: string; actionId: string; actionText: string; timestamp: string; status: "pending" | "approved" | "rejected"; askingCharacter?: boolean }[];
  properNounLogs?: { actionId: string; properNoun: string; actionText: string; timestamp: string; isLocation: boolean; isCharacter: boolean; type?: string; linkedCardId?: string; linkedCardTitle?: string }[];
  hidden?: boolean;
}


export interface ActionRow extends CanonicalAction {
  shortId: string;
}

interface AidDB extends DBSchema {
  adventures: { key: string; value: AdventureMeta };
  actions: { key: [string, string]; value: ActionRow; indexes: { "by-shortId": string } };
  operations: { key: string; value: OpRecord };
  cards: { key: [string, string]; value: CardRow; indexes: { "by-shortId": string } };
  versions: { key: string; value: Version; indexes: { "by-shortId": string } };
  settings: { key: string; value: Settings & { _k: string } };
  globalAssets: { key: string; value: GlobalAsset; indexes: { "by-type": string } };
}

let _dbPromise: Promise<IDBPDatabase<AidDB>> | null = null;

export function openAidDb(): Promise<IDBPDatabase<AidDB>> {
  if (_dbPromise) return _dbPromise;
  _dbPromise = openDB<AidDB>("aid-tracker", 4, {
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
    },
  });
  return _dbPromise;
}

/** Test-only: drop the cached connection so a fresh IDBFactory is picked up. */
export function __resetDbForTests(): void {
  _dbPromise = null;
}
