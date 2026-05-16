import { expect, test } from "bun:test";
import { runTurn, type AppState } from "../../../src/app/controller";
import { CodexThreadViewState } from "../../../src/app/codex-thread-view-state";
import { startMockCodexClient } from "../../../tools/codex-app-server/test-client";
import {
  createTempProject,
  startupSteps,
  threadStartResponse,
} from "./scenario-helpers";

test("failed completion becomes a failed Pico turn", async () => {
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
      params: { threadId: "thread-1" },
      respond: { turn: { id: "turn-failed", status: "inProgress" } },
    },
    { delay: 20 },
    {
      notify: "turn/completed",
      params: {
        threadId: "thread-1",
        turnId: "turn-failed",
        status: "failed",
        error: { message: "mock failure" },
      },
    },
  ]);

  try {
    const viewState = CodexThreadViewState.create(cwd);
    await expect(
      runTurn({ cwd, viewState, codex: fixture.client } as AppState, "fail"),
    ).rejects.toThrow("mock failure");

    expect(viewState.turnStatus).toBe("idle");
  } finally {
    await fixture.client.shutdown();
  }
});
