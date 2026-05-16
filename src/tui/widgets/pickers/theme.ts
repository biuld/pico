import type { OverlayView } from "../../core/overlay-model";
import type { TuiTheme } from "../../theme";
import { OVERLAY_HINTS } from "../overlay/hints";
import { selectableOverlayRow, selectedRowScrollY } from "../overlay/rows";

export interface ThemeRow {
  name: string;
  label: string;
  description: string;
  isActive: boolean;
  isSelected: boolean;
}

export function buildThemePickerView(
  rows: readonly ThemeRow[],
  theme: TuiTheme,
  viewportHeight: number,
  selectedIndex: number,
): OverlayView {
  return {
    visible: true,
    title: "Theme",
    fullScreen: false,
    scrollY: 0,
    content: rows.length > 0 ? "" : "No themes",
    rows: rows.map((row, index) => selectableOverlayRow({
      id: row.name,
      content: formatThemeRow(row),
      index,
      isSelected: row.isSelected,
    }, theme)),
    rowScrollY: selectedRowScrollY(selectedIndex, viewportHeight),
    footer: OVERLAY_HINTS.theme,
  };
}

export function buildThemeRows(
  themes: readonly TuiTheme[],
  activeThemeName: string,
  selectedIndex: number,
): ThemeRow[] {
  return themes.map((theme, index) => ({
    name: theme.name,
    label: theme.label,
    description: theme.description,
    isActive: theme.name === activeThemeName,
    isSelected: index === selectedIndex,
  }));
}

export function formatThemeRow(row: ThemeRow): string {
  const active = row.isActive ? "*" : " ";
  return `${active} ${row.label}  ${row.description}`;
}
