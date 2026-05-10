import type { SessionStore } from "../session/store";
import type { TuiState } from "./state";

export {
  buildApprovalOptions,
  formatApprovalOption,
  type ApprovalDecision,
  type ApprovalOption,
} from "./widgets/approval-overlay";
export {
  footerMode,
  formatFooterLine,
  type FooterMode,
} from "./widgets/footer";
export {
  buildSessionRows,
  formatSessionRow,
  type SessionRow,
} from "./widgets/resume-picker";
export {
  shortcutOverlayText,
} from "./widgets/shortcut-overlay";
export {
  buildSlashCommandRows,
  formatSlashCommandRow,
  type SlashCommandRow,
} from "./widgets/slash-command-popup";
export {
  buildThemeRows,
  formatThemeRow,
  type ThemeRow,
} from "./widgets/theme-picker";
export {
  buildTranscriptRows,
  formatTranscriptRow,
  type TranscriptRow,
} from "./transcript";

export function formatStatusLine(store: SessionStore, state: TuiState): string {
  const selected = state.selectedEntryId === store.leafId ? "leaf" : shortId(state.selectedEntryId);
  const message = state.statusMessage ? ` ${state.statusMessage}` : "";
  return `pico ${shortId(store.id)} | ${state.turnStatus} | branch ${selected}${message}`;
}

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}
