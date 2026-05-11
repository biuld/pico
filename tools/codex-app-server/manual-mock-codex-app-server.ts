#!/usr/bin/env bun

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  createManualMockPlaybook,
  type ManualMockPlaybookStep,
} from "./playbook";

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
  error?: unknown;
}

type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

interface ThreadState {
  id: string;
  cwd: string;
  status: string;
  injectedItems: unknown[];
  turns: TurnState[];
}

interface TurnState {
  id: string;
  threadId: string;
  status: string;
  input: unknown;
  startedAt: string;
  completedAt?: string;
  error?: unknown;
  playbook?: {
    name: string;
    source: "auto" | "manual";
    startedAt: string;
  };
}

interface ServerRequestState {
  id: JsonRpcId;
  method: string;
  params?: unknown;
  sentAt: string;
  response?: unknown;
}

interface PendingServerResponse {
  resolve: (response: JsonRpcResponse) => void;
}

const model = Bun.env.PICO_MANUAL_MOCK_MODEL || "manual-mock";
const modelProvider = Bun.env.PICO_MANUAL_MOCK_MODEL_PROVIDER || "mock";
const codexHome = Bun.env.PICO_MANUAL_MOCK_CODEX_HOME || "/tmp/manual-mock-codex-home";
const userAgent = Bun.env.PICO_MANUAL_MOCK_USER_AGENT || "manual-mock-codex";
const playbookEnabled = Bun.env.PICO_MANUAL_MOCK_PLAYBOOK !== "0";

const controlPath = resolve(
  Bun.env.PICO_MANUAL_MOCK_CONTROL_FILE || ".pico/manual-mock-codex-app-server.json",
);
const controlDir = dirname(controlPath);
const inboxPath = resolve(
  Bun.env.PICO_MANUAL_MOCK_INBOX_FILE ||
    join(controlDir, "manual-mock-codex-app-server.inbox.jsonl"),
);
const statePath = resolve(
  Bun.env.PICO_MANUAL_MOCK_STATE_FILE ||
    join(controlDir, "manual-mock-codex-app-server.state.json"),
);
const logPath = resolve(
  Bun.env.PICO_MANUAL_MOCK_LOG_FILE ||
    join(controlDir, "manual-mock-codex-app-server.log.jsonl"),
);

const threads = new Map<string, ThreadState>();
const serverRequests = new Map<string, ServerRequestState>();
const pendingServerResponses = new Map<string, PendingServerResponse>();
const log: Array<{ time: string; direction: string; message: JsonRpcMessage }> = [];

let nextThreadNumber = 1;
let nextTurnNumber = 1;
let nextServerRequestNumber = 1;
let activeThreadId: string | undefined;
let activeTurnId: string | undefined;
let stdinBuffer = "";
let inboxOffset = 0;

initializeControlFiles();
console.error(`[manual-mock-codex-app-server] control ${controlPath}`);
const inboxTimer = setInterval(processControlInbox, 50);
void readStdinLoop();

async function readStdinLoop(): Promise<void> {
  const reader = Bun.stdin.stream().getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      stdinBuffer += decoder.decode(value, { stream: true });
      processStdinBuffer();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[manual-mock-codex-app-server] stdin error: ${message}`);
  } finally {
    clearInterval(inboxTimer);
    process.exit(0);
  }
}

function processStdinBuffer(): void {
  const lines = stdinBuffer.split("\n");
  stdinBuffer = lines.pop() || "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[manual-mock-codex-app-server] malformed JSON: ${message}`);
      continue;
    }
    if (!parsed || typeof parsed !== "object") {
      console.error("[manual-mock-codex-app-server] malformed JSON-RPC object");
      continue;
    }

    const message = parsed as JsonRpcMessage;
    record("client", message);
    if (isClientRequest(message)) {
      handleClientRequest(message);
    } else if (isClientResponse(message)) {
      handleClientResponse(message);
    }
  }
}

function handleClientRequest(request: JsonRpcRequest): void {
  switch (request.method) {
    case "initialize":
      respond(request.id, { codexHome, userAgent });
      return;
    case "config/read":
      respond(request.id, { config: { model, model_provider: modelProvider } });
      return;
    case "model/list":
      respond(request.id, { data: [{ id: model, model, isDefault: true }] });
      return;
    case "thread/start": {
      const params = objectValue(request.params);
      const id = `thread-${nextThreadNumber++}`;
      const cwd = stringValue(params, "cwd") || process.cwd();
      const thread: ThreadState = {
        id,
        cwd,
        status: "idle",
        injectedItems: [],
        turns: [],
      };
      threads.set(id, thread);
      activeThreadId = id;
      respond(request.id, {
        thread: { id, status: "idle" },
        model,
        modelProvider,
        cwd,
      });
      writeState();
      return;
    }
    case "thread/inject_items": {
      const params = objectValue(request.params);
      const threadId = stringValue(params, "threadId") || stringValue(params, "thread_id");
      const thread = threadId ? threads.get(threadId) : undefined;
      if (thread) thread.injectedItems = arrayValue(params.items);
      respond(request.id, {});
      writeState();
      return;
    }
    case "thread/list":
      respond(request.id, {
        data: [...threads.values()].map((thread) => threadInfo(thread)),
      });
      return;
    case "thread/read": {
      const params = objectValue(request.params);
      const threadId = stringValue(params, "threadId") || stringValue(params, "thread_id");
      const thread = threadId ? threads.get(threadId) : undefined;
      if (!thread) {
        reject(request.id, -32004, `unknown thread: ${threadId || ""}`);
        return;
      }
      respond(request.id, { thread: threadInfo(thread), items: [] });
      return;
    }
    case "turn/start": {
      const params = objectValue(request.params);
      const threadId = stringValue(params, "threadId") || stringValue(params, "thread_id");
      const thread = threadId ? threads.get(threadId) : undefined;
      if (!threadId || !thread) {
        reject(request.id, -32004, `unknown thread: ${threadId || ""}`);
        return;
      }

      const turn: TurnState = {
        id: `turn-${nextTurnNumber++}`,
        threadId,
        status: "inProgress",
        input: params.input,
        startedAt: new Date().toISOString(),
      };
      thread.turns.push(turn);
      thread.status = "running";
      activeThreadId = threadId;
      activeTurnId = turn.id;
      respond(request.id, { turn: { id: turn.id, status: turn.status } });
      writeState();
      if (playbookEnabled) {
        void runPlaybookTurn(threadId, turn.id, "auto");
      }
      return;
    }
    case "turn/interrupt": {
      const params = objectValue(request.params);
      const threadId = stringValue(params, "threadId") || stringValue(params, "thread_id");
      const turnId = stringValue(params, "turnId") || stringValue(params, "turn_id");
      respond(request.id, {});
      if (threadId && turnId) {
        completeTurn(threadId, turnId, "interrupted", { message: "interrupted by manual mock" });
      }
      return;
    }
    default:
      reject(request.id, -32601, `manual mock does not implement ${request.method}`);
  }
}

function handleClientResponse(response: JsonRpcResponse): void {
  const pending = serverRequests.get(String(response.id));
  if (pending) {
    pending.response = "error" in response ? { error: response.error } : { result: response.result };
    writeState();
  }

  const waiter = pendingServerResponses.get(String(response.id));
  if (waiter) {
    pendingServerResponses.delete(String(response.id));
    waiter.resolve(response);
  }
}

function processControlInbox(): void {
  if (!existsSync(inboxPath)) return;

  let text: string;
  try {
    text = readFileSync(inboxPath, "utf8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[manual-mock-codex-app-server] read inbox failed: ${message}`);
    return;
  }

  if (text.length < inboxOffset) inboxOffset = 0;
  const next = text.slice(inboxOffset);
  inboxOffset = text.length;
  for (const line of next.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      handleControlCommand(JSON.parse(trimmed) as JsonObject);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[manual-mock-codex-app-server] control command failed: ${message}`);
    }
  }
}

function handleControlCommand(command: JsonObject): void {
  const type = stringValue(command, "type") || stringValue(command, "command");
  if (!type) throw new Error("control command requires type");

  if (type === "notify") {
    const method = stringValue(command, "method");
    if (!method) throw new Error("notify command requires method");
    notify(method, command.params);
    return;
  }

  if (type === "serverRequest" || type === "server-request") {
    const method = stringValue(command, "method");
    if (!method) throw new Error("serverRequest command requires method");
    const id = (typeof command.id === "string" || typeof command.id === "number")
      ? command.id
      : `manual-server-request-${nextServerRequestNumber++}`;
    sendServerRequest(id, method, command.params);
    return;
  }

  if (type === "playbook") {
    const target = controlTarget(command);
    if (!target) throw new Error("playbook command needs an active turn or explicit threadId/turnId");
    void runPlaybookTurn(target.threadId, target.turnId, "manual");
    return;
  }

  const target = controlTarget(command);
  if (!target) throw new Error("control command needs an active turn or explicit threadId/turnId");

  if (type === "delta") {
    const delta = stringValue(command, "delta") || stringValue(command, "text") || "";
    notify("item/agentMessage/delta", {
      threadId: target.threadId,
      turnId: target.turnId,
      delta,
    });
    return;
  }

  if (type === "raw") {
    const item = objectOrUndefined(command.item) || assistantMessage(
      stringValue(command, "itemId") || "manual-output",
      stringValue(command, "text") || "",
    );
    notify("rawResponseItem/completed", {
      threadId: target.threadId,
      turnId: target.turnId,
      item,
    });
    return;
  }

  if (type === "complete") {
    completeTurn(
      target.threadId,
      target.turnId,
      stringValue(command, "status") || "completed",
      command.error,
    );
    return;
  }

  if (type === "reply") {
    const text = stringValue(command, "text") || "";
    if (text) {
      notify("item/agentMessage/delta", {
        threadId: target.threadId,
        turnId: target.turnId,
        delta: text,
      });
    }
    const item = objectOrUndefined(command.item) || assistantMessage(
      stringValue(command, "itemId") || "manual-output",
      text,
    );
    notify("rawResponseItem/completed", {
      threadId: target.threadId,
      turnId: target.turnId,
      item,
    });
    completeTurn(
      target.threadId,
      target.turnId,
      stringValue(command, "status") || "completed",
      command.error,
    );
    return;
  }

  throw new Error(`unknown control command: ${type}`);
}

async function runPlaybookTurn(
  threadId: string,
  turnId: string,
  source: "auto" | "manual",
): Promise<void> {
  const turn = findTurn(threadId, turnId);
  if (!turn || !isTurnInProgress(turn)) return;

  const approved = await requestPlaybookApproval(threadId, turnId, source);
  if (!approved) {
    if (isTurnInProgress(turn)) {
      completeTurn(threadId, turnId, "interrupted", {
        message: "manual mock playbook was not approved",
      });
    }
    return;
  }
  if (!isTurnInProgress(turn)) return;

  const playbook = createManualMockPlaybook({
    threadId,
    turnId,
    turnNumber: turnNumber(turnId),
    userText: userInputText(turn.input),
  });
  turn.playbook = { name: playbook.name, source, startedAt: new Date().toISOString() };
  writeState();

  for (const step of playbook.steps) {
    if (!isTurnInProgress(turn)) return;
    await runPlaybookStep(threadId, turnId, step);
  }
}

async function requestPlaybookApproval(
  threadId: string,
  turnId: string,
  source: "auto" | "manual",
): Promise<boolean> {
  const id = `manual-playbook-approval-${nextServerRequestNumber++}`;
  const response = await sendServerRequestAndWait(id, "item/permissions/requestApproval", {
    threadId,
    turnId,
    reason: "Enable manual mock playbook reply for this turn?",
    source,
    action: "manualMockPlaybook",
  });
  if ("error" in response) return false;
  return isApprovalAccepted(response.result);
}

function isApprovalAccepted(result: unknown): boolean {
  if (result === true) return true;
  if (!result || typeof result !== "object") return false;
  const decision = stringValue(result, "decision")?.toLowerCase();
  return decision === "approve" ||
    decision === "accept" ||
    decision === "acceptforsession" ||
    decision === "allow" ||
    decision === "allowed";
}

async function runPlaybookStep(
  threadId: string,
  turnId: string,
  step: ManualMockPlaybookStep,
): Promise<void> {
  switch (step.type) {
    case "delay":
      await sleep(step.ms);
      return;
    case "notification":
      notify(step.method, step.params);
      return;
    case "rawItem":
      sendRawResponseItem(threadId, turnId, step.item);
      return;
    case "complete":
      completeTurn(threadId, turnId, step.status, step.error);
      return;
  }
}

function controlTarget(command: JsonObject): { threadId: string; turnId: string } | undefined {
  const threadId = stringValue(command, "threadId") || stringValue(command, "thread_id") || activeThreadId;
  const turnId = stringValue(command, "turnId") || stringValue(command, "turn_id") || activeTurnId;
  if (!threadId || !turnId) return undefined;
  return { threadId, turnId };
}

function findTurn(threadId: string, turnId: string): TurnState | undefined {
  return threads.get(threadId)?.turns.find((candidate) => candidate.id === turnId);
}

function isTurnInProgress(turn: TurnState): boolean {
  return turn.status === "inProgress";
}

function turnNumber(turnId: string): number {
  const suffix = Number(turnId.split("-").at(-1));
  return Number.isFinite(suffix) ? suffix : nextTurnNumber;
}

function userInputText(input: unknown): string | undefined {
  if (!Array.isArray(input)) return undefined;
  return input
    .map((item) => stringValue(item, "text"))
    .filter(Boolean)
    .join("\n") || undefined;
}

function completeTurn(threadId: string, turnId: string, status: string, error?: unknown): void {
  const thread = threads.get(threadId);
  const turn = thread?.turns.find((candidate) => candidate.id === turnId);
  if (thread) thread.status = status === "completed" ? "idle" : status;
  if (turn) {
    turn.status = status;
    turn.completedAt = new Date().toISOString();
    if (error !== undefined) turn.error = error;
  }
  notify("turn/completed", {
    threadId,
    turnId,
    status,
    ...(error === undefined ? {} : { error }),
  });
  writeState();
}

function sendRawResponseItem(threadId: string, turnId: string, item: Record<string, unknown>): void {
  notify("rawResponseItem/completed", { threadId, turnId, item });
}

function sendServerRequest(id: JsonRpcId, method: string, params: unknown): void {
  const request: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };
  serverRequests.set(String(id), {
    id,
    method,
    params,
    sentAt: new Date().toISOString(),
  });
  send(request);
  writeState();
}

function sendServerRequestAndWait(
  id: JsonRpcId,
  method: string,
  params: unknown,
): Promise<JsonRpcResponse> {
  return new Promise((resolve) => {
    pendingServerResponses.set(String(id), { resolve });
    sendServerRequest(id, method, params);
  });
}

function respond(id: JsonRpcId, result: unknown): void {
  send({ jsonrpc: "2.0", id, result });
}

function reject(id: JsonRpcId, code: number, message: string): void {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

function notify(method: string, params?: unknown): void {
  send({ jsonrpc: "2.0", method, params });
}

function send(message: JsonRpcMessage): void {
  record("server", message);
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function record(direction: string, message: JsonRpcMessage): void {
  log.push({ time: new Date().toISOString(), direction, message });
  if (log.length > 500) log.shift();
  appendFileSync(logPath, `${JSON.stringify({ time: new Date().toISOString(), direction, message })}\n`);
  writeState();
}

function initializeControlFiles(): void {
  mkdirSync(controlDir, { recursive: true });
  mkdirSync(dirname(inboxPath), { recursive: true });
  mkdirSync(dirname(statePath), { recursive: true });
  mkdirSync(dirname(logPath), { recursive: true });
  writeFileSync(inboxPath, "");
  writeFileSync(logPath, "");
  inboxOffset = 0;
  writeControlInfo();
  writeState();
}

function writeControlInfo(): void {
  writeFileSync(
    controlPath,
    `${JSON.stringify({
      pid: process.pid,
      mode: "jsonl-control",
      inboxPath,
      statePath,
      logPath,
      commands: commandHelp(),
    }, null, 2)}\n`,
  );
}

function writeState(): void {
  writeFileSync(statePath, `${JSON.stringify(stateSnapshot(), null, 2)}\n`);
}

function stateSnapshot(): JsonObject {
  return {
    model,
    modelProvider,
    activeThreadId,
    activeTurnId,
    threads: [...threads.values()].map((thread) => ({
      ...threadInfo(thread),
      injectedItems: thread.injectedItems,
      turns: thread.turns,
    })),
    serverRequests: [...serverRequests.values()],
    log,
  };
}

function threadInfo(thread: ThreadState): JsonObject {
  return {
    id: thread.id,
    status: thread.status,
    cwd: thread.cwd,
    ephemeral: true,
    preview: "",
    modelProvider,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    source: "manual-mock",
  };
}

function commandHelp(): JsonObject {
  return {
    delta: "{ type: 'delta', text | delta, threadId?, turnId? }",
    raw: "{ type: 'raw', text?, itemId?, item?, threadId?, turnId? }",
    complete: "{ type: 'complete', status?, error?, threadId?, turnId? }",
    reply: "{ type: 'reply', text, itemId?, item?, status?, error?, threadId?, turnId? }",
    notify: "{ type: 'notify', method, params? }",
    serverRequest: "{ type: 'serverRequest', method, params?, id? }",
    playbook: "{ type: 'playbook', threadId?, turnId? } // asks approval before replying",
  };
}

function assistantMessage(id: string, text: string): JsonObject {
  return {
    id,
    type: "message",
    role: "assistant",
    content: [{ type: "output_text", text }],
  };
}

function isClientRequest(message: JsonRpcMessage): message is JsonRpcRequest {
  return "id" in message && typeof message.method === "string";
}

function isClientResponse(message: JsonRpcMessage): message is JsonRpcResponse {
  return "id" in message && ("result" in message || "error" in message) && !("method" in message);
}

function objectValue(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function objectOrUndefined(value: unknown): JsonObject | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : undefined;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown, key?: string): string | undefined {
  const candidate = key && value && typeof value === "object"
    ? (value as JsonObject)[key]
    : value;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
