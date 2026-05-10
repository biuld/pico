import { EventEmitter } from "events";
import {
  messageThreadId,
  messageTurnId,
  type TurnCompletedParams,
} from "./events";
import {
  createCodexStatusSnapshot,
  updateCodexStatusFromConfig,
  updateCodexStatusFromConfigRead,
  updateCodexStatusFromError,
  updateCodexStatusFromInitialize,
  updateCodexStatusFromModelList,
  updateCodexStatusFromNotification,
  updateCodexStatusFromThreadStart,
  updateCodexStatusFromTurnCompleted,
  updateCodexStatusFromTurnStart,
  type CodexStatusSnapshot,
} from "./status";
import { CodexAppServerTransport, type CodexAppServerTransportOptions } from "./transport";
import type {
  CodexConfig,
  ConfigReadParams,
  ConfigReadResponse,
  InitializeParams,
  InitializeResponse,
  JSONRPCNotification,
  JSONRPCRequest,
  ModelListParams,
  ModelListResponse,
  ThreadInjectItemsParams,
  ThreadListParams,
  ThreadListResponse,
  ThreadReadResponse,
  ThreadStartParams,
  ThreadStartResponse,
  TurnInterruptParams,
  TurnInterruptResponse,
  TurnStartParams,
  TurnStartResponse,
} from "./types";

export interface CodexAppServerClientOptions extends CodexAppServerTransportOptions {}

export interface RefreshConfigStatusOptions {
  cwd?: string;
  overrides?: CodexConfig;
}

const DEFAULT_CODEX_MODEL_PROVIDER = "openai";

export class CodexAppServerClient extends EventEmitter {
  private transport: CodexAppServerTransport;
  private status: CodexStatusSnapshot = createCodexStatusSnapshot();

  codexHome = "";
  userAgent = "";

  constructor(options: CodexAppServerClientOptions = {}) {
    super();
    this.transport = new CodexAppServerTransport(options);
    this.transport.on("notification", (notification: JSONRPCNotification) => {
      this.status = updateCodexStatusFromNotification(this.status, notification);
      this.emit("status", this.statusSnapshot);
      this.emit("notification", notification);
      if (notification.method === "error") {
        this.emit("notification:error", notification.params);
        return;
      }
      this.emit(notification.method, notification.params);
    });
    this.transport.on("serverRequest", (request: JSONRPCRequest) => {
      this.emit("serverRequest", request);
      this.emit(request.method, request.params, request.id);
    });
    this.transport.on("stderr", (text) => this.emit("stderr", text));
    this.transport.on("exit", (code) => this.emit("exit", code));
    this.transport.on("error", (error) => {
      this.status = updateCodexStatusFromError(this.status, error instanceof Error ? error : String(error));
      this.emit("status", this.statusSnapshot);
      this.emit("transport:error", error);
    });
  }

  get statusSnapshot(): CodexStatusSnapshot {
    return { ...this.status };
  }

  async start(): Promise<void> {
    if (this.transport.started) return;

    await this.transport.start();
    const initParams: InitializeParams = {
      clientInfo: {
        name: "pico",
        title: null,
        version: "0.1.0",
      },
      capabilities: {
        experimentalApi: true,
        requestAttestation: false,
      },
    };

    const response = await this.request<InitializeResponse>("initialize", initParams);
    this.codexHome = response.codexHome;
    this.userAgent = response.userAgent;
    this.status = updateCodexStatusFromInitialize(this.status, response);
    this.emit("status", this.statusSnapshot);
    await this.notify("initialized");
  }

  async request<T>(method: string, params?: unknown): Promise<T> {
    return this.transport.request<T>(method, params);
  }

  async notify(method: string, params?: unknown): Promise<void> {
    return this.transport.notify(method, params);
  }

  applyConfigStatus(config: CodexConfig): void {
    this.status = updateCodexStatusFromConfig(this.status, config);
    this.emit("status", this.statusSnapshot);
  }

  async readConfig(params: ConfigReadParams): Promise<ConfigReadResponse> {
    return this.request<ConfigReadResponse>("config/read", params);
  }

  async listModels(params: ModelListParams = {}): Promise<ModelListResponse> {
    return this.request<ModelListResponse>("model/list", params);
  }

  async listThreads(params: ThreadListParams = {}): Promise<ThreadListResponse> {
    return this.request<ThreadListResponse>("thread/list", params);
  }

  async readThread(threadId: string, includeTurns = true): Promise<ThreadReadResponse> {
    return this.request<ThreadReadResponse>("thread/read", { threadId, includeTurns });
  }

  async refreshConfigStatus(options: RefreshConfigStatusOptions = {}): Promise<void> {
    const configParams: ConfigReadParams = { includeLayers: false };
    if (options.cwd) configParams.cwd = options.cwd;

    const config = await this.readConfig(configParams);
    this.status = updateCodexStatusFromConfigRead(this.status, config);
    if (!this.status.modelProvider) {
      this.status = updateCodexStatusFromConfig(this.status, {
        modelProvider: DEFAULT_CODEX_MODEL_PROVIDER,
      });
    }

    try {
      const models = await this.listModels({ limit: 100, includeHidden: false });
      this.status = updateCodexStatusFromModelList(this.status, models);
    } catch {
      // Some auth/provider states cannot list models yet. Config values are still useful.
    }

    if (options.overrides) {
      this.status = updateCodexStatusFromConfig(this.status, options.overrides);
    }
    this.emit("status", this.statusSnapshot);
  }

  async startEphemeralThread(params: Partial<ThreadStartParams> = {}): Promise<ThreadStartResponse> {
    const response = await this.request<ThreadStartResponse>("thread/start", {
      ...params,
      ephemeral: true,
      experimentalRawEvents: true,
    });
    this.status = updateCodexStatusFromThreadStart(this.status, response);
    this.emit("status", this.statusSnapshot);
    return response;
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
      input: [{ type: "text", text, text_elements: [] }],
      ...overrides,
    };
    const response = await this.request<TurnStartResponse>("turn/start", params);
    this.status = updateCodexStatusFromTurnStart(this.status, threadId, response);
    this.emit("status", this.statusSnapshot);
    return response;
  }

  async interruptTurn(threadId: string, turnId: string): Promise<TurnInterruptResponse> {
    const params: TurnInterruptParams = { threadId, turnId };
    return this.request<TurnInterruptResponse>("turn/interrupt", params);
  }

  waitForTurnCompleted(threadId: string, turnId: string): Promise<TurnCompletedParams> {
    return new Promise((resolve, reject) => {
      const onCompleted = (params: TurnCompletedParams) => {
        if (messageThreadId(params) !== threadId || messageTurnId(params) !== turnId) return;
        cleanup();
        this.status = updateCodexStatusFromTurnCompleted(this.status, params);
        this.emit("status", this.statusSnapshot);
        resolve(params);
      };
      const onNotificationError = (params: unknown) => {
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
        const error = new Error(`turn failed: ${JSON.stringify(params)}`);
        this.status = updateCodexStatusFromError(this.status, error);
        this.emit("status", this.statusSnapshot);
        reject(error);
      };
      const onTransportError = (value: unknown) => {
        cleanup();
        const error = value instanceof Error ? value : new Error(String(value));
        this.status = updateCodexStatusFromError(this.status, error);
        this.emit("status", this.statusSnapshot);
        reject(error);
      };
      const onExit = (code: number) => {
        cleanup();
        const error = new Error(`codex app-server exited while waiting for turn ${turnId}: ${code}`);
        this.status = updateCodexStatusFromError(this.status, error);
        this.emit("status", this.statusSnapshot);
        reject(error);
      };
      const cleanup = () => {
        this.off("turn/completed", onCompleted);
        this.off("notification:error", onNotificationError);
        this.off("transport:error", onTransportError);
        this.off("exit", onExit);
      };

      this.on("turn/completed", onCompleted);
      this.on("notification:error", onNotificationError);
      this.on("transport:error", onTransportError);
      this.on("exit", onExit);
    });
  }

  resolveServerRequest(requestId: number | string, result: unknown): void {
    this.transport.resolveServerRequest(requestId, result);
  }

  rejectServerRequest(requestId: number | string, code: number, message: string): void {
    this.transport.rejectServerRequest(requestId, code, message);
  }

  async shutdown(): Promise<void> {
    await this.transport.shutdown();
    this.status = { ...this.status, connected: false };
    this.emit("status", this.statusSnapshot);
  }
}
