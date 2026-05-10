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
  | "TranscriptPager"
  | "ShortcutOverlay"
  | "Failed";

export function footerMode(state: TuiState): FooterMode {
  if (state.overlay === "approval") return "Approval";
  if (state.overlay === "slash") return "SlashPalette";
  if (state.overlay === "history") return "HistoryPicker";
  if (state.overlay === "sessions") return "ResumePicker";
  if (state.overlay === "theme") return "ThemePicker";
  if (state.overlay === "transcript") return "TranscriptPager";
  if (state.overlay === "shortcuts") return "ShortcutOverlay";
  if (state.turnStatus === "failed") return "Failed";
  if (state.turnStatus === "running") {
    return state.inputValue.trim().length > 0 ? "WorkingWithDraft" : "Working";
  }
  return state.inputValue.trim().length > 0 ? "ComposerHasDraft" : "ComposerEmpty";
}

export function formatFooterLine(store: SessionStore | undefined, state: TuiState, width = 0): string {
  const mode = footerMode(state);
  const left = footerLeftText(mode);
  const right = state.overlay === "none" ? `pico ${store ? shortId(store.id) : "new"}` : "";
  return alignFooter(left, right, width);
}

function footerLeftText(mode: FooterMode): string {
  switch (mode) {
    case "ComposerEmpty":
      return "? for shortcuts";
    case "ComposerHasDraft":
      return "";
    case "Working":
      return "working   ctrl+t transcript";
    case "WorkingWithDraft":
      return "working   ctrl+t transcript";
    case "Approval":
      return "enter choose   up/down move   esc cancel";
    case "SlashPalette":
      return "enter select   up/down move   esc close";
    case "HistoryPicker":
      return "enter backtrack   r rename   esc close";
    case "ResumePicker":
      return "enter resume   up/down move   esc close";
    case "ThemePicker":
      return "enter select   up/down move   esc close";
    case "TranscriptPager":
      return "pgup/pgdn scroll   j/k move   g/G jump   esc close";
    case "ShortcutOverlay":
      return "esc close";
    case "Failed":
      return "? for shortcuts";
  }
}

function alignFooter(left: string, right: string, width: number): string {
  const indentedLeft = left ? `  ${left}` : "";
  if (!right) return indentedLeft;
  if (width <= 0) return indentedLeft ? `${indentedLeft}   ${right}` : `  ${right}`;
  if (!indentedLeft) return right.padStart(width);
  const gap = width - indentedLeft.length - right.length;
  if (gap <= 1) return indentedLeft;
  return `${indentedLeft}${" ".repeat(gap)}${right}`;
}

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}
