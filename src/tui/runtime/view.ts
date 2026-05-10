import type { JSONRPCRequest } from "../../codex/app-server";
import type { DraftAppState } from "../../app/controller";
import type { PicoThreadInfo } from "../../thread/store";
import { filterSlashCommands } from "../commands";
import { buildHistoryTurnRows } from "../history";
import { buildOverlayView } from "../overlays";
import type { TuiState } from "../state";
import {
  formatCodexStatusLineStyled,
  formatConfiguredStatusPreviewText,
  statusLineItemValue,
} from "../statusline";
import { getTheme, TUI_THEMES } from "../theme";
import { buildTranscriptCellsWithLive } from "../transcript";
import type { TuiMsg } from "../update";
import { COMPOSER_OVERLAY_INSET, formatComposerStatus } from "../widgets/composer";
import { formatComposerPlaceholder } from "../widgets/composer-placeholder";
import { formatTransientStatusLine } from "../widgets/footer";
import { HISTORY_ROW_HEIGHT } from "../widgets/history-picker";
import type { OpenTuiLayoutUpdate } from "../widgets/layout";
import { buildThreadRows } from "../widgets/resume-picker";
import { buildStartupBannerState } from "../widgets/startup-banner";
import { buildStatusLineRows, STATUS_LINE_ITEMS } from "../widgets/statusline-picker";
import { buildThemeRows } from "../widgets/theme-picker";

export interface RuntimeViewInput {
  app: DraftAppState;
  getState(): TuiState;
  dispatch(msg: TuiMsg): void;
  threads: readonly PicoThreadInfo[];
  inputValue: string;
  streamingText: string;
  liveLeafId?: string;
  pendingApproval?: JSONRPCRequest;
  running: boolean;
  activityFrame?: number;
  activityElapsedMs?: number;
  placeholderFrame: number;
  rendererWidth: number;
  rendererHeight: number;
}

export function buildRuntimeLayoutUpdate(input: RuntimeViewInput): OpenTuiLayoutUpdate {
  const pickerViewportHeight = overlayListViewportHeight(input.rendererHeight);
  const historyViewportHeight = Math.max(1, Math.floor(pickerViewportHeight / HISTORY_ROW_HEIGHT));
  let state = input.getState();
  const theme = getTheme(state.themeName);
  const slashCommands = filterSlashCommands(input.inputValue);
  input.dispatch({ type: "syncSlash", total: slashCommands.length });

  state = input.getState();
  const store = input.app.store;
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

  input.dispatch({ type: "syncTheme", total: TUI_THEMES.length });
  state = input.getState();
  const themeRows = buildThemeRows(TUI_THEMES, state.themeName, state.themeSelection);
  input.dispatch({ type: "syncStatusLine", total: STATUS_LINE_ITEMS.length });

  state = input.getState();
  const codexStatus = input.app.codex.statusSnapshot;
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
    pendingApproval: input.pendingApproval,
    running: input.running,
    turnStatus: state.turnStatus,
    statusMessage: state.statusMessage,
    frame: input.activityFrame,
    elapsedMs: input.activityElapsedMs,
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
    composer: {
      transientStatus: formatTransientStatusLine(statusText),
      placeholder: formatComposerPlaceholder(state, input.placeholderFrame),
      statusLine: formatCodexStatusLineStyled({
        store,
        state,
        codex: codexStatus,
        items: state.statusLineItems,
        width: Math.max(1, input.rendererWidth - 4),
      }, theme),
    },
    overlay: buildOverlayView({
      app: input.app,
      state,
      theme,
      streamingText: input.streamingText,
      liveLeafId: input.liveLeafId,
      slashCommands,
      historyRows,
      threadRows,
      themeRows,
      statusLineRows,
      statusLinePreview,
      threadViewportHeight: pickerViewportHeight,
      pickerViewportHeight,
      rendererWidth: input.rendererWidth,
      pendingApproval: input.pendingApproval,
    }),
  };
}

export function overlayListViewportHeight(rendererHeight: number): number {
  const overlayHeight = Math.max(1, rendererHeight - COMPOSER_OVERLAY_INSET);
  return Math.max(1, overlayHeight - 3);
}
