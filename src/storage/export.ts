import type { Repo } from "./repo";
import type { CanonicalAction, CardRow, Version } from "../shared/types";
import type { AdventureMeta } from "./db";

export interface AdventureExport {
  schema: "aid-tracker/export@1";
  exportedAt: string;
  adventure: AdventureMeta;
  actions: CanonicalAction[];
  cards: CardRow[];
  versions: Version[];
}

export async function exportAdventure(repo: Repo, shortId: string): Promise<AdventureExport> {
  const adventure = (await repo.getAdventure(shortId)) ?? { shortId };
  const actions = await repo.getActions(shortId);
  const cards = await repo.getCards(shortId);
  const versions = await repo.getVersions(shortId);
  return {
    schema: "aid-tracker/export@1",
    exportedAt: new Date().toISOString(),
    adventure,
    actions,
    cards,
    versions,
  };
}
