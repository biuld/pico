import type { PicoThreadInfo } from "../../thread/store";
import type { OverlayRowView, OverlayView } from "../overlay-model";
import type { TuiState } from "../state";
import type { TuiTheme } from "../theme";
import { OVERLAY_HINTS } from "./overlay-hints";
import { selectableOverlayRow } from "./overlay-rows";

export interface ThreadRow {
  id: string;
  isCurrent: boolean;
  isSelected: boolean;
  label?: string;
  createdAt: string;
  updatedAt: string;
  preview: string;
  turnCount: number;
  responseItemCount: number;
}

export function buildResumeOverlayView(
  rows: readonly ThreadRow[],
  state: TuiState,
  theme: TuiTheme,
  viewportHeight: number,
  rendererWidth: number,
): OverlayView {
  const contentWidth = Math.max(1, rendererWidth - 4);
  return {
    visible: true,
    title: "Resume",
    fullScreen: false,
    scrollY: 0,
    content: rows.length > 0 ? "" : "No saved threads",
    rows: rows.map((row, index) => formatThreadOverlayRow(
      row,
      index,
      contentWidth,
      theme,
    )),
    rowScrollY: state.threadScroll,
    footer: OVERLAY_HINTS.resume,
  };
}

export function buildThreadRows(
  threads: readonly PicoThreadInfo[],
  selectedThreadId: string,
  currentThreadId?: string,
): ThreadRow[] {
  return threads.map((thread) => ({
    id: thread.id,
    isCurrent: thread.id === currentThreadId,
    isSelected: thread.id === selectedThreadId,
    label: thread.label,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    preview: thread.preview,
    turnCount: thread.turnCount,
    responseItemCount: thread.responseItemCount,
  }));
}

export function formatThreadOverlayRow(
  row: ThreadRow,
  index: number,
  maxWidth: number,
  theme: TuiTheme,
): OverlayRowView {
  return selectableOverlayRow({
    id: row.id,
    content: formatThreadRow(row, maxWidth),
    index,
    isSelected: row.isSelected,
  }, theme);
}

export function formatThreadRow(row: ThreadRow, maxWidth = 120): string {
  const prefix = row.isCurrent ? "* " : "  ";
  const updated = row.updatedAt.slice(0, 19).replace("T", " ");
  const title = headlineText(row.label || row.preview) || "Untitled thread";
  const titleBudget = Math.max(0, maxWidth - displayWidth(prefix) - displayWidth(updated) - 2);
  const titleText = titleBudget > 0 && title
    ? truncateInlineText(title, titleBudget)
    : "";
  const left = titleText ? `${prefix} ${titleText}` : prefix;
  const gap = Math.max(1, maxWidth - displayWidth(left) - displayWidth(updated));
  const line = `${left}${" ".repeat(gap)}${updated}`;
  return displayWidth(line) <= maxWidth ? line : truncateInlineText(line, maxWidth);
}

function headlineText(value: string): string {
  const line = value
    .split(/\r?\n/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .find(Boolean);
  return line || "";
}

function truncateInlineText(value: string, maxWidth: number): string {
  if (displayWidth(value) <= maxWidth) return value;
  if (maxWidth <= 0) return "";
  if (maxWidth <= 3) return ".".repeat(maxWidth);

  let out = "";
  let width = 0;
  const limit = maxWidth - 3;
  for (const char of value) {
    const charWidth = charDisplayWidth(char);
    if (width + charWidth > limit) break;
    out += char;
    width += charWidth;
  }
  return `${out}...`;
}

function displayWidth(value: string): number {
  let width = 0;
  for (const char of value) width += charDisplayWidth(char);
  return width;
}

function charDisplayWidth(char: string): number {
  const codePoint = char.codePointAt(0) || 0;
  if (codePoint === 0) return 0;
  if (codePoint < 32 || (codePoint >= 0x7f && codePoint < 0xa0)) return 0;
  if (
    codePoint >= 0x1100 &&
    (codePoint <= 0x115f ||
      codePoint === 0x2329 ||
      codePoint === 0x232a ||
      (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
      (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
      (codePoint >= 0xff00 && codePoint <= 0xff60) ||
      (codePoint >= 0xffe0 && codePoint <= 0xffe6))
  ) {
    return 2;
  }
  return 1;
}
