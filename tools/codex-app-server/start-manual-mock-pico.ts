#!/usr/bin/env bun

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CodexAppServerClient } from "../../src/codex/app-server";
import { loadPicoConfig, type PicoConfig } from "../../src/config";
import { PicoThreadStore } from "../../src/thread/store";
import { startOpenTui } from "../../src/tui/opentui";
import type { DraftAppState } from "../../src/app/controller";

interface Options {
  cwd: string;
  resumeThreadId?: string;
  help?: boolean;
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const manualMockBinary = join(repoRoot, "tools/codex-app-server/manual-mock-codex-app-server.ts");
const controlCli = join(repoRoot, "tools/codex-app-server/manual-mock-control.ts");
const manualMockModel = "manual-mock";
const manualMockProvider = "mock";

try {
  const options = parseArgs(Bun.argv.slice(2));
  if (options.help) {
    console.log(helpText());
    process.exit(0);
  }

  const app = await createManualMockApp(options);
  const controlPath = join(app.cwd, ".pico/manual-mock-codex-app-server.json");

  console.error("Starting Pico with manual mock Codex app-server.");
  console.error(`Project cwd: ${app.cwd}`);
  console.error(`Control file: ${controlPath}`);
  console.error("Playbook replies first ask for approval in Pico.");
  console.error("");
  console.error("From another terminal:");
  console.error(`  bun ${controlCli} --control ${controlPath} state`);
  console.error(`  bun ${controlCli} --control ${controlPath} reply --text "hello from mock" --item-id manual-output`);
  console.error("");

  await startOpenTui(app);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

async function createManualMockApp(options: Options): Promise<DraftAppState> {
  const config = await loadPicoConfig(options.cwd);
  const appCwd = resolve(config.cwd || options.cwd);
  process.chdir(appCwd);

  const manualConfig: PicoConfig = {
    ...config,
    cwd: appCwd,
    model: manualMockModel,
    modelProvider: manualMockProvider,
    codexBinary: manualMockBinary,
  };
  Bun.env.PICO_MANUAL_MOCK_MODEL = manualMockModel;
  Bun.env.PICO_MANUAL_MOCK_MODEL_PROVIDER = manualMockProvider;
  process.env.PICO_MANUAL_MOCK_MODEL = manualMockModel;
  process.env.PICO_MANUAL_MOCK_MODEL_PROVIDER = manualMockProvider;
  const codex = new CodexAppServerClient({ binary: manualMockBinary });
  await codex.start();
  await seedCodexStatus(codex, manualConfig, appCwd);

  if (options.resumeThreadId) {
    const store = await PicoThreadStore.load(appCwd, options.resumeThreadId);
    return { store, codex, config: manualConfig, cwd: store.cwd };
  }

  return { codex, config: manualConfig, cwd: appCwd };
}

async function seedCodexStatus(
  codex: CodexAppServerClient,
  config: PicoConfig,
  cwd: string,
): Promise<void> {
  const overrides = codexStatusOverrides(config);
  if (overrides) codex.applyConfigStatus(overrides);

  try {
    await codex.refreshConfigStatus({ cwd, overrides });
  } catch {
    // Manual mock supports config/read, but keeping this runner aligned with app startup.
  }
}

function codexStatusOverrides(config: PicoConfig) {
  if (!config.model && !config.modelProvider) return undefined;
  return {
    model: config.model,
    modelProvider: config.modelProvider,
  };
}

function parseArgs(argv: string[]): Options {
  const options: Options = { cwd: process.cwd() };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--help":
      case "-h":
        options.help = true;
        break;
      case "--cwd":
        options.cwd = resolve(requireValue(argv, ++index, arg));
        break;
      case "--resume":
        options.resumeThreadId = requireValue(argv, ++index, arg);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function helpText(): string {
  return [
    "Usage: bun tools/codex-app-server/start-manual-mock-pico.ts [options]",
    "",
    "Starts Pico with the interactive manual mock Codex app-server.",
    "The runner does not modify .pico/config.json.",
    "",
    "Options:",
    "  --cwd <path>     project cwd to run Pico in",
    "  --resume <id>    resume an existing Pico thread",
    "  --help, -h       show this help",
  ].join("\n");
}
