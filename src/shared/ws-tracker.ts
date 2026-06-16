export interface ResolvedWsEvent {
  operationName: string;
  shortId?: string;
  data: unknown;
}

/** Correlates graphql-ws `subscribe` ids to operationNames, resolving `next` frames. */
export class WsTracker {
  private ids = new Map<string, { operationName: string; shortId?: string }>(); // subscribe id -> { operationName, shortId }

  /** Feed a raw WS message string (sent or received). Returns a resolved data event or null. */
  handle(raw: string): ResolvedWsEvent | null {
    let frame: any;
    try {
      frame = JSON.parse(raw);
    } catch {
      return null;
    }
    if (!frame || typeof frame !== "object") return null;

    switch (frame.type) {
      case "subscribe": {
        const op = frame?.payload?.operationName;
        const vars = frame?.payload?.variables || {};
        const shortId = vars.shortId || vars.input?.shortId || vars.adventureId || vars.input?.adventureId;
        if (typeof frame.id === "string" && typeof op === "string") {
          this.ids.set(frame.id, {
            operationName: op,
            shortId: shortId ? String(shortId) : undefined
          });
        }
        return null;
      }
      case "next": {
        const entry = typeof frame.id === "string" ? this.ids.get(frame.id) : undefined;
        if (!entry) return null;
        return {
          operationName: entry.operationName,
          shortId: entry.shortId,
          data: frame?.payload?.data
        };
      }
      case "complete": {
        if (typeof frame.id === "string") this.ids.delete(frame.id);
        return null;
      }
      default:
        return null; // connection_init / connection_ack / ping / pong
    }
  }
}

