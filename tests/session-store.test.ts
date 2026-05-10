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
  const item = await store.appendResponseItem(turn.id, "codex-turn-1", rawItem);
  await store.appendTurnCompleted(item.id, "codex-turn-1", { ok: true });

  const loaded = await SessionStore.load(cwd, store.id);

  expect(loaded.id).toBe(store.id);
  expect(loaded.cwd).toBe(cwd);
  expect(loaded.config).toEqual({ model: "test-model" });
  expect(loaded.collectInjectItems()).toEqual([rawItem]);
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
  const rootItem = await store.appendResponseItem(firstTurn.id, "turn-a", {
    id: "root-item",
    type: "message",
  });
  await store.appendTurnCompleted(rootItem.id, "turn-a");

  const branchPoint = rootItem.id;

  const leftTurn = await store.appendTurn(branchPoint, "left");
  const leftItem = await store.appendResponseItem(leftTurn.id, "turn-left", {
    id: "left-item",
    type: "message",
  });
  await store.appendTurnCompleted(leftItem.id, "turn-left");
  const leftLeaf = store.leafId;

  store.checkout(branchPoint);
  const rightTurn = await store.appendTurn(branchPoint, "right");
  const rightItem = await store.appendResponseItem(rightTurn.id, "turn-right", {
    id: "right-item",
    type: "message",
  });
  await store.appendTurnCompleted(rightItem.id, "turn-right");
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
  const item = await store.appendResponseItem(turn.id, "turn-tools", responseItem);
  await store.appendTurnCompleted(item.id, "turn-tools");

  const loaded = await SessionStore.load(cwd, store.id);
  expect(loaded.collectInjectItems()[0]).toEqual(responseItem);
});

test("labels do not move the leaf but branch entries do", async () => {
  const store = await SessionStore.create(cwd);
  const turn = await store.appendTurn(store.leafId, "root");
  const item = await store.appendResponseItem(turn.id, "turn-root", {
    id: "root-item",
    type: "message",
  });
  await store.appendTurnCompleted(item.id, "turn-root");
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
