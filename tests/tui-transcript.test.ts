import { expect, test } from "bun:test";
import { formatStatusLine } from "../src/tui/render";
import { createTuiState, setTurnStatus } from "../src/tui/state";
import {
  blockText,
  buildTranscriptCells,
  buildTranscriptCellsWithLive,
  type TranscriptCell,
} from "../src/tui/transcript";
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
  const toolCallItem = await store.appendResponseItem(parentId, turn.id, {
    type: "function_call",
    name: "shell.exec",
    arguments: { cmd: "ls" },
  });
  parentId = toolCallItem.id;
  const toolOutputItem = await store.appendResponseItem(parentId, turn.id, {
    type: "function_call_output",
    call_id: "call-1",
    output: {
      success: true,
      body: [{ type: "text", text: "done" }],
    },
  });
  parentId = toolOutputItem.id;
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
    "tool_call",
    "tool_output",
    "command",
    "file_change",
  ]);
  expect(cells.map((cell) => cell.blocks[0]?.type)).toEqual([
    "reasoning",
    "tool",
    "tool",
    "command",
    "file_change",
  ]);
  expect(blockText(cells[0].blocks[0]!)).toBe("checking project files");
  expect(blockText(cells[1].blocks[0]!)).toBe('tool call: shell.exec\n{"cmd":"ls"}');
  expect(blockText(cells[2].blocks[0]!)).toBe("tool output call-1\ndone");
  expect(blockText(cells[3].blocks[0]!)).toBe("bun test");
  expect(blockText(cells[4].blocks[0]!)).toBe("src/index.ts\n@@ changed");
});

test("transcript includes non-persisted live loading and streaming cells", async () => {
  const store = await createStore();
  const turn = await store.appendTurn(store.leafId, "Explain streaming");
  const app = { store } as Parameters<typeof buildTranscriptCellsWithLive>[0];

  expect(buildTranscriptCellsWithLive(app, "", "waiting for model...", turn.id)).toEqual([
    {
      id: turn.id,
      kind: "user_message",
      status: "started",
      blocks: [{ type: "text", payload: { text: "Explain streaming", tone: "strong" } }],
    },
    {
      id: "live-loading",
      kind: "reasoning",
      status: "running",
      blocks: [{ type: "reasoning", payload: { text: "waiting for model..." } }],
    },
  ]);

  expect(buildTranscriptCellsWithLive(app, "partial response", "waiting for model...", turn.id).at(-1)).toEqual({
    id: "live",
    kind: "assistant_markdown",
    status: undefined,
    blocks: [{ type: "markdown", payload: { text: "partial response", streaming: true } }],
  });
});

function kinds(cells: readonly TranscriptCell[]): string[] {
  return cells.map((cell) => cell.kind);
}
