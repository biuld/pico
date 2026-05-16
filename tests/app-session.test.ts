import { expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AppState } from "../src/app/controller";
import { PicoAppSession, PICO_APP_SESSION_EVENTS } from "../src/app-session";
import { PicoThreadStore, entryUserText } from "../src/thread/store";

class SessionCodex extends EventEmitter {
  shutdownCount = 0;

  async forkEphemeralThreadFromPath() {
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
  async interruptTurn(_threadId: string, _turnId: string) {}
  async shutdown() {
    this.shutdownCount += 1;
  }
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

test("app session drains queued follow-up messages after a turn finishes", async () => {
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
  expect(appSession.queueMessage(" third ")).toMatchObject({
    id: "queued-2",
    text: "third",
  });
  expect(appSession.snapshot.queuedMessages.map((message) => message.text)).toEqual(["third"]);

  await finished;

  expect(queueCounts).toEqual([1, 1, 0]);
  expect(appSession.snapshot.queuedMessages).toEqual([]);
  expect(
    store.lines
      .map((line) => entryUserText(line))
      .filter(Boolean),
  ).toEqual(["first", "third"]);
});

test("app session can restore the single queued follow-up message", async () => {
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

  appSession.queueMessage("queued");

  expect(appSession.takeQueuedMessage()).toMatchObject({ text: "queued" });
  expect(appSession.snapshot.queuedMessages).toEqual([]);
  expect(appSession.takeQueuedMessage()).toBeUndefined();
});

test("app session interrupts the active codex turn", async () => {
  class InterruptibleCodex extends SessionCodex {
    interrupted: Array<{ threadId: string; turnId: string }> = [];

    async startTurn() {
      return { turn: { id: "codex-turn-interrupt", status: "inProgress" } };
    }

    async interruptTurn(threadId: string, turnId: string) {
      this.interrupted.push({ threadId, turnId });
      setTimeout(() => {
        this.emit("turn/completed", {
          threadId,
          turnId,
          status: "interrupted",
          error: { message: "interrupted" },
        });
      }, 0);
    }
  }

  const cwd = await mkdtemp(join(tmpdir(), "pico-cwd-"));
  const home = await mkdtemp(join(tmpdir(), "pico-home-"));
  Bun.env.HOME = home;
  const store = await PicoThreadStore.create(cwd);
  const codex = new InterruptibleCodex();
  const appSession = new PicoAppSession({
    cwd,
    store,
    codex,
    config: {},
  } as unknown as AppState);

  const codexStarted = new Promise<void>((resolve) => {
    appSession.on(PICO_APP_SESSION_EVENTS.TURN_CODEX_STARTED, () => resolve());
  });
  const aborted = new Promise<void>((resolve) => {
    appSession.on(PICO_APP_SESSION_EVENTS.TURN_ABORTED, () => resolve());
  });
  const finished = new Promise<void>((resolve) => {
    appSession.on(PICO_APP_SESSION_EVENTS.TURN_FINISHED, () => resolve());
  });

  appSession.submit("stop");
  await codexStarted;
  expect(await appSession.interruptTurn()).toBe(true);
  await aborted;
  await finished;

  expect(codex.interrupted).toEqual([
    { threadId: "thread-1", turnId: "codex-turn-interrupt" },
  ]);
  expect(appSession.snapshot.running).toBe(false);
  expect(store.lines.at(-1)).toMatchObject({
    type: "event_msg",
    payload: { type: "turn_aborted" },
  });
});

test("app session sends the queued follow-up after interrupting the active turn", async () => {
  class InterruptThenCompleteCodex extends SessionCodex {
    turnCount = 0;

    async startTurn() {
      this.turnCount += 1;
      const turnId = `codex-turn-${this.turnCount}`;
      if (this.turnCount > 1) {
        setTimeout(() => {
          this.emit("rawResponseItem/completed", {
            threadId: "thread-1",
            turnId,
            item: {
              id: `assistant-output-${this.turnCount}`,
              type: "message",
              role: "assistant",
              content: [{ type: "output_text", text: "queued done" }],
            },
          });
          this.emit("turn/completed", {
            threadId: "thread-1",
            turnId,
            status: "completed",
          });
        }, 0);
      }
      return { turn: { id: turnId, status: "inProgress" } };
    }

    async interruptTurn(threadId: string, turnId: string) {
      setTimeout(() => {
        this.emit("turn/completed", {
          threadId,
          turnId,
          status: "interrupted",
          error: { message: "interrupted" },
        });
      }, 0);
    }
  }

  const cwd = await mkdtemp(join(tmpdir(), "pico-cwd-"));
  const home = await mkdtemp(join(tmpdir(), "pico-home-"));
  Bun.env.HOME = home;
  const store = await PicoThreadStore.create(cwd);
  const codex = new InterruptThenCompleteCodex();
  const appSession = new PicoAppSession({
    cwd,
    store,
    codex,
    config: {},
  } as unknown as AppState);

  const codexStarted = new Promise<void>((resolve) => {
    appSession.on(PICO_APP_SESSION_EVENTS.TURN_CODEX_STARTED, () => resolve());
  });
  const finished = new Promise<void>((resolve) => {
    let count = 0;
    appSession.on(PICO_APP_SESSION_EVENTS.TURN_FINISHED, () => {
      count += 1;
      if (count === 2) resolve();
    });
  });

  appSession.submit("first");
  appSession.queueMessage("queued");
  await codexStarted;
  expect(await appSession.interruptTurn()).toBe(true);
  await finished;

  expect(appSession.snapshot.queuedMessages).toEqual([]);
  expect(
    store.lines
      .map((line) => entryUserText(line))
      .filter(Boolean),
  ).toEqual(["first", "queued"]);
});

test("new draft resets Pico-local session state without creating a store", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pico-cwd-"));
  const home = await mkdtemp(join(tmpdir(), "pico-home-"));
  Bun.env.HOME = home;
  const store = await PicoThreadStore.create(cwd);
  const codex = new SessionCodex();
  const nextCodex = new SessionCodex();
  const appSession = new PicoAppSession({
    cwd,
    store,
    codex,
    config: { statusLineItems: ["model"] },
  } as unknown as AppState, {
    createDraftApp: async (draftCwd) => ({
      cwd: draftCwd,
      codex: nextCodex,
      config: { statusLineItems: ["model"] },
    } as unknown as AppState),
  });

  appSession.queueMessage("queued");
  expect(await appSession.newDraft()).toBe(true);

  expect(codex.shutdownCount).toBe(1);
  expect(appSession.app.store).toBeUndefined();
  expect(appSession.app.codex as unknown).toBe(nextCodex);
  expect(appSession.snapshot.queuedMessages).toEqual([]);
});
