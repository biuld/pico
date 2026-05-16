import { expect, test } from "bun:test";
import { buildHistoryTurnRows } from "../src/tui/history";
import {
  createTuiState,
  moveSelection,
  scrollTranscript,
  setTurnStatus,
  syncListScroll,
  updateInput,
} from "../src/tui/core/state";
import { updateTuiState } from "../src/tui/core/update";
import { createStore } from "./tui-test-helpers";

test("TUI state helpers keep surface state immutable", async () => {
  const store = await createStore();
  const state = createTuiState(store);
  const withInput = updateInput(state, "hello");
  const running = setTurnStatus(withInput, "running", "streaming");
  const scrolled = scrollTranscript(running, -10);
  const inHistory = updateTuiState(scrolled, { type: "openHistory", leafId: store.leafId });

  expect(state.bottomPane.draft).toBe("");
  expect(state.pickerSurface).toBe("none");
  expect(withInput.bottomPane.draft).toBe("hello");
  expect(running.bottomPane.turnStatus).toBe("running");
  expect(scrolled.transcriptScroll).toBe(0);
  expect(inHistory.pickerSurface).toBe("history");
});

test("selection helpers move through visible history turn ids and keep scroll in view", async () => {
  const store = await createStore();
  const turnA = await store.appendUserInput(store.leafId, "A");
  const itemA = await store.appendResponseItem(turnA.id, turnA.id, { text: "first" });
  const doneA = await store.appendEventMsg(itemA.id, { type: "turn_completed", turnId: turnA.id });
  const turnB = await store.appendUserInput(store.leafId, "B");
  const itemB = await store.appendResponseItem(turnB.id, turnB.id, { text: "second" });
  const doneB = await store.appendEventMsg(itemB.id, { type: "turn_completed", turnId: turnB.id });

  const ids = buildHistoryTurnRows(store).map((row) => row.id);
  let state = createTuiState(store);
  state = moveSelection(state, ids, -100);
  expect(state.selectedEntryId).toBe(doneA.id);

  state = moveSelection(state, ids, 1);
  expect(state.selectedEntryId).toBe(doneB.id);

  state = moveSelection(state, ids, 100);
  expect(state.selectedEntryId).toBe(doneB.id);

  state = syncListScroll(state, ids, 1);
  expect(state.historyScroll).toBeGreaterThan(0);
});
