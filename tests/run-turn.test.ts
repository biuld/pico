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
import { PicoThreadStore, type TurnEntry } from "../src/thread/store";
import type { JSONRPCRequest } from "../src/codex/app-server";

class FakeCodex extends EventEmitter {
  userAgent = "fake-codex";
  codexHome = "/tmp/fake-codex-home";
  injectedItems: unknown[] = [];
  resolvedRequests: Array<{ id: string | number; result: unknown }> = [];

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

test("ensureAppThread creates Pico JSONL only when a turn needs persistence", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pico-cwd-"));
  const home = await mkdtemp(join(tmpdir(), "pico-home-"));
  Bun.env.HOME = home;

  const app = {
    cwd,
    config: { cwd },
    codex: new FakeCodex(),
  } as unknown as DraftAppState;

  expect(await PicoThreadStore.list(cwd)).toEqual([]);

  const activeApp = await ensureAppThread(app);
  const draftStore = app.store;
  if (!draftStore) throw new Error("ensureAppThread did not attach a store");

  expect(activeApp.store).toBe(draftStore);
  expect((await PicoThreadStore.list(cwd)).map((thread) => thread.id)).toEqual([
    activeApp.store.id,
  ]);
});

test("runTurn injects branch history, filters raw items, and persists completion", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pico-cwd-"));
  const home = await mkdtemp(join(tmpdir(), "pico-home-"));
  Bun.env.HOME = home;

  const store = await PicoThreadStore.create(cwd);
  const previousTurn = await store.appendTurn(store.leafId, "previous");
  const previousItem = await store.appendResponseItem(previousTurn.id, previousTurn.id, {
    id: "previous-item",
    type: "message",
  });
  await store.appendTurnCompleted(previousItem.id, previousTurn.id);

  const codex = new FakeCodex();
  const app = { store, codex, config: {} } as unknown as AppState;

  await withQuietConsole(() => runTurn(app, "next"));

  expect(codex.injectedItems).toEqual([{ id: "previous-item", type: "message" }]);
  expect(store.collectInjectItems().map((item) => item.id)).toEqual([
    "previous-item",
    "kept-item",
  ]);
  const turn = store.allEntries.find(
    (entry): entry is TurnEntry => entry.type === "turn" && entry.userInput === "next",
  );
  expect(turn?.status).toBe("completed");
  expect(store.allEntries.at(-1)?.type).toBe("turn_completed");
});

test("runTurn sends raw items assembled from loaded JSONL branch path", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pico-cwd-"));
  const home = await mkdtemp(join(tmpdir(), "pico-home-"));
  Bun.env.HOME = home;

  const store = await PicoThreadStore.create(cwd);
  const rootTurn = await store.appendTurn(store.leafId, "root");
  const rootItem = await store.appendResponseItem(rootTurn.id, rootTurn.id, {
    id: "root-item",
    type: "message",
  });
  const rootDone = await store.appendTurnCompleted(rootItem.id, rootTurn.id);

  const leftTurn = await store.appendTurn(rootDone.id, "left");
  const leftItem = await store.appendResponseItem(leftTurn.id, leftTurn.id, {
    id: "left-item",
    type: "message",
  });
  await store.appendTurnCompleted(leftItem.id, leftTurn.id);

  await store.appendBranch(rootDone.id, "back to root");
  const rightTurn = await store.appendTurn(store.leafId, "right");
  const rightItem = await store.appendResponseItem(rightTurn.id, rightTurn.id, {
    id: "right-item",
    type: "message",
  });
  await store.appendTurnCompleted(rightItem.id, rightTurn.id);

  const loaded = await PicoThreadStore.load(cwd, store.id);
  const codex = new FakeCodex();
  const app = { store: loaded, codex, config: {} } as unknown as AppState;

  await withQuietConsole(() => runTurn(app, "continue right branch"));

  expect(codex.injectedItems).toEqual([
    { id: "root-item", type: "message" },
    { id: "right-item", type: "message" },
  ]);
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
  const store = await PicoThreadStore.create(cwd);
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
