import { chmod, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CodexAppServerClient } from "../../../src/codex/app-server";

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
  await Bun.write(wrapperPath, mockWrapperSource(scenarioPath, logPath, stepTimeoutMs));
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

export function installMockCodexEnv(
  files: Pick<MockCodexScenarioFiles, "scenarioPath" | "logPath">,
  stepTimeoutMs?: number,
): () => void {
  const previousScenario = Bun.env.PICO_MOCK_SCENARIO;
  const previousLog = Bun.env.PICO_MOCK_LOG;
  const previousTimeout = Bun.env.PICO_MOCK_STEP_TIMEOUT_MS;

  setEnvValue("PICO_MOCK_SCENARIO", files.scenarioPath);
  setEnvValue("PICO_MOCK_LOG", files.logPath);
  if (stepTimeoutMs !== undefined) {
    setEnvValue("PICO_MOCK_STEP_TIMEOUT_MS", String(stepTimeoutMs));
  }

  return () => {
    restoreEnvValue("PICO_MOCK_SCENARIO", previousScenario);
    restoreEnvValue("PICO_MOCK_LOG", previousLog);
    restoreEnvValue("PICO_MOCK_STEP_TIMEOUT_MS", previousTimeout);
  };
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

function mockCodexBinaryPath(): string {
  return join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../tools/codex-app-server/mock-codex-app-server.ts",
  );
}

function mockWrapperSource(
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
${timeoutLine}await import(${JSON.stringify(pathToFileURL(mockCodexBinaryPath()).href)});
`;
}

function restoreEnvValue(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete Bun.env[name];
    delete process.env[name];
    return;
  }
  setEnvValue(name, value);
}

function setEnvValue(name: string, value: string): void {
  Bun.env[name] = value;
  process.env[name] = value;
}
