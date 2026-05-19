import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "../src/tui/config";
import { CodexThreadViewState } from "../src/app/codex-thread-view-state";
import type { ThreadItem, FileUpdateChange, PatchChangeKind } from "@pico/codex-app-server-protocol/v2";

export async function createViewState(): Promise<CodexThreadViewState> {
  const cwd = await mkdtemp(join(tmpdir(), "pico-cwd-"));
  const home = await mkdtemp(join(tmpdir(), "pico-home-"));
  Bun.env.HOME = home;
  return CodexThreadViewState.create(cwd);
}

export function setMockTurns(
  viewState: CodexThreadViewState,
  turns: Array<{ id: string; items: ThreadItem[]; status?: string }>,
): void {
  viewState.cachedThread = {
    id: viewState.codexThreadId ?? "mock-thread",
    turns,
  } as unknown as Parameters<typeof viewState.finishTurn>[0];
}

export function mockUserMessageItem(id: string, text: string): ThreadItem {
  return {
    type: "userMessage", id,
    content: [{ type: "text", text }],
  } as unknown as ThreadItem;
}

export function mockAgentMessageItem(id: string, text: string): ThreadItem {
  return {
    type: "agentMessage", id, text,
    phase: null, memoryCitation: null,
  } as ThreadItem;
}

export function mockFileUpdateChange(path: string, diff: string, kind: PatchChangeKind = { type: "update", move_path: null }): FileUpdateChange {
  return { path, kind, diff };
}

export function mockFileChangeItem(id: string, changes: FileUpdateChange[]): ThreadItem {
  return {
    type: "fileChange", id, changes,
    status: "completed",
  } as unknown as ThreadItem;
}

export function mockReasoningItem(id: string, summary: string[]): ThreadItem {
  return {
    type: "reasoning", id, summary, content: [],
  } as ThreadItem;
}

export function mockPlanItem(id: string, text: string): ThreadItem {
  return { type: "plan", id, text } as ThreadItem;
}

export function mockCommandExecutionItem(id: string, command: string, opts?: { cwd?: string; aggregatedOutput?: string | null }): ThreadItem {
  return {
    type: "commandExecution", id, command,
    cwd: opts?.cwd ?? "/app",
    processId: null,
    source: "agent",
    status: "completed",
    commandActions: [],
    aggregatedOutput: opts?.aggregatedOutput ?? null,
    exitCode: null,
    durationMs: null,
  } as unknown as ThreadItem;
}

export function mockMcpToolCallItem(
  id: string,
  server: string,
  tool: string,
  args?: unknown,
  status?: string,
  error?: { message: string } | null,
): ThreadItem {
  return {
    type: "mcpToolCall", id, server, tool,
    arguments: args ?? {},
    status: status ?? "completed",
    result: null,
    error: error ?? null,
    durationMs: null,
  } as unknown as ThreadItem;
}

export function mockDynamicToolCallItem(id: string, namespace: string, tool: string, args?: unknown): ThreadItem {
  return {
    type: "dynamicToolCall", id, namespace, tool,
    arguments: args ?? {},
    status: "completed",
    contentItems: null,
    success: null,
    durationMs: null,
  } as unknown as ThreadItem;
}

export function mockWebSearchItem(id: string, query: string): ThreadItem {
  return {
    type: "webSearch", id, query,
    action: null,
  } as ThreadItem;
}

export function mockImageGenerationItem(id: string, revisedPrompt: string): ThreadItem {
  return {
    type: "imageGeneration", id,
    status: "completed",
    revisedPrompt,
    result: "",
  } as unknown as ThreadItem;
}

export function mockImageViewItem(id: string, path: string): ThreadItem {
  return { type: "imageView", id, path } as unknown as ThreadItem;
}

export function mockEnteredReviewModeItem(id: string, review: string): ThreadItem {
  return { type: "enteredReviewMode", id, review } as ThreadItem;
}

export function mockContextCompactionItem(id: string): ThreadItem {
  return { type: "contextCompaction", id } as ThreadItem;
}

export function mockHookPromptItem(id: string): ThreadItem {
  return { type: "hookPrompt", id, fragments: [] } as ThreadItem;
}

export function mockCollabAgentToolCallItem(id: string, tool: string): ThreadItem {
  return {
    type: "collabAgentToolCall", id, tool,
    status: "completed",
    senderThreadId: "t-sender",
    receiverThreadIds: [],
    prompt: null,
    model: null,
    reasoningEffort: null,
    agentsStates: {},
  } as unknown as ThreadItem;
}
