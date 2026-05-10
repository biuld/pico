import { expect, test } from "bun:test";
import { formatStatusLine } from "../src/tui/render";
import { createTuiState, setTurnStatus } from "../src/tui/state";
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
import { createStore } from "./tui-test-helpers";

test("transcript cells project Pico JSONL entries without changing thread storage", async () => {
  const store = await createStore();
  const turn = await store.appendTurn(store.leafId, "Explain Pico");
  const item = await store.appendResponseItem(turn.id, turn.id, {
    type: "message",
    content: [{ type: "output_text", text: "Pico stores raw Codex items." }],
  });
  await store.appendTurnCompleted(item.id, turn.id);

  const state = setTurnStatus(createTuiState(store), "idle");
  const transcript = buildTranscriptCells(store);

  expect(transcript).toEqual([
    {
      id: turn.id,
      kind: "user_message",
      status: "completed",
      blocks: [{ type: "text", payload: { text: "Explain Pico", tone: "strong" } }],
    },
    {
      id: item.id,
      kind: "assistant_markdown",
      blocks: [{ type: "markdown", payload: { text: "Pico stores raw Codex items.", streaming: undefined } }],
      status: undefined,
    },
  ]);
  expect(formatStatusLine(store, state)).toContain("pico");
});

test("transcript projects Codex item types into semantic cells", async () => {
  const store = await createStore();
  const turn = await store.appendTurn(store.leafId, "Inspect the repo");
  let parentId = turn.id;
  const reasoningItem = await store.appendResponseItem(parentId, turn.id, {
    type: "reasoning",
    summary: [{ type: "summary_text", text: "checking project files" }],
  });
  parentId = reasoningItem.id;
  const planItem = await store.appendResponseItem(parentId, turn.id, {
    type: "function_call",
    name: "update_plan",
    arguments: JSON.stringify({
      explanation: "Need inspect first",
      plan: [
        { step: "Read code", status: "completed" },
        { step: "Fix plan rendering", status: "in_progress" },
        { step: "Run tests", status: "pending" },
      ],
    }),
  });
  parentId = planItem.id;
  const toolCallItem = await store.appendResponseItem(parentId, turn.id, {
    type: "function_call",
    call_id: "shell-1",
    name: "shell.exec",
    arguments: { cmd: "ls" },
  });
  parentId = toolCallItem.id;
  const toolOutputItem = await store.appendResponseItem(parentId, turn.id, {
    type: "function_call_output",
    call_id: "shell-1",
    output: {
      success: true,
      body: [{ type: "text", text: "done" }],
    },
  });
  parentId = toolOutputItem.id;
  const regularToolCallItem = await store.appendResponseItem(parentId, turn.id, {
    type: "function_call",
    call_id: "fetch-1",
    name: "web.fetch",
    arguments: { url: "https://example.test" },
  });
  parentId = regularToolCallItem.id;
  const regularToolOutputItem = await store.appendResponseItem(parentId, turn.id, {
    type: "function_call_output",
    call_id: "fetch-1",
    output: {
      success: true,
      body: [{ type: "text", text: "fetched" }],
    },
  });
  parentId = regularToolOutputItem.id;
  const commandItem = await store.appendResponseItem(parentId, turn.id, {
    type: "local_shell_call",
    command: "bun test",
  });
  parentId = commandItem.id;
  const fileItem = await store.appendResponseItem(parentId, turn.id, {
    type: "file_change",
    path: "src/index.ts",
    patch: "@@ changed",
  });
  await store.appendTurnCompleted(fileItem.id, turn.id);

  const cells = buildTranscriptCells(store).slice(1);

  expect(kinds(cells)).toEqual([
    "reasoning",
    "plan_update",
    "command",
    "tool_call",
    "command",
    "file_change",
  ]);
  expect(cells.map((cell) => cell.blocks[0]?.type)).toEqual([
    "reasoning",
    "plan",
    "command",
    "tool",
    "command",
    "file_change",
  ]);
  expect(blockText(cells[0].blocks[0]!)).toBe("checking project files");
  expect(blockText(cells[1].blocks[0]!)).toBe(
    "Updated Plan\nNeed inspect first\n✓ Read code\n□ Fix plan rendering\n□ Run tests",
  );
  expect(blockText(cells[2].blocks[0]!)).toBe("ls\ndone");
  expect(blockText(cells[3].blocks[0]!)).toBe("web.fetch\nurl=https://example.test\nfetched");
  expect(blockText(cells[4].blocks[0]!)).toBe("bun test");
  expect(blockText(cells[5].blocks[0]!)).toBe("src/index.ts\nchanged");
});

test("transcript groups tool outputs back into matching tool calls", async () => {
  const store = await createStore();
  const turn = await store.appendTurn(store.leafId, "Fetch and search");
  let parentId = turn.id;
  const fetchCall = await store.appendResponseItem(parentId, turn.id, {
    type: "function_call",
    call_id: "fetch-call",
    name: "web.fetch",
    arguments: { url: "https://example.test" },
  });
  parentId = fetchCall.id;
  const searchCall = await store.appendResponseItem(parentId, turn.id, {
    type: "function_call",
    call_id: "search-call",
    name: "web.search",
    arguments: { query: "pico transcript" },
  });
  parentId = searchCall.id;
  const searchOutput = await store.appendResponseItem(parentId, turn.id, {
    type: "function_call_output",
    call_id: "search-call",
    output: { body: [{ type: "text", text: "search result" }] },
  });
  parentId = searchOutput.id;
  const fetchOutput = await store.appendResponseItem(parentId, turn.id, {
    type: "function_call_output",
    call_id: "fetch-call",
    output: { body: [{ type: "text", text: "fetch result" }] },
  });
  await store.appendTurnCompleted(fetchOutput.id, turn.id);

  const cells = buildTranscriptCells(store).slice(1);

  expect(kinds(cells)).toEqual(["tool_call", "tool_call"]);
  expect(blockText(cells[0].blocks[0]!)).toBe("web.fetch\nurl=https://example.test\nfetch result");
  expect(blockText(cells[1].blocks[0]!)).toBe("web.search\nquery=pico transcript\nsearch result");
});

test("transcript decorates apply_patch calls and outputs", async () => {
  const store = await createStore();
  const turn = await store.appendTurn(store.leafId, "Patch files");
  const patch = [
    "*** Begin Patch",
    `*** Update File: ${process.cwd()}/src/cli.ts`,
    "@@",
    "-old",
    "+new",
    `*** Add File: ${process.cwd()}/src/import/codex-threads.ts`,
    "+export const imported = true;",
    "*** End Patch",
  ].join("\n");
  const call = await store.appendResponseItem(turn.id, turn.id, {
    type: "function_call",
    call_id: "patch-call",
    name: "apply_patch",
    arguments: patch,
  });
  const output = await store.appendResponseItem(call.id, turn.id, {
    type: "function_call_output",
    call_id: "patch-call",
    output: JSON.stringify({
      output: [
        "Success. Updated the following files:",
        `M ${process.cwd()}/src/cli.ts`,
        `A ${process.cwd()}/src/import/codex-threads.ts`,
      ].join("\n"),
      metadata: { exit_code: 0, duration_seconds: 0.1 },
    }),
  });
  await store.appendTurnCompleted(output.id, turn.id);

  const cells = buildTranscriptCells(store).slice(1);

  expect(kinds(cells)).toEqual(["tool_call"]);
  expect(blockText(cells[0].blocks[0]!)).toBe(
    "apply_patch\nM src/cli.ts +1 -1, A src/import/codex-threads.ts +1\nSuccess. Updated M src/cli.ts, A src/import/codex-threads.ts",
  );
});

test("transcript strips shell wrapper metadata from command outputs", async () => {
  const store = await createStore();
  const turn = await store.appendTurn(store.leafId, "Read file");
  const call = await store.appendResponseItem(turn.id, turn.id, {
    type: "function_call",
    call_id: "shell-call",
    name: "exec_command",
    arguments: { cmd: "sed -n '1,20p' src/index.ts" },
  });
  const output = await store.appendResponseItem(call.id, turn.id, {
    type: "function_call_output",
    call_id: "shell-call",
    output: [
      "Chunk ID: 2dcfc2",
      "Wall time: 0.0000 seconds",
      "Process exited with code 0",
      "Original token count: 1840",
      "Output:",
      "import { main } from './cli';",
      "await main();",
    ].join("\n"),
  });
  await store.appendTurnCompleted(output.id, turn.id);

  const cells = buildTranscriptCells(store).slice(1);

  expect(kinds(cells)).toEqual(["command"]);
  expect(blockText(cells[0].blocks[0]!)).toBe(
    "sed -n '1,20p' src/index.ts\nimport { main } from './cli';\nawait main();",
  );
});

test("main transcript uses Codex-style mute strategies by cell type", async () => {
  const store = await createStore();
  const turn = await store.appendTurn(store.leafId, "Inspect the repo");
  const item = await store.appendResponseItem(turn.id, turn.id, {
    type: "message",
    role: "assistant",
    content: [{ type: "output_text", text: "done" }],
  });
  await store.appendTurnCompleted(item.id, turn.id);

  const cells = buildTranscriptCells(store);
  const liveCells = buildTranscriptCellsWithLive(
    { store } as Parameters<typeof buildTranscriptCellsWithLive>[0],
    "partial response",
    turn.id,
  );

  expect(cells.map(isMainTranscriptCellExpandedByDefault)).toEqual([true, true]);
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
  })).toBe("file-summary");
  expect(isMainTranscriptCellExpandedByDefault(liveCells.at(-1)!)).toBe(true);
  expect(compactTranscriptPreview("one\n\n two   three", 12)).toBe("one two t...");
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

test("transcript only appends non-persisted live streaming cells", async () => {
  const store = await createStore();
  const turn = await store.appendTurn(store.leafId, "Explain streaming");
  const app = { store } as Parameters<typeof buildTranscriptCellsWithLive>[0];

  expect(buildTranscriptCellsWithLive(app, "", turn.id)).toEqual([
    {
      id: turn.id,
      kind: "user_message",
      status: "started",
      blocks: [{ type: "text", payload: { text: "Explain streaming", tone: "strong" } }],
    },
  ]);

  expect(buildTranscriptCellsWithLive(app, "partial response", turn.id).at(-1)).toEqual({
    id: "live",
    kind: "assistant_markdown",
    status: undefined,
    blocks: [{ type: "markdown", payload: { text: "partial response", streaming: true } }],
  });
});

function kinds(cells: readonly TranscriptCell[]): string[] {
  return cells.map((cell) => cell.kind);
}
