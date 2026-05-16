import { mkdir, mkdtemp, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { now, uuidV7 } from "./id";
import { appendJsonlLine, parseJsonl, writeJsonl } from "./jsonl";
import { threadDir, threadPath } from "./paths";
import { summarizeThreadJsonl } from "./summary";
import {
  childrenOf as threadChildrenOf,
  collectResponseItems,
  getPathEntries as threadGetPathEntries,
  isUserInputLine,
  linearizeForCodex as threadLinearizeForCodex,
} from "./tree";
import type { ResponseItem as CodexResponseItem } from "@pico/codex-app-server-protocol";
import type {
  EventLine,
  BranchOut,
  PicoConfigSnapshot,
  PicoLine,
  PicoThreadInfo,
  RolloutLine,
  SessionMeta,
  TurnOverrides,
  UserInputResponseItem,
} from "./types";
import {
  CURRENT_THREAD_VERSION,
  validatePicoLine,
} from "./validate";

// ── Re-exported types ──────────────────────────────────────
export type {
  BranchOut,
  EventLine,
  PicoConfigSnapshot,
  PicoLine,
  PicoThreadInfo,
  RolloutLine,
  TurnOverrides,
  TurnStatus,
  UserInputResponseItem,
} from "./types";
/** Loose type for consumers that access arbitrary properties on items. */
export type ResponseItem = Record<string, unknown>;

// ── Helpers ────────────────────────────────────────────────

function isMissingDirectory(err: unknown): boolean {
  return err instanceof Error && "code" in err && (err as { code?: string }).code === "ENOENT";
}

function parentOf(line: PicoLine): string | null {
  return "parent" in line ? (line.parent ?? null) : null;
}

// ── Thread store ───────────────────────────────────────────

export class PicoThreadStore {
  lines: PicoLine[] = [];
  lineIds = new Set<string>();
  sessionMeta!: SessionMeta;
  private _leafId = "";
  private filePath = "";

  // ── private constructor ──

  private constructor() {}

  // ── public constructor helpers ──

  static async create(
    cwd: string = process.cwd(),
    config: PicoConfigSnapshot = {},
  ): Promise<PicoThreadStore> {
    const id = uuidV7();
    const timestamp = now();
    const meta: SessionMeta = {
      id,
      cwd,
      createdAt: timestamp,
      config: { ...config, version: CURRENT_THREAD_VERSION },
    };
    const firstLine: RolloutLine = {
      id,
      timestamp,
      type: "session_meta",
      payload: meta,
    };

    const dir = threadDir(cwd);
    await mkdir(dir, { recursive: true });
    const path = threadPath(cwd, id);
    await writeJsonl(path, [firstLine]);

    const store = new PicoThreadStore();
    store.filePath = path;
    store.sessionMeta = meta;
    store._leafId = id;
    store.lines.push(firstLine);
    store.lineIds.add(id);
    return store;
  }

  static async load(cwd: string, threadId: string): Promise<PicoThreadStore> {
    const path = threadPath(cwd, threadId);
    const file = Bun.file(path);
    if (!(await file.exists())) {
      throw new Error(`Thread not found: ${path}`);
    }

    const rawLines = parseJsonl(await file.text());
    if (rawLines.length === 0) {
      throw new Error(`Empty thread file: ${path}`);
    }

    const lines: PicoLine[] = [];
    for (const [idx, raw] of rawLines.entries()) {
      const line = validatePicoLine(raw);
      lines.push(line);
      if (idx === 0 && line.type !== "session_meta") {
        throw new Error(`First line must be session_meta in ${path}`);
      }
    }

    const sessionMeta = lines[0] as RolloutLine;
    if (sessionMeta.type !== "session_meta" || !sessionMeta.payload) {
      throw new Error(`Missing session_meta payload in ${path}`);
    }

    // Build child-count map to find leaf (line with no children)
    const childCount = new Map<string, number>();
    for (const line of lines) {
      const parent = parentOf(line);
      if (parent) {
        childCount.set(parent, (childCount.get(parent) || 0) + 1);
      }
    }

    const store = new PicoThreadStore();
    store.filePath = path;
    store.sessionMeta = sessionMeta.payload as SessionMeta;
    store.lines = lines;
    store.lineIds = new Set(lines.map((l) => l.id));

    // Leaf = last line in insertion order that has no children
    let leaf = lines[0];
    for (const line of lines) {
      if (!childCount.has(line.id)) {
        leaf = line;
      }
    }
    store._leafId = leaf.id;

    // Validate that every parent reference points to an existing line
    for (const line of lines) {
      const parent = parentOf(line);
      if (parent && !store.lineIds.has(parent)) {
        throw new Error(
          `Broken parent chain: line ${line.id} references missing parent ${parent} in ${path}`,
        );
      }
    }

    return store;
  }

  static async list(cwd: string = process.cwd()): Promise<PicoThreadInfo[]> {
    const dir = threadDir(cwd);
    let filenames: string[];
    try {
      filenames = await readdir(dir);
    } catch (err) {
      if (isMissingDirectory(err)) return [];
      throw err;
    }

    const threads: PicoThreadInfo[] = [];
    for (const filename of filenames.filter((name) => name.endsWith(".jsonl"))) {
      const content = await Bun.file(`${dir}/${filename}`).text();
      const info = summarizeThreadJsonl(parseJsonl(content));
      if (info) threads.push(info);
    }

    return threads.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  // ── Getters ──

  get id(): string {
    return this.sessionMeta.id;
  }

  get cwd(): string {
    return this.sessionMeta.cwd;
  }

  get config(): PicoConfigSnapshot {
    return this.sessionMeta.config;
  }

  get leafId(): string {
    return this._leafId;
  }

  get path(): string {
    return this.filePath;
  }

  // ── Navigation ──

  backtrack(lineId: string): void {
    if (!this.lineIds.has(lineId)) throw new Error(`Line not found: ${lineId}`);
    this._leafId = lineId;
  }

  // ── Append operations ──

  async appendResponseItem(
    parentId: string,
    responseItem: ResponseItem | string,
    maybeResponseItem?: ResponseItem,
  ): Promise<RolloutLine> {
    const payload = maybeResponseItem || responseItem;
    if (typeof payload === "string") {
      throw new Error("Invalid response_item payload");
    }
    const line: RolloutLine = {
      id: uuidV7(),
      parent: parentId,
      timestamp: now(),
      type: "response_item",
      payload: payload as unknown as CodexResponseItem,
    };
    this.addLine(line);
    await appendJsonlLine(this.filePath, line);
    return line;
  }

  async appendUserInput(
    parentId: string,
    text: string,
    overrides: TurnOverrides = {},
  ): Promise<RolloutLine> {
    const id = uuidV7();
    const timestamp = now();
    const payload = userInputResponseItem(id, text, timestamp, {
      ...overrides,
      cwd: overrides.cwd || this.cwd,
    });
    const line: RolloutLine = {
      id,
      parent: parentId,
      timestamp,
      type: "response_item",
      payload: payload as unknown as CodexResponseItem,
    };
    this.addLine(line);
    await appendJsonlLine(this.filePath, line);
    return line;
  }

  /** @deprecated Use appendUserInput */
  async appendTurn(
    parentId: string,
    userInput: string,
    overrides: TurnOverrides = {},
  ): Promise<RolloutLine> {
    return this.appendUserInput(parentId, userInput, overrides);
  }

  async appendResponseItemForTurn(
    parentId: string,
    _turnId: string,
    responseItem: ResponseItem,
  ): Promise<RolloutLine> {
    return this.appendResponseItem(parentId, responseItem);
  }

  async appendEventMsg(parentId: string, payload: unknown): Promise<EventLine> {
    const line: EventLine = {
      id: uuidV7(),
      parent: parentId,
      timestamp: now(),
      type: "event_msg",
      payload,
    };
    this.addLine(line);
    await appendJsonlLine(this.filePath, line);
    return line;
  }

  async appendTurnCompleted(
    parentId: string,
    turnId: string,
    result?: unknown,
  ): Promise<EventLine> {
    return this.appendEventMsg(parentId, {
      type: "turn_completed",
      turnId,
      result,
      completedAt: now(),
    });
  }

  async appendTurnFailed(
    parentId: string,
    turnId: string,
    error: Error | string,
  ): Promise<EventLine> {
    return this.appendEventMsg(parentId, {
      type: "turn_failed",
      turnId,
      error: error instanceof Error ? error.message : error,
      failedAt: now(),
    });
  }

  async appendTurnAborted(
    parentId: string,
    turnId: string,
    reason?: string,
  ): Promise<EventLine> {
    return this.appendEventMsg(parentId, {
      type: "turn_aborted",
      turnId,
      reason,
      abortedAt: now(),
    });
  }

  // ── Branching ──

  private async appendBranchOut(parentId: string): Promise<BranchOut> {
    const line: BranchOut = {
      id: uuidV7(),
      type: "branch_out",
      parent: parentId,
    };
    this.addLine(line);
    await appendJsonlLine(this.filePath, line);
    return line;
  }

  async ensureBranchForAppend(): Promise<string> {
    const leafId = this._leafId;

    // Root (session_meta): branch if it has children
    if (leafId === this.sessionMeta.id) {
      if (this.childrenOf(leafId).length === 0) return leafId;
      const branch = await this.appendBranchOut(leafId);
      return branch.id;
    }

    const leaf = this.lineById(leafId);
    if (!leaf) return leafId;

    // If current leaf is a branch_out with no children, use it
    if (leaf.type === "branch_out" && this.childrenOf(leafId).length === 0) return leafId;

    // If current leaf has no children, use it
    if (this.childrenOf(leafId).length === 0) return leafId;

    // Otherwise branch from current leaf
    const branch = await this.appendBranchOut(leafId);
    return branch.id;
  }

  async appendBranch(targetId: string): Promise<BranchOut> {
    this.backtrack(targetId);
    return this.appendBranchOut(targetId);
  }

  // ── Path operations ──

  getPathEntries(leafId: string = this._leafId): PicoLine[] {
    return threadGetPathEntries(this.sessionMeta.id, this.lines, leafId);
  }

  linearizeForCodex(leafId: string = this._leafId): unknown[] {
    return threadLinearizeForCodex(this.sessionMeta.id, this.lines, leafId);
  }

  async writeLinearizedRolloutFile(leafId: string = this._leafId): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "pico-rollout-"));
    const path = join(dir, "thread.jsonl");
    await writeJsonl(path, this.linearizeForCodex(leafId));
    return path;
  }

  // ── Query ──

  childrenOf(parentId: string): PicoLine[] {
    return threadChildrenOf(this.lines, parentId);
  }

  collectInjectItems(leafId: string = this._leafId): ResponseItem[] {
    return collectResponseItems(this.sessionMeta.id, this.lines, leafId).filter(
      (item) => item.type !== "message" || item.role !== "user",
    );
  }

  labels(): Map<string, string> {
    return new Map();
  }

  async appendLabel(_targetId: string, _label: string): Promise<never> {
    throw new Error("Labels are out of scope for rollout storage");
  }

  // ── Private ──

  private addLine(line: PicoLine): void {
    if (this.lineIds.has(line.id)) {
      throw new Error(`Duplicate line id: ${line.id}`);
    }
    this.lineIds.add(line.id);
    this.lines.push(line);
    this._leafId = line.id;
  }

  private lineById(id: string): PicoLine | undefined {
    return this.lines.find((line) => line.id === id);
  }
}

// ── Shared helper functions ────────────────────────────────

export function userInputResponseItem(
  id: string,
  text: string,
  timestamp: string = now(),
  overrides: TurnOverrides = {},
): UserInputResponseItem {
  return {
    id,
    type: "message",
    role: "user",
    content: [{ type: "input_text", text }],
    pico: {
      kind: "user_input",
      status: "started",
      overrides,
      cwd: overrides.cwd,
    },
    created_at: timestamp,
  };
}

export function userTextFromResponseItem(item: ResponseItem): string | undefined {
  if (item.type !== "message") return undefined;
  if (item.role !== "user") return undefined;
  const content = item.content;
  if (!Array.isArray(content)) return undefined;
  const parts = content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const value = part as Record<string, unknown>;
      return typeof value.text === "string" ? value.text : "";
    })
    .filter(Boolean);
  return parts.join("\n") || undefined;
}

/**
 * Extract user text from a PicoLine.
 * Returns undefined if the line is not a user input.
 */
export function entryUserText(line: PicoLine): string | undefined {
  if (line.type !== "response_item") return undefined;
  const payload = line.payload;
  if (!payload || typeof payload !== "object") return undefined;
  const obj = payload as Record<string, unknown>;
  const isUser =
    obj.role === "user" ||
    (obj.pico as Record<string, unknown> | undefined)?.kind === "user_input";
  if (!isUser) return undefined;
  return userTextFromResponseItem(payload as ResponseItem);
}
