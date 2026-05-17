import { expect, test } from "bun:test";
import { normalizeNotification, normalizeServerRequest, isCodexEvent } from "../../../src/codex/app-server/notifications";

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

// ── normalizeServerRequest ──

test("normalizeServerRequest maps server request to approval.requested", () => {
  const event = normalizeServerRequest({
    id: 1,
    method: "item/permissions/requestApproval",
    params: { reason: "needs file access", command: "cat file.txt", cwd: "/app" },
  });

  expect(event.type).toBe("approval.requested");
  expect(event.request.id).toBe(1);
  expect(event.method).toBe("item/permissions/requestApproval");
  expect(event.reason).toBe("needs file access");
  expect(event.command).toBe("cat file.txt");
  expect(event.cwd).toBe("/app");
});

test("normalizeServerRequest handles missing params gracefully", () => {
  const event = normalizeServerRequest({
    id: 2,
    method: "item/permissions/requestApproval",
    params: {},
  });

  expect(event.type).toBe("approval.requested");
  expect(event.reason).toBeUndefined();
  expect(event.command).toBeUndefined();
  expect(event.cwd).toBeUndefined();
});

// ── Live streaming event normalization ──

test("normalizeNotification maps item/reasoningText/delta", () => {
  const event = normalizeNotification({
    method: "item/reasoningText/delta",
    params: { threadId: "t1", turnId: "turn-1", delta: "thinking..." },
  });

  expect(event.type).toBe("reasoning.delta");
  if (event.type === "reasoning.delta") {
    expect(event.delta).toBe("thinking...");
  }
});

test("normalizeNotification maps item/commandExecution/outputDelta", () => {
  const event = normalizeNotification({
    method: "item/commandExecution/outputDelta",
    params: { threadId: "t1", turnId: "turn-1", itemId: "cmd-1", delta: "file.txt\n" },
  });

  expect(event.type).toBe("command.output.delta");
  if (event.type === "command.output.delta") {
    expect(event.delta).toBe("file.txt\n");
    expect(event.itemId).toBe("cmd-1");
  }
});

test("normalizeNotification maps item/fileChange/patchUpdated with changes[]", () => {
  const event = normalizeNotification({
    method: "item/fileChange/patchUpdated",
    params: {
      threadId: "t1",
      turnId: "turn-1",
      itemId: "fc-1",
      changes: [
        { path: "a.ts", kind: { type: "update", move_path: null }, diff: "-old\n+new" },
        { path: "b.ts", kind: { type: "add" }, diff: "+added" },
      ],
    },
  });

  expect(event.type).toBe("file.change.delta");
  if (event.type === "file.change.delta") {
    expect(event.changes).toHaveLength(2);
    expect(event.changes[0].path).toBe("a.ts");
    expect(event.changes[1].path).toBe("b.ts");
  }
});

test("normalizeNotification maps deprecated item/fileChange/outputDelta to unknown", () => {
  const event = normalizeNotification({
    method: "item/fileChange/outputDelta",
    params: { threadId: "t1", turnId: "turn-1", itemId: "fc-1", delta: "patch applied" },
  });

  expect(event.type).toBe("unknown");
  if (event.type === "unknown") {
    expect(event.method).toBe("item/fileChange/outputDelta");
  }
});

test("normalizeNotification maps turn/planUpdated", () => {
  const event = normalizeNotification({
    method: "turn/planUpdated",
    params: {
      threadId: "t1",
      turnId: "turn-1",
      explanation: "need to read and patch",
      plan: [
        { step: "Read config", status: "completed" },
        { step: "Patch file", status: "inProgress" },
        { step: "Run tests", status: "pending" },
      ],
    },
  });

  expect(event.type).toBe("plan.updated");
  if (event.type === "plan.updated") {
    expect(event.plan).toHaveLength(3);
    expect(event.plan[0]).toMatchObject({ step: "Read config", status: "completed" });
    expect(event.plan[1].status).toBe("inProgress");
    expect(event.explanation).toBe("need to read and patch");
  }
});

test("normalizeNotification maps turn/planUpdated with empty plan and null explanation", () => {
  const event = normalizeNotification({
    method: "turn/planUpdated",
    params: { threadId: "t1", turnId: "turn-1", explanation: null, plan: [] },
  });

  expect(event.type).toBe("plan.updated");
  if (event.type === "plan.updated") {
    expect(event.plan).toHaveLength(0);
    expect(event.explanation).toBeNull();
  }
});
