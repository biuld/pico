import { EventEmitter } from "events";
import {
  approvalResult,
  ensureAppThread,
  loadApp,
  runTurn,
  type AppState,
  type AssistantDeltaEvent,
  type DraftAppState,
  type RawItemEvent,
  type TurnCompletedEvent,
  type TurnFailedEvent,
  type TurnStartedEvent,
} from "../app/controller";
import type { JSONRPCRequest } from "../codex/app-server";
import { updateProjectPicoConfig } from "../config";
import { PicoThreadStore, type PicoThreadInfo, type RawResponseItem } from "../thread/store";
import {
  PICO_APP_SESSION_EVENTS,
  type PicoAppSessionEventArgs,
  type PicoAppSessionEventName,
} from "./events";

export type PicoAppApprovalDecision = "accept" | "acceptForSession" | "decline";

export { PICO_APP_SESSION_EVENTS } from "./events";
export type {
  PicoAppSessionEventArgs,
  PicoAppSessionEventName,
  PicoAppSessionEventPayloads,
} from "./events";

export interface PicoAppSessionSnapshot {
  app: DraftAppState;
  running: boolean;
  streamingText: string;
  liveLeafId?: string;
  pendingApproval?: JSONRPCRequest;
}

interface PendingApproval {
  request: JSONRPCRequest;
  resolve: (result: unknown) => void;
}

export class PicoAppSession extends EventEmitter {
  private currentApp: DraftAppState;
  private pendingApproval: PendingApproval | undefined;
  private running = false;
  private streamingText = "";
  private liveLeafId: string | undefined;
  private detachCodexStatus: (() => void) | undefined;

  constructor(app: DraftAppState) {
    super();
    this.currentApp = app;
    this.attachCodexStatus(app);
  }

  on<Name extends PicoAppSessionEventName>(
    eventName: Name,
    listener: (...args: PicoAppSessionEventArgs<Name>) => void,
  ): this;
  on(eventName: string | symbol, listener: (...args: any[]) => void): this {
    return super.on(eventName, listener);
  }

  once<Name extends PicoAppSessionEventName>(
    eventName: Name,
    listener: (...args: PicoAppSessionEventArgs<Name>) => void,
  ): this;
  once(eventName: string | symbol, listener: (...args: any[]) => void): this {
    return super.once(eventName, listener);
  }

  get app(): DraftAppState {
    return this.currentApp;
  }

  get snapshot(): PicoAppSessionSnapshot {
    return {
      app: this.currentApp,
      running: this.running,
      streamingText: this.streamingText,
      liveLeafId: this.liveLeafId,
      pendingApproval: this.pendingApproval?.request,
    };
  }

  isBusy(): boolean {
    return this.running || Boolean(this.pendingApproval);
  }

  static listThreads(cwd: string): Promise<PicoThreadInfo[]> {
    return PicoThreadStore.list(cwd);
  }

  async updateStatusLineItems(items: readonly string[]): Promise<void> {
    const nextConfig = await updateProjectPicoConfig(this.currentApp.cwd, {
      statusLineItems: [...items],
    });
    this.currentApp = {
      ...this.currentApp,
      config: {
        ...this.currentApp.config,
        statusLineItems: nextConfig.statusLineItems,
      },
    };
    this.emitAppSession(PICO_APP_SESSION_EVENTS.CONFIG_CHANGED, this.currentApp.config);
  }

  async restore(entryId: string) {
    const store = this.requireStore();
    const branch = await store.appendBranch(entryId);
    this.emitAppSession(PICO_APP_SESSION_EVENTS.THREAD_BRANCHED, branch);
    return branch;
  }

  async rename(entryId: string, label: string) {
    const store = this.requireStore();
    const entry = await store.appendLabel(entryId, label);
    this.emitAppSession(PICO_APP_SESSION_EVENTS.THREAD_LABELED, entry);
    return entry;
  }

  async resume(threadId: string): Promise<void> {
    if (!threadId || threadId === this.currentApp.store?.id) return;
    const cwd = this.currentApp.store?.cwd || this.currentApp.cwd;
    this.detachCodexStatus?.();
    this.detachCodexStatus = undefined;
    await this.currentApp.codex.shutdown().catch(() => {});
    this.currentApp = await loadApp(cwd, threadId);
    this.streamingText = "";
    this.liveLeafId = undefined;
    this.attachCodexStatus(this.currentApp);
    this.emitAppSession(PICO_APP_SESSION_EVENTS.THREAD_LOADED, { threadId });
  }

  submit(userInput: string): void {
    if (this.isBusy()) {
      this.emitAppSession(PICO_APP_SESSION_EVENTS.TURN_BUSY);
      return;
    }

    this.streamingText = "";
    this.liveLeafId = undefined;
    this.running = true;
    this.emitAppSession(PICO_APP_SESSION_EVENTS.TURN_SUBMITTING);

    void this.runSubmittedTurn(userInput);
  }

  resolveApproval(decision: PicoAppApprovalDecision): void {
    if (!this.pendingApproval) return;
    this.pendingApproval.resolve(approvalResult(this.pendingApproval.request.method, decision));
    this.pendingApproval = undefined;
    this.emitAppSession(PICO_APP_SESSION_EVENTS.APPROVAL_RESOLVED, { running: this.running });
  }

  async shutdown(): Promise<void> {
    if (this.pendingApproval) {
      this.pendingApproval.resolve(approvalResult(this.pendingApproval.request.method, "decline"));
      this.pendingApproval = undefined;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    this.detachCodexStatus?.();
    this.detachCodexStatus = undefined;
    await this.currentApp.codex.shutdown().catch(() => {});
  }

  dispose(): void {
    this.detachCodexStatus?.();
    this.detachCodexStatus = undefined;
    void this.currentApp.codex.shutdown().catch(() => {});
  }

  private async runSubmittedTurn(userInput: string): Promise<void> {
    let failedFromEvent = false;
    let activeApp: AppState;
    try {
      activeApp = await ensureAppThread(this.currentApp);
      this.setApp(activeApp);
      this.emitAppSession(PICO_APP_SESSION_EVENTS.TURN_THREAD_READY, { leafId: activeApp.store.leafId });
    } catch (err) {
      this.running = false;
      this.liveLeafId = undefined;
      this.emitTurnFailed(err);
      this.emitAppSession(PICO_APP_SESSION_EVENTS.TURN_FINISHED);
      return;
    }

    try {
      await runTurn(activeApp, userInput, {
        askApproval: (request) => this.askApproval(request),
        emit: (event, payload) => {
          if (event === PICO_APP_SESSION_EVENTS.TURN_FAILED) failedFromEvent = true;
          this.handleTurnEvent(event, payload);
        },
      });
    } catch (err) {
      if (!failedFromEvent) this.emitTurnFailed(err, activeApp.store.leafId);
    } finally {
      this.running = false;
      this.emitAppSession(PICO_APP_SESSION_EVENTS.TURN_FINISHED);
    }
  }

  private askApproval(request: JSONRPCRequest): Promise<unknown> {
    return new Promise((resolve) => {
      this.pendingApproval = { request, resolve };
      this.emitAppSession(PICO_APP_SESSION_EVENTS.APPROVAL_REQUESTED, request);
    });
  }

  private handleTurnEvent(event: string, payload: unknown): void {
    if (event === PICO_APP_SESSION_EVENTS.TURN_STARTED) {
      const started = payload as TurnStartedEvent;
      this.liveLeafId = started.turnId;
      this.emitAppSession(PICO_APP_SESSION_EVENTS.TURN_STARTED, started);
      return;
    }
    if (event === PICO_APP_SESSION_EVENTS.TURN_CODEX_STARTED) {
      this.emitAppSession(PICO_APP_SESSION_EVENTS.TURN_CODEX_STARTED, payload as TurnStartedEvent);
      return;
    }
    if (event === PICO_APP_SESSION_EVENTS.ASSISTANT_DELTA) {
      const delta = payload as AssistantDeltaEvent;
      this.streamingText += delta.delta || "";
      this.emitAppSession(PICO_APP_SESSION_EVENTS.ASSISTANT_DELTA, delta);
      return;
    }
    if (event === PICO_APP_SESSION_EVENTS.RAW_ITEM_COMPLETED) {
      const item = payload as RawItemEvent;
      this.liveLeafId = item.entryId || this.liveLeafId;
      if (rawResponseItemHasOutputText(item.item)) this.streamingText = "";
      this.emitAppSession(PICO_APP_SESSION_EVENTS.RAW_ITEM_COMPLETED, item);
      return;
    }
    if (event === PICO_APP_SESSION_EVENTS.TURN_COMPLETED) {
      const result = payload as TurnCompletedEvent;
      this.streamingText = "";
      this.liveLeafId = undefined;
      this.emitAppSession(PICO_APP_SESSION_EVENTS.TURN_COMPLETED, result);
      return;
    }
    if (event === PICO_APP_SESSION_EVENTS.TURN_FAILED) {
      const failed = payload as TurnFailedEvent;
      this.streamingText = "";
      this.liveLeafId = undefined;
      this.emitAppSession(PICO_APP_SESSION_EVENTS.TURN_FAILED, failed);
    }
  }

  private emitTurnFailed(error: unknown, leafId?: string): void {
    this.streamingText = "";
    this.liveLeafId = undefined;
    this.emitAppSession(PICO_APP_SESSION_EVENTS.TURN_FAILED, {
      threadId: this.currentApp.store?.id,
      turnId: leafId,
      error: error instanceof Error ? error : String(error),
    } satisfies TurnFailedEvent);
  }

  private setApp(app: DraftAppState): void {
    if (app === this.currentApp) return;
    this.detachCodexStatus?.();
    this.currentApp = app;
    this.attachCodexStatus(app);
    this.emitAppSession(PICO_APP_SESSION_EVENTS.APP_CHANGED, app);
  }

  private attachCodexStatus(app: DraftAppState): void {
    const onStatus = () => this.emitAppSession(PICO_APP_SESSION_EVENTS.CODEX_STATUS, app.codex.statusSnapshot);
    app.codex.on("status", onStatus);
    this.detachCodexStatus = () => app.codex.off("status", onStatus);
  }

  private requireStore(): PicoThreadStore {
    if (!this.currentApp.store) throw new Error("no turns yet");
    return this.currentApp.store;
  }

  private emitAppSession<Name extends PicoAppSessionEventName>(
    eventName: Name,
    ...args: PicoAppSessionEventArgs<Name>
  ): boolean {
    return super.emit(eventName, ...args);
  }
}

function rawResponseItemHasOutputText(item: RawResponseItem): boolean {
  if (item.type !== "message") return false;
  const content = item.content;
  return Array.isArray(content) && content.some((part) => {
    if (!part || typeof part !== "object") return false;
    const value = part as Record<string, unknown>;
    return typeof value.text === "string" &&
      (value.type === "output_text" || value.type === "text");
  });
}
