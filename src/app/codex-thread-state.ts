import type { CodexAppServerClient } from "../codex/app-server";
import type { ThreadItem } from "@pico/codex-app-server-protocol/v2";

// ── Entry types (in-memory, no disk I/O) ──

export interface ThreadEntry {
  id: string;
  parent?: string;
  timestamp: string;
  type: "session_meta" | "response_item" | "event_msg" | "branch_out";
  payload?: unknown;
}

// ── Thread info (for listing) ──

export interface ThreadInfo {
  id: string;
  leafId: string;
  cwd: string;
  createdAt: string;
  updatedAt: string;
  preview: string;
  label?: string;
  turnCount: number;
  responseItemCount: number;
}

// ── Turn overrides ──

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

export type ResponseItem = Record<string, unknown>;

// ── Helpers ──

let _counter = 0;
function entryId(): string {
  _counter++;
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${timestamp}-${random}-${_counter.toString(36)}`;
}

function now(): string {
  return new Date().toISOString();
}

// ── Thread state ──

export class CodexThreadState {
  lines: ThreadEntry[] = [];
  private lineIds = new Set<string>();
  private _leafId = "";
  cwd = "";
  codexThreadId: string | undefined;

  private constructor() {}

  get id(): string {
    return this.lines[0]?.id ?? "";
  }

  get leafId(): string {
    return this._leafId || this.id;
  }

  // ── Static factories ──

  static async create(
    cwd: string = process.cwd(),
    _codex?: CodexAppServerClient,
  ): Promise<CodexThreadState> {
    const id = entryId();
    const timestamp = now();
    const state = new CodexThreadState();
    state.cwd = cwd;
    state._leafId = id;
    state.addEntry({
      id,
      timestamp,
      type: "session_meta",
      payload: { id, cwd, createdAt: timestamp },
    });
    return state;
  }

  static async load(
    cwd: string,
    threadId: string,
    codex?: CodexAppServerClient,
  ): Promise<CodexThreadState> {
    const state = new CodexThreadState();
    state.cwd = cwd;

    if (codex) {
      try {
        const response = await codex.readThread(threadId, true);
        const thread = response.thread;
        state.cwd = (thread.cwd as string) || cwd;
        state._leafId = threadId;

        // Populate from Codex thread data
        const sessionEntry: ThreadEntry = {
          id: threadId,
          timestamp: new Date((thread.createdAt as number) || Date.now()).toISOString(),
          type: "session_meta",
          payload: { id: threadId, cwd: state.cwd },
        };
        state.addEntry(sessionEntry);

        // Add turns and their items
        const turns = (thread.turns as Array<Record<string, unknown>>) ?? [];
        for (const turn of turns) {
          const turnId = turn.id as string;
          const items = (turn.items as Array<Record<string, unknown>>) ?? [];
          for (const item of items) {
            const itemId = (item.id as string) || entryId();
            const entry: ThreadEntry = {
              id: itemId,
              parent: state._leafId,
              timestamp: new Date().toISOString(),
              type: "response_item",
              payload: item,
            };
            state.addEntry(entry);
          }
        }
      } catch {
        // Fallback: create empty state
        const id = entryId();
        state._leafId = id;
        state.addEntry({
          id,
          timestamp: now(),
          type: "session_meta",
          payload: { id, cwd: state.cwd },
        });
      }
    } else {
      const id = threadId || entryId();
      state._leafId = id;
      state.addEntry({
        id,
        timestamp: now(),
        type: "session_meta",
        payload: { id, cwd: state.cwd },
      });
    }

    return state;
  }

  static async list(
    cwd: string,
    codex?: CodexAppServerClient,
  ): Promise<ThreadInfo[]> {
    if (!codex) return [];

    try {
      const response = await codex.listThreads({ cwd });
      return response.data.map((thread) => ({
        id: thread.id,
        leafId: thread.id,
        cwd: (thread.cwd as string) || cwd,
        createdAt: new Date((thread.createdAt as number) || 0).toISOString(),
        updatedAt: new Date((thread.updatedAt as number) || 0).toISOString(),
        preview: (thread.preview as string) || "",
        turnCount: Array.isArray(thread.turns) ? thread.turns.length : 0,
        responseItemCount: 0,
      }));
    } catch {
      return [];
    }
  }

  // ── Query ──

  getPathEntries(leafId: string = this.leafId): ThreadEntry[] {
    const byId = new Map<string, ThreadEntry>();
    for (const entry of this.lines) {
      byId.set(entry.id, entry);
    }
    const path: ThreadEntry[] = [];
    let cursor: string | undefined = leafId;
    while (cursor) {
      const entry = byId.get(cursor);
      if (!entry) break;
      path.unshift(entry);
      cursor = entry.parent;
    }
    return path;
  }

  childrenOf(parentId: string): ThreadEntry[] {
    return this.lines.filter((e) => e.parent === parentId);
  }

  backtrack(entryId: string): void {
    this._leafId = entryId;
  }

  // ── Mutation ──

  private addEntry(entry: ThreadEntry): void {
    if (this.lineIds.has(entry.id)) return;
    this.lineIds.add(entry.id);
    this.lines.push(entry);
    this._leafId = entry.id;
  }

  appendEntry(entry: ThreadEntry): void {
    this.addEntry(entry);
  }

  appendUserInput(
    parentId: string,
    text: string,
    overrides: TurnOverrides = {},
    turnId?: string,
  ): ThreadEntry {
    const id = turnId || entryId();
    const picoMeta: Record<string, unknown> = {};
    if (Object.keys(overrides).length > 0) {
      picoMeta.overrides = overrides;
    }
    const entry: ThreadEntry = {
      id,
      parent: parentId,
      timestamp: now(),
      type: "response_item",
      payload: {
        id,
        type: "message",
        role: "user",
        content: [{ type: "input_text", text }],
        ...(Object.keys(picoMeta).length > 0 ? { pico: picoMeta } : {}),
      },
    };
    this.addEntry(entry);
    return entry;
  }

  appendResponseItem(
    parentId: string,
    item: ResponseItem | ThreadItem,
    itemId?: string,
  ): ThreadEntry {
    const id = itemId || (item as Record<string, unknown>).id as string || entryId();
    const entry: ThreadEntry = {
      id,
      parent: parentId,
      timestamp: now(),
      type: "response_item",
      payload: item,
    };
    this.addEntry(entry);
    return entry;
  }

  appendEventMsg(
    parentId: string,
    payload: unknown,
  ): ThreadEntry {
    const id = entryId();
    const entry: ThreadEntry = {
      id,
      parent: parentId,
      timestamp: now(),
      type: "event_msg",
      payload,
    };
    this.addEntry(entry);
    return entry;
  }

  appendBranch(targetId: string): ThreadEntry {
    this.backtrack(targetId);
    const id = entryId();
    const entry: ThreadEntry = {
      id,
      parent: targetId,
      timestamp: now(),
      type: "branch_out",
    };
    this.addEntry(entry);
    return entry;
  }

  ensureBranchForAppend(): string {
    const leafId = this.leafId;
    if (leafId === this.id) {
      if (this.childrenOf(leafId).length === 0) return leafId;
      const branch = this.appendBranch(leafId);
      return branch.id;
    }
    const leaf = this.lines.find((e) => e.id === leafId);
    if (!leaf) return leafId;
    if (leaf.type === "branch_out" && this.childrenOf(leafId).length === 0) return leafId;
    if (this.childrenOf(leafId).length === 0) return leafId;
    const branch = this.appendBranch(leafId);
    return branch.id;
  }
}

// ── Re-export helpers from old module for minimal TUI churn ──

export function entryUserText(entry: ThreadEntry): string {
  if (entry.type !== "response_item" || !entry.payload) return "";
  const item = entry.payload as Record<string, unknown>;
  if (item.role !== "user") return "";
  const content = item.content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      const p = part as Record<string, unknown> | null;
      return typeof p?.text === "string" ? p.text : "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}
