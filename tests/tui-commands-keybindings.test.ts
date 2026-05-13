import { expect, test } from "bun:test";
import type { CliRenderer } from "@opentui/core";
import { filterSlashCommands, parseTuiInput } from "../src/tui/commands";
import { installOpenTuiKeybindings, type KeybindingRuntime } from "../src/tui/keybindings";
import { createTuiState } from "../src/tui/state";
import { updateTuiState } from "../src/tui/update";
import { createStore } from "./tui-test-helpers";

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
    showThreads: () => {},
    showTheme: () => {},
    showStatusLine: () => {},
    showTranscript: () => {},
    showShortcuts: () => {},
    moveHistorySelection: () => {},
    moveThreadSelection: () => {},
    moveThemeSelection: () => {},
    moveStatusLineSelection: () => {},
    restoreSelected: () => {},
    resumeSelected: () => {},
    selectTheme: () => {},
    toggleStatusLineItem: () => {},
    queueDraft: () => {},
    recallQueuedDraft: () => {},
    interruptTurn: () => {},
    setInputValue: () => {},
    acceptSlashSelection: () => {},
    resolveApproval: () => {},
  };

  installOpenTuiKeybindings(renderer, runtime);

  expect(handlers[0]("\u0003")).toBe(true);
  expect(closeCount).toBe(0);
  expect(state.bottomPane.statusMessage).toBe("ctrl+d twice to exit");

  expect(handlers[0]("\u0004")).toBe(true);
  expect(closeCount).toBe(0);
  expect(state.bottomPane.statusMessage).toBe("ctrl+d again to exit");

  expect(handlers[0]("\u0004")).toBe(true);
  expect(closeCount).toBe(1);
  expect(renderCount).toBeGreaterThan(1);
});

test("tab queues a running draft", () => {
  const handlers: Array<(sequence: string) => boolean> = [];
  const renderer = {
    addInputHandler: (handler: (sequence: string) => boolean) => {
      handlers.push(handler);
    },
  } as unknown as CliRenderer;

  let state = createTuiState();
  let inputValue = "next prompt";
  let queuedText = "";
  const runtime: KeybindingRuntime = {
    getState: () => state,
    getInputValue: () => inputValue,
    hasPendingApproval: () => false,
    pendingApprovalMethod: () => undefined,
    isRunning: () => true,
    dispatch: (msg) => {
      state = updateTuiState(state, msg);
    },
    render: () => {},
    close: () => {},
    focusInput: () => {},
    setComposerFocus: () => {},
    showHistory: () => {},
    showThreads: () => {},
    showTheme: () => {},
    showStatusLine: () => {},
    showTranscript: () => {},
    showShortcuts: () => {},
    moveHistorySelection: () => {},
    moveThreadSelection: () => {},
    moveThemeSelection: () => {},
    moveStatusLineSelection: () => {},
    restoreSelected: () => {},
    resumeSelected: () => {},
    selectTheme: () => {},
    toggleStatusLineItem: () => {},
    queueDraft: (text) => {
      queuedText = text;
      inputValue = "";
    },
    recallQueuedDraft: () => {},
    interruptTurn: () => {},
    setInputValue: (value) => {
      inputValue = value;
    },
    acceptSlashSelection: () => {},
    resolveApproval: () => {},
  };

  installOpenTuiKeybindings(renderer, runtime);

  expect(handlers[1]("\t")).toBe(true);
  expect(queuedText).toBe("next prompt");
});

test("option up restores the queued draft into the composer", () => {
  const handlers: Array<(sequence: string) => boolean> = [];
  const renderer = {
    addInputHandler: (handler: (sequence: string) => boolean) => {
      handlers.push(handler);
    },
  } as unknown as CliRenderer;

  let state = createTuiState();
  let recallCount = 0;
  const runtime: KeybindingRuntime = {
    getState: () => state,
    getInputValue: () => "",
    hasPendingApproval: () => false,
    pendingApprovalMethod: () => undefined,
    isRunning: () => true,
    dispatch: (msg) => {
      state = updateTuiState(state, msg);
    },
    render: () => {},
    close: () => {},
    focusInput: () => {},
    setComposerFocus: () => {},
    showHistory: () => {},
    showThreads: () => {},
    showTheme: () => {},
    showStatusLine: () => {},
    showTranscript: () => {},
    showShortcuts: () => {},
    moveHistorySelection: () => {},
    moveThreadSelection: () => {},
    moveThemeSelection: () => {},
    moveStatusLineSelection: () => {},
    restoreSelected: () => {},
    resumeSelected: () => {},
    selectTheme: () => {},
    toggleStatusLineItem: () => {},
    queueDraft: () => {},
    recallQueuedDraft: () => {
      recallCount += 1;
    },
    interruptTurn: () => {},
    setInputValue: () => {},
    acceptSlashSelection: () => {},
    resolveApproval: () => {},
  };

  installOpenTuiKeybindings(renderer, runtime);

  expect(handlers[1]("\u001b[1;3A")).toBe(true);
  expect(recallCount).toBe(1);
});

test("approval controls own focus and consume composer input", () => {
  const handlers: Array<(sequence: string) => boolean> = [];
  const renderer = {
    addInputHandler: (handler: (sequence: string) => boolean) => {
      handlers.push(handler);
    },
  } as unknown as CliRenderer;

  let state = updateTuiState(createTuiState(), { type: "showApproval" });
  let inputValue = "";
  let resolvedDecision = "";
  const runtime: KeybindingRuntime = {
    getState: () => state,
    getInputValue: () => inputValue,
    hasPendingApproval: () => true,
    pendingApprovalMethod: () => "item/permissions/requestApproval",
    isRunning: () => true,
    dispatch: (msg) => {
      state = updateTuiState(state, msg);
    },
    render: () => {},
    close: () => {},
    focusInput: () => {},
    setComposerFocus: () => {},
    showHistory: () => {},
    showThreads: () => {},
    showTheme: () => {},
    showStatusLine: () => {},
    showTranscript: () => {},
    showShortcuts: () => {},
    moveHistorySelection: () => {},
    moveThreadSelection: () => {},
    moveThemeSelection: () => {},
    moveStatusLineSelection: () => {},
    restoreSelected: () => {},
    resumeSelected: () => {},
    selectTheme: () => {},
    toggleStatusLineItem: () => {},
    queueDraft: () => {},
    recallQueuedDraft: () => {},
    interruptTurn: () => {},
    setInputValue: (value) => {
      inputValue = value;
    },
    acceptSlashSelection: () => {},
    resolveApproval: (decision) => {
      resolvedDecision = decision;
    },
  };

  installOpenTuiKeybindings(renderer, runtime);

  expect(state.bottomPane.activeView).toBe("approval");
  expect(handlers[0]("s")).toBe(true);
  expect(resolvedDecision).toBe("");

  inputValue = "src/tui/runtime/index.ts";
  expect(handlers[0]("\r")).toBe(true);
  expect(resolvedDecision).toBe("accept");
});

test("approval controls handle empty-composer navigation and decisions", () => {
  const handlers: Array<(sequence: string) => boolean> = [];
  const renderer = {
    addInputHandler: (handler: (sequence: string) => boolean) => {
      handlers.push(handler);
    },
  } as unknown as CliRenderer;

  let state = updateTuiState(createTuiState(), { type: "showApproval" });
  const decisions: string[] = [];
  const runtime: KeybindingRuntime = {
    getState: () => state,
    getInputValue: () => "",
    hasPendingApproval: () => true,
    pendingApprovalMethod: () => "item/permissions/requestApproval",
    isRunning: () => true,
    dispatch: (msg) => {
      state = updateTuiState(state, msg);
    },
    render: () => {},
    close: () => {},
    focusInput: () => {},
    setComposerFocus: () => {},
    showHistory: () => {},
    showThreads: () => {},
    showTheme: () => {},
    showStatusLine: () => {},
    showTranscript: () => {},
    showShortcuts: () => {},
    moveHistorySelection: () => {},
    moveThreadSelection: () => {},
    moveThemeSelection: () => {},
    moveStatusLineSelection: () => {},
    restoreSelected: () => {},
    resumeSelected: () => {},
    selectTheme: () => {},
    toggleStatusLineItem: () => {},
    queueDraft: () => {},
    recallQueuedDraft: () => {},
    interruptTurn: () => {},
    setInputValue: () => {},
    acceptSlashSelection: () => {},
    resolveApproval: (decision) => {
      decisions.push(decision);
    },
  };

  installOpenTuiKeybindings(renderer, runtime);

  expect(handlers[0]("\u001b[B")).toBe(true);
  expect(state.approvalSelection).toBe(1);
  expect(handlers[0]("\r")).toBe(true);
  expect(decisions.at(-1)).toBe("decline");
  expect(handlers[0]("\u001b")).toBe(true);
  expect(decisions.at(-1)).toBe("decline");
});

test("tab does not submit an empty composer", () => {
  const handlers: Array<(sequence: string) => boolean> = [];
  const renderer = {
    addInputHandler: (handler: (sequence: string) => boolean) => {
      handlers.push(handler);
    },
  } as unknown as CliRenderer;

  let state = createTuiState();
  let inputValue = "";
  let submitCount = 0;
  const runtime: KeybindingRuntime = {
    getState: () => state,
    getInputValue: () => inputValue,
    hasPendingApproval: () => false,
    pendingApprovalMethod: () => undefined,
    isRunning: () => false,
    dispatch: (msg) => {
      state = updateTuiState(state, msg);
    },
    render: () => {},
    close: () => {},
    focusInput: () => {},
    setComposerFocus: () => {},
    showHistory: () => {},
    showThreads: () => {},
    showTheme: () => {},
    showStatusLine: () => {},
    showTranscript: () => {},
    showShortcuts: () => {},
    moveHistorySelection: () => {},
    moveThreadSelection: () => {},
    moveThemeSelection: () => {},
    moveStatusLineSelection: () => {},
    restoreSelected: () => {},
    resumeSelected: () => {},
    selectTheme: () => {},
    toggleStatusLineItem: () => {},
    queueDraft: () => {},
    recallQueuedDraft: () => {},
    submitInput: () => {
      submitCount += 1;
    },
    interruptTurn: () => {},
    setInputValue: (value) => {
      inputValue = value;
    },
    acceptSlashSelection: () => {},
    resolveApproval: () => {},
  };

  installOpenTuiKeybindings(renderer, runtime);

  expect(handlers[1]("\t")).toBe(true);
  expect(submitCount).toBe(0);

  inputValue = "send this";
  expect(handlers[1]("\t")).toBe(true);
  expect(submitCount).toBe(1);
});

test("ctrl+c and esc interrupt a running turn", () => {
  const handlers: Array<(sequence: string) => boolean> = [];
  const renderer = {
    addInputHandler: (handler: (sequence: string) => boolean) => {
      handlers.push(handler);
    },
  } as unknown as CliRenderer;

  let state = createTuiState();
  let interruptCount = 0;
  const runtime: KeybindingRuntime = {
    getState: () => state,
    getInputValue: () => "",
    hasPendingApproval: () => false,
    pendingApprovalMethod: () => undefined,
    isRunning: () => true,
    dispatch: (msg) => {
      state = updateTuiState(state, msg);
    },
    render: () => {},
    close: () => {},
    focusInput: () => {},
    setComposerFocus: () => {},
    showHistory: () => {},
    showThreads: () => {},
    showTheme: () => {},
    showStatusLine: () => {},
    showTranscript: () => {},
    showShortcuts: () => {},
    moveHistorySelection: () => {},
    moveThreadSelection: () => {},
    moveThemeSelection: () => {},
    moveStatusLineSelection: () => {},
    restoreSelected: () => {},
    resumeSelected: () => {},
    selectTheme: () => {},
    toggleStatusLineItem: () => {},
    queueDraft: () => {},
    recallQueuedDraft: () => {},
    interruptTurn: () => {
      interruptCount += 1;
    },
    setInputValue: () => {},
    acceptSlashSelection: () => {},
    resolveApproval: () => {},
  };

  installOpenTuiKeybindings(renderer, runtime);

  expect(handlers[0]("\u0003")).toBe(true);
  expect(handlers[1]("\u001b")).toBe(true);
  expect(interruptCount).toBe(2);
});

test("parses local TUI slash commands", () => {
  expect(parseTuiInput("hello")).toEqual({ type: "submit", text: "hello" });
  expect(parseTuiInput("/new")).toEqual({ type: "new" });
  expect(parseTuiInput("/clear")).toEqual({ type: "clear" });
  expect(parseTuiInput("/resume")).toEqual({ type: "resume" });
  expect(parseTuiInput("/theme")).toEqual({ type: "theme" });
  expect(parseTuiInput("/statusline")).toEqual({ type: "statusline" });
  expect(parseTuiInput("/rename first turn")).toEqual({
    type: "unknown",
    message: "Unknown command: /rename",
  });
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
    "new",
    "clear",
    "resume",
    "theme",
    "statusline",
    "status",
    "quit",
    "exit",
  ]);
  expect(filterSlashCommands("/l").map((command) => command.name)).toEqual([]);
  expect(filterSlashCommands("/c").map((command) => command.name)).toEqual(["clear"]);
  expect(filterSlashCommands("/r").map((command) => command.name)).toEqual(["resume"]);
  expect(filterSlashCommands("/s").map((command) => command.name)).toEqual(["statusline", "status"]);
  expect(filterSlashCommands("/rename name")).toEqual([]);

  state = updateTuiState(state, { type: "inputChanged", value: "/" });
  expect(state.bottomPane.activeView).toBe("commandPopup");

  state = updateTuiState(state, { type: "moveSlash", total: 9, delta: 1 });
  expect(state.slashSelection).toBe(1);

  state = updateTuiState(state, { type: "inputChanged", value: "/rename name" });
  expect(state.bottomPane.activeView).toBe("none");
});
