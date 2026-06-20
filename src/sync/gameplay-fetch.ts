import type { RawAction } from "../shared/types";

export interface GqlRequest {
  url: string;
  body: string;
  headers: Record<string, string>;
}

/** Build the batched POST for one GetGameplayAdventure call (returns the full actionWindow). */
export function buildGameplayRequest(
  endpoint: string,
  query: string,
  shortId: string,
  token: string,
  limit: number
): GqlRequest {
  return {
    url: endpoint,
    headers: { "content-type": "application/json", authorization: token },
    body: JSON.stringify([
      { operationName: "GetGameplayAdventure", query, variables: { shortId, limit, desc: true } },
    ]),
  };
}

export interface GameplayParse {
  actions: RawAction[];
  title?: string;
  actionCount?: number;
  storyCards?: Array<{ id: string; type: string; title?: string; keys: string; value: string; description?: string }>;
  memory?: string;
  memoryBankEntries?: any[];
  instructions?: string;
  authorsNote?: string;
}

/** Find the batch element carrying adventure.actionWindow and extract it. */
export function parseGameplayResponse(json: unknown): GameplayParse {
  const items = Array.isArray(json) ? json : [json];
  for (const it of items) {
    const adv = (it as any)?.data?.adventure;
    if (adv && Array.isArray(adv.actionWindow)) {
      const rawAN = adv.authorsNote ?? adv.state?.authorsNote ?? adv.gameState?.authorsNote;
      const authorsNote = typeof rawAN === "string" ? rawAN : undefined;

      const stateInst = adv.state?.instructions;
      const gameStateInst = adv.gameState?.instructions;
      let instructions: string | undefined = undefined;
      if (typeof stateInst === "string") {
        instructions = stateInst;
      } else if (typeof stateInst?.custom === "string") {
        instructions = stateInst.custom;
      } else if (typeof gameStateInst === "string") {
        instructions = gameStateInst;
      } else if (typeof gameStateInst?.custom === "string") {
        instructions = gameStateInst.custom;
      }

      return {
        actions: adv.actionWindow as RawAction[],
        title: adv.title,
        actionCount: adv.actionCount,
        storyCards: Array.isArray(adv.storyCards) ? adv.storyCards : undefined,
        memory: typeof adv.memory === "string" ? adv.memory : undefined,
        memoryBankEntries: Array.isArray(adv.state?.memories)
          ? adv.state.memories.map((m: any) => typeof m === "string" ? { actionIds: [], text: m } : m)
          : (Array.isArray(adv.gameState?.memories)
            ? adv.gameState.memories.map((m: any) => typeof m === "string" ? { actionIds: [], text: m } : m)
            : undefined),
        instructions,
        authorsNote,
      };
    }
  }
  return { actions: [] };
}
