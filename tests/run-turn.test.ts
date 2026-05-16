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
import { CodexThreadViewState } from "../src/app/codex-thread-view-state";
import type { JSONRPCRequest } from "../src/codex/app-server";

class FakeCodex extends EventEmitter {
  userAgent = "fake-codex";
  codexHome = "/tmp/fake-codex-home";
  started = false;
  resolvedRequests: Array<{ id: string | number; result: unknown }> = [];
  private threadCount = 0;
  private lastThreadId = "";

  async start() { this.started = true; }

  async startThread(_params?: unknown) {
    this.threadCount++;
    this.lastThreadId = `thread-${this.threadCount}`;
    return this.threadResult();
  }

  async resumeThread(threadId: string, _params?: unknown) {
    this.lastThreadId = threadId;
    return this.threadResult();
  }

  async readThread(_threadId: string, _includeTurns = true) {
    return { thread: this.threadResult().thread };
  }

  private threadResult() {
    return {
      thread: {
        id: this.lastThreadId,
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

  async startTurn(threadId: string) {
    const tid = threadId;
    setTimeout(() => {
      this.emit("turn/completed", { threadId: tid, turnId: "turn-1", status: "completed" });
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

test("ensureAppThread attaches a CodexThreadViewState", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pico-cwd-"));
  const home = await mkdtemp(join(tmpdir(), "pico-home-"));
  Bun.env.HOME = home;

  const app = {
    cwd,
    codex: new FakeCodex(),
  } as unknown as DraftAppState;

  expect(app.viewState).toBeUndefined();

  const activeApp = await ensureAppThread(app);
  const draftViewState = app.viewState;
  if (!draftViewState) throw new Error("ensureAppThread did not attach a viewState");

  expect(activeApp.viewState).toBe(draftViewState);
  expect(draftViewState.cwd).toBe(cwd);
});

test("runTurn uses Codex-native startThread and refreshes view state", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pico-cwd-"));
  const home = await mkdtemp(join(tmpdir(), "pico-home-"));
  Bun.env.HOME = home;

  const viewState = CodexThreadViewState.create(cwd);
  const codex = new FakeCodex();
  const app = { viewState, codex, cwd } as unknown as AppState;

  await withQuietConsole(() => runTurn(app, "next"));

  // First turn should create a Codex thread
  expect(viewState.codexThreadId).toBe("thread-1");
  expect(viewState.turnStatus).toBe("idle");
});

test("runTurn resumes existing Codex thread for subsequent turns", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pico-cwd-"));
  const home = await mkdtemp(join(tmpdir(), "pico-home-"));
  Bun.env.HOME = home;

  const viewState = CodexThreadViewState.create(cwd);
  viewState.codexThreadId = "existing-thread-1";

  const codex = new FakeCodex();
  const app = { viewState, codex, cwd } as unknown as AppState;

  await withQuietConsole(() => runTurn(app, "continue"));

  // Should keep using the existing thread ID (resume, not create new)
  expect(viewState.codexThreadId).toBe("existing-thread-1");
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
  const viewState = CodexThreadViewState.create(cwd);
  const codex = new ApprovalCodex();
  const app = { viewState, codex, cwd } as unknown as AppState;

  await withQuietConsole(() => runTurn(app, "needs approval", async () => ({ decision: "approve" })));

  expect(codex.resolvedRequests).toEqual([{ id: 99, result: { decision: "approve" } }]);
});

test("runTurn handles interrupted completions as aborted turns", async () => {
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
  const viewState = CodexThreadViewState.create(cwd);
  const codex = new InterruptedCodex();
  const app = { viewState, codex, cwd } as unknown as AppState;

  const result = await withQuietConsole(() => runTurn(app, "interrupt me"));

  expect(result.status).toBe("aborted");
  expect(viewState.turnStatus).toBe("idle");
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
