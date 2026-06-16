import { describe, it, expect } from "vitest";
import { WsTracker } from "../src/shared/ws-tracker";
import * as F from "./fixtures/frames";

describe("WsTracker", () => {
  it("ignores connection_ack and frames before a subscribe is seen", () => {
    const t = new WsTracker();
    expect(t.handle(F.connectionAck)).toBeNull();
  });

  it("resolves a next frame to its operationName via the matching subscribe id", () => {
    const t = new WsTracker();
    t.handle(F.subscribeActionUpdates);
    const ev = t.handle(F.nextActionUpdates);
    expect(ev).not.toBeNull();
    expect(ev!.operationName).toBe("ActionUpdates");
    expect(ev!.shortId).toBe("ZA93QDeU6633");
    expect((ev!.data as any).actionUpdates.actions).toHaveLength(2);
  });

  it("returns null for a next frame whose id was never subscribed", () => {
    const t = new WsTracker();
    expect(t.handle(F.nextActionUpdates)).toBeNull();
  });

  it("forgets the id after complete", () => {
    const t = new WsTracker();
    t.handle(F.subscribeActionUpdates);
    t.handle(F.completeFrame);
    expect(t.handle(F.nextActionUpdates)).toBeNull();
  });
});
