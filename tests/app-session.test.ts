import { expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AppState } from "../src/app/controller";
import { PicoAppSession, PICO_APP_SESSION_EVENTS } from "../src/app-session";
import { PicoThreadStore } from "../src/thread/store";

class SessionCodex extends EventEmitter {
  async startEphemeralThread() {
    return {
      thread: {
        id: "thread-1",
        sessionId: "codex-session-1",
        forkedFromId: null,
        preview: "",
        ephemeral: true,
        modelProvider: "fake",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: "idle",
        path: null,
        cwd: process.cwd(),
        cliVersion: "fake",
        source: "test",
        turns: [],
      },
      model: "fake-model",
      modelProvider: "fake",
      cwd: process.cwd(),
    };
  }

  async injectItems() {}

  async startTurn() {
    setTimeout(() => {
      this.emit("item/agentMessage/delta", {
        threadId: "thread-1",
        turnId: "codex-turn-1",
        delta: "hello",
      });
      this.emit("rawResponseItem/completed", {
        threadId: "thread-1",
        turnId: "codex-turn-1",
        item: {
          id: "assistant-output",
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "hello" }],
        },
      });
      this.emit("turn/completed", {
        threadId: "thread-1",
        turnId: "codex-turn-1",
        status: "completed",
      });
    }, 0);
    return { turn: { id: "codex-turn-1", status: "inProgress" } };
  }

  waitForTurnCompleted(threadId: string, turnId: string) {
    return new Promise((resolve) => {
      this.on("turn/completed", (params: Record<string, unknown>) => {
        if (params.threadId === threadId && params.turnId === turnId) resolve(params);
      });
    });
  }

  resolveServerRequest() {}
  rejectServerRequest() {}
  async shutdown() {}
}

test("app session owns turn streaming lifecycle outside the TUI", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pico-cwd-"));
  const home = await mkdtemp(join(tmpdir(), "pico-home-"));
  Bun.env.HOME = home;
  const store = await PicoThreadStore.create(cwd);
  const codex = new SessionCodex();
  const appSession = new PicoAppSession({
    cwd,
    store,
    codex,
    config: {},
  } as unknown as AppState);

  const seen: string[] = [];
  appSession.on(PICO_APP_SESSION_EVENTS.TURN_SUBMITTING, () => {
    seen.push("submitting");
    expect(appSession.snapshot.running).toBe(true);
  });
  appSession.on(PICO_APP_SESSION_EVENTS.ASSISTANT_DELTA, () => {
    seen.push("delta");
    expect(appSession.snapshot.streamingText).toBe("hello");
  });
  appSession.on(PICO_APP_SESSION_EVENTS.RAW_ITEM_COMPLETED, () => {
    seen.push("raw");
    expect(appSession.snapshot.streamingText).toBe("");
  });
  appSession.on(PICO_APP_SESSION_EVENTS.TURN_COMPLETED, () => {
    seen.push("completed");
    expect(appSession.snapshot.liveLeafId).toBeUndefined();
  });

  const finished = new Promise<void>((resolve) => {
    appSession.on(PICO_APP_SESSION_EVENTS.TURN_FINISHED, () => resolve());
  });
  appSession.submit("hello");
  await finished;

  expect(appSession.snapshot.running).toBe(false);
  expect(seen).toEqual(["submitting", "delta", "raw", "completed"]);
  expect(store.collectInjectItems()).toEqual([
    {
      id: "assistant-output",
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text: "hello" }],
    },
  ]);
});

test("app session drains queued launchpad messages after a turn finishes", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pico-cwd-"));
  const home = await mkdtemp(join(tmpdir(), "pico-home-"));
  Bun.env.HOME = home;
  const store = await PicoThreadStore.create(cwd);
  const codex = new SessionCodex();
  const appSession = new PicoAppSession({
    cwd,
    store,
    codex,
    config: {},
  } as unknown as AppState);

  const finished = new Promise<void>((resolve) => {
    let count = 0;
    appSession.on(PICO_APP_SESSION_EVENTS.TURN_FINISHED, () => {
      count += 1;
      if (count === 2) resolve();
    });
  });
  const queueCounts: number[] = [];
  appSession.on(PICO_APP_SESSION_EVENTS.QUEUE_CHANGED, (event) => {
    queueCounts.push(event.queuedCount);
  });

  appSession.submit("first");
  expect(appSession.queueMessage(" second ")).toMatchObject({
    id: "queued-1",
    text: "second",
  });
  expect(appSession.snapshot.queuedMessages.map((message) => message.text)).toEqual(["second"]);

  await finished;

  expect(queueCounts).toEqual([1, 0]);
  expect(appSession.snapshot.queuedMessages).toEqual([]);
  expect(
    store.allEntries
      .filter((entry) => entry.type === "turn")
      .map((entry) => entry.userInput),
  ).toEqual(["first", "second"]);
});
