import type { OverlayView } from "../overlay-model";
import type { TuiTheme } from "../theme";
import { OVERLAY_HINTS } from "./overlay-hints";
import { selectableOverlayRow, selectedRowScrollY } from "./overlay-rows";

export const LAUNCHPAD_EMPTY_TEXT = "No queued messages";

export interface LaunchpadQueuedMessage {
  id: string;
  text: string;
  createdAt: string;
}

export interface LaunchpadRow {
  id: string;
  position: number;
  text: string;
  createdAt: string;
  isSelected: boolean;
}

export interface LaunchpadViewModel {
  rows: readonly LaunchpadRow[];
  selectedIndex: number;
  emptyText: string;
  hint: string;
}

export function buildLaunchpadOverlayView(
  rows: readonly LaunchpadRow[],
  selectedIndex: number,
  theme: TuiTheme,
  viewportHeight: number,
  rendererWidth: number,
): OverlayView {
  const model = buildLaunchpadViewModel(rows, selectedIndex);
  const contentWidth = Math.max(1, rendererWidth - 4);
  return {
    visible: true,
    title: "Launchpad",
    fullScreen: false,
    scrollY: 0,
    content: model.rows.length > 0 ? "" : model.emptyText,
    rows: model.rows.map((row, index) => selectableOverlayRow({
      id: row.id,
      content: formatLaunchpadRow(row, contentWidth),
      index,
      isSelected: row.isSelected,
    }, theme)),
    rowScrollY: selectedRowScrollY(model.selectedIndex, viewportHeight),
    footer: model.hint,
  };
}

export function buildLaunchpadViewModel(
  rows: readonly LaunchpadRow[],
  selectedIndex: number,
): LaunchpadViewModel {
  return {
    rows,
    selectedIndex: clampSelection(selectedIndex, rows.length),
    emptyText: LAUNCHPAD_EMPTY_TEXT,
    hint: OVERLAY_HINTS.launchpad,
  };
}

export function buildLaunchpadRows(
  queuedMessages: readonly LaunchpadQueuedMessage[],
  selectedIndex: number,
): LaunchpadRow[] {
  const safeSelectedIndex = clampSelection(selectedIndex, queuedMessages.length);
  return queuedMessages.map((message, index) => ({
    id: message.id,
    position: index + 1,
    text: message.text,
    createdAt: message.createdAt,
    isSelected: index === safeSelectedIndex,
  }));
}

export function formatLaunchpadRow(row: LaunchpadRow, maxWidth = 120): string {
  const prefix = `${String(row.position).padStart(2, "0")} `;
  const timestamp = row.createdAt.slice(11, 19) || "--:--:--";
  const text = inlineText(row.text) || "(empty)";
  const textBudget = Math.max(0, maxWidth - prefix.length - timestamp.length - 1);
  const left = `${prefix}${truncate(text, textBudget)}`;
  const gap = Math.max(1, maxWidth - left.length - timestamp.length);
  const line = `${left}${" ".repeat(gap)}${timestamp}`;
  return line.length <= maxWidth ? line : truncate(line, maxWidth);
}

function clampSelection(selectedIndex: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(total - 1, selectedIndex));
}

function inlineText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxWidth: number): string {
  if (maxWidth <= 0) return "";
  if (value.length <= maxWidth) return value;
  if (maxWidth <= 3) return ".".repeat(maxWidth);
  return `${value.slice(0, maxWidth - 3)}...`;
}
