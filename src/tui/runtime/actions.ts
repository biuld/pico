import type { CliRenderer } from "@opentui/core";
import { PicoAppSession } from "../../app-session";
import type { PicoThreadInfo } from "../../thread/store";
import {
  filterSlashCommands,
  parseTuiInput,
  type TuiInputCommand,
} from "../commands";
import { buildHistoryTurnRows, historySelectionTargetId } from "../history";
import { createTuiState, type TuiState } from "../state";
import { themeIndex, TUI_THEMES } from "../theme";
import type { TuiMsg } from "../update";
import { HISTORY_ROW_HEIGHT } from "../widgets/history-picker";
import type { OpenTuiLayout } from "../widgets/layout";
import { buildThreadRows } from "../widgets/resume-picker";
import { STATUS_LINE_ITEMS } from "../widgets/statusline-picker";
import { surfaceListViewportHeight } from "./view";

export interface RuntimeActions {
  setComposerFocus(): void;
  setInputValue(value: string): void;
  showHistory(): void;
  showThreads(): Promise<void>;
  showTheme(): void;
  showStatusLine(): void;
  showTranscript(): void;
  showShortcuts(): void;
  moveHistorySelection(delta: number): void;
  moveThreadSelection(delta: number): void;
  moveThemeSelection(delta: number): void;
  moveStatusLineSelection(delta: number): void;
  selectTheme(): void;
  toggleStatusLineItem(): void;
  queueDraft(text: string): void;
  recallQueuedDraft(): void;
  interruptTurn(): void;
  restoreSelected(): Promise<void>;
  resumeSelected(): Promise<void>;
  handleLocalCommand(command: TuiInputCommand): Promise<boolean>;
  acceptSlashSelection(): Promise<void>;
}

export interface RuntimeActionHost {
  renderer: Pick<CliRenderer, "height">;
  layout: OpenTuiLayout;
  appSession: PicoAppSession;
  getState(): TuiState;
  setState(state: TuiState): void;
  dispatch(msg: TuiMsg): void;
  render(): void;
  isBusy(): boolean;
  getThreads(): readonly PicoThreadInfo[];
  setThreads(threads: PicoThreadInfo[]): void;
  close(): Promise<void>;
}

export function createRuntimeActions(host: RuntimeActionHost): RuntimeActions {
  const setComposerFocus = () => {
    host.dispatch({ type: "closeSurface" });
    host.layout.focusInput();
    host.render();
  };

  const setInputValue = (value: string) => {
    host.layout.setInputValue(value);
    host.dispatch({ type: "setInput", value });
  };

  const busyGuard = () => {
    if (!host.isBusy()) return false;
    host.dispatch({
      type: "setTurnStatus",
      status: host.getState().bottomPane.turnStatus,
      message: "turn is running",
    });
    host.render();
    return true;
  };

  const persistStatusLineItems = async (items: readonly string[]) => {
    try {
      await host.appSession.updateStatusLineItems(items);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      host.dispatch({ type: "setTurnStatus", status: "failed", message });
      host.render();
    }
  };

  const showHistory = () => {
    const app = host.appSession.app;
    if (!app.store) {
      host.dispatch({ type: "openHistory", leafId: "" });
      host.layout.blurInput();
      host.render();
      return;
    }

    host.dispatch({
      type: "openHistory",
      leafId: historySelectionTargetId(app.store) || app.store.id,
    });
    host.layout.blurInput();
    host.render();
  };

  const showThreads = async () => {
    const app = host.appSession.app;
    const threads = await PicoAppSession.listThreads(app.store?.cwd || app.cwd);
    host.setThreads(threads);
    host.dispatch({ type: "openThreads", threadId: app.store?.id || threads[0]?.id || "" });
    host.layout.blurInput();
    host.render();
  };

  const showTheme = () => {
    const state = host.getState();
    host.dispatch({ type: "openTheme" });
    host.dispatch({
      type: "moveTheme",
      total: TUI_THEMES.length,
      delta: themeIndex(state.themeName) - state.themeSelection,
    });
    host.layout.blurInput();
    host.render();
  };

  const showStatusLine = () => {
    host.dispatch({ type: "openStatusLine" });
    host.layout.blurInput();
    host.render();
  };

  const showTranscript = () => {
    host.dispatch({ type: "openTranscript" });
    host.layout.blurInput();
    host.render();
  };

  const showShortcuts = () => {
    host.dispatch({ type: "openShortcuts" });
    host.layout.blurInput();
    host.render();
  };

  const moveHistorySelection = (delta: number) => {
    const app = host.appSession.app;
    const state = host.getState();
    if (!app.store) {
      host.dispatch({
        type: "setTurnStatus",
        status: state.bottomPane.turnStatus,
        message: "no turns yet",
      });
      host.render();
      return;
    }

    const rows = buildHistoryTurnRows(app.store, state.selectedEntryId);
    host.dispatch({
      type: "moveHistory",
      entryIds: rows.map((row) => row.id),
      delta,
      viewportHeight: Math.max(
        1,
        Math.floor(surfaceListViewportHeight(host.renderer.height) / HISTORY_ROW_HEIGHT),
      ),
    });
    host.render();
  };

  const moveThreadSelection = (delta: number) => {
    const app = host.appSession.app;
    const state = host.getState();
    const rows = buildThreadRows(host.getThreads(), state.selectedThreadId, app.store?.id);
    host.dispatch({
      type: "moveThread",
      threadIds: rows.map((row) => row.id),
      delta,
      viewportHeight: surfaceListViewportHeight(host.renderer.height),
    });
    host.render();
  };

  const moveThemeSelection = (delta: number) => {
    host.dispatch({ type: "moveTheme", total: TUI_THEMES.length, delta });
    host.render();
  };

  const moveStatusLineSelection = (delta: number) => {
    host.dispatch({ type: "moveStatusLine", total: STATUS_LINE_ITEMS.length, delta });
    host.render();
  };

  const selectTheme = () => {
    const theme = TUI_THEMES[host.getState().themeSelection] || TUI_THEMES[0];
    host.dispatch({ type: "themeSelected", themeName: theme.name });
    host.layout.focusInput();
    host.render();
  };

  const toggleStatusLineItem = () => {
    const item = STATUS_LINE_ITEMS[host.getState().statusLineSelection];
    if (!item) return;
    host.dispatch({ type: "toggleStatusLineItem", item: item.id });
    void persistStatusLineItems(host.getState().statusLineItems);
    host.render();
  };

  const queueDraft = (text: string) => {
    const queued = host.appSession.queueMessage(text);
    if (!queued) {
      host.dispatch({
        type: "setTurnStatus",
        status: host.getState().bottomPane.turnStatus,
        message: "nothing to queue",
      });
      host.render();
      return;
    }

    setInputValue("");
    host.dispatch({
      type: "setTurnStatus",
      status: host.getState().bottomPane.turnStatus,
      message: `queued ${host.appSession.snapshot.queuedMessages.length}`,
    });
    host.layout.focusInput();
    host.render();
  };

  const recallQueuedDraft = () => {
    const queued = host.appSession.takeQueuedMessage();
    if (!queued) {
      host.dispatch({
        type: "setTurnStatus",
        status: host.getState().bottomPane.turnStatus,
        message: "no queued input",
      });
      host.render();
      return;
    }

    setInputValue(queued.text);
    host.dispatch({
      type: "setTurnStatus",
      status: host.getState().bottomPane.turnStatus,
      message: "queued input restored",
    });
    host.layout.focusInput();
    host.render();
  };

  const interruptTurn = () => {
    const hasQueuedMessage = host.appSession.snapshot.queuedMessages.length > 0;
    void host.appSession.interruptTurn();
    host.dispatch({
      type: "setTurnStatus",
      status: "running",
      message: hasQueuedMessage ? "interrupting; sending queued" : "interrupting",
    });
    host.render();
  };

  const resetDraft = async (reason: "new" | "clear") => {
    if (busyGuard()) return;

    const didReset = reason === "new"
      ? await host.appSession.newDraft()
      : await host.appSession.clearDraft();
    if (!didReset) return;

    const nextApp = host.appSession.app;
    host.setState(createTuiState(undefined, {
      statusLineItems: nextApp.config.statusLineItems,
    }));
    setInputValue("");
    host.dispatch({
      type: "setTurnStatus",
      status: "idle",
      message: reason === "new" ? "new draft" : "cleared",
    });
    host.layout.focusInput();
    host.render();
  };

  const restoreSelected = async () => {
    if (busyGuard()) return;

    const app = host.appSession.app;
    const state = host.getState();
    if (!app.store) {
      host.dispatch({
        type: "setTurnStatus",
        status: state.bottomPane.turnStatus,
        message: "no turns yet",
      });
      host.render();
      return;
    }

    const rows = buildHistoryTurnRows(app.store, state.selectedEntryId);
    const selected = rows.find((row) => row.id === state.selectedEntryId);
    if (!selected) {
      host.dispatch({
        type: "setTurnStatus",
        status: state.bottomPane.turnStatus,
        message: "no turns yet",
      });
      host.render();
      return;
    }

    const branch = await host.appSession.restore(selected.id);
    host.dispatch({ type: "restoreCompleted", branchId: branch.id, targetId: branch.targetId });
    setComposerFocus();
  };

  const resumeSelected = async () => {
    if (busyGuard()) return;

    const app = host.appSession.app;
    const threadId = host.getState().selectedThreadId;
    if (!threadId || threadId === app.store?.id) {
      setComposerFocus();
      return;
    }

    await host.appSession.resume(threadId);
    const nextApp = host.appSession.app;
    host.setState(createTuiState(nextApp.store, {
      statusLineItems: nextApp.config.statusLineItems,
    }));
    host.dispatch({ type: "resumeCompleted", threadId });
    setInputValue("");
    host.layout.focusInput();
    host.render();
  };

  const handleLocalCommand = async (command: TuiInputCommand): Promise<boolean> => {
    if (command.type === "empty") return true;
    if (command.type === "submit") return false;
    if (command.type === "new") {
      await resetDraft("new");
      return true;
    }
    if (command.type === "clear") {
      await resetDraft("clear");
      return true;
    }
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
      const app = host.appSession.app;
      host.dispatch({
        type: "setTurnStatus",
        status: host.getState().bottomPane.turnStatus,
        message: app.store
          ? `thread ${shortId(app.store.id)} leaf ${shortId(app.store.leafId)}`
          : "thread new",
      });
      host.render();
      return true;
    }
    if (command.type === "quit") {
      await host.close();
      return true;
    }
    if (command.type === "unknown") {
      host.dispatch({ type: "setTurnStatus", status: "failed", message: command.message });
      host.dispatch({ type: "closeSurface" });
      host.render();
      return true;
    }

    host.dispatch({ type: "setTurnStatus", status: "failed", message: "unsupported command" });
    host.dispatch({ type: "closeSurface" });
    host.render();
    return true;
  };

  const acceptSlashSelection = async () => {
    const commands = filterSlashCommands(host.layout.getInputValue());
    const command = commands[host.getState().slashSelection] || commands[0];
    if (!command) {
      host.dispatch({
        type: "setTurnStatus",
        status: host.getState().bottomPane.turnStatus,
        message: "no matching command",
      });
      host.render();
      return;
    }

    if (command.takesArgument) {
      setInputValue(`/${command.name} `);
      host.dispatch({ type: "closeSurface" });
      host.layout.focusInput();
      host.render();
      return;
    }

    setInputValue("");
    await handleLocalCommand(parseTuiInput(`/${command.name}`));
  };

  return {
    setComposerFocus,
    setInputValue,
    showHistory,
    showThreads,
    showTheme,
    showStatusLine,
    showTranscript,
    showShortcuts,
    moveHistorySelection,
    moveThreadSelection,
    moveThemeSelection,
    moveStatusLineSelection,
    selectTheme,
    toggleStatusLineItem,
    queueDraft,
    recallQueuedDraft,
    interruptTurn,
    restoreSelected,
    resumeSelected,
    handleLocalCommand,
    acceptSlashSelection,
  };
}

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}
