import { appendFile, chmod, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CodexAppServerClient } from "../../src/codex/app-server";

export type MockCodexScenarioStep = Record<string, unknown>;
export type MockCodexLogEntry = Record<string, unknown>;

export interface MockCodexScenarioFiles {
  binary: string;
  dir: string;
  scenarioPath: string;
  logPath: string;
  readLog: () => Promise<MockCodexLogEntry[]>;
}

export interface MockCodexClientFixture extends MockCodexScenarioFiles {
  client: CodexAppServerClient;
}

export interface StartMockCodexClientOptions {
  requestTimeoutMs?: number;
  stepTimeoutMs?: number;
}

export interface ManualMockControlInfo {
  pid: number;
  mode: "jsonl-control";
  inboxPath: string;
  statePath: string;
  logPath: string;
  commands: Record<string, string>;
}

export interface ManualMockCodexClientFixture {
  client: CodexAppServerClient;
  binary: string;
  dir: string;
  controlPath: string;
  control: ManualMockControlInfo;
}

export interface StartManualMockCodexClientOptions {
  requestTimeoutMs?: number;
  playbook?: boolean;
}

export interface ManualMockState {
  serverRequests: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export async function createMockCodexScenario(
  steps: MockCodexScenarioStep[],
  stepTimeoutMs?: number,
): Promise<MockCodexScenarioFiles> {
  const dir = await mkdtemp(join(tmpdir(), "pico-mock-codex-"));
  const scenarioPath = join(dir, "scenario.json");
  const logPath = join(dir, "traffic.jsonl");
  const wrapperPath = join(dir, "codex-mock");
  await Bun.write(scenarioPath, `${JSON.stringify({ steps }, null, 2)}\n`);
  await Bun.write(logPath, "");
  await Bun.write(wrapperPath, scriptedMockWrapperSource(scenarioPath, logPath, stepTimeoutMs));
  await chmod(wrapperPath, 0o755);

  return {
    binary: wrapperPath,
    dir,
    scenarioPath,
    logPath,
    readLog: () => readMockCodexLog(logPath),
  };
}

export async function startMockCodexClient(
  steps: MockCodexScenarioStep[],
  options: StartMockCodexClientOptions = {},
): Promise<MockCodexClientFixture> {
  const files = await createMockCodexScenario(steps, options.stepTimeoutMs);
  const client = new CodexAppServerClient({
    binary: files.binary,
    requestTimeoutMs: options.requestTimeoutMs ?? 3_000,
  });

  await client.start();

  return { ...files, client };
}

export async function startManualMockCodexClient(
  options: StartManualMockCodexClientOptions = {},
): Promise<ManualMockCodexClientFixture> {
  const dir = await mkdtemp(join(tmpdir(), "pico-manual-mock-codex-"));
  const controlPath = join(dir, "control.json");
  const wrapperPath = join(dir, "codex-manual-mock");
  await Bun.write(wrapperPath, manualMockWrapperSource(controlPath, options.playbook === true));
  await chmod(wrapperPath, 0o755);

  const client = new CodexAppServerClient({
    binary: wrapperPath,
    requestTimeoutMs: options.requestTimeoutMs ?? 3_000,
  });
  await client.start();
  const control = await waitForControlInfo(controlPath);
  return { client, binary: wrapperPath, dir, controlPath, control };
}

export async function waitForControlInfo(
  controlPath: string,
  timeoutMs = 3_000,
): Promise<ManualMockControlInfo> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const file = Bun.file(controlPath);
    if (await file.exists()) {
      return JSON.parse(await file.text()) as ManualMockControlInfo;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`manual mock control file was not written: ${controlPath}`);
}

export async function sendManualMockCommand(
  control: ManualMockControlInfo,
  command: Record<string, unknown>,
): Promise<void> {
  await appendFile(control.inboxPath, `${JSON.stringify(command)}\n`);
}

export async function readManualMockState(control: ManualMockControlInfo): Promise<ManualMockState> {
  return JSON.parse(await Bun.file(control.statePath).text()) as ManualMockState;
}

export async function readMockCodexLog(path: string): Promise<MockCodexLogEntry[]> {
  const file = Bun.file(path);
  if (!(await file.exists())) return [];
  const text = await file.text();
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as MockCodexLogEntry);
}

function scriptedMockWrapperSource(
  scenarioPath: string,
  logPath: string,
  stepTimeoutMs: number | undefined,
): string {
  const timeoutLine = stepTimeoutMs === undefined
    ? ""
    : `Bun.env.PICO_MOCK_STEP_TIMEOUT_MS = ${JSON.stringify(String(stepTimeoutMs))};\nprocess.env.PICO_MOCK_STEP_TIMEOUT_MS = ${JSON.stringify(String(stepTimeoutMs))};\n`;
  return `#!/usr/bin/env bun
Bun.env.PICO_MOCK_SCENARIO = ${JSON.stringify(scenarioPath)};
Bun.env.PICO_MOCK_LOG = ${JSON.stringify(logPath)};
process.env.PICO_MOCK_SCENARIO = ${JSON.stringify(scenarioPath)};
process.env.PICO_MOCK_LOG = ${JSON.stringify(logPath)};
${timeoutLine}await import(${JSON.stringify(pathToFileURL(toolPath("mock-codex-app-server.ts")).href)});
`;
}

function manualMockWrapperSource(controlPath: string, playbook: boolean): string {
  return `#!/usr/bin/env bun
Bun.env.PICO_MANUAL_MOCK_CONTROL_FILE = ${JSON.stringify(controlPath)};
Bun.env.PICO_MANUAL_MOCK_PLAYBOOK = ${JSON.stringify(playbook ? "1" : "0")};
process.env.PICO_MANUAL_MOCK_CONTROL_FILE = ${JSON.stringify(controlPath)};
process.env.PICO_MANUAL_MOCK_PLAYBOOK = ${JSON.stringify(playbook ? "1" : "0")};
await import(${JSON.stringify(pathToFileURL(toolPath("manual-mock-codex-app-server.ts")).href)});
`;
}

function toolPath(filename: string): string {
  return join(dirname(fileURLToPath(import.meta.url)), filename);
}
