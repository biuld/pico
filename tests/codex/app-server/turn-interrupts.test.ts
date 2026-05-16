import { expect, test } from "bun:test";
import type { AppState } from "../../../src/app/controller";
import { PicoAppSession, PICO_APP_SESSION_EVENTS } from "../../../src/app-session";
import { PicoThreadStore } from "../../../src/thread/store";
import { startMockCodexClient } from "../../../tools/codex-app-server/test-client";
import {
  createTempProject,
  onceSessionEvent,
  startupSteps,
  threadStartResponse,
} from "./scenario-helpers";

test("app session interrupt waits for turn/interrupt before interrupted completion", async () => {
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
      respond: { turn: { id: "turn-interrupt", status: "inProgress" } },
    },
    {
      expectRequest: "turn/interrupt",
      params: { threadId: "thread-1", turnId: "turn-interrupt" },
      respond: {},
    },
    { delay: 20 },
    {
      notify: "turn/completed",
      params: {
        threadId: "thread-1",
        turnId: "turn-interrupt",
        status: "interrupted",
        error: { message: "interrupted by test" },
      },
    },
  ]);

  try {
    const store = await PicoThreadStore.create(cwd);
    const session = new PicoAppSession({
      cwd,
      store,
      codex: fixture.client,
      config: {},
    } as AppState);

    const codexStarted = onceSessionEvent(session, PICO_APP_SESSION_EVENTS.TURN_CODEX_STARTED);
    const aborted = onceSessionEvent(session, PICO_APP_SESSION_EVENTS.TURN_ABORTED);
    const finished = onceSessionEvent(session, PICO_APP_SESSION_EVENTS.TURN_FINISHED);

    session.submit("stop");
    await codexStarted;
    expect(await session.interruptTurn()).toBe(true);
    await aborted;
    await finished;

    expect(session.snapshot.running).toBe(false);
    expect(store.lines.at(-1)).toMatchObject({
      type: "event_msg",
      payload: { type: "turn_aborted", reason: "interrupted by test" },
    });
  } finally {
    await fixture.client.shutdown();
  }
});
