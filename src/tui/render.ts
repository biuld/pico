import type { CodexThreadState } from "../app/codex-thread-state";
import type { TuiState } from "./core/state";

export {
  buildApprovalOptions,
  buildApprovalPanel,
  formatApprovalOption,
  type ApprovalDecision,
  type ApprovalOption,
  type ApprovalPanelState,
} from "./widgets/bottom/approval";
export {
  footerMode,
  formatBottomStatusLine,
  formatFooterLine,
  formatTransientStatusLine,
  type FooterMode,
} from "./widgets/bottom/footer";
export {
  composerPlaceholderMode,
  formatComposerPlaceholder,
  type ComposerPlaceholderMode,
} from "./widgets/bottom/placeholder";
export {
  buildThreadRows,
  formatThreadRow,
  type ThreadRow,
} from "./widgets/pickers/resume";
export {
  shortcutOverlayText,
} from "./widgets/pager/shortcuts";
export {
  formatCodexStatusLine,
  formatCodexStatusLineStyled,
  type StatusLineInput,
} from "./statusline";
export {
  buildSlashCommandRows,
  formatSlashCommandRow,
  type SlashCommandRow,
} from "./widgets/pickers/slash-command";
export {
  buildThemeRows,
  formatThemeRow,
  type ThemeRow,
} from "./widgets/pickers/theme";
export {
  buildTranscriptCells,
  type TranscriptCell,
} from "./transcript";

export function formatStatusLine(store: CodexThreadState, state: TuiState): string {
  const selected = state.selectedEntryId === store.leafId ? "leaf" : shortId(state.selectedEntryId);
  const message = state.bottomPane.statusMessage ? ` ${state.bottomPane.statusMessage}` : "";
  return `pico ${shortId(store.id)} | ${state.bottomPane.turnStatus} | branch ${selected}${message}`;
}

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}
