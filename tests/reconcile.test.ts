import { describe, it, expect } from "vitest";
import { applyActionUpdate, findDivergenceIndex, diffActionUpdate } from "../src/sync/reconcile";
import type { CanonicalAction, ActionUpdatePayload } from "../src/shared/types";

const mk = (id: string, text: string, type = "do", extra = {}): any => ({
  id, text, type, undoneAt: null, deletedAt: null, ...extra,
});
const payload = (actions: any[], over: Partial<ActionUpdatePayload> = {}): ActionUpdatePayload => ({
  type: "action", adventureId: "Z", retriedActionId: null, cachedOutputs: [], actions, ...over,
});

describe("applyActionUpdate", () => {
  it("appends new actions in order", () => {
    const out = applyActionUpdate([], payload([mk("1", "a"), mk("2", "b")]));
    expect(out.map((a) => a.id)).toEqual(["1", "2"]);
    expect(out.map((a) => a.text)).toEqual(["a", "b"]);
  });

  it("upserts: edited text replaces existing by id, keeping position", () => {
    const cur: CanonicalAction[] = [{ id: "1", text: "a", type: "do" }, { id: "2", text: "b", type: "do" }];
    const out = applyActionUpdate(cur, payload([mk("1", "EDITED")]));
    expect(out).toEqual([{ id: "1", text: "EDITED", type: "do" }, { id: "2", text: "b", type: "do" }]);
  });

  it("removes actions marked undoneAt", () => {
    const cur: CanonicalAction[] = [{ id: "1", text: "a", type: "do" }, { id: "2", text: "b", type: "do" }];
    const out = applyActionUpdate(cur, payload([mk("2", "b", "do", { undoneAt: "2026-01-01T00:00:00Z" })]));
    expect(out.map((a) => a.id)).toEqual(["1"]);
  });

  it("removes actions marked deletedAt", () => {
    const cur: CanonicalAction[] = [{ id: "1", text: "a", type: "do" }];
    const out = applyActionUpdate(cur, payload([mk("1", "a", "do", { deletedAt: "2026-01-01T00:00:00Z" })]));
    expect(out).toEqual([]);
  });
});

describe("diffActionUpdate", () => {
  const payload = (actions: any[]) => ({ type: "a", adventureId: "Z", retriedActionId: null, cachedOutputs: [], actions });
  it("separates live upserts from undone/deleted removeIds", () => {
    const d = diffActionUpdate(payload([
      { id: "1", text: "a", type: "do", undoneAt: null, deletedAt: null },
      { id: "2", text: "b", type: "do", undoneAt: "2026-01-01T00:00:00Z", deletedAt: null },
      { id: "3", text: "c", type: "do", undoneAt: null, deletedAt: "2026-01-01T00:00:00Z" },
    ]));
    expect(d.upserts.map((a) => a.id)).toEqual(["1"]);
    expect(d.removeIds).toEqual(["2", "3"]);
  });
});

describe("findDivergenceIndex", () => {
  it("returns -1 when the remote tail matches the local tail", () => {
    const local: CanonicalAction[] = [{ id: "1", text: "a", type: "do" }, { id: "2", text: "b", type: "do" }];
    const remote = [mk("1", "a"), mk("2", "b")];
    expect(findDivergenceIndex(local, remote)).toBe(-1);
  });

  it("returns the index of the first action whose text or id differs", () => {
    const local: CanonicalAction[] = [{ id: "1", text: "a", type: "do" }, { id: "2", text: "b", type: "do" }];
    const remote = [mk("1", "a"), mk("2", "CHANGED")];
    expect(findDivergenceIndex(local, remote)).toBe(1);
  });
});
