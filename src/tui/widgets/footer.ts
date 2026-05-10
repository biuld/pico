import type { PicoThreadStore } from "../../thread/store";
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
  | "Launchpad"
  | "Failed";

export function footerMode(state: TuiState): FooterMode {
  if (state.overlay === "approval") return "Approval";
  if (state.overlay === "slash") return "SlashPalette";
  if (state.overlay === "history") return "HistoryPicker";
  if (state.overlay === "threads") return "ResumePicker";
  if (state.overlay === "theme") return "ThemePicker";
  if (state.overlay === "statusline") return "StatusLinePicker";
  if (state.overlay === "transcript") return "TranscriptPager";
  if (state.overlay === "shortcuts") return "ShortcutOverlay";
  if (state.overlay === "launchpad") return "Launchpad";
  if (state.turnStatus === "failed") return "Failed";
  if (state.turnStatus === "running") {
    return state.inputValue.trim().length > 0 ? "WorkingWithDraft" : "Working";
  }
  return state.inputValue.trim().length > 0 ? "ComposerHasDraft" : "ComposerEmpty";
}

export function formatTransientStatusLine(transientStatus = ""): string {
  return transientStatus;
}

export function formatBottomStatusLine(
  store: PicoThreadStore | undefined,
  state: TuiState,
  statusText = "",
  width = 0,
): string {
  return statusText ? `  ${statusText}` : "";
}

export function formatFooterLine(store: PicoThreadStore | undefined, state: TuiState, width = 0): string {
  return formatBottomStatusLine(store, state, "", width);
}
