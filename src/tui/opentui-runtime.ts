import { CliRenderEvents, type CliRenderer, type KeyEvent } from "@opentui/core";
import {
  approvalResult,
  ensureAppThread,
  loadApp,
  runTurn,
  type AppState,
  type AssistantDeltaEvent,
  type DraftAppState,
  type RawItemEvent,
  type TurnCompletedEvent,
  type TurnFailedEvent,
} from "../app/controller";
import type { JSONRPCRequest } from "../codex/app-server";
import { updateProjectPicoConfig } from "../config";
import { PicoThreadStore, type PicoThreadInfo } from "../thread/store";
import {
  filterSlashCommands,
  parseTuiInput,
  type TuiInputCommand,
} from "./commands";
import { buildHistoryTurnRows, historySelectionTargetId } from "./history";
import { installOpenTuiKeybindings } from "./keybindings";
import { buildOverlayView } from "./overlays";
import { createTuiState, type TuiState } from "./state";
import { getTheme, themeIndex, TUI_THEMES } from "./theme";
import { updateTuiState, type TuiMsg } from "./update";
import type { ApprovalDecision } from "./widgets/approval-overlay";
import { ACTIVITY_SPINNER_INTERVAL_MS } from "./widgets/activity-indicator";
import { COMPOSER_OVERLAY_INSET, formatComposerStatus } from "./widgets/composer";
import {
  composerPlaceholderMode,
  COMPOSER_PLACEHOLDER_INTERVAL_MS,
  formatComposerPlaceholder,
  type ComposerPlaceholderMode,
} from "./widgets/composer-placeholder";
import {
  formatTransientStatusLine,
} from "./widgets/footer";
import { HISTORY_ROW_HEIGHT } from "./widgets/history-picker";
import type { OpenTuiLayout } from "./widgets/layout";
import { buildThreadRows } from "./widgets/resume-picker";
import { buildStatusLineRows, STATUS_LINE_ITEMS } from "./widgets/statusline-picker";
import { buildThemeRows } from "./widgets/theme-picker";
import { buildTranscriptCellsWithLive } from "./transcript";
import {
  formatCodexStatusLineStyled,
  formatConfiguredStatusPreviewText,
  statusLineItemValue,
} from "./statusline";

interface PendingApproval {
  request: JSONRPCRequest;
  resolve: (result: unknown) => void;
}

export function runOpenTuiRuntime(
  renderer: CliRenderer,
  layout: OpenTuiLayout,
  app: DraftAppState,
): Promise<void> {
  let currentApp = app;
  let state: TuiState = createTuiState(currentApp.store, {
    statusLineItems: currentApp.config.statusLineItems,
  });
  let streamingText = "";
  let liveLeafId: string | undefined;
  let threads: PicoThreadInfo[] = [];
  let pendingApproval: PendingApproval | undefined;
  let running = false;
  let activityFrame = 0;
  let activityStartedAtMs: number | undefined;
  let activityTimer: ReturnType<typeof setInterval> | undefined;
  let placeholderFrame = 0;
  let placeholderMode: ComposerPlaceholderMode = composerPlaceholderMode(state);
  let placeholderTimer: ReturnType<typeof setInterval> | undefined;
  let closing = false;
  let detachCodexStatus: (() => void) | undefined;

  const dispatch = (msg: TuiMsg) => {
    state = updateTuiState(state, msg);
  };

  const persistStatusLineItems = async (items: readonly string[]) => {
    try {
      const nextConfig = await updateProjectPicoConfig(currentApp.cwd, {
        statusLineItems: [...items],
      });
      currentApp.config = {
        ...currentApp.config,
        statusLineItems: nextConfig.statusLineItems,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      dispatch({ type: "setTurnStatus", status: "failed", message });
      render();
    }
  };

  const copySelection = async (notifyWhenEmpty = false) => {
    const text = renderer.getSelection()?.getSelectedText() || "";
    if (text.trim().length === 0) {
      if (notifyWhenEmpty) {
        dispatch({ type: "setTurnStatus", status: state.turnStatus, message: "no selection" });
        render();
      }
      return;
    }

    const copied = await copyTextToClipboard(renderer, text);
    dispatch({
      type: "setTurnStatus",
      status: state.turnStatus,
      message: copied
        ? `copied ${formatCopySize(text)}`
        : "clipboard unavailable",
    });
    render();
  };

  const copyKeyHandler = (event: KeyEvent) => {
    if (event.name.toLowerCase() !== "c" || !event.ctrl || !event.shift) return;
    event.preventDefault();
    event.stopPropagation();
    void copySelection(true);
  };

  const composerShouldAnimate = () => (
    running &&
    !pendingApproval &&
    state.turnStatus === "running"
  );

  const stopActivityTimer = () => {
    if (!activityTimer) return;
    clearInterval(activityTimer);
    activityTimer = undefined;
    activityFrame = 0;
  };

  const syncActivityTimer = () => {
    if (!composerShouldAnimate()) {
      stopActivityTimer();
      return;
    }
    if (activityTimer) return;

    activityTimer = setInterval(() => {
      if (closing || !composerShouldAnimate()) {
        stopActivityTimer();
        return;
      }
      activityFrame = (activityFrame + 1) % Number.MAX_SAFE_INTEGER;
      render();
    }, ACTIVITY_SPINNER_INTERVAL_MS);
  };

  const stopPlaceholderTimer = () => {
    if (!placeholderTimer) return;
    clearInterval(placeholderTimer);
    placeholderTimer = undefined;
  };

  const syncPlaceholderMode = () => {
    const nextMode = composerPlaceholderMode(state);
    const changed = nextMode !== placeholderMode;
    if (nextMode !== placeholderMode) {
      placeholderMode = nextMode;
      placeholderFrame = 0;
    }
    return { mode: nextMode, changed };
  };

  const syncPlaceholderTimer = () => {
    const { mode } = syncPlaceholderMode();
    if (mode === "hidden") {
      stopPlaceholderTimer();
      return;
    }
    if (placeholderTimer) return;

    placeholderTimer = setInterval(() => {
      const next = syncPlaceholderMode();
      if (closing || next.mode === "hidden") {
        stopPlaceholderTimer();
        return;
      }
      if (next.changed) {
        render();
        return;
      }
      placeholderFrame += 1;
      render();
    }, COMPOSER_PLACEHOLDER_INTERVAL_MS);
  };

  const render = () => {
    syncActivityTimer();
    syncPlaceholderTimer();
    const pickerViewportHeight = overlayListViewportHeight(renderer.height);
    const historyViewportHeight = Math.max(1, Math.floor(pickerViewportHeight / HISTORY_ROW_HEIGHT));
    const theme = getTheme(state.themeName);
    const inputValue = layout.getInputValue();
    const slashCommands = filterSlashCommands(inputValue);
    dispatch({ type: "syncSlash", total: slashCommands.length });

    const store = currentApp.store;
    const selectedEntryId = state.selectedEntryId || store?.leafId || "";
    const historyRows = store ? buildHistoryTurnRows(store, selectedEntryId) : [];
    dispatch({
      type: "syncHistory",
      entryIds: historyRows.map((row) => row.id),
      viewportHeight: historyViewportHeight,
    });
    const threadRows = buildThreadRows(threads, state.selectedThreadId, store?.id);
    dispatch({
      type: "syncThreads",
      threadIds: threadRows.map((row) => row.id),
      viewportHeight: pickerViewportHeight,
    });
    dispatch({ type: "syncTheme", total: TUI_THEMES.length });
    const themeRows = buildThemeRows(TUI_THEMES, state.themeName, state.themeSelection);
    dispatch({ type: "syncStatusLine", total: STATUS_LINE_ITEMS.length });
    const codexStatus = currentApp.codex.statusSnapshot;

    const activeFrame = composerShouldAnimate() ? activityFrame : undefined;
    const activeElapsedMs = composerShouldAnimate() && activityStartedAtMs !== undefined
      ? Date.now() - activityStartedAtMs
      : undefined;
    const transcriptCells = buildTranscriptCellsWithLive(
      currentApp,
      streamingText,
      liveLeafId,
    );
    const statusText = formatComposerStatus({
      pendingApproval: pendingApproval?.request,
      running,
      turnStatus: state.turnStatus,
      statusMessage: state.statusMessage,
      frame: activeFrame,
      elapsedMs: activeElapsedMs,
    });
    const statusLineRows = buildStatusLineRows(
      state.statusLineItems,
      state.statusLineSelection,
      (item) => statusLineItemValue(item, codexStatus, store),
    );
    const statusLinePreview = formatConfiguredStatusPreviewText(
      codexStatus,
      store,
      state.statusLineItems,
    );
    layout.update({
      width: renderer.width,
      height: renderer.height,
      theme,
      transcriptCells,
      composer: {
        transientStatus: formatTransientStatusLine(statusText),
        placeholder: formatComposerPlaceholder(state, placeholderFrame),
        statusLine: formatCodexStatusLineStyled({
          store,
          state,
          codex: codexStatus,
          items: state.statusLineItems,
          width: Math.max(1, renderer.width - 4),
        }, theme),
      },
      overlay: buildOverlayView({
        app: currentApp,
        state,
        theme,
        streamingText,
        liveLeafId,
        slashCommands,
        historyRows,
        threadRows,
        themeRows,
        statusLineRows,
        statusLinePreview,
        threadViewportHeight: pickerViewportHeight,
        pickerViewportHeight,
        rendererWidth: renderer.width,
        pendingApproval: pendingApproval?.request,
      }),
    });
    renderer.requestRender();
  };

  const attachCodexStatus = (nextApp: DraftAppState): (() => void) => {
    const onStatus = () => {
      if (!closing) render();
    };
    nextApp.codex.on("status", onStatus);
    return () => nextApp.codex.off("status", onStatus);
  };

  detachCodexStatus = attachCodexStatus(currentApp);

  const setComposerFocus = () => {
    dispatch({ type: "closeOverlay" });
    layout.focusInput();
    render();
  };

  const setInputValue = (value: string) => {
    layout.setInputValue(value);
    dispatch({ type: "setInput", value });
  };

  const showHistory = () => {
    if (!currentApp.store) {
      dispatch({ type: "openHistory", leafId: "" });
      layout.blurInput();
      render();
      return;
    }

    dispatch({
      type: "openHistory",
      leafId: historySelectionTargetId(currentApp.store) || currentApp.store.id,
    });
    layout.blurInput();
    render();
  };

  const showThreads = async () => {
    threads = await PicoThreadStore.list(currentApp.store?.cwd || currentApp.cwd);
    dispatch({ type: "openThreads", threadId: currentApp.store?.id || threads[0]?.id || "" });
    layout.blurInput();
    render();
  };

  const showTheme = () => {
    dispatch({ type: "openTheme" });
    dispatch({
      type: "moveTheme",
      total: TUI_THEMES.length,
      delta: themeIndex(state.themeName) - state.themeSelection,
    });
    layout.blurInput();
    render();
  };

  const showStatusLine = () => {
    dispatch({ type: "openStatusLine" });
    layout.blurInput();
    render();
  };

  const showTranscript = () => {
    dispatch({ type: "openTranscript" });
    layout.blurInput();
    render();
  };

  const showShortcuts = () => {
    dispatch({ type: "openShortcuts" });
    layout.blurInput();
    render();
  };

  const moveHistorySelection = (delta: number) => {
    if (!currentApp.store) {
      dispatch({ type: "setTurnStatus", status: state.turnStatus, message: "no turns yet" });
      render();
      return;
    }

    const rows = buildHistoryTurnRows(currentApp.store, state.selectedEntryId);
    dispatch({
      type: "moveHistory",
      entryIds: rows.map((row) => row.id),
      delta,
      viewportHeight: Math.max(1, Math.floor(overlayListViewportHeight(renderer.height) / HISTORY_ROW_HEIGHT)),
    });
    render();
  };

  const moveThreadSelection = (delta: number) => {
    const rows = buildThreadRows(threads, state.selectedThreadId, currentApp.store?.id);
    dispatch({
      type: "moveThread",
      threadIds: rows.map((row) => row.id),
      delta,
      viewportHeight: overlayListViewportHeight(renderer.height),
    });
    render();
  };

  const moveThemeSelection = (delta: number) => {
    dispatch({ type: "moveTheme", total: TUI_THEMES.length, delta });
    render();
  };

  const moveStatusLineSelection = (delta: number) => {
    dispatch({ type: "moveStatusLine", total: STATUS_LINE_ITEMS.length, delta });
    render();
  };

  const selectTheme = () => {
    const theme = TUI_THEMES[state.themeSelection] || TUI_THEMES[0];
    dispatch({ type: "themeSelected", themeName: theme.name });
    layout.focusInput();
    render();
  };

  const toggleStatusLineItem = () => {
    const item = STATUS_LINE_ITEMS[state.statusLineSelection];
    if (!item) return;
    dispatch({ type: "toggleStatusLineItem", item: item.id });
    void persistStatusLineItems(state.statusLineItems);
    render();
  };

  const restoreSelected = async () => {
    if (running || pendingApproval) {
      dispatch({ type: "setTurnStatus", status: state.turnStatus, message: "turn is running" });
      render();
      return;
    }

    if (!currentApp.store) {
      dispatch({ type: "setTurnStatus", status: state.turnStatus, message: "no turns yet" });
      render();
      return;
    }

    const rows = buildHistoryTurnRows(currentApp.store, state.selectedEntryId);
    const selected = rows.find((row) => row.id === state.selectedEntryId);
    if (!selected) {
      dispatch({ type: "setTurnStatus", status: state.turnStatus, message: "no turns yet" });
      render();
      return;
    }

    const branch = await currentApp.store.appendBranch(selected.id);
    dispatch({ type: "restoreCompleted", branchId: branch.id, targetId: branch.targetId });
    setComposerFocus();
  };

  const resumeSelected = async () => {
    if (running || pendingApproval) {
      dispatch({ type: "setTurnStatus", status: state.turnStatus, message: "turn is running" });
      render();
      return;
    }

    const threadId = state.selectedThreadId;
    if (!threadId || threadId === currentApp.store?.id) {
      setComposerFocus();
      return;
    }

    const cwd = currentApp.store?.cwd || currentApp.cwd;
    detachCodexStatus?.();
    await currentApp.codex.shutdown().catch(() => {});
    currentApp = await loadApp(cwd, threadId);
    detachCodexStatus = attachCodexStatus(currentApp);
    state = createTuiState(currentApp.store, {
      statusLineItems: currentApp.config.statusLineItems,
    });
    dispatch({ type: "resumeCompleted", threadId });
    streamingText = "";
    liveLeafId = undefined;
    setInputValue("");
    layout.focusInput();
    render();
  };

  const renameSelected = async (label: string) => {
    if (running || pendingApproval) {
      dispatch({ type: "setTurnStatus", status: state.turnStatus, message: "turn is running" });
      render();
      return;
    }

    if (!currentApp.store) {
      dispatch({ type: "setTurnStatus", status: state.turnStatus, message: "no turns yet" });
      render();
      return;
    }

    await currentApp.store.appendLabel(state.selectedEntryId, label);
    dispatch({ type: "renameCompleted", entryId: state.selectedEntryId });
    render();
  };

  const handleLocalCommand = async (command: TuiInputCommand): Promise<boolean> => {
    if (command.type === "empty") return true;
    if (command.type === "submit") return false;
    if (command.type === "resume") {
      await showThreads();
      return true;
    }
    if (command.type === "theme") {
      showTheme();
      return true;
    }
    if (command.type === "statusline") {
      showStatusLine();
      return true;
    }
    if (command.type === "status") {
      dispatch({
        type: "setTurnStatus",
        status: state.turnStatus,
        message: currentApp.store
          ? `thread ${shortId(currentApp.store.id)} leaf ${shortId(currentApp.store.leafId)}`
          : "thread new",
      });
      render();
      return true;
    }
    if (command.type === "quit") {
      await close();
      return true;
    }
    if (command.type === "unknown") {
      dispatch({ type: "setTurnStatus", status: "failed", message: command.message });
      dispatch({ type: "closeOverlay" });
      render();
      return true;
    }

    await renameSelected(command.label);
    dispatch({ type: "closeOverlay" });
    return true;
  };

  const acceptSlashSelection = async () => {
    const commands = filterSlashCommands(layout.getInputValue());
    const command = commands[state.slashSelection] || commands[0];
    if (!command) {
      dispatch({ type: "setTurnStatus", status: state.turnStatus, message: "no matching command" });
      render();
      return;
    }

    if (command.takesArgument) {
      setInputValue(`/${command.name} `);
      dispatch({ type: "closeOverlay" });
      layout.focusInput();
      render();
      return;
    }

    setInputValue("");
    await handleLocalCommand(parseTuiInput(`/${command.name}`));
  };

  const close = async () => {
    if (closing) return;
    closing = true;
    if (pendingApproval) {
      pendingApproval.resolve(approvalResult(pendingApproval.request.method, "decline"));
      pendingApproval = undefined;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    detachCodexStatus?.();
    detachCodexStatus = undefined;
    stopActivityTimer();
    stopPlaceholderTimer();
    await currentApp.codex.shutdown().catch(() => {});
    renderer.destroy();
  };

  const askApproval = (request: JSONRPCRequest): Promise<unknown> => {
    return new Promise((resolve) => {
      pendingApproval = { request, resolve };
      dispatch({ type: "showApproval" });
      layout.blurInput();
      render();
    });
  };

  const resolveApproval = (decision: ApprovalDecision) => {
    if (!pendingApproval) return;
    pendingApproval.resolve(approvalResult(pendingApproval.request.method, decision));
    pendingApproval = undefined;
    dispatch({ type: "setTurnStatus", status: running ? "running" : "idle" });
    dispatch({ type: "closeOverlay" });
    layout.focusInput();
    render();
  };

  const emit = (event: string, payload: unknown) => {
    if (event === "turn:started") {
      const started = payload as { turnId?: string };
      activityStartedAtMs ??= Date.now();
      liveLeafId = started.turnId;
      if (currentApp.store) {
        dispatch({ type: "selectEntry", entryId: currentApp.store.leafId });
      }
      dispatch({ type: "setTurnStatus", status: "running", message: "starting turn" });
      render();
      return;
    }
    if (event === "turn:codex-started") {
      dispatch({ type: "setTurnStatus", status: "running", message: "waiting for model" });
      render();
      return;
    }
    if (event === "assistant:delta") {
      streamingText += (payload as AssistantDeltaEvent).delta;
      render();
      return;
    }
    if (event === "raw-item:completed") {
      const item = payload as RawItemEvent;
      liveLeafId = item.entryId || liveLeafId;
      if (rawItemHasOutputText(item.item)) streamingText = "";
      dispatch({ type: "setTurnStatus", status: "running", message: `stored ${item.entryId || "raw item"}` });
      render();
      return;
    }
    if (event === "turn:completed") {
      const result = payload as TurnCompletedEvent;
      streamingText = "";
      activityStartedAtMs = undefined;
      liveLeafId = undefined;
      dispatch({ type: "selectEntry", entryId: result.leafId });
      dispatch({
        type: "setTurnStatus",
        status: "idle",
        message: `stored ${result.rawItemCount} raw item(s)`,
      });
      render();
      return;
    }
    if (event === "turn:failed") {
      const failed = payload as TurnFailedEvent;
      const message = failed.error instanceof Error ? failed.error.message : String(failed.error);
      streamingText = "";
      activityStartedAtMs = undefined;
      liveLeafId = undefined;
      if (currentApp.store) {
        dispatch({ type: "selectEntry", entryId: currentApp.store.leafId });
      }
      dispatch({ type: "setTurnStatus", status: "failed", message });
      render();
    }
  };

  const submitInput = async () => {
    if (state.overlay === "slash") {
      await acceptSlashSelection();
      return;
    }
    if (state.overlay !== "none") return;

    const command = parseTuiInput(layout.getInputValue());
    const handledLocally = await handleLocalCommand(command);
    if (handledLocally) {
      setInputValue("");
      return;
    }

    if (command.type !== "submit") return;
    if (running || pendingApproval) {
      dispatch({ type: "setTurnStatus", status: state.turnStatus, message: "turn is running" });
      render();
      return;
    }

    setInputValue("");
    dispatch({ type: "setTurnStatus", status: "running", message: "starting" });
    dispatch({ type: "closeOverlay" });
    streamingText = "";
    liveLeafId = undefined;
    activityStartedAtMs = Date.now();
    activityFrame = 0;
    running = true;
    render();

    let activeApp: AppState;
    try {
      activeApp = await ensureAppThread(currentApp);
      currentApp = activeApp;
      if (!state.selectedEntryId) {
        dispatch({ type: "selectEntry", entryId: activeApp.store.leafId });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      running = false;
      activityStartedAtMs = undefined;
      liveLeafId = undefined;
      dispatch({ type: "setTurnStatus", status: "failed", message });
      render();
      return;
    }

    runTurn(activeApp, command.text, { askApproval, emit })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        streamingText = "";
        activityStartedAtMs = undefined;
        liveLeafId = undefined;
        dispatch({ type: "selectEntry", entryId: activeApp.store.leafId });
        dispatch({ type: "setTurnStatus", status: "failed", message });
        render();
      })
      .finally(() => {
        running = false;
        activityStartedAtMs = undefined;
        if (!closing && state.overlay === "none") layout.focusInput();
      });
  };

  layout.setInputHandlers({
    onSubmit: () => {
      void submitInput();
    },
    onInput: (value) => {
      dispatch({ type: "inputChanged", value });
      render();
    },
  });

  installOpenTuiKeybindings(renderer, {
    getState: () => state,
    getInputValue: () => layout.getInputValue(),
    hasPendingApproval: () => Boolean(pendingApproval),
    pendingApprovalMethod: () => pendingApproval?.request.method,
    isRunning: () => running,
    dispatch,
    render,
    close: () => void close(),
    focusInput: () => layout.focusInput(),
    setComposerFocus,
    showHistory,
    showThreads: () => void showThreads(),
    showTheme,
    showStatusLine,
    showTranscript,
    showShortcuts,
    moveHistorySelection,
    moveThreadSelection,
    moveThemeSelection,
    moveStatusLineSelection,
    restoreSelected: () => void restoreSelected(),
    resumeSelected: () => void resumeSelected(),
    selectTheme,
    toggleStatusLineItem,
    setInputValue,
    acceptSlashSelection: () => void acceptSlashSelection(),
    resolveApproval,
  });

  renderer.on(CliRenderEvents.RESIZE, render);
  renderer.on(CliRenderEvents.SELECTION, () => {
    void copySelection(false);
  });
  renderer.keyInput.on("keypress", copyKeyHandler);
  renderer.on(CliRenderEvents.DESTROY, () => {
    renderer.keyInput.off("keypress", copyKeyHandler);
    detachCodexStatus?.();
    detachCodexStatus = undefined;
    stopActivityTimer();
    stopPlaceholderTimer();
    void currentApp.codex.shutdown().catch(() => {});
  });

  layout.focusInput();
  render();

  return new Promise((resolve) => {
    renderer.on(CliRenderEvents.DESTROY, resolve);
  });
}

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

function overlayListViewportHeight(rendererHeight: number): number {
  const overlayHeight = Math.max(1, rendererHeight - COMPOSER_OVERLAY_INSET);
  return Math.max(1, overlayHeight - 3);
}

async function copyTextToClipboard(renderer: CliRenderer, text: string): Promise<boolean> {
  if (renderer.copyToClipboardOSC52(text)) return true;
  if (process.platform !== "darwin") return false;

  try {
    const proc = Bun.spawn(["pbcopy"], {
      stdin: "pipe",
      stdout: "ignore",
      stderr: "ignore",
    });
    proc.stdin.write(text);
    proc.stdin.end();
    return await proc.exited === 0;
  } catch {
    return false;
  }
}

function formatCopySize(text: string): string {
  const count = Array.from(text).length;
  return `${count} char${count === 1 ? "" : "s"}`;
}

function rawItemHasOutputText(item: Record<string, unknown>): boolean {
  if (item.type !== "message") return false;
  const content = item.content;
  return Array.isArray(content) && content.some((part) => {
    if (!part || typeof part !== "object") return false;
    const value = part as Record<string, unknown>;
    return typeof value.text === "string" &&
      (value.type === "output_text" || value.type === "text");
  });
}
