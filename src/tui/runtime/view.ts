import type { JSONRPCRequest } from "../../codex/app-server";
import type { DraftAppState } from "../../app/controller";
import type { PicoThreadInfo } from "../../thread/store";
import { buildBottomPanePanel } from "../surfaces/bottom-pane";
import { filterSlashCommands } from "../commands";
import { buildHistoryTurnRows } from "../history";
import { buildPagerOverlay } from "../surfaces/pager-overlays";
import { buildPickerSurface, pickerSurfaceListViewportHeight } from "../surfaces/picker-surfaces";
import type { TuiState } from "../core/state";
import {
  formatCodexStatusLineStyled,
  formatConfiguredStatusPreviewText,
  statusLineItemValue,
} from "../statusline";
import { getTheme, TUI_THEMES } from "../theme";
import { buildTranscriptCellsWithLive } from "../transcript";
import type { TuiMsg } from "../core/update";
import { bottomPaneHeight } from "../widgets/bottom-pane";
import { formatComposerStatus } from "../widgets/bottom/composer";
import { formatComposerPlaceholder } from "../widgets/bottom/placeholder";
import { formatTransientStatusLine } from "../widgets/bottom/footer";
import { HISTORY_ROW_HEIGHT } from "../widgets/pickers/history";
import type { OpenTuiLayoutUpdate } from "../widgets/layout";
import type { PendingInputPreviewMessage } from "../widgets/bottom/pending-input";
import { buildThreadRows } from "../widgets/pickers/resume";
import { buildStartupBannerState } from "../widgets/startup-banner";
import { buildStatusLineRows, STATUS_LINE_ITEMS } from "../widgets/pickers/statusline";
import { buildThemeRows } from "../widgets/pickers/theme";

export interface RuntimeViewInput {
  app: DraftAppState;
  getState(): TuiState;
  dispatch(msg: TuiMsg): void;
  threads: readonly PicoThreadInfo[];
  inputValue: string;
  streamingText: string;
  liveLeafId?: string;
  pendingApproval?: JSONRPCRequest;
  queuedMessages?: readonly PendingInputPreviewMessage[];
  running: boolean;
  activityFrame?: number;
  activityElapsedMs?: number;
  placeholderFrame: number;
  rendererWidth: number;
  rendererHeight: number;
}

export function buildRuntimeLayoutUpdate(input: RuntimeViewInput): OpenTuiLayoutUpdate {
  let state = input.getState();
  const theme = getTheme(state.themeName);
  const slashCommands = filterSlashCommands(input.inputValue);
  input.dispatch({ type: "syncSlash", total: slashCommands.length });
  input.dispatch({ type: "syncTheme", total: TUI_THEMES.length });
  input.dispatch({ type: "syncStatusLine", total: STATUS_LINE_ITEMS.length });

  state = input.getState();
  const store = input.app.store;
  const codexStatus = input.app.codex.statusSnapshot;
  const themeRows = buildThemeRows(TUI_THEMES, state.themeName, state.themeSelection);
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
  let bottomPanePanel = buildBottomPanePanel({
    state,
    theme,
    pendingApproval: input.pendingApproval,
    queuedMessage: input.queuedMessages?.[0],
    slashCommands,
    themeRows,
    statusLineRows,
    statusLinePreview,
    rendererWidth: input.rendererWidth,
    rendererHeight: input.rendererHeight,
  });
  let bottomInset = bottomPaneHeight(bottomPanePanel);
  const pickerViewportHeight = pickerSurfaceListViewportHeight(input.rendererHeight, bottomInset);
  const historyViewportHeight = Math.max(1, Math.floor(pickerViewportHeight / HISTORY_ROW_HEIGHT));

  const selectedEntryId = state.selectedEntryId || store?.leafId || "";
  const historyRows = store ? buildHistoryTurnRows(store, selectedEntryId) : [];
  input.dispatch({
    type: "syncHistory",
    entryIds: historyRows.map((row) => row.id),
    viewportHeight: historyViewportHeight,
  });

  state = input.getState();
  const threadRows = buildThreadRows(input.threads, state.selectedThreadId, store?.id);
  input.dispatch({
    type: "syncThreads",
    threadIds: threadRows.map((row) => row.id),
    viewportHeight: pickerViewportHeight,
  });

  state = input.getState();
  bottomPanePanel = buildBottomPanePanel({
    state,
    theme,
    pendingApproval: input.pendingApproval,
    queuedMessage: input.queuedMessages?.[0],
    slashCommands,
    themeRows: buildThemeRows(TUI_THEMES, state.themeName, state.themeSelection),
    statusLineRows: buildStatusLineRows(
      state.statusLineItems,
      state.statusLineSelection,
      (item) => statusLineItemValue(item, codexStatus, store),
    ),
    statusLinePreview,
    rendererWidth: input.rendererWidth,
    rendererHeight: input.rendererHeight,
  });
  bottomInset = bottomPaneHeight(bottomPanePanel);

  const transcriptCells = buildTranscriptCellsWithLive(
    input.app,
    input.streamingText,
    input.liveLeafId,
  );
  const startupBannerVisible = transcriptCells.length === 0 &&
    !input.running &&
    !input.pendingApproval &&
    input.streamingText.length === 0;
  const statusText = formatComposerStatus({
    running: input.running,
    turnStatus: state.bottomPane.turnStatus,
    statusMessage: state.bottomPane.statusMessage,
    frame: input.activityFrame,
    elapsedMs: input.activityElapsedMs,
  });

  return {
    width: input.rendererWidth,
    height: input.rendererHeight,
    theme,
    transcriptCells,
    startupBanner: buildStartupBannerState({
      visible: startupBannerVisible,
      codex: codexStatus,
      cwd: store?.cwd || input.app.cwd,
      rendererWidth: input.rendererWidth,
    }),
    bottomPane: {
      panel: bottomPanePanel,
      transientStatus: formatTransientStatusLine(statusText),
      placeholder: formatComposerPlaceholder(state, input.placeholderFrame),
      statusLine: formatCodexStatusLineStyled({
        store,
        state,
        codex: codexStatus,
        items: state.statusLineItems,
        width: Math.max(1, input.rendererWidth - 4),
      }, theme),
      inputValue: input.inputValue,
    },
    pickerSurface: buildPickerSurface({
      state,
      theme,
      historyRows,
      threadRows,
      threadViewportHeight: pickerViewportHeight,
      rendererWidth: input.rendererWidth,
    }),
    pagerOverlay: buildPagerOverlay({
      app: input.app,
      state,
      streamingText: input.streamingText,
      liveLeafId: input.liveLeafId,
    }),
  };
}

export function surfaceListViewportHeight(
  rendererHeight: number,
  bottomInset = 0,
): number {
  return pickerSurfaceListViewportHeight(rendererHeight, bottomInset);
}
