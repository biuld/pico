import type { OverlayView } from "../overlay-model";
import { statusLineItemPlaceholder, type StatusLineItemId } from "../statusline";
import { OVERLAY_HINTS } from "./overlay-hints";

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
  { id: "used-tokens", label: "Used tokens", description: "total tokens used in session" },
  { id: "five-hour-limit", label: "5h limit", description: "remaining 5-hour usage limit" },
  { id: "weekly-limit", label: "Weekly limit", description: "remaining weekly usage limit" },
  { id: "thread-id", label: "Thread id", description: "active Codex thread id" },
];

export function buildStatusLineOverlayView(
  rows: readonly StatusLineRow[],
  preview: string,
): OverlayView {
  const previewText = preview || "(empty)";
  return {
    visible: true,
    title: "Statusline",
    height: Math.min(16, Math.max(9, rows.length + 6)),
    fullScreen: false,
    scrollY: 0,
    content: [
      ...rows.map(formatStatusLineRow),
      "",
      `Preview  ${previewText}`,
    ].join("\n"),
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
  const selected = row.isSelected ? ">" : " ";
  const checked = row.isEnabled ? "x" : " ";
  const value = `  ${row.currentValue || statusLineItemPlaceholder(row.id)}`;
  return `${selected} [${checked}] ${row.label.padEnd(12)} ${row.description}${value}`;
}
