import type { JSONRPCRequest } from "../codex/app-server";
import type { DraftAppState } from "../app/controller";
import type { SlashCommandSpec } from "./commands";
import type { HistoryTurnRow } from "./history";
import { emptyOverlay, type OverlayView } from "./overlay-model";
import type { TuiState } from "./state";
import type { TuiTheme } from "./theme";
import { buildApprovalOverlayView } from "./widgets/approval-overlay";
import { buildHistoryOverlayView } from "./widgets/history-picker";
import { buildLaunchpadOverlayView, type LaunchpadRow } from "./widgets/launchpad";
import { buildResumeOverlayView, type ThreadRow } from "./widgets/resume-picker";
import { buildShortcutOverlayView } from "./widgets/shortcut-overlay";
import { buildSlashCommandOverlayView } from "./widgets/slash-command-popup";
import { buildStatusLineOverlayView, type StatusLineRow } from "./widgets/statusline-picker";
import { buildThemeOverlayView, type ThemeRow } from "./widgets/theme-picker";
import { buildTranscriptPagerOverlayView } from "./widgets/transcript-pager";

export type { OverlayView } from "./overlay-model";

export interface OverlayViewInput {
  app: DraftAppState;
  state: TuiState;
  theme: TuiTheme;
  streamingText: string;
  liveLeafId?: string;
  slashCommands: readonly SlashCommandSpec[];
  historyRows: readonly HistoryTurnRow[];
  threadRows: readonly ThreadRow[];
  launchpadRows?: readonly LaunchpadRow[];
  themeRows: readonly ThemeRow[];
  statusLineRows: readonly StatusLineRow[];
  statusLinePreview: string;
  threadViewportHeight: number;
  pickerViewportHeight: number;
  rendererWidth: number;
  pendingApproval?: JSONRPCRequest;
}

export function buildOverlayView(input: OverlayViewInput): OverlayView {
  const {
    app,
    state,
    theme,
    streamingText,
    liveLeafId,
    slashCommands,
    historyRows,
    threadRows,
    launchpadRows = [],
    themeRows,
    statusLineRows,
    statusLinePreview,
    pendingApproval,
  } = input;

  switch (state.overlay) {
    case "none":
      return emptyOverlay();
    case "transcript":
      return buildTranscriptPagerOverlayView(
        app,
        state,
        streamingText,
        liveLeafId,
      );
    case "shortcuts":
      return buildShortcutOverlayView();
    case "launchpad":
      return buildLaunchpadOverlayView(
        launchpadRows,
        state.launchpadSelection,
        theme,
        input.pickerViewportHeight,
        input.rendererWidth,
      );
    case "approval":
      return pendingApproval
        ? buildApprovalOverlayView(
            pendingApproval,
            state.approvalSelection,
            theme,
            input.pickerViewportHeight,
          )
        : emptyOverlay();
    case "slash":
      return buildSlashCommandOverlayView(
        slashCommands,
        state.slashSelection,
        theme,
        input.pickerViewportHeight,
      );
    case "history":
      return buildHistoryOverlayView(
        historyRows,
        state,
        theme,
      );
    case "threads":
      return buildResumeOverlayView(
        threadRows,
        state,
        theme,
        input.threadViewportHeight,
        input.rendererWidth,
      );
    case "theme":
      return buildThemeOverlayView(
        themeRows,
        theme,
        input.pickerViewportHeight,
        state.themeSelection,
      );
    case "statusline":
      return buildStatusLineOverlayView(
        statusLineRows,
        statusLinePreview,
        theme,
        input.pickerViewportHeight,
        state.statusLineSelection,
      );
  }
}
