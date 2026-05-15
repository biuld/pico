import { EventEmitter } from "events";
import { CodexAppServerClient, normalizeCodexStatusValue } from "../codex/app-server";
import type { JSONRPCRequest } from "../codex/app-server";
import { picoConfig } from "../config";
import { PicoThreadStore } from "../thread/store";
import type { AppState, DraftAppState, RunTurnOptions, TurnResult } from "./types";
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

export async function createApp(cwd: string = process.cwd()): Promise<AppState> {
  return ensureAppThread(await createDraftApp(cwd));
}

export async function createDraftApp(cwd: string = process.cwd()): Promise<DraftAppState> {
  const codex = await createCodexClient(cwd);
  return { codex, cwd };
}

export async function ensureAppThread(app: DraftAppState): Promise<AppState> {
  if (app.store) return app as AppState;
  const snapshot = picoConfig.snapshot();
  const { codexBinary: _codexBinary, ...configSnapshot } = snapshot;
  const store = await PicoThreadStore.create(app.cwd, {
    runtime: "codex app-server",
    storage: "pico-jsonl-v1",
    ...configSnapshot,
  });
  app.store = store;
  return app as AppState;
}

export async function loadApp(cwd: string, threadId: string): Promise<AppState> {
  const store = await PicoThreadStore.load(cwd, threadId);
  const codex = await createCodexClient(store.cwd);
  return { store, codex, cwd: store.cwd };
}

async function createCodexClient(cwd: string): Promise<CodexAppServerClient> {
  const codex = new CodexAppServerClient({ binary: picoConfig.get<string>("codexBinary") });
  await codex.start();
  await seedCodexStatus(codex, cwd);
  return codex;
}

async function seedCodexStatus(
  codex: CodexAppServerClient,
  cwd: string,
): Promise<void> {
  const overrides = codexStatusOverrides();
  if (overrides) codex.applyConfigStatus(overrides);

  try {
    await codex.refreshConfigStatus({ cwd, overrides });
  } catch {
    // Older app-server builds may not expose config/read. Thread start still refreshes status.
  }
}

function codexStatusOverrides() {
  const model = picoConfig.get<string | undefined>("model");
  const modelProvider = picoConfig.get<string | undefined>("modelProvider");
  if (!model && !modelProvider) return undefined;
  return { model, modelProvider };
}
