import { CliRenderEvents, type CliRenderer } from "@opentui/core";
import {
  approvalResult,
  ensureAppSession,
  loadApp,
  runTurn,
  type AppState,
  type AssistantDeltaEvent,
  type DraftAppState,
  type RawItemEvent,
  type TurnCompletedEvent,
  type TurnFailedEvent,
} from "../app/controller";
import type { JSONRPCRequest } from "../codex/types";
import { SessionStore, type SessionInfo } from "../session/store";
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
import { formatComposerStatus } from "./widgets/composer";
import { formatFooterLine } from "./widgets/footer";
import type { OpenTuiLayout } from "./widgets/layout";
import { buildSessionRows } from "./widgets/resume-picker";
import { buildThemeRows } from "./widgets/theme-picker";
import { formatMainTranscriptStyled } from "./transcript";

interface PendingApproval {
  request: JSONRPCRequest;
  resolve: (result: unknown) => void;
}

export function runOpenTuiRuntime(
  renderer: CliRenderer,
  layout: OpenTuiLayout,
  app: DraftAppState,
): Promise<void> {
  const { input } = layout.composer;

  let currentApp = app;
  let state: TuiState = createTuiState(currentApp.store);
  let streamingText = "";
  let sessions: SessionInfo[] = [];
  let pendingApproval: PendingApproval | undefined;
  let running = false;
  let closing = false;

  const dispatch = (msg: TuiMsg) => {
    state = updateTuiState(state, msg);
  };

  const render = () => {
    const listHeight = listViewportHeight(renderer.height);
    const theme = getTheme(state.themeName);
    const slashCommands = filterSlashCommands(input.value);
    dispatch({ type: "syncSlash", total: slashCommands.length });

    layout.resize(renderer.width, renderer.height);
    const store = currentApp.store;
    const selectedEntryId = state.selectedEntryId || store?.leafId || "";
    const historyRows = store ? buildHistoryTurnRows(store, selectedEntryId) : [];
    dispatch({
      type: "syncHistory",
      entryIds: historyRows.map((row) => row.id),
      viewportHeight: listHeight,
    });
    const sessionRows = buildSessionRows(sessions, state.selectedSessionId, store?.id);
    dispatch({
      type: "syncSessions",
      sessionIds: sessionRows.map((row) => row.id),
      viewportHeight: listHeight,
    });
    dispatch({ type: "syncTheme", total: TUI_THEMES.length });
    const themeRows = buildThemeRows(TUI_THEMES, state.themeName, state.themeSelection);

    layout.applyTheme(theme);
    layout.transcript.setContent(formatMainTranscriptStyled(
      currentApp,
      streamingText,
      layout.transcriptHeight(renderer.height),
      Math.max(1, renderer.width - 4),
      theme,
    ));
    layout.transcript.resetScroll();
    layout.composer.setStatus(formatComposerStatus({
      pendingApproval: pendingApproval?.request,
      running,
      turnStatus: state.turnStatus,
      statusMessage: state.statusMessage,
    }));
    layout.composer.setFooter(formatFooterLine(
      store,
      state,
      Math.max(1, renderer.width - 4),
    ));
    layout.applyOverlay(
      buildOverlayView({
        app: currentApp,
        state,
        theme,
        streamingText,
        slashCommands,
        historyRows,
        sessionRows,
        themeRows,
        historyViewportHeight: listHeight,
        sessionViewportHeight: listHeight,
        rendererHeight: renderer.height,
        pendingApproval: pendingApproval?.request,
      }),
    );
    renderer.requestRender();
  };

  const setComposerFocus = () => {
    dispatch({ type: "closeOverlay" });
    input.focus();
    render();
  };

  const setInputValue = (value: string) => {
    input.value = value;
    dispatch({ type: "setInput", value });
  };

  const showHistory = () => {
    if (!currentApp.store) {
      dispatch({ type: "openHistory", leafId: "" });
      input.blur();
      render();
      return;
    }

    dispatch({
      type: "openHistory",
      leafId: historySelectionTargetId(currentApp.store) || currentApp.store.id,
    });
    input.blur();
    render();
  };

  const showSessions = async () => {
    sessions = await SessionStore.list(currentApp.store?.cwd || currentApp.cwd);
    dispatch({ type: "openSessions", sessionId: currentApp.store?.id || sessions[0]?.id || "" });
    input.blur();
    render();
  };

  const showTheme = () => {
    dispatch({ type: "openTheme" });
    dispatch({
      type: "moveTheme",
      total: TUI_THEMES.length,
      delta: themeIndex(state.themeName) - state.themeSelection,
    });
    input.blur();
    render();
  };

  const showTranscript = () => {
    dispatch({ type: "openTranscript" });
    input.blur();
    render();
  };

  const showShortcuts = () => {
    dispatch({ type: "openShortcuts" });
    input.blur();
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
      viewportHeight: listViewportHeight(renderer.height),
    });
    render();
  };

  const moveSessionSelection = (delta: number) => {
    const rows = buildSessionRows(sessions, state.selectedSessionId, currentApp.store?.id);
    dispatch({
      type: "moveSession",
      sessionIds: rows.map((row) => row.id),
      delta,
      viewportHeight: listViewportHeight(renderer.height),
    });
    render();
  };

  const moveThemeSelection = (delta: number) => {
    dispatch({ type: "moveTheme", total: TUI_THEMES.length, delta });
    render();
  };

  const selectTheme = () => {
    const theme = TUI_THEMES[state.themeSelection] || TUI_THEMES[0];
    dispatch({ type: "themeSelected", themeName: theme.name });
    input.focus();
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

    const sessionId = state.selectedSessionId;
    if (!sessionId || sessionId === currentApp.store?.id) {
      setComposerFocus();
      return;
    }

    const cwd = currentApp.store?.cwd || currentApp.cwd;
    await currentApp.codex.shutdown().catch(() => {});
    currentApp = await loadApp(cwd, sessionId);
    state = createTuiState(currentApp.store);
    dispatch({ type: "resumeCompleted", sessionId });
    streamingText = "";
    setInputValue("");
    input.focus();
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
      await showSessions();
      return true;
    }
    if (command.type === "theme") {
      showTheme();
      return true;
    }
    if (command.type === "status") {
      dispatch({
        type: "setTurnStatus",
        status: state.turnStatus,
        message: currentApp.store
          ? `session ${shortId(currentApp.store.id)} leaf ${shortId(currentApp.store.leafId)}`
          : "session new",
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
    const commands = filterSlashCommands(input.value);
    const command = commands[state.slashSelection] || commands[0];
    if (!command) {
      dispatch({ type: "setTurnStatus", status: state.turnStatus, message: "no matching command" });
      render();
      return;
    }

    if (command.takesArgument) {
      setInputValue(`/${command.name} `);
      dispatch({ type: "closeOverlay" });
      input.focus();
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
    await currentApp.codex.shutdown().catch(() => {});
    renderer.destroy();
  };

  const askApproval = (request: JSONRPCRequest): Promise<unknown> => {
    return new Promise((resolve) => {
      pendingApproval = { request, resolve };
      dispatch({ type: "showApproval" });
      input.blur();
      render();
    });
  };

  const resolveApproval = (decision: ApprovalDecision) => {
    if (!pendingApproval) return;
    pendingApproval.resolve(approvalResult(pendingApproval.request.method, decision));
    pendingApproval = undefined;
    dispatch({ type: "setTurnStatus", status: running ? "running" : "idle" });
    dispatch({ type: "closeOverlay" });
    input.focus();
    render();
  };

  const emit = (event: string, payload: unknown) => {
    if (event === "assistant:delta") {
      streamingText += (payload as AssistantDeltaEvent).delta;
      render();
      return;
    }
    if (event === "raw-item:completed") {
      const item = payload as RawItemEvent;
      dispatch({ type: "setTurnStatus", status: "running", message: `stored ${item.entryId || "raw item"}` });
      render();
      return;
    }
    if (event === "turn:completed") {
      const result = payload as TurnCompletedEvent;
      streamingText = "";
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

    const command = parseTuiInput(input.value);
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
    running = true;
    render();

    let activeApp: AppState;
    try {
      activeApp = await ensureAppSession(currentApp);
      currentApp = activeApp;
      if (!state.selectedEntryId) {
        dispatch({ type: "selectEntry", entryId: activeApp.store.leafId });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      running = false;
      dispatch({ type: "setTurnStatus", status: "failed", message });
      render();
      return;
    }

    runTurn(activeApp, command.text, { askApproval, emit })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        streamingText = "";
        dispatch({ type: "selectEntry", entryId: activeApp.store.leafId });
        dispatch({ type: "setTurnStatus", status: "failed", message });
        render();
      })
      .finally(() => {
        running = false;
        if (!closing && state.overlay === "none") input.focus();
      });
  };

  input.on("enter", () => {
    void submitInput();
  });

  input.onSubmit = () => {
    void submitInput();
  };

  input.on("input", () => {
    dispatch({ type: "inputChanged", value: input.value });
    render();
  });

  installOpenTuiKeybindings(renderer, {
    getState: () => state,
    getInputValue: () => input.value,
    hasPendingApproval: () => Boolean(pendingApproval),
    pendingApprovalMethod: () => pendingApproval?.request.method,
    isRunning: () => running,
    dispatch,
    render,
    close: () => void close(),
    focusInput: () => input.focus(),
    setComposerFocus,
    showHistory,
    showSessions: () => void showSessions(),
    showTheme,
    showTranscript,
    showShortcuts,
    moveHistorySelection,
    moveSessionSelection,
    moveThemeSelection,
    restoreSelected: () => void restoreSelected(),
    resumeSelected: () => void resumeSelected(),
    selectTheme,
    setInputValue,
    acceptSlashSelection: () => void acceptSlashSelection(),
    resolveApproval,
  });

  renderer.on(CliRenderEvents.RESIZE, render);
  renderer.on(CliRenderEvents.DESTROY, () => {
    void currentApp.codex.shutdown().catch(() => {});
  });

  input.focus();
  render();

  return new Promise((resolve) => {
    renderer.on(CliRenderEvents.DESTROY, resolve);
  });
}

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

function listViewportHeight(rendererHeight: number): number {
  return Math.max(1, Math.min(12, Math.max(6, rendererHeight - 8)) - 2);
}
