import type { TuiState } from "../../core/state";

export const COMPOSER_PLACEHOLDER_INTERVAL_MS = 4200;

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

export type ComposerPlaceholderMode = "hidden" | "idle" | "working";

export function composerPlaceholderMode(state: TuiState): ComposerPlaceholderMode {
  if (
    state.pagerOverlay !== "none" ||
    state.pickerSurface !== "none" ||
    state.bottomPane.activeView !== "none"
  ) {
    return "hidden";
  }
  if (state.bottomPane.draft.trim().length > 0) return "hidden";
  return state.bottomPane.turnStatus === "running" || state.bottomPane.turnStatus === "approval"
    ? "working"
    : "idle";
}

export function formatComposerPlaceholder(state: TuiState, frame = 0): string {
  switch (composerPlaceholderMode(state)) {
    case "idle":
      return rotatingPlaceholder(IDLE_COMPOSER_PLACEHOLDERS, frame);
    case "working":
      return rotatingPlaceholder(WORKING_COMPOSER_PLACEHOLDERS, frame);
    case "hidden":
      return "";
  }
}

function rotatingPlaceholder(values: readonly string[], frame: number): string {
  const index = Math.abs(Math.floor(frame)) % values.length;
  return values[index] || "";
}
