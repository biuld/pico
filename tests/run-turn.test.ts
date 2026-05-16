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
import { PicoThreadStore, entryUserText } from "../src/thread/store";
import type { JSONRPCRequest } from "../src/codex/app-server";

class FakeCodex extends EventEmitter {
  userAgent = "fake-codex";
  codexHome = "/tmp/fake-codex-home";
  forkPath = "";
  resolvedRequests: Array<{ id: string | number; result: unknown }> = [];

  async forkEphemeralThreadFromPath(path: string) {
    this.forkPath = path;
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

test("runTurn forks from a linearized branch path, filters raw items, and persists completion", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pico-cwd-"));
  const home = await mkdtemp(join(tmpdir(), "pico-home-"));
  Bun.env.HOME = home;

  const store = await PicoThreadStore.create(cwd);
  const previousTurn = await store.appendUserInput(store.leafId, "previous");
  const previousItem = await store.appendResponseItem(previousTurn.id, previousTurn.id, {
    id: "previous-item",
    type: "message",
  });
  await store.appendEventMsg(previousItem.id, { type: "turn_completed", turnId: previousTurn.id });

  const codex = new FakeCodex();
  const app = { store, codex, config: {} } as unknown as AppState;

  await withQuietConsole(() => runTurn(app, "next"));

  const forkLines = (await Bun.file(codex.forkPath).text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(forkLines.map((line) => line.payload?.id)).toContain("previous-item");
  expect(store.collectInjectItems().map((item) => item.id)).toEqual([
    "previous-item",
    "kept-item",
  ]);
  expect(store.lines.some((line) => entryUserText(line) === "next")).toBe(true);
  expect(store.lines.at(-1)).toMatchObject({ type: "event_msg", payload: { type: "turn_completed" } });
});

test("runTurn sends raw items assembled from loaded JSONL branch path", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pico-cwd-"));
  const home = await mkdtemp(join(tmpdir(), "pico-home-"));
  Bun.env.HOME = home;

  const store = await PicoThreadStore.create(cwd);
  const rootTurn = await store.appendUserInput(store.leafId, "root");
  const rootItem = await store.appendResponseItem(rootTurn.id, rootTurn.id, {
    id: "root-item",
    type: "message",
  });
  const rootDone = await store.appendEventMsg(rootItem.id, { type: "turn_completed", turnId: rootTurn.id });

  const leftTurn = await store.appendUserInput(rootDone.id, "left");
  const leftItem = await store.appendResponseItem(leftTurn.id, leftTurn.id, {
    id: "left-item",
    type: "message",
  });
  await store.appendEventMsg(leftItem.id, { type: "turn_completed", turnId: leftTurn.id });

  await store.appendBranch(rootDone.id);
  const rightTurn = await store.appendUserInput(store.leafId, "right");
  const rightItem = await store.appendResponseItem(rightTurn.id, rightTurn.id, {
    id: "right-item",
    type: "message",
  });
  await store.appendEventMsg(rightItem.id, { type: "turn_completed", turnId: rightTurn.id });

  const loaded = await PicoThreadStore.load(cwd, store.id);
  const codex = new FakeCodex();
  const app = { store: loaded, codex, config: {} } as unknown as AppState;

  await withQuietConsole(() => runTurn(app, "continue right branch"));

  const forkLines = (await Bun.file(codex.forkPath).text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(forkLines.map((line) => line.payload?.id).filter(Boolean)).toEqual([
    rootTurn.type === "response_item" ? (rootTurn.payload as Record<string, unknown>).id as string : undefined,
    "root-item",
    rightTurn.type === "response_item" ? (rightTurn.payload as Record<string, unknown>).id as string : undefined,
    "right-item",
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
  const store = await PicoThreadStore.create(cwd);
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
