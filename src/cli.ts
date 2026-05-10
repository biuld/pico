export interface CliOptions {
  command: "tui" | "sessions" | "help";
  cwd: string;
  resumeSessionId?: string;
}

export function parseCliArgs(argv: string[], defaultCwd: string = process.cwd()): CliOptions {
  const options: CliOptions = {
    command: "tui",
    cwd: defaultCwd,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--help":
      case "-h":
        options.command = "help";
        break;
      case "--sessions":
        options.command = "sessions";
        break;
      case "--resume":
        options.resumeSessionId = requireValue(argv, ++i, arg);
        break;
      case "--cwd":
        options.cwd = requireValue(argv, ++i, arg);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

export function formatCliHelp(binaryName = "pico"): string {
  return [
    `Usage: ${binaryName} [options]`,
    "",
    "Options:",
    "  --sessions          list Pico sessions for the cwd",
    "  --resume <id>       resume a Pico session",
    "  --cwd <path>        use a different project cwd",
    "  --help, -h          show this help",
  ].join("\n");
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}
