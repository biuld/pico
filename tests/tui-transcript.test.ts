import { expect, test } from "bun:test";
import { parseColor } from "@opentui/core";
import { formatStatusLine } from "../src/tui/render";
import { createTuiState, setTurnStatus } from "../src/tui/state";
import { TUI_THEMES } from "../src/tui/theme";
import {
  buildTranscriptRows,
  buildTranscriptRowsWithLive,
  formatTranscriptRow,
  formatTranscriptRowStyled,
  renderTranscriptPlain,
  type TranscriptBlockRenderer,
  type TranscriptCell,
} from "../src/tui/transcript";
import { createStore } from "./tui-test-helpers";

test("render helpers build transcript models from Pico JSONL entries", async () => {
  const store = await createStore();
  const turn = await store.appendTurn(store.leafId, "Explain Pico");
  const item = await store.appendResponseItem(turn.id, turn.id, {
    type: "message",
    content: [{ type: "output_text", text: "Pico stores raw Codex items." }],
  });
  await store.appendTurnCompleted(item.id, turn.id);

  const state = setTurnStatus(createTuiState(store), "idle");
  const transcript = buildTranscriptRows(store);

  expect(transcript).toEqual([
    { id: turn.id, role: "user", text: "Explain Pico", status: "completed" },
    { id: item.id, role: "assistant", text: "Pico stores raw Codex items." },
  ]);
  expect(formatTranscriptRow(transcript[0])).toBe("› Explain Pico");
  expect(formatTranscriptRow(transcript[1])).toBe("• Pico stores raw Codex items.");
  expect(formatStatusLine(store, state)).toContain("pico");
});

test("transcript projects agent item types into semantic rows", async () => {
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

  const rows = buildTranscriptRows(store);

  expect(rows.slice(1)).toEqual([
    {
      id: expect.any(String),
      role: "assistant",
      kind: "reasoning",
      text: "reasoning: checking project files",
    },
    {
      id: expect.any(String),
      role: "assistant",
      kind: "tool",
      text: 'tool call: shell.exec {"cmd":"ls"}',
    },
    {
      id: expect.any(String),
      role: "assistant",
      kind: "tool",
      text: "tool output call-1: done",
    },
    {
      id: expect.any(String),
      role: "assistant",
      kind: "command",
      text: "command: bun test",
    },
    {
      id: expect.any(String),
      role: "assistant",
      kind: "file",
      text: "file change: src/index.ts: @@ changed",
    },
  ]);
});

test("transcript includes non-persisted live loading and streaming rows", async () => {
  const store = await createStore();
  const turn = await store.appendTurn(store.leafId, "Explain streaming");
  const app = { store } as Parameters<typeof buildTranscriptRowsWithLive>[0];

  expect(buildTranscriptRowsWithLive(app, "", "waiting for model...", turn.id)).toEqual([
    { id: turn.id, role: "user", text: "Explain streaming", status: "started" },
    {
      id: "live-loading",
      role: "assistant",
      kind: "reasoning",
      text: "waiting for model...",
      status: "running",
    },
  ]);

  expect(buildTranscriptRowsWithLive(app, "partial response", "waiting for model...", turn.id).at(-1)).toEqual({
    id: "live",
    role: "assistant",
    text: "partial response",
  });
});

test("transcript renderer wraps cells with Codex-style prefixes", () => {
  expect(
    formatTranscriptRow(
      { id: "u", role: "user", text: "one two three four five six" },
      12,
    ),
  ).toBe(["› one two", "  three", "  four five", "  six"].join("\n"));

  expect(
    formatTranscriptRow(
      { id: "a", role: "assistant", text: "alpha beta gamma" },
      12,
    ),
  ).toBe(["• alpha", "  beta", "  gamma"].join("\n"));

  expect(
    formatTranscriptRow(
      { id: "e", role: "system", status: "failed", text: "network denied" },
      12,
    ),
  ).toBe(["! network", "  denied"].join("\n"));
});

test("transcript renderer gives semantic agent rows distinct prefixes and theme colors", () => {
  const theme = TUI_THEMES[0];

  expect(formatTranscriptRow(
    { id: "r", role: "assistant", kind: "reasoning", text: "reasoning: checking" },
    40,
  )).toBe("· reasoning: checking");
  expect(formatTranscriptRow(
    { id: "t", role: "assistant", kind: "tool", text: "tool call: shell.exec" },
    40,
  )).toBe("↳ tool call: shell.exec");
  expect(formatTranscriptRow(
    { id: "c", role: "assistant", kind: "command", text: "command: bun test" },
    40,
  )).toBe("$ command: bun test");
  expect(formatTranscriptRow(
    { id: "f", role: "assistant", kind: "file", text: "file change: src/index.ts" },
    40,
  )).toBe("~ file change: src/index.ts");

  const command = formatTranscriptRowStyled(
    { id: "c", role: "assistant", kind: "command", text: "command: bun test" },
    40,
    theme,
  );
  const expectedStatus = parseColor(theme.colors.status);
  expect(command.chunks.some((chunk) => chunk.text === "command: bun test" && chunk.fg?.equals(expectedStatus))).toBe(true);
});

test("transcript user rows fill their full line background from the active theme", () => {
  const theme = TUI_THEMES[0];
  const styled = formatTranscriptRowStyled(
    { id: "u", role: "user", text: "hello" },
    12,
    theme,
  );

  const expectedBackground = parseColor(theme.colors.userMessageBackground);
  expect(styled.chunks.map((chunk) => chunk.text).join("")).toBe([
    "            ",
    "› hello     ",
    "            ",
  ].join("\n"));
  expect(
    styled.chunks
      .filter((chunk) => chunk.text !== "\n")
      .every((chunk) => chunk.bg?.equals(expectedBackground)),
  ).toBe(true);
});

test("transcript renderer accepts block renderers for future formatted surfaces", () => {
  const formattedCell: TranscriptCell = {
    id: "formatted",
    kind: "assistant",
    blocks: [{ type: "example-formatted", payload: { lead: "hello", rest: " world" } }],
  };
  const formattedRenderer: TranscriptBlockRenderer = {
    type: "example-formatted",
    render: (block) => {
      if (!isExampleFormattedPayload(block.payload)) return [];
      return [[{ text: block.payload.lead, tone: "strong" }, { text: block.payload.rest }]];
    },
  };

  expect(renderTranscriptPlain([formattedCell], 80, {
    blockRenderers: [formattedRenderer],
  })).toBe("• hello world");
});

function isExampleFormattedPayload(
  payload: unknown,
): payload is { lead: string; rest: string } {
  return (
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as { lead?: unknown }).lead === "string" &&
    typeof (payload as { rest?: unknown }).rest === "string"
  );
}
