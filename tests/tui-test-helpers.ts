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
    type: "userMessage",
    id,
    content: [{ type: "text", text }],
  } as unknown as ThreadItem;
}

export function mockAgentMessageItem(id: string, text: string): ThreadItem {
  return {
    type: "agentMessage",
    id,
    text,
    phase: null,
    memoryCitation: null,
  } as ThreadItem;
}

export function mockFileUpdateChange(path: string, diff: string, kind: PatchChangeKind = { type: "update", move_path: null }): FileUpdateChange {
  return { path, kind, diff };
}

export function mockFileChangeItem(id: string, changes: FileUpdateChange[]): ThreadItem {
  return {
    type: "fileChange",
    id,
    changes,
  } as unknown as ThreadItem;
}
