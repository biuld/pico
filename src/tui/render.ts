import type { PicoThreadStore } from "../thread/store";
import type { TuiState } from "./state";

export {
  buildApprovalOptions,
  formatApprovalOption,
  type ApprovalDecision,
  type ApprovalOption,
} from "./widgets/approval-overlay";
export {
  footerMode,
  formatBottomStatusLine,
  formatFooterLine,
  formatTransientStatusLine,
  type FooterMode,
} from "./widgets/footer";
export {
  composerPlaceholderMode,
  formatComposerPlaceholder,
  type ComposerPlaceholderMode,
} from "./widgets/composer-placeholder";
export {
  buildThreadRows,
  formatThreadRow,
  type ThreadRow,
} from "./widgets/resume-picker";
export {
  shortcutOverlayText,
} from "./widgets/shortcut-overlay";
export {
  formatCodexStatusLine,
  formatCodexStatusLineStyled,
  type StatusLineInput,
} from "./statusline";
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
  buildTranscriptCells,
  type TranscriptCell,
} from "./transcript";

export function formatStatusLine(store: PicoThreadStore, state: TuiState): string {
  const selected = state.selectedEntryId === store.leafId ? "leaf" : shortId(state.selectedEntryId);
  const message = state.statusMessage ? ` ${state.statusMessage}` : "";
  return `pico ${shortId(store.id)} | ${state.turnStatus} | branch ${selected}${message}`;
}

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}
