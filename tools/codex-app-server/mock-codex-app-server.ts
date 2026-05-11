#!/usr/bin/env bun

import { appendFileSync } from "node:fs";

type JsonObject = Record<string, unknown>;
type JsonRpcId = number | string;

interface JsonRpcRequest extends JsonObject {
  id: JsonRpcId;
  method: string;
  params?: unknown;
}

interface JsonRpcNotification extends JsonObject {
  method: string;
  params?: unknown;
}

interface JsonRpcResponse extends JsonObject {
  id: JsonRpcId;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

interface Scenario {
  steps: ScenarioStep[];
}

type ScenarioStep =
  | ExpectRequestStep
  | ExpectNotificationStep
  | NotifyStep
  | ServerRequestStep
  | DelayStep;

interface ExpectRequestStep {
  expectRequest: string;
  params?: unknown;
  respond?: unknown;
  error?: unknown;
}

interface ExpectNotificationStep {
  expectNotification: string;
  params?: unknown;
}

interface NotifyStep {
  notify: string;
  params?: unknown;
}

interface ServerRequestStep {
  serverRequest: string;
  id?: JsonRpcId;
  params?: unknown;
  expectResponse?: unknown;
  expectResult?: unknown;
  expectError?: unknown;
}

interface DelayStep {
  delay: number | { ms: number };
}

interface PendingMessageWaiter {
  resolve: (message: JsonRpcMessage) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const scenarioPath = Bun.env.PICO_MOCK_SCENARIO;
const logPath = Bun.env.PICO_MOCK_LOG;
const stepTimeoutMs = numberEnv("PICO_MOCK_STEP_TIMEOUT_MS", 2_000);
let serverRequestId = 1;

const logger = createLogger(logPath);

try {
  if (!scenarioPath) {
    throw new Error("PICO_MOCK_SCENARIO is required");
  }

  logger({ type: "start", argv: Bun.argv.slice(2), scenarioPath });
  const scenario = await readScenario(scenarioPath);
  const inbox = new MessageInbox();
  inbox.start();

  for (let index = 0; index < scenario.steps.length; index += 1) {
    await runStep(scenario.steps[index], index, inbox);
  }

  await sleep(0);
  inbox.assertNoQueuedMessages("scenario complete");
  logger({ type: "complete", steps: scenario.steps.length });
  await sleep(0);
  process.exit(0);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  logger({ type: "failure", message });
  console.error(`[mock-codex-app-server] ${message}`);
  await sleep(0);
  process.exit(1);
}

async function readScenario(path: string): Promise<Scenario> {
  const parsed = JSON.parse(await Bun.file(path).text()) as Partial<Scenario>;
  if (!Array.isArray(parsed.steps)) {
    throw new Error(`Invalid scenario ${path}: expected top-level steps array`);
  }
  return { steps: parsed.steps };
}

async function runStep(step: ScenarioStep, index: number, inbox: MessageInbox): Promise<void> {
  logger({ type: "step", index, step });

  if (isExpectRequestStep(step)) {
    const message = await inbox.next(stepTimeoutMs, `step ${index} expectRequest ${step.expectRequest}`);
    assertClientRequest(message, step.expectRequest, step.params, index);
    if ("error" in step) {
      writeMessage({
        jsonrpc: "2.0",
        id: message.id,
        error: normalizeError(step.error),
      });
    } else {
      writeMessage({ jsonrpc: "2.0", id: message.id, result: step.respond ?? null });
    }
    return;
  }

  if (isExpectNotificationStep(step)) {
    const message = await inbox.next(
      stepTimeoutMs,
      `step ${index} expectNotification ${step.expectNotification}`,
    );
    assertClientNotification(message, step.expectNotification, step.params, index);
    return;
  }

  if (isNotifyStep(step)) {
    inbox.assertNoQueuedMessages(`step ${index} notify ${step.notify}`);
    writeMessage({ jsonrpc: "2.0", method: step.notify, params: step.params });
    return;
  }

  if (isServerRequestStep(step)) {
    const id = step.id ?? `mock-server-request-${serverRequestId++}`;
    writeMessage({ jsonrpc: "2.0", id, method: step.serverRequest, params: step.params });
    if ("expectResponse" in step || "expectResult" in step || "expectError" in step) {
      const message = await inbox.next(
        stepTimeoutMs,
        `step ${index} serverRequest response ${step.serverRequest}`,
      );
      assertClientResponse(message, id, step, index);
    }
    return;
  }

  if (isDelayStep(step)) {
    inbox.assertNoQueuedMessages(`step ${index} delay`);
    await sleep(typeof step.delay === "number" ? step.delay : step.delay.ms);
    return;
  }

  throw new Error(`Invalid scenario step ${index}: ${JSON.stringify(step)}`);
}

class MessageInbox {
  private readonly queue: JsonRpcMessage[] = [];
  private readonly waiters: PendingMessageWaiter[] = [];
  private buffer = "";
  private closed = false;

  start(): void {
    const reader = Bun.stdin.stream().getReader();
    const decoder = new TextDecoder();

    void (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          this.buffer += decoder.decode(value, { stream: true });
          this.processBuffer();
        }
        this.closed = true;
        this.rejectWaiters(new Error("stdin closed"));
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.closed = true;
        this.rejectWaiters(error);
      }
    })();
  }

  next(timeoutMs: number, description: string): Promise<JsonRpcMessage> {
    const queued = this.queue.shift();
    if (queued) return Promise.resolve(queued);
    if (this.closed) return Promise.reject(new Error(`${description}: stdin closed`));

    return new Promise<JsonRpcMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.waiters.findIndex((waiter) => waiter.reject === reject);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new Error(`${description}: timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.waiters.push({ resolve, reject, timer });
    });
  }

  assertNoQueuedMessages(description: string): void {
    if (this.queue.length === 0) return;
    const message = this.queue.shift()!;
    throw new Error(`${description}: unexpected client message ${describeMessage(message)}`);
  }

  private processBuffer(): void {
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Malformed JSON from client: ${message}: ${trimmed}`);
      }
      if (!parsed || typeof parsed !== "object") {
        throw new Error(`Malformed JSON-RPC from client: ${trimmed}`);
      }
      const message = parsed as JsonRpcMessage;
      logger({ type: "received", message });
      const waiter = this.waiters.shift();
      if (waiter) {
        clearTimeout(waiter.timer);
        waiter.resolve(message);
      } else {
        this.queue.push(message);
      }
    }
  }

  private rejectWaiters(error: Error): void {
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }
}

function assertClientRequest(
  message: JsonRpcMessage,
  method: string,
  expectedParams: unknown,
  stepIndex: number,
): asserts message is JsonRpcRequest {
  if (!isRequest(message)) {
    throw new Error(`step ${stepIndex}: expected request ${method}, got ${describeMessage(message)}`);
  }
  if (message.method !== method) {
    throw new Error(`step ${stepIndex}: expected request ${method}, got ${message.method}`);
  }
  assertPartialMatch(message.params, expectedParams, `step ${stepIndex} ${method}.params`);
}

function assertClientNotification(
  message: JsonRpcMessage,
  method: string,
  expectedParams: unknown,
  stepIndex: number,
): asserts message is JsonRpcNotification {
  if (!isNotification(message)) {
    throw new Error(`step ${stepIndex}: expected notification ${method}, got ${describeMessage(message)}`);
  }
  if (message.method !== method) {
    throw new Error(`step ${stepIndex}: expected notification ${method}, got ${message.method}`);
  }
  assertPartialMatch(message.params, expectedParams, `step ${stepIndex} ${method}.params`);
}

function assertClientResponse(
  message: JsonRpcMessage,
  id: JsonRpcId,
  step: ServerRequestStep,
  stepIndex: number,
): asserts message is JsonRpcResponse {
  if (!isResponse(message)) {
    throw new Error(
      `step ${stepIndex}: expected response to server request ${String(id)}, got ${describeMessage(message)}`,
    );
  }
  if (message.id !== id) {
    throw new Error(`step ${stepIndex}: expected response id ${String(id)}, got ${String(message.id)}`);
  }
  if ("expectError" in step) {
    if (!("error" in message)) {
      throw new Error(`step ${stepIndex}: expected error response for ${String(id)}`);
    }
    assertPartialMatch(message.error, step.expectError, `step ${stepIndex} response.error`);
    return;
  }
  if ("error" in message) {
    throw new Error(`step ${stepIndex}: expected result response, got error ${JSON.stringify(message.error)}`);
  }
  const expected = "expectResult" in step ? step.expectResult : step.expectResponse;
  assertPartialMatch(message.result, expected, `step ${stepIndex} response.result`);
}

function assertPartialMatch(actual: unknown, expected: unknown, path: string): void {
  if (expected === undefined) return;

  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      throw new Error(`${path}: expected array, got ${JSON.stringify(actual)}`);
    }
    if (actual.length < expected.length) {
      throw new Error(`${path}: expected at least ${expected.length} items, got ${actual.length}`);
    }
    for (let index = 0; index < expected.length; index += 1) {
      assertPartialMatch(actual[index], expected[index], `${path}[${index}]`);
    }
    return;
  }

  if (expected && typeof expected === "object") {
    if (!actual || typeof actual !== "object" || Array.isArray(actual)) {
      throw new Error(`${path}: expected object subset, got ${JSON.stringify(actual)}`);
    }
    const actualObject = actual as JsonObject;
    for (const [key, expectedValue] of Object.entries(expected as JsonObject)) {
      if (!(key in actualObject)) {
        throw new Error(`${path}.${key}: missing key`);
      }
      assertPartialMatch(actualObject[key], expectedValue, `${path}.${key}`);
    }
    return;
  }

  if (!Object.is(actual, expected)) {
    throw new Error(`${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function writeMessage(message: JsonObject): void {
  logger({ type: "sent", message });
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function createLogger(path: string | undefined): (entry: JsonObject) => void {
  if (!path) return () => {};
  return (entry: JsonObject) => {
    const payload = { time: new Date().toISOString(), ...entry };
    try {
      appendFileSync(path, `${JSON.stringify(payload)}\n`);
    } catch {
      // Logging must never change protocol behavior.
    }
  };
}

function normalizeError(value: unknown): { code: number; message: string; data?: unknown } {
  if (value && typeof value === "object") {
    const object = value as JsonObject;
    return {
      code: typeof object.code === "number" ? object.code : -32000,
      message: typeof object.message === "string" ? object.message : "mock error",
      data: object.data,
    };
  }
  return { code: -32000, message: typeof value === "string" ? value : "mock error" };
}

function describeMessage(message: JsonRpcMessage): string {
  if (isRequest(message)) return `request ${message.method}`;
  if (isNotification(message)) return `notification ${message.method}`;
  if (isResponse(message)) return `response ${String(message.id)}`;
  return JSON.stringify(message);
}

function isRequest(message: JsonRpcMessage): message is JsonRpcRequest {
  return "id" in message && typeof message.method === "string";
}

function isNotification(message: JsonRpcMessage): message is JsonRpcNotification {
  return !("id" in message) && typeof message.method === "string";
}

function isResponse(message: JsonRpcMessage): message is JsonRpcResponse {
  return "id" in message && ("result" in message || "error" in message) && !("method" in message);
}

function isExpectRequestStep(step: ScenarioStep): step is ExpectRequestStep {
  return typeof (step as Partial<ExpectRequestStep>).expectRequest === "string";
}

function isExpectNotificationStep(step: ScenarioStep): step is ExpectNotificationStep {
  return typeof (step as Partial<ExpectNotificationStep>).expectNotification === "string";
}

function isNotifyStep(step: ScenarioStep): step is NotifyStep {
  return typeof (step as Partial<NotifyStep>).notify === "string";
}

function isServerRequestStep(step: ScenarioStep): step is ServerRequestStep {
  return typeof (step as Partial<ServerRequestStep>).serverRequest === "string";
}

function isDelayStep(step: ScenarioStep): step is DelayStep {
  return "delay" in step;
}

function numberEnv(name: string, fallback: number): number {
  const raw = Bun.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
