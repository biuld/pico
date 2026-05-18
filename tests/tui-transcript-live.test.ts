import { expect, test } from "bun:test";
import type { FileUpdateChange } from "@pico/codex-app-server-protocol/v2";
import { CodexThreadViewState } from "../src/app/codex-thread-view-state";
import { buildTranscriptCells } from "../src/tui/transcript";
import {
  mockAgentMessageItem, mockReasoningItem, mockPlanItem,
  mockCommandExecutionItem, mockFileChangeItem, mockFileUpdateChange,
} from "./tui-test-helpers";

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
  expect(cells.some((c) => c.kind === "assistant_markdown" && c.id === "a1")).toBe(true);
  expect(cells.some((c) => c.id === "live")).toBe(false);
});

// ── Dedup: completed items clear live state ──

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
  expect(cells.filter((c) => c.kind === "reasoning")).toHaveLength(1);
});

// ── Live plan ──

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
  viewState.addLiveItem(mockPlanItem("p2", "## Plan"));

  const cells = buildTranscriptCells(viewState);
  expect(viewState.livePlan).toBeNull();
  expect(cells.filter((c) => c.kind === "plan_update")).toHaveLength(0);
  expect(cells.some((c) => c.kind === "assistant_markdown" && c.id === "p2")).toBe(true);
});
