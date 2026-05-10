import { type Subprocess } from "bun";
import { EventEmitter } from "events";
import type {
  JSONRPCError,
  JSONRPCMessage,
  JSONRPCNotification,
  JSONRPCRequest,
  JSONRPCResponse,
} from "./types";

interface PendingRequest {
  method: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface CodexAppServerTransportOptions {
  binary?: string;
  requestTimeoutMs?: number;
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

function errorFromJsonRpc(error: JSONRPCError["error"]): Error {
  const details = error.data === undefined ? "" : ` ${JSON.stringify(error.data)}`;
  return new Error(`[${error.code}] ${error.message}${details}`);
}

export class CodexAppServerTransport extends EventEmitter {
  private proc: Subprocess | null = null;
  private requestId = 0;
  private pending = new Map<number | string, PendingRequest>();
  private buffer = "";
  private stderrBuffer = "";
  private options: Required<CodexAppServerTransportOptions>;

  constructor(options: CodexAppServerTransportOptions = {}) {
    super();
    this.options = {
      binary: options.binary || "codex",
      requestTimeoutMs: options.requestTimeoutMs || DEFAULT_REQUEST_TIMEOUT_MS,
    };
  }

  get started(): boolean {
    return Boolean(this.proc);
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
  }

  async request<T>(method: string, params?: unknown): Promise<T> {
    if (!this.proc) {
      throw new Error("Codex app-server transport is not started");
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
      throw new Error("Codex app-server transport is not started");
    }
    this.proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  }

  resolveServerRequest(requestId: number | string, result: unknown): void {
    if (!this.proc) {
      throw new Error("Codex app-server transport is not started");
    }
    this.proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: requestId, result })}\n`);
  }

  rejectServerRequest(requestId: number | string, code: number, message: string): void {
    if (!this.proc) {
      throw new Error("Codex app-server transport is not started");
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
        if (classified.value.method === "error") {
          this.emit("notification:error", classified.value.params);
          return;
        }
        this.emit(classified.value.method, classified.value.params);
        return;
    }
  }

  private failAllPending(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`${pending.method}: ${error.message}`));
      this.pending.delete(id);
    }
  }
}
