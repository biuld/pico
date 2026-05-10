export type TuiInputCommand =
  | { type: "empty" }
  | { type: "submit"; text: string }
  | { type: "resume" }
  | { type: "theme" }
  | { type: "rename"; label: string }
  | { type: "status" }
  | { type: "quit" }
  | { type: "unknown"; message: string };

export interface SlashCommandSpec {
  name: string;
  description: string;
  takesArgument?: boolean;
}

export const SLASH_COMMANDS: readonly SlashCommandSpec[] = [
  { name: "resume", description: "resume a saved thread" },
  { name: "theme", description: "choose a color theme" },
  { name: "rename", description: "rename the current thread", takesArgument: true },
  { name: "status", description: "show current session status" },
  { name: "quit", description: "exit Pico" },
  { name: "exit", description: "exit Pico" },
];

export function parseTuiInput(input: string): TuiInputCommand {
  const trimmed = input.trim();
  if (!trimmed) return { type: "empty" };
  if (!trimmed.startsWith("/")) return { type: "submit", text: trimmed };

  const [command, ...rest] = trimmed.slice(1).split(/\s+/);
  const body = rest.join(" ").trim();

  if (command === "resume") return { type: "resume" };
  if (command === "theme") return { type: "theme" };
  if (command === "rename") {
    if (!body) return { type: "unknown", message: `/${command} requires a name` };
    return { type: "rename", label: body };
  }
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
