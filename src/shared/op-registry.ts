import type { GqlOp, OpRecord } from "./types";

/** Derive a storable OpRecord from an observed GraphQL op, or null if unusable. */
export function recordOp(op: GqlOp): OpRecord | null {
  if (!op.operationName || op.operationName === "GenerateStoryCard") return null;
  const kind: OpRecord["kind"] = /^\s*mutation\b/.test(op.query) ? "write" : "read";
  return {
    operationName: op.operationName,
    query: op.query,
    variableKeys: Object.keys(op.variables ?? {}),
    kind,
    learnedAt: new Date().toISOString(),
  };
}
