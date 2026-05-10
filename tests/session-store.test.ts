import { beforeEach, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionStore } from "../src/session/store";

let cwd: string;

beforeEach(async () => {
  const home = await mkdtemp(join(tmpdir(), "pico-home-"));
  Bun.env.HOME = home;
  cwd = await mkdtemp(join(tmpdir(), "pico-cwd-"));
});

test("writes and loads Pico JSONL v1 sessions", async () => {
  const store = await SessionStore.create(cwd, { model: "test-model" });
  const turn = await store.appendTurn(store.leafId, "hello");
  const rawItem = {
    type: "message",
    role: "assistant",
    content: [{ type: "output_text", text: "hi" }],
  };
  const item = await store.appendResponseItem(turn.id, turn.id, rawItem);
  await store.appendTurnCompleted(item.id, turn.id, { ok: true });

  const loaded = await SessionStore.load(cwd, store.id);

  expect(loaded.id).toBe(store.id);
  expect(loaded.cwd).toBe(cwd);
  expect(loaded.config).toEqual({ model: "test-model" });
  expect(loaded.collectInjectItems()).toEqual([rawItem]);
});

test("persists Pico JSONL entries with tree metadata and raw response items", async () => {
  const store = await SessionStore.create(cwd, { model: "test-model" });
  const turn = await store.appendTurn(store.leafId, "inspect repo", { model: "turn-model" });
  const rawItem = {
    type: "function_call_output",
    call_id: "call-1",
    output: {
      success: true,
      body: [{ type: "text", text: "done" }],
    },
  };
  const item = await store.appendResponseItem(turn.id, turn.id, rawItem);
  const done = await store.appendTurnCompleted(item.id, turn.id, { codexTurnId: "codex-turn-1" });
  const branch = await store.appendBranch(done.id, "branch from done");
  await store.appendLabel(done.id, "root done");

  const lines = await readJsonl(store.path);

  expect(lines).toHaveLength(6);
  expect(lines[0]).toMatchObject({
    type: "session",
    version: 1,
    id: store.id,
    cwd,
    config: { model: "test-model" },
  });
  expect(lines[1]).toMatchObject({
    type: "turn",
    id: turn.id,
    parentId: store.id,
    userInput: "inspect repo",
    overrides: { model: "turn-model" },
  });
  expect(lines[2]).toMatchObject({
    type: "response_item",
    id: item.id,
    parentId: turn.id,
    turnId: turn.id,
    responseItem: rawItem,
  });
  expect(lines[3]).toMatchObject({
    type: "turn_completed",
    id: done.id,
    parentId: item.id,
    turnId: turn.id,
    result: { codexTurnId: "codex-turn-1" },
  });
  expect(lines[4]).toMatchObject({
    type: "branch",
    id: branch.id,
    parentId: done.id,
    targetId: done.id,
    name: "branch from done",
  });
  expect(lines[5]).toMatchObject({
    type: "label",
    parentId: done.id,
    targetId: done.id,
    label: "root done",
  });
});

test("loads turn status from terminal entries instead of persisted turn status", async () => {
  const store = await SessionStore.create(cwd);
  const turn = await store.appendTurn(store.leafId, "derive status");
  const item = await store.appendResponseItem(turn.id, turn.id, {
    type: "message",
    role: "assistant",
    content: [{ type: "output_text", text: "done" }],
  });
  await store.appendTurnCompleted(item.id, turn.id);

  const lines = await readJsonl(store.path);
  expect(lines[1]).toMatchObject({ type: "turn", status: "started" });

  const loaded = await SessionStore.load(cwd, store.id);
  const loadedTurn = loaded.allEntries.find((entry) => entry.type === "turn");
  expect(loadedTurn).toMatchObject({ id: turn.id, status: "completed" });
});

test("rejects JSONL entries with missing parents", async () => {
  const store = await SessionStore.create(cwd);
  const header = (await readJsonl(store.path))[0];
  await writeJsonl(store.path, [
    header,
    {
      type: "turn",
      id: "turn_missing_parent",
      parentId: "missing-parent",
      timestamp: new Date().toISOString(),
      userInput: "hello",
      cwd,
      status: "started",
      startedAt: new Date().toISOString(),
    },
  ]);

  await expect(SessionStore.load(cwd, store.id)).rejects.toThrow("Parent entry not found");
});

test("rejects JSONL with invalid session headers", async () => {
  const store = await SessionStore.create(cwd);
  await writeJsonl(store.path, [
    {
      type: "session",
      version: 1,
      id: store.id,
      createdAt: new Date().toISOString(),
      cwd,
      config: null,
    },
  ]);

  await expect(SessionStore.load(cwd, store.id)).rejects.toThrow("Invalid session header config");
});

test("rejects JSONL response items and terminal entries for unknown turns", async () => {
  const store = await SessionStore.create(cwd);
  const header = (await readJsonl(store.path))[0];
  await writeJsonl(store.path, [
    header,
    {
      type: "turn",
      id: "turn_valid",
      parentId: store.id,
      timestamp: new Date().toISOString(),
      userInput: "hello",
      cwd,
      status: "started",
      startedAt: new Date().toISOString(),
    },
    {
      type: "response_item",
      id: "item_bad_turn",
      parentId: "turn_valid",
      timestamp: new Date().toISOString(),
      turnId: "missing-turn",
      responseItem: { type: "message" },
    },
  ]);

  await expect(SessionStore.load(cwd, store.id)).rejects.toThrow("Turn entry not found");
});

test("rejects JSONL turns with multiple terminal entries", async () => {
  const store = await SessionStore.create(cwd);
  const header = (await readJsonl(store.path))[0];
  await writeJsonl(store.path, [
    header,
    {
      type: "turn",
      id: "turn_duplicate_terminal",
      parentId: store.id,
      timestamp: new Date().toISOString(),
      userInput: "hello",
      cwd,
      status: "started",
      startedAt: new Date().toISOString(),
    },
    {
      type: "turn_completed",
      id: "done_one",
      parentId: "turn_duplicate_terminal",
      timestamp: new Date().toISOString(),
      turnId: "turn_duplicate_terminal",
      status: "completed",
      completedAt: new Date().toISOString(),
    },
    {
      type: "turn_failed",
      id: "fail_two",
      parentId: "done_one",
      timestamp: new Date().toISOString(),
      turnId: "turn_duplicate_terminal",
      status: "failed",
      failedAt: new Date().toISOString(),
      error: "duplicate",
    },
  ]);

  await expect(SessionStore.load(cwd, store.id)).rejects.toThrow("terminal entry");
});

test("lists Pico sessions for the cwd", async () => {
  const first = await SessionStore.create(cwd);
  const second = await SessionStore.create(cwd);
  const turn = await second.appendTurn(second.leafId, "hello");
  const item = await second.appendResponseItem(turn.id, turn.id, {
    type: "message",
    role: "assistant",
    content: [{ type: "output_text", text: "hi" }],
  });
  await second.appendTurnCompleted(item.id, turn.id);

  const sessions = await SessionStore.list(cwd);

  expect(sessions.map((session) => session.id)).toContain(first.id);
  expect(sessions.map((session) => session.id)).toContain(second.id);
  expect(sessions.find((session) => session.id === second.id)).toMatchObject({
    leafId: second.leafId,
    turnCount: 1,
    responseItemCount: 1,
  });
});

test("collectInjectItems only returns the selected branch path", async () => {
  const store = await SessionStore.create(cwd);
  const firstTurn = await store.appendTurn(store.leafId, "root");
  const rootItem = await store.appendResponseItem(firstTurn.id, firstTurn.id, {
    id: "root-item",
    type: "message",
  });
  await store.appendTurnCompleted(rootItem.id, firstTurn.id);

  const branchPoint = rootItem.id;

  const leftTurn = await store.appendTurn(branchPoint, "left");
  const leftItem = await store.appendResponseItem(leftTurn.id, leftTurn.id, {
    id: "left-item",
    type: "message",
  });
  await store.appendTurnCompleted(leftItem.id, leftTurn.id);
  const leftLeaf = store.leafId;

  store.checkout(branchPoint);
  const rightTurn = await store.appendTurn(branchPoint, "right");
  const rightItem = await store.appendResponseItem(rightTurn.id, rightTurn.id, {
    id: "right-item",
    type: "message",
  });
  await store.appendTurnCompleted(rightItem.id, rightTurn.id);
  const rightLeaf = store.leafId;

  expect(store.collectInjectItems(leftLeaf).map((item) => item.id)).toEqual([
    "root-item",
    "left-item",
  ]);
  expect(store.collectInjectItems(rightLeaf).map((item) => item.id)).toEqual([
    "root-item",
    "right-item",
  ]);
});

test("loaded JSONL assembles injection items from the selected leaf path", async () => {
  const store = await SessionStore.create(cwd);
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
  const leftLeaf = store.leafId;

  await store.appendBranch(rootDone.id, "back to root");
  const rightTurn = await store.appendTurn(store.leafId, "right");
  const rightItem = await store.appendResponseItem(rightTurn.id, rightTurn.id, {
    id: "right-item",
    type: "message",
  });
  await store.appendTurnCompleted(rightItem.id, rightTurn.id);
  const rightLeaf = store.leafId;

  const loaded = await SessionStore.load(cwd, store.id);

  expect(loaded.collectInjectItems(leftLeaf).map((item) => item.id)).toEqual([
    "root-item",
    "left-item",
  ]);
  expect(loaded.collectInjectItems(rightLeaf).map((item) => item.id)).toEqual([
    "root-item",
    "right-item",
  ]);
  expect(loaded.collectInjectItems().map((item) => item.id)).toEqual([
    "root-item",
    "right-item",
  ]);
});

test("response items round-trip by deep equality", async () => {
  const store = await SessionStore.create(cwd);
  const turn = await store.appendTurn(store.leafId, "tools");
  const responseItem = {
    type: "function_call_output",
    call_id: "call-1",
    output: {
      success: true,
      body: [{ type: "text", text: "done" }],
    },
  };
  const item = await store.appendResponseItem(turn.id, turn.id, responseItem);
  await store.appendTurnCompleted(item.id, turn.id);

  const loaded = await SessionStore.load(cwd, store.id);
  expect(loaded.collectInjectItems()[0]).toEqual(responseItem);
});

test("labels do not move the leaf but branch entries do", async () => {
  const store = await SessionStore.create(cwd);
  const turn = await store.appendTurn(store.leafId, "root");
  const item = await store.appendResponseItem(turn.id, turn.id, {
    id: "root-item",
    type: "message",
  });
  await store.appendTurnCompleted(item.id, turn.id);
  const completedLeaf = store.leafId;

  await store.appendLabel(item.id, "root label");
  expect(store.leafId).toBe(completedLeaf);

  await store.appendBranch(item.id, "branch from item");
  const branchLeaf = store.leafId;
  expect(branchLeaf).not.toBe(completedLeaf);

  const loaded = await SessionStore.load(cwd, store.id);
  expect(loaded.leafId).toBe(branchLeaf);
  expect(loaded.collectInjectItems()).toEqual([{ id: "root-item", type: "message" }]);
});

async function readJsonl(path: string): Promise<Record<string, unknown>[]> {
  return (await Bun.file(path).text())
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function writeJsonl(path: string, lines: readonly Record<string, unknown>[]): Promise<void> {
  await Bun.write(path, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`);
}
