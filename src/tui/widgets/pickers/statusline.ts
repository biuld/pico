import type { OverlayView } from "../core/overlay-model";
import { statusLineItemPlaceholder, type StatusLineItemId } from "../../statusline";
import type { TuiTheme } from "../../theme";
import { OVERLAY_HINTS } from "../overlay/hints";
import { selectableOverlayRow, selectedRowScrollY } from "../overlay/rows";

export interface StatusLineItemSpec {
  id: StatusLineItemId;
  label: string;
  description: string;
}

export interface StatusLineRow extends StatusLineItemSpec {
  isEnabled: boolean;
  isSelected: boolean;
  currentValue?: string;
}

export const STATUS_LINE_ITEMS: readonly StatusLineItemSpec[] = [
  { id: "model", label: "Model", description: "current Codex model" },
  { id: "provider", label: "Provider", description: "current Codex model provider (Pico extension)" },
  { id: "current-dir", label: "Current dir", description: "current working directory" },
  { id: "used-tokens", label: "Used tokens", description: "total tokens used in the current thread" },
  { id: "five-hour-limit", label: "5h limit", description: "remaining 5-hour usage limit" },
  { id: "weekly-limit", label: "Weekly limit", description: "remaining weekly usage limit" },
  { id: "thread-id", label: "Thread id", description: "active Codex thread id" },
];

export function buildStatusLinePickerView(
  rows: readonly StatusLineRow[],
  preview: string,
  theme: TuiTheme,
  viewportHeight: number,
  selectedIndex: number,
): OverlayView {
  const previewText = preview || "(empty)";
  const optionRows = rows.map((row, index) => selectableOverlayRow({
    id: row.id,
    content: formatStatusLineRow(row),
    index,
    isSelected: row.isSelected,
  }, theme));
  return {
    visible: true,
    title: "Statusline",
    fullScreen: false,
    scrollY: 0,
    content: "",
    rows: [
      ...optionRows,
      {
        id: "statusline-preview-gap",
        content: "",
        backgroundColor: theme.colors.overlayRow,
      },
      {
        id: "statusline-preview",
        content: `Preview  ${previewText}`,
        foregroundColor: theme.colors.muted,
        backgroundColor: theme.colors.overlayRow,
      },
    ],
    rowScrollY: selectedRowScrollY(selectedIndex, viewportHeight),
    footer: OVERLAY_HINTS.statusline,
  };
}

export function buildStatusLineRows(
  enabledItems: readonly StatusLineItemId[],
  selectedIndex: number,
  valueForItem: (id: StatusLineItemId) => string | undefined = () => undefined,
): StatusLineRow[] {
  const enabled = new Set(enabledItems);
  return STATUS_LINE_ITEMS.map((item, index) => ({
    ...item,
    isEnabled: enabled.has(item.id),
    isSelected: index === selectedIndex,
    currentValue: valueForItem(item.id),
  }));
}

export function formatStatusLineRow(row: StatusLineRow): string {
  const checked = row.isEnabled ? "x" : " ";
  const value = `  ${row.currentValue || statusLineItemPlaceholder(row.id)}`;
  return `[${checked}] ${row.label.padEnd(12)} ${row.description}${value}`;
}
