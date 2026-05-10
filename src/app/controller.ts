import { EventEmitter } from "events";
import { CodexAppServerClient, normalizeCodexStatusValue } from "../codex/app-server";
import type { CodexRawResponseItemCompletedNotification, JSONRPCRequest } from "../codex/app-server";
import { loadPicoConfig, type PicoConfig } from "../config";
import { PicoThreadStore, type RawResponseItem, type TurnOverrides } from "../thread/store";

export interface AppState {
  store: PicoThreadStore;
  codex: CodexAppServerClient;
  config: PicoConfig;
  cwd: string;
}

export interface DraftAppState {
  store?: PicoThreadStore;
  codex: CodexAppServerClient;
  config: PicoConfig;
  cwd: string;
}

export interface TurnResult {
  turnId: string;
  codexTurnId: string;
  rawItemCount: number;
  leafId: string;
  completed: unknown;
}

export interface RunTurnOptions {
  askApproval?: (request: JSONRPCRequest) => Promise<unknown>;
  overrides?: TurnOverrides;
  emit?: ControllerEventSink;
}

export interface AssistantDeltaEvent {
  threadId: string;
  turnId?: string;
  delta: string;
}

export interface RawItemEvent {
  threadId: string;
  turnId: string;
  item: RawResponseItem;
  entryId?: string;
}

export interface TurnStartedEvent {
  threadId: string;
  turnId: string;
  codexTurnId?: string;
  userInput: string;
  threadStatus?: string;
  model?: string;
  modelProvider?: string;
}

export interface TurnCompletedEvent extends TurnResult {
  threadId: string;
}

export interface TurnFailedEvent {
  threadId?: string;
  turnId?: string;
  error: Error | string;
}

type ControllerEventSink = (event: string, payload: unknown) => void;

export class PicoController extends EventEmitter {
  private constructor(private state: AppState) {
    super();
    this.state.codex.on("stderr", (text) => this.emit("codex:stderr", text));
  }

  get store(): PicoThreadStore {
    return this.state.store;
  }

  get codex(): CodexAppServerClient {
    return this.state.codex;
  }

  get config(): PicoConfig {
    return this.state.config;
  }

  static async create(cwd: string = process.cwd()): Promise<PicoController> {
    return new PicoController(await createApp(cwd));
  }

  static async load(cwd: string, threadId: string): Promise<PicoController> {
    return new PicoController(await loadApp(cwd, threadId));
  }

  async reload(cwd: string, threadId: string): Promise<void> {
    await this.shutdown();
    this.state = await loadApp(cwd, threadId);
    this.state.codex.on("stderr", (text) => this.emit("codex:stderr", text));
    this.emit("thread:loaded", { threadId: this.store.id, leafId: this.store.leafId });
  }

  async runTurn(userInput: string, options: RunTurnOptions = {}): Promise<TurnResult> {
    return runTurn(this.state, userInput, {
      ...options,
      emit: (event, payload) => this.emit(event, payload),
    });
  }

  async checkout(entryId: string): Promise<void> {
    this.store.checkout(entryId);
    const branch = await this.store.appendBranch(entryId);
    this.emit("thread:changed", { type: "branch", entry: branch, leafId: this.store.leafId });
  }

  async label(entryId: string, label: string): Promise<void> {
    const entry = await this.store.appendLabel(entryId, label);
    this.emit("thread:changed", { type: "label", entry, leafId: this.store.leafId });
  }

  async shutdown(): Promise<void> {
    await this.codex.shutdown();
  }
}

export async function createApp(cwd: string = process.cwd()): Promise<AppState> {
  return ensureAppThread(await createDraftApp(cwd));
}

export async function createDraftApp(cwd: string = process.cwd()): Promise<DraftAppState> {
  const config = await loadPicoConfig(cwd);
  const appCwd = config.cwd || cwd;
  const codex = await createCodexClient(config, appCwd);
  return { codex, config, cwd: appCwd };
}

export async function ensureAppThread(app: DraftAppState): Promise<AppState> {
  if (app.store) return app as AppState;
  const { codexBinary: _codexBinary, ...configSnapshot } = app.config;
  const store = await PicoThreadStore.create(app.config.cwd || app.cwd, {
    runtime: "codex app-server",
    storage: "pico-jsonl-v1",
    ...configSnapshot,
  });
  app.store = store;
  return app as AppState;
}

export async function loadApp(cwd: string, threadId: string): Promise<AppState> {
  const config = await loadPicoConfig(cwd);
  const store = await PicoThreadStore.load(cwd, threadId);
  const codex = await createCodexClient(config, store.cwd);
  return { store, codex, config, cwd: store.cwd };
}

async function createCodexClient(config: PicoConfig, cwd: string): Promise<CodexAppServerClient> {
  const codex = new CodexAppServerClient({ binary: config.codexBinary });
  await codex.start();
  await seedCodexStatus(codex, config, cwd);
  return codex;
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
    // Older app-server builds may not expose config/read. Thread start still refreshes status.
  }
}

function codexStatusOverrides(config: PicoConfig) {
  if (!config.model && !config.modelProvider) return undefined;
  return {
    model: config.model,
    modelProvider: config.modelProvider,
  };
}

export async function runTurn(
  app: AppState,
  userInput: string,
  optionsOrAskApproval: RunTurnOptions | ((request: JSONRPCRequest) => Promise<unknown>) = {},
  legacyOverrides: TurnOverrides = {},
): Promise<TurnResult> {
  const options =
    typeof optionsOrAskApproval === "function"
      ? { askApproval: optionsOrAskApproval, overrides: legacyOverrides }
      : optionsOrAskApproval;
  const { askApproval, overrides = {} } = options;
  const emit = "emit" in options ? (options.emit as ControllerEventSink | undefined) : undefined;
  const { store, codex } = app;
  const { codexBinary: _codexBinary, ...configOverrides } = app.config;
  const turnOverrides: TurnOverrides = { ...configOverrides, ...overrides };

  let threadId: string | undefined;
  let picoTurnId: string | undefined;
  let codexTurnId: string | undefined;
  let parentId = store.leafId;

  try {
    const thread = await codex.startEphemeralThread({
      cwd: turnOverrides.cwd || store.cwd,
      model: turnOverrides.model,
      modelProvider: turnOverrides.modelProvider,
      approvalPolicy: turnOverrides.approvalPolicy,
      sandbox: turnOverrides.sandbox as string | undefined,
      personality: turnOverrides.personality,
      developerInstructions: turnOverrides.developerInstructions,
    });
    threadId = thread.thread.id;

    const injectItems = store.collectInjectItems();
    if (injectItems.length > 0) {
      await codex.injectItems(threadId, injectItems);
    }

    const picoTurn = await store.appendTurn(store.leafId, userInput, turnOverrides);
    picoTurnId = picoTurn.id;
    parentId = picoTurn.id;
    codexTurnId = picoTurn.id;
    emit?.("turn:started", {
      threadId,
      turnId: picoTurn.id,
      userInput,
      threadStatus: normalizeCodexStatusValue(thread.thread.status),
      model: thread.model,
      modelProvider: thread.modelProvider,
    } satisfies TurnStartedEvent);

    let rawItemCount = 0;
    const bufferedRawItems: RawResponseItem[] = [];
    let pendingRawWrites = Promise.resolve();
    let rawItemError: Error | undefined;

    const queueRawItemWrite = (item: RawResponseItem) => {
      pendingRawWrites = pendingRawWrites.then(async () => {
        const entry = await store.appendResponseItem(parentId, picoTurn.id, item);
        parentId = entry.id;
        rawItemCount += 1;
        emit?.("raw-item:completed", {
          threadId: threadId!,
          turnId: picoTurn.id,
          item,
          entryId: entry.id,
        } satisfies RawItemEvent);
      });
    };

    const onDelta = (params: unknown) => {
      const value = params as Record<string, unknown> | undefined;
      const maybeThreadId = value?.threadId || value?.thread_id;
      if (maybeThreadId && maybeThreadId !== threadId) return;
      if (typeof value?.delta === "string") {
        emit?.("assistant:delta", {
          threadId: threadId!,
          turnId: codexTurnId,
          delta: value.delta,
        } satisfies AssistantDeltaEvent);
      }
    };

    const onServerRequest = async (request: JSONRPCRequest) => {
      emit?.("approval:requested", request);
      try {
        const result = askApproval ? await askApproval(request) : defaultServerRequestResult(request);
        codex.resolveServerRequest(request.id, result);
        emit?.("approval:resolved", { request, result });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        codex.rejectServerRequest(request.id, -32000, message);
        emit?.("approval:rejected", { request, error: message });
      }
    };

    const onRawItem = (params: unknown) => {
      const value = params as
        | (Partial<CodexRawResponseItemCompletedNotification> & Record<string, unknown>)
        | undefined;
      const maybeThreadId = value?.threadId || value?.thread_id;
      const maybeTurnId = value?.turnId || value?.turn_id;
      if (maybeThreadId !== threadId) return;
      if (codexTurnId !== picoTurn.id && maybeTurnId !== codexTurnId) return;
      if (!value?.item || typeof value.item !== "object") {
        rawItemError = new Error(
          `Invalid rawResponseItem/completed payload: ${JSON.stringify(value)}`,
        );
        return;
      }
      if (codexTurnId === picoTurn.id) {
        bufferedRawItems.push(value.item as RawResponseItem);
        return;
      }
      queueRawItemWrite(value.item as RawResponseItem);
    };

    codex.on("item/agentMessage/delta", onDelta);
    codex.on("serverRequest", onServerRequest);
    codex.on("rawResponseItem/completed", onRawItem);

    try {
      const started = await codex.startTurn(threadId, userInput, {
        model: turnOverrides.model,
        modelProvider: turnOverrides.modelProvider,
        cwd: turnOverrides.cwd,
        approvalPolicy: turnOverrides.approvalPolicy,
        sandbox: turnOverrides.sandbox,
        personality: turnOverrides.personality,
        developerInstructions: turnOverrides.developerInstructions,
      });
      const turnId = started.turn.id;
      codexTurnId = turnId;
      emit?.("turn:codex-started", {
        threadId,
        turnId: picoTurn.id,
        codexTurnId: turnId,
        userInput,
        threadStatus: normalizeCodexStatusValue(started.turn.status),
        model: turnOverrides.model || thread.model,
        modelProvider: turnOverrides.modelProvider || thread.modelProvider,
      } satisfies TurnStartedEvent);

      for (const item of bufferedRawItems) {
        queueRawItemWrite(item);
      }
      bufferedRawItems.length = 0;

      const completed = await codex.waitForTurnCompleted(threadId, turnId);
      await pendingRawWrites;
      if (rawItemError) throw rawItemError;

      await store.appendTurnCompleted(parentId, picoTurn.id, {
        codexTurnId: turnId,
        completed,
      });
      const result: TurnResult = {
        turnId: picoTurn.id,
        codexTurnId: turnId,
        rawItemCount,
        leafId: store.leafId,
        completed,
      };
      emit?.("turn:completed", { threadId, ...result } satisfies TurnCompletedEvent);
      emit?.("thread:changed", { type: "turn", leafId: store.leafId });
      return result;
    } catch (err) {
      await pendingRawWrites.catch(() => {});
      await store.appendTurnFailed(parentId, picoTurn.id, err instanceof Error ? err : String(err));
      throw err;
    } finally {
      codex.off("item/agentMessage/delta", onDelta);
      codex.off("serverRequest", onServerRequest);
      codex.off("rawResponseItem/completed", onRawItem);
    }
  } catch (err) {
    const error = err instanceof Error ? err : String(err);
    emit?.("turn:failed", {
      threadId,
      turnId: picoTurnId,
      error,
    } satisfies TurnFailedEvent);
    throw err;
  }
}

export function defaultServerRequestResult(request: JSONRPCRequest): unknown {
  return approvalResult(request.method, "decline");
}

export function approvalResult(
  method: string,
  decision: "accept" | "decline" | "acceptForSession",
): unknown {
  if (method === "item/permissions/requestApproval") {
    return { decision: decision === "decline" ? "deny" : "approve" };
  }
  if (decision === "acceptForSession") {
    return { decision: "acceptForSession" };
  }
  return { decision: decision === "accept" ? "accept" : "decline" };
}
