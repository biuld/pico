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
import { createViewState, setMockTurns, mockAgentMessageItem } from "./tui-test-helpers";
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
        { type: "userMessage", id: "u1", content: [{ type: "text", text: "Explain Pico" }] } as ThreadItem,
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
        { type: "userMessage", id: "u1", content: [{ type: "text", text: "Inspect the repo" }] } as ThreadItem,
        { type: "reasoning", id: "r1", summary: ["checking project files"], content: [] } as ThreadItem,
        { type: "plan", id: "p1", text: "## Plan\n1. Read code\n2. Run tests" } as ThreadItem,
        { type: "commandExecution", id: "c1", command: "bun test", cwd: "/app" } as ThreadItem,
        { type: "fileChange", id: "f1", changes: [{ path: "src/index.ts", kind: { type: "update", move_path: null }, diff: "@@ changed" }] } as unknown as ThreadItem,
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
        { type: "userMessage", id: "u1", content: [{ type: "text", text: "Patch files" }] } as ThreadItem,
        {
          type: "fileChange",
          id: "fc1",
          changes: [{ path: "src/cli.ts", kind: { type: "update", move_path: null }, diff: "-old\n+new" }],
        } as unknown as ThreadItem,
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
  const cells = threadItemToTranscriptCells("u1", {
    type: "userMessage",
    id: "u1",
    content: [{ type: "text", text: "hello world" }],
  } as ThreadItem);
  expect(cells).toHaveLength(1);
  expect(cells[0].kind).toBe("user_message");
});

test("threadItemToTranscriptCells: agentMessage", () => {
  const cells = threadItemToTranscriptCells("a1", {
    type: "agentMessage", id: "a1", text: "I can help", phase: null, memoryCitation: null,
  } as ThreadItem);
  expect(cells).toHaveLength(1);
  expect(cells[0].kind).toBe("assistant_markdown");
  expect(cells[0].blocks[0]).toMatchObject({ type: "markdown", payload: { text: "I can help" } });
});

test("threadItemToTranscriptCells: reasoning", () => {
  const cells = threadItemToTranscriptCells("r1", {
    type: "reasoning", id: "r1", summary: ["step 1"], content: [],
  } as ThreadItem);
  expect(cells).toHaveLength(1);
  expect(cells[0].kind).toBe("reasoning");
  expect(cells[0].blocks[0]).toMatchObject({ type: "reasoning", payload: { text: "step 1" } });
});

test("threadItemToTranscriptCells: plan", () => {
  const cells = threadItemToTranscriptCells("p1", {
    type: "plan", id: "p1", text: "## Plan",
  } as ThreadItem);
  expect(cells).toHaveLength(1);
  expect(cells[0].kind).toBe("assistant_markdown");
});

test("threadItemToTranscriptCells: commandExecution", () => {
  const cells = threadItemToTranscriptCells("c1", {
    type: "commandExecution", id: "c1", command: "ls", cwd: "/app",
    aggregatedOutput: "file.txt",
  } as ThreadItem);
  expect(cells).toHaveLength(1);
  expect(cells[0].kind).toBe("command");
  expect(cells[0].blocks[0]).toMatchObject({ type: "command", payload: { command: "ls", output: "file.txt" } });
});

test("threadItemToTranscriptCells: fileChange", () => {
  const cells = threadItemToTranscriptCells("f1", {
    type: "fileChange", id: "f1",
    changes: [{ path: "a.ts", kind: { type: "update", move_path: null }, diff: "-old\n+new" }],
  } as unknown as ThreadItem);
  expect(cells.length).toBeGreaterThanOrEqual(1);
  expect(cells[0].kind).toBe("file_change");
});

test("threadItemToTranscriptCells: mcpToolCall", () => {
  const cells = threadItemToTranscriptCells("m1", {
    type: "mcpToolCall", id: "m1", server: "filesystem", tool: "read",
    arguments: { path: "/x" },
  } as unknown as ThreadItem);
  expect(cells).toHaveLength(1);
  expect(cells[0].kind).toBe("tool_call");
  expect(cells[0].blocks[0]).toMatchObject({
    type: "tool",
    payload: { label: "filesystem/read", detail: expect.stringContaining("path") },
  });
});

test("threadItemToTranscriptCells: dynamicToolCall", () => {
  const cells = threadItemToTranscriptCells("d1", {
    type: "dynamicToolCall", id: "d1", namespace: "search", tool: "grep",
    arguments: { q: "test" },
  } as unknown as ThreadItem);
  expect(cells).toHaveLength(1);
  expect(cells[0].kind).toBe("tool_call");
});

test("threadItemToTranscriptCells: webSearch", () => {
  const cells = threadItemToTranscriptCells("w1", {
    type: "webSearch", id: "w1", query: "pico codex tui",
  } as ThreadItem);
  expect(cells).toHaveLength(1);
  expect(cells[0].kind).toBe("tool_call");
});

test("threadItemToTranscriptCells: imageGeneration", () => {
  const cells = threadItemToTranscriptCells("i1", {
    type: "imageGeneration", id: "i1", revisedPrompt: "a cat", result: "done",
  } as ThreadItem);
  expect(cells).toHaveLength(1);
  expect(cells[0].kind).toBe("tool_call");
});

test("threadItemToTranscriptCells: imageView", () => {
  const cells = threadItemToTranscriptCells("v1", {
    type: "imageView", id: "v1", path: "/tmp/img.png",
  } as ThreadItem);
  expect(cells).toHaveLength(1);
  expect(cells[0].kind).toBe("tool_call");
});

test("threadItemToTranscriptCells: enteredReviewMode", () => {
  const cells = threadItemToTranscriptCells("rv1", {
    type: "enteredReviewMode", id: "rv1", review: "diff review",
  } as ThreadItem);
  expect(cells).toHaveLength(1);
  expect(cells[0].kind).toBe("system_notice");
});

test("threadItemToTranscriptCells: contextCompaction", () => {
  const cells = threadItemToTranscriptCells("cc1", {
    type: "contextCompaction", id: "cc1",
  } as ThreadItem);
  expect(cells).toHaveLength(1);
  expect(cells[0].kind).toBe("system_notice");
});

test("threadItemToTranscriptCells: hookPrompt is hidden", () => {
  const cells = threadItemToTranscriptCells("hp1", {
    type: "hookPrompt", id: "hp1", fragments: [],
  } as ThreadItem);
  expect(cells).toHaveLength(0);
});

test("threadItemToTranscriptCells: collabAgentToolCall", () => {
  const cells = threadItemToTranscriptCells("ca1", {
    type: "collabAgentToolCall", id: "ca1", tool: "code-reviewer",
    prompt: "review this PR", senderThreadId: "t1", receiverThreadIds: [],
  } as unknown as ThreadItem);
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
  viewState.addLiveItem({
    type: "agentMessage", id: "a1", text: "complete response", phase: null, memoryCitation: null,
  } as ThreadItem);

  const cells = buildTranscriptCells(viewState);
  // Should have the completed agentMessage, not the streaming cell
  expect(cells.some((c) => c.kind === "assistant_markdown" && c.id === "a1")).toBe(true);
  expect(cells.some((c) => c.id === "live")).toBe(false);
});

test("addLiveItem clears liveReasoningText when completed reasoning arrives", () => {
  const viewState = CodexThreadViewState.create("/tmp");
  viewState.startTurn("test");
  viewState.appendReasoningDelta("live thinking...");

  // Completed reasoning item arrives
  viewState.addLiveItem({
    type: "reasoning", id: "r1", summary: ["final thought"], content: [],
  } as ThreadItem);

  expect(viewState.liveReasoningText).toBe("");
});

test("addLiveItem clears liveCommandOutputs when completed commandExecution arrives", () => {
  const viewState = CodexThreadViewState.create("/tmp");
  viewState.startTurn("test");
  viewState.appendCommandOutput("cmd-1", "live output...");

  viewState.addLiveItem({
    type: "commandExecution", id: "cmd-1", command: "ls", cwd: "/app",
  } as ThreadItem);

  expect(viewState.liveCommandOutputs.has("cmd-1")).toBe(false);
});

test("addLiveItem clears liveFileChanges when completed fileChange arrives", () => {
  const viewState = CodexThreadViewState.create("/tmp");
  viewState.startTurn("test");
  viewState.setLiveFileChanges("fc-1", [
    { path: "a.ts", kind: { type: "update" } as unknown as FileUpdateChange["kind"], diff: "-old\n+new" },
  ]);

  viewState.addLiveItem({
    type: "fileChange", id: "fc-1", changes: [{ path: "a.ts", kind: { type: "update", move_path: null }, diff: "final" }],
  } as unknown as ThreadItem);

  expect(viewState.liveFileChanges.has("fc-1")).toBe(false);
});

test("buildTranscriptCells shows no duplicate after live reasoning + completed reasoning", () => {
  const viewState = CodexThreadViewState.create("/tmp");
  viewState.startTurn("test");
  viewState.appendReasoningDelta("live think...");
  viewState.addLiveItem({
    type: "reasoning", id: "r2", summary: ["final thought"], content: [],
  } as ThreadItem);

  const cells = buildTranscriptCells(viewState);
  const reasoning = cells.filter((c) => c.kind === "reasoning");
  expect(reasoning).toHaveLength(1);
});
