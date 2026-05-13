export type TuiInputCommand =
  | { type: "empty" }
  | { type: "submit"; text: string }
  | { type: "new" }
  | { type: "clear" }
  | { type: "resume" }
  | { type: "theme" }
  | { type: "statusline" }
  | { type: "status" }
  | { type: "quit" }
  | { type: "unknown"; message: string };

export interface SlashCommandSpec {
  name: string;
  description: string;
  takesArgument?: boolean;
}

export const SLASH_COMMANDS: readonly SlashCommandSpec[] = [
  { name: "new", description: "start a fresh draft" },
  { name: "clear", description: "clear the current draft" },
  { name: "resume", description: "resume a saved thread" },
  { name: "theme", description: "choose a color theme" },
  { name: "statusline", description: "configure status line items" },
  { name: "status", description: "show current thread status" },
  { name: "quit", description: "exit Pico" },
  { name: "exit", description: "exit Pico" },
];

export function parseTuiInput(input: string): TuiInputCommand {
  const trimmed = input.trim();
  if (!trimmed) return { type: "empty" };
  if (!trimmed.startsWith("/")) return { type: "submit", text: trimmed };

  const [command] = trimmed.slice(1).split(/\s+/);

  if (command === "new") return { type: "new" };
  if (command === "clear") return { type: "clear" };
  if (command === "resume") return { type: "resume" };
  if (command === "theme") return { type: "theme" };
  if (command === "statusline") return { type: "statusline" };
  if (command === "status") return { type: "status" };
  if (command === "quit" || command === "exit") return { type: "quit" };

  return { type: "unknown", message: `Unknown command: /${command}` };
}

export function slashQuery(input: string): string | undefined {
  if (!input.startsWith("/")) return undefined;
  const query = input.slice(1);
  if (/\s/.test(query)) return undefined;
  return query;
}

export function filterSlashCommands(input: string): SlashCommandSpec[] {
  const query = slashQuery(input);
  if (query === undefined) return [];
  const normalized = query.toLowerCase();
  if (!normalized) return [...SLASH_COMMANDS];
  return SLASH_COMMANDS.filter((command) => command.name.toLowerCase().startsWith(normalized));
}
