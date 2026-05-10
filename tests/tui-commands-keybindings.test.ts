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
    showLaunchpad: () => {},
    moveHistorySelection: () => {},
    moveThreadSelection: () => {},
    moveThemeSelection: () => {},
    moveStatusLineSelection: () => {},
    moveLaunchpadSelection: () => {},
    restoreSelected: () => {},
    resumeSelected: () => {},
    selectTheme: () => {},
    toggleStatusLineItem: () => {},
    queueDraft: () => {},
    submitSelectedQueuedMessage: () => {},
    removeSelectedQueuedMessage: () => {},
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

test("tab queues a running draft into the launchpad", () => {
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
    showLaunchpad: () => {},
    moveHistorySelection: () => {},
    moveThreadSelection: () => {},
    moveThemeSelection: () => {},
    moveStatusLineSelection: () => {},
    moveLaunchpadSelection: () => {},
    restoreSelected: () => {},
    resumeSelected: () => {},
    selectTheme: () => {},
    toggleStatusLineItem: () => {},
    queueDraft: (text) => {
      queuedText = text;
      inputValue = "";
    },
    submitSelectedQueuedMessage: () => {},
    removeSelectedQueuedMessage: () => {},
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

test("launchpad overlay keys can launch and remove queued messages", () => {
  const handlers: Array<(sequence: string) => boolean> = [];
  const renderer = {
    addInputHandler: (handler: (sequence: string) => boolean) => {
      handlers.push(handler);
    },
  } as unknown as CliRenderer;

  let state = updateTuiState(createTuiState(), { type: "openLaunchpad" });
  let launched = 0;
  let removed = 0;
  const runtime: KeybindingRuntime = {
    getState: () => state,
    getInputValue: () => "",
    hasPendingApproval: () => false,
    pendingApprovalMethod: () => undefined,
    isRunning: () => false,
    dispatch: (msg) => {
      state = updateTuiState(state, msg);
    },
    render: () => {},
    close: () => {},
    focusInput: () => {},
    setComposerFocus: () => {
      state = updateTuiState(state, { type: "closeOverlay" });
    },
    showHistory: () => {},
    showThreads: () => {},
    showTheme: () => {},
    showStatusLine: () => {},
    showTranscript: () => {},
    showShortcuts: () => {},
    showLaunchpad: () => {},
    moveHistorySelection: () => {},
    moveThreadSelection: () => {},
    moveThemeSelection: () => {},
    moveStatusLineSelection: () => {},
    moveLaunchpadSelection: () => {},
    restoreSelected: () => {},
    resumeSelected: () => {},
    selectTheme: () => {},
    toggleStatusLineItem: () => {},
    queueDraft: () => {},
    submitSelectedQueuedMessage: () => {
      launched += 1;
    },
    removeSelectedQueuedMessage: () => {
      removed += 1;
    },
    setInputValue: () => {},
    acceptSlashSelection: () => {},
    resolveApproval: () => {},
  };

  installOpenTuiKeybindings(renderer, runtime);

  expect(handlers[1]("\r")).toBe(true);
  expect(handlers[1]("d")).toBe(true);
  expect(handlers[1]("\u001b")).toBe(true);
  expect(launched).toBe(1);
  expect(removed).toBe(1);
  expect(state.overlay).toBe("none");
});

test("parses local TUI slash commands", () => {
  expect(parseTuiInput("hello")).toEqual({ type: "submit", text: "hello" });
  expect(parseTuiInput("/resume")).toEqual({ type: "resume" });
  expect(parseTuiInput("/theme")).toEqual({ type: "theme" });
  expect(parseTuiInput("/statusline")).toEqual({ type: "statusline" });
  expect(parseTuiInput("/launchpad")).toEqual({ type: "launchpad" });
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
    "statusline",
    "launchpad",
    "rename",
    "status",
    "quit",
    "exit",
  ]);
  expect(filterSlashCommands("/l").map((command) => command.name)).toEqual(["launchpad"]);
  expect(filterSlashCommands("/r").map((command) => command.name)).toEqual(["resume", "rename"]);
  expect(filterSlashCommands("/s").map((command) => command.name)).toEqual(["statusline", "status"]);
  expect(filterSlashCommands("/rename name")).toEqual([]);

  state = updateTuiState(state, { type: "inputChanged", value: "/" });
  expect(state.overlay).toBe("slash");

  state = updateTuiState(state, { type: "moveSlash", total: 8, delta: 1 });
  expect(state.slashSelection).toBe(1);

  state = updateTuiState(state, { type: "inputChanged", value: "/rename name" });
  expect(state.overlay).toBe("none");
});
