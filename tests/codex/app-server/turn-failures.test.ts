import { expect, test } from "bun:test";
import { runTurn, type AppState } from "../../../src/app/controller";
import { PicoThreadStore, type TurnEntry } from "../../../src/thread/store";
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
      params: { cwd, ephemeral: true, experimentalRawEvents: true },
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
    const store = await PicoThreadStore.create(cwd);
    await expect(
      runTurn({ cwd, store, codex: fixture.client, config: {} } as AppState, "fail"),
    ).rejects.toThrow("mock failure");

    const turn = store.allEntries.find(
      (entry): entry is TurnEntry => entry.type === "turn" && entry.userInput === "fail",
    );
    expect(turn?.status).toBe("failed");
    expect(store.allEntries.at(-1)).toMatchObject({
      type: "turn_failed",
      error: "mock failure",
    });
  } finally {
    await fixture.client.shutdown();
  }
});
