import type { OverlayView } from "../overlay-model";
import type { TuiTheme } from "../theme";
import { OVERLAY_HINTS } from "./overlay-hints";

export interface ThemeRow {
  name: string;
  label: string;
  description: string;
  isActive: boolean;
  isSelected: boolean;
}

export function buildThemeOverlayView(rows: readonly ThemeRow[]): OverlayView {
  return {
    visible: true,
    title: "Theme",
    height: Math.min(10, Math.max(6, rows.length + 4)),
    fullScreen: false,
    scrollY: 0,
    content: rows.map(formatThemeRow).join("\n"),
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
  const selected = row.isSelected ? ">" : " ";
  const active = row.isActive ? "*" : " ";
  return `${selected}${active} ${row.label}  ${row.description}`;
}
