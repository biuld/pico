import { EventEmitter } from "events";
import { CodexAppServerClient } from "../codex/app-server";
import { picoConfig } from "../config";
import { CodexThreadState } from "./codex-thread-state";
import type { AppState, RunTurnOptions, TurnObserver, TurnResult } from "./types";
import { createApp, createDraftApp, ensureAppThread, loadApp } from "./factory";
import { runTurn } from "./turn-runner";
import "./config";

// Re-export everything from types.ts
export type {
  AppState,
  AssistantDeltaEvent,
  DraftAppState,
  RawItemEvent,
  RunTurnOptions,
  TurnAbortedEvent,
  TurnCompletedEvent,
  TurnFailedEvent,
  TurnObserver,
  TurnResult,
  TurnStartedEvent,
} from "./types";

// Re-export everything from turn-runner.ts
export {
  approvalResult,
  defaultServerRequestResult,
  runTurn,
} from "./turn-runner";

// Re-export factory functions (previously defined here)
export {
  createApp,
  createDraftApp,
  ensureAppThread,
  loadApp,
} from "./factory";

export class PicoController extends EventEmitter {
  private constructor(private state: AppState) {
    super();
    this.state.codex.on("stderr", (text) => this.emit("codex:stderr", text));
  }

  get store(): CodexThreadState {
    return this.state.store;
  }

  get codex(): CodexAppServerClient {
    return this.state.codex;
  }

  get config(): Record<string, unknown> {
    return picoConfig.snapshot();
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
      observer: this.createTurnObserver(),
    });
  }

  private createTurnObserver(): TurnObserver {
    return {
      onThreadChanged: (e) => this.emit("thread:changed", e),
      onTurnStarted: (e) => this.emit("turn:started", e),
      onCodexTurnStarted: (e) => this.emit("turn:codex-started", e),
      onAssistantDelta: (e) => this.emit("assistant:delta", e),
      onRawItemCompleted: (e) => this.emit("raw-item:completed", e),
      onTurnCompleted: (e) => this.emit("turn:completed", e),
      onTurnAborted: (e) => this.emit("turn:aborted", e),
      onTurnFailed: (e) => this.emit("turn:failed", e),
      onApprovalRequested: (r) => this.emit("approval:requested", r),
      onApprovalResolved: (e) => this.emit("approval:resolved", e),
      onApprovalRejected: (e) => this.emit("approval:rejected", e),
      onThreadItemCompleted: (item) => this.emit("thread-item:completed", item),
    };
  }

  async checkout(entryId: string): Promise<void> {
    this.store.backtrack(entryId);
    this.emit("thread:changed", { type: "backtrack", entryId, leafId: this.store.leafId });
  }

  async label(_entryId: string, _label: string): Promise<void> {
    throw new Error("Labels are out of scope for rollout storage");
  }

  async shutdown(): Promise<void> {
    await this.codex.shutdown();
  }
}
