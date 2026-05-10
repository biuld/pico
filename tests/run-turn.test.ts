import { expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ensureAppSession,
  runTurn,
  type AppState,
  type DraftAppState,
} from "../src/app/controller";
import { SessionStore } from "../src/session/store";
import type { JSONRPCRequest } from "../src/codex/types";

class FakeCodex extends EventEmitter {
  userAgent = "fake-codex";
  codexHome = "/tmp/fake-codex-home";
  injectedItems: unknown[] = [];
  resolvedRequests: Array<{ id: string | number; result: unknown }> = [];

  async startEphemeralThread() {
    return {
      thread: {
        id: "thread-1",
        sessionId: "session-1",
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

  async injectItems(_threadId: string, items: unknown[]) {
    this.injectedItems = items;
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

test("ensureAppSession creates Pico JSONL only when a turn needs persistence", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pico-cwd-"));
  const home = await mkdtemp(join(tmpdir(), "pico-home-"));
  Bun.env.HOME = home;

  const app = {
    cwd,
    config: { cwd },
    codex: new FakeCodex(),
  } as unknown as DraftAppState;

  expect(await SessionStore.list(cwd)).toEqual([]);

  const activeApp = await ensureAppSession(app);

  expect(activeApp.store).toBe(app.store);
  expect((await SessionStore.list(cwd)).map((session) => session.id)).toEqual([
    activeApp.store.id,
  ]);
});

test("runTurn injects branch history, filters raw items, and persists completion", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pico-cwd-"));
  const home = await mkdtemp(join(tmpdir(), "pico-home-"));
  Bun.env.HOME = home;

  const store = await SessionStore.create(cwd);
  const previousTurn = await store.appendTurn(store.leafId, "previous");
  const previousItem = await store.appendResponseItem(previousTurn.id, "previous-turn", {
    id: "previous-item",
    type: "message",
  });
  await store.appendTurnCompleted(previousItem.id, "previous-turn");

  const codex = new FakeCodex();
  const app = { store, codex, config: {} } as unknown as AppState;

  await withQuietConsole(() => runTurn(app, "next"));

  expect(codex.injectedItems).toEqual([{ id: "previous-item", type: "message" }]);
  expect(store.collectInjectItems().map((item) => item.id)).toEqual([
    "previous-item",
    "kept-item",
  ]);
  const turn = store.allEntries.find((entry) => entry.type === "turn" && entry.userInput === "next");
  expect(turn?.status).toBe("completed");
  expect(store.allEntries.at(-1)?.type).toBe("turn_completed");
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
  const store = await SessionStore.create(cwd);
  const codex = new ApprovalCodex();
  const app = { store, codex, config: {} } as unknown as AppState;

  await withQuietConsole(() => runTurn(app, "needs approval", async () => ({ decision: "approve" })));

  expect(codex.resolvedRequests).toEqual([{ id: 99, result: { decision: "approve" } }]);
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
