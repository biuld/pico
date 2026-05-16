import type { OverlayRowView } from "../core/overlay-model";
import type { TuiTheme } from "../../theme";

export interface SelectableOverlayRowInput {
  id: string;
  content: OverlayRowView["content"];
  index: number;
  isSelected: boolean;
  height?: number;
}

export function selectableOverlayRow(
  input: SelectableOverlayRowInput,
  theme: TuiTheme,
): OverlayRowView {
  return {
    id: input.id,
    content: input.content,
    height: input.height,
    foregroundColor: input.isSelected ? theme.colors.textStrong : theme.colors.text,
    backgroundColor: input.isSelected
      ? theme.colors.overlayRowSelected
      : input.index % 2 === 0
        ? theme.colors.overlayRow
        : theme.colors.overlayRowAlt,
  };
}

export function selectedRowScrollY(
  selectedIndex: number,
  viewportHeight: number,
  rowHeight = 1,
): number {
  if (selectedIndex < 0) return 0;
  const visibleRows = Math.max(1, Math.floor(Math.max(1, viewportHeight) / Math.max(1, rowHeight)));
  return Math.max(0, selectedIndex - visibleRows + 1) * Math.max(1, rowHeight);
}
