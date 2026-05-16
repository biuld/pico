import { expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ensureAppThread,
  runTurn,
  type AppState,
  type DraftAppState,
} from "../src/app/controller";
import { CodexThreadState, entryUserText } from "../src/app/codex-thread-state";
import type { JSONRPCRequest } from "../src/codex/app-server";

class FakeCodex extends EventEmitter {
  userAgent = "fake-codex";
  codexHome = "/tmp/fake-codex-home";
  started = false;
  resolvedRequests: Array<{ id: string | number; result: unknown }> = [];
  private threadCount = 0;

  async start() { this.started = true; }

  async startEphemeralThread(_params?: unknown) {
    this.threadCount++;
    return this.threadResult();
  }

  async resumeThread(_threadId: string, _params?: unknown) {
    return this.threadResult();
  }

  private threadResult() {
    return {
      thread: {
        id: `thread-${this.threadCount}`,
        sessionId: "codex-session-1",
        forkedFromId: null,
        preview: "",
        ephemeral: false,
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
      this.emit("rawResponseItem/completed", {
        threadId: "other-thread",
        turnId: "turn-1",
        item: { id: "wrong-thread", type: "message" },
      });
      this.emit("rawResponseItem/completed", {
        threadId: "thread-1",
        turnId: "turn-1",
        item: { id: "kept-item", type: "message" },
      });
      this.emit("turn/completed", { threadId: "thread-1", turnId: "turn-1", status: "completed" });
    }, 0);
    return { turn: { id: "turn-1", status: "inProgress" } };
  }

  waitForTurnCompleted(threadId: string, turnId: string) {
    return new Promise((resolve) => {
      this.on("turn/completed", (params: Record<string, unknown>) => {
        if (params.threadId === threadId && params.turnId === turnId) resolve(params);
      });
    });
  }

  resolveServerRequest(id: string | number, result: unknown) {
    this.resolvedRequests.push({ id, result });
  }

  rejectServerRequest() {}
}

test("ensureAppThread attaches an in-memory CodexThreadState", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pico-cwd-"));
  const home = await mkdtemp(join(tmpdir(), "pico-home-"));
  Bun.env.HOME = home;

  const app = {
    cwd,
    config: { cwd },
    codex: new FakeCodex(),
  } as unknown as DraftAppState;

  expect(app.store).toBeUndefined();

  const activeApp = await ensureAppThread(app);
  const draftStore = app.store;
  if (!draftStore) throw new Error("ensureAppThread did not attach a store");

  expect(activeApp.store).toBe(draftStore);
  expect(draftStore.id).toBeTruthy();
  expect(draftStore.cwd).toBe(cwd);
});

test("runTurn uses Codex-native startEphemeralThread and stores items in memory", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pico-cwd-"));
  const home = await mkdtemp(join(tmpdir(), "pico-home-"));
  Bun.env.HOME = home;

  const store = await CodexThreadState.create(cwd);
  const previousTurn = store.appendUserInput(store.leafId, "previous");
  store.appendResponseItem(previousTurn.id, { id: "previous-item", type: "message" });
  store.appendEventMsg(previousTurn.id, { type: "turn_completed", turnId: previousTurn.id });

  const codex = new FakeCodex();
  const app = { store, codex, config: {} } as unknown as AppState;

  await withQuietConsole(() => runTurn(app, "next"));

  // First turn should create a Codex thread
  expect(store.codexThreadId).toBe("thread-1");
  expect(store.lines.some((line) => entryUserText(line) === "next")).toBe(true);
  expect(store.lines.at(-1)).toMatchObject({ type: "event_msg", payload: { type: "turn_completed" } });
});

test("runTurn resumes existing Codex thread for subsequent turns", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pico-cwd-"));
  const home = await mkdtemp(join(tmpdir(), "pico-home-"));
  Bun.env.HOME = home;

  const store = await CodexThreadState.create(cwd);
  const rootTurn = store.appendUserInput(store.leafId, "root");
  store.appendResponseItem(rootTurn.id, { id: "root-item", type: "message" });
  const rootDone = store.appendEventMsg(rootTurn.id, { type: "turn_completed", turnId: rootTurn.id });

  store.appendBranch(rootDone.id);
  const rightTurn = store.appendUserInput(store.leafId, "right");
  store.appendResponseItem(rightTurn.id, { id: "right-item", type: "message" });
  store.appendEventMsg(rightTurn.id, { type: "turn_completed", turnId: rightTurn.id });

  const codex = new FakeCodex();
  const app = { store, codex, config: {} } as unknown as AppState;

  await withQuietConsole(() => runTurn(app, "continue right branch"));

  // Should still use the same Codex thread ID (resume, not create new)
  expect(store.codexThreadId).toBeTruthy();
  expect(store.lines.some((line) => entryUserText(line) === "continue right branch")).toBe(true);
  expect(store.lines.at(-1)).toMatchObject({ type: "event_msg", payload: { type: "turn_completed" } });
});

test("runTurn resolves approval server requests", async () => {
  class ApprovalCodex extends FakeCodex {
    async startTurn() {
      setTimeout(() => {
        this.emit("serverRequest", {
          id: 99,
          method: "item/permissions/requestApproval",
          params: { reason: "test" },
        } satisfies JSONRPCRequest);
        this.emit("turn/completed", {
          threadId: "thread-1",
          turnId: "turn-approval",
          status: "completed",
        });
      }, 0);
      return { turn: { id: "turn-approval", status: "inProgress" } };
    }
  }

  const cwd = await mkdtemp(join(tmpdir(), "pico-cwd-"));
  const home = await mkdtemp(join(tmpdir(), "pico-home-"));
  Bun.env.HOME = home;
  const store = await CodexThreadState.create(cwd);
  const codex = new ApprovalCodex();
  const app = { store, codex, config: {} } as unknown as AppState;

  await withQuietConsole(() => runTurn(app, "needs approval", async () => ({ decision: "approve" })));

  expect(codex.resolvedRequests).toEqual([{ id: 99, result: { decision: "approve" } }]);
});

test("runTurn persists interrupted completions as aborted turns", async () => {
  class InterruptedCodex extends FakeCodex {
    async startTurn() {
      setTimeout(() => {
        this.emit("turn/completed", {
          threadId: "thread-1",
          turnId: "turn-interrupted",
          status: "interrupted",
          error: { message: "interrupted by user" },
        });
      }, 0);
      return { turn: { id: "turn-interrupted", status: "inProgress" } };
    }
  }

  const cwd = await mkdtemp(join(tmpdir(), "pico-cwd-"));
  const home = await mkdtemp(join(tmpdir(), "pico-home-"));
  Bun.env.HOME = home;
  const store = await CodexThreadState.create(cwd);
  const codex = new InterruptedCodex();
  const app = { store, codex, config: {} } as unknown as AppState;

  const result = await withQuietConsole(() => runTurn(app, "interrupt me"));

  expect(result.status).toBe("aborted");
  expect(store.lines.some((line) => entryUserText(line) === "interrupt me")).toBe(true);
  expect(store.lines.at(-1)).toMatchObject({
    type: "event_msg",
    payload: { type: "turn_aborted", reason: "interrupted by user" },
  });
});

async function withQuietConsole<T>(fn: () => Promise<T>): Promise<T> {
  const originalLog = console.log;
  const originalWrite = process.stdout.write;
  console.log = () => {};
  process.stdout.write = (() => true) as typeof process.stdout.write;
  try {
    return await fn();
  } finally {
    console.log = originalLog;
    process.stdout.write = originalWrite;
  }
}
