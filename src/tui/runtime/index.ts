import { CliRenderEvents, type CliRenderer, type KeyEvent } from "@opentui/core";
import type {
  DraftAppState,
  RawItemEvent,
  TurnAbortedEvent,
  TurnCompletedEvent,
  TurnFailedEvent,
} from "../../app/controller";
import { PicoAppSession, PICO_APP_SESSION_EVENTS } from "../../app-session";
import type { PicoThreadInfo } from "../../thread/store";
import { installOpenTuiKeybindings } from "../keybindings";
import { composerOwnsFocus, createTuiState, type TuiState } from "../state";
import { updateTuiState, type TuiMsg } from "../update";
import type { ApprovalDecision } from "../widgets/approval-panel";
import { composerPlaceholderMode } from "../widgets/composer-placeholder";
import type { OpenTuiLayout } from "../widgets/layout";
import { createRuntimeActions } from "./actions";
import { createRuntimeClocks } from "./clocks";
import { copyRendererSelection } from "./clipboard";
import { submitRuntimeInput } from "./submit";
import { buildRuntimeLayoutUpdate } from "./view";

export function runOpenTuiRuntime(
  renderer: CliRenderer,
  layout: OpenTuiLayout,
  app: DraftAppState,
): Promise<void> {
  const appSession = new PicoAppSession(app);
  let state: TuiState = createTuiState(appSession.app.store, {
    statusLineItems: appSession.app.config.statusLineItems,
  });
  let threads: PicoThreadInfo[] = [];
  let closing = false;
  let render: () => void;

  const dispatch = (msg: TuiMsg) => {
    state = updateTuiState(state, msg);
  };

  const composerShouldAnimate = () => {
    const snapshot = appSession.snapshot;
    return snapshot.running &&
      !snapshot.pendingApproval &&
      state.bottomPane.turnStatus === "running";
  };

  const clocks = createRuntimeClocks({
    isClosing: () => closing,
    isActivityActive: composerShouldAnimate,
    placeholderMode: () => composerPlaceholderMode(state),
    onTick: () => render(),
  });

  const copySelection = async (notifyWhenEmpty = false) => {
    const result = await copyRendererSelection(renderer, notifyWhenEmpty);
    if (!result.message) return;
    dispatch({ type: "setTurnStatus", status: state.bottomPane.turnStatus, message: result.message });
    render();
  };

  const copyKeyHandler = (event: KeyEvent) => {
    if (event.name.toLowerCase() !== "c" || !event.ctrl || !event.shift) return;
    event.preventDefault();
    event.stopPropagation();
    void copySelection(true);
  };

  const terminalFocusHandler = () => {
    if (closing || !composerOwnsFocus(state) || appSession.snapshot.pendingApproval) return;
    layout.focusInput();
  };

  render = () => {
    const snapshot = appSession.snapshot;
    clocks.sync();
    layout.update(buildRuntimeLayoutUpdate({
      app: snapshot.app,
      getState: () => state,
      dispatch,
      threads,
      inputValue: layout.getInputValue(),
      streamingText: snapshot.streamingText,
      liveLeafId: snapshot.liveLeafId,
      pendingApproval: snapshot.pendingApproval,
      queuedMessages: snapshot.queuedMessages,
      running: snapshot.running,
      ...clocks.snapshot(),
      rendererWidth: renderer.width,
      rendererHeight: renderer.height,
    }));
    renderer.requestRender();
  };

  const close = async () => {
    if (closing) return;
    closing = true;
    clocks.dispose();
    await appSession.shutdown();
    renderer.destroy();
  };

  const actions = createRuntimeActions({
    renderer,
    layout,
    appSession,
    getState: () => state,
    setState: (nextState) => {
      state = nextState;
    },
    dispatch,
    render,
    isBusy: () => appSession.isBusy(),
    getThreads: () => threads,
    setThreads: (nextThreads) => {
      threads = [...nextThreads];
    },
    close,
  });

  const resolveApproval = (decision: ApprovalDecision) => {
    appSession.resolveApproval(decision);
  };

  const submitInput = async () => {
    await submitRuntimeInput({
      getSubmitSurface: () => {
        if (state.bottomPane.activeView === "commandPopup") return "commandPopup";
        if (composerOwnsFocus(state)) return "composer";
        return "blocked";
      },
      getInputValue: () => layout.getInputValue(),
      acceptSlashSelection: () => actions.acceptSlashSelection(),
      handleLocalCommand: (command) => actions.handleLocalCommand(command),
      clearInput: () => actions.setInputValue(""),
      isBusy: () => appSession.isBusy(),
      isRunning: () => appSession.snapshot.running,
      queueDraft: actions.queueDraft,
      submit: (text) => appSession.submit(text),
      setBusyStatus: () => {
        dispatch({
          type: "setTurnStatus",
          status: state.bottomPane.turnStatus,
          message: "turn is running",
        });
        render();
      },
    });
  };

  appSession.on(PICO_APP_SESSION_EVENTS.CODEX_STATUS, () => {
    if (!closing) render();
  });
  appSession.on(PICO_APP_SESSION_EVENTS.CONFIG_CHANGED, render);
  appSession.on(PICO_APP_SESSION_EVENTS.TURN_BUSY, () => {
    dispatch({ type: "setTurnStatus", status: state.bottomPane.turnStatus, message: "turn is running" });
    render();
  });
  appSession.on(PICO_APP_SESSION_EVENTS.TURN_SUBMITTING, () => {
    dispatch({ type: "setTurnStatus", status: "running", message: "starting" });
    dispatch({ type: "closeSurface" });
    clocks.restartActivity();
    render();
  });
  appSession.on(PICO_APP_SESSION_EVENTS.TURN_THREAD_READY, (event) => {
    if (!state.selectedEntryId) {
      dispatch({ type: "selectEntry", entryId: event.leafId });
      render();
    }
  });
  appSession.on(PICO_APP_SESSION_EVENTS.TURN_STARTED, () => {
    clocks.markActivityStarted();
    const store = appSession.app.store;
    if (store) dispatch({ type: "selectEntry", entryId: store.leafId });
    dispatch({ type: "setTurnStatus", status: "running", message: "starting turn" });
    render();
  });
  appSession.on(PICO_APP_SESSION_EVENTS.TURN_CODEX_STARTED, () => {
    dispatch({ type: "setTurnStatus", status: "running", message: "waiting for model" });
    render();
  });
  appSession.on(PICO_APP_SESSION_EVENTS.TURN_INTERRUPT_REQUESTED, (event) => {
    dispatch({
      type: "setTurnStatus",
      status: "running",
      message: event.pending ? "interrupt pending" : "interrupting",
    });
    render();
  });
  appSession.on(PICO_APP_SESSION_EVENTS.TURN_INTERRUPT_FAILED, (event) => {
    const message = event.error instanceof Error ? event.error.message : String(event.error);
    dispatch({
      type: "setTurnStatus",
      status: state.bottomPane.turnStatus,
      message: `interrupt failed: ${message}`,
    });
    render();
  });
  appSession.on(PICO_APP_SESSION_EVENTS.ASSISTANT_DELTA, render);
  appSession.on(PICO_APP_SESSION_EVENTS.RAW_ITEM_COMPLETED, (event: RawItemEvent) => {
    dispatch({
      type: "setTurnStatus",
      status: "running",
      message: `stored ${event.entryId || "raw item"}`,
    });
    render();
  });
  appSession.on(PICO_APP_SESSION_EVENTS.TURN_COMPLETED, (event: TurnCompletedEvent) => {
    clocks.finishActivity();
    dispatch({ type: "selectEntry", entryId: event.leafId });
    dispatch({
      type: "setTurnStatus",
      status: "idle",
      message: `stored ${event.rawItemCount} raw item(s)`,
    });
    render();
  });
  appSession.on(PICO_APP_SESSION_EVENTS.TURN_ABORTED, (event: TurnAbortedEvent) => {
    clocks.finishActivity();
    dispatch({ type: "selectEntry", entryId: event.leafId });
    dispatch({ type: "setTurnStatus", status: "idle", message: event.reason || "interrupted" });
    render();
  });
  appSession.on(PICO_APP_SESSION_EVENTS.TURN_FAILED, (event: TurnFailedEvent) => {
    const message = event.error instanceof Error ? event.error.message : String(event.error);
    clocks.finishActivity();
    const store = appSession.app.store;
    if (store) dispatch({ type: "selectEntry", entryId: store.leafId });
    dispatch({ type: "setTurnStatus", status: "failed", message });
    render();
  });
  appSession.on(PICO_APP_SESSION_EVENTS.TURN_FINISHED, () => {
    clocks.finishActivity();
    if (!closing && composerOwnsFocus(state) && !appSession.snapshot.pendingApproval) {
      layout.focusInput();
    }
    render();
  });
  appSession.on(PICO_APP_SESSION_EVENTS.APPROVAL_REQUESTED, () => {
    dispatch({ type: "showApproval" });
    layout.blurInput();
    render();
  });
  appSession.on(PICO_APP_SESSION_EVENTS.APPROVAL_RESOLVED, (event) => {
    dispatch({ type: "setTurnStatus", status: event.running ? "running" : "idle" });
    dispatch({ type: "closeSurface" });
    layout.focusInput();
    render();
  });
  appSession.on(PICO_APP_SESSION_EVENTS.QUEUE_CHANGED, (event) => {
    dispatch({
      type: "setTurnStatus",
      status: state.bottomPane.turnStatus,
      message: event.queuedCount > 0 ? `queued ${event.queuedCount}` : "queue empty",
    });
    render();
  });

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
    hasPendingApproval: () => Boolean(appSession.snapshot.pendingApproval),
    pendingApprovalMethod: () => appSession.snapshot.pendingApproval?.method,
    isRunning: () => appSession.snapshot.running,
    dispatch,
    render,
    close: () => void close(),
    focusInput: () => layout.focusInput(),
    setComposerFocus: actions.setComposerFocus,
    showHistory: actions.showHistory,
    showThreads: () => void actions.showThreads(),
    showTheme: actions.showTheme,
    showStatusLine: actions.showStatusLine,
    showTranscript: actions.showTranscript,
    showShortcuts: actions.showShortcuts,
    moveHistorySelection: actions.moveHistorySelection,
    moveThreadSelection: actions.moveThreadSelection,
    moveThemeSelection: actions.moveThemeSelection,
    moveStatusLineSelection: actions.moveStatusLineSelection,
    restoreSelected: () => void actions.restoreSelected(),
    resumeSelected: () => void actions.resumeSelected(),
    selectTheme: actions.selectTheme,
    toggleStatusLineItem: actions.toggleStatusLineItem,
    queueDraft: actions.queueDraft,
    recallQueuedDraft: actions.recallQueuedDraft,
    submitInput: () => void submitInput(),
    interruptTurn: actions.interruptTurn,
    setInputValue: actions.setInputValue,
    acceptSlashSelection: () => void actions.acceptSlashSelection(),
    resolveApproval,
  });

  renderer.on(CliRenderEvents.RESIZE, render);
  renderer.on(CliRenderEvents.FOCUS, terminalFocusHandler);
  renderer.on(CliRenderEvents.SELECTION, () => {
    void copySelection(false);
  });
  renderer.keyInput.on("keypress", copyKeyHandler);
  renderer.on(CliRenderEvents.DESTROY, () => {
    renderer.off(CliRenderEvents.FOCUS, terminalFocusHandler);
    renderer.keyInput.off("keypress", copyKeyHandler);
    clocks.dispose();
    appSession.dispose();
  });

  layout.focusInput();
  render();

  return new Promise((resolve) => {
    renderer.on(CliRenderEvents.DESTROY, resolve);
  });
}
