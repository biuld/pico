import { expect, test } from "bun:test";
import { normalizeNotification, isCodexEvent } from "../../../src/codex/app-server/notifications";

test("normalizeNotification maps item/agentMessage/delta to assistant.delta", () => {
  const event = normalizeNotification({
    method: "item/agentMessage/delta",
    params: { threadId: "t1", turnId: "turn-1", delta: "hello" },
  });

  expect(event.type).toBe("assistant.delta");
  if (event.type === "assistant.delta") {
    expect(event.threadId).toBe("t1");
    expect(event.turnId).toBe("turn-1");
    expect(event.delta).toBe("hello");
  }
});

test("normalizeNotification maps item/completed to item.completed", () => {
  const event = normalizeNotification({
    method: "item/completed",
    params: {
      threadId: "t1",
      item: { type: "agentMessage", id: "a1", text: "reply", phase: null, memoryCitation: null },
    },
  });

  expect(event.type).toBe("item.completed");
  if (event.type === "item.completed") {
    expect(event.threadId).toBe("t1");
    expect(event.item).toBeDefined();
  }
});

test("normalizeNotification returns unknown for malformed item/completed", () => {
  const event = normalizeNotification({
    method: "item/completed",
    params: { threadId: "t1" },  // missing item
  });

  expect(event.type).toBe("unknown");
  if (event.type === "unknown") {
    expect(event.method).toBe("item/completed");
  }
});

test("normalizeNotification maps turn/completed", () => {
  const event = normalizeNotification({
    method: "turn/completed",
    params: { threadId: "t1", turnId: "turn-1" },
  });

  expect(event.type).toBe("turn.completed");
  if (event.type === "turn.completed") {
    expect(event.threadId).toBe("t1");
    expect(event.turnId).toBe("turn-1");
  }
});

test("normalizeNotification maps error", () => {
  const event = normalizeNotification({
    method: "error",
    params: { message: "something went wrong" },
  });

  expect(event.type).toBe("error");
  if (event.type === "error") {
    expect(event.message).toBe("something went wrong");
    expect(event.willRetry).toBe(false);
  }
});

test("normalizeNotification maps warning", () => {
  const event = normalizeNotification({
    method: "warning",
    params: { message: "rate limit approaching" },
  });

  expect(event.type).toBe("warning");
  if (event.type === "warning") {
    expect(event.message).toBe("rate limit approaching");
  }
});

test("normalizeNotification maps unknown method to unknown event", () => {
  const event = normalizeNotification({
    method: "some/future/method",
    params: { key: "value" },
  });

  expect(event.type).toBe("unknown");
  if (event.type === "unknown") {
    expect(event.method).toBe("some/future/method");
  }
});

test("isCodexEvent narrows event type", () => {
  const event = normalizeNotification({
    method: "turn/completed",
    params: { threadId: "t1", turnId: "turn-1" },
  });

  if (isCodexEvent(event, "turn.completed")) {
    expect(event.turnId).toBe("turn-1"); // type-narrowed
  } else {
    throw new Error("expected turn.completed");
  }
});

test("normalizeNotification handles snake_case params", () => {
  const event = normalizeNotification({
    method: "item/agentMessage/delta",
    params: { thread_id: "t2", turn_id: "turn-2", delta: "snake" },
  });

  expect(event.type).toBe("assistant.delta");
  if (event.type === "assistant.delta") {
    expect(event.threadId).toBe("t2");
    expect(event.turnId).toBe("turn-2");
    expect(event.delta).toBe("snake");
  }
});
