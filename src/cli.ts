export interface CliOptions {
  command: "tui" | "threads" | "import" | "help";
  cwd: string;
  resumeThreadId?: string;
  importAllCwd?: boolean;
  importDryRun?: boolean;
}

export function parseCliArgs(argv: string[], defaultCwd: string = process.cwd()): CliOptions {
  const options: CliOptions = {
    command: "tui",
    cwd: defaultCwd,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "import":
        options.command = "import";
        break;
      case "--help":
      case "-h":
        options.command = "help";
        break;
      case "--threads":
        options.command = "threads";
        break;
      case "--all-cwd":
        options.importAllCwd = true;
        break;
      case "--dry-run":
        options.importDryRun = true;
        break;
      case "--resume":
        options.resumeThreadId = requireValue(argv, ++i, arg);
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
    `       ${binaryName} import [options]`,
    "",
    "Options:",
    "  --threads          list Pico threads for the cwd",
    "  --resume <id>       resume a Pico thread",
    "  --cwd <path>        use a different project cwd",
    "  --all-cwd          import Codex threads from every cwd",
    "  --dry-run          preview import without writing Pico threads",
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
