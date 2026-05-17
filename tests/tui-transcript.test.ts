import { expect, test } from "bun:test";
import { formatStatusLine } from "../src/tui/render";
import { createTuiState, setTurnStatus } from "../src/tui/core/state";
import {
  blockText,
  buildTranscriptCells,
  buildTranscriptCellsWithLive,
  type TranscriptCell,
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
  mockUserMessageItem, mockAgentMessageItem, mockReasoningItem, mockPlanItem,
  mockCommandExecutionItem, mockFileChangeItem, mockFileUpdateChange,
  mockMcpToolCallItem, mockDynamicToolCallItem, mockWebSearchItem,
  mockImageGenerationItem, mockImageViewItem,
  mockEnteredReviewModeItem, mockContextCompactionItem,
  mockHookPromptItem, mockCollabAgentToolCallItem,
} from "./tui-test-helpers";
import type { ThreadItem, FileUpdateChange } from "@pico/codex-app-server-protocol/v2";
import { CodexThreadViewState } from "../src/app/codex-thread-view-state";
import { threadItemToTranscriptCells } from "../src/tui/transcript/thread-item";

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
  expect(kinds).toContain("assistant_markdown"); // plan is rendered as markdown
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

// ── ThreadItem → TranscriptCell mapping ──

test("threadItemToTranscriptCells: userMessage", () => {
  const cells = threadItemToTranscriptCells("u1", mockUserMessageItem("u1", "hello world"));
  expect(cells).toHaveLength(1);
  expect(cells[0].kind).toBe("user_message");
});

test("threadItemToTranscriptCells: agentMessage", () => {
  const cells = threadItemToTranscriptCells("a1", mockAgentMessageItem("a1", "I can help"));
  expect(cells).toHaveLength(1);
  expect(cells[0].kind).toBe("assistant_markdown");
  expect(cells[0].blocks[0]).toMatchObject({ type: "markdown", payload: { text: "I can help" } });
});

test("threadItemToTranscriptCells: reasoning", () => {
  const cells = threadItemToTranscriptCells("r1", mockReasoningItem("r1", ["step 1"]));
  expect(cells).toHaveLength(1);
  expect(cells[0].kind).toBe("reasoning");
  expect(cells[0].blocks[0]).toMatchObject({ type: "reasoning", payload: { text: "step 1" } });
});

test("threadItemToTranscriptCells: plan", () => {
  const cells = threadItemToTranscriptCells("p1", mockPlanItem("p1", "## Plan"));
  expect(cells).toHaveLength(1);
  expect(cells[0].kind).toBe("assistant_markdown");
});

test("threadItemToTranscriptCells: commandExecution", () => {
  const cells = threadItemToTranscriptCells("c1", mockCommandExecutionItem("c1", "ls", { aggregatedOutput: "file.txt" }));
  expect(cells).toHaveLength(1);
  expect(cells[0].kind).toBe("command");
  expect(cells[0].blocks[0]).toMatchObject({ type: "command", payload: { command: "ls", output: "file.txt" } });
});

test("threadItemToTranscriptCells: fileChange", () => {
  const cells = threadItemToTranscriptCells("f1",
    mockFileChangeItem("f1", [mockFileUpdateChange("a.ts", "-old\n+new")]));
  expect(cells.length).toBeGreaterThanOrEqual(1);
  expect(cells[0].kind).toBe("file_change");
});

test("threadItemToTranscriptCells: mcpToolCall", () => {
  const cells = threadItemToTranscriptCells("m1", mockMcpToolCallItem("m1", "filesystem", "read", { path: "/x" }));
  expect(cells).toHaveLength(1);
  expect(cells[0].kind).toBe("tool_call");
  expect(cells[0].blocks[0]).toMatchObject({
    type: "tool",
    payload: { label: "filesystem/read", detail: expect.stringContaining("path") },
  });
});

test("threadItemToTranscriptCells: dynamicToolCall", () => {
  const cells = threadItemToTranscriptCells("d1", mockDynamicToolCallItem("d1", "search", "grep", { q: "test" }));
  expect(cells).toHaveLength(1);
  expect(cells[0].kind).toBe("tool_call");
});

test("threadItemToTranscriptCells: webSearch", () => {
  const cells = threadItemToTranscriptCells("w1", mockWebSearchItem("w1", "pico codex tui"));
  expect(cells).toHaveLength(1);
  expect(cells[0].kind).toBe("tool_call");
});

test("threadItemToTranscriptCells: imageGeneration", () => {
  const cells = threadItemToTranscriptCells("i1", mockImageGenerationItem("i1", "a cat"));
  expect(cells).toHaveLength(1);
  expect(cells[0].kind).toBe("tool_call");
});

test("threadItemToTranscriptCells: imageView", () => {
  const cells = threadItemToTranscriptCells("v1", mockImageViewItem("v1", "/tmp/img.png"));
  expect(cells).toHaveLength(1);
  expect(cells[0].kind).toBe("tool_call");
});

test("threadItemToTranscriptCells: enteredReviewMode", () => {
  const cells = threadItemToTranscriptCells("rv1", mockEnteredReviewModeItem("rv1", "diff review"));
  expect(cells).toHaveLength(1);
  expect(cells[0].kind).toBe("system_notice");
});

test("threadItemToTranscriptCells: contextCompaction", () => {
  const cells = threadItemToTranscriptCells("cc1", mockContextCompactionItem("cc1"));
  expect(cells).toHaveLength(1);
  expect(cells[0].kind).toBe("system_notice");
});

test("threadItemToTranscriptCells: hookPrompt is hidden", () => {
  const cells = threadItemToTranscriptCells("hp1", mockHookPromptItem("hp1"));
  expect(cells).toHaveLength(0);
});

test("threadItemToTranscriptCells: collabAgentToolCall", () => {
  const cells = threadItemToTranscriptCells("ca1", mockCollabAgentToolCallItem("ca1", "code-reviewer"));
  expect(cells).toHaveLength(1);
  expect(cells[0].kind).toBe("tool_call");
  expect(cells[0].blocks[0]).toMatchObject({
    type: "tool",
    payload: { label: "collab:code-reviewer" },
  });
});

test("threadItemToTranscriptCells: unknown type shows muted notice", () => {
  const cells = threadItemToTranscriptCells("ux1", {
    type: "futureItemType", id: "ux1",
  } as unknown as ThreadItem);
  expect(cells).toHaveLength(1);
  expect(cells[0].kind).toBe("system_notice");
  expect(cells[0].blocks[0]).toMatchObject({
    type: "text",
    payload: { text: "item: futureItemType" },
  });
});

// ── Live transcript state rendering ──

test("buildTranscriptCells renders liveReasoningText", () => {
  const viewState = CodexThreadViewState.create("/tmp");
  viewState.startTurn("test");
  viewState.appendReasoningDelta("thinking step 1");

  const cells = buildTranscriptCells(viewState);
  const reasoning = cells.find((c) => c.kind === "reasoning");
  expect(reasoning).toBeDefined();
  expect(reasoning!.blocks[0]).toMatchObject({
    type: "reasoning",
    payload: { text: "thinking step 1" },
  });
});

test("buildTranscriptCells renders liveCommandOutputs", () => {
  const viewState = CodexThreadViewState.create("/tmp");
  viewState.startTurn("test");
  viewState.appendCommandOutput("cmd-1", "file.txt\n");

  const cells = buildTranscriptCells(viewState);
  const cmd = cells.find((c) => c.kind === "command");
  expect(cmd).toBeDefined();
});

test("buildTranscriptCells renders liveFileChanges", () => {
  const viewState = CodexThreadViewState.create("/tmp");
  viewState.startTurn("test");
  viewState.setLiveFileChanges("fc-1", [
    { path: "a.ts", kind: { type: "update" } as unknown as FileUpdateChange["kind"], diff: "-old\n+new" },
  ]);

  const cells = buildTranscriptCells(viewState);
  const fc = cells.find((c) => c.kind === "file_change");
  expect(fc).toBeDefined();
});

test("buildTranscriptCells skips streamingText when live agentMessage is present", () => {
  const viewState = CodexThreadViewState.create("/tmp");
  viewState.startTurn("test");
  viewState.appendDelta("streaming text");
  viewState.addLiveItem(mockAgentMessageItem("a1", "complete response"));

  const cells = buildTranscriptCells(viewState);
  // Should have the completed agentMessage, not the streaming cell
  expect(cells.some((c) => c.kind === "assistant_markdown" && c.id === "a1")).toBe(true);
  expect(cells.some((c) => c.id === "live")).toBe(false);
});

test("addLiveItem clears liveReasoningText when completed reasoning arrives", () => {
  const viewState = CodexThreadViewState.create("/tmp");
  viewState.startTurn("test");
  viewState.appendReasoningDelta("live thinking...");
  viewState.addLiveItem(mockReasoningItem("r1", ["final thought"]));
  expect(viewState.liveReasoningText).toBe("");
});

test("addLiveItem clears liveCommandOutputs when completed commandExecution arrives", () => {
  const viewState = CodexThreadViewState.create("/tmp");
  viewState.startTurn("test");
  viewState.appendCommandOutput("cmd-1", "live output...");
  viewState.addLiveItem(mockCommandExecutionItem("cmd-1", "ls"));
  expect(viewState.liveCommandOutputs.has("cmd-1")).toBe(false);
});

test("addLiveItem clears liveFileChanges when completed fileChange arrives", () => {
  const viewState = CodexThreadViewState.create("/tmp");
  viewState.startTurn("test");
  viewState.setLiveFileChanges("fc-1", [mockFileUpdateChange("a.ts", "-old\n+new")]);
  viewState.addLiveItem(mockFileChangeItem("fc-1", [mockFileUpdateChange("a.ts", "final")]));
  expect(viewState.liveFileChanges.has("fc-1")).toBe(false);
});

test("buildTranscriptCells shows no duplicate after live reasoning + completed reasoning", () => {
  const viewState = CodexThreadViewState.create("/tmp");
  viewState.startTurn("test");
  viewState.appendReasoningDelta("live think...");
  viewState.addLiveItem(mockReasoningItem("r2", ["final thought"]));

  const cells = buildTranscriptCells(viewState);
  const reasoning = cells.filter((c) => c.kind === "reasoning");
  expect(reasoning).toHaveLength(1);
});

// ── Live plan update rendering ──

test("buildTranscriptCells renders livePlan", () => {
  const viewState = CodexThreadViewState.create("/tmp");
  viewState.startTurn("test");
  viewState.setLivePlan("need to read and patch", [
    { step: "Read config", status: "completed" },
    { step: "Patch file", status: "inProgress" },
    { step: "Run tests", status: "pending" },
  ]);

  const cells = buildTranscriptCells(viewState);
  const plan = cells.find((c) => c.kind === "plan_update");
  expect(plan).toBeDefined();
  expect(plan!.blocks[0]?.type).toBe("plan");
});

test("addLiveItem clears livePlan when completed plan item arrives", () => {
  const viewState = CodexThreadViewState.create("/tmp");
  viewState.startTurn("test");
  viewState.setLivePlan(null, [{ step: "Do it", status: "inProgress" }]);
  expect(viewState.livePlan).not.toBeNull();

  viewState.addLiveItem(mockPlanItem("p1", "## Plan"));
  expect(viewState.livePlan).toBeNull();
});

test("buildTranscriptCells shows no duplicate after live plan + completed plan item", () => {
  const viewState = CodexThreadViewState.create("/tmp");
  viewState.startTurn("test");
  viewState.setLivePlan("planning", [{ step: "Step 1", status: "inProgress" }]);
  // Completed plan item arrives — clears livePlan, renders as assistant_markdown
  viewState.addLiveItem(mockPlanItem("p2", "## Plan"));

  const cells = buildTranscriptCells(viewState);
  // Live plan should be cleared; completed plan renders as assistant_markdown
  expect(viewState.livePlan).toBeNull();
  expect(cells.filter((c) => c.kind === "plan_update")).toHaveLength(0);
  expect(cells.some((c) => c.kind === "assistant_markdown" && c.id === "p2")).toBe(true);
});

// ── Tool/MCP display quality ──

function toolPayload(cell: { blocks: readonly { type: string; payload: unknown }[] }) {
  return cell.blocks[0]?.payload as { label?: string; detail?: string; status?: string };
}

test("threadItemToTranscriptCells: mcpToolCall shows args preview in detail", () => {
  const cells = threadItemToTranscriptCells("m1", mockMcpToolCallItem("m1", "fs", "read", { path: "/x" }));
  expect(cells).toHaveLength(1);
  expect(toolPayload(cells[0]).detail).toContain("path");
});

test("threadItemToTranscriptCells: mcpToolCall shows duration when present", () => {
  const item = {
    type: "mcpToolCall", id: "dur1", server: "fs", tool: "stat",
    arguments: {}, status: "completed", result: null, error: null,
    durationMs: 1234,
  } as unknown as ThreadItem;

  const cells = threadItemToTranscriptCells("dur1", item);
  expect(toolPayload(cells[0]).detail).toContain("1234ms");
});

test("threadItemToTranscriptCells: mcpToolCall with error shows error in detail", () => {
  const item = {
    type: "mcpToolCall", id: "err1", server: "fs", tool: "write",
    arguments: { path: "/x", content: "data" },
    status: "failed", result: null,
    error: { message: "permission denied" },
    durationMs: 150,
  } as unknown as ThreadItem;

  const cells = threadItemToTranscriptCells("err1", item);
  expect(cells).toHaveLength(1);
  expect(cells[0].status).toBe("failed");
  const detail = toolPayload(cells[0]).detail!;
  expect(detail).toContain("error: permission denied");
  expect(detail).toContain("150ms");
});

test("threadItemToTranscriptCells: tool detail truncates long args", () => {
  const longArgs = { data: "x".repeat(300) };
  const item = {
    type: "mcpToolCall", id: "t1", server: "fs", tool: "read",
    arguments: longArgs, status: "completed", result: null, error: null, durationMs: null,
  } as unknown as ThreadItem;

  const cells = threadItemToTranscriptCells("t1", item);
  const detail = toolPayload(cells[0]).detail!;
  expect(detail.length).toBeLessThanOrEqual(210);
});

test("threadItemToTranscriptCells: dynamicToolCall shows namespace/tool label", () => {
  const cells = threadItemToTranscriptCells("d1", mockDynamicToolCallItem("d1", "search", "grep", { q: "test" }));
  expect(toolPayload(cells[0]).label).toBe("search/grep");
});
