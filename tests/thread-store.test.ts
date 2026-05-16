import { beforeEach, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PicoThreadStore, entryUserText } from "../src/thread/store";
import { parseJsonl } from "../src/thread/jsonl";

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "pico-cwd-"));
});

test("stores entries as rollout entries with a unified RolloutItem ADT", async () => {
  const store = await PicoThreadStore.create(cwd, { model: "test-model" });
  const user = await store.appendUserInput(store.leafId, "hello");
  const assistant = await store.appendResponseItem(user.id, {
    id: "assistant-1",
    type: "message",
    role: "assistant",
    content: [{ type: "output_text", text: "hi" }],
  });
  await store.appendEventMsg(assistant.id, { type: "turn_completed", turnId: user.id });

  const lines = parseJsonl(await Bun.file(store.path).text());
  expect(lines.slice(1).every((line) => "type" in (line as Record<string, unknown>) && "payload" in (line as Record<string, unknown>))).toBe(true);
  expect(lines[1]).toMatchObject({
    id: user.id,
    type: "response_item",
    parent: store.id,
  });
  expect(lines[2]).toMatchObject({
    id: assistant.id,
    type: "response_item",
    parent: user.id,
    payload: { id: "assistant-1" },
  });
  expect(lines[3]).toMatchObject({
    type: "event_msg",
    parent: assistant.id,
    payload: { type: "turn_completed" },
  });
});

test("backtrack changes only the in-memory leaf and reload returns to persisted tip", async () => {
  const store = await PicoThreadStore.create(cwd);
  const first = await store.appendUserInput(store.leafId, "first");
  const second = await store.appendUserInput(first.id, "second");

  store.backtrack(first.id);
  expect(store.leafId).toBe(first.id);
  expect(parseJsonl(await Bun.file(store.path).text())).toHaveLength(3);

  const loaded = await PicoThreadStore.load(cwd, store.id);
  expect(loaded.leafId).toBe(second.id);
});

test("backtrack then append creates exactly one branch_out entry", async () => {
  const store = await PicoThreadStore.create(cwd);
  const root = await store.appendUserInput(store.leafId, "root");
  const left = await store.appendUserInput(root.id, "left");

  store.backtrack(root.id);
  const parent = await store.ensureBranchForAppend();
  const right = await store.appendUserInput(parent, "right");

  const branchEntries = store.lines.filter((entry) => entry.type === "branch_out");
  expect(branchEntries).toHaveLength(1);
  expect(branchEntries[0]).toMatchObject({ parent: root.id, type: "branch_out" });
  expect(right.parent).toBe(branchEntries[0].id);
  expect(left.parent).toBe(root.id);
});

test("empty branch_out remains appendable and is not duplicated", async () => {
  const store = await PicoThreadStore.create(cwd);
  const root = await store.appendUserInput(store.leafId, "root");
  const left = await store.appendUserInput(root.id, "left");

  store.backtrack(root.id);
  const branch = await store.ensureBranchForAppend();
  expect(store.lines.at(-1)?.type).toBe("branch_out");
  const parent = await store.ensureBranchForAppend();
  const right = await store.appendUserInput(parent, "right");

  expect(parent).toBe(branch);
  expect(right.parent).toBe(branch);
  expect(store.lines.filter((entry) => entry.type === "branch_out")).toHaveLength(1);
  expect(left.parent).toBe(root.id);
});

test("linearizeForCodex skips branch_out and preserves selected path rollout items", async () => {
  const store = await PicoThreadStore.create(cwd);
  const root = await store.appendUserInput(store.leafId, "root");
  const rootAssistant = await store.appendResponseItem(root.id, { id: "root-item", type: "message" });
  await store.appendUserInput(rootAssistant.id, "left");

  store.backtrack(rootAssistant.id);
  const branch = await store.ensureBranchForAppend();
  const right = await store.appendUserInput(branch, "right");
  await store.appendResponseItem(right.id, { id: "right-item", type: "message" });

  const linearized = store.linearizeForCodex() as Array<Record<string, any>>;
  expect(linearized.map((line) => line.type)).toEqual([
    "response_item",
    "response_item",
    "response_item",
    "response_item",
  ]);
  expect(linearized.map((line) => line.payload?.id).filter(Boolean)).toEqual([
    root.type === "response_item" ? (root.payload as Record<string, unknown>).id as string : undefined,
    "root-item",
    right.type === "response_item" ? (right.payload as Record<string, unknown>).id as string : undefined,
    "right-item",
  ]);
  expect(linearized.some((line) => line.type === "branch_out")).toBe(false);
});

test("thread listing summarizes user response items and assistant response items", async () => {
  const first = await PicoThreadStore.create(cwd);
  const second = await PicoThreadStore.create(cwd);
  const user = await second.appendUserInput(second.leafId, "hello");
  await second.appendResponseItem(user.id, { id: "assistant", type: "message" });

  const threads = await PicoThreadStore.list(cwd);

  expect(threads.map((thread) => thread.id)).toContain(first.id);
  expect(threads.find((thread) => thread.id === second.id)).toMatchObject({
    leafId: second.leafId,
    preview: "hello",
    turnCount: 1,
    responseItemCount: 2,
  });
});

test("collectInjectItems returns assistant items only from the selected branch path", async () => {
  const store = await PicoThreadStore.create(cwd);
  const root = await store.appendUserInput(store.leafId, "root");
  const rootAssistant = await store.appendResponseItem(root.id, { id: "root-item", type: "message" });
  const left = await store.appendUserInput(rootAssistant.id, "left");
  await store.appendResponseItem(left.id, { id: "left-item", type: "message" });

  store.backtrack(rootAssistant.id);
  const branch = await store.ensureBranchForAppend();
  const right = await store.appendUserInput(branch, "right");
  await store.appendResponseItem(right.id, { id: "right-item", type: "message" });

  expect(store.collectInjectItems().map((item) => item.id)).toEqual(["root-item", "right-item"]);
  expect(store.getPathEntries().map((line) => entryUserText(line)).filter(Boolean)).toEqual([
    "root",
    "right",
  ]);
});
