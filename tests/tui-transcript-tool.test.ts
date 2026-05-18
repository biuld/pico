import { expect, test } from "bun:test";
import type { ThreadItem } from "@pico/codex-app-server-protocol/v2";
import { buildToolHeader } from "../src/tui/widgets/transcript-panel/blocks";
import { threadItemToTranscriptCells } from "../src/tui/transcript/thread-item";
import { mockMcpToolCallItem, mockDynamicToolCallItem, mockFileChangeItem, mockFileUpdateChange } from "./tui-test-helpers";

// ── buildToolHeader ──

test("buildToolHeader: errorMessage not in header text, hasError is true", () => {
  const { text, hasError } = buildToolHeader(
    { label: "fs/write", argsPreview: '{"path":"/x"}', errorMessage: "permission denied" },
    true,
  );
  expect(text).toContain("fs/write");
  expect(text).not.toContain("permission denied");
  expect(hasError).toBe(true);
});

test("buildToolHeader: durationMs 0 shown, not dropped", () => {
  const { text } = buildToolHeader({ label: "fs/stat", durationMs: 0 }, true);
  expect(text).toContain("0ms");
});

test("buildToolHeader: durationMs null is omitted", () => {
  const { text } = buildToolHeader({ label: "fs/stat", durationMs: null }, true);
  expect(text).not.toContain("ms");
});

test("buildToolHeader: legacy detail fallback", () => {
  const { text } = buildToolHeader({ label: "old/tool", detail: "legacy detail text" }, true);
  expect(text).toContain("legacy detail text");
});

test("buildToolHeader: resultPreview shown when no error", () => {
  const { text, hasError } = buildToolHeader({ label: "fs/read", resultPreview: "file contents" }, true);
  expect(text).toContain("file contents");
  expect(hasError).toBe(false);
});

test("buildToolHeader: resultPreview hidden when error is present", () => {
  const { text } = buildToolHeader(
    { label: "fs/write", resultPreview: "ok", errorMessage: "failed" },
    true,
  );
  expect(text).not.toContain("ok");
});

test("buildToolHeader: showDetail false shows only label", () => {
  const { text, hasError } = buildToolHeader(
    { label: "fs/ls", argsPreview: "args", durationMs: 100 },
    false,
  );
  expect(text).toBe("fs/ls");
  expect(hasError).toBe(false);
});

test("buildToolHeader: errorMessage sets hasError and stays out of header", () => {
  const { text, hasError } = buildToolHeader(
    { label: "fs/rm", errorMessage: "not found" },
    true,
  );
  expect(hasError).toBe(true);
  expect(text).not.toContain("not found");
});

// ── Tool/MCP payload quality ──

function toolPayload(cell: { blocks: readonly { type: string; payload: unknown }[] }) {
  return cell.blocks[0]?.payload as { label?: string; argsPreview?: string; resultPreview?: string; errorMessage?: string; durationMs?: number | null; status?: string };
}

test("threadItemToTranscriptCells: mcpToolCall shows args preview", () => {
  const cells = threadItemToTranscriptCells("m1", mockMcpToolCallItem("m1", "fs", "read", { path: "/x" }));
  expect(cells).toHaveLength(1);
  expect(toolPayload(cells[0]).argsPreview).toContain("path");
});

test("threadItemToTranscriptCells: mcpToolCall shows durationMs in payload", () => {
  const item = {
    type: "mcpToolCall", id: "dur1", server: "fs", tool: "stat",
    arguments: {}, status: "completed", result: null, error: null,
    durationMs: 1234,
  } as unknown as ThreadItem;

  const cells = threadItemToTranscriptCells("dur1", item);
  expect(toolPayload(cells[0]).durationMs).toBe(1234);
});

test("threadItemToTranscriptCells: mcpToolCall with error shows errorMessage", () => {
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
  const p = toolPayload(cells[0]);
  expect(p.errorMessage).toContain("permission denied");
  expect(p.durationMs).toBe(150);
});

test("threadItemToTranscriptCells: tool argsPreview truncates long args", () => {
  const longArgs = { data: "x".repeat(300) };
  const item = {
    type: "mcpToolCall", id: "t1", server: "fs", tool: "read",
    arguments: longArgs, status: "completed", result: null, error: null, durationMs: null,
  } as unknown as ThreadItem;

  const cells = threadItemToTranscriptCells("t1", item);
  const args = toolPayload(cells[0]).argsPreview!;
  expect(args.length).toBeLessThanOrEqual(210);
});

test("threadItemToTranscriptCells: dynamicToolCall shows namespace/tool label", () => {
  const cells = threadItemToTranscriptCells("d1", mockDynamicToolCallItem("d1", "search", "grep", { q: "test" }));
  expect(toolPayload(cells[0]).label).toBe("search/grep");
});

test("threadItemToTranscriptCells: fileChange carries kind from PatchChangeKind", () => {
  const cells = threadItemToTranscriptCells("f1",
    mockFileChangeItem("f1", [mockFileUpdateChange("a.ts", "-old\n+new")]));
  expect(cells).toHaveLength(1);
  const payload = cells[0].blocks[0]?.payload as { kind?: string };
  expect(payload.kind).toBe("update");
});

test("threadItemToTranscriptCells: commandExecution with failed status sets cell status", () => {
  const item = {
    type: "commandExecution", id: "fail1", command: "rm -rf /",
    cwd: "/app", status: "failed", aggregatedOutput: null,
    exitCode: null, durationMs: 500,
  } as unknown as import("@pico/codex-app-server-protocol/v2").ThreadItem;

  const cells = threadItemToTranscriptCells("fail1", item);
  expect(cells[0].status).toBe("failed");
});
