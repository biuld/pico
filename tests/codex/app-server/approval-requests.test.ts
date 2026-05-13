import { expect, test } from "bun:test";
import { runTurn, type AppState } from "../../../src/app/controller";
import { PicoThreadStore } from "../../../src/thread/store";
import { startMockCodexClient } from "../../../tools/codex-app-server/test-client";
import {
  createTempProject,
  startupSteps,
  threadStartResponse,
} from "./scenario-helpers";

test("runTurn resolves approval server requests over stdio", async () => {
  const { cwd } = await createTempProject();
  const fixture = await startMockCodexClient([
    ...startupSteps(),
    {
      expectRequest: "thread/fork",
      params: { ephemeral: true, experimentalRawEvents: true },
      respond: threadStartResponse(cwd),
    },
    {
      expectRequest: "turn/start",
      params: { threadId: "thread-1" },
      respond: { turn: { id: "turn-approval", status: "inProgress" } },
    },
    {
      serverRequest: "item/permissions/requestApproval",
      id: 41,
      params: { threadId: "thread-1", turnId: "turn-approval", reason: "test" },
      expectResponse: { decision: "approve" },
    },
    { delay: 20 },
    {
      notify: "turn/completed",
      params: { threadId: "thread-1", turnId: "turn-approval", status: "completed" },
    },
  ]);

  try {
    const store = await PicoThreadStore.create(cwd);
    await runTurn(
      { cwd, store, codex: fixture.client, config: {} } as AppState,
      "needs approval",
      async () => ({ decision: "approve" }),
    );

    const clientResponse = (await fixture.readLog()).find((entry) => {
      const message = entry.message as Record<string, unknown> | undefined;
      return entry.type === "received" && message?.id === 41 && "result" in message;
    });
    expect(clientResponse).toBeTruthy();
  } finally {
    await fixture.client.shutdown();
  }
});
