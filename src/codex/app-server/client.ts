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
  ConfigBatchWriteParams,
  ConfigReadParams,
  ConfigReadResponse,
  ConfigValueWriteParams,
  ConfigWriteResponse,
  CommandExecParams,
  CommandExecResponse,
  CommandExecResizeParams,
  CommandExecResizeResponse,
  CommandExecTerminateParams,
  CommandExecTerminateResponse,
  CommandExecWriteParams,
  CommandExecWriteResponse,
  FsGetMetadataParams,
  FsGetMetadataResponse,
  FsReadDirectoryParams,
  FsReadDirectoryResponse,
  FsReadFileParams,
  FsReadFileResponse,
  FsUnwatchParams,
  FsUnwatchResponse,
  FsWatchParams,
  FsWatchResponse,
  GetAccountParams,
  GetAccountRateLimitsResponse,
  GetAccountResponse,
  InitializeParams,
  InitializeResponse,
  JSONRPCNotification,
  JSONRPCRequest,
  LoginAccountParams,
  LoginAccountResponse,
  LogoutAccountResponse,
  ModelListParams,
  ModelListResponse,
  ModelProviderCapabilitiesReadParams,
  ModelProviderCapabilitiesReadResponse,
  ReviewStartParams,
  ReviewStartResponse,
  ThreadArchiveParams,
  ThreadArchiveResponse,
  ThreadCompactStartParams,
  ThreadCompactStartResponse,
  ThreadForkParams,
  ThreadInjectItemsParams,
  ThreadForkParams,
  ThreadListParams,
  ThreadListResponse,
  ThreadMetadataUpdateParams,
  ThreadMetadataUpdateResponse,
  ThreadReadResponse,
  ThreadResumeParams,
  ThreadResumeResponse,
  ThreadRollbackParams,
  ThreadRollbackResponse,
  ThreadSetNameParams,
  ThreadSetNameResponse,
  ThreadStartParams,
  ThreadStartResponse,
  ThreadUnarchiveParams,
  ThreadUnarchiveResponse,
  TurnInterruptParams,
  TurnInterruptResponse,
  TurnStartParams,
  TurnStartResponse,
  TurnSteerParams,
  TurnSteerResponse,
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

  async forkEphemeralThreadFromPath(
    path: string,
    params: Partial<Omit<ThreadForkParams, "path" | "ephemeral">> = {},
  ): Promise<ThreadStartResponse> {
    const response = await this.request<ThreadStartResponse>("thread/fork", {
      ...params,
      path,
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

  // ── Config ──

  async writeConfigValue(params: ConfigValueWriteParams): Promise<ConfigWriteResponse> {
    return this.request<ConfigWriteResponse>("config/write", params);
  }

  async batchWriteConfig(params: ConfigBatchWriteParams): Promise<ConfigWriteResponse> {
    return this.request<ConfigWriteResponse>("config/batch_write", params);
  }

  // ── Thread lifecycle ──

  async resumeThread(
    threadId: string,
    params: Partial<Omit<ThreadResumeParams, "threadId">> = {},
  ): Promise<ThreadStartResponse> {
    const response = await this.request<ThreadStartResponse>("thread/resume", {
      ...params,
      threadId,
      experimentalRawEvents: true,
    });
    this.status = updateCodexStatusFromThreadStart(this.status, response);
    this.emit("status", this.statusSnapshot);
    return response;
  }

  async forkEphemeralThreadFromPath(
    path: string,
    params: Partial<Omit<ThreadForkParams, "path" | "ephemeral">> = {},
  ): Promise<ThreadStartResponse> {
    const response = await this.request<ThreadStartResponse>("thread/fork", {
      ...params,
      path,
      ephemeral: true,
      experimentalRawEvents: true,
    });
    this.status = updateCodexStatusFromThreadStart(this.status, response);
    this.emit("status", this.statusSnapshot);
    return response;
  }

  async rollbackThread(threadId: string, turnId: string): Promise<ThreadRollbackResponse> {
    const params: ThreadRollbackParams = { threadId, turnId };
    return this.request<ThreadRollbackResponse>("thread/rollback", params);
  }

  async startCompact(threadId: string): Promise<ThreadCompactStartResponse> {
    const params: ThreadCompactStartParams = { threadId };
    return this.request<ThreadCompactStartResponse>("thread/compact/start", params);
  }

  async archiveThread(threadId: string): Promise<ThreadArchiveResponse> {
    const params: ThreadArchiveParams = { threadId };
    return this.request<ThreadArchiveResponse>("thread/archive", params);
  }

  async unarchiveThread(threadId: string): Promise<ThreadUnarchiveResponse> {
    const params: ThreadUnarchiveParams = { threadId };
    return this.request<ThreadUnarchiveResponse>("thread/unarchive", params);
  }

  async setThreadName(threadId: string, name: string): Promise<ThreadSetNameResponse> {
    const params: ThreadSetNameParams = { threadId, name };
    return this.request<ThreadSetNameResponse>("thread/set_name", params);
  }

  async updateThreadMetadata(
    threadId: string,
    params: Omit<ThreadMetadataUpdateParams, "threadId">,
  ): Promise<ThreadMetadataUpdateResponse> {
    return this.request<ThreadMetadataUpdateResponse>("thread/metadata/update", {
      threadId,
      ...params,
    });
  }

  // ── Turn ──

  async steerTurn(
    threadId: string,
    turnId: string,
    params: Partial<Omit<TurnSteerParams, "threadId" | "turnId">> = {},
  ): Promise<TurnSteerResponse> {
    return this.request<TurnSteerResponse>("turn/steer", { threadId, turnId, ...params });
  }

  // ── Command execution ──

  async execCommand(params: CommandExecParams): Promise<CommandExecResponse> {
    return this.request<CommandExecResponse>("command/exec", params);
  }

  async writeCommandExec(params: CommandExecWriteParams): Promise<CommandExecWriteResponse> {
    return this.request<CommandExecWriteResponse>("command/exec/write", params);
  }

  async resizeCommandExec(params: CommandExecResizeParams): Promise<CommandExecResizeResponse> {
    return this.request<CommandExecResizeResponse>("command/exec/resize", params);
  }

  async terminateCommandExec(params: CommandExecTerminateParams): Promise<CommandExecTerminateResponse> {
    return this.request<CommandExecTerminateResponse>("command/exec/terminate", params);
  }

  // ── Filesystem ──

  async readFile(params: FsReadFileParams): Promise<FsReadFileResponse> {
    return this.request<FsReadFileResponse>("fs/read_file", params);
  }

  async readDirectory(params: FsReadDirectoryParams): Promise<FsReadDirectoryResponse> {
    return this.request<FsReadDirectoryResponse>("fs/read_directory", params);
  }

  async getFileMetadata(params: FsGetMetadataParams): Promise<FsGetMetadataResponse> {
    return this.request<FsGetMetadataResponse>("fs/get_metadata", params);
  }

  async watchFs(params: FsWatchParams): Promise<FsWatchResponse> {
    return this.request<FsWatchResponse>("fs/watch", params);
  }

  async unwatchFs(params: FsUnwatchParams): Promise<FsUnwatchResponse> {
    return this.request<FsUnwatchResponse>("fs/unwatch", params);
  }

  // ── Review ──

  async startReview(params: ReviewStartParams): Promise<ReviewStartResponse> {
    return this.request<ReviewStartResponse>("review/start", params);
  }

  // ── Model ──

  async readProviderCapabilities(
    params: ModelProviderCapabilitiesReadParams,
  ): Promise<ModelProviderCapabilitiesReadResponse> {
    return this.request<ModelProviderCapabilitiesReadResponse>(
      "model/provider_capabilities/read",
      params,
    );
  }

  // ── Account ──

  async getAccount(params: GetAccountParams = {}): Promise<GetAccountResponse> {
    return this.request<GetAccountResponse>("get_account", params);
  }

  async getAccountRateLimits(): Promise<GetAccountRateLimitsResponse> {
    return this.request<GetAccountRateLimitsResponse>("get_account_rate_limits");
  }

  async loginAccount(params: LoginAccountParams): Promise<LoginAccountResponse> {
    return this.request<LoginAccountResponse>("login/account", params);
  }

  async logoutAccount(): Promise<LogoutAccountResponse> {
    return this.request<LogoutAccountResponse>("logout/account");
  }

  // ── Server requests ──

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
