import { type CardRow } from "../shared/types";

export interface GqlMutationRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

/**
 * Build a batched GraphQL mutation request (the shape AI Dungeon's client uses) for replaying a
 * learned write operation. Source-agnostic: the caller supplies the learned `query`, the
 * `operationName`, and the `variables` it constructed for that operation.
 */
export interface GqlOperation {
  operationName: string;
  query: string;
  variables: unknown;
}

/**
 * Build a batched GraphQL mutation request (the shape AI Dungeon's client uses) for replaying a
 * learned write operation. Source-agnostic: the caller supplies the learned `query`, the
 * `operationName`, and the `variables` it constructed for that operation, OR an array of operations.
 */
export function buildGraphQLMutation(
  endpoint: string,
  queryOrOps: string | GqlOperation[],
  token: string,
  operationName?: string,
  variables?: unknown
): GqlMutationRequest {
  const ops = Array.isArray(queryOrOps)
    ? queryOrOps
    : [{ operationName: operationName!, query: queryOrOps, variables }];
  return {
    url: endpoint,
    headers: { "content-type": "application/json", authorization: token },
    body: JSON.stringify(ops),
  };
}

/**
 * Build a batched mutation request for UseAutoSaveStoryCard.
 */
export function buildCardSave(
  endpoint: string,
  query: string,
  token: string,
  card: CardRow,
  newValue: string
): GqlMutationRequest {
  return buildGraphQLMutation(endpoint, query, token, "UseAutoSaveStoryCard", {
    input: {
      id: card.id,
      type: card.type,
      title: card.title || "",
      description: card.description || "",
      keys: card.keys,
      value: newValue,
      shortId: card.shortId,
      contentType: "adventure",
      useForCharacterCreation: false,
    },
  });
}

/**
 * Build a batched mutation request for SaveQueueStoryCard.
 */
export function buildCardCreate(
  endpoint: string,
  query: string,
  token: string,
  card: CardRow,
  newValue: string
): GqlMutationRequest {
  return buildGraphQLMutation(endpoint, query, token, "SaveQueueStoryCard", {
    input: {
      id: card.id,
      type: card.type,
      title: card.title || "",
      description: card.description || "",
      keys: card.keys,
      value: newValue,
      shortId: card.shortId,
      contentType: "adventure",
      useForCharacterCreation: false,
    },
  });
}


/**
 * Build a batched mutation request for UpdateAdventurePlot.
 */
export function buildMemorySave(
  endpoint: string,
  query: string,
  token: string,
  shortId: string,
  newMemory: string,
  authorsNote: string = ""
): GqlMutationRequest {
  return buildGraphQLMutation(endpoint, query, token, "UpdateAdventurePlot", {
    input: {
      shortId,
      thirdPerson: false,
      memory: newMemory,
      authorsNote,
    },
  });
}

/**
 * Build a batched mutation request for UpdateAdventureState.
 */
export function buildUpdateAdventureState(
  endpoint: string,
  query: string,
  token: string,
  shortId: string,
  instructionsCustomText: string,
  storySummaryText: string = "",
  storyCardStoryInformation: string = "",
  storyCardInstructions: string = ""
): GqlMutationRequest {
  return buildGraphQLMutation(endpoint, query, token, "UpdateAdventureState", {
    input: {
      shortId,
      state: {
        instructions: {
          scenario: "",
          type: "custom",
          custom: instructionsCustomText
        },
        storySummary: storySummaryText,
        storyCardStoryInformation,
        storyCardInstructions
      }
    }
  });
}

/**
 * Build a batched mutation request for EditMemory.
 */
export function buildEditMemory(
  endpoint: string,
  query: string,
  token: string,
  adventureId: string,
  actionId: string,
  text: string
): GqlMutationRequest {
  return buildGraphQLMutation(endpoint, query, token, "EditMemory", {
    input: {
      adventureId,
      actionId,
      text,
    },
  });
}

/** AID adventure AI-Instructions (AIN) state. `type` selects which text is in effect:
 *  "model" (built-in default), "scenario" (scenario author's default), or "custom" (user text). */
export interface AdventureInstructions {
  type?: string;
  scenario?: string;
  custom?: string;
  model?: string;
}

/**
 * The AIN text currently IN EFFECT for the adventure, given its `type`. When the adventure is on a
 * default (Model/Scenario) rather than Custom, the active text lives in `scenario`/`model`, NOT
 * `custom` (which is empty/stale). Callers converting the adventure to Custom (e.g. an OffMeta AIN
 * import) must seed the new custom value with THIS text so the previously-effective default isn't
 * silently dropped. Unknown/missing type falls back to `custom`.
 */
export function effectiveAIN(instructions: AdventureInstructions | null | undefined): string {
  const i = instructions || {};
  const type = String(i.type || "").toLowerCase();
  if (type === "scenario") return i.scenario || "";
  if (type === "model") return i.model || "";
  return i.custom || "";
}

/**
 * Build a batched mutation request for UseDeleteStoryCard.
 */
export function buildCardDelete(
  endpoint: string,
  query: string,
  token: string,
  cardId: string,
  shortId: string
): GqlMutationRequest {
  // AID's DeleteStoryCardInput requires `id`, `shortId` AND `contentType` (all String!); omitting any
  // is rejected server-side ("Field \"<x>\" of required type \"String!\" was not provided.").
  return buildGraphQLMutation(endpoint, query, token, "UseDeleteStoryCard", {
    input: {
      id: cardId,
      shortId,
      contentType: "adventure"
    }
  });
}

export const DEFAULT_GQL_QUERIES = {
  SaveQueueStoryCard: `
    mutation SaveQueueStoryCard($input: UpdateStoryCardInput!) {
      updateStoryCard(input: $input) {
        success
        message
        storyCard {
          id
          type
          title
          description
          keys
          value
          useForCharacterCreation
          updatedAt
          __typename
        }
        __typename
      }
    }
  `,
  UseAutoSaveStoryCard: `
    mutation UseAutoSaveStoryCard($input: UpdateStoryCardInput!) {
      updateStoryCard(input: $input) {
        success
        message
        storyCard {
          id
          type
          title
          description
          keys
          value
          useForCharacterCreation
          updatedAt
          __typename
        }
        __typename
      }
    }
  `,
  EditMemory: `
    mutation EditMemory($input: EditMemoryInput!) {
      editMemory(input: $input) {
        success
        message
        __typename
      }
    }
  `,
  UpdateAdventurePlot: `
    mutation UpdateAdventurePlot($input: UpdateAdventureInput!) {
      updateAdventurePlot(input: $input) {
        success
        message
        adventure {
          id
          memory
          authorsNote
          __typename
        }
        __typename
      }
    }
  `,
  UpdateAdventureState: `
    mutation UpdateAdventureState($input: AdventureStateInput) {
      updateAdventureState(input: $input) {
        adventure {
          id
          state {
            instructions
            storySummary
            storyCardStoryInformation
            storyCardInstructions
            __typename
          }
          editedAt
          __typename
        }
        message
        success
        __typename
      }
    }
  `,
  UseDeleteStoryCard: `
    mutation UseDeleteStoryCard($input: DeleteStoryCardInput!) {
      deleteStoryCard(input: $input) {
        success
        message
        storyCard {
          id
          deletedAt
          __typename
        }
        __typename
      }
    }
  `
};



