import type { Turn, ThreadItem, FileUpdateChange } from "@pico/codex-app-server-protocol/v2";
import type { CodexPersistentThread } from "../codex/app-server";

// ── Thread view state (read-only UI projection of Codex thread data) ──

export interface ThreadInfo {
  id: string;
  cwd: string;
  createdAt: string;
  updatedAt: string;
  preview: string;
  label?: string;
  turnCount: number;
}

export interface TurnOverrides {
  model?: string | null;
  modelProvider?: string | null;
  cwd?: string;
  approvalPolicy?: string | null;
  sandbox?: unknown;
  personality?: string | null;
  developerInstructions?: string;
  [key: string]: unknown;
}

// ── View state ──

export class CodexThreadViewState {
  codexThreadId: string | undefined;
  cachedThread: CodexPersistentThread | null = null;
  liveTurnItems: ThreadItem[] = [];
  liveUserInput = "";
  streamingText = "";
  liveReasoningText = "";
  liveCommandOutputs = new Map<string, string>();
  liveFileChanges = new Map<string, FileUpdateChange[]>();
  livePlan: { explanation: string | null; steps: Array<{ step: string; status: "pending" | "inProgress" | "completed" }> } | null = null;
  turnStatus: "idle" | "running" | "approval" = "idle";
  cwd: string;

  private constructor(cwd: string) {
    this.cwd = cwd;
  }

  get id(): string {
    return this.codexThreadId ?? "";
  }

  get turns(): Turn[] {
    return (this.cachedThread?.turns as Turn[] | undefined) ?? [];
  }

  get lastTurn(): Turn | undefined {
    const t = this.turns;
    return t.length > 0 ? t[t.length - 1] : undefined;
  }

  static create(cwd: string = process.cwd()): CodexThreadViewState {
    return new CodexThreadViewState(cwd);
  }

  setThread(threadId: string, thread: CodexPersistentThread): void {
    this.codexThreadId = threadId;
    this.cachedThread = thread;
    if (thread.cwd) this.cwd = thread.cwd as string;
  }

  startTurn(userInput: string): void {
    this.liveUserInput = userInput;
    this.liveTurnItems = [];
    this.streamingText = "";
    this.liveReasoningText = "";
    this.liveCommandOutputs.clear();
    this.liveFileChanges.clear();
    this.livePlan = null;
    this.turnStatus = "running";
  }

  addLiveItem(item: ThreadItem): void {
    // Clear corresponding live temp state so completed item doesn't duplicate live content.
    switch (item.type) {
      case "agentMessage":
        this.streamingText = "";
        break;
      case "reasoning":
        this.liveReasoningText = "";
        break;
      case "commandExecution": {
        const status = item.status as string;
        if (status !== "inProgress" && status !== "running") {
          this.liveCommandOutputs.delete(item.id);
        }
        break;
      }
      case "fileChange":
        this.liveFileChanges.delete(item.id);
        break;
      case "plan":
        this.livePlan = null;
        break;
    }
    this.liveTurnItems.push(item);
  }

  appendDelta(text: string): void {
    this.streamingText += text;
  }

  appendReasoningDelta(text: string): void {
    this.liveReasoningText += text;
  }

  appendCommandOutput(itemId: string, delta: string): void {
    const prev = this.liveCommandOutputs.get(itemId) ?? "";
    this.liveCommandOutputs.set(itemId, prev + delta);
  }

  setLiveFileChanges(itemId: string, changes: FileUpdateChange[]): void {
    this.liveFileChanges.set(itemId, changes);
  }

  setLivePlan(explanation: string | null, steps: Array<{ step: string; status: "pending" | "inProgress" | "completed" }>): void {
    this.livePlan = { explanation, steps };
  }

  finishTurn(thread: CodexPersistentThread): void {
    this.cachedThread = thread;
    this.clearLiveTurn();
  }

  clearLiveTurn(): void {
    this.liveUserInput = "";
    this.liveTurnItems = [];
    this.streamingText = "";
    this.liveReasoningText = "";
    this.liveCommandOutputs.clear();
    this.liveFileChanges.clear();
    this.livePlan = null;
    this.turnStatus = "idle";
  }

  abortTurn(): void {
    this.clearLiveTurn();
  }

  // ── Static: list threads from Codex ──

  static async list(
    cwd: string,
    codex?: { listThreads: (params: { cwd: string }) => Promise<{ data: Array<{ id: string; cwd?: string; createdAt?: number; updatedAt?: number; preview?: string; turns?: Array<unknown> }> }> },
  ): Promise<ThreadInfo[]> {
    if (!codex) return [];
    try {
      const response = await codex.listThreads({ cwd });
      return response.data.map((thread) => ({
        id: thread.id,
        cwd: (thread.cwd as string) || cwd,
        createdAt: new Date((thread.createdAt as number) || 0).toISOString(),
        updatedAt: new Date((thread.updatedAt as number) || 0).toISOString(),
        preview: (thread.preview as string) || "",
        turnCount: Array.isArray(thread.turns) ? thread.turns.length : 0,
      }));
    } catch {
      return [];
    }
  }
}
