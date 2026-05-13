import { beforeEach, expect, test } from "bun:test";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  CodexImportClient,
} from "../src/import/codex-threads";
import {
  importedPicoThreadId,
  importCodexThreads,
} from "../src/import/codex-threads";
import type {
  CodexPersistentThread,
  ThreadListParams,
  ThreadListResponse,
} from "../src/codex/app-server";
import { PicoThreadStore } from "../src/thread/store";
import { threadPath } from "../src/thread/paths";

let home: string;
let cwd: string;
let codexHome: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "pico-home-"));
  cwd = await mkdtemp(join(tmpdir(), "pico-cwd-"));
  codexHome = await mkdtemp(join(tmpdir(), "codex-home-"));
  Bun.env.HOME = home;
});

test("imports Codex rollout JSONL into Pico thread JSONL", async () => {
  const rollout = await writeRollout("codex-1", cwd);
  const client = new FakeCodexClient(codexHome, [
    {
      id: "codex-1",
      cwd,
      path: rollout.path,
      preview: "hello codex",
      name: "Imported thread",
      createdAt: Date.parse("2026-05-01T10:00:00.000Z") / 1000,
      updatedAt: Date.parse("2026-05-01T10:05:00.000Z") / 1000,
      modelProvider: "openai",
    },
  ]);

  const result = await importCodexThreads({ cwd, client, config: { cwd } });

  expect(result.imported).toBe(1);
  expect(result.skipped).toBe(0);
  const picoId = importedPicoThreadId("codex-1");
  const store = await PicoThreadStore.load(cwd, picoId);
  expect(store.id).toBe(picoId);
  expect(store.config).toMatchObject({
    importedFrom: "codex",
    codexThreadId: "codex-1",
    codexPath: rollout.path,
    modelProvider: "openai",
  });
  expect(store.collectInjectItems()).toEqual([
    rollout.assistantItem,
    rollout.toolItem,
  ]);
  expect(store.labels().size).toBe(0);
});

test("skips already imported Codex threads on repeated import", async () => {
  const rollout = await writeRollout("codex-2", cwd);
  const client = new FakeCodexClient(codexHome, [{ id: "codex-2", cwd, path: rollout.path }]);

  expect((await importCodexThreads({ cwd, client, config: { cwd } })).imported).toBe(1);

  const second = await importCodexThreads({ cwd, client, config: { cwd } });
  expect(second.imported).toBe(0);
  expect(second.skipped).toBe(1);
  expect(second.threads[0]).toMatchObject({
    status: "skipped",
    reason: "already imported",
  });
});

test("dry-run reports importable threads without writing Pico JSONL", async () => {
  const rollout = await writeRollout("codex-3", cwd);
  const client = new FakeCodexClient(codexHome, [{ id: "codex-3", cwd, path: rollout.path }]);
  const picoId = importedPicoThreadId("codex-3");

  const result = await importCodexThreads({ cwd, client, config: { cwd }, dryRun: true });

  expect(result.imported).toBe(0);
  expect(result.wouldImport).toBe(1);
  expect(await Bun.file(threadPath(cwd, picoId)).exists()).toBe(false);
});

test("defaults to current cwd and imports every cwd with allCwd", async () => {
  const otherCwd = await mkdtemp(join(tmpdir(), "pico-other-cwd-"));
  const currentRollout = await writeRollout("codex-current", cwd);
  const otherRollout = await writeRollout("codex-other", otherCwd);
  const client = new FakeCodexClient(codexHome, [
    { id: "codex-current", cwd, path: currentRollout.path },
    { id: "codex-other", cwd: otherCwd, path: otherRollout.path },
  ]);

  const scoped = await importCodexThreads({ cwd, client, config: { cwd } });
  expect(scoped.imported).toBe(1);
  expect(await Bun.file(threadPath(otherCwd, importedPicoThreadId("codex-other"))).exists()).toBe(false);

  const all = await importCodexThreads({ cwd, client, config: { cwd }, allCwd: true });
  expect(all.imported).toBe(1);
  expect(await Bun.file(threadPath(otherCwd, importedPicoThreadId("codex-other"))).exists()).toBe(true);
});

test("finds rollout files from codex home when thread path is missing", async () => {
  const rollout = await writeRollout("codex-indexed", cwd, codexHome);
  const client = new FakeCodexClient(codexHome, [{ id: "codex-indexed", cwd, path: null }]);

  const result = await importCodexThreads({ cwd, client, config: { cwd } });

  expect(result.imported).toBe(1);
  expect(result.threads[0].path).toBe(threadPath(cwd, importedPicoThreadId("codex-indexed")));
  expect(rollout.path).toContain(codexHome);
});

class FakeCodexClient implements CodexImportClient {
  startCount = 0;
  shutdownCount = 0;
  requests: ThreadListParams[] = [];

  constructor(
    readonly codexHome: string,
    private readonly threads: Array<CodexPersistentThread & { archived?: boolean }>,
  ) {}

  async start(): Promise<void> {
    this.startCount += 1;
  }

  async listThreads(params: ThreadListParams = {}): Promise<ThreadListResponse> {
    this.requests.push(params);
    const archived = params.archived === true;
    const cwdFilter = typeof params.cwd === "string" ? params.cwd : undefined;
    const data = this.threads.filter((thread) => {
      if (Boolean(thread.archived) !== archived) return false;
      if (cwdFilter && thread.cwd !== cwdFilter) return false;
      return true;
    });
    return { data, nextCursor: null, backwardsCursor: null };
  }

  async shutdown(): Promise<void> {
    this.shutdownCount += 1;
  }
}

async function writeRollout(threadId: string, rolloutCwd: string, root?: string) {
  const userItem = {
    type: "message",
    role: "user",
    content: [{ type: "input_text", text: "hello codex" }],
  };
  const assistantItem = {
    type: "message",
    role: "assistant",
    content: [{ type: "output_text", text: "hello pico" }],
  };
  const toolItem = {
    type: "function_call_output",
    call_id: "call-1",
    output: {
      success: true,
      body: [{ type: "text", text: "done" }],
    },
  };
  const directory = root
    ? join(root, "sessions", "2026", "05", "01")
    : await mkdtemp(join(tmpdir(), "codex-rollout-"));
  await mkdir(directory, { recursive: true });
  const path = join(directory, `rollout-2026-05-01T10-00-00-${threadId}.jsonl`);
  const lines = [
    {
      timestamp: "2026-05-01T10:00:00.000Z",
      type: "session_meta",
      payload: {
        id: threadId,
        timestamp: "2026-05-01T10:00:00.000Z",
        cwd: rolloutCwd,
        source: "cli",
        cli_version: "1.0.0",
        model_provider: "openai",
      },
    },
    {
      timestamp: "2026-05-01T10:00:01.000Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "developer",
        content: [{ type: "input_text", text: "developer instructions" }],
      },
    },
    {
      timestamp: "2026-05-01T10:00:02.000Z",
      type: "response_item",
      payload: userItem,
    },
    {
      timestamp: "2026-05-01T10:00:02.000Z",
      type: "event_msg",
      payload: { type: "user_message", message: "hello codex" },
    },
    {
      timestamp: "2026-05-01T10:00:03.000Z",
      type: "turn_context",
      payload: {
        turn_id: "codex-turn-1",
        cwd: rolloutCwd,
        model: "gpt-test",
        approval_policy: "on-request",
      },
    },
    {
      timestamp: "2026-05-01T10:00:04.000Z",
      type: "response_item",
      payload: assistantItem,
    },
    {
      timestamp: "2026-05-01T10:00:05.000Z",
      type: "response_item",
      payload: toolItem,
    },
  ];
  await Bun.write(path, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`);
  return { path, userItem, assistantItem, toolItem };
}
