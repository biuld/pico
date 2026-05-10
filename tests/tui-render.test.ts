import { expect, test } from "bun:test";
import { parseColor, type CliRenderer } from "@opentui/core";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionStore } from "../src/session/store";
import { filterSlashCommands, parseTuiInput } from "../src/tui/commands";
import { installOpenTuiKeybindings, type KeybindingRuntime } from "../src/tui/keybindings";
import { formatStatusLine } from "../src/tui/render";
import { footerMode, formatFooterLine } from "../src/tui/widgets/footer";
import { formatComposerStatus } from "../src/tui/widgets/composer";
import { buildSessionRows } from "../src/tui/widgets/resume-picker";
import { buildThemeRows } from "../src/tui/widgets/theme-picker";
import {
  buildTranscriptRows,
  formatTranscriptRow,
  formatTranscriptRowStyled,
  renderTranscriptPlain,
  type TranscriptBlockRenderer,
  type TranscriptCell,
} from "../src/tui/transcript";
import {
  buildHistoryTurnRows,
  formatHistoryTurnRow,
  historySelectionTargetId,
} from "../src/tui/history";
import {
  createTuiState,
  moveSelection,
  scrollTranscript,
  setTurnStatus,
  syncListScroll,
  updateInput,
} from "../src/tui/state";
import { updateTuiState } from "../src/tui/update";
import { TUI_THEMES } from "../src/tui/theme";

test("TUI state helpers keep overlay state immutable", async () => {
  const store = await createStore();
  const state = createTuiState(store);
  const withInput = updateInput(state, "hello");
  const running = setTurnStatus(withInput, "running", "streaming");
  const scrolled = scrollTranscript(running, -10);
  const inHistory = updateTuiState(scrolled, { type: "openHistory", leafId: store.leafId });

  expect(state.inputValue).toBe("");
  expect(state.overlay).toBe("none");
  expect(withInput.inputValue).toBe("hello");
  expect(running.turnStatus).toBe("running");
  expect(scrolled.transcriptScroll).toBe(0);
  expect(inHistory.overlay).toBe("history");
});

test("footer renders an unsaved session before first submit", () => {
  const state = createTuiState();

  expect(formatFooterLine(undefined, state, 32)).toContain("pico new");
});

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
  expect(formatFooterLine(store, state, 48)).toContain("? for shortcuts");
  expect(formatFooterLine(store, state, 48)).toContain(`pico ${store.id.slice(0, 8)}`);
  expect(formatComposerStatus({ running: false, turnStatus: "idle" })).toBe("");
  expect(formatComposerStatus({ running: true, turnStatus: "running", statusMessage: "starting" })).toBe("• starting");
  expect(footerMode(state)).toBe("ComposerEmpty");
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

test("keybindings require double ctrl+d to exit and do not exit on ctrl+c", () => {
  const handlers: Array<(sequence: string) => boolean> = [];
  const renderer = {
    addInputHandler: (handler: (sequence: string) => boolean) => {
      handlers.push(handler);
    },
  } as unknown as CliRenderer;

  let state = createTuiState();
  let closeCount = 0;
  let renderCount = 0;
  const runtime: KeybindingRuntime = {
    getState: () => state,
    getInputValue: () => "",
    hasPendingApproval: () => false,
    pendingApprovalMethod: () => undefined,
    isRunning: () => false,
    dispatch: (msg) => {
      state = updateTuiState(state, msg);
    },
    render: () => {
      renderCount += 1;
    },
    close: () => {
      closeCount += 1;
    },
    focusInput: () => {},
    setComposerFocus: () => {},
    showHistory: () => {},
    showSessions: () => {},
    showTheme: () => {},
    showTranscript: () => {},
    showShortcuts: () => {},
    moveHistorySelection: () => {},
    moveSessionSelection: () => {},
    moveThemeSelection: () => {},
    restoreSelected: () => {},
    resumeSelected: () => {},
    selectTheme: () => {},
    setInputValue: () => {},
    acceptSlashSelection: () => {},
    resolveApproval: () => {},
  };

  installOpenTuiKeybindings(renderer, runtime);

  expect(handlers[0]("\u0003")).toBe(true);
  expect(closeCount).toBe(0);
  expect(state.statusMessage).toBe("ctrl+d twice to exit");

  expect(handlers[0]("\u0004")).toBe(true);
  expect(closeCount).toBe(0);
  expect(state.statusMessage).toBe("ctrl+d again to exit");

  expect(handlers[0]("\u0004")).toBe(true);
  expect(closeCount).toBe(1);
  expect(renderCount).toBeGreaterThan(1);
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
  expect(styled.chunks.map((chunk) => chunk.text).join("")).toBe("› hello     ");
  expect(styled.chunks.every((chunk) => chunk.bg?.equals(expectedBackground))).toBe(true);
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

test("history overlay groups each turn as a tree node with an agent summary", async () => {
  const store = await createStore();
  const turn = await store.appendTurn(store.leafId, "Explain Pico history");
  await store.appendResponseItem(turn.id, turn.id, {
    type: "message",
    role: "developer",
    content: [{ type: "input_text", text: "hidden instructions" }],
  });
  const item = await store.appendResponseItem(turn.id, turn.id, {
    type: "message",
    role: "assistant",
    content: [{ type: "output_text", text: "Pico history is a turn tree." }],
  });
  await store.appendTurnCompleted(item.id, turn.id);

  const rows = buildHistoryTurnRows(store, store.leafId);
  const formatted = formatHistoryTurnRow(rows[0]);

  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    id: store.leafId,
    turnId: turn.id,
    isActive: true,
    isSelected: true,
    userPrefix: "└── ",
    userText: "Explain Pico history",
    agentSummary: "agent: Pico history is a turn tree.",
  });
  expect(formatted).toContain("└── Explain Pico history");
  expect(formatted).not.toContain("hidden instructions");
  expect(historySelectionTargetId(store)).toBe(store.leafId);
});

test("history tree branches by turn and selection moves only across turns", async () => {
  const store = await createStore();
  const rootTurn = await store.appendTurn(store.leafId, "root prompt");
  const rootItem = await store.appendResponseItem(rootTurn.id, rootTurn.id, {
    role: "assistant",
    text: "root answer",
  });
  await store.appendTurnCompleted(rootItem.id, rootTurn.id);
  const rootLeaf = store.leafId;

  const leftTurn = await store.appendTurn(rootLeaf, "left prompt");
  const leftItem = await store.appendResponseItem(leftTurn.id, leftTurn.id, {
    role: "assistant",
    text: "left answer",
  });
  const leftDone = await store.appendTurnCompleted(leftItem.id, leftTurn.id);

  store.checkout(rootLeaf);
  const rightTurn = await store.appendTurn(rootLeaf, "right prompt");
  const rightItem = await store.appendResponseItem(rightTurn.id, rightTurn.id, {
    role: "assistant",
    text: "right answer",
  });
  await store.appendTurnCompleted(rightItem.id, rightTurn.id);

  const rows = buildHistoryTurnRows(store, store.leafId);
  const ids = rows.map((row) => row.id);
  let state = createTuiState(store);
  state = updateTuiState(state, { type: "openHistory", leafId: historySelectionTargetId(store)! });
  state = updateTuiState(state, {
    type: "moveHistory",
    entryIds: ids,
    delta: -1,
    viewportHeight: 8,
  });

  expect(rows.map((row) => row.userText)).toEqual([
    "root prompt",
    "left prompt",
    "right prompt",
  ]);
  expect(rows[0].userPrefix).toBe("└── ");
  expect(rows[1].userPrefix).toBe("    ├── ");
  expect(rows[2].userPrefix).toBe("    └── ");
  expect(state.selectedEntryId).toBe(leftDone.id);
});

test("selection helpers move through visible history turn ids and keep scroll in view", async () => {
  const store = await createStore();
  const turnA = await store.appendTurn(store.leafId, "A");
  const itemA = await store.appendResponseItem(turnA.id, turnA.id, { text: "first" });
  const doneA = await store.appendTurnCompleted(itemA.id, turnA.id);
  const turnB = await store.appendTurn(store.leafId, "B");
  const itemB = await store.appendResponseItem(turnB.id, turnB.id, { text: "second" });
  const doneB = await store.appendTurnCompleted(itemB.id, turnB.id);

  const ids = buildHistoryTurnRows(store).map((row) => row.id);
  let state = createTuiState(store);
  state = moveSelection(state, ids, -100);
  expect(state.selectedEntryId).toBe(doneA.id);

  state = moveSelection(state, ids, 1);
  expect(state.selectedEntryId).toBe(doneB.id);

  state = moveSelection(state, ids, 100);
  expect(state.selectedEntryId).toBe(doneB.id);

  state = syncListScroll(state, ids, 1);
  expect(state.historyScroll).toBeGreaterThan(0);
});

test("parses local TUI slash commands", () => {
  expect(parseTuiInput("hello")).toEqual({ type: "submit", text: "hello" });
  expect(parseTuiInput("/resume")).toEqual({ type: "resume" });
  expect(parseTuiInput("/theme")).toEqual({ type: "theme" });
  expect(parseTuiInput("/rename first turn")).toEqual({ type: "rename", label: "first turn" });
  expect(parseTuiInput("/rename")).toEqual({ type: "unknown", message: "/rename requires a name" });
  expect(parseTuiInput("/status")).toEqual({ type: "status" });
  expect(parseTuiInput("/quit")).toEqual({ type: "quit" });
  expect(parseTuiInput("/exit")).toEqual({ type: "quit" });
  expect(parseTuiInput("/fork")).toEqual({ type: "unknown", message: "Unknown command: /fork" });
  expect(parseTuiInput("/branches")).toEqual({ type: "unknown", message: "Unknown command: /branches" });
  expect(parseTuiInput("/label first turn")).toEqual({
    type: "unknown",
    message: "Unknown command: /label",
  });
});

test("filters slash commands for popup selection without tab completion", async () => {
  const store = await createStore();
  let state = createTuiState(store);

  expect(filterSlashCommands("hello")).toEqual([]);
  expect(filterSlashCommands("/").map((command) => command.name)).toEqual([
    "resume",
    "theme",
    "rename",
    "status",
    "quit",
    "exit",
  ]);
  expect(filterSlashCommands("/f").map((command) => command.name)).toEqual([]);
  expect(filterSlashCommands("/r").map((command) => command.name)).toEqual(["resume", "rename"]);
  expect(filterSlashCommands("/rename name")).toEqual([]);

  state = updateTuiState(state, { type: "inputChanged", value: "/" });
  expect(state.overlay).toBe("slash");

  state = updateTuiState(state, { type: "moveSlash", total: 6, delta: 1 });
  expect(state.slashSelection).toBe(1);

  state = updateTuiState(state, { type: "inputChanged", value: "/rename name" });
  expect(state.overlay).toBe("none");
});

test("theme overlay selects UI themes", async () => {
  const store = await createStore();
  let state = createTuiState(store);

  state = updateTuiState(state, { type: "openTheme" });
  expect(state.overlay).toBe("theme");
  expect(footerMode(state)).toBe("ThemePicker");

  const rows = buildThemeRows(TUI_THEMES, state.themeName, state.themeSelection);
  expect(rows[0].isActive).toBe(true);

  state = updateTuiState(state, { type: "moveTheme", total: TUI_THEMES.length, delta: 1 });
  state = updateTuiState(state, { type: "themeSelected", themeName: TUI_THEMES[state.themeSelection].name });
  expect(state.themeName).toBe(TUI_THEMES[1].name);
  expect(state.overlay).toBe("none");
});

test("resume overlay selects saved sessions", async () => {
  const store = await createStore();
  const sessions = [
    {
      id: store.id,
      leafId: store.leafId,
      cwd: store.cwd,
      createdAt: new Date().toISOString(),
      turnCount: 0,
      responseItemCount: 0,
    },
  ];
  const rows = buildSessionRows(sessions, store.id, store.id);
  let state = createTuiState(store);

  expect(rows.some((row) => row.id === store.id && row.isCurrent)).toBe(true);

  state = updateTuiState(state, { type: "openSessions", sessionId: store.id });
  expect(state.overlay).toBe("sessions");

  state = updateTuiState(state, {
    type: "syncSessions",
    sessionIds: rows.map((row) => row.id),
    viewportHeight: 4,
  });
  expect(state.selectedSessionId).toBe(store.id);
});

async function createStore(): Promise<SessionStore> {
  const cwd = await mkdtemp(join(tmpdir(), "pico-cwd-"));
  const home = await mkdtemp(join(tmpdir(), "pico-home-"));
  Bun.env.HOME = home;
  return SessionStore.create(cwd);
}
