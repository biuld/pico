import type { Turn, ThreadItem } from "@pico/codex-app-server-protocol/v2";
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
    this.turnStatus = "running";
  }

  addLiveItem(item: ThreadItem): void {
    this.liveTurnItems.push(item);
  }

  appendDelta(text: string): void {
    this.streamingText += text;
  }

  finishTurn(thread: CodexPersistentThread): void {
    this.cachedThread = thread;
    this.clearLiveTurn();
  }

  clearLiveTurn(): void {
    this.liveUserInput = "";
    this.liveTurnItems = [];
    this.streamingText = "";
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
