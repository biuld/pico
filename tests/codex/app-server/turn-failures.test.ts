import { expect, test } from "bun:test";
import { runTurn, type AppState } from "../../../src/app/controller";
import { PicoThreadStore, entryUserText } from "../../../src/thread/store";
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
      expectRequest: "thread/fork",
      params: { ephemeral: true, experimentalRawEvents: true },
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

    expect(store.lines.some((line) => entryUserText(line) === "fail")).toBe(true);
    expect(store.lines.at(-1)).toMatchObject({
      type: "event_msg",
      payload: { type: "turn_failed", error: "mock failure" },
    });
  } finally {
    await fixture.client.shutdown();
  }
});
