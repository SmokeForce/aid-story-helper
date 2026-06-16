import type { GqlOp } from "./types";

function isOp(v: unknown): v is GqlOp {
  return !!v && typeof v === "object" && "query" in (v as object) && typeof (v as any).query === "string";
}

/** Normalize a fetch GraphQL body (object | array | parsed) into a flat GqlOp[]. */
export function extractOps(body: unknown): GqlOp[] {
  let parsed = body;
  if (typeof body === "string") {
    try {
      parsed = JSON.parse(body);
    } catch {
      return [];
    }
  }
  const arr = Array.isArray(parsed) ? parsed : [parsed];
  return arr
    .filter(isOp)
    .map((o) => ({
      operationName: o.operationName ?? null,
      query: o.query,
      variables: o.variables,
    }))
    .filter((o) => o.operationName !== "GenerateStoryCard");
}
