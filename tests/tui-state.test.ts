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
import { createViewState, setMockTurns, mockUserMessageItem, mockAgentMessageItem } from "./tui-test-helpers";

test("TUI state helpers keep surface state immutable", async () => {
  const viewState = await createViewState();
  const state = createTuiState(viewState);
  const withInput = updateInput(state, "hello");
  const running = setTurnStatus(withInput, "running", "streaming");
  const scrolled = scrollTranscript(running, -10);
  const inHistory = updateTuiState(scrolled, { type: "openHistory" });

  expect(state.bottomPane.draft).toBe("");
  expect(state.pickerSurface).toBe("none");
  expect(withInput.bottomPane.draft).toBe("hello");
  expect(running.bottomPane.turnStatus).toBe("running");
  expect(scrolled.transcriptScroll).toBe(0);
  expect(inHistory.pickerSurface).toBe("history");
});

test("selection helpers move through flat turn list and keep scroll in view", async () => {
  const viewState = await createViewState();
  setMockTurns(viewState, [
    {
      id: "turn-1",
      status: "completed",
      items: [
        mockUserMessageItem("u1", "A"),
        mockAgentMessageItem("a1", "first"),
      ],
    },
    {
      id: "turn-2",
      status: "completed",
      items: [
        mockUserMessageItem("u2", "B"),
        mockAgentMessageItem("a2", "second"),
      ],
    },
  ]);

  const total = buildHistoryTurnRows(viewState).length;
  let state = createTuiState(viewState);

  state = moveSelection(state, total, -100);
  expect(state.selectedTurnIndex).toBe(0);

  state = moveSelection(state, total, 1);
  expect(state.selectedTurnIndex).toBe(1);

  state = moveSelection(state, total, 100);
  expect(state.selectedTurnIndex).toBe(1);

  state = syncListScroll(state, total, 1);
  expect(state.historyScroll).toBeGreaterThan(0);
});
