import type { PicoThreadStore } from "../../thread/store";
import type { TuiState } from "../core/state";

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
  if (state.bottomPane.activeView === "commandPopup") return "SlashPalette";
  if (state.bottomPane.activeView === "themePicker") return "ThemePicker";
  if (state.bottomPane.activeView === "statuslinePicker") return "StatusLinePicker";
  if (state.pickerSurface === "history") return "HistoryPicker";
  if (state.pickerSurface === "resume") return "ResumePicker";
  if (state.pagerOverlay === "transcript") return "TranscriptPager";
  if (state.pagerOverlay === "shortcuts") return "ShortcutOverlay";
  if (state.bottomPane.turnStatus === "failed") return "Failed";
  if (state.bottomPane.turnStatus === "approval" || state.bottomPane.activeView === "approval") {
    return "Approval";
  }
  if (state.bottomPane.turnStatus === "running") {
    return state.bottomPane.draft.trim().length > 0 ? "WorkingWithDraft" : "Working";
  }
  return state.bottomPane.draft.trim().length > 0 ? "ComposerHasDraft" : "ComposerEmpty";
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
