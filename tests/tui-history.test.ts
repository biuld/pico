import { expect, test } from "bun:test";
import {
  buildHistoryTurnRows,
  formatHistoryTurnRow,
  historySelectionTargetId,
} from "../src/tui/history";
import { createTuiState } from "../src/tui/state";
import { updateTuiState } from "../src/tui/update";
import { createStore } from "./tui-test-helpers";

test("history overlay groups each turn as a tree node with an agent summary", async () => {
  const store = await createStore();
  const turn = await store.appendTurn(store.leafId, "Explain Pico history");
  await store.appendResponseItem(turn.id, turn.id, {
    type: "message",
    role: "developer",
    content: [{ type: "input_text", text: "hidden instructions" }],
  });
  const item = await store.appendResponseItem(turn.id, turn.id, {
    type: "message",
    role: "assistant",
    content: [{ type: "output_text", text: "Pico history is a turn tree." }],
  });
  await store.appendTurnCompleted(item.id, turn.id);

  const rows = buildHistoryTurnRows(store, store.leafId);
  const formatted = formatHistoryTurnRow(rows[0]);

  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    id: store.leafId,
    turnId: turn.id,
    isActive: true,
    isSelected: true,
    userPrefix: "└── ",
    userText: "Explain Pico history",
    agentSummary: "agent: Pico history is a turn tree.",
  });
  expect(formatted).toContain("└──   Explain Pico history");
  expect(formatted).toContain("      agent: Pico history is a turn tree.");
  expect(formatted).not.toContain("hidden instructions");
  expect(historySelectionTargetId(store)).toBe(store.leafId);
});

test("history agent summaries only keep the first characters", async () => {
  const store = await createStore();
  const turn = await store.appendTurn(store.leafId, "What can you do?");
  const item = await store.appendResponseItem(turn.id, turn.id, {
    type: "message",
    role: "assistant",
    content: [{
      type: "output_text",
      text: "我可以在 Pico 项目里帮你做开发工作，比如：读代码、解释架构和数据流、实现功能或修 bug、重构 TUI。",
    }],
  });
  await store.appendTurnCompleted(item.id, turn.id);

  const rows = buildHistoryTurnRows(store, store.leafId);

  expect(rows[0].agentSummary).toBe(
    "agent: 我可以在 Pico 项目里帮你做开发工作，比如：读代码、解释架构和数据...",
  );
  expect(rows[0].agentSummary.length).toBeLessThanOrEqual(48);
});

test("history keeps direct turn history as siblings and selection moves only across turns", async () => {
  const store = await createStore();
  const rootTurn = await store.appendTurn(store.leafId, "root prompt");
  const rootItem = await store.appendResponseItem(rootTurn.id, rootTurn.id, {
    role: "assistant",
    text: "root answer",
  });
  await store.appendTurnCompleted(rootItem.id, rootTurn.id);
  const rootLeaf = store.leafId;

  const leftTurn = await store.appendTurn(rootLeaf, "left prompt");
  const leftItem = await store.appendResponseItem(leftTurn.id, leftTurn.id, {
    role: "assistant",
    text: "left answer",
  });
  const leftDone = await store.appendTurnCompleted(leftItem.id, leftTurn.id);

  store.checkout(rootLeaf);
  const rightTurn = await store.appendTurn(rootLeaf, "right prompt");
  const rightItem = await store.appendResponseItem(rightTurn.id, rightTurn.id, {
    role: "assistant",
    text: "right answer",
  });
  await store.appendTurnCompleted(rightItem.id, rightTurn.id);

  const rows = buildHistoryTurnRows(store, store.leafId);
  const ids = rows.map((row) => row.id);
  let state = createTuiState(store);
  state = updateTuiState(state, { type: "openHistory", leafId: historySelectionTargetId(store)! });
  state = updateTuiState(state, {
    type: "moveHistory",
    entryIds: ids,
    delta: -1,
    viewportHeight: 8,
  });

  expect(rows.map((row) => row.userText)).toEqual([
    "root prompt",
    "left prompt",
    "right prompt",
  ]);
  expect(rows[0].userPrefix).toBe("├── ");
  expect(rows[1].userPrefix).toBe("├── ");
  expect(rows[2].userPrefix).toBe("└── ");
  expect(state.selectedEntryId).toBe(leftDone.id);
});
