import type { SlashCommandSpec } from "../commands";
import type { OverlayView } from "../core/overlay-model";
import type { TuiTheme } from "../theme";
import { OVERLAY_HINTS } from "./overlay-hints";
import { selectableOverlayRow, selectedRowScrollY } from "./overlay-rows";

export interface SlashCommandRow {
  name: string;
  description: string;
  takesArgument: boolean;
  isSelected: boolean;
}

export function buildSlashCommandPopupView(
  commands: readonly SlashCommandSpec[],
  selectedIndex: number,
  theme: TuiTheme,
  viewportHeight: number,
): OverlayView {
  const rows = buildSlashCommandRows(commands, selectedIndex);
  return {
    visible: true,
    title: "Commands",
    fullScreen: false,
    scrollY: 0,
    content: rows.length > 0 ? "" : "No matching commands",
    rows: rows.map((row, index) => selectableOverlayRow({
      id: row.name,
      content: formatSlashCommandRow(row),
      index,
      isSelected: row.isSelected,
    }, theme)),
    rowScrollY: selectedRowScrollY(selectedIndex, viewportHeight),
    footer: OVERLAY_HINTS.slash,
  };
}

export function buildSlashCommandRows(
  commands: readonly SlashCommandSpec[],
  selectedIndex: number,
): SlashCommandRow[] {
  return commands.map((command, index) => ({
    name: command.name,
    description: command.description,
    takesArgument: Boolean(command.takesArgument),
    isSelected: index === selectedIndex,
  }));
}

export function formatSlashCommandRow(row: SlashCommandRow): string {
  const args = row.takesArgument ? " <value>" : "";
  return `/${row.name}${args}  ${row.description}`;
}
