import type { SessionStore } from "../../session/store";
import type { TuiState } from "../state";

export type FooterMode =
  | "ComposerEmpty"
  | "ComposerHasDraft"
  | "Working"
  | "WorkingWithDraft"
  | "Approval"
  | "SlashPalette"
  | "HistoryPicker"
  | "ResumePicker"
  | "ThemePicker"
  | "StatusLinePicker"
  | "TranscriptPager"
  | "ShortcutOverlay"
  | "Failed";

export function footerMode(state: TuiState): FooterMode {
  if (state.overlay === "approval") return "Approval";
  if (state.overlay === "slash") return "SlashPalette";
  if (state.overlay === "history") return "HistoryPicker";
  if (state.overlay === "sessions") return "ResumePicker";
  if (state.overlay === "theme") return "ThemePicker";
  if (state.overlay === "statusline") return "StatusLinePicker";
  if (state.overlay === "transcript") return "TranscriptPager";
  if (state.overlay === "shortcuts") return "ShortcutOverlay";
  if (state.turnStatus === "failed") return "Failed";
  if (state.turnStatus === "running") {
    return state.inputValue.trim().length > 0 ? "WorkingWithDraft" : "Working";
  }
  return state.inputValue.trim().length > 0 ? "ComposerHasDraft" : "ComposerEmpty";
}

export function formatTransientStatusLine(transientStatus = ""): string {
  return transientStatus ? `  ${transientStatus}` : "";
}

export function formatComposerPlaceholder(state: TuiState): string {
  if (state.overlay !== "none") return "";
  if (state.inputValue.trim().length > 0) return "";

  if (state.turnStatus === "running") {
    return "Ask Pico to do anything   ·   Ctrl+T transcript";
  }

  return "Ask Pico to do anything   ·   ? for shortcuts";
}

export function formatBottomStatusLine(
  store: SessionStore | undefined,
  state: TuiState,
  statusText = "",
  width = 0,
): string {
  return statusText ? `  ${statusText}` : "";
}

export function formatFooterLine(store: SessionStore | undefined, state: TuiState, width = 0): string {
  return formatBottomStatusLine(store, state, "", width);
}
