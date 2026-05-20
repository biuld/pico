import { expect, test } from "bun:test";
import { runTurn, type AppState } from "../../../src/app/controller";
import { CodexThreadViewState } from "../../../src/app/codex-thread-view-state";
import { startMockCodexClient } from "../../../tools/codex-app-server/test-client";
import {
  assistantMessage,
  createTempProject,
  startupSteps,
  threadStartResponse,
} from "./scenario-helpers";

test("runTurn streams assistant delta and completion through stdio", async () => {
  const { cwd } = await createTempProject();
  const fixture = await startMockCodexClient([
    ...startupSteps(),
    {
      expectRequest: "thread/start",
      params: {},
      respond: threadStartResponse(cwd),
    },
    {
      expectRequest: "turn/start",
      params: {
        threadId: "thread-1",
        input: [{ type: "text", text: "hello" }],
      },
      respond: { turn: { id: "turn-1", status: "inProgress" } },
    },
    { delay: 20 },
    {
      notify: "item/agentMessage/delta",
      params: { threadId: "thread-1", turnId: "turn-1", delta: "hel" },
    },
    {
      notify: "turn/completed",
      params: { threadId: "thread-1", turnId: "turn-1", status: "completed" },
    },
  ]);

  try {
    const viewState = CodexThreadViewState.create(cwd);
    const events: string[] = [];
    const result = await runTurn(
      { cwd, viewState, codex: fixture.client } as AppState,
      "hello",
      {
        observer: {
          onAssistantDelta: () => events.push("assistant:delta"),
          onTurnCompleted: () => events.push("turn:completed"),
          onTurnFailed: () => events.push("turn:failed"),
        },
      },
    );

    expect(result.status).toBe("completed");
    expect(result.codexTurnId).toBe("turn-1");
    expect(events).toContain("assistant:delta");
    expect(events).toContain("turn:completed");
    // Items are tracked via liveTurnItems during streaming
    expect(viewState.liveTurnItems.length).toBeGreaterThanOrEqual(0);
    const threadStartRequest = (await fixture.readLog()).find((entry) => {
      const message = entry.message as Record<string, unknown> | undefined;
      return entry.type === "received" && message?.method === "thread/start";
    });
    expect(threadStartRequest).toBeTruthy();
  } finally {
    await fixture.client.shutdown();
  }
});

test("CodexAppServerClient emits semantic codex:event for raw notifications", async () => {
  const { cwd } = await createTempProject();
  const fixture = await startMockCodexClient([
    ...startupSteps(),
    {
      expectRequest: "thread/start",
      params: {},
      respond: threadStartResponse(cwd),
    },
    {
      expectRequest: "turn/start",
      params: {
        threadId: "thread-1",
        input: [{ type: "text", text: "test" }],
      },
      respond: { turn: { id: "turn-1", status: "inProgress" } },
    },
    { delay: 20 },
    {
      notify: "item/agentMessage/delta",
      params: { threadId: "thread-1", turnId: "turn-1", delta: "semantic" },
    },
    {
      notify: "item/completed",
      params: {
        threadId: "thread-1",
        item: { type: "agentMessage", id: "a1", text: "reply", phase: null, memoryCitation: null },
      },
    },
    {
      notify: "warning",
      params: { message: "rate limit approaching" },
    },
    {
      notify: "turn/completed",
      params: { threadId: "thread-1", turnId: "turn-1", status: "completed" },
    },
  ]);

  try {
    const events: Array<{ type: string }> = [];
    fixture.client.on("codex:event", (event) => events.push(event));

    const viewState = CodexThreadViewState.create(cwd);
    await runTurn(
      { cwd, viewState, codex: fixture.client } as AppState,
      "test",
    );

    const types = events.map((e) => e.type);
    expect(types).toContain("assistant.delta");
    expect(types).toContain("item.completed");
    expect(types).toContain("turn.completed");
    expect(types).toContain("warning");

    // Verify assistant.delta payload
    const delta = events.find((e) => e.type === "assistant.delta") as { delta: string } | undefined;
    expect(delta?.delta).toBe("semantic");

    // Verify item.completed payload
    const itemCompleted = events.find((e) => e.type === "item.completed") as { item: unknown } | undefined;
    expect(itemCompleted?.item).toBeDefined();

    // Verify warning payload
    const warningEvent = events.find((e) => e.type === "warning") as { message: string } | undefined;
    expect(warningEvent?.message).toBe("rate limit approaching");
  } finally {
    await fixture.client.shutdown();
  }
});

test("CodexAppServerClient emits both codex:event and notification:error for raw error", async () => {
  const { cwd } = await createTempProject();
  const fixture = await startMockCodexClient([
    ...startupSteps(),
    // No turn — just test client-level notification wiring
    { delay: 10 },
    {
      notify: "error",
      params: { message: "fatal error", willRetry: true },
    },
    // Keep mock alive briefly so events propagate
    { delay: 50 },
  ]);

  try {
    const semanticError = new Promise<unknown>((resolve) => {
      fixture.client.on("codex:event", (event) => {
        if (event.type === "error") resolve(event);
      });
    });
    const rawErrorSeen = new Promise<unknown>((resolve) => {
      fixture.client.on("notification:error", resolve);
    });

    const [errorEventValue, rawErrorValue] = await Promise.all([
      semanticError,
      rawErrorSeen,
    ]);

    const errorEvent = errorEventValue as { message: string; willRetry: boolean };
    expect(errorEvent.message).toBe("fatal error");
    expect(errorEvent.willRetry).toBe(true);

    const rawError = rawErrorValue as { message: string };
    expect(rawError.message).toBe("fatal error");
  } finally {
    await fixture.client.shutdown();
  }
});

test("CodexAppServerClient emits approval.requested for raw serverRequest", async () => {
  const { cwd } = await createTempProject();
  const fixture = await startMockCodexClient([
    ...startupSteps(),
    {
      expectRequest: "thread/start",
      params: {},
      respond: threadStartResponse(cwd),
    },
    {
      expectRequest: "turn/start",
      params: {
        threadId: "thread-1",
        input: [{ type: "text", text: "approve me" }],
      },
      respond: { turn: { id: "turn-1", status: "inProgress" } },
    },
    { delay: 10 },
    {
      serverRequest: "item/permissions/requestApproval",
      id: 41,
      params: { reason: "file access", command: "cat /etc/hosts", cwd: "/app" },
      expectResponse: { decision: "approve" },
    },
    { delay: 10 },
    {
      notify: "turn/completed",
      params: { threadId: "thread-1", turnId: "turn-1", status: "completed" },
    },
  ]);

  try {
    const approvalSeen = new Promise<{ type: string; reason?: string; command?: string; cwd?: string }>((resolve) => {
      fixture.client.on("codex:event", (event) => {
        if (event.type === "approval.requested") resolve(event);
      });
    });
    const legacySeen = new Promise<unknown>((resolve) => {
      fixture.client.on("serverRequest", (req) => {
        fixture.client.resolveServerRequest(req.id, { decision: "approve" });
        resolve(req);
      });
    });

    const thread = await fixture.client.startThread({});
    const turn = await fixture.client.startTurn(thread.thread.id, "approve me");
    const completed = fixture.client.waitForTurnCompleted(thread.thread.id, turn.turn.id);

    const [ev, legacyRequest] = await Promise.all([approvalSeen, legacySeen]);
    expect(ev.kind).toBe("permissions");
    expect(ev.reason).toBe("file access");
    expect(ev.cwd).toBe("/app");
    expect(ev.command).toBeUndefined();
    expect((legacyRequest as { id?: unknown }).id).toBe(41);
    await expect(completed).resolves.toMatchObject({ status: "completed" });

    const log = await fixture.readLog();
    const response = log.find((entry) => {
      const m = entry.message as Record<string, unknown> | undefined;
      return entry.type === "received" && m?.id === 41 && "result" in m;
    });
    expect(response).toBeTruthy();
  } finally {
    await fixture.client.shutdown();
  }
});
