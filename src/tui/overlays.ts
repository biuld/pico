import type { JSONRPCRequest } from "../codex/app-server";
import type { DraftAppState } from "../app/controller";
import type { SlashCommandSpec } from "./commands";
import type { HistoryTurnRow } from "./history";
import { emptyOverlay, type OverlayView } from "./overlay-model";
import type { TuiState } from "./state";
import type { TuiTheme } from "./theme";
import { buildApprovalOverlayView } from "./widgets/approval-overlay";
import { buildHistoryOverlayView } from "./widgets/history-picker";
import { buildResumeOverlayView, type SessionRow } from "./widgets/resume-picker";
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
  liveTranscriptStatus: string;
  liveLeafId?: string;
  slashCommands: readonly SlashCommandSpec[];
  historyRows: readonly HistoryTurnRow[];
  sessionRows: readonly SessionRow[];
  themeRows: readonly ThemeRow[];
  statusLineRows: readonly StatusLineRow[];
  statusLinePreview: string;
  historyViewportHeight: number;
  sessionViewportHeight: number;
  rendererHeight: number;
  pendingApproval?: JSONRPCRequest;
}

export function buildOverlayView(input: OverlayViewInput): OverlayView {
  const {
    app,
    state,
    theme,
    streamingText,
    liveTranscriptStatus,
    liveLeafId,
    slashCommands,
    historyRows,
    sessionRows,
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
        input.rendererHeight,
        liveTranscriptStatus,
        liveLeafId,
      );
    case "shortcuts":
      return buildShortcutOverlayView();
    case "approval":
      return pendingApproval
        ? buildApprovalOverlayView(pendingApproval, state.approvalSelection)
        : emptyOverlay();
    case "slash":
      return buildSlashCommandOverlayView(slashCommands, state.slashSelection);
    case "history":
      return buildHistoryOverlayView(
        historyRows,
        state,
        theme,
        input.historyViewportHeight,
        input.rendererHeight,
      );
    case "sessions":
      return buildResumeOverlayView(
        sessionRows,
        state,
        input.sessionViewportHeight,
        input.rendererHeight,
      );
    case "theme":
      return buildThemeOverlayView(themeRows);
    case "statusline":
      return buildStatusLineOverlayView(statusLineRows, statusLinePreview);
  }
}
