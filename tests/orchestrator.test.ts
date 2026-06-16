import { describe, it, expect } from "vitest";
import { reduceActionUpdate } from "../src/background/orchestrator";
import type { CanonicalAction } from "../src/shared/types";

describe("reduceActionUpdate", () => {
  it("produces the next canonical list from current + payload", () => {
    const current: CanonicalAction[] = [{ id: "1", text: "a", type: "do" }];
    const next = reduceActionUpdate(current, {
      type: "action", adventureId: "Z", retriedActionId: null, cachedOutputs: [],
      actions: [{ id: "2", text: "b", type: "continue", undoneAt: null, deletedAt: null }],
    });
    expect(next.map((a) => a.id)).toEqual(["1", "2"]);
  });
});
