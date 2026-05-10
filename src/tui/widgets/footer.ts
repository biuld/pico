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
  if (state.turnStatus === "failed") return "Failed";
  if (state.turnStatus === "running") {
    return state.inputValue.trim().length > 0 ? "WorkingWithDraft" : "Working";
  }
  return state.inputValue.trim().length > 0 ? "ComposerHasDraft" : "ComposerEmpty";
}

export function formatTransientStatusLine(transientStatus = ""): string {
  return transientStatus ? `  ${transientStatus}` : "";
}

const IDLE_COMPOSER_PLACEHOLDERS = [
  "Ask Pico to do anything",
  "? for shortcuts",
  "/ for commands",
  "Esc Esc for history",
];

const WORKING_COMPOSER_PLACEHOLDERS = [
  "Draft the next message",
  "Ctrl+T for transcript",
  "Esc Esc for history",
];

export function formatComposerPlaceholder(state: TuiState, frame = 0): string {
  if (state.overlay !== "none") return "";
  if (state.inputValue.trim().length > 0) return "";

  if (state.turnStatus === "running") {
    return rotatingPlaceholder(WORKING_COMPOSER_PLACEHOLDERS, frame);
  }

  return rotatingPlaceholder(IDLE_COMPOSER_PLACEHOLDERS, frame);
}

function rotatingPlaceholder(values: readonly string[], frame: number): string {
  const index = Math.abs(Math.floor(frame)) % values.length;
  return values[index] || "";
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
