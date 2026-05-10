import { type Subprocess } from "bun";
import { EventEmitter } from "events";
import type {
  InitializeParams,
  InitializeResponse,
  JSONRPCError,
  JSONRPCMessage,
  JSONRPCNotification,
  JSONRPCRequest,
  JSONRPCResponse,
  ThreadInjectItemsParams,
  ThreadStartParams,
  ThreadStartResponse,
  TurnInterruptParams,
  TurnStartParams,
  TurnStartResponse,
} from "./types";

interface PendingRequest {
  method: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface CodexClientOptions {
  binary?: string;
  requestTimeoutMs?: number;
}

export interface TurnCompletedParams {
  threadId?: string;
  thread_id?: string;
  turnId?: string;
  turn_id?: string;
  turn?: { id?: string; status?: string };
  status?: string;
  error?: unknown;
  [key: string]: unknown;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;

export function classifyJsonRpcMessage(msg: Record<string, unknown>): JSONRPCMessage {
  if ("id" in msg && "method" in msg) {
    return { type: "request", value: msg as unknown as JSONRPCRequest };
  }
  if ("id" in msg && "error" in msg) {
    return { type: "error", value: msg as unknown as JSONRPCError };
  }
  if ("id" in msg && "result" in msg) {
    return { type: "response", value: msg as unknown as JSONRPCResponse };
  }
  if ("method" in msg) {
    return { type: "notification", value: msg as unknown as JSONRPCNotification };
  }
  throw new Error(`Malformed JSON-RPC message: ${JSON.stringify(msg)}`);
}

function messageThreadId(params: unknown): string | undefined {
  const value = params as Record<string, unknown> | undefined;
  return (value?.threadId || value?.thread_id) as string | undefined;
}

function messageTurnId(params: unknown): string | undefined {
  const value = params as Record<string, unknown> | undefined;
  const turn = value?.turn as Record<string, unknown> | undefined;
  return (value?.turnId || value?.turn_id || turn?.id) as string | undefined;
}

function errorFromJsonRpc(error: JSONRPCError["error"]): Error {
  const details = error.data === undefined ? "" : ` ${JSON.stringify(error.data)}`;
  return new Error(`[${error.code}] ${error.message}${details}`);
}

/**
 * Lightweight JSON-RPC client for `codex app-server` over stdio.
 */
export class CodexClient extends EventEmitter {
  private proc: Subprocess | null = null;
  private requestId = 0;
  private pending = new Map<number | string, PendingRequest>();
  private buffer = "";
  private stderrBuffer = "";
  private options: Required<CodexClientOptions>;

  codexHome = "";
  userAgent = "";

  constructor(options: CodexClientOptions = {}) {
    super();
    this.options = {
      binary: options.binary || "codex",
      requestTimeoutMs: options.requestTimeoutMs || DEFAULT_REQUEST_TIMEOUT_MS,
    };
  }

  async start(): Promise<void> {
    if (this.proc) return;

    this.proc = Bun.spawn([this.options.binary, "app-server", "--listen", "stdio://"], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    const decoder = new TextDecoder();
    this.readStdoutLoop(this.proc.stdout.getReader(), decoder).catch((err) => {
      this.failAllPending(err instanceof Error ? err : new Error(String(err)));
    });
    this.readStderrLoop(this.proc.stderr.getReader(), new TextDecoder()).catch(() => {});
    this.proc.exited.then((code) => {
      const stderr = this.stderrBuffer.trim();
      const suffix = stderr ? `\nstderr:\n${stderr}` : "";
      this.failAllPending(new Error(`codex app-server exited with code ${code}${suffix}`));
      this.emit("exit", code);
    });

    const initParams: InitializeParams = {
      clientInfo: {
        name: "pico",
        version: "0.1.0",
      },
      capabilities: {
        experimentalApi: true,
      },
    };

    const response = await this.request<InitializeResponse>("initialize", initParams);
    this.codexHome = response.codexHome;
    this.userAgent = response.userAgent;
    await this.notify("initialized");
  }

  private async readStdoutLoop(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    decoder: TextDecoder,
  ): Promise<void> {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      this.buffer += decoder.decode(value, { stream: true });
      this.processBuffer();
    }
  }

  private async readStderrLoop(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    decoder: TextDecoder,
  ): Promise<void> {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      this.stderrBuffer += text;
      this.emit("stderr", text);
    }
  }

  private processBuffer(): void {
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(trimmed);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.failAllPending(new Error(`Malformed JSON from codex app-server: ${error.message}`));
        this.emit("error", error);
        continue;
      }

      try {
        this.handleMessage(msg);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.failAllPending(error);
        this.emit("error", error);
      }
    }
  }

  private handleMessage(msg: Record<string, unknown>): void {
    const classified = classifyJsonRpcMessage(msg);
    switch (classified.type) {
      case "request":
        this.emit("serverRequest", classified.value);
        this.emit(classified.value.method, classified.value.params, classified.value.id);
        return;
      case "response": {
        const pending = this.pending.get(classified.value.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(classified.value.id);
        pending.resolve(classified.value.result);
        return;
      }
      case "error": {
        const pending = this.pending.get(classified.value.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(classified.value.id);
        pending.reject(errorFromJsonRpc(classified.value.error));
        return;
      }
      case "notification":
        this.emit("notification", classified.value);
        this.emit(classified.value.method, classified.value.params);
        return;
    }
  }

  async request<T>(method: string, params?: unknown): Promise<T> {
    if (!this.proc) {
      throw new Error("Codex client is not started");
    }

    const id = ++this.requestId;
    const payload = `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`request timeout: ${method}`));
      }, this.options.requestTimeoutMs);

      this.pending.set(id, {
        method,
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });
      this.proc!.stdin.write(payload);
    });
  }

  async notify(method: string, params?: unknown): Promise<void> {
    if (!this.proc) {
      throw new Error("Codex client is not started");
    }
    this.proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  }

  async startEphemeralThread(params: Partial<ThreadStartParams> = {}): Promise<ThreadStartResponse> {
    return this.request<ThreadStartResponse>("thread/start", {
      ...params,
      ephemeral: true,
      experimentalRawEvents: true,
    });
  }

  async injectItems(threadId: string, items: unknown[]): Promise<void> {
    const params: ThreadInjectItemsParams = { threadId, items };
    await this.request("thread/inject_items", params);
  }

  async startTurn(
    threadId: string,
    text: string,
    overrides: Partial<Omit<TurnStartParams, "threadId" | "input">> = {},
  ): Promise<TurnStartResponse> {
    const params: TurnStartParams = {
      threadId,
      input: [{ type: "text", text }],
      ...overrides,
    };
    return this.request<TurnStartResponse>("turn/start", params);
  }

  waitForTurnCompleted(threadId: string, turnId: string): Promise<TurnCompletedParams> {
    return new Promise((resolve, reject) => {
      const onCompleted = (params: TurnCompletedParams) => {
        if (messageThreadId(params) !== threadId || messageTurnId(params) !== turnId) return;
        cleanup();
        resolve(params);
      };
      const onError = (params: unknown) => {
        const value = params as Record<string, unknown> | undefined;
        if (value?.willRetry === true) return;

        const maybeThreadId = messageThreadId(params);
        const maybeTurnId = messageTurnId(params);
        if (
          (maybeThreadId && maybeThreadId !== threadId) ||
          (maybeTurnId && maybeTurnId !== turnId)
        ) {
          return;
        }
        cleanup();
        reject(new Error(`turn failed: ${JSON.stringify(params)}`));
      };
      const onExit = (code: number) => {
        cleanup();
        reject(new Error(`codex app-server exited while waiting for turn ${turnId}: ${code}`));
      };
      const cleanup = () => {
        this.off("turn/completed", onCompleted);
        this.off("error", onError);
        this.off("exit", onExit);
      };

      this.on("turn/completed", onCompleted);
      this.on("error", onError);
      this.on("exit", onExit);
    });
  }

  collectRawItems(
    threadId: string,
    turnId: string,
    sink: (item: Record<string, unknown>) => void,
  ): () => void {
    const onRawItem = (params: unknown) => {
      const value = params as Record<string, unknown> | undefined;
      if (messageThreadId(value) !== threadId || messageTurnId(value) !== turnId) return;
      if (!value?.item || typeof value.item !== "object") {
        this.emit("error", new Error(`Invalid rawResponseItem/completed payload: ${JSON.stringify(value)}`));
        return;
      }
      sink(value.item as Record<string, unknown>);
    };

    this.on("rawResponseItem/completed", onRawItem);
    return () => this.off("rawResponseItem/completed", onRawItem);
  }

  async interruptTurn(threadId: string, turnId: string): Promise<void> {
    const params: TurnInterruptParams = { threadId, turnId };
    await this.request("turn/interrupt", params);
  }

  resolveServerRequest(requestId: number | string, result: unknown): void {
    if (!this.proc) {
      throw new Error("Codex client is not started");
    }
    this.proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: requestId, result })}\n`);
  }

  rejectServerRequest(requestId: number | string, code: number, message: string): void {
    if (!this.proc) {
      throw new Error("Codex client is not started");
    }
    this.proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: requestId, error: { code, message } })}\n`);
  }

  async shutdown(): Promise<void> {
    if (!this.proc) return;
    const proc = this.proc;
    this.proc = null;
    proc.stdin.end();
    proc.kill();
    await proc.exited;
  }

  private failAllPending(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`${pending.method}: ${error.message}`));
      this.pending.delete(id);
    }
  }
}
