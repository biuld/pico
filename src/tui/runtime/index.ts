import { CliRenderEvents, type CliRenderer, type KeyEvent } from "@opentui/core";
import type {
  DraftAppState,
  RawItemEvent,
  TurnCompletedEvent,
  TurnFailedEvent,
} from "../../app/controller";
import { PicoAppSession, PICO_APP_SESSION_EVENTS } from "../../app-session";
import type { PicoThreadInfo } from "../../thread/store";
import { parseTuiInput } from "../commands";
import { installOpenTuiKeybindings } from "../keybindings";
import { createTuiState, type TuiState } from "../state";
import { updateTuiState, type TuiMsg } from "../update";
import type { ApprovalDecision } from "../widgets/approval-overlay";
import { composerPlaceholderMode } from "../widgets/composer-placeholder";
import type { OpenTuiLayout } from "../widgets/layout";
import { createRuntimeActions } from "./actions";
import { createRuntimeClocks } from "./clocks";
import { copyRendererSelection } from "./clipboard";
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
      state.turnStatus === "running";
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
    dispatch({ type: "setTurnStatus", status: state.turnStatus, message: result.message });
    render();
  };

  const copyKeyHandler = (event: KeyEvent) => {
    if (event.name.toLowerCase() !== "c" || !event.ctrl || !event.shift) return;
    event.preventDefault();
    event.stopPropagation();
    void copySelection(true);
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
    if (state.overlay === "slash") {
      await actions.acceptSlashSelection();
      return;
    }
    if (state.overlay !== "none") return;

    const command = parseTuiInput(layout.getInputValue());
    const handledLocally = await actions.handleLocalCommand(command);
    if (handledLocally) {
      actions.setInputValue("");
      return;
    }

    if (command.type !== "submit") return;
    if (appSession.isBusy()) {
      dispatch({ type: "setTurnStatus", status: state.turnStatus, message: "turn is running" });
      render();
      return;
    }

    actions.setInputValue("");
    appSession.submit(command.text);
  };

  appSession.on(PICO_APP_SESSION_EVENTS.CODEX_STATUS, () => {
    if (!closing) render();
  });
  appSession.on(PICO_APP_SESSION_EVENTS.CONFIG_CHANGED, render);
  appSession.on(PICO_APP_SESSION_EVENTS.TURN_BUSY, () => {
    dispatch({ type: "setTurnStatus", status: state.turnStatus, message: "turn is running" });
    render();
  });
  appSession.on(PICO_APP_SESSION_EVENTS.TURN_SUBMITTING, () => {
    dispatch({ type: "setTurnStatus", status: "running", message: "starting" });
    dispatch({ type: "closeOverlay" });
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
    if (!closing && state.overlay === "none") layout.focusInput();
    render();
  });
  appSession.on(PICO_APP_SESSION_EVENTS.APPROVAL_REQUESTED, () => {
    dispatch({ type: "showApproval" });
    layout.blurInput();
    render();
  });
  appSession.on(PICO_APP_SESSION_EVENTS.APPROVAL_RESOLVED, (event) => {
    dispatch({ type: "setTurnStatus", status: event.running ? "running" : "idle" });
    dispatch({ type: "closeOverlay" });
    layout.focusInput();
    render();
  });
  appSession.on(PICO_APP_SESSION_EVENTS.QUEUE_CHANGED, (event) => {
    dispatch({
      type: "setTurnStatus",
      status: state.turnStatus,
      message: event.queuedCount > 0 ? `queued ${event.queuedCount}` : "launchpad empty",
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
    showLaunchpad: actions.showLaunchpad,
    moveHistorySelection: actions.moveHistorySelection,
    moveThreadSelection: actions.moveThreadSelection,
    moveThemeSelection: actions.moveThemeSelection,
    moveStatusLineSelection: actions.moveStatusLineSelection,
    moveLaunchpadSelection: actions.moveLaunchpadSelection,
    restoreSelected: () => void actions.restoreSelected(),
    resumeSelected: () => void actions.resumeSelected(),
    selectTheme: actions.selectTheme,
    toggleStatusLineItem: actions.toggleStatusLineItem,
    queueDraft: actions.queueDraft,
    submitSelectedQueuedMessage: actions.submitSelectedQueuedMessage,
    removeSelectedQueuedMessage: actions.removeSelectedQueuedMessage,
    setInputValue: actions.setInputValue,
    acceptSlashSelection: () => void actions.acceptSlashSelection(),
    resolveApproval,
  });

  renderer.on(CliRenderEvents.RESIZE, render);
  renderer.on(CliRenderEvents.SELECTION, () => {
    void copySelection(false);
  });
  renderer.keyInput.on("keypress", copyKeyHandler);
  renderer.on(CliRenderEvents.DESTROY, () => {
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
