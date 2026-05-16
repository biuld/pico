import { expect, test } from "bun:test";
import {
  buildHistoryTurnRows,
  formatHistoryTurnRow,
  historySelectionTargetId,
  historySelectionTargetIndex,
} from "../src/tui/history";
import { createTuiState } from "../src/tui/core/state";
import { updateTuiState } from "../src/tui/core/update";
import { createViewState, setMockTurns, mockUserMessageItem, mockAgentMessageItem } from "./tui-test-helpers";

test("history picker shows flat turn list with agent summary", async () => {
  const viewState = await createViewState();
  setMockTurns(viewState, [
    {
      id: "turn-1",
      status: "completed",
      items: [
        mockUserMessageItem("u1", "Explain Pico history"),
        mockAgentMessageItem("a1", "Pico history is a turn tree."),
      ],
    },
  ]);

  const rows = buildHistoryTurnRows(viewState);
  const formatted = formatHistoryTurnRow(rows[0]);

  expect(rows).toHaveLength(1);
  expect(rows[0].turnIndex).toBe(0);
  expect(rows[0].isActive).toBe(true);
  expect(rows[0].isSelected).toBe(true);
  expect(rows[0].userText).toContain("Explain Pico history");
  expect(rows[0].agentSummary).toContain("agent:");
  expect(formatted).toContain("Explain Pico history");
  expect(formatted).toContain("agent: Pico history is a turn tree.");
  expect(historySelectionTargetId(viewState)).toBe("turn-1");
  expect(historySelectionTargetIndex(viewState)).toBe(0);
});

test("history agent summaries are truncated", async () => {
  const viewState = await createViewState();
  setMockTurns(viewState, [
    {
      id: "turn-1",
      status: "completed",
      items: [
        mockUserMessageItem("u1", "What can you do?"),
        mockAgentMessageItem("a1", "我可以在 Pico 项目里帮你做开发工作，比如：读代码、解释架构和数据流、实现功能或修 bug、重构 TUI。"),
      ],
    },
  ]);

  const rows = buildHistoryTurnRows(viewState);

  expect(rows[0].agentSummary).toContain("agent:");
  expect(rows[0].agentSummary.length).toBeLessThanOrEqual(48);
});

test("history shows multiple turns as flat list and selection uses turn index", async () => {
  const viewState = await createViewState();
  setMockTurns(viewState, [
    {
      id: "turn-1",
      status: "completed",
      items: [
        mockUserMessageItem("u1", "root prompt"),
        mockAgentMessageItem("a1", "root answer"),
      ],
    },
    {
      id: "turn-2",
      status: "completed",
      items: [
        mockUserMessageItem("u2", "left prompt"),
        mockAgentMessageItem("a2", "left answer"),
      ],
    },
    {
      id: "turn-3",
      status: "completed",
      items: [
        mockUserMessageItem("u3", "right prompt"),
        mockAgentMessageItem("a3", "right answer"),
      ],
    },
  ]);

  const rows = buildHistoryTurnRows(viewState);

  expect(rows.map((row) => row.userText)).toEqual([
    "root prompt",
    "left prompt",
    "right prompt",
  ]);
  expect(rows[0].isActive).toBe(false);
  expect(rows[2].isActive).toBe(true);

  // Selection via turn index
  let state = createTuiState(viewState);
  state = updateTuiState(state, { type: "openHistory" });
  state = updateTuiState(state, {
    type: "moveHistory",
    total: rows.length,
    delta: -1,
    viewportHeight: 8,
  });

  expect(state.selectedTurnIndex).toBe(1);
});

test("empty view state produces no history rows", async () => {
  const viewState = await createViewState();
  const rows = buildHistoryTurnRows(viewState);
  expect(rows).toHaveLength(0);
});
