import type { SlashCommandSpec } from "../commands";
import type { OverlayView } from "../overlay-model";
import { OVERLAY_HINTS } from "./overlay-hints";

export interface SlashCommandRow {
  name: string;
  description: string;
  takesArgument: boolean;
  isSelected: boolean;
}

export function buildSlashCommandOverlayView(
  commands: readonly SlashCommandSpec[],
  selectedIndex: number,
): OverlayView {
  const rows = buildSlashCommandRows(commands, selectedIndex);
  return {
    visible: true,
    title: "Commands",
    height: Math.min(10, Math.max(5, rows.length + 4)),
    fullScreen: false,
    scrollY: 0,
    content: rows.length > 0 ? rows.map(formatSlashCommandRow).join("\n") : "No matching commands",
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
  const selected = row.isSelected ? ">" : " ";
  const args = row.takesArgument ? " <value>" : "";
  return `${selected} /${row.name}${args}  ${row.description}`;
}
