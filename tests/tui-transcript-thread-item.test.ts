import { expect, test } from "bun:test";
import type { ThreadItem } from "@pico/codex-app-server-protocol/v2";
import { threadItemToTranscriptCells } from "../src/tui/transcript/thread-item";
import {
  mockUserMessageItem, mockAgentMessageItem, mockReasoningItem, mockPlanItem,
  mockCommandExecutionItem, mockFileChangeItem, mockFileUpdateChange,
  mockMcpToolCallItem, mockDynamicToolCallItem, mockWebSearchItem,
  mockImageGenerationItem, mockImageViewItem,
  mockEnteredReviewModeItem, mockContextCompactionItem,
  mockHookPromptItem, mockCollabAgentToolCallItem,
} from "./tui-test-helpers";

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
    payload: { label: "filesystem/read", argsPreview: expect.stringContaining("path") },
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

// ── command status normalization ──

test("threadItemToTranscriptCells: commandExecution inProgress normalizes to running", () => {
  const item = {
    type: "commandExecution", id: "ip1", command: "bun build",
    cwd: "/app", status: "inProgress", aggregatedOutput: null,
    exitCode: null, durationMs: null,
  } as unknown as ThreadItem;

  const cells = threadItemToTranscriptCells("ip1", item);
  expect(cells).toHaveLength(1);
  expect(cells[0].status).toBe("running");
  const block = cells[0].blocks[0]?.payload as { status?: string };
  expect(block.status).toBe("running");
});

test("threadItemToTranscriptCells: commandExecution running status passes through", () => {
  const item = {
    type: "commandExecution", id: "r1", command: "sleep 10",
    cwd: "/app", status: "running", aggregatedOutput: null,
    exitCode: null, durationMs: null,
  } as unknown as ThreadItem;

  const cells = threadItemToTranscriptCells("r1", item);
  expect(cells[0].status).toBe("running");
});

test("threadItemToTranscriptCells: commandExecution declined passes through (not normalized to failed)", () => {
  const item = {
    type: "commandExecution", id: "d1", command: "rm -rf /",
    cwd: "/app", status: "declined", aggregatedOutput: null,
    exitCode: null, durationMs: null,
  } as unknown as ThreadItem;

  const cells = threadItemToTranscriptCells("d1", item);
  expect(cells[0].status).toBe("declined");
  const block = cells[0].blocks[0]?.payload as { status?: string };
  expect(block.status).toBe("declined");
});
