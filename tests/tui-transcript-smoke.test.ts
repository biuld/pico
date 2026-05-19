import { expect, test } from "bun:test";
import type { ThreadItem, FileUpdateChange } from "@pico/codex-app-server-protocol/v2";
import { CodexThreadViewState } from "../src/app/codex-thread-view-state";
import { buildTranscriptCells } from "../src/tui/transcript";
import type { TranscriptCommandBlock, TranscriptFileChangeBlock } from "../src/tui/transcript/cell";
import { buildCommandHeader, buildFileChangeInfo, buildToolHeader } from "../src/tui/widgets/transcript-panel/blocks";
import {
  setMockTurns,
  mockUserMessageItem,
  mockCommandExecutionItem,
  mockFileChangeItem,
  mockFileUpdateChange,
  mockMcpToolCallItem,
} from "./tui-test-helpers";

// ── Scenario A: Command running → completed ──

test("smoke: command running then completed", () => {
  const viewState = CodexThreadViewState.create("/tmp");
  viewState.startTurn("test");
  viewState.appendCommandOutput("cmd-1", "building...\n");

  // Running state: live output visible
  let cells = buildTranscriptCells(viewState);
  const runningCmd = cells.find((c) => c.kind === "command" && c.id.startsWith("live-cmd-"));
  expect(runningCmd).toBeDefined();
  expect(runningCmd!.blocks[0]?.type).toBe("command");

  // Completed: live output cleared and completed item appears
  viewState.addLiveItem(mockCommandExecutionItem("cmd-1", "bun build", { aggregatedOutput: "Build succeeded!" }));
  cells = buildTranscriptCells(viewState);
  const liveCells = cells.filter((c) => c.id.startsWith("live-cmd-"));
  expect(liveCells).toHaveLength(0);

  const completedCmd = cells.find((c) => c.kind === "command" && c.id === "cmd-1");
  expect(completedCmd).toBeDefined();
  const payload = (completedCmd!.blocks[0] as TranscriptCommandBlock).payload;
  expect(payload.command).toBe("bun build");
  expect(payload.output).toBe("Build succeeded!");
});

test("smoke: command running shows buildCommandHeader as running", () => {
  const header = buildCommandHeader({ command: "sleep 10", status: "running", cwd: "/tmp" });
  expect(header.isRunning).toBe(true);
  expect(header.isFailed).toBe(false);
  expect(header.statusLabel).toBeNull();
  expect(header.text).toContain("RUNNING");
});

// ── Scenario B: Command failed ──

test("smoke: command failed injection through turns", () => {
  const viewState = CodexThreadViewState.create("/tmp");
  viewState.startTurn("test");

  setMockTurns(viewState, [{
    id: "turn-1",
    status: "completed",
    items: [{
      type: "commandExecution", id: "cmd-fail",
      command: "rm -rf /",
      cwd: "/app",
      status: "failed",
      exitCode: 1,
      durationMs: 500,
      aggregatedOutput: null,
      processId: null,
      source: "agent",
      commandActions: [],
    } as unknown as ThreadItem],
  }]);

  const cells = buildTranscriptCells(viewState);
  const cmd = cells.find((c) => c.kind === "command");
  expect(cmd).toBeDefined();
  expect(cmd!.status).toBe("failed");

  const payload = (cmd!.blocks[0] as TranscriptCommandBlock).payload;
  expect(payload.status).toBe("failed");
  expect(payload.exitCode).toBe(1);
  expect(payload.durationMs).toBe(500);
});

test("smoke: failed command header has FAILED label and error info", () => {
  const header = buildCommandHeader({
    command: "rm -rf /",
    cwd: "/app",
    status: "failed",
    exitCode: 1,
    durationMs: 500,
  });
  expect(header.isFailed).toBe(true);
  expect(header.statusLabel).toBe("FAILED");
  expect(header.text).toContain("FAILED");
  expect(header.text).toContain("exit 1");
  expect(header.text).toContain("500ms");
});

test("smoke: declined command header has DECLINED label", () => {
  const header = buildCommandHeader({ command: "rm -rf /", status: "declined" });
  expect(header.isFailed).toBe(true);
  expect(header.statusLabel).toBe("DECLINED");
  expect(header.text).toContain("DECLINED");
});

// ── Scenario C: File change patch update → completed ──

test("smoke: file change live to completed with kind extraction", () => {
  const viewState = CodexThreadViewState.create("/tmp");
  viewState.startTurn("test");

  // Live file change
  viewState.setLiveFileChanges("fc-1", [
    { path: "src/index.ts", kind: { type: "update" } as FileUpdateChange["kind"], diff: "-old\n+new" } as FileUpdateChange,
  ]);

  let cells = buildTranscriptCells(viewState);
  const liveFc = cells.find((c) => c.kind === "file_change" && c.id.startsWith("live-file-"));
  expect(liveFc).toBeDefined();
  const livePayload = liveFc!.blocks[0]?.payload as TranscriptFileChangeBlock["payload"];
  expect(livePayload.kind).toBe("update"); // kind is extracted from PatchChangeKind
  expect(livePayload.diff).toBe("-old\n+new");

  // Completed file change replaces it
  viewState.addLiveItem(mockFileChangeItem("fc-1", [
    mockFileUpdateChange("src/index.ts", "-old\n+new", { type: "update", move_path: null }),
  ]));
  cells = buildTranscriptCells(viewState);

  expect(cells.filter((c) => c.kind === "file_change" && c.id.startsWith("live-file-"))).toHaveLength(0);
  const completedFc = cells.find((c) => c.kind === "file_change" && c.id === "fc-1_src/index.ts");
  expect(completedFc).toBeDefined();

  const completedPayload = completedFc!.blocks[0]?.payload as TranscriptFileChangeBlock["payload"];
  expect(completedPayload.status).toBe("completed");
  expect(completedPayload.kind).toBe("update");
});

test("smoke: file change failed has FAILED label in buildFileChangeInfo", () => {
  const info = buildFileChangeInfo({ path: "config.ts", kind: "update", status: "failed" });
  expect(info.isFailed).toBe(true);
  expect(info.statusLabel).toBe("FAILED");
  expect(info.headerText).toContain("(FAILED)");
});

test("smoke: file change diff line count summary available", () => {
  const info = buildFileChangeInfo({
    path: "src/index.ts",
    kind: "update",
    diff: "@@ -1 +1 @@\n-old\n+new",
  });
  expect(info.diffLineCount).toBe(2);
});

// ── Scenario D: Approval request ──

test("smoke: approval request shown in transcript", () => {
  const viewState = CodexThreadViewState.create("/tmp");
  viewState.startTurn("test");

  setMockTurns(viewState, [{
    id: "turn-1",
    status: "pending",
    items: [mockUserMessageItem("u1", "Allow bun build?")],
  }]);

  const cells = buildTranscriptCells(viewState);
  const userCell = cells.find((c) => c.kind === "user_message");
  expect(userCell).toBeDefined();
  expect(userCell!.blocks[0]?.payload).toMatchObject({ text: "Allow bun build?" });
});

// ── Scenario E: MCP tool failed ──

test("smoke: MCP tool failed shows errorMessage in transcript", () => {
  const viewState = CodexThreadViewState.create("/tmp");
  viewState.startTurn("test");

  setMockTurns(viewState, [{
    id: "turn-1",
    status: "completed",
    items: [mockMcpToolCallItem("m1", "fs", "write", { path: "/x" }, "failed", { message: "permission denied" })],
  }]);

  const cells = buildTranscriptCells(viewState);
  const tool = cells.find((c) => c.kind === "tool_call");
  expect(tool).toBeDefined();
  expect(tool!.status).toBe("failed");

  const payload = tool!.blocks[0]?.payload as { errorMessage?: string; label?: string };
  expect(payload.errorMessage).toContain("permission denied");
  expect(payload.label).toBe("fs/write");
});

test("smoke: MCP tool failed buildToolHeader hasError is true", () => {
  const { text, hasError } = buildToolHeader(
    { label: "fs/write", errorMessage: "permission denied" },
    true,
  );
  expect(hasError).toBe(true);
  expect(text).not.toContain("permission denied");
});
