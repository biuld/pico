import { EventEmitter } from "events";
import { CodexAppServerClient } from "../codex/app-server";
import { picoConfig } from "../config";
import { PicoThreadStore } from "../thread/store";
import type { AppState, RunTurnOptions, TurnResult } from "./types";
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

  get store(): PicoThreadStore {
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
      emit: (event, payload) => this.emit(event, payload),
    });
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
