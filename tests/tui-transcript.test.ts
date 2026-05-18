import { expect, test } from "bun:test";
import { formatStatusLine } from "../src/tui/render";
import { createTuiState, setTurnStatus } from "../src/tui/core/state";
import {
  buildTranscriptCells,
  buildTranscriptCellsWithLive,
} from "../src/tui/transcript";
import {
  compactTranscriptPreview,
  formatMainTranscriptOutputPreview,
  isMainTranscriptCellExpandedByDefault,
  limitedTranscriptOutputLines,
  mainTranscriptMuteStrategyForCell,
} from "../src/tui/widgets/transcript-panel";
import {
  createViewState, setMockTurns,
  mockUserMessageItem, mockAgentMessageItem,
  mockReasoningItem, mockPlanItem,
  mockCommandExecutionItem, mockFileChangeItem, mockFileUpdateChange,
} from "./tui-test-helpers";

// ── Basic transcript rendering ──

test("transcript cells render from CodexThreadViewState turns", async () => {
  const viewState = await createViewState();
  setMockTurns(viewState, [
    {
      id: "turn-1",
      status: "completed",
      items: [
        mockUserMessageItem("u1", "Explain Pico"),
        mockAgentMessageItem("a1", "Pico stores raw Codex items."),
      ],
    },
  ]);

  const state = setTurnStatus(createTuiState(viewState), "idle");
  const transcript = buildTranscriptCells(viewState);

  expect(transcript.length).toBeGreaterThan(0);
  expect(formatStatusLine(viewState, state)).toContain("pico");
});

test("transcript projects ThreadItem types into semantic cells", async () => {
  const viewState = await createViewState();
  setMockTurns(viewState, [
    {
      id: "turn-1",
      status: "completed",
      items: [
        mockUserMessageItem("u1", "Inspect the repo"),
        mockReasoningItem("r1", ["checking project files"]),
        mockPlanItem("p1", "## Plan\n1. Read code\n2. Run tests"),
        mockCommandExecutionItem("c1", "bun test"),
        mockFileChangeItem("f1", [mockFileUpdateChange("src/index.ts", "@@ changed")]),
      ],
    },
  ]);

  const cells = buildTranscriptCells(viewState);
  const kinds = cells.map((cell) => cell.kind);

  expect(kinds).toContain("user_message");
  expect(kinds).toContain("reasoning");
  expect(kinds).toContain("assistant_markdown");
  expect(kinds).toContain("command");
  expect(kinds).toContain("file_change");
});

test("transcript handles fileChange items", async () => {
  const viewState = await createViewState();
  setMockTurns(viewState, [
    {
      id: "turn-1",
      status: "completed",
      items: [
        mockUserMessageItem("u1", "Patch files"),
        mockFileChangeItem("fc1", [mockFileUpdateChange("src/cli.ts", "-old\n+new")]),
      ],
    },
  ]);

  const cells = buildTranscriptCells(viewState);
  const fileChangeCells = cells.filter((c) => c.kind === "file_change");

  expect(fileChangeCells.length).toBeGreaterThan(0);
  expect(fileChangeCells[0].blocks[0]?.type).toBe("file_change");
});

// ── Mute strategies ──

test("main transcript uses Codex-style mute strategies by cell type", () => {
  expect(mainTranscriptMuteStrategyForCell({
    id: "reasoning",
    kind: "reasoning",
    blocks: [{ type: "reasoning", payload: { text: "checking" } }],
  })).toBe("reasoning-summary");
  expect(mainTranscriptMuteStrategyForCell({
    id: "plan",
    kind: "plan_update",
    blocks: [{ type: "plan", payload: { steps: [{ step: "Read code", status: "completed" }] } }],
  })).toBe("expanded");
  expect(mainTranscriptMuteStrategyForCell({
    id: "tool-call",
    kind: "tool_call",
    blocks: [{ type: "tool", payload: { label: "web.fetch", detail: "url=https://example.test" } }],
  })).toBe("tool-call-summary");
  expect(mainTranscriptMuteStrategyForCell({
    id: "tool-output",
    kind: "tool_output",
    blocks: [{ type: "tool", payload: { body: "large output" } }],
  })).toBe("tool-output-preview");
  expect(mainTranscriptMuteStrategyForCell({
    id: "command",
    kind: "command",
    blocks: [{ type: "command", payload: { command: "bun test", output: "large output" } }],
  })).toBe("command-output-preview");
  expect(mainTranscriptMuteStrategyForCell({
    id: "running-command",
    kind: "command",
    status: "running",
    blocks: [{ type: "command", payload: { command: "bun test", output: "large output" } }],
  })).toBe("command-output-preview");
  expect(mainTranscriptMuteStrategyForCell({
    id: "file",
    kind: "file_change",
    blocks: [{ type: "file_change", payload: { path: "a.ts", diff: "@@ changed" } }],
  })).toBe("expanded");
  expect(isMainTranscriptCellExpandedByDefault({
    id: "assistant",
    kind: "assistant_markdown",
    blocks: [{ type: "markdown", payload: { text: "done", streaming: undefined } }],
  })).toBe(true);
});

// ── Output previews ──

test("main transcript output previews keep head tail and transcript hint", () => {
  const source = Array.from({ length: 12 }, (_, index) => `line ${index + 1}`).join("\n");

  expect(limitedTranscriptOutputLines(source, 5)).toEqual({
    lines: [
      "line 1",
      "line 2",
      "... +8 lines (ctrl + t to view transcript)",
      "line 11",
      "line 12",
    ],
    omitted: 8,
  });
  expect(formatMainTranscriptOutputPreview("alpha\nbeta", { includeAnglePipe: true })).toBe(
    "  └ alpha\n    beta",
  );
  expect(formatMainTranscriptOutputPreview("alpha\nbeta", { includePrefix: false })).toBe(
    "alpha\nbeta",
  );
  expect(limitedTranscriptOutputLines("short\n0123456789abcdefghijklmnopqrstuvwxyz", 5, 16)).toEqual({
    lines: ["short", "0123456...uvwxyz"],
    omitted: 0,
  });
});

// ── Live streaming ──

test("transcript appends non-persisted live streaming cells", async () => {
  const viewState = await createViewState();
  const app = { viewState } as Parameters<typeof buildTranscriptCellsWithLive>[0];

  expect(buildTranscriptCellsWithLive(app, "partial response")).toEqual([
    {
      id: "live",
      kind: "assistant_markdown",
      status: undefined,
      blocks: [{ type: "markdown", payload: { text: "partial response", streaming: true } }],
    },
  ]);
});

test("transcript ignores stale external live items after completed thread refresh", async () => {
  const viewState = await createViewState();
  const completedItem = mockAgentMessageItem("a1", "completed response");
  setMockTurns(viewState, [
    {
      id: "turn-1",
      status: "completed",
      items: [completedItem],
    },
  ]);
  const app = { viewState } as Parameters<typeof buildTranscriptCellsWithLive>[0];

  const cells = buildTranscriptCellsWithLive(app, "", [completedItem]);

  expect(viewState.liveTurnItems).toHaveLength(0);
  expect(cells.filter((cell) => cell.id === "a1")).toHaveLength(1);
});

test("compactTranscriptPreview joins lines and truncates", () => {
  expect(compactTranscriptPreview("one\n\n two   three", 12)).toBe("one two t...");
});
