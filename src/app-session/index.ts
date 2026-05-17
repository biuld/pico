import { EventEmitter } from "events";
import { approvalResult, runTurn } from "../app/turn-runner";
import { createDraftApp, ensureAppThread, loadApp } from "../app/factory";
import type {
  AppState,
  DraftAppState,
  TurnFailedEvent,
} from "../app/types";
import type { ThreadItem } from "@pico/codex-app-server-protocol/v2";
import type { CodexAppServerClient, JSONRPCRequest } from "../codex/app-server";
import { CodexThreadViewState, type ThreadInfo } from "../app/codex-thread-view-state";
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
  pendingApproval?: JSONRPCRequest;
  queuedMessages: readonly QueuedMessage[];
  activeCodexThreadId?: string;
  activeCodexTurnId?: string;
  liveThreadItems: readonly ThreadItem[];
}

interface PendingApproval {
  request: JSONRPCRequest;
  resolve: (result: unknown) => void;
}

export interface QueuedMessage {
  id: string;
  text: string;
  createdAt: string;
}

export interface PicoAppSessionOptions {
  createDraftApp?: (cwd: string) => Promise<DraftAppState>;
}

export class PicoAppSession extends EventEmitter {
  private currentApp: DraftAppState;
  private pendingApproval: PendingApproval | undefined;
  private running = false;
  private queuedMessages: QueuedMessage[] = [];
  private nextQueuedMessageId = 1;
  private activeCodexThreadId: string | undefined;
  private activeCodexTurnId: string | undefined;
  private interruptRequested = false;
  private interrupting = false;
  private detachCodexStatus: (() => void) | undefined;
  private readonly createDraftApp: (cwd: string) => Promise<DraftAppState>;

  constructor(app: DraftAppState, options: PicoAppSessionOptions = {}) {
    super();
    this.currentApp = app;
    this.createDraftApp = options.createDraftApp || createDraftApp;
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
    const vs = this.currentApp.viewState;
    return {
      app: this.currentApp,
      running: this.running,
      streamingText: vs?.streamingText ?? "",
      pendingApproval: this.pendingApproval?.request,
      queuedMessages: [...this.queuedMessages],
      activeCodexThreadId: this.activeCodexThreadId,
      activeCodexTurnId: this.activeCodexTurnId,
      liveThreadItems: vs ? [...vs.liveTurnItems] : [],
    };
  }

  isBusy(): boolean {
    return this.running || Boolean(this.pendingApproval);
  }

  static listThreads(cwd: string, codex?: CodexAppServerClient): Promise<ThreadInfo[]> {
    return CodexThreadViewState.list(cwd, codex);
  }

  async resume(threadId: string): Promise<void> {
    if (!threadId || threadId === this.currentApp.viewState?.id) return;
    const cwd = this.currentApp.viewState?.cwd || this.currentApp.cwd;
    this.detachCodexStatus?.();
    this.detachCodexStatus = undefined;
    await this.currentApp.codex.shutdown().catch(() => {});
    this.currentApp = await loadApp(cwd, threadId);
    this.clearQueuedMessages();
    this.attachCodexStatus(this.currentApp);
    this.emitAppSession(PICO_APP_SESSION_EVENTS.THREAD_LOADED, { threadId });
  }

  async interruptTurn(): Promise<boolean> {
    if (!this.running) return false;

    this.interruptRequested = true;
    const sent = await this.sendActiveInterrupt();
    if (!sent) {
      this.emitAppSession(PICO_APP_SESSION_EVENTS.TURN_INTERRUPT_REQUESTED, {
        threadId: this.activeCodexThreadId,
        codexTurnId: this.activeCodexTurnId,
        pending: true,
      });
    }
    return true;
  }

  async newDraft(): Promise<boolean> {
    return this.resetDraft("new");
  }

  async clearDraft(): Promise<boolean> {
    return this.resetDraft("clear");
  }

  submit(userInput: string): void {
    if (this.isBusy()) {
      this.emitAppSession(PICO_APP_SESSION_EVENTS.TURN_BUSY);
      return;
    }

    this.running = true;
    this.emitAppSession(PICO_APP_SESSION_EVENTS.TURN_SUBMITTING);

    void this.runSubmittedTurn(userInput);
  }

  queueMessage(text: string): QueuedMessage | undefined {
    const trimmed = text.trim();
    if (!trimmed) return undefined;

    const message: QueuedMessage = {
      id: `queued-${this.nextQueuedMessageId++}`,
      text: trimmed,
      createdAt: new Date().toISOString(),
    };
    this.queuedMessages = [message];
    this.emitQueueChanged();
    return message;
  }

  takeQueuedMessage(): QueuedMessage | undefined {
    const [message] = this.queuedMessages.splice(0, 1);
    if (!message) return undefined;
    this.emitQueueChanged();
    return message;
  }

  private submitNextQueuedMessage(): boolean {
    if (this.isBusy()) {
      this.emitAppSession(PICO_APP_SESSION_EVENTS.TURN_BUSY);
      return false;
    }

    if (this.queuedMessages.length === 0) return false;

    const [message] = this.queuedMessages.splice(0, 1);
    if (!message) return false;
    this.emitQueueChanged();
    this.submit(message.text);
    return true;
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

  // ── private helpers ──

  private async runSubmittedTurn(userInput: string): Promise<void> {
    let drainQueue = false;
    let failedFromEvent = false;
    let activeApp: AppState;
    try {
      activeApp = await ensureAppThread(this.currentApp);
      this.setApp(activeApp);
      this.emitAppSession(PICO_APP_SESSION_EVENTS.TURN_THREAD_READY, { threadId: activeApp.viewState.id });
    } catch (err) {
      this.running = false;
      this.clearActiveCodexTurn();
      this.emitTurnFailed(err);
      this.emitAppSession(PICO_APP_SESSION_EVENTS.TURN_FINISHED);
      return;
    }

    try {
      await runTurn(activeApp, userInput, {
        askApproval: (request) => this.askApproval(request),
        observer: {
          onTurnStarted: (event) => {
            this.activeCodexThreadId = event.threadId;
            this.activeCodexTurnId = undefined;
            this.emitAppSession(PICO_APP_SESSION_EVENTS.TURN_STARTED, event);
          },
          onCodexTurnStarted: (event) => {
            this.activeCodexThreadId = event.threadId;
            this.activeCodexTurnId = event.codexTurnId;
            this.emitAppSession(PICO_APP_SESSION_EVENTS.TURN_CODEX_STARTED, event);
            if (this.interruptRequested) void this.sendActiveInterrupt();
          },
          onAssistantDelta: (event) => {
            this.emitAppSession(PICO_APP_SESSION_EVENTS.ASSISTANT_DELTA, event);
          },
          onTurnCompleted: (_event) => {
            drainQueue = true;
            this.clearActiveCodexTurn();
            this.emitAppSession(PICO_APP_SESSION_EVENTS.TURN_COMPLETED, _event);
          },
          onTurnAborted: (_event) => {
            drainQueue = this.interruptRequested;
            this.clearActiveCodexTurn();
            this.emitAppSession(PICO_APP_SESSION_EVENTS.TURN_ABORTED, _event);
          },
          onTurnFailed: (_event) => {
            failedFromEvent = true;
            const interrupted = this.interruptRequested;
            drainQueue = interrupted;
            this.clearActiveCodexTurn();
            this.emitAppSession(PICO_APP_SESSION_EVENTS.TURN_FAILED, interrupted
              ? { ..._event, error: "Turn interrupted" }
              : _event);
          },
          onThreadItemCompleted: (item) => {
            this.emitAppSession(PICO_APP_SESSION_EVENTS.THREAD_ITEM, item);
          },
          onLiveTranscriptChanged: () => {
            this.emitAppSession(PICO_APP_SESSION_EVENTS.LIVE_TRANSCRIPT_CHANGED);
          },
        },
      });
    } catch (err) {
      if (!failedFromEvent) this.emitTurnFailed(err);
    } finally {
      this.running = false;
      this.clearActiveCodexTurn();
      this.emitAppSession(PICO_APP_SESSION_EVENTS.TURN_FINISHED);
      if (drainQueue) this.submitNextQueuedMessage();
    }
  }

  private askApproval(request: JSONRPCRequest): Promise<unknown> {
    return new Promise((resolve) => {
      this.pendingApproval = { request, resolve };
      this.emitAppSession(PICO_APP_SESSION_EVENTS.APPROVAL_REQUESTED, request);
    });
  }

  private emitTurnFailed(error: unknown, turnId?: string): void {
    const interrupted = this.interruptRequested;
    this.clearActiveCodexTurn();
    this.emitAppSession(PICO_APP_SESSION_EVENTS.TURN_FAILED, {
      threadId: this.currentApp.viewState?.id,
      turnId,
      error: interrupted ? "Turn interrupted" : error instanceof Error ? error : String(error),
    } satisfies TurnFailedEvent);
  }

  private emitQueueChanged(): void {
    this.emitAppSession(PICO_APP_SESSION_EVENTS.QUEUE_CHANGED, {
      queuedCount: this.queuedMessages.length,
    });
  }

  private clearQueuedMessages(): void {
    if (this.queuedMessages.length === 0) return;
    this.queuedMessages = [];
    this.emitQueueChanged();
  }

  private async sendActiveInterrupt(): Promise<boolean> {
    if (this.interrupting) return true;
    const threadId = this.activeCodexThreadId;
    const turnId = this.activeCodexTurnId;
    if (!this.running || !threadId || !turnId) return false;

    this.interrupting = true;
    this.emitAppSession(PICO_APP_SESSION_EVENTS.TURN_INTERRUPT_REQUESTED, {
      threadId,
      codexTurnId: turnId,
      pending: false,
    });
    try {
      await this.currentApp.codex.interruptTurn(threadId, turnId);
      return true;
    } catch (err) {
      this.emitAppSession(PICO_APP_SESSION_EVENTS.TURN_INTERRUPT_FAILED, {
        error: err instanceof Error ? err : String(err),
      });
      return false;
    } finally {
      this.interrupting = false;
    }
  }

  private async resetDraft(reason: "new" | "clear"): Promise<boolean> {
    if (this.running) {
      this.emitAppSession(PICO_APP_SESSION_EVENTS.TURN_BUSY);
      return false;
    }

    const cwd = this.currentApp.viewState?.cwd || this.currentApp.cwd;
    const previous = this.currentApp;
    this.detachCodexStatus?.();
    this.detachCodexStatus = undefined;
    await previous.codex.shutdown().catch(() => {});

    this.currentApp = await this.createDraftApp(cwd);
    this.pendingApproval = undefined;
    this.clearActiveCodexTurn();
    this.clearQueuedMessages();
    this.attachCodexStatus(this.currentApp);
    this.emitAppSession(PICO_APP_SESSION_EVENTS.APP_CHANGED, this.currentApp);
    this.emitAppSession(PICO_APP_SESSION_EVENTS.DRAFT_RESET, { reason });
    return true;
  }

  private clearActiveCodexTurn(): void {
    this.activeCodexThreadId = undefined;
    this.activeCodexTurnId = undefined;
    this.interruptRequested = false;
    this.interrupting = false;
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

  private emitAppSession<Name extends PicoAppSessionEventName>(
    eventName: Name,
    ...args: PicoAppSessionEventArgs<Name>
  ): boolean {
    return super.emit(eventName, ...args);
  }
}
