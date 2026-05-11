import { expect, test } from "bun:test";
import { runTurn, type AppState } from "../../../src/app/controller";
import { PicoThreadStore } from "../../../src/thread/store";
import { startMockCodexClient } from "../../../tools/codex-app-server/test-client";
import {
  assistantMessage,
  createTempProject,
  startupSteps,
  threadStartResponse,
} from "./scenario-helpers";

test("runTurn streams assistant delta, raw item, and completion through stdio", async () => {
  const { cwd } = await createTempProject();
  const fixture = await startMockCodexClient([
    ...startupSteps(),
    {
      expectRequest: "thread/start",
      params: { cwd, ephemeral: true, experimentalRawEvents: true },
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
      notify: "rawResponseItem/completed",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        item: assistantMessage("assistant-output", "hello"),
      },
    },
    {
      notify: "turn/completed",
      params: { threadId: "thread-1", turnId: "turn-1", status: "completed" },
    },
  ]);

  try {
    const store = await PicoThreadStore.create(cwd);
    const events: string[] = [];
    const result = await runTurn(
      { cwd, store, codex: fixture.client, config: {} } as AppState,
      "hello",
      {
        emit: (event) => events.push(event),
      },
    );

    expect(result.status).toBe("completed");
    expect(result.codexTurnId).toBe("turn-1");
    expect(result.rawItemCount).toBe(1);
    expect(events).toContain("assistant:delta");
    expect(events).toContain("raw-item:completed");
    expect(events).toContain("turn:completed");
    expect(store.collectInjectItems()).toEqual([assistantMessage("assistant-output", "hello")]);
  } finally {
    await fixture.client.shutdown();
  }
});
