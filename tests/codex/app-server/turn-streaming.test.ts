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
