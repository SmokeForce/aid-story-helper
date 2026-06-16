export const connectionAck = JSON.stringify({ type: "connection_ack" });

export const subscribeActionUpdates = JSON.stringify({
  id: "sub1",
  type: "subscribe",
  payload: {
    operationName: "ActionUpdates",
    query: "subscription ActionUpdates($shortId: String!) { actionUpdates(shortId: $shortId) { type actions { id text type undoneAt deletedAt } } }",
    variables: { shortId: "ZA93QDeU6633" },
  },
});

export const nextActionUpdates = JSON.stringify({
  id: "sub1",
  type: "next",
  payload: {
    data: {
      actionUpdates: {
        type: "action",
        adventureId: "ZA93QDeU6633",
        retriedActionId: null,
        cachedOutputs: [],
        actions: [
          { id: "10", text: "You open the door.", type: "do", undoneAt: null, deletedAt: null },
          { id: "11", text: "The room is dark.", type: "continue", undoneAt: null, deletedAt: null },
        ],
      },
    },
  },
});

export const completeFrame = JSON.stringify({ id: "sub1", type: "complete" });
